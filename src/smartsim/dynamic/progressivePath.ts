// Phase 20E — pure helpers for PROGRESSIVE plots: a deterministic, precomputed sample set is never resampled per frame; the visible path at
// simulation time t is the sample prefix strictly before t plus the EXACT current analytic point (so the path endpoint and the moving
// marker coincide). The prefix boundary is found by binary search (O(log n) per frame), allocations are bounded by the sample count.
import { DYNAMIC_LIMITS } from "./simulationClock";

/** Number of samples whose time is ≤ t (samples sorted by ascending t). */
export function countAtOrBefore(samples: readonly { t: number }[], t: number): number {
  let lo = 0, hi = samples.length;
  if (!(t === t)) return 0;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (samples[mid].t <= t) lo = mid + 1; else hi = mid; }
  return lo;
}
/** The visible prefix at time t: every sample strictly before the current point's time, then the current point (never duplicated). */
export function visiblePrefix<T extends { t: number }>(samples: readonly T[], t: number, current: T): T[] {
  const limit = Math.min(samples.length, DYNAMIC_LIMITS.plotPointsMax);
  let n = Math.min(countAtOrBefore(samples, t), limit);
  while (n > 0 && samples[n - 1].t >= current.t) n--;
  const out = samples.slice(0, n);
  out.push(current);
  return out;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** A linear map from [d0, d1] to [r0, r1]; a degenerate or non-finite domain maps everything to r0. */
export function linearScale(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  if (!finite(d0) || !finite(d1) || d1 === d0 || !finite(r0) || !finite(r1)) return () => (finite(r0) ? r0 : 0);
  const k = (r1 - r0) / (d1 - d0);
  return v => r0 + (v - d0) * k;
}
/** "Nice" axis ticks (1 / 2 / 5 × 10ⁿ steps), ascending, finite, at most maxTicks + 1 of them. */
export function niceTicks(lo: number, hi: number, maxTicks = 6): number[] {
  if (!finite(lo) || !finite(hi)) return [0];
  if (hi < lo) [lo, hi] = [hi, lo];
  const span = hi - lo;
  const m = Math.max(1, Math.min(20, Math.floor(maxTicks)));
  if (!(span > 0) || !finite(span)) return [lo];
  const raw = span / m, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map(f => f * mag).find(s => span / s <= m) ?? 10 * mag;
  if (!finite(step) || step <= 0) return [lo];
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9 && out.length <= m; v += step) out.push(Number(v.toPrecision(12)));
  return out.length ? out : [lo];
}
/** SVG path data "M x,y L x,y …" (2 decimals); a non-finite point breaks the path (the next finite point starts a new "M"). */
export function pathData(points: readonly { x: number; y: number }[], sx: (v: number) => number, sy: (v: number) => number): string {
  const parts: string[] = [];
  let pen = false;
  const n = Math.min(points.length, DYNAMIC_LIMITS.plotPointsMax);
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const x = finite(p?.x) && finite(p?.y) ? sx(p.x) : NaN, y = finite(p?.x) && finite(p?.y) ? sy(p.y) : NaN;
    if (!finite(x) || !finite(y)) { pen = false; continue; }
    parts.push((pen ? "L" : "M") + x.toFixed(2) + "," + y.toFixed(2));
    pen = true;
  }
  return parts.join(" ");
}
