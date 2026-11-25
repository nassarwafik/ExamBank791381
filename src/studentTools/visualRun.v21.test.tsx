// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { describe, it, expect } from "vitest";
import type { DsFrame } from "../learning/activities/ds";
import { fillValues } from "./traceInsights";

// Visual lab V21 (docs/enterprise-csharp-visual-lab-plan.md §31) — the condition «بالقيم»:
//   • Math.Round(x): C#'s default banker's rounding (ToEven); Math.Round(x, d) only when x·10^d is clearly away from a midpoint;
//   • Math.Log(x) / Math.Log(x, b): IEEE does not require a correctly rounded logarithm, so the last digit may differ from .NET's —
//     written as an approximation «≈» with 10 significant digits; Math.Log(1) is exactly 0.

const v = (s: string) => ({ t: "v" as const, s });
const frame = (vars: DsFrame["vars"]): DsFrame => ({ name: "Main", vars });

describe("V21 — Math.Round", () => {
  it("banker's rounding, as C#: a midpoint goes to the even neighbour", () => {
    const f = frame([["a", v("2.5")], ["b", v("3.5")], ["c", v("-2.5")], ["d", v("2.6")], ["e", v("7")]]);
    expect(fillValues("Math.Round(a) == 2 && Math.Round(b) == 4", f, [])).toBe("2 == 2 && 4 == 4");
    expect(fillValues("Math.Round(c) == -2 && Math.Round(d) == 3 && Math.Round(e) == 7", f, [])).toBe("-2 == -2 && 3 == 3 && 7 == 7");
  });

  it("with digits: away from a midpoint it is written; at a midpoint (the binary value decides) it stays as written", () => {
    const f = frame([["x", v("3.14159")], ["y", v("2.675")], ["z", v("1.005")]]);
    expect(fillValues("Math.Round(x, 2) > 3", f, [])).toBe("3.14 > 3");
    expect(fillValues("Math.Round(y, 2) > 2", f, [])).toBe("Math.Round(2.675, 2) > 2");
    expect(fillValues("Math.Round(z, 2) > 1", f, [])).toBe("Math.Round(1.005, 2) > 1");
    expect(fillValues("Math.Round(x, 16) > 3", f, [])).toBe("Math.Round(3.14159, 16) > 3");   // digits past 15: as C# refuses
  });
});

describe("V21 — Math.Log", () => {
  it("written as an approximation «≈» with 10 significant digits; with a base too; Math.Log(1) exactly 0", () => {
    const f = frame([["n", v("10")], ["k", v("8")], ["one", v("1")]]);
    expect(fillValues("Math.Log(n) > 2", f, [])).toBe("≈2.302585093 > 2");
    expect(fillValues("Math.Log(k, 2) == 3", f, [])).toBe("≈3 == 3");
    expect(fillValues("Math.Log(one) == 0", f, [])).toBe("0 == 0");
  });

  it("x ≤ 0, a base of 1, or an argument not yet a number: stays as written", () => {
    const f = frame([["z", v("0")], ["n", v("10")]]);
    expect(fillValues("Math.Log(z) < 0", f, [])).toBe("Math.Log(0) < 0");
    expect(fillValues("Math.Log(-5) < 0", f, [])).toBe("Math.Log(-5) < 0");
    expect(fillValues("Math.Log(n, 1) > 0", f, [])).toBe("Math.Log(10, 1) > 0");
    expect(fillValues("Math.Log(n + 1) > 0", f, [])).toBe("Math.Log(10 + 1) > 0");
  });
});
