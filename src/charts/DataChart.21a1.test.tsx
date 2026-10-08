// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import { useState } from "react";
import fs from "node:fs";
import path from "node:path";
import { validateChartSpec, type CategoryChartSpec, type ChartSpecV1 } from "./chartSpec";
import type { EngineEvent } from "./echartsEngine";
import type { EngineOption } from "./echartsAdapter";
import { donutChart, heatmapChart, rainfallBar, scatterChart, temperatureLine } from "./testing/chartFixtures";

// Phase 21A.1 — the lazy DataChart component with a FAKE engine (the real engine is exercised in the browser certification). Pins: the
// accessible figure, lazy engine / advanced chunk loading, one instance per chart with disposal (also for a load that resolves after unmount),
// the text tooltip, the keyboard selection list and pointer selection (same semantic keys), the data table, the animation policy, the
// width-only resize path, and the failure fallback.
const engine = vi.hoisted(() => ({
  mounts: [] as { el: HTMLElement; options: Record<string, unknown>[]; emit: (e: { type: string; componentType?: string; seriesIndex?: number; dataIndex?: number; offsetX?: number; offsetY?: number }) => void; disposed: number; resized: number }[],
  advancedLoads: 0,
  fail: false
}));
vi.mock("./echartsEngine", () => ({
  CHART_ENGINE_MARKER: "xp-chart-engine-v1",
  mountChartEngine: (el: HTMLElement, option: Record<string, unknown>, onEvent: (e: EngineEvent) => void) => {
    if (engine.fail) throw new Error("engine unavailable");
    const m = { el, options: [option], emit: (e: EngineEvent) => onEvent(e), disposed: 0, resized: 0 };
    engine.mounts.push(m as never);
    el.setAttribute("data-xp-engine", "xp-chart-engine-v1");
    return { update: (o: Record<string, unknown>) => m.options.push(o), resize: () => { m.resized++; }, dispose: () => { m.disposed++; }, disposed: () => m.disposed > 0 };
  }
}));
vi.mock("./echartsAdvanced", () => { engine.advancedLoads++; return { CHART_ADVANCED_MARKER: "xp-chart-advanced-v1" }; });
import DataChart, { type ChartSelectionSurface } from "./DataChart";

