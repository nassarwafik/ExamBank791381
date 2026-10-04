import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PARAMETRIC_FAIL_CLOSED, PARAMETRIC_NUMERIC_TYPE_KEY, bindParametricNumericAnswer, defaultParametricNumericAnswerKey, defaultParametricNumericConfig,
  parametricReviewInstance, previewParametricSample, projectParametricNumericForStudent, readParametricStudentProjection, scoreParametricNumeric,
  validateParametricNumericAnswerKey, validateParametricNumericConfig, validateParametricNumericQuestion
} from "./parametricNumericQuestion";

// Phase 19B — parametricNumeric@1, the first question family on the parametric engine: the strict PUBLIC config (generator version,
// bounded integer variables, constraints, response / unit presentation), the strict PRIVATE key (answer expression, tolerance or
// range, required unit), the stem as an {{id}} template, the per-attempt student projection (rendered prompt + generated values
// only), ingest binding (forged client seed / values / expected result are dropped), the authoritative scorer (server-owned
// identity ⇒ regenerated instance ⇒ evaluated expression ⇒ the existing numeric comparison) and the teacher review / sample
// instances. Pinned instances come from an independent reference of generator v1. New-module suite (fail-first on b8aa6ce).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CFG = { v: 1, generatorVersion: 1, variables: [{ id: "a", kind: "int", min: 2, max: 10, step: 1 }, { id: "b", kind: "int", min: 5, max: 20, step: 1 }], constraints: ["a < b"], response: { unit: "none" } };
const TEXT = "احسب ناتج ضرب {{a}} في {{b}}.";
const KEY = { expression: "a * b", mode: "tolerance", tolerance: 0 };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const node = (over: Record<string, unknown> = {}) => ({ examQuestionId: "q1", presentationType: "parametricNumeric", questionTypeVersion: 1, text: TEXT, marks: 4, parametric: clone(CFG), answer: clone(KEY), ...over });
const ID = { assignmentId: "asg-19b", studentId: "stu-1", attemptNumber: 1, questionKey: "q1" };
const num = (value: unknown, extra: Record<string, unknown> = {}) => ({ kind: "numeric", value, ...extra });
const score = (n: Record<string, unknown>, response: unknown, identity: unknown = ID, maxMarks = 4) => scoreParametricNumeric({ question: n, response, maxMarks, identity });
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const PRIVATE = /a \* b|"expression"|"tolerance"|"mode"|"constraints"|a < b|"answer"|26\b/;

describe("19B parametricNumeric@1 — public config", () => {
  it("a valid config is accepted and normalized; defaults are a valid config and a key whose EMPTY expression blocks finalization", () => {
    expect(PARAMETRIC_NUMERIC_TYPE_KEY).toBe("parametricNumeric");
    const r = validateParametricNumericConfig(CFG);
    expect(r.ok && r.config).toEqual(CFG);
    expect(validateParametricNumericConfig(defaultParametricNumericConfig()).ok).toBe(true);
    expect(codes(validateParametricNumericAnswerKey(defaultParametricNumericAnswerKey(), defaultParametricNumericConfig()))).toEqual(["PARAM_ANSWER_EXPRESSION_MISSING"]);
  });
  it("refuses unknown / prototype keys, wrong versions, an unsupported generator version, bad constraints and bad response presentation", () => {
    const c = (over: Record<string, unknown>) => codes(validateParametricNumericConfig({ ...clone(CFG), ...over }));
    expect(codes(validateParametricNumericConfig(undefined))).toEqual(["PARAM_CONFIG_MISSING"]);
    expect(c({ seed: 7 })).toEqual(["PARAM_CONFIG_UNKNOWN_KEY"]);
    expect(codes(validateParametricNumericConfig(JSON.parse('{"v":1,"generatorVersion":1,"variables":[{"id":"a","kind":"int","min":1,"max":2,"step":1}],"constraints":[],"response":{"unit":"none"},"__proto__":{"x":1}}')))).toEqual(["PARAM_CONFIG_UNKNOWN_KEY"]);
    expect(c({ v: 2 })).toEqual(["PARAM_CONFIG_VERSION"]);
    expect(c({ generatorVersion: 2 })).toEqual(["PARAM_GENERATOR_UNSUPPORTED"]);
    expect(c({ generatorVersion: "1" })).toEqual(["PARAM_GENERATOR_UNSUPPORTED"]);
    expect(c({ variables: [] })).toEqual(["PARAM_VARIABLES_INVALID"]);
    expect(c({ constraints: "a < b" })).toEqual(["PARAM_CONSTRAINTS_INVALID"]);
    expect(c({ constraints: ["a <"] })).toEqual(["PARAM_CONSTRAINT_INVALID"]);
    expect(c({ constraints: ["a < z"] })).toEqual(["PARAM_CONSTRAINT_UNKNOWN_VARIABLE"]);
    expect(c({ constraints: ["a.constructor < 1"] })).toEqual(["PARAM_CONSTRAINT_INVALID"]);
    for (const response of [{ unit: "kg" }, { unit: "label" }, { unit: "label", label: "" }, { unit: "input", label: "cm" }, { unit: "none", extra: 1 }, null])
      expect(c({ response }), JSON.stringify(response)).toEqual(["PARAM_RESPONSE_INVALID"]);
    expect(c({ response: { unit: "label", label: "cm" } })).toEqual([]);
    expect(c({ response: { unit: "input" } })).toEqual([]);
  });
});

