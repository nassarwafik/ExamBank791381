// Phase 6D — the student's UNIFIED in-app notification center (hardened student session):
//   GET  /api/student-notifications?view=unread         → { messages, events, bell } counts (lightweight; the 15 s poll)
//   GET  /api/student-notifications[?view=notifications] → { items[], messages, events, bell } (newest first, bounded)
//   POST /api/student-notifications { action: "markEventRead", eventId }   → acknowledge ONE non-message event
// `messages` is EXACTLY the Phase 5D message summary (the ✉️ badge — message unread only); `events` = non-message
// unread; `bell` (🔔) = messages + events, capped at 99+. Messages are acknowledged ONLY by the Student Messages page
// (/api/student-messages markRead) — this endpoint never touches a message marker. Every GET is read-only.
// Identity and scope come ONLY from requireActiveStudentSession (the CURRENT persisted student document → its current
// class): a body/query studentId / classId is never read. An event id from another student's or another class's stream
// never validates (the id is bound to its stream), and a class event whose subject is no longer visible (a hidden
// module, an unpublished assignment) can neither be listed nor acknowledged. A failure here never logs anyone out: the
// portal's /api/student-dashboard stays the only session authority.
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { downloadJsonOrNull } = require("../lib/platform-storage");
const { isSafeId } = require("../lib/message-store");
const { notificationContext, unifiedSummary, unifiedView, resolveOwnEvent } = require("../lib/notification-center");
const { markEventPositionRead } = require("../lib/notification-events");

const CLASS_PREFIX = "platform/classes/";

async function currentClassroom(container, student, dl) {
  const classId = String(student.classId || "");
  if (!isSafeId(classId)) return null;
  const doc = await dl(container, CLASS_PREFIX + classId + ".json");
  return doc && typeof doc === "object" ? doc : null;
}

async function handler(request, deps = {}, obs = null) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  try {
    const sess = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
    if (!sess.ok) return sess.response;
    const container = sess.container, student = sess.student;
    if (!isSafeId(String(student.userId || ""))) return { status: 401, jsonBody: { ok: false, error: "Unauthorized" } };
    const classroom = await currentClassroom(container, student, dl);
    const ctx = await notificationContext(container, student, classroom, deps);

    if (request.method === "GET") {
      const view = new URL(request.url).searchParams.get("view");
      if (view === "unread") return { status: 200, jsonBody: { ok: true, ...(await unifiedSummary(container, ctx, deps)) } };
      return { status: 200, jsonBody: { ok: true, ...(await unifiedView(container, ctx, deps)) } };
    }

    if (request.method !== "POST") return { status: 405, jsonBody: { ok: false, error: "Method not allowed." } };
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    if (String(body && body.action || "") !== "markEventRead") return { status: 400, jsonBody: { ok: false, error: "إجراء غير مدعوم." } };
    const target = await resolveOwnEvent(container, ctx, body.eventId, deps);
    if (!target) return { status: 400, jsonBody: { ok: false, error: "الإشعار المحدد غير صالح." } };
    try {
      await markEventPositionRead(container, ctx.studentId, target.stream.key, target.position, deps);
    } catch (e) {
      if (e && e.httpStatus) return { status: e.httpStatus, jsonBody: { ok: false, error: "تعذر تحديث حالة الإشعار." } };
      throw e;
    }
    // FRESH counts after the write (a newer event that arrived meanwhile is still unread and still counted).
    return { status: 200, jsonBody: { ok: true, eventId: String(body.eventId), ...(await unifiedSummary(container, ctx, deps)) } };
  } catch (e) {
    obs?.logError("student.notifications.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذر تحميل الإشعارات حاليًا." } };
  }
}

app.http("studentNotifications", { methods: ["GET", "POST"], authLevel: "anonymous", route: "student-notifications", handler: withObservability("student-notifications", handler) });
module.exports = { handler };
