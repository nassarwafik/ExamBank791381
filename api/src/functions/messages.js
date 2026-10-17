// Phase 5C — TEACHER messaging surface (builder-authenticated):
//   GET  /api/messages?studentId=<id>                     → that student's direct conversation (read-only allowed for
//                                                           disabled/archived students and archived classes)
//   GET  /api/messages?classId=<id>&kind=announcements    → that class's announcement history (active OR archived)
//   POST /api/messages { action: "sendDirect", studentId, body }
//   POST /api/messages { action: "sendAnnouncement", classId, body }
//   GET  /api/messages?kind=unread-summary[&classId=<id>]  → Phase 5D: THIS teacher's unread STUDENT replies (global
//                                                           badge; with classId also per student — membership from the
//                                                           CURRENT student documents)
//   POST /api/messages { action: "markDirectRead", studentId, throughMessageId, seenIdsAtBoundary[, legacyThroughMessageId, legacySeenIdsAtBoundary] }  → Phase 5D: THIS
//                                                           teacher's snapshot acknowledgement (latest STUDENT message
//                                                           shown + the student ids at its ms in that snapshot), validated
//                                                           against that student's stream; monotonic. Not audited.
// Identity is ALWAYS server-derived: the teacher is the verified token subject and the display name comes from the
// teacher profile (resolveTeacherDisplayName). Body fields such as teacherId / senderId / senderName / messageId /
// createdAt are ignored. A NEW message requires an active, non-archived student whose CURRENT class (from the
// persisted student document — never a browser classId) is active; announcements require an active class. Archived
// history stays readable. Messages are append-only (message-store), never edited or deleted.
// Phase 6B — after a NEW teacher → student direct message is SAVED (createMessage committed), the student's opted-in
// devices get a Web Push notification (no message content). It is a best-effort side effect with a time budget: a push
// failure, timeout, missing VAPID configuration or no subscription never changes the send response. Nothing else here
// (reads, polling, mark-read, announcements) triggers a push.
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer, downloadJsonOrNull } = require("../lib/platform-storage");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { recordAuditEvent } = require("../lib/audit-log");
const { resolveTeacherDisplayName } = require("../lib/teacher-profile");
const { notifyStudentOfNewMessage, notifyWithTimeout } = require("../lib/push-notify");
const {
  isSafeId, directPrefix, announcementPrefix, normalizeMessageBody, clampLimit, listRecentMessages,
  messageView, studentDisplayName, DIRECT_HISTORY_LIMIT, ANNOUNCEMENT_HISTORY_LIMIT, MessageContentionError
} = require("../lib/message-store");
// Messages hardening (M.1): idempotent (clientMessageId) + rate-limited publication, private no-store responses.
const { publishGuarded, noStore } = require("../lib/message-send");
const {
  MarkReadError, markStreamRead, countUnread, loadMarker, isReadBy, absorbIrrelevantLegacy, READER_RELEVANCE, teacherDirectStateName, teacherDirectUnread
} = require("../lib/message-read-state");

const USER_PREFIX = "platform/users/";
const CLASS_PREFIX = "platform/classes/";
const bad = error => ({ status: 400, jsonBody: { ok: false, error } });
const notFound = error => ({ status: 404, jsonBody: { ok: false, error } });
const readOnly = (error, code) => ({ status: 403, jsonBody: { ok: false, error, code } });

const MSG = {
  studentNotFound: "الطالب غير موجود.",
  classNotFound: "الصف غير موجود.",
  studentArchived: "هذا الطالب مؤرشف. المحادثة السابقة متاحة للقراءة فقط.",
  studentInactive: "حساب هذا الطالب معطّل. المحادثة السابقة متاحة للقراءة فقط.",
  classArchived: "هذا الصف مؤرشف. الرسائل السابقة متاحة للقراءة فقط.",
  noClass: "الطالب غير مسجل في صف نشط."
};

// Phase 21G.0 — teacher tenancy: a teacher messages only their own students and classes.
const { tenantOf, classAccessible, studentAccessible } = require("../lib/teacher-tenancy");

