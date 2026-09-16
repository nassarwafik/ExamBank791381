// Roadmap #32 — Teacher Roster Local Patching: small PURE helpers for patching the teacher's in-memory roster
// after a single-student mutation succeeds, instead of re-downloading the whole roster (GET /api/students is
// ~1,900 storage operations for a 200-student class; a single mutation is 5–14).
//
// Rules (approved R32 design):
//   - Rows change ONLY from server-returned values, and only AFTER the server reported success (no optimistic
//     mutation anywhere).
//   - The computed per-row counters (submittedAssignmentsCount, likesCount) are derived server-side from
//     submissions / achievement posts, which no student-management action writes, so a patch always PRESERVES
//     the existing row's counters; a brand-new student starts at 0 (a fresh userId has no history).
//   - Anything ambiguous (rosterSynced:false, a missing/incomplete document, an unexpected classId) is NOT
//     patched: needsAuthoritativeReload() says so and the caller performs the authoritative reload instead
//     (GET students first — that read is also the roster-index self-heal — then GET classrooms).
// Bulk operations never use these helpers: partial bulk results always take the authoritative full reload.

export type RosterRow = { userId: string; submittedAssignmentsCount: number; likesCount: number };

export type PatchKind = "create" | "update" | "toggleActive" | "archive" | "unarchive" | "delete";

// The subset of a mutation response the reload decision looks at (every field is `unknown` on purpose — the
// decision must hold for malformed / incomplete bodies too).
export type MutationResponse = {
  rosterSynced?: unknown;
  student?: { userId?: unknown; classId?: unknown } | null;
  active?: unknown;
  archived?: unknown;
  deleted?: unknown;
};

// Append a server-returned NEW student (counters start at 0). Idempotent on userId.
export function appendStudentRow<T extends RosterRow>(rows: T[], student: Omit<T, "submittedAssignmentsCount" | "likesCount">): T[] {
  const row = { ...student, submittedAssignmentsCount: 0, likesCount: 0 } as T;
  return [...rows.filter(r => r.userId !== row.userId), row];
}

// Merge server-returned fields into the existing row; the row's computed counters are always preserved.
// A userId that is not in `rows` leaves the list untouched (never injects a row into a foreign roster).
export function mergeStudentRow<T extends RosterRow>(rows: T[], patch: Partial<T> & { userId: string }): T[] {
  return rows.map(r => r.userId === patch.userId
    ? { ...r, ...patch, submittedAssignmentsCount: r.submittedAssignmentsCount, likesCount: r.likesCount }
    : r);
}

export function removeStudentRow<T extends RosterRow>(rows: T[], userId: string): T[] {
  return rows.filter(r => r.userId !== userId);
}

export function pruneSelectedIds(selectedIds: string[], userId: string): string[] {
  return selectedIds.filter(id => id !== userId);
}

function hasStudentIn(response: MutationResponse, expectedClassId: string): boolean {
  const student = response.student;
  if (!student || typeof student !== "object") return false;
  if (typeof student.userId !== "string" || !student.userId) return false;
  return String(student.classId ?? "") === expectedClassId;
}

// TRUE when the response cannot be applied locally and the caller must reload authoritatively:
//   - rosterSynced === false for ANY kind (the class count index sync was deferred; GET students repairs it),
//   - create/update: no student document, no userId, or a classId other than `expectedClassId`,
//   - toggleActive: `active` is not a boolean,
//   - archive / unarchive / delete: the confirmation flag is not exactly the expected value.
export function needsAuthoritativeReload(kind: PatchKind, response: MutationResponse | null | undefined, expectedClassId = ""): boolean {
  if (!response || typeof response !== "object") return true;
  if (response.rosterSynced === false) return true;
  switch (kind) {
    case "create":
    case "update":
      return !hasStudentIn(response, expectedClassId);
    case "toggleActive":
      return typeof response.active !== "boolean";
    case "archive":
      return response.archived !== true;
    case "unarchive":
      return response.archived !== false;
    case "delete":
      return response.deleted !== true;
    default:
      return true;
  }
}
