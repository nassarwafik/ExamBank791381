import { describe, expect, it } from "vitest";
import { simplifyMesh, type SimplifyInput } from "./meshSimplify";

// Phase 21D-B.2 — the offline quadric edge-collapse simplifier used by the BodyParts3D conversion (brain, ratio 0.5). The properties the
// provenance record relies on: it invents no geometry (every output vertex is an ORIGINAL vertex with its source normal), keeps a closed
// surface closed and oriented (no flipped face), never moves an open boundary, stops at the requested budget and is deterministic.

function icosphere(subdivisions: number): SimplifyInput {
  const t = (1 + Math.sqrt(5)) / 2;
  let P: number[][] = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  P = P.map(v => { const l = Math.hypot(v[0], v[1], v[2]); return v.map(x => x / l); });
  for (let s = 0; s < subdivisions; s++) {
    const mid = new Map<string, number>(), next: number[][] = [];
    const m = (a: number, b: number) => {
      const k = a < b ? a + "_" + b : b + "_" + a;
      let i = mid.get(k);
      if (i === undefined) { const v = [0, 1, 2].map(c => (P[a][c] + P[b][c]) / 2), l = Math.hypot(v[0], v[1], v[2]); i = P.push(v.map(x => x / l)) - 1; mid.set(k, i); }
      return i;
    };
    for (const [a, b, c] of F) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    F = next;
  }
  return { positions: new Float32Array(P.flat()), normals: new Float32Array(P.flat()), indices: new Uint32Array(F.flat()) };
}

/** A unit sheet: optionally jittered (non-convex vertex rings) and gently rippled (so collapse costs differ). Deterministic. */
function grid(n: number, jitter = 0, ripple = 0): SimplifyInput {
  const P: number[] = [], N: number[] = [], I: number[] = [];
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const inner = i > 0 && j > 0 && i < n && j < n, x = i / n + (inner ? rnd() * jitter / n : 0), y = j / n + (inner ? rnd() * jitter / n : 0);
    P.push(x, y, ripple ? ripple * Math.sin(x * 9) * Math.cos(y * 7) : 0); N.push(0, 0, 1);
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + n + 1; I.push(a, a + 1, b, a + 1, b + 1, b); }
  return { positions: new Float32Array(P), normals: new Float32Array(N), indices: new Uint32Array(I) };
}

const vertexKey = (p: Float32Array, i: number) => p[i * 3] + "," + p[i * 3 + 1] + "," + p[i * 3 + 2];
const faceNormal = (p: Float32Array, a: number, b: number, c: number) => {
  const u = [0, 1, 2].map(k => p[b * 3 + k] - p[a * 3 + k]), w = [0, 1, 2].map(k => p[c * 3 + k] - p[a * 3 + k]);
  return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
};

describe("21D-B.2 meshSimplify — offline, original vertices only, closed and oriented", () => {
  it("reaches the budget on a closed sphere using ORIGINAL vertices and their source normals only", () => {
    const input = icosphere(3), before = input.indices.length / 3;                       // 1,280 faces
    const out = simplifyMesh(input, 0.25), target = Math.floor(before * 0.25);
    expect(out.triangles).toBeLessThanOrEqual(target);
    expect(out.triangles).toBeGreaterThanOrEqual(target - 2);
    const source = new Map<string, number>();
    for (let i = 0; i < input.positions.length / 3; i++) source.set(vertexKey(input.positions, i), i);
    for (let i = 0; i < out.positions.length / 3; i++) {
      const s = source.get(vertexKey(out.positions, i));
      expect(s).toBeDefined();
      expect([0, 1, 2].map(k => out.normals[i * 3 + k])).toEqual([0, 1, 2].map(k => input.normals[s! * 3 + k]));
    }
  });

  it("keeps the surface closed (every edge shared by exactly two faces) and every face facing outward (no flip)", () => {
    const out = simplifyMesh(icosphere(3), 0.2), uses = new Map<string, number>();
    for (let f = 0; f < out.triangles; f++) {
      const v = [0, 1, 2].map(k => out.indices[f * 3 + k]);
      for (let k = 0; k < 3; k++) { const a = v[k], b = v[(k + 1) % 3], key = Math.min(a, b) + "_" + Math.max(a, b); uses.set(key, (uses.get(key) ?? 0) + 1); }
      const n = faceNormal(out.positions, v[0], v[1], v[2]), c = [0, 1, 2].map(k => (out.positions[v[0] * 3 + k] + out.positions[v[1] * 3 + k] + out.positions[v[2] * 3 + k]) / 3);
      expect(n[0] * c[0] + n[1] * c[1] + n[2] * c[2]).toBeGreaterThan(0);
    }
    expect([...uses.values()].every(n => n === 2)).toBe(true);
  });

  it("never moves an open boundary: every boundary vertex survives and a flat sheet keeps its exact area", () => {
    const n = 16, input = grid(n), out = simplifyMesh(input, 0.2);
    expect(out.triangles).toBeLessThan(input.indices.length / 3 / 2);
    const kept = new Set<string>();
    for (let i = 0; i < out.positions.length / 3; i++) { kept.add(vertexKey(out.positions, i)); expect(out.positions[i * 3 + 2]).toBe(0); }
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) if (i === 0 || j === 0 || i === n || j === n) expect(kept.has(vertexKey(input.positions, j * (n + 1) + i))).toBe(true);
    let area = 0;
    for (let f = 0; f < out.triangles; f++) area += faceNormal(out.positions, out.indices[f * 3], out.indices[f * 3 + 1], out.indices[f * 3 + 2])[2] / 2;
    expect(area).toBeCloseTo(1, 6);                                                        // no overlap, no fold, no hole
  });

  it("refuses collapses that would fold the surface: an irregular rippled sheet (non-convex vertex rings) keeps every face facing up", () => {
    const out = simplifyMesh(grid(24, 0.95, 0.05), 0.08);                                // without the flip guard: 44 folded faces
    expect(out.triangles).toBeLessThan(1152 * 0.1);
    let area = 0;
    for (let f = 0; f < out.triangles; f++) {
      const z = faceNormal(out.positions, out.indices[f * 3], out.indices[f * 3 + 1], out.indices[f * 3 + 2])[2];
      expect(z).toBeGreaterThan(0);
      area += z / 2;
    }
    expect(area).toBeCloseTo(1, 5);                                                       // projected area: no overlap, no hole
  });

  it("is deterministic, leaves a mesh untouched at ratio 1 and accepts an empty mesh", () => {
    const a = simplifyMesh(icosphere(2), 0.4), b = simplifyMesh(icosphere(2), 0.4);
    expect(Array.from(a.indices)).toEqual(Array.from(b.indices));
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(simplifyMesh(icosphere(2), 1).triangles).toBe(320);
    expect(simplifyMesh({ positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0) }, 0.5).triangles).toBe(0);
  });
});
