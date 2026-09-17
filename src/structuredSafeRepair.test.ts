import { describe, it, expect } from "vitest";
import { repairStructuredExamSafely } from "./structuredSafeRepair";
import { validateStructuredExam } from "./examQuality";
import type { StructuredExam } from "./examTypes";

// UX-6d — the deterministic safe-repair pass. It fixes ONLY mechanical states whose correct data is already
// present in the exam, and it NEVER changes semantic content. Every test proves both: the mechanical repair
// happens, and nothing academic is decided.

const sec = (questions: unknown[], over: Record<string, unknown> = {}): unknown => ({ id: "s1", title: "قسم", gradingPolicy: "all", questions, ...over });
const exam = (questions: unknown[], over: Record<string, unknown> = {}): StructuredExam =>
  ({ examId: "e1", title: "t", status: "draft", sections: [sec(questions, over)] } as unknown as StructuredExam);
const q0 = () => (repairStructuredExamSafely(exam([])).exam.sections[0].questions);
void q0;
const firstQ = (r: StructuredExam) => r.sections[0].questions[0] as Record<string, unknown>;
const codes = (r: ReturnType<typeof repairStructuredExamSafely>) => r.changes.map(c => c.code).sort();

describe("A — forward sequence sync (fields.correct → answer.values)", () => {
  const fill = () => ({ examQuestionId: "q1", displayNumber: "1", presentationType: "fillBlank", text: "أكمل ____ و ____", marks: 2,
    fields: [{ id: "f1", kind: "text", correct: "TCP" }, { id: "f2", kind: "text", correct: "UDP" }], answer: { mode: "exactSequence", values: [] } });
  it("rebuilds a missing/stale answer.values from the fields' correct values", () => {
    const r = repairStructuredExamSafely(exam([fill()]));
    expect(firstQ(r.exam).answer).toEqual({ mode: "exactSequence", values: ["TCP", "UDP"] });
    expect(codes(r)).toContain("SEQUENCE_VALUES_REBUILT");
  });
  it("fixes ANSWER_SEQUENCE_MISMATCH without deciding any answer (the correct values were already on the fields)", () => {
    const before = validateStructuredExam(exam([fill()])).filter(i => i.code === "ANSWER_SEQUENCE_MISMATCH");
    expect(before.length).toBe(1);
    const r = repairStructuredExamSafely(exam([fill()]));
    expect(validateStructuredExam(r.exam).filter(i => i.code === "ANSWER_SEQUENCE_MISMATCH")).toHaveLength(0);
  });
  it("is a no-op when values already match (no spurious change)", () => {
    const ok = { ...fill(), answer: { mode: "exactSequence", values: ["TCP", "UDP"] } };
    const r = repairStructuredExamSafely(exam([ok]));
    expect(r.changes).toHaveLength(0);
  });
});

describe("B — reverse sequence sync (answer.values → fields.correct)", () => {
  const fill = () => ({ examQuestionId: "q1", displayNumber: "1", presentationType: "fillBlank", text: "أكمل ____ و ____", marks: 2,
    fields: [{ id: "f1", kind: "text" }, { id: "f2", kind: "text" }], answer: { mode: "exactSequence", values: ["A", "B"] } });
  it("copies values into fields lacking a correct when lengths match exactly and nothing conflicts", () => {
    const r = repairStructuredExamSafely(exam([fill()]));
    const fields = firstQ(r.exam).fields as { correct: string }[];
    expect(fields.map(f => f.correct)).toEqual(["A", "B"]);
    expect(codes(r)).toContain("FIELD_CORRECT_FROM_SEQUENCE");
    expect(validateStructuredExam(r.exam).filter(i => i.code === "FIELD_NO_CORRECT")).toHaveLength(0);
  });
  it("does NOT copy when lengths disagree (would be a guess)", () => {
    const bad = { ...fill(), answer: { mode: "exactSequence", values: ["A"] } };
    const r = repairStructuredExamSafely(exam([bad]));
    expect(r.changes).toHaveLength(0);
    expect((firstQ(r.exam).fields as { correct?: string }[]).every(f => f.correct === undefined)).toBe(true);
  });
  it("does NOT overwrite when an existing field.correct CONFLICTS with the value at its index", () => {
    const conflict = { ...fill(), fields: [{ id: "f1", kind: "text", correct: "X" }, { id: "f2", kind: "text" }], answer: { mode: "exactSequence", values: ["A", "B"] } };
    const r = repairStructuredExamSafely(exam([conflict]));
    expect(r.changes).toHaveLength(0);
    expect((firstQ(r.exam).fields as { correct?: string }[])[0].correct).toBe("X"); // untouched
  });
  it("does NOT copy when any value is empty (still an unknown blank)", () => {
    const gap = { ...fill(), answer: { mode: "exactSequence", values: ["A", ""] } };
    const r = repairStructuredExamSafely(exam([gap]));
    expect(r.changes).toHaveLength(0);
  });
});

