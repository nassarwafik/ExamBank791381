import { describe, it, expect, vi } from "vitest";
import type { StructuredExam } from "../examTypes";

// Phase 21W — the guards of editorQualityNotes against inputs a real exam never produces today: a warning naming a question the exam
// does not hold is NOT linked (shown without a question), and an identical warning is listed once.
vi.mock("../aiComposer/composerQuality", () => ({
  qualityWarnings: () => [
    { code: "X_LEAK", message: "على سؤال موجود", questionId: "q1" },
    { code: "X_LEAK", message: "على سؤال موجود", questionId: "q1" },
    { code: "X_STALE", message: "على سؤال غير موجود", questionId: "zzz" }
  ]
}));
const { editorQualityNotes } = await import("./qualityNotes");
const exam = { examId: "E", title: "t", sections: [{ id: "s1", title: "س", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "x", marks: 1 }] }] } as unknown as StructuredExam;

describe("21W-GUARD", () => {
  it("an unknown question id is never linked; identical notes once", () => {
    expect(editorQualityNotes(exam).map(n => [n.code, n.questionId, n.number])).toEqual([["X_LEAK", "q1", 1], ["X_STALE", null, null]]);
  });
});
