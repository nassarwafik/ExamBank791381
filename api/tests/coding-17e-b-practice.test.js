import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createFakeCodingExecutionProvider } from "./fixtures/fake-coding-execution-provider.js";

// Phase 17E-B — the student PRACTICE run path (P1–P15) through the REAL handlers (coding-run, student-assignment,
// student-submission, coding-grading callback) against the in-memory blob container. Practice and official grading are two
// separate protocols:
//   PRACTICE  student-initiated · custom / public input · feedback shown to the student · NO grade authority · no storage write
//             except the distributed rate-limit bucket;
//   OFFICIAL  submission-initiated · hidden tests · results never shown to the student directly · SmartAssess computes the score.
// The runner is a test double (fake provider) or, for the signing proof, the REAL remote provider with a recording fetch.
// Hidden-test canaries (17EB) must never reach the student payload, the practice request or the runner practice request.
const require_ = createRequire(import.meta.url);
const route = () => require_("../src/functions/coding-run.js");
const studentAssignment = () => require_("../src/functions/student-assignment.js");
const { createMemoryContainer } = require_("./fixtures/memory-container.js");
const F = require_("./fixtures/coding-17c.js");

const CANARY = Object.freeze({ stdin: "HIDDEN_STDIN_CANARY_17EB", expected: "HIDDEN_EXPECTED_CANARY_17EB", weight: 9.17, weightTag: "HIDDEN_WEIGHT_CANARY_17EB", reference: "REFERENCE_SOLUTION_CANARY_17EB", label: "HIDDEN_LABEL_CANARY_17EB" });
const CANARY_RE = /HIDDEN_STDIN_CANARY_17EB|HIDDEN_EXPECTED_CANARY_17EB|HIDDEN_WEIGHT_CANARY_17EB|REFERENCE_SOLUTION_CANARY_17EB|HIDDEN_LABEL_CANARY_17EB|9\.17|scoringPolicy|allOrNothing|gradingMode|hiddenTests|referenceSolutions|comparator/;
const S1 = "11111111-1111-1111-1111-111111111111", S2 = "22222222-2222-2222-2222-222222222222", AID = "asg-17eb", AID2 = "asg-17eb-other";
const CFG = {
  allowedLanguages: ["python", "java"], defaultLanguage: "python",
  starterCode: { python: "print(1)\n" }, taskMode: "program", inputMode: "stdin", outputMode: "stdout",
  limits: { sourceBytes: 2048, outputBytes: 4096, timeMs: 1500, memoryMb: 128 },
  publicTests: [{ id: "pub-1", title: "مثال", input: "2 3\n", sampleOutput: "5\n" }]
};
const KEY = { gradingMode: "hiddenTests", scoringPolicy: "allOrNothing", comparator: "trimTrailingWhitespace", hiddenTests: [{ id: "hid-1", title: CANARY.label, input: CANARY.stdin + "\n", expectedOutput: CANARY.expected + "\n", weight: CANARY.weight, note: CANARY.weightTag }], referenceSolutions: { python: CANARY.reference + "\n" } };
const EXAM = { title: "امتحان", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [
  { examQuestionId: "c1", presentationType: "coding", questionTypeVersion: 1, text: "اجمع", marks: 10, coding: CFG, answer: KEY },
  { examQuestionId: "t1", presentationType: "shortAnswer", text: "نص", marks: 2, answer: "x" }
] }] };
const nowIso = () => new Date().toISOString();
const assignment = (over = {}) => ({ schemaVersion: 2, attemptModelVersion: 3, attemptPolicy: "pausable", assignmentId: AID, classId: "c1", title: "واجب", instructions: "", status: "published", openAt: "", dueAt: new Date(Date.now() + 864e5).toISOString(), maxAttempts: 1, durationMinutes: 30, questionCount: 2, totalMarks: 12, examSnapshot: EXAM, ...over });
const active = (over = {}) => ({ attemptNumber: 1, startedAt: nowIso(), endsAt: new Date(Date.now() + 30 * 60000).toISOString(), status: "draft", attemptEpoch: 1, pauseCount: 0, ...over });
const doc = (over = {}) => ({ schemaVersion: 1, assignmentId: AID, studentId: S1, classId: "c1", draftAnswers: { c1: { kind: "code", language: "python", languageVersion: 1, source: "DRAFT\n" } }, draftSavedAt: nowIso(), attempts: [], activeAttempt: active(), ...over });
const SUB = "platform/submissions/" + AID + "/" + S1 + ".json";
function seed({ a = assignment(), d = doc() } = {}) {
  return createMemoryContainer({
    ["platform/users/" + S1 + ".json"]: { schemaVersion: 3, role: "student", userId: S1, displayName: "سارة", code: "S1", classId: "c1", active: true, archived: false, authVersion: 1 },
    ["platform/users/" + S2 + ".json"]: { schemaVersion: 3, role: "student", userId: S2, displayName: "علي", code: "S2", classId: "c2", active: true, archived: false, authVersion: 1 },
    "platform/classes/c1.json": { classId: "c1", name: "الصف", active: true, studentIds: [] },
    "platform/classes/c2.json": { classId: "c2", name: "صف آخر", active: true, studentIds: [] },
    ["platform/assignments/" + AID + ".json"]: a,
    ["platform/assignments/" + AID2 + ".json"]: assignment({ assignmentId: AID2, classId: "c2" }),
    ...(d ? { [SUB]: d } : {})
  });
}
const BODY = { assignmentId: AID, questionId: "c1", language: "python", languageVersion: 1, source: "print(sum(map(int, input().split())))\n", stdin: "2 3\n" };
const req = (body, method = "POST", headers = {}) => {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { method, url: "https://example.invalid/api/coding/run", params: { assignmentId: AID }, headers: new Headers({ "content-type": "application/json", ...headers }), query: new URLSearchParams(), text: async () => text, json: async () => JSON.parse(text) };
};
const LANGS = [{ key: "python", languageVersion: 1 }, { key: "java", languageVersion: 1 }, { key: "csharp", languageVersion: 1 }];
function harness({ ctx = seed(), provider = createFakeCodingExecutionProvider({ languages: LANGS }), sub = S1, auth, env = {}, fetch } = {}) {
  const deps = { container: ctx.container, requireStudentAuth: auth || (() => ({ ok: true, user: { sub, sv: 1, role: "student" } })), ...(provider ? { codingExecutionProvider: provider } : {}), env, ...(fetch ? { fetch } : {}) };
  return { ctx, provider, deps, run: (body, headers) => route().runHandler(req(body, "POST", headers), deps, null) };
}
const stored = ctx => JSON.stringify(ctx.names("platform/").filter(n => !n.startsWith("platform/throttle/")).sort().map(n => [n, ctx.getJson(n)]));