describe("19B parametricNumeric@1 — private answer authority", () => {
  const k = (over: Record<string, unknown>, cfg: unknown = CFG) => codes(validateParametricNumericAnswerKey({ ...clone(KEY), ...over }, cfg));
  it("tolerance and range keys are accepted; the expression is parsed by the closed language and checked against the declared variables", () => {
    expect(k({})).toEqual([]);
    expect(codes(validateParametricNumericAnswerKey({ expression: "a * b", mode: "range", below: 1, above: 2 }, CFG))).toEqual([]);
    expect(k({ expression: "" })).toEqual(["PARAM_ANSWER_EXPRESSION_MISSING"]);
    expect(k({ expression: "a * " })).toEqual(["PARAM_ANSWER_EXPRESSION_INVALID"]);
    expect(k({ expression: "sqrt(a)" })).toEqual(["PARAM_ANSWER_EXPRESSION_INVALID"]);
    expect(k({ expression: "constructor.constructor('return 1')()" })).toEqual(["PARAM_ANSWER_EXPRESSION_INVALID"]);
    expect(k({ expression: "a * c" })).toEqual(["PARAM_ANSWER_UNKNOWN_VARIABLE"]);
    expect(k({ expression: "a < b" })).toEqual(["PARAM_ANSWER_EXPRESSION_INVALID"]);
  });
  it("modes, tolerances, ranges and the unit policy are strict; unknown fields fail closed; a key against an invalid config is invalid", () => {
    expect(k({ mode: "fuzzy" })).toEqual(["PARAM_ANSWER_MODE_UNKNOWN"]);
    expect(k({ tolerance: -1 })).toEqual(["PARAM_ANSWER_TOLERANCE_INVALID"]);
    expect(k({ tolerance: "0.1" })).toEqual(["PARAM_ANSWER_TOLERANCE_INVALID"]);
    expect(codes(validateParametricNumericAnswerKey({ expression: "a", mode: "range", below: -1, above: 1 }, CFG))).toEqual(["PARAM_ANSWER_RANGE_INVALID"]);
    expect(codes(validateParametricNumericAnswerKey({ expression: "a", mode: "range", below: 1 }, CFG))).toEqual(["PARAM_ANSWER_KEY_INVALID"]);
    expect(k({ expected: 26 })).toEqual(["PARAM_ANSWER_KEY_INVALID"]);
    expect(k({ unit: "cm" })).toEqual(["PARAM_ANSWER_UNIT_INVALID"]);                                       // unit only with response.unit "input"
    const inputCfg = { ...clone(CFG), response: { unit: "input" } };
    expect(k({}, inputCfg)).toEqual(["PARAM_ANSWER_UNIT_INVALID"]);
    expect(k({ unit: "cm" }, inputCfg)).toEqual([]);
    expect(k({ unit: "  " }, inputCfg)).toEqual(["PARAM_ANSWER_UNIT_INVALID"]);
    expect(codes(validateParametricNumericAnswerKey(JSON.parse('{"expression":"a","mode":"tolerance","tolerance":0,"__proto__":{"x":1}}'), CFG))).toEqual(["PARAM_ANSWER_KEY_INVALID"]);
    expect(k({}, { ...clone(CFG), v: 9 })).toEqual(["PARAM_KEY_CONFIG_INVALID"]);
    expect(codes(validateParametricNumericAnswerKey(null, CFG))).toEqual(["PARAM_ANSWER_KEY_INVALID"]);
  });
});

