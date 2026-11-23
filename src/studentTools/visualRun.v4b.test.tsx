// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, act, waitFor } from "@testing-library/react";
import { changesStructures, isStop, nextBreak, structureSteps, PLAY_SPEEDS as SPEEDS } from "../learning/activities/dsMotion";
import { readDsTrace, type DsStep, type DsTrace, type DsObj } from "../learning/activities/ds";
import DsTraceView from "../learning/activities/DsTraceView";
import LabTraceView from "./LabTraceView";
import { readLabTrace, type LabTraceResult } from "./labTrace";
import { bookDeviceRunner, resetDeviceLabForTests, DESKTOP_QUERY } from "./deviceCSharpLab";

// Visual lab V4 part 2 (docs/enterprise-csharp-visual-lab-plan.md §12):
//   • Viz.Pause("…") → a step marked `pause` (read strictly, only `true`): a stop for the player like a breakpoint; Viz.Show("…") titles
//     a step (its note);
//   • «اكشف الداخل»: the same program recorded again with `{ inside: true }` — the step and the breakpoints stay; a failure keeps the
//     drawing and says so; no checkbox without a way to re-record;
//   • «توقّع قبل أن ترى»: a step whose structures changed is covered until «اكشف»; auto-play halts there;
//   • the course's own traces and trace view are unchanged (no `pause` key, nothing covered) — a pin.
// The recorder's side (Viz, inside) is proven in Chromium by tools/csharp-lab/golden.mjs.

afterEach(() => { cleanup(); resetDeviceLabForTests(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
beforeEach(() => vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q === DESKTOP_QUERY, media: q, addEventListener() {}, removeEventListener() {} }))));

const main = (vars: DsStep["frames"][0]["vars"] = []) => [{ name: "Main", vars }];
const step = (line: number, objs: DsObj[], extra: Partial<DsStep> = {}): DsStep =>
  ({ line, note: "", frames: main(objs.length ? [["s", { t: "ref", id: objs[0].id }]] : []), objs, out: "", error: false, ...extra });
const stack = (items: string[]): DsObj => ({ id: 1, k: "stack", items });
// 1 Main · 3 new stack · 4 push 1 · 5 Viz.Pause · 6 push 2 · 7 x = 5 · 8 pop
const TRACE: DsTrace = {
  lines: ["static void Main()", "{", "    Stack<int> s = new Stack<int>();", "    s.Push(1);", "    Viz.Pause(\"قبل الثانية\");", "    s.Push(2);", "    int x = 5;", "    s.Pop();", "}"],
  steps: [step(1, []), step(3, [stack([])]), step(4, [stack(["1"])]), step(5, [stack(["1"])], { pause: true, note: "قبل الثانية" }),
    step(6, [stack(["2", "1"])]), step(7, [stack(["2", "1"])]), step(8, [stack(["1"])])],
};
const counter = () => screen.getByText((_, el) => el?.className === "learning-trace-counter").textContent!.replace(/\s+/g, " ").trim();

describe("V4b — Viz.Pause and Viz.Show, read and kept", () => {
  const SOURCE = "static void Main()\n{\n    Viz.Show(\"البداية\");\n    Viz.Pause();\n}";
  const raw = (pause: unknown) => ({ status: "success", stdout: "", stderr: "", steps: [
    { line: 1, note: "", frames: main(), objs: [], out: "" },
    { line: 3, note: "البداية", frames: main(), objs: [], out: "" },
    { line: 4, note: "", frames: main(), objs: [], out: "", pause },
  ] });
  it("the recorder's `pause: true` reaches the step (and only `true`); the note of Viz.Show is the step's note", () => {
    const t = readLabTrace(raw(true), SOURCE, "").trace!;
    expect(t.steps.map(s => s.pause === true)).toEqual([false, false, true]);
    expect(t.steps[1].note).toBe("البداية");
    for (const odd of ["true", 1, {}, null]) expect(readLabTrace(raw(odd), SOURCE, "").trace!.steps[2].pause).toBeUndefined();
  });
  it("pin: a course trace without `p` reads exactly as before (no `pause` key at all)", () => {
    const t = readDsTrace({ code: "a\nb", out: "", steps: [{ l: 1, n: "", f: [{ name: "Main", vars: [] }], h: [], o: 0 }, { l: 2, n: "", o: 0 }] })!;
    expect(t.steps.every(s => !("pause" in s))).toBe(true);
    // the course reader's own check: only `p: true` is a pause (whatever reaches it, not only through the lab's reader)
    const withP = (p: unknown) => readDsTrace({ code: "a", out: "", steps: [{ l: 1, n: "", f: [{ name: "Main", vars: [] }], h: [], o: 0, p }] })!.steps[0].pause;
    expect(withP(true)).toBe(true);
    for (const odd of ["true", 1, {}]) expect(withP(odd)).toBeUndefined();
  });
  it("a pause is a stop like a breakpoint; a structure change is what «توقّع» covers", () => {
    expect(isStop(TRACE.steps[3], new Set())).toBe(true);
    expect(isStop(TRACE.steps[4], new Set())).toBe(false);
    expect(isStop(TRACE.steps[4], new Set([6]))).toBe(true);
    expect(nextBreak(TRACE, 0, new Set())).toBe(3);
    expect(nextBreak(TRACE, 3, new Set())).toBeNull();
    expect(TRACE.steps.map((_, i) => changesStructures(TRACE, i))).toEqual([false, true, true, false, true, false, true]);
    expect(structureSteps(TRACE)).not.toContain(3);                     // the pause step changes nothing …
  });
});

