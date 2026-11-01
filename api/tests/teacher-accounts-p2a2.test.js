import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P2-A2a — managed teacher accounts (owner decisions §19.3: immediate suspension, invitation links, D13). TEST data only.
//   owner API (step-up, validation, uniqueness, never a credential or hash in a response) → invitation link (hash-only, single use,
//   superseded, expiring) → the teacher sets a password → managed sign-in (token v3) → every request re-checks the account:
//   suspend / reset / end-sessions / logout take effect on the NEXT request; storage down → 503; tenancy isolates two managed
//   teachers; synchronous checks never accept a managed token; the operator tools refuse it; the AI limiter keys it.

process.env.BANK_SETUP_KEY = "p2a2-test-root-secret";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.OWNER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_SESSION_VERSION;

const { handler: ownerTeachers } = await import("../src/functions/owner-teachers.js");
const { handler: invitation } = await import("../src/functions/teacher-invitation.js");
const { handler: login } = await import("../src/functions/platform-login.js");
const { handler: platformSession } = await import("../src/functions/platform-session.js");
const { handler: sessionEnd } = await import("../src/functions/teacher-session-end.js");
const { handler: classrooms } = await import("../src/functions/manage-classrooms.js");
const { requireTeacherSession } = await import("../src/lib/teacher-session.js");
const { verifyBuilderToken, requireBuilderAuth, createBuilderToken } = await import("../src/lib/builder-auth.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName, usernameReservationName } = await import("../src/lib/identity/owner-store.js");
const { teacherAccountName, INVITATION_PREFIX } = await import("../src/lib/identity/teacher-accounts.js");
const { verifyManagedTeacherToken } = await import("../src/lib/identity/teacher-token.js");
const { requireOperator, resetOperatorGateCache } = await import("../src/lib/identity/operator-gate.js");
const { withAiRateLimit } = await import("../src/lib/ai-rate-limit.js");
const { OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");

const FAST = { N: 16384, r: 8, p: 1, keyLen: 64 };
const OWNER_ID = "own_0011223344556677";
const PASSWORD = "a long teacher passphrase";

function req({ method = "POST", action = "", body = {}, headers = {} } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, params: { action }, headers: { get: k => h[String(k).toLowerCase()] ?? null }, json: async () => body };
}

function setup() {
  const mem = createMemoryContainer();
  // Real time: some layers (the AI limiter) read the clock themselves, so a fixed date would let 8-hour tokens expire mid-suite.
  const clock = { now: Date.now() };
  const deps = { getContainer: () => mem.container, now: () => clock.now, hashParams: FAST, reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {}, clientIdFromRequest: () => "10.0.0.1" };
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: clock.now });
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const ownerSession = stepUpAgoMs => {
    const sid = (stepUpAgoMs > 60_000 ? "d" : "c").repeat(32);
    mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: clock.now, expiresAtMs: clock.now + 7200e3, stepUpAtMs: clock.now - stepUpAgoMs });
    return { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: clock.now }).token };
  };
  return { mem, clock, deps, owner: ownerSession(0), ownerStale: ownerSession(11 * 60 * 1000), ownerSession };
}

