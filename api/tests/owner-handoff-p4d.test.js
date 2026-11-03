import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P4-D — owner decision D19 (blueprint §19.4): «الانتقال إلى مساحة المعلم الخاصة بي». TEST data only.
//   link: owner session + step-up, one teacher account (or none), audited;
//   issue: owner session + step-up, the linked account must be usable; a ONE-TIME ticket valid 60 s, bound to THIS owner
//          session; only its SHA-256 is stored; audited;
//   redeem: no session (the ticket is the credential); consumed first (a second use, even concurrent, is refused); refused when
//          expired, when the owner session ended / was revoked, when unlinked or relinked, when the teacher account is suspended,
//          has no password or its trial ended → an ORDINARY teacher session with its own session id and NO owner capability;
//          the two sessions are independent (signing out of one never ends the other); audited on both sides.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p4d-owner-handoff-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.OWNER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const { handler: ownerHandoff, HANDOFF_PREFIX, handoffName } = await import("../src/functions/owner-handoff.js");
const { handler: ownerSession } = await import("../src/functions/owner-session.js");
const { handler: platformSession } = await import("../src/functions/platform-session.js");
const { handler: teacherSessionEnd } = await import("../src/functions/teacher-session-end.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { verifyManagedTeacherToken } = await import("../src/lib/identity/teacher-token.js");
const { OWNER_AUDIT_PREFIX, AUDIT_PREFIX } = await import("../src/lib/audit-log.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const OWNER_ID = "own_0011223344556677";
const MINE = "t_00112233445566aa";       // the owner's own teacher account
const OTHER = "t_00112233445566bb";

function req({ method = "POST", action = "", body = {}, headers = {} } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, params: { action }, headers: { get: k => h[String(k).toLowerCase()] ?? null }, json: async () => body };
}

function setup() {
  resetOperatorGateCache();
  const mem = createMemoryContainer();
  const clock = { now: Date.now() };
  const deps = { getContainer: () => mem.container, now: () => clock.now };
  for (const [id, username, extra] of [[MINE, "w.nassar", {}], [OTHER, "t.other", {}]]) {
    mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username, displayName: username, status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], ...extra });
  }
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: clock.now });
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const headers = {};
  for (const [name, ago, ch] of [["owner", 0, "c"], ["ownerStale", 11 * 60 * 1000, "d"], ["ownerOther", 0, "e"]]) {
    const sid = ch.repeat(32);
    mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: clock.now, expiresAtMs: clock.now + 7200e3, stepUpAtMs: clock.now - ago });
    headers[name] = { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: clock.now }).token };
  }
  return { mem, clock, deps, ...headers };
}
const call = (ctx, action, body = {}, headers = ctx.owner, method = "POST") => ownerHandoff(req({ method, action, body, headers }), ctx.deps);
const redeem = (ctx, token, headers = {}) => ownerHandoff(req({ action: "redeem", body: { token }, headers }), ctx.deps);
const tokenOf = r => r.jsonBody.handoffPath.replace("#/handoff/", "");
async function linkAndIssue(ctx, accountId = MINE) {
  expect((await call(ctx, "link", { accountId })).status).toBe(200);
  const r = await call(ctx, "issue");
  expect(r.status).toBe(200);
  return tokenOf(r);
}
const ownerAudits = ctx => ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n));
const teacherAudits = ctx => ctx.mem.names(AUDIT_PREFIX).map(n => ctx.mem.getJson(n));
const patchTeacher = (ctx, id, over) => ctx.mem.setJson(teacherAccountName(id), { ...ctx.mem.getJson(teacherAccountName(id)), ...over });

