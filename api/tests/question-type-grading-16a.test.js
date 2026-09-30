import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gradeExam, gradeQuestion } from "../src/lib/assignment-grading.js";
import { registerGrader, resolveGrader, unknownTypeResult } from "../src/lib/question-type-graders.js";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { isResponseAnswered } from "../src/lib/exam-structure.js";

// Phase 16A — the AUTHORITATIVE server grading registry: Wave 1 types (A6–A11 through gradeExam), compound parts (A14),
// unknown type / unsupported version fail closed (A16 / A17), answer persistence recognises the new response kinds (A13),
// the student sanitizer leaks no key (A12), and a test-only synthetic type registers WITHOUT touching the central
// dispatcher (A3). Fail-first on 6468cc7 (no registry module).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ms = (over = {}) => ({ examQuestionId: "ms1", presentationType: "multipleSelect", questionTypeVersion: 1, text: "أي البروتوكولات في طبقة النقل؟", marks: 4, options: [{ id: "o1", text: "TCP" }, { id: "o2", text: "UDP" }, { id: "o3", text: "IP" }, { id: "o4", text: "HTTP" }], answer: { correctOptionIds: ["o1", "o2"], scoring: "partialWithPenalty" }, ...over });
const num = (over = {}) => ({ examQuestionId: "n1", presentationType: "numericResponse", questionTypeVersion: 1, text: "g", marks: 3, numeric: { unitRequired: true }, answer: { mode: "tolerance", expected: 9.8, tolerance: 0.1, unit: "m/s²" }, ...over });
const mx = (over = {}) => ({ examQuestionId: "x1", presentationType: "matrix", questionTypeVersion: 1, text: "layers", marks: 6, matrix: { rows: [{ id: "r1", label: "HTTP" }, { id: "r2", label: "TCP" }, { id: "r3", label: "IP" }], columns: [{ id: "c1", label: "Application" }, { id: "c2", label: "Transport" }, { id: "c3", label: "Network" }] }, answer: { correctColumnByRow: { r1: "c1", r2: "c2", r3: "c3" } }, ...over });
const cat = (over = {}) => ({ examQuestionId: "k1", presentationType: "categorization", questionTypeVersion: 1, text: "classify", marks: 3, categorization: { categories: [{ id: "a", label: "حمض" }, { id: "b", label: "قاعدة" }], items: [{ id: "i1", label: "HCl" }, { id: "i2", label: "NaOH" }, { id: "i3", label: "H2SO4" }] }, answer: { correctCategoryByItem: { i1: "a", i2: "b", i3: "a" } }, ...over });
const exam = (questions, section = {}) => ({ examId: "E16", title: "e", sections: [{ id: "s1", title: "s", gradingPolicy: "all", ...section, questions }] });
const q = (r, id) => r.questions.find(x => x.questionId === id);

