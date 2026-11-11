// 899371 enrichment P14 (docs/enterprise-899371-enrichment-plan.md §3.3, §11) — «حلّ وافحص» under the book's writing questions.
//     GET  /api/learning-solve/{courseId}                         → { ok, actor, available, questions: { "<pageId>/<blockId>": view } }
//     POST /api/learning-solve/{courseId}/run      { questionId, source | values, stdin }  → { ok, result }   (one practice run)
//     POST /api/learning-solve/{courseId}/check    { questionId, source | values }         → { ok, check }    (public + hidden)
//     GET  /api/learning-solve/{courseId}/solution?questionId=…  → { ok, solution: { reference, explanation } }
// WHO: a teacher with learning.course.view (route-capabilities.js) and the course in their entitlement; an ACTIVE student whose
// persisted class is not archived, has the course attached and allowed, and has the question's MODULE published. The SOLUTION CARD
// only for a teacher, or a student whose teacher released that module's solutions to the class (decision D1); «افحص حلي» itself never
// shows a solution and is open whenever the question is.
// WHAT: the program is the learner's whole program (version 2) or the PUBLISHED locked template with the learner's gap values
// (version 3: locked text never comes from the request); ≤ 16 KB. The server fixes language (csharp@1), wrapper and limits.
// HOW: through the 17B CodingExecutionProvider only — the isolated Coding Runner, never this host. Enrichment P18 (decision D4-b): ONE
// synchronous check when the Runner offers it (compiled once, a fresh sandbox per input); otherwise — a Runner that predates it —
// one practice run per input, in order (decision D4-a): the public example, then every hidden input. The SERVER compares (normalizeWhitespace, as the
// official grading); the reply shows the public example in full and, for each hidden input, pass / fail only — never its input or its
// expected output. A compile error stops the check with the compiler's message. A question that cannot be checked (run-only: random,
// wording awaiting the owner's correction) refuses the check (409) and keeps «تشغيل». RUNNER_BUSY / no runner → 503 retryable, never a
// verdict. Rate limit (17B buckets, fail closed): runs and checks have their own buckets (20 / 5 min each, per actor and course).
// NO RECORD (decision D3): no grade, attempt, points or code is stored — only the rate-limit buckets are written. Telemetry carries
// outcome codes and counts, never the code, the input or the output.
const { app } = require("@azure/functions");
const crypto = require("crypto");
const { withObservability } = require("../lib/observability");
const { requireTeacherSession } = require("../lib/teacher-session");
const { requireCapability } = require("../lib/access/require-capability");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull } = require("../lib/platform-storage");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { classHasLearningCourse, classCanSeeLearningModule, classSolutionsReleased } = require("../lib/class-learning-materials");
const { teacherCourseDecision, classCourseDecision, courseRefusal } = require("../lib/access/course-access");
const { resolveCodingExecutionProvider, loadCodingCapabilities, runCodingExecution, runCodingCheck } = require("../lib/coding/execution-provider");
const { reserveCodingRun } = require("../lib/coding/run-rate-limit");
const { compareOutput } = require("../lib/shared-finalization/codingContract");
const { RUN_LANGUAGE, RUN_LIMITS } = require("../lib/learning-run");
const { loadSolveIndex, findSolve, publicView, programFromAnswer } = require("../lib/learning-solve");

const CLASS_PREFIX = "platform/classes/";
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const NO_STORE = { "Cache-Control": "no-store" };
const STDIN_MAX_BYTES = 4096;
const BODY_MAX_BYTES = 64 * 1024;
const OUTPUT_SHOWN = 4096;
const COMPARATOR = "normalizeWhitespace";
const reply = (status, jsonBody, headers = {}) => ({ status, headers: { ...NO_STORE, ...headers }, jsonBody });
const MESSAGES = {
  NOT_FOUND: "هذا السؤال غير متاح للحل.",
  UNAVAILABLE: "هذه الصفحة غير متاحة لصفك بعد.",
  ARCHIVED: "هذا الصف مؤرشف وانتهت السنة الدراسية.",
  NOT_RELEASED: "لم يفتح المعلم حلول هذا الفصل بعد.",
  NOT_CHECKABLE: "هذا السؤال لا يُفحص آليًا: شغّل برنامجك وتأكد من ناتجه بنفسك.",
  REQUEST_INVALID: "طلب غير صالح.",
  TOO_LARGE: "الكود أو المدخلات أكبر من الحد المسموح (16 KB للكود و4 KB للمدخلات).",
  SOURCE_EMPTY: "اكتب كودًا قبل التشغيل.",
  RATE_LIMITED: "شغّلت أو فحصت كثيرًا في وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.",
  RUNNER_BUSY: "المشغّل مشغول الآن، حاول بعد لحظات.",
  EXECUTION_UNAVAILABLE: "تشغيل الكود غير متاح الآن.",
  LANGUAGE_UNAVAILABLE: "تشغيل C# غير متاح الآن.",
  EXECUTION_FAILED: "تعذّر تشغيل الكود الآن. حاول مرة أخرى.",
};
const RETRYABLE = new Set(["RUNNER_BUSY", "EXECUTION_FAILED", "EXECUTION_UNAVAILABLE"]);
const refuse = (status, code, obs, extra = {}, headers = {}) => {
  if (obs && status !== 500) obs.logWarn("learning.solve.refused", { code, status });
  return reply(status, { ok: false, code, error: MESSAGES[code] || MESSAGES.REQUEST_INVALID, ...(RETRYABLE.has(code) ? { retryable: true } : {}), ...extra }, headers);
};

