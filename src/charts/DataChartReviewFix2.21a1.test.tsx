// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import { validateChartSpec, type CategoryChartSpec, type ChartSpecV1 } from "./chartSpec";
import type { EngineEvent } from "./echartsEngine";
import { radarChart, rainfallBar } from "./testing/chartFixtures";

// Phase 21A.1 — Review Fix 2 (rendering / UX lane), the DataChart component with a recording fake engine: printing takes the print-width
// layout and paints before the print layout (N-1 / N-4), and the live announcement describes the difference a selection made (N-5).
type Opt = { animation?: boolean; xAxis?: { axisLabel?: { rotate?: number } } };
const h = vi.hoisted(() => ({ calls: [] as string[], options: [] as unknown[] }));
vi.mock("./echartsEngine", () => ({
  CHART_ENGINE_MARKER: "xp-chart-engine-v1",
  mountChartEngine: (el: HTMLElement, _o: unknown, _e: (e: EngineEvent) => void) => {
    el.setAttribute("data-xp-engine", "xp-chart-engine-v1");
    return {
      update: (o: unknown) => { h.calls.push("update"); h.options.push(o); },
      resize: (w?: number) => { h.calls.push("resize(" + (w ?? "") + ")"); },
      flush: () => { h.calls.push("flush"); },
      dispose() {}, disposed: () => false
    };
  }
}));
vi.mock("./echartsAdvanced", () => ({ CHART_ADVANCED_MARKER: "xp-chart-advanced-v1" }));
import DataChart, { PRINT_WIDTH } from "./DataChart";