describe("16A A6–A11 — Wave 1 types grade through gradeExam", () => {
  it("multipleSelect: three scoring modes, clamped to [0, max]", () => {
    const pen = gradeExam(exam([ms()]), { ms1: { kind: "multiChoice", optionIds: ["o1", "o3"] } });
    expect(q(pen, "ms1").score).toBe(0); expect(pen.manualReviewMarks).toBe(0);
    expect(q(gradeExam(exam([ms()]), { ms1: { kind: "multiChoice", optionIds: ["o2", "o1"] } }), "ms1").score).toBe(4);
    expect(q(gradeExam(exam([ms({ answer: { correctOptionIds: ["o1", "o2"], scoring: "partialNoPenalty" } })]), { ms1: { kind: "multiChoice", optionIds: ["o1", "o3", "o4"] } }), "ms1").score).toBe(2);
    expect(q(gradeExam(exam([ms({ answer: { correctOptionIds: ["o1", "o2"], scoring: "allOrNothing" } })]), { ms1: { kind: "multiChoice", optionIds: ["o1"] } }), "ms1").score).toBe(0);
    const r = gradeExam(exam([ms()]), { ms1: { kind: "multiChoice", optionIds: ["o1", "o2", "o1", "zz"] } }); expect(q(r, "ms1").score).toBe(4); expect(q(r, "ms1").correct).toBe(true);
    expect(q(gradeExam(exam([ms()]), {}), "ms1").score).toBe(0); expect(q(gradeExam(exam([ms()]), {}), "ms1").manualReview).toBe(false);
  });
  it("numericResponse: tolerance boundaries inclusive, range inclusive, unit required / ignored, garbage → 0 without exception", () => {
    const g = (question, value, unit) => q(gradeExam(exam([question]), { n1: { kind: "numeric", value, unit } }), "n1");
    expect(g(num(), "9.9", "m/s²").score).toBe(3); expect(g(num(), "9.7", "M/S²").score).toBe(3); expect(g(num(), "9.91", "m/s²").score).toBe(0);
    expect(g(num(), "9.8").score).toBe(0); expect(g(num(), "9.8", "km/h").score).toBe(0);
    expect(g(num({ numeric: { unitRequired: false }, answer: { mode: "range", min: 10, max: 12 } }), "12", "whatever").score).toBe(3);
    expect(g(num({ numeric: { unitRequired: false }, answer: { mode: "range", min: 10, max: 12 } }), "12.0001").score).toBe(0);
    expect(g(num(), "1+1", "m/s²").score).toBe(0); expect(g(num(), "١٠", "m/s²").score).toBe(0); expect(g(num(), "٩٫٨", "m/s²").score).toBe(3);
    expect(g(num(), "9.8", "m/s²").correct).toBe(true); expect(g(num(), "9.8", "m/s²").manualReview).toBe(false);
  });
  it("matrix: partial credit per stable row; reordering rows / columns in the stored question keeps the same score", () => {
    expect(q(gradeExam(exam([mx()]), { x1: { kind: "fields", values: { r1: "c1", r2: "c3", r3: "c3" } } }), "x1").score).toBe(4);
    const reordered = mx({ matrix: { rows: [{ id: "r3", label: "IP" }, { id: "r1", label: "HTTP" }, { id: "r2", label: "TCP" }], columns: [{ id: "c3", label: "Network" }, { id: "c1", label: "Application" }, { id: "c2", label: "Transport" }] } });
    expect(q(gradeExam(exam([reordered]), { x1: { kind: "fields", values: { r1: "c1", r2: "c2", r3: "c3" } } }), "x1").score).toBe(6);
    expect(q(gradeExam(exam([mx()]), { x1: { kind: "fields", values: { r1: "c9" } } }), "x1").score).toBe(0);
  });
  it("categorization: correctItems / totalItems × marks with stable ids", () => {
    expect(q(gradeExam(exam([cat()]), { k1: { kind: "fields", values: { i1: "a", i2: "b", i3: "b" } } }), "k1").score).toBe(2);
    expect(q(gradeExam(exam([cat()]), { k1: { kind: "fields", values: { i1: "a", i2: "b", i3: "a" } } }), "k1").correct).toBe(true);
  });
  it("A14 — every Wave 1 type works as a compound part with explicit / auto / mixed marks and firstN at part level", () => {
    const comp = { examQuestionId: "c1", presentationType: "compound", text: "compound", marks: 10, parts: [
      { id: "p1", type: "multipleSelect", marks: 4, options: [{ id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }], answer: { correctOptionIds: ["a", "b"], scoring: "partialNoPenalty" } },
      { id: "p2", type: "numericResponse", marks: 2, numeric: { unitRequired: false }, answer: { mode: "tolerance", expected: 5, tolerance: 0 } },
      { id: "p3", type: "matrix", marks: 2, matrix: { rows: [{ id: "r1", label: "x" }, { id: "r2", label: "y" }], columns: [{ id: "c1", label: "1" }, { id: "c2", label: "2" }] }, answer: { correctColumnByRow: { r1: "c1", r2: "c2" } } },
      { id: "p4", type: "categorization", marks: 2, categorization: { categories: [{ id: "k1", label: "k" }, { id: "k2", label: "m" }], items: [{ id: "i1", label: "a" }, { id: "i2", label: "b" }] }, answer: { correctCategoryByItem: { i1: "k1", i2: "k2" } } }
    ] };
    const r = gradeExam(exam([comp]), { c1: { kind: "compound", parts: { p1: { kind: "multiChoice", optionIds: ["a"] }, p2: { kind: "numeric", value: "5" }, p3: { kind: "fields", values: { r1: "c1", r2: "c1" } }, p4: { kind: "fields", values: { i1: "k1", i2: "k2" } } } } });
    const g = q(r, "c1"); expect(g.score).toBe(2 + 2 + 1 + 2); expect(g.maxMarks).toBe(10); expect(g.manualReview).toBe(false); expect(g.parts.map(p => p.partId)).toEqual(["p1", "p2", "p3", "p4"]);
    const auto = { ...comp, marks: 8, parts: comp.parts.map(p => { const { marks: _m, ...rest } = p; void _m; return rest; }) };
    expect(q(gradeExam(exam([auto]), { c1: { kind: "compound", parts: { p2: { kind: "numeric", value: "5" } } } }), "c1").score).toBe(2);
    const firstN = gradeExam(exam([comp], { gradingPolicy: "firstNAnswered", requiredAnswers: 2, answerUnit: "part", maxMarks: 6 }), { c1: { kind: "compound", parts: { p1: { kind: "multiChoice", optionIds: ["a", "b"] }, p2: { kind: "numeric", value: "5" }, p4: { kind: "fields", values: { i1: "k1", i2: "k2" } } } } });
    expect(q(firstN, "c1").score).toBe(6); expect(q(firstN, "c1").parts.find(p => p.partId === "p4").counted).toBe(false);
  });
});

