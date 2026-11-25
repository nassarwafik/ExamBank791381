// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { readLabTrace } from "./labTrace";
import LabTraceView from "./LabTraceView";
import type { DsTrace } from "../learning/activities/ds";
import { traceMethods, traceTable, traceTableText } from "./traceInsights";
import { resetDeviceLabForTests, DESKTOP_QUERY } from "./deviceCSharpLab";

// Visual lab V16 (docs/enterprise-csharp-visual-lab-plan.md §26) — «جدول التتبّع» of the methods the run calls:
//   • traceMethods: every method that runs, the one the run starts in first;
//   • traceTable(trace, upTo, method): the steps while THAT method runs; each call numbered in the order the calls began (a
//     recursion's too), its depth, the value it returns; «changed» against the same call's previous row only;
//   • the player: a picker «العملية» above the table when more than one method runs; the method the run starts in by default.

afterEach(() => { cleanup(); resetDeviceLabForTests(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
beforeEach(() => vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q === DESKTOP_QUERY, media: q, addEventListener() {}, removeEventListener() {} }))));

const SOURCE = [
  "class Program", "{", "    static int Fact(int n)", "    {", "        if (n <= 1) return 1;", "        return n * Fact(n - 1);", "    }",
  "    static void Main()", "    {", "        int f = Fact(2);", "        Console.WriteLine(f);", "    }", "}",
].join("\n");
const v = (s: string) => ({ t: "v", s });
const main = (vars: unknown[] = []) => ({ name: "Main", call: 1, vars });
const fact = (call: number, n: string) => ({ name: "Fact", call, vars: [["n", v(n)]] });
const STEPS = [
  { line: 8, note: "تبدأ العملية `Main`.", frames: [main()], objs: [], out: "" },
  { line: 3, note: "", frames: [main(), fact(2, "2")], objs: [], out: "" },
  { line: 5, note: "الشرط `n <= 1` غير صحيح.", frames: [main(), fact(2, "2")], objs: [], out: "" },
  { line: 3, note: "", frames: [main(), fact(2, "2"), fact(3, "1")], objs: [], out: "" },
  { line: 5, note: "الشرط `n <= 1` صحيح.", frames: [main(), fact(2, "2"), fact(3, "1")], objs: [], out: "" },
  { line: 5, note: "العملية تُعيد `1`.", frames: [main(), fact(2, "2"), fact(3, "1")], objs: [], out: "", ret: "1" },
  { line: 6, note: "العملية تُعيد `2`.", frames: [main(), fact(2, "2")], objs: [], out: "", ret: "2" },
  { line: 10, note: "", frames: [main([["f", v("2")]])], objs: [], out: "" },
  { line: 11, note: "", frames: [main([["f", v("2")]])], objs: [], out: "2\n" },
  { line: 12, note: "تنتهي العملية `Main`.", frames: [main([["f", v("2")]])], objs: [], out: "2\n" },
];
const TRACE = readLabTrace({ status: "success", stdout: "2\n", stderr: "", steps: STEPS }, SOURCE, "").trace as DsTrace;

