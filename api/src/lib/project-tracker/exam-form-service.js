// Phase F2 — storage side of the project exam form: the class's form (opened by the teacher, its questions frozen at that
// moment) and one answers document per student. Every write is a CAS round (mutateJsonWithRetry). Domain results and
// errors with httpStatus only; the routes own the status codes, the messages and the audit records.
//
//   class form   platform/project-exam-forms/<code>/classes/<classId>.json
//                { schemaVersion, projectCode, classId, state: "open" | "closed", formVersion, template, hiddenQuestionIds, openedAt, openedBy, … }
//   answers      platform/project-exam-forms/<code>/answers/<classId>/<studentId>.json
//                { schemaVersion, projectCode, classId, studentId, formVersion, status: "draft" | "submitted" | "returned" | "approved",
//                  answers, revision, review?, result?, … }   (review / result: Phase F3, exam-form-review.js)
//
// The class form holds the WHOLE template, answer keys included: it is server-side only. A student is sent
// toStudentView(template) and their own answers, never the stored class form.
const crypto = require("crypto");
const { downloadJsonOrNull, mutateJsonWithRetry, uploadBinary, downloadBinaryOrNull, deleteBlob } = require("../platform-storage");
const { decodeImageDataUrl, normalizeEvidenceImage, EVIDENCE_MAX_UPLOAD_BYTES } = require("../profile-image");
const images = require("./exam-form-images");
const files = require("./exam-form-files");                                       // Phase F5 (files)
const { getStorageNamespace, getExamFormTemplate } = require("./registry");
const { validateExamFormTemplate, toStudentView, summarizeExamForm } = require("./exam-form");
const { applyDraft, applySubmit, formProgress, deferredKindsOf } = require("./exam-form-answers");
const { studentReviewView } = require("./exam-form-review");   // Phase F3
const svc = require("./service");

function fail(message, httpStatus, code) {
  const err = new Error(message);
  err.httpStatus = httpStatus;
  if (code) err.code = code;
  throw err;
}

// The frozen questions of a class form, or a 503: a stored form this code cannot trust (unreadable, edited by hand, of
// another project) is never shown and never written against (fail closed).
function trustedTemplate(classForm, projectCode) {
  try {
    validateExamFormTemplate(classForm.template, { projectCode });
  } catch {
    fail("الاستمارة غير متاحة حاليًا.", 503, "FORM_UNREADABLE");
  }
  return classForm.template;
}

// Phase F4 — the rules of ONE class's form that the answer code needs: whether its teacher switched image answers on. A
// class form that never did (every form opened before F4) keeps image questions deferred, exactly as before.
// Phase F5 (files) — and whether file answers are on. The two switches are independent.
const rulesOf = classForm => ({ imageAnswers: !!(classForm && classForm.imageAnswers === true), fileAnswers: !!(classForm && classForm.fileAnswers === true) });

async function loadClassForm(container, projectCode, classId) {
  return downloadJsonOrNull(container, getStorageNamespace(projectCode).examFormClassName(classId));
}

// What the teacher's project page shows about the form of one class. Reads only.
async function classFormState(container, projectCode, classId) {
  const bundled = getExamFormTemplate(projectCode);
  if (!bundled) return { hasForm: false, state: "none" };
  const stored = await loadClassForm(container, projectCode, classId);
  if (!stored) return { hasForm: true, state: "none", summary: summarizeExamForm(bundled) };
  return {
    hasForm: true, state: stored.state === "open" ? "open" : "closed", formVersion: stored.formVersion,
    openedAt: stored.openedAt || "", closedAt: stored.closedAt || "", summary: summarizeExamForm(trustedTemplate(stored, projectCode)),
    hiddenQuestionIds: Array.isArray(stored.hiddenQuestionIds) ? stored.hiddenQuestionIds : [],
    ...(stored.imageAnswers === true ? { imageAnswers: true } : {}),                // Phase F4 (absent while off)
    ...(stored.fileAnswers === true ? { fileAnswers: true } : {})                   // Phase F5 (absent while off)
  };
}

