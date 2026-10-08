import { describe, it, expect } from "vitest";
import { validateChartSpec, type CategoryChartSpec, type ChartSpecV1 } from "./chartSpec";
import { buildEngineOption, chartHeight, widthLayout } from "./echartsAdapter";
import { defaultChartTokens } from "./chartTheme";
import { donutChart, heatmapChart, horizontalStackedBar, rainfallBar } from "./testing/chartFixtures";

// Phase 21A.1 — Review Fix 3 (round-3 finding B3-2): when the host can measure text, labels are cut to their cap with REAL widths (the
// engine's own truncation estimates every non-Latin character as a wide glyph and cut Arabic labels to about half their cap).
const canon = (c: unknown) => { const r = validateChartSpec(c); if (!r.ok) throw new Error(JSON.stringify(r.issues)); return r.value as ChartSpecV1; };
const ISO = /[⁦-⁩]/g;
// a deterministic fake measurement: 6 px per character (Arabic letters are narrow; the engine estimated them like CJK, ≈ one em)
const measure = (t: string) => Array.from(t.replace(ISO, "")).length * 6;
const ctx = { tokens: defaultChartTokens(), animation: "none" as const, compact: false };
type Label = { width?: number; overflow?: string; formatter?: (v: string) => string };
const xLabel = (spec: ChartSpecV1, width: number, m?: typeof measure) => (buildEngineOption(spec, { ...ctx, width, ...(m ? { measure: m } : {}) }) as unknown as { xAxis: { axisLabel: Label; data: string[] } }).xAxis;
const longCats = (n: number, f: (i: number) => string) => (rainfallBar() as CategoryChartSpec).categories.slice(0, n).map((c, i) => ({ ...c, label: f(i + 1) }));

describe("21A1-RB18 measured label truncation (review fix 3, B3-2)", () => {
  it("a rotated Arabic label is cut to its 104 px cap by measurement (not to half of it); a label that fits is untouched", () => {
    const spec = canon({ ...rainfallBar(), categories: longCats(12, i => (i === 3 ? "مارس" : "المنطقة الشمالية الشرقية رقم " + i)) });
    const ax = xLabel(spec, 800, measure);
    expect(ax.axisLabel.width).toBe(104);                                             // the label box keeps the cap (the axis layout)…
    expect(ax.axisLabel.overflow).toBe("none");                                       // …but the engine's estimate never cuts again
    const out = ax.axisLabel.formatter!(ax.data[0]).replace(ISO, "");
    expect(out.endsWith("…")).toBe(true);
    expect(measure(out)).toBeLessThanOrEqual(104);
    expect(measure(out)).toBeGreaterThan(104 - 6 * 2);                                // as much as fits — not half
    expect(ax.axisLabel.formatter!(ax.data[2])).toBe(ax.data[2]);                     // "مارس" fits: unchanged, isolates included
  });
  it("a grapheme is never split (a letter keeps its harakat); a vertical category axis uses the 110 px cap", () => {
    const voweled = "مُحَافَظَةُ الفَرْوَانِيَّةِ الكُبْرَى";
    const spec = canon({ ...horizontalStackedBar(), categories: [{ id: "north", label: voweled }, { id: "south", label: "South" }] });
    const ax = (buildEngineOption(spec, { ...ctx, width: 800, measure }) as unknown as { yAxis: { axisLabel: Label; data: string[] } }).yAxis;
    expect([ax.axisLabel.width, ax.axisLabel.overflow]).toEqual([110, "none"]);
    const out = ax.axisLabel.formatter!(ax.data[0]).replace(ISO, "");
    expect(out.endsWith("…")).toBe(true);
    expect(/\p{M}/u.test(out.slice(0, -1)[0] ?? "")).toBe(false);
    expect(voweled.startsWith(out.slice(0, -1))).toBe(true);
    const cut = out.slice(0, -1), next = voweled.slice(cut.length, cut.length + 1);
    expect(/\p{M}/u.test(next)).toBe(false);                                           // the cut falls between clusters, never before a mark
  });
  it("a pie label cuts the NAME, never the value; without a measurer the engine truncates as before", () => {
    const pie = canon({ ...donutChart(), valueLabels: true, slices: [{ id: "a", label: "التعليم والتدريب المهني والتقني في المدارس", value: 40 }, { id: "b", label: "الصحة", value: 60 }] });
    const opt = buildEngineOption(pie, { ...ctx, width: 800, measure }) as unknown as { series: { label: { formatter: (p: { dataIndex: number }) => string; width?: number } }[] };
    const text = opt.series[0].label.formatter({ dataIndex: 0 }).replace(ISO, "");
    expect(text.endsWith("…: 40 % (40 %)")).toBe(true);
    expect(measure(text)).toBeLessThanOrEqual(140);
    expect([opt.series[0].label.width, (opt.series[0].label as { overflow?: string }).overflow]).toEqual([140, "none"]);
    const plain = buildEngineOption(pie, { ...ctx, width: 800 }) as unknown as { series: { label: { width?: number; overflow?: string } }[] };
    expect([plain.series[0].label.width, plain.series[0].label.overflow]).toEqual([140, "truncate"]);
    expect(xLabel(canon(rainfallBar()), 800).axisLabel).toMatchObject({ overflow: "truncate" });
  });
  it("the measured cap is part of the layout signature (a width change that moves the cap is applied)", () => {
    const spec = canon(rainfallBar());
    const a = buildEngineOption(spec, { ...ctx, width: 992, measure }), b = buildEngineOption(spec, { ...ctx, width: 1088, measure });
    expect(widthLayout(a)).not.toBe(widthLayout(b));
  });
});

