import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { validateFunctionGraphSpec, projectGraphForStudent, type FunctionGraphSpecV1 } from "./functionGraphSpec";
import { ALL_GRAPHS } from "./testing/graphFixtures";
import { mapAiGraph } from "../aiComposer/composerGraph";
import { scoreFunctionGraphSelection, bindFunctionGraphSelectionAnswerToQuestion } from "../functionGraphSelectionQuestion";
import { quadraticGraph } from "./testing/graphFixtures";

// Phase 21A.2 — Review Fix 1: the confirmed findings of the independent read-only review of 65c21e7 (lane A: A-1, A-2; lane B: B-1, B-2).
// The `RF1` cases reproduce the findings on 65c21e7 (each group has at least one case failing there) and pass after the fix; the `pin` cases
// hold behaviour that must survive the fix.
const codes = (g: unknown) => { const r = validateFunctionGraphSpec(g); return r.ok ? [] : r.issues.map(i => i.code); };
const base = (over: Partial<FunctionGraphSpecV1>): FunctionGraphSpecV1 => ({
  version: 1, id: "g-rf1", title: "رسم", description: "رسم للمراجعة.", viewport: { xMin: -1, xMax: 3, yMin: -1, yMax: 9 },
  curves: [{ id: "f", kind: "explicit", expression: "x^2" }], ...over
});

describe("RF1 B-1 — a graph valid for the teacher stays valid after the student projection", () => {
  // f = x² on x ≥ 0, df = 2x authored as its derivative, a tangent at the domain end x = 0: no two-sided derivative there. On 65c21e7 the
  // authored derivative (teacher-only, removed from the student projection) made it valid, so the published question could not render
  // for the student and a blank attempt graded 0 without review.
  const endpoint = base({
    curves: [{ id: "f", kind: "explicit", expression: "x^2", domain: { min: 0 } }, { id: "df", kind: "explicit", expression: "2*x", derivativeOf: "f" }],
    tangents: [{ id: "t1", curve: "f", x: 0, kind: "tangent" }, { id: "t2", curve: "f", x: 1, kind: "tangent" }]
  });
  it("RF1: a tangent where the curve itself is not differentiable is refused even when a derivative curve is authored", () => {
    expect(codes(endpoint)).toContain("GRAPH_TANGENT_UNDEFINED");
  });
  it("RF1: the same tangent away from the endpoint is valid, and stays valid after projection", () => {
    const ok = { ...endpoint, tangents: [endpoint.tangents![1]] };
    const v = validateFunctionGraphSpec(ok);
    expect(v.ok).toBe(true);
    if (v.ok) expect(codes(projectGraphForStudent(v.value))).toEqual([]);
  });
  it("pin: every fixture graph that validates still validates after the student projection", () => {
    const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../docs/fixtures/function-graphs-21a2/ExamBank_21A2_Function_Graphs_Mini_Acceptance.json"), "utf8"));
    const graphs: unknown[] = Object.values(ALL_GRAPHS).map(make => make());
    const walk = (v: unknown) => {
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (!v || typeof v !== "object") return;
      const o = v as Record<string, unknown>;
      if (o.version === 1 && Array.isArray(o.curves) && typeof o.viewport === "object") graphs.push(o);
      Object.values(o).forEach(walk);
    };
    walk(fixture);
    expect(graphs.length).toBeGreaterThanOrEqual(20);
    for (const g of graphs) {
      const v = validateFunctionGraphSpec(g);
      expect(v.ok, (g as { id: string }).id).toBe(true);
      if (v.ok) expect(codes(projectGraphForStudent(v.value)), v.value.id).toEqual([]);
    }
  });
});

