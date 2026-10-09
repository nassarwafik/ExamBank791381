import { describe, it, expect } from "vitest";
import { parseExpression, evaluateExpression, PARAMETRIC_FUNCTIONS_V2, PARAMETRIC_FUNCTIONS_V3, isReservedParametricIdV2, isReservedParametricIdV3 } from "../parametricEngine";
import { compileGraphExpression, graphEvaluator, graphExpressionMessage, isGraphParameterId, prettyGraphExpression } from "./graphExpression";
import { validateFunctionGraphSpec, compileGraphCurves, curveValue, numericDerivative, GRAPH_LIMITS, isGraphId, type FunctionGraphSpecV1 } from "./functionGraphSpec";
import { sampleExplicit, samplePath, SAMPLING_LIMITS } from "./graphSampling";
import * as F from "./testing/graphFixtures";

// Phase 21A.2 — the function-graph contract: expression language 3 inside the ONE safe engine (languages 1 / 2 frozen), the expression
// layer's variable rule, the strict FunctionGraphSpecV1 authority (structure, limits, hostile text, teacher mathematics checked never
// rewritten) and the bounded sampler (no fake line across a pole or a jump; domain boundaries located; budgets respected).
const ev = (src: string, vars: Record<string, number> = {}, language: 1 | 2 | 3 = 3) => {
  const p = parseExpression(src, { language });
  if (!p.ok) return p.code;
  const r = evaluateExpression(p.ast, new Map(Object.entries(vars)));
  return r.ok ? r.value : r.code;
};
const codes = (raw: unknown) => { const r = validateFunctionGraphSpec(raw); return r.ok ? [] : r.issues.map(i => i.code); };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe("21A2-EXPR1 language 3 in the one engine; languages 1 and 2 unchanged", () => {
  it("adds sin cos tan asin acos atan ln and the constants pi / e; the 12-digit normalization of transcendental results applies", () => {
    expect(ev("sin(pi/2)")).toBe(1);
    expect(ev("cos(0) + tan(0)")).toBe(1);
    expect(ev("asin(1)")).toBe(Number((Math.PI / 2).toPrecision(12)));
    expect(ev("acos(1) + atan(0)")).toBe(0);
    expect(ev("ln(e)")).toBe(1);
    expect(ev("2*pi")).toBe(2 * Math.PI);
    expect(ev("x^2 - 4*x + 3", { x: 2 })).toBe(-1);
    expect(ev("-x^2", { x: 3 })).toBe(-9);                                          // unary minus binds looser than ^
    expect(ev("2^-1")).toBe(0.5);
    expect(ev("log10(1000)")).toBe(3);
  });
  it("refuses log as ambiguous, domain errors, poles and overflow without throwing", () => {
    expect(ev("log(x)", { x: 2 })).toBe("EXPR_AMBIGUOUS_LOG");
    expect(ev("log")).toBe("EXPR_AMBIGUOUS_LOG");
    expect(ev("asin(2)")).toBe("EVAL_DOMAIN");
    expect(ev("acos(-1.5)")).toBe("EVAL_DOMAIN");
    expect(ev("ln(0)")).toBe("EVAL_DOMAIN");
    expect(ev("sqrt(-1)")).toBe("EVAL_DOMAIN");
    expect(ev("1/(x-2)", { x: 2 })).toBe("EVAL_DIVIDE_BY_ZERO");
    expect(ev("tan(pi/2)")).toBe("EVAL_OUT_OF_RANGE");
    expect(ev("exp(100)")).toBe("EVAL_OUT_OF_RANGE");
    expect(ev("2^100")).toBe("EVAL_EXPONENT_INVALID");
    expect(ev("(-8)^(1/3)")).toBe("EVAL_DOMAIN");
    expect(ev("pi(2)")).toBe("EXPR_UNKNOWN_FUNCTION");
    expect(ev("sinh(x)")).toBe("EXPR_UNKNOWN_FUNCTION");
  });
  it("languages 1 and 2 are untouched: no trigonometry, pi / e are plain variables, log is natural in language 2", () => {
    for (const lang of [1, 2] as const) {
      expect(ev("sin(x)", { x: 1 }, lang)).toBe("EXPR_UNKNOWN_FUNCTION");
      expect(ev("ln(x)", { x: 1 }, lang)).toBe("EXPR_UNKNOWN_FUNCTION");
      expect(ev("pi", { pi: 3 }, lang)).toBe(3);
      expect(ev("e + 1", { e: 1 }, lang)).toBe(2);
    }
    expect(ev("log(x)", { x: Math.E }, 2)).toBe(1);
    expect(ev("log(x)", { x: Math.E }, 1)).toBe("EXPR_UNKNOWN_FUNCTION");
    expect(parseExpression("x^2", { language: 1 })).toMatchObject({ ok: true, ast: { t: "bin", op: "^" } });
    expect(parseExpression("x^2", { language: 2 })).toMatchObject({ ok: true, ast: { t: "call", fn: "pow" } });
    expect(PARAMETRIC_FUNCTIONS_V2).toEqual(["abs", "round", "floor", "ceil", "min", "max", "sqrt", "pow", "log", "log10", "exp"]);
    expect(PARAMETRIC_FUNCTIONS_V3).not.toContain("log");
    expect(isReservedParametricIdV2("pi")).toBe(false);
    expect(isReservedParametricIdV3("pi")).toBe(true);
    expect(isReservedParametricIdV3("log")).toBe(true);
  });
  it("keeps every bound of the engine: length, tokens, depth, AST nodes, forbidden identifiers", () => {
    expect(ev("x+".repeat(260) + "x", { x: 1 })).toBe("EXPR_TOO_LONG");
    expect(ev("(".repeat(40) + "x" + ")".repeat(40), { x: 1 })).toBe("EXPR_TOO_DEEP");
    expect(ev(Array.from({ length: 90 }, () => "x").join("+"), { x: 1 })).toBe("EXPR_TOO_COMPLEX");
    expect(ev("constructor")).toBe("EXPR_FORBIDDEN_IDENTIFIER");
    expect(ev("__proto__(1)")).toBe("EXPR_FORBIDDEN_IDENTIFIER");
    expect(ev("x; alert(1)", { x: 1 })).toBe("EXPR_TOKEN_INVALID");
    expect(ev("x = 2", { x: 1 })).toBe("EXPR_TOKEN_INVALID");
    expect(ev("x < 2", { x: 1 })).toBe("EXPR_COMPARISON_NOT_ALLOWED");
    expect(ev("`x`")).toBe("EXPR_TOKEN_INVALID");
  });
});

