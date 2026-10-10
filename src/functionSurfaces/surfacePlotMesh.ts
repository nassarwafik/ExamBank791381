// Phase 21D-A.4 — adaptive surface meshing and projection for SurfacePlotSpecV2 (pure: no React, no DOM, no clock; deterministic).
//
// MESH. Each surface z = f(x, y) is sampled on a base grid and refined where it matters, never by blindly adding points everywhere:
//   • a balanced quadtree (neighbouring cells differ by at most one level) refines cells whose centre / edge midpoints depart from the
//     linear interpolation of the corners (curvature, steep regions), cells that cross the z window (a clean rim instead of a staircase),
//     cells on the edge of the domain (defined and undefined points mixed) and cells with a suspected jump — highest error first, within
//     a fixed polygon and evaluation budget;
//   • a coarse leaf next to a finer neighbour includes the neighbour's edge midpoint in its polygon, so the mesh has NO cracks;
//   • a polygon edge with a large value change is tested by bisection: a continuous function's change shrinks with the interval, a jump
//     or a pole does not — such polygons are dropped (never drawn across a discontinuity); undefined / non-finite values are holes;
//   • polygons are clipped exactly against the z window (zMin ≤ z ≤ zMax), so asymptotic blow-ups end at the window instead of vanishing
//     cell by cell; partially defined boundary cells keep their defined part.
// Geometry is in normalised display coordinates: the viewport maps to the cube [−1, 1]³ (x right, y depth, z up).
// PROJECTION. Orthographic, framed by the cube's bounding sphere (rotation never changes the drawn size — the Phase 21D framing rule),
// camera yaw / pitch / zoom from the shared Phase 21D orbit controller, painter's order back to front, two-sided lighting with the shared
// Phase 21D lighting model (key + fill light, soft highlight); smoothed facet normals except across creases (> 35°).
import { evaluateExpression, type ExprNode } from "../parametricExpression";
import type { SurfaceViewport } from "./surfaceSpec";
import type { SurfacePlotQuality } from "./surfacePlotSpec";

export type SurfacePlotLevel = SurfacePlotQuality | "motion";
/** Per-PLOT budgets (shared by its surfaces). Rest levels are drawn once when the camera settles; the motion level while it moves
 *  (the Phase 21D calibration: ≈ 700–900 drawn polygons keep a dragged model fluid on a 4× throttled CPU). */
export const SURFACE_PLOT_BUDGETS: Readonly<Record<SurfacePlotLevel, { polygons: number; evaluations: number; maxDepth: number; tolerance: number }>> = Object.freeze({
  standard: { polygons: 4000, evaluations: 40000, maxDepth: 2, tolerance: 0.006 },
  high: { polygons: 6500, evaluations: 64000, maxDepth: 2, tolerance: 0.003 },
  motion: { polygons: 900, evaluations: 12000, maxDepth: 0, tolerance: 1 }
});
/** Change of normalised z along a mesh edge (window height = 2) above which the edge is tested for a discontinuity (and its cell is
 *  refined first, so a continuous steep region ends up with short edges below the threshold while a jump keeps its full size). */
export const SURFACE_PLOT_JUMP = 0.12;
/** Fraction of the evaluation budget refinement may use; the rest is kept for the discontinuity tests. */
const REFINE_SHARE = 0.8;
const BISECTIONS = 8;
const CREASE_COS = Math.cos((35 * Math.PI) / 180);

export type PlotPolygon = { pts: number[]; n: [number, number, number]; s: [number, number, number] };
export type PlotSegment = [number, number, number, number, number, number];
export type SurfacePlotMesh = {
  polygons: PlotPolygon[]; lines: PlotSegment[];
  stats: { level: SurfacePlotLevel; baseCells: number; maxDepth: number; leaves: number; refined: number; polygons: number; evaluations: number; discontinuities: number; partial: number; clipped: number };
};

type Leaf = { i: number; j: number; s: number; d: number; alive: boolean; pr: number };

