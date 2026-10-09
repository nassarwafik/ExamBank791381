import { describe, expect, it } from "vitest";
import { validateFunctionGraphSpec } from "./functionGraphSpec";
import { samplePath, SAMPLING_LIMITS } from "./graphSampling";
import { buildGraphScene } from "./graphScene";
import { quadraticGraph, rationalGraph, areaGraph, piecewiseGraph, circleGraph } from "./testing/graphFixtures";
import {
  validateFunctionGraphSelectionConfig,
  validateFunctionGraphSelectionAnswerKey,
  bindFunctionGraphSelectionAnswerToQuestion,
  scoreFunctionGraphSelection
} from "../functionGraphSelectionQuestion";

// Mutation-driven regression pins: each case is intentionally written against the production
// TS authority, rather than the generated CJS mirror or a test-double copy of the validator.
const codes = (v: unknown): string[] => {
  const r = validateFunctionGraphSpec(v);
  return r.ok ? [] : r.issues.map(issue => issue.code);
};
const config = () => ({ v: 1, graph: quadraticGraph(), target: "point", mode: "multiple", maxSelections: 2 });
const response = (graphId = "g-quad", targets = ["point:p1"]) => ({ kind: "functionGraphSelection", graphId, targets });

describe("21A2-MUT-SPEC uncovered authority boundaries", () => {
  it("rejects exotic object prototypes even if otherwise structurally graph-like", () => {
    const alien = Object.assign(Object.create({ injected: true }), quadraticGraph());
    expect(codes(alien)).toContain("GRAPH_INVALID");
  });
  it("refuses out-of-range but finite coordinates", () => {
    const graph = quadraticGraph();
    graph.viewport.xMax = 1e7;
    expect(codes(graph)).toContain("GRAPH_NUMBER_RANGE");
  });
  it("rejects excessive axis ticks and duplicate parameter ids", () => {
    const graph = quadraticGraph();
    graph.axes = { x: { step: 0.001 } };
    expect(codes(graph)).toContain("GRAPH_AXIS_STEP");
    const parameterized = circleGraph();
    parameterized.parameters?.push({ id: "a", value: 2 });
    expect(codes(parameterized)).toContain("GRAPH_DUPLICATE_ID");
  });
  it("rejects reversed curve domains and palette colors beyond the authored contract", () => {
    const graph = quadraticGraph();
    const curve = graph.curves[0];
    if (curve.kind !== "explicit") throw Error("fixture regression");
    curve.domain = { min: 3, max: 1 };
    expect(codes(graph)).toContain("GRAPH_DOMAIN_INVALID");
    const colored = quadraticGraph();
    colored.curves[0].style = { color: 99 };
    expect(codes(colored)).toContain("GRAPH_STYLE_INVALID");
  });
});

describe("21A2-MUT-SAMPLER bounded rendering is observable", () => {
  it("caps base evaluations at maximum sampling density even for unreasonable options", () => {
    const sampled = samplePath(x => [x, 0], -1, 1, {
      xMin: -1, xMax: 1, yMin: -1, yMax: 1,
      samples: 1e9, maxDepth: 0, budget: 0
    });
    expect(sampled.evaluations).toBe(SAMPLING_LIMITS.maxSamples + 1);
  });
});

describe("21A2-MUT-SCENE strict visual semantics", () => {
  it("preserves open and closed piecewise endpoints", () => {
    const scene = buildGraphScene({ spec: piecewiseGraph(), width: 800, height: 480 });
    expect(scene.endpoints.some(e => e.open)).toBe(true);
    expect(scene.endpoints.some(e => !e.open)).toBe(true);
  });
  it("retains dense geometry across a bounded shaded area", () => {
    const scene = buildGraphScene({ spec: areaGraph(), width: 800, height: 480 });
    expect(scene.regions[0].d.split("L").length).toBeGreaterThan(120);
  });
  it("retains teacher-authored open interval ends, never normalizes them to closed", () => {
    const graph = areaGraph();
    if (!graph.intervals?.[0]) throw Error("fixture regression");
    graph.intervals[0].fromClosed = false;
    graph.intervals[0].toClosed = false;
    const scene = buildGraphScene({ spec: graph, width: 600, height: 400 });
    expect(scene.intervals[0]).toMatchObject({ fromClosed: false, toClosed: false });
  });
});

describe("21A2-MUT-QUESTION exact student authority and answer binding", () => {
  it("rejects additional config keys, and demands at least two selectable targets", () => {
    const c = config();
    expect(validateFunctionGraphSelectionConfig({ ...c, remoteScript: "ignored" }).ok).toBe(false);
    expect(validateFunctionGraphSelectionConfig({ ...c, target: "curve" }).ok).toBe(false);
  });
  it("rejects invalid selection capacity for either interaction mode", () => {
    const c = config();
    for (const raw of [
      { ...c, maxSelections: 0 },
      { ...c, maxSelections: 99 },
      { ...c, maxSelections: 1.5 },
      { ...c, mode: "single", maxSelections: 2 }
    ]) expect(validateFunctionGraphSelectionConfig(raw).ok).toBe(false);
  });
  it("rejects duplicate, unknown and unreachable teacher keys", () => {
    const c = config();
    const candidateKeys = [
      ["point:p1", "point:p1"],
      ["point:ghost"],
      ["point:p1", "point:p2", "point:p3"]
    ];
    for (const correct of candidateKeys) {
      const key = { scoring: "partial", correct };
      expect(validateFunctionGraphSelectionAnswerKey(key, c).ok, correct.join(",")).toBe(false);
    }
  });
  it("rejects forged graph identity, duplicated targets and targets of another kind", () => {
    const question = { functionGraphSelection: config() };
    for (const answer of [
      response("g-forged"),
      response("g-quad", ["point:p1", "point:p1"]),
      response("g-quad", ["curve:f"])
    ]) {
      expect(bindFunctionGraphSelectionAnswerToQuestion(answer, question).ok, JSON.stringify(answer)).toBe(false);
    }
  });
  it("will not award marks for forged graph identities or unknown semantic selections", () => {
    const c = config();
    const key = { scoring: "partial", correct: ["point:p1", "point:p2"] };
    for (const forged of [
      response("g-forged"),
      response("g-quad", ["curve:f"]),
      response("g-quad", ["point:p1", "point:p1"])
    ]) {
      const grade = scoreFunctionGraphSelection({ config: c, answerKey: key, response: forged, maxMarks: 4 });
      expect(grade.score).toBe(0);
      expect(grade.correct).toBe(false);
    }
    const valid = scoreFunctionGraphSelection({ config: c, answerKey: key, response: response(), maxMarks: 4 });
    expect(valid.score).toBe(2);
  });
});
