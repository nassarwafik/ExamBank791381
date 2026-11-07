const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { getContainer, downloadJsonOrNull, mutateJsonWithRetry } = require("../lib/platform-storage");
const { recordAuditEvent } = require("../lib/audit-log");
const { TOKEN_TTL_SECONDS } = require("../lib/builder-auth");
const { createManagedTeacherToken, newTeacherSessionId, isTeacherAccountId } = require("../lib/identity/teacher-token");
const { readTeacherAccount, mutateTeacherAccount, withTeacherSession, sessionActive, trialEnded, teacherTrialView } = require("../lib/identity/teacher-accounts");
const { resolveManagedTeacherDisplayName } = require("../lib/teacher-profile");
const { sessionAccess } = require("../lib/access/session-access");
const { schoolField, schoolOfAccount, schoolForStudent } = require("../lib/schools");
const { STUDENT_TOKEN_TTL_SECONDS, createStudentToken, normalizeAuthVersion } = require("../lib/student-auth");
const { PAIRING_PREFIX } = require("../lib/identity/qr-login");
const { newStudentSessionId, withStudentSession, studentSessionActive } = require("../lib/identity/student-sessions");   // Tadris+ QR-3
const { reply, unavailable, notFound, Refusal, startPairing, pollPairing } = require("../lib/identity/qr-pairing");

// Tadris+ QR-1 — the NEW device's side of the QR sign-in for TEACHERS and STUDENTS (design: docs/enterprise-qr-login-qr1.md).
// Route: POST /api/qr-login/{action}. No session: this route is how a session is obtained. (The platform owner has its own pair of
// routes, owner-qr-login / owner-qr-login-approve, and its own pairing namespace: this route never reads owner storage.)
//
//   start → a pairing valid 90 s: { pairingToken, qrPath ("#/qr-login/<token>": a URL fragment), pollSecret, matchCode, … }.
//           Budgeted per client address (token bucket, fail closed). Nothing about any account is read.
//   poll  { pairingToken, pollSecret } → pending | 410 used / denied / expired | 404 unknown or wrong secret
//         | once approved: CONSUMED FIRST (compare-and-set: a second poll, even concurrent, is refused), then the approver is
//           re-checked from storage and an ORDINARY session of its role is issued:
//             teacher → managed account active, with a password, trial not ended, same authVersion, the approving session still
//                       recorded → a new recorded session (via "qr"), re-checked under the same compare-and-set;
//             student → present, active, not archived, same authVersion → a new student session (never resurrects a deleted one).
//         Every refusal after consumption is one generic 401 (with a code): the pairing is spent either way.

async function issueTeacher(container, a, record, deps, obs, nowMs) {
  if (!isTeacherAccountId(a.subject)) throw new Refusal("QR_APPROVAL_INVALID");
  const still = account => Boolean(account && account.status === "active" && account.credential && account.authVersion === a.authVersion && sessionActive(account, a.sid, nowMs));
  const account = await readTeacherAccount(container, a.subject);
  if (!still(account)) throw new Refusal("APPROVER_SESSION_ENDED");
  if (trialEnded(account, nowMs)) throw new Refusal("TEACHER_TRIAL_ENDED");
  // Tadris+ P10-A — recorded in the account BEFORE the token is given (an unrecorded session is refused on every request).
  const sid = newTeacherSessionId();
  const { token, payload } = createManagedTeacherToken({ accountId: account.accountId, sid, authVersion: account.authVersion }, { nowMs });
  let fresh;
  try {
    fresh = await (deps.mutateTeacherAccount || mutateTeacherAccount)(container, account.accountId, current => {
      if (!still(current)) throw new Refusal("APPROVER_SESSION_ENDED");
      if (trialEnded(current, nowMs)) throw new Refusal("TEACHER_TRIAL_ENDED");
      return { ...withTeacherSession(current, { sid, expiresAtMs: payload.exp * 1000, nowMs, via: "qr", device: record.device }), lastLoginAt: new Date(nowMs).toISOString() };
    });
  } catch (e) {
    if (e instanceof Refusal) throw e;
    if (e && e.code === "TEACHER_NOT_FOUND") throw new Refusal("APPROVER_SESSION_ENDED");
    return reply(503, { ok: false, code: "TEACHER_SESSION_UNAVAILABLE", error: "تعذر تسجيل الدخول حاليًا. حاول مرة أخرى بعد قليل." }, { "Retry-After": "5" });
  }
  await (deps.recordAuditEvent || recordAuditEvent)(container, { actor: fresh.accountId, action: "teacher.session.from-qr", targetType: "teacher-account", targetId: fresh.accountId, targetLabel: fresh.username, details: { device: record.device } });
  obs?.logInfo?.("auth.login.succeeded", { role: "teacher", kind: "qr" });
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const displayName = await resolveManagedTeacherDisplayName(container, fresh.accountId, fresh.displayName, deps);
  const access = await sessionAccess({ ver: 3, role: "teacher", am: "managed", sub: fresh.accountId, accessRevisionId: fresh.accessRevisionId || null }, { container, downloadJsonOrNull: dl }, obs);
  const school = await schoolField(() => schoolOfAccount(container, fresh, { downloadJsonOrNull: dl }), obs);
  return reply(200, { ok: true, role: "teacher", token, userCode: fresh.username, displayName, expiresInSeconds: TOKEN_TTL_SECONDS, access, trial: teacherTrialView(fresh, nowMs), ...school });
}

