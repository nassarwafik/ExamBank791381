// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { readLabTrace } from "./labTrace";
import LabTraceView from "./LabTraceView";
import type { DsFrame, DsObj, DsTrace } from "../learning/activities/ds";
import { conditionOf, fillValues } from "./traceInsights";
import { resetDeviceLabForTests, DESKTOP_QUERY } from "./deviceCSharpLab";

// Visual lab V18 (docs/enterprise-csharp-visual-lab-plan.md §28) — the condition «بالقيم» reads a dictionary:
//   • d[key] → that key's value: the key read as Console prints it (a string without its quotes, True / False), found exactly once;
//     the value written back as a literal of the dictionary's value type;
//   • d.Count; d.ContainsKey(k) / d.ContainsValue(v) from the recorded keys / values;
//   • never guessed: a key not found, found twice, not yet a literal, a value that is an object, or a dictionary clipped for space
//     («…») stays as written — the line is not hidden for it.

afterEach(() => { cleanup(); resetDeviceLabForTests(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
beforeEach(() => vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q === DESKTOP_QUERY, media: q, addEventListener() {}, removeEventListener() {} }))));

const v = (s: string) => ({ t: "v" as const, s });
const ref = (id: number) => ({ t: "ref" as const, id });
const frame = (vars: DsFrame["vars"]): DsFrame => ({ name: "Main", vars });
const map = (id: number, type: string, keys: string[], items: string[]): DsObj => ({ id, k: "map", type, keys, items });
const MARKS = map(1, "Dictionary<string, int>", ["Ali", "Sara"], ["90", "75"]);

describe("V18 — d[key]", () => {
  it("a string key, written or held by a variable → its value", () => {
    const f = frame([["d", ref(1)], ["name", v("\"Sara\"")]]);
    expect(fillValues("d[\"Ali\"] >= 80 && d[name] > 70", f, [MARKS])).toBe("90 >= 80 && 75 > 70");
  });

  it("whole-number, bool and char keys; bool and string values written back as literals", () => {
    const flags = map(2, "Dictionary<int, bool>", ["1", "2"], ["True", "False"]);
    const counts = map(3, "SortedDictionary<char, int>", ["a", "b"], ["3", "0"]);
    const names = map(4, "Dictionary<bool, string>", ["True", "False"], ["yes", "no"]);
    const f = frame([["flags", ref(2)], ["counts", ref(3)], ["names", ref(4)], ["k", v("2")]]);
    expect(fillValues("flags[k] || counts['a'] > 0 && names[true] == \"yes\"", f, [flags, counts, names])).toBe("false || 3 > 0 && \"yes\" == \"yes\"");
  });

  it("not found, found twice, a key not yet a literal, an object value, a clipped dictionary: stays as written (the line is kept)", () => {
    const twice = map(5, "Dictionary<string, int>", ["x", "x"], ["1", "2"]);
    const people = map(6, "Dictionary<string, Person>", ["Ali"], ["(Ali, 20)"]);
    const clipped = map(7, "Dictionary<string, int>", ["Ali", "…"], ["90", "…"]);
    const f = frame([["d", ref(1)], ["t", ref(5)], ["p", ref(6)], ["c", ref(7)], ["k", v("3")]]);
    const objs = [MARKS, twice, people, clipped];
    expect(fillValues("d[\"Omar\"] > 0 && k > 1", f, objs)).toBe("d[\"Omar\"] > 0 && 3 > 1");
    expect(fillValues("t[\"x\"] > 0", f, objs)).toBe("t[\"x\"] > 0");
    expect(fillValues("d[Pick(k)] > 0", f, objs)).toBe("d[Pick(3)] > 0");
    expect(fillValues("p[\"Ali\"] != null", f, objs)).toBe("p[\"Ali\"] != null");
    expect(fillValues("c[\"Ali\"] > 0 && c.Count > 0", f, objs)).toBe("90 > 0 && c.Count > 0");   // a key that IS there is still read
  });
});

describe("V18 — Count, ContainsKey, ContainsValue", () => {
  it("answered from the recorded keys and values", () => {
    const f = frame([["d", ref(1)], ["name", v("\"Sara\"")]]);
    expect(fillValues("d.Count == 2 && d.ContainsKey(name) && !d.ContainsKey(\"Omar\") && d.ContainsValue(90)", f, [MARKS]))
      .toBe("2 == 2 && true && !false && true");
  });

  it("a dictionary clipped for space: a key not among those shown is not ruled out — it stays as written", () => {
    const clipped = map(7, "Dictionary<string, int>", ["Ali", "…"], ["90", "…"]);
    const f = frame([["c", ref(7)]]);
    expect(fillValues("c.ContainsKey(\"Ali\") && c.ContainsKey(\"Omar\")", f, [clipped])).toBe("true && c.ContainsKey(\"Omar\")");
  });
});

// a real recorded shape: the dictionary is an object of the step, read by the visual run's reader (rich)
const SOURCE = ["class Program", "{", "    static void Main()", "    {",
  "        var marks = new Dictionary<string, int> { [\"Ali\"] = 90, [\"Sara\"] = 75 };", "        string name = \"Sara\";",
  "        if (marks[name] > 70 && marks.ContainsKey(\"Ali\"))", "            Console.WriteLine(name);", "    }", "}"].join("\n");
const M = { id: 1, k: "map", type: "Dictionary<string, int>", keys: ["Ali", "Sara"], items: ["90", "75"] };
const vars = [["marks", ref(1)], ["name", v("\"Sara\"")]];
const STEPS = [
  { line: 3, note: "تبدأ العملية `Main`.", frames: [{ name: "Main", vars: [] }], objs: [], out: "" },
  { line: 6, note: "", frames: [{ name: "Main", vars }], objs: [M], out: "" },
  { line: 7, note: "الشرط `marks[name] > 70 && marks.ContainsKey(\"Ali\")` صحيح.", frames: [{ name: "Main", vars }], objs: [M], out: "" },
  { line: 8, note: "", frames: [{ name: "Main", vars }], objs: [M], out: "Sara\n" },
];
const TRACE = readLabTrace({ status: "success", stdout: "Sara\n", stderr: "", steps: STEPS }, SOURCE, "").trace as DsTrace;

describe("V18 — in the player", () => {
  it("the recorded dictionary is read: the condition with its values", () => {
    expect(TRACE).not.toBeNull();
    expect(conditionOf(TRACE.steps[2], TRACE, 2)).toEqual({ text: "marks[name] > 70 && marks.ContainsKey(\"Ali\")", value: true, withValues: "75 > 70 && true" });
    render(<LabTraceView trace={TRACE} epoch={1} />);
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    expect(screen.getByTestId("lab-trace-test").textContent).toContain("75 > 70 && true");
  });
});
