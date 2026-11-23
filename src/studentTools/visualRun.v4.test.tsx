// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, act } from "@testing-library/react";
import { motionOf, freshOf, structureSteps, nextBreak, PLAY_SPEEDS as SPEEDS } from "../learning/activities/dsMotion";
import type { DsStep, DsTrace, DsObj } from "../learning/activities/ds";
import DsTraceView from "../learning/activities/DsTraceView";
import LabTraceView from "./LabTraceView";

// Visual lab V4 (docs/enterprise-csharp-visual-lab-plan.md §12) — the teacher's player around the course's trace view:
//   • what moved between two steps (a push / pop / insert / remove, a new cell) — pure;
//   • auto-play at its speed, stopping at the end and AT a breakpoint; breakpoints toggled on the program's line numbers; «إلى نقطة
//     التوقف التالية»; «عمليات المباني فقط»; motion marks (none with prefers-reduced-motion); «توسيع» in a wide window;
//   • the course's own trace activity is UNCHANGED (no toggles, no motion) — a pin.

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const main = (vars: DsStep["frames"][0]["vars"] = []) => [{ name: "Main", vars }];
const step = (line: number, objs: DsObj[], out = ""): DsStep => ({ line, note: "", frames: main(objs.length ? [["s", { t: "ref", id: objs[0].id }]] : []), objs, out, error: false });
const stack = (items: string[]): DsObj => ({ id: 1, k: "stack", items });
const queue = (items: string[]): DsObj => ({ id: 2, k: "queue", items });
// 1 Main · 3 new stack · 4 x=5 (no structure change) · 5 push 1 · 6 push 2 · 7 pop · 8 print
const TRACE: DsTrace = {
  lines: ["static void Main()", "{", "    Stack<int> s = new Stack<int>();", "    int x = 5;", "    s.Push(1);", "    s.Push(2);", "    s.Pop();", "    Console.WriteLine(s);", "}"],
  steps: [step(1, []), step(3, [stack([])]), step(4, [stack([])]), step(5, [stack(["1"])]), step(6, [stack(["2", "1"])]), step(7, [stack(["1"])]), step(8, [stack(["1"])], "[1]\n")],
};

describe("V4 — what moved", () => {
  it("a stack push enters from the top, a pop leaves with its value; a queue insert enters at the end, a remove leaves the head", () => {
    expect(motionOf(step(1, [stack(["1"])]), step(2, [stack(["2", "1"])])).get(1)).toEqual({ enter: true });
    expect(motionOf(step(1, [stack(["2", "1"])]), step(2, [stack(["1"])])).get(1)).toEqual({ leaving: "2" });
    expect(motionOf(step(1, [queue(["a"])]), step(2, [queue(["a", "b"])])).get(2)).toEqual({ enter: true });
    expect(motionOf(step(1, [queue(["a", "b"])]), step(2, [queue(["b"])])).get(2)).toEqual({ leaving: "a" });
    expect(motionOf(step(1, [stack(["1"])]), step(2, [stack(["3", "2", "1"])])).size).toBe(0);       // two at once: no animation
    expect(motionOf(step(1, [stack(["1"])]), step(2, [stack(["9"])])).size).toBe(0);                 // replaced: no animation
    expect(motionOf(undefined, step(1, [stack(["1"])])).size).toBe(0);
  });
  it("a chain cell / tree node that did not exist one step before is fresh; structure steps; the next breakpoint", () => {
    const n = (id: number, next: number | null): DsObj => ({ id, k: "node", v: String(id), next });
    expect([...freshOf(step(1, [n(1, null)]), step(2, [n(2, 1), n(1, null)]))]).toEqual([2]);
    expect(structureSteps(TRACE)).toEqual([0, 1, 3, 4, 5, 6]);                                          // step 2 (x = 5) changes nothing
    expect(nextBreak(TRACE, 0, new Set([6]))).toBe(4);
    expect(nextBreak(TRACE, 4, new Set([6]))).toBeNull();
    expect(nextBreak(TRACE, 0, new Set([4]), structureSteps(TRACE))).toBeNull();                    // line 4 is not a structure step
  });
});

const counter = () => screen.getByText((_, el) => el?.className === "learning-trace-counter").textContent!.replace(/\s+/g, " ").trim();

