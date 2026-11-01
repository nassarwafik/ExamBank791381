const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireTeacherSession } = require("../lib/teacher-session");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull, mutateJsonWithRetry, StorageConflictError } = require("../lib/platform-storage");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { classHasLearningCourse, classCanSeeLearningModule } = require("../lib/class-learning-materials");
const { STUDY_MODULE_MAX_POINTS, STUDY_MODULE_COUNT } = require("../lib/student-strength");
const { studyDocName, loadStudyIndex, findStudyActivity, pageEligibleCount, normalizeStudyDoc, applyStudyCompletion, applyStudyReveal, wasRevealed, studyStateOf } = require("../lib/learning-study");
const { listLearningModules } = require("../lib/learning-materials-registry");
const { loadCheckIndex, findCheckActivity, checkResponse } = require("../lib/learning-check");
const { SMART_SIM_LIMITS } = require("../lib/shared-finalization/trustedSimRegistry");

// Study Practice Strength API — the SERVER AUTHORITY for in-page learning exercises. Routes (one function):
//   GET  /api/learning-study/{courseId}          → the caller's study state for the course: per-page completed
//                                                   activity ids + eligible count, per-module completed / eligible /
//                                                   points (≤ 20), total, the policy
//   POST /api/learning-study/{courseId}/attempt  → { pageId, activityId, response } — EVERY answer to an in-page exercise
//                                                   (L.6b: the browser holds no key). The server looks the block up in
//                                                   the generated CHECK INDEX, checks the class gate, JUDGES the response
//                                                   and returns the verdict with the feedback it earns (right: message +
//                                                   explanation; wrong: message + hints; a table: a verdict per answered
//                                                   cell). A right answer to a STUDY activity (the study key index) is
//                                                   recorded (idempotent); `gained` is the ACTUAL Study Strength delta
//                                                   (module formula, all modules). `study: false` (a self-check block)
//                                                   is judged and never recorded.
//                                                   REVEAL blocks (791381s Phase 2): every well-formed answer also gets
//                                                   the right answer (`reveal`) and the explanation. A student's WRONG
//                                                   answer to a reveal study activity is recorded as `revealed`; a later
//                                                   right answer to it is judged but never completed (`revealedBefore`).
//                                                   NETWORK LABS (791381s Phase 8B): `response` = { kind: "network-lab",
//                                                   actions } — replayed and judged on the server (learning-lab.js), a
//                                                   verdict per check (`parts`, booleans only); a judge that cannot run
//                                                   → 503 retryable, nothing written; > 256 KB → 413.
// The browser sends only the learner's response: any client-supplied "correct", "points" or "gained" is ignored.
// Teachers (builder token) may try any exercise: judged and answered, never persisted. Nothing here touches
// assignments, the gradebook, class membership or publication.
const CLASS_PREFIX = "platform/classes/";
const CONFLICT_MESSAGE = "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
const ARCHIVED = { status: 403, jsonBody: { ok: false, error: "هذا الصف مؤرشف وانتهت السنة الدراسية." } };
const UNAVAILABLE = { status: 403, jsonBody: { ok: false, error: "هذه الصفحة غير متاحة لصفك بعد." } };
const NOT_FOUND = { status: 404, jsonBody: { ok: false, error: "التمرين غير موجود." } };
const BAD_REQUEST = { status: 400, jsonBody: { ok: false, error: "طلب غير صالح." } };
const TOO_LARGE = { status: 413, jsonBody: { ok: false, error: "الإجابة أكبر من الحد المسموح." } };
const LAB_UNAVAILABLE = { status: 503, jsonBody: { ok: false, retryable: true, error: "تعذّر فحص المختبر حاليًا. حاول مرة أخرى بعد قليل." } };
/** The UTF-8 size of a JSON response (a cycle or an unserialisable value counts as too large). */
const responseBytes = v => { try { return Buffer.byteLength(JSON.stringify(v ?? null), "utf8"); } catch { return Infinity; } };
// Study policy as the API advertises it (the UI reads it from here, never hardcodes it): each module is worth up to
// 20 points, round(completed / eligible × 20). `moduleCount` is the COURSE's publishable module count (791381: 28 → 560;
// 791381s: 37), falling back to the 791381 count for a course the registry does not list.
const policyFor = courseId => {
  const n = (listLearningModules(courseId) || []).length;
  return { modulePointsMax: STUDY_MODULE_MAX_POINTS, moduleCount: n > 0 ? n : STUDY_MODULE_COUNT };
};
const EMPTY_MODULE = { completed: 0, eligible: 0, points: 0, max: STUDY_MODULE_MAX_POINTS };
const ID = /^[A-Za-z0-9_-]{1,64}$/;

async function resolveActor(request, deps) {
  const builder = (await requireTeacherSession(request, deps));
  if (builder.ok) return { kind: "teacher", user: builder.user, container: deps.container || (deps.getContainer || getContainer)() };
  const sess = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
  if (!sess.ok) return { kind: "denied", response: sess.response };
  return { kind: "student", user: sess.user, student: sess.student, container: sess.container };
}

function stateBody(actor, courseId, state) {
  return { ok: true, actor, courseId, policy: policyFor(courseId), pages: state.pages, modules: state.moduleViews, totalPoints: state.totalPoints };
}

