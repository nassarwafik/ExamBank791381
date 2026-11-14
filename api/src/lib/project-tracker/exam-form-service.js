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
const { downloadJsonOrNull, mutateJsonWithRetry } = require("../platform-storage");
const { getStorageNamespace, getExamFormTemplate } = require("./registry");
const { validateExamFormTemplate, toStudentView, summarizeExamForm } = require("./exam-form");
const { applyDraft, applySubmit, formProgress, DEFERRED_KINDS } = require("./exam-form-answers");
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
    hiddenQuestionIds: Array.isArray(stored.hiddenQuestionIds) ? stored.hiddenQuestionIds : []
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
 */
async function openClassForm(container, projectCode, classId, { actor, now, hiddenQuestionIds }) {
  const bundled = getExamFormTemplate(projectCode);
  if (!bundled) fail("هذا المشروع لا يملك استمارة امتحان.", 400, "NO_FORM");
  const frozen = withoutHidden(bundled, hiddenQuestionIds, projectCode);
  let first = false, changed = false;
  const doc = await mutateJsonWithRetry(container, getStorageNamespace(projectCode).examFormClassName(classId), current => {
    first = !current;
    if (current) {
      trustedTemplate(current, projectCode);
      if (frozen.hidden.length) fail("ثُبّتت أسئلة الاستمارة عند أول فتح، ولا يمكن إخفاء سؤال بعده.", 409, "FORM_FROZEN");
      changed = current.state !== "open";
      return changed ? { ...current, state: "open", reopenedAt: now, reopenedBy: actor || "", updatedAt: now } : current;
    }
    changed = true;
    return {
      schemaVersion: 1, projectCode, classId, state: "open", formVersion: bundled.formVersion,
      template: frozen.template, hiddenQuestionIds: frozen.hidden, openedAt: now, openedBy: actor || "", updatedAt: now
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
    deferredKinds: [...DEFERRED_KINDS],
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
  const progress = formProgress(template, doc && doc.answers);
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

module.exports = { trustedTemplate, loadClassForm, classFormState, classFormQuestions, openClassForm, closeClassForm, readStudentForm, studentFormSummary, saveStudentDraft, submitStudentForm };
