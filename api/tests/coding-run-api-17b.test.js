import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
import { createFakeCodingExecutionProvider } from "./fixtures/fake-coding-execution-provider.js";

// Phase 17B — POST /api/coding/run and GET /api/coding/capabilities (A1–A14), driven through the REAL handlers against the
// in-memory blob container (real platform-storage CAS helpers, real student-auth active-session check, real timer helpers).
// Practice execution only: a run never touches answers / drafts / attempts / score; identity comes from auth; the server owns
// the question binding and the limits; the runner is reached only through the provider (a test double here, which executes
// NOTHING). Fail-first on fe086e36: api/src/functions/coding-run.js does not exist.
const require_ = createRequire(import.meta.url);
const route = () => require_("../src/functions/coding-run.js");
const { createMemoryContainer } = require_("./fixtures/memory-container.js");

const S1 = "11111111-1111-1111-1111-111111111111", S2 = "22222222-2222-2222-2222-222222222222", AID = "asg-17b-run", AID2 = "asg-17b-other";
const CFG = {
  allowedLanguages: ["python", "csharp"], defaultLanguage: "python",
  starterCode: { python: "print(1)\n" }, taskMode: "program", inputMode: "stdin", outputMode: "stdout",
  limits: { sourceBytes: 2048, outputBytes: 4096, timeMs: 1500, memoryMb: 128 },
  publicTests: [{ id: "pub-1", title: "مثال", input: "2 3\n", sampleOutput: "5\n" }]
};
const KEY = { hiddenTests: [{ id: "hid-1", input: "HIDDEN-INPUT-17B\n", expectedOutput: "HIDDEN-EXPECTED-17B\n", weight: 1 }], comparator: "trimTrailingWhitespace", referenceSolutions: { python: "REFERENCE-17B\n" } };
const EXAM = { title: "امتحان", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [
  { examQuestionId: "c1", presentationType: "coding", questionTypeVersion: 1, text: "اجمع", marks: 10, coding: CFG, answer: KEY },
  { examQuestionId: "t1", presentationType: "shortAnswer", text: "نص", marks: 2, answer: "x" },
  { examQuestionId: "c2", presentationType: "coding", questionTypeVersion: 2, text: "نسخة مستقبلية", marks: 1, coding: CFG, answer: KEY }
] }] };
const nowIso = () => new Date().toISOString();
const assignment = (over = {}) => ({ schemaVersion: 2, attemptModelVersion: 3, attemptPolicy: "pausable", assignmentId: AID, classId: "c1", title: "واجب", instructions: "", status: "published", openAt: "", dueAt: new Date(Date.now() + 864e5).toISOString(), maxAttempts: 1, durationMinutes: 30, questionCount: 3, totalMarks: 13, examSnapshot: EXAM, ...over });
const activeDoc = (over = {}) => ({ schemaVersion: 1, assignmentId: AID, studentId: S1, classId: "c1", draftAnswers: { c1: { kind: "code", language: "python", languageVersion: 1, source: "DRAFT\n" } }, draftSavedAt: nowIso(), attempts: [], activeAttempt: { attemptNumber: 1, startedAt: nowIso(), endsAt: new Date(Date.now() + 30 * 60000).toISOString(), status: "draft", attemptEpoch: 1, pauseCount: 0 }, ...over });
const SUB = "platform/submissions/" + AID + "/" + S1 + ".json";

