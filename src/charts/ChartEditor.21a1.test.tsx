// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, act, fireEvent, screen, within } from "@testing-library/react";
import ChartEditor from "./ChartEditor";
import RichContentEditor from "../richContent/RichContentEditor";
import { validateRichContent, type RichContentV1 } from "../richContent/richContentModel";
import { validateChartSpec, type CategoryChartSpec, type ChartSpecV1 } from "./chartSpec";
import { RAINFALL_2020, rainfallBar, scatterChart } from "./testing/chartFixtures";

// Phase 21A.1 — the teacher's chart editor: typed controls only (no JSON, no engine options), a table-like grid, data never lost to a typo
// or to a compatible kind change, confirmed destructive conversions, and the rich-content integration (add, duplicate, preview).
vi.mock("./echartsEngine", () => ({ CHART_ENGINE_MARKER: "x", mountChartEngine: () => ({ update() {}, resize() {}, dispose() {}, disposed: () => false }) }));
vi.mock("./echartsAdvanced", () => ({ CHART_ADVANCED_MARKER: "y" }));
afterEach(cleanup);
const settle = async () => { for (let i = 0; i < 10; i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); }); };

function Host({ initial, onValue, confirm }: { initial: ChartSpecV1; onValue: (c: ChartSpecV1) => void; confirm?: () => Promise<boolean> }) {
  const [c, setC] = useState(initial);
  return <ChartEditor chart={c} name="الرسم" confirm={confirm} onChange={n => { onValue(n); setC(n); }} />;
}
const mount = (initial: ChartSpecV1 = rainfallBar(), confirm?: () => Promise<boolean>) => {
  const box = { value: initial };
  render(<Host initial={initial} onValue={v => { box.value = v; }} confirm={confirm} />);
  return box;
};
const cell = (name: string) => screen.getByRole("textbox", { name }) as HTMLInputElement;
const type = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });

describe("21A1-CE1 data grid", () => {
  it("is a table of typed fields: one row per category, one column per series; no JSON field and no engine vocabulary anywhere", () => {
    mount();
    const grid = within(screen.getByRole("group", { name: "بيانات الرسم" })).getByRole("table");
    expect(within(grid).getAllByRole("row")).toHaveLength(13);
    expect(document.body.textContent).not.toMatch(/echarts|option|formatter|JSON/i);
    expect(document.querySelector("textarea.rc-code, [contenteditable]")).toBeNull();
  });
  it("editing a cell stores a number; an empty cell stores a missing value (null, not 0); a typo is kept on screen, flagged, and never stored", () => {
    const box = mount();
    const may = cell("الهطول — مايو");
    type(may, "١٢٫٥");
    expect((box.value as CategoryChartSpec).series[0].values[4]).toBe(12.5);
    type(may, "");
    expect((box.value as CategoryChartSpec).series[0].values[4]).toBeNull();
    type(may, "12a");
    expect(may.value).toBe("12a");
    expect(may.getAttribute("aria-invalid")).toBe("true");
    expect((box.value as CategoryChartSpec).series[0].values[4]).toBeNull();
    type(may, "13");
    expect((box.value as CategoryChartSpec).series[0].values[4]).toBe(13);
    expect(may.getAttribute("aria-invalid")).toBeNull();
  });
  it("categories and series: add (fresh ids, missing values), reorder (values move with their category), remove; the result stays valid", () => {
    const box = mount();
    fireEvent.click(screen.getByRole("button", { name: "+ فئة" }));
    let c = box.value as CategoryChartSpec;
    expect(c.categories[12]).toEqual({ id: "c1", label: "الفئة 13" });
    expect(c.series[0].values[12]).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "+ سلسلة" }));
    c = box.value as CategoryChartSpec;
    expect(c.series[1]).toMatchObject({ id: "s1", label: "السلسلة 2" });
    expect(c.series[1].values).toEqual(Array(13).fill(null));
    fireEvent.click(screen.getByRole("button", { name: "تحريك الفئة 1 لأسفل" }));
    c = box.value as CategoryChartSpec;
    expect(c.categories.slice(0, 2).map(x => x.id)).toEqual(["feb", "jan"]);
    expect(c.series[0].values.slice(0, 2)).toEqual([95, 120]);
    fireEvent.click(screen.getByRole("button", { name: "حذف السلسلة 2" }));
    fireEvent.click(screen.getByRole("button", { name: "حذف الفئة 13" }));
    c = box.value as CategoryChartSpec;
    expect([c.series.length, c.categories.length]).toEqual([1, 12]);
    expect(validateChartSpec(c).issues).toEqual([]);
  });
  it("a duplicate label is flagged at the field and listed, while the typed text is kept", () => {
    const box = mount();
    type(cell("اسم الفئة 2"), "يناير");
    expect((box.value as CategoryChartSpec).categories[1].label).toBe("يناير");
    expect(cell("اسم الفئة 2").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("list", { name: "مشكلات بيانات الرسم" }).textContent).toContain("مكرّرة");
  });
  it("axes: a vertical bar's category axis takes only a label; the value axis takes label, unit, min and max; min ≥ max is flagged on both bounds", () => {
    const box = mount();
    expect(screen.queryByRole("textbox", { name: "وحدة المحور الأفقي" })).toBeNull();
    type(cell("أدنى قيمة على المحور الرأسي"), "200");
    type(cell("أعلى قيمة على المحور الرأسي"), "100");
    expect((box.value as CategoryChartSpec).yAxis).toEqual({ label: "الهطول", unit: "mm", min: 200, max: 100 });
    expect(cell("أدنى قيمة على المحور الرأسي").getAttribute("aria-invalid")).toBe("true");
    expect(cell("أعلى قيمة على المحور الرأسي").getAttribute("aria-invalid")).toBe("true");
    type(cell("أدنى قيمة على المحور الرأسي"), "");
    expect((box.value as CategoryChartSpec).yAxis).toEqual({ label: "الهطول", unit: "mm", max: 100 });
  });
});

