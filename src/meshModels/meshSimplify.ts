// Phase 21D-B.2 — quadric edge-collapse mesh simplification for the OFFLINE asset pipeline (leaf module, no imports; never shipped:
// only the conversion script and its tests import it). Garland–Heckbert error quadrics with endpoint placement: a collapsed edge keeps
// one of its ORIGINAL vertices (position and source normal), so no new geometry is invented. Open boundaries are preserved (a boundary
// vertex never moves), and a collapse that would flip any surviving face is refused. Deterministic: the same input always gives the same
// output (ties broken by edge order).

export type SimplifyInput = { positions: Float32Array; normals: Float32Array; indices: Uint32Array | Uint16Array };
export type SimplifyResult = { positions: Float32Array; normals: Float32Array; indices: Uint32Array; triangles: number };

type Quadric = Float64Array; // 10 coefficients of the symmetric 4×4 error matrix
const addPlane = (q: Quadric, a: number, b: number, c: number, d: number, w: number) => {
  q[0] += w * a * a; q[1] += w * a * b; q[2] += w * a * c; q[3] += w * a * d; q[4] += w * b * b;
  q[5] += w * b * c; q[6] += w * b * d; q[7] += w * c * c; q[8] += w * c * d; q[9] += w * d * d;
};
const evalQ = (q: Quadric, x: number, y: number, z: number) =>
  q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9];

/** Simplifies to about `ratio` of the input triangles (0 < ratio ≤ 1). */
export function simplifyMesh(input: SimplifyInput, ratio: number): SimplifyResult {
  const P = input.positions, nv = P.length / 3, F = Array.from(input.indices), nf = F.length / 3;
  const target = Math.max(4, Math.floor(nf * Math.min(1, Math.max(0.01, ratio))));
  const alive = new Uint8Array(nf).fill(1);
  const remap = new Int32Array(nv).map((_, i) => i);
  const find = (v: number) => { while (remap[v] !== v) { remap[v] = remap[remap[v]]; v = remap[v]; } return v; };
  const vf: number[][] = Array.from({ length: nv }, () => []);
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) vf[F[f * 3 + k]].push(f);
  const Q: Quadric[] = Array.from({ length: nv }, () => new Float64Array(10));
  const faceNormal = (a: number, b: number, c: number): [number, number, number, number] => {
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
    const x = uy * wz - uz * wy, y = uz * wx - ux * wz, z = ux * wy - uy * wx, l = Math.hypot(x, y, z);
    return [x, y, z, l];
  };
  for (let f = 0; f < nf; f++) {
    const a = F[f * 3], b = F[f * 3 + 1], c = F[f * 3 + 2], [x, y, z, l] = faceNormal(a, b, c);
    if (l < 1e-30) continue;
    const nx = x / l, ny = y / l, nz = z / l, d = -(nx * P[a * 3] + ny * P[a * 3 + 1] + nz * P[a * 3 + 2]);
    for (const v of [a, b, c]) addPlane(Q[v], nx, ny, nz, d, l / 2);
  }
  // boundary vertices (an edge used by one face) never move
  const edgeUse = new Map<number, number>();
  const key = (a: number, b: number) => (a < b ? a * nv + b : b * nv + a);
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) { const e = key(F[f * 3 + k], F[f * 3 + ((k + 1) % 3)]); edgeUse.set(e, (edgeUse.get(e) ?? 0) + 1); }
  const boundary = new Uint8Array(nv);
  for (const [e, n] of edgeUse) if (n === 1) { boundary[Math.floor(e / nv)] = 1; boundary[e % nv] = 1; }
  // candidate collapses in a binary heap (cost, then edge order)
  type Cand = { cost: number; from: number; to: number; stamp: number; order: number };
  const stamp = new Uint32Array(nv);
  const heap: Cand[] = [];
  const less = (x: Cand, y: Cand) => x.cost < y.cost || (x.cost === y.cost && x.order < y.order);
  const push = (c: Cand) => { heap.push(c); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!less(heap[i], heap[p])) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } };
  const pop = (): Cand => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && less(heap[l], heap[m])) m = l; if (r < heap.length && less(heap[r], heap[m])) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return top; };
  let order = 0;
  const stampOf = (from: number, to: number) => stamp[from] * 4294967296 + stamp[to];
  const consider = (a: number, b: number) => {
    const q = new Float64Array(10);
    for (let k = 0; k < 10; k++) q[k] = Q[a][k] + Q[b][k];
    // endpoint placement only: move a → b, or b → a (never a boundary vertex)
    if (!boundary[a]) push({ cost: evalQ(q, P[b * 3], P[b * 3 + 1], P[b * 3 + 2]), from: a, to: b, stamp: stampOf(a, b), order: order++ });
    if (!boundary[b]) push({ cost: evalQ(q, P[a * 3], P[a * 3 + 1], P[a * 3 + 2]), from: b, to: a, stamp: stampOf(b, a), order: order++ });
  };
  for (const e of edgeUse.keys()) consider(Math.floor(e / nv), e % nv);
  let faces = nf;
  const flips = (from: number, to: number): boolean => {
    for (const f of vf[from]) {
      if (!alive[f]) continue;
      const v = [find(F[f * 3]), find(F[f * 3 + 1]), find(F[f * 3 + 2])];
      if (v.includes(to)) continue;                                   // this face disappears
      const [ox, oy, oz, ol] = faceNormal(v[0], v[1], v[2]);
      const w = v.map(x => (x === from ? to : x)), [nx, ny, nz, nl] = faceNormal(w[0], w[1], w[2]);
      if (nl < 1e-30 || ol < 1e-30) return true;
      if ((ox * nx + oy * ny + oz * nz) / (ol * nl) < 0.3) return true;
    }
    return false;
  };
  while (faces > target && heap.length) {
    const c = pop(), from = find(c.from), to = find(c.to);
    if (from !== c.from || to !== c.to || from === to) continue;
    if (c.stamp !== stampOf(c.from, c.to)) continue;                     // stale candidate
    if (flips(from, to)) continue;
    remap[from] = to;
    stamp[from]++;
    for (let k = 0; k < 10; k++) Q[to][k] += Q[from][k];
    for (const f of vf[from]) {
      if (!alive[f]) continue;
      const v = [find(F[f * 3]), find(F[f * 3 + 1]), find(F[f * 3 + 2])];
      if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) { alive[f] = 0; faces--; }
      else vf[to].push(f);
    }
    vf[from] = [];
    stamp[to]++;
    const ring = new Set<number>();
    for (const f of vf[to]) if (alive[f]) for (let k = 0; k < 3; k++) { const x = find(F[f * 3 + k]); if (x !== to) ring.add(x); }
    for (const x of ring) consider(x, to);
  }
  // compact
  const newIndex = new Int32Array(nv).fill(-1), pos: number[] = [], nor: number[] = [], idx: number[] = [];
  for (let f = 0; f < nf; f++) {
    if (!alive[f]) continue;
    const v = [find(F[f * 3]), find(F[f * 3 + 1]), find(F[f * 3 + 2])];
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
    for (const x of v) {
      if (newIndex[x] < 0) { newIndex[x] = pos.length / 3; pos.push(P[x * 3], P[x * 3 + 1], P[x * 3 + 2]); nor.push(input.normals[x * 3], input.normals[x * 3 + 1], input.normals[x * 3 + 2]); }
      idx.push(newIndex[x]);
    }
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nor), indices: new Uint32Array(idx), triangles: idx.length / 3 };
}
