import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { recordedManagedToken } from "./fixtures/managed-session.js";

// Tadris+ QR-1 — sign in on a new device by scanning a QR code with a device already signed in (owner, teacher, student).
// Design: docs/enterprise-qr-login-qr1.md. TEST data only.
//   start: a 90 s pairing, only hashes stored, budgeted per address; poll: needs the pairing token AND the poll secret;
//   approve: binds the CALLER's verified identity only, the shown number must match (a wrong one closes the pairing), the owner
//   needs a recent step-up; poll after approval: consumed FIRST (one session at most, even concurrently), the approver re-checked
//   from storage → an ordinary session of that role (owner: WITHOUT step-up; teacher: recorded, via "qr"; student: current version).

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "qr1-root-secret-for-tests-only";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.STUDENT_SESSION_SECRET;
delete process.env.OWNER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.BUILDER_PASSWORD;

const { handler: qrLogin } = await import("../src/functions/qr-login.js");
const { handler: qrApprove } = await import("../src/functions/qr-login-approve.js");
const { handler: ownerQrLogin, OWNER_QR_PREFIX } = await import("../src/functions/owner-qr-login.js");
const { handler: ownerQrApprove } = await import("../src/functions/owner-qr-login-approve.js");
const { handler: ownerHandoff } = await import("../src/functions/owner-handoff.js");
const { handler: teacherSessionEnd } = await import("../src/functions/teacher-session-end.js");
const lib = cjs("../src/lib/identity/qr-login.js");
const { requireTeacherSession } = cjs("../src/lib/teacher-session.js");
const { createStudentToken, verifyStudentToken, requireActiveStudentSession } = cjs("../src/lib/student-auth.js");
const { createOwnerToken, verifyOwnerToken, requireOwnerSession } = cjs("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = cjs("../src/lib/identity/owner-store.js");
const { teacherAccountName, liveSessions } = cjs("../src/lib/identity/teacher-accounts.js");
const { verifyManagedTeacherToken, newTeacherSessionId } = cjs("../src/lib/identity/teacher-token.js");
const { OWNER_AUDIT_PREFIX, AUDIT_PREFIX } = cjs("../src/lib/audit-log.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const OWNER_ID = "own_0011223344556677";
const TEACHER = "t_00112233445566aa";
const OTHER_TEACHER = "t_00112233445566bb";
const STUDENT = "stu_qr1_0001";
const NEW_DEVICE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

function req({ action = "", body = {}, headers = {}, method = "POST" } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, params: { action }, headers: { get: k => h[String(k).toLowerCase()] ?? null }, json: async () => body };
}

let ctx;
function setup() {
  resetOperatorGateCache();
  const mem = createMemoryContainer();
  const clock = { now: Date.now() };
  const deps = { getContainer: () => mem.container, now: () => clock.now };
  for (const id of [TEACHER, OTHER_TEACHER]) {
    mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username: "u" + id.slice(-2), displayName: "معلم " + id.slice(-2), status: "active", credential: { algo: "scrypt" }, authVersion: 1 });
  }
  const teacherSid = newTeacherSessionId();
  const teacherToken = recordedManagedToken(mem, { accountId: TEACHER, sid: teacherSid, authVersion: 1 }, { nowMs: clock.now }).token;
  const otherToken = recordedManagedToken(mem, { accountId: OTHER_TEACHER, sid: newTeacherSessionId(), authVersion: 1 }, { nowMs: clock.now }).token;
  const student = { userId: STUDENT, code: "S1001", displayName: "طالب تجريبي", classId: "c1", active: true, archived: false, authVersion: 1 };
  mem.setJson("platform/users/" + STUDENT + ".json", student);
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: clock.now });
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const owner = {};
  for (const [name, ago, ch] of [["fresh", 0, "c"], ["stale", 11 * 60 * 1000, "d"]]) {
    const sid = ch.repeat(32);
    mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: clock.now, expiresAtMs: clock.now + 7200e3, stepUpAtMs: clock.now - ago });
    owner[name] = { sid, headers: { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: clock.now }).token } };
  }
  return {
    mem, clock, deps, teacherSid, owner,
    teacher: { authorization: "Bearer " + teacherToken },
    otherTeacher: { authorization: "Bearer " + otherToken },
    student: { authorization: "Bearer " + createStudentToken(student) }
  };
}

