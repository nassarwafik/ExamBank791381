const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireTeacherSession } = require("../lib/teacher-session");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull, mutateJsonWithRetry, StorageConflictError } = require("../lib/platform-storage");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { classHasLearningCourse, classCanSeeLearningModule } = require("../lib/class-learning-materials");
const { loadExamItems, findExamItem, examItemContext, studentItemView, checkExamItem } = require("../lib/learning-exam-items");
const { studyDocName, loadStudyIndex, normalizeStudyDoc, applyStudyCompletion, applyStudyReveal, wasRevealed, studyStateOf } = require("../lib/learning-study");

// 791381s Phase 8C-1 (docs/enterprise-791381s-enrichment-plan.md §11.4) — the learning book's ADVANCED exam items, as PRACTICE:
//   GET  /api/learning-exam-item/{courseId}/{itemId}        → the card metadata + the SANITIZED exam (the platform's student
//                                                             projection: no key, no explanation, no hint)
//   POST /api/learning-exam-item/{courseId}/{itemId}/check  → { answers } → the OFFICIAL grader's verdict (gradeExam) per question,
//                                                             with the item's explanation for each ANSWERED question
// Practice only: no assignment, no attempt, no submission, no gradebook entry — ever. Only the `answers` map is read; any client
// score / percentage / correct flag is ignored.
// STUDY STRENGTH (791381s Phase 8D, owner decision 2026-11-01): an item placed in the course's study index is a study activity.
// A STUDENT's check that answers EVERY question right (full marks, nothing left to manual review) completes it — once,
// idempotently, in the learner's own study document only (platform/learning-study/<id>.json, the same CAS completion as every
// in-page exercise). A check that answers a question WRONG shows that question's explanation, so it marks the item `revealed`
// (as reveal-mode questions): a later full-marks check is answered and never counted (`revealedBefore`). Teachers: never stored.
// Gate (students): the PERSISTED class (never the token's) → lifecycle (archived → 403) → the course is assigned AND the item's
// own unit is published to that class. Teachers (builder token) preview every item. A parametric question is generated from
// the server-side context (learning:<course>:<item>, the learner, attempt 1) — the same instance on GET and on check.
// An item the store could not validate is answered 503 retryable — never graded, never a "wrong" (AGENTS.md §10).
const CLASS_PREFIX = "platform/classes/";
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const NOT_FOUND = { status: 404, jsonBody: { ok: false, error: "السؤال غير موجود." } };
const UNAVAILABLE = { status: 403, jsonBody: { ok: false, error: "هذا السؤال غير متاح لصفك بعد. سيصبح متاحًا عند نشر الوحدة المرتبطة به." } };
const ARCHIVED = { status: 403, jsonBody: { ok: false, error: "هذا الصف مؤرشف وانتهت السنة الدراسية." } };
const ITEM_BROKEN = { status: 503, jsonBody: { ok: false, retryable: true, error: "تعذّر فتح هذا السؤال حاليًا. حاول مرة أخرى لاحقًا." } };
const TOO_LARGE = { status: 413, jsonBody: { ok: false, error: "الإجابة أكبر من الحد المسموح." } };
const MAX_ANSWER_BYTES = 65536;
const CONFLICT = { status: 503, jsonBody: { ok: false, retryable: true, error: "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى." } };
/** The study activity of an item: the (single) index entry whose key is { kind: "exam-item", itemId } → { pageId, moduleId, activityId }. */
function studyActivityOfItem(index, itemId) {
  if (!index || !index.pages) return null;
  for (const [pageId, page] of Object.entries(index.pages)) {
    for (const [activityId, key] of Object.entries(page && page.activities ? page.activities : {})) {
      if (key && key.kind === "exam-item" && key.itemId === itemId) return { pageId, moduleId: String(page.moduleId || ""), activityId };
    }
  }
  return null;
}
const bytesOf = v => { try { return Buffer.byteLength(JSON.stringify(v ?? null), "utf8"); } catch { return Infinity; } };

async function resolveActor(request, deps) {
  const builder = (await requireTeacherSession(request, deps));
  if (builder.ok) return { kind: "teacher", user: builder.user, container: deps.container || (deps.getContainer || getContainer)() };
  const sess = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
  if (!sess.ok) return { kind: "denied", response: sess.response };
  return { kind: "student", user: sess.user, student: sess.student, container: sess.container };
}

