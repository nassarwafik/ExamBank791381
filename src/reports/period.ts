// Date helpers for the Reports Center period filter. Uses LOCAL calendar Y-M-D (not UTC
// toISOString().slice) so the near-midnight boundary never shifts by a day.
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Phase R-1 (owner decision D-3): no «هذه السنة الدراسية» — it carried no bound (a class is already one school year), so it
// was indistinguishable from «كل الفترة»; the school-year filter above the period is the year criterion.
export type Period = "all" | "7" | "30" | "custom";

// "آخر N أيام" is inclusive of today plus the previous N-1 days (so "last 7" spans 7 calendar days).
// "all"/"custom" carry no computed bound here (custom is user-set).
export function rangeForPeriod(period: Period, today: Date = new Date()): { from: string; to: string } {
  if (period === "7" || period === "30") {
    const span = period === "7" ? 7 : 30;
    const from = new Date(today);
    from.setDate(from.getDate() - (span - 1));
    return { from: formatLocalDate(from), to: formatLocalDate(today) };
  }
  return { from: "", to: "" };
}