describe("V4b — the player stops at Viz.Pause", () => {
  it("▶ halts AT the Viz.Pause step and says so; its note is shown; «إلى نقطة التوقف التالية» goes there with no breakpoint", () => {
    vi.useFakeTimers();
    render(<LabTraceView trace={TRACE} epoch={1} />);
    fireEvent.click(screen.getByRole("button", { name: "▶ تشغيل تلقائي" }));
    for (let i = 0; i < 10; i++) act(() => { vi.advanceTimersByTime(SPEEDS.normal); });
    expect(counter()).toBe("الخطوة 4 / 7");
    expect(screen.getByText("توقف عند Viz.Pause على السطر 5.")).toBeTruthy();
    expect(screen.getByText("قبل الثانية")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "من البداية" }));
    fireEvent.click(screen.getByRole("button", { name: "إلى نقطة التوقف التالية" }));
    expect(counter()).toBe("الخطوة 4 / 7");
  });
  it("… and «عمليات المباني فقط» keeps the writer's pause in its walk", () => {
    render(<LabTraceView trace={TRACE} epoch={1} />);
    fireEvent.click(screen.getByLabelText(/عمليات المباني فقط/));
    const seen: string[] = [counter()];
    for (let i = 0; i < 6; i++) { fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" })); seen.push(counter()); }
    expect([...new Set(seen)]).toEqual(["الخطوة 1 / 7", "الخطوة 2 / 7", "الخطوة 3 / 7", "الخطوة 4 / 7", "الخطوة 5 / 7", "الخطوة 7 / 7"]);
  });
});

describe("V4b — «توقّع قبل أن ترى»", () => {
  it("a step whose structures changed is covered until «اكشف»; other steps are not; auto-play halts at a covered step", () => {
    vi.useFakeTimers();
    render(<LabTraceView trace={TRACE} epoch={1} />);
    fireEvent.click(screen.getByLabelText(/توقّع قبل أن ترى/));
    expect(screen.queryByTestId("lab-trace-guess")).toBeNull();               // step 1: nothing changed
    fireEvent.click(screen.getByRole("button", { name: "▶ تشغيل تلقائي" }));
    act(() => { vi.advanceTimersByTime(SPEEDS.normal); });
    expect(counter()).toBe("الخطوة 2 / 7");
    const guess = screen.getByTestId("lab-trace-guess");
    expect(guess.querySelector("svg")).toBeNull();                            // the stack is NOT drawn
    expect(screen.queryByRole("region", { name: "الكائنات" })).toBeNull();
    expect(screen.queryByRole("region", { name: "المتغيّرات" })).toBeNull();     // «s → راصّة [1]» would give it away
    act(() => { vi.advanceTimersByTime(SPEEDS.normal * 3); });
    expect(counter()).toBe("الخطوة 2 / 7");                                   // halted at it
    fireEvent.click(within(guess).getByRole("button", { name: "اكشف" }));
    expect(screen.queryByTestId("lab-trace-guess")).toBeNull();
    expect(screen.getByRole("region", { name: "مباني المعطيات" }).querySelector("svg")).toBeTruthy();
    expect(screen.getByRole("region", { name: "المتغيّرات" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "الخطوة السابقة" }));
    fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    expect(screen.queryByTestId("lab-trace-guess")).toBeNull();               // revealed stays revealed
    fireEvent.click(screen.getByLabelText(/توقّع قبل أن ترى/));
    fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    expect(screen.queryByTestId("lab-trace-guess")).toBeNull();               // off → nothing covered
  });
  it("pin: the course's own trace view never covers anything", () => {
    render(<DsTraceView cfg={TRACE} epoch={1} />);
    fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    expect(screen.queryByTestId("lab-trace-guess")).toBeNull();
    expect(screen.getByRole("region", { name: "المتغيّرات" })).toBeTruthy();
  });
});

