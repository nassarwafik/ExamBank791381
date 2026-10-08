// Phase 21A.1 — the ExamBank → ECharts ADAPTER. Pure (no ECharts import, no DOM): it translates a VALIDATED ChartSpecV1 + an ExamBank render
// context into a plain engine option object, and translates engine event coordinates (series / data index) back into ExamBank SEMANTIC keys.
// It is the only module that knows ECharts option vocabulary; nothing outside the chart runtime ever sees an engine option or event, and no
// option is ever persisted.
//
// Safety: every author string reaches the engine only as a series / category / axis NAME or as the return value of a formatter FUNCTION
// written here (user text is never a template string and never HTML; no `rich` text styles are configured, so no markup syntax is
// interpreted). The engine's tooltip, legend, title, toolbox, dataZoom, graphic and aria components are not used at all: the tooltip,
// legend, title and the accessible description are rendered by ExamBank as React text. RTL labels are wrapped in Unicode isolates so the
// renderer's bidi algorithm keeps Arabic / mixed labels in their natural order while the chart geometry keeps the data order.
import type { ChartSpecV1, ChartAxis } from "./chartSpec";
import { isCategoryChart } from "./chartSpec";
import type { ChartTargetKind } from "./chartData";
import { binLabel } from "./chartData";
import { ANIMATION_TIMINGS, CHART_HEAT_SCALE, CHART_PALETTE_COLORS, CHART_SELECTED_COLOR, type ChartTokens } from "./chartTheme";
import type { ChartAnimation } from "./chartSpec";

export type EngineOption = Record<string, unknown>;
export type AdapterContext = {
  tokens: ChartTokens;
  animation: ChartAnimation;
  /** Narrow container (phones): rotated / truncated category labels, tighter margins. */
  compact: boolean;
  /** Answer-surface state: which target kind is selectable and which keys are selected (emphasis only — never grading). */
  selectionKind?: ChartTargetKind;
  selected?: ReadonlySet<string>;
};
/** Kinds rendered by the ADVANCED engine chunk (radar, boxplot, heatmap need extra engine modules). */
export const ADVANCED_CHART_KINDS = Object.freeze(["radar", "boxplot", "heatmap"] as const);
export const needsAdvancedEngine = (spec: ChartSpecV1) => (ADVANCED_CHART_KINDS as readonly string[]).includes(spec.kind);

const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
/** Wraps a label containing RTL script in RLI … PDI (an isolate the renderer cannot leak out of); LTR labels are unchanged. */
export const isolate = (s: string) => (RTL.test(s) ? "⁧" + s + "⁩" : s);
/** Deterministic number text (no locale grouping; integers stay integers; at most 6 decimals, trailing zeros trimmed). */
export const formatValue = (v: number) => (Number.isInteger(v) ? String(v) : String(Number(v.toFixed(6))));
const withUnit = (v: number, unit?: string) => formatValue(v) + (unit ? " " + unit : "");
const axisName = (a?: ChartAxis) => (a?.label ? isolate(a.label + (a.unit ? " (" + a.unit + ")" : "")) : a?.unit ? isolate(a.unit) : undefined);

/** Heat-map cells in engine order: present cells [column, row, value] (series 0) and missing cells [column, row] (series 1). */
function heatCells(spec: Extract<ChartSpecV1, { kind: "heatmap" }>) {
  const cells: [number, number, number][] = [], missing: [number, number][] = [];
  spec.values.forEach((row, y) => row.forEach((v, x) => { if (v === null) missing.push([x, y]); else cells.push([x, y, v]); }));
  return { cells, missing };
}

