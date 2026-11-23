// Phase T14 (docs/enterprise-student-tools-csharp-editor-design.md) — the student tool bar's «محرر C#»: ONE run of the learner's own
// C# program on the isolated Coding Runner — in a COURSE BOOK only.
//     POST /api/student-tools/csharp-run  { context: "book", courseId, source, stdin } (exactly) → { ok, result }
//     GET  /api/student-tools/csharp-run  → { ok, available } — whether the runner offers csharp@1 right now (any signed-in actor;
//          the same fact /api/coding/capabilities gives every student). The editor asks it once, so a stopped runner shows
//          «متوقف حاليًا» instead of a button that cannot work. It authorises nothing: every POST is checked in full.
//     GET  /api/student-tools/csharp-run?library=<courseId>  → { ok, library } — TEACHER C# LAB only (AGENTS.md §1): the book's classes
//          (course-library.js) for the teacher's on-device lab, which runs in a sandboxed iframe with no access to the API. A teacher
//          with learning.course.view and the course in their entitlement; a student is refused (403); an unknown course is 404. The
//          classes are course content, so they are never a static file: this authenticated read is their only way to the browser.
// OWNER DECISION (T14 follow-up): the book is practice, so the editor may run there; in exams and assignments the editor is a WRITING
// aid only (the student copies the code into the answer) and NEVER runs. This route therefore has no exam context at all: a body
// naming an assignment is malformed (400) and reaches nothing. Coding QUESTIONS keep their own, separate practice run (coding-run.js).
// WHO: an ACTIVE student whose class offers the course (not archived, course allowed), and the book's tool set for that class — the
// teacher's choice (T11) or the built-in set (courseTools.ts, same shared build) — has «csharpEditor» with allowRun; or a teacher with
// learning.course.view and the course in their entitlement (the Reader's preview, as «جرّب الكود»). Anything else is refused BEFORE
// the runner and before the rate-limit bucket.
// WHAT: the learner's source (≤ 16 KB, not blank) and input (≤ 4 KB); a source without a class is wrapped as the book does
// (line numbers kept). A book written against its own classes (course-library.js — «مبنى المعطيات»: Node, Node<T>, BinNode<T>,
// Stack<T>, Queue<T>) gets them APPENDED after the program, except a class the writer declares; line numbers are unchanged. The language (csharp@1) and the limits (2 s, 128 MB, 16 KB of output) are the server's; any other field is
// refused. HOW: through the 17B CodingExecutionProvider only (never on this host), after the distributed rate limit (20 / 5 min per
// actor and book, its own bucket key); a storage failure FAILS CLOSED (503). RUNNER_BUSY / no runner → 503 retryable.
// NO RECORD: nothing is stored but the rate-limit bucket — no answer, attempt, grade or code. Telemetry carries outcome codes and
// duration only — never the source, the input or the output.
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
const { resolveCodingExecutionProvider, loadCodingCapabilities, runCodingExecution } = require("../lib/coding/execution-provider");
const { reserveCodingRun } = require("../lib/coding/run-rate-limit");
const { RUN_LANGUAGE, RUN_LIMITS, wrapProgram } = require("../lib/learning-run");
const { withCourseLibrary, libraryClasses } = require("../lib/course-library");
const { utf8ByteLength } = require("../lib/shared-finalization/codingQuestion");
const { projectStudentToolsForStudent, validateBookStudentTools, csharpRunAllowedInBook } = require("../lib/shared-finalization/studentTools/studentToolsSpec");
const { courseStudentTools } = require("../lib/shared-finalization/studentTools/courseTools");