function seed({ a = assignment(), doc = activeDoc(), classroom = { classId: "c1", name: "الصف", active: true, studentIds: [] }, extra = {} } = {}) {
  return createMemoryContainer({
    ["platform/users/" + S1 + ".json"]: { schemaVersion: 3, role: "student", userId: S1, displayName: "سارة", code: "S1", classId: "c1", active: true, archived: false, authVersion: 1 },
    ["platform/users/" + S2 + ".json"]: { schemaVersion: 3, role: "student", userId: S2, displayName: "علي", code: "S2", classId: "c2", active: true, archived: false, authVersion: 1 },
    ...(classroom ? { "platform/classes/c1.json": classroom } : {}),
    ["platform/assignments/" + AID + ".json"]: a,
    ["platform/assignments/" + AID2 + ".json"]: assignment({ assignmentId: AID2, classId: "c2" }),
    ...(doc ? { [SUB]: doc } : {}),
    ...extra
  });
}
const BODY = { assignmentId: AID, questionId: "c1", language: "python", languageVersion: 1, source: "print(sum(map(int, input().split())))\n", stdin: "2 3\n" };
const req = (body, method = "POST") => {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { method, url: "https://example.invalid/api/coding/run", params: {}, headers: new Headers({ "content-type": "application/json" }), query: new URLSearchParams(), text: async () => text, json: async () => JSON.parse(text) };
};
const authAs = (sub = S1) => () => ({ ok: true, user: { sub, sv: 1, role: "student" } });
function harness({ ctx = seed(), provider = createFakeCodingExecutionProvider({ languages: [{ key: "python", languageVersion: 1 }, { key: "csharp", languageVersion: 1 }, { key: "java", languageVersion: 1 }] }), sub = S1, env = {}, logs } = {}) {
  const obs = logs ? { logInfo: (e, f) => logs.push([e, f]), logWarn: (e, f) => logs.push([e, f]), logError: (e, f) => logs.push([e, String(f)]) } : null;
  const deps = { container: ctx.container, requireStudentAuth: authAs(sub), codingExecutionProvider: provider, env };
  return {
    ctx, provider,
    run: body => route().runHandler(req(body), deps, obs),
    caps: () => route().capabilitiesHandler(req("", "GET"), deps, obs)
  };
}
const snapshot = ctx => JSON.stringify(ctx.names("platform/").filter(n => !n.startsWith("platform/throttle/")).sort().map(n => [n, ctx.getJson(n)]));

describe("A1 — both routes require an authenticated, ACTIVE student session", () => {
  it("anonymous / invalid tokens are 401 and never reach storage or the runner", async () => {
    const provider = createFakeCodingExecutionProvider();
    const ctx = seed();
    const deps = { container: ctx.container, codingExecutionProvider: provider, env: {} };
    for (const r of [await route().runHandler(req(BODY), deps), await route().capabilitiesHandler(req("", "GET"), deps)]) expect(r.status).toBe(401);
    expect(provider.requests).toHaveLength(0);
  });
  it("a deactivated student (authVersion bumped / inactive) is 401 even with a well-formed token", async () => {
    const ctx = seed({ extra: { ["platform/users/" + S1 + ".json"]: { schemaVersion: 3, role: "student", userId: S1, classId: "c1", active: false, authVersion: 1 } } });
    const h = harness({ ctx });
    expect((await h.run(BODY)).status).toBe(401);
    expect(h.provider.requests).toHaveLength(0);
  });
});

describe("A2 / A3 / A4 / A5 — the AUTHORITATIVE assignment decides (identity from auth only)", () => {
  it("A2 identity fields in the body are refused (REQUEST_INVALID) — the student / class always come from the session", async () => {
    const h = harness();
    for (const extra of [{ studentId: S2 }, { classId: "c2" }, { userId: S2 }, { attemptNumber: 1 }]) {
      const r = await h.run({ ...BODY, ...extra });
      expect(r.status, JSON.stringify(extra)).toBe(400); expect(r.jsonBody).toEqual({ ok: false, code: "REQUEST_INVALID" });
    }
    expect(h.provider.requests).toHaveLength(0);
  });
  it("A3 unknown assignment / another class's assignment → 404 (no existence oracle)", async () => {
    const h = harness();
    for (const id of ["nope", AID2]) { const r = await h.run({ ...BODY, assignmentId: id }); expect(r.status, id).toBe(404); }
    for (const id of ["../users/x", "a/b", "", "x".repeat(200)]) { const r = await h.run({ ...BODY, assignmentId: id }); expect([400, 404], id).toContain(r.status); }
    expect(h.provider.requests).toHaveLength(0);
  });
  it("A4 a draft / archived assignment is 403", async () => {
    for (const status of ["draft", "archived"]) {
      const h = harness({ ctx: seed({ a: assignment({ status }) }) });
      expect((await h.run(BODY)).status, status).toBe(403);
      expect(h.provider.requests).toHaveLength(0);
    }
  });
  it("A5 an archived class is 403", async () => {
    const h = harness({ ctx: seed({ classroom: { classId: "c1", name: "الصف", status: "archived", active: false, studentIds: [] } }) });
    expect((await h.run(BODY)).status).toBe(403);
    expect(h.provider.requests).toHaveLength(0);
  });
});