const newDevice = { "user-agent": NEW_DEVICE_UA, "x-forwarded-for": "203.0.113.7" };
const phoneSameNet = { "x-forwarded-for": "203.0.113.7" };
// The teacher / student namespace (qr-login + qr-login-approve) and the owner's (owner-qr-login + owner-qr-login-approve).
const NS = { platform: { start: qrLogin, approve: qrApprove }, owner: { start: ownerQrLogin, approve: ownerQrApprove } };
async function start(headers = newDevice, ns = "platform") {
  const r = await NS[ns].start(req({ action: "start", headers }), ctx.deps);
  expect(r.status).toBe(200);
  return { ...r.jsonBody, ns };
}
const poll = (p, secret = p.pollSecret) => NS[p.ns || "platform"].start(req({ action: "poll", body: { pairingToken: p.pairingToken, pollSecret: secret }, headers: newDevice }), ctx.deps);
const approverIn = ns => (action, who, body) => NS[ns].approve(req({ action, body, headers: { ...phoneSameNet, ...who } }), ctx.deps);
const approver = approverIn("platform");
const approve = (p, who, matchCode = p.matchCode, extra = {}) => approverIn(p.ns || "platform")("approve", who, { pairingToken: p.pairingToken, matchCode, ...extra });
const startOwner = () => start(newDevice, "owner");
const authHeaders = token => req({ headers: { authorization: "Bearer " + token } });

beforeEach(() => { ctx = setup(); });