async function issueStudent(container, a, record, deps, obs, nowMs) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(a.subject)) throw new Refusal("QR_APPROVAL_INVALID");
  const name = "platform/users/" + a.subject + ".json";
  const studentSid = newStudentSessionId();
  let fresh;
  try {
    // The student sign-in's rule (QA-5): the stamp is written onto the student document as it is NOW; a student deleted, archived,
    // disabled or whose password was reset since the approval is refused.
    fresh = await (deps.mutateJsonWithRetry || mutateJsonWithRetry)(container, name, current => {
      if (!current || current.active === false || current.archived === true || normalizeAuthVersion(current.authVersion) !== a.authVersion) throw new Refusal("APPROVER_SESSION_ENDED");
      // Tadris+ QR-3 — the approving session must still be recorded (a phone signed out in between cannot open a new device).
      if (a.sid !== undefined && !studentSessionActive(current, a.sid, nowMs)) throw new Refusal("APPROVER_SESSION_ENDED");
      const at = new Date(nowMs).toISOString();
      // ... and the new device's session is RECORDED before its token exists (via "qr", the device words its QR page saw).
      return withStudentSession({ ...current, lastLoginAt: at, updatedAt: at }, { sid: studentSid, expiresAtMs: nowMs + STUDENT_TOKEN_TTL_SECONDS * 1000, nowMs, via: "qr", device: record.device });
    });
  } catch (e) {
    if (e instanceof Refusal) throw e;
    return unavailable();
  }
  const token = createStudentToken(fresh, { sid: studentSid });
  obs?.logInfo?.("auth.login.succeeded", { role: "student", kind: "qr" });
  const school = await schoolField(() => schoolForStudent(container, fresh, { downloadJsonOrNull: deps.downloadJsonOrNull || downloadJsonOrNull }), obs);
  return reply(200, { ok: true, role: "student", token, userCode: fresh.code, displayName: fresh.displayName, expiresInSeconds: STUDENT_TOKEN_TTL_SECONDS, ...school });
}

async function handler(request, deps = {}, obs = null) {
  const method = String(request.method || "POST").toUpperCase();
  const action = String(request.params?.action || "").toLowerCase();
  if (method !== "POST" || (action !== "start" && action !== "poll")) return notFound();
  const nowMs = deps.now ? deps.now() : Date.now();
  try {
    const container = deps.container || (deps.getContainer || getContainer)();
    if (action === "start") return await startPairing({ container, request, deps, nowMs, prefix: PAIRING_PREFIX, qrPathPrefix: "#/qr-login/" });
    const issuers = {
      teacher: (a, record) => issueTeacher(container, a, record, deps, obs, nowMs),
      student: (a, record) => issueStudent(container, a, record, deps, obs, nowMs)
    };
    return await pollPairing({ container, request, deps, nowMs, prefix: PAIRING_PREFIX, issuers, obs });
  } catch (e) {
    obs?.logError?.("auth.qr.error", e, { action });
    return unavailable();
  }
}

app.http("qrLogin", { methods: ["POST"], authLevel: "anonymous", route: "qr-login/{action?}", handler: withObservability("qr-login", handler) });
module.exports = { handler };
