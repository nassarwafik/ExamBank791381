// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, act, fireEvent } from "@testing-library/react";
import { validateChartSpec, type ChartSpecV1 } from "./chartSpec";
import { rainfallBar } from "./testing/chartFixtures";

// Phase 21A.1 — Review Fix 4 (round-4 finding C4-F2): a loaded engine whose MOUNT throws keeps ONE retry (an import failure has none —
// DataChartRetry): the retry moves focus to the figure (never to <body>), a second failure says so honestly and offers no second button,
// and a retry that succeeds draws the chart. `h.mountFailures` mounts throw, then mounting works.
const h = vi.hoisted(() => ({ mountFailures: 0, mounts: 0 }));
vi.mock("./echartsEngine", () => ({
  CHART_ENGINE_MARKER: "xp-chart-engine-v1",
  mountChartEngine: (el: HTMLElement) => {
    if (h.mountFailures > 0) { h.mountFailures--; throw new Error("the engine could not draw"); }
    h.mounts++; el.setAttribute("data-xp-engine", "xp-chart-engine-v1");
    return { update() {}, resize() {}, flush() {}, dispose() {}, disposed: () => false };
  }
}));
import DataChart from "./DataChart";

const canon = (c: ChartSpecV1) => { const r = validateChartSpec(c); if (!r.ok) throw new Error("fixture"); return r.value; };
const settle = async () => { for (let i = 0; i < 6; i++) await act(() => new Promise<void>(r => setTimeout(r, 0))); };
beforeEach(() => { h.mountFailures = 0; h.mounts = 0; vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("21A1-RB2b a throwing mount: one retry, focus on the figure, an honest second failure (round-4 finding C4-F2)", () => {
  it("fails twice: the first message offers one retry; the retry focuses the figure; the second failure says «مرة أخرى» with no button", async () => {
    h.mountFailures = 2;
    const { container } = render(<DataChart spec={canon(rainfallBar())} />);
    await settle();
    const fig = container.querySelector("figure")!;
    expect(fig.getAttribute("data-xp-chart-state")).toBe("error");
    expect(container.querySelector(".xp-chart-error")!.textContent).toContain("تعذّر عرض الرسم البياني؛ البيانات كاملة في الجدول أدناه.");
    const retry = screen.getByRole("button", { name: "إعادة المحاولة" });
    retry.focus();
    fireEvent.click(retry);
    expect(document.activeElement).toBe(fig);
    await settle();
    expect(fig.getAttribute("data-xp-chart-state")).toBe("error");
    expect(container.querySelector(".xp-chart-error")!.textContent).toContain("مرة أخرى");
    expect(screen.queryByRole("button", { name: "إعادة المحاولة" })).toBeNull();
    expect(document.activeElement).toBe(fig);
    expect(h.mounts).toBe(0);
  });
  it("fails once: the retry draws the chart and focus stays on the figure", async () => {
    h.mountFailures = 1;
    const { container } = render(<DataChart spec={canon(rainfallBar())} />);
    await settle();
    const fig = container.querySelector("figure")!;
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await settle();
    expect(fig.getAttribute("data-xp-chart-state")).toBe("ready");
    expect(h.mounts).toBe(1);
    expect(document.activeElement).toBe(fig);
  });
});