describe("QR-1 pure rules", () => {
  it("a pairing stores hashes only, and its 3 numbers include the shown one", () => {
    const { pairingToken, pollSecret, record } = lib.newPairing({ nowMs: 1000, userAgent: NEW_DEVICE_UA, clientId: "203.0.113.7" });
    expect(lib.validToken(pairingToken) && lib.validToken(pollSecret)).toBe(true);
    const text = JSON.stringify(record);
    expect(text).not.toContain(pairingToken);
    expect(text).not.toContain(pollSecret);
    expect(text).not.toContain("203.0.113.7");
    expect(record.pollSecretHash).toBe(lib.pollSecretHash(pollSecret));
    expect(record.expiresAtMs - record.createdAtMs).toBe(90 * 1000);
    expect(new Set(record.matchOptions).size).toBe(3);
    expect(record.matchOptions).toContain(record.matchCode);
    expect(record.device).toEqual({ browser: "Chrome", os: "Windows" });
    expect(lib.pairingName(pairingToken)).not.toContain(pairingToken);
  });
  it("the device description is a fixed vocabulary, never the raw User-Agent", () => {
    expect(lib.deviceFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toEqual({ browser: "Safari", os: "iOS" });
    expect(lib.deviceFromUserAgent("<script>alert(1)</script>")).toEqual({ browser: "unknown", os: "unknown" });
    expect(lib.deviceFromUserAgent(undefined)).toEqual({ browser: "unknown", os: "unknown" });
  });
  it("the start budget allows 120 per address, then refuses with a real Retry-After, and refills", () => {
    let state = null, allowed = 0, last;
    for (let i = 0; i < 121; i++) { last = lib.evaluateStartBucket(state, 5000); state = last.next; if (last.allowed) allowed++; }
    expect(allowed).toBe(120);
    expect(last.allowed).toBe(false);
    expect(last.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(lib.evaluateStartBucket(state, 5000 + 10 * 1000).allowed).toBe(true);
  });
  it("an approval must name one known role, one subject and (owner / teacher) a session id", () => {
    expect(lib.validApproval({ role: "teacher", subject: TEACHER, sid: "a".repeat(32), authVersion: 1 })).toBe(true);
    expect(lib.validApproval({ role: "student", subject: STUDENT, authVersion: 1 })).toBe(true);
    expect(lib.validApproval({ role: "teacher", subject: TEACHER, authVersion: 1 })).toBe(false);
    expect(lib.validApproval({ role: "admin", subject: TEACHER, sid: "a".repeat(32), authVersion: 1 })).toBe(false);
    expect(lib.validApproval({ role: "student", subject: "", authVersion: 1 })).toBe(false);
    expect(lib.validApproval(null)).toBe(false);
  });
});

describe("QR-1 start and poll (the new device)", () => {
  it("start answers a pairing and stores only its hashed record; the QR path is a URL fragment", async () => {
    const p = await start();
    expect(p.qrPath).toBe("#/qr-login/" + p.pairingToken);
    expect(p.expiresInSeconds).toBe(90);
    const names = ctx.mem.names(lib.PAIRING_PREFIX);
    expect(names).toEqual([lib.pairingName(p.pairingToken)]);
    const stored = ctx.mem.getJson(names[0]);
    expect(stored.status).toBe("pending");
    expect(JSON.stringify(stored)).not.toContain(p.pollSecret);
  });
  it("poll is pending until approved; the pairing token alone (what the QR shows) cannot poll", async () => {
    const p = await start();
    expect((await poll(p)).jsonBody).toMatchObject({ ok: true, status: "pending" });
    const stranger = await poll(p, "A".repeat(43));
    expect(stranger.status).toBe(404);
    expect(stranger.jsonBody.code).toBe("QR_INVALID");
    expect((await poll({ pairingToken: "x", pollSecret: "y" })).status).toBe(404);
  });
  it("only start and poll exist; any other action or method is 404 (no storage touched)", async () => {
    expect((await qrLogin(req({ action: "approve" }), ctx.deps)).status).toBe(404);
    expect((await qrLogin(req({ action: "start", method: "GET" }), ctx.deps)).status).toBe(404);
    expect(ctx.mem.names(lib.PAIRING_PREFIX)).toEqual([]);
  });
  it("start is budgeted per address (fail closed on storage errors)", async () => {
    for (let i = 0; i < 120; i++) expect((await qrLogin(req({ action: "start", headers: newDevice }), ctx.deps)).status).toBe(200);
    const refused = await qrLogin(req({ action: "start", headers: newDevice }), ctx.deps);
    expect(refused.status).toBe(429);
    expect(Number(refused.headers["Retry-After"])).toBeGreaterThanOrEqual(1);
    expect((await qrLogin(req({ action: "start", headers: { "x-forwarded-for": "198.51.100.9" } }), ctx.deps)).status).toBe(200);
    const down = await qrLogin(req({ action: "start", headers: newDevice }), { ...ctx.deps, getContainer: () => { throw new Error("storage down"); } });
    expect(down.status).toBe(503);
  });
});

describe("QR-1 approve (the signed-in device)", () => {
  it("an anonymous or forged caller is refused 401 before anything is read", async () => {
    const p = await start();
    for (const action of ["inspect", "approve", "deny"]) {
      expect((await approver(action, {}, { pairingToken: p.pairingToken, matchCode: p.matchCode })).status).toBe(401);
      expect((await approver(action, { authorization: "Bearer forged.token" }, { pairingToken: p.pairingToken })).status).toBe(401);
    }
    expect(ctx.mem.getJson(lib.pairingName(p.pairingToken)).status).toBe("pending");
  });
  it("inspect shows the fixed device words, the network hint and 3 numbers; it writes nothing", async () => {
    const p = await start();
    const before = JSON.stringify(ctx.mem.getJson(lib.pairingName(p.pairingToken)));
    const r = await approver("inspect", ctx.teacher, { pairingToken: p.pairingToken });
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, role: "teacher", device: { browser: "Chrome", os: "Windows" }, sameNetwork: true });
    expect(r.jsonBody.matchOptions).toContain(p.matchCode);
    expect(JSON.stringify(r.jsonBody)).not.toContain("matchCode");
    const far = await qrApprove(req({ action: "inspect", body: { pairingToken: p.pairingToken }, headers: { ...ctx.teacher, "x-forwarded-for": "198.51.100.9" } }), ctx.deps);
    expect(far.jsonBody.sameNetwork).toBe(false);
    expect(JSON.stringify(ctx.mem.getJson(lib.pairingName(p.pairingToken)))).toBe(before);
  });
  it("a wrong number closes the pairing for good (no second guess)", async () => {
    const p = await start();
    const wrong = p.matchCode === 99 ? 10 : p.matchCode + 1;
    const r = await approve(p, ctx.teacher, wrong);
    expect(r.status).toBe(409);
    expect(r.jsonBody.code).toBe("QR_MATCH_FAILED");
    expect((await approve(p, ctx.teacher)).jsonBody.code).toBe("QR_DENIED");
    expect((await poll(p)).jsonBody.code).toBe("QR_DENIED");
  });
  it("«لست أنا» (deny) closes the pairing", async () => {
    const p = await start();
    expect((await approver("deny", ctx.student, { pairingToken: p.pairingToken })).jsonBody.status).toBe("denied");
    const r = await poll(p);
    expect(r.status).toBe(410);
    expect(r.jsonBody.code).toBe("QR_DENIED");
  });
  it("after 90 seconds the pairing can be neither approved nor polled", async () => {
    const p = await start();
    ctx.clock.now += 90 * 1000;
    expect((await approve(p, ctx.teacher)).jsonBody.code).toBe("QR_EXPIRED");
    expect((await poll(p)).jsonBody.code).toBe("QR_EXPIRED");
  });
  it("a pairing is approved once: a second approver is refused", async () => {
    const p = await start();
    expect((await approve(p, ctx.teacher)).status).toBe(200);
    const late = await approve(p, ctx.otherTeacher);
    expect(late.status).toBe(410);
    expect(late.jsonBody.code).toBe("QR_ALREADY_APPROVED");
    expect(ctx.mem.getJson(lib.pairingName(p.pairingToken)).approval.subject).toBe(TEACHER);
  });
  it("two concurrent approvals of one pairing: exactly one is accepted, and the bound identity is that one", async () => {
    const p = await start();
    const [t, st] = await Promise.all([approve(p, ctx.teacher), approve(p, ctx.student)]);
    expect([t.status, st.status].filter(s => s === 200).length).toBe(1);
    const bound = ctx.mem.getJson(lib.pairingName(p.pairingToken)).approval;
    expect(bound.role).toBe(t.status === 200 ? "teacher" : "student");
    expect((await poll(p)).jsonBody.role).toBe(bound.role);
  });
  it("a closed or approved pairing shows nothing to inspect", async () => {
    const p = await start();
    await approve(p, ctx.teacher);
    const r = await approver("inspect", ctx.student, { pairingToken: p.pairingToken });
    expect(r.status).toBe(410);
    expect(r.jsonBody.code).toBe("QR_ALREADY_APPROVED");
    expect(r.jsonBody.device).toBeUndefined();
  });
  it("a shared-password / BUILDER_USERS teacher session (not recorded on the server) cannot approve", async () => {
    const p = await start();
    const r = await qrApprove(req({ action: "approve", body: { pairingToken: p.pairingToken, matchCode: p.matchCode }, headers: { authorization: "Bearer legacy" } }), { ...ctx.deps, requireBuilderAuth: () => ({ ok: true, user: { ver: 2, role: "teacher", sub: "T1", am: "multi-user" } }) });
    expect(r.status).toBe(403);
    expect(r.jsonBody.code).toBe("QR_ROLE_UNSUPPORTED");
    expect(ctx.mem.getJson(lib.pairingName(p.pairingToken)).status).toBe("pending");
  });
  it("a corrupted pairing record is refused (fail closed)", async () => {
    const p = await start();
    ctx.mem.setJson(lib.pairingName(p.pairingToken), { schemaVersion: 1, status: "pending" });
    expect((await approve(p, ctx.teacher)).status).toBe(404);
    expect((await poll(p)).status).toBe(404);
  });
});

