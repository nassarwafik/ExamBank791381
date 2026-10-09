// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import { validateChartSpec, type ChartSpecV1 } from "./chartSpec";
import type { EngineEvent } from "./echartsEngine";
import { rainfallBar } from "./testing/chartFixtures";

// Phase 21A.1 — Review Fix 1 (rendering / UX lane), the DataChart component with a fake engine: print sizing (B-1), a retry after the engine
// IMPORT itself failed (B-2: DataChartRetry.21a1.test.tsx), live announcements that say what happened (B-8), and review marks (B-11).
const h = vi.hoisted(() => ({ resizes: [] as (number | undefined)[], mounts: 0 }));
vi.mock("./echartsEngine", () => {
  return {
    CHART_ENGINE_MARKER: "xp-chart-engine-v1",
    mountChartEngine: (el: HTMLElement, _o: unknown, _e: (e: EngineEvent) => void) => {
      h.mounts++;
      el.setAttribute("data-xp-engine", "xp-chart-engine-v1");
      return { update() {}, resize: (w?: number) => { h.resizes.push(w); }, flush() {}, dispose() {}, disposed: () => false };
    }
  };
});
import DataChart, { PRINT_WIDTH } from "./DataChart";

const canon = (c: ChartSpecV1) => { const r = validateChartSpec(c); if (!r.ok) throw new Error("fixture"); return r.value; };
const settle = async () => { for (let i = 0; i < 5; i++) await act(() => new Promise<void>(r => setTimeout(r, 0))); };
beforeEach(() => {
  h.resizes = []; h.mounts = 0;
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("21A1-RB1 print: the engine draws at the print width while printing", () => {
  it("beforeprint → resize(PRINT_WIDTH); afterprint → resize() (follow the container again)", async () => {
    render(<DataChart spec={canon(rainfallBar())} />);
    await settle();
    expect(h.mounts).toBe(1);
    h.resizes = [];
    act(() => { window.dispatchEvent(new Event("beforeprint")); });
    expect(h.resizes).toEqual([PRINT_WIDTH]);
    act(() => { window.dispatchEvent(new Event("afterprint")); });
    expect(h.resizes).toEqual([PRINT_WIDTH, undefined]);
    expect(PRINT_WIDTH).toBeLessThanOrEqual(680);                                   // inside the A4 / Letter printable width
  });
});

describe("21A1-RB8 live announcements say what actually happened", () => {
  const surface = (value: string[], onChange: (n: string[]) => void, mode: "multiple" | "range" = "multiple", max = 2) => ({ kind: "category" as const, mode, max, value, onChange });
  const live = (c: HTMLElement) => c.querySelector('[aria-live="polite"]')!.textContent;
  it("multiple at its limit: activating another item is refused at the limit (never 'deselected'); nothing is emitted", () => {
    const onChange = vi.fn();
    const { container } = render(<DataChart spec={canon(rainfallBar())} selection={surface(["jan", "oct"], onChange)} />);
    fireEvent.click(container.querySelector('[data-xp-key="feb"]')!);
    expect(live(container)).toBe("بلغت الحد الأقصى (2)؛ لم يُحدَّد: فبراير — المحدَّد 2");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('[data-xp-key="oct"]')!);
    expect(live(container)).toBe("أُلغي تحديد: أكتوبر — المحدَّد 1");
    expect(onChange).toHaveBeenLastCalledWith(["jan"]);
  });
  it("range: re-activating the end of the run is 'unchanged'; a backward run keeps its anchor", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<DataChart spec={canon(rainfallBar())} selection={surface(["jun"], onChange, "range", 3)} />);
    fireEvent.click(container.querySelector('[data-xp-key="feb"]')!);
    expect(onChange).toHaveBeenLastCalledWith(["apr", "may", "jun"]);
    // round 2 (N-5): the run that WAS extended is announced too, not only the refused item
    expect(live(container)).toBe("تم تحديد: أبريل، مايو؛ بلغت الحد الأقصى (3)؛ لم يُحدَّد: فبراير — المحدَّد 3");
    rerender(<DataChart spec={canon(rainfallBar())} selection={surface(["apr", "may", "jun"], onChange, "range", 3)} />);
    onChange.mockClear();
    fireEvent.click(container.querySelector('[data-xp-key="jun"]')!);
    expect(live(container)).toBe("لا تغيير، محدَّد بالفعل: يونيو — المحدَّد 3");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("21A1-RB11 review marks", () => {
  it("an incorrect selection shows ✗ (not ✓), a missed key ○, a correct one ✓; the student's hint is not shown read-only", () => {
    const { container } = render(<DataChart spec={canon(rainfallBar())} selection={{ kind: "category", mode: "multiple", max: 3, value: ["feb", "oct"], readOnly: true, marks: { feb: "incorrect", oct: "correct", jan: "missed" } }} />);
    const opt = (k: string) => container.querySelector('[data-xp-key="' + k + '"]')!;
    expect(opt("feb").textContent).toBe("فبراير — ✗ غير صحيح");
    expect(opt("oct").textContent).toBe("أكتوبر — ✓ صحيح");
    expect(opt("jan").textContent).toBe("يناير — ○ لم يُحدَّد");
    expect(opt("feb").getAttribute("data-xp-review")).toBe("incorrect");
    expect(container.querySelector(".xp-chart-select-hint")).toBeNull();
    expect(container.textContent).not.toContain("يمكنك اختيار");
  });
  it("the student's own surface still shows the hint", () => {
    const { container } = render(<DataChart spec={canon(rainfallBar())} selection={{ kind: "category", mode: "multiple", max: 3, value: [], onChange: () => {} }} />);
    expect(container.querySelector(".xp-chart-select-hint")!.textContent).toBe("يمكنك اختيار حتى 3 عناصر.");
  });
});
