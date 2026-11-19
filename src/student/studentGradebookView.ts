// Class gradebook GB6b — the student's approved marks as /api/student-gradebook sends them, and how «علاماتي» words them. PURE: every
// value is the server's frozen, approved one (one decimal, D6); a state that is not a mark is never shown as a number.
export type StudentGbItem = { itemId: string; title: string; weight: number; kind: "assignment" | "project" | "manual"; state: "graded" | "zero" | "excused" | string; display: number | null };
export type StudentGbPart = { categoryId: string; title: string; weight: number; approvedAt: string; value: number | null; display: number | null; allExcused?: true; items: StudentGbItem[] };
export type StudentGbClass = { classId: string; className: string; parts: StudentGbPart[]; final: { value: number | null; display: number | null; approvedAt: string } | null };

/** One item's mark in words: the number, «0» for the teacher's zero, «معفى»; never a number for anything else. */
export function itemText(item: StudentGbItem): string {
  if (item.state === "excused") return "معفى";
  if (item.state === "zero") return "0";
  if (item.state === "graded" && item.display !== null && item.display !== undefined) return String(item.display);
  return "—";
}
export function partText(part: StudentGbPart): string {
  if (part.display !== null && part.display !== undefined) return String(part.display);
  return part.allExcused ? "معفى" : "—";
}

