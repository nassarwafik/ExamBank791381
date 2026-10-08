import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { validateChartSpec, chartSummary, type CategoryChartSpec, type ChartSpecV1 } from "./chartSpec";
import { chartDataTable, labelWithUnit, nextChartSelection } from "./chartData";
import { buildEngineOption, tooltipFromEvent, valueText } from "./echartsAdapter";
import { convertChartKind } from "./chartEditing";
import { contrastRatio, defaultChartTokens, heatColorAt, labelOn } from "./chartTheme";
import { comboChart, donutChart, heatmapChart, histogramChart, horizontalStackedBar, rainfallBar, scatterChart, stackedArea, temperatureLine } from "./testing/chartFixtures";

// Phase 21A.1 — Review Fix 1 (rendering / UX lane): the rules behind the fixes, pinned on the pure modules. Each block names the finding.
const canon = (c: unknown) => { const r = validateChartSpec(c); if (!r.ok) throw new Error(JSON.stringify(r.issues)); return r.value; };
const codes = (c: unknown) => { const r = validateChartSpec(c); return r.ok ? [] : r.issues.map(i => i.code); };
const without = (c: ChartSpecV1, ...keys: string[]) => { const o = { ...c } as Record<string, unknown>; for (const k of keys) delete o[k]; return o; };
const LRI = "⁦", FSI = "⁨", PDI = "⁩", RLI = "⁧";
const ctx = { tokens: defaultChartTokens(), animation: "none" as const, compact: false };
const repo = path.resolve(__dirname, "..", "..");
const read = (f: string) => fs.readFileSync(path.join(repo, f), "utf8");

describe("21A1-RB4 mixed right-to-left text keeps its logical order (units, signs)", () => {
  it("a number with a Latin unit is ONE left-to-right isolate; an Arabic unit follows the isolated number; a bare number is isolated too", () => {
    expect(valueText(-2, "°C")).toBe(LRI + "-2 °C" + PDI);
    expect(valueText(120, "ملم")).toBe(LRI + "120" + PDI + " ملم");
    expect(valueText(1.5)).toBe(LRI + "1.5" + PDI);
  });
  it("an axis name 'label (unit)' isolates the unit inside the Arabic label (never '(C°)')", () => {
    expect(labelWithUnit("الحرارة", "°C")).toBe("الحرارة (" + FSI + "°C" + PDI + ")");
    const spec = canon({ ...scatterChart(), xAxis: { label: "الحرارة", unit: "°C" } });
    const o = buildEngineOption(spec, ctx) as unknown as { xAxis: { name: string } };
    expect(o.xAxis.name).toBe(RLI + "الحرارة (" + FSI + "°C" + PDI + ")" + PDI);
  });
  it("tooltip values carry the isolate (a negative value with a unit cannot become 'C° 2-')", () => {
    const spec = canon({ ...temperatureLine(), series: [{ id: "tmin", label: "الدنيا", values: [12, 13, 11, -2, -4] }] });
    expect(tooltipFromEvent(spec, { componentType: "series", seriesIndex: 0, dataIndex: 3 })!.lines).toEqual(["الدنيا: " + LRI + "-2 °C" + PDI]);
  });
});

describe("21A1-RB5 category labels never overlap at mid widths", () => {
  const long = () => canon({ ...rainfallBar(), categories: (rainfallBar() as CategoryChartSpec).categories.map((c, i) => ({ ...c, label: "محافظة رقم " + (i + 1) })) });
  type Axis = { axisLabel: { rotate?: number; width: number } };
  const xAxis = (spec: ChartSpecV1, width?: number) => (buildEngineOption(spec, { ...ctx, ...(width ? { width } : {}) }) as unknown as { xAxis: Axis }).xAxis;
  it("12 long labels rotate at 600 and 800 px (each label is wider than its slot), and stay flat where they fit", () => {
    expect(xAxis(long(), 800).axisLabel.rotate).toBe(45);
    expect(xAxis(long(), 600).axisLabel.rotate).toBe(45);
    expect(xAxis(long(), 1280).axisLabel.rotate).toBeUndefined();
    expect(xAxis(canon(rainfallBar()), 1280).axisLabel.rotate).toBeUndefined();          // 12 month names fit at desktop width
    expect(xAxis(canon(rainfallBar()), 1280).axisLabel.width).toBeLessThanOrEqual(110);
  });
  it("before the stage is measured the earlier rule applies (no width: flat at desktop, rotated on a crowded phone layout)", () => {
    expect(xAxis(long()).axisLabel.rotate).toBeUndefined();
    expect((buildEngineOption(long(), { ...ctx, compact: true }) as unknown as { xAxis: Axis }).xAxis.axisLabel.rotate).toBe(45);
  });
});