describe("21A1-CE2 kind changes and options", () => {
  it("a compatible kind change keeps every value without asking; an incompatible one asks and a refusal changes nothing", async () => {
    const confirm = vi.fn(async () => false);
    const box = mount(rainfallBar(), confirm);
    fireEvent.change(screen.getByRole("combobox", { name: "نوع الرسم البياني — الرسم" }), { target: { value: "line" } });
    await settle();
    expect(confirm).not.toHaveBeenCalled();
    expect(box.value.kind).toBe("line");
    expect((box.value as CategoryChartSpec).series[0].values).toEqual(RAINFALL_2020);
    fireEvent.change(screen.getByRole("combobox", { name: "نوع الرسم البياني — الرسم" }), { target: { value: "scatter" } });
    await settle();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(box.value.kind).toBe("line");
  });
  it("orientation, stacking, legend, animation and palette are typed options mapped to closed vocabulary", () => {
    const box = mount();
    fireEvent.change(screen.getByRole("combobox", { name: "اتجاه الأعمدة — الرسم" }), { target: { value: "horizontal" } });
    expect(box.value).toMatchObject({ orientation: "horizontal", xAxis: { label: "الهطول", unit: "mm" }, yAxis: { label: "الشهر" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "مكدّس" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "مفتاح الرسم" }));
    fireEvent.change(screen.getByRole("combobox", { name: "حركة الرسم" }), { target: { value: "none" } });
    fireEvent.change(screen.getByRole("combobox", { name: "ألوان الرسم" }), { target: { value: "neutral" } });
    expect(box.value).toMatchObject({ stacked: true, legend: "none", animation: "none", palette: "neutral" });
    fireEvent.change(screen.getByRole("combobox", { name: "حركة الرسم" }), { target: { value: "subtle" } });
    expect("animation" in box.value).toBe(false);                                                     // the default is not stored
    expect(validateChartSpec(box.value).issues).toEqual([]);
  });
  it("scatter points: add / edit / remove inside each series; new point ids are unique across the chart", () => {
    const box = mount(scatterChart());
    fireEvent.click(screen.getByRole("button", { name: "+ سلسلة" }));
    fireEvent.click(screen.getAllByRole("button", { name: "+ نقطة" })[0]);
    const s = (box.value as Extract<ChartSpecV1, { kind: "scatter" }>).series;
    const ids = s.flatMap(x => x.points.map(p => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    type(screen.getAllByRole("textbox", { name: "y للنقطة 5" })[0], "-3.5");
    expect((box.value as Extract<ChartSpecV1, { kind: "scatter" }>).series[0].points[4].y).toBe(-3.5);
    expect(validateChartSpec(box.value).issues).toEqual([]);
  });
});

describe("21A1-CE3 rich-content integration", () => {
  function EditorHost({ onValue }: { onValue: (v: RichContentV1 | undefined) => void }) {
    const [value, setValue] = useState<RichContentV1 | undefined>(undefined);
    return <RichContentEditor value={value} onChange={next => { onValue(next); setValue(next); }} />;
  }
  it("'+ رسم بياني' adds a valid chart block, the lazy chart editor edits it, duplicating gives the copy a fresh chart id, and the preview renders it", async () => {
    const box: { value: RichContentV1 | undefined } = { value: undefined };
    render(<EditorHost onValue={v => { box.value = v; }} />);
    fireEvent.click(within(screen.getByRole("group", { name: "إضافة كتلة" })).getByRole("button", { name: "+ رسم بياني" }));
    await settle();
    expect(validateRichContent(box.value).issues).toEqual([]);
    expect(box.value!.blocks[0].type).toBe("dataChart");
    fireEvent.change(screen.getByRole("textbox", { name: "عنوان الكتلة 1" }), { target: { value: "الهطول" } });
    expect((box.value!.blocks[0] as { chart: ChartSpecV1 }).chart.title).toBe("الهطول");
    fireEvent.click(screen.getByRole("button", { name: "تكرار — الكتلة 1" }));
    await settle();
    const [a, b] = box.value!.blocks as { chart: ChartSpecV1 }[];
    expect(a.chart.id).not.toBe(b.chart.id);
    expect(validateRichContent(box.value).issues).toEqual([]);
    await settle();
    expect(document.querySelectorAll(".rc-preview figure.xp-chart").length).toBe(2);
  });
});
