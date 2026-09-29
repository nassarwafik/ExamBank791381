// Phase 13C-B — LIVE BLUEPRINT COVERAGE: the pure, factual engine that compares the current StructuredExam with the
// canonical AssessmentBlueprintV1. It consumes the 13C-A authorities unchanged — buildAssessmentProfile (the ONLY marks /
// taxonomy facts), effectiveAssessmentMeta (classification + exact bank evidence) and validateBlueprintForExam (structural
// issues) — and adds nothing but comparison. No score, no grade, no gate, no rating: 13C-C decides what a mismatch means.
//
// Actual-value rules (fixed contract, see docs/enterprise-builder-13c-b.md):
//   count / absolute  → bucket.count                          count / percent → bucket.count / totalQuestions × 100
//   marks / absolute  → bucket.officialMarks                  marks / percent → bucket.officialMarks / totalOfficialMarks × 100
//   A zero denominator is `unassessable` (zero-count-denominator / zero-marks-denominator) — never NaN / Infinity.
//   A constraint with a structural issue is `unassessable` (blueprint-issue) — never a silent 0.
//   Topic buckets are PRIMARY-topic only (13C-A attribution); objectives / capabilities overlap by design.
import type { StructuredExam, BuilderQuestion, BuilderSection } from "./examTypes";
import { QUESTION_TYPE_LABELS } from "./examTypes";
import type { AssessmentBlueprintV1, BlueprintConstraint, BlueprintDimension, BlueprintMetric, BlueprintUnit } from "./assessmentTypes";
import {
  buildAssessmentProfile, effectiveAssessmentMeta, validateBlueprintForExam, blueprintCognitiveLevels, blueprintDifficultyScale,
  type AssessmentProfile, type BlueprintIssue, type Tally
} from "./assessmentBlueprint";

/** Comparison tolerance for floating official marks / percentages (proportional attribution produces fractions). */
export const COVERAGE_EPSILON = 1e-9;
const lt = (a: number, b: number) => a < b - COVERAGE_EPSILON;
const gt = (a: number, b: number) => a > b + COVERAGE_EPSILON;
const eq = (a: number, b: number) => Math.abs(a - b) <= COVERAGE_EPSILON;

export type CoverageRelation = "below-min" | "below-target" | "within-tolerance" | "at-target" | "above-target" | "above-max" | "within-range" | "unassessable";
export type UnassessableReason = "zero-count-denominator" | "zero-marks-denominator" | "blueprint-issue" | "no-limits";
export type CoverageLimits = { min?: number; target?: number; max?: number; tolerance?: number };
export type RelationResult = { relation: CoverageRelation; delta: number | null; shortfall: number | null; excess: number | null };

/** Deterministic relation of a raw actual value to its configured limits (order: min → max → target → range). */
export function evaluateConstraintRelation(actual: number, limits: CoverageLimits): RelationResult {
  const { min, target, max, tolerance } = limits;
  const delta = target !== undefined ? actual - target : null;
  if (min !== undefined && lt(actual, min)) return { relation: "below-min", delta, shortfall: min - actual, excess: null };
  if (max !== undefined && gt(actual, max)) return { relation: "above-max", delta, shortfall: null, excess: actual - max };
  if (target !== undefined) {
    if (tolerance !== undefined) { if (Math.abs(actual - target) <= tolerance + COVERAGE_EPSILON) return { relation: "within-tolerance", delta, shortfall: null, excess: null }; }
    else if (eq(actual, target)) return { relation: "at-target", delta, shortfall: null, excess: null };
    return { relation: lt(actual, target) ? "below-target" : "above-target", delta, shortfall: null, excess: null };
  }
  if (min !== undefined || max !== undefined) return { relation: "within-range", delta, shortfall: null, excess: null };
  return { relation: "unassessable", delta, shortfall: null, excess: null };
}