async function resolveActor(request, deps, obs) {
  const builder = await requireTeacherSession(request, deps);
  if (builder.ok) {
    const capabilityDenial = await requireCapability(builder, "learning-solve.js", "*", deps, obs);
    if (capabilityDenial) return { kind: "denied", response: capabilityDenial };
    return { kind: "teacher", id: "teacher:" + String(builder.user && builder.user.sub || ""), user: builder.user, container: deps.container || (deps.getContainer || getContainer)() };
  }
  const sess = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
  if (!sess.ok) return { kind: "denied", response: sess.response };
  return { kind: "student", id: "student:" + String(sess.student.userId), student: sess.student, container: sess.container };
}
async function readBody(request) {
  let text;
  try { text = typeof request.text === "function" ? await request.text() : JSON.stringify(await request.json()); } catch { return { error: "REQUEST_INVALID" }; }
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > BODY_MAX_BYTES) return { error: "TOO_LARGE" };
  let body;
  try { body = JSON.parse(text); } catch { return { error: "REQUEST_INVALID" }; }
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.questionId !== "string") return { error: "REQUEST_INVALID" };
  return { body };
}
const queryOf = request => {
  const q = request.query;
  if (q && typeof q.get === "function") return k => q.get(k);
  try { const u = new URL(request.url || "", "http://x"); return k => u.searchParams.get(k); } catch { return () => null; }
};
const execute = (provider, source, stdin) => runCodingExecution(provider, {
  requestId: crypto.randomBytes(16).toString("base64url"),
  language: RUN_LANGUAGE.language, languageVersion: RUN_LANGUAGE.languageVersion, source, stdin, limits: { ...RUN_LIMITS },
});
const shown = s => (typeof s === "string" ? (s.length > OUTPUT_SHOWN ? s.slice(0, OUTPUT_SHOWN) : s) : "");