const tokenOf = invitationPath => invitationPath.replace(/^#\/invite\//, "");
async function createTeacher(ctx, username = "t.sara", extra = {}) {
  const r = await ownerTeachers(req({ action: "create", headers: ctx.owner, body: { username, displayName: "سارة", ...extra } }), ctx.deps);
  expect(r.status).toBe(201);
  return r.jsonBody;
}
async function activate(ctx, username = "t.sara") {
  const created = await createTeacher(ctx, username);
  const a = await invitation(req({ action: "accept", body: { token: tokenOf(created.invitation.invitationPath), password: PASSWORD } }), ctx.deps);
  expect(a.status).toBe(200);
  return created.teacher.accountId;
}
async function signIn(ctx, username = "t.sara", password = PASSWORD) {
  return login(req({ body: { userCode: username, password } }), ctx.deps);
}
const teacherHeaders = token => ({ authorization: "Bearer " + token, "x-builder-token": token });

describe("P2-A2a owner API", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("requires an owner session; a teacher token or no token is refused", async () => {
    expect((await ownerTeachers(req({ method: "GET" }), ctx.deps)).status).toBe(401);
    expect((await ownerTeachers(req({ method: "GET", headers: teacherHeaders(createBuilderToken("t1")) }), ctx.deps)).status).toBe(401);
  });

  it("every change needs a recent step-up (403 STEP_UP_REQUIRED)", async () => {
    const r = await ownerTeachers(req({ action: "create", headers: ctx.ownerStale, body: { username: "t.sara", displayName: "سارة" } }), ctx.deps);
    expect(r.status).toBe(403);
    expect(r.jsonBody.code).toBe("STEP_UP_REQUIRED");
    expect(ctx.mem.names("platform/accounts/teachers/")).toEqual([]);
  });

  it("create → status invited, D13 organizationId, a one-time link; only the link's hash is stored; the owner view hides secrets", async () => {
    const out = await createTeacher(ctx, "T.Sara ", { email: "sara@example.org", subjects: ["شبكات"], notes: "ملاحظة" });
    expect(out.teacher).toMatchObject({ username: "t.sara", displayName: "سارة", status: "invited", hasPassword: false, organizationId: "default", subjects: ["شبكات"], notes: "ملاحظة" });
    expect(out.teacher.accountId).toMatch(/^t_[a-f0-9]{16}$/);
    const token = tokenOf(out.invitation.invitationPath);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = JSON.stringify(ctx.mem.getJson(teacherAccountName(out.teacher.accountId)));
    expect(stored).not.toContain(token);
    const list = await ownerTeachers(req({ method: "GET", headers: ctx.owner }), ctx.deps);
    expect(list.jsonBody.teachers).toHaveLength(1);
    expect(JSON.stringify(list.jsonBody)).not.toMatch(/tokenHash|credential|"hash"|salt/);
    expect(ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n).action)).toContain("owner.teacher.created");
  });

  it("validates the username and display name; usernames are unique across owner, teachers and BUILDER_USERS ids", async () => {
    for (const [body, code] of [[{ username: "12345678", displayName: "x" }, "USERNAME_INVALID"], [{ username: "t.ok", displayName: "" }, "DISPLAY_NAME_INVALID"], [{ username: "t.ok", displayName: "x", email: "nope" }, "EMAIL_INVALID"]]) {
      const r = await ownerTeachers(req({ action: "create", headers: ctx.owner, body }), ctx.deps);
      expect(r.status).toBe(400);
      expect(r.jsonBody.code).toBe(code);
    }
    ctx.mem.setJson(usernameReservationName("tadris.owner"), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner" });
    expect((await ownerTeachers(req({ action: "create", headers: ctx.owner, body: { username: "tadris.owner", displayName: "x" } }), ctx.deps)).status).toBe(409);
    await createTeacher(ctx, "t.sara");
    expect((await ownerTeachers(req({ action: "create", headers: ctx.owner, body: { username: "t.sara", displayName: "y" } }), ctx.deps)).status).toBe(409);
    const env = { ...process.env, BUILDER_USERS: JSON.stringify({ users: { "Teacher-A": { passwordEnv: "PW_A", displayName: "A" } } }), PW_A: "pw" };
    const r = await ownerTeachers(req({ action: "create", headers: ctx.owner, body: { username: "teacher-a", displayName: "A" } }), { ...ctx.deps, env });
    expect(r.status).toBe(409);
  });
});

