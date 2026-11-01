const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { getContainer } = require("../lib/platform-storage");
const { requireTeacherSession } = require("../lib/teacher-session");
const { mutateTeacherAccount, withRevokedSession } = require("../lib/identity/teacher-accounts");

// Tadris+ P2-A2 — a teacher signs out on the SERVER. Route: POST /api/teacher-session/logout   (teacher session)
//
//   managed account (token v3) → this session id is ended in the account (the same token is refused from the next request)
//   existing teacher session (v2 / legacy, no session id) → nothing can be revoked server-side; { revoked: false } and the
//                                                           browser forgets the token as before
// Only the caller's own session is ever touched (the account id is the verified token subject).

const NO_STORE = { "Cache-Control": "no-store", "Pragma": "no-cache" };

async function revokeTeacherSession(container, accountId, sid, expMs, nowMs, deps = {}) {
  await (deps.mutateTeacherAccount || mutateTeacherAccount)(container, accountId, a => ({ ...a, revokedSessions: withRevokedSession(a, sid, expMs, nowMs) }));
}

async function handler(request, deps = {}, obs = null) {
  const auth = await requireTeacherSession(request, deps);
  if (!auth.ok) return auth.response;
  const action = String(request.params?.action || "").toLowerCase();
  if (String(request.method || "POST").toUpperCase() !== "POST" || action !== "logout") return { status: 404, headers: NO_STORE, jsonBody: { ok: false, error: "غير موجود." } };
  if (auth.user.am !== "managed") return { status: 200, headers: NO_STORE, jsonBody: { ok: true, revoked: false } };
  const nowMs = deps.now ? deps.now() : Date.now();
  try {
    const container = deps.container || (deps.getContainer || getContainer)();
    await revokeTeacherSession(container, auth.user.sub, auth.user.sid, Number(auth.user.exp) * 1000, nowMs, deps);
    return { status: 200, headers: NO_STORE, jsonBody: { ok: true, revoked: true } };
  } catch (e) {
    obs?.logError("teacher.session.logout_error", e);
    return { status: 503, headers: { ...NO_STORE, "Retry-After": "5" }, jsonBody: { ok: false, code: "TEACHER_SESSION_UNAVAILABLE", error: "تعذر تسجيل الخروج من الخادم حاليًا." } };
  }
}

app.http("teacherSessionEnd", { methods: ["POST"], authLevel: "anonymous", route: "teacher-session/{action?}", handler: withObservability("teacher-session", handler) });
module.exports = { handler, revokeTeacherSession };