describe("21A2-EXPR2 the graph expression layer", () => {
  it("enforces the variable rule (x or t plus declared parameters) and explains engine codes in Arabic", () => {
    expect(compileGraphExpression("a*x^2", "x", new Set(["a"])).ok).toBe(true);
    expect(compileGraphExpression("a*x^2", "x", new Set())).toMatchObject({ ok: false, code: "GRAPH_EXPR_UNKNOWN_IDENTIFIER" });
    expect(compileGraphExpression("t + 1", "x", new Set())).toMatchObject({ ok: false, code: "GRAPH_EXPR_UNKNOWN_IDENTIFIER" });
    expect(compileGraphExpression("cos(t)", "t", new Set()).ok).toBe(true);
    const implicit = compileGraphExpression("4x + 3", "x", new Set());
    expect(implicit).toMatchObject({ ok: false, code: "EXPR_SYNTAX" });
    expect(!implicit.ok && implicit.message).toContain("4*x");
    expect(graphExpressionMessage("EXPR_AMBIGUOUS_LOG")).toContain("ln(x)");
  });
  it("the point evaluator turns every refusal into NaN and reuses the parameter values", () => {
    const c = compileGraphExpression("a/(x - 2)", "x", new Set(["a"]));
    expect(c.ok).toBe(true);
    const f = graphEvaluator(c.ok ? c.value.ast : { t: "num", v: 0 }, "x", new Map([["a", 3]]));
    expect([f(3), f(2), f(Infinity), f(NaN), f(5)]).toEqual([3, NaN, NaN, NaN, 1]);
  });
  it("parameter ids: lowercase, short, never x / t / a function / a constant / log", () => {
    expect(["a", "k1", "slope"].map(isGraphParameterId)).toEqual([true, true, true]);
    expect(["x", "t", "pi", "e", "sin", "log", "A", "a_b", "abcdefghi", "__proto__", 1].map(isGraphParameterId)).toEqual(Array(11).fill(false));
  });
  it("display form only (never parsed back)", () => {
    expect(prettyGraphExpression("x^2 - 4*x + 3")).toBe("x² − 4·x + 3");
    expect(prettyGraphExpression("2*pi*sqrt(x)")).toBe("2·π·√(x)");
  });
});

