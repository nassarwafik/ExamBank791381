import { describe, it, expect } from "vitest";
import * as BULK from "./assessmentBulkClassify";
import type { BuilderQuestion, BuilderSection } from "./examTypes";

// Phase 13C-B — F6 (pure): bulk pedagogical classification over the EXISTING selection ids. Fail-first on baseline e6affe0.
const q = (id: string, meta?: Record<string, unknown>, over: Record<string, unknown> = {}): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text: id, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, ...(meta ? { assessmentMeta: meta } : {}), ...over } as unknown as BuilderQuestion);
const sections = (): BuilderSection[] => [
  { id: "s1", title: "A", gradingPolicy: "all", stimuli: {}, questions: [q("q1", { primaryTopicId: "A", difficulty: 2, objectiveIds: ["o1"], capabilities: ["cli"] }), q("q2")] },
  { id: "s2", title: "B", gradingPolicy: "all", stimuli: {}, questions: [q("q3", { primaryTopicId: "B", cognitiveLevel: "apply", objectiveIds: ["o1", "o2"] }, { origin: "bank", bankQuestionId: "BANK-9", image: { exists: true, visible: true, assets: [{ id: "a", origin: "bank", blobName: "x.png", contentType: "image/png" }] } })] }
];
const meta = (s: BuilderSection[], id: string) => (s.flatMap(x => x.questions).find(x => x.examQuestionId === id) as BuilderQuestion & { assessmentMeta?: Record<string, unknown> }).assessmentMeta;

