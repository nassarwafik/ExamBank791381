// Phase 21Z — what the composer's progress view shows while a request runs, so a long wait never looks frozen: each step is done (✓),
// current (a spinner) or pending; an elapsed clock ticks every second; a reassurance line appears when one request has been quiet for a
// while. Pure (no React): the dialog renders it.
export type StepState = "done" | "current" | "pending";

/** The state of each step given the step now running (an unknown / not-yet-reported step ⇒ the first one is running). */
export function stepStates(stages: readonly string[], current: string): StepState[] {
  const at = Math.max(0, stages.indexOf(current));
  return stages.map((_, i) => (i < at ? "done" : i === at ? "current" : "pending"));
}

/** m:ss (minutes are not capped: 75 s → 1:15, 3725 s → 62:05); a negative or non-finite duration reads 0:00. */
export function formatElapsed(ms: number): string {
  const s = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

export const STILL_WORKING_AFTER_MS = 20_000;
export const STILL_WORKING_TEXT = "ما زال العمل جاريًا — قد تستغرق هذه الخطوة دقيقة أو أكثر. إغلاق النافذة أو «إلغاء» يوقف الطلب.";
/** The reassurance line once the running request has been quiet for STILL_WORKING_AFTER_MS; null before that. */
export const stillWorkingText = (quietMs: number): string | null => (quietMs >= STILL_WORKING_AFTER_MS ? STILL_WORKING_TEXT : null);

/** Sections finished out of the planned total, clamped (never above the total, never negative); null when there is nothing to show. */
export function sectionProgress(p: { done: number; total: number } | null | undefined): { done: number; total: number; percent: number } | null {
  if (!p || !Number.isInteger(p.total) || p.total <= 0) return null;
  const done = Math.min(p.total, Math.max(0, Math.floor(Number(p.done) || 0)));
  return { done, total: p.total, percent: Math.round((done / p.total) * 100) };
}
