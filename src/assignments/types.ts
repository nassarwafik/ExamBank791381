// Shared TYPES for the Assignments & Gradebook workspace (UX-5). Presentation components receive these shapes
// and callbacks from AssignmentsPanel, which remains the single owner of state, API handlers, mutations,
// authoritative snapshots, grading resolution (rowGrading) and lifecycle semantics.
import type { GradingStatus } from "../gradingStatus";

export type Classroom = { classId: string; name: string; grade: string; active: boolean; status?: string };
export type Item = { assignmentId: string; classId: string; className: string; title: string; instructions: string; status: "draft" | "published" | "archived"; openAt: string; dueAt: string; questionCount: number; totalMarks: number; maxAttempts: number; durationMinutes?: number; archivedAt?: string; archivedBy?: string; archivedFromStatus?: string; archiveReason?: string };
// Read-only deletion impact (Roadmap #7) returned by action:"deleteImpact".
export type Impact = { assignmentId: string; status: string; submissionDocuments: number; studentsWithCompletedAttempts: number; completedAttempts: number; activeAttempts: number; draftDocuments: number; canPurge: boolean };
export type Exam = { examId?: string; title?: string; totalMarks?: number; questions?: unknown[]; sections?: unknown[] };
export type SavedExam = { blobName: string; examId: string; title: string; savedAt: string; questionCount: number; totalMarks: number };
export type Attempt = { attemptNumber: number; score: number; totalMarks: number; percentage: number; submittedAt: string; finalized: boolean; manualReviewMarks: number; gradingStatus?: GradingStatus; startedAt?: string; endedAt?: string; endReason?: string; timedOut?: boolean };
export type ActiveAttempt = { attemptNumber: number; startedAt: string; endsAt: string; extendedEndsAt?: string; status?: string; lastSavedAt?: string };
export type StudentResult = { studentId: string; studentName: string; studentCode: string; attemptsUsed: number; allowedAttempts: number; dueAtOverride: string | null; attemptStatus?: string; gradingStatus?: GradingStatus; activeAttempt?: ActiveAttempt | null; effectiveAttemptEndsAt?: string; attemptDurationEndsAt?: string; attemptExpired?: boolean; canStartAttempt?: boolean; canWrite?: boolean; timed?: boolean; durationMinutes?: number; attempts: Attempt[]; latestResult: Attempt | null };
// The authoritative lifecycle snapshot every mutating teacher action returns (B2B #18) — merged into the row.
export type LifecycleSnap = Partial<StudentResult>;
export type Stats = { students: number; submitted: number; pendingReview: number; finalized?: number; notSubmitted?: number; active?: number; average: number | null; highest: number | null; lowest: number | null };
export type GradebookFilter = "all" | "pendingReview" | "final" | "notSubmitted" | "active";
export type GradebookSort = "name" | "pendingFirst" | "highest" | "lowest";
export type QuestionStat = { questionId: string; number: number; text: string; type: string; maxMarks: number; studentsAnalyzed: number; correctCount: number; correctRate: number | null; averageScore: number | null; averagePercentage: number | null; manualReviewCount: number; difficulty: "easy" | "medium" | "hard" | null };
export type ItemAnalysis = { assignmentId: string; title: string; studentsInClass: number; studentsSubmitted: number; attemptsAnalyzed: number; questions: QuestionStat[] };
export type AnalysisSort = "number" | "hardest" | "easiest";
export type SourceMode = "mine" | "library";
export type WorkspaceMode = "list" | "composer";
// Lightweight lifecycle labels for the gradebook (B2A #22): لم يبدأ / قيد المحاولة / مسودة / تم التسليم / انتهى الوقت.
export const LIFECYCLE_LABEL: Record<string, string> = { notStarted: "لم يبدأ", started: "قيد المحاولة", draft: "مسودة", submitted: "تم التسليم", timedOut: "انتهى الوقت" };
export const STATUS_LABEL: Record<Item["status"], string> = { published: "منشور", draft: "مسودة", archived: "مؤرشف" };