async function handler(request, deps = {}, obs = null) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  const loadIndex = deps.loadStudyIndex || loadStudyIndex;
  const loadChecks = deps.loadCheckIndex || loadCheckIndex;
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
      const check = findCheckActivity(loadChecks(courseId), pageId, activityId);
      if (!check) return NOT_FOUND;
      // A network lab's answer is an action list (791381s Phase 8B): bounded like every smartSim answer (256 KB, ≤ 1000 actions,
      // enforced again by the simulator's replay).
      if (check.key.kind === "network-lab" && responseBytes(body.response) > SMART_SIM_LIMITS.answerBytes) return TOO_LARGE;
      // The gate: the page's OWN module must be published to the student's class (the same authority as the Reader
      // and Learning Practice). Teachers preview freely.
      if (actor.kind === "student" && !classCanSeeLearningModule(classroom, courseId, check.moduleId)) return UNAVAILABLE;
      // ONLY the response is read; "correct", "points", "gained" or any other client claim is ignored.
      const verdict = checkResponse(check, body.response);
      // The judge could not run (a broken lab topology / key — never the learner's fault): a retryable error, NOTHING recorded,
      // never a "wrong" (AGENTS.md §10 grading safety).
      if (verdict.unavailable) return LAB_UNAVAILABLE;
      const correct = verdict.correct;
      // Points come from the STUDY index alone (the check index only says what to answer): a block it does not list is judged and
      // answered, never recorded.
      const found = findStudyActivity(index, pageId, activityId);
      // `parts`: the per-part verdict of a structured answer / the per-check verdict of a network lab (booleans only) — the
      // Reader's per-part marks and «الصحيح: …» on a served page come from it.
      const said = { study: !!found, feedback: verdict.feedback, ...(verdict.cells ? { cells: verdict.cells } : {}), ...(verdict.parts ? { parts: verdict.parts } : {}), ...(verdict.reveal ? { reveal: verdict.reveal } : {}) };
      const page = { pageId, moduleId: check.moduleId };
      // REVEAL + student + study activity: a wrong answer gave the right answer away → record it once (CAS; never over a
      // completion); a right answer after such a reveal is answered but never completed.
      if (actor.kind === "student" && found && verdict.reveal) {
        const completedAlready = !!(studyDoc.pages[pageId] && Object.prototype.hasOwnProperty.call(studyDoc.pages[pageId].completed, activityId));
        if (!correct && !completedAlready && !wasRevealed(studyDoc, pageId, activityId)) {
          let revealedDoc = null;
          try {
            await mut(actor.container, studyDocName(actor.student.userId), current => {
              revealedDoc = applyStudyReveal(current, { courseId, moduleId: found.moduleId, pageId, activityId }, new Date().toISOString()).doc;
              return revealedDoc;
            });
          } catch (e) {
            if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
            throw e;
          }
          studyDoc = revealedDoc;
        }
        if (correct && !completedAlready && wasRevealed(studyDoc, pageId, activityId)) {
          const state = studyStateOf(studyDoc, index);
          const view = state.pages[pageId] || { completed: [], eligible: pageEligibleCount(index, pageId) };
          return { status: 200, jsonBody: { ok: true, actor: "student", correct: true, persisted: false, alreadyCompleted: false, revealedBefore: true, gained: 0, ...said, page: { ...page, completed: view.completed, eligible: view.eligible }, module: state.moduleViews[found.moduleId] || EMPTY_MODULE, totalPoints: state.totalPoints } };
        }
      }
      if (!correct || !found) {
        const state = actor.kind === "student" ? studyStateOf(studyDoc, index) : studyStateOf(null, index);
        const view = state.pages[pageId] || { completed: [], eligible: pageEligibleCount(index, pageId) };
        return { status: 200, jsonBody: { ok: true, actor: actor.kind, correct, persisted: false, alreadyCompleted: false, gained: 0, ...said, page: { ...page, completed: view.completed, eligible: view.eligible }, module: state.moduleViews[check.moduleId] || EMPTY_MODULE, totalPoints: state.totalPoints } };
      }
      if (actor.kind === "teacher") {
        const teacherState = studyStateOf(null, index);
        return { status: 200, jsonBody: { ok: true, actor: "teacher", correct: true, persisted: false, alreadyCompleted: false, gained: 0, ...said, page: { ...page, completed: [], eligible: pageEligibleCount(index, pageId) }, module: teacherState.moduleViews[found.moduleId] || EMPTY_MODULE, totalPoints: 0 } };
      }
      // A repeat of an ALREADY completed exercise is read-only: no write, no CAS round, the original entry stands.
      if (studyDoc.pages[pageId] && Object.prototype.hasOwnProperty.call(studyDoc.pages[pageId].completed, activityId)) {
        const state = studyStateOf(studyDoc, index);
        const view = state.pages[pageId] || { completed: [], eligible: pageEligibleCount(index, pageId) };
        return { status: 200, jsonBody: { ok: true, actor: "student", correct: true, persisted: false, alreadyCompleted: true, gained: 0, ...said, page: { ...page, completed: view.completed, eligible: view.eligible }, module: state.moduleViews[found.moduleId] || EMPTY_MODULE, totalPoints: state.totalPoints } };
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
      const view = state.pages[pageId] || { completed: [], eligible: pageEligibleCount(index, pageId) };
      return { status: 200, jsonBody: {
        ok: true, actor: "student", correct: true, persisted: !outcome.alreadyCompleted && !outcome.revealedBefore, alreadyCompleted: outcome.alreadyCompleted,
        ...(outcome.revealedBefore ? { revealedBefore: true } : {}),   // a reveal landed first (overlapping requests): never completed
        gained: outcome.gained,                                  // the ACTUAL Strength delta (module formula), from the CAS-fresh document
        ...said,
        page: { ...page, completed: view.completed, eligible: view.eligible },
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
