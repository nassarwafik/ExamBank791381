// Shared types for the GENERIC Project Tracker frontend. Track ids are plain strings (book / access /
// visualStudio / packetTracer / …) supplied by the project definition — never hard-coded — so the same
// components render every project. Per-track values live in { [trackId]: value } maps.

export type StageStatus = "not_started" | "in_progress" | "ready_for_review" | "approved";

export type TrackMeta = { trackId: string; title: string; icon?: string };

export type ProjectStage = {
  stageId: string;
  track: string;
  groupId: string;
  title: string;
  description?: string;
  order: number;
  weight?: number;
  required?: boolean;
  active?: boolean;
};

export type ProjectGroup = { groupId: string; track: string; title: string; order: number };

export type StatusCounts = { not_started: number; in_progress: number; ready_for_review: number; approved: number };

export type StudentCard = {
  studentId: string;
  displayName: string;
  code: string;
  /** Project performance (additive): grade /100, project Strength /600 and its tier — absent on older payloads. */
  grade?: number;
  projectStrength?: number;
  projectTier?: ProjectRankTier;
  overallProgress: number;
  trackProgress: Record<string, number>;
  counts: StatusCounts;
  readyForReviewCount: number;
  complete: boolean;
  updatedAt: string;
  stale: boolean;
};

export type ProjectClass = {
  classId: string;
  name: string;
  grade: string;
  schoolYear: string;
  status: "active" | "archived";
  archivedAt?: string;
  studentCount: number;
};

export type ClassSummary = {
  studentCount: number;
  avgOverall: number;
  trackAverages: Record<string, number>;
  completedCount: number;
  studentsReadyForReview: number;
  totalReadyStages: number;
  staleCount: number;
  trackWeights: Record<string, number>;
  staleDays: number;
};

/** `score` (teacher-only quality mark 0–100) is additive/optional; status (workflow) and score (quality) are separate. */
export type StageProgressEntry = { status: StageStatus; note?: string; score?: number | null; updatedAt?: string; approvedAt?: string; approvedBy?: string };

export type HistoryEvent = { eventId: string; stageId: string; type: "status" | "note" | "score"; fromStatus?: StageStatus; toStatus?: StageStatus; fromScore?: number | null; toScore?: number | null; actor: string; createdAt: string };

/** One stage's project value as the server computed it (only stages that carry project value are listed). */
export type StageValue = { stageId: string; track: string; status: StageStatus; score: number | null; maxContribution: number; contribution: number; counted: boolean };
/**
 * Project performance for ONE student in ONE project — the server's `performance` (api/src/lib/project-tracker/
 * performance.js): grade /100 (approved stages' weighted scores), progress (canonical summary), project-specific
 * Strength /600 with its six-band tier. Display-only on the client; nothing here is recomputed.
 */
export type ProjectPerformance = {
  overallProgress: number; grade: number; gradePrecise: number;
  projectStrength: number; maxStrength: number;
  tier: ProjectRankTier; level: number; nextTier: ProjectRankTier | null;
  complete: boolean;
  stageValues: Record<string, StageValue>;
};
export type ProjectRankTier = "beginner" | "bronze" | "silver" | "gold" | "diamond" | "legendary";

/** Phase 9B — one ACTIVE stage of the evaluation axis: its teacher score (null = «لم تُقيّم بعد»; 0 IS a grade). */
export type EvaluationStage = { stageId: string; track: string; groupId: string; title: string; order: number; required: boolean; status: StageStatus; score: number | null; graded: boolean; scoredAt: string; scoredBy: string };
/**
 * Phase 9B — the server's `evaluation` (api/src/lib/project-tracker/evaluation.js): graded / ungraded ACTIVE stages,
 * evaluationProgress = graded / total × 100, projectScore = the average of the graded stages (null while none is
 * graded). Distinct from `performance.grade` (approved-only, weighted, feeds Strength) and from `summary.overallProgress`
 * (workflow). Display-only on the client; nothing is recomputed here.
 */
export type ProjectEvaluation = {
  totalStages: number; gradedStages: number; ungradedStages: number; evaluationProgress: number;
  projectScore: number | null; projectScorePrecise: number | null;
  stages: EvaluationStage[]; orphanStageIds: string[]; updatedAt: string;
};

export type BalanceInsight = { leadingTrackId: string; leadingTrackTitle: string; laggingTrackId: string; laggingTrackTitle: string; diff: number } | null;

export type StudentDetail = {
  ok: true;
  readOnly: boolean;
  projectCode: string;
  student: { studentId: string; displayName: string; code: string };
  tracks: TrackMeta[];
  summary: StudentCard;
  stages: ProjectStage[];
  groups: ProjectGroup[];
  trackWeights: Record<string, number>;
  config: { staleDays: number; lateThreshold: number; balanceWarningThreshold: number };
  progress: Record<string, StageProgressEntry>;
  history: HistoryEvent[];
  nextStages: Record<string, ProjectStage | null>;
  balance: BalanceInsight;
  /** Additive: absent on older payloads. */
  performance?: ProjectPerformance;
  /** Phase 9B — additive: absent on older payloads. */
  evaluation?: ProjectEvaluation;
};

export type ProjectAnalytics = {
  perStudent: { studentId: string; name: string; trackProgress: Record<string, number>; overall: number }[];
  stageCompletion: { stageId: string; title: string; track: string; groupId: string; approvedPct: number }[];
  buckets: Record<"0-25" | "26-50" | "51-75" | "76-99" | "100", number>;
  weeklyTrend: { weekStart: string; avgOverall: number }[];
  heatmap: {
    students: { studentId: string; name: string }[];
    stages: { stageId: string; title: string; track: string; groupId: string }[];
    statuses: Record<string, StageStatus>[];
  };
};

export type ProjectMeta = { projectCode: string; title: string; tracks: TrackMeta[] };

export type StudentFilter = "all" | "ready" | "late" | "not_started" | "complete" | "stale";
