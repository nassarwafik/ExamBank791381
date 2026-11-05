import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P10-A — managed teacher sessions recorded on the server (approved design docs/enterprise-teacher-sessions-p10a.md; owner
// decisions §19.37: inside the account, every managed teacher signs in once at deployment, 10 devices with the oldest ended).
// Every issued v3 session is recorded (sha256 of its id) in the teacher's account document — which every request already reads —
// and only a recorded, unexpired session is accepted. Closes the security review's O1 (a v3 token signed with the right secret but
// never issued — e.g. forged with the BANK_SETUP_KEY fallback — was accepted) and O6 (a logged-out session revived after 50 more
// logouts). TEST data only.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p10a-teacher-sessions-root-secret";
for (const k of ["BUILDER_SESSION_SECRET", "OWNER_SESSION_SECRET", "BUILDER_USERS", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];

const { handler: ownerTeachers } = await import("../src/functions/owner-teachers.js");
const { handler: invitation } = await import("../src/functions/teacher-invitation.js");
const { handler: login } = await import("../src/functions/platform-login.js");
const { handler: sessionEnd } = await import("../src/functions/teacher-session-end.js");
const { requireTeacherSession } = await import("../src/lib/teacher-session.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { createManagedTeacherToken, newTeacherSessionId, verifyManagedTeacherToken } = await import("../src/lib/identity/teacher-token.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const FAST = { N: 16384, r: 8, p: 1, keyLen: 64 };
const OWNER_ID = "own_0011223344556677";
const PASSWORD = "a long teacher passphrase";

function req({ method = "POST", action = "", body = {}, headers = {} } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, params: { action }, headers: { get: k => h[String(k).toLowerCase()] ?? null }, json: async () => body };
}
function setup() {
  const mem = createMemoryContainer();
  const clock = { now: Date.now() };
  const deps = { getContainer: () => mem.container, now: () => clock.now, hashParams: FAST, reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {}, clientIdFromRequest: () => "10.0.0.1" };
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: clock.now });
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const sid = "c".repeat(32);
  mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: clock.now, expiresAtMs: clock.now + 7200e3, stepUpAtMs: clock.now });
  return { mem, clock, deps, owner: { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: clock.now }).token } };
}
const tokenOf = p => p.replace(/^#\/invite\//, "");
async function activate(ctx, username = "t.sara") {
  const c = await ownerTeachers(req({ action: "create", headers: ctx.owner, body: { username, displayName: "سارة" } }), ctx.deps);
  expect(c.status).toBe(201);
  expect((await invitation(req({ action: "accept", body: { token: tokenOf(c.jsonBody.invitation.invitationPath), password: PASSWORD } }), ctx.deps)).status).toBe(200);
  return c.jsonBody.teacher.accountId;
}
const signIn = (ctx, username = "t.sara") => login(req({ body: { userCode: username, password: PASSWORD } }), ctx.deps);
const H = token => ({ authorization: "Bearer " + token, "x-builder-token": token });
const accepted = async (ctx, token) => (await requireTeacherSession(req({ headers: H(token) }), ctx.deps)).ok;
const logout = (ctx, token) => sessionEnd(req({ action: "logout", headers: H(token) }), ctx.deps);
const account = (ctx, id) => ctx.mem.getJson(teacherAccountName(id));

describe("P10-A fail-first — the security review's O1 and O6", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); resetOperatorGateCache(); });

  it("fail-first O1: a v3 token signed with the right secret but NEVER issued (a forged t_legacy session) is refused", async () => {
    ctx.mem.setJson(teacherAccountName("t_legacy"), { schemaVersion: 1, accountId: "t_legacy", role: "teacher", username: "w.old", displayName: "المساحة القديمة", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], origin: "shared-password-workspace" });
    // what anyone holding the signing root can do (with the BANK_SETUP_KEY fallback: anyone who knew the old shared password)
    const forged = createManagedTeacherToken({ accountId: "t_legacy", sid: newTeacherSessionId(), authVersion: 1 }, { nowMs: ctx.clock.now }).token;
    expect(verifyManagedTeacherToken(forged, { nowMs: ctx.clock.now })).not.toBeNull();     // the signature itself is valid
    const r = await requireTeacherSession(req({ headers: H(forged) }), ctx.deps);
    expect(r.ok).toBe(false);
    expect(r.response.status).toBe(401);
  });

  it("fail-first O6: a logged-out session never comes back, even after 50 more logouts", async () => {
    await activate(ctx);
    const first = (await signIn(ctx)).jsonBody.token;
    expect((await logout(ctx, first)).jsonBody.revoked).toBe(true);
    expect(await accepted(ctx, first)).toBe(false);
    for (let i = 0; i < 50; i++) { const t = (await signIn(ctx)).jsonBody.token; await logout(ctx, t); }
    expect(await accepted(ctx, first)).toBe(false);
  }, 60000);
});

