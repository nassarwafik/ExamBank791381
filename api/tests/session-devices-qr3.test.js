import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ QR-3 — student sessions recorded on the server, and «الأجهزة المرتبطة» for teachers and students
// (design docs/enterprise-qr-login-qr3.md). TEST data only.
//   student sign-in (password or QR) records a session (hash only, device words, via) BEFORE the token exists; the token carries
//   its session id; requireActiveStudentSession accepts it only while recorded; a token from before QR-3 (no session id) runs to
//   its own expiry (owner decision); at most 10 sessions; the devices route lists and ends the CALLER's own sessions only.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "qr3-root-secret-for-tests-only";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.STUDENT_SESSION_SECRET;
delete process.env.OWNER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.BUILDER_PASSWORD;

const { handler: login } = await import("../src/functions/platform-login.js");
const { handler: devices } = await import("../src/functions/session-devices.js");
const { handler: qrLogin } = await import("../src/functions/qr-login.js");
const { handler: qrApprove } = await import("../src/functions/qr-login-approve.js");
const { hashPassword, studentCodeHash, createStudentToken, verifyStudentToken, requireActiveStudentSession } = cjs("../src/lib/student-auth.js");
const { hashSecret } = cjs("../src/lib/identity/password-hash.js");
const { usernameReservationName } = cjs("../src/lib/identity/owner-store.js");
const { teacherAccountName, liveSessions, teacherSessionHash } = cjs("../src/lib/identity/teacher-accounts.js");
const { requireTeacherSession } = cjs("../src/lib/teacher-session.js");
const { verifyManagedTeacherToken } = cjs("../src/lib/identity/teacher-token.js");
const sessionsLib = cjs("../src/lib/identity/student-sessions.js");

const FAST = { N: 16384, r: 8, p: 1, keyLen: 64 };
const TEACHER = "t_00000000000000c1", OTHER_TEACHER = "t_00000000000000c2";
const STUDENT = "u_qr3stu1", OTHER_STUDENT = "u_qr3stu2";
const UA = {
  phone: "Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36",
  laptop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0"
};
let teacherCredential, studentAuth;
beforeAll(async () => {
  teacherCredential = await hashSecret("teacher pass phrase 1", { params: FAST });
  studentAuth = hashPassword("student-pass-1");
});

let mem, deps;
const studentDoc = id => "platform/users/" + id + ".json";
beforeEach(() => {
  mem = createMemoryContainer();
  for (const [id, username] of [[TEACHER, "qr3.teacher"], [OTHER_TEACHER, "qr3.other"]]) {
    mem.setJson(usernameReservationName(username), { schemaVersion: 1, accountId: id, role: "teacher", username });
    mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username, displayName: "معلم", status: "active", credential: teacherCredential, authVersion: 1, sessions: [] });
  }
  for (const [id, code] of [[STUDENT, "QR3S1"], [OTHER_STUDENT, "QR3S2"]]) {
    mem.setJson("platform/auth/" + studentCodeHash(code) + ".json", { userId: id, salt: studentAuth.salt, passwordHash: studentAuth.passwordHash, authVersion: 1, active: true });
    mem.setJson(studentDoc(id), { userId: id, code, displayName: "طالب " + code, role: "student", classId: "c1", authVersion: 1, active: true });
  }
  deps = { getContainer: () => mem.container, clientIdFromRequest: () => "10.9.0.1", reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {}, hashParams: FAST };
});

const headersOf = h => { const m = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v])); return { get: k => m[String(k).toLowerCase()] ?? null }; };
const signIn = async (userCode, password, ua = UA.phone) => {
  const r = await login({ json: async () => ({ userCode, password }), headers: headersOf({ "user-agent": ua }) }, deps);
  expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
  return r.jsonBody.token;
};
const studentIn = (ua) => signIn("QR3S1", "student-pass-1", ua);
const teacherIn = (ua) => signIn("qr3.teacher", "teacher pass phrase 1", ua);
const bearer = token => headersOf({ authorization: "Bearer " + token });
const call = (action, token, body = {}) => devices({ method: "POST", params: { action }, headers: bearer(token), json: async () => body }, deps);
const studentOk = async token => (await requireActiveStudentSession({ headers: bearer(token) }, deps)).ok;
const teacherOk = async token => (await requireTeacherSession({ headers: bearer(token) }, deps)).ok;

