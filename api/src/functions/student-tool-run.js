// Phase T14 (docs/enterprise-student-tools-csharp-editor-design.md) — the student tool bar's «محرر C#»: ONE run of the learner's own
// C# program on the isolated Coding Runner.
//     POST /api/student-tools/csharp-run
//          exam: { context: "exam", assignmentId, source, stdin }   (exactly)
//          book: { context: "book", courseId, source, stdin }       (exactly)      → { ok, result }
//     GET  /api/student-tools/csharp-run  → { ok, available } — whether the runner offers csharp@1 right now (any signed-in actor;
//          the same fact /api/coding/capabilities gives every student). The editor asks it once, so a stopped runner shows
//          «متوقف حاليًا» instead of a button that cannot work. It authorises nothing: every POST is checked in full.
// WHO / WHERE — the server decides, never the browser:
//   • exam: an ACTIVE student only; the assignment is in one of the student's classes (not archived), published, and the attempt is
//     writable RIGHT NOW (the same writeRejection + timerState as a draft save — no second timer). The exam's own tool spec
//     (examSnapshot.studentTools, canonical projection) has «csharpEditor» with allowRun, and NO section switches it off
//     (csharpRunAllowedInExam: the server does not know the current section, so it never trusts one the browser names).
//   • book: an ACTIVE student whose class offers the course (not archived, course allowed), and the book's tool set for that class —
//     the teacher's choice (T11) or the built-in set (courseTools.ts, same shared build) — has «csharpEditor» with allowRun; or a
//     teacher with learning.course.view and the course in their entitlement (the Reader's preview, as «جرّب الكود»).
//   Anything else is refused BEFORE the runner and before the rate-limit bucket. A teacher never runs in an exam context.
// WHAT: the learner's source (≤ 16 KB, not blank) and input (≤ 4 KB); a source without a class is wrapped as the book does
// (line numbers kept). The language (csharp@1) and the limits (2 s, 128 MB, 16 KB of output) are the server's; any other field is
// refused. HOW: through the 17B CodingExecutionProvider only (never on this host), after the distributed rate limit (20 / 5 min per
// actor and context, its own bucket key); a storage failure FAILS CLOSED (503). RUNNER_BUSY / no runner → 503 retryable.
// NO RECORD: nothing is stored but the rate-limit bucket — no answer, draft, attempt, grade or code. A run never touches the answer
// or the score. Telemetry carries outcome codes, context kind and duration only — never the source, the input or the output.
const { app } = require("@azure/functions");
const crypto = require("crypto");
const { withObservability } = require("../lib/observability");
const { requireTeacherSession } = require("../lib/teacher-session");
const { requireCapability } = require("../lib/access/require-capability");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull } = require("../lib/platform-storage");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { classHasLearningCourse, getClassLearningCourseTools } = require("../lib/class-learning-materials");
const { teacherCourseDecision, classCourseDecision, courseRefusal } = require("../lib/access/course-access");
const { classroomServing, offersCourse } = require("../lib/student-classes");
const { studentAssignmentAccess } = require("../lib/student-class-access");
const { timerState, writeRejection } = require("../lib/assignment-availability");
const { resolveCodingExecutionProvider, loadCodingCapabilities, runCodingExecution } = require("../lib/coding/execution-provider");
const { reserveCodingRun } = require("../lib/coding/run-rate-limit");
const { RUN_LANGUAGE, RUN_LIMITS, wrapProgram } = require("../lib/learning-run");
const { utf8ByteLength } = require("../lib/shared-finalization/codingQuestion");
const { projectStudentToolsForStudent, validateBookStudentTools, csharpRunAllowedInExam, csharpRunAllowedInBook } = require("../lib/shared-finalization/studentTools/studentToolsSpec");
const { courseStudentTools } = require("../lib/shared-finalization/studentTools/courseTools");

const AP = "platform/assignments/", SP = "platform/submissions/";
const ASSIGNMENT_ID = /^[A-Za-z0-9._-]{1,128}$/;
const COURSE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SOURCE_MAX_BYTES = 16 * 1024, STDIN_MAX_BYTES = 4 * 1024, BODY_MAX_CHARS = 64 * 1024;
const EXAM_KEYS = ["assignmentId", "context", "source", "stdin"];
const BOOK_KEYS = ["context", "courseId", "source", "stdin"];
const NO_STORE = { "Cache-Control": "no-store" };
const MESSAGES = {
  REQUEST_INVALID: "طلب غير صالح.",
  TOO_LARGE: "الكود أو المدخلات أكبر من الحد المسموح (16 KB للكود و4 KB للمدخلات).",
  SOURCE_EMPTY: "اكتب كودًا قبل التشغيل.",
  RUN_NOT_ALLOWED: "تشغيل الكود غير مفعّل هنا. يمكنك الكتابة في المحرر فقط.",
  ASSIGNMENT_UNAVAILABLE: "هذا الامتحان غير متاح.",
  ATTEMPT_NOT_WRITABLE: "المحاولة غير مفتوحة الآن، فلا يمكن تشغيل الكود.",
  CLASS_ARCHIVED: "هذا الصف مؤرشف وانتهت السنة الدراسية.",
  UNAVAILABLE: "هذا الكتاب غير متاح لصفك.",
  NOT_FOUND: "هذا الكتاب غير متاح.",
  RATE_LIMITED: "شغّلت كثيرًا في وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.",
  RUNNER_BUSY: "المشغّل مشغول الآن، حاول بعد لحظات.",
  EXECUTION_UNAVAILABLE: "تشغيل الكود غير متاح الآن.",
  LANGUAGE_UNAVAILABLE: "تشغيل C# غير متاح الآن.",
  EXECUTION_FAILED: "تعذّر تشغيل الكود الآن. حاول مرة أخرى.",
};
const RETRYABLE = new Set(["RUNNER_BUSY", "EXECUTION_FAILED", "EXECUTION_UNAVAILABLE"]);
const reply = (status, jsonBody, headers = {}) => ({ status, headers: { ...NO_STORE, ...headers }, jsonBody });
const refuse = (status, code, extra = {}, headers = {}) =>
  reply(status, { ok: false, code, error: MESSAGES[code] || MESSAGES.REQUEST_INVALID, ...(RETRYABLE.has(code) ? { retryable: true } : {}), ...extra }, headers);