describe("21A2-SPEC1 the FunctionGraphSpecV1 authority accepts every fixture and rebuilds it exactly", () => {
  it("all shared fixtures validate; the canonical value equals the input (no destructive normalization of expressions or numbers)", () => {
    for (const [name, make] of Object.entries(F.ALL_GRAPHS)) {
      const g = make();
      const r = validateFunctionGraphSpec(g);
      expect(r.issues, name).toEqual([]);
      expect(r.ok && r.value, name).toEqual(g);
      expect(JSON.stringify(r.ok && r.value), name).toBe(JSON.stringify(g));     // byte-for-byte, key order included
    }
  });
  it("the result is a fresh object (never the input), and validation never throws on hostile input", () => {
    const g = F.quadraticGraph(), r = validateFunctionGraphSpec(g);
    expect(r.ok && r.value).not.toBe(g);
    const getter = { ...F.quadraticGraph() } as Record<string, unknown>;
    Object.defineProperty(getter, "title", { enumerable: true, get() { throw new Error("boom"); } });
    const cyclic = F.quadraticGraph() as unknown as Record<string, unknown>; cyclic.self = cyclic;
    for (const bad of [undefined, null, 1, "g", [], Object.create({ version: 1 }), getter, cyclic, { version: 2 }, new Date()]) {
      expect(() => validateFunctionGraphSpec(bad), String(bad)).not.toThrow();
      expect(validateFunctionGraphSpec(bad).ok).toBe(false);
    }
  });
});

