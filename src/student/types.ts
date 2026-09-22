// UX-7 — the /api/student-dashboard payload as the portal consumes it (unchanged contract; every field is
// server-authoritative, the portal only displays it).
import type { DashboardState, GradingStatus } from "../gradingStatus";

export type LatestResult = { attemptNumber: number; score: number; totalMarks: number; percentage: number; submittedAt: string; manualReviewMarks: number; finalized?: boolean; gradingStatus?: GradingStatus; teacherFeedback: string };
export type Summary = {
  assignmentId: string; title: string; instructions: string; openAt: string; dueAt: string; effectiveDueAt?: string; questionCount: number; totalMarks: number; durationMinutes?: number;
  availability: "scheduled" | "open" | "closed"; dashboardState?: DashboardState; gradingStatus?: GradingStatus; attemptsUsed: number; allowedAttempts: number; canAttempt: boolean;
  attemptStatus?: string; hasActiveAttempt?: boolean; latestScore: number | null; latestPercentage: number | null; latestResult?: LatestResult | null; createdAt: string;
};
export type Stats = { assigned: number; completed: number; average: number | null; submitted?: number; inProgress?: number; pendingReview?: number; finalized?: number; scheduled?: number; available?: number; closedUnsubmitted?: number; averageFinalized?: number | null };
export type StudentInfo = { userId: string; code: string; displayName: string; classId: string; avatarId?: string; shareAchievements?: boolean; profilePhoto?: { version: number; updatedAt: string } | null };
export type Classroom = { classId: string; name: string; grade: string; schoolYear: string };
/**
 * The server-authoritative unified Strength summary (نقاط القوة) — the EXACT `dashboard.strength` contract of
 * `api/src/lib/student-strength.js` (`buildStrengthSummary`), the 25-STAGE model. The points AND the stage /
 * progress are decided by the SERVER; the portal only maps the stage number to its icon/name and displays them.
 *   library (T01–T30 + F01–F06, ≤40 each) + modules (28 book modules, completion ratio × 20, ≤20 each) = 0..2000,
 *   stage = 1..25 (each stage spans 80 points; stage 25 completes at 2000).
 */
export type StudentStrength = {
  totalPoints: number;
  /** Library source total (T + F items). */
  libraryPoints: number;
  /** Learning-module source total (in-page Study-Practice completion). */
  modulePoints: number;
  /** The current stage (1..25). The client maps it to artwork/name — never decides it. */
  stage: number;
  stageCount: number; stageSpan: number;
  /** Progress within the current 80-point stage. */
  withinStagePoints: number; nextStageRemaining: number; percent: number;
  /** The next stage number (null at the top stage 25). */
  nextStage: number | null;
  totalMax: number;
};
/** Recognition (never Strength): medals (finalized authority), reactions RECEIVED on the student's events, and
 *  meaningful non-medal achievements — three separate counts that are never combined into one score. */
export type StudentRecognition = {
  medals: { total: number; gold: number; silver: number; bronze: number };
  reactionsReceived: { total: number; byType: Record<"heart" | "clap" | "cheer" | "fire", number> };
  achievements: { total: number; byType: Record<"global_rank_up" | "project_rank_up" | "project_complete", number> };
};
export type Dashboard = { student: StudentInfo; classroom: Classroom | null; assignments: Summary[]; stats: Stats; strength: StudentStrength | null; recognition: StudentRecognition | null };
export type Detail = {
  assignmentId: string; title: string; instructions: string; openAt: string; dueAt: string; effectiveDueAt?: string; maxAttempts: number; questionCount: number; totalMarks: number; durationMinutes?: number; requiresStart?: boolean; timed?: boolean;
  marksDistribution?: { rows: { title: string; marks: number }[]; total: number };
  exam: { title?: string; metadata?: { school?: string; subject?: string; grade?: string; className?: string; generalInstructions?: string }; presentationTheme?: string; coverPage?: any; questions?: any[]; sections?: any[] };
};
