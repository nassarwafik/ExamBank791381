// Phase P1 — bulk review presentation helpers (no policy): wording for the server's per-request totals.
export type BulkTotals = { requested: number; changed: number; unchanged: number; failed: number };

/** «تم اعتماد 3 — دون تغيير 1 — تعذر 1.» from the server's totals. */
export function bulkNoticeText(verb: string, totals: BulkTotals): string {
  const parts = [verb + " " + totals.changed];
  if (totals.unchanged) parts.push("دون تغيير " + totals.unchanged);
  if (totals.failed) parts.push("تعذر " + totals.failed);
  return parts.join(" — ") + ".";
}
