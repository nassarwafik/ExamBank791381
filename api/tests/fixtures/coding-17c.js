// Phase 17C — shared TEST fixture for official coding grading: a seeded assignment / student / submission in the in-memory blob
// container, a recording double of the Coding Runner's official endpoint (executes NOTHING), a callback builder that mimics
// what the runner reports (raw evidence only) and request builders for the real handlers. Canary values are placed in every
// teacher-private / identity field so secrecy tests can scan serialized traffic for them.
const crypto = require("node:crypto");
const { createMemoryContainer } = require("./memory-container.js");

const RUNNER_KEY = "test-only-runner-hmac-key-0123456789abcdef";             // TEST keys — never real secrets
const CALLBACK_KEY = "test-only-callback-hmac-key-fedcba9876543210";
const ENV = Object.freeze({ CODING_RUNNER_URL: "https://runner.example.test", CODING_RUNNER_HMAC_KEY: RUNNER_KEY, CODING_GRADING_CALLBACK_HMAC_KEY: CALLBACK_KEY });

const AID = "asg-17c-auto", S1 = "11111111-1111-1111-1111-111111111111", CLASS_ID = "cls-canary17c";
const STARTED = new Date(Date.now() - 5 * 60000).toISOString();
const CANARY = Object.freeze({
  title: "CANARY-HIDDEN-TITLE-17C", expected: ["SUM=CANARY-3\n", "SUM=CANARY-NEG\n", "SUM=CANARY-10\n"], reference: "CANARY-REFERENCE-SOLUTION-17C",
  studentName: "CANARY-STUDENT-NAME-17C", studentCode: "CANARYCODE17C", teacherId: "teacher-canary-17c", examTitle: "CANARY-EXAM-TITLE-17C", teacherNote: "CANARY-TEACHER-NOTE-17C"
});
const HIDDEN = [
  { id: "h-small", title: CANARY.title, input: "1 2\n", expectedOutput: CANARY.expected[0], weight: 1 },
  { id: "h-neg", input: "-1 -2\n", expectedOutput: CANARY.expected[1], weight: 2 },
  { id: "h-ten", input: "5 5\n", expectedOutput: CANARY.expected[2], weight: 3 }
];
const CFG = { allowedLanguages: ["python", "java", "csharp"], defaultLanguage: "python", starterCode: {}, taskMode: "program", inputMode: "stdin", outputMode: "stdout", limits: { sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 128 }, publicTests: [{ id: "pub-1", input: "2 3\n", sampleOutput: "SUM=5\n" }] };
const autoQ = (over = {}) => ({ examQuestionId: "auto1", presentationType: "coding", questionTypeVersion: 1, text: "اطبع المجموع", marks: 10, coding: JSON.parse(JSON.stringify(CFG)), answer: { gradingMode: "hiddenTests", comparator: "trimTrailingWhitespace", hiddenTests: JSON.parse(JSON.stringify(HIDDEN)), referenceSolutions: { python: CANARY.reference } }, teacherNote: CANARY.teacherNote, ...over });
const manualQ = () => ({ examQuestionId: "manual1", presentationType: "coding", questionTypeVersion: 1, text: "اشرح", marks: 5, coding: JSON.parse(JSON.stringify(CFG)), answer: { gradingMode: "manual", comparator: "exact", hiddenTests: [{ id: "m1", input: "", expectedOutput: "MANUAL-EXPECTED", weight: 1 }] } });
const shortQ = () => ({ examQuestionId: "sa1", presentationType: "shortAnswer", text: "اكتب x", marks: 2, answer: { text: "x" } });
function exam({ manual = false, short = true, auto = autoQ() } = {}) {
  const questions = [auto, ...(manual ? [manualQ()] : []), ...(short ? [shortQ()] : [])];
  return { title: CANARY.examTitle, metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions }] };
}
const assignment = (over = {}, examOpts = {}) => ({ schemaVersion: 2, attemptModelVersion: 3, attemptPolicy: "pausable", assignmentId: AID, classId: CLASS_ID, title: "واجب 17C", instructions: "", status: "published", openAt: "", dueAt: new Date(Date.now() + 864e5).toISOString(), maxAttempts: 2, durationMinutes: 30, questionCount: 3, totalMarks: 12, examSnapshot: exam(examOpts), ...over });
const activeDoc = (draftAnswers = {}, over = {}) => ({ schemaVersion: 1, assignmentId: AID, studentId: S1, classId: CLASS_ID, draftAnswers, draftSavedAt: new Date().toISOString(), attempts: [], activeAttempt: { attemptNumber: 1, startedAt: STARTED, endsAt: new Date(Date.now() + 25 * 60000).toISOString(), status: "draft", attemptEpoch: 1, pauseCount: 0 }, ...over });
const SUB = "platform/submissions/" + AID + "/" + S1 + ".json";
const code = (source, language = "python") => ({ kind: "code", language, languageVersion: 1, source });

