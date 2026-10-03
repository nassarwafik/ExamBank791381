import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import * as tsQuestion from "../../src/codingQuestion";
import * as tsContract from "../../src/codingContract";

// Phase 17C — 17C-A (model / authoring contract) and 17C-B (pure grading engine).
//   • an explicit teacher-private grading mode: missing → manual (Phase 17A behaviour), "hiddenTests" → official automatic;
//   • hiddenTests mode fails CLOSED at finalization unless the suite is gradeable (tests, unique ids, weight > 0, comparator,
//     output that the official grader can capture, languages that support tests, valid limits);
//   • the SmartAssess server owns comparison + weighting: compareOutput() / normalizeOutput() (unchanged 17A comparators),
//     passedWeight / totalWeight, one rounding at the end, infrastructure failure = NO score (never a zero);
//   • the server copy under api/src/lib/shared-finalization is the SAME compiled source (no second comparator).
// Fail-first on 543fa9f4: gradingMode, the official engine and its constants do not exist.
const require_ = createRequire(import.meta.url);
const sq = () => require_("../src/lib/shared-finalization/codingQuestion.js");
const sc = () => require_("../src/lib/shared-finalization/codingContract.js");

const CFG = { allowedLanguages: ["python", "java", "csharp"], defaultLanguage: "python", starterCode: {}, taskMode: "program", inputMode: "stdin", outputMode: "stdout", limits: { sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 256 }, publicTests: [] };
const TESTS = [
  { id: "t1", title: "صغير", input: "1 2\n", expectedOutput: "3\n", weight: 1 },
  { id: "t2", title: "سالب", input: "-1 -2\n", expectedOutput: "-3\n", weight: 2 },
  { id: "t3", input: "5 5\n", expectedOutput: "10\n", weight: 3 }
];
const node = (answer, coding = CFG) => ({ presentationType: "coding", questionTypeVersion: 1, marks: 10, coding: JSON.parse(JSON.stringify(coding)), answer: JSON.parse(JSON.stringify(answer)) });
const codes = issues => issues.map(i => i.code).sort();
const ok = (token, stdout, over = {}) => ({ token, status: "success", stdout, stderr: "", exitCode: 0, durationMs: 5, ...over });