/** Budgets of ONE surface of a plot with `count` surfaces at `level`. */
export function surfaceBudget(level: SurfacePlotLevel, count: number) {
  const b = SURFACE_PLOT_BUDGETS[level], n = Math.max(1, count);
  const polygons = Math.floor(b.polygons / n), evaluations = Math.floor(b.evaluations / n);
  const base = level === "motion" ? Math.max(6, Math.min(24, Math.floor(Math.sqrt(polygons)))) : Math.max(8, Math.min(40, Math.floor(Math.sqrt(polygons / 2.2))));
  return { polygons, evaluations, base, maxDepth: b.maxDepth, tolerance: b.tolerance };
}

/** The adaptive mesh of one surface (deterministic: identical inputs give an identical mesh). `others` are the plot's other surfaces:
 *  cells where one of them crosses this surface inside the window are refined to the finest level, so the painter's facet-sized
 *  saw-tooth along an intersection curve shrinks fourfold (the polygons are not split along the curve itself). */
export function buildSurfacePlotMesh(ast: ExprNode, v: SurfaceViewport, level: SurfacePlotLevel, surfaceCount: number, opts: { lines?: boolean; others?: readonly ExprNode[] } = {}): SurfacePlotMesh {
  const withLines = opts.lines ?? level !== "motion", others = level === "motion" ? [] : opts.others ?? [];
  const B = surfaceBudget(level, surfaceCount), N = B.base, D = B.maxDepth, s0 = 1 << D, M = N * s0, W = M + 1;
  const state = new Uint8Array(W * W), value = new Float64Array(W * W);
  const zSpan = v.zMax - v.zMin, vars = new Map<string, number>([["x", 0], ["y", 0]]);
  let evaluations = 0;
  const evalWith = (e: ExprNode, x: number, y: number): number => {
    evaluations++;
    vars.set("x", x); vars.set("y", y);
    const r = evaluateExpression(e, vars);
    return r.ok && Number.isFinite(r.value) ? (2 * (r.value - v.zMin)) / zSpan - 1 : NaN;
  };
  const evalAt = (x: number, y: number) => evalWith(ast, x, y);
  const xAt = (i: number) => v.xMin + ((v.xMax - v.xMin) * i) / M, yAt = (j: number) => v.yMin + ((v.yMax - v.yMin) * j) / M;
  /** normalised z at grid point (i, j) (NaN = undefined), evaluated once */
  const Z = (i: number, j: number): number => {
    const k = j * W + i;
    if (state[k] === 0) { const z = evalAt(xAt(i), yAt(j)); value[k] = z; state[k] = Number.isNaN(z) ? 2 : 1; }
    return value[k];
  };
  const otherValues = others.map(() => new Map<number, number>());
  /** normalised z of another surface at grid point (i, j), evaluated once */
  const G = (o: number, i: number, j: number): number => {
    const k = j * W + i, cache = otherValues[o], hit = cache.get(k);
    if (hit !== undefined) return hit;
    const z = evalWith(others[o], xAt(i), yAt(j));
    cache.set(k, z);
    return z;
  };
  /** does another surface cross this one inside the window, within the cell (its 3 × 3 lattice)? */
  const intersects = (pts: [number, number][], z: number[]): boolean => {
    for (let o = 0; o < others.length; o++) {
      let above = false, below = false;
      for (let t = 0; t < pts.length; t++) {
        if (Math.abs(z[t]) > 1) continue;
        const g = G(o, pts[t][0], pts[t][1]);
        if (Number.isNaN(g)) continue;
        if (z[t] > g) above = true; else if (z[t] < g) below = true;
      }
      if (above && below) return true;
    }
    return false;
  };
  const leaves: Leaf[] = [];
  const owner = new Int32Array(M * M);
  const assign = (leafIx: number) => { const L = leaves[leafIx]; for (let b = L.j; b < L.j + L.s; b++) for (let a = L.i; a < L.i + L.s; a++) owner[b * M + a] = leafIx; };
  /** refinement priority of a leaf from its 3 × 3 lattice (−1 = nothing to refine) */
  const priority = (L: Leaf): number => {
    if (L.d >= D || L.s < 2) return -1;
    const h = L.s / 2, pts: [number, number][] = [[L.i, L.j], [L.i + L.s, L.j], [L.i + L.s, L.j + L.s], [L.i, L.j + L.s], [L.i + h, L.j], [L.i + L.s, L.j + h], [L.i + h, L.j + L.s], [L.i, L.j + h], [L.i + h, L.j + h]];
    const z = pts.map(([a, b]) => Z(a, b)), defined = z.filter(q => !Number.isNaN(q)).length;
    if (defined === 0) return -1;
    if (defined < 9) return 100;                                                                         // edge of the domain
    const c = z.map(q => Math.max(-1.5, Math.min(1.5, q)));
    if (c.every(q => q > 1) || c.every(q => q < -1)) return -1;                                          // wholly outside the window
    const err = Math.max(Math.abs(c[4] - (c[0] + c[1]) / 2), Math.abs(c[5] - (c[1] + c[2]) / 2), Math.abs(c[6] - (c[2] + c[3]) / 2), Math.abs(c[7] - (c[3] + c[0]) / 2), Math.abs(c[8] - (c[0] + c[1] + c[2] + c[3]) / 4));
    const crossing = c.some(q => q >= -1 && q <= 1) && c.some(q => q < -1 || q > 1);
    const t = z.map(q => Math.max(-3, Math.min(3, q)));
    const jump = [[0, 4], [4, 1], [1, 5], [5, 2], [2, 6], [6, 3], [3, 7], [7, 0]].some(([a, b]) => Math.abs(t[a] - t[b]) > SURFACE_PLOT_JUMP);
    const meets = others.length > 0 && intersects(pts, z);
    if (err <= B.tolerance && !crossing && !jump && !meets) return -1;
    return err + (crossing ? B.tolerance : 0) + (jump ? 50 : 0) + (meets ? 20 : 0);
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { leaves.push({ i: i * s0, j: j * s0, s: s0, d: 0, alive: true, pr: 0 }); assign(leaves.length - 1); }
  let alive = leaves.length, refined = 0;
  for (const L of leaves) { if (D > 0) L.pr = priority(L); else { Z(L.i, L.j); Z(L.i + L.s, L.j); Z(L.i, L.j + L.s); Z(L.i + L.s, L.j + L.s); } }
  const neighbourLeaves = (L: Leaf): number[] => {
    const out = new Set<number>();
    for (let t = 0; t < L.s; t++) {
      if (L.j > 0) out.add(owner[(L.j - 1) * M + L.i + t]);
      if (L.j + L.s < M) out.add(owner[(L.j + L.s) * M + L.i + t]);
      if (L.i > 0) out.add(owner[(L.j + t) * M + L.i - 1]);
      if (L.i + L.s < M) out.add(owner[(L.j + t) * M + L.i + L.s]);
    }
    return [...out].sort((a, b) => a - b);
  };
  let onChild: (ix: number) => void = () => {};
  const split = (ix: number): boolean => {
    const L = leaves[ix];
    if (!L.alive || L.d >= D) return false;
    // 2:1 balance — a coarser neighbour is refined first (at most one level per step, so this terminates)
    for (const n of neighbourLeaves(L)) if (leaves[n].d < L.d && !split(n)) return false;
    if (alive + 3 > B.polygons || evaluations + 16 > B.evaluations * REFINE_SHARE) return false;
    L.alive = false; alive += 3; refined++;
    const h = L.s / 2;
    for (const [a, b] of [[0, 0], [h, 0], [0, h], [h, h]]) {
      const child: Leaf = { i: L.i + a, j: L.j + b, s: h, d: L.d + 1, alive: true, pr: 0 };
      leaves.push(child); assign(leaves.length - 1);
      child.pr = priority(child);
      onChild(leaves.length - 1);
    }
    return true;
  };
  // best-first refinement across levels: the highest-priority leaf is always refined next (an intersection or a jump at the finest
  // level before a mild curvature at the base level), ties broken by level and position — deterministic
  const before = (a: number, b: number) => { const A = leaves[a], Bl = leaves[b]; return A.pr !== Bl.pr ? A.pr > Bl.pr : A.d !== Bl.d ? A.d < Bl.d : A.j !== Bl.j ? A.j < Bl.j : A.i < Bl.i; };
  const heap: number[] = [];
  const push = (ix: number) => { heap.push(ix); for (let c = heap.length - 1; c > 0;) { const p = (c - 1) >> 1; if (!before(heap[c], heap[p])) break; [heap[c], heap[p]] = [heap[p], heap[c]]; c = p; } };
  const pop = (): number => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let p = 0; ;) { const l = 2 * p + 1, r = l + 1; let m = p; if (l < heap.length && before(heap[l], heap[m])) m = l; if (r < heap.length && before(heap[r], heap[m])) m = r; if (m === p) break; [heap[m], heap[p]] = [heap[p], heap[m]]; p = m; }
    }
    return top;
  };
  onChild = ix => { if (leaves[ix].pr > 0) push(ix); };
  leaves.forEach((L, ix) => { if (L.pr > 0) push(ix); });
  let exhausted = false;
  while (heap.length && !exhausted) { const ix = pop(); if (leaves[ix].alive && !split(ix) && leaves[ix].alive && (alive + 3 > B.polygons || evaluations + 16 > B.evaluations * REFINE_SHARE)) exhausted = true; }
  // discontinuity test of a polygon edge (cached): does the value change survive repeated bisection?
  const jumps = new Map<number, boolean>();
  const isJump = (ia: number, ja: number, ib: number, jb: number): boolean => {
    const ka = ja * W + ia, kb = jb * W + ib, key = Math.min(ka, kb) * W * W + Math.max(ka, kb);
    const hit = jumps.get(key);
    if (hit !== undefined) return hit;
    let xa = xAt(ia), ya = yAt(ja), xb = xAt(ib), yb = yAt(jb), za = Z(ia, ja), zb = Z(ib, jb);
    const d0 = Math.abs(za - zb);
    let jump: boolean | null = null;
    for (let k = 0; k < BISECTIONS && jump === null; k++) {
      if (evaluations >= B.evaluations) jump = d0 > 0.5;                                                  // budget spent: only a large step breaks
      else {
        const xm = (xa + xb) / 2, ym = (ya + yb) / 2, zm = evalAt(xm, ym);
        if (Number.isNaN(zm)) jump = true;                                                                // a hole inside the edge
        else if (Math.abs(zm - za) >= Math.abs(zb - zm)) { xb = xm; yb = ym; zb = zm; } else { xa = xm; ya = ym; za = zm; }
      }
    }
    if (jump === null) jump = Math.abs(za - zb) > 0.5 * d0;
    jumps.set(key, jump);
    return jump;
  };
  const steep = (za: number, zb: number) => Math.abs(Math.max(-3, Math.min(3, za)) - Math.max(-3, Math.min(3, zb))) > SURFACE_PLOT_JUMP && (Math.abs(za) <= 1.5 || Math.abs(zb) <= 1.5 || Math.sign(za) !== Math.sign(zb));
  const depthAt = (a: number, b: number) => (a < 0 || b < 0 || a >= M || b >= M ? -1 : leaves[owner[b * M + a]].d);
  const vertexNormals = new Map<number, [number, number, number]>();
  type Raw = { ring: { X: number; Y: number; Z: number; k: number }[] };
  const raws: Raw[] = [];
  let discontinuities = 0, partial = 0, clipped = 0;
  const live = leaves.filter(L => L.alive).sort((a, b) => a.j - b.j || a.i - b.i);
  for (const L of live) {
    const h = L.s / 2, ring: [number, number][] = [[L.i, L.j]];
    if (L.s >= 2 && depthAt(L.i, L.j - 1) > L.d) ring.push([L.i + h, L.j]);
    ring.push([L.i + L.s, L.j]);
    if (L.s >= 2 && depthAt(L.i + L.s, L.j) > L.d) ring.push([L.i + L.s, L.j + h]);
    ring.push([L.i + L.s, L.j + L.s]);
    if (L.s >= 2 && depthAt(L.i, L.j + L.s) > L.d) ring.push([L.i + h, L.j + L.s]);
    ring.push([L.i, L.j + L.s]);
    if (L.s >= 2 && depthAt(L.i - 1, L.j) > L.d) ring.push([L.i, L.j + h]);
    let pts = ring.map(([a, b]) => ({ a, b, z: Z(a, b) }));
    const undefinedCount = pts.filter(p => Number.isNaN(p.z)).length;
    if (undefinedCount === pts.length) continue;
    if (undefinedCount > 0) {
      // the defined part of a boundary cell, when the undefined vertices form one contiguous run
      const n = pts.length, def = pts.map(p => !Number.isNaN(p.z));
      let runs = 0;
      for (let t = 0; t < n; t++) if (def[t] && !def[(t + 1) % n]) runs++;
      if (runs !== 1 || n - undefinedCount < 3) continue;
      const start = def.findIndex((x, t) => x && !def[(t - 1 + n) % n]);
      const kept: typeof pts = [];
      for (let t = 0; t < n; t++) { const p = pts[(start + t) % n]; if (!Number.isNaN(p.z)) kept.push(p); else break; }
      if (kept.length < 3) continue;
      pts = kept; partial++;
    }
    let broken = false;
    for (let t = 0; t < pts.length && !broken; t++) {
      const p = pts[t], q = pts[(t + 1) % pts.length];
      if (steep(p.z, q.z) && isJump(p.a, p.b, q.a, q.b)) broken = true;
    }
    if (broken) { discontinuities++; continue; }
    const r = clipRing(pts.map(p => ({ X: (2 * p.a) / M - 1, Y: (2 * p.b) / M - 1, Z: p.z, k: p.b * W + p.a })));
    if (r.length < 3) continue;
    if (r.length !== pts.length || r.some(p => p.k < 0)) clipped++;
    raws.push({ ring: r });
  }
  // geometric (Newell) normals, area-weighted vertex normals, then smoothed shading normals that keep creases
  const geo = raws.map(({ ring }) => newell(ring));
  raws.forEach(({ ring }, ix) => {
    const n = geo[ix];
    for (const p of ring) if (p.k >= 0) { const acc = vertexNormals.get(p.k); if (acc) { acc[0] += n[0]; acc[1] += n[1]; acc[2] += n[2]; } else vertexNormals.set(p.k, [n[0], n[1], n[2]]); }
  });
  const polygons: PlotPolygon[] = [];
  raws.forEach(({ ring }, ix) => {
    const g = unit(geo[ix]);
    if (!g) return;
    let sx = 0, sy = 0, sz = 0;
    for (const p of ring) {
      const vn = p.k >= 0 ? unit(vertexNormals.get(p.k)!) : null;
      const use = vn && vn[0] * g[0] + vn[1] * g[1] + vn[2] * g[2] >= CREASE_COS ? vn : g;
      sx += use[0]; sy += use[1]; sz += use[2];
    }
    const s = unit([sx, sy, sz]) ?? g, flat: number[] = [];
    for (const p of ring) flat.push(p.X, p.Y, p.Z);
    polygons.push({ pts: flat, n: g, s });
  });
  // mesh lines: iso-lines x = const and y = const on the base grid, sampled per base cell, broken at jumps, clipped to the window
  const lines: PlotSegment[] = [];
  if (withLines) {
    const every = Math.max(1, Math.round(N / (surfaceCount >= 3 ? 6 : 8))) * s0, step = s0;
    const segment = (ia: number, ja: number, ib: number, jb: number) => {
      const za = Z(ia, ja), zb = Z(ib, jb);
      if (Number.isNaN(za) || Number.isNaN(zb) || (steep(za, zb) && isJump(ia, ja, ib, jb))) return;
      const c = clipSegment((2 * ia) / M - 1, (2 * ja) / M - 1, za, (2 * ib) / M - 1, (2 * jb) / M - 1, zb);
      if (c) lines.push(c);
    };
    for (let i = 0; i <= M; i += every) for (let j = 0; j < M; j += step) segment(i, j, i, j + step);
    for (let j = 0; j <= M; j += every) for (let i = 0; i < M; i += step) segment(i, j, i + step, j);
  }
  return { polygons, lines, stats: { level, baseCells: N, maxDepth: D, leaves: live.length, refined, polygons: polygons.length, evaluations, discontinuities, partial, clipped } };
}