async function handler(request, deps = {}, obs = null) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  try {
    const actor = await resolveActor(request, deps);
    if (actor.kind === "denied") return actor.response;
    const courseId = String(request.params?.courseId || "").trim();
    const itemId = String(request.params?.itemId || "").trim();
    const action = String(request.params?.action || "").trim().toLowerCase();
    const method = String(request.method || "GET").toUpperCase();
    if (!ID.test(courseId) || !ID.test(itemId)) return NOT_FOUND;
    const found = findExamItem(loadExamItems(courseId, deps), itemId);
    if (found.status === "missing") return NOT_FOUND;

    // The gate comes before anything about the item (its validity included) reaches a student.
    let learnerId = "teacher-preview";
    if (actor.kind === "student") {
      const classId = String(actor.student?.classId || "").trim();
      const classroom = classId ? await dl(actor.container, CLASS_PREFIX + classId + ".json") : null;
      if (classroom && normalizeClassStatus(classroom) === "archived") return ARCHIVED;
      const moduleId = typeof found.item?.moduleId === "string" ? found.item.moduleId : "";
      if (!classroom || !classHasLearningCourse(classroom, courseId) || !moduleId || !classCanSeeLearningModule(classroom, courseId, moduleId)) return UNAVAILABLE;
      learnerId = String(actor.student.userId);
    }
    if (found.status !== "ok") { obs?.logError?.("learning.examItem.invalid", new Error(courseId + "/" + itemId)); return ITEM_BROKEN; }
    const ctx = examItemContext(courseId, itemId, learnerId);

    if (method === "GET" && !action) {
      return { status: 200, jsonBody: { ok: true, actor: actor.kind, ...studentItemView(itemId, found.item, ctx) } };
    }
    if (method === "POST" && action === "check") {
      let body = {};
      try { body = await request.json(); } catch { body = {}; }
      const answers = body && typeof body === "object" && body.answers && typeof body.answers === "object" && !Array.isArray(body.answers) ? body.answers : {};
      if (bytesOf(answers) > MAX_ANSWER_BYTES) return TOO_LARGE;
      const result = checkExamItem(found.item, answers, ctx);
      const index = (deps.loadStudyIndex || loadStudyIndex)(courseId);
      const activity = studyActivityOfItem(index, itemId);
      if (actor.kind !== "student" || !activity) return { status: 200, jsonBody: { ok: true, actor: actor.kind, persisted: false, result, ...(activity ? { study: { counted: true, completed: false, persisted: false, gained: 0 } } : {}) } };
      // Full marks = every question answered right and nothing left to a teacher; a wrong answered question showed its explanation.
      const full = result.totalMarks > 0 && result.questions.length > 0 && result.questions.every(q => q.answered && q.correct && !q.manualReview);
      const wrongShown = result.questions.some(q => q.answered && !q.correct && !q.manualReview);
      const ref = { courseId, moduleId: activity.moduleId, pageId: activity.pageId, activityId: activity.activityId };
      const docName = studyDocName(actor.student.userId);
      let doc = normalizeStudyDoc(await dl(actor.container, docName));
      const completedAlready = !!(doc.pages[activity.pageId] && Object.prototype.hasOwnProperty.call(doc.pages[activity.pageId].completed, activity.activityId));
      let study = { counted: true, completed: completedAlready, persisted: false, alreadyCompleted: completedAlready, gained: 0 };
      try {
        if (full && !completedAlready) {
          if (wasRevealed(doc, activity.pageId, activity.activityId)) study = { ...study, revealedBefore: true };
          else {
            let outcome = null;
            await (deps.mutateJsonWithRetry || mutateJsonWithRetry)(actor.container, docName, current => { outcome = applyStudyCompletion(current, index, ref, new Date().toISOString()); return outcome.doc; });
            doc = outcome.doc;
            study = outcome.revealedBefore ? { ...study, revealedBefore: true } : { ...study, completed: true, persisted: !outcome.alreadyCompleted, alreadyCompleted: outcome.alreadyCompleted, gained: outcome.gained };
          }
        } else if (!full && wrongShown && !completedAlready && !wasRevealed(doc, activity.pageId, activity.activityId)) {
          let revealed = null;
          await (deps.mutateJsonWithRetry || mutateJsonWithRetry)(actor.container, docName, current => { revealed = applyStudyReveal(current, ref, new Date().toISOString()).doc; return revealed; });
          doc = revealed;
        }
      } catch (e) {
        if (e instanceof StorageConflictError) return CONFLICT;
        throw e;
      }
      const state = studyStateOf(doc, index);
      study = { ...study, module: state.moduleViews[activity.moduleId] || null, totalPoints: state.totalPoints };
      return { status: 200, jsonBody: { ok: true, actor: "student", persisted: study.persisted, result, study } };
    }
    return { status: 405, jsonBody: { ok: false, error: "Unsupported learning-exam-item request." } };
  } catch (e) {
    obs?.logError("learning.examItem.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذّر فحص السؤال حاليًا." } };
  }
}

app.http("learningExamItem", { methods: ["GET", "POST"], authLevel: "anonymous", route: "learning-exam-item/{courseId}/{itemId}/{action?}", handler: withObservability("learning-exam-item", handler) });

module.exports = { handler };
