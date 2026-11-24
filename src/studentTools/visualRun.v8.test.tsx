// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { readDsTrace, type DsTrace, type DsStep, type DsFrame } from "../learning/activities/ds";
import { readLabTrace } from "./labTrace";
import { callTreeOf, layoutCalls, callLabel, CALL_TREE_MAX } from "./callTree";
import LabTraceView from "./LabTraceView";

// Visual lab V8 (docs/enterprise-csharp-visual-lab-plan.md §17) — «شجرة الاستدعاءات», drawn ONLY from the recorder's own data (rich
// mode): each frame's `call` number and the returning step's `ret`:
//   • the reader: `call` / `ret` are read strictly, and only in a rich trace (a course trace with them is unreadable — a pin);
//   • the tree at a step: calls started so far, each under the frame below it, its arguments, RUNNING / WAITING / DONE with the value
//     it returned; nothing for a trace without call numbers; at most CALL_TREE_MAX calls, said;
//   • the player: «شجرة الاستدعاءات» only when the run called something besides its entry; the tree follows the step shown; a covered
//     step («توقّع قبل أن ترى») covers the tree too.
afterEach(cleanup);
const frame = (name: string, call: number, vars: DsFrame["vars"] = []): DsFrame => ({ name, call, vars });
const n = (v: string): DsFrame["vars"] => [["n", { t: "v", s: v }]];
const MAIN = frame("Main", 1);
const step = (line: number, frames: DsFrame[], ret?: string): DsStep => ({ line, note: "", frames, objs: [], out: "", error: false, ...(ret !== undefined ? { ret } : {}) });
// Fib(2): Main → Fib(2) → Fib(1) = 1, Fib(0) = 0 → Fib(2) = 1
const FIB: DsTrace = {
  lines: ["static int Fib(int n)", "{", "    if (n < 2) return n;", "    return Fib(n - 1) + Fib(n - 2);", "}", "static void Main()", "{", "    Console.WriteLine(Fib(2));", "}"],
  steps: [
    step(6, [MAIN]),
    step(1, [MAIN, frame("Fib", 2, n("2"))]),
    step(1, [MAIN, frame("Fib", 2, n("2")), frame("Fib", 3, n("1"))]),
    step(3, [MAIN, frame("Fib", 2, n("2")), frame("Fib", 3, n("1"))], "1"),
    step(1, [MAIN, frame("Fib", 2, n("2")), frame("Fib", 4, n("0"))]),
    step(3, [MAIN, frame("Fib", 2, n("2")), frame("Fib", 4, n("0"))], "0"),
    step(4, [MAIN, frame("Fib", 2, n("2"))], "1"),
    step(8, [MAIN]),
  ],
};

describe("V8 — the reader", () => {
  const compact = (f: unknown, extra: Record<string, unknown> = {}) => ({ code: "a\nb", out: "", steps: [{ l: 1, n: "", f, h: [], o: 0, ...extra }] });
  it("call and ret are read in a rich trace", () => {
    const t = readDsTrace(compact([{ name: "Main", call: 1, vars: [] }], { r: "6" }), undefined, true)!;
    expect(t.steps[0].frames[0].call).toBe(1);
    expect(t.steps[0].ret).toBe("6");
  });
  it("pin: without rich (every course trace) a call number or a returned value makes the trace unreadable", () => {
    expect(readDsTrace(compact([{ name: "Main", call: 1, vars: [] }]))).toBeNull();
    expect(readDsTrace(compact([{ name: "Main", vars: [] }], { r: "6" }))).toBeNull();
    expect(readDsTrace(compact([{ name: "Main", vars: [] }]))).not.toBeNull();
  });
  it("strict: a call number that is not a positive whole number → unreadable", () => {
    for (const call of [0, -1, 1.5, "1", null]) expect(readDsTrace(compact([{ name: "Main", call, vars: [] }]), undefined, true)).toBeNull();
    expect(readDsTrace(compact([{ name: "Main", vars: [] }], { r: 6 }), undefined, true)).toBeNull();
  });
  it("the lab's reader keeps call and ret (a long value clipped)", () => {
    const r = readLabTrace({ status: "success", stdout: "", stderr: "", steps: [{ line: 1, note: "", frames: [{ name: "Main", call: 1, vars: [] }], objs: [], out: "", ret: "x".repeat(200) }] }, "a", "");
    expect(r.trace!.steps[0].frames[0].call).toBe(1);
    expect(r.trace!.steps[0].ret!.length).toBe(80);
  });
});