async function loadStudent(container, studentId, dl) {
  if (!isSafeId(studentId)) return null;
  const doc = await dl(container, USER_PREFIX + studentId + ".json");
  return doc && doc.role === "student" && String(doc.userId || "") === studentId ? doc : null;
}
async function loadClass(container, classId, dl) {
  if (!isSafeId(classId)) return null;
  const doc = await dl(container, CLASS_PREFIX + classId + ".json");
  return doc && typeof doc === "object" ? doc : null;
}

/** Whether a NEW direct message may be sent to this student right now (and why not). Authority: the persisted
 *  student document + its CURRENT class document. */
async function directSendState(container, student, dl) {
  if (student.archived === true) return { canSend: false, code: "studentArchived", error: MSG.studentArchived, classroom: null };
  if (student.active === false) return { canSend: false, code: "studentInactive", error: MSG.studentInactive, classroom: null };
  const classId = String(student.classId || "");
  const classroom = classId ? await loadClass(container, classId, dl) : null;
  if (!classroom) return { canSend: false, code: "noClass", error: MSG.noClass, classroom: null };
  if (normalizeClassStatus(classroom) === "archived") return { canSend: false, code: "classArchived", error: MSG.classArchived, classroom };
  return { canSend: true, code: "", error: "", classroom };
}

const classSummary = classroom => classroom ? { classId: String(classroom.classId || ""), name: String(classroom.name || ""), status: normalizeClassStatus(classroom) } : null;

async function handler(request, deps = {}, obs = null) {
  return noStore(await handle(request, deps, obs));
}

