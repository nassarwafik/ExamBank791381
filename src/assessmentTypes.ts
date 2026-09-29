// Phase 13C-A — CANONICAL, DOMAIN-NEUTRAL ASSESSMENT CONTRACTS (types + vocabulary only; no logic, no imports).
//
// One versioned Blueprint model serves every subject (Networking, Computer Science, Mathematics, Physics, Chemistry, …).
// Subject identity and academic taxonomy are DATA carried by the blueprint — never a closed enum, never a code branch.
// Identity is always a stable id: labels are display text and may change freely without invalidating any mapping.

export const ASSESSMENT_BLUEPRINT_SCHEMA_VERSION = 1 as const;

/** A named identity (subject / curriculum / course / level). `id` is the stable key; `label` is display text. */
export type BlueprintIdentity = { id: string; label: string };

export type BlueprintTopic = { id: string; label: string; parentId?: string; order?: number; description?: string };
export type BlueprintObjective = { id: string; label: string; topicId?: string; order?: number; description?: string };

/** The generic constraint dimensions (one system for every subject) and how a constraint is measured. */
export const BLUEPRINT_DIMENSIONS = ["topic", "objective", "difficulty", "cognitiveLevel", "questionType", "capability", "section"] as const;
export type BlueprintDimension = typeof BLUEPRINT_DIMENSIONS[number];
export const BLUEPRINT_METRICS = ["count", "marks"] as const;
export type BlueprintMetric = typeof BLUEPRINT_METRICS[number];
export const BLUEPRINT_UNITS = ["absolute", "percent"] as const;
export type BlueprintUnit = typeof BLUEPRINT_UNITS[number];

/** A single coverage / distribution constraint. Partial (only min, only max, only target …) is valid. */
export type BlueprintConstraint = {
  id: string;
  dimension: BlueprintDimension;
  /** The stable reference in that dimension: topic id, objective id, difficulty value, cognitive level id, engine
   *  question type, capability tag, or section id. */
  ref: string;
  metric: BlueprintMetric;
  unit: BlueprintUnit;
  min?: number;
  target?: number;
  max?: number;
  tolerance?: number;
};

export type CognitiveLevelDef = { id: string; label: string; order?: number };
export type DifficultyScale = { min: number; max: number; labels?: Record<string, string> };

export type AssessmentBlueprintV1 = {
  schemaVersion: typeof ASSESSMENT_BLUEPRINT_SCHEMA_VERSION;
  subject: BlueprintIdentity;
  curriculum?: BlueprintIdentity;
  course?: BlueprintIdentity;
  level?: BlueprintIdentity;
  topics: BlueprintTopic[];
  objectives: BlueprintObjective[];
  targets?: { totalQuestions?: number; totalMarks?: number };
  constraints: BlueprintConstraint[];
  /** Optional cognitive vocabulary; defaults to DEFAULT_COGNITIVE_LEVELS (Bloom) when absent. */
  cognitiveLevels?: CognitiveLevelDef[];
  /** Optional difficulty scale; defaults to DEFAULT_DIFFICULTY_SCALE (1..5) when absent. */
  difficultyScale?: DifficultyScale;
  notes?: string;
  /** Phase 13C-C — OPTIONAL versioned quality policy: which factual coverage conditions matter for authoring finalization.
   *  Persisted with the specification; its evaluation result never is. Absent → no policy behaviour at all. */
  qualityPolicy?: AssessmentQualityPolicyV1;
};

// ── Phase 13C-C — QUALITY POLICY (policy enforcement, never scoring) ─────────────────────────────────────────────
export const ASSESSMENT_QUALITY_POLICY_SCHEMA_VERSION = 1 as const;
export const QUALITY_EFFECTS = ["warning", "block-finalization"] as const;
export type QualityEffect = typeof QUALITY_EFFECTS[number];
/** The 13C-B coverage relations a rule may name as triggers (same literals as CoverageRelation; declared here so the
 *  types module stays the dependency root). */
