import { describe, it, expect } from "vitest";
import { buildSimFromSpec } from "./composerSim";
import { evaluateFunctionStudyCheck, initialFunctionStudyState, type FunctionStudyCheck } from "../functionStudyPlugin";
import * as F from "./testing/composerFakeAi";

// Phase 20F — Review Fix 6 (fresh re-review of f27d136: 0 BLOCKER, 1 MAJOR, 3 MINOR). Fail-first on f27d136.
//   MAJOR-1 a monotonic-interval key was checked at its midpoint only: an interval running past a turning point (an endpoint sign slip)
//           or across a pole was accepted, and the grader then failed the student who answered correctly;
//   MINOR-1 (RF5 regression) a grid sample one rounding step off a decimal pole overflowed, and an even pole's search stopped on the edge
//           of the overflow plateau: correct keys for poles at one-decimal positions were refused;
//   MINOR-2 a slowly converging approach at ±∞ (steps shrinking by less than 0.9) was read as "no limit": a one-sided key was accepted;
//   MINOR-3 the key checks accepted values up to 0.02 (or 1 %) away from the truth while the grader allows 0.01: a correct student failed.
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const fn = (source: string, tasks: string[], over: Record<string, unknown> = {}) => F.funcSim({ source, xMin: -5, xMax: 5, yMin: -10, yMax: 10, tasks, domainExclusions: [], xIntercepts: [], yIntercept: null, verticalAsymptotes: [], horizontalAsymptotes: [], extrema: [], intervals: [], ...over });
const iv = (kind: "increasing" | "decreasing", from: string, to: string) => ({ kind, from, to });
const refused = (src: string, tasks: string[], over: Record<string, unknown>) => expect(buildSimFromSpec(fn(src, tasks, over)).ok, src + " " + JSON.stringify(over)).toBe(false);
const accepted = (src: string, tasks: string[], over: Record<string, unknown>) => { const r = buildSimFromSpec(fn(src, tasks, over)); expect(r.ok ? "ok" : JSON.stringify(r.issues), src + " " + JSON.stringify(over)).toBe("ok"); };

describe("20F-RF6 MAJOR-1 a monotonic-interval key must hold over its whole length, end at a turning point and never overlap", () => {
  it("an endpoint sign slip, an interval past a turning point or across a pole is refused", () => {
    refused("x^2-4*x+3", ["monotonicIntervals"], { intervals: [iv("decreasing", "-inf", "2"), iv("increasing", "-2", "+inf")] });
    refused("x^3-3*x", ["monotonicIntervals"], { intervals: [iv("increasing", "-inf", "1"), iv("decreasing", "-1", "1"), iv("increasing", "1", "+inf")] });
    refused("x^2-4*x+3", ["monotonicIntervals"], { intervals: [iv("decreasing", "-inf", "4"), iv("increasing", "2", "+inf")] });
    refused("1/x", ["monotonicIntervals"], { intervals: [iv("decreasing", "-inf", "1"), iv("decreasing", "-1", "+inf")] });
  });
  it("an endpoint just beside the turning point (closer than the probe's slope samples, farther than the grading tolerance) is refused", () => {
    refused("x^2-4*x+3", ["monotonicIntervals"], { intervals: [iv("decreasing", "-inf", "2.012"), iv("increasing", "2.012", "+inf")] });
  });
  it("the refused slip is one the grader would hold against a correct student", () => {
    const check: FunctionStudyCheck = { id: "m", label: "m", weight: 3, kind: "monotonic.intervals", tolerance: 0.01, expected: [iv("decreasing", "-inf", "2"), iv("increasing", "-2", "+inf")].map(i => ({ kind: i.kind, from: i.from === "-inf" ? "-inf" : Number(i.from), to: i.to === "+inf" ? "+inf" : Number(i.to) })) };
    const student = { ...initialFunctionStudyState(), monotonicIntervals: [{ kind: "decreasing" as const, from: "-inf" as const, to: 2 }, { kind: "increasing" as const, from: 2, to: "+inf" as const }] };
    expect(evaluateFunctionStudyCheck(check, student).passed).toBe(false);
  });
  it("correct keys pass: turning points, poles and the edge of the domain", () => {
    accepted("x^2-4*x+3", ["monotonicIntervals"], { intervals: [iv("decreasing", "-inf", "2"), iv("increasing", "2", "+inf")] });
    accepted("x^3-3*x", ["monotonicIntervals"], { intervals: [iv("increasing", "-inf", "-1"), iv("decreasing", "-1", "1"), iv("increasing", "1", "+inf")] });
    accepted("1/x", ["monotonicIntervals"], { intervals: [iv("decreasing", "-inf", "0"), iv("decreasing", "0", "+inf")] });
    accepted("sqrt(x-1)", ["monotonicIntervals"], { intervals: [iv("increasing", "1", "+inf")] });
    accepted("abs(x-1)", ["monotonicIntervals"], { intervals: [iv("decreasing", "-inf", "1"), iv("increasing", "1", "+inf")] });
  });
});