describe("16A A16 / A17 — unknown types and unsupported versions fail closed on the server", () => {
  it("unknown type: score 0, manual review, never full credit, never another grader, no crash; unsupported version of a known type: the same", () => {
    const unknown = { examQuestionId: "u1", presentationType: "hotspot", text: "x", marks: 5, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } };
    const r = gradeExam(exam([unknown]), { u1: { kind: "choice", index: 0 } });
    expect(q(r, "u1").score).toBe(0); expect(q(r, "u1").manualReview).toBe(true); expect(q(r, "u1").correct).toBe(false); expect(r.finalized).toBe(false); expect(r.manualReviewMarks).toBe(5);
    const v2 = gradeExam(exam([ms({ questionTypeVersion: 2 })]), { ms1: { kind: "multiChoice", optionIds: ["o1", "o2"] } });
    expect(q(v2, "ms1").score).toBe(0); expect(q(v2, "ms1").manualReview).toBe(true);
    const legacyV2 = gradeExam(exam([{ examQuestionId: "m", presentationType: "multipleChoice", questionTypeVersion: 2, text: "x", marks: 2, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } }]), { m: { kind: "choice", index: 0 } });
    expect(q(legacyV2, "m").score).toBe(0); expect(q(legacyV2, "m").manualReview).toBe(true);
    expect(resolveGrader("hotspot")).toBeUndefined(); expect(unknownTypeResult(5)).toMatchObject({ score: 0, maxMarks: 5, correct: false, manualReview: true });
    // an unknown part inside a compound fails closed for that part only
    const comp = { examQuestionId: "c", presentationType: "compound", text: "c", marks: 4, parts: [{ id: "a", type: "multipleChoice", marks: 2, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } }, { id: "b", type: "hotspot", marks: 2 }] };
    const rc = gradeExam(exam([comp]), { c: { kind: "compound", parts: { a: { kind: "choice", index: 0 }, b: { kind: "choice", index: 0 } } } });
    expect(q(rc, "c").score).toBe(2); expect(q(rc, "c").manualReview).toBe(true); expect(rc.manualReviewMarks).toBe(2);
  });
  it("legacy spellings / aliases / missing type still grade exactly as before (they are legacy, not unknown)", () => {
    expect(gradeQuestion({ presentationType: "multiplechoice", marks: 2, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 1 } }, { kind: "choice", index: 1 }).score).toBe(2);
    expect(gradeQuestion({ type: "open", marks: 3, answer: { text: "Cairo" } }, { kind: "text", value: "cairo" }).score).toBe(3);
    expect(gradeQuestion({ marks: 2, text: "| Item | Answer |\n|---|---|\n| A | |", answer: { text: "A=1" } }, { kind: "table", values: ["1"] }).score).toBe(2);
    expect(gradeQuestion({ type: "mcq", marks: 1, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } }, { kind: "choice", index: 0 }).score).toBe(1);
  });
});

describe("16A A13 — response persistence recognises the new answer kinds (server mirror of answered())", () => {
  it("multiChoice / numeric / fields responses count as answered when non-empty; unknown kinds fail closed", () => {
    expect(isResponseAnswered({ kind: "multiChoice", optionIds: ["a"] })).toBe(true); expect(isResponseAnswered({ kind: "multiChoice", optionIds: [] })).toBe(false);
    expect(isResponseAnswered({ kind: "numeric", value: "3" })).toBe(true); expect(isResponseAnswered({ kind: "numeric", value: "  " })).toBe(false);
    expect(isResponseAnswered({ kind: "fields", values: { r1: "c1" } })).toBe(true); expect(isResponseAnswered({ kind: "hotspotState", x: 1 })).toBe(false);
    const roundTrip = JSON.parse(JSON.stringify({ ms1: { kind: "multiChoice", optionIds: ["o1", "o2"] }, n1: { kind: "numeric", value: "9.8", unit: "m/s²" } }));
    expect(q(gradeExam(exam([ms(), num()]), roundTrip), "ms1").score).toBe(4); expect(q(gradeExam(exam([ms(), num()]), roundTrip), "n1").score).toBe(3);
  });
});

