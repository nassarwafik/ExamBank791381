// Tadris+ P7-B1 — owner decision D14 (blueprint §19.25): the owner has NO access to the conversations of teachers and students,
// except ONE conversation at a time, for a written reason, read only:
//
//   POST /api/owner-conversations/open { studentId, reason, before? }
//     → { ok, student: { userId, displayName }, messages[], hasMore }   (newest page; `before` = the page older than that message)
//
// Every opening — the first page and every older page — needs a recent second-factor check (stepUpDenial) and its own reason
// (MIN_REASON..MAX_REASON characters), and is recorded twice: in the owner's audit log (owner.conversation.opened, with the reason)
// and in the activity log of the student's teacher («سجل نشاطي», the same event with `forTeacher`, so the teacher sees that the
// platform's administration read the conversation and why). The conversation is the student's direct thread (the student's whole
// thread, as the student sees it). Nothing is written to it: no reply, no edit, no delete, and no read marker of the student or
// the teacher moves. There is no list or search of conversations — the owner names one student (from that teacher's class roster).
// Tadris+ P11-B — a student who shares a class of another teacher has a SEPARATE conversation with that teacher. `conversation`
// (optional, the same name the teacher's and the student's routes use) is the shared class whose conversation is opened; the student
// must currently share it. The opening is then recorded in the activity log of THAT class's teacher. Without it: the student's home
// conversation, as before.
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { recordOwnerAuditEventStrict, recordAuditEventStrict } = require("../lib/audit-log");
const { requireOwnerSession, stepUpDenial, NO_STORE } = require("../lib/identity/owner-session");
const { downloadJsonOrNull } = require("../lib/platform-storage");
const { isSafeId, directPrefix, sharedDirectPrefix, listRecentMessages, messageView, studentDisplayName, MESSAGE_ID_RE, DIRECT_HISTORY_LIMIT } = require("../lib/message-store");
const { ownerAccountIdOfStudent } = require("../lib/schools");
const { isStudentSharedIn } = require("../lib/class-membership");
const { isTeacherAccountId } = require("../lib/identity/teacher-token");

const MIN_REASON = 10, MAX_REASON = 500;
const reply = (status, body) => ({ status, headers: NO_STORE, jsonBody: body });

async function handler(request, deps = {}, obs = null) {
  const audit = deps.recordOwnerAuditEvent || recordOwnerAuditEventStrict;   // strict: an opening that cannot be recorded is refused
  const teacherAudit = deps.recordAuditEvent || recordAuditEventStrict;
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const method = String(request.method || "GET").toUpperCase();
  const action = String(request.params?.action || "").toLowerCase();

  const auth = await requireOwnerSession(request, deps);
  if (!auth.ok) return auth.response;
  const { owner, session, container } = auth;
  const actor = "owner:" + owner.accountId;

  try {
    if (method !== "POST" || action !== "open") return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
    const denied = stepUpDenial(session, deps.now ? deps.now() : Date.now());
    if (denied) return denied;
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const studentId = String(body?.studentId || "").trim();
    const reason = String(body?.reason || "").replace(/\s+/g, " ").trim();
    const before = body?.before === undefined || body?.before === null || body?.before === "" ? "" : String(body.before);
    if (!isSafeId(studentId)) return reply(400, { ok: false, code: "STUDENT_ID_INVALID", error: "معرّف الطالب غير صالح." });
    if (reason.length < MIN_REASON || reason.length > MAX_REASON) return reply(400, { ok: false, code: "REASON_REQUIRED", error: "اكتب سبب الاطلاع (" + MIN_REASON + " أحرف على الأقل)." });
    if (before && !MESSAGE_ID_RE.test(before)) return reply(400, { ok: false, code: "BEFORE_INVALID", error: "الصفحة المطلوبة غير صالحة." });
    const student = await dl(container, "platform/users/" + studentId + ".json");
    if (!student || student.role !== "student") return reply(404, { ok: false, code: "STUDENT_NOT_FOUND", error: "الطالب غير موجود." });
    // P11-B — which conversation: the home one, or the one of a class the student shares
    const sharedClassId = body?.conversation === undefined || body?.conversation === null || body?.conversation === "" ? "" : String(body.conversation).trim();
    let sharedClass = null;
    if (sharedClassId) {
      sharedClass = isSafeId(sharedClassId) && isStudentSharedIn(student, sharedClassId) ? await dl(container, "platform/classes/" + sharedClassId + ".json") : null;
      if (!sharedClass) return reply(404, { ok: false, code: "CONVERSATION_NOT_FOUND", error: "لا محادثة للطالب في هذا الصف." });
    }

    // Read only: no `isRead` (no unread frontier is applied or moved) — the visible messages of the thread, newest page.
    const page = sharedClass
      ? await listRecentMessages(container, sharedDirectPrefix(sharedClassId, studentId), { kind: "direct", studentId, sharedClassId }, DIRECT_HISTORY_LIMIT, deps, before ? { before } : {})
      : await listRecentMessages(container, directPrefix(studentId), { kind: "direct", studentId }, DIRECT_HISTORY_LIMIT, deps, before ? { before } : {});
    const messages = page.messages.map(doc => messageView(doc));
    const sharedOwner = sharedClass && typeof sharedClass.ownerId === "string" ? sharedClass.ownerId : "";
    const teacher = sharedClass ? (isTeacherAccountId(sharedOwner) ? sharedOwner : null) : await ownerAccountIdOfStudent(container, student, deps);
    const label = studentDisplayName(student);
    const details = { reason, messages: messages.length, olderPage: Boolean(before), teacherAccountId: teacher || "", ...(sharedClass ? { classId: sharedClassId } : {}) };
    // Recorded BEFORE the conversation is returned: an opening that cannot be recorded is not served (fail closed).
    await audit(container, { actor, action: "owner.conversation.opened", targetType: "student", targetId: studentId, targetLabel: label, details });
    if (teacher) await teacherAudit(container, { actor: "owner", forTeacher: teacher, action: "owner.conversation.opened", targetType: "student", targetId: studentId, targetLabel: label, details: { reason } });
    return reply(200, { ok: true, student: { userId: studentId, displayName: label }, messages, hasMore: page.hasMore === true });
  } catch (e) {
    obs?.logError("owner.conversations.error", e, { action });
    return reply(503, { ok: false, code: "OWNER_CONVERSATIONS_UNAVAILABLE", error: "تعذر فتح المحادثة حاليًا. حاول مرة أخرى." });
  }
}

app.http("ownerConversations", { methods: ["GET", "POST"], authLevel: "anonymous", route: "owner-conversations/{action?}", handler: withObservability("owner-conversations", handler) });
module.exports = { handler, MIN_REASON, MAX_REASON };
