import { describe, it, expect } from "vitest";
import { gradeQuestion } from "../src/lib/assignment-grading.js";
import { newSessionDoc, applyJoin, applyStart, applyAnswer, findParticipant, findAnswer } from "../src/lib/live-challenge-session-store.js";

// Phase 4B — GRADING AUTHORITY integration. The live round engine must reuse the CENTRAL grader
// (assignment-grading `gradeQuestion`) as the single academic authority — never a games-specific grader. These tests
// drive `applyAnswer(..., q => gradeQuestion(q, response), ...)` (exactly the wiring the student endpoint uses) across
// representative question types and assert the stored grade equals what the central grader returns. They intentionally
// do NOT re-test every central-grader branch (that lives in the grader's own suite) — they prove the reuse contract.

// A one-question snapshot whose only question is `q`, wrapped as the challenge entry shape { question }.
function activeWith(q) {
  const doc = newSessionDoc({ joinCode: "G2G2G2", teacherId: "t1", challengeId: "cg", challengeTitle: "g", classId: "cl1", participants: [{ studentId: "s1", displayName: "أ" }], challengeSnapshot: { questions: [{ question: q }] }, now: "t" });
  applyJoin(doc, "s1", "j"); applyStart(doc, "t");
  return doc;
}
function submit(q, response) {
  const doc = activeWith(q);
  applyAnswer(doc, "s1", 1, response, x => gradeQuestion(x, response), "a");
  return findAnswer(findParticipant(doc, "s1"), 1).grade;
}

describe("live challenge grading reuses the central grader", () => {
  it("multipleChoice: correct/incorrect match gradeQuestion exactly", () => {
    const q = { examQuestionId: "mc", presentationType: "multipleChoice", text: "؟", options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 1 }, marks: 2 };
    expect(submit(q, { kind: "choice", index: 1 })).toEqual(gradeQuestion(q, { kind: "choice", index: 1 }));
    expect(submit(q, { kind: "choice", index: 1 })).toMatchObject({ score: 2, correct: true });
    expect(submit(q, { kind: "choice", index: 0 })).toMatchObject({ score: 0, correct: false });
  });
  it("trueFalse: boolean answer.correct is honoured via the central grader", () => {
    const q = { examQuestionId: "tf", presentationType: "trueFalse", text: "؟", marks: 1, answer: { correct: true } };
    expect(submit(q, { kind: "choice", index: 0 })).toMatchObject({ score: 1, correct: true });   // index 0 = صحيح
    expect(submit(q, { kind: "choice", index: 1 })).toMatchObject({ score: 0, correct: false });
  });
  it("fields (generalized): partial scoring is delegated to the grader", () => {
    const q = { examQuestionId: "f1", presentationType: "cliFill", text: "؟", marks: 2, fields: [{ id: "a", correct: "ping" }, { id: "b", correct: "ip" }] };
    const resp = { kind: "fields", values: { a: "ping", b: "wrong" } };
    expect(submit(q, resp)).toEqual(gradeQuestion(q, resp));   // exact reuse (partial credit shape included)
  });
  it("compound: per-part aggregation comes from the grader (parts preserved)", () => {
    const q = { examQuestionId: "cmp", presentationType: "compound", text: "؟", parts: [
      { id: "p1", type: "multipleChoice", options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, marks: 1 },
      { id: "p2", type: "trueFalse", answer: { correct: true }, marks: 1 },
    ] };
    const resp = { kind: "compound", parts: { p1: { kind: "choice", index: 0 }, p2: { kind: "choice", index: 0 } } };
    const grade = submit(q, resp);
    expect(grade).toEqual(gradeQuestion(q, resp));
    expect(Array.isArray(grade.parts)).toBe(true);
    expect(grade.parts).toHaveLength(2);
  });
  it("open text / manual-review: the answer is accepted and manualReview is retained (no fabricated correctness)", () => {
    const q = { examQuestionId: "op", presentationType: "open", text: "اشرح؟", marks: 3 };
    const grade = submit(q, { kind: "text", value: "إجابة مقالية" });
    expect(grade).toEqual(gradeQuestion(q, { kind: "text", value: "إجابة مقالية" }));
    expect(grade.manualReview).toBe(true);
    expect(grade.correct).toBe(false);   // never fabricated as correct
  });
});