describe("21A1-RB6/RB7 the data table: the right header and every unit", () => {
  it("horizontal bars head the first column with the CATEGORY axis (y), not the value axis", () => {
    const t = chartDataTable(canon({ ...horizontalStackedBar(), yAxis: { label: "Region" } }));
    expect(t.columns[0]).toBe("Region");
    expect(chartDataTable(canon(horizontalStackedBar())).columns[0]).toBe("الفئة");
  });
  it("value columns carry their unit (bar, combo secondary axis, scatter, histogram, box plot, heat map); the heat-map corner has a header", () => {
    expect(chartDataTable(canon(rainfallBar())).columns).toEqual(["الشهر", labelWithUnit("الهطول", "mm")]);
    expect(chartDataTable(canon(comboChart())).columns).toEqual(["الفئة", "المبيعات", labelWithUnit("الهامش %", "%")]);
    expect(chartDataTable(canon({ ...scatterChart(), xAxis: { label: "الطول", unit: "cm" }, yAxis: { label: "الكتلة", unit: "kg" } })).columns.slice(2)).toEqual([labelWithUnit("الطول", "cm"), labelWithUnit("الكتلة", "kg")]);
    expect(chartDataTable(canon({ ...histogramChart(), xAxis: { label: "الدرجة", unit: "نقطة" } })).columns[0]).toBe(labelWithUnit("الدرجة", "نقطة"));
    const heat = chartDataTable(canon(heatmapChart()));
    expect(heat.columns).toEqual(["الصف", labelWithUnit("صباحًا", "زيارة"), labelWithUnit("مساءً", "زيارة")]);
    expect(heat.columns.every(c => c.trim() !== "")).toBe(true);
    expect(chartDataTable(canon(stackedArea())).columns.slice(1)).toEqual([labelWithUnit("شمسية", "GWh"), labelWithUnit("رياح", "GWh")]);
  });
  it("an unlabelled scatter point is named by its coordinates in the table, exactly as in the selection list", () => {
    const rows = chartDataTable(canon(scatterChart())).rows.map(r => r.header);
    expect(rows.slice(0, 3)).toEqual(["(150، 45)", "(170، 60)", "(160، 52)"]);
  });
});

describe("21A1-RB8 range selection keeps its anchor in both directions", () => {
  const o = ["a", "b", "c", "d", "e", "f"];
  it("trimmed to the bound FROM the anchor, forwards and backwards", () => {
    expect(nextChartSelection("range", o, ["a"], "e", 3)).toEqual(["a", "b", "c"]);
    expect(nextChartSelection("range", o, ["f"], "b", 3)).toEqual(["d", "e", "f"]);
    expect(nextChartSelection("range", o, ["f"], "d", 3)).toEqual(["d", "e", "f"]);
    expect(nextChartSelection("range", o, ["c"], "a", 5)).toEqual(["a", "b", "c"]);
  });
});

describe("21A1-RB9 a histogram's x axis has no bounds (the bins fix its extent)", () => {
  it("min / max on the histogram x axis are refused; label and unit stay; the y axis keeps its bounds", () => {
    expect(codes({ ...histogramChart(), xAxis: { label: "الدرجة", min: 10, max: 30 } })).toContain("CHART_UNKNOWN_KEY");
    expect(canon({ ...histogramChart(), xAxis: { label: "الدرجة", unit: "نقطة" } }).kind).toBe("histogram");
    expect(canon({ ...histogramChart(), yAxis: { label: "عدد", min: 0, max: 20 } }).kind).toBe("histogram");
  });
});

describe("21A1-RB10 kind conversions carry what the target can hold and report what it cannot", () => {
  it("bar → pie keeps the unit and is lossy because of the reference line and the axis labels", () => {
    const r = convertChartKind(canon(rainfallBar()), "pie");
    expect(r.lossy).toBe(true);
    expect((r.spec as { unit?: string }).unit).toBe("mm");
    expect(validateChartSpec(r.spec).ok).toBe(true);
    const plain = canon({ ...without(rainfallBar(), "referenceLines", "xAxis"), yAxis: { unit: "mm" } });
    const p = convertChartKind(plain, "pie");
    expect([p.lossy, (p.spec as { unit?: string }).unit]).toEqual([false, "mm"]);
  });
  it("bar → heat map keeps the category label, the unit and value labels; dropping reference lines / a value-axis label is lossy", () => {
    const r = convertChartKind(canon({ ...rainfallBar(), valueLabels: true }), "heatmap");
    expect(r.lossy).toBe(true);
    expect(r.spec).toMatchObject({ kind: "heatmap", unit: "mm", valueLabels: true, xAxis: { label: "الشهر" } });
    expect(validateChartSpec(r.spec).ok).toBe(true);
    expect(convertChartKind(canon({ ...without(rainfallBar(), "referenceLines"), yAxis: { unit: "mm" } }), "heatmap").lossy).toBe(false);
  });
  it("pie → bar and heat map → bar put the unit on the value axis; a heat map row-axis label has no place (lossy)", () => {
    const pie = convertChartKind(canon(donutChart()), "bar");
    expect([(pie.spec as CategoryChartSpec).yAxis?.unit, pie.lossy]).toEqual(["%", false]);
    const heat = convertChartKind(canon(heatmapChart()), "bar");
    expect([(heat.spec as CategoryChartSpec).yAxis?.unit, heat.lossy]).toEqual(["زيارة", false]);
    expect(convertChartKind(canon({ ...heatmapChart(), yAxis: { label: "اليوم" } }), "bar").lossy).toBe(true);
    for (const r of [pie, heat]) expect(validateChartSpec(r.spec).ok).toBe(true);
  });
  it("bar → radar is lossy when it drops a unit, labels or reference lines", () => {
    expect(convertChartKind(canon(rainfallBar()), "radar").lossy).toBe(true);
  });
});

