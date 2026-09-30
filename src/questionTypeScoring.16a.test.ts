import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scoreMultipleSelect, scoreNumericResponse, parseNumericInput, normalizeUnit, scoreMatrix, scoreCategorization, NUMERIC_EPSILON } from "./questionTypeScoring";
import { validateQuestionTypeNode } from "./questionTypeValidation";
import { answered } from "./answerState";

// Phase 16A — A5/A6 Multiple Select · A7/A8/A9 Numeric · A10 Matrix · A11 Categorization: deterministic formulas, boundaries,
// stable identities, invalid configuration rejected. Pure module — the same code is compiled for the server grader.
// Fail-first on 6468cc7 (no scoring module).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("16A A5 / A6 — Multiple Select", () => {
  const ids = ["a", "b", "c", "d"], correct = ["a", "c"];
  const run = (selected: unknown, scoring: "allOrNothing" | "partialNoPenalty" | "partialWithPenalty", max = 4) => scoreMultipleSelect({ optionIds: ids, correctOptionIds: correct, selectedOptionIds: selected, scoring, maxMarks: max });
  it("allOrNothing: full marks only for the exact correct set", () => {
    expect(run(["a", "c"], "allOrNothing").score).toBe(4); expect(run(["c", "a"], "allOrNothing").score).toBe(4);
    expect(run(["a"], "allOrNothing").score).toBe(0); expect(run(["a", "c", "b"], "allOrNothing").score).toBe(0);
    expect(run(["a", "c"], "allOrNothing").correct).toBe(true); expect(run(["a"], "allOrNothing").correct).toBe(false);
  });
  it("partialNoPenalty: |S∩C| / |C| × marks — wrong picks cost nothing, score never exceeds max", () => {
    expect(run(["a"], "partialNoPenalty").score).toBe(2); expect(run(["a", "b", "d"], "partialNoPenalty").score).toBe(2);
    expect(run(["a", "c", "b", "d"], "partialNoPenalty").score).toBe(4); expect(run(["b"], "partialNoPenalty").score).toBe(0);
  });
  it("partialWithPenalty: max(0, (|S∩C| − |S∖C|) / |C|) × marks — never negative, never above max", () => {
    expect(run(["a", "c"], "partialWithPenalty").score).toBe(4); expect(run(["a", "b"], "partialWithPenalty").score).toBe(0);
    expect(run(["a", "c", "b"], "partialWithPenalty").score).toBe(2); expect(run(["b", "d"], "partialWithPenalty").score).toBe(0);
    expect(run(["a", "b", "d"], "partialWithPenalty").score).toBe(0);                                  // (1 − 2)/2 < 0 → 0
    for (const s of [["a", "c", "a", "c", "a"], ["a", "c", "zz"]]) { const r = run(s, "partialWithPenalty"); expect(r.score).toBeLessThanOrEqual(4); expect(r.score).toBeGreaterThanOrEqual(0); }
  });
  it("duplicate selections are normalized, invalid option ids are ignored, empty response = unanswered (score 0, not correct), option REORDER never changes correctness", () => {
    expect(run(["a", "a", "c", "c"], "allOrNothing").score).toBe(4);
    expect(run(["a", "c", "nope"], "allOrNothing").score).toBe(4); expect(run(["a", "c", "nope"], "partialWithPenalty").score).toBe(4);
    const empty = run([], "partialNoPenalty"); expect(empty.answered).toBe(false); expect(empty.score).toBe(0); expect(empty.correct).toBe(false);
    expect(run(undefined, "allOrNothing").answered).toBe(false); expect(run("a", "allOrNothing").answered).toBe(false);
    const reordered = scoreMultipleSelect({ optionIds: ["d", "c", "b", "a"], correctOptionIds: correct, selectedOptionIds: ["c", "a"], scoring: "allOrNothing", maxMarks: 4 });
    expect(reordered.score).toBe(4);
    expect(answered({ kind: "multiChoice", optionIds: [] })).toBe(false); expect(answered({ kind: "multiChoice", optionIds: ["a"] })).toBe(true);
  });
  it("configuration: ≥ 2 options with stable unique ids, ≥ 1 correct id that exists, a known scoring mode", () => {
    const ok = { options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], answer: { correctOptionIds: ["a"], scoring: "allOrNothing" } };
    expect(validateQuestionTypeNode(ok, "multipleSelect", 1)).toEqual([]);
    expect(validateQuestionTypeNode({ ...ok, options: [{ id: "a", text: "A" }] }, "multipleSelect", 1).map(i => i.code)).toContain("MS_TOO_FEW_OPTIONS");
    expect(validateQuestionTypeNode({ ...ok, answer: { correctOptionIds: [], scoring: "allOrNothing" } }, "multipleSelect", 1).map(i => i.code)).toContain("MS_NO_CORRECT");
    expect(validateQuestionTypeNode({ ...ok, answer: { correctOptionIds: ["zz"], scoring: "allOrNothing" } }, "multipleSelect", 1).map(i => i.code)).toContain("MS_CORRECT_NOT_OPTION");
    expect(validateQuestionTypeNode({ ...ok, options: [{ id: "a", text: "A" }, { id: "a", text: "B" }] }, "multipleSelect", 1).map(i => i.code)).toContain("MS_DUPLICATE_OPTION_ID");
    expect(validateQuestionTypeNode({ ...ok, answer: { correctOptionIds: ["a"], scoring: "bonus" } }, "multipleSelect", 1).map(i => i.code)).toContain("MS_INVALID_SCORING");
  });
});

