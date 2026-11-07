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

// "What should I do now?": only states the dashboard already declares actionable (a live attempt, an open
// assignment). Scheduled work is listed as upcoming with its opening time — never with a fake start action.
export const isActionable = (item: Summary): boolean => { const st = stateOf(item); return st === "inProgress" || st === "available"; };
export function nowItems(items: Summary[]): { actionable: Summary[]; upcoming: Summary[] } {
  const ordered = sortTaskFirst(items);
  return { actionable: ordered.filter(isActionable), upcoming: ordered.filter(item => stateOf(item) === "scheduled") };
}

export const STATE_TONE: Record<DashboardState, BadgeTone> = { scheduled: "neutral", available: "info", inProgress: "info", awaitingReview: "warn", completed: "success", closedUnsubmitted: "danger" };

// Medals: ONLY assignments whose latest result is final, read from the result's own percentage — never from a
// provisional (pendingReview) result and never from the bare latestPercentage of an older payload.
export function medalsFor(items: Summary[]): MedalTier[] {
  const out: MedalTier[] = [];
  for (const item of items) {
    const lr = item.latestResult;
    if (!lr || gradingOf(item) !== "final") continue;
    if (lr.resultsVisible === false) continue;                    // 21G.5 — a result the teacher has not released carries no mark
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

/** UX-S1 — the login code shown masked but for its last 4 characters (a code of 4 or fewer is shown as it is). */
export function maskCode(code: string): string {
  const chars = Array.from(String(code || ""));
  return chars.length <= 4 ? chars.join("") : "•".repeat(chars.length - 4) + chars.slice(-4).join("");
}

/** UX-S1 — the hint under «مطلوب الآن» never reads as a contradiction of its number (docs/enterprise-ux-student-s1.md §2.1). */
export function kpiNowHint(kpis: { actionable: number; inProgress: number }): string {
  if (kpis.inProgress > 0) return kpis.inProgress + " قيد الحل";
  return kpis.actionable > 0 ? "متاح للحل الآن" : "لا شيء مطلوب الآن";
}

// ── UX-S3 (approved design docs/enterprise-ux-student-s3.md) ─────────────────────────────────────────────────────────────────────
// «الواجبات» under «الكل» in groups with headings, and a deadline a student reads at a glance. Pure presentation over the server's own
// dashboardState and dates: no new rule, no new read.
export type TaskGroupKey = "action" | "scheduled" | "awaitingReview" | "completed" | "closed";
export const TASK_GROUPS: readonly { key: TaskGroupKey; label: string; states: readonly DashboardState[] }[] = [
  { key: "action", label: "تحتاج إجراء", states: ["inProgress", "available"] },
  { key: "awaitingReview", label: "بانتظار التصحيح", states: ["awaitingReview"] },
  { key: "scheduled", label: "قريبًا", states: ["scheduled"] },
  { key: "completed", label: "مكتملة", states: ["completed"] },
  { key: "closed", label: "انتهت دون تسليم", states: ["closedUnsubmitted"] }
];
const stamp = (value: string | undefined): number => { const t = Date.parse(String(value || "")); return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY; };
const dueOf = (item: Summary): string => item.effectiveDueAt || item.dueAt || "";

/**
 * The non-empty groups in their fixed order. «تحتاج إجراء»: a live attempt first, then the open ones, each by the nearest deadline;
 * «قريبًا»: by the nearest opening; the others keep the server's order. Ties keep the server's order (stable).
 */
export function groupTasks(items: Summary[]): { key: TaskGroupKey; label: string; items: Summary[] }[] {
  const indexed = items.map((item, index) => ({ item, index, st: stateOf(item) }));
  return TASK_GROUPS.map(g => {
    const rows = indexed.filter(r => g.states.includes(r.st));
    if (g.key === "action") rows.sort((a, b) => (a.st === "inProgress" ? 0 : 1) - (b.st === "inProgress" ? 0 : 1) || stamp(dueOf(a.item)) - stamp(dueOf(b.item)) || a.index - b.index);
    else if (g.key === "scheduled") rows.sort((a, b) => stamp(a.item.openAt) - stamp(b.item.openAt) || a.index - b.index);
    return { key: g.key, label: g.label, items: rows.map(r => r.item) };
  }).filter(g => g.items.length > 0);
}

const SOON_MS = 48 * 60 * 60 * 1000;
const hhmm = (d: Date) => two(d.getHours()) + ":" + two(d.getMinutes());
const dayStart = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
function inDays(n: number): string { return n === 2 ? "بعد يومين" : "بعد " + n + " أيام"; }

/**
 * The card's deadline line (the device's local calendar days). A scheduled task says when it OPENS; any other says when it is DUE.
 * `soon` marks an actionable task due within 48 h (never by colour alone: the text says «اليوم» / «غدًا»).
 */
export function dueText(item: Summary, now: number): { text: string; soon: boolean; past: boolean } {
  const scheduled = stateOf(item) === "scheduled";
  const value = scheduled ? item.openAt : dueOf(item);
  const t = Date.parse(String(value || ""));
  if (!Number.isFinite(t)) return { text: scheduled ? "موعد الفتح غير محدد بعد" : "التسليم: بدون موعد", soon: false, past: false };
  const verb = scheduled ? "يفتح" : "التسليم";
  if (!scheduled && t < now) return { text: "انتهى التسليم " + formatWhen(value), soon: false, past: true };
  const days = Math.round((dayStart(t) - dayStart(now)) / 86400000);
  const st = stateOf(item);
  const soon = (st === "inProgress" || st === "available") && t >= now && t - now <= SOON_MS;
  const at = new Date(t);
  if (days <= 0) return { text: verb + " اليوم " + hhmm(at), soon, past: false };
  if (days === 1) return { text: verb + " غدًا " + hhmm(at), soon, past: false };
  if (days <= 6) return { text: verb + " " + inDays(days) + " · " + formatWhen(value), soon, past: false };
  return { text: (scheduled ? "يفتح في " : "التسليم: ") + formatWhen(value), soon, past: false };
}