const canon = (c: ChartSpecV1) => { const r = validateChartSpec(c); if (!r.ok) throw new Error("fixture"); return r.value; };
const settle = () => act(() => new Promise<void>(r => setTimeout(r, 0)));
const last = () => engine.mounts[engine.mounts.length - 1];
const lastOption = () => last().options[last().options.length - 1] as EngineOption & { animation?: boolean; series: { data: unknown[] }[] };
let mql: { matches: boolean; listeners: (() => void)[] }[] = [];
beforeEach(() => {
  engine.mounts.length = 0; engine.fail = false;
  mql = [];
  vi.stubGlobal("matchMedia", (q: string) => { const m = { media: q, matches: false, listeners: [] as (() => void)[], addEventListener: (_: string, f: () => void) => m.listeners.push(f), removeEventListener: () => {} }; mql.push(m); return m; });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Selectable({ spec, ...sel }: { spec: ChartSpecV1 } & Omit<ChartSelectionSurface, "value" | "onChange">) {
  const [value, setValue] = useState<string[]>([]);
  return <><DataChart spec={spec} selection={{ ...sel, value, onChange: setValue }} /><output data-testid="value">{value.join(",")}</output></>;
}

describe("21A1-DC1 accessible figure", () => {
  it("a figure named by the chart title and described by its description and structural summary; the picture is hidden from AT; no generic 'chart' label", async () => {
    render(<DataChart spec={canon(rainfallBar())} />);
    await settle();
    const fig = screen.getByRole("figure", { name: "الهطول الشهري — 2020" });
    const described = fig.getAttribute("aria-describedby")!.split(" ").map(id => document.getElementById(id)!.textContent);
    expect(described).toEqual(["كمية الأمطار الشهرية بالملّيمتر في عام 2020 (بيانات توضيحية).", "رسم بالأعمدة — 12 فئات، 1 سلسلة"]);
    expect(fig.querySelector(".xp-chart-stage")!.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector("[aria-label='chart'],[aria-label='Chart'],[aria-label='رسم بياني']")).toBeNull();
    expect(fig.textContent).toContain("المصدر: بيانات توضيحية لأغراض التعلّم");
  });
  it("the data table is generated from the spec: hidden until asked for, one header row, one row header per category, missing values marked (not 0)", async () => {
    render(<DataChart spec={canon(temperatureLine())} />);
    await settle();
    const toggle = screen.getByRole("button", { name: "عرض البيانات كجدول" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector(".xp-chart-table-wrap")!.hasAttribute("hidden")).toBe(true);
    fireEvent.click(toggle);
    const region = screen.getByRole("region", { name: "بيانات: Temperature over a week" });
    const table = within(region).getByRole("table");
    expect(within(table).getAllByRole("columnheader").map(h => h.textContent)).toEqual(["Day", "Max °C", "Min °C"]);
    expect(within(table).getAllByRole("rowheader").map(h => h.textContent)).toEqual(["MON", "TUE", "WED", "THU", "FRI"]);
    const wed = within(table).getAllByRole("row")[3];
    expect(wed.textContent).toBe("WED— (لا قيمة)11");
  });
  it("legend entries are ExamBank text with the series colour; a single-series chart shows no legend", async () => {
    const { unmount } = render(<DataChart spec={canon(temperatureLine())} />);
    await settle();
    expect(within(screen.getByRole("list", { name: "مفتاح الرسم" })).getAllByRole("listitem").map(l => l.textContent)).toEqual(["Max °C", "Min °C"]);
    unmount();
    render(<DataChart spec={canon(rainfallBar())} />);
    await settle();
    expect(screen.queryByRole("list", { name: "مفتاح الرسم" })).toBeNull();
  });
});

describe("21A1-DC2 lazy engine lifecycle", () => {
  it("mounts ONE engine instance with the adapter's option; common kinds never load the advanced chunk; advanced kinds do", async () => {
    const before = engine.advancedLoads;
    render(<DataChart spec={canon(rainfallBar())} />);
    expect(document.querySelector("[data-xp-chart-state]")!.getAttribute("data-xp-chart-state")).toBe("loading");
    await settle();
    expect(engine.mounts).toHaveLength(1);
    expect(document.querySelector("[data-xp-chart-state]")!.getAttribute("data-xp-chart-state")).toBe("ready");
    expect(lastOption().series[0].data).toHaveLength(12);
    expect(engine.advancedLoads).toBe(before);
    cleanup();
    render(<DataChart spec={canon(heatmapChart())} />);
    await settle();
    expect(engine.advancedLoads).toBe(1);
    expect(document.querySelector(".xp-chart-host")!.getAttribute("data-xp-engine-advanced")).toBe("xp-chart-advanced-v1");
  });
  it("disposes the instance on unmount; a load that resolves AFTER unmount never mounts", async () => {
    const { unmount } = render(<DataChart spec={canon(rainfallBar())} />);
    await settle();
    const m = last();
    unmount();
    expect(m.disposed).toBe(1);
    const count = engine.mounts.length;
    const r2 = render(<DataChart spec={canon(rainfallBar())} />);
    r2.unmount();                                                                                     // before the dynamic import resolves
    await settle();
    expect(engine.mounts.length).toBe(count);
  });
  it("a data change updates the same instance (no re-mount); switching to an advanced kind replaces it (the old one is disposed)", async () => {
    const { rerender } = render(<DataChart spec={canon(rainfallBar())} />);
    await settle();
    const first = last();
    rerender(<DataChart spec={canon(temperatureLine())} />);
    await settle();
    expect(engine.mounts).toHaveLength(1);
    expect((first.options[first.options.length - 1] as { series: unknown[] }).series).toHaveLength(2);
    rerender(<DataChart spec={canon(heatmapChart())} />);
    await settle();
    expect(first.disposed).toBe(1);
    expect(engine.mounts).toHaveLength(2);
  });
  it("an engine failure shows the classified fallback with the data table open and a retry that mounts on success", async () => {
    engine.fail = true;
    render(<DataChart spec={canon(rainfallBar())} />);
    await settle();
    expect(document.querySelector("[data-xp-chart-state]")!.getAttribute("data-xp-chart-state")).toBe("error");
    expect(screen.getByRole("status").textContent).toContain("تعذّر عرض الرسم البياني");
    expect(document.querySelector(".xp-chart-table-wrap")!.hasAttribute("hidden")).toBe(false);
    engine.fail = false;
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await settle();
    expect(document.querySelector("[data-xp-chart-state]")!.getAttribute("data-xp-chart-state")).toBe("ready");
    expect(engine.mounts).toHaveLength(1);
  });
});

describe("21A1-DC3 tooltip, animation, resize", () => {
  it("hover shows an ExamBank TEXT tooltip (title + lines) positioned inside the stage; leaving clears it; author text is never parsed as markup", async () => {
    const spec = rainfallBar() as CategoryChartSpec;
    spec.categories[9].label = "أكتوبر &amp; {b}";
    render(<DataChart spec={canon(spec)} />);
    await settle();
    act(() => last().emit({ type: "over", componentType: "series", seriesIndex: 0, dataIndex: 9, offsetX: 40, offsetY: 30 }));
    const tip = document.querySelector(".xp-chart-tip")!;
    expect(tip.textContent).toBe("أكتوبر &amp; {b}الهطول: 135 mm");
    expect(Array.from(tip.querySelectorAll("*")).every(e => e.tagName === "SPAN")).toBe(true);
    act(() => last().emit({ type: "out" }));
    expect(document.querySelector(".xp-chart-tip")).toBeNull();
    act(() => last().emit({ type: "over", componentType: "series", seriesIndex: 0, dataIndex: 2, offsetX: 1, offsetY: 1 }));
    fireEvent.mouseLeave(document.querySelector(".xp-chart-stage")!);
    expect(document.querySelector(".xp-chart-tip")).toBeNull();
  });
  it("the spec's animation is honoured; reduced motion forces none", async () => {
    const { unmount } = render(<DataChart spec={canon(rainfallBar())} />);
    await settle();
    expect(lastOption().animation).toBe(true);
    unmount();
    vi.stubGlobal("matchMedia", (q: string) => ({ media: q, matches: q.includes("reduce"), addEventListener: () => {}, removeEventListener: () => {} }));
    render(<DataChart spec={canon(rainfallBar())} />);
    await settle();
    expect(lastOption().animation).toBe(false);
    expect(document.querySelector("figure")!.getAttribute("data-xp-animation")).toBe("none");
  });
  it("width changes are observed (one measurement per frame) and resize the instance; a phone width switches to the compact layout; the observer is disconnected on unmount", async () => {
    const ros: { cb: () => void; on: boolean }[] = [];
    vi.stubGlobal("ResizeObserver", class { o = { cb: () => {}, on: false }; constructor(cb: () => void) { this.o.cb = cb; ros.push(this.o); } observe() { this.o.on = true; } disconnect() { this.o.on = false; } });
    let width = 900;
    const proto = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return (this as HTMLElement).classList.contains("xp-chart-stage") ? width : 0; } });
    try {
      const { unmount } = render(<DataChart spec={canon(rainfallBar())} />);
      await settle();
      const fig = document.querySelector("figure")!;
      expect(fig.getAttribute("data-xp-compact")).toBe("false");
      expect((document.querySelector(".xp-chart-stage") as HTMLElement).style.height).toBe("340px");
      width = 360;
      act(() => { ros[0].cb(); ros[0].cb(); });
      await act(() => new Promise<void>(r => requestAnimationFrame(() => r())));
      await settle();
      expect(fig.getAttribute("data-xp-compact")).toBe("true");
      expect((document.querySelector(".xp-chart-stage") as HTMLElement).style.height).toBe("320px");
      expect(last().resized).toBeGreaterThanOrEqual(1);
      const resizes = last().resized;
      act(() => ros[0].cb());                                                                         // same width → nothing
      await act(() => new Promise<void>(r => requestAnimationFrame(() => r())));
      expect(last().resized).toBe(resizes);
      unmount();
      expect(ros[0].on).toBe(false);
    } finally {
      if (proto) Object.defineProperty(HTMLElement.prototype, "clientWidth", proto);
    }
  });
});

