// UX-7 — the /api/student-dashboard payload as the portal consumes it (unchanged contract; every field is
// server-authoritative, the portal only displays it).
import type { DashboardState, GradingStatus } from "../gradingStatus";
import type { RankTier } from "../studentRank";

export type LatestResult = { attemptNumber: number; score: number; totalMarks: number; percentage: number; submittedAt: string; manualReviewMarks: number; finalized?: boolean; gradingStatus?: GradingStatus; teacherFeedback: string };
export type Summary = {
  assignmentId: string; title: string; instructions: string; openAt: string; dueAt: string; effectiveDueAt?: string; questionCount: number; totalMarks: number; durationMinutes?: number;
  availability: "scheduled" | "open" | "closed"; dashboardState?: DashboardState; gradingStatus?: GradingStatus; attemptsUsed: number; allowedAttempts: number; canAttempt: boolean;
  attemptStatus?: string; hasActiveAttempt?: boolean; latestScore: number | null; latestPercentage: number | null; latestResult?: LatestResult | null; createdAt: string;
};
export type Stats = { assigned: number; completed: number; average: number | null; submitted?: number; inProgress?: number; pendingReview?: number; finalized?: number; scheduled?: number; available?: number; closedUnsubmitted?: number; averageFinalized?: number | null };
export type StudentInfo = { userId: string; code: string; displayName: string; classId: string; avatarId?: string; shareAchievements?: boolean; profilePhoto?: { version: number; updatedAt: string } | null };
export type Classroom = { classId: string; name: string; grade: string; schoolYear: string };
/** One enrolled project's Strength contribution as the server derived it (round(overallProgress × 4), ≤ 400). */
export type ProjectStrength = { projectCode: string; overallProgress: number; strengthPoints: number };
/** LEGACY six-rank block (historical achievement events only). Carried by the server; it never decides the stage. */
export type LegacyRank = { tier: RankTier | null; level: number; nextTier: RankTier | null; levelBlockSize: number; withinLevelPoints: number; nextLevelRemaining: number; percent: number };
/**
 * The server-authoritative unified Strength summary (نقاط القوة) — the EXACT `dashboard.strength` contract of
 * `api/src/lib/student-strength.js` (`buildStrengthSummary`). The points AND the whole 25-stage progression (stage
 * number, within-stage points, percent, next stage, remaining) are decided by the server; the portal only shapes and
 * labels them and NEVER derives a stage from a total.
 */
export type StudentStrength = {
  /** The uncapped authoritative total (exams + practice + study + projects). `totalPoints` is the same number (compat). */
  rawTotalPoints: number; totalPoints: number;
  examPoints: number; practicePoints: number; studyPoints: number; gamePoints: number; projectPoints: number;
  /** The visible path: min(raw, 2000), its ceiling, and the 25 × 80 geometry. */
  stagePoints: number; stageMaxPoints: number; stageCount: number; stageBlockSize: number;
  /** 1..25 — never 26. */
  stageNumber: number;
  stageFloor: number; withinStagePoints: number; stagePercent: number;
  /** null at stage 25 (there is no stage 26). */
  nextStageNumber: number | null;
  /** 0 at stage 25. */
  nextStageRemaining: number;
  /** 2000 − stagePoints: how far the whole path is from complete (0 when complete). */
  pointsToMaximum: number;
  isMaximumStage: boolean; pathComplete: boolean;
  legacyRank: LegacyRank | null;
  projects: ProjectStrength[];
};
/** Recognition (never Strength): medals (finalized authority), reactions RECEIVED on the student's events, and
 *  meaningful non-medal achievements — three separate counts that are never combined into one score. */
export type StudentRecognition = {
  medals: { total: number; gold: number; silver: number; bronze: number };
  reactionsReceived: { total: number; byType: Record<"heart" | "clap" | "cheer" | "fire", number> };
  achievements: { total: number; byType: Record<"global_rank_up" | "project_rank_up" | "project_complete", number> };
};
/** Phase 9A — the server's most recent study completion (Today Hub «تابع القراءة» fallback across devices). */
export type StudyLastActivity = { courseId: string; moduleId: string; pageId: string; completedAt: string };
export type Dashboard = { student: StudentInfo; classroom: Classroom | null; assignments: Summary[]; stats: Stats; strength: StudentStrength | null; recognition: StudentRecognition | null; study?: { lastActivity: StudyLastActivity | null } };
export type Detail = {
  assignmentId: string; title: string; instructions: string; openAt: string; dueAt: string; effectiveDueAt?: string; maxAttempts: number; questionCount: number; totalMarks: number; durationMinutes?: number; requiresStart?: boolean; timed?: boolean;
  marksDistribution?: { rows: { title: string; marks: number }[]; total: number };
  exam: { title?: string; metadata?: { school?: string; subject?: string; grade?: string; className?: string; generalInstructions?: string }; presentationTheme?: string; coverPage?: any; questions?: any[]; sections?: any[] };
};