export type CoverageItem = {
  id: string;
  kind: "total-questions" | "total-marks" | "constraint";
  dimension?: BlueprintDimension;
  ref?: string;
  /** Display label of the referenced topic / objective / level / type / section (labels are display only; ids are identity). */
  refLabel: string;
  metric: BlueprintMetric;
  unit: BlueprintUnit;
  /** Raw actual value in the constraint's unit (never rounded); null when unassessable. */
  actual: number | null;
  /** The factual bucket behind the row (0 when the bucket is missing). */
  count: number;
  weightMarks: number;
  officialMarks: number;
  /** Percent rows: totalQuestions (count) or totalOfficialMarks (marks). */
  denominator?: number;
  min?: number; target?: number; max?: number; tolerance?: number;
  relation: CoverageRelation;
  reason?: UnassessableReason;
  issues: BlueprintIssue[];
  delta: number | null; shortfall: number | null; excess: number | null;
  /** Contributing examQuestionIds in global exam order. */
  evidence: string[];
};
export type BlueprintCoverageReport = {
  totalQuestions: number; targetTotalQuestions?: number;
  totalOfficialMarks: number; targetTotalMarks?: number;
  totals: CoverageItem[];
  constraints: CoverageItem[];
  constraintCount: number;
  unclassified: Tally & { questionIds: string[] };
  unmappedBank: { questionIds: string[]; byTopic: Record<string, string[]> };
  issues: BlueprintIssue[];
};

// ── evidence index: from a coverage number to the questions behind it (runtime-derived, never stored) ─────────────
export type AssessmentEvidenceIndex = {
  order: string[];
  byTopic: Record<string, string[]>; byObjective: Record<string, string[]>; byDifficulty: Record<string, string[]>; byType: Record<string, string[]>;
  byCognitiveLevel: Record<string, string[]>; byCapability: Record<string, string[]>; bySection: Record<string, string[]>;
  unclassified: string[];
  unmappedBankTopics: Record<string, string[]>;
};
const push = (rec: Record<string, string[]>, key: string, id: string) => { (rec[key] || (rec[key] = [])).push(id); };
export function buildAssessmentEvidenceIndex(exam: StructuredExam, blueprint?: AssessmentBlueprintV1 | null): AssessmentEvidenceIndex {
  const bp = blueprint === undefined ? exam.blueprint : blueprint;
  const idx: AssessmentEvidenceIndex = { order: [], byTopic: {}, byObjective: {}, byDifficulty: {}, byType: {}, byCognitiveLevel: {}, byCapability: {}, bySection: {}, unclassified: [], unmappedBankTopics: {} };
  for (const s of exam.sections || []) {
    for (const q of (s.questions || []) as BuilderQuestion[]) {
      const id = q.examQuestionId;
      idx.order.push(id);
      push(idx.bySection, s.id, id);
      const eff = effectiveAssessmentMeta(q, bp ?? undefined);
      if (eff.primaryTopicId) push(idx.byTopic, eff.primaryTopicId, id); else idx.unclassified.push(id);
      for (const o of eff.objectiveIds) push(idx.byObjective, o, id);
      push(idx.byDifficulty, eff.difficulty === undefined ? "unspecified" : String(eff.difficulty), id);
      push(idx.byType, String(q.presentationType || "unspecified"), id);
      push(idx.byCognitiveLevel, eff.cognitiveLevel ?? "unspecified", id);
      for (const c of eff.capabilities) push(idx.byCapability, c, id);
      for (const t of eff.unmappedBankTopics) push(idx.unmappedBankTopics, t, id);
    }
  }
  return idx;
}

