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

export type StageProgressEntry = { status: StageStatus; note?: string; updatedAt?: string; approvedAt?: string; approvedBy?: string };

export type HistoryEvent = { eventId: string; stageId: string; type: "status" | "note"; fromStatus?: StageStatus; toStatus?: StageStatus; actor: string; createdAt: string };

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
