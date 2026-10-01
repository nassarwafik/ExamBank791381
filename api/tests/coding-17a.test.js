import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { gradeQuestion } from "../src/lib/assignment-grading.js";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { isResponseAnswered } from "../src/lib/exam-structure.js";
import { normalizeDraftAnswers } from "../src/lib/draft-answers.js";
import { createFakeCodingExecutionProvider } from "./fixtures/fake-coding-execution-provider.js";

// Phase 17A — SERVER contracts of the coding engine core: the student sanitizer projects ONLY the public coding config (C12–
// C14), the draft / submit / pause pipeline bounds and preserves the canonical `code` answer (C8 / C9), coding@1 has ZERO
// automatic authority in 17A whatever the client sends (C30 / C31), the execution provider is a server-owned contract whose
// default is UNAVAILABLE (C33) and whose routing / capability / request-minimisation / result-normalisation rules are proven
// with a deterministic fake that executes nothing (C34). Fail-first on 7af619a4: new modules are required at RUNTIME so each
// case fails on its own.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require_ = createRequire(import.meta.url);
const provider = () => require_("../src/lib/coding/execution-provider.js");
const sharedQuestion = () => require_("../src/lib/shared-finalization/codingQuestion.js");
const sharedContract = () => require_("../src/lib/shared-finalization/codingContract.js");
const { handler: submissionHandler } = require_("../src/functions/student-submission.js");
const { createMemoryContainer } = require_("./fixtures/memory-container.js");

const CFG = {
  allowedLanguages: ["python", "javascript"], defaultLanguage: "python",
  starterCode: { python: "a, b = map(int, input().split())\n", javascript: "const lines = require('fs').readFileSync(0, 'utf8');\n" },
  taskMode: "program", inputMode: "stdin", outputMode: "stdout",
  limits: { sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 256 },
  publicTests: [{ id: "pub-1", title: "مثال", input: "2 3\n", sampleOutput: "5\n" }]
};
const KEY = {
  hiddenTests: [{ id: "hid-1", title: "حالة سالبة (للمعلم فقط)", input: "-2 -3\n", expectedOutput: "HIDDEN-EXPECTED-5\n", weight: 2 }, { id: "hid-2", input: "HIDDEN-INPUT\n", expectedOutput: "1000001\n", weight: 3 }],
  comparator: "trimTrailingWhitespace",
  referenceSolutions: { python: "REFERENCE-SOLUTION = 1\nprint(a + b)\n" }
};
const codingQuestion = (over = {}) => ({ examQuestionId: "c1", presentationType: "coding", questionTypeVersion: 1, text: "اقرأ عددين واطبع مجموعهما.", marks: 10, coding: JSON.parse(JSON.stringify(CFG)), answer: JSON.parse(JSON.stringify(KEY)), teacherNote: "ملاحظة المعلم السرية", ...over });
const examWith = q => ({ title: "امتحان", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [q] }] });
const code = (source, over = {}) => ({ kind: "code", language: "python", languageVersion: 1, source, ...over });

describe("C12 / C13 / C14 — the student payload carries the PUBLIC coding config and nothing private", () => {
  it("C12 public config survives: allowed languages, default, starter code, public tests (with sample output) and limits", () => {
    const [q] = sanitizeExamForStudent(examWith(codingQuestion())).sections[0].questions;
    expect(q.coding).toEqual(CFG);
    expect(q.presentationType).toBe("coding"); expect(q.questionTypeVersion).toBe(1);
  });
  it("C13 hidden tests never reach the student: zero hidden-test bytes (ids, titles, inputs, expected outputs, weights)", () => {
    const [q] = sanitizeExamForStudent(examWith(codingQuestion())).sections[0].questions;
    const s = JSON.stringify(q);
    for (const secret of ["hiddenTests", "hid-1", "hid-2", "HIDDEN-EXPECTED", "HIDDEN-INPUT", "حالة سالبة", "weight", "comparator", "ملاحظة المعلم السرية"]) expect(s, secret).not.toContain(secret);
    expect(q.answer).toEqual({});
  });
  it("C14 reference solutions never reach the student; private data smuggled INTO the public config is dropped too", () => {
    const smuggled = codingQuestion({ coding: { ...CFG, hiddenTests: KEY.hiddenTests, referenceSolutions: KEY.referenceSolutions, teacherNotes: "SECRET-NOTE", runnerToken: "SECRET-TOKEN", publicTests: [{ ...CFG.publicTests[0], weight: 7, expectedOutput: "SECRET-EXPECTED" }] } });
    const [q] = sanitizeExamForStudent(examWith(smuggled)).sections[0].questions;
    const s = JSON.stringify(q);
    for (const secret of ["REFERENCE-SOLUTION", "referenceSolution", "HIDDEN-EXPECTED", "hiddenTests", "SECRET-NOTE", "SECRET-TOKEN", "SECRET-EXPECTED", "\"weight\""]) expect(s, secret).not.toContain(secret);
    expect(q.coding).toEqual(CFG);
  });
  it("a malformed coding config is not forwarded (fail closed: the student never receives what the projection cannot vouch for)", () => {
    const [q] = sanitizeExamForStudent(examWith(codingQuestion({ coding: "<script>alert(1)</script>" }))).sections[0].questions;
    expect(q.coding).toBeUndefined();
  });
});