describe("16A A7 / A8 / A9 — Numeric Response", () => {
  const tol = (expected: number, tolerance: number, value: string, unit?: string, unitRequired = false, expUnit?: string) => scoreNumericResponse({ answer: { mode: "tolerance", expected, tolerance, unit: expUnit }, unitRequired, response: { kind: "numeric", value, unit }, maxMarks: 3 });
  const range = (min: number, max: number, value: string) => scoreNumericResponse({ answer: { mode: "range", min, max }, unitRequired: false, response: { kind: "numeric", value }, maxMarks: 3 });
  it("parses decimal notation, Arabic-Indic digits, Arabic decimal separators and safe scientific notation — never expressions", () => {
    expect(parseNumericInput("12.5")).toBe(12.5); expect(parseNumericInput(" -0.25 ")).toBe(-0.25); expect(parseNumericInput("1e3")).toBe(1000); expect(parseNumericInput("2.5E-1")).toBe(0.25);
    expect(parseNumericInput("١٢٫٥")).toBe(12.5); expect(parseNumericInput("۳٫۵")).toBe(3.5); expect(parseNumericInput("1,5")).toBe(1.5); expect(parseNumericInput("١٢،٥")).toBe(12.5);
    for (const bad of ["", "abc", "1+1", "2*3", "Math.PI", "1/2", "Infinity", "NaN", "0x10", "1e400", "1.2.3", "--1", null, undefined, {}, []]) expect(parseNumericInput(bad), String(bad)).toBeNull();
  });
  it("tolerance mode: boundaries exactly ON the tolerance are accepted (inclusive, epsilon-safe), just outside is rejected", () => {
    expect(tol(12.5, 0.1, "12.6").score).toBe(3); expect(tol(12.5, 0.1, "12.4").score).toBe(3); expect(tol(12.5, 0.1, "12.5").score).toBe(3);
    expect(tol(1, 0.1, "1.1").score).toBe(3); expect(tol(1, 0.1, "0.9").score).toBe(3);                 // 1.1 − 1 = 0.10000000000000009 in floating point
    expect(tol(12.5, 0.1, "12.61").score).toBe(0); expect(tol(12.5, 0.1, "12.39").score).toBe(0);
    expect(tol(6, 0, "6").score).toBe(3); expect(tol(6, 0, "6.0").score).toBe(3); expect(tol(6, 0, "6.001").score).toBe(0);
    expect(NUMERIC_EPSILON).toBeLessThan(1e-6);
  });
  it("range mode: inclusive boundaries", () => {
    expect(range(10, 12, "10").score).toBe(3); expect(range(10, 12, "12").score).toBe(3); expect(range(10, 12, "11").score).toBe(3);
    expect(range(10, 12, "9.999").score).toBe(0); expect(range(10, 12, "12.001").score).toBe(0);
  });
  it("units: deterministic normalization (NFKC, case, whitespace); required unit missing or different → 0; unit ignored when not required", () => {
    expect(normalizeUnit(" M/S² ")).toBe(normalizeUnit("m/s²")); expect(normalizeUnit("ｋｇ")).toBe("kg");
    expect(tol(9.8, 0.1, "9.8", "m/s²", true, "m/s²").score).toBe(3); expect(tol(9.8, 0.1, "9.8", "M/S²", true, "m/s²").score).toBe(3);
    expect(tol(9.8, 0.1, "9.8", undefined, true, "m/s²").score).toBe(0); expect(tol(9.8, 0.1, "9.8", "km/h", true, "m/s²").score).toBe(0);
    expect(tol(9.8, 0.1, "9.8", "anything", false, "m/s²").score).toBe(3);
  });
  it("empty / non-numeric responses are unanswered or wrong, never an exception; answered() sees a numeric value", () => {
    expect(tol(1, 0, "").answered).toBe(false); expect(tol(1, 0, "abc").score).toBe(0); expect(tol(1, 0, "abc").answered).toBe(true);
    expect(() => scoreNumericResponse({ answer: { mode: "tolerance", expected: 1, tolerance: 0 }, unitRequired: false, response: { kind: "text", value: "1" } as never, maxMarks: 1 })).not.toThrow();
    expect(answered({ kind: "numeric", value: " " })).toBe(false); expect(answered({ kind: "numeric", value: "3" })).toBe(true);
  });
  it("A9 — configuration: NaN / infinite / negative tolerance / reversed range / unknown mode rejected; valid configs accepted", () => {
    const codes = (answer: unknown, numeric: unknown = { unitRequired: false }) => validateQuestionTypeNode({ numeric, answer }, "numericResponse", 1).map(i => i.code);
    expect(codes({ mode: "tolerance", expected: 12.5, tolerance: 0.1 })).toEqual([]); expect(codes({ mode: "range", min: 10, max: 12 })).toEqual([]); expect(codes({ mode: "range", min: 10, max: 10 })).toEqual([]);
    expect(codes({ mode: "tolerance", expected: NaN, tolerance: 0.1 })).toContain("NUM_INVALID_EXPECTED"); expect(codes({ mode: "tolerance", expected: Infinity, tolerance: 0.1 })).toContain("NUM_INVALID_EXPECTED");
    expect(codes({ mode: "tolerance", expected: 1, tolerance: -0.1 })).toContain("NUM_INVALID_TOLERANCE"); expect(codes({ mode: "tolerance", expected: 1, tolerance: "0.1" })).toContain("NUM_INVALID_TOLERANCE");
    expect(codes({ mode: "range", min: 12, max: 10 })).toContain("NUM_RANGE_REVERSED"); expect(codes({ mode: "range", min: "a", max: 10 })).toContain("NUM_INVALID_RANGE");
    expect(codes({ mode: "guess" })).toContain("NUM_INVALID_MODE"); expect(codes({ mode: "tolerance", expected: 1, tolerance: 0 }, { unitRequired: true })).toContain("NUM_UNIT_REQUIRED_WITHOUT_UNIT");
  });
  it("no expression evaluation anywhere in the scoring module", () => {
    const src = fs.readFileSync(path.join(repo, "src/questionTypeScoring.ts"), "utf8");
    expect(src).not.toMatch(/\beval\s*\(|new Function|Function\(|mathjs|expr-eval|vm\./);
  });
});

describe("16A A10 — Matrix", () => {
  const rows = [{ id: "r1", label: "HTTP" }, { id: "r2", label: "TCP" }, { id: "r3", label: "IP" }], columns = [{ id: "c1", label: "Application" }, { id: "c2", label: "Transport" }, { id: "c3", label: "Network" }];
  const key = { r1: "c1", r2: "c2", r3: "c3" };
  const run = (values: Record<string, unknown>, rs = rows, cs = columns) => scoreMatrix({ rows: rs, columns: cs, correctColumnByRow: key, values, maxMarks: 6 });
  it("partial credit per correctly answered row, deterministic; identities are stable ids — reordering rows or columns never changes correctness", () => {
    expect(run({ r1: "c1", r2: "c2", r3: "c3" }).score).toBe(6); expect(run({ r1: "c1", r2: "c3", r3: "c3" }).score).toBe(4); expect(run({ r1: "c2" }).score).toBe(0);
    expect(run({ r1: "c1", r2: "c2", r3: "c3" }, [rows[2], rows[0], rows[1]], [columns[1], columns[2], columns[0]]).score).toBe(6);
    expect(run({}).answered).toBe(false); expect(run({ r1: "" }).answered).toBe(false); expect(run({ r1: "zz" }).score).toBe(0);
    expect(run({ r1: "c1", r2: "c2", r3: "c3" }).correctRows).toBe(3); expect(run({ r1: "c1" }).totalRows).toBe(3);
  });
  it("configuration: ≥ 1 row, ≥ 2 columns, unique ids, exactly one correct EXISTING column per row", () => {
    const node = { matrix: { rows, columns }, answer: { correctColumnByRow: key } };
    expect(validateQuestionTypeNode(node, "matrix", 1)).toEqual([]);
    expect(validateQuestionTypeNode({ ...node, answer: { correctColumnByRow: { r1: "c1", r2: "c2" } } }, "matrix", 1).map(i => i.code)).toContain("MX_ROW_NO_CORRECT");
    expect(validateQuestionTypeNode({ ...node, answer: { correctColumnByRow: { ...key, r3: "c9" } } }, "matrix", 1).map(i => i.code)).toContain("MX_CORRECT_NOT_COLUMN");
    expect(validateQuestionTypeNode({ matrix: { rows, columns: [columns[0]] }, answer: { correctColumnByRow: key } }, "matrix", 1).map(i => i.code)).toContain("MX_TOO_FEW_COLUMNS");
    expect(validateQuestionTypeNode({ matrix: { rows: [rows[0], { id: "r1", label: "dup" }], columns }, answer: { correctColumnByRow: key } }, "matrix", 1).map(i => i.code)).toContain("MX_DUPLICATE_ID");
    expect(validateQuestionTypeNode({ matrix: { rows: [], columns }, answer: { correctColumnByRow: {} } }, "matrix", 1).map(i => i.code)).toContain("MX_NO_ROWS");
  });
});

describe("16A A11 — Categorization", () => {
  const categories = [{ id: "k1", label: "Application" }, { id: "k2", label: "Transport" }, { id: "k3", label: "Network" }], items = [{ id: "i1", label: "HTTP" }, { id: "i2", label: "TCP" }, { id: "i3", label: "OSPF" }];
  const key = { i1: "k1", i2: "k2", i3: "k3" };
  const run = (values: Record<string, unknown>, its = items) => scoreCategorization({ categories, items: its, correctCategoryByItem: key, values, maxMarks: 3 });
  it("correctItems / totalItems × marks; stable item / category identity under reorder; unanswered and unknown ids handled", () => {
    expect(run({ i1: "k1", i2: "k2", i3: "k3" }).score).toBe(3); expect(run({ i1: "k1", i2: "k3", i3: "k3" }).score).toBe(2); expect(run({ i1: "k2", i2: "k1", i3: "k1" }).score).toBe(0);
    expect(run({ i1: "k1", i2: "k2", i3: "k3" }, [items[2], items[1], items[0]]).score).toBe(3);
    expect(run({}).answered).toBe(false); expect(run({ i1: "zz" }).score).toBe(0); expect(run({ i1: "k1", i9: "k1" }).score).toBe(1);
  });
  it("configuration: ≥ 2 categories, ≥ 1 item, unique ids, every item mapped to an existing category", () => {
    const node = { categorization: { categories, items }, answer: { correctCategoryByItem: key } };
    expect(validateQuestionTypeNode(node, "categorization", 1)).toEqual([]);
    expect(validateQuestionTypeNode({ ...node, answer: { correctCategoryByItem: { i1: "k1" } } }, "categorization", 1).map(i => i.code)).toContain("CAT_ITEM_NO_CATEGORY");
    expect(validateQuestionTypeNode({ ...node, answer: { correctCategoryByItem: { ...key, i3: "k9" } } }, "categorization", 1).map(i => i.code)).toContain("CAT_CORRECT_NOT_CATEGORY");
    expect(validateQuestionTypeNode({ categorization: { categories: [categories[0]], items }, answer: { correctCategoryByItem: key } }, "categorization", 1).map(i => i.code)).toContain("CAT_TOO_FEW_CATEGORIES");
    expect(validateQuestionTypeNode({ categorization: { categories, items: [] }, answer: { correctCategoryByItem: {} } }, "categorization", 1).map(i => i.code)).toContain("CAT_NO_ITEMS");
    expect(validateQuestionTypeNode({ categorization: { categories, items: [items[0], { id: "i1", label: "dup" }] }, answer: { correctCategoryByItem: key } }, "categorization", 1).map(i => i.code)).toContain("CAT_DUPLICATE_ID");
  });
});

describe("16A — validation seam: unknown key / unsupported version / compound capability", () => {
  it("unknown keys and unsupported versions are blocking issues; a part of a non-compound-capable type is refused; legacy types with no version pass through", () => {
    expect(validateQuestionTypeNode({}, "hotspot", undefined).map(i => i.code)).toEqual(["UNKNOWN_QUESTION_TYPE"]);
    expect(validateQuestionTypeNode({}, "multipleChoice", 2).map(i => i.code)).toEqual(["UNSUPPORTED_QUESTION_TYPE_VERSION"]);
    expect(validateQuestionTypeNode({}, "multipleChoice", undefined)).toEqual([]);
    expect(validateQuestionTypeNode({}, "compound", undefined, { part: true }).map(i => i.code)).toEqual(["TYPE_NOT_COMPOUND_CAPABLE"]);
    expect(validateQuestionTypeNode({}, "multipleSelect", 1).every(i => i.severity === "error")).toBe(true);
  });
});