describe("V8 — the tree at a step", () => {
  it("calls appear as they start, each under the frame below it, with its arguments", () => {
    const t = callTreeOf(FIB, 2)!;
    expect(t.roots).toEqual([1]);
    expect([...t.nodes.values()].map(c => [c.call, callLabel(c), c.parent, c.state])).toEqual([
      [1, "Main()", null, "waiting"], [2, "Fib(2)", 1, "waiting"], [3, "Fib(1)", 2, "running"]]);
  });
  it("a finished call shows the value it returned; the last step: all done", () => {
    const t = callTreeOf(FIB, 5)!;
    expect(t.nodes.get(3)).toMatchObject({ state: "done", ret: "1" });
    expect(t.nodes.get(4)).toMatchObject({ state: "running", ret: "0" });
    expect(t.nodes.get(2)!.children).toEqual([3, 4]);
    const end = callTreeOf(FIB, 7)!;
    expect([...end.nodes.values()].map(c => c.state + (c.ret ?? ""))).toEqual(["running", "done1", "done1", "done0"]);
  });
  it("no call numbers (a course trace) → no tree; more than the limit → the first ones, said", () => {
    expect(callTreeOf({ ...FIB, steps: FIB.steps.map(s => ({ ...s, frames: s.frames.map(({ name, vars }) => ({ name, vars })) })) }, 3)).toBeNull();
    const many = Array.from({ length: CALL_TREE_MAX + 5 }, (_, i) => step(1, [MAIN, frame("F", i + 2)]));
    const big = callTreeOf({ lines: ["a"], steps: many }, many.length - 1)!;
    expect(big.nodes.size).toBe(CALL_TREE_MAX);
    expect(big.total).toBe(CALL_TREE_MAX + 6);
    expect(big.clipped).toBe(true);
  });
  it("layout: leaves in the order the calls started, a parent centred over its children", () => {
    const pos = layoutCalls(callTreeOf(FIB, 7)!);
    expect(pos.get(3)).toEqual({ x: 0, depth: 2 });
    expect(pos.get(4)).toEqual({ x: 1, depth: 2 });
    expect(pos.get(2)).toEqual({ x: 0.5, depth: 1 });
    expect(pos.get(1)).toEqual({ x: 0.5, depth: 0 });
  });
});

describe("V8 — the player", () => {
  const counter = () => screen.getByText((_, el) => el?.className === "learning-trace-counter").textContent!.replace(/\s+/g, " ").trim();
  it("«شجرة الاستدعاءات» follows the step shown: what runs, what waits, what returned what", () => {
    render(<LabTraceView trace={FIB} epoch={1} />);
    fireEvent.click(screen.getByLabelText(/شجرة الاستدعاءات/));
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    expect(counter()).toBe("الخطوة 6 / 8");
    const img = screen.getByRole("img", { name: /^شجرة الاستدعاءات: 4 استدعاءً حتى الآن، يعمل الآن Fib\(0\)\. Fib\(1\) أعاد 1/ });
    expect(img).toBeTruthy();
    expect(screen.getByTestId("lab-call-tree").querySelectorAll(".lab-call.is-done").length).toBe(1);
    expect(screen.getByTestId("lab-call-tree").querySelectorAll(".lab-call.is-waiting").length).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "من البداية" }));
    expect(screen.getByTestId("lab-call-tree").querySelectorAll(".lab-call").length).toBe(1);          // only Main so far
  });
  it("no choice when the run called nothing besides its entry, or has no call numbers", () => {
    render(<LabTraceView trace={{ lines: ["a"], steps: [step(1, [MAIN]), step(1, [MAIN])] }} epoch={1} />);
    expect(screen.queryByLabelText(/شجرة الاستدعاءات/)).toBeNull();
    cleanup();
    render(<LabTraceView trace={{ ...FIB, steps: FIB.steps.map(s => ({ ...s, frames: s.frames.map(({ name, vars }) => ({ name, vars })) })) }} epoch={1} />);
    expect(screen.queryByLabelText(/شجرة الاستدعاءات/)).toBeNull();
  });
  it("a covered step («توقّع قبل أن ترى») covers the tree too", () => {
    const withObjs: DsTrace = { ...FIB, steps: FIB.steps.map((s, i) => ({ ...s, objs: i >= 2 ? [{ id: 9, k: "stack", items: [String(i)] }] : [] })) };
    render(<LabTraceView trace={withObjs} epoch={1} />);
    fireEvent.click(screen.getByLabelText(/شجرة الاستدعاءات/));
    fireEvent.click(screen.getByLabelText(/توقّع قبل أن ترى/));
    fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    expect(screen.getByTestId("lab-trace-guess")).toBeTruthy();
    expect(screen.queryByTestId("lab-call-tree")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "اكشف" }));
    expect(screen.getByTestId("lab-call-tree")).toBeTruthy();
  });
});
