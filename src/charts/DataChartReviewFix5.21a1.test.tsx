// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { validateChartSpec, type CategoryChartSpec, type ChartSpecV1 } from "./chartSpec";
import { rainfallBar, scatterChart } from "./testing/chartFixtures";

// Phase 21A.1 — Review Fix 5 (round-5 findings B5-1 / B5-2 / B5-3 / B5-5, C5-5): the figure names its reference lines as text; pies and
// reference-line charts lay out by width; after a webfont load the engine's font string changes (its own width cache starts afresh); the
// page's measurer is keyed by font AND text, bounded, and its webfont listener is released with the last chart.
type Opt = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const h = vi.hoisted(() => ({ mounted: [] as unknown[], updates: [] as unknown[] }));
vi.mock("./echartsEngine", () => ({
  CHART_ENGINE_MARKER: "xp-chart-engine-v1",
  mountChartEngine: (el: HTMLElement, o: unknown) => {
    el.setAttribute("data-xp-engine", "xp-chart-engine-v1");
    h.mounted.push(o);
    return { update: (x: unknown) => { h.updates.push(x); }, resize() {}, flush() {}, dispose() {}, disposed: () => false };
  }
}));
// half the font size per character: a measurement that depends on the font it is asked in
const fake = { font: "", calls: 0, measureText(t: string) { this.calls++; return { width: Array.from(t).length * (parseFloat(this.font) || 10) / 2 }; } };
const fonts = new EventTarget();
Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
HTMLCanvasElement.prototype.getContext = function getContext() { return fake; } as unknown as HTMLCanvasElement["getContext"];
import DataChart from "./DataChart";

const canon = (c: unknown) => { const r = validateChartSpec(c); if (!r.ok) throw new Error(JSON.stringify(r.issues)); return r.value as ChartSpecV1; };
const settle = async () => { for (let i = 0; i < 5; i++) await act(() => new Promise<void>(r => setTimeout(r, 0))); };
const own = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
const stageWidth = (w: number) => Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => w });
afterEach(() => { cleanup(); if (own) Object.defineProperty(HTMLElement.prototype, "clientWidth", own); else delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth; h.mounted.length = 0; h.updates.length = 0; });
const LONG = "متوسط المبيعات السنوي المستهدف للفروع الرئيسية";

describe("21A1-RB35 the figure names its reference lines as text (round-5 finding B5-1)", () => {
  it("a visible paragraph with each line's label and value, part of the figure's description", async () => {
    const { container } = render(<DataChart spec={canon(rainfallBar())} />);
    await settle();
    const p = container.querySelector(".xp-chart-refs")!;
    expect(p.textContent).toBe("خط مرجعي: ⁧عتبة 50 mm⁩: ⁦50 mm⁩");
    expect(container.querySelector("figure")!.getAttribute("aria-describedby")!.split(" ")).toContain(p.id);
  });
  it("a chart without reference lines has no such paragraph and is described by its description and summary only", async () => {
    const { referenceLines: _r, ...plain } = rainfallBar() as unknown as Record<string, unknown>;
    expect(_r).toBeDefined();
    const { container } = render(<DataChart spec={canon(plain)} />);
    await settle();
    expect(container.querySelector(".xp-chart-refs")).toBeNull();
    expect(container.querySelector("figure")!.getAttribute("aria-describedby")!.split(" ")).toHaveLength(2);
  });
});

describe("21A1-RB36 pies and reference-line charts lay out by the stage width (round-5 findings B5-2 / B5-3)", () => {
  it("a pie on a 500 px stage gets the label box that fits beside it (laid out at 480: 111 px), not 140", async () => {
    stageWidth(500);
    render(<DataChart spec={canon({ version: 1, id: "p", kind: "pie", title: "t", description: "d", valueLabels: true, slices: [{ id: "a", label: "أ", value: 3 }, { id: "b", label: "ب", value: 5 }] })} />);
    await settle();
    expect((h.mounted.at(-1) as Opt).series[0].label.width).toBe(Math.floor(240 - 0.68 * 320 / 2 - 20));
  });
  it("a scatter plot's reference label on a 1000 px stage is whole (its plot is known), not cut to the unmeasured 120 px", async () => {
    stageWidth(1000);
    render(<DataChart spec={canon({ ...scatterChart(), referenceLines: [{ id: "r", value: 70, label: LONG }] })} />);
    await settle();
    const m = (h.mounted.at(-1) as Opt).series[0].markLine;
    expect(m.label.formatter({ dataIndex: 0 })).toBe("⁧" + LONG + "⁩");
  });
});

