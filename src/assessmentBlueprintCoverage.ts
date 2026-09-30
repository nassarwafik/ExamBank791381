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
  buildAssessmentProfile, effectiveAssessmentMeta, validateBlueprintForExam, blueprintCognitiveLevels, blueprintDifficultyScale, prepareAssessmentMetaContext,
  type AssessmentProfile, type AssessmentMetaContext, type AssessmentEvaluationInstrumentation, type BlueprintIssue, type Tally
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
  /** Questions carrying at least one unmapped bank topic — built in the same pass, global order, one entry per question. */
  unmappedQuestionIds: string[];
};
const push = (rec: Record<string, string[]>, key: string, id: string) => { (rec[key] || (rec[key] = [])).push(id); };
export function buildAssessmentEvidenceIndex(exam: StructuredExam, blueprint?: AssessmentBlueprintV1 | null, context?: AssessmentMetaContext, instrumentation?: AssessmentEvaluationInstrumentation): AssessmentEvidenceIndex {
  const bp = blueprint === undefined ? exam.blueprint : blueprint;
  const ctx = context ?? prepareAssessmentMetaContext(bp, instrumentation);                                       // R3-C: one taxonomy lookup per pass
  const idx: AssessmentEvidenceIndex = { order: [], byTopic: {}, byObjective: {}, byDifficulty: {}, byType: {}, byCognitiveLevel: {}, byCapability: {}, bySection: {}, unclassified: [], unmappedBankTopics: {}, unmappedQuestionIds: [] };
  for (const s of exam.sections || []) {
    for (const q of (s.questions || []) as BuilderQuestion[]) {
      const id = q.examQuestionId;
      idx.order.push(id);
      push(idx.bySection, s.id, id);
      const eff = effectiveAssessmentMeta(q, bp ?? undefined, ctx);
      if (eff.primaryTopicId) push(idx.byTopic, eff.primaryTopicId, id); else idx.unclassified.push(id);
      for (const o of eff.objectiveIds) push(idx.byObjective, o, id);
      push(idx.byDifficulty, eff.difficulty === undefined ? "unspecified" : String(eff.difficulty), id);
      push(idx.byType, String(q.presentationType || "unspecified"), id);
      push(idx.byCognitiveLevel, eff.cognitiveLevel ?? "unspecified", id);
      for (const c of eff.capabilities) push(idx.byCapability, c, id);
      if (eff.unmappedBankTopics.length) idx.unmappedQuestionIds.push(id);                       // R3-A: in-pass, ordered, once per question
      for (const t of eff.unmappedBankTopics) push(idx.unmappedBankTopics, t, id);
    }
  }
  return idx;
}

