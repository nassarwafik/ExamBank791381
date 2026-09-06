// Shared types for the Project 794589 tracker frontend. Mirrors the backend JSON shapes.
export type StageStatus = "not_started" | "in_progress" | "ready_for_review" | "approved";
export type Track = "book" | "packetTracer";

export type ProjectStage = {
  stageId: string;
  track: Track;
  groupId: string;
  title: string;
  description?: string;
  order: number;
  weight?: number;
  required?: boolean;
  active?: boolean;
  relatedStageIds?: string[];
};

export type ProjectGroup = { groupId: string; track: Track; title: string; order: number };

export type StatusCounts = { not_started: number; in_progress: number; ready_for_review: number; approved: number };

export type StudentCard = {
  studentId: string;
  displayName: string;
  code: string;
  overallProgress: number;
  bookProgress: number;
  packetTracerProgress: number;
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
  avgBook: number;
  avgPacketTracer: number;
  completedCount: number;
  studentsReadyForReview: number;
  totalReadyStages: number;
  staleCount: number;
  trackWeights: { book: number; packetTracer: number };
  staleDays: number;
};

export type StageProgressEntry = { status: StageStatus; note?: string; updatedAt?: string; approvedAt?: string; approvedBy?: string };

export type HistoryEvent = { eventId: string; stageId: string; type: "status" | "note"; fromStatus?: StageStatus; toStatus?: StageStatus; actor: string; createdAt: string };

export type StudentDetail = {
  ok: true;
  readOnly: boolean;
  student: { studentId: string; displayName: string; code: string };
  summary: StudentCard;
  stages: ProjectStage[];
  groups: ProjectGroup[];
  trackWeights: { book: number; packetTracer: number };
  config: { staleDays: number; lateThreshold: number; balanceWarningThreshold: number };
  progress: Record<string, StageProgressEntry>;
  history: HistoryEvent[];
  nextBookStage: ProjectStage | null;
  nextPacketTracerStage: ProjectStage | null;
  balance: { leadingTrack: Track; diff: number } | null;
};

export type ProjectAnalytics = {
  perStudent: { studentId: string; name: string; book: number; packetTracer: number; overall: number }[];
  stageCompletion: { stageId: string; title: string; track: Track; groupId: string; approvedPct: number }[];
  buckets: Record<"0-25" | "26-50" | "51-75" | "76-99" | "100", number>;
  weeklyTrend: { weekStart: string; avgOverall: number }[];
  heatmap: {
    students: { studentId: string; name: string }[];
    stages: { stageId: string; title: string; track: Track; groupId: string }[];
    statuses: Record<string, StageStatus>[];
  };
};

export type StudentFilter = "all" | "ready" | "late" | "not_started" | "complete" | "stale";