describe("17E-B P1–P8 — authentication, authorization, binding and server-owned bounds", () => {
  it("P1 unauthenticated → 401, nothing stored, runner never called", async () => {
    const h = harness({ auth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, code: "UNAUTHORIZED" } } }) });
    const before = stored(h.ctx);
    expect((await h.run(BODY)).status).toBe(401);
    expect(h.provider.requests).toHaveLength(0);
    expect(stored(h.ctx)).toBe(before);
  });
  it("P2 a student cannot run against another class's assignment (404, no existence oracle)", async () => {
    const h = harness();
    const r = await h.run({ ...BODY, assignmentId: AID2 });
    expect([r.status, r.jsonBody.code]).toEqual([404, "ASSIGNMENT_UNAVAILABLE"]);
    expect(h.provider.requests).toHaveLength(0);
  });
  it("P3 unknown assignment → 404; unknown question → 400 CODE_QUESTION_MISMATCH", async () => {
    const h = harness();
    expect((await h.run({ ...BODY, assignmentId: "nope" })).status).toBe(404);
    const r = await h.run({ ...BODY, questionId: "missing" });
    expect([r.status, r.jsonBody.code]).toEqual([400, "CODE_QUESTION_MISMATCH"]);
    expect(h.provider.requests).toHaveLength(0);
  });
  it("P4 a non-coding question is refused (CODE_QUESTION_MISMATCH)", async () => {
    const h = harness();
    const r = await h.run({ ...BODY, questionId: "t1" });
    expect([r.status, r.jsonBody.code]).toEqual([400, "CODE_QUESTION_MISMATCH"]);
  });
  it("P5 a registered language the question does not allow is refused (CODE_LANGUAGE_NOT_ALLOWED)", async () => {
    const h = harness();
    const r = await h.run({ ...BODY, language: "csharp" });
    expect([r.status, r.jsonBody.code]).toEqual([400, "CODE_LANGUAGE_NOT_ALLOWED"]);
    expect(h.provider.requests).toHaveLength(0);
  });
  it("P6 source above the QUESTION's sourceBytes → 413 CODE_SOURCE_TOO_LARGE", async () => {
    const h = harness();
    const r = await h.run({ ...BODY, source: "x".repeat(2049) });
    expect([r.status, r.jsonBody.code]).toEqual([413, "CODE_SOURCE_TOO_LARGE"]);
  });
  it("P7 stdin above 16 KB → 400 REQUEST_INVALID", async () => {
    const h = harness();
    const r = await h.run({ ...BODY, stdin: "y".repeat(16385) });
    expect([r.status, r.jsonBody.code]).toEqual([400, "REQUEST_INVALID"]);
  });
  it("P8 the client cannot raise limits: any limit / extra field is refused; the runner receives the QUESTION's limits", async () => {
    const h = harness();
    for (const extra of [{ limits: { timeMs: 10000, memoryMb: 512, outputBytes: 262144 } }, { limits: { timeMs: 10000, memoryMb: 512 } }, { timeMs: 10000 }, { memoryMb: 512 }, { outputBytes: 262144 }, { allowedLanguages: ["csharp"] }]) {
      const r = await h.run({ ...BODY, ...extra });
      expect([r.status, r.jsonBody.code], JSON.stringify(extra)).toEqual([400, "REQUEST_INVALID"]);
    }
    expect(h.provider.requests).toHaveLength(0);
    expect((await h.run(BODY)).status).toBe(200);
    expect(h.provider.requests[0].limits).toEqual({ timeMs: 1500, memoryMb: 128, outputBytes: 4096 });
  });
});

