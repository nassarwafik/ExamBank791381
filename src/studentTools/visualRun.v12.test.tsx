// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { readDsTrace, type DsCallSite, type DsFrame, type DsStep, type DsTrace, type DsVal } from "../learning/activities/ds";
import DsTraceView from "../learning/activities/DsTraceView";
import LabTraceView from "./LabTraceView";
import { readLabTrace } from "./labTrace";
import { callFlowOf, flowSentence, siteOf, FLOW_FRAMES } from "./callFlow";
import { resetDeviceLabForTests, DESKTOP_QUERY } from "./deviceCSharpLab";

// Visual lab V12 (docs/enterprise-csharp-visual-lab-plan.md §22) — «العمليات والدوال» drawn (rich traces only):
//   • the reader: a frame's `from` (the caller's line) and the trace's `calls` (each call site: lines, method, per parameter how it is
//     passed, the argument as written, the caller's variable) — strictly, and ONLY in a rich trace (pins);
//   • the flow: which call made a frame (an ambiguous line is no guess), a parameter's kind and argument, the arrows — a ref / out
//     parameter IS the caller's variable, a by-value parameter got a COPY of the variable named — and a value returned to the caller;
//   • in the player: «العمليات والدوال الآن» while a method called another (one img in words), covered by «توقّع قبل أن ترى»; the
//     course's view passes no flow (pin).
// The recorder's side (the table as the compiler binds it, the caller lines, the returns) is proven by tools/csharp-lab/golden.mjs.

afterEach(() => { cleanup(); resetDeviceLabForTests(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
beforeEach(() => vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q === DESKTOP_QUERY, media: q, addEventListener() {}, removeEventListener() {} }))));

const v = (s: string): DsVal => ({ t: "v", s });
const text = (x: DsVal) => (x.t === "v" ? x.s : x.t);
// the golden program's sites (tools/csharp-lab/golden.mjs, V12): line 27 Max(a, 5), 28 Swap(ref a, ref b), 22 Fact(n - 1), 30 Fact(3)
const CALLS: DsCallSite[] = [
  { line: 27, stmt: 27, name: "Max", params: [{ name: "x", kind: "value", arg: "a", v: "a" }, { name: "y", kind: "value", arg: "5", v: null }] },
  { line: 28, stmt: 28, name: "Swap", params: [{ name: "a", kind: "ref", arg: "a", v: "a" }, { name: "b", kind: "ref", arg: "b", v: "b" }] },
  { line: 22, stmt: 22, name: "Fact", params: [{ name: "n", kind: "value", arg: "n - 1", v: null }] },
  { line: 30, stmt: 30, name: "Fact", params: [{ name: "n", kind: "value", arg: "3", v: null }] },
];
const frame = (name: string, vars: [string, DsVal][], from: number, call: number): DsFrame => ({ name, vars, from, call });
const step = (frames: DsFrame[], extra: Partial<DsStep> = {}): DsStep => ({ line: 1, note: "", frames, objs: [], out: "", error: false, ...extra });
const MAIN = (a = "3", b = "7") => frame("Main", [["a", v(a)], ["b", v(b)]], 0, 1);

