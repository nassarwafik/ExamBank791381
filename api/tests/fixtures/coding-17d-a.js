// Phase 17D-A — shared TEST fixture for the coding grading Recovery Engine. Builds COMMITTED attempts with the REAL Phase 17C
// planner (gradeExam + planCodingGrading — the same code every completed-attempt writer runs inside its CAS), so targets carry
// the genuine deterministic job id / grading key; then "ages" a target into a precise recovery situation (pending after a
// crash-after-commit, retryable after an outage, dispatched after a lost callback …) without any test-only production hook.
const F = require("./coding-17c.js");
const { gradeExam } = require("../../src/lib/assignment-grading.js");
const { planCodingGrading } = require("../../src/lib/coding/official-grading.js");

const SWEEP_KEY = "test-only-sweep-hmac-key-0123456789abcdef-17da";        // TEST key — never a real secret
const ENV = Object.freeze({ ...F.ENV, CODING_GRADING_SWEEP_HMAC_KEY: SWEEP_KEY });
const MIN = 60 * 1000;
const subName = (assignmentId, studentId) => "platform/submissions/" + assignmentId + "/" + studentId + ".json";
const sid = i => "22222222-2222-2222-2222-" + String(i).padStart(12, "0");
const SOURCE = "a,b=map(int,input().split());print('SUM='+str(a+b))\n";

/** Writes ONE committed attempt for (assignmentId, studentId) built by the real planner; returns the planned target. */
function commitAttempt(ctx, { assignmentId = F.AID, studentId = F.S1, answers = { auto1: F.code(SOURCE) }, submittedAt = new Date(Date.now() - 60 * MIN).toISOString() } = {}) {
  const a = ctx.getJson("platform/assignments/" + assignmentId + ".json");
  const g = gradeExam(a.examSnapshot, answers);
  const attempt = { attemptNumber: 1, submittedAt, score: g.score, totalMarks: g.totalMarks, percentage: g.percentage, manualReviewMarks: g.manualReviewMarks, finalized: g.finalized, questionGrades: g.questions, sections: g.sections, answers, manualOverrides: {}, teacherFeedback: "", timedOut: false, startedAt: submittedAt, endsAt: "", extendedEndsAt: "", endedAt: submittedAt, endReason: "submitted" };
  planCodingGrading(a.examSnapshot, attempt, { assignmentId, studentId, now: submittedAt });
  ctx.setJson(subName(assignmentId, studentId), { schemaVersion: 1, assignmentId, studentId, classId: a.classId, draftAnswers: {}, attempts: [attempt], activeAttempt: null, createdAt: submittedAt, updatedAt: submittedAt });
  return attempt.codingGrading ? attempt.codingGrading.targets.auto1 : null;
}

/** Puts the stored target into an exact recovery situation (state, age, recovery metadata). */
function age(ctx, { assignmentId = F.AID, studentId = F.S1, state, minutesAgo, recovery, technicalCode, lastAutomaticMinutesAgo } = {}) {
  const name = subName(assignmentId, studentId), doc = ctx.getJson(name);
  const t = doc.attempts[0].codingGrading.targets.auto1;
  if (state) t.state = state;
  if (state !== "retryable") delete t.technicalCode;
  if (technicalCode) t.technicalCode = technicalCode;
  if (typeof minutesAgo === "number") t.updatedAt = new Date(Date.now() - minutesAgo * MIN).toISOString();
  if (recovery) t.recovery = { ...recovery, ...(typeof lastAutomaticMinutesAgo === "number" ? { lastAutomaticAttemptAt: new Date(Date.now() - lastAutomaticMinutesAgo * MIN).toISOString() } : {}) };
  ctx.setJson(name, doc);
  return t;
}
const target = (ctx, { assignmentId = F.AID, studentId = F.S1 } = {}) => ctx.getJson(subName(assignmentId, studentId)).attempts[0].codingGrading.targets.auto1;
const grade = (ctx, { assignmentId = F.AID, studentId = F.S1 } = {}) => ctx.getJson(subName(assignmentId, studentId)).attempts[0].questionGrades.find(g => g.questionId === "auto1");

/** A second assignment in the SAME class (separate snapshot, same question shape). */
function addAssignment(ctx, assignmentId) {
  ctx.setJson("platform/assignments/" + assignmentId + ".json", F.assignment({ assignmentId }, { short: false }));
}

module.exports = { F, SWEEP_KEY, ENV, MIN, SOURCE, subName, sid, commitAttempt, age, target, grade, addAssignment };
