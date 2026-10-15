import type { Item } from "./types";

// Pure client-side discovery over the already-authorized assignment list.
// The server remains authoritative for assignment state, deadlines, grading and mutations.
export type AssignmentStatusFilter = "all" | "published" | "draft";
export type AssignmentSort = "dueSoon" | "dueLate" | "title";

const deadline = (iso: string): number | null => {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : null;
};

export function selectAssignments(items: Item[], status: AssignmentStatusFilter, sort: AssignmentSort): Item[] {
  const selected = items.filter(item => status === "all" || item.status === "archived" || item.status === status);
  const byTitle = (a: Item, b: Item) => a.title.localeCompare(b.title, "ar") || a.assignmentId.localeCompare(b.assignmentId);
  return [...selected].sort((a, b) => {
    if (sort === "title") return byTitle(a, b);
    const ad = deadline(a.dueAt), bd = deadline(b.dueAt);
    // Missing/invalid deadlines go last in either direction, avoiding false "overdue" presentation.
    if (ad === null && bd === null) return byTitle(a, b);
    if (ad === null) return 1;
    if (bd === null) return -1;
    return (sort === "dueSoon" ? ad - bd : bd - ad) || byTitle(a, b);
  });
}
