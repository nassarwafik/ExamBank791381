// Phase 13C-C — QUALITY POLICY (pure): the versioned, teacher-authored layer that says WHICH factual coverage conditions
// matter for authoring finalization. Policy lives on the Blueprint (`qualityPolicy`); evaluation results never persist.
// Rules reference stable ids (constraint ids, the total rows, the unclassified / unmapped facts) — never labels — and
// name the 13C-B relations that trigger them; they never restate min / target / max math. This is enforcement, not scoring.
import type { AssessmentBlueprintV1, AssessmentQualityPolicyV1, AssessmentQualityRule, CoverageQualityRule, ThresholdQualityRule, QualityRuleSource, BlueprintConstraint, QualityEffect } from "./assessmentTypes";
import { ASSESSMENT_QUALITY_POLICY_SCHEMA_VERSION, QUALITY_EFFECTS, QUALITY_TRIGGER_RELATIONS, QUALITY_THRESHOLD_METRICS } from "./assessmentTypes";
import { blueprintCognitiveLevels, blueprintDifficultyScale } from "./assessmentBlueprint";
import { QUESTION_TYPE_LABELS } from "./examTypes";

export { ASSESSMENT_QUALITY_POLICY_SCHEMA_VERSION, QUALITY_EFFECTS, QUALITY_TRIGGER_RELATIONS, QUALITY_THRESHOLD_METRICS };
export function emptyQualityPolicy(): AssessmentQualityPolicyV1 { return { schemaVersion: ASSESSMENT_QUALITY_POLICY_SCHEMA_VERSION, enabled: false, rules: [] }; }
let ruleSeq = 0;
export function newQualityRuleId(): string { ruleSeq += 1; return "qr" + Date.now().toString(36) + ruleSeq.toString(36); }

export type QualityPolicyIssueCode =
  | "INVALID_POLICY" | "UNSUPPORTED_POLICY_SCHEMA" | "INVALID_ENABLED" | "INVALID_RULES" | "INVALID_RULE" | "MISSING_RULE_ID" | "DUPLICATE_RULE_ID" | "INVALID_RULE_ENABLED"
  | "INVALID_SOURCE" | "UNSUPPORTED_SOURCE_KIND" | "BROKEN_CONSTRAINT_REF" | "MISSING_TOTAL_TARGET" | "INVALID_RELATIONS" | "EMPTY_RELATIONS" | "UNKNOWN_RELATION"
  | "INVALID_EFFECT" | "INVALID_METRIC" | "INVALID_THRESHOLD" | "INVALID_NOTE";
export type QualityPolicyIssue = { code: QualityPolicyIssueCode; message: string; path?: string; ruleId?: string };

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const SOURCE_KINDS = ["constraint", "total-questions", "total-marks", "unclassified", "unmapped-bank"] as const;
export const EFFECT_LABEL: Record<QualityEffect, string> = { warning: "تنبيه", "block-finalization": "يمنع الاعتماد النهائي" };