describe("P4-D link", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("owner only (a teacher token is refused); nothing linked at first", async () => {
    expect((await call(ctx, "", {}, {}, "GET")).status).toBe(401);
    const t = await linkAndIssue(ctx);
    const teacher = (await redeem(ctx, t)).jsonBody.token;
    expect((await call(ctx, "", {}, { "x-builder-token": teacher, authorization: "Bearer " + teacher }, "GET")).status).toBe(401);
    await call(ctx, "link", { accountId: null });
    expect((await call(ctx, "", {}, ctx.owner, "GET")).jsonBody).toEqual({ ok: true, linked: null });
  });

  it("needs a recent step-up; one valid, existing teacher account; audited; unlink", async () => {
    expect((await call(ctx, "link", { accountId: MINE }, ctx.ownerStale)).jsonBody.code).toBe("STEP_UP_REQUIRED");
    expect((await call(ctx, "link", { accountId: "../x" })).status).toBe(400);
    expect((await call(ctx, "link", { accountId: "t_99887766554433aa" })).status).toBe(404);
    expect(ctx.mem.getJson(ownerAccountName(OWNER_ID)).linkedTeacherAccountId).toBeUndefined();
    const r = await call(ctx, "link", { accountId: MINE });
    expect(r.jsonBody.linked).toEqual({ accountId: MINE, username: "w.nassar", displayName: "w.nassar", status: "active", usable: true, reason: null });
    expect(ctx.mem.getJson(ownerAccountName(OWNER_ID)).linkedTeacherAccountId).toBe(MINE);
    await call(ctx, "link", { accountId: null });
    expect(ctx.mem.getJson(ownerAccountName(OWNER_ID)).linkedTeacherAccountId).toBeNull();
    expect(ownerAudits(ctx).map(e => [e.action, e.details])).toEqual(expect.arrayContaining([
      ["owner.teacher-link.set", { from: null, to: MINE }], ["owner.teacher-link.cleared", { from: MINE, to: null }]
    ]));
  });

  it("the owner view says when the linked account cannot be used, and why", async () => {
    await call(ctx, "link", { accountId: MINE });
    for (const [over, reason] of [[{ status: "suspended" }, "TEACHER_SUSPENDED"], [{ status: "invited", credential: null }, "TEACHER_NOT_ACTIVE"], [{ trial: { days: 1, startedAtMs: 0, endsAtMs: 1 } }, "TEACHER_TRIAL_ENDED"]]) {
      patchTeacher(ctx, MINE, { status: "active", credential: { algo: "scrypt" }, trial: null, ...over });
      expect((await call(ctx, "", {}, ctx.owner, "GET")).jsonBody.linked).toMatchObject({ usable: false, reason });
    }
  });
});

describe("P4-D issue", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("not linked → 409; a linked account that cannot be used → 409 with its reason; step-up needed", async () => {
    expect((await call(ctx, "issue")).jsonBody.code).toBe("HANDOFF_NOT_LINKED");
    await call(ctx, "link", { accountId: MINE });
    expect((await call(ctx, "issue", {}, ctx.ownerStale)).jsonBody.code).toBe("STEP_UP_REQUIRED");
    patchTeacher(ctx, MINE, { status: "suspended" });
    const r = await call(ctx, "issue");
    expect([r.status, r.jsonBody.code]).toEqual([409, "TEACHER_SUSPENDED"]);
    expect(ctx.mem.names(HANDOFF_PREFIX)).toEqual([]);
  });

  it("a 43-character one-time ticket in a URL fragment, valid 60 s, bound to this owner session; only its hash is stored; audited", async () => {
    await call(ctx, "link", { accountId: MINE });
    const r = await call(ctx, "issue");
    expect(r.jsonBody.handoffPath).toMatch(/^#\/handoff\/[A-Za-z0-9_-]{43}$/);
    expect(Date.parse(r.jsonBody.expiresAt) - ctx.clock.now).toBe(60000);
    const token = tokenOf(r);
    expect(ctx.mem.names(HANDOFF_PREFIX)).toEqual([handoffName(token)]);
    expect(handoffName(token)).not.toContain(token);
    for (const n of ctx.mem.names("")) expect(JSON.stringify(ctx.mem.getJson(n) ?? null)).not.toContain(token);
    expect(ctx.mem.getJson(handoffName(token))).toMatchObject({ ownerId: OWNER_ID, ownerSid: "c".repeat(32), ownerAuthVersion: 1, accountId: MINE, usedAtMs: null });
    expect(ownerAudits(ctx).find(e => e.action === "owner.teacher-handoff.issued")).toMatchObject({ targetId: MINE });
  });
});

