// Phase 13C-C — QUALITY GATE ENGINE (pure). Consumes the 13C-B BlueprintCoverageReport (facts) and the Blueprint's
// quality policy (meaning) and says which facts are warnings and which block authoring finalization. It never sees
// questions, never recomputes coverage, marks or relations, and never scores anything. O(r + rows): the coverage rows are
// indexed once by source key; each rule is one lookup.
import type { BlueprintCoverageReport, CoverageItem, CoverageRelation } from "./assessmentBlueprintCoverage";
import { evaluateConstraintRelation, RELATION_LABEL } from "./assessmentBlueprintCoverage";
import type { AssessmentQualityPolicyV1, AssessmentQualityRule, QualityEffect, QualityRuleSource } from "./assessmentTypes";
import { isCoverageQualityRule, qualityRuleSourceKey, type QualityPolicyIssue } from "./assessmentQualityPolicy";
import { formatActual, formatCoverageNumber } from "./coverageFormat";

export type QualityGateResult = {
  ruleId: string;
  enabled: boolean;
  source: QualityRuleSource;
  sourceKey: string;
  effect: QualityEffect;
  triggered: boolean;
  /** The factual relation the rule reacted to (coverage row relation, or the threshold relation for unclassified / unmapped). */
  relation: CoverageRelation | null;
  /** Raw factual value (coverage actual, or the threshold figure); null when the row is unassessable / missing. */
  actual: number | null;
  refLabel: string;
  expectedText: string;
  message: string;
  evidence: string[];
  coverageId: string | null;
  note?: string;
  /** Policy validation issues attached to this rule (a rule with issues is never evaluated). */
  issues: QualityPolicyIssue[];
};
export type QualityGateReport = {
  /** The policy exists and is not explicitly disabled (an enabled — or malformed-enabled — policy is enforced). */
  enabled: boolean;
  rules: QualityGateResult[];
  blockers: QualityGateResult[];
  warnings: QualityGateResult[];
  policyIssues: QualityPolicyIssue[];
  /** Policy issues that block finalization while the policy is enforced: policy-level issues and issues on ENABLED rules. */
  policyBlockers: QualityPolicyIssue[];
  blockerCount: number;
  warningCount: number;
  canFinalize: boolean;
};

const EFFECT_VERB: Record<QualityEffect, string> = { warning: "تنبّه", "block-finalization": "تمنع الاعتماد النهائي" };
const THRESHOLD_SUBJECT = (source: QualityRuleSource, metric: string, value: number): string => {
  if (source.kind === "unmapped-bank") return formatCoverageNumber(value) + " أسئلة بمواضيع بنك غير مربوطة";
  return metric === "officialMarks" ? formatCoverageNumber(value) + " علامة رسمية لأسئلة غير مصنفة" : formatCoverageNumber(value) + " أسئلة غير مصنفة";
};

function indexCoverage(coverage: BlueprintCoverageReport): Map<string, CoverageItem> {
  const m = new Map<string, CoverageItem>();
  for (const t of coverage.totals) m.set(t.kind, t);
  for (const c of coverage.constraints) m.set("constraint:" + c.id, c);
  return m;
}