describe("20F-RF6 MINOR-1 poles at decimal positions keep their correct keys", () => {
  it("one-decimal poles, a pole pair and an order-4 pole are accepted", () => {
    const t = ["verticalAsymptotes", "horizontalAsymptotes"];
    accepted("1/(x-1.3)", t, { verticalAsymptotes: [1.3], horizontalAsymptotes: [0] });
    accepted("2/(x-0.1)", t, { verticalAsymptotes: [0.1], horizontalAsymptotes: [0] });
    accepted("1/(x+3.6)", t, { verticalAsymptotes: [-3.6], horizontalAsymptotes: [0] });
    accepted("(x-1)/(x+0.2)", t, { verticalAsymptotes: [-0.2], horizontalAsymptotes: [1] });
    accepted("1/(x^2-1.21)", t, { verticalAsymptotes: [-1.1, 1.1], horizontalAsymptotes: [0] });
    accepted("2/(x-1)^4-1", t, { xMin: -3, xMax: 3, verticalAsymptotes: [1], horizontalAsymptotes: [-1] });
  });
  it("a pole at the window's edge is found where f becomes undefined, not where it overflows (found while fixing; refused on f27d136)", () => {
    const t = ["verticalAsymptotes", "horizontalAsymptotes"];
    accepted("2/(x-3)^4-1", t, { xMin: -3, xMax: 3, verticalAsymptotes: [3], horizontalAsymptotes: [-1] });
    accepted("(x+1)/(x-3)^3", t, { xMin: -3, xMax: 3, verticalAsymptotes: [3], horizontalAsymptotes: [0] });
  });
  it("and their incomplete keys are still refused", () => {
    expect(codes(buildSimFromSpec(fn("1/(x^2-1.21)", ["verticalAsymptotes"], { verticalAsymptotes: [1.1] })))).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
    expect(codes(buildSimFromSpec(fn("1/(x-1.3)+1/(x+2)", ["verticalAsymptotes"], { verticalAsymptotes: [-2] })))).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
  });
});

describe("20F-RF6 MINOR-2 a slowly converging approach is undecided, never 'no limit'", () => {
  it("one-sided keys of slowly converging functions are refused", () => {
    refused("1/(1+log(1+abs(x)+x))", ["horizontalAsymptotes"], { horizontalAsymptotes: [1] });
    refused("(abs(x)+x+1)^(-0.15)", ["horizontalAsymptotes"], { horizontalAsymptotes: [1] });
    refused("log(abs(x)+x+2)/(log(abs(x)+x+2)+1)", ["horizontalAsymptotes"], { horizontalAsymptotes: [0.409] });
  });
});

describe("20F-RF6 MINOR-3 key values are held to half the grading tolerance", () => {
  it("roots, extrema, intercepts and limits rounded too coarsely are refused", () => {
    refused("0.2*x^2-0.4", ["xIntercepts"], { xIntercepts: [-1.4, 1.4] });
    refused("(x^2-2)/10", ["xIntercepts"], { xIntercepts: [-1.4, 1.4] });
    refused("(x-2)^6", ["extrema"], { extrema: [{ kind: "min", x: 2.015, y: 0 }] });
    refused("x^2+100", ["extrema"], { yMin: 0, yMax: 200, extrema: [{ kind: "min", x: 0, y: 100.3 }] });
    refused("x+100.5", ["yIntercept"], { yIntercept: 100.52 });
    refused("500*x/(x+100)", ["horizontalAsymptotes"], { horizontalAsymptotes: [500.3] });
  });
  it("a near-duplicate key value, or an extra value just off a real limit, is refused (one correct answer cannot match both)", () => {
    expect(codes(buildSimFromSpec(fn("x^3-x", ["xIntercepts"], { xIntercepts: [-1, 0, 0.001, 1] })))).toEqual(["AI_FUNCTION_KEY_INCONSISTENT"]);
    expect(codes(buildSimFromSpec(fn("500*x/(x+100)", ["horizontalAsymptotes"], { horizontalAsymptotes: [500, 500.3] })))).toEqual(["AI_FUNCTION_KEY_INCONSISTENT"]);
  });
  it("keys rounded to three decimals pass", () => {
    accepted("0.2*x^2-0.4", ["xIntercepts"], { xIntercepts: [-1.414, 1.414] });
    accepted("(x-2)^6", ["extrema"], { extrema: [{ kind: "min", x: 2, y: 0 }] });
    accepted("x^2+100", ["extrema"], { yMin: 0, yMax: 200, extrema: [{ kind: "min", x: 0, y: 100 }] });
    accepted("x+100.5", ["yIntercept"], { yIntercept: 100.5 });
    accepted("500*x/(x+100)", ["horizontalAsymptotes"], { horizontalAsymptotes: [500] });
    accepted("3*x/(x+500)", ["horizontalAsymptotes"], { horizontalAsymptotes: [3] });
    accepted("x/3", ["xIntercepts", "yIntercept"], { xIntercepts: [0], yIntercept: 0 });
  });
});