describe("C8 / C9 — server draft / submit / pause pipeline: canonical code answer, preserved byte-for-byte, bounded", () => {
  const tricky = "# تعليق عربي ✓ 😀\r\n\tif x:\n        return  x   \n\n";
  it("normalizeDraftAnswers keeps the exact source and drops client-reported score / passed / testsPassed / stdout", () => {
    const r = normalizeDraftAnswers({ c1: code(tricky, { score: 10, passed: true, testsPassed: 9, stdout: "5" }), q2: { kind: "text", value: "x" } });
    expect(r.answers).toEqual({ c1: code(tricky), q2: { kind: "text", value: "x" } });
    expect(r.answers.c1.source).toBe(tricky);
  });
  it("an oversized (> 64 KB UTF-8) or malformed code answer is DROPPED (never stored, never crashes the save) and reported", () => {
    const r = normalizeDraftAnswers({ big: code("x".repeat(65537)), arabic: code("ب".repeat(32769)), bad: code(42), ok: code("print(1)") });
    expect(Object.keys(r.answers)).toEqual(["ok"]);
    expect(r.rejected.map(x => x.id + ":" + x.code)).toEqual(["big:CODE_SOURCE_TOO_LARGE", "arabic:CODE_SOURCE_TOO_LARGE", "bad:CODE_ANSWER_INVALID"]);
  });
  it("isResponseAnswered mirrors answered(): non-whitespace source only", () => {
    expect(isResponseAnswered(code("print(1)"))).toBe(true);
    expect(isResponseAnswered(code(" \n\t"))).toBe(false);
    expect(isResponseAnswered({ kind: "code", language: "python", languageVersion: 1 })).toBe(false);
  });
  it("the REAL student-submission handler bounds code on saveDraft AND on pauseAttempt (no ingest path stores an unbounded source)", async () => {
    const S1 = "11111111-1111-1111-1111-111111111111", AID = "asg-17a";
    const ctx = createMemoryContainer({
      ["platform/users/" + S1 + ".json"]: { schemaVersion: 3, role: "student", userId: S1, displayName: "أحمد", code: "S1", classId: "c1", active: true, archived: false, authVersion: 1 },
      ["platform/classes/c1.json"]: { classId: "c1", name: "الصف", active: true, studentIds: [] },
      ["platform/assignments/" + AID + ".json"]: { schemaVersion: 2, attemptModelVersion: 3, attemptPolicy: "pausable", assignmentId: AID, classId: "c1", title: "واجب", instructions: "", status: "published", openAt: "", dueAt: new Date(Date.now() + 864e5).toISOString(), maxAttempts: 1, durationMinutes: 30, questionCount: 1, totalMarks: 10, examSnapshot: examWith(codingQuestion()) }
    });
    const deps = { container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: S1, sv: 1, role: "student" } }), recordAchievementIfEligible: async () => {} };
    const post = async body => (await submissionHandler({ method: "POST", params: { assignmentId: AID }, headers: { get: () => null }, json: async () => body }, deps));
    const started = await post({ action: "startAttempt" });
    expect(started.status).toBe(200);
    const docPath = "platform/submissions/" + AID + "/" + S1 + ".json";
    const ident = { expectedAttemptNumber: 1, expectedStartedAt: ctx.getJson(docPath).activeAttempt.startedAt, expectedAttemptEpoch: 1 };   // the identity the real client sends
    expect((await post({ action: "saveDraft", ...ident, answers: { c1: code(tricky, { score: 10 }) } })).status).toBe(200);
    expect(ctx.getJson(docPath).draftAnswers).toEqual({ c1: code(tricky) });
    expect((await post({ action: "pauseAttempt", ...ident, answers: { c1: code("y".repeat(70000)), other: { kind: "text", value: "z" } } })).status).toBe(200);
    expect(ctx.getJson(docPath).draftAnswers).toEqual({ other: { kind: "text", value: "z" } });
  });
});

