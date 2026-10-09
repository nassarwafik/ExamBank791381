// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { validateChartSpec, type ChartSpecV1 } from "./chartSpec";
import { rainfallBar } from "./testing/chartFixtures";

// Phase 21A.1 — Review Fix 6 (round-6 lane C C6-4, the rest of C5-5): the page's measurer clears at exactly 4,000 entries; the webfont
// listener stays while any chart is mounted, so a chart left on the page still lays out again after a webfont load.
type Opt = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const h = vi.hoisted(() => ({ mounted: [] as unknown[], updates: [] as unknown[] }));
vi.mock("./echartsEngine", () => ({
  CHART_ENGINE_MARKER: "xp-chart-engine-v1",
  mountChartEngine: (el: HTMLElement, o: unknown) => {
    el.setAttribute("data-xp-engine", "xp-chart-engine-v1");
    h.mounted.push(o);
    // each host counts the options applied to it (a chart's own count, whatever else is on the page)
    return { update: (x: unknown) => { h.updates.push(x); el.setAttribute("data-updates", String(Number(el.getAttribute("data-updates") ?? 0) + 1)); }, resize() {}, flush() {}, dispose() {}, disposed: () => false };
  }
}));
const fake = { font: "", calls: 0, measureText(t: string) { this.calls++; return { width: Array.from(t).length * (parseFloat(this.font) || 10) / 2 }; } };
const fonts = new EventTarget();
Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
HTMLCanvasElement.prototype.getContext = function getContext() { return fake; } as unknown as HTMLCanvasElement["getContext"];
import DataChart from "./DataChart";

const canon = (c: unknown) => { const r = validateChartSpec(c); if (!r.ok) throw new Error(JSON.stringify(r.issues)); return r.value as ChartSpecV1; };
const settle = async () => { for (let i = 0; i < 10; i++) await act(() => new Promise<void>(r => setTimeout(r, 10))); };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("21A1-RB46 the page's measurer and its webfont listener (round-6 lane C C6-4)", () => {
  it("the cache clears when it holds 4,000 entries: between two clears, 3,999 new texts follow the two kept (mutant X36: 4,001)", async () => {
    render(<DataChart spec={canon(rainfallBar())} />);
    await settle();
    const f = (h.mounted.at(-1) as Opt).xAxis.axisLabel.formatter as (v: string) => string;
    // a clear is seen through a sentinel: measured again (two measurements for one new text) only once the cache was emptied
    f("s");
    const inserts = (from: number) => { for (let i = from; ; i++) { const c = fake.calls; f("u" + i); f("s"); if (fake.calls - c === 2) return i; } };
    const first = inserts(0);                                                                    // the cache now holds "u<first>" and "s"
    const second = inserts(first + 1);
    expect(second - first).toBe(3999);
  });
  it("two charts: unmounting one keeps the listener; a webfont load then lays the other out again (mutant X37)", async () => {
    h.mounted.length = 0;
    const remove = vi.spyOn(fonts, "removeEventListener");
    // one chart after the other: each takes the stubbed engine once its lazy load has settled
    const a = render(<DataChart spec={canon(rainfallBar())} />);
    await settle();
    const b = render(<DataChart spec={canon({ ...rainfallBar(), id: "b2" })} />);
    await settle();
    const host = b.container.querySelector("[data-xp-engine]")!;
    expect(host).not.toBeNull();
    expect(h.mounted).toHaveLength(2);
    a.unmount();
    await settle();
    expect(remove).not.toHaveBeenCalled();
    const before = Number(host.getAttribute("data-updates") ?? 0);
    await act(async () => { fonts.dispatchEvent(new Event("loadingdone")); });
    await settle();
    expect(Number(host.getAttribute("data-updates") ?? 0)).toBe(before + 1);
    cleanup();
    expect(remove).toHaveBeenCalledWith("loadingdone", expect.any(Function));
  });
});
