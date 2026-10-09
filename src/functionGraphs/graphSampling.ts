// Phase 21A.2 — deterministic, BOUNDED curve sampling. Pure (no DOM): the renderer, the validator's continuity checks and the analysis
// helpers share it. One routine samples every curve kind through a point function s → [x, y] (y = f(x): s = x; parametric: s = t):
//   • a uniform base grid (always evaluated in full, so no stretch of the curve is ever missing), then adaptive refinement by bisection
//     where a chord is not straight enough (smoothness, ≈ half a pixel) or jumps (≥ 5 % of the viewport) — never deeper than `maxDepth`,
//     never more refinement evaluations than `budget` (the result says `truncated`); in all, evaluations ≤ samples + 1 + budget + 24;
//   • an UNDEFINED value (NaN: domain error, division by zero, overflow) ends the polyline; the domain boundary is located by bisection
//     so sqrt(x) starts at x ≈ 0 and ln(x) runs down towards its asymptote;
//   • a jump that survives bisection down to the finest scale is a DISCONTINUITY (a pole such as 1/(x−2) or tan, a step such as floor):
//     the polyline is broken there — a fake connecting line is never drawn across it — and the break position is reported;
//   • refinement is skipped where all three points lie beyond the same viewport edge (invisible either way), so off-screen growth costs
//     nothing; values leaving the viewport are kept (the renderer clips and clamps them).
export type SamplePoint = readonly [number, number];
export type SampleOptions = {
  /** the viewport the result is drawn in (data units) */
  xMin: number; xMax: number; yMin: number; yMax: number;
  /** uniform base intervals (clamped to 16 … 2000) */
  samples: number;
  /** half a pixel, as a fraction of the viewport (0.5 / plot width in px); default 1/1000 */
  smooth?: number;
  maxDepth?: number;
  /** refinement evaluations beyond the base grid (clamped to 0 … 64000; default 16000) */
  budget?: number;
};
export type SampleResult = { segments: SamplePoint[][]; breaks: number[]; evaluations: number; truncated: boolean };

export const SAMPLING_LIMITS = Object.freeze({ minSamples: 16, maxSamples: 2000, maxDepth: 14, budget: 16000, boundaryIterations: 24, jump: 0.05 });

/** Samples s ∈ [s0, s1] through `point` (null = undefined at s). Deterministic for given inputs; bounded by the options. */
export function samplePath(point: (s: number) => SamplePoint | null, s0: number, s1: number, o: SampleOptions): SampleResult {
  const segments: SamplePoint[][] = [], breaks: number[] = [];
  const out: SampleResult = { segments, breaks, evaluations: 0, truncated: false };
  if (!(Number.isFinite(s0) && Number.isFinite(s1) && s1 > s0)) return out;
  const L = SAMPLING_LIMITS;
  const n = Math.max(L.minSamples, Math.min(L.maxSamples, Math.floor(Number.isFinite(o.samples) ? o.samples : 400)));
  const maxDepth = Math.max(0, Math.min(L.maxDepth, Math.floor(o.maxDepth ?? 12)));
  const budget = Math.max(0, Math.min(L.budget * 4, Math.floor(Number.isFinite(o.budget) ? o.budget! : L.budget)));
  const xs = o.xMax - o.xMin, ys = o.yMax - o.yMin;
  const smooth = o.smooth !== undefined && o.smooth > 0 ? o.smooth : 1e-3;
  let cur: SamplePoint[] = [], base = 0;
  const evalAt = (s: number): SamplePoint | null => {
    out.evaluations++;
    const p = point(s);
    return p && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? p : null;
  };
  const emit = (p: SamplePoint) => { cur.push(p); };
  const lift = () => { if (cur.length) segments.push(cur); cur = []; };
  const exhausted = () => { if (out.evaluations - base >= budget) { out.truncated = true; return true; } return false; };
  const baseAt = (s: number) => { base++; return evalAt(s); };
  const side = (p: SamplePoint) => (p[0] < o.xMin ? 1 : p[0] > o.xMax ? 2 : 0) | (p[1] < o.yMin ? 4 : p[1] > o.yMax ? 8 : 0);
  const dist = (a: SamplePoint, b: SamplePoint) => Math.hypot((b[0] - a[0]) / xs, (b[1] - a[1]) / ys);
  /** The defined point closest to the undefined region between a defined `sa` and an undefined `sb` (bisection). */
  const boundary = (sa: number, pa: SamplePoint, sb: number): SamplePoint => {
    let good = sa, gp = pa, bad = sb;
    for (let i = 0; i < L.boundaryIterations && !exhausted(); i++) {
      const m = (good + bad) / 2;
      if (m === good || m === bad) break;
      const pm = evalAt(m);
      if (pm) { good = m; gp = pm; } else bad = m;
    }
    return gp;
  };
  // the interval (a, pa) → (b, pb), both defined; pa is already emitted. Emits up to and including pb, or breaks.
  const interval = (a: number, pa: SamplePoint, b: number, pb: SamplePoint, depth: number) => {
    if (exhausted()) { emit(pb); return; }
    const m = (a + b) / 2;
    const pm = evalAt(m);
    if (!pm) {                                                                     // an undefined gap inside: end here, resume after it
      const left = boundary(a, pa, m);
      if (left !== pa) emit(left);
      lift();
      const right = boundary(b, pb, m);
      emit(right);
      if (right !== pb) emit(pb);
      return;
    }
    const sa = side(pa), sm = side(pm), sb = side(pb);
    if (sa !== 0 && (sa & sm & sb) !== 0) { emit(pb); return; }                   // all beyond one viewport edge: invisible either way
    const chord: SamplePoint = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
    const jump = dist(pa, pb) > L.jump;
    if (!jump && dist(chord, pm) <= smooth) { emit(pb); return; }
    if (depth <= 0) {
      if (jump) { lift(); breaks.push(m); emit(pb); }                             // a jump at the finest scale: a discontinuity
      else { emit(pm); emit(pb); }
      return;
    }
    interval(a, pa, m, pm, depth - 1);
    interval(m, pm, b, pb, depth - 1);
  };
  let prevS = s0, prev = baseAt(s0);
  if (prev) emit(prev);
  for (let i = 1; i <= n; i++) {
    const s = i === n ? s1 : s0 + (s1 - s0) * (i / n);
    const p = baseAt(s);
    if (prev && p) interval(prevS, prev, s, p, maxDepth);
    else if (prev && !p) { const q = boundary(prevS, prev, s); if (q !== prev) emit(q); lift(); }
    else if (!prev && p) { const q = boundary(s, p, prevS); emit(q); if (q !== p) emit(p); }
    prevS = s; prev = p;
  }
  lift();
  return out;
}

/** y = f(x) on [a, b] (already intersected with the viewport and the curve's domain). */
export const sampleExplicit = (f: (x: number) => number, a: number, b: number, o: SampleOptions): SampleResult =>
  samplePath(x => { const y = f(x); return Number.isFinite(y) ? [x, y] : null; }, a, b, o);

/** (x(t), y(t)) for t ∈ [t0, t1]. */
export const sampleParametric = (fx: (t: number) => number, fy: (t: number) => number, t0: number, t1: number, o: SampleOptions): SampleResult =>
  samplePath(t => { const x = fx(t), y = fy(t); return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null; }, t0, t1, o);
