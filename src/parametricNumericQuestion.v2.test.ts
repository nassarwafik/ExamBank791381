import { describe, expect, it } from "vitest";
import {
  bindParametricNumericAnswer, defaultParametricNumericConfig, parametricReviewInstance, previewParametricSample, previewParametricSamples, projectParametricNumericForStudent,
  readParametricStudentProjection, scoreParametricNumeric, upgradeParametricConfigToV2, validateParametricNumericAnswerKey, validateParametricNumericConfig, validateParametricNumericQuestion
} from "./parametricNumericQuestion";

// Phase 19C — parametricNumeric@1 with the v2 CONTRACT (config v 2, generatorVersion 2): explicit integer / decimal variables,
// derived values, constraints over base + derived values, the language-2 functions and presentation formats. The v1 contract of
// Phase 19B is dispatched to its frozen code path (exact replay). Grading rule (explicit): the official expected value is ALWAYS
// computed from the exact official values (base + derived), never from a formatted string; formats change only the text, and the
// student's number is compared with the answer expression's value as written (no hidden rescaling — a percentage question
// writes `100 * correct / total`). Pins come from an independent reference of generator v2. Fail-first on 751003f.
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const PHYS = { v: 2, generatorVersion: 2, variables: [{ id: "d", kind: "decimal", min: 10, max: 50, step: 0.5 }, { id: "t", kind: "decimal", min: 2, max: 8, step: 0.25 }], derivedVariables: [{ id: "speed", expression: "d / t", format: { kind: "fixed", decimals: 2 } }], constraints: [], response: { unit: "label", label: "م/ث" } };
const phys = (over: Record<string, unknown> = {}) => ({ examQuestionId: "q1", presentationType: "parametricNumeric", questionTypeVersion: 1, text: "قطع جسم {{d}} مترًا في {{t}} ثانية. ما متوسط سرعته؟", marks: 3, parametric: clone(PHYS), answer: { expression: "speed", mode: "tolerance", tolerance: 0.01 }, ...over });
const RECT = { v: 2, generatorVersion: 2, variables: [{ id: "a", kind: "integer", min: 2, max: 10 }, { id: "b", kind: "integer", min: 3, max: 12 }], derivedVariables: [{ id: "area", expression: "a * b" }], constraints: ["a != b"], response: { unit: "none" } };
const rect = (over: Record<string, unknown> = {}) => ({ examQuestionId: "r1", presentationType: "parametricNumeric", questionTypeVersion: 1, text: "مستطيل طوله {{a}} سم وعرضه {{b}} سم. احسب مساحته.", marks: 2, parametric: clone(RECT), answer: { expression: "area", mode: "tolerance", tolerance: 0 }, ...over });
const PCT = { v: 2, generatorVersion: 2, variables: [{ id: "total", kind: "integer", min: 10, max: 40 }, { id: "correct", kind: "integer", min: 0, max: 40 }], derivedVariables: [], constraints: ["correct <= total"], response: { unit: "label", label: "%" } };
const pct = () => ({ examQuestionId: "p1", presentationType: "parametricNumeric", questionTypeVersion: 1, text: "أجاب طالب عن {{correct}} من {{total}} سؤالًا إجابة صحيحة. ما النسبة المئوية للإجابات الصحيحة؟", marks: 2, parametric: clone(PCT), answer: { expression: "100 * correct / total", mode: "tolerance", tolerance: 0.05 } });
const V1 = { examQuestionId: "q1", presentationType: "parametricNumeric", questionTypeVersion: 1, text: "احسب ناتج ضرب {{a}} في {{b}}.", marks: 4, parametric: { v: 1, generatorVersion: 1, variables: [{ id: "a", kind: "int", min: 2, max: 10, step: 1 }, { id: "b", kind: "int", min: 5, max: 20, step: 1 }], constraints: ["a < b"], response: { unit: "none" } }, answer: { expression: "a * b", mode: "tolerance", tolerance: 0 } };
const ID = (over: Record<string, unknown> = {}) => ({ assignmentId: "asg-19c", studentId: "stu-1", attemptNumber: 1, questionKey: "q1", ...over });
const num = (value: unknown, extra: Record<string, unknown> = {}) => ({ kind: "numeric", value, ...extra });
const score = (n: Record<string, unknown>, response: unknown, identity: unknown) => scoreParametricNumeric({ question: n, response, maxMarks: 3, identity });
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const vq = (n: Record<string, unknown>) => validateParametricNumericQuestion(n).map(i => i.code);

