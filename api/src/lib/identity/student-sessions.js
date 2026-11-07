const crypto = require("crypto");
const { safeDevice } = require("./qr-login");

// Tadris+ QR-3 — every NEW student session is recorded in the student document (design docs/enterprise-qr-login-qr3.md), like the
// managed teacher sessions of P10-A:
//   student.sessions: [{ sidHash, createdAtMs, expiresAtMs, via, device }]   (only a hash of the session id is ever stored)
// A student token carrying a session id (`sid`) is accepted only while that id is recorded and unexpired, so ONE device can be
// signed out («الأجهزة المرتبطة») without a password reset. At most 10 live sessions: a new sign-in ends the oldest.
// A token issued BEFORE this change carries no `sid`: it is accepted until its own expiry (at most 12 hours), exactly as before
// (owner decision, QR-3) — no student is signed out by the deployment.

const MAX_STUDENT_SESSIONS = 10;
const SID_RE = /^[a-f0-9]{32}$/;
const SESSION_VIA = new Set(["login", "qr"]);

const studentSessionHash = sid => crypto.createHash("sha256").update("tadris-student-session|" + String(sid), "utf8").digest("hex");
const newStudentSessionId = () => crypto.randomBytes(16).toString("hex");
const validStudentSessionId = sid => typeof sid === "string" && SID_RE.test(sid);

/** The student's recorded sessions that are well formed and not expired at nowMs, oldest first. */
function liveStudentSessions(student, nowMs) {
  const list = Array.isArray(student && student.sessions) ? student.sessions : [];
  return list
    .filter(s => s && typeof s.sidHash === "string" && /^[0-9a-f]{64}$/.test(s.sidHash) && Number.isFinite(Number(s.expiresAtMs)) && Number(s.expiresAtMs) > nowMs && Number.isFinite(Number(s.createdAtMs)))
    .sort((a, b) => Number(a.createdAtMs) - Number(b.createdAtMs));
}

/** Whether session `sid` was issued for this student and is still live. */
function studentSessionActive(student, sid, nowMs) {
  if (!validStudentSessionId(sid)) return false;
  const h = studentSessionHash(sid);
  return liveStudentSessions(student, nowMs).some(s => s.sidHash === h);
}

/** The student with session `sid` recorded (expired ones dropped; beyond 10, the oldest ended). */
function withStudentSession(student, { sid, expiresAtMs, nowMs, via, device }) {
  if (!validStudentSessionId(sid) || !Number.isFinite(Number(expiresAtMs))) throw new Error("A recorded student session needs its id and its expiry.");
  const h = studentSessionHash(sid);
  const list = liveStudentSessions(student, nowMs).filter(s => s.sidHash !== h);
  const entry = { sidHash: h, createdAtMs: nowMs, expiresAtMs: Number(expiresAtMs), via: SESSION_VIA.has(via) ? via : "login" };
  const d = safeDevice(device);
  if (d) entry.device = d;
  list.push(entry);
  return { ...student, sessions: list.slice(-MAX_STUDENT_SESSIONS) };
}

/** The student without the session whose hash is `sidHash` (expired ones dropped). */
function withoutStudentSessionHash(student, sidHash, nowMs) {
  return { ...student, sessions: liveStudentSessions(student, nowMs).filter(s => s.sidHash !== sidHash) };
}

module.exports = {
  MAX_STUDENT_SESSIONS, studentSessionHash, newStudentSessionId, validStudentSessionId, liveStudentSessions, studentSessionActive,
  withStudentSession, withoutStudentSessionHash
};
