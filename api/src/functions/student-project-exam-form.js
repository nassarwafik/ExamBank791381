// Phase F2 — the logged-in student's project exam form («استمارة امتحان المشروع»): read it, save a draft, submit it.
//
//   GET  /api/student-project-exam-form?projectCode=…           the questions (no answer key), the student's answers, progress
//   POST /api/student-project-exam-form { projectCode, action: "saveDraft", baseRevision, answers: { questionId: answer | null } }
//   POST /api/student-project-exam-form { projectCode, action: "submit", baseRevision }
//   Phase F4 — images, only in a class whose teacher switched image answers on:
//   POST /api/student-project-exam-form { projectCode, action: "addImage", questionId, dataUrl }      attach one image
//   POST /api/student-project-exam-form { projectCode, action: "removeImage", questionId, imageId }   remove one
//   GET  /api/student-project-exam-form?projectCode=…&image=<imageId>                                 the student's OWN image (image/webp)
//   Phase F5 — files, only in a class whose teacher switched file answers on:
//   POST /api/student-project-exam-form { projectCode, action: "addFile", questionId, fileName, dataBase64 }   attach (or replace) the file
//   POST /api/student-project-exam-form { projectCode, action: "removeFile", questionId, fileId }              remove it
//   GET  /api/student-project-exam-form?projectCode=…&file=<fileId>                                            the student's OWN file, as a download
//
// The student and the class come ONLY from the verified session: the class is the one that serves the project for this
// student (lib/project-tracker/student-project-classes.js). A body classId / studentId is never read. The form exists for a
// class only after its teacher opened it; there is no time limit; a draft is saved as the student goes and resumed later; a
// submitted form is read-only for the student. Nothing here marks an answer (docs/enterprise-project-exam-form-f2.md).
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { StorageConflictError } = require("../lib/platform-storage");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { recordAuditEvent } = require("../lib/audit-log");
const { resolveStudentProjectClasses } = require("../lib/project-tracker/student-project-classes");
const forms = require("../lib/project-tracker/exam-form-service");

const NOT_AVAILABLE = "المشروع غير متاح لصفك.";
const CONFLICT = "حدث تعارض مؤقت أثناء الحفظ. حاول مرة أخرى.";

// `deps` is an optional dependency-injection seam for unit tests (production passes nothing).
const ACTIONS = new Set(["saveDraft", "submit", "addImage", "removeImage", "addFile", "removeFile"]);
// Phase F5 (files) — a stored file is opaque bytes: always a download, never a type the browser may render or guess.
const FILE_HEADERS = file => ({ "content-type": "application/octet-stream", "content-disposition": file.disposition, "x-content-type-options": "nosniff", "cache-control": "private, no-store" });