// ── labels (display only) — prepared ONCE per evaluation (13C-C hardening H2: no per-row array scans) ───────────
export type CoverageLabelIndex = { topics: Map<string, string>; objectives: Map<string, string>; cognitive: Map<string, string>; sections: Map<string, string>; difficulty: Record<string, string> | undefined };
export function prepareCoverageLabels(bp: AssessmentBlueprintV1, exam: Pick<StructuredExam, "sections">): CoverageLabelIndex {
  const m = (items: ReadonlyArray<{ id: string; label?: string; title?: string }>, pick: (x: { label?: string; title?: string }) => string | undefined) => { const out = new Map<string, string>(); for (const x of items) if (typeof x.id === "string" && !out.has(x.id)) out.set(x.id, pick(x) || x.id); return out; };
  return {
    topics: m(bp.topics, x => x.label), objectives: m(bp.objectives, x => x.label), cognitive: m(blueprintCognitiveLevels(bp), x => x.label),
    sections: m(exam.sections || [], x => x.title), difficulty: blueprintDifficultyScale(bp).labels
  };
}
function refLabelFor(labels: CoverageLabelIndex, c: BlueprintConstraint): string {
  const ref = String(c.ref ?? "");
  switch (c.dimension) {
    case "topic": return labels.topics.get(ref) || ref;
    case "objective": return labels.objectives.get(ref) || ref;
    case "difficulty": { const l = labels.difficulty?.[ref]; return l ? ref + " — " + l : ref; }
    case "cognitiveLevel": return labels.cognitive.get(ref) || ref;
    case "questionType": return (QUESTION_TYPE_LABELS as Record<string, string>)[ref] || ref;
    case "section": return labels.sections.get(ref) || ref;
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

// One-time issue index (R3-B): constraint issues are keyed by constraint id AND by the `constraints[i]` path prefix, so a
// row obtains its issues in O(1) whatever the id looks like (malformed / duplicate ids included); target issues by path.
type IssueIndex = { byId: Map<string, BlueprintIssue[]>; byIndex: Map<number, BlueprintIssue[]>; byPath: Map<string, BlueprintIssue[]> };
const addTo = <K,>(m: Map<K, BlueprintIssue[]>, k: K, iss: BlueprintIssue) => { const arr = m.get(k); if (arr) arr.push(iss); else m.set(k, [iss]); };
function indexIssues(issues: BlueprintIssue[]): IssueIndex {
  const ix: IssueIndex = { byId: new Map(), byIndex: new Map(), byPath: new Map() };
  for (const iss of issues) {
    if (iss.refId !== undefined) addTo(ix.byId, iss.refId, iss);
    if (iss.path !== undefined) {
      addTo(ix.byPath, iss.path, iss);
      const m = /^constraints\[(\d+)\]/.exec(iss.path);
      if (m) addTo(ix.byIndex, Number(m[1]), iss);
    }
  }
  return ix;
}
const uniq = (a: BlueprintIssue[], b: BlueprintIssue[]): BlueprintIssue[] => (b.length === 0 ? a : a.length === 0 ? b : Array.from(new Set([...a, ...b])));

export type CoverageEvaluationOptions = { instrumentation?: AssessmentEvaluationInstrumentation };
export function evaluateBlueprintCoverage(exam: StructuredExam, blueprint?: AssessmentBlueprintV1 | null, options?: CoverageEvaluationOptions): BlueprintCoverageReport {
  const bp = blueprint === undefined ? exam.blueprint : blueprint;
  const issues = bp ? validateBlueprintForExam(bp, exam) : [];
  const usable = structurallyUsable(bp, issues);
  const ctx = prepareAssessmentMetaContext(usable ? bp : null, options?.instrumentation);       // R3-C: prepared ONCE, shared below
  const profile = buildAssessmentProfile(exam, usable ? bp : null, ctx);
  const evidence = buildAssessmentEvidenceIndex(exam, usable ? bp : null, ctx);
  const report: BlueprintCoverageReport = {
    totalQuestions: profile.totalQuestions, totalOfficialMarks: profile.totalOfficialMarks,
    totals: [], constraints: [], constraintCount: 0,
    unclassified: { ...profile.unclassified, questionIds: evidence.unclassified },
    unmappedBank: { questionIds: evidence.unmappedQuestionIds, byTopic: evidence.unmappedBankTopics },
    issues
  };
  if (!usable) return report;
  const ix = indexIssues(issues);
  const labels = prepareCoverageLabels(bp, exam);                                                 // H2: label maps once per evaluation

  // total targets — first-class rows (count → totalQuestions; marks → totalOfficialMarks, never totalWeightMarks).
  // R2: a target the canonical validator rejected (INVALID_TARGET) is an UNASSESSABLE row carrying that issue — never an
  // authoritative target, never coerced, never repaired, never silently dropped.
  const totalsBase = { count: profile.totalQuestions, weightMarks: profile.totalWeightMarks, officialMarks: profile.totalOfficialMarks, evidence: evidence.order };
  const targetsIssues = ix.byPath.get("targets") ?? [];
  const targetRow = (id: "total-questions" | "total-marks", key: "totalQuestions" | "totalMarks", label: string, metric: BlueprintMetric, actual: number) => {
    const targets = bp.targets as Record<string, unknown> | undefined;
    if (!targets || typeof targets !== "object" || !(key in targets)) { if (targetsIssues.length) report.totals.push(unassessable({ id, kind: id, refLabel: label, metric, unit: "absolute", ...totalsBase, issues: targetsIssues }, "blueprint-issue")); return; }
    const own = uniq(targetsIssues, ix.byPath.get("targets." + key) ?? []);
    const t = targets[key];
    if (own.length || typeof t !== "number" || !Number.isFinite(t)) { report.totals.push(unassessable({ id, kind: id, refLabel: label, metric, unit: "absolute", ...totalsBase, issues: own }, "blueprint-issue")); return; }
    if (id === "total-questions") report.targetTotalQuestions = t; else report.targetTotalMarks = t;
    report.totals.push({ id, kind: id, refLabel: label, metric, unit: "absolute", actual, target: t, ...totalsBase, issues: [], ...evaluateConstraintRelation(actual, { target: t }) });
  };
  targetRow("total-questions", "totalQuestions", "إجمالي الأسئلة", "count", profile.totalQuestions);
  targetRow("total-marks", "totalMarks", "إجمالي العلامات", "marks", profile.totalOfficialMarks);

  // constraints — blueprint order; one indexed bucket lookup and one indexed issue lookup each (O(c) after the O(n) passes)
  report.constraintCount = bp.constraints.length;
  bp.constraints.forEach((c, i) => {
    const prefix = "constraints[" + i + "]";
    const own = uniq(ix.byIndex.get(i) ?? [], typeof c.id === "string" ? ix.byId.get(c.id) ?? [] : []);
    const { tally, ids } = bucketFor(profile, evidence, c);
    const base = {
      id: typeof c.id === "string" && c.id ? c.id : prefix, kind: "constraint" as const, dimension: c.dimension, ref: typeof c.ref === "string" ? c.ref : undefined,
      refLabel: refLabelFor(labels, c), metric: c.metric, unit: c.unit, count: tally.count, weightMarks: tally.weightMarks, officialMarks: tally.officialMarks,
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