async function handle(request, deps = {}, obs = null) {
  // One read per document per request: the tenancy checks, the send state and the unread summary's per-student class
  // checks reuse it (M.1 — the summary used to reload the same class document once per student).
  const rawDl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const readCache = new Map();
  const dl = (c, name) => { if (!readCache.has(name)) readCache.set(name, rawDl(c, name)); return readCache.get(name); };
  // Audit is secondary — a recorder failure must never fail the send; the body is never part of an audit event.
  const rawRec = deps.recordAuditEvent || recordAuditEvent;
  const rec = async (c, ev) => { try { await rawRec(c, ev); } catch { /* audit is secondary */ } };
  const teacherName = deps.resolveTeacherDisplayName || resolveTeacherDisplayName;
  try {
    const auth = (deps.requireBuilderAuth || requireBuilderAuth)(request);
    if (!auth.ok) return auth.response;
    const teacherId = String(auth.user && auth.user.sub || "");
    if (!teacherId) return { status: 401, jsonBody: { ok: false, error: "Unauthorized" } };
    const container = deps.container || (deps.getContainer || getContainer)();
    const tenant = tenantOf(auth.user);
    const load = name => dl(container, name);
    // Phase 21G.0 — the student / class a request names must be the teacher's own; another teacher's answers like a missing one.
    const ownStudent = async id => (await studentAccessible(load, await loadStudent(container, id, dl), tenant));
    const ownClass = id => classAccessible(load, id, tenant);
    const canSee = tenant ? user => studentAccessible(load, user, tenant) : null;

    if (request.method === "GET") {
      const url = new URL(request.url);
      const studentId = String(url.searchParams.get("studentId") || "").trim();
      const classId = String(url.searchParams.get("classId") || "").trim();
      const kind = String(url.searchParams.get("kind") || "").trim();
      if (tenant && studentId && !(await ownStudent(studentId))) return notFound(MSG.studentNotFound);
      if (tenant && classId && !(await ownClass(classId))) return notFound(MSG.classNotFound);
      if (kind === "unread-summary") {
        if (classId) {
          const classroom = await loadClass(container, classId, dl);
          if (!classroom) return notFound(MSG.classNotFound);
          return { status: 200, jsonBody: { ok: true, classId, ...(await teacherDirectUnread(container, teacherId, { classId, canSee }, deps)) } };
        }
        return { status: 200, jsonBody: { ok: true, ...(await teacherDirectUnread(container, teacherId, { canSee }, deps)) } };
      }
      if (studentId) {
        const student = await loadStudent(container, studentId, dl);
        if (!student) return notFound(MSG.studentNotFound);
        const state = await directSendState(container, student, dl);
        // THIS teacher's legacy read state + relevance shape the page's unread legacy frontier (see listRecentMessages).
        const stateName = teacherDirectStateName(teacherId, studentId);
        const marker = await loadMarker(container, stateName, deps);
        const page = await listRecentMessages(container, directPrefix(studentId), { kind: "direct", studentId }, clampLimit(url.searchParams.get("limit"), DIRECT_HISTORY_LIMIT), deps, { isLegacyRead: id => isReadBy(marker, id), include: READER_RELEVANCE.teacherDirect });
        // A frontier window of only the teacher's own legacy messages is folded into the boundary (never starves it).
        if (page.absorbable.length) {
          await absorbIrrelevantLegacy(container, { stateName, legacyIds: page.legacyIds, ids: page.absorbable, meta: { principalRole: "teacher", streamKind: "direct", streamId: studentId, teacherId } }, deps).catch(() => {});
        }
        return { status: 200, jsonBody: {
          ok: true,
          student: { userId: studentId, displayName: studentDisplayName(student), classId: String(student.classId || ""), active: student.active !== false, archived: student.archived === true },
          canSend: state.canSend, readOnlyCode: state.code, readOnlyReason: state.error,
          messages: page.messages.map(m => messageView(m, { includeStudentId: true })), hasMore: page.hasMore
        } };
      }
      if (classId && kind === "announcements") {
        const classroom = await loadClass(container, classId, dl);
        if (!classroom) return notFound(MSG.classNotFound);
        const archived = normalizeClassStatus(classroom) === "archived";
        // The teacher has no read state for announcements (never acknowledged) → no unread legacy frontier.
        const page = await listRecentMessages(container, announcementPrefix(classId), { kind: "announcement", classId }, clampLimit(url.searchParams.get("limit"), ANNOUNCEMENT_HISTORY_LIMIT), deps, { isLegacyRead: () => true });
        return { status: 200, jsonBody: {
          ok: true, classroom: classSummary(classroom), canSend: !archived, readOnlyCode: archived ? "classArchived" : "", readOnlyReason: archived ? MSG.classArchived : "",
          messages: page.messages.map(m => messageView(m, { includeClassId: true })), hasMore: page.hasMore
        } };
      }
      return bad("حدّد الطالب أو الصف.");
    }

    if (request.method !== "POST") return { status: 405, jsonBody: { ok: false, error: "Method not allowed." } };
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const action = String(body && body.action || "").trim();
    if (tenant && body && typeof body === "object") {
      if (body.studentId !== undefined && !(await ownStudent(String(body.studentId || "").trim()))) return notFound(MSG.studentNotFound);
      if (body.classId !== undefined && !(await ownClass(String(body.classId || "").trim()))) return notFound(MSG.classNotFound);
    }

    if (action === "sendDirect") {
      const studentId = String(body.studentId || "").trim();
      const text = normalizeMessageBody(body.body);
      if (!text.ok) return bad(text.error);
      const student = await loadStudent(container, studentId, dl);
      if (!student) return notFound(MSG.studentNotFound);
      const state = await directSendState(container, student, dl);
      if (!state.canSend) return readOnly(state.error, state.code);
      const senderDisplayName = await teacherName(container, teacherId);
      const classIdAtSend = String(state.classroom.classId || student.classId || "");
      const sent = await publishGuarded(container, {
        role: "teacher", senderId: teacherId, streamPrefix: directPrefix(studentId), expected: { kind: "direct", studentId }, clientMessageId: body.clientMessageId,
        buildDoc: (messageId, createdAt) => ({
          schemaVersion: 1, messageId, kind: "direct", studentId,
          senderRole: "teacher", senderId: teacherId, senderDisplayName,
          body: text.body, createdAt, classIdAtSend
        })
      }, deps);
      if (sent.response) return sent.response;
      const doc = sent.doc;
      if (!sent.replay) {                                                 // a replayed retry was already audited / pushed
        await rec(container, { actor: teacherId, action: "message.sendDirect", targetType: "student", targetId: studentId, targetLabel: studentDisplayName(student), details: { classId: classIdAtSend, messageId: doc.messageId } });
        // Push is secondary to the saved message: bounded in time and never able to fail the send.
        try { await notifyWithTimeout((deps.notifyStudentOfNewMessage || notifyStudentOfNewMessage)(container, studentId, deps, obs)); }
        catch { /* never reached: notify is total; kept as a last guard */ }
      }
      return { status: 200, jsonBody: { ok: true, message: messageView(doc, { includeStudentId: true }), ...(sent.replay ? { replay: true } : {}) } };
    }

    if (action === "sendAnnouncement") {
      const classId = String(body.classId || "").trim();
      const text = normalizeMessageBody(body.body);
      if (!text.ok) return bad(text.error);
      const classroom = await loadClass(container, classId, dl);
      if (!classroom) return notFound(MSG.classNotFound);
      if (normalizeClassStatus(classroom) === "archived") return readOnly(MSG.classArchived, "classArchived");
      const senderDisplayName = await teacherName(container, teacherId);
      const sent = await publishGuarded(container, {
        role: "teacher", senderId: teacherId, streamPrefix: announcementPrefix(classId), expected: { kind: "announcement", classId }, clientMessageId: body.clientMessageId,
        buildDoc: (messageId, createdAt) => ({
          schemaVersion: 1, messageId, kind: "announcement", classId,
          senderRole: "teacher", senderId: teacherId, senderDisplayName,
          body: text.body, createdAt
        })
      }, deps);
      if (sent.response) return sent.response;
      const doc = sent.doc;
      if (!sent.replay) await rec(container, { actor: teacherId, action: "message.sendAnnouncement", targetType: "class", targetId: classId, targetLabel: String(classroom.name || ""), details: { messageId: doc.messageId } });
      return { status: 200, jsonBody: { ok: true, message: messageView(doc, { includeClassId: true }), ...(sent.replay ? { replay: true } : {}) } };
    }

    if (action === "markDirectRead") {
      // Historical (archived / disabled) students may still be READ; the student document is the authority.
      const studentId = String(body.studentId || "").trim();
      const student = await loadStudent(container, studentId, dl);
      if (!student) return notFound(MSG.studentNotFound);
      try {
        // The teacher's unread-relevant messages are the STUDENT's; the acknowledgement must be built from those.
        const stream = { streamPrefix: directPrefix(studentId), expected: { kind: "direct", studentId }, include: READER_RELEVANCE.teacherDirect };
        const { marker } = await markStreamRead(container, {
          stateName: teacherDirectStateName(teacherId, studentId), ...stream,
          throughMessageId: body.throughMessageId, seenIdsAtBoundary: body.seenIdsAtBoundary,
          legacyThroughMessageId: body.legacyThroughMessageId, legacySeenIdsAtBoundary: body.legacySeenIdsAtBoundary,
          meta: { principalRole: "teacher", streamKind: "direct", streamId: studentId, teacherId }
        }, deps);
        // FRESH listing (no `ids`): a student message that arrived after validation is still counted. The teacher's own
        // leading messages are absorbed (M.1) so later badge counts stop re-downloading them.
        const remaining = await countUnread(container, { ...stream, marker, absorb: { stateName: teacherDirectStateName(teacherId, studentId), meta: { principalRole: "teacher", streamKind: "direct", streamId: studentId, teacherId } } }, deps);
        return { status: 200, jsonBody: { ok: true, studentId, ...remaining } };
      } catch (e) {
        if (e instanceof MarkReadError) return bad("الرسالة المحددة غير صالحة.");
        throw e;
      }
    }

    return bad("إجراء غير مدعوم.");
  } catch (e) {
    // Losing every stream-position race is a transient conflict: retryable, never a server fault (M.1).
    if (e instanceof MessageContentionError) { obs?.logWarn("messages.contention", { retryable: true }); return { status: 503, headers: { "Retry-After": "1" }, jsonBody: { ok: false, code: "BUSY", error: "الخادم مشغول بإرسال رسائل أخرى الآن. أعد المحاولة." } }; }
    obs?.logError("messages.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذر معالجة الرسائل حاليًا." } };
  }
}

app.http("messages", { methods: ["GET", "POST"], authLevel: "anonymous", route: "messages", handler: withObservability("messages", handler) });
module.exports = { handler };
