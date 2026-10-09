// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, act } from "@testing-library/react";
import { validateChartSpec, type ChartSpecV1 } from "./chartSpec";
import { rainfallBar } from "./testing/chartFixtures";

// Phase 21A.1 — Review Fix 1 (B-2), revised by Review Fix 3 (round-3 finding B3-5): the engine module's dynamic IMPORT itself is rejected
// (not a throwing mount). Browsers keep a failed module import for the life of the page (Chromium makes no second request), so no retry
// button is offered for it: the table opens and the message names the page reload. A throwing mount keeps its one retry (DataChart.21a1 DC2).
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

describe("21A1-RB2 engine import failure: no button that cannot work; the table and the reload are offered", () => {
  it("the import fails: the fallback table opens, the message names the page reload, there is no retry button, and nothing re-imports", async () => {
    const { container, rerender } = render(<DataChart spec={canon(rainfallBar())} />);
    await settle();
    const fig = container.querySelector("figure")!;
    expect(fig.getAttribute("data-xp-chart-state")).toBe("error");
    expect(container.querySelector(".xp-chart-table-wrap")!.hasAttribute("hidden")).toBe(false);
    expect(container.querySelector(".xp-chart-error")!.textContent).toBe("تعذّر تحميل الرسم البياني؛ البيانات كاملة في الجدول أدناه، ويُعرض الرسم بعد إعادة تحميل الصفحة.");
    expect(screen.queryByRole("button", { name: "إعادة المحاولة" })).toBeNull();
    const left = h.importFailures;
    rerender(<DataChart spec={canon({ ...rainfallBar(), title: "عنوان آخر" } as ChartSpecV1)} />);
    await settle();
    expect(h.importFailures).toBe(left);                                             // a data change does not re-import the same engine set
    expect(fig.getAttribute("data-xp-chart-state")).toBe("error");
  });
});
