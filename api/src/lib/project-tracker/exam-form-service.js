// Phase F2 — storage side of the project exam form: the class's form (opened by the teacher, its questions frozen at that
// moment) and one answers document per student. Every write is a CAS round (mutateJsonWithRetry). Domain results and
// errors with httpStatus only; the routes own the status codes, the messages and the audit records.
//
//   class form   platform/project-exam-forms/<code>/classes/<classId>.json
//                { schemaVersion, projectCode, classId, state: "open" | "closed", formVersion, template, openedAt, openedBy, … }
//   answers      platform/project-exam-forms/<code>/answers/<classId>/<studentId>.json
//                { schemaVersion, projectCode, classId, studentId, formVersion, status: "draft" | "submitted", answers, revision, … }
//
// The class form holds the WHOLE template, answer keys included: it is server-side only. A student is sent
// toStudentView(template) and their own answers, never the stored class form.
const { downloadJsonOrNull, mutateJsonWithRetry } = require("../platform-storage");
const { getStorageNamespace, getExamFormTemplate } = require("./registry");
const { validateExamFormTemplate, toStudentView, summarizeExamForm } = require("./exam-form");
const { applyDraft, applySubmit, formProgress, DEFERRED_KINDS } = require("./exam-form-answers");
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
    openedAt: stored.openedAt || "", closedAt: stored.closedAt || "", summary: summarizeExamForm(trustedTemplate(stored, projectCode))
  };
}

/**
 * Opens the form for a class. The FIRST open freezes the bundled template into the class; a later open (after a close)
 * keeps those questions, so answers already saved always match the questions the student saw.
 */
async function openClassForm(container, projectCode, classId, { actor, now }) {
  const bundled = getExamFormTemplate(projectCode);
  if (!bundled) fail("هذا المشروع لا يملك استمارة امتحان.", 400, "NO_FORM");
  let first = false, changed = false;
  const doc = await mutateJsonWithRetry(container, getStorageNamespace(projectCode).examFormClassName(classId), current => {
    first = !current;
    if (current) {
      trustedTemplate(current, projectCode);
      changed = current.state !== "open";
      return changed ? { ...current, state: "open", reopenedAt: now, reopenedBy: actor || "", updatedAt: now } : current;
    }
    changed = true;
    return {
      schemaVersion: 1, projectCode, classId, state: "open", formVersion: bundled.formVersion,
      template: JSON.parse(JSON.stringify(bundled)), openedAt: now, openedBy: actor || "", updatedAt: now
    };
  });
  return { doc, first, changed };
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
    progress: formProgress(template, answers),
    deferredKinds: [...DEFERRED_KINDS]
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
    outcome = apply(current, template);
    if (outcome.changed === false) { const err = new Error("NO_CHANGE"); err.code = "NO_CHANGE"; err.current = current; throw err; }
    return outcome.doc;
  }).catch(e => {
    if (e && e.code === "NO_CHANGE") return e.current || null;
    throw e;
  });
  return { student: membership.student, body: studentBody(classForm, template, written), changed: !outcome || outcome.changed !== false };
}

function saveStudentDraft(container, projectCode, classId, studentId, { patch, baseRevision, now }) {
  return writeStudentForm(container, projectCode, classId, studentId, (current, template) =>
    applyDraft(current, template, { patch, baseRevision, identity: { projectCode, classId, studentId }, now }));
}

function submitStudentForm(container, projectCode, classId, studentId, { baseRevision, now }) {
  return writeStudentForm(container, projectCode, classId, studentId, (current, template) => applySubmit(current, template, { baseRevision, now }));
}

module.exports = { loadClassForm, classFormState, openClassForm, closeClassForm, readStudentForm, saveStudentDraft, submitStudentForm };