describe("17E-B P9–P12 — signing, secrecy and runner availability", () => {
  const KEY_HEX = "test-only-runner-hmac-key-17eb-0123456789abcdef";
  function recordingRunner(execute = () => ({ status: 200, json: { ok: true, result: { status: "success", stdout: "5\n", stderr: "", exitCode: 0, durationMs: 3 } } })) {
    const calls = [];
    const fetch = async (url, init = {}) => {
      const u = new URL(url), headers = Object.fromEntries(new Headers(init.headers || {}).entries());
      calls.push({ path: u.pathname, method: init.method, headers, body: typeof init.body === "string" ? init.body : "" });
      const r = u.pathname === "/v1/capabilities" ? { status: 200, json: { ok: true, available: true, languages: LANGS } } : execute();
      return new Response(JSON.stringify(r.json), { status: r.status, headers: { "content-type": "application/json" } });
    };
    return { fetch, calls };
  }
  const ENV = { CODING_RUNNER_URL: "http://127.0.0.1:9", CODING_RUNNER_HMAC_KEY: KEY_HEX };
  it("P9 the SERVER signs the runner request with its own key; a browser-supplied signature header is never forwarded", async () => {
    const rr = recordingRunner();
    const h = harness({ provider: null, env: ENV, fetch: rr.fetch });
    const r = await h.run(BODY, { "x-sa-runner-signature": "v1=browser-forged", "x-sa-runner-timestamp": "1" });
    expect(r.status).toBe(200);
    const exec = rr.calls.find(c => c.path === "/v1/execute");
    const { signRunnerRequest } = require_("../src/lib/coding/runner-protocol.js");
    const expected = signRunnerRequest({ key: KEY_HEX, method: "POST", path: "/v1/execute", timestamp: exec.headers["x-sa-runner-timestamp"], requestId: exec.headers["x-sa-runner-request-id"], body: Buffer.from(exec.body, "utf8") });
    expect(exec.headers["x-sa-runner-signature"]).toBe(expected["x-sa-runner-signature"]);
    expect(JSON.stringify(exec.headers)).not.toContain("browser-forged");
    expect(JSON.stringify(r.jsonBody)).not.toContain(KEY_HEX);
  });
  it("P10 the runner PRACTICE request carries only the minimal request — no hidden stdin / expected output / weights / reference / policy (canaries)", async () => {
    const rr = recordingRunner();
    const h = harness({ provider: null, env: ENV, fetch: rr.fetch });
    await h.run(BODY);
    const exec = rr.calls.find(c => c.path === "/v1/execute");
    expect(Object.keys(JSON.parse(exec.body)).sort()).toEqual(["language", "languageVersion", "limits", "requestId", "source", "stdin"]);
    expect(exec.body).not.toMatch(CANARY_RE);
    expect(JSON.stringify(rr.calls)).not.toMatch(CANARY_RE);
    // the fake-provider path too
    const h2 = harness();
    await h2.run(BODY);
    expect(JSON.stringify(h2.provider.requests)).not.toMatch(CANARY_RE);
  });
  it("P11 runner unavailable (no configuration) → 503 EXECUTION_UNAVAILABLE, retry-safe, nothing stored, the draft untouched", async () => {
    const h = harness({ provider: null, env: {} });
    const before = stored(h.ctx);
    const r = await h.run(BODY);
    expect([r.status, r.jsonBody.code]).toEqual([503, "EXECUTION_UNAVAILABLE"]);
    expect(stored(h.ctx)).toBe(before);
    expect(h.ctx.getJson(SUB).draftAnswers.c1.source).toBe("DRAFT\n");
  });
  it("P12 runner busy → 503 RUNNER_BUSY; the per-student budget → 429 RATE_LIMITED with Retry-After (runner not called)", async () => {
    const busy = createFakeCodingExecutionProvider({ languages: LANGS, respond: () => { const e = new Error("RUNNER_BUSY"); e.code = "RUNNER_BUSY"; throw e; } });
    const h = harness({ provider: busy });
    const r = await h.run(BODY);
    expect([r.status, r.jsonBody.code]).toEqual([503, "RUNNER_BUSY"]);
    const h2 = harness();
    let last;
    for (let i = 0; i < 21; i++) last = await h2.run(BODY);
    expect([last.status, last.jsonBody.code]).toEqual([429, "RATE_LIMITED"]);
    expect(Number(last.headers["Retry-After"])).toBeGreaterThan(0);
    expect(h2.provider.requests).toHaveLength(20);
  });
});

