// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { describe, it, expect } from "vitest";
import type { DsFrame, DsObj } from "../learning/activities/ds";
import { fillValues } from "./traceInsights";

// Visual lab V19 (docs/enterprise-csharp-visual-lab-plan.md §29) — the condition «بالقيم»:
//   • fail-first: a call after an index (`maps["x"].ContainsKey("a")`, `names[i].Contains("a")`) is asked of what the index gave,
//     not of the chain's first name (V17 / V18 read the owner from the names only, skipping the index);
//   • Math.Pow of whole numbers when the result is a whole number exactly; string.Contains of a string or a char.

const v = (s: string) => ({ t: "v" as const, s });
const ref = (id: number) => ({ t: "ref" as const, id });
const frame = (vars: DsFrame["vars"]): DsFrame => ({ name: "Main", vars });

describe("V19 — a call after an index is asked of what the index gave", () => {
  it("maps[\"x\"].ContainsKey(\"a\"): the inner dictionary is not read, so it stays as written — never the OUTER dictionary's answer", () => {
    const outer: DsObj = { id: 1, k: "map", type: "Dictionary<string, Dictionary<string, int>>", keys: ["a", "x"], items: ["…", "…"] };
    expect(fillValues("maps[\"x\"].ContainsKey(\"a\")", frame([["maps", ref(1)]]), [outer])).toBe("maps[\"x\"].ContainsKey(\"a\")");
  });
});

describe("V19 — a call after an index (the owner is what the index gave)", () => {
  it("list[0].Count() and names[i].Contains(…) ask the cell, not the list", () => {
    const rows: DsObj = { id: 2, k: "array", type: "List<int>", items: ["4", "7", "10"] };
    const names: DsObj = { id: 3, k: "array", type: "string[]", items: ["Ali", "Sara"] };
    const f = frame([["rows", ref(2)], ["names", ref(3)], ["i", v("1")]]);
    expect(fillValues("rows.Count() == 3", f, [rows, names])).toBe("3 == 3");                       // the list itself: as V17
    expect(fillValues("names[i].Contains(\"ar\")", f, [rows, names])).toBe("true");                // "Sara" — the cell, not the array
    expect(fillValues("names[0].Contains('S')", f, [rows, names])).toBe("false");                  // "Ali"
  });
});

describe("V19 — Math.Pow", () => {
  it("whole numbers, the result a whole number exactly (C#'s double holds it exactly up to 2^53)", () => {
    const f = frame([["a", v("2")], ["n", v("10")], ["b", v("-3")]]);
    expect(fillValues("Math.Pow(a, n) > 1000 && Math.Pow(b, 3) < 0 && Math.Pow(7, 0) == 1", f, [])).toBe("1024 > 1000 && -27 < 0 && 1 == 1");
  });

  it("a negative exponent, a result past 2^53, or an argument not yet a number: stays as written", () => {
    const f = frame([["a", v("2")], ["x", v("2.5")]]);
    expect(fillValues("Math.Pow(a, -1) > 0", f, [])).toBe("Math.Pow(2, -1) > 0");
    expect(fillValues("Math.Pow(10, 20) > 0", f, [])).toBe("Math.Pow(10, 20) > 0");
    expect(fillValues("Math.Pow(x, 2) > 0 && Math.Pow(a + 1, 2) > 0", f, [])).toBe("Math.Pow(2.5, 2) > 0 && Math.Pow(2 + 1, 2) > 0");
  });
});

describe("V19 — string.Contains", () => {
  it("a string variable or field, with a string or a char literal (or a variable holding one); ordinal, as C#", () => {
    const person: DsObj = { id: 4, k: "obj", type: "Person", fields: [["Name", v("\"Sara\"")]] };
    const f = frame([["s", v("\"hello\"")], ["p", ref(4)], ["part", v("\"ell\"")]]);
    expect(fillValues("s.Contains(part) && !s.Contains(\"H\") && p.Name.Contains('S')", f, [person])).toBe("true && !false && true");
  });

  it("a string with escapes, an argument not a literal, or a receiver not a string: stays as written", () => {
    const f = frame([["s", v("\"a\\\"b\"")], ["t", v("\"abc\"")], ["n", v("5")]]);
    expect(fillValues("s.Contains(\"a\")", f, [])).toBe("s.Contains(\"a\")");                    // escapes: not read
    expect(fillValues("t.Contains(Pick(n))", f, [])).toBe("t.Contains(Pick(5))");
    expect(fillValues("n.Contains(\"5\")", f, [])).toBe("n.Contains(\"5\")");
  });
});
