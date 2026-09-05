import { describe, it, expect } from "vitest";
import { distributeMarks, mapTQuestionToExamQuestion, buildTExamSnapshot } from "./library-question-map.js";

describe("distributeMarks", () => {
  it("splits evenly when the count divides 100 exactly", () => {
    expect(distributeMarks(100, 4)).toEqual([25, 25, 25, 25]);
  });

  it("hands the remainder to the first questions so the total is always exact", () => {
    const marks = distributeMarks(100, 3);
    expect(marks).toEqual([34, 33, 33]);
    expect(marks.reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("mapTQuestionToExamQuestion", () => {
  const raw = {
    topic: "تعريف الشبكة",
    level: "سهل جدًا",
    page: "صفحة 6",
    text: "ما هي الشبكة؟",
    options: ["أ", "ب", "ج", "د"],
    answer: 1,
    explain: "لأنها كذلك"
  };

  it("builds a deterministic examQuestionId from examId and ordinal", () => {
    const q = mapTQuestionToExamQuestion(raw, { examId: "LIB-T05", ordinal: 3, marks: 10 });
    expect(q.examQuestionId).toBe("LIB-T05-Q03");
  });

  it("uses correctOptionIndex directly from the source's integer answer - not a text-match", () => {
    const q = mapTQuestionToExamQuestion(raw, { examId: "LIB-T05", ordinal: 1, marks: 10 });
    expect(q.answer).toEqual({ correctOptionIndex: 1 });
  });

  it("carries options through with a value/text pair per option, preserving order", () => {
    const q = mapTQuestionToExamQuestion(raw, { examId: "LIB-T05", ordinal: 1, marks: 10 });
    expect(q.options).toEqual([
      { value: "0", text: "أ" }, { value: "1", text: "ب" }, { value: "2", text: "ج" }, { value: "3", text: "د" }
    ]);
  });

  it("copies explain into hint verbatim, never inventing one", () => {
    const q = mapTQuestionToExamQuestion(raw, { examId: "LIB-T05", ordinal: 1, marks: 10 });
    expect(q.hint).toBe("لأنها كذلك");
  });

  it("does not guess topic/difficulty from the free-text source fields - safe fallbacks only", () => {
    const q = mapTQuestionToExamQuestion(raw, { examId: "LIB-T05", ordinal: 1, marks: 10 });
    expect(q.topic).toBe("OTHER_NETWORKING");
    expect(q.difficulty).toBe(2);
  });

  it("marks presentationType multipleChoice and carries the given marks value", () => {
    const q = mapTQuestionToExamQuestion(raw, { examId: "LIB-T05", ordinal: 1, marks: 17 });
    expect(q.presentationType).toBe("multipleChoice");
    expect(q.marks).toBe(17);
  });
});

describe("buildTExamSnapshot", () => {
  const rawQuestions = [
    { topic: "a", level: "x", page: "1", text: "س1", options: ["أ", "ب"], answer: 0, explain: "" },
    { topic: "b", level: "y", page: "2", text: "س2", options: ["أ", "ب"], answer: 1, explain: "" },
    { topic: "c", level: "z", page: "3", text: "س3", options: ["أ", "ب"], answer: 0, explain: "" }
  ];

  it("produces one ExamQuestion per raw question with stable, ordinal-based ids", () => {
    const snapshot = buildTExamSnapshot("LIB-T05", "Class وSubnet وCIDR", rawQuestions);
    expect(snapshot.questions.map(q => q.examQuestionId)).toEqual(["LIB-T05-Q01", "LIB-T05-Q02", "LIB-T05-Q03"]);
  });

  it("totalMarks always sums to exactly 100 regardless of question count", () => {
    const snapshot = buildTExamSnapshot("LIB-T05", "t", rawQuestions);
    expect(snapshot.totalMarks).toBe(100);
  });

  it("running the build twice on the same input produces identical question ids and marks (idempotent)", () => {
    const first = buildTExamSnapshot("LIB-T05", "t", rawQuestions);
    const second = buildTExamSnapshot("LIB-T05", "t", rawQuestions);
    expect(first.questions.map(q => q.examQuestionId)).toEqual(second.questions.map(q => q.examQuestionId));
    expect(first.questions.map(q => q.marks)).toEqual(second.questions.map(q => q.marks));
  });

  it("examId matches the given deterministic id, not a random one", () => {
    const snapshot = buildTExamSnapshot("LIB-T05", "t", rawQuestions);
    expect(snapshot.examId).toBe("LIB-T05");
  });
});