export function buildEngineOption(spec: ChartSpecV1, ctx: AdapterContext): EngineOption {
  const palette = CHART_PALETTE_COLORS[spec.palette ?? "categorical"];
  const t = ANIMATION_TIMINGS[ctx.animation];
  const sel = ctx.selected ?? new Set<string>();
  const anySelected = sel.size > 0;
  const text = { color: ctx.tokens.text, fontFamily: ctx.tokens.font, fontSize: ctx.compact ? 11 : 12 };
  const base: EngineOption = {
    backgroundColor: "transparent",
    color: [...palette],
    textStyle: { fontFamily: ctx.tokens.font, color: ctx.tokens.text },
    ...(t ? { animation: true, animationDuration: t.duration, animationDurationUpdate: t.update, animationEasing: "cubicOut", animationEasingUpdate: "cubicOut", animationDelay: 0 } : { animation: false })
  };
  const valueAxis = (a: ChartAxis | undefined, vertical: boolean) => ({
    type: "value", name: axisName(a), nameLocation: "middle", nameGap: vertical ? (ctx.compact ? 34 : 44) : 28, nameTextStyle: { ...text, color: ctx.tokens.muted },
    ...(a?.min !== undefined ? { min: a.min } : {}), ...(a?.max !== undefined ? { max: a.max } : {}),
    axisLabel: { ...text, formatter: (v: number) => formatValue(v) }, splitLine: { lineStyle: { color: ctx.tokens.grid } }, axisLine: { lineStyle: { color: ctx.tokens.muted } }
  });
  // Category labels: every label is drawn while there are few (≤ 12); beyond that the engine hides the ones that would overlap (the data
  // table, the tooltip and the selection list still name every category). A horizontal (x) category axis rotates its labels when they
  // are many, or when the container is narrow and the labels together are long (≈ 20 characters across a phone-width plot would touch).
  // A vertical (y) category axis carries its name above the axis, never across its labels.
  const categoryAxis = (labels: string[], a: ChartAxis | undefined, vertical: boolean, inverse: boolean) => {
    const count = labels.length;
    const crowded = count * Math.max(0, ...labels.map(l => l.length)) > 20;
    const rotate = !vertical && ((ctx.compact && (count > 6 || crowded)) || count > 12);
    return {
      type: "category", data: labels.map(isolate), name: axisName(a), inverse,
      ...(vertical ? { nameLocation: inverse ? "start" : "end", nameGap: 12 } : { nameLocation: "middle", nameGap: rotate ? 58 : 30 }),
      nameTextStyle: { ...text, color: ctx.tokens.muted }, axisTick: { alignWithLabel: true }, axisLine: { lineStyle: { color: ctx.tokens.muted } },
      axisLabel: { ...text, interval: count <= 12 ? 0 : "auto", ...(rotate ? { rotate: 45 } : {}), width: rotate || ctx.compact ? 64 : 110, overflow: "truncate" }
    };
  };
  // The outer bounds equal the grid margins: axis labels and axis names are always kept INSIDE the canvas (no clipped text).
  const grid = { left: ctx.compact ? 8 : 16, right: ctx.compact ? 12 : 24, top: 28, bottom: ctx.compact ? 8 : 12, outerBoundsMode: "same", outerBoundsContain: "all" };
  const emphasize = (key: string, color: string) => (sel.has(key)
    ? { borderColor: CHART_SELECTED_COLOR, borderWidth: 3, color, opacity: 1 }
    : anySelected ? { color, opacity: 0.45 } : { color });
  const markLine = (lines: { value: number; label: string }[] | undefined, horizontalValueAxis: boolean) => (lines && lines.length ? {
    silent: true, symbol: "none", lineStyle: { color: ctx.tokens.muted, type: "dashed", width: 1.5 },
    label: { ...text, color: ctx.tokens.muted, position: "insideEndTop", backgroundColor: ctx.tokens.surface, padding: [2, 4], borderRadius: 3, formatter: (p: { dataIndex: number }) => isolate(lines[p.dataIndex]?.label ?? "") },
    data: lines.map(l => (horizontalValueAxis ? { xAxis: l.value } : { yAxis: l.value }))
  } : undefined);

  if (isCategoryChart(spec)) {
    const horizontal = spec.kind === "bar" && spec.orientation === "horizontal";
    // vertical: categories on x, values on y; horizontal bars: values on x (spec.xAxis is the numeric axis), categories on y (first on top)
    const cat = categoryAxis(spec.categories.map(c => c.label), horizontal ? spec.yAxis : spec.xAxis, horizontal, horizontal);
    const stacked = "stacked" in spec && spec.stacked === true;
    // unstacked value labels sit beyond the bar end / point: the value axis keeps 10% headroom for them (ignored when the author fixed a bound)
    const val = { ...(horizontal ? valueAxis(spec.xAxis, false) : valueAxis(spec.yAxis, true)), ...(spec.valueLabels && !stacked ? { boundaryGap: [0, "10%"] } : {}) };
    // combo: series on the SECONDARY value axis are measured on a second, independently scaled axis (drawn on the other side, without its
    // own grid lines so the grid stays the primary axis's); reference lines are drawn by the first PRIMARY series (primary-axis values)
    const onSecondary = (s: { axis?: string }) => spec.kind === "combo" && s.axis === "secondary";
    const dual = spec.series.some(onSecondary);
    const val2 = dual ? { ...valueAxis(spec.y2Axis, true), position: "right", splitLine: { show: false }, ...(spec.valueLabels ? { boundaryGap: [0, "10%"] } : {}) } : undefined;
    const lineHost = spec.series.findIndex(s => !onSecondary(s));
    const series = spec.series.map((s, si) => {
      const mark = spec.kind === "combo" ? s.mark : spec.kind === "bar" ? "bar" : "line";
      const color = palette[si % palette.length];
      const seriesSel = ctx.selectionKind === "series" && sel.has(s.id);
      const data = s.values.map((v, i) => {
        if (v === null) return "-";
        const key = ctx.selectionKind === "datum" ? s.id + "/" + spec.categories[i].id : ctx.selectionKind === "category" ? spec.categories[i].id : ctx.selectionKind === "series" ? s.id : "";
        return ctx.selectionKind && ctx.selectionKind !== "series" ? { value: v, itemStyle: emphasize(key, color) } : v;
      });
      return {
        type: mark, name: isolate(s.label), data, ...(stacked ? { stack: "total" } : {}), ...(dual ? { yAxisIndex: onSecondary(s) ? 1 : 0 } : {}),
        ...(mark === "line" ? { symbol: "circle", symbolSize: ctx.selectionKind ? 11 : 7, connectNulls: false, lineStyle: { width: seriesSel ? 4.5 : 2.5, opacity: ctx.selectionKind === "series" && anySelected && !seriesSel ? 0.45 : 1 } } : { barMaxWidth: 48 }),
        ...(spec.kind === "area" ? { areaStyle: { opacity: 0.25 } } : {}),
        ...(ctx.selectionKind === "series" ? { itemStyle: seriesSel ? { borderColor: CHART_SELECTED_COLOR, borderWidth: 3 } : anySelected ? { opacity: 0.45 } : {} } : {}),
        // stacked segments carry their value INSIDE (white on a palette colour: every palette colour has ≥ 4.5:1 against white)
        ...(spec.valueLabels ? { label: { show: true, ...text, ...(stacked && mark === "bar" ? { position: "inside", color: "#FFFFFF", fontWeight: 600 } : { position: horizontal ? "right" : "top" }), formatter: (p: { value: unknown }) => (typeof p.value === "number" ? formatValue(p.value) : "") } } : {}),
        ...(si === lineHost ? { markLine: markLine(spec.referenceLines, horizontal) } : {})
      };
    });
    return { ...base, grid, xAxis: horizontal ? val : cat, yAxis: horizontal ? cat : val2 ? [val, val2] : val, series };
  }
  switch (spec.kind) {
    case "pie": {
      const sum = spec.slices.reduce((a, s) => a + s.value, 0);
      return { ...base, series: [{
        type: "pie", radius: spec.donut ? ["42%", "68%"] : [0, "68%"], center: ["50%", "52%"], avoidLabelOverlap: true,
        // narrow containers: no outside labels (the legend, the tooltip and the table name every slice); otherwise labels are aligned to
        // the canvas edges and truncated, so none can leave the canvas
        ...(ctx.compact ? { label: { show: false }, labelLine: { show: false } } : {}),
        label: { ...text, show: !ctx.compact, alignTo: "edge", edgeDistance: 12, minMargin: 4, width: 140, overflow: "truncate", formatter: (p: { dataIndex: number }) => { const s = spec.slices[p.dataIndex]; return s ? isolate(s.label) + (spec.valueLabels ? ": " + withUnit(s.value, spec.unit) + " (" + formatValue(Math.round(s.value / sum * 1000) / 10) + "%)" : "") : ""; } },
        data: spec.slices.map((s, i) => ({ value: s.value, name: isolate(s.label), itemStyle: emphasize(s.id, palette[i % palette.length]) }))
      }] };
    }
    case "scatter":
      return { ...base, grid: { ...grid, left: ctx.compact ? 12 : 24 }, xAxis: { ...valueAxis(spec.xAxis, false), scale: true }, yAxis: { ...valueAxis(spec.yAxis, true), scale: true },
        series: spec.series.map((s, si) => {
          const color = palette[si % palette.length];
          return { type: "scatter", name: isolate(s.label), symbolSize: ctx.selectionKind ? 14 : 10,
            data: s.points.map(p => ({ value: [p.x, p.y], itemStyle: emphasize(ctx.selectionKind === "series" ? s.id : p.id, color) })),
            ...(si === 0 ? { markLine: markLine(spec.referenceLines, false) } : {}) };
        }) };
    case "histogram": {
      return { ...base, grid, xAxis: categoryAxis(spec.bins.map(b => binLabel(b.start, b.end)), spec.xAxis, false, false), yAxis: { ...valueAxis(spec.yAxis, true), ...(spec.valueLabels ? { boundaryGap: [0, "10%"] } : {}) },
        series: [{ type: "bar", barCategoryGap: "2%", data: spec.bins.map(b => ({ value: b.count, itemStyle: emphasize(b.id, palette[0]) })),
          ...(spec.valueLabels ? { label: { show: true, ...text, position: "top", formatter: (p: { value: unknown }) => (typeof p.value === "number" ? formatValue(p.value) : "") } } : {}) }] };
    }
    case "radar":
      return { ...base, radar: { radius: ctx.compact ? "58%" : "66%", indicator: spec.axes.map(a => ({ name: isolate(a.label), max: a.max })), axisName: { ...text }, splitLine: { lineStyle: { color: ctx.tokens.grid } }, axisLine: { lineStyle: { color: ctx.tokens.grid } } },
        series: [{ type: "radar", symbolSize: 6, data: spec.series.map((s, i) => {
          const selected = sel.has(s.id), color = palette[i % palette.length];
          return { value: [...s.values], name: isolate(s.label), itemStyle: { color }, lineStyle: { color, width: selected ? 4 : 2, opacity: anySelected && !selected ? 0.45 : 1 }, areaStyle: { color, opacity: selected ? 0.3 : 0.12 } };
        }) }] };
    case "boxplot":
      return { ...base, grid, xAxis: categoryAxis(spec.boxes.map(b => b.label), spec.xAxis, false, false), yAxis: valueAxis(spec.yAxis, true),
        series: [{ type: "boxplot", data: spec.boxes.map((b, i) => ({ value: [b.min, b.q1, b.median, b.q3, b.max], itemStyle: { ...emphasize(b.id, "#ffffff"), borderColor: sel.has(b.id) ? CHART_SELECTED_COLOR : palette[i % palette.length], borderWidth: sel.has(b.id) ? 3 : 1.5 } })) }] };
    case "heatmap": {
      const present = spec.values.flat().filter((v): v is number => v !== null);
      const min = present.length ? Math.min(...present) : 0, max = present.length ? Math.max(...present) : 1;
      const span = max === min ? 1 : max - min;
      const { cells, missing } = heatCells(spec);
      const cellBorder = { borderColor: ctx.tokens.surface, borderWidth: 1 };
      return { ...base, grid: { ...grid, bottom: ctx.compact ? 52 : 56 },
        xAxis: categoryAxis(spec.columns.map(c => c.label), spec.xAxis, false, false), yAxis: categoryAxis(spec.rows.map(r => r.label), spec.yAxis, true, true),
        visualMap: { type: "continuous", seriesIndex: 0, min, max: min + span, calculable: false, orient: "horizontal", left: "center", bottom: 4, itemHeight: ctx.compact ? 120 : 180, inRange: { color: [...CHART_HEAT_SCALE] }, textStyle: { ...text }, formatter: (v: number) => formatValue(v) },
        series: [
          // present cells: coloured by the scale; a value label (when asked for) is dark on light cells and white on dark cells
          { type: "heatmap", itemStyle: cellBorder, data: cells.map(([x, y, v]) => ({ value: [x, y, v], label: { color: (v - min) / span > 0.55 ? "#FFFFFF" : "#0F172A" } })),
            label: { show: spec.valueLabels === true, ...text, formatter: (p: { value: unknown }) => (Array.isArray(p.value) && typeof p.value[2] === "number" ? formatValue(p.value[2]) : "") } },
          // missing cells: never coloured as a value — a neutral cell marked "—" (a missing value is not 0)
          { type: "heatmap", itemStyle: { ...cellBorder, color: "#F1F5F9" }, data: missing.map(([x, y]) => [x, y, 0]), label: { show: true, ...text, color: ctx.tokens.muted, formatter: () => "—" } }
        ] };
    }
  }
  return base;
}