describe("QR-1 teacher", () => {
  it("approve → poll gives an ordinary RECORDED teacher session for the approver; a second poll is refused", async () => {
    const p = await start();
    // a body naming another identity is ignored: only the caller's verified session is bound
    expect((await approve(p, ctx.teacher, p.matchCode, { role: "owner", subject: OTHER_TEACHER, sid: "f".repeat(32) })).status).toBe(200);
    const r = await poll(p);
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, role: "teacher", userCode: "uaa" });
    const claim = verifyManagedTeacherToken(r.jsonBody.token, { nowMs: ctx.clock.now });
    expect(claim.sub).toBe(TEACHER);
    expect(claim.sid).not.toBe(ctx.teacherSid);
    const sessions = liveSessions(ctx.mem.getJson(teacherAccountName(TEACHER)), ctx.clock.now);
    expect(sessions.map(s => s.via)).toEqual(["login", "qr"]);
    expect((await requireTeacherSession(authHeaders(r.jsonBody.token), ctx.deps)).ok).toBe(true);
    const again = await poll(p);
    expect(again.status).toBe(410);
    expect(again.jsonBody.code).toBe("QR_USED");
    expect(ctx.mem.names(AUDIT_PREFIX).length).toBeGreaterThan(0);
  });
  it("two concurrent polls of one approved pairing yield exactly one session", async () => {
    const p = await start();
    await approve(p, ctx.teacher);
    const results = await Promise.all([poll(p), poll(p), poll(p)]);
    expect(results.filter(r => r.status === 200).length).toBe(1);
    expect(liveSessions(ctx.mem.getJson(teacherAccountName(TEACHER)), ctx.clock.now).length).toBe(2);
  });
  it("the approver signed out before the poll → refused, and the pairing is spent", async () => {
    const p = await start();
    await approve(p, ctx.teacher);
    expect((await teacherSessionEnd(req({ action: "logout", headers: ctx.teacher }), ctx.deps)).status).toBe(200);
    const r = await poll(p);
    expect(r.status).toBe(401);
    expect(r.jsonBody.code).toBe("APPROVER_SESSION_ENDED");
    expect((await poll(p)).jsonBody.code).toBe("QR_USED");
    expect(liveSessions(ctx.mem.getJson(teacherAccountName(TEACHER)), ctx.clock.now)).toEqual([]);
  });
  it("the teacher suspended or its password reset before the poll → refused", async () => {
    for (const change of [a => ({ ...a, status: "suspended" }), a => ({ ...a, authVersion: 2 })]) {
      ctx = setup();
      const p = await start();
      await approve(p, ctx.teacher);
      ctx.mem.setJson(teacherAccountName(TEACHER), change(ctx.mem.getJson(teacherAccountName(TEACHER))));
      const r = await poll(p);
      expect(r.status).toBe(401);
      expect(r.jsonBody.code).toBe("APPROVER_SESSION_ENDED");
    }
  });
  it("a trial account whose period ended between approval and poll → refused", async () => {
    const p = await start();
    await approve(p, ctx.teacher);
    const a = ctx.mem.getJson(teacherAccountName(TEACHER));
    ctx.mem.setJson(teacherAccountName(TEACHER), { ...a, trial: { days: 10, startedAtMs: ctx.clock.now - 10 * 864e5, endsAtMs: ctx.clock.now - 1 } });
    const r = await poll(p);
    expect(r.status).toBe(401);
    expect(r.jsonBody.code).toBe("TEACHER_TRIAL_ENDED");
  });
});