/** Pure validation against the Blueprint the policy belongs to. `undefined` policy → no issues (no policy at all). */
export function validateAssessmentQualityPolicy(policy: unknown, blueprint: AssessmentBlueprintV1 | undefined | null): QualityPolicyIssue[] {
  const issues: QualityPolicyIssue[] = [];
  const add = (code: QualityPolicyIssueCode, message: string, path?: string, ruleId?: string) => issues.push({ code, message, path, ruleId });
  if (policy === undefined) return issues;
  if (!isPlainObject(policy)) return [{ code: "INVALID_POLICY", message: "سياسة الجودة غير صالحة.", path: "qualityPolicy" }];
  if (policy.schemaVersion !== ASSESSMENT_QUALITY_POLICY_SCHEMA_VERSION) return [{ code: "UNSUPPORTED_POLICY_SCHEMA", message: "إصدار سياسة الجودة غير مدعوم.", path: "qualityPolicy.schemaVersion" }];
  if (typeof policy.enabled !== "boolean") add("INVALID_ENABLED", "حالة تفعيل السياسة غير صالحة.", "qualityPolicy.enabled");
  if (!Array.isArray(policy.rules)) { add("INVALID_RULES", "قائمة القواعد غير صالحة.", "qualityPolicy.rules"); return issues; }
  // Blueprint substructures are read defensively (Phase 15A Review Fix 2): a malformed imported / legacy Blueprint
  // (constraints not an array, targets not an object) yields reference / target issues here instead of a runtime exception —
  // the finalization authority, the Builder render and the preset extraction all reach this validator with untrusted data.
  const constraintIds = new Set((Array.isArray(blueprint?.constraints) ? blueprint.constraints : []).map(c => c && typeof c === "object" ? c.id : undefined).filter((id): id is string => typeof id === "string"));
  const targets = isPlainObject(blueprint?.targets) ? blueprint.targets : undefined;
  const seen = new Set<string>();
  policy.rules.forEach((r, i) => {
    const path = "rules[" + i + "]";
    if (!isPlainObject(r)) { add("INVALID_RULE", "قاعدة غير صالحة.", path); return; }
    const ruleId = typeof r.id === "string" && r.id.trim() ? r.id : undefined;
    if (!ruleId) add("MISSING_RULE_ID", "معرّف القاعدة مطلوب.", path + ".id");
    else if (seen.has(ruleId)) add("DUPLICATE_RULE_ID", "معرّف القاعدة مكرر: " + ruleId, path + ".id", ruleId);
    else seen.add(ruleId);
    if (typeof r.enabled !== "boolean") add("INVALID_RULE_ENABLED", "حالة تفعيل القاعدة غير صالحة.", path + ".enabled", ruleId);
    if (!(QUALITY_EFFECTS as readonly string[]).includes(r.effect as string)) add("INVALID_EFFECT", "أثر القاعدة غير معروف.", path + ".effect", ruleId);
    if (r.note !== undefined && typeof r.note !== "string") add("INVALID_NOTE", "ملاحظة القاعدة غير صالحة.", path + ".note", ruleId);
    const src = r.source;
    if (!isPlainObject(src)) { add("INVALID_SOURCE", "مصدر القاعدة غير صالح.", path + ".source", ruleId); return; }
    if (!(SOURCE_KINDS as readonly string[]).includes(src.kind as string)) { add("UNSUPPORTED_SOURCE_KIND", "نوع مصدر القاعدة غير مدعوم.", path + ".source.kind", ruleId); return; }
    if (src.kind === "constraint") { if (typeof src.constraintId !== "string" || !constraintIds.has(src.constraintId)) add("BROKEN_CONSTRAINT_REF", "القاعدة تشير إلى قيد غير موجود في المخطط: " + String(src.constraintId ?? ""), path + ".source.constraintId", ruleId); }
    if (src.kind === "total-questions" && (!targets || !("totalQuestions" in targets))) add("MISSING_TOTAL_TARGET", "لا يوجد هدف إجمالي للأسئلة في المخطط.", path + ".source", ruleId);
    if (src.kind === "total-marks" && (!targets || !("totalMarks" in targets))) add("MISSING_TOTAL_TARGET", "لا يوجد هدف إجمالي للعلامات في المخطط.", path + ".source", ruleId);
    if (src.kind === "constraint" || src.kind === "total-questions" || src.kind === "total-marks") {
      if (!Array.isArray(r.relations)) add("INVALID_RELATIONS", "قائمة العلاقات غير صالحة.", path + ".relations", ruleId);
      else if (r.relations.length === 0) add("EMPTY_RELATIONS", "القاعدة لا تحدد أي علاقة مُفعِّلة.", path + ".relations", ruleId);
      else for (const rel of r.relations) if (!(QUALITY_TRIGGER_RELATIONS as readonly string[]).includes(rel as string)) add("UNKNOWN_RELATION", "علاقة غير معروفة: " + String(rel), path + ".relations", ruleId);
    } else {
      const allowed = src.kind === "unclassified" ? (QUALITY_THRESHOLD_METRICS as readonly string[]) : ["count"];
      if (!allowed.includes(r.metric as string)) add("INVALID_METRIC", "مقياس القاعدة غير صالح لهذا المصدر.", path + ".metric", ruleId);
      if (typeof r.max !== "number" || !Number.isFinite(r.max) || r.max < 0) add("INVALID_THRESHOLD", "الحد الأقصى يجب أن يكون رقمًا غير سالب.", path + ".max", ruleId);
    }
  });
  return issues;
}

// ── pure editing helpers (id-based, immutable, reference-stable on no-op; never prune rules for a vanished constraint) ──
const sameRule = (a: AssessmentQualityRule, b: AssessmentQualityRule) => JSON.stringify(a) === JSON.stringify(b);
export function withQualityPolicy(bp: AssessmentBlueprintV1, fn: (policy: AssessmentQualityPolicyV1) => AssessmentQualityPolicyV1): AssessmentBlueprintV1 {
  const cur = bp.qualityPolicy ?? emptyQualityPolicy();
  const next = fn(cur);
  if (next === cur) return bp;
  return { ...bp, qualityPolicy: next };
}
export function setQualityPolicyEnabled(bp: AssessmentBlueprintV1, enabled: boolean): AssessmentBlueprintV1 {
  if (!bp.qualityPolicy && !enabled) return bp;
  return withQualityPolicy(bp, p => (p.enabled === enabled ? p : { ...p, enabled }));
}
export function addQualityRule(bp: AssessmentBlueprintV1, rule: AssessmentQualityRule): AssessmentBlueprintV1 { return withQualityPolicy(bp, p => ({ ...p, rules: [...p.rules, rule] })); }
export function updateQualityRule(bp: AssessmentBlueprintV1, id: string, patch: Partial<AssessmentQualityRule>): AssessmentBlueprintV1 {
  return withQualityPolicy(bp, p => {
    const i = p.rules.findIndex(r => r.id === id); if (i < 0) return p;
    const next = { ...p.rules[i], ...patch } as AssessmentQualityRule;
    if (sameRule(next, p.rules[i])) return p;
    const rules = p.rules.slice(); rules[i] = next; return { ...p, rules };
  });
}
export function replaceQualityRule(bp: AssessmentBlueprintV1, id: string, rule: AssessmentQualityRule): AssessmentBlueprintV1 {
  return withQualityPolicy(bp, p => { const i = p.rules.findIndex(r => r.id === id); if (i < 0 || sameRule(rule, p.rules[i])) return p; const rules = p.rules.slice(); rules[i] = rule; return { ...p, rules }; });
}
export function removeQualityRule(bp: AssessmentBlueprintV1, id: string): AssessmentBlueprintV1 {
  return withQualityPolicy(bp, p => (p.rules.some(r => r.id === id) ? { ...p, rules: p.rules.filter(r => r.id !== id) } : p));
}

