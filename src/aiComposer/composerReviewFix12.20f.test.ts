import { describe, it, expect } from "vitest";
import { buildSimFromSpec } from "./composerSim";
import * as F from "./testing/composerFakeAi";

// Phase 20F — Review Fix 12 (fresh re-review of 02d207c: 0 BLOCKER, 2 MAJOR, 0 MINOR, 4 NOTE). Fail-first on 02d207c.
//   MAJOR-1 a domain edge where f tends to 0 (x·√(2 − x²) at ±√2), less than 10⁻³ past a window edge, was never seen: the scan beyond
//           the window started with no notion of the edge's own definedness, and the edge strip skips undefined samples;
//   MAJOR-2 a touching root of an expression that CANCELS around its zero (x·√(x² − 6x + 9) at 3) was missed on most windows: f is
//           exactly 0 only in a band of a few 10⁻⁹ and rounding noise (≈ 10⁻⁷) beside it, so neither the search's minimum nor the
//           vanishing rule saw the zero;
//   NOTE-1  past the exclusions' cap the cusps beyond the window were dropped with the exclusions;
//   NOTE-2  an extremum ON the edge of an exp function was placed 1.1·10⁻⁶ past it by the evaluator's rounding and refused the key.
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const fn = (source: string, tasks: string[], over: Record<string, unknown> = {}) => F.funcSim({ source, xMin: -5, xMax: 5, yMin: -10, yMax: 10, tasks, domainExclusions: [], xIntercepts: [], yIntercept: null, verticalAsymptotes: [], horizontalAsymptotes: [], extrema: [], intervals: [], ...over });
const accepted = (src: string, tasks: string[], over: Record<string, unknown>) => { const r = buildSimFromSpec(fn(src, tasks, over)); expect(r.ok ? "ok" : JSON.stringify(r.issues), src + " " + JSON.stringify(over)).toBe("ok"); };
const refused = (src: string, tasks: string[], over: Record<string, unknown>) => expect(buildSimFromSpec(fn(src, tasks, over)).ok, src + " " + JSON.stringify(over)).toBe(false);
const only = (src: string, tasks: string[], over: Record<string, unknown>, code: string) => expect(codes(buildSimFromSpec(fn(src, tasks, over))), src + " " + JSON.stringify(over)).toEqual([code]);
const mn = (x: number, y: number) => ({ kind: "min", x, y });

describe("20F-RF12 MAJOR-1 a domain edge where f tends to 0, just past a window edge, is a root the student must see", () => {
  it("x·√(2 − x²) on the domain truncated to 3 decimals: widen the window", () => {
    only("x*sqrt(2-x^2)", ["xIntercepts"], { xMin: -1.414, xMax: 1.414, xIntercepts: [0] }, "AI_FUNCTION_WINDOW_TOO_NARROW");
    only("sqrt(5-x^2)*(x-1)", ["xIntercepts"], { xMin: -2.236, xMax: 2.236, xIntercepts: [1] }, "AI_FUNCTION_WINDOW_TOO_NARROW");
    only("x*sqrt(3-x^2)", ["xIntercepts"], { xMin: -1.732, xMax: 1.732, xIntercepts: [0] }, "AI_FUNCTION_WINDOW_TOO_NARROW");
  });
  it("the LEFT edge too: (x + 1)·√(x + π) on [−3.1415, 3]", () => {
    only("(x+1)*sqrt(x+3.14159265358979)", ["xIntercepts"], { xMin: -3.1415, xMax: 3, xIntercepts: [-1] }, "AI_FUNCTION_WINDOW_TOO_NARROW");
  });
  it("within 10⁻⁵ of the window edge the domain edge counts as ON the edge: the root is required, and the correct key is accepted", () => {
    only("x*sqrt(2-x^2)", ["xIntercepts"], { xMin: -1.414213, xMax: 1.414213, xIntercepts: [0] }, "AI_FUNCTION_KEY_INCOMPLETE");
    accepted("x*sqrt(2-x^2)", ["xIntercepts"], { xMin: -1.414213, xMax: 1.414213, xIntercepts: [-1.4142, 0, 1.4142] });
  });
  it("a domain edge where f does not tend to 0 is not a root and does not refuse the key", () => {
    accepted("(x-1)*(sqrt(2-x^2)+1)", ["xIntercepts"], { xMin: -1.414, xMax: 1.414, xIntercepts: [1] });
  });
  it("the outward-rounded window behaves as before (pin)", () => {
    accepted("x*sqrt(2-x^2)", ["xIntercepts"], { xMin: -1.415, xMax: 1.415, xIntercepts: [-1.4142, 0, 1.4142] });
    only("x*sqrt(2-x^2)", ["xIntercepts"], { xMin: -1.415, xMax: 1.415, xIntercepts: [0] }, "AI_FUNCTION_KEY_INCOMPLETE");
  });
});