describe("P2-A2a invitation links", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("inspect shows who is invited; accept enforces the teacher policy (≥ 12) and stores a hash; the link is single use", async () => {
    const out = await createTeacher(ctx);
    const token = tokenOf(out.invitation.invitationPath);
    const seen = await invitation(req({ action: "inspect", body: { token } }), ctx.deps);
    expect(seen.jsonBody).toMatchObject({ ok: true, displayName: "سارة", username: "t.sara", purpose: "invite" });
    const weak = await invitation(req({ action: "accept", body: { token, password: "short pass" } }), ctx.deps);
    expect(weak.status).toBe(400);
    expect(weak.jsonBody.code).toBe("PASSWORD_TOO_SHORT");
    const ok = await invitation(req({ action: "accept", body: { token, password: PASSWORD } }), ctx.deps);
    expect(ok.status).toBe(200);
    const account = ctx.mem.getJson(teacherAccountName(out.teacher.accountId));
    expect(account).toMatchObject({ status: "active", invitation: null });
    expect(JSON.stringify(account)).not.toContain(PASSWORD);
    expect((await invitation(req({ action: "accept", body: { token, password: PASSWORD + "!" } }), ctx.deps)).status).toBe(404);
    expect((await invitation(req({ action: "inspect", body: { token } }), ctx.deps)).status).toBe(404);
    expect(ctx.mem.names(INVITATION_PREFIX)).toEqual([]);
  });

  it("a newer link supersedes the older one; an expired or suspended link is unusable; bad tokens are one 404", async () => {
    const out = await createTeacher(ctx);
    const first = tokenOf(out.invitation.invitationPath);
    const again = await ownerTeachers(req({ action: "reinvite", headers: ctx.owner, body: { accountId: out.teacher.accountId } }), ctx.deps);
    const second = tokenOf(again.jsonBody.invitation.invitationPath);
    expect((await invitation(req({ action: "inspect", body: { token: first } }), ctx.deps)).status).toBe(404);
    expect((await invitation(req({ action: "inspect", body: { token: second } }), ctx.deps)).status).toBe(200);
    await ownerTeachers(req({ action: "suspend", headers: ctx.owner, body: { accountId: out.teacher.accountId } }), ctx.deps);
    expect((await invitation(req({ action: "inspect", body: { token: second } }), ctx.deps)).status).toBe(404);
    await ownerTeachers(req({ action: "reactivate", headers: ctx.owner, body: { accountId: out.teacher.accountId } }), ctx.deps);
    ctx.clock.now += 73 * 3600e3;
    expect((await invitation(req({ action: "inspect", body: { token: second } }), ctx.deps)).status).toBe(404);
    expect((await invitation(req({ action: "accept", body: { token: second, password: PASSWORD } }), ctx.deps)).status).toBe(404);
    for (const token of ["", "x", "a".repeat(43)]) expect((await invitation(req({ action: "inspect", body: { token } }), ctx.deps)).status).toBe(404);
  });

  it("two concurrent accepts of one link: exactly one sets the password", async () => {
    const out = await createTeacher(ctx);
    const token = tokenOf(out.invitation.invitationPath);
    const results = await Promise.all(["first passphrase ok", "second passphrase ok"].map(password => invitation(req({ action: "accept", body: { token, password } }), ctx.deps)));
    expect(results.map(r => r.status).sort()).toEqual([200, 404]);
  });
});