const COURSE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SOURCE_MAX_BYTES = 16 * 1024, STDIN_MAX_BYTES = 4 * 1024, BODY_MAX_CHARS = 64 * 1024;
const BOOK_KEYS = ["context", "courseId", "source", "stdin"];
const NO_STORE = { "Cache-Control": "no-store" };
const MESSAGES = {
  REQUEST_INVALID: "طلب غير صالح.",
  TOO_LARGE: "الكود أو المدخلات أكبر من الحد المسموح (16 KB للكود و4 KB للمدخلات).",
  SOURCE_EMPTY: "اكتب كودًا قبل التشغيل.",
  RUN_NOT_ALLOWED: "تشغيل الكود غير مفعّل هنا. يمكنك الكتابة في المحرر فقط.",
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

/** Strict body: exactly { context: "book", courseId, source, stdin }, strings only, bounded; a blank source is refused. → body | { error }
 *  There is no exam shape: an exam never runs code from the tool bar (owner decision). */
function parseToolRunBody(text) {
  if (typeof text !== "string" || text.length > BODY_MAX_CHARS) return { error: "TOO_LARGE" };
  let b;
  try { b = JSON.parse(text); } catch { return { error: "REQUEST_INVALID" }; }
  if (!b || typeof b !== "object" || Array.isArray(b)) return { error: "REQUEST_INVALID" };
  if (b.context !== "book" || !sameKeys(Object.keys(b).sort(), BOOK_KEYS)) return { error: "REQUEST_INVALID" };
  if ([b.courseId, b.source, b.stdin].some(v => typeof v !== "string")) return { error: "REQUEST_INVALID" };
  if (utf8ByteLength(b.source) > SOURCE_MAX_BYTES || utf8ByteLength(b.stdin) > STDIN_MAX_BYTES) return { error: "TOO_LARGE" };
  if (!b.source.trim()) return { error: "SOURCE_EMPTY" };
  return { context: "book", courseId: b.courseId.trim(), source: b.source, stdin: b.stdin };
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

function readQuery(request, name) {
  try {
    const q = request.query && typeof request.query.get === "function" ? request.query : new URL(String(request.url || ""), "http://x").searchParams;
    return q.get(name);
  } catch { return null; }
}

/** The book's classes for the teacher's on-device lab (teachers only; the course must be in their entitlement). */
async function libraryResponse(actor, courseIdRaw, deps) {
  if (actor.kind !== "teacher") return refuse(403, "RUN_NOT_ALLOWED");
  const courseId = String(courseIdRaw).trim();
  if (!COURSE_ID.test(courseId)) return refuse(404, "NOT_FOUND");
  const course = await teacherCourseDecision(actor.container, actor.user, courseId, deps);
  if (!course.ok) return course.code === "COURSE_UNKNOWN" ? refuse(404, "NOT_FOUND") : courseRefusal(course, { teacher: true });
  return reply(200, { ok: true, library: libraryClasses(courseId).map(c => c.code).join("\n\n") });
}

async function handler(request, deps = {}, obs = null) {
  try {
    const method = String(request.method || "POST").toUpperCase();
    const actor = await resolveActor(request, deps, obs);
    if (actor.kind === "denied") return actor.response;
    if (method === "GET") {
      const libraryFor = readQuery(request, "library");
      if (libraryFor !== null) return libraryResponse(actor, libraryFor, deps);
      const caps = await loadCodingCapabilities(resolveCodingExecutionProvider(deps));
      const available = caps.available && caps.languages.some(l => l.key === RUN_LANGUAGE.language && l.languageVersion === RUN_LANGUAGE.languageVersion);
      return reply(200, { ok: true, available });
    }
    if (method !== "POST") return refuse(405, "REQUEST_INVALID");
    const body = parseToolRunBody(await readText(request));
    if (body.error) { obs?.logWarn("student-tool.run.refused", { code: body.error }); return refuse(body.error === "TOO_LARGE" ? 413 : 400, body.error); }

    const denial = await bookDecision(actor, body, deps);
    if (denial) { obs?.logWarn("student-tool.run.refused", { code: denial.jsonBody && denial.jsonBody.code, status: denial.status }); return denial; }

    // A runner that is not there costs the learner no run: checked before the bucket.
    const provider = resolveCodingExecutionProvider(deps);
    const caps = await loadCodingCapabilities(provider);
    if (!caps.available) return refuse(503, "EXECUTION_UNAVAILABLE");
    if (!caps.languages.some(l => l.key === RUN_LANGUAGE.language && l.languageVersion === RUN_LANGUAGE.languageVersion)) return refuse(503, "LANGUAGE_UNAVAILABLE");

    const scope = "student-tools/csharp/book/" + body.courseId;
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
      source: withCourseLibrary(body.courseId, wrapProgram(body.source), body.source), stdin: body.stdin, limits: { ...RUN_LIMITS },
    });
    if (!r.ok) { obs?.logWarn("student-tool.run.refused", { code: r.code, status: r.status }); return refuse(r.status, r.code); }
    obs?.logInfo("student-tool.run.completed", { actor: actor.kind, status: r.result.status, durationMs: Date.now() - t0 });
    return reply(200, { ok: true, result: r.result });
  } catch (e) {
    obs?.logError("student-tool.run.error", e);
    return refuse(500, "EXECUTION_FAILED");
  }
}

app.http("studentToolCsharpRun", { methods: ["GET", "POST"], authLevel: "anonymous", route: "student-tools/csharp-run", handler: withObservability("student-tool-run", handler) });
module.exports = { handler, parseToolRunBody };
