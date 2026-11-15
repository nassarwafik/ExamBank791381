// Owner teacher dashboard — the period filter and the figure formatting (no component here).

export type RangeKey = "all" | "30" | "90" | "365";
export const RANGES: { id: RangeKey; label: string }[] = [
  { id: "all", label: "كل الفترات" }, { id: "30", label: "آخر 30 يومًا" }, { id: "90", label: "آخر 3 أشهر" }, { id: "365", label: "آخر سنة" }
];
/** The `from` of a period (ISO), or "" for every period. */
export function rangeFrom(range: RangeKey, nowMs: number): string {
  return range === "all" ? "" : new Date(nowMs - Number(range) * 86400e3).toISOString();
}
export const pct = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? "—" : (Math.round(v * 10) / 10) + "%");
