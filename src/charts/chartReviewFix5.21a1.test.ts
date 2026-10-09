import { describe, it, expect } from "vitest";
import { validateChartSpec, type ChartSpecV1 } from "./chartSpec";
import { buildEngineOption, chartHeight, referenceLinesText, widthLayout } from "./echartsAdapter";
import { defaultChartTokens } from "./chartTheme";
import { histogramChart, radarChart, rainfallBar, scatterChart } from "./testing/chartFixtures";

// Phase 21A.1 — Review Fix 5 (round-5 lane B / lane C): reference lines as figure text (B5-1), a pie label box that fits beside the pie
// (B5-2), the secondary axis's and the histogram's label gaps (B5-3 / B5-4), horizontal value axes that hide overlapping ticks (B5-6),
// reference labels cut to the plot and kept apart (B5-3 / B5-7), and the pins round 5 asked for (C5-6 / C5-7). A deterministic fake
// measurement: 6 px per character.
const canon = (c: unknown) => { const r = validateChartSpec(c); if (!r.ok) throw new Error(JSON.stringify(r.issues)); return r.value as ChartSpecV1; };
const ISO = /[⁦-⁩]/g;
const measure = (t: string) => Array.from(t.replace(ISO, "")).length * 6;
const ctx = { tokens: defaultChartTokens(), animation: "none" as const, compact: false };
const build = (spec: ChartSpecV1, over: Record<string, unknown> = {}) => buildEngineOption(spec, { ...ctx, measure, ...over }) as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const LONG = "متوسط المبيعات السنوي المستهدف للفروع الرئيسية";
const cats = (n: number) => Array.from({ length: n }, (_, i) => ({ id: "c" + (i + 1), label: "الشهر " + (i + 1) }));
const barSpec = (values: number[], lines: { value: number; label: string }[], over: Record<string, unknown> = {}) => canon({ version: 1, id: "b", kind: "bar", title: "مبيعات", description: "مبيعات شهرية",
  categories: cats(values.length), series: [{ id: "s", label: "المبيعات", values }], ...(lines.length ? { referenceLines: lines.map((l, i) => ({ id: "r" + i, ...l })) } : {}), ...over });
const numbered = (n: number) => Array.from({ length: n }, (_, i) => LONG.slice(0, 40) + " " + (i + 1));
const markOf = (o: Record<string, any>) => o.series.find((s: { markLine?: unknown }) => s.markLine).markLine; // eslint-disable-line @typescript-eslint/no-explicit-any
const refTexts = (o: Record<string, any>) => { const m = markOf(o); return m.data.map((_: unknown, i: number) => m.label.formatter({ dataIndex: i }) as string); }; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("21A1-RB26 the reference lines as text (round-5 finding B5-1)", () => {
  it("one line: «خط مرجعي:», its full label isolated and its value with the value axis's unit", () => {
    expect(referenceLinesText(canon(rainfallBar()))).toBe("خط مرجعي: ⁧عتبة 50 mm⁩: ⁦50 mm⁩");
  });
  it("several lines: «خطوط مرجعية:», each named in full, in the spec's order", () => {
    const spec = barSpec([10, 20, 30], [{ value: 25, label: LONG }, { value: 12.5, label: "Pass" }], { yAxis: { label: "المبيعات", unit: "د.ك" } });
    expect(referenceLinesText(spec)).toBe("خطوط مرجعية: ⁧" + LONG + "⁩: ⁦25⁩ د.ك؛ Pass: ⁦12.5⁩ د.ك");
  });
  it("horizontal bars take the unit of their horizontal value axis, scatter plots of the vertical one; charts without lines have none", () => {
    const hbar = barSpec([10, 20], [{ value: 15, label: "الهدف" }], { orientation: "horizontal", xAxis: { label: "القيمة", unit: "kg" }, yAxis: { label: "المدرسة" } });
    expect(referenceLinesText(hbar)).toBe("خط مرجعي: ⁧الهدف⁩: ⁦15 kg⁩");
    const scat = canon({ ...scatterChart(), referenceLines: [{ id: "r", value: 70, label: "حد" }] });
    expect(referenceLinesText(scat)).toBe("خط مرجعي: ⁧حد⁩: ⁦70 kg⁩");
    const { referenceLines: _drop, ...plain } = rainfallBar() as unknown as Record<string, unknown>;
    expect(_drop).toBeDefined();
    expect(referenceLinesText(canon(plain))).toBe("");
    expect(referenceLinesText(canon(histogramChart()))).toBe("");
  });
});