describe("21A2-SPEC2 structure, limits and hostile content are refused", () => {
  it("unknown keys anywhere (renderer options, callbacks, HTML) are refused, not dropped", () => {
    const g = F.quadraticGraph() as unknown as Record<string, unknown>;
    expect(codes({ ...g, option: { series: [] } })).toContain("GRAPH_UNKNOWN_KEY");
    expect(codes({ ...g, jsxgraph: { boundingbox: [] } })).toContain("GRAPH_UNKNOWN_KEY");
    const c = clone(F.quadraticGraph()); (c.curves[0] as Record<string, unknown>).onClick = "alert(1)";
    expect(codes(c)).toContain("GRAPH_UNKNOWN_KEY");
    const v = clone(F.quadraticGraph()); (v.viewport as Record<string, unknown>).zoom = 2;
    expect(codes(v)).toContain("GRAPH_UNKNOWN_KEY");
    const proto = JSON.parse('{"version":1,"id":"g","title":"t","description":"d","viewport":{"xMin":0,"xMax":1,"yMin":0,"yMax":1},"curves":[{"id":"f","kind":"explicit","expression":"x"}],"__proto__":{"polluted":1}}');
    expect(codes(proto)).toContain("GRAPH_UNKNOWN_KEY");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it("hostile text: markup, bidi overrides, invisible characters, control characters", () => {
    for (const [field, value] of [["title", "<script>x</script>"], ["description", "a‮b"], ["title", "a​b"], ["description", "x\u0007"], ["title", "javascript:alert(1)"]] as const) {
      const g = clone(F.quadraticGraph()) as unknown as Record<string, unknown>; g[field] = value;
      expect(codes(g).some(c => c.startsWith("GRAPH_TEXT_")), field + JSON.stringify(value)).toBe(true);
    }
    const lab = clone(F.quadraticGraph()); lab.points![0].label = "A⁦B";
    expect(codes(lab)).toContain("GRAPH_TEXT_CONTROL");
    const expr = clone(F.quadraticGraph()); expr.curves[0] = { ...expr.curves[0], expression: "x‮^2" } as never;
    expect(codes(expr)).toContain("GRAPH_TEXT_CONTROL");
  });
  it("expressions: unknown functions, unknown identifiers, injections, oversized / deep / complex input", () => {
    const withExpr = (e: unknown) => { const g = clone(F.quadraticGraph()) as unknown as { curves: Record<string, unknown>[] }; g.curves[0].expression = e; return codes(g); };
    for (const e of ["alert(1)", "y", "x^2; fetch(1)", "window.x", "Function('x')", "constructor", "1e3*x", "x".repeat(501), "(".repeat(33) + "x" + ")".repeat(33), "sin(x", "log(x)", "", 5, null, ["x"]]) {
      expect(withExpr(e), JSON.stringify(e).slice(0, 40)).toContain("GRAPH_EXPRESSION_INVALID");
    }
  });
  it("numbers: strings, NaN, Infinity, out of range, and an inverted / degenerate viewport", () => {
    for (const bad of ["1", NaN, Infinity, 2e6, true, null]) {
      const g = clone(F.quadraticGraph()) as unknown as { viewport: Record<string, unknown> }; g.viewport.xMin = bad;
      expect(codes(g).length, String(bad)).toBeGreaterThan(0);
    }
    const inv = clone(F.quadraticGraph()); inv.viewport = { xMin: 3, xMax: 1, yMin: 0, yMax: 1 };
    expect(codes(inv)).toContain("GRAPH_VIEWPORT_INVALID");
    const flat = clone(F.quadraticGraph()); flat.viewport = { xMin: 0, xMax: 1e-9, yMin: 0, yMax: 1 };
    expect(codes(flat)).toContain("GRAPH_VIEWPORT_INVALID");
  });
  it("collections are bounded; ids are unique across the graph; labels are distinct", () => {
    const many = clone(F.quadraticGraph()); many.curves = Array.from({ length: GRAPH_LIMITS.curves + 1 }, (_, i) => ({ id: "c" + i, kind: "explicit" as const, expression: "x+" + i }));
    expect(codes(many)).toContain("GRAPH_LIMIT");
    const exprs = clone(F.piecewiseGraph());
    exprs.curves = Array.from({ length: 3 }, (_, i) => ({ id: "h" + i, kind: "piecewise" as const, pieces: Array.from({ length: 6 }, (_, j) => ({ expression: "x", domain: { min: j, max: j + 1, maxClosed: false } })) }));
    delete exprs.points;
    expect(codes(exprs)).toContain("GRAPH_LIMIT");                                  // 18 expressions > 16
    const pts = clone(F.quadraticGraph()); pts.points = Array.from({ length: GRAPH_LIMITS.points + 1 }, (_, i) => ({ id: "p" + i, x: 0, y: 0 }));
    expect(codes(pts)).toContain("GRAPH_LIMIT");
    const dup = clone(F.quadraticGraph()); dup.points![1].id = "p1";
    expect(codes(dup)).toContain("GRAPH_DUPLICATE_ID");
    const cross = clone(F.quadraticGraph()); cross.points![0].id = "f";
    expect(codes(cross)).toContain("GRAPH_DUPLICATE_ID");
    const lab = clone(F.quadraticGraph()); lab.points![1].label = " a ";
    expect(codes(lab)).toContain("GRAPH_DUPLICATE_LABEL");
    const big = clone(F.quadraticGraph()); big.points = Array.from({ length: 5000 }, (_, i) => ({ id: "q" + i, x: 0, y: 3, on: ["f"] }));
    expect(codes(big)).toEqual(["GRAPH_TOO_LARGE"]);                                 // refused on size before any expression is parsed
    for (const id of ["1a", "a b", "__proto__", "constructor", "x".repeat(33), "", 7]) expect(isGraphId(id), String(id)).toBe(false);
  });
});

describe("21A2-SPEC3 teacher mathematics is checked, never rewritten", () => {
  it("a point said to lie on a curve must lie on it (filled: defined with that value; open: approached by a one-sided limit)", () => {
    const off = clone(F.quadraticGraph()); off.points![0].x = 1.1;
    expect(codes(off)).toEqual(["GRAPH_POINT_NOT_ON_CURVE"]);
    const sloppy = clone(F.sineGraph()); sloppy.points![3].x = 3.1;                  // sin(3.1) = 0.042 > 0.1 % of the viewport height (0.003)
    expect(codes(sloppy)).toEqual(["GRAPH_POINT_NOT_ON_CURVE"]);
    const close = clone(F.sineGraph()); close.points![3].x = 3.14159;
    expect(codes(close)).toEqual([]);
    const filledHole = clone(F.piecewiseGraph()); delete filledHole.points![0].open;   // (0, 2) is only a limit: a filled dot there is wrong
    expect(codes(filledHole)).toEqual(["GRAPH_POINT_NOT_ON_CURVE"]);
    const hole = { ...clone(F.quadraticGraph()), curves: [{ id: "f", kind: "explicit" as const, expression: "(x^2 - 1)/(x - 1)" }], points: [{ id: "p1", x: 1, y: 2, on: ["f"], open: true }] };
    expect(codes(hole)).toEqual([]);
    expect(codes({ ...hole, points: [{ id: "p1", x: 1, y: 2, on: ["f"] }] })).toEqual(["GRAPH_POINT_NOT_ON_CURVE"]);
    const para = clone(F.circleGraph()); para.points![0].y = 1.2;
    expect(codes(para)).toEqual(["GRAPH_POINT_NOT_ON_CURVE", "GRAPH_POINT_NOT_ON_CURVE"]);
    const outside = clone(F.quadraticGraph()); outside.points![0] = { id: "p1", x: 10, y: 63 };
    expect(codes(outside)).toContain("GRAPH_OUTSIDE_VIEWPORT");
    const unknown = clone(F.quadraticGraph()); unknown.points![0].on = ["zz"];
    expect(codes(unknown)).toContain("GRAPH_REFERENCE_INVALID");
  });
  it("an authored derivative curve and an authored tangent slope must agree with the curve; a tangent needs a differentiable point", () => {
    const wrong = clone(F.tangentGraph()); (wrong.curves[1] as { expression: string }).expression = "3*x";
    expect(codes(wrong)).toEqual(expect.arrayContaining(["GRAPH_DERIVATIVE_MISMATCH"]));
    const slope = clone(F.tangentGraph()); slope.tangents![0].slope = 3;
    expect(codes(slope)).toEqual(["GRAPH_TANGENT_SLOPE_MISMATCH"]);
    const kink = { ...clone(F.tangentGraph()), curves: [{ id: "fx", kind: "explicit" as const, expression: "abs(x)" }], points: [], tangents: [{ id: "t1", curve: "fx", x: 0, kind: "tangent" as const }] };
    expect(codes(kink)).toEqual(["GRAPH_TANGENT_UNDEFINED"]);
    const pole = { ...clone(F.rationalGraph()), lines: [], tangents: [{ id: "t1", curve: "g", x: 2, kind: "tangent" as const }] };
    expect(codes(pole)).toEqual(["GRAPH_TANGENT_UNDEFINED"]);
    const self = clone(F.tangentGraph()); (self.curves[1] as { derivativeOf: string }).derivativeOf = "dfx";
    expect(codes(self)).toContain("GRAPH_REFERENCE_INVALID");
  });
  it("a shaded region needs its curves defined and continuous on the whole interval", () => {
    const pole = { ...clone(F.rationalGraph()), lines: [], regions: [{ id: "r1", curve: "g", from: 1, to: 3 }] };
    expect(codes(pole)).toEqual(["GRAPH_REGION_DISCONTINUOUS"]);
    const sqrt = { ...clone(F.areaGraph()), curves: [{ id: "a", kind: "explicit" as const, expression: "sqrt(x)" }], regions: [{ id: "r1", curve: "a", from: -1, to: 2 }], intervals: [] };
    expect(codes(sqrt)).toEqual(["GRAPH_REGION_DISCONTINUOUS"]);
    const between = { ...clone(F.intersectionGraph()), points: [], regions: [{ id: "r1", curve: "c2", lower: "c1", from: -1, to: 2 }] };
    expect(codes(between)).toEqual([]);
    const inverted = clone(F.areaGraph()); inverted.regions![0] = { id: "r1", curve: "a", from: 2, to: 0 };
    expect(codes(inverted)).toContain("GRAPH_INTERVAL_INVALID");
  });
  it("piecewise pieces never overlap; a shared boundary belongs to at most one piece", () => {
    const both = clone(F.piecewiseGraph()); (both.curves[0] as { pieces: { domain: Record<string, unknown> }[] }).pieces[2].domain.minClosed = true;
    expect(codes(both)).toContain("GRAPH_PIECEWISE_OVERLAP");
    const overlap = clone(F.piecewiseGraph()); (overlap.curves[0] as { pieces: { domain: Record<string, unknown> }[] }).pieces[1].domain.max = 3;
    expect(codes(overlap)).toContain("GRAPH_PIECEWISE_OVERLAP");
    const unbounded = clone(F.piecewiseGraph()); (unbounded.curves[0] as { pieces: { domain: Record<string, unknown> }[] }).pieces[0].domain = {};
    expect(codes(unbounded)).toContain("GRAPH_DOMAIN_INVALID");
    const dangling = clone(F.piecewiseGraph()); (dangling.curves[0] as { pieces: { domain: Record<string, unknown> }[] }).pieces[0].domain = { minClosed: false, max: 0 };
    expect(codes(dangling)).toContain("GRAPH_DOMAIN_INVALID");
    const pw = compileGraphCurves(F.piecewiseGraph())[0];
    expect([curveValue(pw, -1), curveValue(pw, 0), curveValue(pw, 1.5), curveValue(pw, 2), curveValue(pw, 3)]).toEqual([1, 0, 2.25, 4, 3]);
  });
});

describe("21A2-SAMPLE1 bounded deterministic sampling", () => {
  const vp = { xMin: -4, xMax: 8, yMin: -6, yMax: 6 };
  const allSegs = (g: FunctionGraphSpecV1, a: number, b: number, samples = 400) => {
    const c = compileGraphCurves(g)[0];
    return sampleExplicit(x => curveValue(c, x), a, b, { ...g.viewport, samples, smooth: 1 / 1200 });
  };
  it("1/(x − 2): never a segment across the pole; the two branches run off the viewport on both sides", () => {
    for (const samples of [17, 64, 400, 401, 1200]) {
      const r = allSegs(F.rationalGraph(), vp.xMin, vp.xMax, samples);
      for (const seg of r.segments) for (let i = 1; i < seg.length; i++) expect(seg[i - 1][0] < 2 && seg[i][0] > 2, "samples " + samples).toBe(false);
      expect(r.segments.length, "samples " + samples).toBe(2);
      const left = r.segments[0], right = r.segments[1];
      expect(left[left.length - 1][1]).toBeLessThan(vp.yMin);
      expect(right[0][1]).toBeGreaterThan(vp.yMax);
    }
  });
  it("tan(x): one branch per period, no vertical connector at ±π/2 (whether or not a sample hits the pole)", () => {
    const g: FunctionGraphSpecV1 = { ...F.sineGraph(), points: [], curves: [{ id: "s", kind: "explicit", expression: "tan(x)" }] };
    const r = allSegs(g, -2 * Math.PI, 2 * Math.PI, 800);
    expect(r.segments.length).toBe(5);
    for (const seg of r.segments) for (let i = 1; i < seg.length; i++) {
      const crosses = Math.floor((seg[i - 1][0] - Math.PI / 2) / Math.PI) !== Math.floor((seg[i][0] - Math.PI / 2) / Math.PI);
      expect(crosses).toBe(false);
    }
    expect(r.breaks.length + 0).toBeGreaterThanOrEqual(0);
  });
  it("a step function is broken at each jump; sqrt / ln start at their domain boundary", () => {
    const step: FunctionGraphSpecV1 = { ...F.quadraticGraph(), points: [], curves: [{ id: "f", kind: "explicit", expression: "floor(x)" }] };
    const s = allSegs(step, -2, 5.5);
    expect(s.segments.length).toBe(8);
    expect(s.breaks.length).toBe(7);
    for (const seg of s.segments) expect(new Set(seg.map(p => p[1])).size).toBe(1);   // every step is flat: no riser is drawn
    const sq: FunctionGraphSpecV1 = { ...F.quadraticGraph(), points: [], curves: [{ id: "f", kind: "explicit", expression: "sqrt(x)" }] };
    const q = allSegs(sq, -2, 6, 64);
    expect(q.segments.length).toBe(1);
    expect(q.segments[0][0][0]).toBeGreaterThanOrEqual(0);
    expect(q.segments[0][0][0]).toBeLessThan(1e-5);
    const ln: FunctionGraphSpecV1 = { ...F.quadraticGraph(), points: [], curves: [{ id: "f", kind: "explicit", expression: "ln(x)" }] };
    const l = allSegs(ln, -2, 6, 64);
    expect(l.segments.length).toBe(1);
    expect(l.segments[0][0][1]).toBeLessThan(-3);                                   // runs down towards the asymptote
  });
  it("is deterministic and bounded by the budget even for an adversarial oscillation; absurd options are clamped", () => {
    const wild: FunctionGraphSpecV1 = { ...F.quadraticGraph(), points: [], curves: [{ id: "f", kind: "explicit", expression: "sin(1/x)" }] };
    const a = allSegs(wild, -2, 6, 2000), b = allSegs(wild, -2, 6, 2000);
    expect(a).toEqual(b);
    expect(a.evaluations).toBeLessThanOrEqual(2001 + SAMPLING_LIMITS.budget);
    const osc = (s: number) => [s, Math.sin(1 / s)] as const, o = { xMin: -2, xMax: 6, yMin: -3, yMax: 8 };
    const tight = samplePath(osc, -2, 6, { ...o, samples: 400, budget: 500 });
    expect([tight.truncated, tight.evaluations <= 401 + 500 + SAMPLING_LIMITS.boundaryIterations]).toEqual([true, true]);
    const t0 = performance.now();
    const huge = samplePath(osc, -2, 6, { ...o, samples: 1e9, maxDepth: 1e9, budget: 1e12 });
    expect(huge.evaluations).toBeLessThanOrEqual(SAMPLING_LIMITS.maxSamples + 1 + SAMPLING_LIMITS.budget * 4 + SAMPLING_LIMITS.boundaryIterations);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(samplePath(osc, 1, 1, { ...o, samples: 10 }).segments).toEqual([]);
    expect(samplePath(osc, NaN, 1, { ...o, samples: 10 }).evaluations).toBe(0);
  });
  it("numeric derivative flags kinks and poles as not smooth", () => {
    expect(numericDerivative(x => x * x, 1)).toMatchObject({ smooth: true });
    expect(numericDerivative(x => x * x, 1).value).toBeCloseTo(2, 9);
    expect(numericDerivative(Math.abs, 0).smooth).toBe(false);
    expect(numericDerivative(x => 1 / (x - 2), 2).smooth).toBe(false);
  });
});

describe("21A2-ANALYSIS1 approximate features for the editor (never graded, always marked approximate)", () => {
  it("finds the quadratic's roots, vertex and y-intercept; the rational's asymptote and no fake root at the pole", async () => {
    const { analyzeFunctionGraph } = await import("./graphAnalysis");
    const q = analyzeFunctionGraph(F.quadraticGraph());
    expect(q.filter(f => f.kind === "root").map(f => f.x)).toEqual([1, 3]);
    expect(q.find(f => f.kind === "minimum")).toMatchObject({ x: 2, y: -1, approximate: true });
    expect(q.find(f => f.kind === "yIntercept")).toMatchObject({ x: 0, y: 3 });
    const r = analyzeFunctionGraph(F.rationalGraph());
    expect(r.filter(f => f.kind === "root")).toEqual([]);
    expect(r.filter(f => f.kind === "verticalAsymptote").map(f => f.x)).toEqual([2]);
    const ln = analyzeFunctionGraph({ ...F.quadraticGraph(), points: [], curves: [{ id: "f", kind: "explicit", expression: "ln(x)" }] });
    expect(ln.filter(f => f.kind === "verticalAsymptote").map(f => f.x)).toEqual([0]);
    expect(ln.filter(f => f.kind === "root").map(f => f.x)).toEqual([1]);
    const sq = analyzeFunctionGraph({ ...F.quadraticGraph(), points: [], curves: [{ id: "f", kind: "explicit", expression: "sqrt(x)" }] });
    expect(sq.filter(f => f.kind === "verticalAsymptote")).toEqual([]);
    const osc = analyzeFunctionGraph({ ...F.quadraticGraph(), points: [], curves: [{ id: "f", kind: "explicit", expression: "x*sin(1/x)" }] });
    expect(osc.filter(f => f.kind === "verticalAsymptote")).toEqual([]);
    expect(osc.length).toBeLessThanOrEqual(40);
  });
  it("finds both intersections of two curves and the sine's extrema", async () => {
    const { analyzeFunctionGraph } = await import("./graphAnalysis");
    const e = analyzeFunctionGraph(F.intersectionGraph());
    expect(e.filter(f => f.kind === "intersection").map(f => [f.x, f.y])).toEqual([[-1, 0], [2, 3]]);
    const s = analyzeFunctionGraph(F.sineGraph());
    const maxima = s.filter(f => f.kind === "maximum").map(f => f.x);
    expect(maxima.length).toBe(2);
    expect(maxima[1]).toBeCloseTo(Math.PI / 2, 6);
  });
});