describe("RF1 A-2 — an authored tangent slope is checked against the curve, never against an authored derivative curve", () => {
  // a WRONG derivative curve 3x whose narrow domain [0.2, 0.5] escapes the derivative check's sample points: on 65c21e7 the tangent check
  // trusted it — the true slope 0.6 of x² at 0.3 was refused and the wrong 0.9 accepted
  const g = (slope: number) => base({
    curves: [{ id: "f", kind: "explicit", expression: "x^2" }, { id: "df", kind: "explicit", expression: "3*x", domain: { min: 0.2, max: 0.5 }, derivativeOf: "f" }],
    tangents: [{ id: "t1", curve: "f", x: 0.3, kind: "tangent", slope }]
  });
  it("RF1: the true slope is accepted", () => { expect(codes(g(0.6))).not.toContain("GRAPH_TANGENT_SLOPE_MISMATCH"); });
  it("RF1: a wrong slope is refused", () => { expect(codes(g(0.9))).toContain("GRAPH_TANGENT_SLOPE_MISMATCH"); });
  it("RF1: a derivative curve is checked inside its own domain, and one with no checkable point is not certified", () => {
    const der = (expression: string, domain?: { min: number; max: number }) => codes(base({ curves: [{ id: "f", kind: "explicit", expression: "x^2" }, { id: "df", kind: "explicit", expression, ...(domain ? { domain } : {}), derivativeOf: "f" }] }));
    expect(der("3*x", { min: 0.2, max: 0.5 })).toContain("GRAPH_DERIVATIVE_MISMATCH");
    expect(der("sqrt(-1-x^2)")).toContain("GRAPH_DERIVATIVE_MISMATCH");
    expect(der("2*x", { min: 0.2, max: 0.5 })).toEqual([]);
    expect(der("2*x")).toEqual([]);
  });
  it("pin: the tolerance boundary of the slope check (x² at 1: 2.0029 accepted, 2.0031 refused)", () => {
    const t = (slope: number) => codes(base({ tangents: [{ id: "t1", curve: "f", x: 1, kind: "tangent", slope }] }));
    expect(t(2.0029)).toEqual([]);
    expect(t(2.0031)).toContain("GRAPH_TANGENT_SLOPE_MISMATCH");
  });
});

describe("RF1 A-1 — a shaded region never spans a pole, also when the curve leaves the viewport on both sides of it", () => {
  const region = (expression: string, from: number, to: number, vp = { xMin: -4, xMax: 5, yMin: -3, yMax: 6 }) =>
    codes(base({ viewport: vp, curves: [{ id: "f", kind: "explicit", expression }], regions: [{ id: "r1", curve: "f", from, to }] }));
  it("RF1: 1/x² over [−1, 2] (an even pole at 0, between two grid points) is refused", () => {
    expect(region("1/x^2", -1, 2)).toContain("GRAPH_REGION_DISCONTINUOUS");
  });
  it("RF1: 1/(x−2)² over [1, 3.3] is refused", () => {
    expect(region("1/(x-2)^2", 1, 3.3)).toContain("GRAPH_REGION_DISCONTINUOUS");
  });
  it("RF1: ln(abs(x)) over [−1, 2] (a logarithmic pole, growing slowly) is refused", () => {
    expect(region("ln(abs(x))", -1, 2)).toContain("GRAPH_REGION_DISCONTINUOUS");
  });
  it("pin: bounded curves that leave the viewport keep their regions (x² over [−3, 3], e^x over [−1, 4], a narrow bump)", () => {
    expect(region("x^2", -3, 3)).toEqual([]);
    expect(region("exp(x)", -1, 4)).toEqual([]);
    expect(region("8*exp(-20*x^2)", -1, 2)).toEqual([]);
    expect(region("1/(x^2+1)", -2, 4)).toEqual([]);
  });
  it("pin: odd poles and steps stay refused", () => {
    expect(region("1/x", -1, 2)).toContain("GRAPH_REGION_DISCONTINUOUS");
    expect(region("floor(x)", -1, 2)).toContain("GRAPH_REGION_DISCONTINUOUS");
  });
});