// Phase F3 — the bundled form without the questions the teacher hides for this class. A hidden question is absent from the
// frozen form: the student never sees it and it never counts. Sections and weights stay, so a section cannot lose every
// question, and the result must still be a valid form.
const MAX_HIDDEN = 300;
function withoutHidden(bundled, hiddenQuestionIds, projectCode) {
  const template = JSON.parse(JSON.stringify(bundled));
  if (hiddenQuestionIds === undefined || hiddenQuestionIds === null) return { template, hidden: [] };
  if (!Array.isArray(hiddenQuestionIds) || hiddenQuestionIds.length > MAX_HIDDEN || hiddenQuestionIds.some(id => typeof id !== "string")) fail("طلب غير صحيح.", 400, "BAD_HIDDEN");
  const hidden = [...new Set(hiddenQuestionIds)].sort();
  const known = new Set(bundled.sections.flatMap(s => s.questions.map(q => q.questionId)));
  const unknown = hidden.find(id => !known.has(id));
  if (unknown !== undefined) fail("سؤال غير موجود في الاستمارة: " + unknown, 400, "UNKNOWN_QUESTION");
  for (const section of template.sections) {
    section.questions = section.questions.filter(q => !hidden.includes(q.questionId));
    if (!section.questions.length) fail("لا يمكن إخفاء كل أسئلة القسم «" + section.title + "».", 400, "SECTION_EMPTY");
  }
  validateExamFormTemplate(template, { projectCode });
  return { template, hidden };
}

// The questions the teacher can hide before the first open (prompts only, no key), and what was hidden once frozen.
async function classFormQuestions(container, projectCode, classId) {
  const bundled = getExamFormTemplate(projectCode);
  if (!bundled) fail("هذا المشروع لا يملك استمارة امتحان.", 400, "NO_FORM");
  const stored = await loadClassForm(container, projectCode, classId);
  return {
    frozen: !!stored, hiddenQuestionIds: stored && Array.isArray(stored.hiddenQuestionIds) ? stored.hiddenQuestionIds : [],
    sections: bundled.sections.map(s => ({
      sectionId: s.sectionId, title: s.title, weight: s.weight,
      questions: s.questions.map(q => ({ questionId: q.questionId, prompt: q.prompt, kind: q.kind, grading: q.grading, required: q.required === true }))
    }))
  };
}

/**
 * Opens the form for a class. The FIRST open freezes the bundled template into the class — without the questions the
 * teacher hides (`hiddenQuestionIds`, Phase F3); a later open (after a close) keeps those questions, so answers already
 * saved always match the questions the student saw. Hiding a question after the first open is refused.
 * Phase F4 — `imageAnswers: true` switches the class's image questions on (students attach images, and a required image
 * question then counts for a submit). It may be switched on at the first open or by a later open, and never off again:
 * a class whose students attached images cannot lose the input. Any other value leaves the class as it is.
 * Phase F5 (files) — `fileAnswers: true` does the same for the class's file questions, with the same rules.
 */
async function openClassForm(container, projectCode, classId, { actor, now, hiddenQuestionIds, imageAnswers, fileAnswers }) {
  if (imageAnswers !== undefined && typeof imageAnswers !== "boolean") fail("طلب غير صحيح.", 400, "BAD_IMAGE_ANSWERS");
  if (fileAnswers !== undefined && typeof fileAnswers !== "boolean") fail("طلب غير صحيح.", 400, "BAD_FILE_ANSWERS");
  let imagesSwitchedOn = false, filesSwitchedOn = false;
  const bundled = getExamFormTemplate(projectCode);
  if (!bundled) fail("هذا المشروع لا يملك استمارة امتحان.", 400, "NO_FORM");
  const frozen = withoutHidden(bundled, hiddenQuestionIds, projectCode);
  let first = false, changed = false;
  const doc = await mutateJsonWithRetry(container, getStorageNamespace(projectCode).examFormClassName(classId), current => {
    first = !current;
    if (current) {
      trustedTemplate(current, projectCode);
      if (frozen.hidden.length) fail("ثُبّتت أسئلة الاستمارة عند أول فتح، ولا يمكن إخفاء سؤال بعده.", 409, "FORM_FROZEN");
      if (imageAnswers === false && current.imageAnswers === true) fail("فُعّلت أسئلة الصور لهذا الصف، ولا يمكن إيقافها.", 409, "IMAGES_FROZEN");
      if (fileAnswers === false && current.fileAnswers === true) fail("فُعّلت أسئلة الملفات لهذا الصف، ولا يمكن إيقافها.", 409, "FILES_FROZEN");
      const reopen = current.state !== "open";
      imagesSwitchedOn = imageAnswers === true && current.imageAnswers !== true;
      filesSwitchedOn = fileAnswers === true && current.fileAnswers !== true;
      changed = reopen || imagesSwitchedOn || filesSwitchedOn;
      if (!changed) return current;
      return {
        ...current, state: "open", updatedAt: now,
        ...(reopen ? { reopenedAt: now, reopenedBy: actor || "" } : {}),
        ...(imagesSwitchedOn ? { imageAnswers: true, imageAnswersAt: now, imageAnswersBy: actor || "" } : {}),
        ...(filesSwitchedOn ? { fileAnswers: true, fileAnswersAt: now, fileAnswersBy: actor || "" } : {})
      };
    }
    changed = true;
    imagesSwitchedOn = imageAnswers === true;
    filesSwitchedOn = fileAnswers === true;
    return {
      schemaVersion: 1, projectCode, classId, state: "open", formVersion: bundled.formVersion,
      template: frozen.template, hiddenQuestionIds: frozen.hidden, openedAt: now, openedBy: actor || "", updatedAt: now,
      ...(imagesSwitchedOn ? { imageAnswers: true, imageAnswersAt: now, imageAnswersBy: actor || "" } : {}),
      ...(filesSwitchedOn ? { fileAnswers: true, fileAnswersAt: now, fileAnswersBy: actor || "" } : {})
    };
  });
  return { doc, first, changed, imagesSwitchedOn, filesSwitchedOn };
}

