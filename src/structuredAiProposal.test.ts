import { describe, it, expect } from "vitest";
import { questionFingerprint, collectAiTargets, proposalIsFresh, applyProposal, AI_ELIGIBLE_CODES, groupOfCode, type StructuredAiProposal } from "./structuredAiProposal";
import { validateStructuredExam } from "./examQuality";
import type { StructuredExam } from "./examTypes";

const exam = (questions: unknown[]): StructuredExam =>
  ({ examId: "e1", title: "t", status: "draft", sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", questions }] } as unknown as StructuredExam);
const proposal = (over: Partial<StructuredAiProposal>): StructuredAiProposal =>
  ({ proposalId: "p", sectionId: "s1", questionId: "q1", presentationType: "multipleChoice", issueCodes: ["MISSING_ANSWER"], fingerprint: "", patch: null, status: "proposed", explanation: "", statusReason: "", ...over });

describe("fingerprint binds a proposal to the exact answerable state", () => {
  const mcq = { examQuestionId: "q1", presentationType: "multipleChoice", text: "س", marks: 2, options: [{ text: "A" }, { text: "B" }], answer: {} };
  it("is stable across identical states and changes when text/options change", () => {
    expect(questionFingerprint(mcq)).toBe(questionFingerprint({ ...mcq }));
    expect(questionFingerprint(mcq)).not.toBe(questionFingerprint({ ...mcq, text: "س2" }));
    expect(questionFingerprint(mcq)).not.toBe(questionFingerprint({ ...mcq, options: [{ text: "A" }, { text: "C" }] }));
  });
  it("does NOT change when only the (secret) answer changes — the answer is what a proposal supplies", () => {
    expect(questionFingerprint(mcq)).toBe(questionFingerprint({ ...mcq, answer: { correctOptionIndex: 1 } }));
  });
});

describe("collectAiTargets — only unresolved, AI-eligible, auto-graded questions", () => {
  it("targets an MCQ with a missing answer, and NOT a shortAnswer (manual grading allowed)", () => {
    const e = exam([
      { examQuestionId: "q1", presentationType: "multipleChoice", text: "س", marks: 2, options: [{ text: "A" }, { text: "B" }], answer: {} },
      { examQuestionId: "q2", presentationType: "shortAnswer", text: "س", marks: 2, answer: {} }
    ]);
    const targets = collectAiTargets(e, validateStructuredExam(e));
    expect(targets.map(t => t.questionId)).toEqual(["q1"]);
  });
  it("does NOT target marks/policy issues (teacher decision, never AI)", () => {
    const e = exam([{ examQuestionId: "q1", presentationType: "multipleChoice", text: "س", marks: 0, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } }]);
    const issues = validateStructuredExam(e);
    expect(issues.some(i => i.code === "MARKS_PROBLEM")).toBe(true);
    expect(collectAiTargets(e, issues)).toHaveLength(0);
    expect([...AI_ELIGIBLE_CODES]).not.toContain("MARKS_PROBLEM");
    expect([...AI_ELIGIBLE_CODES]).not.toContain("GRADING_POLICY_REQUIRED");
  });
  it("targets each AI-supported compound PART, never the whole compound question", () => {
    const e = exam([{ examQuestionId: "q1", presentationType: "compound", text: "أجب", marks: 6, parts: [
      { id: "p1", type: "multipleChoice", text: "س", marks: 3, options: [{ text: "A" }, { text: "B" }], answer: {} },
      { id: "p2", type: "shortAnswer", text: "س", marks: 3, answer: {} }
    ] }]);
    const targets = collectAiTargets(e, validateStructuredExam(e));
    expect(targets.map(t => t.partId)).toEqual(["p1"]);
    expect(targets[0].presentationType).toBe("multipleChoice");
  });
});

describe("proposalIsFresh / stale detection", () => {
  const mcq = { examQuestionId: "q1", presentationType: "multipleChoice", text: "س", marks: 2, options: [{ text: "A" }, { text: "B" }], answer: {} };
  it("fresh when the fingerprint matches; stale after the question is edited", () => {
    const e = exam([mcq]);
    const p = proposal({ fingerprint: questionFingerprint(mcq), patch: { correctOptionIndex: 1 } });
    expect(proposalIsFresh(e, p)).toBe(true);
    const edited = exam([{ ...mcq, text: "نص جديد" }]);
    expect(proposalIsFresh(edited, p)).toBe(false);
  });
});

describe("applyProposal — merges ONLY the answer, preserves protected fields", () => {
  const mcq = { examQuestionId: "q1", displayNumber: "7", presentationType: "multipleChoice", text: "س", marks: 4, groupId: "g", options: [{ text: "A" }, { text: "B" }, { text: "C" }], answer: {} };
  it("sets correctOptionIndex and keeps id/marks/text/options/displayNumber/groupId", () => {
    const e = exam([mcq]);
    const p = proposal({ fingerprint: questionFingerprint(mcq), patch: { correctOptionIndex: 2 } });
    const { exam: out, applied } = applyProposal(e, p);
    const q = out.sections[0].questions[0] as Record<string, unknown>;
    expect(applied).toBe(true);
    expect(q.answer).toEqual({ correctOptionIndex: 2 });
    expect(q).toMatchObject({ examQuestionId: "q1", displayNumber: "7", marks: 4, groupId: "g", text: "س" });
    expect((q.options as { text: string }[]).map(o => o.text)).toEqual(["A", "B", "C"]);
  });
  it("refuses an out-of-range index (never applied)", () => {
    const e = exam([mcq]);
    const p = proposal({ fingerprint: questionFingerprint(mcq), patch: { correctOptionIndex: 9 } });
    const { applied } = applyProposal(e, p);
    expect(applied).toBe(false);
  });
  it("does NOT apply a stale proposal", () => {
    const e = exam([mcq]);
    const p = proposal({ fingerprint: "different", patch: { correctOptionIndex: 1 } });
    const { exam: out, applied } = applyProposal(e, p);
    expect(applied).toBe(false);
    expect(out).toBe(e);
  });
  it("fillBlank: writes field.correct AND the aligned exactSequence values", () => {
    const fill = { examQuestionId: "q1", presentationType: "fillBlank", text: "أكمل ____ و ____", marks: 2, fields: [{ id: "f1", kind: "text" }, { id: "f2", kind: "text" }], answer: { mode: "exactSequence", values: [] } };
    const e = exam([fill]);
    const p = proposal({ presentationType: "fillBlank", fingerprint: questionFingerprint(fill), patch: { fieldValues: { f1: "TCP", f2: "UDP" } } });
    const q = applyProposal(e, p).exam.sections[0].questions[0] as Record<string, unknown>;
    expect((q.fields as { correct: string }[]).map(f => f.correct)).toEqual(["TCP", "UDP"]);
    expect(q.answer).toEqual({ mode: "exactSequence", values: ["TCP", "UDP"] });
    expect(validateStructuredExam(applyProposal(e, p).exam).some(i => i.code === "FIELD_NO_CORRECT")).toBe(false);
  });
  it("multiTrueFalse: writes a boolean per field", () => {
    const mtf = { examQuestionId: "q1", presentationType: "multiTrueFalse", text: "س", marks: 2, fields: [{ id: "f1", statement: "a", kind: "boolean" }, { id: "f2", statement: "b", kind: "boolean" }] };
    const e = exam([mtf]);
    const p = proposal({ presentationType: "multiTrueFalse", fingerprint: questionFingerprint(mtf), patch: { fieldBooleans: { f1: true, f2: false } } });
    const q = applyProposal(e, p).exam.sections[0].questions[0] as Record<string, unknown>;
    expect((q.fields as { correct: boolean }[]).map(f => f.correct)).toEqual([true, false]);
  });
  it("compound part: patches only the targeted part, other parts untouched", () => {
    const compound = { examQuestionId: "q1", presentationType: "compound", text: "أجب", marks: 6, parts: [
      { id: "p1", type: "multipleChoice", text: "س", marks: 3, options: [{ text: "A" }, { text: "B" }], answer: {} },
      { id: "p2", type: "multipleChoice", text: "س2", marks: 3, options: [{ text: "C" }, { text: "D" }], answer: {} }
    ] };
    const e = exam([compound]);
    const p = proposal({ partId: "p1", presentationType: "multipleChoice", fingerprint: questionFingerprint({ ...compound.parts[0], id: "p1" }), patch: { correctOptionIndex: 1 } });
    const parts = (applyProposal(e, p).exam.sections[0].questions[0] as { parts: Record<string, unknown>[] }).parts;
    expect(parts[0].answer).toEqual({ correctOptionIndex: 1 });
    expect(parts[1].answer).toEqual({}); // untouched
  });
});

describe("groupOfCode — categorises by CODE, not by message text", () => {
  it("maps codes to the five summary groups", () => {
    expect(groupOfCode("MISSING_ANSWER")).toBe("missingAnswer");
    expect(groupOfCode("ANSWER_SEQUENCE_MISMATCH")).toBe("sequenceMismatch");
    expect(groupOfCode("MARKS_PROBLEM")).toBe("marksSection");
    expect(groupOfCode("GRADING_POLICY_REQUIRED")).toBe("marksSection");
    expect(groupOfCode("MISSING_OPTIONS")).toBe("structural");
    expect(groupOfCode("EMPTY_SECTION")).toBe("manual");
  });
});
