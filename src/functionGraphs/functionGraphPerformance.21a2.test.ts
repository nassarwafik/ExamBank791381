import { describe, it, expect } from "vitest";
import { validateFunctionGraphSpec, type FunctionGraphSpecV1 } from "./functionGraphSpec";
import { buildGraphScene, SCENE_LIMITS } from "./graphScene";
import { quadraticGraph } from "./testing/graphFixtures";

// Bounded CPU certification under the largest common authored structure:
// 8 sine curves, 40 points with mathematically true on-curve claims,
// 12 reference lines, 8 tangent markers and 8 intervals. No mocked sampler.
// Wall-clock checks use a generous 5-second ceiling to avoid flaky CI;
// the real hard limits are work/evaluation counts and deterministic outputs.
function heavy(): FunctionGraphSpecV1 {
  const g = quadraticGraph();
  g.curves = Array.from({ length: 8 }, (_, i) => ({ id: "c" + i, kind: "explicit" as const, expression: i === 0 ? "sin(x)" : "sin(x + " + i + ")" }));
  g.points = Array.from({ length: 40 }, (_, i) => {
    const x = -2 + i * 8 / 39;
    return { id: "p" + (i + 1), x, y: Math.sin(x), on: ["c0"] };
  });
  g.lines = Array.from({ length: 12 }, (_, i) => ({ id: "l" + (i + 1), orientation: "horizontal" as const, value: -2 + i * 0.25 }));
  g.tangents = Array.from({ length: 8 }, (_, i) => ({ id: "t" + (i + 1), curve: "c0", x: -1.5 + i, kind: "tangent" as const }));
  g.intervals = Array.from({ length: 8 }, (_, i) => ({ id: "int" + (i + 1), from: -2 + i, to: -1 + i }));
  return g;
}

describe("21A2-PERF bounded heavy graph at 320 / 1280px", () => {
  it("validates and draws deterministically with bounded evaluations, recording measured CI timings", () => {
    const g = heavy();
    const t0 = performance.now();
    const r = validateFunctionGraphSpec(g);
    const validationMs = performance.now() - t0;
    expect(r.ok, JSON.stringify(r.issues)).toBe(true);
    expect(r.value).toBeDefined();
    const ms: Record<string, number> = {};
    const evaluations: Record<string, number> = {};
    for (const width of [320, 1280]) {
      const start = performance.now();
      const s = buildGraphScene({ spec: r.value!, width, height: Math.round(width * 0.7) });
      ms[String(width)] = Math.round((performance.now() - start) * 100) / 100;
      evaluations[String(width)] = s.evaluations;
      expect(s.width).toBe(width);
      expect(s.curves).toHaveLength(8);
      expect(s.points).toHaveLength(40);
      expect(s.tangents).toHaveLength(8);
      expect(s.lines).toHaveLength(12);
      expect(s.intervals).toHaveLength(8);
      expect(s.evaluations).toBeLessThanOrEqual(SCENE_LIMITS.workBudget);
      expect(s.truncated).toBe(false);
    }
    console.log("21A2_PERF " + JSON.stringify({ validationMs: Math.round(validationMs * 100) / 100, sceneMs: ms, evaluations }));
    expect(validationMs).toBeLessThan(5000);
    for (const time of Object.values(ms)) expect(time).toBeLessThan(5000);
  });
});
