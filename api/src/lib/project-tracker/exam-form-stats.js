// The class statistics of the project exam form, for the charts of the teacher's «الإحصائيات» view: how far each student
// filled the form, where the class stands section by section, and who is writing right now. A read only: ONE listing of the
// class's answers documents and the class form, nothing is written.
//
// The body is NUMBERS ONLY — states, counts, percentages and times. It never carries an answer, a prompt, an answer key, the
// rubric, a rating or a mark: the review reads (exam-form-review-service.js) stay the only place those are served. It is
// served behind the teacher route's capability and tenancy checks (api/src/functions/project-tracker.js).
const { listJson } = require("../platform-storage");
const { getStorageNamespace, getExamFormTemplate } = require("./registry");
const { isAnswered, deferredKindsOf } = require("./exam-form-answers");
const { loadClassForm, trustedTemplate, rulesOf } = require("./exam-form-service");

const STATUSES = ["draft", "submitted", "returned", "approved"];
const statusOf = doc => (doc && STATUSES.includes(doc.status) ? doc.status : "not_started");
// A student counts as «writing now» while their form is theirs to write and it was saved within this window. The page saves
// a draft within a second of the last keystroke, so two minutes covers a student who stops to think.
const ACTIVE_WINDOW_MS = 2 * 60 * 1000;
const BUCKETS = ["0", "1-25", "26-50", "51-75", "76-99", "100"];
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
function bucketOf(p) {
  if (p <= 0) return "0";
  if (p >= 100) return "100";
  return p <= 25 ? "1-25" : p <= 50 ? "26-50" : p <= 75 ? "51-75" : "76-99";
}

/**
 * Pure: the statistics of one class from its frozen form, its rules, the class list and the stored answers documents.
 * `students` is the class list ({ studentId, displayName }); a document of someone who is no longer in the class is ignored.
 * Questions of a deferred kind are not counted, exactly as formProgress does not count them.
 */
function buildFormStats(classForm, template, students, docs, nowIso) {
  const rules = rulesOf(classForm);
  const deferred = deferredKindsOf(rules);
  const sections = template.sections
    .map(s => ({ sectionId: s.sectionId, title: s.title, order: s.order, questions: s.questions.filter(q => !deferred.has(q.kind)) }))
    .filter(s => s.questions.length > 0);
  const total = sections.reduce((n, s) => n + s.questions.length, 0);
  const byStudent = new Map((docs || []).filter(d => d && d.studentId).map(d => [String(d.studentId), d]));
  const nowMs = Date.parse(nowIso);
  const counts = { not_started: 0, draft: 0, submitted: 0, returned: 0, approved: 0 };
  const buckets = Object.fromEntries(BUCKETS.map(b => [b, 0]));
  const sectionAnswered = sections.map(() => 0), sectionComplete = sections.map(() => 0);
  let activeNow = 0, answeredSum = 0;

  const rows = students.map(s => {
    const doc = byStudent.get(String(s.studentId)) || null;
    const status = statusOf(doc);
    counts[status] += 1;
    const stored = doc && doc.answers && typeof doc.answers === "object" ? doc.answers : {};
    let answered = 0;
    sections.forEach((sec, i) => {
      const n = sec.questions.filter(q => isAnswered(q, stored[q.questionId], rules)).length;
      answered += n; sectionAnswered[i] += n;
      if (n === sec.questions.length) sectionComplete[i] += 1;
    });
    answeredSum += answered;
    const percent = pct(answered, total);
    buckets[bucketOf(percent)] += 1;
    const updatedAt = (doc && doc.updatedAt) || "";
    const active = (status === "draft" || status === "returned") && !!updatedAt && Number.isFinite(nowMs) && nowMs - Date.parse(updatedAt) <= ACTIVE_WINDOW_MS && nowMs - Date.parse(updatedAt) >= 0;
    if (active) activeNow += 1;
    return { studentId: s.studentId, displayName: s.displayName, status, answered, total, percent, updatedAt, submittedAt: (doc && doc.submittedAt) || "", active };
  });

  const studentCount = rows.length;
  return {
    state: classForm.state === "open" ? "open" : "closed",
    title: template.title, formVersion: template.formVersion,
    generatedAt: nowIso, activeWindowSeconds: ACTIVE_WINDOW_MS / 1000,
    studentCount, totalQuestions: total,
    counts, buckets, activeNow,
    averagePercent: pct(answeredSum, total * studentCount),
    students: rows,
    sections: sections.map((sec, i) => ({
      sectionId: sec.sectionId, title: sec.title, order: sec.order, questions: sec.questions.length,
      averagePercent: pct(sectionAnswered[i], sec.questions.length * studentCount), completeCount: sectionComplete[i]
    }))
  };
}

/** The statistics of one class, or null when the project ships no form or this class's form was never opened. */
async function classFormStats(container, projectCode, classId, students, nowIso) {
  if (!getExamFormTemplate(projectCode)) return null;
  const classForm = await loadClassForm(container, projectCode, classId);
  if (!classForm) return null;
  const template = trustedTemplate(classForm, projectCode);
  const docs = await listJson(container, getStorageNamespace(projectCode).examFormAnswersPrefix(classId));
  return buildFormStats(classForm, template, students, docs, nowIso);
}

module.exports = { ACTIVE_WINDOW_MS, BUCKETS, buildFormStats, classFormStats };
