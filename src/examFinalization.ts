// Phase 13C-C — the ONE canonical authoring finalization authority:
//   structural validity (examQuality, unconditional) + 13C-B coverage facts + quality policy validation + quality gates.
// Structural errors can never be downgraded by a policy; structural warnings keep their meaning; an exam without a
// blueprint or without a policy behaves exactly as before. Nothing here is persisted; it is derived from the exam.
import type { StructuredExam } from "./examTypes";
import { validateStructuredExam, type StructuredIssue } from "./examQuality";
import { evaluateBlueprintCoverage, type BlueprintCoverageReport } from "./assessmentBlueprintCoverage";
import { validateAssessmentQualityPolicy, type QualityPolicyIssue } from "./assessmentQualityPolicy";
import { evaluateAssessmentQualityGates, type QualityGateReport, type QualityGateResult } from "./assessmentQualityGates";

export type FinalizationItem = {
  kind: "structural" | "quality" | "policy";
  id: string;
  message: string;
  evidence: string[];
  structural?: StructuredIssue;
  gate?: QualityGateResult;
  policyIssue?: QualityPolicyIssue;
};
export type FinalizationDecision = {
  structuralIssues: StructuredIssue[];
  structuralErrors: StructuredIssue[];
  structuralWarnings: StructuredIssue[];
  coverage: BlueprintCoverageReport | null;
  policyIssues: QualityPolicyIssue[];
  qualityReport: QualityGateReport | null;
  blockers: FinalizationItem[];
  warnings: FinalizationItem[];
  /** Operational only: the current authoring workflow permits finalization (no structural error, no triggered blocking
   *  rule, no blocking policy issue). Not an academic judgement. */
  canFinalize: boolean;
};

export function evaluateExamFinalization(exam: StructuredExam): FinalizationDecision {
  const structuralIssues = validateStructuredExam(exam);
  const structuralErrors = structuralIssues.filter(i => i.severity === "error");
  const structuralWarnings = structuralIssues.filter(i => i.severity === "warning");
  const bp = exam.blueprint;
  const coverage = bp ? evaluateBlueprintCoverage(exam) : null;
  const policyIssues = bp ? validateAssessmentQualityPolicy(bp.qualityPolicy, bp) : [];
  const qualityReport = bp && coverage ? evaluateAssessmentQualityGates({ coverage, policy: bp.qualityPolicy, policyIssues }) : null;
  const blockers: FinalizationItem[] = [
    ...structuralErrors.map(i => ({ kind: "structural" as const, id: i.id, message: i.message, evidence: i.questionId ? [i.questionId] : [], structural: i })),
    ...(qualityReport?.policyBlockers ?? []).map((p, n) => ({ kind: "policy" as const, id: (p.ruleId ?? "policy") + ":" + p.code + ":" + n, message: p.message + " (" + p.code + ")", evidence: [], policyIssue: p })),
    ...(qualityReport?.blockers ?? []).map(g => ({ kind: "quality" as const, id: g.ruleId, message: g.message, evidence: g.evidence, gate: g }))
  ];
  const warnings: FinalizationItem[] = [
    ...structuralWarnings.map(i => ({ kind: "structural" as const, id: i.id, message: i.message, evidence: i.questionId ? [i.questionId] : [], structural: i })),
    ...(qualityReport?.warnings ?? []).map(g => ({ kind: "quality" as const, id: g.ruleId, message: g.message, evidence: g.evidence, gate: g }))
  ];
  return { structuralIssues, structuralErrors, structuralWarnings, coverage, policyIssues, qualityReport, blockers, warnings, canFinalize: structuralErrors.length === 0 && (qualityReport?.canFinalize ?? true) };
}

export const FINAL_REFUSED_PREFIX = "لا يمكن الاعتماد النهائي";
/** A structured, teacher-visible refusal reason (counts by kind). */
export function finalizationRefusalReason(decision: FinalizationDecision): string {
  const parts: string[] = [];
  if (decision.structuralErrors.length) parts.push("أخطاء بنيوية: " + decision.structuralErrors.length);
  const quality = decision.blockers.filter(b => b.kind === "quality").length;
  if (quality) parts.push("حواجز بوابات الجودة: " + quality);
  const policy = decision.blockers.filter(b => b.kind === "policy").length;
  if (policy) parts.push("مشكلات في سياسة الجودة: " + policy);
  return FINAL_REFUSED_PREFIX + ": " + (parts.length ? parts.join("، ") : "الحالة لا تسمح بالاعتماد") + ".";
}