describe("A6 — only a WRITABLE attempt may run code (the existing timerState rules; no second timer)", () => {
  const cases = {
    "not started (model 3 requires a start)": { doc: null },
    "paused": { doc: activeDoc({ activeAttempt: { ...activeDoc().activeAttempt, status: "paused", pausedAt: nowIso(), pausedRemainingMs: 60000, attemptEpoch: 2 } }) },
    "expired": { doc: activeDoc({ activeAttempt: { ...activeDoc().activeAttempt, startedAt: new Date(Date.now() - 40 * 60000).toISOString(), endsAt: new Date(Date.now() - 10 * 60000).toISOString() } }) },
    "already submitted": { doc: activeDoc({ activeAttempt: null, attempts: [{ attemptNumber: 1, submittedAt: nowIso() }] }) },
    "due date passed": { a: assignment({ dueAt: new Date(Date.now() - 60000).toISOString() }) },
    "not yet open": { a: assignment({ openAt: new Date(Date.now() + 864e5).toISOString() }) }
  };
  for (const [name, s] of Object.entries(cases)) it(name + " → refused, runner never called", async () => {
    const h = harness({ ctx: seed(s) });
    const r = await h.run(BODY);
    expect([403, 409], name).toContain(r.status);
    expect(r.jsonBody.ok).toBe(false);
    expect(h.provider.requests).toHaveLength(0);
  });
  it("a live attempt runs (200) — the timed deadline is the SAME authoritative one save / submit use", async () => {
    const h = harness();
    const r = await h.run(BODY);
    expect(r.status).toBe(200); expect(r.jsonBody.ok).toBe(true);
    expect(h.provider.requests).toHaveLength(1);
  });
});

describe("A7 / A8 / A9 — the request is bound to the PUBLISHED coding question (bindCodeAnswerToQuestion)", () => {
  it("A7 missing snapshot / unknown question / non-coding question / other type version → CODE_QUESTION_MISMATCH", async () => {
    for (const [ctx, body] of [[seed({ a: assignment({ examSnapshot: undefined }) }), BODY], [seed(), { ...BODY, questionId: "ghost" }], [seed(), { ...BODY, questionId: "t1" }], [seed(), { ...BODY, questionId: "c2" }]]) {
      const h = harness({ ctx });
      const r = await h.run(body);
      expect(r.status).toBe(400); expect(r.jsonBody).toEqual({ ok: false, code: "CODE_QUESTION_MISMATCH" });
      expect(h.provider.requests).toHaveLength(0);
    }
  });
  it("A8 a registered language the question does not allow → CODE_LANGUAGE_NOT_ALLOWED; an unregistered one → REQUEST_INVALID", async () => {
    const h = harness();
    expect((await h.run({ ...BODY, language: "java" })).jsonBody).toEqual({ ok: false, code: "CODE_LANGUAGE_NOT_ALLOWED" });
    expect((await h.run({ ...BODY, language: "javascript" })).jsonBody).toEqual({ ok: false, code: "REQUEST_INVALID" });
    expect((await h.run({ ...BODY, languageVersion: 2 })).jsonBody).toEqual({ ok: false, code: "REQUEST_INVALID" });
    expect(h.provider.requests).toHaveLength(0);
  });
  it("A9 source above the QUESTION's sourceBytes → CODE_SOURCE_TOO_LARGE (413); stdin above 16 KB → REQUEST_INVALID", async () => {
    const h = harness();
    const big = await h.run({ ...BODY, source: "x".repeat(2049) });
    expect(big.status).toBe(413); expect(big.jsonBody).toEqual({ ok: false, code: "CODE_SOURCE_TOO_LARGE" });
    expect((await h.run({ ...BODY, source: "ب".repeat(1025) })).jsonBody).toEqual({ ok: false, code: "CODE_SOURCE_TOO_LARGE" });   // UTF-8 bytes
    expect((await h.run({ ...BODY, stdin: "s".repeat(16385) })).jsonBody).toEqual({ ok: false, code: "REQUEST_INVALID" });
    expect((await h.run({ ...BODY, source: "x".repeat(2048) })).status).toBe(200);
    expect(h.provider.requests).toHaveLength(1);
  });
  it("malformed bodies (not JSON, wrong types, oversized) are REQUEST_INVALID before any storage write", async () => {
    const h = harness();
    for (const b of ["{bad", "[]", "null", JSON.stringify({ ...BODY, source: 5 }), JSON.stringify({ ...BODY, languageVersion: "1" }), JSON.stringify({ ...BODY, stdin: null }), "x".repeat(300 * 1024)]) {
      const r = await h.run(b);
      expect([400, 413], b.slice(0, 20)).toContain(r.status);
    }
    expect(h.ctx.names("platform/throttle/")).toEqual([]);
    expect(h.provider.requests).toHaveLength(0);
  });
});

