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
};

export type GbAssignmentSource = { assignmentId: string; title: string; status: string; totalMarks: number; publishedAt: string };
export type GbProjectSource = { projectCode: string; title: string };
export type GbSources = { ok: true; classId: string; assignments: GbAssignmentSource[]; projects: GbProjectSource[]; withheld: string[] };

export type GbSchemeSaved = { ok: true; etag: string | null; revision: number; status: "active" | "draft"; sumIssues: { path: string; sum: number }[] };