async function handler(request, deps = {}, obs = null) {
  try {
    const sess = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
    if (!sess.ok) return sess.response;
    const container = sess.container;
    const studentId = sess.user.sub;
    const now = new Date().toISOString();

    const isPost = request.method === "POST";
    let body = {};
    if (isPost) { try { body = (await request.json()) || {}; } catch { body = {}; } }
    const projectCode = String((isPost ? body.projectCode : new URL(request.url).searchParams.get("projectCode")) || "").trim();
    const { servedBy } = await resolveStudentProjectClasses(container, sess.student);
    const served = projectCode ? servedBy.get(projectCode) : null;
    if (!served) return { status: 400, jsonBody: { ok: false, error: NOT_AVAILABLE } };
    const { classId, classroom } = served;
    const archived = normalizeClassStatus(classroom) !== "active";

    if (!isPost) {
      // Phase F4 — one of the student's OWN attached images: served only when this student's answers reference it. An
      // archived class keeps its record readable, images included.
      const imageId = new URL(request.url).searchParams.get("image");
      if (imageId !== null) {
        const image = await forms.readStudentImage(container, projectCode, classId, studentId, String(imageId));
        if (!image) return { status: 404, jsonBody: { ok: false, error: "لا توجد صورة." } };
        return { status: 200, body: image.buffer, headers: { "content-type": image.contentType, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff", "content-disposition": "inline" } };
      }
      // Phase F5 (files) — one of the student's OWN attached files, as a DOWNLOAD only (never inline, never a guessed type):
      // served only when this student's answers reference it. Readable in an archived class too (its record).
      const fileId = new URL(request.url).searchParams.get("file");
      if (fileId !== null) {
        const file = await forms.readStudentFile(container, projectCode, classId, studentId, String(fileId));
        if (!file) return { status: 404, jsonBody: { ok: false, error: "لا يوجد ملف." } };
        return { status: 200, body: file.buffer, headers: FILE_HEADERS(file) };
      }
      const view = await forms.readStudentForm(container, projectCode, classId, studentId);
      return { status: 200, jsonBody: { ok: true, projectCode, ...view, ...(view.available && archived ? { readOnly: true } : {}) } };
    }

    if (archived) return { status: 403, jsonBody: { ok: false, error: "الصف مؤرشف — لا يمكن تعديل الاستمارة." } };
    const action = String(body.action || "").trim();
    if (!ACTIONS.has(action)) return { status: 400, jsonBody: { ok: false, error: "طلب غير صحيح." } };
    const baseRevision = body.baseRevision;
    try {
      if (action === "addImage") {
        const r = await forms.addStudentImage(container, projectCode, classId, studentId, { questionId: body.questionId, dataUrl: body.dataUrl, now });
        return { status: 200, jsonBody: { ok: true, projectCode, changed: true, image: r.image, ...r.body } };
      }
      if (action === "removeImage") {
        const r = await forms.removeStudentImage(container, projectCode, classId, studentId, { questionId: body.questionId, imageId: body.imageId, now });
        return { status: 200, jsonBody: { ok: true, projectCode, changed: r.changed, ...r.body } };
      }
      if (action === "addFile") {
        const r = await forms.addStudentFile(container, projectCode, classId, studentId, { questionId: body.questionId, fileName: body.fileName, dataBase64: body.dataBase64, now });
        return { status: 200, jsonBody: { ok: true, projectCode, changed: true, file: r.file, ...r.body } };
      }
      if (action === "removeFile") {
        const r = await forms.removeStudentFile(container, projectCode, classId, studentId, { questionId: body.questionId, fileId: body.fileId, now });
        return { status: 200, jsonBody: { ok: true, projectCode, changed: r.changed, ...r.body } };
      }
      if (action === "saveDraft") {
        const r = await forms.saveStudentDraft(container, projectCode, classId, studentId, { patch: body.answers, baseRevision, now });
        return { status: 200, jsonBody: { ok: true, projectCode, changed: r.changed, ...r.body } };
      }
      const r = await forms.submitStudentForm(container, projectCode, classId, studentId, { baseRevision, now });
      await (deps.recordAuditEvent || recordAuditEvent)(container, {
        actor: studentId, action: "project.exam_form.submit",
        targetType: "project-student", targetId: projectCode + "/" + classId + "/" + studentId, targetLabel: r.student.displayName || "",
        details: { projectCode, classId, formVersion: r.body.form.formVersion, answered: r.body.progress.answered, total: r.body.progress.total }
      });
      return { status: 200, jsonBody: { ok: true, projectCode, changed: true, ...r.body } };
    } catch (e) {
      // A technical conflict is retryable and never loses what was saved before it.
      if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT, retryable: true } };
      // (Phase F4 — a refused upload — too large, not a JPEG / PNG / WebP, undecodable — carries the image pipeline's own
      // status, message and code, and takes this same path.)
      if (e && e.httpStatus) return { status: e.httpStatus, jsonBody: { ok: false, error: e.message, ...(e.code ? { code: e.code } : {}), ...(Array.isArray(e.missing) ? { missing: e.missing } : {}) } };
      throw e;
    }
  } catch (e) {
    if (e && e.httpStatus === 503) return { status: 503, jsonBody: { ok: false, error: e.message, ...(e.code ? { code: e.code } : {}) } };
    obs?.logError("student.projectExamForm.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذر تحميل استمارة المشروع حاليًا." } };
  }
}

app.http("studentProjectExamForm", { methods: ["GET", "POST"], authLevel: "anonymous", route: "student-project-exam-form", handler: withObservability("student-project-exam-form", handler) });
module.exports = { handler };