const sameKeys = (keys, expected) => keys.length === expected.length && keys.every((k, i) => k === expected[i]);

/** Strict body: exactly one of the two shapes, strings only, bounded; a blank source is refused. → body | { error } */
function parseToolRunBody(text) {
  if (typeof text !== "string" || text.length > BODY_MAX_CHARS) return { error: "TOO_LARGE" };
  let b;
  try { b = JSON.parse(text); } catch { return { error: "REQUEST_INVALID" }; }
  if (!b || typeof b !== "object" || Array.isArray(b)) return { error: "REQUEST_INVALID" };
  const keys = Object.keys(b).sort();
  const exam = b.context === "exam" && sameKeys(keys, EXAM_KEYS), book = b.context === "book" && sameKeys(keys, BOOK_KEYS);
  if (!exam && !book) return { error: "REQUEST_INVALID" };
  const id = exam ? b.assignmentId : b.courseId;
  if ([id, b.source, b.stdin].some(v => typeof v !== "string")) return { error: "REQUEST_INVALID" };
  if (utf8ByteLength(b.source) > SOURCE_MAX_BYTES || utf8ByteLength(b.stdin) > STDIN_MAX_BYTES) return { error: "TOO_LARGE" };
  if (!b.source.trim()) return { error: "SOURCE_EMPTY" };
  return exam ? { context: "exam", assignmentId: id, source: b.source, stdin: b.stdin } : { context: "book", courseId: id.trim(), source: b.source, stdin: b.stdin };
}

async function readText(request) {
  try { return typeof request.text === "function" ? await request.text() : JSON.stringify(await request.json()); } catch { return null; }
}

/** The caller: a teacher (builder session, capability asked) or an active student. */
async function resolveActor(request, deps, obs) {
  const builder = await requireTeacherSession(request, deps);
  if (builder.ok) {
    const capabilityDenial = await requireCapability(builder, "student-tool-run.js", "*", deps, obs);
    if (capabilityDenial) return { kind: "denied", response: capabilityDenial };
    return { kind: "teacher", id: "teacher:" + String(builder.user && builder.user.sub || ""), user: builder.user, container: deps.container || (deps.getContainer || getContainer)() };
  }
  const sess = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
  if (!sess.ok) return { kind: "denied", response: sess.response };
  return { kind: "student", id: "student:" + String(sess.student.userId), student: sess.student, container: sess.container };
}

/** Exam context: null when the run is allowed, else the refusal. Students only. */
async function examDecision(actor, body, deps) {
  if (actor.kind !== "student") return refuse(403, "RUN_NOT_ALLOWED");
  if (!ASSIGNMENT_ID.test(body.assignmentId) || body.assignmentId.includes("..")) return refuse(404, "ASSIGNMENT_UNAVAILABLE");
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull, c = actor.container, student = actor.student;
  const access = await studentAssignmentAccess(student, n => dl(c, n), () => dl(c, AP + body.assignmentId + ".json"));
  if (access.denied === "archived") return refuse(403, "CLASS_ARCHIVED");
  if (access.denied) return refuse(404, "ASSIGNMENT_UNAVAILABLE");
  const a = access.assignment;
  const s = await dl(c, SP + body.assignmentId + "/" + student.userId + ".json");
  if (a.status !== "published") return refuse(a.status === "archived" && s ? 403 : 404, "ASSIGNMENT_UNAVAILABLE");
  const nowMs = Date.now();
  if (writeRejection(a, s, "saveDraft", nowMs) || !timerState(a, s, nowMs).canWrite) return refuse(409, "ATTEMPT_NOT_WRITABLE");
  let spec;
  try { spec = projectStudentToolsForStudent(a.examSnapshot && typeof a.examSnapshot === "object" ? a.examSnapshot.studentTools : undefined); } catch { spec = undefined; }
  if (!csharpRunAllowedInExam(spec)) return refuse(403, "RUN_NOT_ALLOWED");
  return null;
}

