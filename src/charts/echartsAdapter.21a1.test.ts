import { describe, it, expect } from "vitest";
import { buildEngineOption, chartHeight, chartLegend, formatValue, isolate, needsAdvancedEngine, targetFromEvent, tooltipFromEvent, type AdapterContext } from "./echartsAdapter";
import { validateChartSpec, type CategoryChartSpec, type ChartSpecV1 } from "./chartSpec";
import { chartTargets } from "./chartData";
import { ANIMATION_TIMINGS, CHART_HEAT_SCALE, CHART_PALETTE_COLORS, CHART_SELECTED_COLOR, contrastRatio, defaultChartTokens, effectiveAnimation } from "./chartTheme";
import { ALL_CHARTS, boxplotChart, comboChart, donutChart, heatmapChart, histogramChart, horizontalStackedBar, radarChart, rainfallBar, scatterChart, stackedArea, temperatureLine } from "./testing/chartFixtures";

// Phase 21A.1 — the ExamBank → engine ADAPTER (pure). Pins: the option vocabulary the adapter may emit (no engine tooltip / legend / title /
// toolbox / dataZoom / graphic / aria component, every formatter a code-owned FUNCTION — never a template string), how every kind maps, RTL
// isolation, the animation policy, selection emphasis, and the event → semantic-key / tooltip-text mappings.
const ctx = (over: Partial<AdapterContext> = {}): AdapterContext => ({ tokens: defaultChartTokens(), animation: "subtle", compact: false, ...over });
const canon = (c: ChartSpecV1) => { const r = validateChartSpec(c); if (!r.ok) throw new Error(JSON.stringify(r.issues)); return r.value; };
const RLI = "⁧", PDI = "⁩";
type Walk = { path: string; value: unknown };
function walk(v: unknown, path = "", out: Walk[] = []): Walk[] {
  out.push({ path, value: v });
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, path + "[" + i + "]", out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path + "." + k, out);
  return out;
}
const FORBIDDEN_COMPONENTS = ["tooltip", "legend", "title", "toolbox", "dataZoom", "graphic", "aria", "brush", "timeline", "dataset", "media", "baseOption", "options"];

describe("21A1-AD1 option vocabulary and safety", () => {
  it("for every kind the option never configures an engine tooltip / legend / title / toolbox / dataZoom / graphic / aria / dataset component", () => {
    for (const c of ALL_CHARTS()) {
      const o = buildEngineOption(canon(c), ctx());
      for (const k of FORBIDDEN_COMPONENTS) expect(o, c.kind + " " + k).not.toHaveProperty(k);
      for (const w of walk(o)) {
        const last = w.path.split(".").pop() ?? "";
        expect(FORBIDDEN_COMPONENTS.includes(last) && w.path.split(".").length === 2, w.path).toBe(false);
        expect(["rich", "html", "renderMode", "extraCssText", "appendToBody", "confine", "enterable"].includes(last), c.kind + w.path).toBe(false);
      }
    }
  });
  it("every formatter is a code-owned FUNCTION (never a template string), and functions appear nowhere else", () => {
    for (const c of ALL_CHARTS()) {
      for (const w of walk(buildEngineOption(canon(c), ctx({ selectionKind: "category", selected: new Set(["jan"]) })))) {
        const last = w.path.split(".").pop() ?? "";
        if (last === "formatter") expect(typeof w.value, c.kind + w.path).toBe("function");
        else expect(typeof w.value, c.kind + w.path).not.toBe("function");
      }
    }
  });
  it("hostile-looking author text (template syntax, rich-text syntax, entity text, script words) reaches the engine only as plain names / data; formatters return it verbatim", () => {
    const c = rainfallBar() as CategoryChartSpec;
    c.categories[0].label = "{a|b} {b} ${x} &lt;i&gt; {{x}}";
    c.series[0].label = "{c}% {@value}";
    c.referenceLines = [{ id: "avg", value: 50, label: "{b}{c}{d} — حدّ" }];
    const spec = canon(c);
    const o = buildEngineOption(spec, ctx()) as { xAxis: { data: string[] }; series: { name: string; markLine: { label: { formatter: (p: unknown) => string } } }[] };
    expect(o.xAxis.data[0]).toBe("{a|b} {b} ${x} &lt;i&gt; {{x}}");                                                  // LTR: unchanged, no isolate
    expect(o.series[0].name).toBe("{c}% {@value}");
    expect(o.series[0].markLine.label.formatter({ dataIndex: 0 })).toBe(RLI + "{b}{c}{d} — حدّ" + PDI);
    // the same text cannot be markup: the contract refuses tags before the adapter ever runs
    const bad = rainfallBar() as CategoryChartSpec;
    for (const t of ["<img src=x onerror=alert(1)>", "javascript:alert(1)", "<svg/onload=x>"]) {
      bad.categories[0].label = t;
      expect(validateChartSpec(bad).ok, t).toBe(false);
    }
  });
  it("the option is plain data apart from the formatter functions (JSON-serialisable after dropping them) and is rebuilt fresh on every call", () => {
    const spec = canon(rainfallBar());
    const a = buildEngineOption(spec, ctx()), b = buildEngineOption(spec, ctx());
    expect(a).not.toBe(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));
    expect(spec).toEqual(canon(rainfallBar()));                                                                         // the spec is never mutated
  });
});

