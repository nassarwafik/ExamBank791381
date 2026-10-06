import { describe, it, expect } from "vitest";
import { buildSimFromSpec, probeFunctionFeatures } from "./composerSim";
import { compileFunction, evaluateFunctionAt } from "../functionStudyModel";
import * as F from "./testing/composerFakeAi";

// Phase 20F — Review Fix 5 (fresh re-review of 838e7f4: 0 BLOCKER, 0 MAJOR, 3 MINOR). Principle: the function-study key check FAILS CLOSED —
// a refused key is a teacher task, an accepted wrong / incomplete key fails correct students. Fail-first on 838e7f4.
//   MINOR-1 (RF4 regression) the steep-pole branch jumped across an overflow run: its EDGES were accepted as vertical asymptotes;
//   MINOR-2 noisy / non-monotone / very steep approaches lost a limit and accepted the one-sided key;
//   MINOR-3 √|log|x|| grows too slowly to confirm a pole: the pole was missed and the key without it accepted.
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const fn = (source: string, tasks: string[], over: Record<string, unknown> = {}) => F.funcSim({ source, xMin: -5, xMax: 5, yMin: -10, yMax: 10, tasks, domainExclusions: [], xIntercepts: [], yIntercept: null, verticalAsymptotes: [], horizontalAsymptotes: [], extrema: [], intervals: [], ...over });
const refused = (src: string, tasks: string[], over: Record<string, unknown>) => expect(buildSimFromSpec(fn(src, tasks, over)).ok, src + " " + JSON.stringify(over)).toBe(false);

describe("20F-RF5 MINOR-1 the edges of an overflow run are never vertical asymptotes", () => {
  it("wrong keys built on overflow edges or a narrow domain gap are refused", () => {
    refused("1/(x-2)^10", ["verticalAsymptotes"], { verticalAsymptotes: [1.97, 2.03] });
    refused("1/(x-2)^10", ["verticalAsymptotes"], { verticalAsymptotes: [2, 1.9684, 2.0316] });
    refused("1/(x-2)^9", ["verticalAsymptotes"], { verticalAsymptotes: [2, 1.9785, 2.0215] });
    refused("100000000*sqrt(x*(x+0.05))", ["verticalAsymptotes"], { verticalAsymptotes: [-0.049, -0.001] });
  });
  it("a pole hidden inside an overflow run is refused as too complex (fail closed), not guessed", () => {
    expect(codes(buildSimFromSpec(fn("1/(x-2)^10", ["verticalAsymptotes"], { verticalAsymptotes: [2] })))).toEqual(["AI_FUNCTION_TOO_COMPLEX"]);
  });
});

describe("20F-RF5 MINOR-2 an undecidable behaviour at ±∞ never accepts a one-sided key", () => {
  it("noisy, non-monotone and very steep approaches refuse the incomplete key", () => {
    refused("exp(x)*exp(-abs(x))", ["horizontalAsymptotes"], { horizontalAsymptotes: [0] });
    refused("5/(1+exp(-10*x))", ["horizontalAsymptotes"], { horizontalAsymptotes: [5] });
    refused("(exp(10*x)-1)/(exp(10*x)+1)", ["horizontalAsymptotes"], { horizontalAsymptotes: [-1] });
  });
  it("piecewise / periodic operators are not AI vocabulary", () => {
    expect(codes(buildSimFromSpec(fn("floor(x)/abs(x)", ["horizontalAsymptotes"], { horizontalAsymptotes: [-1] })))).toEqual(["AI_FUNCTION_UNSUPPORTED"]);
    expect(codes(buildSimFromSpec(fn("min(x,1)/(x-3)", ["verticalAsymptotes"], { verticalAsymptotes: [3] })))).toEqual(["AI_FUNCTION_UNSUPPORTED"]);
  });
});

describe("20F-RF5 MINOR-3 a pole that grows too slowly to confirm refuses the key", () => {
  it("√|log|x|| beside a rational pole: the key without the slow pole is not accepted", () => {
    refused("sqrt(abs(log(abs(x))))+1/(x-3)", ["verticalAsymptotes"], { verticalAsymptotes: [3] });
  });
});

describe("20F-RF5 each fail-closed layer holds on its own", () => {
  it("a domain point hidden inside an overflow run refuses the key (no vertical-asymptote task involved)", () => {
    expect(codes(buildSimFromSpec(fn("1/(x-2)^10+1/(x-3)", ["domainExclusions"], { domainExclusions: [3] })))).toEqual(["AI_FUNCTION_TOO_COMPLEX"]);
  });
  it("a coarse grid does not see the overflow around a steep pole: the pole itself is uncertain, never assumed", () => {
    // grid step 0.07 ≫ the overflow radius (≈ 0.013) of an order-8 pole placed between two samples; |x|⁸ stays inside the evaluator's range
    expect(codes(buildSimFromSpec(fn("1/(x-0.035)^8+1/(x-20)", ["verticalAsymptotes"], { xMin: -70, xMax: 70, verticalAsymptotes: [20] })))).toEqual(["AI_FUNCTION_TOO_COMPLEX"]);
  });
  it("one side a fast pole, the other side growth too slow to decide: uncertain, never a pole", () => {
    expect(codes(buildSimFromSpec(fn("sqrt(abs(log(abs(x))))+(x+abs(x))/x^2", ["verticalAsymptotes"], { verticalAsymptotes: [0] })))).toEqual(["AI_FUNCTION_TOO_COMPLEX"]);
  });
  it("an undecided approach at ±∞ is reported as such (code and probe), not as 'no limit'", () => {
    expect(codes(buildSimFromSpec(fn("1+100/sqrt(abs(x)+1)", ["horizontalAsymptotes"], { horizontalAsymptotes: [1] })))).toEqual(["AI_FUNCTION_TOO_COMPLEX"]);
    const c = compileFunction("1+100/sqrt(abs(x)+1)"); if (!c.ok) throw new Error("compile");
    const r = probeFunctionFeatures(x => { const v = evaluateFunctionAt(c.ast, x); return v.ok ? v.value : null; }, -5, 5, 10, { roots: false, points: false, poles: false, extrema: false, limits: true, slope: false }, c.ast);
    expect(r.overflow).toBe("uncertain");
  });
});