describe("16A A12 — student sanitizer: zero answer leak for the Wave 1 types", () => {
  it("the student payload keeps display / config data and never the keys, expected values, tolerances, mappings or scoring rules", () => {
    const comp = { examQuestionId: "c1", presentationType: "compound", text: "c", marks: 4, parts: [{ id: "p1", type: "multipleSelect", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], answer: { correctOptionIds: ["a"], scoring: "allOrNothing" } }, { id: "p2", type: "numericResponse", numeric: { unitRequired: true }, answer: { mode: "range", min: 1, max: 2, unit: "kg" } }] };
    const safe = sanitizeExamForStudent(exam([ms(), num(), mx(), cat(), comp]));
    const text = JSON.stringify(safe);
    for (const leak of ["correctOptionIds", "expected", "tolerance", '"min"', '"max"', "m/s²", "correctColumnByRow", "correctCategoryByItem", "scoring", "partialWithPenalty", '"kg"']) expect(text, leak).not.toContain(leak);
    const [sMs, sNum, sMx, sCat, sComp] = safe.sections[0].questions;
    expect(sMs.options.map(o => o.id)).toEqual(["o1", "o2", "o3", "o4"]); expect(sMs.answer).toEqual({}); expect(sMs.questionTypeVersion).toBe(1);
    expect(sNum.numeric).toEqual({ unitRequired: true }); expect(sNum.answer).toEqual({});
    expect(sMx.matrix.rows.map(r => r.id)).toEqual(["r1", "r2", "r3"]); expect(sMx.matrix.columns.length).toBe(3);
    expect(sCat.categorization.items.length).toBe(3); expect(sCat.categorization.categories.map(c => c.label)).toEqual(["حمض", "قاعدة"]);
    expect(sComp.parts[0].answer).toBeUndefined(); expect(sComp.parts[1].answer).toBeUndefined(); expect(sComp.parts[1].numeric).toEqual({ unitRequired: true });
  });
  it("secret-looking keys smuggled into a Wave 1 config object are stripped too (defense in depth)", () => {
    const safe = sanitizeExamForStudent(exam([mx({ matrix: { rows: [{ id: "r1", label: "x", correctColumn: "c1" }], columns: [{ id: "c1", label: "1" }, { id: "c2", label: "2" }], answerKey: { r1: "c1" } } })]));
    expect(JSON.stringify(safe)).not.toMatch(/correctColumn|answerKey/);
    expect(safe.sections[0].questions[0].matrix.rows[0].label).toBe("x");
  });
});

describe("16A A3 — a synthetic interactive type registers through the seam without touching the central dispatcher", () => {
  it("registerGrader → gradeExam uses it for the synthetic type, per-type result shape honoured, unregister restores fail-closed", () => {
    const unregister = registerGrader("syntheticInteractive", (question, response, max) => {
      const state = response && response.kind === "fields" && response.values ? response.values : {};
      const ok = Object.values(state).filter(v => v === "up").length;
      return { score: max * (ok / 2), manualReview: false, parts: { correct: ok, total: 2 } };
    });
    try {
      const r = gradeExam(exam([{ examQuestionId: "sim", presentationType: "syntheticInteractive", questionTypeVersion: 1, text: "bring the links up", marks: 8 }]), { sim: { kind: "fields", values: { link1: "up", link2: "down" } } });
      expect(q(r, "sim").score).toBe(4); expect(q(r, "sim").manualReview).toBe(false);
    } finally { unregister(); }
    expect(q(gradeExam(exam([{ examQuestionId: "sim", presentationType: "syntheticInteractive", text: "x", marks: 8 }]), { sim: { kind: "fields", values: { link1: "up" } } }), "sim").score).toBe(0);
    const central = fs.readFileSync(path.join(repo, "api/src/lib/assignment-grading.js"), "utf8");
    expect(central).not.toMatch(/synthetic|multipleSelect|numericResponse|"matrix"|categorization/);     // no per-type branch in the central grader
  });
});