describe("A10 — limits are SERVER-derived from the question; client limits are refused", () => {
  it("client-supplied limits / timeMs / memoryMb / outputBytes / requestId / testId of a hidden test are REQUEST_INVALID", async () => {
    const h = harness();
    for (const extra of [{ limits: { timeMs: 10000, memoryMb: 512, outputBytes: 262144 } }, { timeMs: 10000 }, { memoryMb: 512 }, { outputBytes: 262144 }, { requestId: "client-id" }, { testId: "hid-1" }, { image: "alpine" }, { command: "sh" }]) {
      const r = await h.run({ ...BODY, ...extra });
      expect(r.jsonBody, JSON.stringify(extra)).toEqual({ ok: false, code: "REQUEST_INVALID" });
    }
    expect(h.provider.requests).toHaveLength(0);
  });
  it("the runner receives exactly the question's timeMs / memoryMb / outputBytes and the minimal request", async () => {
    const h = harness();
    expect((await h.run(BODY)).status).toBe(200);
    const sent = h.provider.requests[0];
    expect(Object.keys(sent).sort()).toEqual(["language", "languageVersion", "limits", "requestId", "source", "stdin"]);
    expect(sent.limits).toEqual({ timeMs: 1500, memoryMb: 128, outputBytes: 4096 });
    expect(sent).toMatchObject({ language: "python", languageVersion: 1, source: BODY.source, stdin: BODY.stdin });
    expect(JSON.stringify(sent)).not.toMatch(/HIDDEN-INPUT-17B|HIDDEN-EXPECTED-17B|REFERENCE-17B|سارة|11111111|asg-17b/);
  });
  it("a question without explicit limits uses the platform defaults (bounded), never 'unlimited'", async () => {
    const exam = JSON.parse(JSON.stringify(EXAM)); delete exam.sections[0].questions[0].coding.limits;
    const h = harness({ ctx: seed({ a: assignment({ examSnapshot: exam }) }) });
    expect((await h.run(BODY)).status).toBe(200);
    expect(h.provider.requests[0].limits).toEqual({ timeMs: 2000, memoryMb: 256, outputBytes: 65536 });
  });
});

