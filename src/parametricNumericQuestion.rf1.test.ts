import { describe, expect, it } from "vitest";
import { PARAMETRIC_LIMITS } from "./parametricEngine";
import { parametricReviewInstance, projectParametricNumericForStudent, readParametricStudentProjection, scoreParametricNumeric, validateParametricNumericQuestion } from "./parametricNumericQuestion";

// Phase 19C — Independent Review Fix 1.
//   RF1: a display format must not become a hidden-precision side channel. The student projection may only carry what the rendered
//        stem shows (t = 3.75 shown as "3.8" ⇒ the payload never contains 3.75), while grading, the teacher review and the teacher
//        samples keep the EXACT server-owned values.
//   RF2: the student projection reader must accept every projection a valid published question produces — a v2 template may show
//        up to 20 base + 20 derived symbols — and still reject anything above that explicit bound or with unsafe keys.
// Fail-first on 3c85e17. Pins: identity asg-19c / stu-1 / 1 / q1 ⇒ d = 32, t = 3.75 (speed 8.533…); p1 ⇒ correct = 5, total = 27.
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const D = { id: "d", kind: "decimal", min: 10, max: 50, step: 0.5 }, T = { id: "t", kind: "decimal", min: 2, max: 8, step: 0.25 };
const PHYS = { v: 2, generatorVersion: 2, variables: [D, T], derivedVariables: [{ id: "speed", expression: "d / t", format: { kind: "fixed", decimals: 2 } }], constraints: [], response: { unit: "label", label: "م/ث" } };
const phys = (over: Record<string, unknown> = {}, parametric: Record<string, unknown> = {}) => ({ examQuestionId: "q1", presentationType: "parametricNumeric", questionTypeVersion: 1, text: "قطع جسم {{d}} مترًا في {{t}} ثانية. ما متوسط سرعته؟", marks: 3, parametric: { ...clone(PHYS), ...parametric }, answer: { expression: "speed", mode: "tolerance", tolerance: 0.01 }, ...over });
const ID = (over: Record<string, unknown> = {}) => ({ assignmentId: "asg-19c", studentId: "stu-1", attemptNumber: 1, questionKey: "q1", ...over });
const num = (value: string) => ({ kind: "numeric", value });
const score = (n: Record<string, unknown>, value: string, id = ID()) => scoreParametricNumeric({ question: n, response: num(value), maxMarks: 3, identity: id });
const T_FIXED_1 = { variables: [D, { ...T, format: { kind: "fixed", decimals: 1 } }] };
const RESPONSE = { unit: "label", label: "م/ث" };