/** Engine event coordinates → the semantic key of the given target kind (null when the event is not on a selectable datum). */
export function targetFromEvent(spec: ChartSpecV1, kind: ChartTargetKind, ev: { componentType?: string; seriesIndex?: number; dataIndex?: number }): string | null {
  if (ev.componentType !== "series" || typeof ev.seriesIndex !== "number" || typeof ev.dataIndex !== "number") return null;
  const si = ev.seriesIndex, di = ev.dataIndex;
  if (isCategoryChart(spec)) {
    const s = spec.series[si], c = spec.categories[di];
    if (!s || !c || s.values[di] === null) return null;
    return kind === "datum" ? s.id + "/" + c.id : kind === "category" ? c.id : kind === "series" ? s.id : null;
  }
  switch (spec.kind) {
    case "pie": return kind === "category" ? spec.slices[di]?.id ?? null : null;
    case "boxplot": return kind === "category" ? spec.boxes[di]?.id ?? null : null;
    case "histogram": return kind === "bin" ? spec.bins[di]?.id ?? null : null;
    case "radar": return kind === "series" ? spec.series[di]?.id ?? null : null;
    case "scatter": { const s = spec.series[si]; if (!s) return null; return kind === "series" ? s.id : kind === "point" ? s.points[di]?.id ?? null : null; }
    default: return null;
  }
}

