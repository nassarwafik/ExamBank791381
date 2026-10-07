import { describe, it, expect } from "vitest";
import { buildSimFromSpec } from "./composerSim";
import * as F from "./testing/composerFakeAi";

// Phase 20F — Review Fix 8 (fresh re-review of 7fa0578: 0 BLOCKER, 1 MAJOR, 3 MINOR, 3 NOTE). Fail-first on 7fa0578.
//   MAJOR-1 a removable hole no grid sample lands on ((x−1)/(x²−1) at 1 on [−6, 6]) was invisible: the key without it was accepted;
//   MINOR-1 a closed domain edge with decimal coefficients (x·√(1.21−x²) at ±1.1) evaluates as undefined after rounding: missed as a root;
//   MINOR-2 a very flat degree-8 minimum beside a large constant accepted a key 0.03 away;
//   MINOR-3 a monotonic interval ending at a domain edge that is also the window's edge (√x on [0, 9]) was refused;
//   NOTE-1  a root within 10⁻³ past the window's edge was not seen by the scan beyond the window.
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const fn = (source: string, tasks: string[], over: Record<string, unknown> = {}) => F.funcSim({ source, xMin: -5, xMax: 5, yMin: -10, yMax: 10, tasks, domainExclusions: [], xIntercepts: [], yIntercept: null, verticalAsymptotes: [], horizontalAsymptotes: [], extrema: [], intervals: [], ...over });
const iv = (kind: "increasing" | "decreasing", from: string, to: string) => ({ kind, from, to });
const refused = (src: string, tasks: string[], over: Record<string, unknown>) => expect(buildSimFromSpec(fn(src, tasks, over)).ok, src + " " + JSON.stringify(over)).toBe(false);
const accepted = (src: string, tasks: string[], over: Record<string, unknown>) => { const r = buildSimFromSpec(fn(src, tasks, over)); expect(r.ok ? "ok" : JSON.stringify(r.issues), src + " " + JSON.stringify(over)).toBe("ok"); };