describe("QR-1 student", () => {
  it("approve → poll gives a student session of the current credential version", async () => {
    const p = await start();
    expect((await approve(p, ctx.student)).status).toBe(200);
    const r = await poll(p);
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, role: "student", userCode: "S1001" });
    expect(verifyStudentToken(r.jsonBody.token).sub).toBe(STUDENT);
    expect((await requireActiveStudentSession(authHeaders(r.jsonBody.token), ctx.deps)).ok).toBe(true);
  });
  it("a password reset, archive or deletion between approval and poll → refused", async () => {
    for (const change of [s => ({ ...s, authVersion: 2 }), s => ({ ...s, archived: true }), s => ({ ...s, active: false }), () => null]) {
      ctx = setup();
      const p = await start();
      await approve(p, ctx.student);
      const name = "platform/users/" + STUDENT + ".json";
      const next = change(ctx.mem.getJson(name));
      if (next) ctx.mem.setJson(name, next); else ctx.mem.store.delete(name);
      expect((await poll(p)).status).toBe(401);
      if (!next) expect(ctx.mem.has(name)).toBe(false);          // never resurrected
    }
  });
});

describe("QR-1 owner", () => {
  it("approving needs a recent step-up (authenticator code within 10 minutes)", async () => {
    const p = await startOwner();
    const r = await approve(p, ctx.owner.stale.headers);
    expect(r.status).toBe(403);
    expect(r.jsonBody.code).toBe("STEP_UP_REQUIRED");
    expect(ctx.mem.getJson(lib.pairingName(p.pairingToken, OWNER_QR_PREFIX)).status).toBe("pending");
  });
  it("approve → poll gives a NEW owner session WITHOUT step-up: an owner change on the new device asks for the code again", async () => {
    const p = await startOwner();
    expect((await approve(p, ctx.owner.fresh.headers)).status).toBe(200);
    const r = await poll(p);
    expect(r.status).toBe(200);
    expect(r.jsonBody.role).toBe("owner");
    const claim = verifyOwnerToken(r.jsonBody.token, { nowMs: ctx.clock.now });
    expect(claim.sub).toBe(OWNER_ID);
    expect(claim.sid).not.toBe(ctx.owner.fresh.sid);
    const session = ctx.mem.getJson(ownerSessionName(claim.sid));
    expect(session).toMatchObject({ accountId: OWNER_ID, stepUpAtMs: null, factor: "qr" });
    const newHeaders = { "x-owner-token": r.jsonBody.token };
    expect((await requireOwnerSession(req({ headers: newHeaders }), ctx.deps)).ok).toBe(true);
    const mutation = await ownerHandoff(req({ action: "link", body: { accountId: TEACHER }, headers: newHeaders }), ctx.deps);
    expect(mutation.status).toBe(403);
    expect(mutation.jsonBody.code).toBe("STEP_UP_REQUIRED");
    const actions = ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n).action);
    expect(actions).toEqual(expect.arrayContaining(["owner.qr-login.approved", "owner.login.succeeded"]));
  });
  it("the approving owner session ended before the poll → refused", async () => {
    const p = await startOwner();
    await approve(p, ctx.owner.fresh.headers);
    ctx.mem.store.delete(ownerSessionName(ctx.owner.fresh.sid));
    const r = await poll(p);
    expect(r.status).toBe(401);
    expect(r.jsonBody.code).toBe("APPROVER_SESSION_ENDED");
  });
  it("an owner approval is never written unrecorded: a failed audit write refuses it (503)", async () => {
    const p = await startOwner();
    const r = await ownerQrApprove(req({ action: "approve", body: { pairingToken: p.pairingToken, matchCode: p.matchCode }, headers: ctx.owner.fresh.headers }), { ...ctx.deps, recordOwnerAuditEvent: async () => { throw new Error("audit down"); } });
    expect(r.status).toBe(503);
    expect(ctx.mem.getJson(lib.pairingName(p.pairingToken, OWNER_QR_PREFIX)).status).toBe("pending");
  });
  it("a wrong number closes the owner pairing and is recorded as such (not as «not applied»)", async () => {
    const p = await startOwner();
    const r = await approve(p, ctx.owner.fresh.headers, p.matchCode === 99 ? 10 : p.matchCode + 1);
    expect(r.status).toBe(409);
    expect(r.jsonBody.code).toBe("QR_MATCH_FAILED");
    expect(r.jsonBody.closedOnMismatch).toBeUndefined();
    expect(ctx.mem.getJson(lib.pairingName(p.pairingToken, OWNER_QR_PREFIX)).status).toBe("denied");
    const actions = ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n).action);
    expect(actions).toContain("owner.qr-login.match-failed");
    expect(actions.filter(a => a.endsWith(".not-applied"))).toEqual([]);
  });
  it("«لست أنا» needs only the owner session (no step-up), and is recorded", async () => {
    const p = await startOwner();
    expect((await approverIn("owner")("deny", ctx.owner.stale.headers, { pairingToken: p.pairingToken })).jsonBody.status).toBe("denied");
    expect((await poll(p)).jsonBody.code).toBe("QR_DENIED");
    expect(ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n).action)).toContain("owner.qr-login.denied");
  });
});

