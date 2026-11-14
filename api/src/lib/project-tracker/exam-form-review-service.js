// Phase F3 — storage side of the teacher's review of the project exam form: the class list with every student's state, one
// student's answers with the evidence and the review, and the four teacher writes (rate, return, approve, take an approval
// back). Every write is one CAS round on the student's answers document, with the class form re-read and re-validated
// inside it. Domain results and errors with httpStatus only; the route owns the status codes, messages and audit records.
//
// The teacher view carries the WHOLE frozen template, answer keys included: it is served only behind the teacher route's
// capability and tenancy checks (api/src/functions/project-tracker.js).
const { downloadJsonOrNull, listJson, mutateJsonWithRetry } = require("../platform-storage");
const { getStorageNamespace } = require("./registry");
const { formProgress } = require("./exam-form-answers");
const { loadClassForm, trustedTemplate, rulesOf } = require("./exam-form-service");
const review = require("./exam-form-review");
const svc = require("./service");

function fail(message, httpStatus, code) {
  const err = new Error(message);
  err.httpStatus = httpStatus;
  if (code) err.code = code;
  throw err;
}
const STATUSES = ["draft", "submitted", "returned", "approved"];
const statusOf = doc => (doc && STATUSES.includes(doc.status) ? doc.status : "not_started");
const weighted = template => template.sections.filter(s => s.weight > 0).length;

async function openedForm(container, projectCode, classId) {
  const classForm = await loadClassForm(container, projectCode, classId);
  if (!classForm) fail("الاستمارة لم تُفتح لهذا الصف.", 404, "FORM_NOT_OPENED");
  return { classForm, template: trustedTemplate(classForm, projectCode) };
}

/**
 * Every student of the class with the state of their form. `students` is the class list the route already has
 * ({ studentId, displayName, code }); a document of someone who is no longer in the class is not listed.
 */
async function classFormStudents(container, projectCode, classId, students) {
  const { classForm, template } = await openedForm(container, projectCode, classId);
  const docs = await listJson(container, getStorageNamespace(projectCode).examFormAnswersPrefix(classId));
  const byStudent = new Map(docs.filter(d => d && d.studentId).map(d => [String(d.studentId), d]));
  const toRate = weighted(template);
  const counts = { not_started: 0, draft: 0, submitted: 0, returned: 0, approved: 0 };
  const rows = students.map(s => {
    const doc = byStudent.get(String(s.studentId)) || null;
    const status = statusOf(doc);
    counts[status] += 1;
    const progress = formProgress(template, doc && doc.answers, rulesOf(classForm));   // Phase F4: image questions count where the class switched them on
    return {
      studentId: s.studentId, displayName: s.displayName, code: s.code, status,
      answered: progress.answered, total: progress.total,
      submittedAt: (doc && doc.submittedAt) || "", updatedAt: (doc && doc.updatedAt) || "",
      rated: doc ? toRate - review.unratedSections(template, doc).length : 0, toRate,
      mark: status === "approved" && doc.result ? doc.result.mark : null
    };
  });
  return { state: classForm.state === "open" ? "open" : "closed", formVersion: template.formVersion, title: template.title, counts, students: rows };
}

function teacherBody(classForm, template, student, doc) {
  const answers = doc && doc.answers && typeof doc.answers === "object" ? doc.answers : {};
  const evidence = review.autoEvidence(template, answers);
  const stored = doc && doc.review && typeof doc.review === "object" ? doc.review : null;
  return {
    state: classForm.state === "open" ? "open" : "closed",
    student,
    form: { projectCode: template.projectCode, formVersion: template.formVersion, title: template.title, rubric: template.rubric, sections: template.sections },
    answers,
    status: statusOf(doc),
    revision: doc ? doc.revision : 0,
    submittedAt: (doc && doc.submittedAt) || "", updatedAt: (doc && doc.updatedAt) || "",
    returnNote: (doc && doc.returnNote) || "", approvedAt: (doc && doc.approvedAt) || "",
    progress: formProgress(template, answers, rulesOf(classForm)),
    auto: evidence,
    review: { ratings: (stored && stored.ratings) || {}, generalNote: (stored && stored.generalNote) || "", updatedAt: (stored && stored.updatedAt) || "" },
    unrated: doc ? review.unratedSections(template, doc) : template.sections.filter(s => s.weight > 0).map(s => s.sectionId),
    result: doc && doc.status === "approved" && doc.result ? doc.result : null
  };
}

// One student's form as the teacher reviews it. A student who is not a member of the class is «not found».
async function teacherStudentForm(container, projectCode, classId, studentId) {
  const membership = await svc.requireStudentInClass(container, studentId, classId);
  if (!membership.ok) fail("الطالب غير موجود في هذا الصف.", 404, "NOT_MEMBER");
  const { classForm, template } = await openedForm(container, projectCode, classId);
  const doc = await downloadJsonOrNull(container, getStorageNamespace(projectCode).examFormAnswersName(classId, studentId));
  return teacherBody(classForm, template, membership.student, doc);
}

// One teacher write: membership, then ONE CAS round. The review of a CLOSED form is allowed (closing only stops student writes).
async function reviewWrite(container, projectCode, classId, studentId, apply) {
  const membership = await svc.requireStudentInClass(container, studentId, classId);
  if (!membership.ok) fail("الطالب غير موجود في هذا الصف.", 404, "NOT_MEMBER");
  const ns = getStorageNamespace(projectCode);
  let outcome = null, opened = null, previous = null;
  const written = await mutateJsonWithRetry(container, ns.examFormAnswersName(classId, studentId), async current => {
    opened = await openedForm(container, projectCode, classId);
    previous = current || null;
    outcome = apply(current, opened.template);
    if (outcome.changed === false) { const err = new Error("NO_CHANGE"); err.code = "NO_CHANGE"; throw err; }
    return outcome.doc;
  }).catch(e => {
    if (e && e.code === "NO_CHANGE") return previous;
    throw e;
  });
  return { changed: outcome.changed !== false, previousStatus: statusOf(previous), student: membership.student, body: teacherBody(opened.classForm, opened.template, membership.student, written) };
}

const saveReview = (container, projectCode, classId, studentId, input) =>
  reviewWrite(container, projectCode, classId, studentId, (current, template) => review.applyReview(current, template, input));
const returnForm = (container, projectCode, classId, studentId, input) =>
  reviewWrite(container, projectCode, classId, studentId, (current, template) => review.applyReturn(current, template, input));
const approveForm = (container, projectCode, classId, studentId, input) =>
  reviewWrite(container, projectCode, classId, studentId, (current, template) => review.applyApprove(current, template, input));
const unapproveForm = (container, projectCode, classId, studentId, input) =>
  reviewWrite(container, projectCode, classId, studentId, current => review.applyUnapprove(current, input));

module.exports = { classFormStudents, teacherStudentForm, saveReview, returnForm, approveForm, unapproveForm };