describe("A11 — fail closed when no runner is configured", () => {
  it("no provider (production default, no env) → capabilities available:false and run 503 EXECUTION_UNAVAILABLE", async () => {
    const ctx = seed();
    const deps = { container: ctx.container, requireStudentAuth: authAs(), env: {} };
    const caps = await route().capabilitiesHandler(req("", "GET"), deps);
    expect(caps.status).toBe(200); expect(caps.jsonBody).toEqual({ ok: true, available: false, languages: [] });
    const r = await route().runHandler(req(BODY), deps);
    expect(r.status).toBe(503); expect(r.jsonBody).toEqual({ ok: false, code: "EXECUTION_UNAVAILABLE" });
    expect(ctx.names("platform/throttle/")).toEqual([]);                                                 // an unavailable runner never burns budget
  });
  it("malformed runner configuration (http to a public host) is unavailable too — never a fallback", async () => {
    const ctx = seed();
    const deps = { container: ctx.container, requireStudentAuth: authAs(), env: { CODING_RUNNER_URL: "http://runner.example.test", CODING_RUNNER_HMAC_KEY: "test-only-runner-hmac-key-0123456789abcdef" }, fetch: vi.fn() };
    expect((await route().runHandler(req(BODY), deps)).jsonBody).toEqual({ ok: false, code: "EXECUTION_UNAVAILABLE" });
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("the runner reporting the language unavailable → 422 LANGUAGE_UNAVAILABLE; runner busy → 503 RUNNER_BUSY; runner failure → 502 EXECUTION_FAILED", async () => {
    const onlyPython = createFakeCodingExecutionProvider({ languages: [{ key: "python", languageVersion: 1 }] });
    expect((await harness({ provider: onlyPython }).run({ ...BODY, language: "csharp" })).jsonBody).toEqual({ ok: false, code: "LANGUAGE_UNAVAILABLE" });
    const busy = createFakeCodingExecutionProvider({ respond: () => { const e = new Error("RUNNER_BUSY"); e.code = "RUNNER_BUSY"; throw e; } });
    const b = await harness({ provider: busy }).run(BODY);
    expect(b.status).toBe(503); expect(b.jsonBody).toEqual({ ok: false, code: "RUNNER_BUSY" });
    const boom = createFakeCodingExecutionProvider({ respond: () => { throw new Error("socket hang up"); } });
    const f = await harness({ provider: boom }).run(BODY);
    expect(f.status).toBe(502); expect(f.jsonBody).toEqual({ ok: false, code: "EXECUTION_FAILED" });
    expect(JSON.stringify(f.jsonBody)).not.toMatch(/socket hang up/);
  });
});

describe("A12 — distributed (storage CAS) rate limit per student + assignment", () => {
  it("20 runs per 5 minutes; the 21st is 429 RATE_LIMITED with a truthful Retry-After; the runner is not called", async () => {
    const h = harness();
    for (let i = 0; i < 20; i++) expect((await h.run(BODY)).status, "run " + i).toBe(200);
    const r = await h.run(BODY);
    expect(r.status).toBe(429); expect(r.jsonBody).toEqual({ ok: false, code: "RATE_LIMITED", retryAfterSeconds: expect.any(Number) });
    const retry = Number(r.headers["Retry-After"]);
    expect(retry).toBeGreaterThanOrEqual(1); expect(retry).toBeLessThanOrEqual(300);
    expect(r.jsonBody.retryAfterSeconds).toBe(retry);
    expect(h.provider.requests).toHaveLength(20);
  });
  it("the budget is per student + assignment, lives in shared storage (not process memory), and invalid requests do not consume it", async () => {
    const ctx = seed({ extra: { ["platform/submissions/" + AID2 + "/" + S2 + ".json"]: { ...activeDoc(), assignmentId: AID2, studentId: S2, classId: "c2" }, "platform/classes/c2.json": { classId: "c2", name: "ب", active: true, studentIds: [] } } });
    const a = harness({ ctx });
    for (let i = 0; i < 25; i++) await a.run({ ...BODY, questionId: "ghost" });                                  // invalid: never counted
    for (let i = 0; i < 20; i++) expect((await a.run(BODY)).status).toBe(200);
    expect((await a.run(BODY)).status).toBe(429);
    // the budget is the shared storage document: another handler instance sees it exhausted, and ONLY clearing the blob restores it
    expect((await harness({ ctx }).run(BODY)).status).toBe(429);
    const bucket = ctx.names("platform/throttle/");
    expect(bucket).toHaveLength(1);
    ctx.store.delete(bucket[0]);
    expect((await harness({ ctx }).run(BODY)).status).toBe(200);
    // another student / assignment has its own budget
    expect((await harness({ ctx, sub: S2 }).run({ ...BODY, assignmentId: AID2 })).status).toBe(200);
    expect(ctx.names("platform/throttle/").length).toBeGreaterThanOrEqual(2);
    expect(ctx.names("platform/throttle/").join(" ")).not.toMatch(/11111111|asg-17b/);                       // hashed keys: no identity in blob names
  });
  it("a storage failure while reserving fails CLOSED (503 EXECUTION_UNAVAILABLE), never an unlimited run", async () => {
    const ctx = seed();
    const realBlock = ctx.container.getBlockBlobClient.bind(ctx.container);
    ctx.container.getBlockBlobClient = name => { if (String(name).startsWith("platform/throttle/")) { const c = realBlock(name); return { ...c, upload: async () => { const e = new Error("storage down"); e.statusCode = 500; throw e; } }; } return realBlock(name); };
    const h = harness({ ctx });
    const r = await h.run(BODY);
    expect(r.status).toBe(503); expect(r.jsonBody).toEqual({ ok: false, code: "EXECUTION_UNAVAILABLE" });
    expect(h.provider.requests).toHaveLength(0);
  });
});

describe("A13 — a practice run never mutates answers, drafts, attempts or score; request ids are server-generated", () => {
  it("storage is byte-identical after successful and failing runs (only the throttle bucket changes)", async () => {
    const ctx = seed();
    const before = snapshot(ctx);
    const h = harness({ ctx });
    await h.run(BODY); await h.run({ ...BODY, language: "java" }); await h.run({ ...BODY, source: "x".repeat(4000) });
    expect(snapshot(ctx)).toBe(before);
    expect(ctx.getJson(SUB).draftAnswers).toEqual({ c1: { kind: "code", language: "python", languageVersion: 1, source: "DRAFT\n" } });
  });
  it("every run gets a fresh, crypto-strength request id generated by the server", async () => {
    const h = harness();
    for (let i = 0; i < 5; i++) await h.run(BODY);
    const ids = h.provider.requests.map(r => r.requestId);
    expect(new Set(ids).size).toBe(5);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{22,64}$/);
  });
  it("the result returned to the student is the bounded, re-labelled practice result only (no score, no pass/fail of hidden tests)", async () => {
    const h = harness({ provider: createFakeCodingExecutionProvider({ respond: () => ({ status: "success", stdout: "5\n", stderr: "", exitCode: 0, durationMs: 9, score: 100, passed: true, hiddenTests: ["x"], host: "10.0.0.5" }) }) });
    const r = await h.run(BODY);
    expect(r.jsonBody).toEqual({ ok: true, result: { status: "success", stdout: "5\n", stderr: "", exitCode: 0, durationMs: 9 } });
    expect(r.headers["Cache-Control"]).toBe("no-store");
  });
});

describe("A14 — telemetry is safe and the capability answer is minimal", () => {
  it("logs never carry source, stdin, stdout, stderr, hidden tests, tokens or runner configuration", async () => {
    const logs = [];
    const h = harness({ logs, provider: createFakeCodingExecutionProvider({ respond: () => ({ status: "runtime-error", stdout: "STDOUT-SECRET-17B", stderr: "STDERR-SECRET-17B", exitCode: 1 }) }) });
    await h.run({ ...BODY, source: "SOURCE-SECRET-17B = 1\n", stdin: "STDIN-SECRET-17B\n" });
    await h.run({ ...BODY, source: "x".repeat(4000) });
    const text = JSON.stringify(logs);
    expect(logs.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/SECRET-17B|HIDDEN-|REFERENCE-|print\(|test-only-runner|Bearer/);
    expect(text).toMatch(/runtime-error/);                                                                        // the outcome IS recorded
  });
  it("capabilities expose only { available, languages:[{key, languageVersion}] } — no URL, image, host or IP", async () => {
    const h = harness({ provider: { capabilities: async () => ({ available: true, url: "https://runner.internal", languages: [{ key: "python", languageVersion: 1, image: "smartassess-coding-python:17b-v1", host: "10.1.2.3" }] }), execute: async () => ({}) } });
    const r = await h.caps();
    expect(r.status).toBe(200);
    expect(r.jsonBody).toEqual({ ok: true, available: true, languages: [{ key: "python", languageVersion: 1 }] });
    expect(r.headers["Cache-Control"]).toBe("no-store");
  });
});
