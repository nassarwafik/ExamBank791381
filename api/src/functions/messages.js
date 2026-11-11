// Tadris+ P11-B — WHICH conversation `studentId` names (owner decision: «محادثة منفصلة لكل معلم»):
//   • the teacher's OWN student → the student's HOME conversation (platform/messages/direct/<studentId>/), exactly as before;
//   • a student the owner ADDED to a class of this teacher (a shared class) → the conversation of THAT class
//     (platform/messages/shared/<classId>/<studentId>/). `conversation=<classId>` beside `studentId` (query on GET, body field on
//     POST) names the class explicitly (needed when the student is in two classes of the same teacher); without it a student who is
//     not the teacher's own resolves to the first class of this teacher's that the student shares. A body `classId` beside
//     `studentId` is still ignored, as before (the browser never chooses the class of a direct message).
// A teacher NEVER reaches a student's conversation with another teacher: the home conversation needs the home-owner check, a shared
// conversation needs a class of the teacher's own that the student currently shares. Anything else answers like a missing student.
// Phase 5C — TEACHER messaging surface (builder-authenticated):
//   GET  /api/messages?studentId=<id>                     → that student's direct conversation (read-only allowed for
//                                                           disabled/archived students and archived classes)
//   GET  /api/messages?classId=<id>&kind=announcements    → that class's announcement history (active OR archived)
//        both reads accept &before=<messageId> (M.3): the older page before that id ({ messages, hasMore })
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
// history stays readable. Messages are append-only (message-store).
//   POST /api/messages { action: "editMessage", studentId | classId, messageId, body }   → M.5: edit THIS teacher's own
//        message / announcement within 15 minutes of sending (while the conversation / class may still receive messages)
//   POST /api/messages { action: "deleteMessage", studentId | classId, messageId }       → M.5: delete this teacher's own
//        message / announcement, or — MODERATION — any STUDENT message of a conversation this teacher may open, at any
//        time (archived / disabled students included). Never another teacher's message. Rules: lib/message-edit.js.
//        Both answer { message } (the stored version; a deleted one is a tombstone without its text) and are audited
//        with ids only, never text. Every message view carries this teacher's display hints (editableUntil / canDelete).
// Phase 6B — after a NEW teacher → student direct message is SAVED (createMessage committed), the student's opted-in
// devices get a Web Push notification (no message content). It is a best-effort side effect with a time budget: a push
// failure, timeout, missing VAPID configuration or no subscription never changes the send response. Nothing else here
// (reads, polling, mark-read, announcements) triggers a push.
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireTeacherSession } = require("../lib/teacher-session");
const { requireCapability } = require("../lib/access/require-capability");   // Tadris+ P3-B
const { getContainer, downloadJsonOrNull, StorageConflictError } = require("../lib/platform-storage");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { recordAuditEvent } = require("../lib/audit-log");
const { resolveTeacherDisplayName } = require("../lib/teacher-profile");
const { notifyStudentOfNewMessage, notifyWithTimeout } = require("../lib/push-notify");
const {
  isSafeId, directPrefix, announcementPrefix, normalizeMessageBody, clampLimit, listRecentMessages,
  messageView, studentDisplayName, DIRECT_HISTORY_LIMIT, ANNOUNCEMENT_HISTORY_LIMIT, MessageContentionError, MESSAGE_ID_RE
} = require("../lib/message-store");
// Messages hardening (M.1): idempotent (clientMessageId) + rate-limited publication, private no-store responses.
const { publishGuarded, noStore } = require("../lib/message-send");
// Messages M.5 — edit / delete / moderation (one CAS on the message blob; the rules live in the lib).
const { MessageChangeError, messageActions, editMessage, deleteMessage, isOwn } = require("../lib/message-edit");
const { reserveMessageSend, rateLimitedResponse } = require("../lib/message-rate-limit");
const {
  MarkReadError, markStreamRead, countUnread, loadMarker, isReadBy, absorbIrrelevantLegacy, absorbIrrelevantSequenced, READER_RELEVANCE, teacherDirectStateName, teacherDirectUnread, combineCounts
} = require("../lib/message-read-state");
// Tadris+ P11-B — a separate conversation with the teacher of every class a student SHARES (lib/shared-conversations.js).
const { teacherSharedStream, teacherSharedUnread } = require("../lib/shared-conversations");
const { isStudentSharedIn, sharedClassIds } = require("../lib/class-membership");

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
// Messages M.4 — finishes pending purges of deleted students' messaging data (one bounded step per poll).
const { drainStudentPurges } = require("../lib/student-messaging-purge");

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
async function directSendState(container, student, dl, sharedClassId = "") {
  // P11-B — a shared class's conversation: `archived` is the HOME roster's lifecycle (it disables the login: read as inactive here),
  // and the class that must be open is the SHARED class.
  if (!sharedClassId && student.archived === true) return { canSend: false, code: "studentArchived", error: MSG.studentArchived, classroom: null };
  if (student.active === false) return { canSend: false, code: "studentInactive", error: MSG.studentInactive, classroom: null };
  const classId = sharedClassId || String(student.classId || "");
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
    const auth = (await requireTeacherSession(request, deps));
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
    // Tadris+ P11-B — the conversation (student[, class]) names for THIS teacher, or null (see the header).
    const conversationOf = async (studentId, wantedClassId = "") => {
      const student = await loadStudent(container, studentId, dl);
      if (!student) return null;
      const home = () => ({ student, sharedClassId: "", streamPrefix: directPrefix(studentId), expected: { kind: "direct", studentId }, include: READER_RELEVANCE.teacherDirect,
        stateName: teacherDirectStateName(teacherId, studentId), meta: { principalRole: "teacher", streamKind: "direct", streamId: studentId, teacherId } });
      const shared = classId => ({ student, sharedClassId: classId, ...teacherSharedStream(teacherId, classId, studentId) });
      const own = await studentAccessible(load, student, tenant);
      const wanted = String(wantedClassId || "");
      if (wanted && wanted !== String(student.classId || "")) return isStudentSharedIn(student, wanted) && (await ownClass(wanted)) ? shared(wanted) : null;
      if (own) return home();
      if (wanted) return null;
      for (const id of sharedClassIds(student)) if (await ownClass(id)) return shared(id);
      return null;
    };
    // M.5 — THIS teacher's permissions on each message, as view hints (the actions decide again on their own).
    const actor = { role: "teacher", id: teacherId };
    const actionsFor = canSend => doc => messageActions(doc, actor, { canSend, now: deps.now ? deps.now() : Date.now() });

    if (request.method === "GET") {
      const capabilityDenial = await requireCapability(auth, "messages.js", "GET", deps, obs);   // Tadris+ P3-B
      if (capabilityDenial) return capabilityDenial;
      const url = new URL(request.url);
      const studentId = String(url.searchParams.get("studentId") || "").trim();
      const classId = String(url.searchParams.get("classId") || "").trim();
      const kind = String(url.searchParams.get("kind") || "").trim();
      // M.3 — older history: `before` is the oldest message id the client shows; anything else is refused.
      const before = url.searchParams.has("before") ? String(url.searchParams.get("before") || "") : "";
      if (url.searchParams.has("before") && !MESSAGE_ID_RE.test(before)) return bad("مؤشر الرسائل غير صالح.");
      // P11-B — a thread request resolves its conversation (home, or a shared class's); every other read keeps the home-owner check.
      let conv = null;
      if (studentId && kind !== "unread-summary") { conv = await conversationOf(studentId, String(url.searchParams.get("conversation") || "").trim()); if (!conv) return notFound(MSG.studentNotFound); }
      else if (tenant && studentId && !(await ownStudent(studentId))) return notFound(MSG.studentNotFound);
      if (tenant && classId && !(await ownClass(classId))) return notFound(MSG.classNotFound);
      // P11-B — the unread replies of shared classes' conversations are counted with the home ones (the teacher's own classes only).
      const withShared = async (homeCount, scope) => {
        const sharedCount = await teacherSharedUnread(container, teacherId, { ...scope, classOk: tenant ? ownClass : null }, deps);
        const total = combineCounts({ unread: homeCount.totalUnread, capped: homeCount.capped }, { unread: sharedCount.totalUnread, capped: sharedCount.capped });
        return { ...homeCount, totalUnread: total.unread, capped: total.capped, ...(homeCount.byStudent ? { byStudent: { ...homeCount.byStudent, ...sharedCount.byStudent } } : {}) };
      };
      if (kind === "unread-summary") {
        // Best-effort and bounded; never affects the summary (a failure leaves the purge pending for a later poll).
        try { await (deps.drainStudentPurges || drainStudentPurges)(container, deps); } catch { /* stays pending */ }
        if (classId) {
          const classroom = await loadClass(container, classId, dl);
          if (!classroom) return notFound(MSG.classNotFound);
          return { status: 200, jsonBody: { ok: true, classId, ...(await withShared(await teacherDirectUnread(container, teacherId, { classId, canSee }, deps), { classId })) } };
        }
        return { status: 200, jsonBody: { ok: true, ...(await withShared(await teacherDirectUnread(container, teacherId, { canSee }, deps), {})) } };
      }
      if (studentId) {
        const student = conv.student;
        const state = await directSendState(container, student, dl, conv.sharedClassId);
        // THIS teacher's legacy read state + relevance shape the page's unread legacy frontier (see listRecentMessages).
        const stateName = conv.stateName;
        const marker = await loadMarker(container, stateName, deps);
        // M.3 — `isRead` covers both domains: the student's unread replies ride along oldest-first (sequenced frontier).
        const page = await listRecentMessages(container, conv.streamPrefix, conv.expected, clampLimit(url.searchParams.get("limit"), DIRECT_HISTORY_LIMIT), deps, { isRead: id => isReadBy(marker, id), include: READER_RELEVANCE.teacherDirect, before });
        // A frontier window of only the teacher's own messages is folded into the boundary (never starves it).
        const meta = conv.meta;
        if (page.absorbable.length) {
          await absorbIrrelevantLegacy(container, { stateName, legacyIds: page.legacyIds, ids: page.absorbable, meta }, deps).catch(() => {});
        }
        if (page.sequencedAbsorbable.length) {
          await absorbIrrelevantSequenced(container, { stateName, streamPrefix: conv.streamPrefix, ids: page.sequencedAbsorbable, meta }, deps).catch(() => {});
        }
        // Tadris+ P5-B3b (owner decision §19.21) — a student moved from another teacher: the conversation BEFORE the transfer stays
        // between the student and that teacher; this teacher sees it from the transfer on (the list is newest-first, so nothing
        // older can follow a hidden message: «hasMore» ends there).
        // (the transfer moment concerns the HOME conversation only; a shared class's conversation was always this class's)
        const since = !conv.sharedClassId && typeof student.directSince === "string" ? student.directSince : "";
        const visible = since ? page.messages.filter(m => String(m.createdAt || "") >= since) : page.messages;
        const hasMore = since && visible.length < page.messages.length ? false : page.hasMore;
        return { status: 200, jsonBody: {
          ok: true,
          student: conv.sharedClassId
            ? { userId: studentId, displayName: studentDisplayName(student), classId: conv.sharedClassId, active: student.active !== false, archived: false, shared: true }
            : { userId: studentId, displayName: studentDisplayName(student), classId: String(student.classId || ""), active: student.active !== false, archived: student.archived === true },
          canSend: state.canSend, readOnlyCode: state.code, readOnlyReason: state.error,
          messages: visible.map(m => messageView(m, { includeStudentId: true, actions: actionsFor(state.canSend) })), hasMore, hasNewer: page.hasNewer
        } };
      }
      if (classId && kind === "announcements") {
        const classroom = await loadClass(container, classId, dl);
        if (!classroom) return notFound(MSG.classNotFound);
        const archived = normalizeClassStatus(classroom) === "archived";
        // The teacher has no read state for announcements (never acknowledged) → no unread legacy frontier.
        const page = await listRecentMessages(container, announcementPrefix(classId), { kind: "announcement", classId }, clampLimit(url.searchParams.get("limit"), ANNOUNCEMENT_HISTORY_LIMIT), deps, { isLegacyRead: () => true, before });
        return { status: 200, jsonBody: {
          ok: true, classroom: classSummary(classroom), canSend: !archived, readOnlyCode: archived ? "classArchived" : "", readOnlyReason: archived ? MSG.classArchived : "",
          messages: page.messages.map(m => messageView(m, { includeClassId: true, actions: actionsFor(!archived) })), hasMore: page.hasMore
        } };
      }
      return bad("حدّد الطالب أو الصف.");
    }

    if (request.method !== "POST") return { status: 405, jsonBody: { ok: false, error: "Method not allowed." } };
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const action = String(body && body.action || "").trim();
    const capabilityDenial = await requireCapability(auth, "messages.js", action, deps, obs);   // Tadris+ P3-B
    if (capabilityDenial) return capabilityDenial;
    // P11-B — an action that names a student acts on the conversation that (studentId[, classId]) resolves to for THIS teacher.
    let conv = null;
    if (body && typeof body === "object") {
      if (body.studentId !== undefined) {
        conv = await conversationOf(String(body.studentId || "").trim(), String(body.conversation || "").trim());
        if (!conv && tenant) return notFound(MSG.studentNotFound);   // single mode: each action answers after its own validation, as before
      }
      if (tenant && body.classId !== undefined && !(await ownClass(String(body.classId || "").trim()))) return notFound(MSG.classNotFound);
    }

    if (action === "sendDirect") {
      const studentId = String(body.studentId || "").trim();
      const text = normalizeMessageBody(body.body);
      if (!text.ok) return bad(text.error);
      if (!conv) return notFound(MSG.studentNotFound);
      const student = conv.student;
      const state = await directSendState(container, student, dl, conv.sharedClassId);
      if (!state.canSend) return readOnly(state.error, state.code);
      const senderDisplayName = await teacherName(container, teacherId);
      const classIdAtSend = conv.sharedClassId || String(state.classroom.classId || student.classId || "");
      const sent = await publishGuarded(container, {
        role: "teacher", senderId: teacherId, streamPrefix: conv.streamPrefix, expected: conv.expected, clientMessageId: body.clientMessageId,
        buildDoc: (messageId, createdAt) => ({
          schemaVersion: 1, messageId, kind: "direct", studentId,
          ...(conv.sharedClassId ? { sharedClassId: conv.sharedClassId } : {}),
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
      return { status: 200, jsonBody: { ok: true, message: messageView(doc, { includeStudentId: true, actions: actionsFor(true) }), ...(sent.replay ? { replay: true } : {}) } };
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
      return { status: 200, jsonBody: { ok: true, message: messageView(doc, { includeClassId: true, actions: actionsFor(true) }), ...(sent.replay ? { replay: true } : {}) } };
    }

    if (action === "editMessage" || action === "deleteMessage") {
      // The stream is the server-authorized conversation (studentId) or class feed (classId) — tenancy checked above.
      const studentId = String(body.studentId || "").trim();
      const classId = String(body.classId || "").trim();
      let target = null;
      if (studentId) {
        if (!conv) return notFound(MSG.studentNotFound);
        const student = conv.student;
        const state = await directSendState(container, student, dl, conv.sharedClassId);
        target = { streamPrefix: conv.streamPrefix, expected: conv.expected, canSend: state.canSend, view: { includeStudentId: true }, targetType: "student", targetId: studentId, targetLabel: studentDisplayName(student), directSince: !conv.sharedClassId && typeof student.directSince === "string" ? student.directSince : "" };
      } else if (classId) {
        const classroom = await loadClass(container, classId, dl);
        if (!classroom) return notFound(MSG.classNotFound);
        target = { streamPrefix: announcementPrefix(classId), expected: { kind: "announcement", classId }, canSend: normalizeClassStatus(classroom) !== "archived", view: { includeClassId: true }, targetType: "class", targetId: classId, targetLabel: String(classroom.name || "") };
      } else return bad("حدّد الطالب أو الصف.");
      const messageId = String(body.messageId || "");
      // Tadris+ P5-B3b — a message from before the student's transfer is not this teacher's to change (answered like a missing one)
      if (studentId && target.directSince) {
        const doc = MESSAGE_ID_RE.test(messageId) ? await dl(container, target.streamPrefix + messageId + ".json") : null;
        if (doc && String(doc.createdAt || "") < target.directSince) return notFound("الرسالة غير موجودة.");
      }
      const common = { streamPrefix: target.streamPrefix, expected: target.expected, messageId, actor, canSend: target.canSend };
      try {
        const r = action === "editMessage"
          ? await editMessage(container, { ...common, body: body.body, reserve: () => (deps.reserveMessageSend || reserveMessageSend)(container, "teacher", teacherId, deps) }, deps)
          : await deleteMessage(container, common, deps);
        if (r.changed) {
          await rec(container, { actor: teacherId, action: action === "editMessage" ? "message.edit" : "message.delete", targetType: target.targetType, targetId: target.targetId, targetLabel: target.targetLabel,
            details: { messageId, kind: target.expected.kind, senderRole: String(r.doc.senderRole), moderation: !isOwn(r.doc, actor) } });
        }
        return { status: 200, jsonBody: { ok: true, message: messageView(r.doc, { ...target.view, actions: actionsFor(target.canSend) }), ...(r.changed ? {} : { unchanged: true }) } };
      } catch (e) {
        if (!(e instanceof MessageChangeError)) throw e;
        if (e.rateLimit) return rateLimitedResponse(e.rateLimit);
        return { status: e.status, jsonBody: { ok: false, code: e.code, error: e.message } };
      }
    }

    if (action === "markDirectRead") {
      // Historical (archived / disabled) students may still be READ; the student document is the authority.
      const studentId = String(body.studentId || "").trim();
      if (!conv) return notFound(MSG.studentNotFound);
      try {
        // The teacher's unread-relevant messages are the STUDENT's; the acknowledgement must be built from those.
        const stream = { streamPrefix: conv.streamPrefix, expected: conv.expected, include: READER_RELEVANCE.teacherDirect };
        const { marker } = await markStreamRead(container, {
          stateName: conv.stateName, ...stream,
          throughMessageId: body.throughMessageId, seenIdsAtBoundary: body.seenIdsAtBoundary,
          legacyThroughMessageId: body.legacyThroughMessageId, legacySeenIdsAtBoundary: body.legacySeenIdsAtBoundary,
          meta: conv.meta
        }, deps);
        // FRESH listing (no `ids`): a student message that arrived after validation is still counted. The teacher's own
        // leading messages are absorbed (M.1) so later badge counts stop re-downloading them.
        const remaining = await countUnread(container, { ...stream, marker, absorb: { stateName: conv.stateName, meta: conv.meta } }, deps);
        return { status: 200, jsonBody: { ok: true, studentId, ...remaining } };
      } catch (e) {
        if (e instanceof MarkReadError) return bad("الرسالة المحددة غير صالحة.");
        throw e;
      }
    }

    return bad("إجراء غير مدعوم.");
  } catch (e) {
    // Losing every stream-position race is a transient conflict: retryable, never a server fault (M.1).
    // M.3 — exhausted compare-and-set retries (a hot marker, limiter bucket or claim) are the same transient conflict.
    if (e instanceof MessageContentionError || e instanceof StorageConflictError || (e && e.name === "StorageConflictError")) { obs?.logWarn("messages.contention", { retryable: true }); return { status: 503, headers: { "Retry-After": "1" }, jsonBody: { ok: false, code: "BUSY", error: "الخادم مشغول بإرسال رسائل أخرى الآن. أعد المحاولة." } }; }
    obs?.logError("messages.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذر معالجة الرسائل حاليًا." } };
  }
}

app.http("messages", { methods: ["GET", "POST"], authLevel: "anonymous", route: "messages", handler: withObservability("messages", handler) });
module.exports = { handler };