describe("21A1-RB37 the page's measurer: keyed by font and text, bounded; its webfont listener released (round-5 finding C5-5)", () => {
  const hbar = () => canon({ version: 1, id: "h", kind: "bar", orientation: "horizontal", title: "t", description: "d", valueLabels: true,
    categories: [{ id: "a", label: "أ" }, { id: "b", label: "ب" }], series: [{ id: "s", label: "س", values: [1234567, 1500000] }] });
  it("a number measured at 11 px on a phone is measured again at 12 px on a wide stage (the value labels' room follows the font)", async () => {
    stageWidth(320);
    render(<DataChart spec={hbar()} />);
    await settle();
    cleanup();
    stageWidth(1000);
    render(<DataChart spec={hbar()} />);
    await settle();
    expect((h.mounted.at(-1) as Opt).grid.right).toBe(Math.ceil(7 * 6 + 6));                       // "1234567" at 12 px: 6 px per character
  });
  it("the cache holds at most 4,000 entries: after 4,000 other texts the first is measured again", async () => {
    render(<DataChart spec={canon(rainfallBar())} />);
    await settle();
    const f = (h.mounted.at(-1) as Opt).xAxis.axisLabel.formatter as (v: string) => string;
    f("t0");
    const before = fake.calls;
    f("t0");
    expect(fake.calls).toBe(before);                                                             // cached
    for (let i = 1; i <= 4000; i++) f("t" + i);
    const mid = fake.calls;
    f("t0");
    expect(fake.calls).toBe(mid + 1);                                                            // evicted with the rest
  });
  it("the webfont listener is added with the first chart and removed with the last", async () => {
    const add = vi.spyOn(fonts, "addEventListener"), remove = vi.spyOn(fonts, "removeEventListener");
    try {
      render(<DataChart spec={canon(rainfallBar())} />);
      await settle();
      expect(add).toHaveBeenCalledWith("loadingdone", expect.any(Function));
      const listener = add.mock.calls.at(-1)![1];
      cleanup();
      expect(remove).toHaveBeenCalledWith("loadingdone", listener);
    } finally { add.mockRestore(); remove.mockRestore(); }
  });
});

describe("21A1-RB38 after a webfont load the engine's font string changes (round-5 finding B5-5)", () => {
  it("the screen and print options name the chart's font plus an epoch family, so the engine measures afresh", async () => {
    const long = canon({ ...rainfallBar(), categories: (rainfallBar() as CategoryChartSpec).categories.map((c, i) => ({ ...c, label: "منطقة الشمال رقم " + (i + 1) })) });
    render(<DataChart spec={long} />);
    await settle();
    const before = (h.mounted.at(-1) as Opt).textStyle.fontFamily as string;
    expect(before).not.toMatch(/xp-font-/);
    await act(() => { fonts.dispatchEvent(new Event("loadingdone")); });
    await settle();
    const after = (h.updates.at(-1) as Opt).textStyle.fontFamily as string;
    expect(after).toMatch(/^.+, xp-font-\d+$/);
    expect(after.startsWith(before)).toBe(true);
    expect((h.updates.at(-1) as Opt).xAxis.axisLabel.fontFamily).toBe(after);
    await act(() => { window.dispatchEvent(new Event("beforeprint")); });
    expect((h.updates.at(-1) as Opt).textStyle.fontFamily).toBe(after);
    await act(() => { window.dispatchEvent(new Event("afterprint")); });
  });
});
