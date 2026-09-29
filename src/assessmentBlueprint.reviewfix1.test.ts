import { describe, it, expect } from "vitest";
import * as BP from "./assessmentBlueprint";
import { questionMaxMarks, computeTotalMarks } from "./examBuilderState";
import { networkingBlueprint } from "./assessmentBlueprintFixtures";
import type { AssessmentBlueprintV1 } from "./assessmentTypes";
import type { StructuredExam, BuilderQuestion, BuilderSection } from "./examTypes";
// @ts-expect-error — CommonJS server module without type declarations (the grader's structural authority).
import { examOfficialStats } from "../api/src/lib/exam-structure.js";

// Phase 13C-A — Independent Review Fix 1 (pure layer). Fail-first on dec6ce2.
const codes = (issues: { code: string }[]) => issues.map(i => i.code);
const bpWith = (over: Partial<AssessmentBlueprintV1>): AssessmentBlueprintV1 => ({ ...networkingBlueprint, ...over });
const q = (id: string, marks: number, topic?: string, over: Record<string, unknown> = {}): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text: id, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, ...(topic ? { assessmentMeta: { primaryTopicId: topic } } : {}), ...over } as unknown as BuilderQuestion);
const examOf = (sections: BuilderSection[]): StructuredExam => ({ examId: "e", title: "t", status: "draft", schemaVersion: 2, updatedAt: "2026-01-01T00:00:00.000Z", blueprint: networkingBlueprint, sections } as StructuredExam);
const sum = (rec: Record<string, { officialMarks: number; weightMarks: number }>, k: "officialMarks" | "weightMarks") => Object.values(rec).reduce((s, t) => s + t[k], 0);

describe("R1 — optional context identities obey the stable-id contract", () => {
  it("curriculum with an empty id is an issue (MISSING_CONTEXT_ID at curriculum.id), not a valid identity", () => {
    const issues = BP.validateBlueprint(bpWith({ curriculum: { id: "", label: "X" } }));
    expect(issues).toContainEqual(expect.objectContaining({ code: "MISSING_CONTEXT_ID", path: "curriculum.id" }));
    expect(codes(issues)).not.toContain("MISSING_SUBJECT_ID");
  });
  it("course with an empty label is an issue (MISSING_CONTEXT_LABEL at course.label)", () => {
    expect(BP.validateBlueprint(bpWith({ course: { id: "c", label: "" } }))).toContainEqual(expect.objectContaining({ code: "MISSING_CONTEXT_LABEL", path: "course.label" }));
  });
  it("level with an empty id is an issue; a complete level identity is valid; an absent level is valid", () => {
    expect(codes(BP.validateBlueprint(bpWith({ level: { id: "", label: "Grade 10" } })))).toContain("MISSING_CONTEXT_ID");
    expect(BP.validateBlueprint(bpWith({ level: { id: "grade-10", label: "Grade 10" } }))).toEqual([]);
    const { level: _l, ...noLevel } = networkingBlueprint; void _l;
    expect(BP.validateBlueprint(noLevel)).toEqual([]);
  });
  it("renaming a context label keeps the same stable id (never re-slugged); clearing both fields removes the identity", () => {
    const a = BP.setContextIdentity(networkingBlueprint, "level", { id: "grade-12", label: "الثاني عشر" });
    const b = BP.setContextIdentity(a, "level", { id: a.level!.id, label: "الصف الثاني عشر" });
    expect(b.level).toEqual({ id: "grade-12", label: "الصف الثاني عشر" });
    expect(BP.setContextIdentity(b, "level", { id: "", label: "" }).level).toBeUndefined();
  });
});

