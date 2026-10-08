// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, act } from "@testing-library/react";
import { validateChartSpec, type ChartSpecV1 } from "./chartSpec";
import { rainfallBar } from "./testing/chartFixtures";

// Phase 21A.1 — Review Fix 1 (B-2): the engine module's dynamic IMPORT itself is rejected (not a throwing mount). The module fails to load
// for the first three import attempts of this file, then loads: the tests run in order and consume them — (1) a failure, the one retry
// failing again: the honest second message, no button; (2) a failure, the retry succeeding: the chart draws and focus stays on the figure.
const h = vi.hoisted(() => ({ importFailures: 3, mounts: 0 }));
vi.mock("./echartsEngine", () => {
  if (h.importFailures > 0) { h.importFailures--; throw new TypeError("Failed to fetch dynamically imported module"); }
  return {
    CHART_ENGINE_MARKER: "xp-chart-engine-v1",
    mountChartEngine: (el: HTMLElement) => { h.mounts++; el.setAttribute("data-xp-engine", "xp-chart-engine-v1"); return { update() {}, resize() {}, dispose() {}, disposed: () => false }; }
  };
});
import DataChart from "./DataChart";

const canon = (c: ChartSpecV1) => { const r = validateChartSpec(c); if (!r.ok) throw new Error("fixture"); return r.value; };
const settle = async () => { for (let i = 0; i < 5; i++) await act(() => new Promise<void>(r => setTimeout(r, 0))); };
beforeEach(() => { vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("21A1-RB2 engine import failure: one real retry, an honest second failure, focus kept", () => {
  it("(1) the import fails twice: the fallback table opens, the retry re-imports, and the second failure says so with no button that cannot work", async () => {
    const { container } = render(<DataChart spec={canon(rainfallBar())} />);
    await settle();
    const fig = container.querySelector("figure")!;
    expect(fig.getAttribute("data-xp-chart-state")).toBe("error");
    expect(container.querySelector(".xp-chart-table-wrap")!.hasAttribute("hidden")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await settle();
    expect(h.importFailures).toBe(1);                                                // the retry really imported again
    expect(fig.getAttribute("data-xp-chart-state")).toBe("error");
    expect(screen.queryByRole("button", { name: "إعادة المحاولة" })).toBeNull();
    expect(container.querySelector(".xp-chart-error")!.textContent).toContain("مرة أخرى");
    expect(document.activeElement).toBe(fig);
  });
  it("(2) the import fails once: retry re-imports and draws; focus moves to the figure, never to <body>", async () => {
    const { container } = render(<DataChart spec={canon(rainfallBar())} />);
    await settle();
    const fig = container.querySelector("figure")!;
    expect(fig.getAttribute("data-xp-chart-state")).toBe("error");
    const retry = screen.getByRole("button", { name: "إعادة المحاولة" });
    retry.focus();
    fireEvent.click(retry);
    expect(document.activeElement).toBe(fig);
    await settle();
    expect(fig.getAttribute("data-xp-chart-state")).toBe("ready");
    expect(h.mounts).toBe(1);
    expect(document.activeElement).toBe(fig);
  });
});