describe("21A1-RB27 a pie's label box fits beside the pie (round-5 finding B5-2)", () => {
  const pie = canon({ version: 1, id: "p", kind: "pie", title: "الطلاب", description: "توزيع", unit: "طالب وطالبة", valueLabels: true,
    slices: [{ id: "a", label: "المرحلة الابتدائية", value: 12500 }, { id: "b", label: "المرحلة المتوسطة", value: 9800 }, { id: "c", label: "رياض الأطفال", value: 4300 }] });
  it("at 480 px the box is the room beside the pie (half the stage − 68 % of half the shorter side − 12 − 8), never 140; every line fits it", () => {
    const o = build(pie, { width: 480 });
    const box = Math.floor(240 - 0.68 * Math.min(480, chartHeight(pie, false)) / 2 - 20);
    expect(o.series[0].label.width).toBe(box);
    expect(box).toBeLessThan(140);
    for (let i = 0; i < 3; i++) for (const line of (o.series[0].label.formatter({ dataIndex: i }) as string).split("\n")) expect(measure(line), line).toBeLessThanOrEqual(box);
  });
  it("wide stages (and an unmeasured one) keep the 140 px box; the box is part of the width layout", () => {
    expect(build(pie, { width: 640 }).series[0].label.width).toBe(140);
    expect(build(pie).series[0].label.width).toBe(140);
    expect(widthLayout(build(pie, { width: 480 }) as never)).not.toBe(widthLayout(build(pie, { width: 640 }) as never));
  });
});

describe("21A1-RB28 a secondary axis takes the value labels' gap itself (round-5 finding B5-3)", () => {
  const dual = (w: number, valueLabels = true) => build(canon({ version: 1, id: "d", kind: "combo", title: "t", description: "d", valueLabels, categories: cats(8),
    series: [{ id: "a", label: "الميزانية", mark: "bar", values: cats(8).map((_, i) => 12345678 + i) }, { id: "b", label: "الوحدات", mark: "line", axis: "secondary", values: cats(8).map((_, i) => 1234567 + i) }],
    yAxis: { label: "الميزانية" }, y2Axis: { label: "الوحدات" } }), { width: w, compact: w < 480 });
  it("the right margin is not widened beyond the secondary axis; its labels step away from the last value label instead", () => {
    const o = dual(320);
    expect(o.grid.right).toBe(12);
    expect(o.yAxis[1].axisLabel.margin).toBeGreaterThan(8);
    expect(o.yAxis[0].axisLabel.margin).toBe(o.yAxis[1].axisLabel.margin);
    expect(dual(320, false).yAxis[1].axisLabel.margin).toBeUndefined();
  });
  it("the secondary axis's gap is part of the width layout", () => {
    const o = dual(320);
    expect(widthLayout({ ...o, yAxis: [o.yAxis[0], { ...o.yAxis[1], axisLabel: { ...o.yAxis[1].axisLabel, margin: 8 } }] } as never)).not.toBe(widthLayout(o as never));
  });
});