describe("17C-A — explicit grading mode (teacher-private, backward compatible)", () => {
  it("the grading modes are exactly manual | hiddenTests; a missing / unknown mode resolves to manual", () => {
    expect([...sq().CODING_GRADING_MODES]).toEqual(["manual", "hiddenTests"]);
    expect(sq().codingGradingMode(undefined)).toBe("manual");
    expect(sq().codingGradingMode({})).toBe("manual");
    expect(sq().codingGradingMode({ hiddenTests: TESTS })).toBe("manual");                          // 17A data never silently becomes automatic
    expect(sq().codingGradingMode({ gradingMode: "hiddenTests", hiddenTests: TESTS })).toBe("hiddenTests");
    expect(sq().codingGradingMode({ gradingMode: "HiddenTests" })).toBe("manual");
    expect(sq().codingGradingMode(null)).toBe("manual");
  });
  it("defaultCodingAnswerKey() carries gradingMode manual; the TypeScript source and the server copy agree", () => {
    expect(sq().defaultCodingAnswerKey()).toEqual({ hiddenTests: [], comparator: "trimTrailingWhitespace", referenceSolutions: {}, gradingMode: "manual", compileErrorPolicy: "manualReview" });   // 17F-C2: NEW authoring defaults to teacher review
    expect(tsQuestion.defaultCodingAnswerKey()).toEqual(sq().defaultCodingAnswerKey());
    expect([...tsQuestion.CODING_GRADING_MODES]).toEqual([...sq().CODING_GRADING_MODES]);
  });
  it("manual mode stays valid WITHOUT hidden tests (Phase 17A), and keeps hidden tests that exist (they are preserved, not deleted)", () => {
    expect(sq().validateCodingQuestion(node({ gradingMode: "manual" }))).toEqual([]);
    expect(sq().validateCodingQuestion(node({ hiddenTests: TESTS, comparator: "exact", gradingMode: "manual" }))).toEqual([]);
    expect(sq().validateCodingQuestion(node({ hiddenTests: TESTS }))).toEqual([]);                  // legacy 17A key (no mode)
  });
  it("an unknown grading mode is a blocking finalization error", () => {
    expect(codes(sq().validateCodingQuestion(node({ gradingMode: "ai" })))).toContain("CODING_GRADING_MODE_UNKNOWN");
  });
  it("hiddenTests mode with no hidden test fails closed", () => {
    expect(codes(sq().validateCodingQuestion(node({ gradingMode: "hiddenTests", hiddenTests: [] })))).toContain("CODING_AUTO_NO_HIDDEN_TESTS");
    expect(codes(sq().validateCodingQuestion(node({ gradingMode: "hiddenTests" })))).toContain("CODING_AUTO_NO_HIDDEN_TESTS");
  });
  it("hiddenTests mode: duplicate / invalid ids, zero total weight, negative or non-finite weights, an unknown comparator all block", () => {
    const dup = [TESTS[0], { ...TESTS[1], id: "t1" }];
    expect(codes(sq().validateCodingQuestion(node({ gradingMode: "hiddenTests", hiddenTests: dup })))).toContain("CODING_TEST_ID_DUPLICATE");
    expect(codes(sq().validateCodingQuestion(node({ gradingMode: "hiddenTests", hiddenTests: [{ ...TESTS[0], id: "bad id!" }] })))).toContain("CODING_TEST_ID_INVALID");
    expect(codes(sq().validateCodingQuestion(node({ gradingMode: "hiddenTests", hiddenTests: TESTS.map(t => ({ ...t, weight: 0 })) })))).toContain("CODING_WEIGHT_TOTAL_ZERO");
    expect(codes(sq().validateCodingQuestion(node({ gradingMode: "hiddenTests", hiddenTests: [{ ...TESTS[0], weight: -1 }] })))).toContain("CODING_WEIGHT_INVALID");
    expect(codes(sq().validateCodingQuestion(node({ gradingMode: "hiddenTests", hiddenTests: [{ ...TESTS[0], weight: Infinity }] })))).toContain("CODING_WEIGHT_INVALID");
    expect(codes(sq().validateCodingQuestion(node({ gradingMode: "hiddenTests", hiddenTests: TESTS, comparator: "fuzzy" })))).toContain("CODING_COMPARATOR_UNKNOWN");
  });
  it("hiddenTests mode: an expected output the official grader could never capture (above the question's output limit) blocks", () => {
    const big = "x".repeat(2000) + "\n";
    const cfg = { ...CFG, limits: { ...CFG.limits, outputBytes: 1024 } };
    expect(codes(sq().validateCodingQuestion(node({ gradingMode: "hiddenTests", hiddenTests: [{ id: "t1", input: "", expectedOutput: big, weight: 1 }] }, cfg)))).toContain("CODING_EXPECTED_OUTPUT_EXCEEDS_LIMIT");
    // the same expected output is fine for a manual question (it is never executed officially)
    expect(codes(sq().validateCodingQuestion(node({ gradingMode: "manual", hiddenTests: [{ id: "t1", input: "", expectedOutput: big, weight: 1 }] }, cfg)))).not.toContain("CODING_EXPECTED_OUTPUT_EXCEEDS_LIMIT");
    // the official capture ceiling always covers the hidden-test I/O contract (16 KB) — validation can never demand more
    expect(sc().OFFICIAL_STDOUT_CAPTURE_BYTES).toBeGreaterThan(sq().CODING_TEST_LIMITS.ioBytes);
    expect(sc().OFFICIAL_STDOUT_CAPTURE_BYTES).toBeLessThanOrEqual(sq().CODING_TEST_LIMITS.ioBytes + 4096);
  });
  it("a complete, valid automatic suite finalizes", () => {
    expect(sq().validateCodingQuestion(node({ gradingMode: "hiddenTests", hiddenTests: TESTS, comparator: "trimTrailingWhitespace", referenceSolutions: { python: "print(1)" } }))).toEqual([]);
  });
});

