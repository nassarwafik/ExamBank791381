const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull } = require("../lib/platform-storage");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { classHasLearningCourse, classCanSeeLearningModule } = require("../lib/class-learning-materials");
const { loadExamItems, findExamItem, examItemContext, studentItemView, checkExamItem } = require("../lib/learning-exam-items");

// 791381s Phase 8C-1 (docs/enterprise-791381s-enrichment-plan.md §11.4) — the learning book's ADVANCED exam items, as PRACTICE:
//   GET  /api/learning-exam-item/{courseId}/{itemId}        → the card metadata + the SANITIZED exam (the platform's student
//                                                             projection: no key, no explanation, no hint)
//   POST /api/learning-exam-item/{courseId}/{itemId}/check  → { answers } → the OFFICIAL grader's verdict (gradeExam) per question,
//                                                             with the item's explanation for each ANSWERED question
// Practice only: NOTHING is written — no assignment, no attempt, no submission, no gradebook entry, no study record
// (`persisted: false`). Only the `answers` map is read; any client score / percentage / correct flag is ignored.
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
const bytesOf = v => { try { return Buffer.byteLength(JSON.stringify(v ?? null), "utf8"); } catch { return Infinity; } };

async function resolveActor(request, deps) {
  const builder = (deps.requireBuilderAuth || requireBuilderAuth)(request);
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
      return { status: 200, jsonBody: { ok: true, actor: actor.kind, persisted: false, result: checkExamItem(found.item, answers, ctx) } };
    }
    return { status: 405, jsonBody: { ok: false, error: "Unsupported learning-exam-item request." } };
  } catch (e) {
    obs?.logError("learning.examItem.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذّر فحص السؤال حاليًا." } };
  }
}

app.http("learningExamItem", { methods: ["GET", "POST"], authLevel: "anonymous", route: "learning-exam-item/{courseId}/{itemId}/{action?}", handler: withObservability("learning-exam-item", handler) });

module.exports = { handler };