describe("R2 — dimension marks are cap-aware and every mark figure names its unit (weightMarks vs officialMarks)", () => {
  it("capScore: q1 5 (topic A) + q2 5 (topic B), section.maxMarks 6 → official 6 total, topics 3 + 3 official, 5 + 5 weight", () => {
    const e = examOf([{ id: "s1", title: "A", gradingPolicy: "capScore", maxMarks: 6, stimuli: {}, questions: [q("q1", 5, "IP_ADDRESSING"), q("q2", 5, "OSI_TCPIP")] }]);
    const p = BP.buildAssessmentProfile(e, networkingBlueprint);
    expect(p.totalOfficialMarks).toBe(6); expect(p.totalWeightMarks).toBe(10);
    expect(p.byTopic).toEqual({ IP_ADDRESSING: { count: 1, weightMarks: 5, officialMarks: 3 }, OSI_TCPIP: { count: 1, weightMarks: 5, officialMarks: 3 } });
    expect(sum(p.byTopic, "officialMarks")).toBe(p.totalOfficialMarks);
    expect(p.bySection).toEqual({ s1: { count: 2, weightMarks: 10, officialMarks: 6, officialFactor: 0.6 } });
    expect(p.totalOfficialMarks).toBe(examOfficialStats(e).totalMarks);
    expect((p as unknown as Record<string, unknown>).totalMarks).toBeUndefined();                       // no ambiguous "marks"
    expect((p.byTopic["IP_ADDRESSING"] as unknown as Record<string, unknown>).marks).toBeUndefined();
  });
  it("firstNAnswered: 3 × 2 marks, requiredAnswers 2, maxMarks 4 → factor 4/6, each question 4/3 official; dimension sums equal the official total", () => {
    const e = examOf([{ id: "s1", title: "F", gradingPolicy: "firstNAnswered", requiredAnswers: 2, maxMarks: 4, stimuli: {}, questions: [q("q1", 2, "IP_ADDRESSING"), q("q2", 2, "IP_ADDRESSING"), q("q3", 2, "OSI_TCPIP")] }]);
    const p = BP.buildAssessmentProfile(e, networkingBlueprint);
    expect(p.totalOfficialMarks).toBe(4); expect(p.totalWeightMarks).toBe(6);
    expect(p.byTopic["IP_ADDRESSING"].officialMarks).toBeCloseTo(8 / 3, 10); expect(p.byTopic["OSI_TCPIP"].officialMarks).toBeCloseTo(4 / 3, 10);
    expect(p.byTopic["IP_ADDRESSING"].weightMarks).toBe(4); expect(p.byTopic["OSI_TCPIP"].weightMarks).toBe(2);
    expect(sum(p.byTopic, "officialMarks")).toBeCloseTo(p.totalOfficialMarks, 10);
    expect(sum(p.byType, "officialMarks")).toBeCloseTo(4, 10); expect(sum(p.byDifficulty, "officialMarks")).toBeCloseTo(4, 10);
    expect(p.bySection.s1.officialFactor).toBeCloseTo(2 / 3, 10);
    expect(p.totalOfficialMarks).toBe(examOfficialStats(e).totalMarks);
  });
  it("all policy: officialMarks === weightMarks === questionMaxMarks for every dimension; a stale maxMarks is ignored (factor 1)", () => {
    const e = examOf([{ id: "s1", title: "A", gradingPolicy: "all", maxMarks: 3, stimuli: {}, questions: [q("q1", 4, "IP_ADDRESSING"), q("q2", 6, "OSI_TCPIP", { presentationType: "shortAnswer" })] }]);
    const p = BP.buildAssessmentProfile(e, networkingBlueprint);
    expect(p.byTopic).toEqual({ IP_ADDRESSING: { count: 1, weightMarks: 4, officialMarks: 4 }, OSI_TCPIP: { count: 1, weightMarks: 6, officialMarks: 6 } });
    expect(p.byType).toEqual({ multipleChoice: { count: 1, weightMarks: 4, officialMarks: 4 }, shortAnswer: { count: 1, weightMarks: 6, officialMarks: 6 } });
    expect(p.bySection).toEqual({ s1: { count: 2, weightMarks: 10, officialMarks: 10, officialFactor: 1 } });
    expect(p.totalOfficialMarks).toBe(10); expect(p.totalWeightMarks).toBe(10); expect(computeTotalMarks(e)).toBe(10);
  });
  it("compound parity: part-mark distribution (never q.marks) is the weight; a capped section scales it like any other question", () => {
    const compound = { examQuestionId: "c1", presentationType: "compound", text: "مركب", marks: 10, parts: [
      { id: "p1", type: "shortAnswer", text: "أ", marks: 2, answer: { text: "x" } }, { id: "p2", type: "shortAnswer", text: "ب", marks: 3, answer: { text: "y" } }
    ], assessmentMeta: { primaryTopicId: "SUBNET_CIDR" } } as unknown as BuilderQuestion;
    const e = examOf([
      { id: "s1", title: "A", gradingPolicy: "all", stimuli: {}, questions: [compound] },
      { id: "s2", title: "B", gradingPolicy: "capScore", maxMarks: 5, stimuli: {}, questions: [{ ...compound, examQuestionId: "c2" } as BuilderQuestion, q("q3", 5, "IP_ADDRESSING")] }
    ]);
    const p = BP.buildAssessmentProfile(e, networkingBlueprint);
    expect(questionMaxMarks(compound)).toBe(5);
    expect(p.byTopic["SUBNET_CIDR"]).toEqual({ count: 2, weightMarks: 10, officialMarks: 5 + 2.5 });
    expect(p.byTopic["IP_ADDRESSING"]).toEqual({ count: 1, weightMarks: 5, officialMarks: 2.5 });
    expect(p.totalOfficialMarks).toBe(10); expect(p.totalOfficialMarks).toBe(examOfficialStats(e).totalMarks); expect(p.totalWeightMarks).toBe(15);
    expect(BP.officialQuestionMarks(compound, e.sections[1])).toBe(2.5); expect(BP.officialQuestionMarks(compound, e.sections[0])).toBe(5);
  });
  it("documented invariant: for every dimension Σ officialMarks (+ unclassified) = totalOfficialMarks and Σ weightMarks = totalWeightMarks; a zero-weight capped section attributes 0", () => {
    const e = examOf([
      { id: "s1", title: "A", gradingPolicy: "capScore", maxMarks: 6, stimuli: {}, questions: [q("q1", 5, "IP_ADDRESSING"), q("q2", 5), q("q3", 0, "OSI_TCPIP")] },
      { id: "s2", title: "B", gradingPolicy: "capScore", stimuli: {}, questions: [q("q4", 3, "SUBNET_CIDR")] },                       // no cap → factor 1
      { id: "s3", title: "C", gradingPolicy: "capScore", maxMarks: 4, stimuli: {}, questions: [q("q5", 0, "SUBNET_CIDR")] }            // zero weight → nothing attributable
    ]);
    const p = BP.buildAssessmentProfile(e, networkingBlueprint);
    expect(p.totalOfficialMarks).toBe(computeTotalMarks(e)); expect(p.totalOfficialMarks).toBe(6 + 3 + 4); expect(p.totalWeightMarks).toBe(13);
    expect(sum(p.byTopic, "officialMarks") + p.unclassified.officialMarks).toBeCloseTo(6 + 3 + 0, 10);           // s3's 4 official marks have no question weight to attach to
    expect(p.unattributedOfficialMarks).toBe(4);
    expect(sum(p.byTopic, "officialMarks") + p.unclassified.officialMarks + p.unattributedOfficialMarks).toBeCloseTo(p.totalOfficialMarks, 10);
    expect(sum(p.byTopic, "weightMarks") + p.unclassified.weightMarks).toBe(p.totalWeightMarks);
    for (const dim of [p.byDifficulty, p.byType, p.byCognitiveLevel]) { expect(sum(dim, "officialMarks") + p.unattributedOfficialMarks).toBeCloseTo(p.totalOfficialMarks, 10); expect(sum(dim, "weightMarks")).toBe(p.totalWeightMarks); }
    expect(sum(p.bySection, "officialMarks")).toBe(p.totalOfficialMarks); expect(sum(p.bySection, "weightMarks")).toBe(p.totalWeightMarks);
    expect(p.bySection.s3).toEqual({ count: 1, weightMarks: 0, officialMarks: 4, officialFactor: 0 });
    expect(p.unclassified).toEqual({ count: 1, weightMarks: 5, officialMarks: 3 }); expect(p.unclassifiedQuestions).toEqual(["q2"]);
  });
});

