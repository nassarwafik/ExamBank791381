import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gradeExam, gradeQuestion } from "../src/lib/assignment-grading.js";

// Phase 16A §36 — GRADING PARITY. The fixture was generated on the exact baseline 6468cc7 by the untouched grader: every
// original type, compound (explicit / auto / mixed marks, manual-review part), section policies (all / capScore /
// firstNAnswered at question and part level), a legacy flat exam with alias types, and single-question edge cases. After
// the registry refactor the authoritative grader must reproduce every number byte-for-byte.
const here = path.dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(fs.readFileSync(path.join(here, "fixtures", "grading-parity-16a.json"), "utf8"));

describe("16A — legacy grading parity against the baseline snapshot", () => {
  it("fixture provenance", () => { expect(fx.generatedFrom).toBe("6468cc74db71131ef8d9f91e91a1af7ebc8e9a41"); expect(fx.exam.sections.flatMap(s => s.questions).length).toBe(22); });
  it("full structured exam: identical totals, per-question scores, manual-review marks, section results", () => { expect(gradeExam(fx.exam, fx.answers)).toEqual(fx.result); });
  it("empty and partial answer sets", () => { expect(gradeExam(fx.exam, {})).toEqual(fx.empty); expect(gradeExam(fx.exam, { q1: { kind: "choice", index: 0 }, q19: { kind: "compound", parts: { pa: { kind: "choice", index: 0 } } } })).toEqual(fx.partial); });
  it("legacy flat exam with alias / missing types", () => { expect(gradeExam(fx.legacyFlat, fx.legacyAnswers)).toEqual(fx.legacyResult); });
  it("single-question edge cases (bad index, no response, stored TF options, empty text, keyless fields, choice on a legacy-spelled type)", () => {
    const rerun = { "mcq-bad-index": [{ examQuestionId: "z1", presentationType: "multipleChoice", text: "MCQ z1", marks: 2, options: [{ text: "A" }, { text: "B" }, { text: "C" }], answer: { correctOptionIndex: 1 } }, { kind: "choice", index: 7 }],
      "mcq-no-response": [{ examQuestionId: "z2", presentationType: "multipleChoice", text: "MCQ z2", marks: 2, options: [{ text: "A" }, { text: "B" }, { text: "C" }], answer: { correctOptionIndex: 1 } }, undefined],
      "tf-options-stored": [{ examQuestionId: "z3", presentationType: "trueFalse", text: "TF z3", marks: 1, answer: { correct: false }, options: [{ text: "صحيح" }, { text: "غير صحيح" }] }, { kind: "choice", index: 1 }],
      "sa-no-key-empty": [{ examQuestionId: "z4", presentationType: "shortAnswer", text: "SA z4", marks: 2, answer: {} }, { kind: "text", value: "" }],
      "fields-no-key": [{ examQuestionId: "z5", presentationType: "multiTrueFalse", text: "x", marks: 2, fields: [{ id: "r1", statement: "s" }] }, { kind: "fields", values: { r1: "true" } }] };
    for (const s of fx.singles) { if (rerun[s.name]) expect(gradeQuestion(rerun[s.name][0], rerun[s.name][1]), s.name).toEqual(s.result); }
  });
  it("the ONE documented divergence: a STRUCTURED question whose presentationType is neither a catalog type nor a legacy alias is now fail-closed (was graded by response kind on the baseline); legacy flat `type` questions are unchanged", () => {
    const s = fx.singles.find(x => x.name === "choice-on-unknown-type-legacy");
    expect(s.result.score).toBe(2);                                                                     // baseline behaviour, recorded
    const now = gradeQuestion({ examQuestionId: "z6", presentationType: "weirdLegacy", text: "x", marks: 2, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 1 } }, { kind: "choice", index: 1 });
    expect(now).toMatchObject({ score: 0, maxMarks: 2, correct: false, manualReview: true });
  });
});
