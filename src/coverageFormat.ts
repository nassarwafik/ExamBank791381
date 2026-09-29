// Phase 13C-B — the ONE display helper for live coverage figures. Rounding happens here (for the eye) and never inside the
// pure engine (which keeps raw numbers so 33.4 vs 33.3 is a real difference and 99.999999999 vs 100 is not).
const clean = (n: number): number => (Object.is(n, -0) ? 0 : n);
/** Integers stay integers; fractions are shown with at most two decimals. */
export function formatCoverageNumber(v: number): string { return String(clean(Math.round(v * 100) / 100)); }
/** Percentages are shown with at most one decimal. */
export function formatPercent(v: number): string { return String(clean(Math.round(v * 10) / 10)) + "%"; }
/** A signed delta with its unit: percentage points for percent constraints, plain for absolute ones. */
export function formatDelta(delta: number, unit: "absolute" | "percent"): string {
  const sign = delta < 0 ? "−" : "+";
  const body = formatCoverageNumber(Math.abs(delta));
  return sign + body + (unit === "percent" ? " نقاط مئوية" : "");
}
export function formatActual(v: number, unit: "absolute" | "percent"): string { return unit === "percent" ? formatPercent(v) : formatCoverageNumber(v); }
