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
export type StudentInfo = { userId: string; code: string; displayName: string; classId: string; avatarId?: string; shareAchievements?: boolean };
export type Classroom = { classId: string; name: string; grade: string; schoolYear: string };
/** One enrolled project's Strength contribution as the server derived it (round(overallProgress × 4), ≤ 400). */
export type ProjectStrength = { projectCode: string; overallProgress: number; strengthPoints: number };
/**
 * The server-authoritative unified Strength summary (نقاط القوة) — the EXACT `dashboard.strength` contract of
 * `api/src/lib/student-strength.js` (`buildStrengthSummary`). The points AND the progression (tier / level /
 * nextTier / block progress) are decided by the server; the portal only shapes and labels them.
 */
export type StudentStrength = {
  totalPoints: number; examPoints: number; practicePoints: number; projectPoints: number;
  /** The earned rank tier id (null below the first rank). The client maps it to a label/artwork — never decides it. */
  tier: RankTier | null;
  /** 0 before the first rank, then 1..6. */
  level: number;
  /** The next tier id (null at the top rank). */
  nextTier: RankTier | null;
  levelBlockSize: number; withinLevelPoints: number; nextLevelRemaining: number; percent: number;
  projects: ProjectStrength[];
};
export type Dashboard = { student: StudentInfo; classroom: Classroom | null; assignments: Summary[]; stats: Stats; strength: StudentStrength | null };
export type Detail = {
  assignmentId: string; title: string; instructions: string; openAt: string; dueAt: string; effectiveDueAt?: string; maxAttempts: number; questionCount: number; totalMarks: number; durationMinutes?: number; requiresStart?: boolean; timed?: boolean;
  marksDistribution?: { rows: { title: string; marks: number }[]; total: number };
  exam: { title?: string; metadata?: { school?: string; subject?: string; grade?: string; className?: string; generalInstructions?: string }; presentationTheme?: string; coverPage?: any; questions?: any[]; sections?: any[] };
};
