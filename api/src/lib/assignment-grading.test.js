import { describe, it, expect } from "vitest";
import { gradeExam } from "./assignment-grading.js";

describe("gradeExam", () => {
  it("grades a correct multiple-choice answer as full marks", () => {
    const exam = {
      questions: [
        {
          examQuestionId: "q1",
          marks: 10,
          presentationType: "multiplechoice",
          options: [{ text: "A" }, { text: "B" }],
          answer: { correctOptionIndex: 1 }
        }
      ]
    };
    const result = gradeExam(exam, { q1: { kind: "choice", index: 1 } });
    expect(result.questions[0].correct).toBe(true);
    expect(result.questions[0].score).toBe(10);
    expect(result.score).toBe(10);
    expect(result.totalMarks).toBe(10);
    expect(result.percentage).toBe(100);
    expect(result.finalized).toBe(true);
  });

  it("grades a wrong multiple-choice answer as zero", () => {
    const exam = {
      questions: [
        {
          examQuestionId: "q1",
          marks: 10,
          presentationType: "multiplechoice",
          options: [{ text: "A" }, { text: "B" }],
          answer: { correctOptionIndex: 1 }
        }
      ]
    };
    const result = gradeExam(exam, { q1: { kind: "choice", index: 0 } });
    expect(result.questions[0].correct).toBe(false);
    expect(result.score).toBe(0);
  });

  it("gives partial credit for a partially correct exact-sequence answer", () => {
    const exam = {
      questions: [
        {
          examQuestionId: "q1",
          marks: 4,
          answer: { mode: "exactSequence", values: ["a", "b", "c", "d"] }
        }
      ]
    };
    const result = gradeExam(exam, { q1: { kind: "sequence", values: ["a", "b", "x", "x"] } });
    expect(result.questions[0].score).toBeCloseTo(2, 5);
    expect(result.questions[0].correct).toBe(false);
  });

  it("marks an exact-text answer as needing manual review when wrong", () => {
    const exam = {
      questions: [
        { examQuestionId: "q1", marks: 5, answer: { text: "Paris" } }
      ]
    };
    const result = gradeExam(exam, { q1: { kind: "text", value: "London" } });
    expect(result.questions[0].correct).toBe(false);
    expect(result.questions[0].manualReview).toBe(true);
    expect(result.finalized).toBe(false);
    expect(result.manualReviewMarks).toBe(5);
  });

  it("matches text answers case-insensitively and ignoring extra whitespace", () => {
    const exam = {
      questions: [
        { examQuestionId: "q1", marks: 5, answer: { text: "Paris" } }
      ]
    };
    const result = gradeExam(exam, { q1: { kind: "text", value: "  paris  " } });
    expect(result.questions[0].correct).toBe(true);
    expect(result.questions[0].manualReview).toBe(false);
  });

  it("aggregates totals correctly across multiple questions", () => {
    const exam = {
      questions: [
        { examQuestionId: "q1", marks: 10, presentationType: "multiplechoice", options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } },
        { examQuestionId: "q2", marks: 10, answer: { text: "Paris" } }
      ]
    };
    const result = gradeExam(exam, {
      q1: { kind: "choice", index: 0 },
      q2: { kind: "text", value: "Paris" }
    });
    expect(result.score).toBe(20);
    expect(result.totalMarks).toBe(20);
    expect(result.percentage).toBe(100);
    expect(result.finalized).toBe(true);
  });

  it("falls back to manual review when a question type is unrecognized", () => {
    const exam = { questions: [{ examQuestionId: "q1", marks: 5 }] };
    const result = gradeExam(exam, { q1: {} });
    expect(result.questions[0].manualReview).toBe(true);
    expect(result.questions[0].score).toBe(0);
  });
});
