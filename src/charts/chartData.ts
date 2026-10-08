// Phase 21A.1 — the SEMANTIC view of a validated ChartSpecV1. Pure (shared server build): the selectable targets a chart-answer question may
// ask for, the accessible data table and the plain-text summary — all derived from the ONE canonical spec, never from rendered geometry and
// never maintained twice by an author. Grading, ingest, the keyboard selection list, the screen-reader table, search and the AI projection
// all read these functions, so they cannot disagree with each other or with the picture.
import type { ChartSpecV1, ChartKind } from "./chartSpec";

export const CHART_TARGET_KINDS = Object.freeze(["category", "series", "datum", "point", "bin"] as const);
export type ChartTargetKind = (typeof CHART_TARGET_KINDS)[number];
/** One selectable semantic target. `key` is the identity stored in an answer: category / series / point / bin → its own id; a datum (one
 *  value of one series at one category) → "seriesId/categoryId" (ids never contain "/", so the key is unambiguous). */
export type ChartTarget = { key: string; label: string; kind: ChartTargetKind; seriesId?: string; categoryId?: string; value?: number };

const TARGETS_BY_KIND: Readonly<Record<ChartKind, readonly ChartTargetKind[]>> = Object.freeze({
  bar: ["category", "series", "datum"], line: ["category", "series", "datum"], area: ["category", "series", "datum"], combo: ["category", "series", "datum"],
  pie: ["category"], scatter: ["point", "series"], histogram: ["bin"], radar: ["series"], boxplot: ["category"], heatmap: []
});
/** Target kinds where a RANGE (a contiguous run in the chart's own order) is a deterministic selection. */
export const RANGE_TARGET_KINDS: readonly ChartTargetKind[] = Object.freeze(["category", "bin"]);

/** The target kinds a chart supports (heatmap cells are not a V1 answer surface). */
export const chartTargetKinds = (spec: ChartSpecV1): readonly ChartTargetKind[] => TARGETS_BY_KIND[spec.kind];

/** Every selectable target of one kind, in the chart's own order (the order a range is judged in). Missing values are not selectable. */
export function chartTargets(spec: ChartSpecV1, kind: ChartTargetKind): ChartTarget[] {
  if (!chartTargetKinds(spec).includes(kind)) return [];
  switch (spec.kind) {
    case "bar": case "line": case "area": case "combo": {
      const single = spec.series.length === 1;
      if (kind === "category") return spec.categories.map(c => ({ key: c.id, label: c.label, kind, categoryId: c.id }));
      if (kind === "series") return spec.series.map(s => ({ key: s.id, label: s.label, kind, seriesId: s.id }));
      const out: ChartTarget[] = [];
      for (const s of spec.series) spec.categories.forEach((c, i) => {
        const v = s.values[i];
        if (v !== null) out.push({ key: s.id + "/" + c.id, label: single ? c.label : s.label + " — " + c.label, kind, seriesId: s.id, categoryId: c.id, value: v });
      });
      return out;
    }
    case "pie": return spec.slices.map(s => ({ key: s.id, label: s.label, kind: "category" as const, categoryId: s.id, value: s.value }));
    case "boxplot": return spec.boxes.map(b => ({ key: b.id, label: b.label, kind: "category" as const, categoryId: b.id, value: b.median }));
    case "histogram": return spec.bins.map(b => ({ key: b.id, label: binLabel(b.start, b.end), kind: "bin" as const, value: b.count }));
    case "radar": return spec.series.map(s => ({ key: s.id, label: s.label, kind: "series" as const, seriesId: s.id }));
    case "scatter":
      if (kind === "series") return spec.series.map(s => ({ key: s.id, label: s.label, kind, seriesId: s.id }));
      return spec.series.flatMap(s => s.points.map(p => ({ key: p.id, label: (p.label ?? "(" + p.x + "، " + p.y + ")") + (spec.series.length > 1 ? " — " + s.label : ""), kind: "point" as const, seriesId: s.id })));
    case "heatmap": return [];
  }
}
export const binLabel = (start: number, end: number) => "[" + start + " – " + end + ")";

export type ChartTableCell = number | string | null;
/** The accessible data table — the chart's numbers as a real table (one header row, one header cell per row). */
export type ChartDataTable = { columns: string[]; rows: { header: string; cells: ChartTableCell[] }[] };
export function chartDataTable(spec: ChartSpecV1): ChartDataTable {
  switch (spec.kind) {
    case "bar": case "line": case "area": case "combo":
      return { columns: [spec.xAxis?.label ?? "الفئة", ...spec.series.map(s => s.label)], rows: spec.categories.map((c, i) => ({ header: c.label, cells: spec.series.map(s => s.values[i]) })) };
    case "pie": return { columns: ["الفئة", spec.unit ? "القيمة (" + spec.unit + ")" : "القيمة"], rows: spec.slices.map(s => ({ header: s.label, cells: [s.value] })) };
    case "scatter": return { columns: ["النقطة", "السلسلة", spec.xAxis?.label ?? "x", spec.yAxis?.label ?? "y"], rows: spec.series.flatMap(s => s.points.map(p => ({ header: p.label ?? p.id, cells: [s.label, p.x, p.y] }))) };
    case "histogram": return { columns: [spec.xAxis?.label ?? "الفئة", spec.yAxis?.label ?? "التكرار"], rows: spec.bins.map(b => ({ header: binLabel(b.start, b.end), cells: [b.count] })) };
    case "radar": return { columns: ["المحور", ...spec.series.map(s => s.label), "الحد الأعلى"], rows: spec.axes.map((a, i) => ({ header: a.label, cells: [...spec.series.map(s => s.values[i]), a.max] })) };
    case "boxplot": return { columns: [spec.xAxis?.label ?? "المجموعة", "الأدنى", "الربيع الأول", "الوسيط", "الربيع الثالث", "الأعلى"], rows: spec.boxes.map(b => ({ header: b.label, cells: [b.min, b.q1, b.median, b.q3, b.max] })) };
    case "heatmap": return { columns: [spec.yAxis?.label ?? "", ...spec.columns.map(c => c.label)], rows: spec.rows.map((r, i) => ({ header: r.label, cells: spec.values[i] })) };
  }
}

