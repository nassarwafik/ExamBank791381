// Class gradebook — the /api/class-gradebook payloads as the teacher UI reads them (docs/enterprise-class-gradebook-gb.md §4.5).
// The server owns every rule and every computed value; these types only describe what it sends.

export type GbSource =
  | { kind: "assignment"; assignmentId: string }
  | { kind: "project"; projectCode: string }
  | { kind: "manual"; title: string; maxScore: number };

export type GbItem = { itemId: string; weight: number; source: GbSource };
export type GbCategory = { categoryId: string; title: string; weight: number; items: GbItem[] };
export type GbScheme = { revision: number; categories: GbCategory[]; updatedAt: string };

export type GbStudent = { studentId: string; displayName: string; code: string };
export type GbColumn = { itemId: string; categoryId: string; weight: number; source: GbSource; title: string };
export type GbCellState = "excused" | "zero" | "graded" | "pending" | "missing" | "missingSource" | "unclassified" | "withheld";
export type GbCell = { state: GbCellState; percent?: number; display?: number | null; evidence?: { kind: "final"; percent: number } | { kind: "pending" } };
export type GbCategoryValue = { value: number | null; display: number | null; draft?: true; allExcused?: true };
export type GbFinal = { value: number | null; display: number | null; status: "complete" | "provisional" | "incomplete" | "draft"; adjusted?: true };
export type GbRow = { studentId: string; cells: Record<string, GbCell>; categories: Record<string, GbCategoryValue>; final: GbFinal };

export type GbGradebook = {
  ok: true;
  classId: string;
  className: string;
  readOnly: boolean;
  students: GbStudent[];
  etags: { scheme: string | null; entries: string | null };
  withheld: string[];
  scheme: GbScheme | null;
  schemeStatus?: "active" | "draft";
  columns: GbColumn[];
  rows: GbRow[];
  warnings: { itemId: string; code: string }[];
  /** GB5 — the teacher's stored entries per column and student (a typed score or a decision); absent on an older API. */
  entries?: Record<string, Record<string, GbEntryValue>>;
  /** GB6 — what is approved (with its drift since) and whether each part / the final may be approved now; absent on an older API. */
  approvals?: GbApprovals;
  readiness?: GbReadiness;
};

/** GB6 — how the gradebook differs from an approval: `students` null = unknown (a column this teacher may not see). */
export type GbDrift = { structure: boolean; students: number | null };
export type GbApprovalEntry = { action: "part.approve" | "part.reopen" | "final.approve" | "final.reopen" | string; categoryId?: string; at: string; reason?: string };
export type GbApprovals = {
  revision: number;
  parts: Record<string, { approvedAt: string; schemeRevision: number; drift: GbDrift }>;
  final: { approvedAt: string; drift: GbDrift } | null;
  history: GbApprovalEntry[];
};
export type GbIssue = { code: string; message: string; cells?: number; students?: number; itemIds?: string[]; categoryIds?: string[] };
export type GbReadinessEntry = { ready: boolean; issues: GbIssue[] };
export type GbReadiness = { parts: Record<string, GbReadinessEntry>; final: GbReadinessEntry };
export type GbApprovalSaved = { ok: true; revision: number; unchanged?: true; approvedAt?: string };

/** A stored teacher entry: a manual column's score, or an excused / zero decision. */
export type GbEntryValue = { score: number } | { decision: "excused" | "zero" };
export type GbEntryItem = { itemId: string; studentId: string; expected: GbEntryValue | null; value: GbEntryValue | null };
export type GbEntriesSaved = { ok: true; revision: number; applied: { itemId: string; studentId: string }[]; stale: { itemId: string; studentId: string; current: GbEntryValue | null }[] };

export type GbAssignmentSource = { assignmentId: string; title: string; status: string; totalMarks: number; publishedAt: string };
export type GbProjectSource = { projectCode: string; title: string };
export type GbSources = { ok: true; classId: string; assignments: GbAssignmentSource[]; projects: GbProjectSource[]; withheld: string[] };

export type GbSchemeSaved = { ok: true; etag: string | null; revision: number; status: "active" | "draft"; sumIssues: { path: string; sum: number }[] };