/** The ExamBank tooltip content for an engine hover (React renders it as text — never HTML). */
export function tooltipFromEvent(spec: ChartSpecV1, ev: { componentType?: string; seriesIndex?: number; dataIndex?: number }): { title: string; lines: string[] } | null {
  if (ev.componentType !== "series" || typeof ev.seriesIndex !== "number" || typeof ev.dataIndex !== "number") return null;
  const si = ev.seriesIndex, di = ev.dataIndex;
  if (isCategoryChart(spec)) {
    const s = spec.series[si], c = spec.categories[di], v = s?.values[di];
    if (!s || !c || v === null || v === undefined) return null;
    const unit = spec.kind === "combo" && s.axis === "secondary" ? spec.y2Axis?.unit : spec.yAxis?.unit ?? spec.xAxis?.unit;
    return { title: c.label, lines: [s.label + ": " + withUnit(v, unit)] };
  }
  switch (spec.kind) {
    case "pie": { const s = spec.slices[di]; return s ? { title: s.label, lines: [withUnit(s.value, spec.unit)] } : null; }
    case "histogram": { const b = spec.bins[di]; return b ? { title: binLabel(b.start, b.end), lines: [(spec.yAxis?.label ?? "التكرار") + ": " + formatValue(b.count)] } : null; }
    case "boxplot": { const b = spec.boxes[di]; return b ? { title: b.label, lines: ["الأدنى: " + formatValue(b.min), "الربيع الأول: " + formatValue(b.q1), "الوسيط: " + formatValue(b.median), "الربيع الثالث: " + formatValue(b.q3), "الأعلى: " + formatValue(b.max)] } : null; }
    case "radar": { const s = spec.series[di]; return s ? { title: s.label, lines: spec.axes.map((a, i) => a.label + ": " + formatValue(s.values[i])) } : null; }
    case "scatter": { const s = spec.series[si], p = s?.points[di]; return s && p ? { title: p.label ?? s.label, lines: [(spec.xAxis?.label ?? "x") + ": " + withUnit(p.x, spec.xAxis?.unit), (spec.yAxis?.label ?? "y") + ": " + withUnit(p.y, spec.yAxis?.unit)] } : null; }
    case "heatmap": {
      const { cells, missing } = heatCells(spec);
      if (si === 0) { const c = cells[di]; return c ? { title: spec.rows[c[1]].label + " — " + spec.columns[c[0]].label, lines: [withUnit(c[2], spec.unit)] } : null; }
      const m = si === 1 ? missing[di] : undefined;
      return m ? { title: spec.rows[m[1]].label + " — " + spec.columns[m[0]].label, lines: ["لا قيمة"] } : null;
    }
  }
  return null;
}