describe("C — wordBank select options derived from the canonical bank (never invents a word)", () => {
  const wb = () => ({ examQuestionId: "q1", displayNumber: "1", presentationType: "wordBank", text: "اختر ____", marks: 2,
    wordBank: ["OSPF", "RIP", "BGP"], fields: [{ id: "f1", kind: "select", correct: "OSPF" }], answer: { mode: "exactSequence", values: ["OSPF"] } });
  it("gives a select field with no options the bank's options", () => {
    const r = repairStructuredExamSafely(exam([wb()]));
    const opts = (firstQ(r.exam).fields as { options: { text: string }[] }[])[0].options.map(o => o.text);
    expect(opts).toEqual(["OSPF", "RIP", "BGP"]);
    expect(codes(r)).toContain("WORDBANK_OPTIONS_FROM_BANK");
  });
  it("does NOT overwrite a field that already carries its own (different) options", () => {
    const own = { ...wb(), fields: [{ id: "f1", kind: "select", correct: "OSPF", options: [{ text: "OSPF" }, { text: "RIP" }] }] };
    const r = repairStructuredExamSafely(exam([own]));
    expect(r.changes.filter(c => c.code === "WORDBANK_OPTIONS_FROM_BANK")).toHaveLength(0);
  });
});

describe("safe repair NEVER decides semantic content", () => {
  it("leaves a multipleChoice with no answer completely untouched (never picks an option)", () => {
    const mcq = { examQuestionId: "q1", displayNumber: "1", presentationType: "multipleChoice", text: "س", marks: 2, options: [{ text: "A" }, { text: "B" }], answer: {} };
    const r = repairStructuredExamSafely(exam([mcq]));
    expect(r.changes).toHaveLength(0);
    expect(firstQ(r.exam).answer).toEqual({});
    expect(validateStructuredExam(r.exam).some(i => i.code === "MISSING_ANSWER")).toBe(true);
  });
  it("leaves a trueFalse with no answer untouched (never picks true/false)", () => {
    const tf = { examQuestionId: "q1", displayNumber: "1", presentationType: "trueFalse", text: "س", marks: 1, answer: {} };
    const r = repairStructuredExamSafely(exam([tf]));
    expect(r.changes).toHaveLength(0);
  });
  it("leaves a multiTrueFalse field with no correct untouched (never guesses a boolean)", () => {
    const mtf = { examQuestionId: "q1", displayNumber: "1", presentationType: "multiTrueFalse", text: "س", marks: 2, fields: [{ id: "f1", statement: "x", kind: "boolean" }] };
    const r = repairStructuredExamSafely(exam([mtf]));
    expect(r.changes).toHaveLength(0);
  });
  it("leaves a tableFill / cliFill cell with no correct untouched (never invents a cell/CLI answer)", () => {
    const tf = { examQuestionId: "q1", displayNumber: "1", presentationType: "tableFill", text: "س", marks: 2, tableHeaders: ["a", "b"], tableRows: [["x", ""]], fields: [{ id: "f1", row: 0, column: 1, kind: "text" }] };
    const cli = { examQuestionId: "q2", displayNumber: "2", presentationType: "cliFill", text: "س", marks: 2, cli: "ip [[f1]]", fields: [{ id: "f1", kind: "text" }] };
    const r = repairStructuredExamSafely(exam([tf, cli]));
    expect(r.changes).toHaveLength(0);
  });
  it("leaves matching pairs untouched (never fills a missing right-hand answer)", () => {
    const m = { examQuestionId: "q1", displayNumber: "1", presentationType: "matching", text: "س", marks: 2, fields: [{ id: "f1", label: "L", options: [{ text: "R1" }, { text: "R2" }] }], answer: { text: "" } };
    const r = repairStructuredExamSafely(exam([m]));
    expect(r.changes).toHaveLength(0);
  });
  it("does not change marks, grading policy, section, or question text", () => {
    const fill = { examQuestionId: "q1", displayNumber: "1", presentationType: "fillBlank", text: "أكمل ____", marks: 3, fields: [{ id: "f1", kind: "text", correct: "TCP" }], answer: { mode: "exactSequence", values: [] } };
    const r = repairStructuredExamSafely(exam([fill], { gradingPolicy: "capScore", maxMarks: 60 }));
    expect(firstQ(r.exam).marks).toBe(3);
    expect(firstQ(r.exam).text).toBe("أكمل ____");
    expect(r.exam.sections[0].gradingPolicy).toBe("capScore");
    expect(r.exam.sections[0].maxMarks).toBe(60);
  });
});

