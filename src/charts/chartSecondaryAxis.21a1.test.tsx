// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import ChartEditor from "./ChartEditor";
import { validateChartSpec, type CategoryChartSpec, type ChartSpecV1 } from "./chartSpec";
import { buildEngineOption, tooltipFromEvent } from "./echartsAdapter";
import { convertChartKind } from "./chartEditing";
import { defaultChartTokens } from "./chartTheme";
import { comboChart } from "./testing/chartFixtures";

// Phase 21A.1 — the combo chart's SECONDARY value axis. A bar + line combo whose series have different units / scales (sales in units, a
// margin in %) drawn on ONE value axis flattens the small series into a line near zero — a misleading picture of the data. A combo series
// may be measured on a second, independently scaled axis (`axis: "secondary"`, with an optional `y2Axis` label / unit / bounds); the
// primary axis keeps at least one series, the grid and the reference lines. Absent `axis` = primary, so every earlier combo is unchanged.
vi.mock("./echartsEngine", () => ({ CHART_ENGINE_MARKER: "x", mountChartEngine: () => ({ update() {}, resize() {}, dispose() {}, disposed: () => false }) }));
vi.mock("./echartsAdvanced", () => ({ CHART_ADVANCED_MARKER: "y" }));
afterEach(cleanup);
const canon = (c: unknown) => { const r = validateChartSpec(c); if (!r.ok) throw new Error(JSON.stringify(r.issues)); return r.value as CategoryChartSpec; };
const codes = (c: unknown) => { const r = validateChartSpec(c); return r.ok ? [] : r.issues.map(i => i.code); };
const single = (): CategoryChartSpec => { const c = comboChart() as CategoryChartSpec; c.series = c.series.map(({ axis: _a, ...s }) => s); delete c.y2Axis; return c; };
const ctx = { tokens: defaultChartTokens(), animation: "none" as const, compact: false };
type Opt = { yAxis: unknown; series: { yAxisIndex?: number; markLine?: unknown }[] };

describe("21A1-AX1 contract", () => {
  it("a combo series may sit on the secondary axis, with an optional secondary axis label / unit / bounds; the canonical value keeps both", () => {
    const v = canon(comboChart());
    expect(v.series.map(s => s.axis ?? null)).toEqual([null, "secondary"]);
    expect(v.y2Axis).toEqual({ label: "الهامش", unit: "%" });
    const c = comboChart() as CategoryChartSpec;
    expect(canon({ ...c, series: c.series.map((s, i) => (i === 0 ? { ...s, axis: "primary" } : s)) }).series[0].axis).toBe("primary");
  });
  it("refusals: an unknown axis value, every series on the secondary axis, a secondary axis no series uses, bad bounds, and the keys outside combo", () => {
    const c = comboChart() as CategoryChartSpec;
    expect(codes({ ...c, series: [c.series[0], { ...c.series[1], axis: "right" }] })).toContain("CHART_ENUM_INVALID");
    expect(codes({ ...c, series: c.series.map(s => ({ ...s, axis: "secondary" })) })).toContain("CHART_AXIS_PRIMARY_EMPTY");
    expect(codes({ ...single(), y2Axis: { label: "x" } })).toContain("CHART_AXIS_UNUSED");
    expect(codes({ ...c, y2Axis: { min: 5, max: 5 } })).toContain("CHART_AXIS_RANGE");
    expect(codes({ ...c, y2Axis: { label: "<script>x</script>" } })).toContain("CHART_TEXT_MARKUP");
    expect(codes({ ...c, kind: "line", series: c.series.map(({ mark: _m, ...s }) => s) })).toContain("CHART_UNKNOWN_KEY");     // axis on a line series
    expect(codes({ ...single(), kind: "bar", series: single().series.map(({ mark: _m, ...s }) => s), y2Axis: { label: "x" } })).toContain("CHART_UNKNOWN_KEY");
  });
});