describe("19C contract — version dispatch and v1 replay compatibility", () => {
  it("a v1 (Phase 19B) question replays EXACTLY: same projection, grade, review instance and sample as the 19B pins", () => {
    const id = { assignmentId: "asg-19b", studentId: "stu-1", attemptNumber: 1, questionKey: "q1" };
    expect(projectParametricNumericForStudent(V1, id)).toEqual({ text: "احسب ناتج ضرب 2 في 13.", parametric: { v: 1, status: "ready", generatorVersion: 1, values: { a: 2, b: 13 }, response: { unit: "none" } } });
    expect(scoreParametricNumeric({ question: V1, response: num("26"), maxMarks: 4, identity: id })).toEqual({ score: 4, correct: true, manualReview: false });
    expect(parametricReviewInstance(V1, id)).toEqual({ ok: true, generatorVersion: 1, seedDigest: "896b187e1b0615f2313ff4fd48a8a628", identity: id, values: { a: 2, b: 13 }, text: "احسب ناتج ضرب 2 في 13.", expected: 26 });
    expect(previewParametricSample(V1, 1)).toEqual({ ok: true, sample: 1, values: { a: 7, b: 15 }, text: "احسب ناتج ضرب 7 في 15.", expected: 105, issues: [] });
  });
  it("versions are explicit and never mixed: v1 refuses v2 features, v2 refuses the v1 generator, unknown versions fail closed", () => {
    const c = (raw: unknown) => codes(validateParametricNumericConfig(raw));
    expect(c({ ...clone(V1.parametric), derivedVariables: [] })).toEqual(["PARAM_CONFIG_UNKNOWN_KEY"]);
    expect(c({ ...clone(V1.parametric), variables: [{ id: "a", kind: "integer", min: 1, max: 2, step: 1 }] })).toEqual(["PARAM_VAR_KIND_UNSUPPORTED"]);
    expect(codes(validateParametricNumericAnswerKey({ expression: "sqrt(a)", mode: "tolerance", tolerance: 0 }, V1.parametric))).toEqual(["PARAM_ANSWER_EXPRESSION_INVALID"]);
    expect(c({ ...clone(PHYS), generatorVersion: 1 })).toEqual(["PARAM_CONFIG_VERSION"]);
    expect(c({ ...clone(PHYS), v: 3, generatorVersion: 3 })).toEqual(["PARAM_CONFIG_VERSION"]);
    expect(c(PHYS)).toEqual([]);
    expect(score(phys({ parametric: { ...clone(PHYS), generatorVersion: 1 } }), num("8.53"), ID())).toEqual({ score: 0, correct: false, manualReview: true });
  });
  it("new questions default to the v2 contract; an explicit upgrade turns a v1 draft into v2 (never during replay)", () => {
    expect(defaultParametricNumericConfig()).toEqual({ v: 2, generatorVersion: 2, variables: [{ id: "a", kind: "integer", min: 1, max: 10, step: 1 }, { id: "b", kind: "integer", min: 1, max: 10, step: 1 }], derivedVariables: [], constraints: [], response: { unit: "none" } });
    const up = upgradeParametricConfigToV2(V1.parametric);
    expect(up).toEqual({ v: 2, generatorVersion: 2, variables: [{ id: "a", kind: "integer", min: 2, max: 10, step: 1 }, { id: "b", kind: "integer", min: 5, max: 20, step: 1 }], derivedVariables: [], constraints: ["a < b"], response: { unit: "none" } });
    expect(vq({ ...clone(V1), parametric: up })).toEqual([]);
    expect(upgradeParametricConfigToV2(PHYS)).toEqual(PHYS);
    expect(upgradeParametricConfigToV2({ v: 1, junk: true })).toBeNull();
  });
});