describe("20F-RF8 MAJOR-1 the expression's own exclusions are found whatever the grid", () => {
  it("a removable hole between grid samples is required in the key", () => {
    const t = ["domainExclusions", "verticalAsymptotes"], w = { xMin: -6, xMax: 6 };
    expect(codes(buildSimFromSpec(fn("(x-1)/(x^2-1)", t, { ...w, domainExclusions: [-1], verticalAsymptotes: [-1] })))).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
    accepted("(x-1)/(x^2-1)", t, { ...w, domainExclusions: [-1, 1], verticalAsymptotes: [-1] });
    expect(codes(buildSimFromSpec(fn("(x^2-4)/(x-2)+1/(x+3)", ["domainExclusions"], { xMin: -7, xMax: 7, domainExclusions: [-3] })))).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
  });
  it("a hole splits a monotonic interval, in any window", () => {
    const w = { xMin: -6, xMax: 6 };
    refused("(x-1)/(x^2-1)", ["monotonicIntervals"], { ...w, intervals: [iv("decreasing", "-inf", "-1"), iv("decreasing", "-1", "+inf")] });
    accepted("(x-1)/(x^2-1)", ["monotonicIntervals"], { ...w, intervals: [iv("decreasing", "-inf", "-1"), iv("decreasing", "-1", "1"), iv("decreasing", "1", "+inf")] });
  });
  it("a hole beyond the window refuses an exclusions key (widen the window)", () => {
    expect(codes(buildSimFromSpec(fn("(x-8)/((x-8)*(x+1))", ["domainExclusions"], { domainExclusions: [-1] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
  });
});

describe("20F-RF8 MINOR-1 a closed domain edge is a root whatever its rounding", () => {
  it("edges of √ with decimal coefficients are roots", () => {
    accepted("x*sqrt(1.21-x^2)", ["xIntercepts"], { xMin: -3, xMax: 3, xIntercepts: [-1.1, 0, 1.1] });
    expect(codes(buildSimFromSpec(fn("x*sqrt(1.21-x^2)", ["xIntercepts"], { xMin: -3, xMax: 3, xIntercepts: [0] })))).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
    accepted("(x+2)*sqrt(1.2-0.4*x)", ["xIntercepts"], { xMin: -10, xMax: 10, xIntercepts: [-2, 3] });
    refused("(x+2)*sqrt(1.2-0.4*x)", ["xIntercepts"], { xMin: -10, xMax: 10, xIntercepts: [-2] });
  });
});

describe("20F-RF8 MINOR-2 a flat extremum the probe does not record is located at the centre of its flat stretch", () => {
  it("a key 0.03 off a flat degree-8 minimum is refused; the centre is accepted", () => {
    refused("(x-2)^8+1000", ["extrema"], { xMin: -3, xMax: 4, yMin: 900, yMax: 1100, extrema: [{ kind: "min", x: 2.03, y: 1000 }] });
    accepted("(x-2)^8+1000", ["extrema"], { xMin: -3, xMax: 4, yMin: 900, yMax: 1100, extrema: [{ kind: "min", x: 2, y: 1000 }] });
  });
});

describe("20F-RF8 MINOR-3 a window end that is a domain edge ends a monotonic interval", () => {
  it("√x on [0, 9], x·√x on [0, 4], √(4−x²) on [−2, 2]", () => {
    accepted("sqrt(x)", ["monotonicIntervals"], { xMin: 0, xMax: 9, intervals: [iv("increasing", "0", "+inf")] });
    accepted("x*sqrt(x)", ["monotonicIntervals"], { xMin: 0, xMax: 4, intervals: [iv("increasing", "0", "+inf")] });
    accepted("sqrt(4-x^2)", ["monotonicIntervals"], { xMin: -2, xMax: 2, intervals: [iv("increasing", "-2", "0"), iv("decreasing", "0", "2")] });
  });
});

describe("20F-RF8 NOTE-1 the scan beyond the window starts from the window's edge value", () => {
  it("a root just past the edge refuses the key", () => {
    expect(codes(buildSimFromSpec(fn("(x-1)*(x-5.0005)", ["xIntercepts"], { xIntercepts: [1] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
  });
});

describe("20F-RF8 each new layer holds on its own", () => {
  it("a hole whose denominator only touches 0 (no sign change) is found", () => {
    expect(codes(buildSimFromSpec(fn("(x-1)^2/(x-1)^2+x+1/(x+3)", ["domainExclusions"], { xMin: -6, xMax: 6, domainExclusions: [-3] })))).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
    accepted("(x-1)^2/(x-1)^2+x+1/(x+3)", ["domainExclusions"], { xMin: -6, xMax: 6, domainExclusions: [-3, 1] });
  });
  it("more guarded sub-expressions than the probe may follow refuse the key (fail closed)", () => {
    const many = "x+0*(" + Array.from({ length: 13 }, (_, k) => "1/(x-" + (k + 10) + ")").join("+") + ")";
    expect(codes(buildSimFromSpec(fn(many, ["xIntercepts"], { xIntercepts: [0] })))).toEqual(["AI_FUNCTION_TOO_COMPLEX"]);
  });
  it("a zero of a log argument inside a domain gap is an edge, not an isolated exclusion", () => {
    accepted("log(x)+1/(x-2)", ["domainExclusions"], { xMin: -1, xMax: 5, domainExclusions: [2] });
  });
});

describe("20F-RF8 found while fixing: a pole the grid misses is found through its denominator (fail-first on 7fa0578)", () => {
  it("an even pole beside an odd one on a coarse grid is required in the key", () => {
    const o = { xMin: -70, xMax: 70, yMin: -100, yMax: 100 };
    expect(codes(buildSimFromSpec(fn("(x+1)/((x-2.7)^3*(x+2.5)^2)+x", ["verticalAsymptotes"], { ...o, verticalAsymptotes: [2.7] })))).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
    accepted("(x+1)/((x-2.7)^3*(x+2.5)^2)+x", ["verticalAsymptotes"], { ...o, verticalAsymptotes: [-2.5, 2.7] });
  });
});

describe("20F-RF8 the flat-stretch fallback measures the stretch at the evaluator's rounding", () => {
  it("an asymmetric flat minimum is centred within 0.005 of its true position (a looser tolerance would drift past it)", () => {
    accepted("1000+(abs(x)+x)^8/256+16*(abs(x)-x)^8/256", ["extrema"], { xMin: -1, xMax: 1, yMin: 999, yMax: 1001, extrema: [{ kind: "min", x: 0, y: 1000 }] });
  });
});

describe("20F-RF8 a flat stretch's rounding noise does not start touching-root searches", () => {
  it("a plateau whose value carries rounding noise keeps its correct key (pin: the RF6 noise threshold, isolated)", () => {
    accepted("(x*0.1*10-x)+abs(x-3)+abs(x-4)-1.5", ["xIntercepts"], { xMin: 0, xMax: 6, xIntercepts: [2.75, 4.25] });
  });
});

describe("20F-RF8 a steep touching zero of a denominator is a guard zero", () => {
  it("1/√|x − 1.3| excludes 1.3 (found while removing the grid snapping); a shallow minimum is not a zero", () => {
    accepted("1/sqrt(abs(x-1.3))", ["domainExclusions", "verticalAsymptotes"], { xMin: -100, xMax: 100, domainExclusions: [1.3], verticalAsymptotes: [1.3] });
    expect(codes(buildSimFromSpec(fn("1/(x^2+0.0000001)", ["domainExclusions"], { domainExclusions: [0] })))).toEqual(["AI_FUNCTION_KEY_INCONSISTENT"]);
  });
});
