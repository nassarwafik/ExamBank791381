import { describe, it, expect } from "vitest";
import { buildSimFromSpec, probeFunctionFeatures } from "./composerSim";
import { normalizePlanShape, validatePlan } from "./composerPlan";
import { normalizeComposerIntent } from "./composerIntent";
import { compileFunction, evaluateFunctionAt } from "../functionStudyModel";
import * as F from "./testing/composerFakeAi";

// Phase 20F — Review Fix 3 (fresh re-review of bd71428: 0 BLOCKER, 0 MAJOR, 5 MINOR). Fail-first on bd71428.
//   MINOR-1 the probe budget counted evaluations, not their cost: a large expression ran ~20 000 heavy evaluations per simulator;
//   MINOR-2 (RF2 regression) poles of order ≥ 3 overflowed the evaluator before the growth test could see them;
//   MINOR-3 (RF2 regression) a flat stretch started a ternary search at every sample and exhausted the budget (false TOO_COMPLEX);
//   MINOR-4 the older soundness checks used absolute thresholds: log poles and slowly converging / logistic limits were refused;
//   MINOR-5 the plan accepted more function-study simulators in one section than a section draft may carry.
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const fn = (source: string, tasks: string[], over: Record<string, unknown> = {}) => F.funcSim({ source, xMin: -5, xMax: 5, yMin: -10, yMax: 10, tasks, domainExclusions: [], xIntercepts: [], yIntercept: null, verticalAsymptotes: [], horizontalAsymptotes: [], extrema: [], intervals: [], ...over });

describe("20F-RF3 MINOR-1 the probe budget is weighted by the expression's size", () => {
  it("a large expression gets proportionally fewer evaluations (node-evaluations bounded)", () => {
    const src = "(x-0.013)*(1+abs(11.3*x-round(11.3*x)))+0*(" + Array.from({ length: 12 }, () => "exp(x)+abs(x)").join("+") + ")";
    const c = compileFunction(src); if (!c.ok) throw new Error("compile");
    let n = 0;
    probeFunctionFeatures(x => { n++; const r = evaluateFunctionAt(c.ast, x); return r.ok ? r.value : null; }, -5, 5, 10, undefined, c.ast);
    expect(n).toBeLessThanOrEqual(8000);
  });
});

describe("20F-RF3 task gating: only the enabled tasks' features are located", () => {
  it("a zigzag with two roots but dozens of extrema keeps its roots-only key", () => {
    // (x − 0.5)·(2 + zigzag): one root, many slope changes — probing the extrema refuses the key, roots alone do not. Since Review Fix 11
    // the searches stop at the precision of x (fewer evaluations than a fixed 80 steps), so the probe now reaches the 11th extremum —
    // more than a key can hold — before its budget runs out: still refused, now with the reason that names it.
    const gate = "(x-0.5)*(2+abs(abs(abs(abs(abs(abs(x)-2.5)-1.25)-0.625)-0.3125)-0.15625))";
    expect(buildSimFromSpec(fn(gate, ["xIntercepts"], { xIntercepts: [0.5] })).ok).toBe(true);
    expect(codes(buildSimFromSpec(fn(gate, ["xIntercepts", "extrema"], { xIntercepts: [0.5] })))).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
  });
});

describe("20F-RF3 MINOR-2 high-order poles are found", () => {
  it("poles of order 3 and 4 are required in the key", () => {
    expect(codes(buildSimFromSpec(fn("1/(x-1)^3+1/(x+3)", ["verticalAsymptotes"], { verticalAsymptotes: [-3] })))).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
    expect(buildSimFromSpec(fn("1/(x-1)^3+1/(x+3)", ["verticalAsymptotes"], { verticalAsymptotes: [-3, 1] })).ok).toBe(true);
    expect(codes(buildSimFromSpec(fn("1/(x-0.0123)^4+1/(x-3)", ["verticalAsymptotes"], { verticalAsymptotes: [3] })))).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
    expect(buildSimFromSpec(fn("1/(x-0.0123)^4+1/(x-3)", ["verticalAsymptotes"], { verticalAsymptotes: [0.0123, 3] })).ok).toBe(true);
  });
});

describe("20F-RF3 MINOR-3 flat stretches are not touching roots", () => {
  it("piecewise-linear functions with plateaus keep their correct keys", () => {
    expect(buildSimFromSpec(fn("abs(x-1)+abs(x+1)-3", ["xIntercepts"], { xIntercepts: [-1.5, 1.5] })).ok).toBe(true);
    expect(buildSimFromSpec(fn("3-abs(x-1)-abs(x+1)", ["xIntercepts"], { xIntercepts: [-1.5, 1.5] })).ok).toBe(true);
  });
});

describe("20F-RF3 MINOR-4 soundness uses the same pole / limit logic as completeness", () => {
  it("a logarithmic pole is a vertical asymptote", () => {
    expect(buildSimFromSpec(fn("log(abs(x))+1/(x-3)", ["verticalAsymptotes"], { verticalAsymptotes: [0, 3] })).ok).toBe(true);
  });
  it("slowly converging and logistic limits are accepted; a logistic key missing a side is refused", () => {
    expect(buildSimFromSpec(fn("3*x/(x+500)", ["horizontalAsymptotes"], { horizontalAsymptotes: [3] })).ok).toBe(true);
    expect(buildSimFromSpec(fn("5/(1+exp(-x))", ["horizontalAsymptotes"], { horizontalAsymptotes: [0, 5] })).ok).toBe(true);
    expect(codes(buildSimFromSpec(fn("5/(1+exp(-x))", ["horizontalAsymptotes"], { horizontalAsymptotes: [5] })))).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
  });
  it("a periodic expression is never given an AI key (round / floor / ceil / min / max / % are not AI vocabulary — Review Fix 5)", () => {
    expect(codes(buildSimFromSpec(fn("1000+1000*abs(100*x-round(100*x))", ["horizontalAsymptotes"], { horizontalAsymptotes: [1000] })))).toEqual(["AI_FUNCTION_UNSUPPORTED"]);
  });
});

describe("20F-RF3 MINOR-5 the plan respects the per-section function-simulator cap", () => {
  it("more function-study simulators in one section than a draft may carry is a blocking plan issue", () => {
    const ir = normalizeComposerIntent({ v: 1, subject: "رياضيات", language: "ar", totalMarks: 7 }); if (!ir.ok) throw new Error("intent");
    const plan = (n: number) => normalizePlanShape(F.plan("t", "default", [F.planSection("أ", [...Array.from({ length: n }, () => F.planItem("smartSim", 1, { simulator: "functionStudy2d" })), ...Array.from({ length: 7 - n }, () => F.planItem("multipleChoice", 1))])]));
    const p7 = plan(7); if (!p7.ok) throw new Error("plan");
    expect(validatePlan(p7.plan, ir.intent).blocking.map(i => i.code)).toContain("PLAN_FUNCTION_SIM_LIMIT");
    const p6 = plan(6); if (!p6.ok) throw new Error("plan");
    expect(validatePlan(p6.plan, ir.intent).blocking.map(i => i.code)).not.toContain("PLAN_FUNCTION_SIM_LIMIT");
  });
});