describe("19C RF1 — the student projection never reveals precision the stem does not show", () => {
  it("base variable, fixed 1: exact t = 3.75 is shown as 3.8; the payload carries 3.8, never 3.75; grading uses 3.75", () => {
    const n = phys({}, T_FIXED_1);
    const p = projectParametricNumericForStudent(n, ID());
    expect(p.text).toBe("قطع جسم 32 مترًا في 3.8 ثانية. ما متوسط سرعته؟");
    expect(p.parametric).toEqual({ v: 1, status: "ready", generatorVersion: 2, values: { d: 32, t: 3.8 }, response: RESPONSE });
    expect(JSON.stringify(p)).not.toMatch(/3\.75/);
    expect(readParametricStudentProjection(p.parametric)).toEqual(p.parametric);
    expect(score(n, "8.53")).toEqual({ score: 3, correct: true, manualReview: false });        // 32 / 3.75
    expect(score(n, "8.42")).toMatchObject({ score: 0, correct: false });                    // 32 / 3.8 (the displayed value) is wrong
  });
  it("the teacher review keeps the EXACT values of the same attempt (teacher only)", () => {
    expect(parametricReviewInstance(phys({}, T_FIXED_1), ID())).toMatchObject({ ok: true, values: { d: 32, t: 3.75 }, derived: { speed: 8.533333333333333 }, expected: 8.533333333333333 });
  });
  it("derived value, fixed 2, shown in the stem: the payload carries 8.53, never 8.533…; the exact derived value still grades", () => {
    const n = phys({ text: "السرعة التقريبية {{speed}} م/ث لمسافة {{d}} م. احسب الزمن.", answer: { expression: "t", mode: "tolerance", tolerance: 0 } });
    const p = projectParametricNumericForStudent(n, ID());
    expect(p.text).toBe("السرعة التقريبية 8.53 م/ث لمسافة 32 م. احسب الزمن.");
    expect(p.parametric).toEqual({ v: 1, status: "ready", generatorVersion: 2, values: { speed: 8.53, d: 32 }, response: RESPONSE });
    expect(JSON.stringify(p)).not.toMatch(/8\.533|3\.75/);
    expect(score(n, "3.75")).toMatchObject({ score: 3, correct: true });
    expect(parametricReviewInstance(n, ID())).toMatchObject({ derived: { speed: 8.533333333333333 } });
  });
  it("derived value, plain (12 significant digits in the stem): the payload carries the 12-digit value, never the full float", () => {
    const n = phys({ text: "السرعة {{speed}} م/ث لمسافة {{d}} م. احسب الزمن.", answer: { expression: "t", mode: "tolerance", tolerance: 0 } }, { derivedVariables: [{ id: "speed", expression: "d / t" }] });
    const p = projectParametricNumericForStudent(n, ID());
    expect(p.text).toBe("السرعة 8.53333333333 م/ث لمسافة 32 م. احسب الزمن.");
    expect(p.parametric).toMatchObject({ values: { speed: 8.53333333333, d: 32 } });
    expect(JSON.stringify(p)).not.toMatch(/8\.533333333333/);
    expect(score(n, "3.75")).toMatchObject({ correct: true });
  });
  it("derived value, percentage 1: 5 / 27 is shown as 18.5% ⇒ the payload carries 0.185 (same units, displayed precision), never 0.185185…", () => {
    const n = { examQuestionId: "p1", presentationType: "parametricNumeric", questionTypeVersion: 1, marks: 2, text: "نسبة النجاح {{ratio}} من {{total}} طالبًا. كم طالبًا نجح؟", parametric: { v: 2, generatorVersion: 2, variables: [{ id: "total", kind: "integer", min: 10, max: 40 }, { id: "correct", kind: "integer", min: 0, max: 40 }], derivedVariables: [{ id: "ratio", expression: "correct / total", format: { kind: "percentage", decimals: 1 } }], constraints: ["correct <= total"], response: { unit: "none" } }, answer: { expression: "correct", mode: "tolerance", tolerance: 0 } };
    expect(validateParametricNumericQuestion(n)).toEqual([]);
    const p = projectParametricNumericForStudent(n, ID({ questionKey: "p1" }));
    expect(p.text).toBe("نسبة النجاح 18.5% من 27 طالبًا. كم طالبًا نجح؟");
    expect(p.parametric).toMatchObject({ values: { ratio: 0.185, total: 27 } });
    expect(JSON.stringify(p)).not.toMatch(/0\.1851|18\.51/);
    expect(score(n, "5", ID({ questionKey: "p1" }))).toMatchObject({ correct: true });
    expect(parametricReviewInstance(n, ID({ questionKey: "p1" }))).toMatchObject({ derived: { ratio: 0.18518518518518517 } });
  });
  it("security: no formulas, constraints, expected answers, undisplayed derived values or hidden raw precision ever reach the student", () => {
    const n = phys({ text: "قطع جسم {{d}} مترًا في {{t}} ثانية بسرعة تقريبية {{speed}} م/ث. ما نصف المسافة؟", answer: { expression: "half", mode: "tolerance", tolerance: 0 } }, { ...T_FIXED_1, derivedVariables: [{ id: "speed", expression: "d / t", format: { kind: "fixed", decimals: 2 } }, { id: "half", expression: "d / 2" }], constraints: ["speed > 1"] });
    expect(validateParametricNumericQuestion(n)).toEqual([]);
    const p = projectParametricNumericForStudent(n, ID());
    expect(p.text).toBe("قطع جسم 32 مترًا في 3.8 ثانية بسرعة تقريبية 8.53 م/ث. ما نصف المسافة؟");
    expect(Object.keys((p.parametric as { values: Record<string, number> }).values).sort()).toEqual(["d", "speed", "t"]);
    expect(JSON.stringify(p)).not.toMatch(/d \/ t|d \/ 2|speed > 1|"half"|\b16\b|"expression"|"constraints"|"derivedVariables"|"tolerance"|"format"|"decimals"|8\.533|3\.75/);
    expect(score(n, "16")).toMatchObject({ correct: true });
  });
  it("v1 (Phase 19B) projections are unchanged (integers: the displayed text IS the value)", () => {
    const V1 = { examQuestionId: "q1", presentationType: "parametricNumeric", questionTypeVersion: 1, text: "احسب ناتج ضرب {{a}} في {{b}}.", marks: 4, parametric: { v: 1, generatorVersion: 1, variables: [{ id: "a", kind: "int", min: 2, max: 10, step: 1 }, { id: "b", kind: "int", min: 5, max: 20, step: 1 }], constraints: ["a < b"], response: { unit: "none" } }, answer: { expression: "a * b", mode: "tolerance", tolerance: 0 } };
    expect(projectParametricNumericForStudent(V1, ID({ assignmentId: "asg-19b" }))).toEqual({ text: "احسب ناتج ضرب 2 في 13.", parametric: { v: 1, status: "ready", generatorVersion: 1, values: { a: 2, b: 13 }, response: { unit: "none" } } });
  });
});