function seed({ a = assignment(), doc = activeDoc(), hooks } = {}) {
  return createMemoryContainer({
    ["platform/users/" + S1 + ".json"]: { schemaVersion: 3, role: "student", userId: S1, displayName: CANARY.studentName, code: CANARY.studentCode, classId: CLASS_ID, active: true, archived: false, authVersion: 1, shareAchievements: true },
    ["platform/classes/" + CLASS_ID + ".json"]: { classId: CLASS_ID, name: "الصف", active: true, studentIds: [S1] },
    ["platform/assignments/" + AID + ".json"]: a,
    ...(doc ? { [SUB]: doc } : {})
  }, hooks);
}

/** A recording double of the runner's official endpoint. `respond(call)` → { status, json } (default 202 accepted). */
function runnerFetch(respond) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = new URL(url);
    const call = { url: u.toString(), path: u.pathname, method: init.method || "GET", headers: Object.fromEntries(new Headers(init.headers || {}).entries()), body: typeof init.body === "string" ? init.body : "", redirect: init.redirect };
    calls.push(call);
    if (respond === "throw") throw new TypeError("fetch failed");
    const r = respond ? await respond(call) : { status: 202, json: { ok: true, accepted: true, duplicate: false } };
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { "content-type": "application/json" } });
  };
  fn.calls = calls;
  fn.jobs = () => calls.filter(c => c.path === "/v1/official-grading-jobs").map(c => JSON.parse(c.body));
  return fn;
}

/** The raw evidence a runner would call back with for `job` (outputs[i] = stdout string or a full case override). */
function callbackBody(job, outputs, extra = {}) {
  const cases = job.cases.map((c, i) => {
    const o = outputs[i];
    const base = { token: c.token, status: "success", stdout: "", stderr: "", exitCode: 0, durationMs: 4 };
    return typeof o === "string" ? { ...base, stdout: o } : { ...base, ...o };
  });
  return { jobId: job.jobId, outcome: "completed", cases, ...extra };
}

/** Signs a callback exactly like runner/gateway/callback.js does (an independent implementation is the point of parity tests). */
function signCallback(bodyText, { key = CALLBACK_KEY, timestamp = Math.floor(Date.now() / 1000), requestId = "cb_" + crypto.randomBytes(9).toString("base64url"), path = "/api/coding/grade-callback", method = "POST" } = {}) {
  const bodyHash = crypto.createHash("sha256").update(Buffer.from(bodyText, "utf8")).digest("hex");
  const canonical = ["SA-CODING-CALLBACK-1", method, path, String(timestamp), requestId, bodyHash].join("\n");
  const mac = crypto.createHmac("sha256", Buffer.from(key, "utf8")).update(canonical, "utf8").digest("hex");
  return { "x-sa-callback-protocol": "1", "x-sa-callback-timestamp": String(timestamp), "x-sa-callback-request-id": requestId, "x-sa-callback-signature": "v1=" + mac };
}
function callbackRequest(body, opts = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const headers = opts.headers || (opts.unsigned ? {} : signCallback(opts.signBody !== undefined ? opts.signBody : text, opts));
  return { method: "POST", url: "https://app.example.test/api/coding/grade-callback", headers: new Headers({ "content-type": "application/json", ...headers }), text: async () => text, json: async () => JSON.parse(text) };
}
const studentRequest = (body, method = "POST") => ({ method, url: "https://app.example.test/api/student-submission/" + AID, params: { assignmentId: AID }, headers: new Headers({ "content-type": "application/json" }), query: new URLSearchParams(), json: async () => body, text: async () => JSON.stringify(body) });
const teacherRequest = (url, body, method = "POST") => ({ method, url: "https://app.example.test" + url, params: {}, headers: new Headers({ "content-type": "application/json" }), json: async () => body, text: async () => JSON.stringify(body) });
const submitBody = answers => ({ action: "submit", answers, expectedAttemptNumber: 1, expectedStartedAt: STARTED, expectedAttemptEpoch: 1 });

module.exports = {
  RUNNER_KEY, CALLBACK_KEY, ENV, AID, S1, CLASS_ID, STARTED, CANARY, HIDDEN, CFG, SUB,
  autoQ, manualQ, shortQ, exam, assignment, activeDoc, code, seed, runnerFetch, callbackBody, signCallback, callbackRequest, studentRequest, teacherRequest, submitBody
};
