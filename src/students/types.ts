// Shared TYPES for the Classes & Students workspace (UX-4). Presentation components receive these
// shapes and callbacks from TeacherPlatform, which remains the single owner of state, API handlers,
// mutations, authoritative reload decisions and lifecycle semantics.
import type { GradingStatus } from "../gradingStatus";

export type ClassArchiveView = "active" | "archived";
// Class Learning Materials — an INDEPENDENT domain from projects (programCodes) and from exam assignments.
// `courseId` = the book/course the class uses; `visibleModuleIds` = the modules CURRENTLY published to its students
// (canonical content order, server-normalized). A course may be attached with [] (nothing released yet).
export type ClassLearningMaterial = { courseId: string; visibleModuleIds: string[] };
/** One releasable module as the server publication registry describes it (identity + title + content order only). */
export type LearningCatalogModule = { moduleId: string; title: string; order: number };
/** One publishable course from GET /api/learning-materials-catalog (production-approved modules only, no bodies). */
export type LearningCatalogCourse = { courseId: string; title: string; subject: string; modules: LearningCatalogModule[] };
export type Classroom = { classId: string; name: string; grade: string; schoolYear: string; programCode?: string; programCodes?: string[]; active: boolean; status?: string; archivedAt?: string; archivedBy?: string; archiveReason?: string; graduationYear?: string; studentCount: number; createdAt: string; learningMaterials?: ClassLearningMaterial[] };
export type ProjectOption = { projectCode: string; title: string };
export type Student = { userId: string; code: string; identityNumber: string; firstName: string; familyName: string; displayName: string; classId: string; active: boolean; archived: boolean; createdAt: string; updatedAt: string; lastLoginAt: string; submittedAssignmentsCount: number; likesCount: number };
export type Credential = { userId?: string; firstName?: string; familyName?: string; displayName?: string; code: string; identityNumber?: string; password: string };
export type BulkStudent = { firstName: string; familyName: string; identityNumber: string };
export type BulkError = { index?: number; firstName?: string; familyName?: string; identityNumber?: string; displayName?: string; code?: string; error: string; userId?: string };
export type ImportPreviewRow = { index: number; firstName: string; familyName: string; identityNumber: string; status: "valid" | "duplicate" | "invalid"; error: string; existingStudent?: { userId: string; displayName: string; classId: string; className: string; active: boolean; archived: boolean } | null };
export type SubmittedAssignment = { assignmentId: string; title: string; submittedAt: string; latestAttemptNumber: number; attemptsUsed: number; allowedAttempts: number; score: number; totalMarks: number; percentage: number; gradingStatus?: GradingStatus; finalized?: boolean; isCurrentClassAssignment: boolean; dueAt: string; dueAtOverride: string | null; effectiveDueAt: string };
export type StudentProfile = {
  student: Student;
  classroom: { classId: string; name: string; grade: string; schoolYear: string } | null;
  stats: { assigned: number; completed: number; pending: number; average: number | null; lastLoginAt: string };
  assignments: Array<{ assignmentId: string; title: string; status: string; dueAt: string; totalMarks: number; attemptsUsed: number; latestScore: number | null; latestPercentage: number | null; submittedAt: string; gradingStatus?: GradingStatus; finalized?: boolean }>;
  submittedAssignmentsCount: number;
  submittedAssignments: SubmittedAssignment[];
  /** Additive (same authorities as the student dashboard): global Strength + rank, recognition, project summaries. */
  strength?: { totalPoints: number; examPoints: number; practicePoints: number; projectPoints: number; tier: string | null; level: number; nextTier: string | null; nextLevelRemaining: number } | null;
  recognition?: { medals: { total: number; gold: number; silver: number; bronze: number }; reactionsReceived: { total: number; byType: Record<string, number> }; achievements: { total: number; byType: Record<string, number> } } | null;
  projectSummaries?: { projectCode: string; title: string; overallProgress: number; complete: boolean }[];
};
export type SortKey = "firstName" | "familyName" | "identityNumber" | "status";
export type StatusFilter = "all" | "active" | "disabled" | "archived";
export type BulkOperation = "activate" | "deactivate" | "archive" | "unarchive" | "move" | "resetpasswords" | "delete";
export type ProfileSection = "summary" | "history";
