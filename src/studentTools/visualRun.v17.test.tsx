// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { readLabTrace } from "./labTrace";
import LabTraceView from "./LabTraceView";
import type { DsFrame, DsObj, DsTrace } from "../learning/activities/ds";
import { callReturns, conditionOf, fillValues } from "./traceInsights";
import { resetDeviceLabForTests, DESKTOP_QUERY } from "./deviceCSharpLab";

// Visual lab V17 (docs/enterprise-csharp-visual-lab-plan.md §27) — the condition «بالقيم» reads fields and calls too:
//   • fields: p.Age, a chain p.Home.City, a struct's field, a field of `this` written bare, a static field (Counter.Made, or bare
//     when exactly one type has it), a string's Length;
//   • calls: the writer's method → the value it RETURNED (the return steps recorded just before the condition); Math.Abs / Max / Min
//     of whole numbers; list.Count();
//   • never guessed: a call the condition makes more often than it returned (`&&` skipped one) stays as written; a field that is not
//     there stays as written; a variable that holds no plain value still makes the line unsure.

afterEach(() => { cleanup(); resetDeviceLabForTests(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
beforeEach(() => vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q === DESKTOP_QUERY, media: q, addEventListener() {}, removeEventListener() {} }))));

const v = (s: string) => ({ t: "v" as const, s });
const ref = (id: number) => ({ t: "ref" as const, id });
const frame = (vars: DsFrame["vars"]): DsFrame => ({ name: "Main", vars });
const PEOPLE: DsObj[] = [
  { id: 1, k: "obj", type: "Person", fields: [["Name", v("\"Ali\"")], ["Age", v("20")], ["Home", ref(2)]] },
  { id: 2, k: "obj", type: "Address", fields: [["City", v("\"Haifa\"")]] },
  { id: 3, k: "array", type: "List<int>", items: ["4", "7", "10"] },
];

describe("V17 — fields", () => {
  it("p.Age, the chain p.Home.City, a struct's field, a string's Length", () => {
    const f = frame([["p", ref(1)], ["pt", { t: "rec", type: "Point", fields: [["X", v("1")], ["Y", v("2")]] }], ["s", v("\"abc\"")]]);
    expect(fillValues("p.Age >= 18 && p.Home.City == \"Haifa\"", f, PEOPLE)).toBe("20 >= 18 && \"Haifa\" == \"Haifa\"");
    expect(fillValues("pt.X > 0 && pt.Y < 5", f, PEOPLE)).toBe("1 > 0 && 2 < 5");
    expect(fillValues("s.Length > 2", f, PEOPLE)).toBe("3 > 2");
  });

  it("a field of `this` written bare; a static field by its type, or bare when exactly one type has it", () => {
    const self: DsObj = { id: 5, k: "obj", type: "Account", fields: [["Balance", v("100")]] };
    expect(fillValues("Balance >= amount", frame([["this", ref(5)], ["amount", v("30")]]), [self])).toBe("100 >= 30");
    const statics = [{ name: "Counter", vars: [["Made", v("2")]] as DsFrame["vars"] }, { name: "Program", vars: [["total", v("5")]] as DsFrame["vars"] }];
    expect(fillValues("Counter.Made < 3 && total > 1", frame([]), [], { statics })).toBe("2 < 3 && 5 > 1");
    // a local hides a static of the same name
    expect(fillValues("total > 1", frame([["total", v("0")]]), [], { statics })).toBe("0 > 1");
  });

  it("what is not there stays as written; a variable with no plain value still makes the line unsure", () => {
    const f = frame([["p", ref(1)], ["k", v("3")]]);
    expect(fillValues("p.Missing > k", f, PEOPLE)).toBe("p.Missing > 3");
    expect(fillValues("p.Home != null && k > 0", f, PEOPLE)).toBe("p.Home != null && 3 > 0");   // a reference stays a name
    expect(fillValues("p != null && k > 0", f, PEOPLE)).toBeNull();                              // as V15: a bare reference → unsure
  });
});