describe("19B parametricNumeric@1 — the whole question (stem template + deterministic sample check)", () => {
  const v = (over: Record<string, unknown> = {}) => validateParametricNumericQuestion(node(over)).map(i => i.code);
  it("a complete question validates; the stem is the template and must reference only declared variables (at least one)", () => {
    expect(v()).toEqual([]);
    expect(v({ text: "احسب {{a}} × {{c}}" })).toEqual(["PARAM_TEMPLATE_UNKNOWN_VARIABLE"]);
    expect(v({ text: "سؤال بلا متغيرات" })).toEqual(["PARAM_TEMPLATE_NO_VARIABLE"]);
    expect(v({ text: "{{a.b}}" })).toEqual(["PARAM_TEMPLATE_MALFORMED"]);
    expect(v({ text: "${a} {{a}}" })).toEqual(["PARAM_TEMPLATE_MALFORMED"]);
  });
  it("the deterministic sample check refuses impossible constraints and answers that fail on generated samples (division by zero)", () => {
    expect(v({ parametric: { ...clone(CFG), constraints: ["a > b + 100"] } })).toEqual(["PARAM_SAMPLE_GENERATION_FAILED"]);
    expect(v({ answer: { ...clone(KEY), expression: "a / (b - b)" } })).toEqual(["PARAM_SAMPLE_ANSWER_FAILED"]);
    expect(v({ answer: { ...clone(KEY), expression: "2 ^ (a * 20)" } })).toEqual(["PARAM_SAMPLE_ANSWER_FAILED"]);
  });
});

describe("19B parametricNumeric@1 — per-attempt student projection", () => {
  it("renders the stem with the generated values and carries ONLY v / status / generatorVersion / values / response (pinned)", () => {
    const p = projectParametricNumericForStudent(node(), ID);
    expect(p).toEqual({ text: "احسب ناتج ضرب 2 في 13.", parametric: { v: 1, status: "ready", generatorVersion: 1, values: { a: 2, b: 13 }, response: { unit: "none" } } });
    expect(JSON.stringify(p)).not.toMatch(PRIVATE);
    expect(projectParametricNumericForStudent(node(), { ...ID, attemptNumber: 2 }).text).toBe("احسب ناتج ضرب 9 في 18.");
    expect(projectParametricNumericForStudent(node(), { ...ID, questionKey: "q2" }).text).toBe("احسب ناتج ضرب 5 في 16.");
    expect(projectParametricNumericForStudent(node(), ID)).toEqual(p);                                       // refresh / restore
  });
  it("no identity, an invalid config / template or unsatisfiable constraints ⇒ an explicit UNAVAILABLE projection (no values, no template syntax)", () => {
    for (const [n, identity] of [[node(), null], [node(), { ...ID, attemptNumber: 0 }], [node({ parametric: { ...clone(CFG), generatorVersion: 2 } }), ID], [node({ text: "{{zz}}" }), ID], [node({ parametric: { ...clone(CFG), constraints: ["a > b + 100"] } }), ID]] as const) {
      const p = projectParametricNumericForStudent(n, identity);
      expect(p.parametric, JSON.stringify(identity)).toEqual({ v: 1, status: "unavailable" });
      expect(p.text).not.toMatch(/\{\{|\}\}/);
      expect(JSON.stringify(p)).not.toMatch(PRIVATE);
    }
  });
  it("the renderer-side reader accepts ONLY the exact projection shapes (a smuggled field or a wrong type is refused)", () => {
    const ready = { v: 1, status: "ready", generatorVersion: 1, values: { a: 2, b: 13 }, response: { unit: "label", label: "cm" } };
    expect(readParametricStudentProjection(ready)).toEqual(ready);
    expect(readParametricStudentProjection({ v: 1, status: "unavailable" })).toEqual({ v: 1, status: "unavailable" });
    for (const bad of [{ ...ready, expected: 26 }, { ...ready, values: { a: "2" } }, { ...ready, response: { unit: "x" } }, { ...ready, v: 2 }, CFG, null, "x"])
      expect(readParametricStudentProjection(bad), JSON.stringify(bad)).toBeNull();
  });
});