// ── labels (display only) ────────────────────────────────────────────────────────────────────────────────────────
function refLabelFor(bp: AssessmentBlueprintV1, exam: StructuredExam, c: BlueprintConstraint): string {
  const ref = String(c.ref ?? "");
  switch (c.dimension) {
    case "topic": return bp.topics.find(t => t.id === ref)?.label || ref;
    case "objective": return bp.objectives.find(o => o.id === ref)?.label || ref;
    case "difficulty": { const l = blueprintDifficultyScale(bp).labels?.[ref]; return l ? ref + " — " + l : ref; }
    case "cognitiveLevel": return blueprintCognitiveLevels(bp).find(l => l.id === ref)?.label || ref;
    case "questionType": return (QUESTION_TYPE_LABELS as Record<string, string>)[ref] || ref;
    case "section": return (exam.sections || []).find(s => s.id === ref)?.title || ref;
    default: return ref;
  }
}
const EMPTY_TALLY: Tally = { count: 0, weightMarks: 0, officialMarks: 0 };
function bucketFor(profile: AssessmentProfile, evidence: AssessmentEvidenceIndex, c: BlueprintConstraint): { tally: Tally; ids: string[] } {
  const ref = String(c.ref ?? "");
  const pick = (t: Record<string, Tally>, e: Record<string, string[]>) => ({ tally: t[ref] ?? EMPTY_TALLY, ids: e[ref] ?? [] });
  switch (c.dimension) {
    case "topic": return pick(profile.byTopic, evidence.byTopic);
    case "objective": return pick(profile.byObjective, evidence.byObjective);
    case "difficulty": return pick(profile.byDifficulty, evidence.byDifficulty);
    case "questionType": return pick(profile.byType, evidence.byType);
    case "cognitiveLevel": return pick(profile.byCognitiveLevel, evidence.byCognitiveLevel);
    case "capability": return pick(profile.byCapability, evidence.byCapability);
    case "section": return pick(profile.bySection, evidence.bySection);
    default: return { tally: EMPTY_TALLY, ids: [] };
  }
}
const limitsOf = (c: { min?: number; target?: number; max?: number; tolerance?: number }): CoverageLimits => ({
  ...(c.min !== undefined ? { min: c.min } : {}), ...(c.target !== undefined ? { target: c.target } : {}), ...(c.max !== undefined ? { max: c.max } : {}), ...(c.tolerance !== undefined ? { tolerance: c.tolerance } : {})
});
const unassessable = (base: Omit<CoverageItem, "actual" | "relation" | "delta" | "shortfall" | "excess">, reason: UnassessableReason): CoverageItem =>
  ({ ...base, actual: null, relation: "unassessable", reason, delta: null, shortfall: null, excess: null });

// ── the engine ───────────────────────────────────────────────────────────────────────────────────────────────────
const structurallyUsable = (bp: unknown, issues: BlueprintIssue[]): bp is AssessmentBlueprintV1 =>
  !!bp && typeof bp === "object" && Array.isArray((bp as AssessmentBlueprintV1).constraints) && Array.isArray((bp as AssessmentBlueprintV1).topics) && Array.isArray((bp as AssessmentBlueprintV1).objectives)
  && !issues.some(i => i.code === "UNSUPPORTED_SCHEMA_VERSION" || i.code === "INVALID_CONSTRAINTS");