describe("21A1-RB29 reference labels inside the plot are cut to it (round-5 findings B5-3 / B5-7)", () => {
  it("vertical charts: cut to the plot's width at a phone width (shorter than the stage less the axes), whole on a wide stage", () => {
    const spec = barSpec([10, 20, 30], [{ value: 25, label: LONG }]);
    const narrow = refTexts(build(spec, { width: 320, compact: true }))[0].replace(ISO, "");
    expect(narrow.endsWith("…")).toBe(true);
    expect(measure(narrow) + 8).toBeLessThanOrEqual(320 - 8 - 12 - 30);
    expect(refTexts(build(spec, { width: 1280 }))[0].replace(ISO, "")).toBe(LONG);
  });
  it("horizontal bars: a vertical line's label is cut to the plot's height (the stage less its margins and the value axis)", () => {
    const spec = barSpec([120, 150, 180], [{ value: 150, label: LONG }], { orientation: "horizontal" });
    const cut = refTexts(build(spec, { width: 600 }))[0].replace(ISO, "");
    expect(cut.endsWith("…")).toBe(true);
    expect(measure(cut) + 8).toBeLessThanOrEqual(chartHeight(spec, false) - 28 - 12 - 20);
  });
  it("scatter plots: cut to the plot's width", () => {
    const spec = canon({ ...scatterChart(), referenceLines: [{ id: "r", value: 70, label: LONG }] });
    const cut = refTexts(build(spec, { width: 360, compact: true }))[0].replace(ISO, "");
    expect(cut.endsWith("…")).toBe(true);
    expect(measure(cut) + 8).toBeLessThanOrEqual(360 - 12 - 12 - 30);
  });
  it("the cut labels are part of the width layout", () => {
    const spec = barSpec([10, 20, 30], [{ value: 25, label: LONG }]);
    expect(widthLayout(build(spec, { width: 320, compact: true }) as never)).not.toBe(widthLayout(build(spec, { width: 1280 }) as never));
  });
});

describe("21A1-RB30 lines whose labels could touch take different places (round-5 finding B5-7)", () => {
  const places = (o: Record<string, any>) => markOf(o).data.map((d: { label?: { position?: string; verticalAlign?: string } }) => d.label?.position ?? d.label?.verticalAlign ?? "default"); // eslint-disable-line @typescript-eslint/no-explicit-any
  it("two near lines inside the plot: the higher's label above it at the end, the lower's below it", () => {
    expect(places(build(barSpec([20, 40, 80], [{ value: 50, label: "عتبة" }, { value: 52, label: "متوسط" }]), { width: 600 }))).toEqual(["insideEndBottom", "insideEndTop"]);
  });
  it("lines far apart keep the single place (no override)", () => {
    expect(places(build(barSpec([20, 40, 80], [{ value: 10, label: "أدنى" }, { value: 70, label: "أعلى" }]), { width: 600 }))).toEqual(["default", "default"]);
  });
  it("near lines at the foot of the axis: no room below the lowest, so its label goes above it at the start; both are cut to half the plot", () => {
    const [a, b] = numbered(2);
    const o = build(barSpec([20, 40, 80], [{ value: 0.5, label: a }, { value: 2, label: b }]), { width: 600 });
    expect(places(o)).toEqual(["insideStartTop", "insideEndTop"]);
    for (const t of refTexts(o)) expect(measure(t) + 8).toBeLessThanOrEqual(300);
  });
  it("four near lines: end and start, above and below — highest at the end above, lowest at the end below; all cut to half the plot", () => {
    const l = numbered(4);
    const o = build(barSpec([40, 60, 90], [{ value: 60, label: l[0] }, { value: 61, label: l[1] }, { value: 63, label: l[2] }, { value: 64, label: l[3] }]), { width: 600 });
    expect(places(o)).toEqual(["insideEndBottom", "insideStartBottom", "insideStartTop", "insideEndTop"]);
    for (const t of refTexts(o)) expect(measure(t) + 8).toBeLessThanOrEqual(300);
  });
  it("outside labels (value labels on): two near lines' labels above and below their lines beyond the plot, each cut to the outside cap", () => {
    const [a, b] = numbered(2);
    const o = build(barSpec([1234567, 1333332, 1432097], [{ value: 1500000, label: a }, { value: 1520000, label: b }], { valueLabels: true }), { width: 600 });
    expect(places(o)).toEqual(["top", "bottom"]);
    expect(markOf(o).label.position).toBe("end");
    for (const t of refTexts(o)) expect(measure(t)).toBeLessThanOrEqual(120);
  });
  it("vertical lines (horizontal bars): the higher value's label right of its line (the engine's top side), the lower's left of it", () => {
    expect(places(build(barSpec([120, 150, 180], [{ value: 150, label: "أ" }, { value: 152, label: "ب" }], { orientation: "horizontal" }), { width: 600 }))).toEqual(["insideEndBottom", "insideEndTop"]);
  });
  it("an author's fixed axis decides the distance: 500 and 502 on 0–1000 are near, 500 and 700 are not; 50 and 52 lie at its foot", () => {
    const axis = { yAxis: { label: "القيمة", min: 0, max: 1000 } };
    expect(places(build(barSpec([20, 40, 80], [{ value: 500, label: "أ" }, { value: 502, label: "ب" }], axis), { width: 600 }))).toEqual(["insideEndBottom", "insideEndTop"]);
    expect(places(build(barSpec([20, 40, 80], [{ value: 500, label: "أ" }, { value: 700, label: "ب" }], axis), { width: 600 }))).toEqual(["default", "default"]);
    expect(places(build(barSpec([20, 40, 80], [{ value: 50, label: "أ" }, { value: 52, label: "ب" }], axis), { width: 600 }))).toEqual(["insideStartTop", "insideEndTop"]);
  });
});