describe("C30 / C31 — coding@1 has ZERO automatic authority without a trusted executor", () => {
  it("every response grades to score 0 / manual review, including client-reported score / passed / testsPassed", () => {
    const q = codingQuestion();
    for (const r of [code("print(int(input())+1)"), code("x", { score: 10, passed: true, testsPassed: 2, correct: true }), code(""), null]) {
      expect(gradeQuestion(q, r), JSON.stringify(r)).toMatchObject({ score: 0, manualReview: true, correct: false });
    }
  });
  it("a source equal to the reference solution earns NOTHING automatically (never source-string grading)", () => {
    const q = codingQuestion();
    expect(gradeQuestion(q, code(KEY.referenceSolutions.python))).toMatchObject({ score: 0, manualReview: true });
  });
});

describe("Shared build — the coding modules are compiled from the SAME TypeScript source for the server", () => {
  it("codingQuestion / codingContract are SHARED_ENTRIES and their generated CJS exists", () => {
    const script = fs.readFileSync(path.join(repo, "scripts/build-shared-finalization.mjs"), "utf8");
    expect(script).toContain("\"src/codingQuestion.ts\""); expect(script).toContain("\"src/codingContract.ts\"");
    expect(typeof sharedQuestion().validateCodingQuestion).toBe("function");
    expect(typeof sharedContract().compareOutput).toBe("function");
  });
});

describe("C33 — the execution provider is a server-owned contract; UNAVAILABLE is the normal 17A state", () => {
  it("without a configured trusted provider the resolved provider is unavailable and advertises NO language", () => {
    const p = provider();
    const unavailable = p.resolveCodingExecutionProvider({});
    expect(p.codingCapabilities(unavailable)).toEqual({ available: false, languages: [] });
    expect(p.codingCapabilities(p.resolveCodingExecutionProvider({ env: { CODING_EXECUTION_URL: "https://runner.example" } }))).toEqual({ available: false, languages: [] });   // no 17A provider exists for any env
  });
  it("running against the unavailable provider answers EXECUTION_UNAVAILABLE (503) — never a fake success, never a local fallback", async () => {
    const p = provider();
    const r = await p.runCodingExecution(p.resolveCodingExecutionProvider({}), { requestId: "r1", language: "python", languageVersion: 1, source: "print(1)", stdin: "", limits: CFG.limits });
    expect(r).toEqual({ ok: false, status: 503, code: "EXECUTION_UNAVAILABLE" });
  });
});

