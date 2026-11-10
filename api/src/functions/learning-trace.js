// 899371 enrichment P13 (docs/enterprise-899371-enrichment-plan.md §9) — «شاهد التنفيذ خطوة بخطوة»: the recorded traces of a course's
// questions, served on demand (never inside a page body).
//     GET /api/learning-trace/{courseId}                                  → { ok, actor, traces: { "<pageId>/<blockId>": "open" | "answer-first" } }
//     GET /api/learning-trace/{courseId}/steps?pageId=…&blockId=…         → { ok, trace: { kind, code, stdin?, valuesFrom?, random?, steps } }
// WHO: a teacher with learning.course.view (route-capabilities.js) and the course in their entitlement — every trace; an ACTIVE student
// whose persisted class is not archived, has the course attached and allowed, and has the trace's MODULE published, then:
//   • an EXERCISE trace (it shows the exercise's answer) only after the student answered that exercise — the server's own study record
//     says it was completed or its answer revealed; before that → 409 ANSWER_FIRST;
//   • a BOOK trace only when the teacher released that module's solutions to the class (decision D1); before that it is not listed and
//     its steps → 403 NOT_RELEASED.
// Reads only: the class, the course decision and the student's own study record; writes nothing, records nothing. Telemetry carries
// refusal codes only.
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireTeacherSession } = require("../lib/teacher-session");
const { requireCapability } = require("../lib/access/require-capability");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull } = require("../lib/platform-storage");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { classHasLearningCourse, classCanSeeLearningModule, classSolutionsReleased } = require("../lib/class-learning-materials");
const { teacherCourseDecision, classCourseDecision, courseRefusal } = require("../lib/access/course-access");
const { studyDocName, normalizeStudyDoc, wasRevealed } = require("../lib/learning-study");
const { loadTraceIndex, findTrace, traceStates } = require("../lib/learning-trace");

const CLASS_PREFIX = "platform/classes/";
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const NO_STORE = { "Cache-Control": "no-store" };
const VALUES_FROM = new Set(["question", "clarification", "chosen"]);
const reply = (status, jsonBody) => ({ status, headers: NO_STORE, jsonBody });
const MESSAGES = {
  NOT_FOUND: "هذا التتبع غير متاح.",
  UNAVAILABLE: "هذه الصفحة غير متاحة لصفك بعد.",
  ARCHIVED: "هذا الصف مؤرشف وانتهت السنة الدراسية.",
  ANSWER_FIRST: "أجب عن التمرين أولًا، ثم شاهد التنفيذ خطوة بخطوة.",
  NOT_RELEASED: "لم يفتح المعلم حلول هذا الفصل بعد.",
  REQUEST_INVALID: "طلب غير صالح.",
  FAILED: "تعذّر تحميل التتبع الآن. حاول مرة أخرى.",
};
const refuse = (status, code, obs) => { if (obs && status !== 500) obs.logWarn("learning.trace.refused", { code, status }); return reply(status, { ok: false, code, error: MESSAGES[code] }); };

async function resolveActor(request, deps, obs) {
  const builder = await requireTeacherSession(request, deps);
  if (builder.ok) {
    const capabilityDenial = await requireCapability(builder, "learning-trace.js", "*", deps, obs);
    if (capabilityDenial) return { kind: "denied", response: capabilityDenial };
    return { kind: "teacher", user: builder.user, container: deps.container || (deps.getContainer || getContainer)() };
  }
  const sess = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
  if (!sess.ok) return { kind: "denied", response: sess.response };
  return { kind: "student", student: sess.student, container: sess.container };
}
const queryOf = request => {
  const q = request.query;
  if (q && typeof q.get === "function") return k => q.get(k);
  try { const u = new URL(request.url || "", "http://x"); return k => u.searchParams.get(k); } catch { return () => null; }
};

