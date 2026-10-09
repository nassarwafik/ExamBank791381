import { describe, it, expect } from "vitest";
import { buildGraphScene, sceneToData, niceStep, panView, zoomView, SCENE_LIMITS } from "./graphScene";
import * as G from "./testing/graphFixtures";

// 21A.2 pure renderer scene pins: zeroes and powers of ten never truncate, mathematical
// geometry is bounded at phone and desktop widths, and teacher role metadata is not
// required to draw the same curves. No DOM, SVG library, or browser mocking is involved.
describe("21A2-SCENE pure mathematical graph geometry", () => {
  it("prints zero and the FULL integer tick (10/20/100), never strips significant zeroes", () => {
    const spec = G.quadraticGraph();
    spec.viewport = { xMin: -20, xMax: 20, yMin: -20, yMax: 20 };
    spec.axes = { x: { step: 10 }, y: { step: 10 } };
    const scene = buildGraphScene({ spec, width: 960, height: 480 });
    expect(scene.xTicks.map(t => t.label)).toEqual(["−20", "−10", "0", "10", "20"]);
    expect(scene.yTicks.map(t => t.label)).toEqual(["−20", "−10", "0", "10", "20"]);
    spec.viewport = { xMin: -100, xMax: 100, yMin: -100, yMax: 100 };
    spec.axes = { x: { step: 100 }, y: { step: 100 } };
    expect(buildGraphScene({ spec, width: 960, height: 480 }).xTicks.map(t => t.label)).toEqual(["−100", "0", "100"]);
    expect(niceStep(100, 10)).toBe(10);
  });
  it("retains pi-axis labels and all data coordinates at a phone-size viewport", () => {
    const scene = buildGraphScene({ spec: G.sineGraph(), width: 320, height: 250 });
    expect(scene.width).toBe(320);
    expect(scene.plot.right).toBeLessThanOrEqual(scene.width);
    expect(scene.curves[0].d.startsWith("M")).toBe(true);
    expect(scene.xTicks.some(t => t.label.includes("π"))).toBe(true);
    expect(scene.points).toHaveLength(4);
    expect(scene.evaluations).toBeLessThanOrEqual(SCENE_LIMITS.workBudget);
    const middle = sceneToData(scene, (scene.plot.left + scene.plot.right) / 2, (scene.plot.top + scene.plot.bottom) / 2);
    expect(middle.x).toBeCloseTo(0, 9);
    expect(middle.y).toBeCloseTo(0, 9);
  });
  it("projects the real tangent and bounded shaded-area polygons without missing geometry", () => {
    const tangent = buildGraphScene({ spec: G.tangentGraph(), width: 800, height: 480 });
    expect(tangent.tangents).toHaveLength(2);
    expect(tangent.tangents.find(t => t.id === "t1")?.slope).toBeCloseTo(2, 3);
    expect(tangent.tangents.every(t => Number.isFinite(t.at.x) && Number.isFinite(t.at.y))).toBe(true);
    const area = buildGraphScene({ spec: G.areaGraph(), width: 600, height: 400 });
    expect(area.regions.length).toBeGreaterThan(0);
    expect(area.regions[0].d.startsWith("M")).toBe(true);
    expect(area.regions[0].d.endsWith("Z")).toBe(true);
  });
  it("zooms around the true focal point; clamps excessive pan and degenerate zoom", () => {
    const v = { xMin: -4, xMax: 4, yMin: -2, yMax: 6 };
    expect(zoomView(v, 2, 1, 1)).toEqual({ xMin: -1.5, xMax: 2.5, yMin: -0.5, yMax: 3.5 });
    const shifted = panView(v, 1e8, -1e8);
    expect(shifted.xMin).toBe(1e6);
    expect(shifted.yMin).toBe(-1e6);
    const tiny = { xMin: 0, xMax: 1e-4, yMin: 0, yMax: 1e-4 };
    expect(zoomView(tiny, 20)).toBe(tiny);
  });
});
