// Phase 21A.1 — pure AUTHORING helpers for ChartSpecV1 (no React): fresh stable ids, a valid starter chart of every kind, kind conversion that
// keeps the author's data whenever the target kind can hold it (and says when it cannot), and the numeric-cell parser of the table editor.
// The editor only ever stores what these return; the authority is still validateChartSpec.
import { CATEGORY_CHART_KINDS, type CategoryChartSpec, type ChartKind, type ChartSeries, type ChartSpecV1 } from "./chartSpec";

/** The first free id `prefix + n` (n ≥ 1) not in `taken` — stable, readable, always a valid visual id for short prefixes. */
export function freeId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let n = 1; ; n++) if (!used.has(prefix + n)) return prefix + n;
}
let chartSeq = 0;
/** A chart id for a NEW chart block: unique in practice across a document (a duplicated block also receives a fresh one). */
export const newChartId = () => "chart-" + Date.now().toString(36).slice(-5) + (++chartSeq).toString(36) + Math.random().toString(36).slice(2, 5);

type Common = Pick<ChartSpecV1, "version" | "id" | "title" | "description" | "source" | "animation" | "palette" | "legend">;
const common = (c: Common): Common => ({
  version: 1, id: c.id, title: c.title, description: c.description,
  ...(c.source !== undefined ? { source: c.source } : {}), ...(c.animation !== undefined ? { animation: c.animation } : {}),
  ...(c.palette !== undefined ? { palette: c.palette } : {}), ...(c.legend !== undefined ? { legend: c.legend } : {})
});

/** A small, structurally VALID starter chart of the given kind (placeholder labels and data meant to be replaced). */
export function defaultChart(kind: ChartKind, id = newChartId()): ChartSpecV1 {
  const c = common({ version: 1, id, title: "عنوان الرسم البياني", description: "وصف مختصر لما يعرضه الرسم." });
  const cats = [1, 2, 3].map(n => ({ id: "c" + n, label: "الفئة " + n }));
  switch (kind) {
    case "bar": case "line": case "area": return { ...c, kind, categories: cats, series: [{ id: "s1", label: "السلسلة 1", values: [10, 20, 15] }] };
    case "combo": return { ...c, kind, categories: cats, series: [{ id: "s1", label: "السلسلة 1", values: [10, 20, 15], mark: "bar" }, { id: "s2", label: "السلسلة 2", values: [5, 8, 6], mark: "line" }] };
    case "pie": return { ...c, kind, slices: [{ id: "p1", label: "الجزء 1", value: 50 }, { id: "p2", label: "الجزء 2", value: 30 }, { id: "p3", label: "الجزء 3", value: 20 }] };
    case "scatter": return { ...c, kind, series: [{ id: "s1", label: "السلسلة 1", points: [{ id: "pt1", x: 1, y: 2 }, { id: "pt2", x: 2, y: 3 }, { id: "pt3", x: 3, y: 5 }] }] };
    case "histogram": return { ...c, kind, bins: [{ id: "b1", start: 0, end: 10, count: 3 }, { id: "b2", start: 10, end: 20, count: 7 }, { id: "b3", start: 20, end: 30, count: 4 }] };
    case "radar": return { ...c, kind, axes: [1, 2, 3].map(n => ({ id: "a" + n, label: "المحور " + n, max: 10 })), series: [{ id: "s1", label: "السلسلة 1", values: [6, 8, 5] }] };
    case "boxplot": return { ...c, kind, boxes: [{ id: "x1", label: "المجموعة 1", min: 10, q1: 20, median: 30, q3: 40, max: 50 }] };
    case "heatmap": return { ...c, kind, columns: [{ id: "k1", label: "العمود 1" }, { id: "k2", label: "العمود 2" }], rows: [{ id: "r1", label: "الصف 1" }, { id: "r2", label: "الصف 2" }], values: [[1, 2], [3, 4]] };
  }
}

