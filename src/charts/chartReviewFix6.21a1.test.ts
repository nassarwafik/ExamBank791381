import { describe, it, expect } from "vitest";
import { validateChartSpec, type ChartSpecV1 } from "./chartSpec";
import { buildEngineOption, widthLayout } from "./echartsAdapter";
import { defaultChartTokens } from "./chartTheme";
import { scatterChart } from "./testing/chartFixtures";

// Phase 21A.1 — Review Fix 6 (round-6 lane B R6B-1 … R6B-3, lane C C6-3 / C6-5): reference labels whose lines lie near each other are
// placed by a search — never below a line without room, never facing a neighbouring group's label, hidden when no place is free; a value
// axis reaches every reference line; a flat category label on a phone is capped by its slot. A deterministic fake measurement: 6 px per
// character.
const canon = (c: unknown) => { const r = validateChartSpec(c); if (!r.ok) throw new Error(JSON.stringify(r.issues)); return r.value as ChartSpecV1; };
const ISO = /[⁦-⁩]/g;
const measure = (t: string) => Array.from(t.replace(ISO, "")).length * 6;
const ctx = { tokens: defaultChartTokens(), animation: "none" as const, compact: false };
const build = (spec: ChartSpecV1, over: Record<string, unknown> = {}) => buildEngineOption(spec, { ...ctx, measure, ...over }) as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const cats = (n: number) => Array.from({ length: n }, (_, i) => ({ id: "c" + (i + 1), label: "الشهر " + (i + 1) }));
const barSpec = (values: number[], lines: { value: number; label: string }[], over: Record<string, unknown> = {}) => canon({ version: 1, id: "b", kind: "bar", title: "مبيعات", description: "مبيعات شهرية",
  categories: cats(values.length), series: [{ id: "s", label: "المبيعات", values }], ...(lines.length ? { referenceLines: lines.map((l, i) => ({ id: "r" + i, ...l })) } : {}), ...over });
const L = (...v: number[]) => v.map((value, i) => ({ value, label: "خط " + (i + 1) }));
const markOf = (o: Record<string, any>) => o.series.find((s: { markLine?: unknown }) => s.markLine).markLine; // eslint-disable-line @typescript-eslint/no-explicit-any
// a label's place, in the spec's order of the lines: the engine position, the outside alignment, "hidden", or "default" (no override)
const places = (o: Record<string, any>) => markOf(o).data.map((d: { label?: { show?: boolean; position?: string; verticalAlign?: string } }) => // eslint-disable-line @typescript-eslint/no-explicit-any
  d.label?.show === false ? "hidden" : d.label?.position ?? d.label?.verticalAlign ?? "default");
const texts = (o: Record<string, any>) => { const m = markOf(o); return m.data.map((_: unknown, i: number) => m.label.formatter({ dataIndex: i }) as string); }; // eslint-disable-line @typescript-eslint/no-explicit-any
const fixed = { yAxis: { label: "القيمة", min: 0, max: 100 } };

