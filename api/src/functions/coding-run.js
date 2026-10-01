// Phase 17B — PRACTICE code execution for students.
//     POST /api/coding/run            { assignmentId, questionId, language, languageVersion, source, stdin }
//     GET  /api/coding/capabilities   → { ok, available, languages: [{ key, languageVersion }] }
// Both require an authenticated, ACTIVE student session; identity (student, class) comes ONLY from the session, never from the
// body. A run is authorised against the AUTHORITATIVE assignment: it must exist in the student's class, be published, belong
// to an active class, and the student's attempt must be writable right now under the existing attempt / timer rules
// (writeRejection + timerState — there is no second timer). The request is bound to the PUBLISHED coding@1 question of the
// assignment's exam snapshot through the same shared bindCodeAnswerToQuestion the draft / submit ingestion uses (allowed
// language, question source limit, 64 KB ceiling); stdin ≤ 16 KB. Time / memory / output limits are derived on the server from
// that question — any client-supplied limit (or any unknown field) is refused. Hidden tests, expected outputs and reference
// solutions are never read here. A run NEVER writes answers, drafts, attempts or scores: the only storage write is the
// distributed rate-limit bucket. Code is executed ONLY by the isolated Coding Runner Gateway, reached through the execution
// provider; with no runner configured every run is 503 EXECUTION_UNAVAILABLE. Telemetry carries outcome codes, language and
// duration only — never source, stdin, stdout or stderr.
const { app } = require("@azure/functions");
const crypto = require("crypto");
const { withObservability } = require("../lib/observability");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { downloadJsonOrNull } = require("../lib/platform-storage");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { timerState, writeRejection } = require("../lib/assignment-availability");
const { flattenQuestions } = require("../lib/exam-structure");
const { bindCodeAnswerToQuestion, projectCodingConfigForStudent, DEFAULT_CODING_LIMITS, CODING_LIMIT_RANGES, CODING_TEST_LIMITS, utf8ByteLength } = require("../lib/shared-finalization/codingQuestion");
const { resolveCodingExecutionProvider, loadCodingCapabilities, runCodingExecution } = require("../lib/coding/execution-provider");
const { reserveCodingRun } = require("../lib/coding/run-rate-limit");

const AP = "platform/assignments/", SP = "platform/submissions/";
const MAX_BODY_CHARS = 256 * 1024;
const BODY_KEYS = ["assignmentId", "language", "languageVersion", "questionId", "source", "stdin"];
const ASSIGNMENT_ID = /^[A-Za-z0-9._-]{1,128}$/;
const NO_STORE = { "Cache-Control": "no-store" };
const reply = (status, jsonBody, headers = {}) => ({ status, headers: { ...NO_STORE, ...headers }, jsonBody });
const refuse = (status, code) => reply(status, { ok: false, code });
const BIND_REFUSAL = { CODE_QUESTION_MISMATCH: [400, "CODE_QUESTION_MISMATCH"], CODE_LANGUAGE_NOT_ALLOWED: [400, "CODE_LANGUAGE_NOT_ALLOWED"], CODE_SOURCE_TOO_LARGE: [413, "CODE_SOURCE_TOO_LARGE"] };

/** Strict body parse: exactly the six fields, right types, bounded size. Returns the body or null. */
async function readRunBody(request) {
  let text;
  try { text = typeof request.text === "function" ? await request.text() : JSON.stringify(await request.json()); } catch { return null; }
  if (typeof text !== "string" || text.length > MAX_BODY_CHARS) return null;
  let b;
  try { b = JSON.parse(text); } catch { return null; }
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  const keys = Object.keys(b).sort();
  if (keys.length !== BODY_KEYS.length || keys.some((k, i) => k !== BODY_KEYS[i])) return null;
  const { assignmentId, questionId, language, languageVersion, source, stdin } = b;
  if (typeof assignmentId !== "string" || typeof questionId !== "string" || questionId.length < 1 || questionId.length > 128) return null;
  if (typeof language !== "string" || typeof languageVersion !== "number" || typeof source !== "string" || typeof stdin !== "string") return null;
  if (utf8ByteLength(stdin) > CODING_TEST_LIMITS.ioBytes) return null;
  return { assignmentId, questionId, language, languageVersion, source, stdin };
}

/** The question's own execution limits (public projection), each bounded by the platform ranges; defaults when absent. */
function limitsFor(question) {
  const cfg = projectCodingConfigForStudent(question.coding);
  const l = cfg && cfg.limits && typeof cfg.limits === "object" ? cfg.limits : {};
  const pick = k => (Number.isInteger(l[k]) && l[k] >= CODING_LIMIT_RANGES[k][0] && l[k] <= CODING_LIMIT_RANGES[k][1] ? l[k] : DEFAULT_CODING_LIMITS[k]);
  return { timeMs: pick("timeMs"), memoryMb: pick("memoryMb"), outputBytes: pick("outputBytes") };
}