describe("19C contract — v2 configuration, derived values, constraints, formats", () => {
  it("valid v2 configs; derived values and constraints validated against base + derived symbols", () => {
    expect(vq(phys())).toEqual([]); expect(vq(rect())).toEqual([]); expect(vq(pct())).toEqual([]);
    const c = (over: Record<string, unknown>) => codes(validateParametricNumericConfig({ ...clone(RECT), ...over }));
    expect(c({ derivedVariables: [{ id: "area", expression: "area + 1" }] })).toEqual(["PARAM_DERIVED_SELF_REFERENCE"]);
    expect(c({ derivedVariables: [{ id: "x", expression: "y" }, { id: "y", expression: "x" }] })).toEqual(["PARAM_DERIVED_CYCLE"]);
    expect(c({ derivedVariables: [{ id: "a", expression: "b" }] })).toEqual(["PARAM_DERIVED_COLLISION"]);
    expect(c({ derivedVariables: [{ id: "x", expression: "zz * 2" }] })).toEqual(["PARAM_DERIVED_UNKNOWN_REFERENCE"]);
    expect(c({ constraints: ["area < 50"] })).toEqual([]);
    expect(c({ constraints: ["sqrt(area) > 3"] })).toEqual([]);
    expect(c({ constraints: ["perimeter > 3"] })).toEqual(["PARAM_CONSTRAINT_UNKNOWN_VARIABLE"]);
    expect(c({ constraints: ["a > b && b > 1"] })).toEqual(["PARAM_CONSTRAINT_INVALID"]);
    expect(c({ variables: [{ id: "a", kind: "decimal", min: 0, max: 1, step: 0.3 }, { id: "b", kind: "integer", min: 3, max: 12 }] })).toEqual(["PARAM_VAR_STEP_MISALIGNED"]);
    expect(c({ derivedVariables: [{ id: "x", expression: "a", format: { kind: "fixed", decimals: 20 } }] })).toEqual(["PARAM_FORMAT_INVALID"]);
    expect(c({ hiddenAnswer: 80 })).toEqual(["PARAM_CONFIG_UNKNOWN_KEY"]);
  });
  it("answer expressions may use derived values and the language-2 functions; templates may show derived values", () => {
    expect(codes(validateParametricNumericAnswerKey({ expression: "sqrt(area)", mode: "tolerance", tolerance: 0.01 }, RECT))).toEqual([]);
    expect(codes(validateParametricNumericAnswerKey({ expression: "perimeter", mode: "tolerance", tolerance: 0 }, RECT))).toEqual(["PARAM_ANSWER_UNKNOWN_VARIABLE"]);
    expect(codes(validateParametricNumericAnswerKey({ expression: "cbrt(area)", mode: "tolerance", tolerance: 0 }, RECT))).toEqual(["PARAM_ANSWER_EXPRESSION_INVALID"]);
    expect(vq(rect({ text: "مساحة {{area}} — احسب {{a}}" }))).toEqual([]);
    expect(vq(rect({ answer: { expression: "log(a - a)", mode: "tolerance", tolerance: 0 } }))).toEqual(["PARAM_SAMPLE_ANSWER_FAILED"]);
    expect(vq(rect({ parametric: { ...clone(RECT), constraints: ["area > 1000"] } }))).toEqual(["PARAM_SAMPLE_GENERATION_FAILED"]);
  });
});

