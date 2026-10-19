// Phase P-5 — the student cards' view model (pure; no request). It tells a student who never started apart from one who
// started and then stopped, and orders the cards the way the teacher chooses. Every value it reads is an API field of the
// card; nothing about progress is recomputed.
import type { StudentCard } from "./types";

/** No stage has left «لم يبدأ»: nothing in progress, nothing waiting for review, nothing approved. */
export function isNotStarted(card: StudentCard): boolean {
  const c = card.counts;
  return (c.in_progress || 0) + (c.ready_for_review || 0) + (c.approved || 0) === 0;
}

/**
 * «بلا تحديث» — a STARTED, unfinished student whose last update is older than the class's staleDays. The server's `stale`
 * flag is also true for a student who never started (an empty updatedAt reads as infinitely old), so it is narrowed here:
 * a never-started student is «لم يبدأ», never «بلا تحديث».
 */
export function isStalled(card: StudentCard): boolean {
  return card.stale && !card.complete && !isNotStarted(card);
}

/** The one state shown on a card / table row (complete wins, then stalled, then not started); null for a student in progress. */
export function cardState(card: StudentCard): { label: string; tone: "success" | "warn" | "neutral" } | null {
  if (card.complete) return { label: "مكتمل", tone: "success" };
  if (isStalled(card)) return { label: "بلا تحديث", tone: "warn" };
  if (isNotStarted(card)) return { label: "لم يبدأ", tone: "neutral" };
  return null;
}

export type StudentSort = "name" | "progressAsc" | "progressDesc" | "readyFirst" | "updatedOldest";
export const STUDENT_SORTS: { key: StudentSort; label: string }[] = [
  { key: "name", label: "الاسم" },
  { key: "progressAsc", label: "التقدم: الأقل أولًا" },
  { key: "progressDesc", label: "التقدم: الأعلى أولًا" },
  { key: "readyFirst", label: "جاهز للفحص: الأكثر أولًا" },
  { key: "updatedOldest", label: "آخر تحديث: الأقدم أولًا" }
];

const byName = (a: StudentCard, b: StudentCard) =>
  a.displayName.localeCompare(b.displayName, "ar", { numeric: true }) || String(a.code || "").localeCompare(String(b.code || ""), "ar", { numeric: true });
// A student with no update at all is the oldest; an unparsable date sorts with them.
const updatedMs = (card: StudentCard) => { const t = Date.parse(card.updatedAt || ""); return Number.isFinite(t) ? t : -Infinity; };

/** A new array in the chosen order; equal keys fall back to the name (numeric: «طالب2» before «طالب10»), then the code. */
export function sortStudentCards(cards: StudentCard[], sort: StudentSort): StudentCard[] {
  const key: Record<StudentSort, (a: StudentCard, b: StudentCard) => number> = {
    name: () => 0,
    progressAsc: (a, b) => a.overallProgress - b.overallProgress,
    progressDesc: (a, b) => b.overallProgress - a.overallProgress,
    readyFirst: (a, b) => b.readyForReviewCount - a.readyForReviewCount,
    updatedOldest: (a, b) => { const x = updatedMs(a), y = updatedMs(b); return x === y ? 0 : x < y ? -1 : 1; }
  };
  return [...cards].sort((a, b) => key[sort](a, b) || byName(a, b));
}
