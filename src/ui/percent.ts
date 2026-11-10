/** The whole-number percent a progress bar shows: 0–100, rounded, never NaN. Shared by `ProgressBar` and by text that shows
 *  the same percent beside a control (UX-S4: the project track buttons), so the two can never read differently. */
export function clampPercent(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