// Closes the form: students keep reading what they wrote and can no longer save or submit. Nothing is deleted.
async function closeClassForm(container, projectCode, classId, { actor, now }) {
  let changed = false;
  const doc = await mutateJsonWithRetry(container, getStorageNamespace(projectCode).examFormClassName(classId), current => {
    if (!current) fail("الاستمارة لم تُفتح لهذا الصف.", 404, "FORM_NOT_OPENED");
    changed = current.state === "open";
    return changed ? { ...current, state: "closed", closedAt: now, closedBy: actor || "", updatedAt: now } : current;
  });
  return { doc, changed };
}

function studentBody(classForm, template, doc) {
  const answers = doc && doc.answers && typeof doc.answers === "object" ? doc.answers : {};
  return {
    available: true,
    state: classForm.state === "open" ? "open" : "closed",
    form: toStudentView(template),
    answers,
    revision: doc ? doc.revision : 0,
    status: doc ? doc.status : "draft",
    submittedAt: (doc && doc.submittedAt) || "",
    updatedAt: (doc && doc.updatedAt) || "",
    progress: formProgress(template, answers, rulesOf(classForm)),
    deferredKinds: [...deferredKindsOf(rulesOf(classForm))],
    // Phase F3 — the note of a returned form; after the approval, the mark and the teacher's ratings (never an answer key).
    ...studentReviewView(template, doc)
  };
}

// The student's own view: the questions (no key), their answers and where they stand. `available: false` while the
// teacher has never opened the form for this class.
async function readStudentForm(container, projectCode, classId, studentId) {
  const classForm = await loadClassForm(container, projectCode, classId);
  if (!classForm) return { available: false };
  const template = trustedTemplate(classForm, projectCode);
  const doc = await downloadJsonOrNull(container, getStorageNamespace(projectCode).examFormAnswersName(classId, studentId));
  return studentBody(classForm, template, doc);
}

// Phase F2-UI — the few facts the student's project page shows on its form card, or null when the project ships no form
// or the teacher never opened it for this class. No question, no answer and no key: only the state and the counts.
async function studentFormSummary(container, projectCode, classId, studentId) {
  if (!getExamFormTemplate(projectCode)) return null;
  const classForm = await loadClassForm(container, projectCode, classId);
  if (!classForm) return null;
  const template = trustedTemplate(classForm, projectCode);
  const doc = await downloadJsonOrNull(container, getStorageNamespace(projectCode).examFormAnswersName(classId, studentId));
  const progress = formProgress(template, doc && doc.answers, rulesOf(classForm));
  return {
    title: template.title, state: classForm.state === "open" ? "open" : "closed",
    status: doc && ["submitted", "returned", "approved"].includes(doc.status) ? doc.status : "draft", started: !!doc, answered: progress.answered, total: progress.total,
    ...(doc && doc.status === "approved" && doc.result ? { mark: doc.result.mark, outOf: doc.result.outOf } : {})
  };
}