describe("R4 — section constraint references are validated against the exam's sections when context is available", () => {
  const withSection = (ref: string) => bpWith({ constraints: [{ id: "c-sec", dimension: "section", ref, metric: "count", unit: "absolute", target: 2 }] });
  const sections = (...ids: string[]) => ids.map(id => ({ id, title: "عنوان " + id, gradingPolicy: "all", stimuli: {}, questions: [] } as BuilderSection));
  it("a valid section ref → no issue; a missing ref → BROKEN_SECTION_REF with the constraint path and refId", () => {
    expect(BP.validateBlueprint(withSection("s2"), { sectionIds: ["s1", "s2"] })).toEqual([]);
    expect(BP.validateBlueprint(withSection("missing-section"), { sectionIds: ["s1", "s2"] })).toEqual([
      expect.objectContaining({ code: "BROKEN_SECTION_REF", path: "constraints[0].ref", refId: "c-sec" })
    ]);
  });
  it("deleting the referenced section makes the issue appear; renaming the section title (same id) keeps it valid; reordering is irrelevant", () => {
    const bp = withSection("s2");
    const before = examOf(sections("s1", "s2"));
    expect(BP.validateBlueprintForExam(bp, before)).toEqual([]);
    const renamed = { ...before, sections: before.sections.map(s => (s.id === "s2" ? { ...s, title: "اسم جديد" } : s)) };
    expect(BP.validateBlueprintForExam(bp, renamed)).toEqual([]);
    const reordered = { ...before, sections: [...before.sections].reverse() };
    expect(BP.validateBlueprintForExam(bp, reordered)).toEqual([]);
    const deleted = { ...before, sections: before.sections.filter(s => s.id !== "s2") };
    expect(codes(BP.validateBlueprintForExam(bp, deleted))).toEqual(["BROKEN_SECTION_REF"]);
  });
  it("standalone validation (no exam context) stays usable for templates and fixtures: a section ref is not judged, an empty ref still is", () => {
    expect(BP.validateBlueprint(withSection("any-section"))).toEqual([]);
    expect(codes(BP.validateBlueprint(withSection("")))).toContain("MISSING_REF");
    expect(BP.validateBlueprint(networkingBlueprint)).toEqual([]);
  });
});

