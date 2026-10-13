// @vitest-environment happy-dom
// Phase 21E.3 review fix 2 (re-review GOV-2) — inside a running exam the chart's own fallback never advises reloading the page (D5:
// in a strict attempt a reload ends the attempt). Outside the exam the 21A.1 copy with the reload advice stays (DataChartRetry.21a1).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, act } from "@testing-library/react";
import { validateChartSpec, type ChartSpecV1 } from "./chartSpec";
import { rainfallBar } from "./testing/chartFixtures";
import { QuestionRecoveryContext } from "../student/exam/questionRecovery";

vi.mock("./echartsEngine", () => { throw new TypeError("Failed to fetch dynamically imported module"); });
import DataChart from "./DataChart";

const canon = (c: ChartSpecV1) => { const r = validateChartSpec(c); if (!r.ok) throw new Error("fixture"); return r.value; };
const settle = async () => { for (let i = 0; i < 5; i++) await act(() => new Promise<void>(r => setTimeout(r, 0))); };
beforeEach(() => { vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("RF2 — the chart fallback inside the exam never advises a page reload", () => {
  it("engine import fails during an exam (strict or not): the table opens, the message names no reload, there is no retry button", async () => {
    const { container } = render(<QuestionRecoveryContext.Provider value={{ scope: "exam", reloadAllowed: false, strict: true }}><DataChart spec={canon(rainfallBar())} /></QuestionRecoveryContext.Provider>);
    await settle();
    expect(container.querySelector("figure")!.getAttribute("data-xp-chart-state")).toBe("error");
    expect(container.querySelector(".xp-chart-table-wrap")!.hasAttribute("hidden")).toBe(false);
    const message = container.querySelector(".xp-chart-error")!.textContent || "";
    expect(message).toBe("تعذّر تحميل الرسم البياني؛ البيانات كاملة في الجدول أدناه.");
    expect(message).not.toMatch(/إعادة تحميل الصفحة/);
    expect(screen.queryByRole("button", { name: "إعادة المحاولة" })).toBeNull();
  });
});