describe("QR-3 student sessions are recorded", () => {
  it("a password sign-in records the session (hash only, device words, via) and the token carries its id", async () => {
    const token = await studentIn(UA.phone);
    const claim = verifyStudentToken(token);
    expect(claim.sid).toMatch(/^[a-f0-9]{32}$/);
    const doc = mem.getJson(studentDoc(STUDENT));
    expect(doc.sessions).toHaveLength(1);
    expect(doc.sessions[0]).toMatchObject({ sidHash: sessionsLib.studentSessionHash(claim.sid), via: "login", device: { browser: "Chrome", os: "Android" } });
    expect(JSON.stringify(doc)).not.toContain(claim.sid);
    expect(JSON.stringify(doc)).not.toContain("Pixel");
    expect(await studentOk(token)).toBe(true);
  });
  it("a token whose session is not recorded (or was ended) is refused; a malformed session id never verifies", async () => {
    const token = await studentIn();
    const doc = mem.getJson(studentDoc(STUDENT));
    mem.setJson(studentDoc(STUDENT), { ...doc, sessions: [] });
    expect(await studentOk(token)).toBe(false);
    const forged = createStudentToken(doc, { sid: "a".repeat(32) });           // signed, but never issued
    mem.setJson(studentDoc(STUDENT), doc);
    expect(await studentOk(forged)).toBe(false);
    expect(verifyStudentToken(createStudentToken(doc, { sid: "not-a-session-id" })).sid).toBeUndefined();   // invalid sid is simply not carried
  });
  it("a token from before QR-3 (no session id) keeps working until its own expiry — no sign-out at deployment (pin)", async () => {
    const legacy = createStudentToken(mem.getJson(studentDoc(STUDENT)));
    expect(verifyStudentToken(legacy).sid).toBeUndefined();
    expect(await studentOk(legacy)).toBe(true);
    const listed = await call("list", legacy);
    expect(listed.jsonBody).toMatchObject({ ok: true, role: "student", untracked: true, devices: [] });
    expect((await call("logout", legacy)).jsonBody).toEqual({ ok: true, ended: false, current: true });
  });
  it("at most 10 live sessions: the 11th sign-in ends the oldest", async () => {
    const tokens = [];
    for (let i = 0; i < 11; i++) tokens.push(await studentIn());
    expect(mem.getJson(studentDoc(STUDENT)).sessions).toHaveLength(10);
    expect(await studentOk(tokens[0])).toBe(false);
    expect(await studentOk(tokens[10])).toBe(true);
  });
  it("a password reset (authVersion bump) still ends every session", async () => {
    const token = await studentIn();
    const doc = mem.getJson(studentDoc(STUDENT));
    mem.setJson(studentDoc(STUDENT), { ...doc, authVersion: 2 });
    expect(await studentOk(token)).toBe(false);
  });
});

describe("QR-3 «الأجهزة المرتبطة» — students", () => {
  it("lists the caller's own devices, newest first, marks this one; ending another one signs that device out at once", async () => {
    const phone = await studentIn(UA.phone);
    const laptop = await studentIn(UA.laptop);
    const r = await call("list", phone);
    expect(r.status).toBe(200);
    expect(r.jsonBody.untracked).toBe(false);
    expect(r.jsonBody.devices.map(d => [d.device.browser, d.device.os, d.current, d.via])).toEqual([["Edge", "Windows", false, "login"], ["Chrome", "Android", true, "login"]]);
    const laptopId = r.jsonBody.devices[0].id;
    expect(laptopId).toMatch(/^[a-f0-9]{64}$/);
    expect((await call("end", phone, { id: laptopId })).jsonBody).toEqual({ ok: true, ended: true, current: false });
    expect(await studentOk(laptop)).toBe(false);
    expect(await studentOk(phone)).toBe(true);
    expect((await call("end", phone, { id: laptopId })).status).toBe(404);              // already ended
  });
  it("logout ends this very session (the student's own «تسجيل الخروج»)", async () => {
    const token = await studentIn();
    expect((await call("logout", token)).jsonBody).toEqual({ ok: true, ended: true, current: true });
    expect(await studentOk(token)).toBe(false);
  });
  it("only the caller's OWN sessions: another student's session id is not found, and the body never chooses the account", async () => {
    const mine = await studentIn();
    const theirs = await signIn("QR3S2", "student-pass-1");
    const theirId = sessionsLib.studentSessionHash(verifyStudentToken(theirs).sid);
    const r = await call("end", mine, { id: theirId, sub: OTHER_STUDENT, userId: OTHER_STUDENT });
    expect(r.status).toBe(404);
    expect(await studentOk(theirs)).toBe(true);
  });
});