describe("C34 — provider routing / capability / request minimisation / result normalisation (deterministic fake, nothing executed)", () => {
  it("routes a valid request to the injected provider and returns the normalised result", async () => {
    const p = provider();
    const fake = createFakeCodingExecutionProvider();
    const prov = p.resolveCodingExecutionProvider({ codingExecutionProvider: fake });
    expect(p.codingCapabilities(prov)).toEqual({ available: true, languages: [{ key: "python", languageVersion: 1 }] });
    const r = await p.runCodingExecution(prov, { requestId: "r1", language: "python", languageVersion: 1, source: "print(input())", stdin: "7\n", limits: CFG.limits });
    expect(r).toEqual({ ok: true, result: { status: "success", stdout: "echo:7\n", stderr: "", exitCode: 0, durationMs: 1, memoryKb: 1024 } });
  });
  it("the provider receives the MINIMUM request: requestId, language, languageVersion, source, stdin, limits — never identity, tokens, the exam or other answers", async () => {
    const p = provider();
    const fake = createFakeCodingExecutionProvider();
    await p.runCodingExecution(p.resolveCodingExecutionProvider({ codingExecutionProvider: fake }), { requestId: "r2", language: "python", languageVersion: 1, source: "x", stdin: "", limits: CFG.limits, studentName: "أحمد", email: "a@b.c", classId: "c1", token: "Bearer SECRET", exam: { sections: [] }, answers: { q2: 1 }, hiddenTests: KEY.hiddenTests });
    expect(fake.requests).toHaveLength(1);
    expect(Object.keys(fake.requests[0]).sort()).toEqual(["language", "languageVersion", "limits", "requestId", "source", "stdin"]);
    expect(Object.keys(fake.requests[0].limits).sort()).toEqual(["memoryMb", "outputBytes", "timeMs"]);
    expect(JSON.stringify(fake.requests[0])).not.toMatch(/SECRET|أحمد|hid-1/);
  });
  it("a language the provider does not offer, an unknown language, or an invalid request never reaches the provider", async () => {
    const p = provider();
    const fake = createFakeCodingExecutionProvider();
    const prov = p.resolveCodingExecutionProvider({ codingExecutionProvider: fake });
    const base = { requestId: "r3", languageVersion: 1, stdin: "", limits: CFG.limits };
    expect(await p.runCodingExecution(prov, { ...base, language: "java", source: "x" })).toEqual({ ok: false, status: 422, code: "LANGUAGE_UNAVAILABLE" });
    expect(await p.runCodingExecution(prov, { ...base, language: "cobol", source: "x" })).toEqual({ ok: false, status: 400, code: "REQUEST_INVALID" });
    expect(await p.runCodingExecution(prov, { ...base, language: "python", source: "x".repeat(65537) })).toEqual({ ok: false, status: 400, code: "REQUEST_INVALID" });
    expect(await p.runCodingExecution(prov, { ...base, language: "python", source: "x", limits: { timeMs: 999999, memoryMb: 256, outputBytes: 1024 } })).toEqual({ ok: false, status: 400, code: "REQUEST_INVALID" });
    expect(await p.runCodingExecution(prov, { ...base, language: "python", source: "x", stdin: "s".repeat(16385) })).toEqual({ ok: false, status: 400, code: "REQUEST_INVALID" });
    expect(fake.requests).toHaveLength(0);
  });
  it("results are normalised: unknown status → internal-error, oversized output truncated with status output-limit, runner-internal fields dropped", async () => {
    const p = provider();
    const run = async raw => p.runCodingExecution(p.resolveCodingExecutionProvider({ codingExecutionProvider: createFakeCodingExecutionProvider({ respond: () => raw }) }), { requestId: "r4", language: "python", languageVersion: 1, source: "x", stdin: "", limits: { ...CFG.limits, outputBytes: 1024 } });
    expect((await run({ status: "pwned", stdout: "", stderr: "" })).result.status).toBe("internal-error");
    const big = await run({ status: "success", stdout: "o".repeat(5000), stderr: "e".repeat(5000), exitCode: 0 });
    expect(big.result.status).toBe("output-limit"); expect(big.result.stdout.length).toBe(1024); expect(big.result.stderr.length).toBeLessThanOrEqual(1024);
    const leaky = await run({ status: "runtime-error", stdout: "", stderr: "Traceback", exitCode: 1, env: { AZURE_STORAGE_CONNECTION_STRING: "SECRET" }, host: "10.0.0.5", workerToken: "SECRET" });
    expect(leaky.result).toEqual({ status: "runtime-error", stdout: "", stderr: "Traceback", exitCode: 1 });
    expect((await run(null)).result.status).toBe("internal-error");
  });
  it("a provider that throws yields EXECUTION_FAILED (502) — never a success, never a retry on the API host", async () => {
    const p = provider();
    const prov = p.resolveCodingExecutionProvider({ codingExecutionProvider: createFakeCodingExecutionProvider({ respond: () => { throw new Error("boom"); } }) });
    expect(await p.runCodingExecution(prov, { requestId: "r5", language: "python", languageVersion: 1, source: "x", stdin: "", limits: CFG.limits })).toEqual({ ok: false, status: 502, code: "EXECUTION_FAILED" });
  });
  it("a malformed injected provider is refused (falls back to UNAVAILABLE, never to local execution)", () => {
    const p = provider();
    expect(p.codingCapabilities(p.resolveCodingExecutionProvider({ codingExecutionProvider: { execute: "eval" } }))).toEqual({ available: false, languages: [] });
    const lying = { capabilities: () => ({ available: true, languages: [{ key: "cobol", languageVersion: 1 }, { key: "python", languageVersion: 1, secret: "x" }] }), execute: async () => ({}) };
    expect(p.codingCapabilities(p.resolveCodingExecutionProvider({ codingExecutionProvider: lying }))).toEqual({ available: true, languages: [{ key: "python", languageVersion: 1 }] });
  });
});