describe("19C contract — grading semantics (exact values, formats are display only)", () => {
  it("physics (decimals + derived, pinned d=32, t=3.75): the expected value is d / t from the EXACT values", () => {
    const p = projectParametricNumericForStudent(phys(), ID());
    expect(p).toEqual({ text: "قطع جسم 32 مترًا في 3.75 ثانية. ما متوسط سرعته؟", parametric: { v: 1, status: "ready", generatorVersion: 2, values: { d: 32, t: 3.75 }, response: { unit: "label", label: "م/ث" } } });
    expect(score(phys(), num("8.53"), ID())).toMatchObject({ score: 3, correct: true });
    expect(score(phys(), num("8.5"), ID())).toMatchObject({ score: 0, correct: false, manualReview: false });
  });
  it("display / grading distinction: t shown rounded to 3.8 still grades against the exact 3.75 (32 / 3.8 = 8.42 is wrong)", () => {
    const shown = phys({ parametric: { ...clone(PHYS), variables: [{ id: "d", kind: "decimal", min: 10, max: 50, step: 0.5 }, { id: "t", kind: "decimal", min: 2, max: 8, step: 0.25, format: { kind: "fixed", decimals: 1 } }] } });
    expect(projectParametricNumericForStudent(shown, ID()).text).toBe("قطع جسم 32 مترًا في 3.8 ثانية. ما متوسط سرعته؟");
    expect(score(shown, num("8.53"), ID())).toMatchObject({ correct: true });
    expect(score(shown, num("8.42"), ID())).toMatchObject({ correct: false });
    const shownDerived = phys({ text: "السرعة التقريبية {{speed}} م/ث لمسافة {{d}} م. احسب الزمن.", answer: { expression: "t", mode: "tolerance", tolerance: 0 } });
    expect(projectParametricNumericForStudent(shownDerived, ID()).text).toBe("السرعة التقريبية 8.53 م/ث لمسافة 32 م. احسب الزمن.");
    expect(score(shownDerived, num("3.75"), ID())).toMatchObject({ correct: true });
  });
  it("mathematics (pinned rectangle r1: first candidate violates a != b, second 8 × 10) and the next attempt (5 × 12)", () => {
    expect(projectParametricNumericForStudent(rect(), ID({ questionKey: "r1" })).text).toBe("مستطيل طوله 8 سم وعرضه 10 سم. احسب مساحته.");
    expect(score(rect(), num("80"), ID({ questionKey: "r1" }))).toMatchObject({ correct: true });
    expect(projectParametricNumericForStudent(rect(), ID({ questionKey: "r1", attemptNumber: 2 })).text).toBe("مستطيل طوله 5 سم وعرضه 12 سم. احسب مساحته.");
    expect(score(rect(), num("80"), ID({ questionKey: "r1", attemptNumber: 2 }))).toMatchObject({ correct: false });
  });
  it("percentage (pinned 5 of 27): the answer is the expression's value as written — 18.5 within 0.05, never a rescaled 0.185", () => {
    expect(projectParametricNumericForStudent(pct(), ID({ questionKey: "p1" })).text).toBe("أجاب طالب عن 5 من 27 سؤالًا إجابة صحيحة. ما النسبة المئوية للإجابات الصحيحة؟");
    expect(score(pct(), num("18.5"), ID({ questionKey: "p1" }))).toMatchObject({ correct: true });
    expect(score(pct(), num("0.185"), ID({ questionKey: "p1" }))).toMatchObject({ correct: false });
  });
  it("networking-style arithmetic keeps working in v2 (pinned p = 30 ⇒ 2 usable hosts) — no IPv4 parsing in the generic engine", () => {
    const net = { examQuestionId: "n1", presentationType: "parametricNumeric", questionTypeVersion: 1, marks: 2, text: "شبكة ببادئة /{{p}}. كم عنوانًا قابلًا للاستخدام؟", parametric: { v: 2, generatorVersion: 2, variables: [{ id: "p", kind: "integer", min: 24, max: 30 }], derivedVariables: [{ id: "hosts", expression: "2 ^ (32 - p) - 2" }], constraints: [], response: { unit: "none" } }, answer: { expression: "hosts", mode: "tolerance", tolerance: 0 } };
    expect(vq(net)).toEqual([]);
    expect(score(net, num("2"), ID({ questionKey: "n1" }))).toMatchObject({ correct: true });
  });
  it("forged client seed / values / derived / format / version overrides never change the grade; binding drops them", () => {
    const forged = { values: { d: 10, t: 1 }, derived: { speed: 10 }, format: { kind: "fixed", decimals: 0 }, generatorVersion: 1, v: 1, seed: '["smartassess.parametric",2,"official","asg-19c","stu-1",2,"q1"]', expected: 10 };
    expect(score(phys(), num("10", forged), ID())).toMatchObject({ score: 0, correct: false });
    expect(score(phys(), num("20.75", forged), ID())).toMatchObject({ score: 0, correct: false });             // the forged seed's (attempt 2) answer
    expect(score(phys(), num("8.53", forged), ID())).toMatchObject({ score: 3, correct: true });
    expect(bindParametricNumericAnswer(num("8.53", forged))).toEqual({ ok: true, answer: { kind: "numeric", value: "8.53" } });
  });
  it("invalid published v2 authority fails closed to manual review", () => {
    for (const n of [phys({ parametric: { ...clone(PHYS), derivedVariables: [{ id: "speed", expression: "speed" }] } }), phys({ parametric: { ...clone(PHYS), derivedVariables: [{ id: "speed", expression: "cbrt(d)" }] } }), phys({ answer: { expression: "speed", mode: "tolerance", tolerance: 0.01, display: "x" } }), phys({ parametric: { ...clone(PHYS), derivedVariables: [{ id: "speed", expression: "log(d - d)" }] } })])
      expect(score(n, num("8.53"), ID())).toEqual({ score: 0, correct: false, manualReview: true });
  });
});