describe("17C-B — server-owned official engine (comparator + weights; the runner never decides)", () => {
  const run = (cases, compile) => ({ ...(compile ? { compile } : {}), cases });
  const evaluate = (cases, comparator = "trimTrailingWhitespace", compile, tests = TESTS) => sc().evaluateOfficialCodingRun({ tests, comparator, run: run(cases, compile) });
  it("opaque case tokens c01, c02 … map to the hidden tests BY ORDER (the runner never learns the test id)", () => {
    expect(sc().officialCaseToken(0)).toBe("c01");
    expect(sc().officialCaseToken(9)).toBe("c10");
    expect(sc().officialCaseToken(49)).toBe("c50");
  });
  it("all pass → complete, passedWeight = totalWeight", () => {
    const r = evaluate([ok("c01", "3\n"), ok("c02", "-3\n"), ok("c03", "10\n")]);
    expect(r.kind).toBe("complete");
    expect([r.passedWeight, r.totalWeight]).toEqual([6, 6]);
    expect(r.cases.map(c => [c.testId, c.passed])).toEqual([["t1", true], ["t2", true], ["t3", true]]);
  });
  it("exact comparator: byte-for-byte (a trailing space fails)", () => {
    const r = evaluate([ok("c01", "3 \n"), ok("c02", "-3\n"), ok("c03", "10\n")], "exact");
    expect(r.cases[0].passed).toBe(false); expect(r.passedWeight).toBe(5);
  });
  it("trimTrailingWhitespace: CRLF and trailing spaces / newlines are tolerated, internal spaces are not", () => {
    const r = evaluate([ok("c01", "3   \r\n\n\n"), ok("c02", " -3\n"), ok("c03", "10")]);
    expect(r.cases.map(c => c.passed)).toEqual([true, false, true]);
  });
  it("normalizeWhitespace: any whitespace run collapses", () => {
    const r = evaluate([ok("c01", "  3 "), ok("c02", "-3\n\n"), ok("c03", "1 0")], "normalizeWhitespace");
    expect(r.cases.map(c => c.passed)).toEqual([true, true, false]);
  });
  it("weighted score: maxMarks × passedWeight / totalWeight, rounded ONCE at the end (no per-test rounding drift)", () => {
    expect(sc().officialCodingScore(10, 1, 3)).toBe(3.33);
    expect(sc().officialCodingScore(7, 2, 3)).toBe(4.67);
    expect(sc().officialCodingScore(10, 6, 6)).toBe(10);
    expect(sc().officialCodingScore(10, 0, 6)).toBe(0);
    // three tests of weight 1 worth 1/3 each: per-test rounding would give 0.33 × 3 = 0.99, the canonical rule gives 1
    expect(sc().officialCodingScore(1, 3, 3)).toBe(1);
    expect(sc().officialCodingScore(1, 2, 3)).toBe(0.67);
  });
  it("zero-weight tests run but contribute nothing; a suite whose total weight is 0 is technical (never a fabricated mark)", () => {
    const tests = [{ id: "a", input: "", expectedOutput: "1", weight: 0 }, { id: "b", input: "", expectedOutput: "2", weight: 4 }];
    const r = evaluate([ok("c01", "1"), ok("c02", "nope")], "exact", undefined, tests);
    expect([r.kind, r.passedWeight, r.totalWeight]).toEqual(["complete", 0, 4]);
    const zero = evaluate([ok("c01", "1")], "exact", undefined, [{ id: "a", input: "", expectedOutput: "1", weight: 0 }]);
    expect(zero.kind).toBe("technical");
  });
  it("student-caused failures fail THAT test only: runtime-error, timeout, output-limit — even with a matching stdout", () => {
    const r = evaluate([ok("c01", "3\n", { status: "runtime-error", exitCode: 1 }), ok("c02", "-3\n", { status: "timeout", exitCode: undefined }), ok("c03", "10\n", { status: "output-limit" })]);
    expect(r.kind).toBe("complete");
    expect(r.cases.map(c => [c.status, c.passed])).toEqual([["runtime-error", false], ["timeout", false], ["output-limit", false]]);
    expect(r.passedWeight).toBe(0);
  });
  it("stderr never decides correctness by itself: a successful run with stderr noise still passes on stdout", () => {
    const r = evaluate([ok("c01", "3\n", { stderr: "warning: deprecated" }), ok("c02", "-3\n"), ok("c03", "10\n")]);
    expect(r.passedWeight).toBe(6);
  });
  it("compile error (compiled languages) → complete, ZERO, no runtime case needed, bounded diagnostic preview", () => {
    const r = evaluate([], "trimTrailingWhitespace", { status: "compile-error", stderr: "Main.java:1: error: ';' expected\n" + "x".repeat(20000) });
    expect(r.kind).toBe("complete"); expect(r.compileError).toBe(true);
    expect([r.passedWeight, r.totalWeight]).toEqual([0, 6]);
    expect(new TextEncoder().encode(r.compilePreview).length).toBeLessThanOrEqual(sc().OFFICIAL_PREVIEW_BYTES);
    expect(r.cases.map(c => [c.testId, c.status, c.passed])).toEqual([["t1", "compile-error", false], ["t2", "compile-error", false], ["t3", "compile-error", false]]);
  });
  it("INFRASTRUCTURE failure is NEVER a zero: an internal-error case, a missing case, an unknown / duplicated token → technical (no score)", () => {
    expect(evaluate([ok("c01", "3\n"), ok("c02", "-3\n"), ok("c03", "", { status: "internal-error" })]).kind).toBe("technical");
    expect(evaluate([ok("c01", "3\n"), ok("c02", "-3\n")]).kind).toBe("technical");
    expect(evaluate([ok("c01", "3\n"), ok("c02", "-3\n"), ok("c09", "10\n")]).kind).toBe("technical");
    expect(evaluate([ok("c01", "3\n"), ok("c01", "3\n"), ok("c03", "10\n")]).kind).toBe("technical");
    expect(evaluate([ok("c01", "3\n"), ok("c02", "-3\n"), ok("c03", "10\n", { status: "compile-error" })]).kind).toBe("technical");
    expect(evaluate([ok("c01", "3\n"), ok("c02", "-3\n"), ok("c03", "10\n", { status: "passed" })]).kind).toBe("technical");
  });
  it("runner-reported grading fields are IGNORED: passed / score / weight on a case have no effect", () => {
    const forged = [ok("c01", "WRONG", { passed: true, score: 100, weight: 999 }), ok("c02", "-3\n"), ok("c03", "10\n")];
    const r = evaluate(forged);
    expect(r.cases[0].passed).toBe(false); expect(r.passedWeight).toBe(5);
  });
  it("teacher evidence is bounded and UTF-8 safe: actual stdout / stderr previews ≤ 4 KB for failed tests only, never expected output", () => {
    const longArabic = "ب".repeat(5000);                                                          // 10000 UTF-8 bytes
    const r = evaluate([ok("c01", longArabic, { stderr: longArabic }), ok("c02", "-3\n"), ok("c03", "10\n")]);
    const failed = r.cases[0];
    expect(new TextEncoder().encode(failed.actualPreview).length).toBeLessThanOrEqual(sc().OFFICIAL_PREVIEW_BYTES);
    expect(new TextEncoder().encode(failed.stderrPreview).length).toBeLessThanOrEqual(sc().OFFICIAL_PREVIEW_BYTES);
    expect(failed.actualPreview.includes("�")).toBe(false);
    expect(r.cases[1].actualPreview).toBeUndefined();
    expect(JSON.stringify(r)).not.toMatch(/expectedOutput|"-3\\n".*expected/);
  });
  it("the TypeScript source and the generated server copy are the same engine", () => {
    const cases = [ok("c01", "3\n"), ok("c02", "nope"), ok("c03", "10\n")];
    expect(tsContract.evaluateOfficialCodingRun({ tests: TESTS, comparator: "exact", run: run(cases) })).toEqual(sc().evaluateOfficialCodingRun({ tests: TESTS, comparator: "exact", run: run(cases) }));
    expect(tsContract.OFFICIAL_STDOUT_CAPTURE_BYTES).toBe(sc().OFFICIAL_STDOUT_CAPTURE_BYTES);
  });
});
