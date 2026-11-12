const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { recordOwnerAuditEvent, recordOwnerAuditEventStrict, recordOwnerChange, recordOwnerChangeAtWrite } = require("../lib/audit-log");   // Tadris+ P10-L
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
const { previewClassTransfer, transferClass, TransferRefusal, MAX_REASON, classStudents, previewStudentTransfer, transferStudent, ownerOfStudent } = require("../lib/teacher-transfer");   // Tadris+ P5-B3a / P5-B3b
const { isStudentSharedIn } = require("../lib/class-membership");
const { enrollStudents, unenrollStudent, EnrollmentRefusal } = require("../lib/shared-enrollment");   // Tadris+ P11-A

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
//   POST enroll-students  { classId, userIds: [...] }       (P11-A) EXISTING accounts join this class too (a shared class): the same
//                          account, no password, no session revoked; the home class and its teacher stay as they are
//   POST unenroll-student { classId, userId }               (P11-A) the student leaves that shared class (refused while work there
//                          awaits its teacher — PENDING_GRADING)
//   GET  transfer-preview?classId=&toAccountId=          (P5-B3a) what moving the WHOLE class to that teacher would move
//   POST transfer        { classId, toAccountId, expectedFromAccountId, reason? }  → the class and every one of its students move
//                          to that teacher, with the class's whole history (owner decision §19.21); resumable; one ledger record
//   GET  students?classId=                                (P5-B3b) the class's students (names, identity, status) for the owner
//   GET  student-transfer-preview?userId=&toClassId=      what moving ONE student into another teacher's class would do
//   POST student-transfer { userId, fromClassId, toClassId, reason? } → the student moves (D16: the new teacher sees learning
//                          progress, not the old class's grades nor the conversation before the transfer; the former teacher keeps
//                          the old results as «منقول»); refused while work awaits the former teacher (PENDING_GRADING)
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
// Tadris+ P11-A — owner decision «الطالب يستطيع ان يتعلم عند اكثر من معلم»: an identity number that already has an account (it is
// the platform-wide login) is no longer a dead end for the owner. The preview names that account and its class («existing»), and
// enroll-students adds the SAME account to this class as a shared class (lib/shared-enrollment.js). Only the owner can do this: a
// teacher's own import still reports another teacher's student as taken, unnamed. Never by identity number in the request — by the
// user ids the preview returned.

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

/** The student, its current class (owned by an existing teacher) and the target class (another existing teacher's, active). */
async function studentTransferContext(container, userId, toClassId, deps) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  if (!isSafeId(userId)) return { refusal: reply(404, { ok: false, code: "STUDENT_NOT_FOUND", error: "الطالب غير موجود." }) };
  const student = await dl(container, "platform/users/" + userId + ".json");
  if (!student || student.role !== "student" || String(student.userId || userId) !== userId) return { refusal: reply(404, { ok: false, code: "STUDENT_NOT_FOUND", error: "الطالب غير موجود." }) };
  const fromId = String(student.classId || "");
  const fromClass = isSafeId(fromId) ? await dl(container, CLASS_PREFIX + fromId + ".json") : null;
  const from = fromClass ? ownerOfStudent(student, fromClass) : "";
  if (!fromClass || !(await teacherOf(container, from, deps))) return { refusal: reply(404, { ok: false, code: "STUDENT_NOT_FOUND", error: "الطالب غير موجود." }) };
  const target = isSafeId(toClassId) ? await dl(container, CLASS_PREFIX + toClassId + ".json") : null;
  if (!target || String(target.classId || toClassId) !== toClassId || !(await teacherOf(container, String(target.ownerId || ""), deps))) return { refusal: CLASS_NOT_FOUND() };
  if (String(target.ownerId) === from) return { refusal: bad("SAME_TEACHER", "اختر صفًا لمعلم آخر. النقل بين صفوف المعلم نفسه يتم من صفحته.") };
  if (normalizeClassStatus(target) === "archived") return { refusal: reply(400, { ok: false, code: "CLASS_ARCHIVED", error: "الصف الهدف مؤرشف." }) };
  return { student, fromClass: { ...fromClass, classId: fromId }, target: { ...target, classId: toClassId }, from };
}

