// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { validateChartSpec, type CategoryChartSpec, type ChartSpecV1 } from "./chartSpec";
import { rainfallBar } from "./testing/chartFixtures";

// Phase 21A.1 — Review Fix 3 (round-3 finding B3-2): where the page can measure text (a 2D canvas), DataChart hands the adapter a measurer
// for the screen AND the print option, so labels are cut by their real width (overflow "none" + a measuring formatter), never by the
// engine's estimate. The canvas is stubbed before the first chart is drawn: the measurer is created once per page.
type Label = { overflow?: string; formatter?: (v: string) => string; width?: number };
const h = vi.hoisted(() => ({ mounted: [] as unknown[], updates: [] as unknown[] }));
vi.mock("./echartsEngine", () => ({
  CHART_ENGINE_MARKER: "xp-chart-engine-v1",
  mountChartEngine: (el: HTMLElement, o: unknown) => {
    el.setAttribute("data-xp-engine", "xp-chart-engine-v1");
    h.mounted.push(o);
    return { update: (x: unknown) => { h.updates.push(x); }, resize() {}, flush() {}, dispose() {}, disposed: () => false };
  }
}));
// 6 px per character, in whatever font the adapter asks for
const fake = { font: "", measureText: (t: string) => ({ width: Array.from(t).length * 6 }) };
HTMLCanvasElement.prototype.getContext = function getContext() { return fake; } as unknown as HTMLCanvasElement["getContext"];
import DataChart from "./DataChart";

const canon = (c: unknown) => { const r = validateChartSpec(c); if (!r.ok) throw new Error("fixture"); return r.value as ChartSpecV1; };
const settle = async () => { for (let i = 0; i < 5; i++) await act(() => new Promise<void>(r => setTimeout(r, 0))); };
afterEach(cleanup);

describe("21A1-RB18b DataChart measures label text where a canvas exists (review fix 3, B3-2; mutant RT33)", () => {
  it("the screen option and the print option both cut labels by measurement", async () => {
    const long = canon({ ...rainfallBar(), categories: (rainfallBar() as CategoryChartSpec).categories.map((c, i) => ({ ...c, label: "المنطقة الشمالية الشرقية رقم " + (i + 1) })) });
    render(<DataChart spec={long} />);
    await settle();
    const screenLabel = (h.mounted[0] as { xAxis: { axisLabel: Label } }).xAxis.axisLabel;
    expect(screenLabel.overflow).toBe("none");
    const cut = screenLabel.formatter!("المنطقة الشمالية الشرقية رقم 12").replace(/[⁦-⁩]/g, "");
    expect(cut.endsWith("…")).toBe(true);
    expect(Array.from(cut).length * 6).toBeLessThanOrEqual(screenLabel.width!);
    await act(() => { window.dispatchEvent(new Event("beforeprint")); });
    const printLabel = (h.updates.at(-1) as { xAxis: { axisLabel: Label } }).xAxis.axisLabel;
    expect(printLabel.overflow).toBe("none");
    expect(typeof printLabel.formatter).toBe("function");
    await act(() => { window.dispatchEvent(new Event("afterprint")); });
  });
});
