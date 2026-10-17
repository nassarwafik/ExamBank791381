// Phase 5C — STUDENT messaging surface (hardened student session):
//   GET  /api/student-messages                      → { direct, announcements, classroom, canSend, ... }
//   GET  /api/student-messages?stream=direct|announcements&before=<messageId>  → M.3: that stream's older page
//   POST /api/student-messages { action: "sendDirect", body }
//   GET  /api/student-messages?view=unread          → Phase 5D: { directUnread, announcementUnread, totalUnread, ... }
//   GET  /api/student-messages?view=notifications   → Phase 6C: { items[], ...the same unread summary } (READ-ONLY; see
//        lib/student-notifications.js — never marks anything read, never absorbs legacy ids)
//   POST /api/student-messages { action: "markRead", stream: "direct" | "announcements", throughMessageId, seenIdsAtBoundary[, legacyThroughMessageId, legacySeenIdsAtBoundary] }
//        (a snapshot acknowledgement: the latest unread-relevant message shown — TEACHER messages for direct, any
//        announcement — plus the relevant ids at its millisecond in THAT snapshot; validated server-side)
// Phase 5D read state: the student's OWN direct stream and the CURRENT class's announcements only (both derived from the
// persisted student document — never a request id). Reading/marking still works in an archived class (read-only for
// sending only). Direct unread = TEACHER messages; announcement unread = every valid announcement of the current class.
// EVERYTHING is derived from requireActiveStudentSession (the CURRENT persisted student document): the student id,
// display name and class. There is no query/body parameter that selects another student, another class or another
// recipient — a body studentId / classId / recipient / senderName is ignored, and there is NO announcement or
// student-to-student action. The direct thread is the student's own (platform/messages/direct/<own id>/); the
// announcement feed is the CURRENT class's only. An archived class keeps its history readable but refuses new
// replies. A messaging error never touches the portal session (the dashboard remains the session authority).
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { downloadJsonOrNull, StorageConflictError } = require("../lib/platform-storage");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const {
  isSafeId, directPrefix, normalizeMessageBody, listRecentMessages, messageView,
  studentDisplayName, DIRECT_HISTORY_LIMIT, ANNOUNCEMENT_HISTORY_LIMIT, MessageContentionError, MESSAGE_ID_RE
} = require("../lib/message-store");
// Messages hardening (M.1): idempotent (clientMessageId) + rate-limited replies, private no-store responses.
const { publishGuarded, noStore } = require("../lib/message-send");
const {
  MarkReadError, markStreamRead, countUnread, loadMarker, isReadBy, absorbIrrelevantLegacy, absorbIrrelevantSequenced
} = require("../lib/message-read-state");
// Phase 6D: the stream/summary helpers moved (unchanged) into the shared lib so the unified notification center reuses
// the SAME message unread authority instead of re-implementing it.
const { recentNotifications, studentStreams, loadStreamMarkers, unreadSummary } = require("../lib/student-notifications");

const CLASS_PREFIX = "platform/classes/";
const CLASS_ARCHIVED = "هذا الصف مؤرشف. الرسائل السابقة متاحة للقراءة فقط.";
const NO_CLASS = "لا يمكنك إرسال رسائل لأنك غير مسجل في صف نشط.";

async function currentClassroom(container, student, dl) {
  const classId = String(student.classId || "");
  if (!isSafeId(classId)) return null;
  const doc = await dl(container, CLASS_PREFIX + classId + ".json");
  return doc && typeof doc === "object" ? doc : null;
}

function sendState(classroom) {
  if (!classroom) return { canSend: false, code: "noClass", error: NO_CLASS };
  if (normalizeClassStatus(classroom) === "archived") return { canSend: false, code: "classArchived", error: CLASS_ARCHIVED };
  return { canSend: true, code: "", error: "" };
}

async function handler(request, deps = {}, obs = null) {
  return noStore(await handle(request, deps, obs));
}

