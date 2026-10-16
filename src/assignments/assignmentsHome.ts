// Phase 21G.2 — the assignments home model (pure): each assignment's TIME status (scheduled / open / closing soon / closed, from its
// own opening time and deadline — a per-student extension does not change the class-wide status), the time filter, and the KPI
// strip over the assignments in scope and their server progress (GET /api/assignment-progress). No React, no requests.
import type { AssignmentProgress, Item } from "./types";

export const CLOSING_SOON_MS = 48 * 3600 * 1000;
export type TimeStatus = "draft" | "archived" | "scheduled" | "open" | "closingSoon" | "closed";
export type TimeFilter = "all" | "open" | "closingSoon" | "scheduled" | "closed" | "draft";

const ms = (v: string) => { const t = Date.parse(String(v || "")); return Number.isFinite(t) ? t : null; };

/** The class-wide time status of an assignment at `now`. */
export function timeStatusOf(x: Item, now: number): TimeStatus {
  if (x.status === "archived") return "archived";
  if (x.status === "draft") return "draft";
  const open = ms(x.openAt), due = ms(x.dueAt);
  if (open !== null && open > now) return "scheduled";
  if (due !== null && due <= now) return "closed";
  if (due !== null && due - now <= CLOSING_SOON_MS) return "closingSoon";
  return "open";
}

// Arabic counted nouns (1 · 2 · 3–10 · 11+), the same agreement the rest of the app uses.
const counted = (n: number, one: string, two: string, few: string, many: string) => (n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? n + " " + few : n + " " + many);
/** A duration in the largest whole unit: «5 ساعات», «يومان», «دقيقة واحدة». Never below one minute. */
export function durationArabic(deltaMs: number): string {
  const minutes = Math.max(1, Math.round(Math.abs(deltaMs) / 60000));
  if (minutes < 60) return counted(minutes, "دقيقة واحدة", "دقيقتين", "دقائق", "دقيقة");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return counted(hours, "ساعة واحدة", "ساعتين", "ساعات", "ساعة");
  const days = Math.round(hours / 24);
  return counted(days, "يوم واحد", "يومين", "أيام", "يومًا");
}

/** The time chip of a published assignment (null for drafts / archived: their status badge already says it). */
export function timeLabel(x: Item, now: number): { status: TimeStatus; label: string; tone: "info" | "attention" | "neutral" | "success" } | null {
  const status = timeStatusOf(x, now), open = ms(x.openAt), due = ms(x.dueAt);
  if (status === "scheduled") return { status, label: "يفتح بعد " + durationArabic((open as number) - now), tone: "info" };
  if (status === "closed") return { status, label: "أُغلق منذ " + durationArabic(now - (due as number)), tone: "neutral" };
  if (status === "closingSoon") return { status, label: "يُغلق خلال " + durationArabic((due as number) - now), tone: "attention" };
  if (status === "open") return { status, label: due === null ? "مفتوح بلا موعد نهائي" : "مفتوح · يُغلق خلال " + durationArabic(due - now), tone: "success" };
  return null;
}

export const TIME_FILTERS: { key: TimeFilter; label: string }[] = [
  { key: "all", label: "الكل" }, { key: "open", label: "مفتوحة" }, { key: "closingSoon", label: "تُغلق قريبًا" },
  { key: "scheduled", label: "مجدولة" }, { key: "closed", label: "مغلقة" }, { key: "draft", label: "مسودات" }
];
/** «مفتوحة» includes the ones closing soon (they are open); the other filters are exact. */
export function matchesTimeFilter(x: Item, f: TimeFilter, now: number): boolean {
  if (f === "all") return true;
  const s = timeStatusOf(x, now);
  return f === "open" ? s === "open" || s === "closingSoon" : s === f;
}
export function timeFilterCounts(items: readonly Item[], now: number): Record<TimeFilter, number> {
  const out: Record<TimeFilter, number> = { all: 0, open: 0, closingSoon: 0, scheduled: 0, closed: 0, draft: 0 };
  for (const x of items) { if (x.status === "archived") continue; out.all++; for (const f of TIME_FILTERS) if (f.key !== "all" && matchesTimeFilter(x, f.key, now)) out[f.key]++; }
  return out;
}

export type HomeKpis = { open: number; closingSoon: number; pendingReview: number; pendingAssignments: number; active: number; submitted: number; expected: number; completion: number | null; progressKnown: boolean };
/**
 * The KPI strip over the (current, non-archived) assignments in scope. «بانتظار التصحيح» and «يحاولون الآن» count every published
 * assignment in scope (a closed one can still wait for grading); the submission rate covers the OPEN ones (what is still being
 * collected). progressKnown=false when the progress read is unavailable: the figures that need it are then shown as unknown.
 */
export function homeKpis(items: readonly Item[], progress: ReadonlyMap<string, AssignmentProgress> | null, now: number): HomeKpis {
  let open = 0, closingSoon = 0, pendingReview = 0, pendingAssignments = 0, active = 0, submitted = 0, expected = 0;
  for (const x of items) {
    const s = timeStatusOf(x, now), p = progress?.get(x.assignmentId) || null;
    if (s === "open" || s === "closingSoon") { open++; if (s === "closingSoon") closingSoon++; if (p) { submitted += p.submitted; expected += p.expected; } }
    if (p && x.status === "published") { pendingReview += p.pendingReview; if (p.pendingReview > 0) pendingAssignments++; active += p.active; }
  }
  return { open, closingSoon, pendingReview, pendingAssignments, active, submitted, expected, completion: expected ? Math.round(submitted / expected * 100) : null, progressKnown: progress !== null };
}
