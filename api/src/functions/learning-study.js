const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull, mutateJsonWithRetry, StorageConflictError } = require("../lib/platform-storage");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { classHasLearningCourse, classCanSeeLearningModule } = require("../lib/class-learning-materials");
const { MODULE_MAX_POINTS } = require("../lib/student-strength");
const { studyDocName, loadStudyIndex, findStudyActivity, evaluateStudyResponse, normalizeStudyDoc, applyStudyCompletion, studyStateOf } = require("../lib/learning-study");

// Study Practice Strength API — the SERVER AUTHORITY for in-page learning exercises. Routes (one function):
//   GET  /api/learning-study/{courseId}          → the caller's study state for the course: per-page completed
//                                                   activity ids + points, per-module points, total, the policy
//   POST /api/learning-study/{courseId}/attempt  → { pageId, activityId, response } — the server looks the activity
//                                                   up in the generated key index, checks the class gate, JUDGES the
//                                                   response itself and records the completion (idempotent); `gained`
//                                                   is the ACTUAL Study Strength delta (page cap AND module cap)
// The browser sends only the learner's response: any client-supplied "correct", "points" or "gained" is ignored.
// Teachers (builder token) may try any exercise: judged and answered, never persisted. Nothing here touches
// assignments, the gradebook, class membership or publication.
const CLASS_PREFIX = "platform/classes/";
const CONFLICT_MESSAGE = "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
const ARCHIVED = { status: 403, jsonBody: { ok: false, error: "هذا الصف مؤرشف وانتهت السنة الدراسية." } };
const UNAVAILABLE = { status: 403, jsonBody: { ok: false, error: "هذه الصفحة غير متاحة لصفك بعد." } };
const NOT_FOUND = { status: 404, jsonBody: { ok: false, error: "التمرين غير موجود." } };
const BAD_REQUEST = { status: 400, jsonBody: { ok: false, error: "طلب غير صالح." } };
// 25-stage model: a module's Strength is round(completed/total × 20) — module-completion, not per-page points.
const POLICY = { model: "module-completion", modulePointsMax: MODULE_MAX_POINTS };
const EMPTY_MODULE = { points: 0, max: MODULE_MAX_POINTS, completed: 0, total: 0 };
const pageView = (page, view) => ({ ...page, completed: view.completed, total: view.total });
const ID = /^[A-Za-z0-9_-]{1,64}$/;

async function resolveActor(request, deps) {
  const builder = (deps.requireBuilderAuth || requireBuilderAuth)(request);
  if (builder.ok) return { kind: "teacher", user: builder.user, container: deps.container || (deps.getContainer || getContainer)() };
  const sess = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
  if (!sess.ok) return { kind: "denied", response: sess.response };
  return { kind: "student", user: sess.user, student: sess.student, container: sess.container };
}

function stateBody(actor, courseId, state) {
  return { ok: true, actor, courseId, policy: POLICY, pages: state.pages, modules: state.moduleViews, totalPoints: state.totalPoints };
}