describe("21A1-RB31 histograms take the value-label and rotated-label gaps (round-5 finding B5-4)", () => {
  const hist = (n: number, valueLabels: boolean) => canon({ ...histogramChart(), valueLabels, bins: Array.from({ length: n }, (_, i) => ({ id: "h" + i, start: i * 5, end: (i + 1) * 5, count: 12345 + i })) });
  it("a narrow stage: the value axis's labels step away from the first bin's value label", () => {
    expect(build(hist(10, true), { width: 360, compact: true }).yAxis.axisLabel.margin).toBeGreaterThan(8);
    expect(build(hist(10, false), { width: 1280 }).yAxis.axisLabel.margin).toBeUndefined();
  });
  it("rotated bin labels: the lowest value label steps 6 px away", () => {
    const o = build(hist(40, false), { width: 600 });
    expect(o.xAxis.axisLabel.rotate).toBe(45);
    expect(o.yAxis.axisLabel.margin).toBe(14);
  });
  it("the bins share the plot width left after the right margin and the left gap (lane C V17)", () => {
    const n = 10, w = 1280, o = build(hist(n, true), { width: w });
    const right = o.grid.right - 24, left = (o.yAxis.axisLabel.margin ?? 8) - 8;
    expect(o.xAxis.axisLabel.width).toBe(Math.max(24, Math.min(110, Math.floor((w - 96 - right - left) / n - 4))));
  });
});

describe("21A1-RB32 horizontal value axes hide overlapping ticks; their lowest label starts at the axis (round-5 finding B5-6)", () => {
  it("horizontal bars and scatter plots: hideOverlap and a left-aligned lowest label on the horizontal value axis; vertical value axes unchanged", () => {
    const hbar = build(barSpec([1234567, 1500000], [], { orientation: "horizontal" }));
    expect(hbar.xAxis.axisLabel).toMatchObject({ hideOverlap: true, alignMinLabel: "left" });
    const scat = build(canon(scatterChart()));
    expect(scat.xAxis.axisLabel).toMatchObject({ hideOverlap: true, alignMinLabel: "left" });
    expect(scat.yAxis.axisLabel.hideOverlap).toBeUndefined();
    expect(build(canon(rainfallBar())).yAxis.axisLabel.hideOverlap).toBeUndefined();
  });
});

