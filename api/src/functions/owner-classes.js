const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { recordOwnerAuditEvent } = require("../lib/audit-log");
const { requireOwnerSession, stepUpDenial, NO_STORE } = require("../lib/identity/owner-session");
const { isTeacherAccountId } = require("../lib/identity/teacher-token");
const { readTeacherAccount } = require("../lib/identity/teacher-accounts");
const { mutateJsonWithRetry, uploadJsonConditional, isConcurrencyConflict, downloadJsonOrNull } = require("../lib/platform-storage");
const { loadDocs } = require("../lib/classes-students-read-cache");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { getClassProgramCodes } = require("../lib/project-tracker/class-programs");
const { isSafeId } = require("../lib/roster-input");
const {
  buildNewClassroomDocument, classIdForRequestKey, normalizeClassFields, updateClassLabels, changeClassLifecycle, CLASS_PREFIX
} = require("./manage-classrooms");
const {
  addStudentToClass, importStudentsToClass, studentErrorReply, normalizeBulkStudents, buildImportPreview, MAX_IMPORT_ROWS
} = require("./manage-students");   // Tadris+ P5-B4
const { recordAuditEvent } = require("../lib/audit-log");

// Tadris+ P5-B2 — owner decision D18 (revised): «انا المالك انشيء الصفوف». The owner creates and manages a teacher's classes.
// Route: /api/owner-classes/{action?}   (owner session only)
//
//   GET  ?accountId=                                    → { classes: [...] } that teacher's classes (archived included)
//   POST create    { accountId, name, grade, schoolYear, requestKey? }   → 201 { classroom } owned by that teacher
//   POST update    { classId, name, grade, schoolYear }                   → the class's labels only
//   POST archive | unarchive | graduate { classId }
//   POST add-student      { classId, firstName, familyName, identityNumber, password? }   (P5-B4)
//   POST preview-import   { classId, students: [...] }      → the SAME server preview as the teacher's (validation only)
//   POST import-students  { classId, students: [...], importId? } → the SAME import as the teacher's (credentials shown ONCE)
//
// A class is created EXACTLY as the teacher's own «إنشاء الصف» creates it (same document, same request-key idempotency), stamped
// with the teacher as its owner; edit and lifecycle are the SAME shared functions as the teacher's route (same CAS write, archived
// class read-only, the pending-grading guards and their race re-check). Only a class owned by an existing teacher account is
// reachable here; anything else is answered like a missing class. Every POST needs a recent second-factor check (step-up) and is
// written to the owner audit log. Nothing about results or projects is changed here.
// Tadris+ P5-B4 — «يقوم المالك باضافة طلاب المعلم لكي يجهز له الصفحة»: the owner adds students to a teacher's ACTIVE class, one
// or a whole list, with the teacher route's own shared functions (manage-students.js): same validation, platform-wide identity
// uniqueness, create-only login write, import retry key, in-file duplicate rule, roster index; each student is the teacher's (it
// inherits the class's owner). The teacher keeps adding, editing and archiving their students. Temporary passwords are in the
// answer only (never stored in plain text, never in any audit).

const reply = (status, body, extra = {}) => ({ status, headers: { ...NO_STORE, ...extra }, jsonBody: body });
const bad = (code, error) => reply(400, { ok: false, code, error });
const TEACHER_NOT_FOUND = () => reply(404, { ok: false, code: "TEACHER_NOT_FOUND", error: "حساب المعلم غير موجود." });
const CLASS_NOT_FOUND = () => reply(404, { ok: false, code: "CLASS_NOT_FOUND", error: "الصف غير موجود." });
const LIFECYCLE = Object.freeze({ archive: "archive", unarchive: "unarchive", graduate: "graduateandarchive" });

function queryParam(request, name) {
  try { if (request.query && typeof request.query.get === "function") return request.query.get(name) || ""; } catch { /* fall through */ }
  try { return new URL(String(request.url || ""), "http://localhost").searchParams.get(name) || ""; } catch { return ""; }
}

/** The owner's view of one class (no student data beyond the roster size). */
function ownerClassView(c) {
  return {
    classId: String(c.classId), name: String(c.name || ""), grade: String(c.grade || ""), schoolYear: String(c.schoolYear || ""),
    status: normalizeClassStatus(c), studentCount: Array.isArray(c.studentIds) ? c.studentIds.length : 0,
    programCodes: getClassProgramCodes(c), createdAt: String(c.createdAt || ""), archivedAt: String(c.archivedAt || "")
  };
}

async function teacherOf(container, accountId, deps) {
  if (!isTeacherAccountId(accountId)) return null;
  return (deps.readTeacherAccount || readTeacherAccount)(container, accountId);
}

