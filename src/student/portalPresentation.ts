// UX-7 — pure presentation rules of the student portal (no React, no fetching). Grading status is NEVER inferred
// from a score: it is the server field or the shared resolver over an actual result object (manualReviewMarks /
// finalized). Medals are finalized-only (the same rule the server applies when it posts an achievement).
import { resolveGradingStatus, type DashboardState, type GradingStatus } from "../gradingStatus";
import { medalTier, type MedalTier } from "../medals";
import type { BadgeTone } from "../ui/StatusBadge";
import type { Summary } from "./types";

// A live server attempt (started/draft) — the student must be able to RESUME it regardless of canAttempt,
// which can be false once maxAttempts was reduced after the attempt started (B2B #24).
export const isResumable = (item: Summary): boolean => !!item.hasActiveAttempt || item.attemptStatus === "started" || item.attemptStatus === "draft";

// The server sends dashboardState; fall back locally (older payloads) FAIL-SAFE. Grading status is only ever
// taken from the server field or resolved from an actual result object — NEVER from latestScore/latestPercentage.
// A payload that carries only a score but no grading metadata resolves to notSubmitted here, so it falls through
// to lifecycle+availability rather than being falsely labeled final.
export const gradingOf = (item: Summary): GradingStatus => item.gradingStatus || resolveGradingStatus(item.latestResult || null);
export const stateOf = (item: Summary): DashboardState => {
  if (item.dashboardState) return item.dashboardState;            // server-authoritative presentation state
  if (isResumable(item)) return "inProgress";                     // a live/resumable attempt still wins (old payloads)
  const gs = gradingOf(item);
  if (gs === "pendingReview") return "awaitingReview";
  if (gs === "final") return "completed";
  if (item.availability === "scheduled") return "scheduled";
  if (item.availability === "closed") return "closedUnsubmitted";
  return "available";
};

// Truthful action-button label per presentation state (§10). Attempt eligibility (canAttempt) is unchanged.
export const actionLabel = (item: Summary): string => {
  switch (stateOf(item)) {
    case "inProgress": return "متابعة المحاولة";
    case "awaitingReview": return "عرض النتيجة المؤقتة";
    case "completed": return item.canAttempt ? "النتيجة / محاولة جديدة" : "عرض النتيجة";
    case "scheduled": return "لم يفتح بعد";
    case "closedUnsubmitted": return "عرض الواجب";
    default: return "ابدأ الحل";
  }
};

export type PortalFilter = "all" | "action" | "inProgress" | "awaitingReview" | "completed";
export const FILTERS: { key: PortalFilter; label: string }[] = [
  { key: "all", label: "الكل" }, { key: "action", label: "تحتاج إجراء" }, { key: "inProgress", label: "قيد الحل" }, { key: "awaitingReview", label: "بانتظار التصحيح" }, { key: "completed", label: "مكتملة" }
];
export const matchesFilter = (item: Summary, f: PortalFilter): boolean => {
  const st = stateOf(item);
  if (f === "all") return true;
  if (f === "action") return st === "available" || st === "inProgress";  // تحتاج إجراء
  if (f === "inProgress") return st === "inProgress";
  if (f === "awaitingReview") return st === "awaitingReview";
  return st === "completed";
};

// Task-first order: what the student can act on now comes first; ties keep the server order (due date).
const TASK_PRIORITY: Record<DashboardState, number> = { inProgress: 0, available: 1, awaitingReview: 2, scheduled: 3, completed: 4, closedUnsubmitted: 5 };
export function sortTaskFirst(items: Summary[]): Summary[] {
  return items.map((item, index) => ({ item, index, p: TASK_PRIORITY[stateOf(item)] ?? 9 }))
    .sort((a, b) => a.p - b.p || a.index - b.index)
    .map(x => x.item);
}

export const STATE_TONE: Record<DashboardState, BadgeTone> = { scheduled: "neutral", available: "info", inProgress: "info", awaitingReview: "warn", completed: "success", closedUnsubmitted: "danger" };

// Medals: ONLY assignments whose latest result is final, read from the result's own percentage — never from a
// provisional (pendingReview) result and never from the bare latestPercentage of an older payload.
export function medalsFor(items: Summary[]): MedalTier[] {
  const out: MedalTier[] = [];
  for (const item of items) {
    const lr = item.latestResult;
    if (!lr || gradingOf(item) !== "final") continue;
    const tier = medalTier(Number(lr.percentage));
    if (tier) out.push(tier);
  }
  return out;
}
export function countMedals(medals: MedalTier[]): { tier: MedalTier; count: number }[] {
  return (["gold", "silver", "bronze"] as MedalTier[]).map(tier => ({ tier, count: medals.filter(m => m === tier).length })).filter(x => x.count > 0);
}

// ISO-style, Western-digit date/time (local time of the viewer), stable and unambiguous on every device.
const two = (n: number) => String(n).padStart(2, "0");
export function formatWhen(value: string): string {
  if (!value) return "بدون موعد";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "بدون موعد";
  return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) + " " + two(d.getHours()) + ":" + two(d.getMinutes());
}

export const NEW_POST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export function isRecent(createdAt: string, now: number): boolean {
  const t = new Date(createdAt || "").getTime();
  return Number.isFinite(t) && now - t >= 0 && now - t <= NEW_POST_WINDOW_MS;
}