const isCat = (k: ChartKind) => (CATEGORY_CHART_KINDS as readonly string[]).includes(k);
/**
 * Converts a chart to another kind. Data is carried whenever the target can hold it: between the category kinds (bar / line / area / combo)
 * no value is lost (leaving a combo that uses its secondary axis drops that axis and is reported `lossy`); category ⇄ heat map (categories ⇄
 * columns, series ⇄ rows) and pie → category / radar → category / heat map → category keep every value; category → pie keeps the first
 * series (lossy when there are more series or missing / negative values); category → radar keeps the series (lossy for missing / negative
 * values or fewer than 3 categories). Authored context travels where the target has a place for it — the category axis label, the value
 * unit, value labels — and anything the target cannot hold (reference lines, a value-axis label or bounds, a row-axis label) makes the
 * change `lossy` too. Every other change starts from the starter data of the target kind and is `lossy` (the editor asks before discarding).
 * Title, description, source and display options always survive. `fresh`: the result holds the target kind's starter data and none of the
 * original data (ids such as "s1" may recur with other meaning — the chartSelection editor then keeps no key entry).
 */
export function convertChartKind(spec: ChartSpecV1, to: ChartKind): { spec: ChartSpecV1; lossy: boolean; fresh?: true } {
  if (spec.kind === to) return { spec, lossy: false };
  const c = common(spec);
  const fresh = (): { spec: ChartSpecV1; lossy: boolean; fresh: true } => ({ spec: { ...defaultChart(to, spec.id), ...c } as ChartSpecV1, lossy: true, fresh: true });
  const catAxes = (s: { xAxis?: CategoryChartSpec["xAxis"]; yAxis?: CategoryChartSpec["yAxis"] }) => ({ ...(s.xAxis ? { xAxis: s.xAxis } : {}), ...(s.yAxis ? { yAxis: s.yAxis } : {}) });
  if (isCat(spec.kind) && isCat(to)) {
    const s = spec as CategoryChartSpec;
    // the mark and the value axis are combo-only: leaving combo drops them (and the secondary axis — lossy, the editor asks first)
    const series: ChartSeries[] = s.series.map((x, i) => {
      const { mark: _m, axis: _a, ...rest } = x;
      void _m; void _a;
      return to === "combo" ? { ...rest, mark: x.mark ?? (i === 0 ? "bar" : "line") } : rest;
    });
    const droppedSecondary = s.series.some(x => x.axis === "secondary") || !!s.y2Axis;
    // a horizontal bar keeps its numeric axis on x; any other category kind keeps it on y
    const wasHorizontal = s.kind === "bar" && s.orientation === "horizontal";
    const axes = wasHorizontal ? { ...(s.yAxis?.label ? { xAxis: { label: s.yAxis.label } } : {}), ...(s.xAxis ? { yAxis: s.xAxis } : {}) } : catAxes(s);
    return { spec: {
      ...c, kind: to as CategoryChartSpec["kind"], categories: s.categories, series,
      ...((to === "bar" || to === "area") && s.stacked ? { stacked: true } : {}),
      ...(s.valueLabels ? { valueLabels: true } : {}), ...axes, ...(s.referenceLines ? { referenceLines: s.referenceLines } : {})
    } as ChartSpecV1, lossy: droppedSecondary };
  }
  if (isCat(spec.kind)) {
    const s = spec as CategoryChartSpec;
    const horizontal = s.kind === "bar" && s.orientation === "horizontal";
    const va = horizontal ? s.xAxis : s.yAxis, ca = horizontal ? s.yAxis : s.xAxis;
    // what a heat map / pie / radar has no place for
    const dropsRefs = !!s.referenceLines?.length, dropsBounds = va?.min !== undefined || va?.max !== undefined;
    const dropsSecondary = s.series.some(x => x.axis === "secondary") || !!s.y2Axis;
    const valueLabels = s.valueLabels ? { valueLabels: true as const } : {};
    if (to === "heatmap") return {
      spec: { ...c, kind: "heatmap", columns: s.categories, rows: s.series.map(x => ({ id: x.id, label: x.label })), values: s.series.map(x => [...x.values]),
        ...(va?.unit ? { unit: va.unit } : {}), ...valueLabels, ...(ca?.label ? { xAxis: { label: ca.label } } : {}) },
      lossy: dropsRefs || dropsBounds || dropsSecondary || !!va?.label
    };
    if (to === "pie") {
      const first = s.series[0];
      const ok = s.series.length === 1 && first.values.every(v => v !== null && v >= 0);
      return { spec: { ...c, kind: "pie", slices: s.categories.map((cat, i) => ({ id: cat.id, label: cat.label, value: Math.max(0, first.values[i] ?? 0) })), ...(va?.unit ? { unit: va.unit } : {}), ...valueLabels },
        lossy: !ok || dropsRefs || dropsBounds || dropsSecondary || !!va?.label || !!ca?.label };
    }
    if (to === "radar") {
      if (s.categories.length < 3) return fresh();
      const ok = s.series.every(x => x.values.every(v => v !== null && v >= 0));
      const max = Math.max(1, ...s.series.flatMap(x => x.values.filter((v): v is number => v !== null)));
      return { spec: { ...c, kind: "radar", axes: s.categories.map(cat => ({ id: cat.id, label: cat.label, max })), series: s.series.map(x => ({ id: x.id, label: x.label, values: x.values.map(v => Math.max(0, v ?? 0)) })) },
        lossy: !ok || dropsRefs || dropsBounds || dropsSecondary || !!va?.label || !!va?.unit || !!ca?.label };
    }
    return fresh();
  }
  if (isCat(to)) {
    const kind = to as CategoryChartSpec["kind"];
    const mark = (i: number) => (kind === "combo" ? { mark: (i === 0 ? "bar" : "line") as "bar" | "line" } : {});
    // the value unit goes on the value axis (y; never a horizontal bar here: conversions produce vertical charts)
    const unitAxis = (unit?: string) => (unit ? { yAxis: { unit } } : {});
    const valueLabels = (v?: boolean) => (v ? { valueLabels: true as const } : {});
    if (spec.kind === "pie") return { spec: { ...c, kind, categories: spec.slices.map(x => ({ id: x.id, label: x.label })), series: [{ id: "s1", label: "القيمة", values: spec.slices.map(x => x.value), ...mark(0) }], ...unitAxis(spec.unit), ...valueLabels(spec.valueLabels) } as ChartSpecV1, lossy: false };
    if (spec.kind === "heatmap") return {
      spec: { ...c, kind, categories: spec.columns, series: spec.rows.map((r, i) => ({ id: r.id, label: r.label, values: [...spec.values[i]], ...mark(i) })),
        ...(spec.xAxis?.label ? { xAxis: { label: spec.xAxis.label } } : {}), ...unitAxis(spec.unit), ...valueLabels(spec.valueLabels) } as ChartSpecV1,
      lossy: !!spec.yAxis?.label
    };
    if (spec.kind === "radar") return { spec: { ...c, kind, categories: spec.axes.map(a => ({ id: a.id, label: a.label })), series: spec.series.map((x, i) => ({ id: x.id, label: x.label, values: [...x.values], ...mark(i) })) } as ChartSpecV1, lossy: false };
  }
  return fresh();
}