async function handler(request, deps = {}, obs = null) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  const loadIndex = deps.loadStudyIndex || loadStudyIndex;
  try {
    const actor = await resolveActor(request, deps);
    if (actor.kind === "denied") return actor.response;
    const courseId = String(request.params?.courseId || "").trim();
    const action = String(request.params?.action || "").trim().toLowerCase();
    const method = String(request.method || "GET").toUpperCase();
    if (!ID.test(courseId)) return NOT_FOUND;
    const index = loadIndex(courseId);
    if (!index) return NOT_FOUND;

    // Student context: persisted class → lifecycle → course attached (ONE class read, ONE study read).
    let classroom = null, studyDoc = null;
    if (actor.kind === "student") {
      const classId = String(actor.student?.classId || "").trim();
      classroom = classId ? await dl(actor.container, CLASS_PREFIX + classId + ".json") : null;
      if (classroom && normalizeClassStatus(classroom) === "archived") return ARCHIVED;
      if (!classroom || !classHasLearningCourse(classroom, courseId)) return UNAVAILABLE;
      studyDoc = normalizeStudyDoc(await dl(actor.container, studyDocName(actor.student.userId)));
    }

    // ── state ──
    if (method === "GET" && !action) {
      const state = actor.kind === "student" ? studyStateOf(studyDoc, index) : studyStateOf(null, index);
      return { status: 200, jsonBody: stateBody(actor.kind, courseId, state) };
    }

    // ── attempt ──
    if (method === "POST" && action === "attempt") {
      let body = {};
      try { body = await request.json(); } catch { body = {}; }
      if (!body || typeof body !== "object") return BAD_REQUEST;
      if (typeof body.pageId !== "string" || typeof body.activityId !== "string") return BAD_REQUEST;
      const pageId = body.pageId.trim();
      const activityId = body.activityId.trim();
      if (!ID.test(pageId) || !ID.test(activityId)) return BAD_REQUEST;
      const found = findStudyActivity(index, pageId, activityId);
      if (!found) return NOT_FOUND;
      // The gate: the page's OWN module must be published to the student's class (the same authority as the Reader
      // and Learning Practice). Teachers preview freely.
      if (actor.kind === "student" && !classCanSeeLearningModule(classroom, courseId, found.moduleId)) return UNAVAILABLE;
      // ONLY the response is read; "correct", "points", "gained" or any other client claim is ignored.
      const correct = evaluateStudyResponse(found.key, body.response);
      const page = { pageId, moduleId: found.moduleId };
      if (!correct) {
        const state = actor.kind === "student" ? studyStateOf(studyDoc, index) : studyStateOf(null, index);
        const view = state.pages[pageId] || { completed: [], total: 0 };
        return { status: 200, jsonBody: { ok: true, actor: actor.kind, correct: false, persisted: false, alreadyCompleted: false, gained: 0, page: pageView(page, view), module: state.moduleViews[found.moduleId] || EMPTY_MODULE, totalPoints: state.totalPoints } };
      }
      if (actor.kind === "teacher") {
        return { status: 200, jsonBody: { ok: true, actor: "teacher", correct: true, persisted: false, alreadyCompleted: false, gained: 0, page: { ...page, completed: [], total: 0 }, module: EMPTY_MODULE, totalPoints: 0 } };
      }
      // A repeat of an ALREADY completed exercise is read-only: no write, no CAS round, the original entry stands.
      if (studyDoc.pages[pageId] && Object.prototype.hasOwnProperty.call(studyDoc.pages[pageId].completed, activityId)) {
        const state = studyStateOf(studyDoc, index);
        const view = state.pages[pageId] || { completed: [], total: 0 };
        return { status: 200, jsonBody: { ok: true, actor: "student", correct: true, persisted: false, alreadyCompleted: true, gained: 0, page: pageView(page, view), module: state.moduleViews[found.moduleId] || EMPTY_MODULE, totalPoints: state.totalPoints } };
      }
      const now = new Date().toISOString();
      let outcome = null, finalDoc = null;
      try {
        await mut(actor.container, studyDocName(actor.student.userId), current => {
          // Idempotent completion against the FRESHEST document on every CAS attempt: a duplicate or overlapping
          // request converges on the same completed set — one id, one entry, never a second point.
          outcome = applyStudyCompletion(current, index, { courseId, moduleId: found.moduleId, pageId, activityId }, now);
          finalDoc = outcome.doc;
          return outcome.doc;
        });
      } catch (e) {
        if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
        throw e;
      }
      const state = studyStateOf(finalDoc, index);
      const view = state.pages[pageId] || { completed: [], total: 0 };
      return { status: 200, jsonBody: {
        ok: true, actor: "student", correct: true, persisted: !outcome.alreadyCompleted, alreadyCompleted: outcome.alreadyCompleted,
        gained: outcome.gained,                                  // the ACTUAL module-Strength delta, from the CAS-fresh document
        page: pageView(page, view),
        module: state.moduleViews[found.moduleId] || EMPTY_MODULE, totalPoints: state.totalPoints,
      } };
    }

    return { status: 405, jsonBody: { ok: false, error: "Unsupported learning-study request." } };
  } catch (e) {
    obs?.logError("learning.study.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذر تسجيل التمرين حاليًا." } };
  }
}

app.http("learningStudy", { methods: ["GET", "POST"], authLevel: "anonymous", route: "learning-study/{courseId}/{action?}", handler: withObservability("learning-study", handler) });

module.exports = { handler };
