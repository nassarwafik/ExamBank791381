const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull, mutateJsonWithRetry, StorageConflictError } = require("../lib/platform-storage");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { readLibraryItem } = require("../lib/exam-library-store");
const { sanitizeExamForStudent } = require("../lib/student-exam-sanitize");
const { gradeExam } = require("../lib/assignment-grading");
const { listLearningTrainings, findLearningTraining, trainingAllowedForClass } = require("../lib/learning-training-registry");
const { practiceDocName, normalizePracticeDoc, trainingEntry, applyTrainingResult } = require("../lib/learning-practice");
const { trainingCountsTowardStrength, trainingMaxStrengthPoints, gradableStrengthPercentage } = require("../lib/student-strength");

// Learning Practice API — the SAFE delivery of the book's Learning-Practice items (the T-series trainings T01–T30
// and the F-series final exams for training F01–F06 — all real Exam Library items) and their server-side grading. Self-study only: NO assignment record, no due date, no gradebook entry, no attempt limit,
// no medal. Routes (one function):
//   GET  /api/learning-training                     → the trainings for the caller (student: gated, with best results)
//   GET  /api/learning-training/{trainingId}        → the SANITIZED exam (no answer keys, no hints) — student gated
//   POST /api/learning-training/{trainingId}/submit → server grading; student results persisted as BEST-score
//
// Strength (25-stage model): BOTH the T-series AND the F-series feed the LIBRARY Strength source (student-strength.js),
// each up to 40 points = round(bestPercentage × 40 / 100), one canonical best per student/trainingId (max-merge), so
// the same item solved from the library or from inside the Reader contributes identically and is never double-counted.
// The best percentage stored is the SERVER'S gradable-only percentage (gradableStrengthPercentage): manual-review /
// open-question marks leave the denominator, so a final exam is scored over its reliably auto-gradable portion only
// and never understated. For a fully auto-graded item this equals the ordinary percentage.
//
// Actors: a builder (teacher) token → may review/solve any training regardless of class publication, nothing is
// persisted; otherwise an active student session → the PERSISTED student.classId (never the token's) → current
// class → lifecycle → PR #117 publication gate (course assigned + required module published). The browser never
// sends scores, percentages or points: everything is graded and derived here.
const CLASS_PREFIX = "platform/classes/";
const CONFLICT_MESSAGE = "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
const ARCHIVED = { status: 403, jsonBody: { ok: false, error: "هذا الصف مؤرشف وانتهت السنة الدراسية." } };
const UNAVAILABLE = { status: 403, jsonBody: { ok: false, error: "هذا التدريب غير متاح لصفك بعد. سيصبح متاحًا عند نشر الجزء المرتبط به." } };

/** Teacher (builder token) or active student (persisted document); 401 otherwise. */
async function resolveActor(request, deps) {
  const builder = (deps.requireBuilderAuth || requireBuilderAuth)(request);
  if (builder.ok) return { kind: "teacher", user: builder.user, container: deps.container || (deps.getContainer || getContainer)() };
  const sess = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
  if (!sess.ok) return { kind: "denied", response: sess.response };
  return { kind: "student", user: sess.user, student: sess.student, container: sess.container };
}

/** Public training metadata (never the exam). */
function trainingMeta(t, extra = {}) {
  return { trainingId: t.trainingId, order: t.order, label: t.label, requiredModuleId: t.requiredModuleId, courseId: t.courseId, strengthEligible: trainingCountsTowardStrength(t.trainingId), ...extra };
}
function bestOf(entry, trainingId) {
  return { bestPercentage: entry.bestPercentage, bestPoints: entry.bestPoints, maxPoints: trainingMaxStrengthPoints(trainingId), attempts: entry.attempts, lastCompletedAt: entry.lastCompletedAt };
}
/** `best` is exposed ONLY once the student has attempted the training (attempts > 0): a never-attempted training has
 *  no best result — a real 0% attempt does (bestPercentage 0, attempts ≥ 1). Teacher context has no entry at all. */
function bestIfAttempted(entry, trainingId) {
  return entry && Number(entry.attempts) > 0 ? { best: bestOf(entry, trainingId) } : {};
}

