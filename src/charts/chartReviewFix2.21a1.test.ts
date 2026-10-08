import { describe, it, expect } from "vitest";
import { validateChartSpec, type CategoryChartSpec, type ChartSpecV1 } from "./chartSpec";
import { buildEngineOption } from "./echartsAdapter";
import { defaultChartTokens } from "./chartTheme";
import { comboChart, heatmapChart, horizontalStackedBar, rainfallBar } from "./testing/chartFixtures";

// Phase 21A.1 — Review Fix 2 (rendering lane): the category-axis layout rules behind the round-2 findings, pinned on the pure adapter.
const canon = (c: unknown) => { const r = validateChartSpec(c); if (!r.ok) throw new Error(JSON.stringify(r.issues)); return r.value; };
const ctx = { tokens: defaultChartTokens(), animation: "none" as const, compact: false };
type Axis = { axisLabel: { rotate?: number; width: number; interval: number | string } };
const axes = (spec: ChartSpecV1, width: number, compact = false) => buildEngineOption(spec, { ...ctx, compact, width }) as unknown as { xAxis: Axis; yAxis: Axis };
const without = (c: unknown, ...keys: string[]) => { const o = { ...(c as Record<string, unknown>) }; for (const k of keys) delete o[k]; return o; };
const twelve = (label: (i: number) => string) => (rainfallBar() as CategoryChartSpec).categories.map((c, i) => ({ ...c, label: label(i) }));

describe("21A1-RB5b a VERTICAL category axis is not capped by a horizontal slot (review fix 2, N-2)", () => {
  it("horizontal bars keep full-width labels (110) at 360, 600, 800 and 1280 px, never rotated", () => {
    const spec = canon({ ...horizontalStackedBar(), categories: twelve(i => "محافظة رقم " + (i + 1)), series: (horizontalStackedBar() as CategoryChartSpec).series.map(s => ({ ...s, values: Array.from({ length: 12 }, (_, i) => i + 1) })) });
    for (const w of [360, 600, 800, 1280]) {
      expect(axes(spec, w).yAxis.axisLabel.width, "width " + w).toBe(110);
      expect(axes(spec, w).yAxis.axisLabel.rotate, "width " + w).toBeUndefined();
    }
  });
  it("heat-map rows keep full-width labels; its columns (horizontal) still follow their slot", () => {
    const spec = canon({ ...heatmapChart(), rows: Array.from({ length: 10 }, (_, i) => ({ id: "r" + i, label: "الصف الطويل رقم " + (i + 1) })), values: Array.from({ length: 10 }, () => [1, 2]) });
    expect(axes(spec, 600).yAxis.axisLabel.width).toBe(110);
    expect(axes(spec, 600).xAxis.axisLabel.width).toBeLessThanOrEqual(110);
  });
});

describe("21A1-RB5c rotated labels that would still touch are thinned by the engine (review fix 2, N-7)", () => {
  const months = () => canon(rainfallBar());
  it("12 rotated labels on a very narrow phone stage: interval 'auto' (perpendicular gap under one line)", () => {
    const x = axes(months(), 256, true).xAxis.axisLabel;
    expect(x.rotate).toBe(45);
    expect(x.interval).toBe("auto");
  });
  it("the slot is what the VALUE AXES leave: a combo's two axes with wide values thin 8 rotated labels where one short axis would not", () => {
    const cats8 = twelve(i => "محافظة الفروانية " + (i + 1)).slice(0, 8);
    const combo = canon({ ...comboChart(), categories: cats8, series: [{ id: "a", label: "المبيعات", mark: "bar", values: cats8.map((_, i) => 150000 + i * 12345) }, { id: "b", label: "الهامش", mark: "line", axis: "secondary", values: cats8.map((_, i) => 10 + i) }], yAxis: { label: "المبيعات", unit: "KWD" }, y2Axis: { label: "الهامش", unit: "%" } });
    expect(axes(combo, 256, true).xAxis.axisLabel).toMatchObject({ rotate: 45, interval: "auto" });
    const single = canon({ ...rainfallBar(), categories: cats8, series: [{ id: "rain", label: "الهطول", values: cats8.map((_, i) => 100 + i) }] });
    expect(axes(single, 256, true).xAxis.axisLabel).toMatchObject({ rotate: 45, interval: 0 });
    expect(axes(combo, 288, true).xAxis.axisLabel).toMatchObject({ rotate: 45, interval: 0 });                 // 360 px phones: room again
  });
  it("an unnamed value axis takes the width of its widest value label (mutant RS33)", () => {
    const cats8 = twelve(i => "محافظة " + (i + 1)).slice(0, 8);
    const bar = (values: number[]) => canon({ ...without(rainfallBar(), "yAxis", "referenceLines"), categories: cats8, series: [{ id: "s", label: "القيمة", values }] });
    expect(axes(bar(cats8.map((_, i) => 1000000000 + i)), 224, true).xAxis.axisLabel).toMatchObject({ rotate: 45, interval: "auto" });   // "1000000007"
    expect(axes(bar(cats8.map((_, i) => i + 1)), 224, true).xAxis.axisLabel).toMatchObject({ rotate: 45, interval: 0 });               // "8"
  });
  it("where the rotated labels have room every label is drawn (interval 0)", () => {
    expect(axes(months(), 352, true).xAxis.axisLabel).toMatchObject({ rotate: 45, interval: 0 });
    const long = canon({ ...rainfallBar(), categories: twelve(i => "محافظة رقم " + (i + 1)) });
    expect(axes(long, 800).xAxis.axisLabel).toMatchObject({ rotate: 45, interval: 0 });
  });
});