describe("QR-1 the two namespaces never meet (P1-A boundary)", () => {
  it("an owner session cannot approve a teacher / student pairing, and teacher / student sessions cannot approve an owner pairing", async () => {
    const platform = await start();
    expect((await approve(platform, ctx.owner.fresh.headers)).status).toBe(401);
    const ownerPairing = await startOwner();
    expect((await approve(ownerPairing, ctx.teacher)).status).toBe(401);
    expect((await approve(ownerPairing, ctx.student)).status).toBe(401);
    expect(ctx.mem.getJson(lib.pairingName(platform.pairingToken)).status).toBe("pending");
    expect(ctx.mem.getJson(lib.pairingName(ownerPairing.pairingToken, OWNER_QR_PREFIX)).status).toBe("pending");
  });
  it("a pairing of one namespace is unknown to the other (approve and poll)", async () => {
    const ownerPairing = await startOwner();
    expect((await approver("approve", ctx.teacher, { pairingToken: ownerPairing.pairingToken, matchCode: ownerPairing.matchCode })).status).toBe(404);
    expect((await poll({ ...ownerPairing, ns: "platform" })).status).toBe(404);
    const platform = await start();
    expect((await approverIn("owner")("approve", ctx.owner.fresh.headers, { pairingToken: platform.pairingToken, matchCode: platform.matchCode })).status).toBe(404);
    expect((await poll({ ...platform, ns: "owner" })).status).toBe(404);
  });
  it("an approval of a role a namespace does not issue is refused at poll (an owner approval on the platform page)", async () => {
    const p = await start();
    await approve(p, ctx.teacher);
    const name = lib.pairingName(p.pairingToken);
    ctx.mem.setJson(name, { ...ctx.mem.getJson(name), approval: { role: "owner", subject: OWNER_ID, sid: "c".repeat(32), authVersion: 1 } });
    const r = await poll(p);
    expect(r.status).toBe(401);
    expect(r.jsonBody.code).toBe("QR_APPROVAL_INVALID");
  });
  it("the owner QR path is its own fragment", async () => {
    expect((await startOwner()).qrPath).toMatch(/^#\/owner-qr-login\/[A-Za-z0-9_-]{43}$/);
    expect((await start()).qrPath).toMatch(/^#\/qr-login\/[A-Za-z0-9_-]{43}$/);
  });
});