describe("RF1 B-2 — the AI provenance comparison never changes operator precedence", () => {
  const descriptor = (expression: string) => ({ title: "منحنى", description: "رسم الدالة المكتوبة", xMin: null, xMax: null, yMin: null, yMax: null, curves: [{ label: "f(x)", expression, domainMin: null, domainMax: null }] });
  const map = (request: string, expression: string) => mapAiGraph(descriptor(expression), 0, { request, charts: true, illustrative: false }, "blocks[0].graph");
  const refused = (request: string, expression: string) => { const r = map(request, expression); return !r.ok && r.issues.some(i => i.code === "AI_GRAPH_EXPRESSION_NOT_STATED"); };
  it.each([
    ["y = sin x²", "sin(x)^2"], ["y = sin x²", "sin(x^2)"],
    ["y = e^2x", "e^2*x"], ["y = e^2x", "e^(2*x)"],
    ["y = 1/2x", "1/2*x"], ["y = 1/2x", "1/(2*x)"],
    ["y = 2^3x", "2^3*x"],
    ["y = 1/(x+1)(x-1)", "1/(x+1)*(x-1)"],
    ["y = sin x/2", "sin(x)/2"]
  ])("RF1: the ambiguous request %s does not certify the AI expression %s", (request, expression) => {
    expect(refused("ارسم الدالة " + request, expression)).toBe(true);
  });
  it.each([
    ["f(x) = x² − 4x + 3", "x^2 - 4*x + 3"], ["y = 3 sin x", "3*sin(x)"], ["y = sin x + 1", "sin(x) + 1"],
    ["y = 2(x+1)", "2*(x+1)"], ["y = (x+1)(x-1)", "(x+1)*(x-1)"], ["y = ln x", "ln(x)"], ["y = 0.5x", "0.5*x"]
  ])("pin: the unambiguous request %s still certifies %s", (request, expression) => {
    const r = map("ارسم الدالة " + request + " من فضلك", expression);
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });
});

describe("RF1 C-2 — extra selections and the selection bound change the score (pins killing three grading mutants that survived 65c21e7)", () => {
  const cfg = (max: number) => ({ v: 1, graph: quadraticGraph(), target: "point", mode: "multiple", maxSelections: max });
  const resp = (targets: string[]) => ({ kind: "functionGraphSelection", graphId: "g-quad", targets });
  const key = (scoring: string) => ({ scoring, correct: ["point:p1", "point:p2"] });
  it("pin: all-or-nothing gives 0 to the key plus one wrong selection, full marks to the key alone", () => {
    expect(scoreFunctionGraphSelection({ config: cfg(3), answerKey: key("allOrNothing"), response: resp(["point:p1", "point:p2", "point:p3"]), maxMarks: 4 })).toMatchObject({ score: 0, correct: false });
    expect(scoreFunctionGraphSelection({ config: cfg(3), answerKey: key("allOrNothing"), response: resp(["point:p1", "point:p2"]), maxMarks: 4 })).toMatchObject({ score: 4, correct: true });
  });
  it("pin: partial credit is |selected ∩ key| / |selected ∪ key| — a wrong extra selection costs marks", () => {
    expect(scoreFunctionGraphSelection({ config: cfg(3), answerKey: key("partial"), response: resp(["point:p1", "point:p2", "point:p3"]), maxMarks: 3 }).score).toBe(2);
    expect(scoreFunctionGraphSelection({ config: cfg(3), answerKey: key("partial"), response: resp(["point:p1", "point:p3"]), maxMarks: 3 }).score).toBe(1);
  });
  it("pin: more selections than maxSelections are refused at ingest and score 0 at grading", () => {
    expect(bindFunctionGraphSelectionAnswerToQuestion(resp(["point:p1", "point:p2", "point:p3"]), { functionGraphSelection: cfg(2) })).toMatchObject({ ok: false });
    expect(scoreFunctionGraphSelection({ config: cfg(2), answerKey: key("partial"), response: resp(["point:p1", "point:p2", "point:p3"]), maxMarks: 3 }).score).toBe(0);
  });
});