async function handler(request, deps = {}, obs = null) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  const readItem = deps.readLibraryItem || readLibraryItem;
  const grade = deps.gradeExam || gradeExam;
  try {
    const actor = await resolveActor(request, deps);
    if (actor.kind === "denied") return actor.response;
    const trainingId = String(request.params?.trainingId || "").trim();
    const action = String(request.params?.action || "").trim().toLowerCase();
    const method = String(request.method || "GET").toUpperCase();

    // Student context: persisted class → lifecycle → the gate + the practice summary (ONE read each).
    let classroom = null, practiceDoc = null;
    if (actor.kind === "student") {
      const classId = String(actor.student?.classId || "").trim();
      classroom = classId ? await dl(actor.container, CLASS_PREFIX + classId + ".json") : null;
      if (classroom && normalizeClassStatus(classroom) === "archived") return ARCHIVED;
      practiceDoc = normalizePracticeDoc(await dl(actor.container, practiceDocName(actor.student.userId)));
    }
    const allowed = t => actor.kind === "teacher" || trainingAllowedForClass(classroom, t);

    // ── list ──
    if (!trainingId) {
      if (method !== "GET") return { status: 405, jsonBody: { ok: false, error: "Method not allowed." } };
      const trainings = listLearningTrainings().map(t => {
        const available = allowed(t);
        // Disclosure rule: a training's TITLE is shown only when it is available to this caller.
        if (!available) return trainingMeta(t, { available: false });
        const entry = actor.kind === "student" ? trainingEntry(practiceDoc, t.trainingId) : null;
        return trainingMeta(t, { available: true, title: t.title, ...bestIfAttempted(entry, t.trainingId) });
      });
      return { status: 200, jsonBody: { ok: true, actor: actor.kind, trainings } };
    }

    const training = findLearningTraining(trainingId);
    if (!training) return { status: 404, jsonBody: { ok: false, error: "التدريب غير موجود." } };
    if (!allowed(training)) return UNAVAILABLE;
    const item = readItem(training.trainingId);
    if (!item || !item.examSnapshot) return { status: 404, jsonBody: { ok: false, error: "التدريب غير موجود في المكتبة." } };

    // ── item ──
    if (method === "GET" && !action) {
      const questionCount = Array.isArray(item.examSnapshot.questions) ? item.examSnapshot.questions.length : Number(item.questionCount || 0);
      const entry = actor.kind === "student" ? trainingEntry(practiceDoc, training.trainingId) : null;
      return { status: 200, jsonBody: { ok: true, actor: actor.kind, training: trainingMeta(training, { title: training.title, questionCount, totalMarks: Number(item.examSnapshot.totalMarks || item.totalMarks || 0), maxPoints: trainingMaxStrengthPoints(training.trainingId) }), exam: sanitizeExamForStudent(item.examSnapshot), ...bestIfAttempted(entry, training.trainingId) } };
    }

    // ── submit ──
    if (method === "POST" && action === "submit") {
      let body = {};
      try { body = await request.json(); } catch { body = {}; }
      // ONLY the answers map is read; any client-supplied score / percentage / points / correctCount is ignored.
      const answers = body && typeof body.answers === "object" && body.answers && !Array.isArray(body.answers) ? body.answers : {};
      const graded = grade(item.examSnapshot, answers);
      const questions = Array.isArray(item.examSnapshot.questions) ? item.examSnapshot.questions : [];
      const review = graded.questions.map(g => {
        const q = questions.find(x => String(x.examQuestionId || x.id || "") === String(g.questionId)) || {};
        const chosen = answers[g.questionId];
        const correctOptionIndex = Number.isInteger(Number(q.answer?.correctOptionIndex)) ? Number(q.answer.correctOptionIndex) : null;
        return {
          questionId: g.questionId,
          questionNumber: g.questionNumber,
          correct: g.correct === true,
          // A question the grader could not auto-grade (e.g. an open question of a final exam): its marks are
          // counted in the total by the SAME grader as everywhere else; the browser only labels it.
          manualReview: g.manualReview === true,
          chosenIndex: chosen && chosen.kind === "choice" && Number.isInteger(Number(chosen.index)) ? Number(chosen.index) : null,
          // Post-submission reveal for self-study: the key and the item's own explanation (never before submit).
          correctOptionIndex,
          // Non-choice keys (matching / table pairs) are revealed as the item's own answer text — after submit only.
          correctText: correctOptionIndex === null && typeof q.answer?.text === "string" ? q.answer.text : "",
          hint: String(q.hint || "")
        };
      });
      const percentage = Math.round(Number(graded.percentage) || 0);
      // Strength uses the SERVER's gradable-only percentage (manual-review marks excluded from the denominator), so an
      // F final exam with open questions is scored over its auto-gradable portion; for a T item this equals `percentage`.
      const strengthPercentage = gradableStrengthPercentage({ score: graded.score, totalMarks: graded.totalMarks, manualReviewMarks: graded.manualReviewMarks });
      const result = { correctCount: graded.questions.filter(q => q.correct).length, questionCount: graded.questions.length, score: graded.score, totalMarks: graded.totalMarks, percentage, review };
      if (actor.kind === "teacher") return { status: 200, jsonBody: { ok: true, actor: "teacher", persisted: false, result } };

      const now = new Date().toISOString();
      let outcome = null;
      try {
        await mut(actor.container, practiceDocName(actor.student.userId), current => {
          // Max-merge against the FRESHEST document on every CAS attempt: an overlapping submission can never
          // downgrade the best, and a duplicate never double-awards. The canonical best percentage is the gradable one.
          outcome = applyTrainingResult(current, training.trainingId, strengthPercentage, now);
          return outcome.doc;
        });
      } catch (e) {
        if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
        throw e;
      }
      return { status: 200, jsonBody: { ok: true, actor: "student", persisted: true, result, practice: { ...bestOf(outcome.after, training.trainingId), improved: outcome.improved, pointsGained: outcome.pointsGained, earnedPoints: outcome.after.bestPoints } } };
    }

    return { status: 405, jsonBody: { ok: false, error: "Unsupported learning-training request." } };
  } catch (e) {
    obs?.logError("learning.training.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذر تحميل التدريب حاليًا." } };
  }
}

app.http("learningTraining", { methods: ["GET", "POST"], authLevel: "anonymous", route: "learning-training/{trainingId?}/{action?}", handler: withObservability("learning-training", handler) });

module.exports = { handler };