describe("V12 — the reader", () => {
  const raw = (frames: unknown, top: Record<string, unknown> = {}) => ({ code: Array.from({ length: 30 }, (_, i) => "l" + i).join("\n"), out: "", steps: [{ l: 1, n: "", f: frames, h: [], o: 0 }], ...top });
  const RAW_CALLS = [[27, 27, "Max", [["x", "value", "a", "a"], ["y", "value", "5", null]]]];
  it("rich: a frame's caller line and the call sites are read", () => {
    const t = readDsTrace(raw([{ name: "Main", vars: [], call: 1, from: 0 }, { name: "Max", vars: [], call: 2, from: 27 }], { calls: RAW_CALLS }), undefined, true)!;
    expect(t.steps[0].frames.map(f => f.from)).toEqual([0, 27]);
    expect(t.calls).toEqual([CALLS[0]]);
  });
  it("pin: without rich (every course trace) either makes the trace unreadable", () => {
    expect(readDsTrace(raw([{ name: "Main", vars: [], from: 0 }]))).toBeNull();
    expect(readDsTrace(raw([{ name: "Main", vars: [] }], { calls: [] }))).toBeNull();
    expect(readDsTrace(raw([{ name: "Main", vars: [] }]))).not.toBeNull();
  });
  it("strict: an unknown passing kind, a line outside the program, more than 10 parameters, a negative caller line → unreadable", () => {
    const rich = (f: unknown, top?: Record<string, unknown>) => readDsTrace(raw(f, top), undefined, true);
    const main = [{ name: "Main", vars: [], from: 0 }];
    expect(rich(main, { calls: [[27, 27, "Max", [["x", "params", "a", null]]]] })).toBeNull();
    expect(rich(main, { calls: [[31, 27, "Max", []]] })).toBeNull();
    expect(rich(main, { calls: [[27, 27, "Max", Array.from({ length: 11 }, (_, i) => ["p" + i, "value", "1", null])]] })).toBeNull();
    expect(rich([{ name: "Main", vars: [], from: -1 }])).toBeNull();
    expect(rich(main, { calls: RAW_CALLS })).not.toBeNull();
  });
  it("the lab's reader keeps the caller lines and the call sites (an argument's text clipped)", () => {
    const long = "x".repeat(200);
    const r = readLabTrace({ status: "success", stdout: "", stderr: "", calls: [[1, 1, "F", [["p", "value", long, null]]]],
      steps: [{ line: 1, note: "", out: "", objs: [], frames: [{ name: "Main", vars: [], call: 1, from: 0 }, { name: "F", vars: [], call: 2, from: 1 }] }] }, "a\nb", "");
    expect(r.trace!.steps[0].frames[1].from).toBe(1);
    expect(r.trace!.calls![0].params[0].arg.length).toBe(80);
    expect(r.clipped).toBe(true);
  });
});

describe("V12 — the call flow", () => {
  it("Max(a, 5): x got a COPY of a (an arrow from a), y got 5 (no variable, no arrow); running on top", () => {
    const f = callFlowOf(step([MAIN(), frame("Max", [["x", v("3")], ["y", v("5")]], 27, 2)]), undefined, { calls: CALLS }, text)!;
    expect(f.frames.map(x => [x.name, x.running, x.site])).toEqual([["Max", true, "Max(a, 5)"], ["Main", false, null]]);
    expect(f.frames[0].vars.map(x => [x.name, x.param?.kind, x.param?.arg])).toEqual([["x", "value", "a"], ["y", "value", "5"]]);
    expect(f.links).toEqual([{ kind: "copy", callee: { frame: 1, name: "x" }, caller: { frame: 0, name: "a" } }]);
  });
  it("Swap(ref a, ref b): each parameter IS the caller's variable (two aliases)", () => {
    const f = callFlowOf(step([MAIN(), frame("Swap", [["a", v("3")], ["b", v("7")]], 28, 2)]), undefined, { calls: CALLS }, text)!;
    expect(f.links.map(l => [l.kind, l.callee.name, l.caller.name])).toEqual([["alias", "a", "a"], ["alias", "b", "b"]]);
    expect(f.frames[0].site).toBe("Swap(ref a, ref b)");
  });
  it("an out argument declared in the call (out int t): no arrow while the caller does not show t yet; the arrow once it does", () => {
    const calls: DsCallSite[] = [{ line: 29, stmt: 29, name: "Split", params: [{ name: "n", kind: "value", arg: "42", v: null }, { name: "tens", kind: "out", arg: "int t", v: "t" }] }];
    const split = frame("Split", [["n", v("42")], ["tens", v("4")]], 29, 2);
    expect(callFlowOf(step([MAIN(), split]), undefined, { calls }, text)!.links).toEqual([]);
    const withT = frame("Main", [["a", v("3")], ["t", v("4")]], 0, 1);
    expect(callFlowOf(step([withT, split]), undefined, { calls }, text)!.links).toEqual([{ kind: "alias", callee: { frame: 1, name: "tens" }, caller: { frame: 0, name: "t" } }]);
  });
  it("a recursion: each Fact frame from its own call (Fact(3) from Main, Fact(n - 1) from Fact); a value returned goes to the caller", () => {
    const s = step([frame("Main", [], 0, 1), frame("Fact", [["n", v("3")]], 30, 2), frame("Fact", [["n", v("2")]], 22, 3)], { ret: "2" });
    const f = callFlowOf(s, undefined, { calls: CALLS }, text)!;
    expect(f.frames.map(x => x.site)).toEqual(["Fact(n - 1)", "Fact(3)", null]);
    expect(f.returning).toEqual({ from: 2, to: 1, value: "2", site: "Fact(n - 1)" });
    expect(flowSentence(f, i => s.frames[i].name)).toContain("Fact تُعيد 2 إلى Fact.");
  });
  it("two different calls of one method on one line are not told apart: no site, no arrow (never a guess)", () => {
    const calls: DsCallSite[] = [{ line: 5, stmt: 5, name: "Max", params: [{ name: "x", kind: "value", arg: "a", v: "a" }] },
      { line: 5, stmt: 5, name: "Max", params: [{ name: "x", kind: "value", arg: "Max(a, b)", v: null }] }];
    expect(siteOf(calls, "Max", 5)).toBeNull();
    const f = callFlowOf(step([MAIN(), frame("Max", [["x", v("3")]], 5, 2)]), undefined, { calls }, text)!;
    expect([f.frames[0].site, f.links.length, f.frames[0].vars[0].param]).toEqual([null, 0, undefined]);
  });
  it("only the first method running → no flow; more than FLOW_FRAMES frames → the newest, the rest counted", () => {
    expect(callFlowOf(step([MAIN()]), undefined, { calls: CALLS }, text)).toBeNull();
    const deep = step([frame("Main", [], 0, 1), ...Array.from({ length: 11 }, (_, i) => frame("Fact", [["n", v(String(11 - i))]], i ? 22 : 30, i + 2))]);
    const f = callFlowOf(deep, undefined, { calls: CALLS }, text)!;
    expect([f.frames.length, f.hidden]).toEqual([FLOW_FRAMES, 12 - FLOW_FRAMES]);
  });
  it("a variable that changed in this step (the same call) is lit; a new call's variables are not «changed»", () => {
    const before = step([MAIN(), frame("Swap", [["a", v("3")], ["b", v("7")]], 28, 2)]);
    const f = callFlowOf(step([MAIN(), frame("Swap", [["a", v("7")], ["b", v("7")]], 28, 2)]), before, { calls: CALLS }, text)!;
    expect(f.frames[0].vars.map(x => x.changed)).toEqual([true, false]);
    const other = callFlowOf(step([MAIN(), frame("Swap", [["a", v("7")], ["b", v("7")]], 28, 3)]), before, { calls: CALLS }, text)!;
    expect(other.frames[0].vars.some(x => x.changed)).toBe(false);
  });
});