// One student write (draft or submit): canonical class membership, then ONE CAS round on the student's document. The
// class form is read again INSIDE the round, so a form the teacher closed meanwhile refuses the write.
async function writeStudentForm(container, projectCode, classId, studentId, apply) {
  const membership = await svc.requireStudentInClass(container, studentId, classId);
  if (!membership.ok) fail("لا يمكنك تعديل هذه الاستمارة.", 403, "NOT_MEMBER");
  const ns = getStorageNamespace(projectCode);
  let outcome = null, classForm = null, template = null;
  const written = await mutateJsonWithRetry(container, ns.examFormAnswersName(classId, studentId), async current => {
    classForm = await downloadJsonOrNull(container, ns.examFormClassName(classId));
    if (!classForm) fail("الاستمارة غير متاحة لصفك.", 404, "FORM_NOT_OPENED");
    template = trustedTemplate(classForm, projectCode);
    if (classForm.state !== "open") fail("أغلق المعلم الاستمارة. إجاباتك المحفوظة باقية.", 409, "FORM_CLOSED");
    outcome = apply(current, template, rulesOf(classForm));
    if (outcome.changed === false) { const err = new Error("NO_CHANGE"); err.code = "NO_CHANGE"; err.current = current; throw err; }
    return outcome.doc;
  }).catch(e => {
    if (e && e.code === "NO_CHANGE") return e.current || null;
    throw e;
  });
  return { student: membership.student, body: studentBody(classForm, template, written), changed: !outcome || outcome.changed !== false };
}

function saveStudentDraft(container, projectCode, classId, studentId, { patch, baseRevision, now }) {
  return writeStudentForm(container, projectCode, classId, studentId, (current, template, rules) =>
    applyDraft(current, template, { patch, baseRevision, identity: { projectCode, classId, studentId }, now, rules }));
}

function submitStudentForm(container, projectCode, classId, studentId, { baseRevision, now }) {
  return writeStudentForm(container, projectCode, classId, studentId, (current, template, rules) => applySubmit(current, template, { baseRevision, now, rules }));
}

// ---------------------------------------------------------------------------------------------------------------------
// Phase F4 — the images a student attaches (docs/enterprise-project-exam-form-f4.md).
//
// Attach: the upload is bounded, sniffed, decoded and re-encoded by the platform's ONE image pipeline (profile-image.js;
// metadata never survives), stored as a NEW immutable blob under the student's own prefix, and only then referenced from
// the answer in one CAS round. A reference therefore never points at a blob that is not there; when the round refuses the
// image (the question is full, the form was closed or submitted meanwhile) the blob just written is removed again.
// Remove: the reference goes first (CAS), then the blob, best effort — a failed delete leaves an unreferenced blob that no
// route can serve, never a broken reference.
// ---------------------------------------------------------------------------------------------------------------------
async function bestEffortDelete(container, name) {
  try { await deleteBlob(container, name); return true; } catch { return false; }
}

async function addStudentImage(container, projectCode, classId, studentId, { questionId, dataUrl, now }) {
  // Everything that can be refused without touching the image is refused first (cheap checks before the decode).
  const membership = await svc.requireStudentInClass(container, studentId, classId);
  if (!membership.ok) fail("لا يمكنك تعديل هذه الاستمارة.", 403, "NOT_MEMBER");
  const ns = getStorageNamespace(projectCode);
  const before = await loadClassForm(container, projectCode, classId);
  if (!before) fail("الاستمارة غير متاحة لصفك.", 404, "FORM_NOT_OPENED");
  if (before.state !== "open") fail("أغلق المعلم الاستمارة. إجاباتك المحفوظة باقية.", 409, "FORM_CLOSED");
  images.imageQuestion(trustedTemplate(before, projectCode), questionId, rulesOf(before));

  const normalized = await normalizeEvidenceImage(decodeImageDataUrl(dataUrl, EVIDENCE_MAX_UPLOAD_BYTES));
  const image = { id: crypto.randomBytes(12).toString("hex"), width: normalized.width, height: normalized.height, bytes: normalized.buffer.length };
  const blobName = ns.examFormImageName(classId, studentId, image.id);
  await uploadBinary(container, blobName, normalized.buffer, normalized.contentType);
  try {
    const r = await writeStudentForm(container, projectCode, classId, studentId, (current, template, rules) =>
      images.applyAddImage(current, template, { questionId, image, identity: { projectCode, classId, studentId }, now, rules }));
    return { ...r, image };
  } catch (e) {
    await bestEffortDelete(container, blobName);                                  // the round refused it: no orphan is left behind
    throw e;
  }
}

async function removeStudentImage(container, projectCode, classId, studentId, { questionId, imageId, now }) {
  const r = await writeStudentForm(container, projectCode, classId, studentId, (current, template, rules) =>
    images.applyRemoveImage(current, template, { questionId, imageId, now, rules }));
  if (r.changed) await bestEffortDelete(container, getStorageNamespace(projectCode).examFormImageName(classId, studentId, imageId));
  return r;
}

