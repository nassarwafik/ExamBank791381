// Tadris+ P11-B — a student who is ALSO in a class of another teacher (student.sharedClasses) has one conversation PER TEACHER
// (owner decision: «محادثة منفصلة لكل معلم»): the HOME conversation below, unchanged, and one conversation — a direct thread with that
// class's teacher plus that class's announcements — for every shared class whose document exists.
//   `conversation=<classId>` (query on GET, body field on POST) selects ONE shared class of the student's OWN (anything else: 404);
//   without it the request is about the home conversation, exactly as before. Every read, send, edit, delete and acknowledgement then
//   acts on the selected conversation's streams only — a message can never land in, or be read from, another conversation.
//   The unread summary (?view=unread, and the one returned after markRead): `directUnread` / `announcementUnread` are the SELECTED
//   conversation's own counts (its two tabs), `totalUnread` is the total across ALL the student's conversations (the portal's badge);
//   with more than one conversation the answer carries `conversations` [{ id, name, home, archived, unread, … }] for the switcher.
//   Each conversation follows the messaging service of ITS teacher (P7-B1); with the home teacher's messaging off, a request that
//   names no conversation opens the first one that is on.
// The legacy `classId` / `studentId` body fields are still ignored.
// Phase 5C — STUDENT messaging surface (hardened student session):
//   GET  /api/student-messages                      → { direct, announcements, classroom, canSend, ... }
//   GET  /api/student-messages?stream=direct|announcements&before=<messageId>  → M.3: that stream's older page
//   POST /api/student-messages { action: "sendDirect", body }
//   POST /api/student-messages { action: "editMessage", messageId, body }   → M.5: the student's OWN reply, within 15
//        minutes of sending, while they may still send (lib/message-edit.js)
//   POST /api/student-messages { action: "deleteMessage", messageId }       → M.5: the same rule; always the student's
//        own direct stream (a teacher's message or an announcement can never be changed from here)
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
  isSafeId, normalizeMessageBody, listRecentMessages, messageView,
  studentDisplayName, DIRECT_HISTORY_LIMIT, ANNOUNCEMENT_HISTORY_LIMIT, MessageContentionError, MESSAGE_ID_RE
} = require("../lib/message-store");
// Messages hardening (M.1): idempotent (clientMessageId) + rate-limited replies, private no-store responses.
const { publishGuarded, noStore } = require("../lib/message-send");
// Messages M.5 — edit / delete of the student's own replies (one CAS on the message blob; the rules live in the lib).
const { MessageChangeError, messageActions, editMessage, deleteMessage } = require("../lib/message-edit");
const { reserveMessageSend, rateLimitedResponse } = require("../lib/message-rate-limit");
const {
  MarkReadError, markStreamRead, countUnread, loadMarker, isReadBy, absorbIrrelevantLegacy, absorbIrrelevantSequenced
} = require("../lib/message-read-state");
// Phase 6D: the stream/summary helpers moved (unchanged) into the shared lib so the unified notification center reuses
// the SAME message unread authority instead of re-implementing it.
const { recentNotifications, studentStreams, loadStreamMarkers, unreadSummary } = require("../lib/student-notifications");
// Tadris+ P7-B1 — the messaging service follows the access of the student's teacher (lib/access/student-services.js): a teacher
// without messages.inbox.read (while the owner enforces access) has no messaging for their students — every read and write here is
// refused (403 SERVICE_NOT_AVAILABLE; 503 when it cannot be decided). Nothing stored is changed or deleted.
const { requireStudentService } = require("../lib/access/student-services");
// Tadris+ P11-B — one conversation per shared class (lib/shared-conversations.js).
const { studentSharedStreams, sharedClassesOf } = require("../lib/shared-conversations");
const { combineCounts } = require("../lib/message-read-state");
const { resolveTeacherDisplayName } = require("../lib/teacher-profile");

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
    const homeClassroom = await currentClassroom(container, student, dl);
    const params = request.method === "GET" ? new URL(request.url).searchParams : null;
    let body = {};
    if (request.method === "POST") { try { body = await request.json(); } catch { body = {}; } if (!body || typeof body !== "object") body = {}; }
    // P11-B — the student's conversations: the home one first, then one per shared class. Each follows ITS teacher's messaging
    // service (P7-B1): `denial` is the refusal to answer with when that conversation is the one asked for.
    const conversations = [{ id: "", home: true, classId: homeClassroom ? String(student.classId) : "", classroom: homeClassroom,
      streams: studentStreams(studentId, homeClassroom ? String(student.classId) : ""), denial: await requireStudentService(container, student, "messages", deps, obs) }];
    for (const sharedClass of await sharedClassesOf(container, student, { ...deps, downloadJsonOrNull: dl })) {
      const subject = { ...student };                                   // the service of THIS class's teacher, not the home teacher's
      delete subject.ownerId;
      if (typeof sharedClass.classroom.ownerId === "string" && sharedClass.classroom.ownerId) subject.ownerId = sharedClass.classroom.ownerId;
      conversations.push({ id: sharedClass.classId, home: false, classId: sharedClass.classId, classroom: sharedClass.classroom, streams: studentSharedStreams(studentId, sharedClass.classId),
        denial: await requireStudentService(container, subject, "messages", deps, obs, { classroom: sharedClass.classroom }) });
    }
    const wanted = String((params ? params.get("conversation") : body.conversation) || "").trim();
    const selected = wanted
      ? conversations.find(c => !c.home && c.id === wanted) || null
      : (conversations[0].denial && conversations.find(c => !c.denial)) || conversations[0];
    if (!selected) return { status: 404, jsonBody: { ok: false, code: "CONVERSATION_NOT_FOUND", error: "المحادثة غير موجودة." } };
    if (selected.denial) return selected.denial;
    const classroom = selected.classroom;
    const state = sendState(classroom);
    const streams = selected.streams;
    const open = conversations.filter(c => !c.denial);
    // The unread summary: the SELECTED conversation's two counts + the total across EVERY open conversation (one conversation:
    // exactly the summary it always was).
    const unreadAcross = async (options = {}) => {
      const parts = [];
      for (const c of open) parts.push(await unreadSummary(container, c.streams, deps, null, options));
      const own = parts[open.indexOf(selected)];
      const total = combineCounts(...parts.map(x => ({ unread: x.totalUnread, capped: x.totalCapped })));
      return { summary: { directUnread: own.directUnread, announcementUnread: own.announcementUnread, totalUnread: total.unread, totalCapped: total.capped }, parts };
    };
    // The switcher's list — only when there is more than one conversation (a student of one class gets the answer it always got).
    const conversationList = async (parts, withTeacher = false) => {
      if (open.length < 2) return {};
      const list = [];
      for (let i = 0; i < open.length; i++) {
        const c = open[i], sum = combineCounts(parts[i].directUnread, parts[i].announcementUnread);
        const teacherId = c.home ? String(student.ownerId || (c.classroom && c.classroom.ownerId) || "") : String((c.classroom && c.classroom.ownerId) || "");
        list.push({ id: c.id, home: c.home, selected: c === selected, name: String((c.classroom && c.classroom.name) || ""), archived: !!c.classroom && normalizeClassStatus(c.classroom) === "archived",
          unread: sum.unread, capped: sum.capped, ...(withTeacher && teacherId ? { teacherName: await (deps.resolveTeacherDisplayName || resolveTeacherDisplayName)(container, teacherId, deps) } : {}) });
      }
      return { conversations: list };
    };
    // M.5 — the student's permissions on each DIRECT message (display hints; announcements carry none).
    const actor = { role: "student", id: studentId };
    const directView = doc => messageView(doc, { actions: d => messageActions(d, actor, { canSend: state.canSend, now: deps.now ? deps.now() : Date.now() }) });

    if (request.method === "GET") {
      const view = params.get("view");
      if (view === "unread") {
        // The badge poll also folds the student's own leading replies into their boundary (M.1, changes no count).
        const all = await unreadAcross({ absorb: true });
        return { status: 200, jsonBody: { ok: true, ...all.summary, ...(await conversationList(all.parts)) } };
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
        const meta = { principalRole: "student", streamKind: which === "direct" ? "direct" : "announcement", streamId: which === "direct" ? studentId : String(selected.classId), ...(selected.home ? {} : { sharedClassId: selected.id }) };
        if (p.absorbable.length) {
          await absorbIrrelevantLegacy(container, { stateName: s.stateName, legacyIds: p.legacyIds, ids: p.absorbable, meta }, deps).catch(() => {});
        }
        if (p.sequencedAbsorbable.length) {
          await absorbIrrelevantSequenced(container, { stateName: s.stateName, streamPrefix: s.streamPrefix, ids: p.sequencedAbsorbable, meta }, deps).catch(() => {});
        }
        return p;
      };
      const classId = classroom ? String(selected.classId) : "";
      // M.3 — older history of ONE stream: ?stream=direct|announcements&before=<oldest shown id> → { messages, hasMore }.
      if (params.has("stream") || params.has("before")) {
        const which = params.get("stream") === "direct" ? "direct" : params.get("stream") === "announcements" && classId ? "announcements" : "";
        const before = String(params.get("before") || "");
        if (!which || !MESSAGE_ID_RE.test(before)) return { status: 400, jsonBody: { ok: false, error: "طلب الرسائل غير صالح." } };
        const older = await page(streams[which], which, which === "direct" ? DIRECT_HISTORY_LIMIT : ANNOUNCEMENT_HISTORY_LIMIT, before);
        return { status: 200, jsonBody: { ok: true, stream: which, messages: older.messages.map(m => (which === "direct" ? directView(m) : messageView(m))), hasMore: older.hasMore } };
      }
      const direct = await page(streams.direct, "direct", DIRECT_HISTORY_LIMIT);
      const announcements = classId ? await page(streams.announcements, "announcements", ANNOUNCEMENT_HISTORY_LIMIT) : { messages: [], hasMore: false, hasNewer: false };
      return { status: 200, jsonBody: {
        ok: true,
        direct: direct.messages.map(directView),
        announcements: announcements.messages.map(m => messageView(m)),
        directHasMore: direct.hasMore, directHasNewer: direct.hasNewer,
        announcementsHasMore: announcements.hasMore, announcementsHasNewer: announcements.hasNewer,
        classroom: classroom ? { classId, name: String(classroom.name || ""), archived: normalizeClassStatus(classroom) === "archived" } : null,
        canSend: state.canSend, readOnlyCode: state.code, readOnlyReason: state.error,
        ...(open.length > 1 ? { conversation: selected.id, ...(await conversationList((await unreadAcross()).parts, true)) } : {})
      } };
    }

    if (request.method !== "POST") return { status: 405, jsonBody: { ok: false, error: "Method not allowed." } };
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
          meta: { principalRole: "student", streamKind: which === "direct" ? "direct" : "announcement", streamId: which === "direct" ? studentId : String(selected.classId), ...(selected.home ? {} : { sharedClassId: selected.id }) }
        }, deps);
        // FRESH listing (no `ids`): a message that arrived after validation is still counted.
        const own = await countUnread(container, { streamPrefix: s.streamPrefix, expected: s.expected, include: s.include, marker }, deps);
        const all = await unreadAcross();
        return { status: 200, jsonBody: { ok: true, stream: which, ...own, ...all.summary, ...(await conversationList(all.parts)) } };
      } catch (e) {
        if (e instanceof MarkReadError) return { status: 400, jsonBody: { ok: false, error: "الرسالة المحددة غير صالحة." } };
        throw e;
      }
    }
    if (action === "editMessage" || action === "deleteMessage") {
      // Only the student's own direct stream; a body studentId / classId / stream is never read.
      const common = { streamPrefix: streams.direct.streamPrefix, expected: streams.direct.expected, messageId: String(body.messageId || ""), actor, canSend: state.canSend };
      try {
        const r = action === "editMessage"
          ? await editMessage(container, { ...common, body: body.body, reserve: () => (deps.reserveMessageSend || reserveMessageSend)(container, "student", studentId, deps) }, deps)
          : await deleteMessage(container, common, deps);
        return { status: 200, jsonBody: { ok: true, message: directView(r.doc), ...(r.changed ? {} : { unchanged: true }) } };
      } catch (e) {
        if (!(e instanceof MessageChangeError)) throw e;
        if (e.rateLimit) return rateLimitedResponse(e.rateLimit);
        return { status: e.status, jsonBody: { ok: false, code: e.code, error: e.message } };
      }
    }
    // Sending: sendDirect is the ONLY send action. studentId / classId / recipient* / sender* in the body are never read.
    if (action !== "sendDirect") return { status: 400, jsonBody: { ok: false, error: "إجراء غير مدعوم." } };
    const text = normalizeMessageBody(body.body);
    if (!text.ok) return { status: 400, jsonBody: { ok: false, error: text.error } };
    if (!state.canSend) return { status: 403, jsonBody: { ok: false, error: state.error, code: state.code } };
    const sent = await publishGuarded(container, {
      role: "student", senderId: studentId, streamPrefix: streams.direct.streamPrefix, expected: streams.direct.expected, clientMessageId: body.clientMessageId,
      buildDoc: (messageId, createdAt) => ({
        schemaVersion: 1, messageId, kind: "direct", studentId,
        ...(selected.home ? {} : { sharedClassId: selected.id }),
        senderRole: "student", senderId: studentId, senderDisplayName: studentDisplayName(student),
        body: text.body, createdAt, classIdAtSend: String(selected.home ? student.classId || "" : selected.id)
      })
    }, deps);
    if (sent.response) return sent.response;
    return { status: 200, jsonBody: { ok: true, message: directView(sent.doc), ...(sent.replay ? { replay: true } : {}) } };
  } catch (e) {
    // M.3 — exhausted compare-and-set retries (a hot marker, limiter bucket or claim) are the same transient conflict.
    if (e instanceof MessageContentionError || e instanceof StorageConflictError || (e && e.name === "StorageConflictError")) { obs?.logWarn("student.messages.contention", { retryable: true }); return { status: 503, headers: { "Retry-After": "1" }, jsonBody: { ok: false, code: "BUSY", error: "الخادم مشغول بإرسال رسائل أخرى الآن. أعد المحاولة." } }; }
    obs?.logError("student.messages.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذر تحميل الرسائل حاليًا." } };
  }
}

app.http("studentMessages", { methods: ["GET", "POST"], authLevel: "anonymous", route: "student-messages", handler: withObservability("student-messages", handler) });
module.exports = { handler };
