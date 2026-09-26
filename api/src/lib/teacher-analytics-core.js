const { listJson, listBlobNames, downloadManyJson, mapConcurrent, getReadConcurrency } = require("./platform-storage");
// Roadmap #23 — teacher analytics must interpret grading state through the ONE canonical R14 helper
// (deriveGradingStatus), never a raw `finalized === false` check, so its pending-review counts agree with
// the gradebook (assignment-results), assignment-review and the student dashboard. The canonical rule also
// treats `manualReviewMarks > 0` as pending and handles legacy results whose `finalized` field is absent.
const { deriveGradingStatus } = require("./grading-status");
// Roadmap #24 — the student POPULATION is class MEMBERSHIP (role student, not archived, in class) through the ONE
// canonical helper; `active:false` is login eligibility only and must not drop a student from analytics.
const { isStudentClassMember } = require("./class-membership");
// Roadmap #34 — lifecycle AUTHORITY: a class is current only through the canonical class-lifecycle helper (status
// "archived" OR active:false ⇒ archived; never the raw `active` flag), and an assignment is "takeable now" only
// through the canonical assignment-lifecycle helper. Teacher analytics is CURRENT/operational analytics: with no
// classId requested, canonical-archived classes contribute nothing (students, assignments, KPIs, trends, follow-up);
// an explicitly requested class — archived or not — is a HISTORICAL view and is served unchanged.
const { normalizeClassStatus } = require("./class-lifecycle");
const { normalizeAssignmentStatus } = require("./assignment-lifecycle");

const CLASS_PREFIX = "platform/classes/";
const USER_PREFIX = "platform/users/";
const ASSIGNMENT_PREFIX = "platform/assignments/";
const SUBMISSION_PREFIX = "platform/submissions/";

// Roadmap #28 — scope-aware submission reads. Every submission writer (student-submission, assignment-review)
// stores exactly ONE document per (assignment, student) at "platform/submissions/{assignmentId}/{studentId}.json"
// (UUID ids; the only format ever used). Analytics only ever consults the submission map for assignments in
// its own already-canonical population (published + inside the date range — see computeTeacherAnalytics), so
// the blob NAME is used as a PERFORMANCE PREFILTER: only blobs under a candidate assignment folder are
// downloaded. The name is never academic authority — after download the document's own assignmentId/
// studentId key the map exactly as before. Conservative rules (over-inclusion is harmless, exclusion is not):
//   • a name whose first path segment is a candidate assignment id → downloaded (any depth / suffix);
//   • a name with no "/" folder segment, or not under the prefix at all (unparseable) → downloaded;
//   • only a name whose folder segment is a NON-candidate assignment id is skipped.
// Documented boundary: a hand-edited blob stored under a non-candidate folder whose JSON claims a candidate
// assignment is not downloaded (handling it would require downloading every historical submission).
function submissionPathAssignmentId(name) {
  if (typeof name !== "string" || !name.startsWith(SUBMISSION_PREFIX)) return null;
  const rest = name.slice(SUBMISSION_PREFIX.length);
  const slash = rest.indexOf("/");
  return slash > 0 ? rest.slice(0, slash) : null;
}

function selectSubmissionNames(names, candidateAssignmentIds) {
  const out = [];
  for (const name of Array.isArray(names) ? names : []) {
    const pathId = submissionPathAssignmentId(name);
    if (pathId === null || candidateAssignmentIds.has(pathId)) out.push(name);
  }
  return out;
}