describe("21A1-AD2 per-kind mapping", () => {
  it("vertical bars: categories on x in data order (never reversed), values on y with the unit in the axis name; null → '-' (a gap, never 0)", () => {
    const line = canon(temperatureLine());
    const o = buildEngineOption(line, ctx()) as { xAxis: { type: string; data: string[]; inverse: boolean }; yAxis: { type: string; name: string }; series: { type: string; data: unknown[]; connectNulls: boolean }[] };
    expect(o.xAxis.type).toBe("category");
    expect(o.xAxis.data).toEqual(["MON", "TUE", "WED", "THU", "FRI"]);
    expect(o.xAxis.inverse).toBe(false);
    expect(o.yAxis).toMatchObject({ type: "value", name: "Temperature (°C)" });
    expect(o.series.map(s => s.type)).toEqual(["line", "line"]);
    expect(o.series[0].data).toEqual([21.5, 23, "-", -2, 0]);
    expect(o.series[0].connectNulls).toBe(false);
    const rain = buildEngineOption(canon(rainfallBar()), ctx()) as { xAxis: { data: string[] }; series: { type: string; data: number[]; markLine: { data: unknown[] } }[] };
    expect(rain.xAxis.data[0]).toBe(RLI + "يناير" + PDI);
    expect(rain.series[0].data).toEqual([120, 95, 82, 40, 12.5, 0, 0, 3, 18, 135, 88, 60]);
    expect(rain.series[0].markLine.data).toEqual([{ yAxis: 50 }]);
  });
  it("horizontal stacked bars: the numeric axis is x (from spec.xAxis), categories on y, first category on top; every series stacks", () => {
    const o = buildEngineOption(canon(horizontalStackedBar()), ctx()) as { xAxis: { type: string; name: string; min: number }; yAxis: { type: string; inverse: boolean; data: string[] }; series: { stack: string; type: string; label: { show: boolean; position: string } }[] };
    expect(o.xAxis).toMatchObject({ type: "value", name: "Votes", min: 0 });
    expect(o.yAxis).toMatchObject({ type: "category", inverse: true, data: ["North", "South"] });
    expect(o.series.map(s => [s.type, s.stack])).toEqual([["bar", "total"], ["bar", "total"]]);
    expect(o.series[0].label).toMatchObject({ show: true, position: "inside", color: "#FFFFFF" });             // stacked: inside the segment (browser: "right" overlapped the next segment)
    const flat = buildEngineOption(canon((({ stacked: _s, ...rest }) => rest)(horizontalStackedBar() as CategoryChartSpec) as ChartSpecV1), ctx()) as { xAxis: { boundaryGap: unknown }; series: { label: { position: string } }[] };
    expect(flat.series[0].label.position).toBe("right");
    expect(flat.xAxis.boundaryGap).toEqual([0, "10%"]);                                                     // headroom for the end labels
  });
  it("stacked area, combo marks, donut radius, scatter, histogram, radar, boxplot and heatmap map to the expected series", () => {
    const area = buildEngineOption(canon(stackedArea()), ctx()) as { series: { type: string; stack: string; areaStyle: object }[] };
    expect(area.series.every(s => s.type === "line" && s.stack === "total" && !!s.areaStyle)).toBe(true);
    const combo = buildEngineOption(canon(comboChart()), ctx()) as { series: { type: string }[] };
    expect(combo.series.map(s => s.type)).toEqual(["bar", "line"]);
    const donut = buildEngineOption(canon(donutChart()), ctx()) as { series: { type: string; radius: unknown; data: { value: number; name: string }[] }[] };
    expect(donut.series[0]).toMatchObject({ type: "pie", radius: ["42%", "68%"] });
    expect(donut.series[0].data.map(d => d.value)).toEqual([40, 35, 25]);
    const sc = buildEngineOption(canon(scatterChart()), ctx()) as { xAxis: { type: string; scale: boolean }; series: { type: string; data: { value: number[] }[] }[] };
    expect(sc.xAxis).toMatchObject({ type: "value", scale: true });
    expect(sc.series[0].data.map(d => d.value)).toEqual([[150, 45], [170, 60], [160, 52], [155, 95]]);                 // author order kept (unsorted)
    const h = buildEngineOption(canon(histogramChart()), ctx()) as { xAxis: { data: string[] }; series: { type: string; barCategoryGap: string; data: { value: number }[] }[] };
    expect(h.xAxis.data).toEqual(["[0 – 10)", "[10 – 20)", "[20 – 30)", "[30 – 40)"]);
    expect(h.series[0]).toMatchObject({ type: "bar", barCategoryGap: "2%" });
    expect(h.series[0].data.map(d => d.value)).toEqual([2, 5, 9, 4]);
    const r = buildEngineOption(canon(radarChart()), ctx()) as { radar: { indicator: { name: string; max: number }[] }; series: { type: string; data: { value: number[] }[] }[] };
    expect(r.radar.indicator).toEqual([{ name: "read", max: 10 }, { name: "write", max: 10 }, { name: "speak", max: 10 }, { name: "listen", max: 10 }]);
    expect(r.series[0].data.map(d => d.value)).toEqual([[8, 6, 7, 9], [9, 8, 6, 7]]);
    const b = buildEngineOption(canon(boxplotChart()), ctx()) as { series: { type: string; data: { value: number[] }[] }[]; yAxis: { min: number; max: number } };
    expect(b.series[0].type).toBe("boxplot");
    expect(b.series[0].data.map(d => d.value)).toEqual([[40, 55, 65, 75, 95], [30, 50, 60, 70, 88]]);
    expect(b.yAxis).toMatchObject({ min: 0, max: 100 });
    const hm = buildEngineOption(canon(heatmapChart()), ctx()) as { series: { type: string; data: { value: number[] }[] | number[][]; itemStyle: { color?: string } }[]; visualMap: { min: number; max: number; seriesIndex: number; inRange: { color: string[] } } };
    expect(hm.series.map(x => x.type)).toEqual(["heatmap", "heatmap"]);
    expect((hm.series[0].data as { value: number[] }[]).map(d => d.value)).toEqual([[0, 0, 5], [1, 0, 9], [0, 1, 3], [0, 2, 7], [1, 2, 2]]);   // present cells only
    expect(hm.series[1].data).toEqual([[1, 1, 0]]);                                                         // the missing cell: its own neutral series…
    expect(hm.series[1].itemStyle.color).toBe("#F1F5F9");
    expect(hm.visualMap).toMatchObject({ min: 2, max: 9, seriesIndex: 0 });                                 // …never coloured by the value scale
    expect(hm.visualMap.inRange.color).toEqual([...CHART_HEAT_SCALE]);
  });
  it("only radar, box plot and heat map need the advanced engine chunk", () => {
    expect(ALL_CHARTS().filter(needsAdvancedEngine).map(c => c.kind)).toEqual(["radar", "boxplot", "heatmap"]);
  });
});