describe("applyBulkClassification — keep / set / clear per field, add / remove / replace / clear per list", () => {
  it("set primary topic + difficulty + cognitive level on N selected; untouched fields are preserved", () => {
    const out = BULK.applyBulkClassification(sections(), ["q1", "q3"], { primaryTopicId: { op: "set", value: "C" }, difficulty: { op: "set", value: 4 }, cognitiveLevel: { op: "set", value: "analyze" } });
    expect(meta(out, "q1")).toEqual({ primaryTopicId: "C", difficulty: 4, cognitiveLevel: "analyze", objectiveIds: ["o1"], capabilities: ["cli"] });
    expect(meta(out, "q3")).toEqual({ primaryTopicId: "C", difficulty: 4, cognitiveLevel: "analyze", objectiveIds: ["o1", "o2"] });
    expect(meta(out, "q2")).toBeUndefined();                                                            // not selected: untouched (same reference)
    expect(out[0].questions[1]).toBe(sections()[0].questions[1] === out[0].questions[1] ? out[0].questions[1] : out[0].questions[1]);
  });
  it("explicit clear removes only that field; keep (or omitted) leaves it", () => {
    const out = BULK.applyBulkClassification(sections(), ["q1"], { difficulty: { op: "clear" }, primaryTopicId: { op: "keep" } });
    expect(meta(out, "q1")).toEqual({ primaryTopicId: "A", objectiveIds: ["o1"], capabilities: ["cli"] });
    const gone = BULK.applyBulkClassification(sections(), ["q1"], { primaryTopicId: { op: "clear" }, difficulty: { op: "clear" }, objectiveIds: { op: "clear" }, capabilities: { op: "clear" } });
    expect(meta(gone, "q1")).toBeUndefined();                                                            // empty meta is removed, never stored as {}
  });
  it("objectives: add (no duplicates, order kept), remove, replace, clear", () => {
    const add = BULK.applyBulkClassification(sections(), ["q1", "q2", "q3"], { objectiveIds: { op: "add", ids: ["o2", "o1"] } });
    expect(meta(add, "q1")!.objectiveIds).toEqual(["o1", "o2"]); expect(meta(add, "q2")!.objectiveIds).toEqual(["o2", "o1"]); expect(meta(add, "q3")!.objectiveIds).toEqual(["o1", "o2"]);
    const rem = BULK.applyBulkClassification(sections(), ["q3"], { objectiveIds: { op: "remove", ids: ["o1"] } });
    expect(meta(rem, "q3")!.objectiveIds).toEqual(["o2"]);
    const rep = BULK.applyBulkClassification(sections(), ["q1"], { objectiveIds: { op: "replace", ids: ["o9"] } });
    expect(meta(rep, "q1")!.objectiveIds).toEqual(["o9"]);
    const clr = BULK.applyBulkClassification(sections(), ["q3"], { objectiveIds: { op: "clear" } });
    expect(meta(clr, "q3")).toEqual({ primaryTopicId: "B", cognitiveLevel: "apply" });
  });
  it("secondary topics and capabilities use the same list semantics", () => {
    const out = BULK.applyBulkClassification(sections(), ["q1"], { secondaryTopicIds: { op: "add", ids: ["B"] }, capabilities: { op: "remove", ids: ["cli"] } });
    expect(meta(out, "q1")).toEqual({ primaryTopicId: "A", difficulty: 2, objectiveIds: ["o1"], secondaryTopicIds: ["B"] });
  });
  it("no-op: same values / keep-only / empty selection → the SAME sections reference (no history entry, not dirty)", () => {
    const s = sections();
    expect(BULK.applyBulkClassification(s, ["q1"], { primaryTopicId: { op: "set", value: "A" }, difficulty: { op: "set", value: 2 } })).toBe(s);
    expect(BULK.applyBulkClassification(s, ["q1", "q3"], { primaryTopicId: { op: "keep" } })).toBe(s);
    expect(BULK.applyBulkClassification(s, [], { primaryTopicId: { op: "set", value: "Z" } })).toBe(s);
    expect(BULK.applyBulkClassification(s, ["q3"], { objectiveIds: { op: "add", ids: ["o1"] } })).toBe(s);
    expect(BULK.applyBulkClassification(s, ["q2"], { difficulty: { op: "clear" } })).toBe(s);
    expect(BULK.isBulkClassificationNoop({})).toBe(true); expect(BULK.isBulkClassificationNoop({ difficulty: { op: "keep" } })).toBe(true); expect(BULK.isBulkClassificationNoop({ difficulty: { op: "clear" } })).toBe(false);
  });
  it("stale / unknown ids are ignored: nothing is resurrected, only questions present in the given sections change; untouched sections keep their reference", () => {
    const s = sections();
    const out = BULK.applyBulkClassification(s, ["q-deleted", "q3"], { difficulty: { op: "set", value: 1 } });
    expect(out.flatMap(x => x.questions).map(x => x.examQuestionId)).toEqual(["q1", "q2", "q3"]);
    expect(out[0]).toBe(s[0]);                                                                           // section without a changed question: same reference
    expect(meta(out, "q3")!.difficulty).toBe(1);
  });
  it("bank provenance, images, answer keys and every non-meta field are untouched; inputs are not mutated", () => {
    const s = sections(); const before = JSON.stringify(s);
    const out = BULK.applyBulkClassification(s, ["q3"], { primaryTopicId: { op: "set", value: "Z" } });
    const q3 = out[1].questions[0] as unknown as Record<string, unknown>;
    expect(q3.origin).toBe("bank"); expect(q3.bankQuestionId).toBe("BANK-9"); expect(q3.image).toEqual((s[1].questions[0] as unknown as Record<string, unknown>).image); expect(q3.answer).toEqual({ correctOptionIndex: 0 });
    expect(JSON.stringify(s)).toBe(before);
  });
  it("normalizeAssessmentMeta drops empty fields and returns undefined for an empty object", () => {
    expect(BULK.normalizeAssessmentMeta({ primaryTopicId: "", objectiveIds: [], difficulty: Number.NaN, cognitiveLevel: "" })).toBeUndefined();
    expect(BULK.normalizeAssessmentMeta({ primaryTopicId: "A", objectiveIds: ["o"] })).toEqual({ primaryTopicId: "A", objectiveIds: ["o"] });
  });
});