describe("P10-A the session record", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); resetOperatorGateCache(); });

  it("sign-in records the session (sha256 of its id only, its expiry, «login») before the token is given; the token is accepted", async () => {
    const id = await activate(ctx);
    const r = await signIn(ctx);
    expect(r.status).toBe(200);
    const claim = verifyManagedTeacherToken(r.jsonBody.token, { nowMs: ctx.clock.now });
    const list = account(ctx, id).sessions;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ expiresAtMs: claim.exp * 1000, via: "login" });
    expect(list[0].sidHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(account(ctx, id))).not.toContain(claim.sid);                // the id itself is never stored
    expect(await accepted(ctx, r.jsonBody.token)).toBe(true);
  });

  it("logout removes exactly this session; the others stay", async () => {
    const id = await activate(ctx);
    const a = (await signIn(ctx)).jsonBody.token, b = (await signIn(ctx)).jsonBody.token;
    await logout(ctx, a);
    expect([await accepted(ctx, a), await accepted(ctx, b)]).toEqual([false, true]);
    expect(account(ctx, id).sessions).toHaveLength(1);
  });

  it("owner decision: 10 devices — the eleventh sign-in ends the OLDEST session; the ten newest work; signing in is never refused", async () => {
    const id = await activate(ctx);
    const tokens = [];
    for (let i = 0; i < 11; i++) { ctx.clock.now += 1000; const r = await signIn(ctx); expect(r.status).toBe(200); tokens.push(r.jsonBody.token); }
    expect(account(ctx, id).sessions).toHaveLength(10);
    expect(await accepted(ctx, tokens[0])).toBe(false);
    for (const t of tokens.slice(1)) expect(await accepted(ctx, t)).toBe(true);
  }, 60000);

  it("an expired session is refused, and dropped from the record at the next write", async () => {
    const id = await activate(ctx);
    const old = (await signIn(ctx)).jsonBody.token;
    ctx.clock.now += 9 * 3600 * 1000;                                                    // past the 8-hour lifetime
    expect(await accepted(ctx, old)).toBe(false);
    const fresh = (await signIn(ctx)).jsonBody.token;
    expect(account(ctx, id).sessions).toHaveLength(1);
    expect(await accepted(ctx, fresh)).toBe(true);
  });

  it("the record cannot be written at sign-in → 503 and NO token (fail closed, never an unrecorded session)", async () => {
    await activate(ctx);
    const failing = { ...ctx.deps, mutateTeacherAccount: async () => { throw new Error("storage unavailable"); } };
    const r = await login(req({ body: { userCode: "t.sara", password: PASSWORD } }), failing);
    expect(r.status).toBe(503);
    expect(r.jsonBody.token).toBeUndefined();
  });

  it("two sign-ins at the same moment are both recorded (the compare-and-set retries on the newest document)", async () => {
    const id = await activate(ctx);
    const [a, b] = await Promise.all([signIn(ctx), signIn(ctx)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(account(ctx, id).sessions).toHaveLength(2);
    expect([await accepted(ctx, a.jsonBody.token), await accepted(ctx, b.jsonBody.token)]).toEqual([true, true]);
  });

  for (const action of ["end-sessions", "suspend", "reset"]) {
    it(`owner «${action}» empties the record: every session ends from the next request`, async () => {
      const id = await activate(ctx);
      const t = (await signIn(ctx)).jsonBody.token;
      const r = await ownerTeachers(req({ action, headers: ctx.owner, body: { accountId: id } }), ctx.deps);
      expect(r.status).toBe(200);
      expect(account(ctx, id).sessions).toEqual([]);
      expect(await accepted(ctx, t)).toBe(false);
    });
  }

  it("the clock: an injected ISO time is read as that time; a clock that cannot be read refuses the session (fail closed)", async () => {
    await activate(ctx);
    const t = (await signIn(ctx)).jsonBody.token;
    const at = now => requireTeacherSession(req({ headers: H(t) }), { ...ctx.deps, now });
    expect((await at(() => new Date(ctx.clock.now).toISOString())).ok).toBe(true);           // the assignments convention
    for (const bad of [() => "not a time", () => undefined, () => NaN]) {
      const r = await at(bad);
      expect([r.ok, r.response && r.response.status]).toEqual([false, 401]);
    }
  });

  it("the old revocation list is no longer kept: a write drops it, nothing reads it", async () => {
    const id = await activate(ctx);
    const t = (await signIn(ctx)).jsonBody.token;
    await logout(ctx, t);
    expect(account(ctx, id).revokedSessions).toBeUndefined();
  });
});