describe("V17 — calls", () => {
  it("Math.Abs / Max / Min of whole numbers (their arguments read first); list.Count() and list.Count", () => {
    const f = frame([["x", v("-3")], ["a", v("4")], ["b", v("9")], ["list", ref(3)]]);
    expect(fillValues("Math.Abs(x) < 5", f, PEOPLE)).toBe("3 < 5");
    expect(fillValues("Math.Max(a, b) == b && Math.Min(a, b + 1) > 0", f, PEOPLE)).toBe("9 == 9 && Math.Min(4, 9 + 1) > 0");   // b + 1 is no number yet
    expect(fillValues("list.Count() > 0 && list.Count == 3 && list[1] > 5", f, PEOPLE)).toBe("3 > 0 && 3 == 3 && 7 > 5");
    expect(fillValues("Math.Exp(a) > 0", f, PEOPLE)).toBe("Math.Exp(4) > 0");   // not computed: stays, its arguments read (Math.Pow: V19, Math.Sqrt: V20, Math.Log: V21)
  });

  it("the writer's method → the value it returned; as many returns as calls, else the calls stay as written", () => {
    const rets = new Map([["IsEven", ["true"]]]);
    const f = frame([["arr", ref(3)], ["i", v("0")], ["count", v("0")]]);
    expect(fillValues("IsEven(arr[i]) && count < 3", f, PEOPLE, { rets })).toBe("true && 0 < 3");
    expect(fillValues("IsEven(arr[i]) || IsEven(arr[i + 1])", f, PEOPLE, { rets })).toBe("IsEven(4) || IsEven(arr[0 + 1])");   // 2 calls, 1 return
    expect(fillValues("IsEven(arr[i])", f, PEOPLE, {})).toBe("IsEven(4)");                                                   // no returns known
  });
});

// a program whose condition calls the writer's method: the return step comes right before the condition step
const SOURCE = [
  "class Program", "{", "    static bool IsEven(int n)", "    {", "        return n % 2 == 0;", "    }",
  "    static void Main()", "    {", "        int count = 0, k = 4;", "        if (IsEven(k) && count < 3)", "            count++;", "    }", "}",
].join("\n");
const main = (vars: unknown[]) => ({ name: "Main", call: 1, vars });
const STEPS = [
  { line: 7, note: "تبدأ العملية `Main`.", frames: [main([])], objs: [], out: "" },
  { line: 9, note: "", frames: [main([["count", v("0")], ["k", v("4")]])], objs: [], out: "" },
  { line: 3, note: "", frames: [main([["count", v("0")], ["k", v("4")]]), { name: "IsEven", call: 2, vars: [["n", v("4")]] }], objs: [], out: "" },
  { line: 5, note: "العملية تُعيد `true`.", frames: [main([["count", v("0")], ["k", v("4")]]), { name: "IsEven", call: 2, vars: [["n", v("4")]] }], objs: [], out: "", ret: "true" },
  { line: 10, note: "الشرط `IsEven(k) && count < 3` صحيح.", frames: [main([["count", v("0")], ["k", v("4")]])], objs: [], out: "" },
  { line: 11, note: "", frames: [main([["count", v("1")], ["k", v("4")]])], objs: [], out: "" },
];
const TRACE = readLabTrace({ status: "success", stdout: "", stderr: "", steps: STEPS }, SOURCE, "").trace as DsTrace;

describe("V17 — read from the recorded steps", () => {
  it("callReturns: the values returned to the running method since its previous step, by method", () => {
    expect(TRACE).not.toBeNull();
    expect(callReturns(TRACE, 4)).toEqual(new Map([["IsEven", ["true"]]]));
    expect(callReturns(TRACE, 5)).toEqual(new Map());                      // its previous step is the condition: nothing returned since
    expect(conditionOf(TRACE.steps[4], TRACE, 4)).toEqual({ text: "IsEven(k) && count < 3", value: true, withValues: "true && 0 < 3" });
    expect(conditionOf(TRACE.steps[4])).toMatchObject({ withValues: "IsEven(4) && 0 < 3" });   // without the trace: the call stays
  });

  it("the player shows the condition with the value the call returned", () => {
    render(<LabTraceView trace={TRACE} epoch={1} />);
    for (let i = 0; i < 4; i++) fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    expect(screen.getByTestId("lab-trace-test").textContent).toContain("true && 0 < 3");
  });
});