type RingPoint = { X: number; Y: number; Z: number; k: number };
/** Sutherland–Hodgman clip of a polygon against −1 ≤ Z ≤ 1 (k = −1 marks a new vertex on the window boundary). */
export function clipRing(ring: RingPoint[]): RingPoint[] {
  const plane = (pts: RingPoint[], keep: (p: RingPoint) => boolean, level: number): RingPoint[] => {
    const out: RingPoint[] = [];
    for (let t = 0; t < pts.length; t++) {
      const p = pts[t], q = pts[(t + 1) % pts.length], pin = keep(p), qin = keep(q);
      if (pin) out.push(p);
      if (pin !== qin) { const u = (level - p.Z) / (q.Z - p.Z); out.push({ X: p.X + u * (q.X - p.X), Y: p.Y + u * (q.Y - p.Y), Z: level, k: -1 }); }
    }
    return out;
  };
  return plane(plane(ring, p => p.Z <= 1, 1), p => p.Z >= -1, -1);
}
/** A segment clipped to −1 ≤ Z ≤ 1, or null when nothing of it is inside. */
export function clipSegment(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): PlotSegment | null {
  let t0 = 0, t1 = 1;
  const dz = z2 - z1;
  for (const [p, q] of [[-dz, z1 + 1], [dz, 1 - z1]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  const at = (t: number): [number, number, number] => [x1 + t * (x2 - x1), y1 + t * (y2 - y1), z1 + t * dz];
  return [...at(t0), ...at(t1)] as PlotSegment;
}
function newell(ring: RingPoint[]): [number, number, number] {
  let nx = 0, ny = 0, nz = 0;
  for (let t = 0; t < ring.length; t++) {
    const p = ring[t], q = ring[(t + 1) % ring.length];
    nx += (p.Y - q.Y) * (p.Z + q.Z); ny += (p.Z - q.Z) * (p.X + q.X); nz += (p.X - q.X) * (p.Y + q.Y);
  }
  return [nx, ny, nz];
}
function unit(v: [number, number, number]): [number, number, number] | null {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 1e-12 ? [v[0] / l, v[1] / l, v[2] / l] : null;
}

// ── projection ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type SurfacePlotCameraState = { yaw: number; pitch: number; zoom: number };
/** Fraction of the viewer's shorter side the cube's bounding sphere fills at zoom 1 (room left for ticks and axis titles). */
export const SURFACE_PLOT_FRAME = 0.78;
const RADIUS = Math.sqrt(3);
/** The camera rotation of a plot point (X right, Y depth, Z up) into camera space (x right, y up, z towards the viewer). */
export function plotRotation(camera: SurfacePlotCameraState): (X: number, Y: number, Z: number) => [number, number, number] {
  const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw), cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
  return (X, Y, Z) => { const wx = X, wy = Z, wz = -Y; const x = wx * cy + wz * sy, z1 = -wx * sy + wz * cy; return [x, wy * cp - z1 * sp, wy * sp + z1 * cp]; };
}
export type ScreenMap = { scale: number; rotate: (X: number, Y: number, Z: number) => [number, number, number]; toScreen: (X: number, Y: number, Z: number) => [number, number, number] };
/** Orthographic screen mapping framed by the cube's bounding sphere: the scale never depends on the orientation. */
export function plotScreen(camera: SurfacePlotCameraState, width: number, height: number): ScreenMap {
  const scale = (Math.min(width, height) * SURFACE_PLOT_FRAME) / 2 / RADIUS * camera.zoom, rotate = plotRotation(camera);
  return { scale, rotate, toScreen: (X, Y, Z) => { const [x, y, z] = rotate(X, Y, Z); return [width / 2 + x * scale, height / 2 - y * scale, z]; } };
}
export type ProjectedPolygon = { surface: number; depth: number; points: string; front: boolean; normal: [number, number, number] };
export type ProjectedLine = { surface: number; depth: number; x1: number; y1: number; x2: number; y2: number };
/** Projects the visible surfaces: polygons (with camera-space shading normal, flipped to the visible side) and mesh lines, back to front. */
export function projectSurfacePlot(meshes: readonly SurfacePlotMesh[], visible: readonly boolean[], camera: SurfacePlotCameraState, width: number, height: number, withLines: boolean): { polygons: ProjectedPolygon[]; lines: ProjectedLine[] } {
  const S = plotScreen(camera, width, height), polygons: ProjectedPolygon[] = [], lines: ProjectedLine[] = [], lift = 0.02;
  meshes.forEach((m, surface) => {
    if (!visible[surface]) return;
    for (const p of m.polygons) {
      let depth = 0, points = "";
      const n = p.pts.length / 3;
      for (let t = 0; t < n; t++) {
        const [x, y, z] = S.toScreen(p.pts[3 * t], p.pts[3 * t + 1], p.pts[3 * t + 2]);
        depth += z; points += (t ? " " : "") + x.toFixed(1) + "," + y.toFixed(1);
      }
      const g = S.rotate(p.n[0], p.n[1], p.n[2]), front = g[2] >= 0, s = S.rotate(p.s[0], p.s[1], p.s[2]), k = front ? 1 : -1;
      // lit on the visible side; next to the silhouette a smoothed normal can turn away from the viewer — the facet's own normal then
      const normal: [number, number, number] = k * s[2] >= 0 ? [k * s[0], k * s[1], k * s[2]] : [k * g[0], k * g[1], k * g[2]];
      polygons.push({ surface, depth: depth / n, points, front, normal });
    }
    if (withLines) for (const l of m.lines) {
      const a = S.toScreen(l[0], l[1], l[2]), b = S.toScreen(l[3], l[4], l[5]);
      lines.push({ surface, depth: (a[2] + b[2]) / 2 + lift, x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
    }
  });
  polygons.sort((a, b) => a.depth - b.depth || a.surface - b.surface);
  lines.sort((a, b) => a.depth - b.depth || a.surface - b.surface);
  return { polygons, lines };
}

// ── axes, back panes, grid and ticks ───────────────────────────────────────────────────────────────────────────────────────────
export type PlotTick = { t: number; text: string };
/** "Nice" ticks (steps 1, 2, 5 × 10ⁿ, at most `max` intervals) of [lo, hi], as normalised positions (−1 … 1) with their labels. */
export function plotTicks(lo: number, hi: number, max = 5): PlotTick[] {
  const span = hi - lo;
  if (!(span > 0) || !Number.isFinite(span)) return [];
  const mag = Math.pow(10, Math.floor(Math.log10(span / max))), step = [1, 2, 5, 10].map(f => f * mag).find(st => span / st <= max) ?? 10 * mag;
  const out: PlotTick[] = [];
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + step * 1e-9 && out.length <= max + 1; k++) {
    const v = Number((k * step).toPrecision(12));
    out.push({ t: (2 * (v - lo)) / span - 1, text: String(Number(v.toPrecision(4))) });
  }
  return out;
}
export type PlotAxes = {
  panes: string[]; grid: [number, number, number, number][]; edges: [number, number, number, number][];
  ticks: { axis: "x" | "y" | "z"; x: number; y: number; text: string; anchor: "start" | "middle" | "end" }[];
  titles: { axis: "x" | "y" | "z"; x: number; y: number; text: string; anchor: "start" | "middle" | "end" }[];
};
/** The coordinate frame for a camera: the three BACK panes of the viewport box (they never hide a surface), their grid lines at the
 *  ticks, the box edges, and the tick labels / axis titles placed outside the box on the edges nearest the viewer. */
export function plotAxes(camera: SurfacePlotCameraState, width: number, height: number, ticks: { x: PlotTick[]; y: PlotTick[]; z: PlotTick[] }, titles: { x: string; y: string; z: string }, withGrid: boolean): PlotAxes {
  const S = plotScreen(camera, width, height), P = (X: number, Y: number, Z: number) => S.toScreen(X, Y, Z);
  const back = (X: number, Y: number, Z: number) => (S.rotate(X, Y, Z)[2] > 0 ? -1 : 1);                 // the side whose normal faces away
  const sx = back(1, 0, 0), sy = back(0, 1, 0), sz = back(0, 0, 1);
  const quad = (a: number[][]) => a.map(([X, Y, Z]) => { const p = P(X, Y, Z); return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ");
  const panes = [quad([[sx, -1, -1], [sx, 1, -1], [sx, 1, 1], [sx, -1, 1]]), quad([[-1, sy, -1], [1, sy, -1], [1, sy, 1], [-1, sy, 1]]), quad([[-1, -1, sz], [1, -1, sz], [1, 1, sz], [-1, 1, sz]])];
  const seg = (a: [number, number, number], b: [number, number, number]): [number, number, number, number] => { const p = P(...a), q = P(...b); return [p[0], p[1], q[0], q[1]]; };
  const grid: [number, number, number, number][] = [];
  if (withGrid) {
    for (const { t } of ticks.z) { grid.push(seg([sx, -1, t], [sx, 1, t])); grid.push(seg([-1, sy, t], [1, sy, t])); }
    for (const { t } of ticks.y) { grid.push(seg([sx, t, -1], [sx, t, 1])); grid.push(seg([-1, t, sz], [1, t, sz])); }
    for (const { t } of ticks.x) { grid.push(seg([t, sy, -1], [t, sy, 1])); grid.push(seg([t, -1, sz], [t, 1, sz])); }
  }
  const edges = [seg([sx, -1, sz], [sx, 1, sz]), seg([-1, sy, sz], [1, sy, sz]), seg([sx, sy, -1], [sx, sy, 1]), seg([-sx, -1, sz], [-sx, 1, sz]), seg([-1, -sy, sz], [1, -sy, sz]),
    seg([sx, -sy, -1], [sx, -sy, 1]), seg([-sx, sy, -1], [-sx, sy, 1])];
  const centre = P(0, 0, sz), anchorOf = (dx: number): "start" | "middle" | "end" => (dx > 0.35 ? "start" : dx < -0.35 ? "end" : "middle");
  const outward = (mid: [number, number, number], from: [number, number, number]) => { const dx = mid[0] - from[0], dy = mid[1] - from[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
  const out: PlotAxes = { panes, grid, edges, ticks: [], titles: [] };
  // a tick label that would overlap one already placed (two axes meeting at a corner) is left out
  const free = (x: number, y: number) => out.ticks.every(t => Math.abs(t.x - x) > 18 || Math.abs(t.y - y) > 12);
  const place = (axis: "x" | "y" | "z", list: PlotTick[], at: (t: number) => [number, number, number], dir: number[], title: string) => {
    const a = anchorOf(dir[0]);
    for (const tk of list) { const p = P(...at(tk.t)), x = p[0] + dir[0] * 10, y = p[1] + dir[1] * 10 + 4; if (free(x, y)) out.ticks.push({ axis, x, y, text: tk.text, anchor: a }); }
    const m = P(...at(0));
    out.titles.push({ axis, x: m[0] + dir[0] * 34, y: m[1] + dir[1] * 30 + 4, text: title, anchor: a });
  };
  place("x", ticks.x, t => [t, -sy, sz], outward(P(0, -sy, sz), centre), titles.x);
  place("y", ticks.y, t => [-sx, t, sz], outward(P(-sx, 0, sz), centre), titles.y);
  // z: the side vertical edge (not the back corner, not the front corner) that is furthest out on screen
  const zc = [[-sx, sy], [sx, -sy]].map(([X, Y]) => ({ X, Y, p: P(X, Y, 0) })).sort((a, b) => Math.abs(b.p[0] - width / 2) - Math.abs(a.p[0] - width / 2))[0];
  place("z", ticks.z, t => [zc.X, zc.Y, t], [zc.p[0] >= width / 2 ? 1 : -1, 0], titles.z);
  return out;
}