// Phase 8E-3 — scope-aware submission READS. The GLOBAL scope keeps the R28 pipeline above (one listing of the
// whole submissions prefix, prefiltered by candidate folder). A CLASS or STUDENT scope never needs another class's
// submissions (classComparison is a GLOBAL-only view), so:
//   • CLASS: only the selected class's candidate assignment FOLDERS are listed ("platform/submissions/{assignmentId}/"),
//     never the whole prefix, and only those blobs are downloaded (bounded concurrency, R27). Listing order is the
//     scoped-assignment order then the folder's own order; the same 404 → null / first-failure-rejects semantics apply.
//   • STUDENT: no submission listing at all. After the Phase 8A scope validation, exactly ONE blob per scoped
//     assignment is requested at its canonical path "platform/submissions/{assignmentId}/{studentId}.json" (the only
//     path every writer ever uses); a missing blob is null = "not submitted" — there is no fallback scan.
// In every mode the blob NAME stays a prefilter: after download the document's own assignmentId / studentId key the
// map exactly as before. (Boundary, as with R28: a hand-edited blob stored outside its assignment folder — or a flat
// blob directly under the prefix — is not seen by a class/student scope.)
function submissionFolder(assignmentId) {
  return SUBMISSION_PREFIX + String(assignmentId) + "/";
}
function submissionPath(assignmentId, studentId) {
  return submissionFolder(assignmentId) + String(studentId) + ".json";
}
async function listScopedSubmissionNames(container, assignments) {
  const lists = await mapConcurrent(assignments.map(item => submissionFolder(item.assignmentId)), getReadConcurrency(), prefix => listBlobNames(container, prefix));
  return lists.flat();
}

// Phase 8A — ONE authoritative analytics scope per request. A rejected scope (a student without a class, an unknown
// student, a student who is not a current member of the requested class) is an explicit error — never a silent
// fallback that would mix another scope's numbers into the response.
class AnalyticsScopeError extends Error {
  constructor(status, message) { super(message); this.name = "AnalyticsScopeError"; this.httpStatus = status; }
}