export const QUALITY_TRIGGER_RELATIONS = ["below-min", "below-target", "within-tolerance", "at-target", "above-target", "above-max", "within-range", "unassessable"] as const;
export type QualityTriggerRelation = typeof QUALITY_TRIGGER_RELATIONS[number];
export type QualityCoverageSource = { kind: "constraint"; constraintId: string } | { kind: "total-questions" } | { kind: "total-marks" };
export type QualityThresholdSource = { kind: "unclassified" } | { kind: "unmapped-bank" };
export type QualityRuleSource = QualityCoverageSource | QualityThresholdSource;
export const QUALITY_THRESHOLD_METRICS = ["count", "officialMarks"] as const;
export type QualityThresholdMetric = typeof QUALITY_THRESHOLD_METRICS[number];
/** A rule that reacts to the factual RELATION of a coverage row (constraint / total). Never re-states min / target / max. */
export type CoverageQualityRule = { id: string; enabled: boolean; source: QualityCoverageSource; relations: QualityTriggerRelation[]; effect: QualityEffect; note?: string };
/** A rule over the factual unclassified / unmapped-bank figures: triggers when the figure exceeds `max`. */
export type ThresholdQualityRule = { id: string; enabled: boolean; source: QualityThresholdSource; metric: QualityThresholdMetric; max: number; effect: QualityEffect; note?: string };
export type AssessmentQualityRule = CoverageQualityRule | ThresholdQualityRule;
export type AssessmentQualityPolicyV1 = { schemaVersion: typeof ASSESSMENT_QUALITY_POLICY_SCHEMA_VERSION; enabled: boolean; rules: AssessmentQualityRule[] };

/** Optional, additive pedagogical metadata on a question (or part). Absent on every existing question: still valid. */
export type AssessmentMeta = {
  primaryTopicId?: string;
  secondaryTopicIds?: string[];
  objectiveIds?: string[];
  difficulty?: number;
  cognitiveLevel?: string;
  /** Generic skill / capability tags (e.g. "cli", "calculation", "graph-reading") — free data, not an enum. */
  capabilities?: string[];
};

/** Bloom-style default vocabulary. A blueprint may declare its own (`cognitiveLevels`) — nothing assumes this one. */
export const DEFAULT_COGNITIVE_LEVELS: readonly CognitiveLevelDef[] = Object.freeze([
  { id: "remember", label: "تذكّر", order: 1 },
  { id: "understand", label: "فهم", order: 2 },
  { id: "apply", label: "تطبيق", order: 3 },
  { id: "analyze", label: "تحليل", order: 4 },
  { id: "evaluate", label: "تقويم", order: 5 },
  { id: "create", label: "إبداع", order: 6 }
]);
export const DEFAULT_DIFFICULTY_SCALE: DifficultyScale = Object.freeze({ min: 1, max: 5 }) as DifficultyScale;

// ── Interactive assessment CONTEXT (13C-A: context only — never a scored response, never graded) ─────────────────
/** The interactive-context families an exam may reference. Guided (teaching scaffolding) is deliberately NOT one. */
export const ASSESSMENT_ACTIVITY_KINDS = ["simulation", "animation", "interactive-diagram"] as const;
export type AssessmentActivityKind = typeof ASSESSMENT_ACTIVITY_KINDS[number];

/**
 * A DATA-ONLY reference to a trusted, repo-registered renderer: {kind, key, version} identity + declarative config.
 * Persisted exam data can never carry a component, module path, function, script or markup; trust (whether the
 * identity is exam-safe) is owned by the repo registry — a stored flag has no authority. `config` is STUDENT-VISIBLE:
 * it must not contain answers, keys, solutions or teacher hints.
 */
export type AssessmentActivityDescriptor = {
  id: string;
  kind: AssessmentActivityKind;
  key: string;
  version: number;
  title?: string;
  description?: string;
  config?: Record<string, unknown>;
  placement?: "before" | "after";
};

/** Minimal structural view of a builder question used by fixtures / tests (the real type is examTypes.BuilderQuestion). */
export type BuilderQuestionLike = { examQuestionId: string; presentationType: string; text: string; marks: number; assessmentMeta?: AssessmentMeta; [key: string]: unknown };