describe("V16 — the table of a called method", () => {
  it("the methods that run, the one the run starts in first", () => {
    expect(TRACE).not.toBeNull();
    expect(traceMethods(TRACE)).toEqual(["Main", "Fact"]);
  });

  it("Fact: its steps only, each call numbered with its depth, the value it returns; «changed» against the same call", () => {
    const t = traceTable(TRACE, TRACE.steps.length - 1, "Fact");
    expect(t).toMatchObject({ method: "Fact", called: true, columns: ["n"], clipped: false });
    expect(t.rows.map(r => [r.step, r.call, r.depth, r.cells[0], r.ret])).toEqual([
      [1, 1, 1, "2", null],     // Fact(2) begins
      [2, 1, 1, "2", null],     // its condition (false)
      [3, 2, 2, "1", null],     // Fact(1) — the second call, one deeper
      [4, 2, 2, "1", null],     // its condition (true)
      [5, 2, 2, "1", "1"],      // Fact(1) returns 1
      [6, 1, 1, "2", "2"],      // back in the first call: Fact(2) returns 2
    ]);
    expect(t.rows[2].changed).toEqual([true]);                 // a new call: its value is new
    expect(t.rows[5].changed).toEqual([false]);                // n is still 2 in the FIRST call (not «changed» from the second's 1)
    expect(t.rows[1].test).toMatchObject({ text: "n <= 1", value: false, withValues: "2 <= 1" });
    expect(traceTable(TRACE, 3, "Fact").rows.map(r => r.step)).toEqual([1, 2, 3]);   // built up to the step shown
  });

  it("Main is unchanged: no call columns; a call it makes interrupts nothing", () => {
    const t = traceTable(TRACE, TRACE.steps.length - 1);
    expect(t).toMatchObject({ method: "Main", called: false, columns: ["f"] });
    expect(t.rows.map(r => [r.step, r.cells[0], r.printed])).toEqual([[7, "2", ""], [8, "2", "2\n"]]);
    expect(t.rows.every(r => r.ret === null)).toBe(true);
    expect(traceTable(TRACE, 9, "Main")).toEqual(t);
  });

  it("copied as text: a called method's table carries its call, depth and return columns", () => {
    const lines = traceTableText(traceTable(TRACE, 6, "Fact")).split("\n");
    expect(lines[0]).toBe("الخطوة\tالسطر\tالاستدعاء\tالعمق\tn\tالشرط\tتُعيد\tالناتج");
    expect(lines[5]).toBe("6\t5\t2\t2\t1\t\t1\t");
    expect(traceTableText(traceTable(TRACE, 9)).split("\n")[0]).toBe("الخطوة\tالسطر\tf\tالشرط\tالناتج");
  });
});

describe("V16 — the player's picker «العملية»", () => {
  it("offered when more than one method runs; Main by default; Fact shows its calls and what they return", () => {
    render(<LabTraceView trace={TRACE} epoch={1} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "جدول التتبّع" }));
    fireEvent.keyDown(document.body, { key: "End" });
    const table = () => screen.getByTestId("lab-trace-table");
    const picker = within(table()).getByTestId("lab-trace-table-method") as HTMLSelectElement;
    expect([...picker.options].map(o => o.value)).toEqual(["Main", "Fact"]);
    expect(picker.value).toBe("Main");
    expect(within(table()).queryByRole("columnheader", { name: "الاستدعاء" })).toBeNull();
    fireEvent.change(picker, { target: { value: "Fact" } });
    expect(within(table()).getByRole("columnheader", { name: "الاستدعاء" })).toBeTruthy();
    expect(within(table()).getByRole("columnheader", { name: "تُعيد" })).toBeTruthy();
    const rows = within(table()).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(6);
    expect(rows[4].textContent).toContain("#2");
    expect(rows[5].querySelector(".lab-tt-ret")?.textContent).toBe("2");
    fireEvent.click(within(rows[2]).getByRole("button", { name: "انتقل إلى الخطوة 4" }));   // a row still takes you to its step
    expect(within(screen.getByTestId("lab-trace-nav")).getByText(/\d+ \/ 10/).textContent).toBe("4 / 10");
    expect(within(table()).getAllByRole("row")).toHaveLength(1 + 3);                       // …and the table is built up to it
  });

  it("not offered when only one method runs", () => {
    const one = readLabTrace({ status: "success", stdout: "", stderr: "", steps: [STEPS[0], { ...STEPS[7], frames: [main([["f", v("1")]])] }] }, SOURCE, "").trace as DsTrace;
    render(<LabTraceView trace={one} epoch={1} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "جدول التتبّع" }));
    expect(within(screen.getByTestId("lab-trace-table")).queryByTestId("lab-trace-table-method")).toBeNull();
  });
});