/** Arabic count phrase for "N unsubmitted assignments" (1 / 2 / 3–10 / 11+), used by student-scope insights. */
function missingAssignmentsPhrase(n) {
  if (n === 1) return "واجب واحد غير مسلّم";
  if (n === 2) return "واجبان غير مسلّمين";
  if (n <= 10) return n + " واجبات غير مسلّمة";
  return n + " واجبًا غير مسلّم";
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(value, digits = 1) {
  const power = 10 ** digits;
  return Math.round((number(value) + Number.EPSILON) * power) / power;
}

function timestamp(value) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function inRange(value, fromMs, toMs) {
  if (!fromMs && !toMs) return true;
  const t = timestamp(value);
  if (!t) return false;
  if (fromMs && t < fromMs) return false;
  if (toMs && t > toMs) return false;
  return true;
}

function assignmentDate(assignment) {
  return assignment.dueAt || assignment.openAt || assignment.createdAt || assignment.updatedAt || "";
}

function latestAttempt(submission) {
  const attempts = Array.isArray(submission?.attempts) ? submission.attempts : [];
  if (!attempts.length) return null;
  return [...attempts].sort((a, b) => timestamp(a.submittedAt) - timestamp(b.submittedAt)).at(-1) || null;
}

function average(values) {
  const nums = values.map(number).filter(Number.isFinite);
  return nums.length ? round(nums.reduce((sum, value) => sum + value, 0) / nums.length, 1) : null;
}

function trendDelta(points) {
  const values = points.map(point => number(point.percentage));
  if (values.length < 2) return 0;
  if (values.length >= 4) {
    const previous = average(values.slice(-4, -2)) ?? 0;
    const recent = average(values.slice(-2)) ?? 0;
    return round(recent - previous, 1);
  }
  return round(values.at(-1) - values[0], 1);
}

function trendLabel(delta) {
  if (delta >= 5) return "improving";
  if (delta <= -5) return "declining";
  return "stable";
}

function studentName(student) {
  return String(student?.displayName || [student?.firstName, student?.familyName].filter(Boolean).join(" ") || "طالب");
}

function qid(question, index) {
  return String(question?.examQuestionId || question?.id || question?.number || index + 1);
}

function classAggregate(classId, assignments, students, submissionMap) {
  const classStudents = students.filter(student => isStudentClassMember(student, classId));
  const classAssignments = assignments.filter(assignment => String(assignment.classId || "") === classId);
  let submitted = 0;
  let pendingReview = 0;
  const percentages = [];

  for (const assignment of classAssignments) {
    for (const student of classStudents) {
      const submission = submissionMap.get(String(assignment.assignmentId) + "|" + String(student.userId));
      const attempt = latestAttempt(submission);
      if (!attempt) continue;
      submitted += 1;
      percentages.push(number(attempt.percentage));
      if (deriveGradingStatus(attempt) === "pendingReview") pendingReview += 1;
    }
  }

  const expected = classStudents.length * classAssignments.length;
  return {
    students: classStudents.length,
    assignments: classAssignments.length,
    expected,
    submitted,
    missing: Math.max(0, expected - submitted),
    pendingReview,
    completionRate: expected ? round(submitted / expected * 100, 1) : 0,
    average: average(percentages)
  };
}

function topicBreakdown(records) {
  const topicMap = new Map();
  for (const record of records) {
    const questions = Array.isArray(record.assignment?.examSnapshot?.questions) ? record.assignment.examSnapshot.questions : [];
    const questionMap = new Map(questions.map((question, index) => [qid(question, index), question]));
    const grades = Array.isArray(record.attempt?.questionGrades) ? record.attempt.questionGrades : [];
    for (const grade of grades) {
      if (grade?.manualReview === true && grade?.reviewed !== true) continue;
      const question = questionMap.get(String(grade?.questionId || ""));
      if (!question) continue;
      const topic = String(question.topic || "غير مصنف").trim() || "غير مصنف";
      const maxMarks = number(grade.maxMarks);
      if (maxMarks <= 0) continue;
      const current = topicMap.get(topic) || { topic, score: 0, maxMarks: 0, gradedQuestions: 0 };
      current.score += number(grade.score);
      current.maxMarks += maxMarks;
      current.gradedQuestions += 1;
      topicMap.set(topic, current);
    }
  }
  return [...topicMap.values()]
    .map(item => ({
      topic: item.topic,
      average: item.maxMarks ? round(item.score / item.maxMarks * 100, 1) : null,
      gradedQuestions: item.gradedQuestions
    }))
    .sort((a, b) => (a.average ?? 101) - (b.average ?? 101));
}

// Phase 8A — insights speak about the CURRENT scope only. GLOBAL: every current class ("عام"); CLASS: "في الصف …";
// STUDENT: the one selected student — never "طلاب يحتاجون متابعة" or any classmate-derived figure.
function buildInsights({ mode, className, performanceChange, trendCount, topicAnalytics, followUp, missing, pendingReview, neverLogged, student }) {
  const insights = [];
  const weakestTopic = topicAnalytics.find(item => item.average !== null && item.average < 70);
  const strongestTopic = [...topicAnalytics].reverse().find(item => item.average !== null && item.average >= 85);

  if (mode === "student") {
    if (performanceChange >= 3) {
      insights.push({ tone: "success", title: "أداء الطالب يتحسن", text: "ارتفعت علامات الطالب " + Math.abs(performanceChange) + "% في آخر الواجبات." });
    } else if (performanceChange <= -3) {
      insights.push({ tone: "warning", title: "تراجع في أداء الطالب", text: "انخفضت علامات الطالب " + Math.abs(performanceChange) + "% في آخر الواجبات؛ يفضّل مراجعة الواجبات الأخيرة معه." });
    } else if (trendCount >= 2) {
      insights.push({ tone: "info", title: "أداء الطالب مستقر", text: "لا يوجد تغير كبير في علامات الطالب بين آخر الواجبات." });
    }
    if (weakestTopic) {
      insights.push({ tone: "warning", title: "موضوع يحتاج مراجعة", text: "أداء الطالب في موضوع " + weakestTopic.topic + " يحتاج مراجعة (" + weakestTopic.average + "%)." });
    }
    if (strongestTopic) {
      insights.push({ tone: "success", title: "نقطة قوة", text: "أداء الطالب في موضوع " + strongestTopic.topic + " قوي بمتوسط " + strongestTopic.average + "%." });
    }
    if (missing) {
      insights.push({ tone: "warning", title: "واجبات غير مسلّمة", text: "لدى الطالب " + missingAssignmentsPhrase(missing) + " ضمن النطاق الحالي." });
    }
    if (pendingReview) {
      insights.push({ tone: "info", title: "مراجعة يدوية مطلوبة", text: "للطالب " + pendingReview + " تسليم يحتاج مراجعة أو تصحيحًا يدويًا." });
    }
    if (student && student.needsFollowUp) {
      insights.push({ tone: "warning", title: "الطالب يحتاج متابعة", text: "مؤشرات المتابعة: " + student.reasons.join("، ") + "." });
    } else if (neverLogged) {
      insights.push({ tone: "warning", title: "الطالب لم يدخل بعد", text: "لم يسجل الطالب الدخول إلى المنصة بعد." });
    }
  } else {
    const where = mode === "class" ? "في الصف " + (className || "المحدد") : "";
    const lead = text => (where ? where + "، " + text : text);
    if (performanceChange >= 3) {
      insights.push({ tone: "success", title: mode === "class" ? "اتجاه أداء الصف إيجابي" : "يوجد تحسن عام في الأداء", text: lead("ارتفع متوسط الأداء " + Math.abs(performanceChange) + "% مقارنة بالفترة السابقة من الواجبات.") });
    } else if (performanceChange <= -3) {
      insights.push({ tone: "warning", title: mode === "class" ? "يوجد تراجع في أداء الصف" : "يوجد تراجع عام في الأداء", text: lead("انخفض متوسط الأداء " + Math.abs(performanceChange) + "%؛ يفضّل مراجعة آخر الواجبات والموضوعات الأضعف.") });
    } else if (trendCount >= 2) {
      insights.push({ tone: "info", title: "الأداء مستقر", text: lead("لا يوجد تغير كبير في متوسط النتائج بين آخر الواجبات.") });
    }
    if (weakestTopic) {
      insights.push({ tone: "warning", title: "موضوع يحتاج مراجعة", text: lead("متوسط الأداء في " + weakestTopic.topic + " هو " + weakestTopic.average + "%، وهو من أضعف الموضوعات حاليًا.") });
    }
    if (strongestTopic) {
      insights.push({ tone: "success", title: "نقطة قوة", text: lead("الأداء في " + strongestTopic.topic + " قوي بمتوسط " + strongestTopic.average + "%.") });
    }
    if (followUp.length) {
      insights.push({ tone: "warning", title: "طلاب يحتاجون متابعة", text: lead(followUp.length + " طالبًا لديهم مؤشر متابعة مثل انخفاض المعدل أو واجبات ناقصة أو تراجع في الأداء.") });
    }
    if (missing) {
      insights.push({ tone: "info", title: "تسليمات ناقصة", text: lead("يوجد " + missing + " حالة عدم تسليم ضمن النطاق الحالي.") });
    }
    if (pendingReview) {
      insights.push({ tone: "info", title: "مراجعة يدوية مطلوبة", text: lead("هناك " + pendingReview + " تسليمًا يحتوي أسئلة تحتاج مراجعة أو تصحيحًا يدويًا.") });
    }
    if (neverLogged) {
      insights.push({ tone: "warning", title: "طلاب لم يدخلوا بعد", text: lead(neverLogged + " طالبًا فعّالًا لم يسجلوا الدخول إلى المنصة بعد.") });
    }
  }

  if (!insights.length) {
    insights.push({ tone: "success", title: "الوضع مستقر", text: mode === "student" ? "لا توجد مؤشرات تنبيه بارزة في بيانات الطالب الحالية." : "لا توجد مؤشرات تنبيه بارزة في البيانات الحالية." });
  }
  return insights;
}

// Extracted verbatim from the original teacherAnalytics HTTP handler so both the dashboard
// endpoint and the new AI-insight endpoint compute numbers exactly one way — the AI's advice
// must always be describing the same figures the teacher sees on screen, never a second,
// independently-computed set that could quietly drift out of sync.
// `deps` is an optional test seam (production passes nothing): `selectSubmissionNames` lets the equivalence tests
// run the exact same pipeline with the prefilter disabled (download every listed submission = the pre-R28 scan);
// `scopedSubmissionReads: false` (Phase 8E-3) runs a CLASS / STUDENT scope through the GLOBAL read path (one
// whole-prefix listing + candidate prefilter = the pre-8E-3 pipeline) so the scoped reads can be proven equivalent.
async function computeTeacherAnalytics(container, { classId: requestedClassId = "", studentId: requestedStudentId = "", fromMs = 0, toMs = 0 } = {}, deps = {}) {
  const selectNames = deps.selectSubmissionNames || selectSubmissionNames;
  // Phase 8A — ONE authoritative analytics scope per request (validated below, once the users are loaded).
  const mode = requestedStudentId ? "student" : requestedClassId ? "class" : "global";
  // Phase 8E-3 — which submission READ path serves this request (see listScopedSubmissionNames above).
  const globalReads = mode === "global" || deps.scopedSubmissionReads === false;
  // Roadmap #28: in the GLOBAL path the submissions prefix is LISTED once (as before) but downloaded only after the
  // candidate assignment population is known, so the assignment documents are read first (with the submission
  // listing), and the selected submission downloads then overlap the classes/users reads. Classes/users/assignments
  // are still read in full (users remain the sole membership authority; the roster index is never consulted).
  const [assignmentsRaw, submissionNames] = await Promise.all([
    listJson(container, ASSIGNMENT_PREFIX),
    globalReads ? listBlobNames(container, SUBMISSION_PREFIX) : Promise.resolve([])
  ]);
  const publishedAll = assignmentsRaw.filter(item => item?.assignmentId && normalizeAssignmentStatus(item) === "published");
  const scopedByDate = publishedAll.filter(item => inRange(assignmentDate(item), fromMs, toMs));
  // The submission map below is only ever queried for assignments in `scopedByDate` (records use its class-scoped
  // subset; classComparison uses all of it), so those ids are the candidate folders. Listing order is preserved
  // (a subsequence of the single listing), so last-write-wins for duplicate keys is unchanged, and the same
  // null/404 and error semantics as listJson apply (first failure rejects; nothing partial is returned).
  const candidateAssignmentIds = new Set(scopedByDate.map(item => String(item.assignmentId)));
  // Phase 8E-3 (CLASS): the selected class's candidate assignments are known from the assignment documents alone
  // (the same canonical publication / date / class rules as `scopedAssignments` below), so only their folders are
  // listed and downloaded — overlapping the classes/users reads exactly like the global path's downloads.
  const classCandidates = requestedClassId ? scopedByDate.filter(item => String(item.classId || "") === requestedClassId) : [];
  const [classesRaw, usersRaw, submissionDocsEarly] = await Promise.all([
    listJson(container, CLASS_PREFIX),
    listJson(container, USER_PREFIX),
    globalReads ? downloadManyJson(container, selectNames(submissionNames, candidateAssignmentIds))
      : mode === "class" ? listScopedSubmissionNames(container, classCandidates).then(names => downloadManyJson(container, names))
      : Promise.resolve(null)                                            // STUDENT: exact reads only after scope validation
  ]);

  const classes = classesRaw
    .filter(item => item?.classId)
    .map(item => ({
      classId: String(item.classId),
      name: String(item.name || ""),
      grade: String(item.grade || ""),
      schoolYear: String(item.schoolYear || ""),
      active: normalizeClassStatus(item) === "active"
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ar", { numeric: true }));

  const classMap = new Map(classes.map(item => [item.classId, item]));
  const students = usersRaw.filter(item => item?.role === "student");
  // Members of their own class (canonical predicate: role student, not archived). Login-disabled students stay in.
  const activeStudents = students.filter(item => isStudentClassMember(item, item.classId));
  // Roadmap #34 (C1): the GLOBAL scope is current/operational — only canonical-active classes populate it. An explicit
  // classId keeps the historical class-scoped behavior (an archived class requested on purpose is still served).
  const activeClassIds = new Set(classes.filter(item => item.active).map(item => item.classId));
  // Phase 8A — the effective scope. GLOBAL: no class, no student → every canonical-active class. CLASS: one class (an
  // explicitly requested archived class stays a historical view, R34). STUDENT: exactly ONE student who must be a
  // current canonical member of the requested class. EVERY figure below derives from this one population.
  let targetStudent = null;
  if (mode === "student") {
    if (!requestedClassId) throw new AnalyticsScopeError(400, "اختر الصف قبل اختيار الطالب.");
    targetStudent = students.find(item => String(item.userId || "") === requestedStudentId) || null;
    if (!targetStudent) throw new AnalyticsScopeError(404, "الطالب غير موجود.");
    if (!isStudentClassMember(targetStudent, requestedClassId)) throw new AnalyticsScopeError(400, "الطالب المحدد لا ينتمي إلى الصف المحدد.");
  }
  const inScope = classId => requestedClassId ? classId === requestedClassId : activeClassIds.has(classId);
  const scopedAssignments = scopedByDate.filter(item => inScope(String(item.classId || "")));
  // Phase 8E-3 (STUDENT): the scope is validated (a rejected student never widens to the class), so exactly one
  // canonical blob per scoped assignment is requested — bounded concurrency, missing = null = not submitted.
  const submissionDocs = submissionDocsEarly !== null ? submissionDocsEarly
    : await downloadManyJson(container, scopedAssignments.map(item => submissionPath(item.assignmentId, requestedStudentId)));
  const submissionsRaw = submissionDocs.filter(Boolean);
  // The class ROSTER of the scope (class/global) — the student picker's list; in STUDENT mode it stays the selected
  // class's roster for the picker only and never feeds a single analytics figure.
  const rosterStudents = activeStudents.filter(item => inScope(String(item.classId || "")));
  const scopedStudents = mode === "student" ? [targetStudent] : rosterStudents;

  const submissionMap = new Map();
  for (const submission of submissionsRaw) {
    const assignmentId = String(submission?.assignmentId || "");
    const studentId = String(submission?.studentId || "");
    if (assignmentId && studentId) submissionMap.set(assignmentId + "|" + studentId, submission);
  }

  const records = [];
  for (const assignment of scopedAssignments) {
    const classStudents = scopedStudents.filter(student => String(student.classId || "") === String(assignment.classId || ""));
    for (const student of classStudents) {
      const submission = submissionMap.get(String(assignment.assignmentId) + "|" + String(student.userId));
      const attempt = latestAttempt(submission);
      records.push({ assignment, student, submission, attempt });
    }
  }

  const submittedRecords = records.filter(record => record.attempt);
  const percentages = submittedRecords.map(record => number(record.attempt.percentage));
  const expected = records.length;
  const submitted = submittedRecords.length;
  const missing = Math.max(0, expected - submitted);
  const pendingReview = submittedRecords.filter(record => deriveGradingStatus(record.attempt) === "pendingReview").length;
  const late = submittedRecords.filter(record => {
    const due = timestamp(record.submission?.dueAtOverride || record.assignment.dueAt);
    return due && timestamp(record.attempt.submittedAt) > due;
  }).length;

  const studentMap = new Map();
  for (const student of scopedStudents) {
    studentMap.set(String(student.userId), {
      userId: String(student.userId),
      displayName: studentName(student),
      identityNumber: String(student.identityNumber || student.code || ""),
      classId: String(student.classId || ""),
      className: classMap.get(String(student.classId || ""))?.name || "",
      active: student.active !== false,
      lastLoginAt: String(student.lastLoginAt || ""),
      assigned: 0,
      completed: 0,
      missing: 0,
      scores: [],
      points: []
    });
  }

  for (const record of records) {
    const item = studentMap.get(String(record.student.userId));
    if (!item) continue;
    item.assigned += 1;
    if (record.attempt) {
      item.completed += 1;
      item.scores.push(number(record.attempt.percentage));
      item.points.push({
        assignmentId: String(record.assignment.assignmentId),
        title: String(record.assignment.title || ""),
        date: assignmentDate(record.assignment),
        percentage: number(record.attempt.percentage)
      });
    } else {
      item.missing += 1;
    }
  }

  const studentSummaries = [...studentMap.values()].map(item => {
    item.points.sort((a, b) => timestamp(a.date) - timestamp(b.date));
    const avg = average(item.scores);
    const delta = trendDelta(item.points);
    const reasons = [];
    if (avg !== null && avg < 60) reasons.push("معدل منخفض");
    if (item.missing >= 2) reasons.push(item.missing + " واجبات غير مسلّمة");
    if (!item.lastLoginAt) reasons.push("لم يسجل الدخول بعد");
    if (delta <= -8) reasons.push("تراجع ملحوظ في الأداء");
    const severity = (avg !== null && avg < 50) || item.missing >= 3 || delta <= -15 ? "high" : reasons.length ? "medium" : "low";
    return {
      userId: item.userId,
      displayName: item.displayName,
      identityNumber: item.identityNumber,
      classId: item.classId,
      className: item.className,
      average: avg,
      assigned: item.assigned,
      completed: item.completed,
      missing: item.missing,
      completionRate: item.assigned ? round(item.completed / item.assigned * 100, 1) : 0,
      trendDelta: delta,
      trend: trendLabel(delta),
      lastLoginAt: item.lastLoginAt,
      needsFollowUp: reasons.length > 0,
      severity,
      reasons
    };
  });

  const followUp = studentSummaries
    .filter(item => item.needsFollowUp)
    .sort((a, b) => {
      const severity = { high: 2, medium: 1, low: 0 };
      return (severity[b.severity] - severity[a.severity]) || (b.missing - a.missing) || ((a.average ?? 101) - (b.average ?? 101));
    })
    .slice(0, 20);

  // A multi-student ranking is not meaningful for one student (and must never list classmates).
  const topImprovers = mode === "student" ? [] : studentSummaries
    .filter(item => item.completed >= 2 && item.trendDelta > 0)
    .sort((a, b) => b.trendDelta - a.trendDelta)
    .slice(0, 8);

  // A comparison of classes is a GLOBAL view only: a class or student scope never carries other classes' aggregates.
  const classComparison = mode !== "global" ? [] : classes
    .filter(item => item.active)
    .map(classroom => ({
      classId: classroom.classId,
      name: classroom.name,
      grade: classroom.grade,
      ...classAggregate(classroom.classId, scopedByDate, activeStudents, submissionMap)
    }))
    .filter(item => item.students > 0 || item.assignments > 0)
    .sort((a, b) => (b.average ?? -1) - (a.average ?? -1));

  const assignmentTrend = scopedAssignments
    .map(assignment => {
      const assignmentRecords = records.filter(record => String(record.assignment.assignmentId) === String(assignment.assignmentId));
      const assignmentSubmitted = assignmentRecords.filter(record => record.attempt);
      const assignmentPercentages = assignmentSubmitted.map(record => number(record.attempt.percentage));
      return {
        assignmentId: String(assignment.assignmentId),
        classId: String(assignment.classId || ""),
        className: String(assignment.className || classMap.get(String(assignment.classId || ""))?.name || ""),
        title: String(assignment.title || "واجب"),
        dueAt: String(assignment.dueAt || ""),
        date: assignmentDate(assignment),
        students: assignmentRecords.length,
        submitted: assignmentSubmitted.length,
        missing: Math.max(0, assignmentRecords.length - assignmentSubmitted.length),
        pendingReview: assignmentSubmitted.filter(record => deriveGradingStatus(record.attempt) === "pendingReview").length,
        completionRate: assignmentRecords.length ? round(assignmentSubmitted.length / assignmentRecords.length * 100, 1) : 0,
        average: average(assignmentPercentages),
        highest: assignmentPercentages.length ? round(Math.max(...assignmentPercentages), 1) : null,
        lowest: assignmentPercentages.length ? round(Math.min(...assignmentPercentages), 1) : null
      };
    })
    .sort((a, b) => timestamp(a.date) - timestamp(b.date));

  const trendAverages = assignmentTrend.filter(item => item.average !== null).map(item => number(item.average));
  let performanceChange = 0;
  if (trendAverages.length >= 4) {
    performanceChange = round((average(trendAverages.slice(-2)) ?? 0) - (average(trendAverages.slice(-4, -2)) ?? 0), 1);
  } else if (trendAverages.length >= 2) {
    performanceChange = round(trendAverages.at(-1) - trendAverages.at(-2), 1);
  }

  const gradeDistribution = [
    { label: "90–100", min: 90, max: 101 },
    { label: "80–89", min: 80, max: 90 },
    { label: "70–79", min: 70, max: 80 },
    { label: "60–69", min: 60, max: 70 },
    { label: "أقل من 60", min: -1, max: 60 }
  ].map(bin => ({
    label: bin.label,
    count: percentages.filter(value => value >= bin.min && value < bin.max).length
  }));

  const topicAnalytics = topicBreakdown(submittedRecords).slice(0, 14);

  const neverLogged = scopedStudents.filter(student => !student.lastLoginAt).length;
  const scopeClassName = classMap.get(requestedClassId)?.name || "";
  const insights = buildInsights({ mode, className: scopeClassName, performanceChange, trendCount: trendAverages.length, topicAnalytics, followUp, missing, pendingReview, neverLogged, student: mode === "student" ? studentSummaries[0] || null : null });

  // Phase 8A — the student view has ONE authority: in STUDENT mode the whole response is already that student's records,
  // so studentDetail is a projection of the SAME summary / trend / topics as the main KPIs (never a second computation).
  let studentDetail = null;
  if (mode === "student") {
    const summary = studentSummaries[0];
    const entry = studentMap.get(requestedStudentId);
    studentDetail = {
      userId: summary.userId,
      displayName: summary.displayName,
      classId: summary.classId,
      className: summary.className,
      average: summary.average,
      assigned: summary.assigned,
      completed: summary.completed,
      missing: summary.missing,
      completionRate: summary.completionRate,
      trendDelta: summary.trendDelta,
      trend: summary.trend,
      lastLoginAt: summary.lastLoginAt,
      needsFollowUp: summary.needsFollowUp,
      reasons: summary.reasons,
      scoreTrend: entry ? entry.points : [],
      topicAnalytics
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    scope: {
      mode,
      classId: requestedClassId,
      className: classMap.get(requestedClassId)?.name || "كل الصفوف",
      studentId: mode === "student" ? requestedStudentId : "",
      studentName: mode === "student" ? studentName(targetStudent) : "",
      from: fromMs ? new Date(fromMs).toISOString() : "",
      to: toMs ? new Date(toMs).toISOString() : ""
    },
    classes: classes.map(classroom => ({
      ...classroom,
      studentCount: activeStudents.filter(student => String(student.classId || "") === classroom.classId).length
    })),
    kpis: {
      activeClasses: classes.filter(item => item.active).length,
      activeStudents: scopedStudents.length,
      publishedAssignments: scopedAssignments.length,
      submissions: submitted,
      expectedSubmissions: expected,
      missingSubmissions: missing,
      pendingReview,
      lateSubmissions: late,
      completionRate: expected ? round(submitted / expected * 100, 1) : 0,
      average: average(percentages),
      highest: percentages.length ? round(Math.max(...percentages), 1) : null,
      lowest: percentages.length ? round(Math.min(...percentages), 1) : null,
      performanceChange,
      followUpStudents: followUp.length,
      neverLogged
    },
    submissionStatus: {
      submitted,
      missing,
      pendingReview,
      late
    },
    gradeDistribution,
    assignmentTrend: assignmentTrend.slice(-14),
    classComparison,
    topicAnalytics,
    followUp,
    topImprovers,
    insights: insights.slice(0, 7),
    // The student PICKER's roster (the scope's class members) — selector metadata, not analytics.
    students: rosterStudents
      .map(item => ({ userId: String(item.userId), displayName: studentName(item) }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "ar")),
    studentDetail
  };
}

module.exports = { computeTeacherAnalytics, AnalyticsScopeError, buildInsights, selectSubmissionNames, submissionPathAssignmentId, submissionFolder, submissionPath, round, average, trendDelta, trendLabel, missingAssignmentsPhrase };
