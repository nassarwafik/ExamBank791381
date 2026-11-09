// 899371 P8 (docs/enterprise-899371-learning-plan.md §21) — «جرّب الكود»: run a C# program of a learning book from the Reader.
//     GET  /api/learning-run/{courseId}       → { ok, available, blocks: { pageId: [blockId, …] } } — the blocks this actor may run
//     POST /api/learning-run/{courseId}/run   → { pageId, blockId, source, stdin } (exactly) → { ok, result }
// WHO: a teacher with learning.course.view (route-capabilities.js) and the course in their entitlement; an ACTIVE student whose
// persisted class is not archived, has the course attached and allowed, and has the block's MODULE published. Nobody else.
// WHAT: only a block of the course's RUN INDEX (learning-run.js; generated and proven to compile). The learner may edit the code
// (≤ 16 KB, not blank) and give input (≤ 4 KB); the server wraps it (learning-run.js wrapProgram) and fixes the language (csharp@1)
// and the limits. Any other field is refused.
// HOW: through the 17B CodingExecutionProvider only (the isolated Coding Runner; never on this host), after the 17B distributed
// rate limit (20 / 5 min per actor and course, its own bucket key; storage failure → FAIL CLOSED). RUNNER_BUSY → 503 retryable.
// NO RECORD: no grade, attempt, points or code is stored — the only write is the rate-limit bucket. Telemetry carries outcome codes,
// language and duration only, never the source, the input or the output.
const { app } = require("@azure/functions");
const crypto = require("crypto");
const { withObservability } = require("../lib/observability");
const { requireTeacherSession } = require("../lib/teacher-session");
const { requireCapability } = require("../lib/access/require-capability");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull } = require("../lib/platform-storage");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { classHasLearningCourse, classCanSeeLearningModule } = require("../lib/class-learning-materials");
const { teacherCourseDecision, classCourseDecision, courseRefusal } = require("../lib/access/course-access");
const { resolveCodingExecutionProvider, loadCodingCapabilities, runCodingExecution } = require("../lib/coding/execution-provider");
const { reserveCodingRun } = require("../lib/coding/run-rate-limit");
const { RUN_LANGUAGE, RUN_LIMITS, loadRunIndex, findRunBlock, runnableBlocks, wrapProgram, parseRunBody } = require("../lib/learning-run");

const CLASS_PREFIX = "platform/classes/";
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const NO_STORE = { "Cache-Control": "no-store" };
const reply = (status, jsonBody, headers = {}) => ({ status, headers: { ...NO_STORE, ...headers }, jsonBody });
const MESSAGES = {
  NOT_FOUND: "هذا البرنامج غير متاح للتشغيل.",
  UNAVAILABLE: "هذه الصفحة غير متاحة لصفك بعد.",
  ARCHIVED: "هذا الصف مؤرشف وانتهت السنة الدراسية.",
  REQUEST_INVALID: "طلب غير صالح.",
  TOO_LARGE: "الكود أو المدخلات أكبر من الحد المسموح (16 KB للكود و4 KB للمدخلات).",
  SOURCE_EMPTY: "اكتب كودًا قبل التشغيل.",
  RATE_LIMITED: "شغّلت كثيرًا في وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.",
  RUNNER_BUSY: "المشغّل مشغول الآن، حاول بعد لحظات.",
  EXECUTION_UNAVAILABLE: "تشغيل الكود غير متاح الآن.",
  LANGUAGE_UNAVAILABLE: "تشغيل C# غير متاح الآن.",
  EXECUTION_FAILED: "تعذّر تشغيل الكود الآن. حاول مرة أخرى.",
};
const refuse = (status, code, extra = {}, headers = {}) => reply(status, { ok: false, code, error: MESSAGES[code] || MESSAGES.REQUEST_INVALID, ...extra }, headers);
const RETRYABLE = new Set(["RUNNER_BUSY", "EXECUTION_FAILED", "EXECUTION_UNAVAILABLE"]);

async function resolveActor(request, deps, obs) {
  const builder = await requireTeacherSession(request, deps);
  if (builder.ok) {
    const capabilityDenial = await requireCapability(builder, "learning-run.js", "*", deps, obs);
    if (capabilityDenial) return { kind: "denied", response: capabilityDenial };
    return { kind: "teacher", id: "teacher:" + String(builder.user && builder.user.sub || ""), user: builder.user, container: deps.container || (deps.getContainer || getContainer)() };
  }
  const sess = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
  if (!sess.ok) return { kind: "denied", response: sess.response };
  return { kind: "student", id: "student:" + String(sess.student.userId), student: sess.student, container: sess.container };
}

async function readText(request) {
  try { return typeof request.text === "function" ? await request.text() : JSON.stringify(await request.json()); } catch { return null; }
}

