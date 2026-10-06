import { describe, it, expect } from "vitest";
import { buildSimFromSpec, probeFunctionFeatures } from "./composerSim";
import { compileFunction, evaluateFunctionAt } from "../functionStudyModel";
import * as F from "./testing/composerFakeAi";

// Phase 20F — Review Fix 4 (fresh re-review of ce23bdd: 0 BLOCKER, 0 MAJOR, 3 MINOR). Fail-first on ce23bdd.
//   MINOR-A every AST node weighed 1, but exp / log / pow / round cost ~10×: nested call chains packed the budget with expensive calls;
//   MINOR-B the limit tiers jumped by 100×: sigmoid / tanh limits were never evaluable or not yet settled (correct keys refused,
//           one-sided keys accepted);
//   MINOR-C (RF3 regression) a very steep pole overflowed the evaluator after one finite sample: correct keys refused.
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const fn = (source: string, tasks: string[], over: Record<string, unknown> = {}) => F.funcSim({ source, xMin: -5, xMax: 5, yMin: -10, yMax: 10, tasks, domainExclusions: [], xIntercepts: [], yIntercept: null, verticalAsymptotes: [], horizontalAsymptotes: [], extrema: [], intervals: [], ...over });

describe("20F-RF4 MINOR-A expensive calls weigh more in the probe budget", () => {
  it("a nested exp / log chain gets a proportionally smaller evaluation budget", () => {
    const chain = "log(exp(".repeat(12) + "x" + "))".repeat(12);
    const src = "x*(1+abs(11.3*x-round(11.3*x)))+0*(" + chain + "+" + chain + ")";
    const c = compileFunction(src); if (!c.ok) throw new Error("compile");
    let n = 0;
    probeFunctionFeatures(x => { n++; const r = evaluateFunctionAt(c.ast, x); return r.ok ? r.value : null; }, -5, 5, 10, undefined, c.ast);
    expect(n).toBeLessThanOrEqual(5000);
    const powers = "x*(1+abs(11.3*x-round(11.3*x)))+0*(" + "(".repeat(24) + "x" + "^1)".repeat(24) + ")";
    const p = compileFunction(powers); if (!p.ok) throw new Error("compile");
    let m = 0;
    probeFunctionFeatures(x => { m++; const r = evaluateFunctionAt(p.ast, x); return r.ok ? r.value : null; }, -5, 5, 10, undefined, p.ast);
    expect(m).toBeLessThanOrEqual(5000);                                                               // powers weigh like calls
  });
});

describe("20F-RF4 MINOR-B sigmoid and tanh limits are found on both sides", () => {
  it("a slowly converging limit is extrapolated (the geometric tail is added, not the last sample)", () => {
    expect(buildSimFromSpec(fn("500+1000/sqrt(abs(x)+1)", ["horizontalAsymptotes"], { yMin: -600, yMax: 600, horizontalAsymptotes: [500] })).ok).toBe(true);
  });
  it("correct two-sided keys pass; one-sided keys are incomplete", () => {
    for (const [src, both, one] of [["5/(1+exp(-0.5*x))", [0, 5], [5]], ["100/(1+9*exp(-0.2*x))", [0, 100], [100]], ["5/(1+exp(-2*x))", [0, 5], [5]], ["(exp(2*x)-1)/(exp(2*x)+1)", [-1, 1], [-1]]] as const) {
      const ok = buildSimFromSpec(fn(src, ["horizontalAsymptotes"], { yMin: -120, yMax: 120, horizontalAsymptotes: both }));
      expect(ok.ok, src + " " + JSON.stringify(codes(ok))).toBe(true);
      expect(codes(buildSimFromSpec(fn(src, ["horizontalAsymptotes"], { yMin: -120, yMax: 120, horizontalAsymptotes: one }))), src).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
    }
  });
});

describe("20F-RF4 MINOR-C very steep poles and exp(1/x) are vertical asymptotes", () => {
  it("correct keys pass; keys missing the steep pole are incomplete", () => {
    for (const [src, both, one] of [["1/(x+3)+1000/(x-2)^4", [-3, 2], [-3]], ["1/(x+3)+1000000/(x-2)^3", [-3, 2], [-3]], ["exp(1/x)+1/(x-3)", [0, 3], [3]]] as const) {
      const ok = buildSimFromSpec(fn(src, ["verticalAsymptotes"], { verticalAsymptotes: both }));
      expect(ok.ok, src + " " + JSON.stringify(codes(ok))).toBe(true);
      expect(codes(buildSimFromSpec(fn(src, ["verticalAsymptotes"], { verticalAsymptotes: one }))), src).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
    }
  });
});
