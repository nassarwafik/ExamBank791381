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
import { binLabel, labelWithUnit } from "./chartData";
import { ANIMATION_TIMINGS, CHART_HEAT_SCALE, CHART_PALETTE_COLORS, CHART_SELECTED_COLOR, heatColorAt, labelOn, type ChartTokens } from "./chartTheme";
import type { ChartAnimation } from "./chartSpec";

export type EngineOption = Record<string, unknown>;
export type AdapterContext = {
  tokens: ChartTokens;
  animation: ChartAnimation;
  /** Narrow container (phones): rotated / truncated category labels, tighter margins. */
  compact: boolean;
  /** The stage width in px when known (0 / absent: not measured yet): category labels wider than their slot are rotated. */
  width?: number;
  /** Answer-surface state: which target kind is selectable and which keys are selected (emphasis only — never grading). */
  selectionKind?: ChartTargetKind;
  selected?: ReadonlySet<string>;
  /** The rendered width of a text in a CSS font (a canvas measurement) when the host can measure; labels are then truncated to their cap
   *  here, with real widths — the engine's own truncation estimates every non-Latin character as a wide (CJK) glyph and cut Arabic
   *  labels to about half their cap. Absent: the engine truncates. */
  measure?: (text: string, font: string) => number;
};
/** Kinds rendered by the ADVANCED engine chunk (radar, boxplot, heatmap need extra engine modules). */
export const ADVANCED_CHART_KINDS = Object.freeze(["radar", "boxplot", "heatmap"] as const);
export const needsAdvancedEngine = (spec: ChartSpecV1) => (ADVANCED_CHART_KINDS as readonly string[]).includes(spec.kind);

const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
/** Wraps a label containing RTL script in RLI … PDI (an isolate the renderer cannot leak out of); LTR labels are unchanged. */
export const isolate = (s: string) => (RTL.test(s) ? "⁧" + s + "⁩" : s);
/** Deterministic number text (no locale grouping; integers stay integers; at most 6 decimals, trailing zeros trimmed). */
export const formatValue = (v: number) => (Number.isInteger(v) ? String(v) : String(Number(v.toFixed(6))));
const LRI = "\u2066", PDI = "\u2069";
/** The narrowest name a one-line pie label keeps beside its value (px); below it the value takes a second line. */
const PIE_NAME_MIN = 40;
const ISOLATES = /[\u2066-\u2069]/g;
/** Grapheme clusters (a base letter with its marks stays whole), so a truncation never splits a letter from its harakat. */
const graphemes = (s: string): string[] => {
  const Seg = (Intl as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(t: string): Iterable<{ segment: string }> } }).Segmenter;
  return Seg ? Array.from(new Seg(undefined, { granularity: "grapheme" }).segment(s), x => x.segment) : Array.from(s);
};
/** `s` cut to fit `max` px in `font` (with "…"), by measurement; unchanged when it fits; empty when not even "…" fits (never the uncut text). */
export function fitText(s: string, max: number, font: string, measure: (t: string, f: string) => number): string {
  if (measure(s, font) <= max) return s;
  if (!(max > 0) || measure("…", font) > max) return "";
  const cs = graphemes(s);
  let lo = 0, hi = cs.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (measure(cs.slice(0, mid).join("").trimEnd() + "…", font) <= max) lo = mid; else hi = mid - 1; }
  return cs.slice(0, lo).join("").trimEnd() + "…";
}
/** A number with its unit as text inside right-to-left prose: the number (and a Latin unit such as "°C") is ONE left-to-right isolate, so a
 *  sign, a decimal point or the unit's symbols are never reordered ("-2 °C", never "C° 2-"); a unit in an RTL script stays outside the run
 *  and follows the number in reading order. */
