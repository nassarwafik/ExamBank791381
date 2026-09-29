import { describe, it, expect, vi } from "vitest";
import { evaluateAssessmentQualityGates } from "./assessmentQualityGates";
import { validateAssessmentQualityPolicy } from "./assessmentQualityPolicy";
import { evaluateBlueprintCoverage } from "./assessmentBlueprintCoverage";
import { evaluateExamFinalization } from "./examFinalization";
import { runStructuredSave, FINAL_REFUSED_PREFIX } from "./structuredSavePolicy";
import { networkingBlueprint } from "./assessmentBlueprintFixtures";
import type { AssessmentBlueprintV1 } from "./assessmentTypes";
import type { StructuredExam, BuilderQuestion, BuilderSection } from "./examTypes";

// Phase 13C-C — Independent Review Fix 1: a malformed / absent rule `enabled` state in an ENFORCED policy must fail closed.
// The validator (INVALID_RULE_ENABLED) is the authority; only an explicit `enabled: false` is an intentional, non-enforced
// rule. Fail-first on 2f81a5e.
const mcq = (id: string, marks: number, meta?: Record<string, unknown>): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text: "سؤال " + id, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, ...(meta ? { assessmentMeta: meta } : {}) } as unknown as BuilderQuestion);
const sec = (id: string, questions: BuilderQuestion[]): BuilderSection => ({ id, title: "قسم", gradingPolicy: "all", stimuli: {}, questions } as BuilderSection);
const BP = (policy: unknown): AssessmentBlueprintV1 => ({ ...networkingBlueprint, constraints: [{ id: "ipv4", dimension: "topic", ref: "IP_ADDRESSING", metric: "marks", unit: "percent", min: 30 }], qualityPolicy: policy as never });
// ipv4 = 6/8 = 75% → within-range: the coverage row itself triggers nothing; only the policy's validity decides
const exam = (policy: unknown): StructuredExam => ({ examId: "e", title: "امتحان", status: "draft", schemaVersion: 2, updatedAt: "2026-01-01T00:00:00.000Z", blueprint: BP(policy), sections: [sec("s1", [mcq("q1", 6, { primaryTopicId: "IP_ADDRESSING" }), mcq("q2", 2, { primaryTopicId: "OSI_TCPIP" })])] } as StructuredExam);
const rule = (enabled: unknown) => ({ id: "r1", ...(enabled === undefined ? {} : { enabled }), source: { kind: "constraint", constraintId: "ipv4" }, relations: ["below-min"], effect: "warning" });
const pol = (rules: unknown[], enabled = true) => ({ schemaVersion: 1, enabled, rules });
const run = (e: StructuredExam) => {
  const bp = e.blueprint!; const coverage = evaluateBlueprintCoverage(e); const policyIssues = validateAssessmentQualityPolicy(bp.qualityPolicy, bp);
  return { policyIssues, report: evaluateAssessmentQualityGates({ coverage, policy: bp.qualityPolicy, policyIssues }) };
};

describe("Review Fix 1 — malformed rule enabled state fails closed while the policy is enforced", () => {
  it("R1 — enabled: \"on\" → INVALID_RULE_ENABLED is a policy blocker; the gate report and the finalization decision refuse", () => {
    const e = exam(pol([rule("on")]));
    const { policyIssues, report } = run(e);
    expect(policyIssues.map(i => i.code)).toEqual(["INVALID_RULE_ENABLED"]);
    expect(report.policyBlockers).toEqual([expect.objectContaining({ code: "INVALID_RULE_ENABLED", ruleId: "r1" })]);
    expect(report.canFinalize).toBe(false); expect(report.blockerCount).toBe(1);
    expect(report.rules[0]).toMatchObject({ ruleId: "r1", triggered: false, issues: [expect.objectContaining({ code: "INVALID_RULE_ENABLED" })] });
    const d = evaluateExamFinalization(e);
    expect(d.canFinalize).toBe(false); expect(d.blockers).toEqual([expect.objectContaining({ kind: "policy" })]);
  });
  it("R2 — a rule with NO enabled property fails closed the same way", () => {
    const e = exam(pol([rule(undefined)]));
    const { policyIssues, report } = run(e);
    expect(policyIssues.map(i => i.code)).toEqual(["INVALID_RULE_ENABLED"]);
    expect(report.policyBlockers.map(i => i.code)).toEqual(["INVALID_RULE_ENABLED"]); expect(report.canFinalize).toBe(false);
    expect(evaluateExamFinalization(e).canFinalize).toBe(false);
  });
  it("R3 — an explicit enabled: false stays an intentionally disabled rule: never triggers, never a policy blocker (even with a broken ref)", () => {
    const e = exam(pol([rule(false), { id: "r2", enabled: false, source: { kind: "constraint", constraintId: "gone" }, relations: ["below-min"], effect: "block-finalization" }]));
    const { policyIssues, report } = run(e);
    expect(policyIssues.map(i => i.code)).toEqual(["BROKEN_CONSTRAINT_REF"]);
    expect(report.policyBlockers).toEqual([]); expect(report.canFinalize).toBe(true);
    expect(report.rules.map(r => r.triggered)).toEqual([false, false]);
    expect(evaluateExamFinalization(e).canFinalize).toBe(true);
    // and a VALID enabled rule with an issue still blocks (unchanged)
    const strict = run(exam(pol([{ id: "r3", enabled: true, source: { kind: "constraint", constraintId: "gone" }, relations: ["below-min"], effect: "warning" }]))).report;
    expect(strict.policyBlockers.map(i => i.code)).toEqual(["BROKEN_CONSTRAINT_REF"]); expect(strict.canFinalize).toBe(false);
  });
  it("R4 — a globally disabled policy stays non-blocking: the malformed-enabled issue is visible, canFinalize true", () => {
    const e = exam(pol([rule("on"), rule(undefined)].map((r, i) => ({ ...r, id: "r" + i })), false));
    const { policyIssues, report } = run(e);
    expect(policyIssues.map(i => i.code)).toEqual(["INVALID_RULE_ENABLED", "INVALID_RULE_ENABLED"]);
    expect(report).toMatchObject({ enabled: false, policyBlockers: [], blockerCount: 0, canFinalize: true });
    expect(report.policyIssues).toHaveLength(2);                                                     // still visible
    expect(evaluateExamFinalization(e).canFinalize).toBe(true);
  });
  it("R5 — the App second-line save guard inherits the fix: final save refused (no request, no commit, policy reason); draft still allowed", async () => {
    const e = exam(pol([rule("on")]));
    const request = vi.fn(async (_p: StructuredExam) => ({ ok: true })); const commitSaved = vi.fn();
    const r = await runStructuredSave({ snapshot: e, mode: "final", request, commitSaved });
    expect(r.ok).toBe(false); expect(request).not.toHaveBeenCalled(); expect(commitSaved).not.toHaveBeenCalled();
    if (!r.ok) { expect(r.reason).toMatch(FINAL_REFUSED_PREFIX); expect(r.reason).toMatch(/سياسة الجودة/); expect(r.decision.canFinalize).toBe(false); }
    const d = await runStructuredSave({ snapshot: e, mode: "draft", request, commitSaved });
    expect(d.ok).toBe(true); expect(request).toHaveBeenCalledTimes(1); expect(commitSaved).toHaveBeenCalledTimes(1);
  });
});