async function handler(request, deps = {}, obs = null) {
  const nowMs = deps.now ? deps.now() : Date.now();
  const write = deps.recordOwnerAuditEvent || recordOwnerAuditEventStrict;          // Tadris+ P10-L: the record BEFORE a change
  // P10-L completion detail: a shared library below records the RESULT after its change, best effort — the change itself was
  // recorded strictly before its first write (adding / importing students), or carries its own record in that very write
  // (a transfer: the class's ownerHistory / the student's transferHistory with who, when and why, and its ledger).
  const auditBestEffort = deps.recordOwnerAuditEvent || recordOwnerAuditEvent;
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const ls = deps.listJson || loadDocs;
  const method = String(request.method || "GET").toUpperCase();
  const action = String(request.params?.action || "").toLowerCase();

  const auth = await requireOwnerSession(request, deps);
  if (!auth.ok) return auth.response;
  const { owner, session, container } = auth;
  const actor = "owner:" + owner.accountId;
  // Tadris+ P10-L (O14) — every change below is recorded (strict) BEFORE it happens; no record → 503 and nothing changes. A change
  // made by a shared library is recorded at its FIRST write (atWrite), so a refusal or a no-op the library finds records nothing.
  const change = (event, apply) => recordOwnerChange(container, event, apply, { write });
  const atWrite = (event, apply) => recordOwnerChangeAtWrite(container, event, apply, { write });

  try {
    if (method === "GET" && !action) {
      const accountId = queryParam(request, "accountId");
      if (!(await teacherOf(container, accountId, deps))) return TEACHER_NOT_FOUND();
      const classes = (await ls(container, CLASS_PREFIX)).filter(c => c && c.ownerId === accountId && isSafeId(String(c.classId || "")));
      classes.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || String(a.name || "").localeCompare(String(b.name || ""), "ar"));
      return reply(200, { ok: true, accountId, classes: classes.map(ownerClassView) });
    }
    if (method === "GET" && action === "transfer-preview") {
      const classId = queryParam(request, "classId"), toAccountId = queryParam(request, "toAccountId");
      const current = isSafeId(classId) ? await dl(container, CLASS_PREFIX + classId + ".json") : null;
      if (!current || String(current.classId || classId) !== classId || !(await teacherOf(container, String(current.ownerId || ""), deps))) return CLASS_NOT_FOUND();
      if (!(await teacherOf(container, toAccountId, deps))) return TEACHER_NOT_FOUND();
      if (toAccountId === current.ownerId) return bad("SAME_TEACHER", "اختر معلمًا آخر غير المعلم الحالي.");
      return reply(200, { ok: true, preview: await previewClassTransfer(container, { ...current, classId }, toAccountId, deps) });
    }
    if (method === "GET" && action === "students") {
      const classId = queryParam(request, "classId");
      const current = isSafeId(classId) ? await dl(container, CLASS_PREFIX + classId + ".json") : null;
      if (!current || String(current.classId || classId) !== classId || !(await teacherOf(container, String(current.ownerId || ""), deps))) return CLASS_NOT_FOUND();
      const allUsers = await ls(container, "platform/users/");
      const roster = classStudents(allUsers, classId)
        .filter(st => ownerOfStudent(st, current) === current.ownerId)
        .map(st => ({ userId: st.userId, displayName: String(st.displayName || ""), identityNumber: String(st.identityNumber || st.code || ""), active: st.active !== false, archived: st.archived === true }))
        // P11-A — the students ADDED to this class from another class (their account belongs to their home teacher)
        .concat(allUsers.filter(st => st && typeof st.userId === "string" && st.userId && isStudentSharedIn(st, classId))
          .map(st => ({ userId: st.userId, displayName: String(st.displayName || ""), identityNumber: String(st.identityNumber || st.code || ""), active: st.active !== false, archived: false, shared: true })))
        .sort((x, y) => x.displayName.localeCompare(y.displayName, "ar"));
      return reply(200, { ok: true, classId, students: roster });
    }
    if (method === "GET" && action === "student-transfer-preview") {
      const userId = queryParam(request, "userId"), toClassId = queryParam(request, "toClassId");
      const found = await studentTransferContext(container, userId, toClassId, deps);
      if (found.refusal) return found.refusal;
      return reply(200, { ok: true, preview: await previewStudentTransfer(container, found.student, found.fromClass, found.target, deps) });
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
      if (keyedId) {   // the same submission, repeated: answered before any record (nothing changes)
        const existing = await dl(container, CLASS_PREFIX + classroom.classId + ".json");
        if (existing && existing.ownerId === accountId) return reply(200, { ok: true, duplicate: true, classroom: ownerClassView(existing) });
      }
      return await change({ actor, action: "owner.class.created", targetType: "class", targetId: classroom.classId, targetLabel: classroom.name, details: { accountId, grade: classroom.grade, schoolYear: classroom.schoolYear } }, async () => {
        try {
          await (deps.uploadJsonConditional || uploadJsonConditional)(container, CLASS_PREFIX + classroom.classId + ".json", classroom, null);
        } catch (e) {
          if (!isConcurrencyConflict(e)) throw e;
          const existing = keyedId ? await dl(container, CLASS_PREFIX + classroom.classId + ".json") : null;   // the same submission, repeated
          if (!existing || existing.ownerId !== accountId) throw e;
          return { ...reply(200, { ok: true, duplicate: true, classroom: ownerClassView(existing) }), notApplied: "duplicate" };
        }
        return reply(201, { ok: true, classroom: ownerClassView(classroom) });
      });
    }

    if (action === "update" || Object.prototype.hasOwnProperty.call(LIFECYCLE, action)) {
      const classId = String(body.classId || "").trim();
      if (!isSafeId(classId)) return CLASS_NOT_FOUND();
      const current = await dl(container, CLASS_PREFIX + classId + ".json");
      // only a class that belongs to an existing teacher account (never an unowned / pre-tenancy class)
      if (!current || String(current.classId || classId) !== classId || !(await teacherOf(container, String(current.ownerId || ""), deps))) return CLASS_NOT_FOUND();
      const accountId = String(current.ownerId);
      // The record is the event the library used to write AFTER the change — the same name and details — written at its first write.
      const event = ({ json }) => {
        const next = json && typeof json === "object" ? json : {};
        if (action === "update") return { actor, action: "owner.class.update", targetType: "class", targetId: classId, targetLabel: String(next.name || ""), details: { fields: ["name", "grade", "schoolYear"].filter(k => String(current[k] || "") !== String(next[k] || "")), previousName: String(current.name || ""), accountId } };
        const kind = LIFECYCLE[action];
        return { actor, action: "owner." + (kind === "unarchive" ? "class.unarchive" : kind === "graduateandarchive" ? "class.graduate" : "class.archive"), targetType: "class", targetId: classId, targetLabel: String(next.name || ""), details: { ...(next.graduationYear ? { graduationYear: next.graduationYear } : {}), accountId } };
      };
      const recorded = () => {};   // already recorded at the write (above)
      return await atWrite(event, async guarded => {
        const r = action === "update"
          ? await updateClassLabels(guarded, classId, body, { mut, record: recorded })
          : await changeClassLifecycle(guarded, classId, LIFECYCLE[action], { mut, ls, record: recorded, actor });
        return { ...r, headers: { ...NO_STORE, ...(r.headers || {}) } };
      });
    }

    if (action === "student-transfer") {
      const userId = String(body.userId || "").trim(), toClassId = String(body.toClassId || "").trim(), fromClassId = String(body.fromClassId || "").trim();
      if (typeof body.reason === "string" && body.reason.length > MAX_REASON) return bad("REASON_TOO_LONG", "سبب النقل طويل جدًا.");
      const found = await studentTransferContext(container, userId, toClassId, deps);
      if (found.refusal) return found.refusal;
      if (String(found.fromClass.classId) !== fromClassId) return reply(409, { ok: false, code: "TRANSFER_STALE", error: "نُقل الطالب أو تغيّر صفه منذ المعاينة. أعد فتح النقل." });
      // P10-L: the move itself writes its record (the student's transferHistory: from, to, at, by, reason) and a ledger.
      let result;
      try {
        result = await transferStudent(container, { userId, fromClassId, toClassId, from: found.from, to: String(found.target.ownerId), actor, reason: body.reason, nowMs }, { ...deps, mutateJsonWithRetry: mut, obs });
      } catch (e) {
        if (e instanceof TransferRefusal) return reply(e.status, { ok: false, code: e.code, error: e.message });
        throw e;
      }
      await auditBestEffort(container, { actor, action: "owner.student.transferred", targetType: "student", targetId: userId, targetLabel: userId, details: { from: found.from, to: String(found.target.ownerId), fromClassId, toClassId, transferId: result.ledger.transferId } });   // P10-L completion detail
      return reply(200, { ok: true, ledger: result.ledger });
    }

    if (action === "transfer") {
      const classId = String(body.classId || "").trim();
      const toAccountId = String(body.toAccountId || ""), from = String(body.expectedFromAccountId || "");
      if (!isSafeId(classId)) return CLASS_NOT_FOUND();
      if (!(await teacherOf(container, toAccountId, deps))) return TEACHER_NOT_FOUND();
      if (!(await teacherOf(container, from, deps))) return reply(409, { ok: false, code: "TRANSFER_STALE", error: "تغيّر مالك الصف منذ المعاينة. أعد فتح النقل." });
      if (typeof body.reason === "string" && body.reason.length > MAX_REASON) return bad("REASON_TOO_LONG", "سبب النقل طويل جدًا.");
      // P10-L: the move itself writes its record (the class's ownerHistory: from, to, at, by, reason) and a resumable ledger.
      let result;
      try {
        result = await transferClass(container, { classId, from, to: toAccountId, actor, reason: body.reason, nowMs }, { ...deps, mutateJsonWithRetry: mut, listJson: deps.listJson, obs });
      } catch (e) {
        if (e instanceof TransferRefusal) return reply(e.status, { ok: false, code: e.code, error: e.message });
        throw e;
      }
      const { ledger } = result;
      await auditBestEffort(container, { actor, action: "owner.class.transferred", targetType: "class", targetId: classId, targetLabel: classId, details: { from, to: toAccountId, transferId: ledger.transferId, moved: ledger.students.moved, failed: ledger.students.failed, resumed: ledger.resumed } });   // P10-L completion detail
      return reply(200, { ok: true, ledger });
    }

    // The RESULT of a change a shared library made (adding / importing / enrolling students): it goes to the owner audit AND to the
    // platform audit the teacher's own actions use (actor: the owner). The change itself was recorded strictly before its first write.
    const studentAudit = deps.recordAuditEvent || recordAuditEvent;
    const resultRecorder = accountId => async ev => {
      await auditBestEffort(container, { actor, ...ev, action: "owner." + ev.action, details: { ...(ev.details || {}), accountId } });   // P10-L completion detail
      try { await studentAudit(container, { actor, ...ev }); } catch { /* audit is secondary */ }
    };

    if (action === "enroll-students" || action === "unenroll-student") {
      const classId = String(body.classId || "").trim();
      const classroom = isSafeId(classId) ? await dl(container, CLASS_PREFIX + classId + ".json") : null;
      if (!classroom || String(classroom.classId || classId) !== classId || !(await teacherOf(container, String(classroom.ownerId || ""), deps))) return CLASS_NOT_FOUND();
      const accountId = String(classroom.ownerId);
      const record = resultRecorder(accountId);
      const target = { targetType: "class", targetId: classId, targetLabel: String(classroom.name || classId) };
      if (action === "unenroll-student") {
        const userId = String(body.userId || "").trim();
        if (!isSafeId(userId)) return reply(404, { ok: false, code: "STUDENT_NOT_FOUND", error: "الطالب غير موجود." });
        return await atWrite({ actor, action: "owner.student.unenroll.requested", ...target, details: { accountId, userId } }, async guarded => {
          let removed;
          try { removed = await unenrollStudent(guarded, classId, userId, { actor, nowMs, obs }, { mutateJsonWithRetry: deps.mutateJsonWithRetry }); }
          catch (e) {
            if (e instanceof EnrollmentRefusal) return reply(e.status, { ok: false, code: e.code, ...e.extra, error: e.message });
            throw e;
          }
          await record({ action: "student.unenroll", targetType: "student", targetId: userId, targetLabel: userId, details: { classId } });
          return reply(200, { ok: true, removed: true, rosterSynced: removed.rosterSynced });
        });
      }
      if (normalizeClassStatus(classroom) === "archived") return reply(400, { ok: false, code: "CLASS_ARCHIVED", error: "الصف مؤرشف. استعده أولًا لإضافة طلاب." });
      const userIds = Array.from(new Set((Array.isArray(body.userIds) ? body.userIds : []).map(x => String(x || "").trim()).filter(Boolean)));
      if (!userIds.length) return bad("STUDENTS_EMPTY", "اختر طالبًا واحدًا على الأقل.");
      if (userIds.length > MAX_IMPORT_ROWS) return bad("STUDENTS_TOO_MANY", "يمكن إضافة " + MAX_IMPORT_ROWS + " طالبًا كحد أقصى في العملية الواحدة.");
      return await atWrite({ actor, action: "owner.students.enroll.requested", ...target, details: { accountId, rows: userIds.length } }, async guarded => {
        const r = await enrollStudents(guarded, { ...classroom, classId }, userIds, { actor, nowMs, obs }, { mutateJsonWithRetry: deps.mutateJsonWithRetry });
        // the completion detail: counts only — never a name or an identity number
        if (r.enrolled.length) await record({ action: "student.enroll", ...target, details: { classId, enrolledCount: r.enrolled.length, alreadyCount: r.already.length, failedCount: r.errors.length } });
        return {
          ...reply(200, {
            ok: true, enrolled: r.enrolled.length, already: r.already.length, failed: r.errors.length, rosterSynced: r.rosterSynced,
            students: r.enrolled.map(st => ({ userId: String(st.userId), displayName: String(st.displayName || ""), identityNumber: String(st.identityNumber || st.code || "") })),
            errors: r.errors
          }),
          ...(r.enrolled.length ? {} : { notApplied: "nothing-enrolled" })
        };
      });
    }

    if (action === "add-student" || action === "preview-import" || action === "import-students") {
      const classId = String(body.classId || "").trim();
      const classroom = isSafeId(classId) ? await dl(container, CLASS_PREFIX + classId + ".json") : null;
      if (!classroom || String(classroom.classId || classId) !== classId || !(await teacherOf(container, String(classroom.ownerId || ""), deps))) return CLASS_NOT_FOUND();
      if (normalizeClassStatus(classroom) === "archived") return reply(400, { ok: false, code: "CLASS_ARCHIVED", error: "الصف مؤرشف. استعده أولًا لإضافة طلاب." });
      const accountId = String(classroom.ownerId);
      const record = resultRecorder(accountId);
      const requested = (what, details) => ({ actor, action: "owner." + what + ".requested", targetType: "class", targetId: classId, targetLabel: String(classroom.name || classId), details: { accountId, ...details } });
      try {
        if (action === "add-student") {
          return await atWrite(requested("student.add", {}), async guarded => {
            const r = await addStudentToClass(guarded, { ...classroom, classId }, body, { visible: null, record, obs });
            return { ...r, status: r.status === 200 ? 201 : r.status, headers: { ...NO_STORE, ...(r.headers || {}) } };
          });
        }
        const students = normalizeBulkStudents(body.students);
        if (!students.length) return bad("STUDENTS_EMPTY", "القائمة لا تحتوي بيانات طلاب صالحة.");
        if (students.length > MAX_IMPORT_ROWS) return bad("STUDENTS_TOO_MANY", "يمكن استيراد " + MAX_IMPORT_ROWS + " طالبًا كحد أقصى في العملية الواحدة.");
        if (action === "preview-import") {
          const preview = await buildImportPreview(container, students, null, { enrollInto: classId });   // P11-A: existing accounts are named
          return reply(200, { ok: true, preview, valid: preview.filter(x => x.status === "valid").length, existing: preview.filter(x => x.status === "existing").length, duplicates: preview.filter(x => x.status === "duplicate").length, invalid: preview.filter(x => x.status === "invalid").length });
        }
        return await atWrite(requested("students.import", { rows: students.length }), async guarded => {
          const r = await importStudentsToClass(guarded, { ...classroom, classId }, students, { importId: body.importId, visible: null, record, obs });
          return { ...r, headers: { ...NO_STORE, ...(r.headers || {}) } };
        });
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