// ── source identity / labels ──────────────────────────────────────────────────────────────────────────────────────
export function qualityRuleSourceKey(source: QualityRuleSource): string { return source.kind === "constraint" ? "constraint:" + source.constraintId : source.kind; }
export function parseQualityRuleSourceKey(key: string): QualityRuleSource | null {
  if (key.startsWith("constraint:")) return { kind: "constraint", constraintId: key.slice("constraint:".length) };
  return (SOURCE_KINDS as readonly string[]).includes(key) && key !== "constraint" ? ({ kind: key } as QualityRuleSource) : null;
}
export const isCoverageQualityRule = (r: AssessmentQualityRule): r is CoverageQualityRule => r.source.kind === "constraint" || r.source.kind === "total-questions" || r.source.kind === "total-marks";
export const isThresholdQualityRule = (r: AssessmentQualityRule): r is ThresholdQualityRule => r.source.kind === "unclassified" || r.source.kind === "unmapped-bank";
/** A fresh rule for the editor: the first Blueprint constraint when one exists, else the unclassified threshold. Explicit
 *  starting values (the teacher edits them); nothing is inferred. */
export function defaultQualityRule(bp: AssessmentBlueprintV1 | undefined): AssessmentQualityRule {
  const first = (Array.isArray(bp?.constraints) ? bp.constraints : []).find(c => c && typeof c === "object" && typeof c.id === "string" && c.id);
  if (first) return { id: newQualityRuleId(), enabled: true, source: { kind: "constraint", constraintId: first.id }, relations: ["below-min"], effect: "warning" };
  return { id: newQualityRuleId(), enabled: true, source: { kind: "unclassified" }, metric: "count", max: 0, effect: "warning" };
}
/** Re-target a rule to another source, keeping id / enabled / effect / note and switching the rule shape when needed. */
export function retargetQualityRule(rule: AssessmentQualityRule, source: QualityRuleSource): AssessmentQualityRule {
  const base = { id: rule.id, enabled: rule.enabled, effect: rule.effect, ...(rule.note !== undefined ? { note: rule.note } : {}) };
  if (source.kind === "unclassified" || source.kind === "unmapped-bank") {
    const metric = isThresholdQualityRule(rule) && source.kind === "unclassified" ? rule.metric : "count";
    return { ...base, source, metric, max: isThresholdQualityRule(rule) ? rule.max : 0 };
  }
  return { ...base, source, relations: isCoverageQualityRule(rule) ? rule.relations : ["below-min"] };
}
const DIM_LABEL: Record<string, string> = { topic: "موضوع", objective: "هدف تعليمي", difficulty: "صعوبة", cognitiveLevel: "مستوى معرفي", questionType: "نوع السؤال", capability: "مهارة / قدرة", section: "قسم" };
/** Human label of a constraint for the policy editor (display only; the id is the identity). */
export function describeConstraint(bp: AssessmentBlueprintV1, c: BlueprintConstraint, sections: ReadonlyArray<{ id: string; title: string }> = []): string {
  const ref = String(c.ref ?? "");
  let label = ref;
  switch (c.dimension) {
    case "topic": label = bp.topics.find(t => t.id === ref)?.label || ref; break;
    case "objective": label = bp.objectives.find(o => o.id === ref)?.label || ref; break;
    case "difficulty": { const l = blueprintDifficultyScale(bp).labels?.[ref]; label = l ? ref + " — " + l : ref; break; }
    case "cognitiveLevel": label = blueprintCognitiveLevels(bp).find(l => l.id === ref)?.label || ref; break;
    case "questionType": label = (QUESTION_TYPE_LABELS as Record<string, string>)[ref] || ref; break;
    case "section": label = sections.find(s => s.id === ref)?.title || ref; break;
  }
  return (DIM_LABEL[c.dimension] || c.dimension) + ": " + label + " — " + (c.metric === "marks" ? "العلامات" : "عدد الأسئلة") + (c.unit === "percent" ? " (نسبة مئوية)" : "");
}
export const SOURCE_LABEL: Record<Exclude<QualityRuleSource["kind"], "constraint">, string> = { "total-questions": "إجمالي الأسئلة", "total-marks": "إجمالي العلامات الرسمية", unclassified: "الأسئلة غير المصنفة", "unmapped-bank": "مواضيع البنك غير المربوطة" };