/** Book context: null when the run is allowed, else the refusal. */
async function bookDecision(actor, body, deps) {
  const courseId = body.courseId;
  if (!COURSE_ID.test(courseId)) return refuse(404, "NOT_FOUND");
  if (actor.kind === "teacher") {
    const course = await teacherCourseDecision(actor.container, actor.user, courseId, deps);
    if (!course.ok) return course.code === "COURSE_UNKNOWN" ? refuse(404, "NOT_FOUND") : courseRefusal(course, { teacher: true });
    return null;
  }
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const classroom = await classroomServing(actor.student, name => dl(actor.container, name), offersCourse(courseId));
  if (classroom && normalizeClassStatus(classroom) === "archived") return refuse(403, "CLASS_ARCHIVED");
  if (!classroom || !classHasLearningCourse(classroom, courseId)) return refuse(403, "UNAVAILABLE");
  const course = await classCourseDecision(actor.container, classroom, courseId, deps);
  if (!course.ok) return courseRefusal(course);
  // The book's tools for THIS class: the teacher's choice (canonical, T11) or, when none, the built-in set. Unreadable → no run.
  let spec;
  try {
    const chosen = getClassLearningCourseTools(classroom, courseId);
    if (chosen !== undefined) { const v = validateBookStudentTools(chosen); spec = v.ok ? v.value : undefined; }
    else spec = projectStudentToolsForStudent(courseStudentTools(courseId));
  } catch { spec = undefined; }
  if (!csharpRunAllowedInBook(spec)) return refuse(403, "RUN_NOT_ALLOWED");
  return null;
}

async function handler(request, deps = {}, obs = null) {
  try {
    const method = String(request.method || "POST").toUpperCase();
    const actor = await resolveActor(request, deps, obs);
    if (actor.kind === "denied") return actor.response;
    if (method === "GET") {
      const caps = await loadCodingCapabilities(resolveCodingExecutionProvider(deps));
      const available = caps.available && caps.languages.some(l => l.key === RUN_LANGUAGE.language && l.languageVersion === RUN_LANGUAGE.languageVersion);
      return reply(200, { ok: true, available });
    }
    if (method !== "POST") return refuse(405, "REQUEST_INVALID");
    const body = parseToolRunBody(await readText(request));
    if (body.error) { obs?.logWarn("student-tool.run.refused", { code: body.error }); return refuse(body.error === "TOO_LARGE" ? 413 : 400, body.error); }

    const denial = body.context === "exam" ? await examDecision(actor, body, deps) : await bookDecision(actor, body, deps);
    if (denial) { obs?.logWarn("student-tool.run.refused", { context: body.context, code: denial.jsonBody && denial.jsonBody.code, status: denial.status }); return denial; }

    // A runner that is not there costs the learner no run: checked before the bucket.
    const provider = resolveCodingExecutionProvider(deps);
    const caps = await loadCodingCapabilities(provider);
    if (!caps.available) return refuse(503, "EXECUTION_UNAVAILABLE");
    if (!caps.languages.some(l => l.key === RUN_LANGUAGE.language && l.languageVersion === RUN_LANGUAGE.languageVersion)) return refuse(503, "LANGUAGE_UNAVAILABLE");

    const scope = "student-tools/csharp/" + (body.context === "exam" ? "exam/" + body.assignmentId : "book/" + body.courseId);
    let budget;
    try { budget = await reserveCodingRun(actor.container, { studentId: actor.id, assignmentId: scope }, deps); }
    catch { obs?.logWarn("student-tool.run.refused", { code: "EXECUTION_UNAVAILABLE", reason: "rate-limit-storage" }); return refuse(503, "EXECUTION_UNAVAILABLE"); }
    if (!budget.allowed) {
      obs?.logWarn("student-tool.run.refused", { code: "RATE_LIMITED", retryAfterSeconds: budget.retryAfterSeconds });
      return refuse(429, "RATE_LIMITED", { retryAfterSeconds: budget.retryAfterSeconds }, { "Retry-After": String(budget.retryAfterSeconds) });
    }

    const t0 = Date.now();
    const r = await runCodingExecution(provider, {
      requestId: crypto.randomBytes(16).toString("base64url"),
      language: RUN_LANGUAGE.language, languageVersion: RUN_LANGUAGE.languageVersion,
      source: wrapProgram(body.source), stdin: body.stdin, limits: { ...RUN_LIMITS },
    });
    if (!r.ok) { obs?.logWarn("student-tool.run.refused", { code: r.code, status: r.status }); return refuse(r.status, r.code); }
    obs?.logInfo("student-tool.run.completed", { context: body.context, actor: actor.kind, status: r.result.status, durationMs: Date.now() - t0 });
    return reply(200, { ok: true, result: r.result });
  } catch (e) {
    obs?.logError("student-tool.run.error", e);
    return refuse(500, "EXECUTION_FAILED");
  }
}

app.http("studentToolCsharpRun", { methods: ["GET", "POST"], authLevel: "anonymous", route: "student-tools/csharp-run", handler: withObservability("student-tool-run", handler) });
module.exports = { handler, parseToolRunBody };