describe("F1 — removeTopic removes ONLY the topic; dangling relations become validation issues (never silently rewritten)", () => {
  it("children keep their parentId, objectives keep their topicId, constraints keep their ref; the validator reports them", () => {
    const bp = bpWith({ objectives: [{ id: "o1", label: "هدف", topicId: "IP_ADDRESSING" }], constraints: [{ id: "c1", dimension: "topic", ref: "IP_ADDRESSING", metric: "count", unit: "absolute", target: 1 }] });
    const after = BP.removeTopic(bp, "IP_ADDRESSING");
    expect(after.topics.map(t => t.id)).toEqual(["NETWORK_BASICS", "OSI_TCPIP", "SUBNET_CIDR"]);
    expect(after.topics.find(t => t.id === "SUBNET_CIDR")!.parentId).toBe("IP_ADDRESSING");
    expect(after.objectives[0].topicId).toBe("IP_ADDRESSING"); expect(after.constraints[0].ref).toBe("IP_ADDRESSING");
    expect(codes(BP.validateBlueprint(after))).toEqual(expect.arrayContaining(["BROKEN_PARENT_REF", "BROKEN_OBJECTIVE_TOPIC_REF", "BROKEN_TOPIC_REF"]));
    expect(bp.topics).toHaveLength(4);                                                                  // input untouched
  });
});