describe("V4b — «اكشف الداخل»", () => {
  const INSIDE: DsTrace = { ...TRACE, steps: TRACE.steps.map(s => ({ ...s, objs: s.objs.length ? [{ id: 1, k: "obj", type: "Stack<int>", fields: [["Head", { t: "v", s: "null" }]] } as DsObj] : [] })) };
  const answer = (trace: DsTrace | null, status: LabTraceResult["status"] = "success"): LabTraceResult => ({ status, stdout: "", stderr: "", trace, clipped: false });

  it("re-records with { inside: true }; the step and the breakpoints stay; turning it off records the usual drawing again", async () => {
    const retrace = vi.fn(async (o: { inside?: boolean }) => answer(o.inside ? INSIDE : TRACE));
    render(<LabTraceView trace={TRACE} epoch={1} retrace={retrace} />);
    fireEvent.click(screen.getByRole("button", { name: "نقطة توقّف على السطر 6" }));
    for (let i = 0; i < 2; i++) fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    fireEvent.click(screen.getByLabelText(/اكشف الداخل/));
    await screen.findByText(/معروضان من الداخل/);
    expect(retrace.mock.calls[0][0]).toEqual({ inside: true });
    expect(counter()).toBe("الخطوة 3 / 7");
    expect(screen.getByRole("region", { name: "الكائنات" }).textContent).toContain("Stack<int>");
    expect(screen.getByRole("button", { name: "نقطة توقّف على السطر 6" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText(/اكشف الداخل/) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText(/اكشف الداخل/));
    await screen.findByText(/رسمهما المعتاد/);
    expect(retrace.mock.calls[1][0]).toEqual({ inside: false });
    expect(screen.queryByRole("region", { name: "الكائنات" })).toBeNull();
  });

  it("a re-recording that fails (no trace, or thrown) keeps the drawing it had and says so", async () => {
    const retrace = vi.fn().mockResolvedValueOnce(answer(null, "compile-error")).mockRejectedValueOnce(new Error("x"));
    render(<LabTraceView trace={TRACE} epoch={1} retrace={retrace} />);
    fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    fireEvent.click(screen.getByLabelText(/اكشف الداخل/));
    await screen.findByText(/تعذّر التسجيل الآن، فبقي العرض كما كان/);
    expect((screen.getByLabelText(/اكشف الداخل/) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole("region", { name: "مباني المعطيات" }).querySelector("svg")).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/اكشف الداخل/));
    await waitFor(() => expect(retrace).toHaveBeenCalledTimes(2));
    await screen.findByText("تعذّر التسجيل الآن، فبقي العرض كما كان.");
    expect((screen.getByLabelText(/اكشف الداخل/) as HTMLInputElement).checked).toBe(false);
  });

  it("no way to re-record → no «اكشف الداخل»", () => {
    render(<LabTraceView trace={TRACE} epoch={1} />);
    expect(screen.queryByLabelText(/اكشف الداخل/)).toBeNull();
  });

  it("the transport: the trace message carries options {\"rich\":true,\"inside\":true} (V5: always rich)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, library: "public class Stack<T> { }", available: true }), { status: 200 })));
    const r = bookDeviceRunner("899271d", { Authorization: "Bearer T" }, { visual: true });
    void r.trace!("static void Main() { }", "", undefined, { inside: true });
    const frame = await waitFor(() => { const f = document.querySelector<HTMLIFrameElement>('iframe[data-testid="teacher-csharp-lab"]'); expect(f).toBeTruthy(); return f!; });
    const win = { postMessage: vi.fn() };
    Object.defineProperty(frame, "contentWindow", { value: win, configurable: true });
    window.dispatchEvent(new MessageEvent("message", { data: { type: "lab-ready" }, origin: "null", source: win as unknown as MessageEventSource }));
    await waitFor(() => expect(win.postMessage).toHaveBeenCalled());
    expect((win.postMessage.mock.calls[0] as unknown as [Record<string, unknown>])[0]).toMatchObject({ type: "trace", options: "{\"rich\":true,\"inside\":true}" });
  });
});
