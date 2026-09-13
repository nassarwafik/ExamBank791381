import { describe, it, expect } from "vitest";
import { gradeExam } from "../api/src/lib/assignment-grading.js";
import { computeTotalMarks, questionMaxMarks as builderQuestionMax } from "./examBuilderState";
import { questionMaxMarks as feQuestionMax, normalizeExamStructure } from "./examStructure";
import { examMarksDistribution } from "./examCover";
import type { BuilderPart, BuilderQuestion, StructuredExam } from "./examTypes";

// Regression: builder computeTotalMarks / questionMaxMarks must use the EXACT compound distribution
// semantics as the backend grader, src/examStructure.ts, and the cover — including a mixed overflow
// (an explicit part larger than the question total) and per-part clamping of negative marks.

// One compound question in a single "all" section (no cap → total is the compound's own max).
function examOf(q: Partial<BuilderQuestion>): StructuredExam {
  return {
    examId: "E", title: "امتحان",
    sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", maxMarks: null, requiredAnswers: null, answerUnit: "question", stimuli: {},
      questions: [{ examQuestionId: "q1", presentationType: "compound", text: "س", ...q } as BuilderQuestion] }]
  } as unknown as StructuredExam;
}

const part = (marks?: number): BuilderPart =>
  ({ id: "p" + Math.random().toString(36).slice(2, 6), type: "shortAnswer", text: "ج", ...(marks === undefined ? {} : { marks }) } as unknown as BuilderPart);

// All four totals that MUST agree for a given exam.
function allTotals(exam: StructuredExam) {
  return {
    builder: computeTotalMarks(exam),
    cover: examMarksDistribution(normalizeExamStructure(exam as never)).total,
    grader: gradeExam(exam as never, {}).totalMarks
  };
}

describe("builder questionMaxMarks — compound parity with backend/grader/cover", () => {
  it("A) mixed overflow: marks=10, parts [12, unset] => 12 (not 10)", () => {
    const q = { marks: 10, parts: [part(12), part(undefined)] };
    expect(builderQuestionMax(q as BuilderQuestion)).toBe(12);
    expect(feQuestionMax(q as never)).toBe(12);
    const t = allTotals(examOf(q));
    expect(t).toEqual({ builder: 12, cover: 12, grader: 12 });
  });

  it("B) mixed underflow: marks=10, parts [4, unset, unset] => 10 (4 + 3 + 3)", () => {
    const q = { marks: 10, parts: [part(4), part(undefined), part(undefined)] };
    expect(builderQuestionMax(q as BuilderQuestion)).toBe(10);
    expect(feQuestionMax(q as never)).toBe(10);
    const t = allTotals(examOf(q));
    expect(t).toEqual({ builder: 10, cover: 10, grader: 10 });
  });

  it("C) all explicit: marks=10, parts [3, 3, 2] => 8", () => {
    const q = { marks: 10, parts: [part(3), part(3), part(2)] };
    expect(builderQuestionMax(q as BuilderQuestion)).toBe(8);
    expect(feQuestionMax(q as never)).toBe(8);
    const t = allTotals(examOf(q));
    expect(t).toEqual({ builder: 8, cover: 8, grader: 8 });
  });

  it("D) negative explicit part clamps per part: parts [-5, 15] => 15 (not 10)", () => {
    const q = { marks: 10, parts: [part(-5), part(15)] };
    expect(builderQuestionMax(q as BuilderQuestion)).toBe(15);
    expect(feQuestionMax(q as never)).toBe(15);
    const t = allTotals(examOf(q));
    expect(t).toEqual({ builder: 15, cover: 15, grader: 15 });
  });

  it("E) non-compound and equal-split remain correct and in agreement", () => {
    const plain = examOf({ presentationType: "shortAnswer", marks: 7, parts: undefined } as Partial<BuilderQuestion>);
    expect(allTotals(plain)).toEqual({ builder: 7, cover: 7, grader: 7 });
    const split = examOf({ marks: 9, parts: [part(undefined), part(undefined), part(undefined)] });
    expect(allTotals(split)).toEqual({ builder: 9, cover: 9, grader: 9 });
  });
});