const DIGITS = /[٠-٩۰-۹]/g;
const NUMBER = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
/**
 * A table cell → a number: `null` for an empty cell (a MISSING value, never 0), `undefined` when the text is not a number. Arabic-Indic and
 * Persian digits, the Arabic decimal separator (٫) and the minus sign (−) are accepted; thousands separators are refused (ambiguous).
 */
export function parseChartNumber(text: string): number | null | undefined {
  const t = text.trim().replace(DIGITS, d => String((d.charCodeAt(0) & 0xf) % 10)).replace(/٫/g, ".").replace(/−/g, "-");
  if (t === "") return null;
  if (!NUMBER.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? (Object.is(n, -0) ? 0 : n) : undefined;
}

/** Moves item `i` by `delta` (no-op at the ends). */
export function moveItem<T>(list: readonly T[], i: number, delta: number): T[] {
  const j = i + delta;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return [...list];
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Bar orientation change: the numeric axis moves with the bars (vertical: y; horizontal: x), the category axis keeps only its label. */
export function setBarOrientation(spec: CategoryChartSpec, orientation: "vertical" | "horizontal"): CategoryChartSpec {
  const was = spec.orientation === "horizontal" ? "horizontal" : "vertical";
  if (spec.kind !== "bar" || was === orientation) return spec;
  const { orientation: _o, xAxis, yAxis, ...rest } = spec;
  void _o;
  const numeric = was === "vertical" ? yAxis : xAxis;
  const categoryLabel = (was === "vertical" ? xAxis : yAxis)?.label;
  const cat = categoryLabel ? { label: categoryLabel } : undefined;
  return orientation === "horizontal"
    ? { ...rest, orientation: "horizontal", ...(numeric ? { xAxis: numeric } : {}), ...(cat ? { yAxis: cat } : {}) }
    : { ...rest, ...(cat ? { xAxis: cat } : {}), ...(numeric ? { yAxis: numeric } : {}) };
}