async function handler(request, deps = {}, obs = null) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  try {
    const actor = await resolveActor(request, deps, obs);
    if (actor.kind === "denied") return actor.response;
    const courseId = String(request.params?.courseId || "").trim();
    const action = String(request.params?.action || "").trim().toLowerCase();
    const method = String(request.method || "GET").toUpperCase();
    const allowed = (method === "GET" && (!action || action === "solution")) || (method === "POST" && (action === "run" || action === "check"));
    if (!allowed) return reply(405, { ok: false, code: "REQUEST_INVALID", error: MESSAGES.REQUEST_INVALID });
    if (!ID.test(courseId)) return refuse(404, "NOT_FOUND", obs);
    const index = (deps.loadSolveIndex || loadSolveIndex)(courseId);
    if (!index) return refuse(404, "NOT_FOUND", obs);

    // The course gate (Tadris+ P5-A), as the Reader's own routes: the teacher's entitlement; the student's persisted class.
    let classroom = null;
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
    const provider = resolveCodingExecutionProvider(deps);

    if (method === "GET" && !action) {
      const caps = await loadCodingCapabilities(provider);
      const available = caps.available && caps.languages.some(l => l.key === RUN_LANGUAGE.language && l.languageVersion === RUN_LANGUAGE.languageVersion);
      const questions = {};
      for (const [qid, s] of Object.entries(index.questions)) if (canSee(s.moduleId)) questions[s.pageId + "/" + s.blockId] = publicView(qid, s, released(s.moduleId));
      return reply(200, { ok: true, actor: actor.kind, available, questions });
    }

    if (method === "GET") {   // ── the solution card ──
      const s = findSolve(index, String(queryOf(request)("questionId") || "").trim());
      if (!s) return refuse(404, "NOT_FOUND", obs);
      if (!canSee(s.moduleId)) return refuse(403, "UNAVAILABLE", obs);
      if (!released(s.moduleId)) return refuse(403, "NOT_RELEASED", obs);
      return reply(200, { ok: true, solution: { reference: s.reference, explanation: s.explanation } });
    }

    // ── run / check ──
    const parsed = await readBody(request);
    if (parsed.error) return refuse(parsed.error === "TOO_LARGE" ? 413 : 400, parsed.error, obs);
    const body = parsed.body;
    const allowedKeys = action === "run" ? ["questionId", "source", "values", "stdin"] : ["questionId", "source", "values"];
    if (Object.keys(body).some(k => !allowedKeys.includes(k))) return refuse(400, "REQUEST_INVALID", obs);
    const s = findSolve(index, body.questionId);
    if (!s) return refuse(404, "NOT_FOUND", obs);
    if (!canSee(s.moduleId)) return refuse(403, "UNAVAILABLE", obs);
    if (action === "check" && s.check !== true) return refuse(409, "NOT_CHECKABLE", obs);
    let stdin = "";
    if (action === "run") {
      if (body.stdin !== undefined && typeof body.stdin !== "string") return refuse(400, "REQUEST_INVALID", obs);
      stdin = body.stdin || "";
      if (Buffer.byteLength(stdin, "utf8") > STDIN_MAX_BYTES) return refuse(413, "TOO_LARGE", obs);
    }
    const program = programFromAnswer(s, body);
    if (!program.ok) return refuse(program.code === "TOO_LARGE" ? 413 : 400, program.code, obs);
    // A runner that is not there costs the learner nothing: checked before the bucket (as 17B does).
    const caps = await loadCodingCapabilities(provider);
    if (!caps.available) return refuse(503, "EXECUTION_UNAVAILABLE", obs);
    let budget;
    try { budget = await reserveCodingRun(actor.container, { studentId: actor.id, assignmentId: (action === "check" ? "learning-solve-check/" : "learning-solve-run/") + courseId }, deps); }
    catch { return refuse(503, "EXECUTION_UNAVAILABLE", obs); }
    if (!budget.allowed) return refuse(429, "RATE_LIMITED", obs, { retryAfterSeconds: budget.retryAfterSeconds }, { "Retry-After": String(budget.retryAfterSeconds) });

    if (action === "run") {
      const r = await execute(provider, program.source, stdin);
      if (!r.ok) return refuse(r.status, r.code, obs);
      obs?.logInfo("learning.solve.run", { courseId, actor: actor.kind, status: r.result.status });
      return reply(200, { ok: true, result: r.result });
    }

    // «افحص حلي»: the public example(s), then every hidden input, compared by the server.
    const pub = s.node.publicTests || [];
    const all = [...pub.map(t => ({ isPublic: true, input: t.input, expected: t.sampleOutput })), ...s.hidden.map(h => ({ isPublic: false, input: h.input, expected: h.expected }))];
    const total = all.length;
    const compileError = stderr => {
      obs?.logInfo("learning.solve.check", { courseId, actor: actor.kind, outcome: "compile-error", path });
      return reply(200, { ok: true, check: { outcome: "compile-error", message: shown(stderr), passed: 0, total, cases: [] } });
    };
    // D4-b first: ONE check, compiled once; a Runner without it answers «unsupported» and the inputs run one at a time (D4-a)
    let path = "check", results = null;
    const suite = await runCodingCheck(provider, { requestId: crypto.randomBytes(16).toString("base64url"), language: RUN_LANGUAGE.language, languageVersion: RUN_LANGUAGE.languageVersion, source: program.source, inputs: all.map(c => c.input), limits: { ...RUN_LIMITS } });
    if (!suite.ok) return refuse(suite.status, suite.code, obs);   // no partial verdict: a runner failure is never a «failed»
    if (suite.compileError) return compileError(suite.compileError.stderr);
    if (!suite.unsupported) results = suite.results;
    else path = "runs";
    const cases = [];
    for (let k = 0; k < total; k++) {
      const { isPublic, input, expected } = all[k];
      let res;
      if (results) res = results[k];
      else {
        const r = await execute(provider, program.source, input);
        if (!r.ok) return refuse(r.status, r.code, obs);   // no partial verdict: a runner failure is never a «failed»
        res = r.result;
      }
      // the Runner could not judge this run (its own fault, never the learner's): no verdict at all
      if (res.status === "internal-error") return refuse(503, "EXECUTION_FAILED", obs);
      if (res.status === "compile-error") return compileError(res.stderr);
      const passed = res.status === "success" && compareOutput(res.stdout, expected, COMPARATOR);
      const why = passed ? undefined : res.status === "success" ? "wrong-output" : ["timeout", "output-limit"].includes(res.status) ? res.status : "runtime-error";
      cases.push(isPublic
        ? { kind: "public", input, expected, actual: shown(res.stdout), passed, ...(why ? { why } : {}), ...(res.status !== "success" && res.stderr ? { stderr: shown(res.stderr) } : {}) }
        : { kind: "hidden", passed, ...(why ? { why } : {}) });
    }
    const passedCount = cases.filter(c => c.passed).length;
    obs?.logInfo("learning.solve.check", { courseId, actor: actor.kind, outcome: passedCount === cases.length ? "passed" : "failed", passed: passedCount, total: cases.length, path });
    return reply(200, { ok: true, check: { outcome: passedCount === cases.length ? "passed" : "failed", passed: passedCount, total: cases.length, cases } });
  } catch (e) {
    obs?.logError("learning.solve.error", e);
    return refuse(500, "EXECUTION_FAILED", obs);
  }
}

app.http("learningSolve", { methods: ["GET", "POST"], authLevel: "anonymous", route: "learning-solve/{courseId}/{action?}", handler: withObservability("learning-solve", handler) });
module.exports = { handler };