const LINES = Array.from({ length: 30 }, (_, i) => "line " + (i + 1));
const TRACE: DsTrace = { lines: LINES, calls: CALLS, steps: [
  { ...step([MAIN()]), line: 26 },
  { ...step([MAIN(), frame("Max", [["x", v("3")], ["y", v("5")]], 27, 2)]), line: 3 },
  { ...step([MAIN(), frame("Max", [["x", v("3")], ["y", v("5")]], 27, 2)], { ret: "5" }), line: 6 },
] };

describe("V12 — in the player", () => {
  it("«العمليات والدوال الآن» while Max runs: one img, the whole flow in words; none while only Main runs", () => {
    render(<LabTraceView trace={TRACE} epoch={1} />);
    expect(screen.queryByRole("region", { name: "الاستدعاءات" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    const img = within(screen.getByRole("region", { name: "الاستدعاءات" })).getByRole("img");
    expect(img.getAttribute("aria-label")).toContain("Max (تعمل الآن)، استُدعيت من السطر 27: Max(a, 5): x = 3 (نسخة من a)، y = 5 (نسخة من 5).");
    fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    expect(within(screen.getByRole("region", { name: "الاستدعاءات" })).getByRole("img").getAttribute("aria-label")).toContain("Max تُعيد 5 إلى Main.");
  });
  it("covered by «توقّع قبل أن ترى» on a covered step", () => {
    const withStack: DsTrace = { ...TRACE, steps: TRACE.steps.map((s, i) => ({ ...s, objs: i ? [{ id: 1, k: "stack", items: [String(i)] }] : [] })) };
    render(<LabTraceView trace={withStack} epoch={1} />);
    fireEvent.click(screen.getByLabelText(/توقّع قبل أن ترى/));
    fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    expect(screen.getByTestId("lab-trace-guess")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "الاستدعاءات" })).toBeNull();
  });
  it("pin: the course's trace view (no `flow`) draws no call flow", () => {
    render(<DsTraceView cfg={TRACE} epoch={1} at={1} controls={false} />);
    expect(screen.queryByRole("region", { name: "الاستدعاءات" })).toBeNull();
  });
});