describe("QR-3 «الأجهزة المرتبطة» — teachers", () => {
  it("lists device words and the origin of each session; ending one refuses it from the next request; audited", async () => {
    const phone = await teacherIn(UA.phone);
    const laptop = await teacherIn(UA.laptop);
    const r = await call("list", phone);
    expect(r.jsonBody.role).toBe("teacher");
    expect(r.jsonBody.devices.map(d => [d.device.os, d.current])).toEqual([["Windows", false], ["Android", true]]);
    expect((await call("end", phone, { id: r.jsonBody.devices[0].id })).jsonBody.ended).toBe(true);
    expect(await teacherOk(laptop)).toBe(false);
    expect(await teacherOk(phone)).toBe(true);
    expect(mem.names("platform/audit/").map(n => mem.getJson(n)).some(e => e && e.action === "teacher.session.device-ended")).toBe(true);
  });
  it("another teacher's session id is not found; a shared-password / BUILDER_USERS session has no device list", async () => {
    const mine = await teacherIn();
    const claimOther = await signIn("qr3.other", "teacher pass phrase 1");
    const otherId = teacherSessionHash(verifyManagedTeacherToken(claimOther).sid);
    expect((await call("end", mine, { id: otherId })).status).toBe(404);
    expect(await teacherOk(claimOther)).toBe(true);
    const legacy = await devices({ method: "POST", params: { action: "list" }, headers: bearer("legacy"), json: async () => ({}) }, { ...deps, requireBuilderAuth: () => ({ ok: true, user: { ver: 2, role: "teacher", sub: "T1", am: "multi-user" } }) });
    expect(legacy.status).toBe(403);
  });
  it("anonymous → 401; unknown action → 404; a malformed id → 404 (nothing written)", async () => {
    expect((await devices({ method: "POST", params: { action: "list" }, headers: headersOf({}), json: async () => ({}) }, deps)).status).toBe(401);
    const t = await teacherIn();
    expect((await call("purge", t)).status).toBe(404);
    const before = JSON.stringify(mem.getJson(teacherAccountName(TEACHER)));
    expect((await call("end", t, { id: "../../x" })).status).toBe(404);
    expect(JSON.stringify(mem.getJson(teacherAccountName(TEACHER)))).toBe(before);
  });
  it("teacher sessions keep the device words from sign-in (fixed vocabulary; a hostile User-Agent stores nothing readable)", async () => {
    await teacherIn("<script>alert(1)</script>");
    const s = liveSessions(mem.getJson(teacherAccountName(TEACHER)), Date.now());
    expect(s[0].device).toEqual({ browser: "unknown", os: "unknown" });
  });
});

describe("QR-3 the QR sign-in records student sessions too", () => {
  it("the new device's session is recorded (via qr, its device words); the approving session is re-checked", async () => {
    const phone = await studentIn(UA.phone);
    const start = (await qrLogin({ method: "POST", params: { action: "start" }, headers: headersOf({ "user-agent": UA.laptop, "x-forwarded-for": "10.9.0.1" }), json: async () => ({}) }, deps)).jsonBody;
    const approve = await qrApprove({ method: "POST", params: { action: "approve" }, headers: bearer(phone), json: async () => ({ pairingToken: start.pairingToken, matchCode: start.matchCode }) }, deps);
    expect(approve.status).toBe(200);
    const r = await qrLogin({ method: "POST", params: { action: "poll" }, headers: headersOf({}), json: async () => ({ pairingToken: start.pairingToken, pollSecret: start.pollSecret }) }, deps);
    expect(r.status).toBe(200);
    const claim = verifyStudentToken(r.jsonBody.token);
    expect(claim.sid).toMatch(/^[a-f0-9]{32}$/);
    const entry = mem.getJson(studentDoc(STUDENT)).sessions.find(s => s.sidHash === sessionsLib.studentSessionHash(claim.sid));
    expect(entry).toMatchObject({ via: "qr", device: { browser: "Edge", os: "Windows" } });
    expect(await studentOk(r.jsonBody.token)).toBe(true);
  });
  it("a phone signed out between approving and the poll cannot open the new device", async () => {
    const phone = await studentIn(UA.phone);
    const start = (await qrLogin({ method: "POST", params: { action: "start" }, headers: headersOf({ "x-forwarded-for": "10.9.0.1" }), json: async () => ({}) }, deps)).jsonBody;
    await qrApprove({ method: "POST", params: { action: "approve" }, headers: bearer(phone), json: async () => ({ pairingToken: start.pairingToken, matchCode: start.matchCode }) }, deps);
    await call("logout", phone);
    const r = await qrLogin({ method: "POST", params: { action: "poll" }, headers: headersOf({}), json: async () => ({ pairingToken: start.pairingToken, pollSecret: start.pollSecret }) }, deps);
    expect(r.status).toBe(401);
    expect(r.jsonBody.code).toBe("APPROVER_SESSION_ENDED");
  });
});