describe("21A1-AD3 RTL, numbers, theme, animation", () => {
  it("isolate wraps RTL (Arabic) text in RLI…PDI and leaves LTR text untouched; mixed labels are isolated as one unit", () => {
    expect(isolate("يناير")).toBe(RLI + "يناير" + PDI);
    expect(isolate("الهامش %")).toBe(RLI + "الهامش %" + PDI);
    expect(isolate("CO₂ — ثاني أكسيد الكربون")).toBe(RLI + "CO₂ — ثاني أكسيد الكربون" + PDI);
    expect(isolate("Max °C")).toBe("Max °C");
  });
  it("formatValue is deterministic and locale-free", () => {
    expect([formatValue(12.5), formatValue(0), formatValue(-2), formatValue(0.1 + 0.2), formatValue(1e6), formatValue(1 / 3)]).toEqual(["12.5", "0", "-2", "0.3", "1000000", "0.333333"]);
  });
  it("every palette colour has at least 4.5:1 contrast against white; the selected colour is distinct from every palette colour", () => {
    for (const [name, colors] of Object.entries(CHART_PALETTE_COLORS)) for (const c of colors) expect(contrastRatio(c, "#FFFFFF"), name + " " + c).toBeGreaterThanOrEqual(4.5);
    for (const colors of Object.values(CHART_PALETTE_COLORS)) expect(colors).not.toContain(CHART_SELECTED_COLOR);
  });
  it("animation policy: none → no animation; subtle / normal → their timings; reduced motion and print always force none; preview upgrades subtle to normal", () => {
    expect(buildEngineOption(canon(rainfallBar()), ctx({ animation: "none" }))).toMatchObject({ animation: false });
    expect(buildEngineOption(canon(rainfallBar()), ctx({ animation: "subtle" }))).toMatchObject({ animation: true, animationDuration: ANIMATION_TIMINGS.subtle!.duration });
    expect(buildEngineOption(canon(rainfallBar()), ctx({ animation: "normal" }))).toMatchObject({ animation: true, animationDuration: ANIMATION_TIMINGS.normal!.duration });
    expect(effectiveAnimation(undefined, { reducedMotion: false, print: false })).toBe("subtle");
    expect(effectiveAnimation("normal", { reducedMotion: true, print: false })).toBe("none");
    expect(effectiveAnimation("normal", { reducedMotion: false, print: true })).toBe("none");
    expect(effectiveAnimation("subtle", { reducedMotion: false, print: false, preview: true })).toBe("normal");
    expect(effectiveAnimation("none", { reducedMotion: false, print: false, preview: true })).toBe("none");
  });
});

