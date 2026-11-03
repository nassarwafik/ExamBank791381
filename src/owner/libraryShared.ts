import type { OwnerLibraryItem } from "./ownerApi";

// Tadris+ P6-D — shared by «بنك الامتحانات» (OwnerLibrary.tsx) and the teacher page's «الامتحانات» (OwnerTeacherExams.tsx).

/** Free-text search over an exam's id and title (empty = every exam). */
export const matchesSearch = (item: Pick<OwnerLibraryItem, "libraryItemId" | "title">, q: string) => {
  const s = q.trim().toLowerCase();
  return !s || item.libraryItemId.toLowerCase().includes(s) || item.title.toLowerCase().includes(s);
};
/** How an exam's audience reads in the console. */
export function audienceText(item: OwnerLibraryItem): string {
  if (item.audience === "all") return "لكل المعلمين";
  if (!item.decided) return "لم يُحدَّد بعد — لا يراه أحد";
  if (!item.teachers.length) return "لا يراه أي معلم";
  return item.teachers.length === 1 ? "معلم واحد" : item.teachers.length + " معلمين";
}

