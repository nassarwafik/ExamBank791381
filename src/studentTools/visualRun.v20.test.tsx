// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { describe, it, expect } from "vitest";
import type { DsFrame, DsObj } from "../learning/activities/ds";
import { fillValues } from "./traceInsights";

// Visual lab V20 (docs/enterprise-csharp-visual-lab-plan.md §30) — the condition «بالقيم»:
//   • list.Contains(x) of an array / List<T> / HashSet<T>: x written as Console prints the element type (a string without its quotes,
//     True / False), false only when nothing was clipped for space; a string's Contains (V19) unchanged;
//   • Math.Sqrt of a whole number ≥ 0: IEEE's correctly rounded square root (as C#), in its shortest form (as .NET prints a double).

const v = (s: string) => ({ t: "v" as const, s });
const ref = (id: number) => ({ t: "ref" as const, id });
const frame = (vars: DsFrame["vars"]): DsFrame => ({ name: "Main", vars });
const NUMS: DsObj = { id: 1, k: "array", type: "List<int>", items: ["4", "7", "10"] };
const NAMES: DsObj = { id: 2, k: "array", type: "string[]", items: ["Ali", "Sara"] };
const SEEN: DsObj = { id: 3, k: "set", type: "HashSet<char>", items: ["a", "b"] };
const FLAGS: DsObj = { id: 4, k: "array", type: "bool[]", items: ["True", "False"] };
const objs = [NUMS, NAMES, SEEN, FLAGS];

describe("V20 — list.Contains", () => {
  it("List<int>, string[], HashSet<char>, bool[]: the argument a literal or a variable holding one", () => {
    const f = frame([["nums", ref(1)], ["names", ref(2)], ["seen", ref(3)], ["flags", ref(4)], ["k", v("7")], ["who", v("\"Omar\"")]]);
    expect(fillValues("nums.Contains(k) && !nums.Contains(5)", f, objs)).toBe("true && !false");
    expect(fillValues("names.Contains(\"Sara\") || names.Contains(who)", f, objs)).toBe("true || false");
    expect(fillValues("seen.Contains('b') && flags.Contains(false)", f, objs)).toBe("true && true");
  });

  it("clipped for space, an argument not a literal, a list of objects or of doubles: stays as written", () => {
    const clipped: DsObj = { id: 5, k: "array", type: "List<int>", items: ["1", "…"] };
    const people: DsObj = { id: 6, k: "array", type: "List<Person>", items: ["(Ali, 20)"] };
    const marks: DsObj = { id: 7, k: "array", type: "double[]", items: ["2.5"] };
    const f = frame([["c", ref(5)], ["p", ref(6)], ["m", ref(7)], ["nums", ref(1)], ["k", v("3")]]);
    const all = [...objs, clipped, people, marks];
    expect(fillValues("c.Contains(1) && c.Contains(9)", f, all)).toBe("true && c.Contains(9)");   // 9 may be among those not shown
    expect(fillValues("nums.Contains(Pick(k))", f, all)).toBe("nums.Contains(Pick(3))");
    expect(fillValues("p.Contains(x) || m.Contains(2.5)", f, all)).toBe("p.Contains(x) || m.Contains(2.5)");
  });

  it("a string's Contains is unchanged (V19), and a cell's list is asked, not the outer one", () => {
    const grid: DsObj = { id: 8, k: "array", type: "List<int>[]", items: ["…", "…"] };
    const f = frame([["s", v("\"hello\"")], ["g", ref(8)]]);
    expect(fillValues("s.Contains(\"ell\")", f, [grid])).toBe("true");
    expect(fillValues("g[0].Contains(4)", f, [grid])).toBeNull();   // a cell that is not a literal: as V15, the line is not shown
  });
});

describe("V20 — Math.Sqrt", () => {
  it("a whole number ≥ 0: the exact root when it is whole, else the double in its shortest form", () => {
    const f = frame([["n", v("16")], ["m", v("2")]]);
    expect(fillValues("Math.Sqrt(n) == 4 && Math.Sqrt(m) > 1", f, [])).toBe("4 == 4 && 1.4142135623730951 > 1");
    expect(fillValues("Math.Sqrt(0) == 0", f, [])).toBe("0 == 0");
  });

  it("a negative number (NaN in C#), a fraction, or an argument not yet a number: stays as written", () => {
    const f = frame([["x", v("2.25")], ["n", v("9")]]);
    expect(fillValues("Math.Sqrt(-4) > 0", f, [])).toBe("Math.Sqrt(-4) > 0");
    expect(fillValues("Math.Sqrt(x) > 1", f, [])).toBe("Math.Sqrt(2.25) > 1");
    expect(fillValues("Math.Sqrt(n + 7) > 1", f, [])).toBe("Math.Sqrt(9 + 7) > 1");
  });
});