// One attached image, or null: only an image that THIS student's answers document references is ever served — to the
// student who owns it (the student route) and to the teacher of the class (the teacher route, after its own tenancy and
// membership checks). The id alone is never enough: the blob name is built from the class and the student too.
async function readStudentImage(container, projectCode, classId, studentId, imageId) {
  if (!images.isImageId(imageId)) return null;
  const ns = getStorageNamespace(projectCode);
  const doc = await downloadJsonOrNull(container, ns.examFormAnswersName(classId, studentId));
  if (!images.referencesImage(doc, imageId)) return null;
  const blob = await downloadBinaryOrNull(container, ns.examFormImageName(classId, studentId, imageId));
  return blob ? { buffer: blob.buffer, contentType: "image/webp" } : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Phase F5 (files) — the file a student attaches to a file question (docs/enterprise-project-exam-form-f5-files.md).
//
// A file cannot be re-encoded like an image, so it is never interpreted or rendered by the platform: it is bounded, its
// name reduced to a label, its bytes checked against the kind the question asks for, stored as an opaque blob under the
// student's own prefix, and only then referenced from the answer in one CAS round. ONE file per question: the new
// reference replaces the old one in the same round, and the replaced blob is removed afterwards, best effort. When the
// round refuses the file the blob just written is removed again, so no orphan is left behind.
// ---------------------------------------------------------------------------------------------------------------------
async function addStudentFile(container, projectCode, classId, studentId, { questionId, fileName, dataBase64, now }) {
  // Everything that can be refused without reading the upload is refused first.
  const membership = await svc.requireStudentInClass(container, studentId, classId);
  if (!membership.ok) fail("لا يمكنك تعديل هذه الاستمارة.", 403, "NOT_MEMBER");
  const ns = getStorageNamespace(projectCode);
  const before = await loadClassForm(container, projectCode, classId);
  if (!before) fail("الاستمارة غير متاحة لصفك.", 404, "FORM_NOT_OPENED");
  if (before.state !== "open") fail("أغلق المعلم الاستمارة. إجاباتك المحفوظة باقية.", 409, "FORM_CLOSED");
  const question = files.fileQuestion(trustedTemplate(before, projectCode), questionId, rulesOf(before));
  const { name, ext } = files.describeFileName(question, fileName);
  const buffer = files.decodeFileUpload(dataBase64);
  files.assertFileContent(ext, buffer);

  const file = { id: crypto.randomBytes(12).toString("hex"), name, ext, bytes: buffer.length };
  const blobName = ns.examFormFileName(classId, studentId, file.id);
  await uploadBinary(container, blobName, buffer, "application/octet-stream");
  let replacedId = null;
  try {
    const r = await writeStudentForm(container, projectCode, classId, studentId, (current, template, rules) => {
      const outcome = files.applySetFile(current, template, { questionId, file, identity: { projectCode, classId, studentId }, now, rules });
      replacedId = outcome.replacedId;
      return outcome;
    });
    if (replacedId) await bestEffortDelete(container, ns.examFormFileName(classId, studentId, replacedId));
    return { ...r, file };
  } catch (e) {
    await bestEffortDelete(container, blobName);                                  // the round refused it: no orphan is left behind
    throw e;
  }
}

async function removeStudentFile(container, projectCode, classId, studentId, { questionId, fileId, now }) {
  const r = await writeStudentForm(container, projectCode, classId, studentId, (current, template, rules) =>
    files.applyRemoveFile(current, template, { questionId, fileId, now, rules }));
  if (r.changed) await bestEffortDelete(container, getStorageNamespace(projectCode).examFormFileName(classId, studentId, fileId));
  return r;
}

// One attached file, or null: only a file that THIS student's answers document references is ever served — to the student
// who owns it (the student route) and to the teacher of the class (the teacher route, after its own tenancy and membership
// checks). The id alone is never enough: the blob name is built from the class and the student too. The caller serves it
// as a download only.
async function readStudentFile(container, projectCode, classId, studentId, fileId) {
  if (!files.isFileId(fileId)) return null;
  const ns = getStorageNamespace(projectCode);
  const doc = await downloadJsonOrNull(container, ns.examFormAnswersName(classId, studentId));
  const file = files.referencedFile(doc, fileId);
  if (!file) return null;
  const blob = await downloadBinaryOrNull(container, ns.examFormFileName(classId, studentId, fileId));
  return blob ? { buffer: blob.buffer, name: file.name, ext: file.ext, disposition: files.attachmentDisposition(file.name, file.ext) } : null;
}

module.exports = { addStudentFile, removeStudentFile, readStudentFile, trustedTemplate, rulesOf, loadClassForm, classFormState, classFormQuestions, openClassForm, closeClassForm, readStudentForm, studentFormSummary, saveStudentDraft, submitStudentForm, addStudentImage, removeStudentImage, readStudentImage };