describe("19B parametricNumeric@1 — ingest binding (client authority is never accepted)", () => {
  it("keeps exactly { kind, value, unit? } bounded strings; forged seed / values / expected / score are dropped; other kinds are refused", () => {
    expect(bindParametricNumericAnswer(num("26", { seed: "x", values: { a: 1, b: 26 }, expected: 26, score: 4, generatorVersion: 9 }))).toEqual({ ok: true, answer: { kind: "numeric", value: "26" } });
    expect(bindParametricNumericAnswer(num("26", { unit: "cm" }))).toEqual({ ok: true, answer: { kind: "numeric", value: "26", unit: "cm" } });
    expect(bindParametricNumericAnswer(num("9".repeat(200)))).toEqual({ ok: true, answer: { kind: "numeric", value: "9".repeat(64) } });
    for (const bad of [{ kind: "text", value: "26" }, num(26), num(["26"]), null, "26", num("26", { unit: 5 })])
      expect(bindParametricNumericAnswer(bad), JSON.stringify(bad)).toEqual({ ok: false, code: "PARAM_ANSWER_INVALID" });
  });
});

describe("19B parametricNumeric@1 — authoritative scoring", () => {
  it("regenerates the server instance from the identity and grades the existing numeric comparison (pinned: a=2, b=13 ⇒ 26)", () => {
    expect(score(node(), num("26"))).toMatchObject({ score: 4, correct: true, manualReview: false });
    expect(score(node(), num("٢٦"))).toMatchObject({ score: 4, correct: true });                          // Arabic-Indic digits, as numericResponse
    expect(score(node(), num("26.0"))).toMatchObject({ score: 4, correct: true });
    expect(score(node(), num("25"))).toMatchObject({ score: 0, correct: false, manualReview: false });
    expect(score(node(), num("162"), { ...ID, attemptNumber: 2 })).toMatchObject({ score: 4, correct: true }); // 9 × 18
    expect(score(node(), num("26"), { ...ID, attemptNumber: 2 })).toMatchObject({ score: 0, correct: false });
  });
  it("tolerance, range and the required unit (NFKC, whitespace-free, case-insensitive) — no unit conversion", () => {
    expect(score(node({ answer: { ...clone(KEY), tolerance: 0.5 } }), num("26.4"))).toMatchObject({ correct: true });
    expect(score(node({ answer: { ...clone(KEY), tolerance: 0.5 } }), num("26.6"))).toMatchObject({ correct: false });
    const range = node({ answer: { expression: "a * b", mode: "range", below: 1, above: 2 } });
    expect(score(range, num("25"))).toMatchObject({ correct: true }); expect(score(range, num("28"))).toMatchObject({ correct: true });
    expect(score(range, num("28.1"))).toMatchObject({ correct: false }); expect(score(range, num("24.9"))).toMatchObject({ correct: false });
    const unit = node({ parametric: { ...clone(CFG), response: { unit: "input" } }, answer: { ...clone(KEY), unit: "cm" } });
    expect(score(unit, num("26", { unit: " CM " }))).toMatchObject({ correct: true });
    expect(score(unit, num("26", { unit: "mm" }))).toMatchObject({ correct: false, manualReview: false });
    expect(score(unit, num("26"))).toMatchObject({ correct: false, manualReview: false });
  });
  it("forged client seed / values / expected result never change the grade", () => {
    expect(score(node(), num("999", { seed: "forged", values: { a: 1, b: 999 }, expected: 999 }))).toMatchObject({ score: 0, correct: false });
    expect(score(node(), num("26", { values: { a: 1, b: 1 }, expected: 1 }))).toMatchObject({ score: 4, correct: true });
    // the answer that is correct for ANOTHER (forged) official seed — attempt 2 ⇒ 9 × 18 — earns nothing on attempt 1
    const forgedSeed = '["smartassess.parametric",1,"official","asg-19b","stu-1",2,"q1"]';
    expect(score(node(), num("162", { seed: forgedSeed, identity: { ...ID, attemptNumber: 2 }, generatorVersion: 1 }))).toMatchObject({ score: 0, correct: false });
    expect(score(node(), num("26", { seed: forgedSeed, identity: { ...ID, attemptNumber: 2 } }))).toMatchObject({ score: 4, correct: true });
    expect(score(node(), num("1", { values: { a: 1, b: 1 } }))).toMatchObject({ score: 0, correct: false });
  });
  it("malformed PUBLISHED authority fails closed: score 0, correct false, manualReview true — never an ordinary zero", () => {
    expect(PARAMETRIC_FAIL_CLOSED).toEqual({ score: 0, correct: false, manualReview: true });
    const bad: [Record<string, unknown>, unknown][] = [
      [node({ answer: { ...clone(KEY), mode: "fuzzy" } }), ID], [node({ answer: { ...clone(KEY), expression: "eval(1)" } }), ID], [node({ answer: { ...clone(KEY), expected: 26 } }), ID],
      [node({ parametric: { ...clone(CFG), generatorVersion: 2 } }), ID], [node({ parametric: { ...clone(CFG), hidden: 1 } }), ID], [node({ text: "{{zz}}" }), ID],
      [node({ parametric: { ...clone(CFG), constraints: ["a > b + 100"] } }), ID], [node({ answer: { ...clone(KEY), expression: "a / (b - 13)" } }), ID],
      [node(), null], [node(), { ...ID, studentId: "" }], [node(), { ...ID, attemptNumber: "1" }]
    ];
    for (const [n, identity] of bad) expect(score(n, num("26"), identity), JSON.stringify([n.answer, n.parametric, n.text, identity])).toEqual(PARAMETRIC_FAIL_CLOSED);
  });
  it("malformed STUDENT input under valid authority is an ordinary incorrect answer (manualReview false)", () => {
    for (const r of [{ kind: "text", value: "26" }, num(26), num("abc"), num(""), null, { kind: "fields", values: { a: "26" } }])
      expect(score(node(), r), JSON.stringify(r)).toMatchObject({ score: 0, correct: false, manualReview: false });
  });
});