export function evaluateAssessmentQualityGates(input: { coverage: BlueprintCoverageReport; policy: AssessmentQualityPolicyV1 | undefined | null; policyIssues: QualityPolicyIssue[] }): QualityGateReport {
  const { coverage, policy, policyIssues } = input;
  const present = !!policy && typeof policy === "object";
  const enforced = present && (policy as AssessmentQualityPolicyV1).enabled !== false;
  const empty: QualityGateReport = { enabled: enforced, rules: [], blockers: [], warnings: [], policyIssues, policyBlockers: [], blockerCount: 0, warningCount: 0, canFinalize: true };
  if (!present) return empty;
  const rows = indexCoverage(coverage);
  const issuesByRule = new Map<string, QualityPolicyIssue[]>();
  const policyLevel: QualityPolicyIssue[] = [];
  for (const iss of policyIssues) { if (iss.ruleId === undefined) policyLevel.push(iss); else { const arr = issuesByRule.get(iss.ruleId); if (arr) arr.push(iss); else issuesByRule.set(iss.ruleId, [iss]); } }
  const rawRules = Array.isArray((policy as AssessmentQualityPolicyV1).rules) ? (policy as AssessmentQualityPolicyV1).rules : [];
  const results: QualityGateResult[] = [];
  const enabledRuleIssues: QualityPolicyIssue[] = [];
  for (const rule of rawRules as AssessmentQualityRule[]) {
    if (!rule || typeof rule !== "object") continue;
    const ruleId = typeof rule.id === "string" ? rule.id : "";
    const issues = issuesByRule.get(ruleId) ?? [];
    const enabled = rule.enabled === true;
    const source: QualityRuleSource = rule.source && typeof rule.source === "object" ? rule.source : ({ kind: "unclassified" } as QualityRuleSource);
    const base: QualityGateResult = { ruleId, enabled, source, sourceKey: qualityRuleSourceKey(source), effect: rule.effect, triggered: false, relation: null, actual: null, refLabel: "", expectedText: "", message: "", evidence: [], coverageId: null, ...(rule.note !== undefined ? { note: rule.note } : {}), issues };
    if (issues.length) { if (enabled) enabledRuleIssues.push(...issues); base.message = "قاعدة غير قابلة للتطبيق: " + issues.map(i => i.code).join("، "); results.push(base); continue; }
    if (isCoverageQualityRule(rule)) {
      const row = rows.get(base.sourceKey);
      if (!row) { base.message = "لا صف تغطية لهذا المصدر."; results.push(base); continue; }
      base.relation = row.relation; base.actual = row.actual; base.refLabel = row.refLabel; base.coverageId = row.id; base.evidence = row.evidence;
      base.expectedText = "العلاقات المُفعِّلة: " + rule.relations.map(r => RELATION_LABEL[r]).join(" / ");
      base.triggered = enabled && rule.relations.includes(row.relation);
      const actualText = row.actual === null ? "غير قابل للتقييم" : formatActual(row.actual, row.unit);
      base.message = row.refLabel + " — الموجود " + actualText + "، وسياسة الجودة " + EFFECT_VERB[rule.effect] + " عند «" + RELATION_LABEL[row.relation] + "».";
    } else {
      const value = rule.source.kind === "unmapped-bank" ? coverage.unmappedBank.questionIds.length : rule.metric === "officialMarks" ? coverage.unclassified.officialMarks : coverage.unclassified.count;
      const rel = evaluateConstraintRelation(value, { max: rule.max });                            // the ONE relation helper, no second float comparison
      base.relation = rel.relation; base.actual = value; base.refLabel = rule.source.kind === "unmapped-bank" ? "مواضيع البنك غير المربوطة" : "الأسئلة غير المصنفة";
      base.evidence = rule.source.kind === "unmapped-bank" ? coverage.unmappedBank.questionIds : coverage.unclassified.questionIds;
      base.expectedText = "الحد الأقصى المسموح: " + formatCoverageNumber(rule.max);
      base.triggered = enabled && rel.relation === "above-max";
      base.message = THRESHOLD_SUBJECT(rule.source, rule.metric, value) + " — الحد الأقصى المسموح حسب السياسة: " + formatCoverageNumber(rule.max) + ".";
    }
    results.push(base);
  }
  if (!enforced) return { ...empty, rules: results };
  const blockers = results.filter(r => r.triggered && r.effect === "block-finalization");
  const warnings = results.filter(r => r.triggered && r.effect === "warning");
  const policyBlockers = [...policyLevel, ...enabledRuleIssues];
  return { enabled: true, rules: results, blockers, warnings, policyIssues, policyBlockers, blockerCount: blockers.length + policyBlockers.length, warningCount: warnings.length, canFinalize: blockers.length === 0 && policyBlockers.length === 0 };
}
