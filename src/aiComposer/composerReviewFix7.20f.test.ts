import { describe, it, expect } from "vitest";
import { buildSimFromSpec } from "./composerSim";
import * as F from "./testing/composerFakeAi";

// Phase 20F — Review Fix 7 (fresh re-review of ff25763: 0 BLOCKER, 2 MAJOR, 1 MINOR, 4 NOTE). Fail-first on ff25763.
//   MAJOR-1 a root at the edge of the domain (x·√(4−x²) at ±2) was found only when a grid sample landed on it: the key without it was
//           accepted as complete, and since RF6 the correct key was refused;
//   MAJOR-2 features outside the plotted window could be left out of the key, though the student studies the whole function;
//   MINOR-1 flat extrema at a large |f| (x⁵−5x⁴+50 at 0) escaped the probe, and the flat-extremum fallback accepted (x−2)⁶+10 at 2.012;
//   NOTE-1  a domain-exclusion key value was checked only as "f undefined there", not matched to an isolated excluded point.
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const fn = (source: string, tasks: string[], over: Record<string, unknown> = {}) => F.funcSim({ source, xMin: -5, xMax: 5, yMin: -10, yMax: 10, tasks, domainExclusions: [], xIntercepts: [], yIntercept: null, verticalAsymptotes: [], horizontalAsymptotes: [], extrema: [], intervals: [], ...over });
const iv = (kind: "increasing" | "decreasing", from: string, to: string) => ({ kind, from, to });
const refused = (src: string, tasks: string[], over: Record<string, unknown>) => expect(buildSimFromSpec(fn(src, tasks, over)).ok, src + " " + JSON.stringify(over)).toBe(false);
const accepted = (src: string, tasks: string[], over: Record<string, unknown>) => { const r = buildSimFromSpec(fn(src, tasks, over)); expect(r.ok ? "ok" : JSON.stringify(r.issues), src + " " + JSON.stringify(over)).toBe("ok"); };

describe("20F-RF7 MAJOR-1 a root at the edge of the domain is a root", () => {
  it("correct keys with edge roots are accepted, whether or not a grid sample lands on the edge", () => {
    accepted("x*sqrt(4-x^2)", ["xIntercepts"], { xMin: -3, xMax: 3, xIntercepts: [-2, 0, 2] });
    accepted("(x+1)*sqrt(2-x)", ["xIntercepts"], { xMin: -3, xMax: 3, xIntercepts: [-1, 2] });
    accepted("sqrt(x-1)", ["xIntercepts"], { xMin: -6, xMax: 6, xIntercepts: [1] });
    accepted("(x-1)*sqrt(x+2)", ["xIntercepts"], { xMin: -3, xMax: 3, xIntercepts: [-2, 1] });
  });
  it("keys that leave out an edge root are incomplete", () => {
    expect(codes(buildSimFromSpec(fn("x*sqrt(4-x^2)", ["xIntercepts"], { xMin: -3, xMax: 3, xIntercepts: [0] })))).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
    expect(codes(buildSimFromSpec(fn("(x+1)*sqrt(2-x)", ["xIntercepts"], { xMin: -3, xMax: 3, xIntercepts: [-1] })))).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
  });
  it("an edge where f tends to a non-zero value, or to infinity, is not a root", () => {
    accepted("sqrt(x)-1", ["xIntercepts"], { xIntercepts: [1] });
    accepted("log(x)", ["xIntercepts"], { xIntercepts: [1] });
  });
});

describe("20F-RF7 MAJOR-2 the window must contain every feature the tasks ask for", () => {
  it("roots, poles, extrema and turning points outside the window refuse the key (widen the window)", () => {
    expect(codes(buildSimFromSpec(fn("x^3-12*x", ["xIntercepts"], { xMin: -3, xMax: 3, xIntercepts: [0] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
    refused("(x-1)*(x-8)", ["xIntercepts"], { xIntercepts: [1] });
    refused("1/((x-1)*(x-8))", ["verticalAsymptotes"], { verticalAsymptotes: [1] });
    refused("x^3-3*x", ["extrema"], { xMin: -1.5, xMax: 0.5, extrema: [{ kind: "max", x: -1, y: 2 }] });
    refused("x^2-12*x", ["monotonicIntervals"], { intervals: [iv("decreasing", "-inf", "+inf")] });
  });
  it("a window that contains every feature keeps its correct key", () => {
    accepted("x^3-12*x", ["xIntercepts"], { xMin: -4, xMax: 4, xIntercepts: [-3.464, 0, 3.464] });
    accepted("x^2-12*x", ["monotonicIntervals"], { xMin: -2, xMax: 14, intervals: [iv("decreasing", "-inf", "6"), iv("increasing", "6", "+inf")] });
    accepted("(2*x+1)/(x-3)", ["verticalAsymptotes", "horizontalAsymptotes"], { verticalAsymptotes: [3], horizontalAsymptotes: [2] });
    accepted("exp(-x^2)", ["extrema", "monotonicIntervals"], { xMin: -3, xMax: 3, extrema: [{ kind: "max", x: 0, y: 1 }], intervals: [iv("increasing", "-inf", "0"), iv("decreasing", "0", "+inf")] });
    accepted("x/(x^2+1)", ["extrema"], { extrema: [{ kind: "min", x: -1, y: -0.5 }, { kind: "max", x: 1, y: 0.5 }] });
  });
});

describe("20F-RF7 MINOR-1 flat extrema at a large |f| are found and located", () => {
  it("a flat maximum beside a large constant is required in the key; a key off the flat minimum is refused", () => {
    expect(codes(buildSimFromSpec(fn("x^5-5*x^4+50", ["extrema"], { yMin: -300, yMax: 100, extrema: [{ kind: "min", x: 4, y: -206 }] })))).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
    refused("(x-2)^6+10", ["extrema"], { extrema: [{ kind: "min", x: 2.012, y: 10 }] });
    refused("(x-2)^6+100", ["extrema"], { yMin: 0, yMax: 200, extrema: [{ kind: "min", x: 2.018, y: 100 }] });
  });
  it("their correct keys pass", () => {
    accepted("x^5-5*x^4+50", ["extrema"], { yMin: -300, yMax: 100, extrema: [{ kind: "max", x: 0, y: 50 }, { kind: "min", x: 4, y: -206 }] });
    accepted("(x-2)^6+10", ["extrema"], { extrema: [{ kind: "min", x: 2, y: 10 }] });
    accepted("x^4+3", ["monotonicIntervals", "extrema"], { intervals: [iv("decreasing", "-inf", "0"), iv("increasing", "0", "+inf")], extrema: [{ kind: "min", x: 0, y: 3 }] });
    accepted("(x-2)^4+10", ["monotonicIntervals"], { intervals: [iv("decreasing", "-inf", "2"), iv("increasing", "2", "+inf")] });
  });
});

describe("20F-RF7 NOTE-1 a domain exclusion must be an isolated excluded point the probe finds", () => {
  it("a point inside a domain gap, or outside the domain altogether, is not an exclusion", () => {
    refused("1/(x-1)+sqrt(x+3)", ["domainExclusions"], { domainExclusions: [1, -4] });
    refused("log(x^2-4)", ["domainExclusions"], { domainExclusions: [-2, 2] });
  });
  it("holes and poles are", () => {
    accepted("(x^2-1)/(x-1)", ["domainExclusions"], { domainExclusions: [1] });
    accepted("1/(x^2-4)", ["domainExclusions", "verticalAsymptotes"], { domainExclusions: [-2, 2], verticalAsymptotes: [-2, 2] });
  });
});