describe("19B parametricNumeric@1 — teacher review instance and teacher sample", () => {
  it("the review instance is the EXACT official instance with the expected value and the audit identity (generator version, seed digest)", () => {
    expect(parametricReviewInstance(node(), ID)).toEqual({ ok: true, generatorVersion: 1, seedDigest: "896b187e1b0615f2313ff4fd48a8a628", identity: ID, values: { a: 2, b: 13 }, text: "احسب ناتج ضرب 2 في 13.", expected: 26 });
    expect(parametricReviewInstance(node({ answer: { ...clone(KEY), mode: "x" } }), ID)).toMatchObject({ ok: false, code: "PARAM_AUTHORITY_INVALID" });
    expect(parametricReviewInstance(node(), null)).toMatchObject({ ok: false, code: "PARAM_IDENTITY_INVALID" });
  });
  it("the teacher sample uses the PREVIEW namespace (never an official seed) and shows values, the rendered stem and the sample answer", () => {
    expect(previewParametricSample(node(), 1)).toEqual({ ok: true, sample: 1, values: { a: 7, b: 15 }, text: "احسب ناتج ضرب 7 في 15.", expected: 105, issues: [] });
    expect(previewParametricSample(node(), 3)).toMatchObject({ ok: true, values: { a: 8, b: 12 }, expected: 96 });
    const noKey = previewParametricSample(node({ answer: {} }), 2);
    expect(noKey).toMatchObject({ ok: true, values: { a: 8, b: 17 }, expected: null });
    expect(previewParametricSample(node({ parametric: { ...clone(CFG), constraints: ["a > b + 100"] } }), 1)).toMatchObject({ ok: false });
  });
  it("networking readiness: usable hosts of a generated prefix with numeric formulas only (no IPv4 hacks in the generic language)", () => {
    const net = { examQuestionId: "net1", presentationType: "parametricNumeric", questionTypeVersion: 1, marks: 2, text: "شبكة ببادئة ‎/{{p}}‎. كم عنوانًا قابلًا للاستخدام للأجهزة فيها؟", parametric: { v: 1, generatorVersion: 1, variables: [{ id: "p", kind: "int", min: 24, max: 30, step: 1 }], constraints: [], response: { unit: "none" } }, answer: { expression: "2 ^ (32 - p) - 2", mode: "tolerance", tolerance: 0 } };
    expect(validateParametricNumericQuestion(net)).toEqual([]);
    expect(previewParametricSample(net, 2)).toMatchObject({ values: { p: 26 }, expected: 62 });
    expect(scoreParametricNumeric({ question: net, response: num("2"), maxMarks: 2, identity: { ...ID, questionKey: "net2" } })).toMatchObject({ score: 2, correct: true });
  });
  it("the question model is pure: no React / DOM / I/O / eval; randomness only through the engine", () => {
    const src = fs.readFileSync(path.join(repo, "src/parametricNumericQuestion.ts"), "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).not.toMatch(/from "react|document\.|window\.|fetch\(|Math\.random|Date\.|\beval\s*\(|new Function|import\(/);
  });
});
