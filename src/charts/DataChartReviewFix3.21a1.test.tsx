// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import { validateChartSpec, type CategoryChartSpec, type ChartSpecV1 } from "./chartSpec";
import type { EngineEvent } from "./echartsEngine";
import { rainfallBar } from "./testing/chartFixtures";

// Phase 21A.1 — Review Fix 3 (round-3 lane B): while printing, nothing re-applies the screen layout (B3-1: the print media query turns the
// animation off AFTER beforeprint, which changed the option); a repeated identical announcement is spoken again (B3-4).
type Opt = { animation?: boolean; xAxis?: { axisLabel?: { rotate?: number } } };
const h = vi.hoisted(() => ({ calls: [] as string[], options: [] as unknown[], mounted: [] as unknown[] }));
vi.mock("./echartsEngine", () => ({
  CHART_ENGINE_MARKER: "xp-chart-engine-v1",
  mountChartEngine: (el: HTMLElement, o: unknown, _e: (e: EngineEvent) => void) => {
    el.setAttribute("data-xp-engine", "xp-chart-engine-v1");
    h.mounted.push(o);
    return {
      update: (o: unknown) => { h.calls.push("update"); h.options.push(o); },
      resize: (w?: number, ht?: number) => { h.calls.push("resize(" + (w ?? "") + (ht ? "," + ht : "") + ")"); },
      flush: () => { h.calls.push("flush"); },
      dispose() {}, disposed: () => false
    };
  }
}));
import DataChart, { PRINT_WIDTH } from "./DataChart";
import { chartHeight } from "./echartsAdapter";