describe("21A1-RB40 near lines take free places only — never below a line without room, never facing the next group (round-6 finding R6B-1)", () => {
  it("three near lines at the axis foot (no line has room below): the highest above at the end, the next above at the start, the lowest hidden", () => {
    expect(places(build(barSpec([20, 40, 80], L(0.5, 2, 3.5)), { width: 600 }))).toEqual(["hidden", "insideStartTop", "insideEndTop"]);
  });
  it("four near lines at the foot: two labels shown above their lines, the two lowest hidden (their lines stay, named in the figure's text)", () => {
    const o = build(barSpec([20, 40, 80], L(0.5, 2, 3.5, 5)), { width: 600 });
    expect(places(o)).toEqual(["hidden", "hidden", "insideStartTop", "insideEndTop"]);
    expect(markOf(o).data).toHaveLength(4);
  });
  it("three near lines with room: the lowest below at the end, the middle above at the start, the highest above at the end", () => {
    expect(places(build(barSpec([20, 40, 80], L(50, 52, 54)), { width: 600 }))).toEqual(["insideEndBottom", "insideStartTop", "insideEndTop"]);
  });
  it("three near lines where only the lowest lacks room: the middle goes below at the end, the lowest above at the start (lane C C6-5)", () => {
    expect(places(build(barSpec([20, 40, 80], L(17, 19, 21)), { width: 600 }))).toEqual(["insideStartTop", "insideEndBottom", "insideEndTop"]);
  });
  it("a group whose low label faces the next line within two boxes joins it (62 / 60 above 48 on a fixed 0–100 axis)", () => {
    expect(places(build(barSpec([20, 40, 100], L(62, 60, 48), fixed), { width: 600 }))).toEqual(["insideEndTop", "insideStartTop", "insideEndBottom"]);
    expect(places(build(barSpec([20, 40, 100], L(64, 62, 50, 48), fixed), { width: 600 }))).toEqual(["insideEndTop", "insideStartTop", "insideStartBottom", "insideEndBottom"]);
  });
  it("outside labels at the axis foot: the margin beyond the plot has room below, so the lower line's label goes below there", () => {
    expect(places(build(barSpec([20, 40, 80], L(0.5, 2), { valueLabels: true }), { width: 600 }))).toEqual(["top", "bottom"]);
  });
  it("the group distance is one label box with its padding: 500 and 605 on a fixed 0–1000 axis are near, 500 and 610 are not (mutant X30)", () => {
    const axis = { yAxis: { label: "القيمة", min: 0, max: 1000 } };
    expect(places(build(barSpec([20, 40, 80], L(500, 590), axis), { width: 600 }))).toEqual(["insideEndBottom", "insideEndTop"]);
    expect(places(build(barSpec([20, 40, 80], L(500, 605), axis), { width: 600 }))).toEqual(["insideEndBottom", "insideEndTop"]);
    expect(places(build(barSpec([20, 40, 80], L(500, 610), axis), { width: 600 }))).toEqual(["default", "default"]);
  });
  it("scatter plots scale the distance to their data, not from 0: 104 and 107 over y 100–110 are apart, 104 and 105 are near (mutant X33)", () => {
    const sc = (lines: number[]) => canon({ ...scatterChart(), series: [{ id: "p", label: "ن", points: [100, 105, 110].map((y, i) => ({ id: "p" + i, x: i, y })) }],
      referenceLines: lines.map((value, i) => ({ id: "r" + i, value, label: "خط " + i })) });
    expect(places(build(sc([104, 107]), { width: 600 }))).toEqual(["default", "default"]);
    expect(places(build(sc([104, 105]), { width: 600 }))).toEqual(["insideEndBottom", "insideEndTop"]);
  });
  it("a group with a label at the start cuts each label to half the plot less 8 px (mutant X39)", () => {
    // at 360 px the plot's cut is 270–275 px (an 80-character line alone is cut to 270 px); half less 8 is 127–129 px: 21 characters (126 px)
    const long = (c: string) => c.repeat(80);
    expect(texts(build(barSpec([20, 40, 80], [{ value: 50, label: long("س") }]), { width: 360 })).map(measure)).toEqual([270]);
    expect(texts(build(barSpec([20, 40, 80], [{ value: 0.5, label: long("س") }, { value: 2, label: long("ص") }]), { width: 360 })).map(measure)).toEqual([126, 126]);
  });
  it("the label places alone change the width layout: horizontal bars at 480 and 1280 px, same label texts (mutant X35)", () => {
    const hb = (w: number) => build(barSpec([100, 140, 180], L(150, 160), { orientation: "horizontal" }), { width: w });
    expect(places(hb(480))).toEqual(["insideEndBottom", "insideEndTop"]);
    expect(places(hb(1280))).toEqual(["default", "default"]);
    expect(texts(hb(480))).toEqual(texts(hb(1280)));
    expect(widthLayout(hb(480) as never)).not.toBe(widthLayout(hb(1280) as never));
  });
});