/** The stage height (px) for a chart: fixed per kind and width class (so a width change never feeds back into the height — no resize
 *  loop); charts whose length grows with their data (horizontal bars, heatmaps) grow with it, within bounds. */
export function chartHeight(spec: ChartSpecV1, compact: boolean): number {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  switch (spec.kind) {
    case "bar":
      if (spec.orientation === "horizontal") return clamp(spec.categories.length * (spec.stacked ? 30 : 14 + 14 * spec.series.length) + 96, 220, 760);
      return compact ? (spec.categories.length > 6 ? 320 : 280) : 340;
    case "line": case "area": case "combo": case "histogram": case "boxplot": case "scatter":
      return compact ? ("categories" in spec && spec.categories.length > 6 || "bins" in spec && spec.bins.length > 6 || "boxes" in spec && spec.boxes.length > 6 ? 320 : 280) : 340;
    case "pie": return compact ? 280 : 320;
    case "radar": return compact ? 300 : 360;
    case "heatmap": return clamp(spec.rows.length * 30 + 150, 240, 870);
  }
}

/** The ExamBank legend (rendered as React text, never by the engine): one entry per series (or per slice for pie charts). `auto` shows it
 *  whenever there is more than one thing to tell apart; histograms, box plots and heat maps have no legend (one series / a colour scale). */
export type ChartLegendItem = { key: string; label: string; color: string; mark: "bar" | "line" | "point" | "area" | "slice" };
export function chartLegend(spec: ChartSpecV1): ChartLegendItem[] {
  if (spec.legend === "none") return [];
  const palette = CHART_PALETTE_COLORS[spec.palette ?? "categorical"];
  const color = (i: number) => palette[i % palette.length];
  let items: ChartLegendItem[] = [];
  if (isCategoryChart(spec)) items = spec.series.map((s, i) => ({ key: s.id, label: s.label, color: color(i), mark: spec.kind === "combo" ? (s.mark ?? "bar") : spec.kind === "area" ? "area" : spec.kind === "line" ? "line" : "bar" }));
  else if (spec.kind === "pie") items = spec.slices.map((s, i) => ({ key: s.id, label: s.label, color: color(i), mark: "slice" }));
  else if (spec.kind === "scatter") items = spec.series.map((s, i) => ({ key: s.id, label: s.label, color: color(i), mark: "point" }));
  else if (spec.kind === "radar") items = spec.series.map((s, i) => ({ key: s.id, label: s.label, color: color(i), mark: "area" }));
  return spec.kind === "pie" || items.length > 1 ? items : [];
}