describe("21A1-RB33 grouped columns: the outermost column's label is nearer the plot's edge (round-5 lane B, found verifying B5-3)", () => {
  it("three series side by side take a wider value-axis gap than one series with the same values", () => {
    const one = canon({ version: 1, id: "g", kind: "bar", title: "t", description: "d", valueLabels: true, categories: cats(6), series: [{ id: "a", label: "A", values: [1234567, 1234568, 1234569, 1234570, 1234571, 1234572] }] });
    const three = canon({ ...one, series: ["a", "b", "c"].map(id => ({ id, label: id, values: [1234567, 1234568, 1234569, 1234570, 1234571, 1234572] })) });
    const m1 = build(one, { width: 360, compact: true }).yAxis.axisLabel.margin ?? 8, m3 = build(three, { width: 360, compact: true }).yAxis.axisLabel.margin ?? 8;
    expect(m3).toBeGreaterThan(m1);
  });
});

describe("21A1-RB34 Review Fix 5 pins of round-5 lane C (C5-6 / C5-7)", () => {
  const pie = (unit: string) => canon({ version: 1, id: "p", kind: "pie", title: "t", description: "d", unit, valueLabels: true,
    slices: [{ id: "a", label: "المرحلة الابتدائية", value: 12500 }, { id: "b", label: "المرحلة المتوسطة", value: 9800 }, { id: "c", label: "المرحلة الثانوية", value: 7600 }, { id: "d", label: "رياض الأطفال", value: 4300 }] });
  const lab = (spec: ChartSpecV1, i = 0) => build(spec).series[0].label.formatter({ dataIndex: i }) as string;
  it("C5-6: a value that fits the box whole keeps its own left-to-right isolates on its line (never wrapped in a right-to-left one)", () => {
    const l = lab(pie("طالب"));
    expect(l.split("\n")).toHaveLength(2);
    expect(l.split("\n")[1]).toBe("⁦12500⁩ طالب (⁦36.5 %⁩)");
  });
  it("C5-6: a name left 26 px (under the 40 px minimum, over 20) takes the value to its own line", () => {
    const l = lab(pie("kg"));
    expect(140 - measure(": 12500 kg (36.5 %)")).toBe(26);
    expect(l.split("\n")).toHaveLength(2);
  });
  it("C5-7: without a canvas, the value labels' room is estimated at 0.6 em per character", () => {
    const spec = barSpec([1234567, 1500000], [], { orientation: "horizontal", valueLabels: true });
    const o = buildEngineOption(spec, ctx) as unknown as { grid: { right: number } };
    expect(o.grid.right).toBe(Math.ceil(7 * 12 * 0.6 + 6));
  });
  it("C5-7: without a canvas, an outside reference label takes 0.6 em per character of margin, up to its 120 px cap, and the engine truncates it", () => {
    const right = (label: string) => (buildEngineOption(barSpec([10, 20, 30], [{ value: 25, label }], { valueLabels: true }), ctx) as unknown as { grid: { right: number } }).grid.right;
    expect(right("x".repeat(15)) - right("x".repeat(5))).toBe(Math.ceil(10 * 12 * 0.6));
    expect(right("x".repeat(40))).toBe(right("x".repeat(60)));
    const m = markOf(buildEngineOption(barSpec([10, 20, 30], [{ value: 25, label: LONG }], { valueLabels: true }), ctx) as never);
    expect(m.data[0].label).toMatchObject({ width: 120, overflow: "truncate" });
  });
  it("C5-7: a radar on a very narrow stage keeps its names at least 24 px wide", () => {
    const r = canon({ ...radarChart(), axes: ["أ", "ب", "ج", "د", "ه"].map((label, i) => ({ id: "a" + i, label, max: 10 })), series: [{ id: "s", label: "س", values: [5, 5, 5, 5, 5] }] });
    expect(build(r, { width: 200, compact: true }).radar.axisName.width).toBe(24);
  });
});
