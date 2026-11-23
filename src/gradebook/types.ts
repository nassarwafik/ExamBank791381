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

/** GB8 — a class whose scheme can be copied («نسخ من صف آخر»). */
export type GbCopyClass = { classId: string; name: string; schoolYear: string; archived: boolean; categories: number; items: number; updatedAt: string };
export type GbCopyClasses = { ok: true; classId: string; classes: GbCopyClass[] };
/** GB8 — another class's scheme proposed for this class: no ids (the page gives new ones); what could not be copied is listed. */
export type GbCopyUnmatched = { category: string; title: string; weight: number; kind: GbSource["kind"]; code: string; reason: string; candidates?: string[] };
export type GbCopyProposal = {
  ok: true; classId: string; from: { classId: string; name: string }; copied: number;
  categories: { title: string; weight: number; items: { weight: number; source: GbSource; title: string }[] }[];
  unmatched: GbCopyUnmatched[];
};

/** GB10 — the AI's proposal of a scheme for this class («بناء المخطط بالذكاء الاصطناعي»): no ids (the page gives new ones); a null weight
 *  is one the teacher still has to type; what could not be built is listed; `notes` are the server's own, `assumptions` the model's. */
export type GbAiUnmatched = { category: string; title: string; weight: number | null; code: string; reason: string; candidates?: string[] };
export type GbAiProposal = {
  categories: { title: string; weight: number | null; items: { weight: number | null; source: GbSource; title: string }[] }[];
  unmatched: GbAiUnmatched[];
  notes: string[];
  assumptions: string[];
  built: number;
};
export type GbAiProposalReply = { ok: true; classId: string; proposal: GbAiProposal } | { ok: false; code: string; message: string };

/** GB10c — one change to the CURRENT draft («تعديل المخطط الحالي»), by the draft's own keys (a new part: "new_1"…). The page applies them,
 *  so the existing parts and columns keep their ids. A null weight is one the teacher still has to type. */
export type GbAiEditOp =
  | { op: "setCategoryWeight"; categoryKey: string; weight: number | null }
  | { op: "renameCategory"; categoryKey: string; title: string }
  | { op: "addCategory"; categoryKey: string; title: string; weight: number | null }
  | { op: "removeCategory"; categoryKey: string }
  | { op: "addItem"; categoryKey: string; source: GbSource; weight: number | null }
  | { op: "removeItem"; categoryKey: string; itemKey: string }
  | { op: "setItemWeight"; categoryKey: string; itemKey: string; weight: number | null }
  | { op: "equalizeItems"; categoryKey: string }
  | { op: "equalizeCategories" };
export type GbAiEdit = { ops: GbAiEditOp[]; changes: string[]; unmatched: GbAiUnmatched[]; notes: string[]; assumptions: string[] };
export type GbAiEditReply = { ok: true; classId: string; edit: GbAiEdit } | { ok: false; code: string; message: string };
/** GB10c — the draft as the server reads it for an edit. */
export type GbAiCurrent = { categories: { key: string; title: string; weight: number | null; items: { key: string; weight: number | null; source: GbSource }[] }[] };