describe("P2-A2a managed sign-in and the per-request account check", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); resetOperatorGateCache(); });

  it("signs in with username + password; the session is a v3 token no synchronous check accepts", async () => {
    const id = await activate(ctx);
    const r = await signIn(ctx);
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ role: "teacher", userCode: "t.sara", displayName: "سارة" });
    const claim = verifyManagedTeacherToken(r.jsonBody.token, { nowMs: ctx.clock.now });
    expect(claim).toMatchObject({ ver: 3, sub: id, am: "managed", av: 1 });
    expect(verifyBuilderToken(r.jsonBody.token)).toBeNull();
    expect(requireBuilderAuth(req({ headers: teacherHeaders(r.jsonBody.token) })).ok).toBe(false);
    const s = await requireTeacherSession(req({ headers: teacherHeaders(r.jsonBody.token) }), ctx.deps);
    expect(s.ok).toBe(true);
    expect(s.user.sub).toBe(id);
  });

  it("a forged v3 token (another subject, original signature) is refused", async () => {
    await activate(ctx, "t.sara");
    const omarId = await activate(ctx, "t.omar");
    const { token } = (await signIn(ctx, "t.sara")).jsonBody;
    const [enc, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(enc, "base64url").toString()), sub: omarId })).toString("base64url") + "." + sig;
    expect(verifyManagedTeacherToken(forged, { nowMs: ctx.clock.now })).toBeNull();
    expect((await requireTeacherSession(req({ headers: teacherHeaders(forged) }), ctx.deps)).ok).toBe(false);
  });

  it("an invited (no password) teacher cannot sign in, and a wrong password is the generic 401", async () => {
    await createTeacher(ctx);
    expect((await signIn(ctx)).status).toBe(401);
    await activate(ctx, "t.omar");
    const wrong = await signIn(ctx, "t.omar", PASSWORD + "x");
    const unknown = await signIn(ctx, "t.nobody", PASSWORD);
    expect(wrong.status).toBe(401);
    expect(wrong.jsonBody).toEqual(unknown.jsonBody);
    expect((await signIn(ctx, "t.omar")).status).toBe(200);
  });

  it("suspend → the very next request is 401; reactivating does NOT revive the old token", async () => {
    const id = await activate(ctx);
    const { token } = (await signIn(ctx)).jsonBody;
    const call = () => requireTeacherSession(req({ headers: teacherHeaders(token) }), ctx.deps);
    expect((await call()).ok).toBe(true);
    await ownerTeachers(req({ action: "suspend", headers: ctx.owner, body: { accountId: id } }), ctx.deps);
    const after = await call();
    expect(after.ok).toBe(false);
    expect(after.response.jsonBody.code).toBe("TEACHER_SESSION_REVOKED");
    expect((await signIn(ctx)).status).toBe(401);
    await ownerTeachers(req({ action: "reactivate", headers: ctx.owner, body: { accountId: id } }), ctx.deps);
    expect((await call()).ok).toBe(false);
    expect((await signIn(ctx)).status).toBe(200);
  });

  it("reset → every session ends, the old password stops working, the reset link sets a new one", async () => {
    const id = await activate(ctx);
    const { token } = (await signIn(ctx)).jsonBody;
    const reset = await ownerTeachers(req({ action: "reset", headers: ctx.owner, body: { accountId: id } }), ctx.deps);
    expect(reset.jsonBody.invitation.purpose).toBe("reset");
    expect((await requireTeacherSession(req({ headers: teacherHeaders(token) }), ctx.deps)).ok).toBe(false);
    expect((await signIn(ctx)).status).toBe(401);
    const accepted = await invitation(req({ action: "accept", body: { token: tokenOf(reset.jsonBody.invitation.invitationPath), password: "a brand new passphrase" } }), ctx.deps);
    expect(accepted.status).toBe(200);
    expect((await signIn(ctx, "t.sara", "a brand new passphrase")).status).toBe(200);
  });

  it("end-sessions ends every session; logout ends only this one", async () => {
    const id = await activate(ctx);
    const a = (await signIn(ctx)).jsonBody.token;
    const b = (await signIn(ctx)).jsonBody.token;
    const out = await sessionEnd(req({ action: "logout", headers: teacherHeaders(a) }), ctx.deps);
    expect(out.jsonBody).toEqual({ ok: true, revoked: true });
    expect((await requireTeacherSession(req({ headers: teacherHeaders(a) }), ctx.deps)).ok).toBe(false);
    expect((await requireTeacherSession(req({ headers: teacherHeaders(b) }), ctx.deps)).ok).toBe(true);
    await ownerTeachers(req({ action: "end-sessions", headers: ctx.owner, body: { accountId: id } }), ctx.deps);
    expect((await requireTeacherSession(req({ headers: teacherHeaders(b) }), ctx.deps)).ok).toBe(false);
  });

  it("logout of an existing (v2) teacher session answers revoked:false; anonymous logout is 401", async () => {
    expect((await sessionEnd(req({ action: "logout", headers: teacherHeaders(createBuilderToken("legacy-teacher")) }), ctx.deps)).jsonBody).toEqual({ ok: true, revoked: false });
    expect((await sessionEnd(req({ action: "logout" }), ctx.deps)).status).toBe(401);
  });

  it("storage down during the account check → 503, never allowed", async () => {
    await activate(ctx);
    const { token } = (await signIn(ctx)).jsonBody;
    const broken = { getBlobClient: () => ({ download: async () => { const e = new Error("down"); e.statusCode = 500; throw e; } }) };
    const r = await requireTeacherSession(req({ headers: teacherHeaders(token) }), { ...ctx.deps, getContainer: () => broken });
    expect(r.ok).toBe(false);
    expect(r.response.status).toBe(503);
  });

  it("BUILDER_SESSION_VERSION still revokes managed sessions too", async () => {
    await activate(ctx);
    const { token } = (await signIn(ctx)).jsonBody;
    process.env.BUILDER_SESSION_VERSION = "2";
    try { expect((await requireTeacherSession(req({ headers: teacherHeaders(token) }), ctx.deps)).ok).toBe(false); }
    finally { delete process.env.BUILDER_SESSION_VERSION; }
  });

  it("platform-session: a managed teacher is a teacher with the account's name; suspended → 401; storage down → 503", async () => {
    const id = await activate(ctx);
    const { token } = (await signIn(ctx)).jsonBody;
    const ok = await platformSession(req({ method: "GET", headers: { authorization: "Bearer " + token } }), ctx.deps);
    expect(ok.status).toBe(200);
    expect(ok.jsonBody).toMatchObject({ role: "teacher", displayName: "سارة" });
    const broken = { getBlobClient: () => ({ download: async () => { const e = new Error("down"); e.statusCode = 500; throw e; } }) };
    expect((await platformSession(req({ method: "GET", headers: { "x-builder-token": token } }), { ...ctx.deps, getContainer: () => broken })).status).toBe(503);
    await ownerTeachers(req({ action: "suspend", headers: ctx.owner, body: { accountId: id } }), ctx.deps);
    expect((await platformSession(req({ method: "GET", headers: { "x-builder-token": token } }), ctx.deps)).status).toBe(401);
  });

  it("two managed teachers are isolated tenants: a class one creates is invisible to the other", async () => {
    const saraId = await activate(ctx, "t.sara");
    await activate(ctx, "t.omar");
    const sara = (await signIn(ctx, "t.sara")).jsonBody.token;
    const omar = (await signIn(ctx, "t.omar")).jsonBody.token;
    const created = await classrooms(req({ method: "POST", headers: teacherHeaders(sara), body: { action: "create", name: "عاشر أ" } }), ctx.deps);
    expect(created.status).toBeLessThan(300);
    const saraList = await classrooms(req({ method: "GET", headers: teacherHeaders(sara) }), ctx.deps);
    const omarList = await classrooms(req({ method: "GET", headers: teacherHeaders(omar) }), ctx.deps);
    expect(saraList.jsonBody.classes.map(c => c.name)).toEqual(["عاشر أ"]);
    expect(omarList.jsonBody.classes).toEqual([]);
    const stored = ctx.mem.names("platform/classes/").map(n => ctx.mem.getJson(n));
    expect(stored.map(c => c.ownerId)).toEqual([saraId]);
  });

  it("the operator tools refuse a managed teacher (403 OWNER_REQUIRED)", async () => {
    await activate(ctx);
    const { token } = (await signIn(ctx)).jsonBody;
    const r = await requireOperator(req({ headers: teacherHeaders(token) }), ctx.deps);
    expect(r.ok).toBe(false);
    expect(r.response.status).toBe(403);
    expect(r.response.jsonBody.code).toBe("OWNER_REQUIRED");
  });

  it("the AI rate limiter keys a managed teacher by the account id (no limiter bypass)", async () => {
    const id = await activate(ctx);
    const { token } = (await signIn(ctx)).jsonBody;
    const keyed = [];
    const wrapped = withAiRateLimit("ai-question-author", "ai-general", async () => ({ status: 200, jsonBody: { ok: true } }), { getContainer: () => ctx.mem.container, reserve: async (_c, _p, who) => { keyed.push(who); return { allowed: true }; } });
    const r = await wrapped(req({ headers: teacherHeaders(token) }));
    expect(r.status).toBe(200);
    expect(keyed).toEqual([id]);
  });

  it("a malformed BUILDER_USERS does not stop managed teachers from signing in", async () => {
    await activate(ctx);
    process.env.BUILDER_USERS = "{broken";
    try {
      const r = await signIn(ctx);
      expect(r.status).toBe(200);
      expect((await requireTeacherSession(req({ headers: teacherHeaders(r.jsonBody.token) }), ctx.deps)).ok).toBe(true);
    } finally { delete process.env.BUILDER_USERS; }
  });
});