describe("21A1-AD4 selection emphasis and event mapping", () => {
  it("selected targets are emphasised with the selection colour; the others are dimmed; nothing is emphasised without a selection", () => {
    const spec = canon(rainfallBar());
    const o = buildEngineOption(spec, ctx({ selectionKind: "category", selected: new Set(["oct"]) })) as { series: { data: { itemStyle: { borderColor?: string; opacity?: number } }[] }[] };
    expect(o.series[0].data[9].itemStyle).toMatchObject({ borderColor: CHART_SELECTED_COLOR, borderWidth: 3 });
    expect(o.series[0].data[0].itemStyle).toMatchObject({ opacity: 0.45 });
    const none = buildEngineOption(spec, ctx({ selectionKind: "category", selected: new Set() })) as { series: { data: { itemStyle: { borderColor?: string; opacity?: number } }[] }[] };
    expect(none.series[0].data.every(d => d.itemStyle.borderColor === undefined && d.itemStyle.opacity === undefined)).toBe(true);
  });
  it("engine coordinates map to semantic keys for every target kind; a missing value, an unknown index or a non-series component maps to nothing", () => {
    const line = canon(temperatureLine());
    expect(targetFromEvent(line, "datum", { componentType: "series", seriesIndex: 1, dataIndex: 3 })).toBe("tmin/thu");
    expect(targetFromEvent(line, "category", { componentType: "series", seriesIndex: 0, dataIndex: 4 })).toBe("fri");
    expect(targetFromEvent(line, "series", { componentType: "series", seriesIndex: 1, dataIndex: 0 })).toBe("tmin");
    expect(targetFromEvent(line, "datum", { componentType: "series", seriesIndex: 0, dataIndex: 2 })).toBeNull();          // WED is missing
    expect(targetFromEvent(line, "datum", { componentType: "series", seriesIndex: 0, dataIndex: 99 })).toBeNull();
    expect(targetFromEvent(line, "datum", { componentType: "series", seriesIndex: 7, dataIndex: 0 })).toBeNull();
    expect(targetFromEvent(line, "datum", { componentType: "markLine", seriesIndex: 0, dataIndex: 0 })).toBeNull();
    expect(targetFromEvent(line, "point", { componentType: "series", seriesIndex: 0, dataIndex: 0 })).toBeNull();          // wrong kind for a line chart
    expect(targetFromEvent(line, "datum", { componentType: "series" })).toBeNull();
    const sc = canon(scatterChart());
    expect(targetFromEvent(sc, "point", { componentType: "series", seriesIndex: 0, dataIndex: 3 })).toBe("out");
    expect(targetFromEvent(sc, "series", { componentType: "series", seriesIndex: 0, dataIndex: 3 })).toBe("students");
    expect(targetFromEvent(canon(histogramChart()), "bin", { componentType: "series", seriesIndex: 0, dataIndex: 2 })).toBe("b2");
    expect(targetFromEvent(canon(donutChart()), "category", { componentType: "series", seriesIndex: 0, dataIndex: 1 })).toBe("health");
    expect(targetFromEvent(canon(boxplotChart()), "category", { componentType: "series", seriesIndex: 0, dataIndex: 1 })).toBe("b");
    expect(targetFromEvent(canon(radarChart()), "series", { componentType: "series", seriesIndex: 0, dataIndex: 1 })).toBe("sara");
    expect(targetFromEvent(canon(heatmapChart()), "category", { componentType: "series", seriesIndex: 0, dataIndex: 0 })).toBeNull();
  });
  it("every key the pointer can produce is a key of the chart's own target list (pointer and keyboard select the same things)", () => {
    for (const c of ALL_CHARTS().map(canon)) {
      for (const kind of ["category", "series", "datum", "point", "bin"] as const) {
        const keys = new Set(chartTargets(c, kind).map(t => t.key));
        for (let si = 0; si < 8; si++) for (let di = 0; di < 14; di++) {
          const k = targetFromEvent(c, kind, { componentType: "series", seriesIndex: si, dataIndex: di });
          if (k !== null) expect(keys.has(k), c.kind + " " + kind + " " + k).toBe(true);
        }
      }
    }
  });
  it("tooltips are TEXT built from the spec (label, value, unit); the heat map index skips missing cells", () => {
    expect(tooltipFromEvent(canon(rainfallBar()), { componentType: "series", seriesIndex: 0, dataIndex: 9 })).toEqual({ title: "أكتوبر", lines: ["الهطول: 135 mm"] });
    expect(tooltipFromEvent(canon(temperatureLine()), { componentType: "series", seriesIndex: 0, dataIndex: 2 })).toBeNull();
    expect(tooltipFromEvent(canon(donutChart()), { componentType: "series", seriesIndex: 0, dataIndex: 0 })).toEqual({ title: "التعليم", lines: ["40 %"] });
    expect(tooltipFromEvent(canon(scatterChart()), { componentType: "series", seriesIndex: 0, dataIndex: 3 })).toEqual({ title: "قيمة شاذّة", lines: ["الطول: 155 cm", "الكتلة: 95 kg"] });
    expect(tooltipFromEvent(canon(heatmapChart()), { componentType: "series", seriesIndex: 0, dataIndex: 2 })).toEqual({ title: "الاثنين — صباحًا", lines: ["3 زيارة"] });
    expect(tooltipFromEvent(canon(heatmapChart()), { componentType: "series", seriesIndex: 1, dataIndex: 0 })).toEqual({ title: "الاثنين — مساءً", lines: ["لا قيمة"] });
    expect(tooltipFromEvent(canon(heatmapChart()), { componentType: "series", seriesIndex: 2, dataIndex: 0 })).toBeNull();
    expect(tooltipFromEvent(canon(boxplotChart()), { componentType: "series", seriesIndex: 0, dataIndex: 0 })!.lines).toHaveLength(5);
    expect(tooltipFromEvent(canon(rainfallBar()), { componentType: "xAxis", seriesIndex: 0, dataIndex: 0 })).toBeNull();
  });
});