async function handler(request, deps = {}, obs = null) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  try {
    const actor = await resolveActor(request, deps, obs);
    if (actor.kind === "denied") return actor.response;
    const courseId = String(request.params?.courseId || "").trim();
    const action = String(request.params?.action || "").trim().toLowerCase();
    const method = String(request.method || "GET").toUpperCase();
    if (!(method === "GET" && !action) && !(method === "POST" && action === "run")) return refuse(405, "REQUEST_INVALID");
    if (!ID.test(courseId)) return refuse(404, "NOT_FOUND");
    const index = (deps.loadRunIndex || loadRunIndex)(courseId);
    if (!index) return refuse(404, "NOT_FOUND");

    // The course gate (Tadris+ P5-A), as the Reader's own routes: the teacher's entitlement; the student's persisted class.
    let classroom = null;
    if (actor.kind === "teacher") {
      const course = await teacherCourseDecision(actor.container, actor.user, courseId, deps);
      if (!course.ok) return course.code === "COURSE_UNKNOWN" ? refuse(404, "NOT_FOUND") : courseRefusal(course, { teacher: true });
    } else {
      const classId = String(actor.student.classId || "").trim();
      classroom = classId ? await dl(actor.container, CLASS_PREFIX + classId + ".json") : null;
      if (classroom && normalizeClassStatus(classroom) === "archived") return refuse(403, "ARCHIVED");
      if (!classroom || !classHasLearningCourse(classroom, courseId)) return refuse(403, "UNAVAILABLE");
      const course = await classCourseDecision(actor.container, classroom, courseId, deps);
      if (!course.ok) return courseRefusal(course);
    }
    const canSee = moduleId => actor.kind === "teacher" || classCanSeeLearningModule(classroom, courseId, moduleId);
    const provider = resolveCodingExecutionProvider(deps);

    if (method === "GET") {
      const caps = await loadCodingCapabilities(provider);
      const available = caps.available && caps.languages.some(l => l.key === RUN_LANGUAGE.language && l.languageVersion === RUN_LANGUAGE.languageVersion);
      return reply(200, { ok: true, actor: actor.kind, available, blocks: runnableBlocks(index, canSee) });
    }

    // ── run ──
    const text = await readText(request);
    const body = parseRunBody(text);
    if (body.error) { obs?.logWarn("learning.run.refused", { code: body.error }); return refuse(body.error === "TOO_LARGE" ? 413 : 400, body.error); }
    const block = findRunBlock(index, body.pageId, body.blockId);
    if (!block) { obs?.logWarn("learning.run.refused", { code: "NOT_FOUND", status: 404 }); return refuse(404, "NOT_FOUND"); }
    if (!canSee(block.moduleId)) { obs?.logWarn("learning.run.refused", { code: "UNAVAILABLE", status: 403 }); return refuse(403, "UNAVAILABLE"); }
    // A runner that is not there costs the learner no run: checked before the bucket (as 17B does).
    const caps = await loadCodingCapabilities(provider);
    if (!caps.available) return refuse(503, "EXECUTION_UNAVAILABLE", { retryable: true });

    let budget;
    try { budget = await reserveCodingRun(actor.container, { studentId: actor.id, assignmentId: "learning-run/" + courseId }, deps); }
    catch { obs?.logWarn("learning.run.refused", { code: "EXECUTION_UNAVAILABLE", reason: "rate-limit-storage" }); return refuse(503, "EXECUTION_UNAVAILABLE", { retryable: true }); }
    if (!budget.allowed) {
      obs?.logWarn("learning.run.refused", { code: "RATE_LIMITED", retryAfterSeconds: budget.retryAfterSeconds });
      return refuse(429, "RATE_LIMITED", { retryAfterSeconds: budget.retryAfterSeconds }, { "Retry-After": String(budget.retryAfterSeconds) });
    }

    const t0 = Date.now();
    const r = await runCodingExecution(provider, {
      requestId: crypto.randomBytes(16).toString("base64url"),
      language: RUN_LANGUAGE.language, languageVersion: RUN_LANGUAGE.languageVersion,
      source: wrapProgram(body.source), stdin: body.stdin, limits: { ...RUN_LIMITS },
    });
    if (!r.ok) { obs?.logWarn("learning.run.refused", { code: r.code, status: r.status }); return refuse(r.status, r.code, RETRYABLE.has(r.code) ? { retryable: true } : {}); }
    obs?.logInfo("learning.run.completed", { courseId, actor: actor.kind, status: r.result.status, durationMs: Date.now() - t0 });
    return reply(200, { ok: true, result: r.result });
  } catch (e) {
    obs?.logError("learning.run.error", e);
    return refuse(500, "EXECUTION_FAILED");
  }
}

app.http("learningRun", { methods: ["GET", "POST"], authLevel: "anonymous", route: "learning-run/{courseId}/{action?}", handler: withObservability("learning-run", handler) });
module.exports = { handler };