describe("21A1-RB13 heat map: a readable scale and readable value labels", () => {
  it("the colour scale names its lowest and highest value with the unit", () => {
    const o = buildEngineOption(canon(heatmapChart()), ctx) as unknown as { visualMap: { text: string[] } };
    expect(o.visualMap.text).toEqual([valueText(9, "زيارة"), valueText(2, "زيارة")]);
  });
  it("at EVERY point of the scale the value label reaches 4.5:1 against its background (the cell, or its halo)", () => {
    for (let i = 0; i <= 100; i++) {
      const bg = heatColorAt(i / 100), l = labelOn(bg);
      expect(contrastRatio(l.color, l.halo ?? bg), i + " " + bg).toBeGreaterThanOrEqual(4.5);
    }
    expect(heatColorAt(0)).toBe("#DBEAFE");
    expect(heatColorAt(1)).toBe("#1E3A8A");
    expect(labelOn(heatColorAt(0.55)).halo).toBeDefined();
  });
  it("the adapter draws a mid-scale cell label with its halo", () => {
    const spec = canon({ ...heatmapChart(), valueLabels: true, values: [[0, 100], [55, null], [20, 80]] });
    const o = buildEngineOption(spec, ctx) as unknown as { series: { data: { value: number[]; label: { color: string; textBorderColor?: string } }[] }[] };
    const mid = o.series[0].data.find(d => d.value[2] === 55)!;
    expect(mid.label.textBorderColor).toBeDefined();
    expect(contrastRatio(mid.label.color, mid.label.textBorderColor!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("21A1-RB15 wording", () => {
  it("the structural summary counts in Arabic (1 واحدة, 2 dual, 3–10 plural, 11+ singular)", () => {
    expect(chartSummary(canon(rainfallBar()))).toBe("رسم بالأعمدة — 12 فئة، سلسلة واحدة");
    expect(chartSummary(canon(horizontalStackedBar()))).toBe("رسم بالأشرطة الأفقية — فئتان، سلسلتان، مكدّسة");
    expect(chartSummary(canon(temperatureLine()))).toBe("رسم خطي — 5 فئات، سلسلتان");
    expect(chartSummary(canon(donutChart()))).toBe("رسم حلقي — 3 شرائح");
  });
});

describe("21A1-RB1/RB11/RB12 source pins", () => {
  it("print: the picture flows and the SVG scales to the printed column (fluid engine box, SVG with a viewBox); the engine draws at the print width", () => {
    const css = read("src/charts/charts.css");
    const print = css.slice(css.indexOf("@media print"));
    expect(print).toContain(".xp-chart-stage{ overflow:visible; block-size:auto !important; }");
    expect(print).toContain(".xp-chart-host > div{ position:relative !important; inline-size:auto !important; block-size:auto !important; overflow:visible !important; }");
    expect(print).toContain(".xp-chart-host svg{ position:static !important; display:block; inline-size:auto !important; max-inline-size:100%; block-size:auto !important; }");
    expect(read("src/charts/echartsEngine.ts")).toContain('svg.setAttribute("viewBox", "0 0 " + w + " " + h);');
  });
  it("review: a review mark replaces the selected tick (an incorrect selection never shows ✓)", () => {
    expect(read("src/charts/charts.css")).toContain('.xp-chart-option[data-xp-review]::before{ content:none; }');
  });
  it("the bundle guard recognises the chart editor; every chart editor edge is a literal lazy import", () => {
    expect(read("scripts/check-bundle-budget.mjs")).toMatch(/const DATA_CHART_SIGNATURES = \[[^\]]*"data-xp-chart-editor"/);
    expect(read("src/charts/ChartEditor.tsx")).toContain('data-xp-chart-editor="v1"');
    expect(read("src/richContent/RichContentEditor.tsx")).toContain('const ChartEditor = lazy(() => import("../charts/ChartEditor"));');
    expect(read("src/questionTypes/editors/ChartSelectionEditor.tsx")).not.toMatch(/^import (?!type )[^;]*["'][./]*richContent\/RichContentEditor["']/m);
  });
});
