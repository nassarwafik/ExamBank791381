const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { getContainer } = require("../lib/platform-storage");
const { recordAuditEvent } = require("../lib/audit-log");
const { requireTeacherSession } = require("../lib/teacher-session");
const { requireActiveStudentSession, requireStudentAuth, normalizeAuthVersion } = require("../lib/student-auth");
const { PAIRING_PREFIX, validApproval } = require("../lib/identity/qr-login");
const { reply, unavailable, notFound, bodyOf, pendingPairing, inspectResponse, numberMatches, decide } = require("../lib/identity/qr-pairing");

// Tadris+ QR-1 — the SIGNED-IN device's side of the QR sign-in for TEACHERS and STUDENTS (design: docs/enterprise-qr-login-qr1.md).
// Route: POST /api/qr-login-approve/{action}   (a teacher or student session; anonymous → 401 before any storage access)
//
//   inspect { pairingToken }             → what is asking: { device: { browser, os }, sameNetwork, matchOptions: [3 numbers], … }
//                                          (read-only: nothing is written)
//   approve { pairingToken, matchCode }  → the pending pairing is bound to THIS caller's verified identity. The user must pick the
//                                          number shown beside the QR: a wrong number CLOSES the pairing (no second guess).
//   deny    { pairingToken }             → the pairing is closed («لست أنا»).
//
// Only the caller's own identity is ever bound (approverOf: the verified session subject, never a value from the body), so a caller
// can sign in another device as THEMSELVES only. A legacy / shared-password / BUILDER_USERS teacher session (not recorded on the
// server, so it cannot be ended one by one) cannot approve.

const unauthorized = () => reply(401, { ok: false, code: "SESSION_REQUIRED", error: "سجّل الدخول أولًا على هذا الجهاز." });
const unsupported = () => reply(403, { ok: false, code: "QR_ROLE_UNSUPPORTED", error: "الدخول بالرمز متاح لحسابات المعلمين الخاصة وللطلاب. ادخل باسم المستخدم وكلمة المرور." });

/** The verified identity of the caller, from its OWN session only: a student token or a managed teacher session. */
async function approverOf(request, deps) {
  // Each role's token has its own signing context: a student token never verifies as a teacher one, and the reverse.
  if (requireStudentAuth(request).ok) {
    const auth = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
    if (!auth.ok) return { ok: false, response: unauthorized() };
    // Tadris+ QR-3 — the approving session id (a token from before QR-3 has none) is re-checked when the new device is signed in.
    const approval = { role: "student", subject: String(auth.user.sub), authVersion: normalizeAuthVersion(auth.student.authVersion) };
    if (auth.user.sid !== undefined) approval.sid = String(auth.user.sid);
    return { ok: true, approval, container: auth.container };
  }
  const auth = await requireTeacherSession(request, deps);
  if (!auth.ok) return { ok: false, response: auth.response || unauthorized() };
  if (auth.user.am !== "managed") return { ok: false, response: unsupported() };
  return { ok: true, approval: { role: "teacher", subject: String(auth.user.sub), sid: String(auth.user.sid), authVersion: Number(auth.user.av) }, container: null };
}

async function handler(request, deps = {}, obs = null) {
  const caller = await approverOf(request, deps);
  if (!caller.ok) return caller.response;
  const method = String(request.method || "POST").toUpperCase();
  const action = String(request.params?.action || "").toLowerCase();
  if (method !== "POST" || !["inspect", "approve", "deny"].includes(action)) return notFound();
  if (!validApproval(caller.approval)) return unsupported();
  const nowMs = deps.now ? deps.now() : Date.now();
  const body = await bodyOf(request);
  const { role, subject } = caller.approval;
  try {
    const container = caller.container || deps.container || (deps.getContainer || getContainer)();
    const pending = await pendingPairing({ container, deps, nowMs, prefix: PAIRING_PREFIX, token: body.pairingToken });
    if (pending.response) return pending.response;
    const { name, record } = pending;
    if (action === "inspect") return inspectResponse({ record, request, deps, role });

    const matched = action === "approve" && numberMatches(record, body.matchCode);
    const outcome = action === "deny" ? "denied" : matched ? "approved" : "match-failed";
    const response = await decide({ container, deps, nowMs, name, record, approval: matched ? caller.approval : null, closedReason: action === "deny" ? "USER_DENIED" : "MATCH_FAILED" });
    if (role === "teacher" && (response.status === 200 || response.status === 409)) {
      await (deps.recordAuditEvent || recordAuditEvent)(container, { actor: subject, action: "teacher.qr-login." + outcome, targetType: "teacher-account", targetId: subject, details: { device: record.device } });
    }
    obs?.logInfo?.("auth.qr." + outcome, { role, status: response.status });
    return response;
  } catch (e) {
    obs?.logError?.("auth.qr.approve_error", e, { action });
    return unavailable();
  }
}

app.http("qrLoginApprove", { methods: ["POST"], authLevel: "anonymous", route: "qr-login-approve/{action?}", handler: withObservability("qr-login-approve", handler) });
module.exports = { handler };
