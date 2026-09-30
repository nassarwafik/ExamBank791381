import { describe, it, expect } from "vitest";
import * as FIN from "./examFinalization";
import { validateStructuredExam } from "./examQuality";
import { networkingBlueprint } from "./assessmentBlueprintFixtures";
import type { AssessmentBlueprintV1 } from "./assessmentTypes";
import type { StructuredExam, BuilderQuestion, BuilderSection } from "./examTypes";

// Phase 13C-C — F4: ONE canonical authoring finalization authority combining structural validity (examQuality, unconditional)
// with the Blueprint quality policy (13C-C). Fail-first on bd10c72.
const mcq = (id: string, marks: number, meta?: Record<string, unknown>, over: Record<string, unknown> = {}): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text: "سؤال " + id, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, ...(meta ? { assessmentMeta: meta } : {}), ...over } as unknown as BuilderQuestion);
const sec = (id: string, questions: BuilderQuestion[], over: Partial<BuilderSection> = {}): BuilderSection => ({ id, title: "قسم " + id, gradingPolicy: "all", stimuli: {}, questions, ...over } as BuilderSection);
const exam = (sections: BuilderSection[], blueprint?: AssessmentBlueprintV1): StructuredExam => ({ examId: "e", title: "امتحان", status: "draft", schemaVersion: 2, updatedAt: "2026-01-01T00:00:00.000Z", ...(blueprint ? { blueprint } : {}), sections } as StructuredExam);
const BP = (policy?: unknown): AssessmentBlueprintV1 => ({ ...networkingBlueprint, constraints: [{ id: "ipv4", dimension: "topic", ref: "IP_ADDRESSING", metric: "marks", unit: "percent", min: 30 }], ...(policy ? { qualityPolicy: policy as never } : {}) });
const pol = (effect: "warning" | "block-finalization", enabled = true, rules?: unknown[]) => ({ schemaVersion: 1, enabled, rules: rules ?? [{ id: "r", enabled: true, source: { kind: "constraint", constraintId: "ipv4" }, relations: ["below-min"], effect }] });
const valid = (bp?: AssessmentBlueprintV1) => exam([sec("s1", [mcq("q1", 2, { primaryTopicId: "IP_ADDRESSING" }), mcq("q2", 6, { primaryTopicId: "OSI_TCPIP" })])], bp);   // ipv4 = 25% → below-min
const structuralError = (bp?: AssessmentBlueprintV1) => exam([sec("s1", [mcq("q1", 2, { primaryTopicId: "IP_ADDRESSING" }, { answer: undefined }), mcq("q2", 6, { primaryTopicId: "OSI_TCPIP" })])], bp);   // missing answer key