describe("17E-B P13–P15 — practice never touches official grading; attempt authority", () => {
  it("P13 a practice run creates no codingGrading target / revision / job and changes no submission, draft, attempt or score", async () => {
    const h = harness();
    const before = stored(h.ctx);
    const r = await h.run(BODY);
    expect(r.status).toBe(200);
    expect(stored(h.ctx)).toBe(before);
    const sub = h.ctx.getJson(SUB);
    expect(sub.codingGrading).toBeUndefined();
    expect(sub.activeAttempt.codingGrading).toBeUndefined();
    expect(h.ctx.names("platform/coding-grading-jobs/")).toHaveLength(0);
    expect(Object.keys(r.jsonBody).sort()).toEqual(["ok", "result"]);
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/score|marks|passed|gradingKey|jobId|revision/);
  });
  it("P14 official grading is unchanged: after a SUCCESSFUL practice run the submission still dispatches the official hidden-test job, and the practice result is never official evidence", async () => {
    const ctx = F.seed({ a: F.assignment({}, { short: false }) });
    const fetch = F.runnerFetch();
    const provider = createFakeCodingExecutionProvider({ languages: LANGS, respond: () => ({ status: "success", stdout: F.CANARY.expected[0], stderr: "", exitCode: 0, durationMs: 1 }) });
    const deps = { container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } }), codingExecutionProvider: provider, env: F.ENV, fetch };
    const practice = await route().runHandler(req({ assignmentId: "asg-17c-auto", questionId: "auto1", language: "python", languageVersion: 1, source: "print('x')\n", stdin: "1 2\n" }), deps, null);
    expect(practice.status).toBe(200);
    expect(fetch.jobs()).toHaveLength(0);                                                   // practice never reaches the official endpoint
    expect(ctx.getJson(F.SUB).attempts || []).toHaveLength(0);
    const submit = await require_("../src/functions/student-submission.js").handler(F.studentRequest(F.submitBody({ auto1: F.code("print('x')\n") })), { container: ctx.container, requireStudentAuth: deps.requireStudentAuth, env: F.ENV, fetch }, { logInfo() {}, logWarn() {}, logError() {} });
    expect(submit.status).toBe(200);
    const job = fetch.jobs()[0];
    expect(job.cases).toHaveLength(3);                                                      // every HIDDEN case, independently
    const cb = await require_("../src/functions/coding-grading.js").callbackHandler(F.callbackRequest(F.callbackBody(job, ["wrong\n", "wrong\n", "wrong\n"])), { getContainer: () => ctx.container, env: F.ENV }, { logInfo() {}, logWarn() {}, logError() {} });
    expect(cb.status).toBe(200);
    const att = ctx.getJson(F.SUB).attempts[0];
    expect(att.codingGrading.targets.auto1.result.automaticScore).toBe(0);                 // practice success ≠ official success
    expect(att.questionGrades.find(g => g.questionId === "auto1").score).toBe(0);
  });
  const blocked = [
    ["paused attempt", { d: doc({ activeAttempt: active({ status: "paused", pausedAt: nowIso() }) }) }],
    ["expired timer", { d: doc({ activeAttempt: active({ startedAt: new Date(Date.now() - 40 * 60000).toISOString(), endsAt: new Date(Date.now() - 60000).toISOString() }) }) }],
    ["attempt ended by teacher / submitted (no active attempt)", { d: doc({ activeAttempt: null, attempts: [{ attemptNumber: 1, submittedAt: nowIso(), endReason: "teacherEnded", finalized: false }] }) }],
    ["not started", { d: null }],
    ["not yet open", { a: assignment({ openAt: new Date(Date.now() + 864e5).toISOString(), dueAt: new Date(Date.now() + 2 * 864e5).toISOString() }) }],
    ["due date passed", { a: assignment({ dueAt: new Date(Date.now() - 60000).toISOString() }) }],
    ["unpublished", { a: assignment({ status: "draft" }) }]
  ];
  for (const [name, s] of blocked) it("P15 " + name + " → refused by the SAME attempt authority save / submit use; the runner is never called", async () => {
    const h = harness({ ctx: seed(s) });
    const before = stored(h.ctx);
    const r = await h.run(BODY);
    expect(r.status, name).toBeGreaterThanOrEqual(403);
    expect(["ATTEMPT_NOT_WRITABLE", "ASSIGNMENT_UNAVAILABLE"]).toContain(r.jsonBody.code);
    expect(h.provider.requests).toHaveLength(0);
    expect(stored(h.ctx)).toBe(before);
  });
  it("P16 the student assignment payload carries no hidden-test / reference / policy canary (the allow-list projection)", async () => {
    const ctx = seed();
    const r = await studentAssignment().handler({ method: "GET", params: { assignmentId: AID }, headers: new Headers({}) }, { container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: S1, sv: 1, role: "student" } }) });
    expect(r.status).toBe(200);
    const text = JSON.stringify(r.jsonBody);
    expect(text).toContain("print(1)");                                                     // public starter code is there
    expect(text).not.toMatch(CANARY_RE);
  });
});
