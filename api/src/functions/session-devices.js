const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { getContainer, mutateJsonWithRetry } = require("../lib/platform-storage");
const { recordAuditEvent } = require("../lib/audit-log");
const { requireTeacherSession } = require("../lib/teacher-session");
const { requireActiveStudentSession, requireStudentAuth } = require("../lib/student-auth");
const { readTeacherAccount, mutateTeacherAccount, liveSessions, teacherSessionHash } = require("../lib/identity/teacher-accounts");
const { liveStudentSessions, studentSessionHash, withoutStudentSessionHash } = require("../lib/identity/student-sessions");
const { safeDevice } = require("../lib/identity/qr-login");

// Tadris+ QR-3 — «الأجهزة المرتبطة»: the caller's OWN signed-in devices (design docs/enterprise-qr-login-qr3.md).
// Route: POST /api/session-devices/{action}   (a managed teacher session or a student session; anonymous → 401 before storage)
//
//   list            → { role, devices: [{ id, via, device, createdAt, expiresAt, current }], untracked }
//                     `id` is the stored SHA-256 of the session id (never the id itself); `untracked` = this very session predates
//                     QR-3 (a student token without a session id), so it cannot be listed or ended alone (owner decision: it runs
//                     to its own expiry).
//   end { id }      → that one session of the caller's own account ends now (refused from its next request). 404 when it is not
//                     one of the caller's live sessions. Ending the current one is the same as signing out.
//   logout          → the caller's current session ends (a student's «تسجيل الخروج»; teachers keep /api/teacher-session/logout).
//
// The account is ALWAYS the verified session subject (ownerOf: never a value from the body); `id` only picks among that account's
// own sessions. The owner's sessions are not here (owner decision, QR-3). A shared-password / BUILDER_USERS teacher session is not
// recorded on the server, so it has no device list (403 DEVICES_UNSUPPORTED).

const NO_STORE = { "Cache-Control": "no-store", "Pragma": "no-cache" };
const reply = (status, body, extra = {}) => ({ status, headers: { ...NO_STORE, ...extra }, jsonBody: body });
const unavailable = () => reply(503, { ok: false, code: "DEVICES_UNAVAILABLE", error: "تعذر تنفيذ الطلب حاليًا. حاول مرة أخرى." }, { "Retry-After": "5" });
const unauthorized = () => reply(401, { ok: false, code: "SESSION_REQUIRED", error: "سجّل الدخول أولًا." });
const notFound = () => reply(404, { ok: false, code: "DEVICE_NOT_FOUND", error: "لم يعد هذا الجهاز مرتبطًا بحسابك." });
const ID_RE = /^[a-f0-9]{64}$/;
const VIA = new Set(["login", "qr", "owner-handoff"]);

/** The caller's own account, from its verified session only. */
async function ownerOf(request, deps) {
  if (requireStudentAuth(request).ok) {
    const auth = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
    if (!auth.ok) return { ok: false, response: unauthorized() };
    const sid = auth.user.sid;
    return { ok: true, role: "student", subject: String(auth.user.sub), currentHash: typeof sid === "string" ? studentSessionHash(sid) : null, container: auth.container, student: auth.student };
  }
  const auth = await requireTeacherSession(request, deps);
  if (!auth.ok) return { ok: false, response: auth.response || unauthorized() };
  if (auth.user.am !== "managed") return { ok: false, response: reply(403, { ok: false, code: "DEVICES_UNSUPPORTED", error: "قائمة الأجهزة متاحة لحسابات المعلمين الخاصة فقط." }) };
  return { ok: true, role: "teacher", subject: String(auth.user.sub), currentHash: teacherSessionHash(String(auth.user.sid)), container: null };
}

const view = (s, currentHash) => ({
  id: s.sidHash, via: VIA.has(s.via) ? s.via : "login", device: safeDevice(s.device),
  createdAt: new Date(Number(s.createdAtMs)).toISOString(), expiresAt: new Date(Number(s.expiresAtMs)).toISOString(), current: s.sidHash === currentHash
});

class Gone extends Error {}

async function handler(request, deps = {}, obs = null) {
  const caller = await ownerOf(request, deps);
  if (!caller.ok) return caller.response;
  const method = String(request.method || "POST").toUpperCase();
  const action = String(request.params?.action || "").toLowerCase();
  if (method !== "POST" || !["list", "end", "logout"].includes(action)) return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
  const nowMs = deps.now ? deps.now() : Date.now();
  let body = {};
  try { const b = await request.json(); body = b && typeof b === "object" ? b : {}; } catch { body = {}; }
  const studentName = "platform/users/" + caller.subject + ".json";

  try {
    const container = caller.container || deps.container || (deps.getContainer || getContainer)();

    if (action === "list") {
      if (caller.role === "teacher") {
        const account = await readTeacherAccount(container, caller.subject);
        if (!account) return unauthorized();
        return reply(200, { ok: true, role: "teacher", devices: liveSessions(account, nowMs).map(s => view(s, caller.currentHash)).reverse(), untracked: false });
      }
      // the student document the session check has just read (current, active, same credential version)
      return reply(200, { ok: true, role: "student", devices: liveStudentSessions(caller.student, nowMs).map(s => view(s, caller.currentHash)).reverse(), untracked: caller.currentHash === null });
    }

    const target = action === "logout" ? caller.currentHash : String(body.id || "");
    if (action === "logout" && !target) return reply(200, { ok: true, ended: false, current: true });     // a pre-QR-3 session: nothing recorded to end
    if (!ID_RE.test(target)) return notFound();
    const isCurrent = target === caller.currentHash;
    try {
      if (caller.role === "teacher") {
        await (deps.mutateTeacherAccount || mutateTeacherAccount)(container, caller.subject, a => {
          const live = liveSessions(a, nowMs);
          if (!live.some(s => s.sidHash === target)) throw new Gone();
          const { revokedSessions, ...rest } = a;   // eslint-disable-line no-unused-vars
          return { ...rest, sessions: live.filter(s => s.sidHash !== target) };
        });
      } else {
        await (deps.mutateJsonWithRetry || mutateJsonWithRetry)(container, studentName, current => {
          if (!current || !liveStudentSessions(current, nowMs).some(s => s.sidHash === target)) throw new Gone();
          return withoutStudentSessionHash(current, target, nowMs);
        });
      }
    } catch (e) {
      if (e instanceof Gone || (e && e.code === "TEACHER_NOT_FOUND")) return notFound();
      throw e;
    }
    if (caller.role === "teacher") {
      await (deps.recordAuditEvent || recordAuditEvent)(container, { actor: caller.subject, action: isCurrent ? "teacher.session.logout" : "teacher.session.device-ended", targetType: "teacher-account", targetId: caller.subject, details: { current: isCurrent } });
    }
    obs?.logInfo?.("auth.devices.ended", { role: caller.role, current: isCurrent });
    return reply(200, { ok: true, ended: true, current: isCurrent });
  } catch (e) {
    obs?.logError?.("auth.devices.error", e, { action });
    return unavailable();
  }
}

app.http("sessionDevices", { methods: ["POST"], authLevel: "anonymous", route: "session-devices/{action?}", handler: withObservability("session-devices", handler) });
module.exports = { handler };