describe("21A1-RB19 round-3 lane C pins (N5): vertical axes never rotate; value-axis widths count stacked totals and authored bounds", () => {
  const cats = (n: number) => Array.from({ length: n }, (_, i) => ({ id: "c" + (i + 1), label: "مدرسة الأحمدي " + (i + 1) }));
  const yLabel = (spec: ChartSpecV1, width: number, compact: boolean) => (buildEngineOption(spec, { ...ctx, compact, width }) as unknown as { yAxis: { axisLabel: { rotate?: number } } }).yAxis.axisLabel;
  it("horizontal bars: 20 categories at 1280 px and 12 on a phone keep flat labels (C3-31)", () => {
    const h = (n: number) => canon({ ...horizontalStackedBar(), categories: cats(n), series: [{ id: "s", label: "الطلاب", values: Array.from({ length: n }, (_, i) => i + 1) }] });
    expect(yLabel(h(20), 1280, false).rotate).toBeUndefined();
    expect(yLabel(h(12), 352, true).rotate).toBeUndefined();
  });
  const interval = (spec: ChartSpecV1, width: number) => (buildEngineOption(spec, { ...ctx, compact: true, width }) as unknown as { xAxis: { axisLabel: { interval: number | string } } }).xAxis.axisLabel.interval;
  const eight = (over: Record<string, unknown>) => { const { yAxis: _y, referenceLines: _r, ...rest } = rainfallBar() as CategoryChartSpec; return canon({ ...rest, categories: cats(8), ...over }); };
  it("a stacked axis is as wide as its TOTALS (\"1200\"), not its largest segment (\"600\") (C3-28)", () => {
    const six = Array.from({ length: 8 }, () => 600);
    expect(interval(eight({ stacked: true, series: [{ id: "a", label: "أ", values: six }, { id: "b", label: "ب", values: six }] }), 264)).toBeGreaterThanOrEqual(1);
    expect(interval(eight({ series: [{ id: "a", label: "أ", values: six }, { id: "b", label: "ب", values: six }] }), 264)).toBe(0);
  });
  it("an authored bound counts like a value (a max of 1,000,000 widens the axis) (C3-29)", () => {
    const small = [{ id: "a", label: "أ", values: Array.from({ length: 8 }, (_, i) => i + 1) }];
    expect(interval(eight({ series: small, yAxis: { max: 1000000 } }), 256)).toBeGreaterThanOrEqual(1);
    expect(interval(eight({ series: small }), 256)).toBe(0);
  });
});

describe("21A1-RB20 rotated labels keep one line box apart; the axis name and the heat-map rows make room for them (review fix 3, B3-6)", () => {
  type X = { nameGap: number; axisLabel: { interval: number | string; rotate?: number; width: number } };
  const x = (spec: ChartSpecV1, width: number, compact: boolean) => (buildEngineOption(spec, { ...ctx, compact, width }) as unknown as { xAxis: X }).xAxis;
  const months = () => canon(rainfallBar());
  it("the thinning step is computed (every (interval + 1)-th label), never left to the engine's estimate", () => {
    expect([240, 256, 384].map(w => x(months(), w, true).axisLabel.interval)).toEqual([2, 1, 0]);
    expect([288, 320, 480].map(w => x(months(), w, false).axisLabel.interval)).toEqual([2, 1, 0]);
  });
  it("a wider stage never shows fewer labels", () => {
    for (const compact of [true, false]) {
      let last = Infinity;
      for (let w = 200; w <= 800; w += 4) {
        const i = x(months(), w, compact).axisLabel.interval;
        expect(typeof i === "number" ? i : -1, compact + " " + w).toBeGreaterThanOrEqual(0);
        expect(i as number, compact + " " + w).toBeLessThanOrEqual(last);
        last = i as number;
      }
    }
  });
  it("the axis name sits below the rotated labels' reach (the longest label at its cap, at 45°) plus two lines", () => {
    const long = canon({ ...rainfallBar(), categories: longCats(12, i => "المنطقة الشمالية الشرقية رقم " + i) });
    expect(x(long, 1280, false).nameGap).toBe(106);   // ceil(104 × sin 45° + 24) + 8
    expect(x(long, 360, true).nameGap).toBe(76);      // ceil(64 × sin 45° + 22) + 8
    expect(x(months(), 360, true).nameGap).toBeLessThan(76);     // short labels reach less
    expect(x(months(), 1280, false).nameGap).toBe(30);           // flat labels: one line
  });
  it("heat-map columns share the width the ROW labels leave; long row labels thin or rotate the columns sooner", () => {
    const heat = (rowLabel: (i: number) => string) => canon({ ...heatmapChart(), columns: Array.from({ length: 8 }, (_, i) => ({ id: "k" + i, label: "الفترة " + (i + 1) })),
      rows: Array.from({ length: 4 }, (_, i) => ({ id: "r" + i, label: rowLabel(i + 1) })), values: Array.from({ length: 4 }, () => Array.from({ length: 8 }, (_, j) => j)) });
    const shortRows = x(heat(i => "ص" + i), 600, false), longRows = x(heat(i => "الصف الطويل جدًّا رقم " + i), 600, false);
    expect(shortRows.axisLabel.rotate).toBeUndefined();
    expect(longRows.axisLabel.rotate).toBe(45);
  });
  it("the heat-map height leaves room for rotated column labels below its rows (rows × 30 + 230, within 300…950)", () => {
    const rows = (n: number) => canon({ ...heatmapChart(), rows: Array.from({ length: n }, (_, i) => ({ id: "r" + i, label: "ص" + i })), values: Array.from({ length: n }, () => [1, 2]) });
    expect([1, 3, 10, 24].map(n => chartHeight(rows(n), false))).toEqual([300, 320, 530, 950]);   // 24 rows: the most a heat map holds
  });
});