const canon = (c: unknown) => { const r = validateChartSpec(c); if (!r.ok) throw new Error("fixture"); return r.value as ChartSpecV1; };
const settle = async () => { for (let i = 0; i < 5; i++) await act(() => new Promise<void>(r => setTimeout(r, 0))); };
beforeEach(() => {
  h.calls = []; h.options = [];
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("21A1-RB1b print: the print-width layout, painted before the print layout (review fix 2, N-1 / N-4)", () => {
  it("beforeprint → update(print option) → resize(PRINT_WIDTH) → flush; afterprint → update(screen option) → resize() → flush", async () => {
    const long = canon({ ...rainfallBar(), categories: (rainfallBar() as CategoryChartSpec).categories.map((c, i) => ({ ...c, label: "محافظة رقم " + (i + 1) })) });
    render(<DataChart spec={long} />);
    await settle();
    h.calls = []; h.options = [];
    act(() => { window.dispatchEvent(new Event("beforeprint")); });
    expect(h.calls).toEqual(["update", "resize(" + PRINT_WIDTH + ")", "flush"]);
    const print = h.options[0] as Opt;
    expect(print.animation).toBe(false);                                            // paper never animates
    expect(print.xAxis!.axisLabel!.rotate).toBe(45);                                // 12 long labels do not fit 640 px flat
    act(() => { window.dispatchEvent(new Event("afterprint")); });
    expect(h.calls).toEqual(["update", "resize(" + PRINT_WIDTH + ")", "flush", "update", "resize()", "flush"]);
    const screen = h.options[1] as Opt;
    expect(screen.xAxis!.axisLabel!.rotate).toBeUndefined();                        // the screen layout (unmeasured stage: flat) is back
  });
});

describe("21A1-RB8b the live announcement describes the difference (review fix 2, N-5)", () => {
  const surface = (value: string[], onChange: (n: string[]) => void, mode: "single" | "multiple" | "range" = "range", max = 3) => ({ kind: "category" as const, mode, max, value, onChange });
  const live = (c: HTMLElement) => c.querySelector('[aria-live="polite"]')!.textContent;
  const click = (c: HTMLElement, k: string) => fireEvent.click(c.querySelector('[data-xp-key="' + k + '"]')!);
  it("a range that SHRINKS announces the deselection (never 'selected')", () => {
    const onChange = vi.fn();
    const { container } = render(<DataChart spec={canon(rainfallBar())} selection={surface(["apr", "may", "jun"], onChange)} />);
    click(container, "may");
    expect(onChange).toHaveBeenLastCalledWith(["apr", "may"]);
    expect(live(container)).toBe("أُلغي تحديد: يونيو — المحدَّد 2");
  });
  it("a range EXTENDED up to the bound names what was added and what was not", () => {
    const onChange = vi.fn();
    const { container } = render(<DataChart spec={canon(rainfallBar())} selection={surface(["apr", "may"], onChange)} />);
    click(container, "jul");
    expect(onChange).toHaveBeenLastCalledWith(["apr", "may", "jun"]);
    expect(live(container)).toBe("تم تحديد: يونيو؛ بلغت الحد الأقصى (3)؛ لم يُحدَّد: يوليو — المحدَّد 3");
  });
  it("a range that MOVES backwards names both sides", () => {
    const onChange = vi.fn();
    const { container } = render(<DataChart spec={canon(rainfallBar())} selection={surface(["apr", "may", "jun"], onChange)} />);
    click(container, "jan");
    expect(onChange).toHaveBeenLastCalledWith(["feb", "mar", "apr"]);
    expect(live(container)).toBe("تم تحديد: فبراير، مارس؛ أُلغي تحديد: مايو، يونيو؛ بلغت الحد الأقصى (3)؛ لم يُحدَّد: يناير — المحدَّد 3");
  });
  it("single mode: choosing another item names the one it replaced", () => {
    const onChange = vi.fn();
    const { container } = render(<DataChart spec={canon(rainfallBar())} selection={surface(["jan"], onChange, "single", 1)} />);
    click(container, "feb");
    expect(onChange).toHaveBeenLastCalledWith(["feb"]);
    expect(live(container)).toBe("تم تحديد: فبراير؛ أُلغي تحديد: يناير — المحدَّد 1");
  });
});

describe("21A1-RB17 a width change that keeps the label layout does not redraw (review fix 2, N-6)", () => {
  it("1000 → 1100 px (labels rotated at both): resize only; → 1300 px (labels now fit flat): the new option is applied", async () => {
    const observers: (() => void)[] = [];
    vi.stubGlobal("ResizeObserver", class { constructor(cb: () => void) { observers.push(cb); } observe() {} unobserve() {} disconnect() {} });
    let w = 1000;
    const own = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => w });
    try {
      const long = canon({ ...rainfallBar(), categories: (rainfallBar() as CategoryChartSpec).categories.map((c, i) => ({ ...c, label: "محافظة رقم " + (i + 1) })) });
      render(<DataChart spec={long} />);
      await settle();
      h.calls = []; h.options = [];
      w = 1100;
      act(() => { for (const o of observers) o(); });
      await settle();
      expect(h.calls).toEqual(["resize()"]);
      w = 1300;
      act(() => { for (const o of observers) o(); });
      await settle();
      expect(h.calls).toContain("update");
      expect((h.options.at(-1) as Opt).xAxis!.axisLabel!.rotate).toBeUndefined();
      // flat labels whose width cap changes with the stage (mutant RS35): the new cap is applied
      h.calls = []; h.options = [];
      w = 1400;
      act(() => { for (const o of observers) o(); });
      await settle();
      expect(h.calls).toContain("update");
      const capOf = (o: unknown) => (o as { xAxis: { axisLabel: { width: number } } }).xAxis.axisLabel.width;
      expect(capOf(h.options.at(-1))).toBeGreaterThan(0);
    } finally {
      if (own) Object.defineProperty(HTMLElement.prototype, "clientWidth", own);
    }
  });
});

describe("21A1-RB22b a radar lays out by the stage width (round-4 finding B4-2; mutant RU50)", () => {
  it("after a width change the applied radar option carries a radius fitted to the stage (a number, not the default percentage)", async () => {
    const observers: (() => void)[] = [];
    vi.stubGlobal("ResizeObserver", class { constructor(cb: () => void) { observers.push(cb); } observe() {} unobserve() {} disconnect() {} });
    let w = 1000;
    const own = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => w });
    try {
      render(<DataChart spec={canon(radarChart())} />);
      await settle();
      w = 360;
      act(() => { for (const o of observers) o(); });
      await settle();
      const radar = (h.options.at(-1) as { radar: { radius: unknown } }).radar;
      expect(typeof radar.radius).toBe("number");
    } finally {
      if (own) Object.defineProperty(HTMLElement.prototype, "clientWidth", own);
    }
  });
});