export function evaluateBlueprintCoverage(exam: StructuredExam, blueprint?: AssessmentBlueprintV1 | null): BlueprintCoverageReport {
  const bp = blueprint === undefined ? exam.blueprint : blueprint;
  const issues = bp ? validateBlueprintForExam(bp, exam) : [];
  const usable = structurallyUsable(bp, issues);
  const profile = buildAssessmentProfile(exam, usable ? bp : null);
  const evidence = buildAssessmentEvidenceIndex(exam, usable ? bp : null);
  const report: BlueprintCoverageReport = {
    totalQuestions: profile.totalQuestions, totalOfficialMarks: profile.totalOfficialMarks,
    totals: [], constraints: [], constraintCount: 0,
    unclassified: { ...profile.unclassified, questionIds: evidence.unclassified },
    unmappedBank: { questionIds: Object.keys(evidence.unmappedBankTopics).length ? evidence.order.filter(id => Object.values(evidence.unmappedBankTopics).some(ids => ids.includes(id))) : [], byTopic: evidence.unmappedBankTopics },
    issues
  };
  if (!usable) return report;

  // total targets — first-class rows (count → totalQuestions; marks → totalOfficialMarks, never totalWeightMarks)
  const tq = bp.targets?.totalQuestions, tm = bp.targets?.totalMarks;
  const totalsBase = { count: profile.totalQuestions, weightMarks: profile.totalWeightMarks, officialMarks: profile.totalOfficialMarks, issues: [] as BlueprintIssue[], evidence: evidence.order };
  if (typeof tq === "number" && Number.isFinite(tq)) {
    report.targetTotalQuestions = tq;
    report.totals.push({ id: "total-questions", kind: "total-questions", refLabel: "إجمالي الأسئلة", metric: "count", unit: "absolute", actual: profile.totalQuestions, target: tq, ...totalsBase, ...evaluateConstraintRelation(profile.totalQuestions, { target: tq }) });
  }
  if (typeof tm === "number" && Number.isFinite(tm)) {
    report.targetTotalMarks = tm;
    report.totals.push({ id: "total-marks", kind: "total-marks", refLabel: "إجمالي العلامات", metric: "marks", unit: "absolute", actual: profile.totalOfficialMarks, target: tm, ...totalsBase, ...evaluateConstraintRelation(profile.totalOfficialMarks, { target: tm }) });
  }

  // constraints — blueprint order; one indexed bucket lookup each (O(c) after the O(n) profile / evidence passes)
  report.constraintCount = bp.constraints.length;
  bp.constraints.forEach((c, i) => {
    const prefix = "constraints[" + i + "]";
    const own = issues.filter(iss => (typeof c.id === "string" && iss.refId === c.id) || (iss.path !== undefined && (iss.path === prefix || iss.path.startsWith(prefix + "."))));
    const { tally, ids } = bucketFor(profile, evidence, c);
    const base = {
      id: String(c.id ?? prefix), kind: "constraint" as const, dimension: c.dimension, ref: typeof c.ref === "string" ? c.ref : undefined,
      refLabel: refLabelFor(bp, exam, c), metric: c.metric, unit: c.unit, count: tally.count, weightMarks: tally.weightMarks, officialMarks: tally.officialMarks,
      ...limitsOf(c), issues: own, evidence: ids
    };
    if (own.length) { report.constraints.push(unassessable(base, "blueprint-issue")); return; }
    let actual: number;
    if (c.metric === "count") {
      if (c.unit === "percent") { if (profile.totalQuestions === 0) { report.constraints.push(unassessable(base, "zero-count-denominator")); return; } actual = (tally.count / profile.totalQuestions) * 100; base.evidence = ids; (base as CoverageItem).denominator = profile.totalQuestions; }
      else actual = tally.count;
    } else {
      if (c.unit === "percent") { if (profile.totalOfficialMarks === 0) { report.constraints.push(unassessable(base, "zero-marks-denominator")); return; } actual = (tally.officialMarks / profile.totalOfficialMarks) * 100; (base as CoverageItem).denominator = profile.totalOfficialMarks; }
      else actual = tally.officialMarks;
    }
    const rel = evaluateConstraintRelation(actual, limitsOf(c));
    if (rel.relation === "unassessable") { report.constraints.push(unassessable(base, "no-limits")); return; }
    report.constraints.push({ ...base, actual, ...rel });
  });
  return report;
}

/** Arabic relation labels — factual, never evaluative. */
export const RELATION_LABEL: Record<CoverageRelation, string> = {
  "below-min": "أقل من الحد الأدنى", "below-target": "أقل من الهدف", "within-tolerance": "ضمن حد السماح", "at-target": "عند الهدف",
  "above-target": "أعلى من الهدف", "above-max": "أعلى من الحد الأقصى", "within-range": "ضمن النطاق", unassessable: "غير قابل للتقييم"
};
export const DIMENSION_LABEL: Record<BlueprintDimension, string> = { topic: "موضوع", objective: "هدف تعليمي", difficulty: "صعوبة", cognitiveLevel: "مستوى معرفي", questionType: "نوع السؤال", capability: "مهارة / قدرة", section: "قسم" };
export type { BuilderSection };