describe("21A1-AD5 layout helpers", () => {
  it("axis labels and names are contained in the canvas (outer bounds = grid margins); ≤ 12 categories draw every label, more let the engine hide overlaps and rotate", () => {
    const few = buildEngineOption(canon(rainfallBar()), ctx()) as { grid: object; xAxis: { axisLabel: { interval: unknown; rotate?: number } } };
    expect(few.grid).toMatchObject({ outerBoundsMode: "same", outerBoundsContain: "all" });
    expect(few.xAxis.axisLabel).toMatchObject({ interval: 0 });
    expect(few.xAxis.axisLabel.rotate).toBeUndefined();
    expect((buildEngineOption(canon(rainfallBar()), ctx({ compact: true })) as typeof few).xAxis.axisLabel.rotate).toBe(45);
    const { referenceLines: _r, ...plain } = rainfallBar() as CategoryChartSpec;
    const many = canon({ ...plain, categories: Array.from({ length: 30 }, (_, i) => ({ id: "c" + i, label: "C" + i })), series: [{ id: "s", label: "S", values: Array(30).fill(1) }] } as ChartSpecV1);
    expect((buildEngineOption(many, ctx()) as typeof few).xAxis.axisLabel).toMatchObject({ interval: "auto", rotate: 45 });
    // narrow: a few LONG labels rotate too (4 × "الربع N" would touch at phone width); a few short ones stay level; wide containers never rotate them
    const rot = (c: ChartSpecV1, compact: boolean) => (buildEngineOption(canon(c), ctx({ compact })) as typeof few).xAxis.axisLabel.rotate;
    expect([rot(comboChart(), true), rot(comboChart(), false), rot(temperatureLine(), true), rot(stackedArea(), true)]).toEqual([45, undefined, undefined, undefined]);
    const h = buildEngineOption(canon(horizontalStackedBar()), ctx()) as { yAxis: { nameLocation: string } };
    expect(h.yAxis.nameLocation).toBe("start");                                                              // a vertical category axis names itself above its labels
  });
  it("narrow pies draw no outside labels (legend / tooltip / table name the slices); wide pies align labels to the canvas edge and truncate them", () => {
    const narrow = buildEngineOption(canon(donutChart()), ctx({ compact: true })) as { series: { label: { show: boolean } }[] };
    expect(narrow.series[0].label.show).toBe(false);
    const wide = buildEngineOption(canon(donutChart()), ctx()) as { series: { label: { show: boolean; alignTo: string; overflow: string } }[] };
    expect(wide.series[0].label).toMatchObject({ show: true, alignTo: "edge", overflow: "truncate" });
  });
  it("the stage height depends only on the kind, the data size and the width CLASS, within bounds", () => {
    for (const c of ALL_CHARTS().map(canon)) for (const compact of [false, true]) {
      const h = chartHeight(c, compact);
      expect(h, c.kind).toBeGreaterThanOrEqual(220);
      expect(h, c.kind).toBeLessThanOrEqual(840);
    }
    const many = canon({ ...horizontalStackedBar(), categories: Array.from({ length: 60 }, (_, i) => ({ id: "c" + i, label: "C" + i })), series: [{ id: "a", label: "A", values: Array.from({ length: 60 }, () => 1) }] } as ChartSpecV1);
    expect(chartHeight(many, false)).toBe(760);
  });
  it("the legend lists series (or pie slices) only when there is more than one thing to tell apart, never for histograms / box plots / heat maps, never when turned off", () => {
    expect(chartLegend(canon(rainfallBar()))).toEqual([]);
    expect(chartLegend(canon(temperatureLine())).map(l => [l.key, l.mark])).toEqual([["tmax", "line"], ["tmin", "line"]]);
    expect(chartLegend(canon(comboChart())).map(l => l.mark)).toEqual(["bar", "line"]);
    expect(chartLegend(canon(donutChart())).map(l => l.label)).toEqual(["التعليم", "الصحة", "أخرى"]);
    for (const c of [histogramChart(), boxplotChart(), heatmapChart()]) expect(chartLegend(canon(c))).toEqual([]);
    expect(chartLegend(canon({ ...temperatureLine(), legend: "none" } as ChartSpecV1))).toEqual([]);
  });
});