describe("20F-RF12 MAJOR-2 a touching root of an expression that cancels around its zero (x·√(x² − 6x + 9) = x·|x − 3|)", () => {
  it("is found on every window, not only where a grid sample lands in the zero band", () => {
    for (const [xMin, xMax] of [[-1, 5], [-2, 4], [-5, 6], [-5, 5]] as const) {
      only("x*sqrt(x^2-6*x+9)", ["xIntercepts"], { xMin, xMax, xIntercepts: [0] }, "AI_FUNCTION_KEY_INCOMPLETE");
      accepted("x*sqrt(x^2-6*x+9)", ["xIntercepts"], { xMin, xMax, xIntercepts: [0, 3] });
    }
  });
  it("other forms: a power, a fourth root, |…| under the root, a non-terminating zero (1/3)", () => {
    only("x*(x^2-6*x+9)^0.5", ["xIntercepts"], { xMin: -1, xMax: 5, xIntercepts: [0] }, "AI_FUNCTION_KEY_INCOMPLETE");
    only("x*abs(x^2-6*x+9)^0.25", ["xIntercepts"], { xMin: -2, xMax: 4, xIntercepts: [0] }, "AI_FUNCTION_KEY_INCOMPLETE");
    only("(x-4)*sqrt(abs(x^2-6*x+9))", ["xIntercepts"], { xMin: -5, xMax: 6, xIntercepts: [4] }, "AI_FUNCTION_KEY_INCOMPLETE");
    only("x*sqrt(9*x^2-6*x+1)", ["xIntercepts"], { xIntercepts: [0] }, "AI_FUNCTION_KEY_INCOMPLETE");
    accepted("x*sqrt(9*x^2-6*x+1)", ["xIntercepts"], { xIntercepts: [0, 0.3333] });
  });
  it("a shallow positive minimum is still not a root: (x + 1)·((x − 2)² + 10⁻⁶)", () => {
    accepted("(x+1)*((x-2)^2+0.000001)", ["xIntercepts"], { xIntercepts: [-1] });
    refused("(x+1)*((x-2)^2+0.000001)", ["xIntercepts"], { xIntercepts: [-1, 2] });
  });
});

describe("20F-RF12 NOTE-1 / NOTE-2", () => {
  it("NOTE-1: past the exclusions' cap, the cusps beyond the window are still checked", () => {
    const Zu = "abs(abs(abs(abs(abs(abs(log(abs(x)+1)-8)-2.5)-1.25)-0.625)-0.3125)-0.15625)-0.078125";
    only("(x+1)*exp(2*x)*abs(x-9)^(0.1)+0/(" + Zu + ")", ["xIntercepts"], { xIntercepts: [-1] }, "AI_FUNCTION_WINDOW_TOO_NARROW");
  });
  it("NOTE-2: an extremum ON the edge that the evaluator's rounding places 10⁻⁶ past it is on the edge: (x − 1)·eˣ on [−8, 0]", () => {
    accepted("(x-1)*exp(x)", ["extrema"], { xMin: -8, xMax: 0, extrema: [mn(0, -1)] });
    only("(x-1)*exp(x)", ["extrema"], { xMin: -8, xMax: 0, extrema: [] }, "AI_FUNCTION_KEY_INCOMPLETE");
  });
});