describe("P4-D redeem", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("→ an ORDINARY teacher session of the linked account, its own session id, no owner claim; audited on the teacher side", async () => {
    const t = await linkAndIssue(ctx);
    const r = await redeem(ctx, t);
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, role: "teacher", userCode: "w.nassar", displayName: "w.nassar" });
    expect(r.headers["Cache-Control"]).toBe("no-store");
    const claim = verifyManagedTeacherToken(r.jsonBody.token, { nowMs: ctx.clock.now });
    expect(Object.keys(claim).sort()).toEqual(["am", "av", "exp", "iat", "role", "sid", "sub", "sv", "ver"]);
    expect(claim).toMatchObject({ ver: 3, role: "teacher", am: "managed", sub: MINE, av: 1 });
    expect(claim.sid).not.toBe("c".repeat(32));
    const probe = await platformSession(req({ method: "GET", headers: { "x-builder-token": r.jsonBody.token } }), ctx.deps);
    expect(probe.jsonBody).toMatchObject({ ok: true, role: "teacher" });
    expect(teacherAudits(ctx).find(e => e.action === "teacher.session.from-owner")).toMatchObject({ actor: MINE, targetId: MINE, details: { ownerId: OWNER_ID } });
    expect(ctx.mem.getJson(teacherAccountName(MINE)).lastLoginAt).toBeTruthy();
  });

  it("one time only — a second use, and two concurrent uses, give exactly one session", async () => {
    const t = await linkAndIssue(ctx);
    expect((await redeem(ctx, t)).status).toBe(200);
    const again = await redeem(ctx, t);
    expect([again.status, again.jsonBody.code]).toEqual([401, "HANDOFF_USED"]);
    const t2 = tokenOf(await call(ctx, "issue"));
    const both = await Promise.all([redeem(ctx, t2), redeem(ctx, t2)]);
    expect(both.map(r => r.status).sort()).toEqual([200, 401]);
  });

  it("after 60 seconds it is expired (and burnt)", async () => {
    const t = await linkAndIssue(ctx);
    ctx.clock.now += 60001;
    expect((await redeem(ctx, t)).jsonBody.code).toBe("HANDOFF_EXPIRED");
    ctx.clock.now -= 60001;
    expect((await redeem(ctx, t)).jsonBody.code).toBe("HANDOFF_USED");
  });

  it("malformed or unknown tickets are refused the same way", async () => {
    for (const t of ["", "short", "A".repeat(44), "../../platform/owner/x", "A".repeat(43)]) {
      const r = await redeem(ctx, t);
      expect([r.status, r.jsonBody.code]).toEqual([401, "HANDOFF_INVALID"]);
    }
  });

  it("refused when the owner session that issued it ended: signed out, or every session revoked", async () => {
    let t = await linkAndIssue(ctx);
    expect((await ownerSession(req({ action: "logout", headers: ctx.owner }), ctx.deps)).status).toBe(200);
    expect((await redeem(ctx, t)).jsonBody.code).toBe("OWNER_SESSION_ENDED");
    t = tokenOf(await call(ctx, "issue", {}, ctx.ownerOther));
    ctx.mem.setJson(ownerAccountName(OWNER_ID), { ...ctx.mem.getJson(ownerAccountName(OWNER_ID)), authVersion: 2 });   // revoke-all
    expect((await redeem(ctx, t)).jsonBody.code).toBe("OWNER_SESSION_ENDED");
  });

  it("refused when the owner unlinked, or relinked to another account, after issuing", async () => {
    let t = await linkAndIssue(ctx);
    await call(ctx, "link", { accountId: null });
    expect((await redeem(ctx, t)).jsonBody.code).toBe("HANDOFF_LINK_REMOVED");
    t = await linkAndIssue(ctx);
    await call(ctx, "link", { accountId: OTHER });
    expect((await redeem(ctx, t)).jsonBody.code).toBe("HANDOFF_LINK_REMOVED");
  });

  it("refused when the teacher account was suspended, lost its password or its trial ended after issuing", async () => {
    for (const [over, code] of [[{ status: "suspended" }, "TEACHER_SUSPENDED"], [{ credential: null }, "TEACHER_NOT_ACTIVE"], [{ trial: { days: 1, startedAtMs: 0, endsAtMs: 1 } }, "TEACHER_TRIAL_ENDED"]]) {
      patchTeacher(ctx, MINE, { status: "active", credential: { algo: "scrypt" }, trial: null });
      const t = await linkAndIssue(ctx);
      patchTeacher(ctx, MINE, over);
      const r = await redeem(ctx, t);
      expect([r.status, r.jsonBody.code]).toEqual([401, code]);
    }
  });

  it("the two sessions are independent: the teacher's sign-out keeps the owner's, and the owner's sign-out keeps the teacher's", async () => {
    const t1 = await linkAndIssue(ctx);
    const teacher = (await redeem(ctx, t1)).jsonBody.token;
    expect((await teacherSessionEnd(req({ action: "logout", headers: { "x-builder-token": teacher, authorization: "Bearer " + teacher } }), ctx.deps)).status).toBe(200);
    expect((await call(ctx, "", {}, ctx.owner, "GET")).status).toBe(200);
    expect((await platformSession(req({ method: "GET", headers: { "x-builder-token": teacher } }), ctx.deps)).status).toBe(401);
    const t2 = tokenOf(await call(ctx, "issue"));
    const teacher2 = (await redeem(ctx, t2)).jsonBody.token;
    await ownerSession(req({ action: "logout", headers: ctx.owner }), ctx.deps);
    expect((await call(ctx, "", {}, ctx.owner, "GET")).status).toBe(401);
    expect((await platformSession(req({ method: "GET", headers: { "x-builder-token": teacher2 } }), ctx.deps)).status).toBe(200);
  });
});