async function handler(request, deps = {}, obs = null) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  try {
    const actor = await resolveActor(request, deps, obs);
    if (actor.kind === "denied") return actor.response;
    const courseId = String(request.params?.courseId || "").trim();
    const action = String(request.params?.action || "").trim().toLowerCase();
    const method = String(request.method || "GET").toUpperCase();
    if (method !== "GET" || (action && action !== "steps")) return reply(405, { ok: false, code: "REQUEST_INVALID", error: MESSAGES.REQUEST_INVALID });
    if (!ID.test(courseId)) return refuse(404, "NOT_FOUND", obs);
    const index = (deps.loadTraceIndex || loadTraceIndex)(courseId);
    if (!index) return refuse(404, "NOT_FOUND", obs);

    // The course gate (Tadris+ P5-A), as the Reader's own routes: the teacher's entitlement; the student's persisted class.
    let classroom = null, study = null;
    if (actor.kind === "teacher") {
      const course = await teacherCourseDecision(actor.container, actor.user, courseId, deps);
      if (!course.ok) return course.code === "COURSE_UNKNOWN" ? refuse(404, "NOT_FOUND", obs) : courseRefusal(course, { teacher: true });
    } else {
      const classId = String(actor.student.classId || "").trim();
      classroom = classId ? await dl(actor.container, CLASS_PREFIX + classId + ".json") : null;
      if (classroom && normalizeClassStatus(classroom) === "archived") return refuse(403, "ARCHIVED", obs);
      if (!classroom || !classHasLearningCourse(classroom, courseId)) return refuse(403, "UNAVAILABLE", obs);
      const course = await classCourseDecision(actor.container, classroom, courseId, deps);
      if (!course.ok) return courseRefusal(course);
    }
    const teacher = actor.kind === "teacher";
    const canSee = moduleId => teacher || classCanSeeLearningModule(classroom, courseId, moduleId);
    const released = moduleId => teacher || classSolutionsReleased(classroom, courseId, moduleId);
    const answered = async () => {
      if (teacher) return () => true;
      if (!study) study = normalizeStudyDoc(await dl(actor.container, studyDocName(actor.student.userId)));
      return (pageId, activityId) => {
        const page = study.pages[pageId];
        return Boolean(activityId) && ((page && Object.prototype.hasOwnProperty.call(page.completed, activityId)) || wasRevealed(study, pageId, activityId));
      };
    };

    if (!action) {
      return reply(200, { ok: true, actor: actor.kind, traces: traceStates(index, { teacher, canSee, released, answered: await answered() }) });
    }

    // ── steps ──
    const q = queryOf(request);
    const pageId = String(q("pageId") || "").trim(), blockId = String(q("blockId") || "").trim();
    if (!ID.test(pageId) || !ID.test(blockId)) return refuse(400, "REQUEST_INVALID", obs);
    const t = findTrace(index, pageId, blockId);
    if (!t) return refuse(404, "NOT_FOUND", obs);
    if (!canSee(t.moduleId)) return refuse(403, "UNAVAILABLE", obs);
    if (t.kind === "book" && !released(t.moduleId)) return refuse(403, "NOT_RELEASED", obs);
    if (t.kind === "exercise" && !(await answered())(pageId, t.activityId)) return refuse(409, "ANSWER_FIRST", obs);
    return reply(200, { ok: true, trace: { kind: t.kind, code: t.code, ...(typeof t.stdin === "string" ? { stdin: t.stdin } : {}), ...(VALUES_FROM.has(t.valuesFrom) ? { valuesFrom: t.valuesFrom } : {}), ...(t.random === true ? { random: true } : {}), steps: t.steps } });
  } catch (e) {
    obs?.logError("learning.trace.error", e);
    return refuse(500, "FAILED", obs);
  }
}

app.http("learningTrace", { methods: ["GET"], authLevel: "anonymous", route: "learning-trace/{courseId}/{action?}", handler: withObservability("learning-trace", handler) });
module.exports = { handler };