async function handler(request, deps = {}, obs = null) {
  const nowMs = deps.now ? deps.now() : Date.now();
  const audit = deps.recordOwnerAuditEvent || recordOwnerAuditEvent;
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const ls = deps.listJson || loadDocs;
  const method = String(request.method || "GET").toUpperCase();
  const action = String(request.params?.action || "").toLowerCase();

  const auth = await requireOwnerSession(request, deps);
  if (!auth.ok) return auth.response;
  const { owner, session, container } = auth;
  const actor = "owner:" + owner.accountId;

  try {
    if (method === "GET" && !action) {
      const accountId = queryParam(request, "accountId");
      if (!(await teacherOf(container, accountId, deps))) return TEACHER_NOT_FOUND();
      const classes = (await ls(container, CLASS_PREFIX)).filter(c => c && c.ownerId === accountId && isSafeId(String(c.classId || "")));
      classes.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || String(a.name || "").localeCompare(String(b.name || ""), "ar"));
      return reply(200, { ok: true, accountId, classes: classes.map(ownerClassView) });
    }
    if (method !== "POST") return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
    const denial = stepUpDenial(session, nowMs);
    if (denial) return denial;
    let body = {};
    try { const b = await request.json(); body = b && typeof b === "object" ? b : {}; } catch { body = {}; }

    if (action === "create") {
      const accountId = String(body.accountId || "");
      const teacher = await teacherOf(container, accountId, deps);
      if (!teacher) return TEACHER_NOT_FOUND();
      const fields = normalizeClassFields(body);
      if (!fields.ok) return bad("CLASS_FIELDS_INVALID", fields.error);
      if (body.requestKey !== undefined && body.requestKey !== null && !classIdForRequestKey(body.requestKey, accountId)) return bad("REQUEST_KEY_INVALID", "مفتاح الطلب غير صالح.");
      const keyedId = classIdForRequestKey(body.requestKey, accountId);
      const iso = new Date(nowMs).toISOString();
      const classroom = buildNewClassroomDocument({ ...fields.value, programCode: "" }, iso, accountId, keyedId);
      try {
        await (deps.uploadJsonConditional || uploadJsonConditional)(container, CLASS_PREFIX + classroom.classId + ".json", classroom, null);
      } catch (e) {
        if (!isConcurrencyConflict(e)) throw e;
        const existing = keyedId ? await dl(container, CLASS_PREFIX + classroom.classId + ".json") : null;   // the same submission, repeated
        if (!existing || existing.ownerId !== accountId) throw e;
        return reply(200, { ok: true, duplicate: true, classroom: ownerClassView(existing) });
      }
      await audit(container, { actor, action: "owner.class.created", targetType: "class", targetId: classroom.classId, targetLabel: classroom.name, details: { accountId, grade: classroom.grade, schoolYear: classroom.schoolYear } });
      return reply(201, { ok: true, classroom: ownerClassView(classroom) });
    }

    if (action === "update" || Object.prototype.hasOwnProperty.call(LIFECYCLE, action)) {
      const classId = String(body.classId || "").trim();
      if (!isSafeId(classId)) return CLASS_NOT_FOUND();
      const current = await dl(container, CLASS_PREFIX + classId + ".json");
      // only a class that belongs to an existing teacher account (never an unowned / pre-tenancy class)
      if (!current || String(current.classId || classId) !== classId || !(await teacherOf(container, String(current.ownerId || ""), deps))) return CLASS_NOT_FOUND();
      const accountId = String(current.ownerId);
      const record = ev => audit(container, { actor, ...ev, action: "owner." + ev.action, details: { ...(ev.details || {}), accountId } });
      const r = action === "update"
        ? await updateClassLabels(container, classId, body, { mut, record })
        : await changeClassLifecycle(container, classId, LIFECYCLE[action], { mut, ls, record, actor });
      return { ...r, headers: { ...NO_STORE, ...(r.headers || {}) } };
    }

    if (action === "add-student" || action === "preview-import" || action === "import-students") {
      const classId = String(body.classId || "").trim();
      const classroom = isSafeId(classId) ? await dl(container, CLASS_PREFIX + classId + ".json") : null;
      if (!classroom || String(classroom.classId || classId) !== classId || !(await teacherOf(container, String(classroom.ownerId || ""), deps))) return CLASS_NOT_FOUND();
      if (normalizeClassStatus(classroom) === "archived") return reply(400, { ok: false, code: "CLASS_ARCHIVED", error: "الصف مؤرشف. استعده أولًا لإضافة طلاب." });
      const accountId = String(classroom.ownerId);
      const studentAudit = deps.recordAuditEvent || recordAuditEvent;
      // the event goes to the owner audit AND to the platform audit the teacher's own actions use (actor: the owner)
      const record = async ev => {
        await audit(container, { actor, ...ev, action: "owner." + ev.action, details: { ...(ev.details || {}), accountId } });
        try { await studentAudit(container, { actor, ...ev }); } catch { /* audit is secondary */ }
      };
      try {
        if (action === "add-student") {
          const r = await addStudentToClass(container, { ...classroom, classId }, body, { visible: null, record, obs });
          return { ...r, status: r.status === 200 ? 201 : r.status, headers: { ...NO_STORE, ...(r.headers || {}) } };
        }
        const students = normalizeBulkStudents(body.students);
        if (!students.length) return bad("STUDENTS_EMPTY", "القائمة لا تحتوي بيانات طلاب صالحة.");
        if (students.length > MAX_IMPORT_ROWS) return bad("STUDENTS_TOO_MANY", "يمكن استيراد " + MAX_IMPORT_ROWS + " طالبًا كحد أقصى في العملية الواحدة.");
        if (action === "preview-import") {
          const preview = await buildImportPreview(container, students, null);
          return reply(200, { ok: true, preview, valid: preview.filter(x => x.status === "valid").length, duplicates: preview.filter(x => x.status === "duplicate").length, invalid: preview.filter(x => x.status === "invalid").length });
        }
        const r = await importStudentsToClass(container, { ...classroom, classId }, students, { importId: body.importId, visible: null, record, obs });
        return { ...r, headers: { ...NO_STORE, ...(r.headers || {}) } };
      } catch (e) {
        const refused = studentErrorReply(e);
        if (refused) return { ...refused, headers: { ...NO_STORE, ...refused.headers } };
        throw e;
      }
    }

    return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
  } catch (e) {
    obs?.logError?.("owner.classes.error", e);
    return reply(500, { ok: false, error: "تعذر تنفيذ إجراء الصف حاليًا." });
  }
}

app.http("ownerClasses", { methods: ["GET", "POST"], authLevel: "anonymous", route: "owner-classes/{action?}", handler: withObservability("owner-classes", handler) });

module.exports = { handler };