export const valueText = (v: number, unit?: string) => (!unit ? LRI + formatValue(v) + PDI : RTL.test(unit) ? LRI + formatValue(v) + PDI + " " + unit : LRI + formatValue(v) + " " + unit + PDI);
const axisName = (a?: ChartAxis) => (a?.label ? isolate(labelWithUnit(a.label, a.unit)) : a?.unit ? isolate(a.unit) : undefined);

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
  // table, the tooltip and the selection list still name every category). A horizontal (x) category axis rotates its labels when they are
  // many, or when the longest label is wider than the slot each category has (the plot width shared by the categories; ≈ 0.55 em per
  // character) — at ANY container width, not only on phones. Before the stage is measured, a narrow container with long labels together
  // (≈ 20 characters across a phone-width plot) rotates. Rotated labels whose neighbours would still touch (the perpendicular gap, slot ×
  // sin 45°, under one line box) are thinned: every `step`-th label is drawn. A vertical (y) category axis — horizontal bars, heat-map
  // rows — has no horizontal slot: its labels keep their full width; it carries its name above the axis, never across its labels.
  // `reserve`: the width the value axes take beside the plot (default: one named axis with short labels).
  // a label never wider than `cap` px. The label box keeps the cap as its width either way (the engine lays the axis out from it); the
  // text is cut by measurement here when the host can measure (the engine's own cut is then off: "none"), otherwise by the engine
  const font = text.fontSize + "px " + ctx.tokens.font;
  const measure = ctx.measure;
  const capped = (cap: number) => (measure
    ? { width: cap, overflow: "none", formatter: (v: string) => { const inner = String(v).replace(ISOLATES, ""), cut = fitText(inner, cap, font, measure); return cut === inner ? v : isolate(cut); } }
    : { width: cap, overflow: "truncate" });
  const categoryAxis = (labels: string[], a: ChartAxis | undefined, vertical: boolean, inverse: boolean, reserve = ctx.compact ? 64 : 96) => {
    const count = labels.length, longest = Math.max(0, ...labels.map(l => l.length));
    const slot = !vertical && ctx.width && ctx.width > 0 ? Math.max(0, ctx.width - reserve) / Math.max(1, count) : 0;
    const fits = slot > 0 ? longest * text.fontSize * 0.55 <= slot - 6 : !(ctx.compact && count * longest > 20);
    const rotate = !vertical && (count > 12 || (ctx.compact && count > 6) || !fits);
    // "touching" is measured against one LINE BOX (1.7 em: the webfont's ascent + descent), not just the glyphs; a dense axis shows every
    // `step`-th label — computed here, not left to the engine's own width estimate — so shown neighbours keep one line box apart (15 %
    // margin for the estimated slot)
    const perpendicular = slot * Math.SQRT1_2, line = text.fontSize * 1.7;
    const dense = rotate && slot > 0 && perpendicular < line;
    const step = dense ? Math.ceil((line * 1.15) / perpendicular) : 1;
    // a rotated label may be longer (it no longer shares the slot's width; phones keep it short); a flat label never exceeds its slot
    const cap = ctx.compact ? 64 : rotate ? 104 : slot > 0 ? Math.max(24, Math.min(110, Math.floor(slot - 4))) : 110;
    // the axis name sits below the rotated labels: their vertical reach (the longest label, at most its cap, at 45°) plus one line
    const reach = Math.min(cap, longest * text.fontSize * 0.6) * Math.SQRT1_2;
    return {
      type: "category", data: labels.map(isolate), name: axisName(a), inverse,
      ...(vertical ? { nameLocation: inverse ? "start" : "end", nameGap: 12 } : { nameLocation: "middle", nameGap: rotate ? Math.ceil(reach + text.fontSize * 2) + 8 : 30 }),
      nameTextStyle: { ...text, color: ctx.tokens.muted }, axisTick: { alignWithLabel: true }, axisLine: { lineStyle: { color: ctx.tokens.muted } },
      axisLabel: { ...text, interval: dense ? step - 1 : count <= 12 ? 0 : "auto", ...(rotate ? { rotate: 45 } : {}), ...capped(cap) }
    };
  };
  // The outer bounds equal the grid margins: axis labels and axis names are always kept INSIDE the canvas (no clipped text).
  const grid = { left: ctx.compact ? 8 : 16, right: ctx.compact ? 12 : 24, top: 28, bottom: ctx.compact ? 8 : 12, outerBoundsMode: "same", outerBoundsContain: "all" };
  const emphasize = (key: string, color: string) => (sel.has(key)
    ? { borderColor: CHART_SELECTED_COLOR, borderWidth: 3, color, opacity: 1 }
    : anySelected ? { color, opacity: 0.45 } : { color });
  // value labels (round-4 finding B4-3): labels that would overlap another label are hidden (the table, the tooltip and the selection
  // list carry every value), and the plot keeps room on its right for the widest one, so none is cut by the canvas edge — half of it
  // beside the last column, all of it beyond the end of a horizontal bar
  const VALUE_LABEL_LAYOUT = { hideOverlap: true };
  // the overlap test uses each label's box: one line box of the webfont (1.7 em), as drawn
  const valueLineHeight = Math.ceil(text.fontSize * 1.7);
  const valueLabelRoom = (values: number[], beyond: boolean) => {
    const widest = Math.max(0, ...values.map(v => (measure ? measure(formatValue(v), font) : formatValue(v).length * text.fontSize * 0.6)));
    return Math.ceil(beyond ? widest + 6 : widest / 2 + 4);
  };
  // a reference line's label sits inside the plot at the line's end — or, when `outside` is given (value labels are drawn above the
  // columns and would share its place), beyond the plot's right edge: `outside.after` px past the edge (the room kept for the last
  // column's value label), its text cut to `outside.cap` px, in the margin `referenceRoom` reserves
  const markLine = (lines: { value: number; label: string }[] | undefined, horizontalValueAxis: boolean, outside?: { cap: number; after: number }) => (lines && lines.length ? {
    silent: true, symbol: "none", lineStyle: { color: ctx.tokens.muted, type: "dashed", width: 1.5 },
    label: { ...text, color: ctx.tokens.muted, backgroundColor: ctx.tokens.surface, padding: [2, 4], borderRadius: 3,
      ...(outside
        ? { position: "end", distance: outside.after, ...(measure ? {} : { width: outside.cap, overflow: "truncate" }),
            formatter: (p: { dataIndex: number }) => { const l = lines[p.dataIndex]?.label ?? ""; return isolate(measure ? fitText(l, outside.cap, font, measure) : l); } }
        : { position: "insideEndTop", formatter: (p: { dataIndex: number }) => isolate(lines[p.dataIndex]?.label ?? "") }) },
    data: lines.map(l => (horizontalValueAxis ? { xAxis: l.value } : { yAxis: l.value }))
  } : undefined);
  // the margin an outside reference label takes: its widest label (at most `cap`), its padding and the gap before it
  const referenceRoom = (lines: { label: string }[], cap: number, after: number) =>
    Math.ceil(after + 10 + Math.min(cap, Math.max(0, ...lines.map(l => (measure ? measure(l.label, font) : l.label.length * text.fontSize * 0.6)))));

  if (isCategoryChart(spec)) {
    const horizontal = spec.kind === "bar" && spec.orientation === "horizontal";
    const stacked = "stacked" in spec && spec.stacked === true;
    // combo: series on the SECONDARY value axis are measured on a second, independently scaled axis (drawn on the other side, without its
    // own grid lines so the grid stays the primary axis's); reference lines are drawn by the first PRIMARY series (primary-axis values)
    const onSecondary = (s: { axis?: string }) => spec.kind === "combo" && s.axis === "secondary";
    const dual = spec.series.some(onSecondary);
    // the width each vertical value axis takes beside the plot: its widest value label, or its name's gap when it is named (the grid
    // margins hold both); a stacked axis reaches the category totals; a combo's secondary axis takes its own width on the other side
    const valuesOf = (secondary: boolean) => {
      const ss = spec.series.filter(s => onSecondary(s) === secondary);
      const a = secondary ? (spec.kind === "combo" ? spec.y2Axis : undefined) : spec.yAxis;
      return [...(stacked ? spec.categories.map((_, i) => ss.reduce((n, s) => n + Math.abs(s.values[i] ?? 0), 0)) : ss.flatMap(s => s.values.filter((v): v is number => v !== null))), ...(a?.min !== undefined ? [a.min] : []), ...(a?.max !== undefined ? [a.max] : [])];
    };
    const axisWidth = (values: number[], a: ChartAxis | undefined) =>
      Math.max(axisName(a) ? (ctx.compact ? 34 : 44) + text.fontSize : 0, Math.ceil(Math.max(1, ...values.map(v => formatValue(v).length)) * text.fontSize * 0.6) + 8);
    const labelRoom = spec.valueLabels && !(stacked && spec.kind === "bar") ? valueLabelRoom(valuesOf(false).concat(valuesOf(true)), horizontal) : 0;
    const labelRight = Math.max(0, labelRoom - grid.right);
    // value labels above vertical columns and a reference line: its label moves beyond the plot's right edge (round-4 finding B4-3), past
    // the room the last column's value label may take there — a secondary axis already holds that side (its label stays inside)
    const lines = spec.referenceLines;
    const refOutside = spec.valueLabels && !horizontal && !dual && lines && lines.length
      ? { cap: ctx.compact ? 64 : 120, after: 5 + labelRoom } : undefined;
    const refRight = refOutside && lines ? Math.max(0, referenceRoom(lines, refOutside.cap, refOutside.after) - grid.right - labelRight) : 0;
    const right = labelRight + refRight;
    const reserve0 = (ctx.compact ? 20 : 40) + right + axisWidth(valuesOf(false), spec.yAxis) + (dual && spec.kind === "combo" ? axisWidth(valuesOf(true), spec.y2Axis) : 0);
    // the first column's value label reaches half its width left of the column's centre: when the slot is narrower, the value axis's labels
    // step away from the plot by the rest (their default 8 px gap grows), so the value label never lies on an axis label. `left` solves
    // left ≥ room − 8 − slot / 2 with slot = (width − reserve − left) / count; an unmeasured container keeps the full room
    const n = Math.max(1, spec.categories.length), free = ctx.width && ctx.width > 0 ? Math.max(0, ctx.width - reserve0) : 0;
    const left = labelRoom && !horizontal ? Math.ceil(Math.max(0, labelRoom - 8 - free / (2 * n)) / (1 - 1 / (2 * n))) : 0;
    const reserve = reserve0 + left;
    // vertical: categories on x, values on y; horizontal bars: values on x (spec.xAxis is the numeric axis), categories on y (first on top)
    const cat = categoryAxis(spec.categories.map(c => c.label), horizontal ? spec.yAxis : spec.xAxis, horizontal, horizontal, reserve);
    // unstacked value labels sit beyond the bar end / point: the value axis keeps 10% headroom for them (ignored when the author fixed a bound)
    // a rotated first category label rises toward the value axis's lowest label: that label steps 6 px further away
    const gap = Math.max(left, !horizontal && "rotate" in cat.axisLabel ? 6 : 0);
    const valueBase = horizontal ? valueAxis(spec.xAxis, false) : valueAxis(spec.yAxis, true);
    const val = { ...valueBase, ...(gap ? { axisLabel: { ...valueBase.axisLabel, margin: 8 + gap } } : {}), ...(spec.valueLabels && !stacked ? { boundaryGap: [0, "10%"] } : {}) };
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
        ...(spec.valueLabels ? { labelLayout: VALUE_LABEL_LAYOUT, label: { show: true, ...text, lineHeight: valueLineHeight, ...(stacked && mark === "bar" ? { position: "inside", color: "#FFFFFF", fontWeight: 600 } : { position: horizontal ? "right" : "top" }), formatter: (p: { value: unknown }) => (typeof p.value === "number" ? formatValue(p.value) : "") } } : {}),
        ...(si === lineHost ? { markLine: markLine(spec.referenceLines, horizontal, refOutside) } : {})
      };
    });
    return { ...base, grid: right ? { ...grid, right: grid.right + right } : grid, xAxis: horizontal ? val : cat, yAxis: horizontal ? cat : val2 ? [val, val2] : val, series };
  }
  switch (spec.kind) {
    case "pie": {
      const sum = spec.slices.reduce((a, s) => a + s.value, 0);
      return { ...base, series: [{
        type: "pie", radius: spec.donut ? ["42%", "68%"] : [0, "68%"], center: ["50%", "52%"], avoidLabelOverlap: true,
        // narrow containers: no outside labels (the legend, the tooltip and the table name every slice); otherwise labels are aligned to
        // the canvas edges and truncated, so none can leave the canvas
        ...(ctx.compact ? { label: { show: false }, labelLine: { show: false } } : {}),
        label: { ...text, show: !ctx.compact, alignTo: "edge", edgeDistance: 12, minMargin: 4, width: 140, lineHeight: Math.ceil(text.fontSize * 1.75), overflow: measure ? "none" : "truncate", formatter: (p: { dataIndex: number }) => {
          const s = spec.slices[p.dataIndex];
          if (!s) return "";
          const amount = spec.valueLabels ? valueText(s.value, spec.unit) + " (" + valueText(Math.round(s.value / sum * 1000) / 10, "%") + ")" : "";
          const value = amount ? ": " + amount : "";
          if (!measure) return isolate(s.label) + value;
          // measured: the name is cut, never the value; a value (with a long unit) that leaves the name less than PIE_NAME_MIN px goes on
          // a line of its own — name and value each cut to the 140 px cap (round-4 finding B4-1: no label is ever wider than its box)
          const room = 140 - measure(value.replace(ISOLATES, ""), font);
          if (!amount || room >= PIE_NAME_MIN) return isolate(fitText(s.label, room, font, measure)) + value;
          const plain = amount.replace(ISOLATES, ""), cut = fitText(plain, 140, font, measure);
          return isolate(fitText(s.label, 140, font, measure)) + "\n" + (cut === plain ? amount : isolate(cut));
        } },
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
      const binRight = spec.valueLabels ? Math.max(0, valueLabelRoom(spec.bins.map(b => b.count), false) - grid.right) : 0;
      return { ...base, grid: binRight ? { ...grid, right: grid.right + binRight } : grid, xAxis: categoryAxis(spec.bins.map(b => binLabel(b.start, b.end)), spec.xAxis, false, false, (ctx.compact ? 64 : 96) + binRight), yAxis: { ...valueAxis(spec.yAxis, true), ...(spec.valueLabels ? { boundaryGap: [0, "10%"] } : {}) },
        series: [{ type: "bar", barCategoryGap: "2%", data: spec.bins.map(b => ({ value: b.count, itemStyle: emphasize(b.id, palette[0]) })),
          ...(spec.valueLabels ? { labelLayout: VALUE_LABEL_LAYOUT, label: { show: true, ...text, lineHeight: valueLineHeight, position: "top", formatter: (p: { value: unknown }) => (typeof p.value === "number" ? formatValue(p.value) : "") } } : {}) }] };
    }
    case "radar": {
      // the axis names sit outside the radius, left- / right-aligned at the sides: with the stage width known, the radius leaves each
      // side room for the names (up to their cap, shrinking the radius to at most half its size) and the names are cut to that room —
      // no name leaves the canvas (round-4 finding B4-2). Without a width: the default radius and the engine's own truncation.
      const pct = ctx.compact ? 0.58 : 0.66, gap = 15, w = ctx.width && ctx.width > 0 ? ctx.width : 0;
      const nameWidth = (s: string) => (measure ? measure(s, font) : s.length * text.fontSize * 0.6);
      const want = Math.min(Math.max(0, ...spec.axes.map(a => nameWidth(a.label))), ctx.compact ? 72 : 110);
      const full = pct * Math.min(w, chartHeight(spec, ctx.compact)) / 2;
      const radius = w ? Math.round(Math.max(full / 2, Math.min(full, w / 2 - gap - 8 - want))) : 0;
      const nameCap = w ? Math.max(24, Math.floor(w / 2 - radius - gap - 8)) : ctx.compact ? 64 : 110;
      return { ...base, radar: { radius: radius || (ctx.compact ? "58%" : "66%"), axisNameGap: gap, indicator: spec.axes.map(a => ({ name: isolate(a.label), max: a.max })), axisName: { ...text, ...capped(nameCap) }, splitLine: { lineStyle: { color: ctx.tokens.grid } }, axisLine: { lineStyle: { color: ctx.tokens.grid } } },
        series: [{ type: "radar", symbolSize: 6, data: spec.series.map((s, i) => {
          const selected = sel.has(s.id), color = palette[i % palette.length];
          return { value: [...s.values], name: isolate(s.label), itemStyle: { color }, lineStyle: { color, width: selected ? 4 : 2, opacity: anySelected && !selected ? 0.45 : 1 }, areaStyle: { color, opacity: selected ? 0.3 : 0.12 } };
        }) }] };
    }
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
        // the columns share the plot width the ROW labels leave beside it (each at most its cap)
        xAxis: categoryAxis(spec.columns.map(c => c.label), spec.xAxis, false, false,
          (ctx.compact ? 20 : 40) + Math.min(ctx.compact ? 64 : 110, Math.ceil(Math.max(0, ...spec.rows.map(r => r.label.length)) * text.fontSize * 0.6)) + 8),
        yAxis: categoryAxis(spec.rows.map(r => r.label), spec.yAxis, true, true),
        // the colour scale names its two ends (lowest and highest value, with the unit): the scale is readable, not colour alone
        visualMap: { type: "continuous", seriesIndex: 0, min, max: min + span, calculable: false, orient: "horizontal", left: "center", bottom: 4, itemHeight: ctx.compact ? 120 : 180, inRange: { color: [...CHART_HEAT_SCALE] }, textStyle: { ...text }, text: [valueText(max, spec.unit), valueText(min, spec.unit)], textGap: 8 },
        series: [
          // present cells: coloured by the scale; a value label (when asked for) takes the colour with the better contrast against its cell,
          // with a halo in the opposite colour where neither reaches 4.5:1 (the middle of the scale)
          { type: "heatmap", itemStyle: cellBorder, data: cells.map(([x, y, v]) => { const l = labelOn(heatColorAt((v - min) / span)); return { value: [x, y, v], label: { color: l.color, ...(l.halo ? { textBorderColor: l.halo, textBorderWidth: 2 } : {}) } }; }),
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
    return { title: c.label, lines: [s.label + ": " + valueText(v, unit)] };
  }
  switch (spec.kind) {
    case "pie": { const s = spec.slices[di]; return s ? { title: s.label, lines: [valueText(s.value, spec.unit)] } : null; }
    case "histogram": { const b = spec.bins[di]; return b ? { title: binLabel(b.start, b.end), lines: [(spec.yAxis?.label ?? "التكرار") + ": " + valueText(b.count, spec.yAxis?.unit)] } : null; }
    case "boxplot": { const b = spec.boxes[di], u = spec.yAxis?.unit; return b ? { title: b.label, lines: ["الأدنى: " + valueText(b.min, u), "الربيع الأول: " + valueText(b.q1, u), "الوسيط: " + valueText(b.median, u), "الربيع الثالث: " + valueText(b.q3, u), "الأعلى: " + valueText(b.max, u)] } : null; }
    case "radar": { const s = spec.series[di]; return s ? { title: s.label, lines: spec.axes.map((a, i) => a.label + ": " + valueText(s.values[i])) } : null; }
    case "scatter": { const s = spec.series[si], p = s?.points[di]; return s && p ? { title: p.label ?? s.label, lines: [(spec.xAxis?.label ?? "x") + ": " + valueText(p.x, spec.xAxis?.unit), (spec.yAxis?.label ?? "y") + ": " + valueText(p.y, spec.yAxis?.unit)] } : null; }
    case "heatmap": {
      const { cells, missing } = heatCells(spec);
      if (si === 0) { const c = cells[di]; return c ? { title: spec.rows[c[1]].label + " — " + spec.columns[c[0]].label, lines: [valueText(c[2], spec.unit)] } : null; }
      const m = si === 1 ? missing[di] : undefined;
      return m ? { title: spec.rows[m[1]].label + " — " + spec.columns[m[0]].label, lines: ["لا قيمة"] } : null;
    }
  }
  return null;
}

/** What the stage width decides in an option: the category axes' label layout (rotation, thinning, label width, name gap), the value axis's
 *  label gap, and the radar's radius and name width — nothing else in an option depends on the width (the right margin for value and
 *  reference labels follows the values, the labels and the compact class, itself an input). Two options built from the same inputs with
 *  the same layout draw the same picture. */
export function widthLayout(option: EngineOption): string {
  type Axis = { type?: unknown; nameGap?: unknown; axisLabel?: { rotate?: unknown; interval?: unknown; width?: unknown; margin?: unknown } } | undefined;
  const radar = option.radar as { radius?: unknown; axisName?: { width?: unknown } } | undefined;
  return JSON.stringify([([option.xAxis, option.yAxis].flat() as Axis[]).map(a => (a && a.type === "category" ? [a.axisLabel?.rotate ?? 0, a.axisLabel?.interval, a.axisLabel?.width, a.nameGap] : a?.axisLabel?.margin ?? 0)),
    radar ? [radar.radius, radar.axisName?.width] : 0]);
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
    // rows keep at least one line box apart when the column labels below are rotated (their reach is part of the height)
    case "heatmap": return clamp(spec.rows.length * 30 + 230, 300, 950);
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