describe("V4 — the player", () => {
  it("▶ plays one step per tick at the chosen speed and stops at the last step", () => {
    vi.useFakeTimers();
    render(<LabTraceView trace={TRACE} epoch={1} />);
    expect(counter()).toBe("الخطوة 1 / 7");
    fireEvent.change(screen.getByLabelText("السرعة"), { target: { value: "fast" } });
    fireEvent.click(screen.getByRole("button", { name: "▶ تشغيل تلقائي" }));
    act(() => { vi.advanceTimersByTime(SPEEDS.fast); });
    expect(counter()).toBe("الخطوة 2 / 7");
    for (let i = 0; i < 10; i++) act(() => { vi.advanceTimersByTime(SPEEDS.fast); });
    expect(counter()).toBe("الخطوة 7 / 7");
    expect(screen.getByRole("button", { name: "▶ تشغيل تلقائي" })).toBeTruthy();                        // stopped by itself
  });

  it("a breakpoint is toggled on a line number; play stops AT it; «إلى نقطة التوقف التالية» jumps to it", () => {
    vi.useFakeTimers();
    render(<LabTraceView trace={TRACE} epoch={1} />);
    const bp = screen.getByRole("button", { name: "نقطة توقّف على السطر 6" });
    fireEvent.click(bp);
    expect(bp.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "▶ تشغيل تلقائي" }));
    for (let i = 0; i < 10; i++) act(() => { vi.advanceTimersByTime(SPEEDS.normal); });
    expect(counter()).toBe("الخطوة 5 / 7");                                                             // the step on line 6
    expect(screen.getByText("توقف عند نقطة التوقف على السطر 6.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "من البداية" }));
    fireEvent.click(screen.getByRole("button", { name: "إلى نقطة التوقف التالية" }));
    expect(counter()).toBe("الخطوة 5 / 7");
    fireEvent.click(screen.getByRole("button", { name: "إلى نقطة التوقف التالية" }));
    expect(screen.getByText("لا نقطة توقّف بعد هذه الخطوة.")).toBeTruthy();
  });

  it("«عمليات المباني فقط» walks only the steps where a structure changed", () => {
    render(<LabTraceView trace={TRACE} epoch={1} />);
    fireEvent.click(screen.getByLabelText("عمليات المباني فقط"));
    const next = () => fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    next(); expect(counter()).toBe("الخطوة 2 / 7");
    next(); expect(counter()).toBe("الخطوة 4 / 7");                                                     // step 3 (int x = 5) is skipped
  });

  it("motion: a push enters, a pop leaves with its value; none with prefers-reduced-motion", () => {
    const { container } = render(<LabTraceView trace={TRACE} epoch={1} />);
    const next = () => fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    next(); next(); next();                                                                            // step 4: push 1
    expect(container.querySelector(".lab-trace.has-motion .is-enter.is-from-top")).toBeTruthy();
    next(); next();                                                                                    // step 6: pop
    const ghost = container.querySelector(".is-leave.is-to-top");
    expect(ghost?.textContent).toBe("2");
    cleanup();
    vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q.includes("prefers-reduced-motion"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })));
    const again = render(<LabTraceView trace={TRACE} epoch={1} />);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    expect(again.container.querySelector(".lab-trace.has-motion")).toBeNull();
    expect(again.container.querySelector(".is-enter")).toBeNull();
  });

  it("«توسيع» shows the same player in a wide window, at the same step; closing brings it back", () => {
    render(<LabTraceView trace={TRACE} epoch={1} />);
    fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    fireEvent.click(screen.getByRole("button", { name: "توسيع" }));
    const dialog = screen.getByRole("dialog", { name: "التشغيل المرئي" });
    expect(within(dialog).getByTestId("csharp-trace-wide")).toBeTruthy();
    expect(dialog.className).toContain("lab-trace-dialog");
    expect(counter()).toBe("الخطوة 2 / 7");
    fireEvent.click(within(dialog).getByRole("button", { name: "إغلاق" }));
    expect(screen.queryByRole("dialog", { name: "التشغيل المرئي" })).toBeNull();
    expect(screen.getByTestId("csharp-trace")).toBeTruthy();
    expect(counter()).toBe("الخطوة 2 / 7");
  });
});

describe("V4 — the course's own trace activity is unchanged (pin)", () => {
  it("no breakpoint toggles, no motion marks, its own buttons", () => {
    const { container } = render(<DsTraceView cfg={TRACE} epoch={0} />);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    expect(container.querySelector("button.learning-trace-lineno")).toBeNull();
    expect(container.querySelector(".is-enter, .is-leave")).toBeNull();
    expect(screen.getByRole("button", { name: "الخطوة السابقة" })).toBeTruthy();
  });
});