describe("21A1-DC4 selection surface", () => {
  it("the keyboard list offers exactly the chart's targets; activation toggles aria-pressed, announces, and returns semantic keys", async () => {
    render(<Selectable spec={canon(rainfallBar())} kind="category" mode="multiple" max={3} label="اختر الأشهر" />);
    await settle();
    const group = screen.getByRole("group", { name: /اختر الأشهر/ });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map(b => b.textContent)).toEqual(["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]);
    fireEvent.click(buttons[9]);
    fireEvent.click(buttons[0]);
    expect(screen.getByTestId("value").textContent).toBe("jan,oct");
    expect(buttons[9].getAttribute("aria-pressed")).toBe("true");
    expect(group.querySelector("[aria-live]")!.textContent).toBe("تم تحديد: يناير — المحدَّد 2");
    fireEvent.click(buttons[9]);
    expect(screen.getByTestId("value").textContent).toBe("jan");
  });
  it("a pointer click on the picture selects the SAME semantic key; clicks that are not on a selectable datum do nothing", async () => {
    render(<Selectable spec={canon(scatterChart())} kind="point" mode="single" max={1} />);
    await settle();
    act(() => last().emit({ type: "click", componentType: "series", seriesIndex: 0, dataIndex: 3, offsetX: 5, offsetY: 5 }));
    expect(screen.getByTestId("value").textContent).toBe("out");
    act(() => last().emit({ type: "click", componentType: "series", seriesIndex: 0, dataIndex: 99 }));
    act(() => last().emit({ type: "click", componentType: "markLine", seriesIndex: 0, dataIndex: 0 }));
    expect(screen.getByTestId("value").textContent).toBe("out");
    const selectedOption = lastOption().series[0].data[3] as { itemStyle: { borderWidth: number } };
    expect(selectedOption.itemStyle.borderWidth).toBe(3);                                             // the picture shows the selection
  });
  it("range mode selects a contiguous run in chart order; read-only surfaces show marks and refuse changes", async () => {
    const { unmount } = render(<Selectable spec={canon(rainfallBar())} kind="category" mode="range" max={12} />);
    await settle();
    const btn = (name: string) => screen.getByRole("button", { name: new RegExp("^" + name) });
    fireEvent.click(btn("أكتوبر"));
    fireEvent.click(btn("يناير"));
    expect(screen.getByTestId("value").textContent).toBe("jan,feb,mar,apr,may,jun,jul,aug,sep,oct");
    unmount();
    const onChange = vi.fn();
    render(<DataChart spec={canon(donutChart())} selection={{ kind: "category", mode: "single", max: 1, value: ["edu"], readOnly: true, onChange, marks: { edu: "correct", health: "missed" } }} />);
    await settle();
    const edu = screen.getByRole("button", { name: /التعليم/ });
    expect(edu.hasAttribute("disabled")).toBe(true);
    expect(edu.textContent).toBe("التعليم — صحيح");
    expect(screen.getByRole("button", { name: /الصحة/ }).textContent).toBe("الصحة — لم يُحدَّد");
    act(() => last().emit({ type: "click", componentType: "series", seriesIndex: 0, dataIndex: 1 }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("21A1-DC5 source guards", () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, f), "utf8");
  it("the engine library is imported ONLY by the two lazy engine modules; the component reaches them only through dynamic import()", () => {
    const files = fs.readdirSync(__dirname).filter(f => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));
    const importers = files.filter(f => /from\s+["']echarts(\/|["'])/.test(read(f)));
    expect(importers.sort()).toEqual(["echartsAdvanced.ts", "echartsEngine.ts"]);
    const dc = read("DataChart.tsx");
    expect(dc).not.toMatch(/^import (?!type )[^;]*["']\.\/echarts(Engine|Advanced)["']/m);                     // type-only imports erase at build time
    expect(dc).toMatch(/import\("\.\/echartsEngine"\)/);
    expect(dc).toMatch(/import\("\.\/echartsAdvanced"\)/);
    expect(read("echartsEngine.ts")).toMatch(/renderer: "svg"/);
  });
  it("every chart surface is a literal lazy import; the bundle guard knows the chart / engine signatures and budgets; the initial budget is unchanged", () => {
    const root = (f: string) => fs.readFileSync(path.join(__dirname, "..", "..", f), "utf8");
    expect(root("src/richContent/RichContentRenderer.tsx")).toContain('const DataChart = lazy(() => import("../charts/DataChart"));');
    expect(root("src/questionTypes/studentRegistry.tsx")).toContain('registerStudentRenderer("chartSelection", 1, lazy(() => import("./student/ChartSelectionResponse")));');
    expect(root("src/questionTypes/authoringRegistry.tsx")).toContain('registerAuthoringEditor("chartSelection", 1, lazy(() => import("./editors/ChartSelectionEditor")));');
    const guard = root("scripts/check-bundle-budget.mjs");
    for (const s of ["xp-chart-table", "xp-chart-select", "chart-key-picker", "CHART_SELECTION_CHART_MISMATCH", "xp-chart-engine-v1", "xp-chart-advanced-v1", "_echarts_instance_"]) expect(guard).toContain('"' + s + '"');
    expect(guard).toMatch(/const DATA_CHART_SIGNATURES = \[/);
    expect(guard).toMatch(/staticClosure\(dist, portalChunks\)/);                                       // the Student Portal's static closure carries no chart code
    expect(guard).toMatch(/staticClosure\(dist, dataChartRoots\)/);                                     // the engine stays behind DataChart's import() edges
    expect(guard).toMatch(/CHART_ENGINE_GZIP_BUDGET_KB = 195;/);
    expect(guard).toMatch(/CHART_ADVANCED_GZIP_BUDGET_KB = 22;/);
    expect(guard).toMatch(/INITIAL_JS_GZIP_BUDGET_KB = 125;/);
    expect(read("echartsEngine.ts")).toContain('"xp-chart-engine-v1"');
    expect(read("echartsAdvanced.ts")).toContain('"xp-chart-advanced-v1"');
  });
  it("no rendering-library option can come from author data: the chart contract has no option / formatter / html key", () => {
    const spec = read("chartSpec.ts");
    for (const k of ["formatter", "option", "html", "graphic", "tooltip", "rich"]) expect(spec).not.toMatch(new RegExp('"' + k + '"'));
  });
});