describe("19C contract — student secrecy and teacher-only inspection", () => {
  it("the student projection carries no formulas, derived values the stem does not show, constraints or expected values", () => {
    const p = projectParametricNumericForStudent(rect(), ID({ questionKey: "r1" }));
    expect(JSON.stringify(p)).not.toMatch(/a \* b|"derivedVariables"|"area"|\b80\b|a != b|"expression"|"constraints"|"tolerance"/);
    expect(readParametricStudentProjection(p.parametric)).toEqual(p.parametric);
    expect(readParametricStudentProjection({ ...p.parametric, derived: { area: 80 } })).toBeNull();
  });
  it("teacher samples: 3 / 5 / 10 PREVIEW-namespace instances with values, derived values, constraint evaluation and the expected value", () => {
    const s = previewParametricSamples(rect(), 3);
    expect(s.ok).toBe(true);
    expect(s.ok && s.samples.map(x => (x.ok ? [x.values.a, x.values.b, x.derived.area, x.expected, x.candidate] : null))).toEqual([[5, 9, 45, 45, 1], [5, 8, 40, 40, 1], [9, 6, 54, 54, 1]]);
    expect(s.ok && s.samples[0]).toMatchObject({ ok: true, sample: 1, text: "مستطيل طوله 5 سم وعرضه 9 سم. احسب مساحته.", constraints: [{ source: "a != b", left: 5, right: 9, holds: true }], expression: "area", policy: { mode: "tolerance", tolerance: 0 } });
    expect(previewParametricSamples(rect(), 10).ok && (previewParametricSamples(rect(), 10) as { samples: { ok: boolean; values?: Record<string, number>; candidate?: number }[] }).samples.map(x => (x.ok ? [x.values!.a, x.values!.b, x.candidate] : null))).toEqual([[5, 9, 1], [5, 8, 1], [9, 6, 1], [6, 3, 1], [6, 3, 1], [5, 6, 1], [4, 5, 1], [8, 3, 1], [5, 9, 2], [5, 6, 1]]);
    expect(previewParametricSamples(rect(), 5).ok && (previewParametricSamples(rect(), 5) as { samples: unknown[] }).samples.length).toBe(5);
    expect(previewParametricSamples(rect(), 7).ok && (previewParametricSamples(rect(), 7) as { samples: unknown[] }).samples.length).toBe(3);   // only 3 / 5 / 10
    const ph = previewParametricSamples(phys(), 5);
    expect(ph.ok && ph.samples.map(x => (x.ok ? [x.values.d, x.values.t, x.derived.speed] : null))).toEqual([[44, 2.5, 17.6], [39.5, 3, 13.166666666666666], [32, 5.25, 6.095238095238095], [11, 6.25, 1.76], [11.5, 4.75, 2.4210526315789473]]);
  });
  it("the review instance of a v2 attempt adds derived values and constraint evaluation (teacher only); same authority as grading", () => {
    expect(parametricReviewInstance(phys(), ID())).toEqual({ ok: true, generatorVersion: 2, seedDigest: "7ddbf2fb1401d717e72f9663f92d286a", identity: ID(), values: { d: 32, t: 3.75 }, derived: { speed: 8.533333333333333 }, text: "قطع جسم 32 مترًا في 3.75 ثانية. ما متوسط سرعته؟", expected: 8.533333333333333, constraints: [] });
    expect(parametricReviewInstance(rect(), ID({ questionKey: "r1" }))).toMatchObject({ ok: true, values: { a: 8, b: 10 }, derived: { area: 80 }, expected: 80, constraints: [{ source: "a != b", left: 8, right: 10, holds: true }] });
  });
});