// RF2 — a valid v2 question with up to 20 base + 20 derived symbols, all shown in the stem.
const big = (nBase: number, nDerived: number, shown: string[]) => ({
  examQuestionId: "g1", presentationType: "parametricNumeric", questionTypeVersion: 1, marks: 1, text: "القيم: " + shown.map(s => "{{" + s + "}}").join(" ، "),
  parametric: { v: 2, generatorVersion: 2, variables: Array.from({ length: nBase }, (_, i) => ({ id: "x" + (i + 1), kind: "integer", min: 1, max: 5 })), derivedVariables: Array.from({ length: nDerived }, (_, i) => ({ id: "y" + (i + 1), expression: "x1 + " + (i + 1) })), constraints: [], response: { unit: "none" } },
  answer: { expression: "x1", mode: "tolerance", tolerance: 0 }
});
const xs = (n: number) => Array.from({ length: n }, (_, i) => "x" + (i + 1)), ys = (n: number) => Array.from({ length: n }, (_, i) => "y" + (i + 1));
const delivered = (n: Record<string, unknown>) => projectParametricNumericForStudent(n, ID({ questionKey: "g1" })).parametric as { status: string; values?: Record<string, number> };
const synthetic = (count: number, generatorVersion = 2) => ({ v: 1, status: "ready", generatorVersion, values: Object.fromEntries(Array.from({ length: count }, (_, i) => ["s" + i, i])), response: { unit: "none" } });

describe("19C RF2 — the student projection reader covers every valid v2 projection, with an explicit bound", () => {
  it("the maximum a valid v2 stem can show is 20 base + 20 derived = 40 symbols", () => {
    expect(PARAMETRIC_LIMITS.variables + PARAMETRIC_LIMITS.derivedVariables).toBe(40);
  });
  it("exactly 20 visible symbols: projected and read back", () => {
    const n = big(20, 1, xs(20));
    expect(validateParametricNumericQuestion(n)).toEqual([]);
    const p = delivered(n);
    expect(p.status).toBe("ready"); expect(Object.keys(p.values!)).toHaveLength(20);
    expect(readParametricStudentProjection(p)).toEqual(p);
  });
  it("21 visible symbols (20 base + 1 derived) in a valid v2 question: projected by the server AND accepted by the reader", () => {
    const n = big(20, 1, [...xs(20), "y1"]);
    expect(validateParametricNumericQuestion(n)).toEqual([]);
    const p = delivered(n);
    expect(p.status).toBe("ready"); expect(Object.keys(p.values!)).toHaveLength(21); expect(p.values!.y1).toBe(p.values!.x1 + 1);
    expect(readParametricStudentProjection(p)).toEqual(p);
  });
  it("the maximum (40 visible symbols: 20 base + 20 derived) is projected and accepted", () => {
    const n = big(20, 20, [...xs(20), ...ys(20)]);
    expect(validateParametricNumericQuestion(n)).toEqual([]);
    const p = delivered(n);
    expect(p.status).toBe("ready"); expect(Object.keys(p.values!)).toHaveLength(40);
    expect(readParametricStudentProjection(p)).toEqual(p);
    expect(readParametricStudentProjection(synthetic(40))).not.toBeNull();
  });
  it("one above the maximum is rejected; generator 1 keeps its 20-symbol bound", () => {
    expect(readParametricStudentProjection(synthetic(41))).toBeNull();
    expect(readParametricStudentProjection(synthetic(1000))).toBeNull();
    expect(readParametricStudentProjection(synthetic(20, 1))).not.toBeNull();
    expect(readParametricStudentProjection(synthetic(21, 1))).toBeNull();
  });
  it("malformed or prototype-sensitive keys and non-finite values stay rejected", () => {
    const ok = synthetic(2);
    for (const values of [JSON.parse('{"__proto__": 1}'), { constructor: 1 }, { prototype: 1 }, { "1x": 1 }, { "a b": 1 }, { "": 1 }, { a: Number.NaN }, { a: Number.POSITIVE_INFINITY }, { a: "3" }, { a: null }, [1, 2], null])
      expect(readParametricStudentProjection({ ...ok, values }), JSON.stringify(values)).toBeNull();
    expect(readParametricStudentProjection({ ...ok, extra: 1 })).toBeNull();
    expect(readParametricStudentProjection(ok)).toEqual(ok);
  });
});