describe("F4 — evaluateExamFinalization", () => {
  it("A: structurally valid + no blueprint / no policy → canFinalize, empty blockers, structural issues identical to validateStructuredExam", () => {
    const d = FIN.evaluateExamFinalization(valid());
    expect(d.canFinalize).toBe(true); expect(d.blockers).toEqual([]); expect(d.coverage).toBeNull(); expect(d.qualityReport).toBeNull(); expect(d.policyIssues).toEqual([]);
    expect(d.structuralIssues).toEqual(validateStructuredExam(valid()));
    const withBp = FIN.evaluateExamFinalization(valid(BP()));
    expect(withBp.canFinalize).toBe(true); expect(withBp.coverage!.constraints[0].relation).toBe("below-min"); expect(withBp.qualityReport).toMatchObject({ enabled: false, canFinalize: true });   // 13C-B facts available, no implicit policy
  });
  it("B: structural error + no policy → false; the blocker is the structural issue itself (kind structural)", () => {
    const d = FIN.evaluateExamFinalization(structuralError());
    expect(d.canFinalize).toBe(false); expect(d.structuralErrors.length).toBeGreaterThan(0);
    expect(d.blockers.every(b => b.kind === "structural")).toBe(true); expect(d.blockers.length).toBe(d.structuralErrors.length);
  });
  it("C: valid + quality warning only → true, warning listed with evidence", () => {
    const d = FIN.evaluateExamFinalization(valid(BP(pol("warning"))));
    expect(d.canFinalize).toBe(true); expect(d.blockers).toEqual([]);
    expect(d.warnings).toEqual([expect.objectContaining({ kind: "quality", id: "r", evidence: ["q1"] })]);
    expect(d.warnings[0].message).toMatch(/عنونة IPv4/);
  });
  it("D: valid + triggered blocker → false with the quality blocker", () => {
    const d = FIN.evaluateExamFinalization(valid(BP(pol("block-finalization"))));
    expect(d.canFinalize).toBe(false); expect(d.blockers).toEqual([expect.objectContaining({ kind: "quality", id: "r", evidence: ["q1"] })]);
    expect(d.qualityReport!.blockerCount).toBe(1);
  });
  it("E: structural error + quality blocker → false, BOTH displayed, structural first", () => {
    const d = FIN.evaluateExamFinalization(structuralError(BP(pol("block-finalization"))));
    expect(d.canFinalize).toBe(false); expect(d.blockers.map(b => b.kind)).toEqual([...d.structuralErrors.map(() => "structural"), "quality"]);
  });
  it("F: policy disabled → structural behaviour only (facts still available)", () => {
    const d = FIN.evaluateExamFinalization(valid(BP(pol("block-finalization", false))));
    expect(d.canFinalize).toBe(true); expect(d.blockers).toEqual([]); expect(d.warnings).toEqual([]); expect(d.qualityReport!.enabled).toBe(false);
    expect(FIN.evaluateExamFinalization(structuralError(BP(pol("block-finalization", false)))).canFinalize).toBe(false);
  });
  it("G: malformed enabled policy → false with a policy blocker; malformed disabled policy → visible issue, no blocker", () => {
    const d = FIN.evaluateExamFinalization(valid(BP({ schemaVersion: 1, enabled: true, rules: [{ id: "x", enabled: true, source: { kind: "constraint", constraintId: "deleted" }, relations: ["below-min"], effect: "warning" }] })));
    expect(d.canFinalize).toBe(false); expect(d.blockers).toEqual([expect.objectContaining({ kind: "policy" })]); expect(d.policyIssues.map(i => i.code)).toEqual(["BROKEN_CONSTRAINT_REF"]);
    const off = FIN.evaluateExamFinalization(valid(BP({ schemaVersion: 1, enabled: false, rules: [{ id: "x", enabled: true, source: { kind: "constraint", constraintId: "deleted" }, relations: ["below-min"], effect: "warning" }] })));
    expect(off.canFinalize).toBe(true); expect(off.policyIssues).toHaveLength(1);
  });
  it("structural errors can never be downgraded by policy; structural warnings stay warnings", () => {
    const d = FIN.evaluateExamFinalization(structuralError(BP(pol("warning"))));
    expect(d.canFinalize).toBe(false); expect(d.blockers.some(b => b.kind === "structural")).toBe(true);
    const warnExam = exam([sec("s1", [mcq("q1", 2, { primaryTopicId: "IP_ADDRESSING" })], { gradingPolicy: "capScore", maxMarks: 6 })], BP(pol("warning")));
    const w = FIN.evaluateExamFinalization(warnExam);
    const structuralWarnings = validateStructuredExam(warnExam).filter(i => i.severity === "warning");
    expect(w.structuralWarnings).toEqual(structuralWarnings); expect(w.warnings.filter(x => x.kind === "structural")).toHaveLength(structuralWarnings.length);
  });
  it("deterministic, pure, no mutation; result carries no score / grade / rating", () => {
    const e = valid(BP(pol("block-finalization"))); const before = JSON.stringify(e);
    const a = FIN.evaluateExamFinalization(e), b = FIN.evaluateExamFinalization(e);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); expect(JSON.stringify(e)).toBe(before);
    expect(JSON.stringify(a)).not.toMatch(/score|grade|rating|"pass"|"fail"/i);
  });
});