const KIND_NAMES: Readonly<Record<ChartKind, string>> = Object.freeze({
  bar: "رسم بالأعمدة", line: "رسم خطي", area: "رسم مساحي", combo: "رسم مركّب (أعمدة وخط)", pie: "رسم دائري", scatter: "رسم انتشاري",
  histogram: "مدرّج تكراري", radar: "رسم راداري", boxplot: "رسم صندوقي", heatmap: "خريطة حرارية"
});
export const chartKindName = (spec: ChartSpecV1): string => (spec.kind === "pie" && spec.donut ? "رسم حلقي" : spec.kind === "bar" && spec.orientation === "horizontal" ? "رسم بالأشرطة الأفقية" : KIND_NAMES[spec.kind]);
/** A short structural summary for assistive technology ("رسم بالأعمدة — 12 فئة، سلسلة واحدة"). */
export function chartSummary(spec: ChartSpecV1): string {
  const n = (count: number, one: string, many: string) => count + " " + (count === 1 ? one : many);
  switch (spec.kind) {
    case "bar": case "line": case "area": case "combo": return chartKindName(spec) + " — " + n(spec.categories.length, "فئة", "فئات") + "، " + n(spec.series.length, "سلسلة", "سلاسل") + (("stacked" in spec && spec.stacked) ? "، مكدّسة" : "");
    case "pie": return chartKindName(spec) + " — " + n(spec.slices.length, "شريحة", "شرائح");
    case "scatter": return chartKindName(spec) + " — " + n(spec.series.reduce((a, s) => a + s.points.length, 0), "نقطة", "نقاط");
    case "histogram": return chartKindName(spec) + " — " + n(spec.bins.length, "فئة", "فئات");
    case "radar": return chartKindName(spec) + " — " + n(spec.axes.length, "محور", "محاور") + "، " + n(spec.series.length, "سلسلة", "سلاسل");
    case "boxplot": return chartKindName(spec) + " — " + n(spec.boxes.length, "صندوق", "صناديق");
    case "heatmap": return chartKindName(spec) + " — " + spec.rows.length + " × " + spec.columns.length;
  }
}
/** Plain text of a chart (search, the plain fallback suggestion, the AI modify projection): title, description, source, labels — never a
 *  substitute for the data table. */
export function chartPlainText(spec: ChartSpecV1): string {
  const parts = [spec.title, spec.description];
  if (spec.source) parts.push(spec.source);
  parts.push(chartSummary(spec));
  return parts.join("\n");
}

// ── interaction semantics (answer surfaces) ─────────────────────────────────────────────────────────────────────────────────────────────
export const CHART_SELECTION_MODES = Object.freeze(["single", "multiple", "range"] as const);
export type ChartSelectionMode = (typeof CHART_SELECTION_MODES)[number];
/** True when `keys` are one contiguous run of `order` (a non-empty range). */
export function isContiguousRun(order: readonly string[], keys: readonly string[]): boolean {
  if (keys.length === 0) return false;
  const idx = keys.map(k => order.indexOf(k));
  if (idx.some(i => i < 0) || new Set(idx).size !== idx.length) return false;
  const lo = Math.min(...idx), hi = Math.max(...idx);
  return hi - lo + 1 === keys.length;
}
/**
 * The next selection after the student activates `key` (pointer or keyboard — the same rule): single → that key (activating it again clears);
 * multiple → toggle, never more than `max`; range → the contiguous run from the first selected key to `key` (activating the only selected key
 * clears). The result is always in the chart's own order and duplicate-free; a key that is not a selectable target changes nothing.
 */
export function nextChartSelection(mode: ChartSelectionMode, order: readonly string[], current: readonly string[], key: string, max: number): string[] {
  if (!order.includes(key)) return order.filter(k => current.includes(k));
  const cur = order.filter(k => current.includes(k));
  if (mode === "single") return cur.length === 1 && cur[0] === key ? [] : [key];
  if (mode === "multiple") {
    if (cur.includes(key)) return cur.filter(k => k !== key);
    return cur.length >= max ? cur : order.filter(k => k === key || cur.includes(k));
  }
  if (cur.length === 1 && cur[0] === key) return [];
  if (cur.length === 0) return [key];
  const anchor = order.indexOf(cur[0]), at = order.indexOf(key);
  const [lo, hi] = anchor <= at ? [anchor, at] : [at, anchor];
  return order.slice(lo, hi + 1).slice(0, Math.max(1, max));
}
