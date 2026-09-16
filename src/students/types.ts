// Shared TYPES for the Classes & Students workspace (UX-4). Presentation components receive these
// shapes and callbacks from TeacherPlatform, which remains the single owner of state, API handlers,
// mutations, authoritative reload decisions and lifecycle semantics.
import type { GradingStatus } from "../gradingStatus";

export type ClassArchiveView = "active" | "archived";
export type Classroom = { classId: string; name: string; grade: string; schoolYear: string; programCode?: string; programCodes?: string[]; active: boolean; status?: string; archivedAt?: string; archivedBy?: string; archiveReason?: string; graduationYear?: string; studentCount: number; createdAt: string };
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
};
export type SortKey = "firstName" | "familyName" | "identityNumber" | "status";
export type StatusFilter = "all" | "active" | "disabled" | "archived";
export type BulkOperation = "activate" | "deactivate" | "archive" | "unarchive" | "move" | "resetpasswords" | "delete";
export type ProfileSection = "summary" | "history";
