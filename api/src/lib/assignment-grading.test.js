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

// Table questions are graded purely by response.kind==="table" plus a "rowLabel=value;..." pairMap
// in answer.text - these tests confirm that a per-row dropdown's plain string value (exactly what
// StudentExamPage.tsx's new <select> sends via setTable) grades correctly with zero changes to this
// file, including the two new conventions introduced for the dropdown feature: a shared word/value
// set per row, and a genuinely boolean row using literal "true"/"false" strings.
describe("gradeExam - table questions with dropdown-sourced answers", () => {
  const text =
    "صنّف صلاحية العناوين التالية:\n" +
    "| العنوان | الحالة |\n" +
    "| --- | --- |\n" +
    "| 192.168.1.10 | |\n" +
    "| 169.254.10.20 | |";

  it("gives full marks when every row's selected option matches the pairMap answer", () => {
    const exam = { questions: [{ examQuestionId: "q1", marks: 4, text, answer: { text: "192.168.1.10=صالح;169.254.10.20=غير صالح" } }] };
    const result = gradeExam(exam, { q1: { kind: "table", values: ["صالح", "غير صالح"] } });
    expect(result.questions[0].score).toBe(4);
    expect(result.questions[0].correct).toBe(true);
    expect(result.questions[0].manualReview).toBe(false);
  });

  it("gives partial credit per row when only some dropdown selections are correct", () => {
    const exam = { questions: [{ examQuestionId: "q1", marks: 4, text, answer: { text: "192.168.1.10=صالح;169.254.10.20=غير صالح" } }] };
    const result = gradeExam(exam, { q1: { kind: "table", values: ["صالح", "صالح"] } });
    expect(result.questions[0].score).toBe(2);
  });

  it("grades a genuinely boolean row using the literal true/false strings the boolean <select> submits", () => {
    const boolText = "حدد صحة كل عبارة:\n| العبارة | الحكم |\n| --- | --- |\n| DHCP يعمل على منفذ 67 | |\n| Trunk ينقل VLAN واحد فقط | |";
    const exam = { questions: [{ examQuestionId: "q1", marks: 2, text: boolText, answer: { text: "DHCP يعمل على منفذ 67=true;Trunk ينقل VLAN واحد فقط=false" } }] };
    const result = gradeExam(exam, { q1: { kind: "table", values: ["true", "false"] } });
    expect(result.questions[0].score).toBe(2);
    expect(result.questions[0].correct).toBe(true);
  });

  it("still needs manual review when the table can't be parsed or no answer was submitted", () => {
    const exam = { questions: [{ examQuestionId: "q1", marks: 4, text, answer: { text: "192.168.1.10=صالح;169.254.10.20=غير صالح" } }] };
    const result = gradeExam(exam, { q1: { kind: "table", values: [] } });
    expect(result.questions[0].manualReview).toBe(true);
    expect(result.questions[0].score).toBe(0);
  });

  it("legacy checkbox-style table (plain membership answer.text, no '=' pairs) keeps working exactly as before", () => {
    const checkboxText = "ضع علامة أمام الشبكات الخاصة:\n| العنوان | خاص؟ |\n| --- | --- |\n| 192.168.1.10 | |\n| 8.8.8.8 | |";
    const exam = { questions: [{ examQuestionId: "q1", marks: 2, text: checkboxText, answer: { text: "192.168.1.10" } }] };
    const result = gradeExam(exam, { q1: { kind: "table", values: [true, false] } });
    expect(result.questions[0].score).toBe(2);
  });
});

// The whole premise of adding "matching"/"ordering" as new presentationType values is that
// grading needs ZERO changes, because gradeQuestion never checks presentationType for anything
// other than multipleChoice - it dispatches purely on answer.mode/response.kind. These tests are
// the regression proof: a "matching" question is graded via the exact same table/pairMap path a
// table question already uses, and an "ordering" question via the exact same exactSequence path a
// fillBlank/wordBank question already uses.
describe("gradeExam - matching (طابق) questions reuse the existing table/pairMap grading untouched", () => {
  const text = "طابق كل بروتوكول بالطبقة الصحيحة:\n| البروتوكول | الطبقة |\n| --- | --- |\n| HTTP | |\n| IP | |";

  it("grades a fully correct matching submission as full marks", () => {
    const exam = { questions: [{ examQuestionId: "q1", marks: 4, presentationType: "matching", text, answer: { text: "HTTP=طبقة التطبيقات;IP=طبقة الشبكة" } }] };
    const result = gradeExam(exam, { q1: { kind: "table", values: ["طبقة التطبيقات", "طبقة الشبكة"] } });
    expect(result.questions[0].score).toBe(4);
    expect(result.questions[0].correct).toBe(true);
  });

  it("gives partial credit for a partially correct matching submission", () => {
    const exam = { questions: [{ examQuestionId: "q1", marks: 4, presentationType: "matching", text, answer: { text: "HTTP=طبقة التطبيقات;IP=طبقة الشبكة" } }] };
    const result = gradeExam(exam, { q1: { kind: "table", values: ["طبقة التطبيقات", "طبقة التطبيقات"] } });
    expect(result.questions[0].score).toBe(2);
  });
});

describe("gradeExam - ordering (رتّب) questions reuse the existing exactSequence grading untouched", () => {
  it("grades a fully correct ordering submission as full marks", () => {
    const exam = { questions: [{ examQuestionId: "q1", marks: 3, presentationType: "ordering", answer: { mode: "exactSequence", values: ["2", "1", "3"] } }] };
    const result = gradeExam(exam, { q1: { kind: "sequence", values: ["2", "1", "3"] } });
    expect(result.questions[0].score).toBe(3);
    expect(result.questions[0].correct).toBe(true);
  });

  it("gives partial credit for a partially correct ordering submission", () => {
    const exam = { questions: [{ examQuestionId: "q1", marks: 3, presentationType: "ordering", answer: { mode: "exactSequence", values: ["2", "1", "3"] } }] };
    const result = gradeExam(exam, { q1: { kind: "sequence", values: ["2", "1", "1"] } });
    expect(result.questions[0].score).toBeCloseTo(2, 5);
    expect(result.questions[0].correct).toBe(false);
  });
});