const canon = (c: unknown) => { const r = validateChartSpec(c); if (!r.ok) throw new Error("fixture"); return r.value as ChartSpecV1; };
const settle = async () => { for (let i = 0; i < 5; i++) await act(() => new Promise<void>(r => setTimeout(r, 0))); };
// a matchMedia whose "print" query can be switched like a browser does while printing
const media = { print: false, listeners: new Set<() => void>() };
beforeEach(() => {
  h.calls = []; h.options = []; h.mounted = []; media.print = false; media.listeners.clear();
  vi.stubGlobal("matchMedia", (q: string) => ({
    get matches() { return q === "print" ? media.print : false; }, media: q,
    addEventListener: (_: string, f: () => void) => { if (q === "print") media.listeners.add(f); },
    removeEventListener: (_: string, f: () => void) => { media.listeners.delete(f); }, addListener() {}, removeListener() {}
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const flipPrint = (on: boolean) => act(() => { media.print = on; for (const f of [...media.listeners]) f(); });

describe("21A1-RB1d the print layout survives the print media query (review fix 3, B3-1)", () => {
  it("subtle animation (the formal-exam default): beforeprint → print option; the print query then turns animation off → the PRINT option again, never the screen one; afterprint restores the screen", async () => {
    const long = canon({ ...rainfallBar(), animation: "subtle", categories: (rainfallBar() as CategoryChartSpec).categories.map((c, i) => ({ ...c, label: "محافظة رقم " + (i + 1) })) });
    render(<DataChart spec={long} />);
    await settle();
    h.calls = []; h.options = [];
    act(() => { window.dispatchEvent(new Event("beforeprint")); });
    flipPrint(true);
    await settle();
    const printed = h.options as Opt[];
    expect(printed.length).toBeGreaterThanOrEqual(2);
    for (const o of printed) expect(o.xAxis!.axisLabel!.rotate, JSON.stringify(h.calls)).toBe(45);   // only the 640 px layout reached paper
    expect(h.calls.at(-3)).toBe("update");
    // drawn at the print width AND the chart's own desktop height — the print layout's fluid box is never measured
    expect(h.calls.slice(-2)).toEqual(["resize(" + PRINT_WIDTH + "," + chartHeight(long, false) + ")", "flush"]);
    h.calls = []; h.options = [];
    act(() => { window.dispatchEvent(new Event("afterprint")); });
    flipPrint(false);
    await settle();
    expect((h.options.at(-1) as Opt).xAxis!.axisLabel!.rotate).toBeUndefined();     // the screen layout again
    expect(h.calls).toContain("resize()");
  });
});

describe("21A1-RB8c a repeated identical announcement is spoken again (review fix 3, B3-4)", () => {
  it("activating the same refused item twice re-mounts the live text (a live region only speaks changes)", () => {
    const sel = { kind: "category" as const, mode: "multiple" as const, max: 2, value: ["jan", "oct"], onChange: vi.fn() };
    const { container } = render(<DataChart spec={canon(rainfallBar())} selection={sel} />);
    const liveNode = () => container.querySelector('[aria-live="polite"]')!.firstElementChild;
    fireEvent.click(container.querySelector('[data-xp-key="feb"]')!);
    const first = liveNode();
    expect(first!.textContent).toBe("بلغت الحد الأقصى (2)؛ لم يُحدَّد: فبراير — المحدَّد 2");
    fireEvent.click(container.querySelector('[data-xp-key="feb"]')!);
    expect(liveNode()!.textContent).toBe(first!.textContent);
    expect(liveNode()).not.toBe(first);                                                // a new node: the screen reader speaks it again
  });
});

describe("21A1-RB1e the print option is the desktop layout with the selection shown (round 3, lane C N5: C3-19 / C3-20)", () => {
  it("printed from a phone-width stage: labels shown (not the phone layout) and the selected target still emphasised", async () => {
    const own = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 320 });
    try {
      const pie = canon({ version: 1, id: "p", kind: "pie", title: "الحصص", description: "حصص", slices: [{ id: "a", label: "التعليم", value: 40 }, { id: "b", label: "الصحة", value: 60 }] });
      render(<DataChart spec={pie} selection={{ kind: "category", mode: "single", max: 1, value: ["b"], onChange: () => {} }} />);
      await settle();
      const screenOpt = (h.options.at(-1) ?? h.mounted.at(-1)) as { series: { label: { show: boolean } }[] } | undefined;
      expect(screenOpt).toBeDefined();                                                 // (round-4 finding C4-F10: the precondition always runs)
      expect(screenOpt!.series[0].label.show).toBe(false);                             // the phone layout on screen
      h.options = [];
      act(() => { window.dispatchEvent(new Event("beforeprint")); });
      const printed = h.options.at(-1) as { series: { label: { show: boolean } }[] };
      expect(printed.series[0].label.show).toBe(true);
      expect(JSON.stringify(printed)).toContain("#F59E0B");                             // CHART_SELECTED_COLOR on the selected slice
    } finally {
      if (own) Object.defineProperty(HTMLElement.prototype, "clientWidth", own);
    }
  });
});

describe("21A1-RB1f while printing, a width change of the print layout never resizes the engine to its box (review fix 3)", () => {
  it("printing from a phone: the print layout widens the stage (width AND height class change) — only the print size is applied; after printing the container's again (mutants RT23 / RT24 / RT27)", async () => {
    const observers: (() => void)[] = [];
    vi.stubGlobal("ResizeObserver", class { constructor(cb: () => void) { observers.push(cb); } observe() {} unobserve() {} disconnect() {} });
    let w = 360;
    const own = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => w });
    try {
      const spec = canon(rainfallBar());
      render(<DataChart spec={spec} />);
      await settle();
      h.calls = [];
      act(() => { window.dispatchEvent(new Event("beforeprint")); });
      expect(chartHeight(spec, false)).not.toBe(chartHeight(spec, true));
      expect(h.calls).toContain("resize(640," + chartHeight(spec, false) + ")");     // the desktop height, never the phone's (mutant RT27)
      h.calls = [];
      w = 718;                                                                         // the printed column: no longer a phone
      act(() => { for (const o of observers) o(); });
      await settle();
      expect(h.calls).not.toContain("resize()");
      act(() => { window.dispatchEvent(new Event("afterprint")); });
      await settle();
      expect(h.calls).toContain("resize()");
    } finally {
      if (own) Object.defineProperty(HTMLElement.prototype, "clientWidth", own);
    }
  });
});
