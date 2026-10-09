import { describe, it, expect } from "vitest";
import { validateFunctionGraphSpec } from "../../../src/functionGraphs/functionGraphSpec";
import { quadraticGraph, rationalGraph, tangentGraph } from "../../../src/functionGraphs/testing/graphFixtures";
import { compileGraphExpression } from "../../../src/functionGraphs/graphExpression";
import { samplePath, SAMPLING_LIMITS } from "../../../src/functionGraphs/graphSampling";

// 21A.2 adversarial certification, not a mutation runner. Each case is an independently
// malicious descriptor, examined by the SAME production authority (never a mock validator).
// Check fail CLOSED for every attack, without accepting rewritten/sanitized malicious input.
const mutate = fn => () => { const g = structuredClone(quadraticGraph()); fn(g); return g; };
const vectors = [
  ["unknown root property", mutate(g => { g.javascript = "alert(1)"; })],
  ["unknown curve property", mutate(g => { g.curves[0].execute = "alert(1)"; })],
  ["unknown point property", mutate(g => { g.points[0].answerKey = true; })],
  ["unknown axis property", mutate(g => { g.axes.x.unsafe = true; })],
  ["embedded title HTML", mutate(g => { g.title = "<script>alert(1)</script>"; })],
  ["HTML attribute text", mutate(g => { g.description = "<img src=x onerror=alert(1)>"; })],
  ["bidirectional override in label", mutate(g => { g.points[0].label = "A\u202eB"; })],
  ["zero-width label deception", mutate(g => { g.points[0].label = "A\u200bB"; })],
  ["control character", mutate(g => { g.title += "\u0001"; })],
  ["unsupported version", mutate(g => { g.version = 2; })],
  ["prototype object id", mutate(g => { g.id = "__proto__"; })],
  ["constructor curve id", mutate(g => { g.curves[0].id = "constructor"; })],
  ["prototype point id", mutate(g => { g.points[0].id = "prototype"; })],
  ["duplicate point id", mutate(g => { g.points[1].id = "p1"; })],
  ["non-finite viewport", mutate(g => { g.viewport.xMin = NaN; })],
  ["non-finite point coordinate", mutate(g => { g.points[0].y = Infinity; })],
  ["degenerate viewport", mutate(g => { g.viewport.xMax = g.viewport.xMin; })],
  ["out-of-range viewport", mutate(g => { g.viewport.xMax = 1e9; })],
  ["point outside viewport", mutate(g => { g.points[0].x = 9e4; })],
  ["unsupported curve kind", mutate(g => { g.curves[0].kind = "javascript"; })],
  ["unsafe styling property", mutate(g => { g.curves[0].style = { fill: "url(javascript:alert(1))" }; })],
  ["malicious expression", mutate(g => { g.curves[0].expression = "x; alert(1)"; })],
  ["unknown function", mutate(g => { g.curves[0].expression = "fetch(x)"; })],
  ["unknown identifier", mutate(g => { g.curves[0].expression = "unknown*x"; })],
  ["cross-variable reference", mutate(g => { g.curves[0].expression = "t + x"; })],
  ["unbounded exponent", mutate(g => { g.curves[0].expression = "x^1000000"; })],
  ["complex expression", mutate(g => { g.curves[0].expression = Array(130).fill("x").join("+"); })],
  ["missing curves", mutate(g => { g.curves = []; })],
  ["points not array", mutate(g => { g.points = { p1: true }; })],
  ["wrong axis scale type", mutate(g => { g.axes.x.step = "pi"; })],
  ["unrecognized point role", mutate(g => { g.points[0].role = "correctAnswer"; })],
  ["forged on-curve reference", mutate(g => { g.points[0].on = ["ghostCurve"]; })],
  ["oversized description", mutate(g => { g.description = "X".repeat(1500); })],
  ["unacceptable region crossing pole", () => { const g = structuredClone(rationalGraph()); g.regions = [{ id: "r1", curve: "g", from: 1, to: 3 }]; return g; }],
  ["mathematically incorrect tangent slope", () => { const g = structuredClone(tangentGraph()); g.tangents[0].slope = 777; return g; }]
];

describe("21A2-ADV production graph authority rejects malicious descriptors", () => {
  it.each(vectors)("%s is rejected without mutation or a thrown exception", (_title, factory) => {
    const source = factory(), before = JSON.stringify(source);
    let result;
    expect(() => { result = validateFunctionGraphSpec(source); }).not.toThrow();
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(JSON.stringify(source)).toBe(before);
  });
  it("legitimate 21A.2 fixtures remain valid under the same closed validator", () => {
    expect(validateFunctionGraphSpec(quadraticGraph()).issues).toEqual([]);
    expect(validateFunctionGraphSpec(rationalGraph()).issues).toEqual([]);
    expect(validateFunctionGraphSpec(tangentGraph()).issues).toEqual([]);
  });
  it("the expression layer refuses external code, unknown functions and reserved prototype names", () => {
    for (const source of ["x;alert(1)", "window(x)", "constructor", "__proto__", "x=4", "eval(x)"]) {
      expect(compileGraphExpression(source, "x", new Set()).ok, source).toBe(false);
    }
  });
  it("the sampler clamps excessive work budgets instead of running unbounded computation", () => {
    const p = x => [x, Math.sin(x)];
    const s = samplePath(p, -3, 3, { xMin: -3, xMax: 3, yMin: -2, yMax: 2, samples: 1e9, maxDepth: 1e9, budget: 1e12 });
    expect(s.evaluations).toBeLessThanOrEqual(SAMPLING_LIMITS.maxSamples + 1 + SAMPLING_LIMITS.budget * 4 + SAMPLING_LIMITS.boundaryIterations);
  });
});