async function handle(request, deps = {}, obs = null) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  try {
    const sess = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
    if (!sess.ok) return sess.response;
    const container = sess.container, student = sess.student;
    const studentId = String(student.userId || "");
    if (!isSafeId(studentId)) return { status: 401, jsonBody: { ok: false, error: "Unauthorized" } };
    const classroom = await currentClassroom(container, student, dl);
    const state = sendState(classroom);
    const streams = studentStreams(studentId, classroom ? String(student.classId) : "");

    if (request.method === "GET") {
      const params = new URL(request.url).searchParams;
      const view = params.get("view");
      if (view === "unread") {
        // The badge poll also folds the student's own leading replies into their boundary (M.1, changes no count).
        return { status: 200, jsonBody: { ok: true, ...(await unreadSummary(container, streams, deps, null, { absorb: true })) } };
      }
      if (view === "notifications") {
        // Phase 6C — items and counts from ONE set of loaded markers, so the panel and the badge agree.
        const markers = await loadStreamMarkers(container, streams, deps);
        const items = await recentNotifications(container, streams, markers, deps);
        return { status: 200, jsonBody: { ok: true, items, ...(await unreadSummary(container, streams, deps, markers)) } };
      }
      // THIS student's read state + relevance shape each page's unread frontiers (legacy and, M.3, sequenced — see
      // listRecentMessages); a frontier window of only the student's own messages is folded into the boundary.
      const page = async (s, which, limit, before = "") => {
        const marker = await loadMarker(container, s.stateName, deps);
        const p = await listRecentMessages(container, s.streamPrefix, s.expected, limit, deps, { isRead: id => isReadBy(marker, id), include: s.include, before });
        const meta = { principalRole: "student", streamKind: which === "direct" ? "direct" : "announcement", streamId: which === "direct" ? studentId : String(student.classId) };
        if (p.absorbable.length) {
          await absorbIrrelevantLegacy(container, { stateName: s.stateName, legacyIds: p.legacyIds, ids: p.absorbable, meta }, deps).catch(() => {});
        }
        if (p.sequencedAbsorbable.length) {
          await absorbIrrelevantSequenced(container, { stateName: s.stateName, streamPrefix: s.streamPrefix, ids: p.sequencedAbsorbable, meta }, deps).catch(() => {});
        }
        return p;
      };
      const classId = classroom ? String(student.classId) : "";
      // M.3 — older history of ONE stream: ?stream=direct|announcements&before=<oldest shown id> → { messages, hasMore }.
      if (params.has("stream") || params.has("before")) {
        const which = params.get("stream") === "direct" ? "direct" : params.get("stream") === "announcements" && classId ? "announcements" : "";
        const before = String(params.get("before") || "");
        if (!which || !MESSAGE_ID_RE.test(before)) return { status: 400, jsonBody: { ok: false, error: "طلب الرسائل غير صالح." } };
        const older = await page(streams[which], which, which === "direct" ? DIRECT_HISTORY_LIMIT : ANNOUNCEMENT_HISTORY_LIMIT, before);
        return { status: 200, jsonBody: { ok: true, stream: which, messages: older.messages.map(m => messageView(m)), hasMore: older.hasMore } };
      }
      const direct = await page(streams.direct, "direct", DIRECT_HISTORY_LIMIT);
      const announcements = classId ? await page(streams.announcements, "announcements", ANNOUNCEMENT_HISTORY_LIMIT) : { messages: [], hasMore: false, hasNewer: false };
      return { status: 200, jsonBody: {
        ok: true,
        direct: direct.messages.map(m => messageView(m)),
        announcements: announcements.messages.map(m => messageView(m)),
        directHasMore: direct.hasMore, directHasNewer: direct.hasNewer,
        announcementsHasMore: announcements.hasMore, announcementsHasNewer: announcements.hasNewer,
        classroom: classroom ? { classId, name: String(classroom.name || ""), archived: normalizeClassStatus(classroom) === "archived" } : null,
        canSend: state.canSend, readOnlyCode: state.code, readOnlyReason: state.error
      } };
    }

    if (request.method !== "POST") return { status: 405, jsonBody: { ok: false, error: "Method not allowed." } };
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const action = String(body && body.action || "").trim();
    if (action === "markRead") {
      // Only the server-derived streams; a body studentId / classId / teacherId / recipient is never read.
      const which = body.stream === "direct" ? "direct" : body.stream === "announcements" ? "announcements" : "";
      const s = which ? streams[which] : null;
      if (!s) return { status: 400, jsonBody: { ok: false, error: "القسم المحدد غير صالح." } };
      try {
        const { marker } = await markStreamRead(container, {
          stateName: s.stateName, streamPrefix: s.streamPrefix, expected: s.expected, include: s.include,
          throughMessageId: body.throughMessageId, seenIdsAtBoundary: body.seenIdsAtBoundary,
          legacyThroughMessageId: body.legacyThroughMessageId, legacySeenIdsAtBoundary: body.legacySeenIdsAtBoundary,
          meta: { principalRole: "student", streamKind: which === "direct" ? "direct" : "announcement", streamId: which === "direct" ? studentId : String(student.classId) }
        }, deps);
        // FRESH listing (no `ids`): a message that arrived after validation is still counted.
        const own = await countUnread(container, { streamPrefix: s.streamPrefix, expected: s.expected, include: s.include, marker }, deps);
        return { status: 200, jsonBody: { ok: true, stream: which, ...own, ...(await unreadSummary(container, streams, deps)) } };
      } catch (e) {
        if (e instanceof MarkReadError) return { status: 400, jsonBody: { ok: false, error: "الرسالة المحددة غير صالحة." } };
        throw e;
      }
    }
    // Sending: sendDirect is the ONLY send action. studentId / classId / recipient* / sender* in the body are never read.
    if (action !== "sendDirect") return { status: 400, jsonBody: { ok: false, error: "إجراء غير مدعوم." } };
    const text = normalizeMessageBody(body.body);
    if (!text.ok) return { status: 400, jsonBody: { ok: false, error: text.error } };
    if (!state.canSend) return { status: 403, jsonBody: { ok: false, error: state.error, code: state.code } };
    const sent = await publishGuarded(container, {
      role: "student", senderId: studentId, streamPrefix: directPrefix(studentId), expected: { kind: "direct", studentId }, clientMessageId: body.clientMessageId,
      buildDoc: (messageId, createdAt) => ({
        schemaVersion: 1, messageId, kind: "direct", studentId,
        senderRole: "student", senderId: studentId, senderDisplayName: studentDisplayName(student),
        body: text.body, createdAt, classIdAtSend: String(student.classId || "")
      })
    }, deps);
    if (sent.response) return sent.response;
    return { status: 200, jsonBody: { ok: true, message: messageView(sent.doc), ...(sent.replay ? { replay: true } : {}) } };
  } catch (e) {
    // M.3 — exhausted compare-and-set retries (a hot marker, limiter bucket or claim) are the same transient conflict.
    if (e instanceof MessageContentionError || e instanceof StorageConflictError || (e && e.name === "StorageConflictError")) { obs?.logWarn("student.messages.contention", { retryable: true }); return { status: 503, headers: { "Retry-After": "1" }, jsonBody: { ok: false, code: "BUSY", error: "الخادم مشغول بإرسال رسائل أخرى الآن. أعد المحاولة." } }; }
    obs?.logError("student.messages.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذر تحميل الرسائل حاليًا." } };
  }
}

app.http("studentMessages", { methods: ["GET", "POST"], authLevel: "anonymous", route: "student-messages", handler: withObservability("student-messages", handler) });
module.exports = { handler };