describe("idempotency — running twice equals running once", () => {
  const messy = () => exam([
    { examQuestionId: "q1", displayNumber: "1", presentationType: "fillBlank", text: "أكمل ____ و ____", marks: 2, fields: [{ id: "f1", kind: "text", correct: "TCP" }, { id: "f2", kind: "text", correct: "UDP" }], answer: { mode: "exactSequence", values: [] } },
    { examQuestionId: "q2", displayNumber: "2", presentationType: "wordBank", text: "اختر ____", marks: 2, wordBank: ["A", "B"], fields: [{ id: "g1", kind: "select" }], answer: { mode: "exactSequence", values: ["A"] } }
  ]);
  it("the second pass makes zero changes and yields an identical exam", () => {
    const once = repairStructuredExamSafely(messy());
    const twice = repairStructuredExamSafely(once.exam);
    expect(twice.changes).toHaveLength(0);
    expect(JSON.stringify(twice.exam)).toBe(JSON.stringify(once.exam));
  });
  it("does not mutate the input exam object", () => {
    const input = messy();
    const snapshot = JSON.stringify(input);
    repairStructuredExamSafely(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("compound parts are repaired individually", () => {
  it("syncs a fillBlank part's sequence without touching sibling parts or the compound wrapper", () => {
    const compound = { examQuestionId: "q1", displayNumber: "1", presentationType: "compound", text: "أجب", marks: 6, parts: [
      { id: "p1", type: "fillBlank", text: "أكمل ____", marks: 3, fields: [{ id: "f1", kind: "text", correct: "TCP" }], answer: { mode: "exactSequence", values: [] } },
      { id: "p2", type: "multipleChoice", text: "س", marks: 3, options: [{ text: "A" }, { text: "B" }], answer: {} }
    ] };
    const r = repairStructuredExamSafely(exam([compound]));
    const parts = (firstQ(r.exam).parts as Record<string, unknown>[]);
    expect((parts[0].answer as { values: string[] }).values).toEqual(["TCP"]);
    expect(parts[1].answer).toEqual({}); // MCQ part untouched
    expect(r.changes[0].partId).toBe("p1");
  });
});