describe("21A1-AX2 adapter", () => {
  it("a dual-axis combo gets two value axes (the secondary on the other side, without its own grid lines) and each series its axis index", () => {
    const o = buildEngineOption(canon(comboChart()), ctx) as unknown as Opt & { yAxis: { name: string; position?: string; splitLine: { show?: boolean } }[] };
    expect(Array.isArray(o.yAxis)).toBe(true);
    expect(o.yAxis).toHaveLength(2);
    expect([o.yAxis[1].position, o.yAxis[1].splitLine.show]).toEqual(["right", false]);
    expect(o.yAxis[1].name).toContain("الهامش (\u2068%\u2069)");
    expect(o.series.map(s => s.yAxisIndex)).toEqual([0, 1]);
  });
  it("a single-axis combo is unchanged (one value axis, no axis index); reference lines are drawn by the first PRIMARY series", () => {
    const o = buildEngineOption(canon(single()), ctx) as unknown as Opt;
    expect(Array.isArray(o.yAxis)).toBe(false);
    expect(o.series.every(s => s.yAxisIndex === undefined)).toBe(true);
    const c = comboChart() as CategoryChartSpec;
    const flipped = canon({ ...c, series: [{ ...c.series[1] }, { ...c.series[0] }], referenceLines: [{ id: "goal", value: 110, label: "الهدف" }] });
    const f = buildEngineOption(flipped, ctx) as unknown as Opt;
    expect(f.series.map(s => s.yAxisIndex)).toEqual([1, 0]);
    expect(f.series.map(s => !!s.markLine)).toEqual([false, true]);
  });
  it("the tooltip uses each series' own axis unit", () => {
    const v = canon(comboChart());
    expect(tooltipFromEvent(v, { componentType: "series", seriesIndex: 1, dataIndex: 3 })).toEqual({ title: "الربع 4", lines: ["الهامش %: \u206618 %\u2069"] });
    expect(tooltipFromEvent(v, { componentType: "series", seriesIndex: 0, dataIndex: 3 })).toEqual({ title: "الربع 4", lines: ["المبيعات: \u2066150\u2069"] });
  });
});

describe("21A1-AX3 authoring", () => {
  it("leaving a dual-axis combo drops the axis assignment and the secondary axis and is reported lossy (the editor asks); values are kept", () => {
    const r = convertChartKind(canon(comboChart()), "line");
    expect(r.lossy).toBe(true);
    expect(JSON.stringify(r.spec)).not.toMatch(/"axis"|y2Axis/);
    expect((r.spec as CategoryChartSpec).series.map(s => s.values)).toEqual([[100, 120, 90, 150], [12, 15, 9, 18]]);
    expect(validateChartSpec(r.spec).ok).toBe(true);
    expect(convertChartKind(canon(single()), "line").lossy).toBe(false);
  });
  it("the editor sets a series' axis with a typed control; the secondary axis fields appear only while a series uses it, and vanish with it", () => {
    function Host({ onValue }: { onValue: (c: ChartSpecV1) => void }) {
      const [c, setC] = useState<ChartSpecV1>(canon(single()));
      return <ChartEditor chart={c} name="الرسم" onChange={n => { onValue(n); setC(n); }} />;
    }
    const box = { value: canon(single()) as ChartSpecV1 };
    render(<Host onValue={v => { box.value = v; }} />);
    expect(screen.queryByText("المحور الرأسي الثانوي")).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "محور السلسلة 2" }), { target: { value: "secondary" } });
    expect((box.value as CategoryChartSpec).series.map(s => s.axis ?? null)).toEqual([null, "secondary"]);
    expect(screen.getByText("المحور الرأسي الثانوي")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "وحدة المحور الرأسي الثانوي" }), { target: { value: "%" } });
    expect((box.value as CategoryChartSpec).y2Axis).toEqual({ unit: "%" });
    expect(validateChartSpec(box.value).ok).toBe(true);
    fireEvent.change(screen.getByRole("combobox", { name: "محور السلسلة 2" }), { target: { value: "primary" } });
    expect(JSON.stringify(box.value)).not.toMatch(/"axis"|y2Axis/);
    expect(validateChartSpec(box.value).ok).toBe(true);
    expect(screen.queryByText("المحور الرأسي الثانوي")).toBeNull();
  });
});