describe("21A1-RB41 a value axis reaches every reference line (round-6 finding R6B-3)", () => {
  it("lines above the data: the axis ends at a rounded value just past the highest line (bars of 20–65, lines at 300 and 305 → 400)", () => {
    const o = build(barSpec([20, 40, 65], L(300, 305)), { width: 600 });
    expect([o.yAxis.min, o.yAxis.max]).toEqual([undefined, 400]);
    expect(build(barSpec([20, 40, 65], L(300, 305), { orientation: "horizontal" }), { width: 600 }).xAxis.max).toBe(400);
  });
  it("a line below 0: the axis starts at a rounded value just below it", () => {
    const o = build(barSpec([20, 40, 65], L(-30)), { width: 600 });
    expect([o.yAxis.min, o.yAxis.max]).toEqual([-40, undefined]);
  });
  it("lines within the data, and an author's fixed bound, leave the axis as it was", () => {
    const inside = build(barSpec([20, 40, 65], L(30)), { width: 600 });
    expect([inside.yAxis.min, inside.yAxis.max]).toEqual([undefined, undefined]);
    expect(build(barSpec([20, 40, 65], L(300), { yAxis: { label: "القيمة", max: 100 } }), { width: 600 }).yAxis.max).toBe(100);
  });
  it("scatter plots: y data 10–17 and lines at 100 / 101 → the axis ends at 120 (its data scale is kept below)", () => {
    const sc = canon({ ...scatterChart(), series: [{ id: "p", label: "ن", points: [10, 12, 17].map((y, i) => ({ id: "p" + i, x: i, y })) }],
      referenceLines: [{ id: "r0", value: 100, label: "أ" }, { id: "r1", value: 101, label: "ب" }] });
    const o = build(sc, { width: 600 });
    expect([o.yAxis.min, o.yAxis.max]).toEqual([undefined, 120]);
  });
});

describe("21A1-RB42 phones cap a flat category label by its slot; a named value axis with wide labels takes one more line (round-6 finding R6B-2)", () => {
  const dual = (named: boolean) => canon({ version: 1, id: "d", kind: "combo", title: "t", description: "d", valueLabels: true,
    categories: ["Q1", "Q2", "Q3", "Q4", "Q5"].map((l, i) => ({ id: "q" + i, label: l })), ...(named ? { yAxis: { label: "الإيراد" }, y2Axis: { label: "الربح" } } : {}),
    series: [{ id: "a", label: "A", mark: "bar", values: [12345678, 23456789, 34567890, 45678901, 56789012] }, { id: "b", label: "B", mark: "bar", values: [12345678, 23456789, 34567890, 45678901, 56789012] },
      { id: "c", label: "C", mark: "bar", axis: "secondary", values: [1234567, 2345678, 3456789, 4567890, 5678901] }] });
  it("two primary bars and a secondary one, 8-digit values, five quarters at 360 px: each flat label is cut to its slot, under the 64 px phone cap", () => {
    expect(build(dual(false), { width: 360, compact: true }).xAxis.axisLabel.width).toBe(36);
    expect(build(dual(false), { width: 320, compact: true }).xAxis.axisLabel.width).toBe(27);
  });
  it("named axes whose labels are wider than the name's gap: the name moves beyond the labels, so the slots narrow further", () => {
    expect(build(dual(true), { width: 360, compact: true }).xAxis.axisLabel.width).toBe(27);
    expect(build(dual(true), { width: 600 }).xAxis.axisLabel.width).toBe(73);
    expect(build(dual(false), { width: 600 }).xAxis.axisLabel.width).toBe(82);
  });
  it("a measured stage that the value axes fill: the rotated labels are thinned to the first, never all drawn as on an unmeasured stage", () => {
    const wide = canon({ version: 1, id: "w", kind: "combo", title: "t", description: "d", valueLabels: true, categories: cats(12),
      yAxis: { label: "الميزانية", unit: "د.ك" }, y2Axis: { label: "التغير", unit: "%" },
      series: [{ id: "a", label: "A", mark: "bar", values: Array.from({ length: 12 }, (_, i) => 1234567890 + i) }, { id: "b", label: "B", mark: "line", axis: "secondary", values: Array.from({ length: 12 }, (_, i) => -1234567.5 - i) }] });
    const o = build(wide, { width: 200, compact: true });
    expect(o.xAxis.axisLabel.rotate).toBe(45);
    expect(o.xAxis.axisLabel.interval).toBe(11);
    expect(build(wide, { compact: true }).xAxis.axisLabel.interval).toBe(0);                            // unmeasured: every label, estimated
  });
  it("three grouped series step the value axis further than one or two (the 0.4 bar-gap share; mutant X34)", () => {
    const g = (n: number) => canon({ version: 1, id: "g", kind: "bar", title: "t", description: "d", valueLabels: true, categories: cats(6),
      series: ["a", "b", "c"].slice(0, n).map(id => ({ id, label: id, values: [1234567, 1234568, 1234569, 1234570, 1234571, 1234572] })) });
    expect([1, 2, 3].map(n => build(g(n), { width: 360, compact: true }).yAxis.axisLabel.margin)).toEqual([14, 14, 16]);
  });
});