function findQuestion(exam, questionId) {
  if (!exam || typeof exam !== "object") return undefined;
  try { for (const { question, questionId: id } of flattenQuestions(exam)) if (id === questionId) return question; } catch { return undefined; }
  return undefined;
}

async function runHandler(request, deps = {}, obs = null) {
  const ras = deps.requireActiveStudentSession || requireActiveStudentSession, dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const sess = await ras(request, deps);
  if (!sess.ok) return sess.response;
  const c = sess.container, student = sess.student;
  const refused = (status, code) => { obs?.logWarn("coding.run.refused", { code, status }); return refuse(status, code); };

  const body = await readRunBody(request);
  if (!body) return refused(400, "REQUEST_INVALID");
  if (!ASSIGNMENT_ID.test(body.assignmentId) || body.assignmentId.includes("..")) return refused(404, "ASSIGNMENT_UNAVAILABLE");

  const classroom = student.classId ? await dl(c, "platform/classes/" + student.classId + ".json") : null;
  if (classroom && normalizeClassStatus(classroom) === "archived") return refused(403, "CLASS_ARCHIVED");
  const a = await dl(c, AP + body.assignmentId + ".json");
  if (!a || String(a.classId) !== String(student.classId)) return refused(404, "ASSIGNMENT_UNAVAILABLE");
  if (a.status !== "published") return refused(403, "ASSIGNMENT_UNAVAILABLE");
  const s = await dl(c, SP + body.assignmentId + "/" + student.userId + ".json");
  const nowMs = Date.now();
  const rej = writeRejection(a, s, "saveDraft", nowMs);
  if (rej) return refused(rej.status, "ATTEMPT_NOT_WRITABLE");
  if (!timerState(a, s, nowMs).canWrite) return refused(409, "ATTEMPT_NOT_WRITABLE");

  const question = findQuestion(a.examSnapshot, body.questionId);
  const bound = bindCodeAnswerToQuestion({ kind: "code", language: body.language, languageVersion: body.languageVersion, source: body.source }, question);
  if (!bound.ok) { const [status, code] = BIND_REFUSAL[bound.code] || [400, "REQUEST_INVALID"]; return refused(status, code); }
  const { answer } = bound;

  const provider = resolveCodingExecutionProvider(deps);
  const caps = await loadCodingCapabilities(provider);
  if (!caps.available) return refused(503, "EXECUTION_UNAVAILABLE");
  if (!caps.languages.some(l => l.key === answer.language && l.languageVersion === answer.languageVersion)) return refused(422, "LANGUAGE_UNAVAILABLE");

  let budget;
  try { budget = await reserveCodingRun(c, { studentId: student.userId, assignmentId: body.assignmentId }, deps); }
  catch { obs?.logWarn("coding.run.refused", { code: "EXECUTION_UNAVAILABLE", status: 503, reason: "rate-limit-storage" }); return refuse(503, "EXECUTION_UNAVAILABLE"); }
  if (!budget.allowed) {
    obs?.logWarn("coding.run.refused", { code: "RATE_LIMITED", status: 429, retryAfterSeconds: budget.retryAfterSeconds });
    return reply(429, { ok: false, code: "RATE_LIMITED", retryAfterSeconds: budget.retryAfterSeconds }, { "Retry-After": String(budget.retryAfterSeconds) });
  }

  const t0 = Date.now();
  const r = await runCodingExecution(provider, {
    requestId: crypto.randomBytes(16).toString("base64url"),
    language: answer.language,
    languageVersion: answer.languageVersion,
    source: answer.source,
    stdin: body.stdin,
    limits: limitsFor(question)
  });
  if (!r.ok) return refused(r.status, r.code);
  obs?.logInfo("coding.run.completed", { assignmentId: body.assignmentId, language: answer.language, status: r.result.status, durationMs: Date.now() - t0 });
  return reply(200, { ok: true, result: r.result });
}

async function capabilitiesHandler(request, deps = {}) {
  const ras = deps.requireActiveStudentSession || requireActiveStudentSession;
  const sess = await ras(request, deps);
  if (!sess.ok) return sess.response;
  const caps = await loadCodingCapabilities(resolveCodingExecutionProvider(deps));
  return reply(200, { ok: true, available: caps.available, languages: caps.languages });
}

app.http("codingRun", { methods: ["POST"], authLevel: "anonymous", route: "coding/run", handler: withObservability("coding-run", runHandler) });
app.http("codingCapabilities", { methods: ["GET"], authLevel: "anonymous", route: "coding/capabilities", handler: withObservability("coding-capabilities", capabilitiesHandler) });
module.exports = { runHandler, capabilitiesHandler };
