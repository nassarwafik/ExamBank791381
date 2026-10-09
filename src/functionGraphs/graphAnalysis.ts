// Phase 21A.2 — NUMERICAL feature detection for the teacher's editor: roots, the y-intercept, local extrema, intersections of two curves
// and vertical asymptotes, found on a bounded grid and refined by bisection / golden-section search. Every result is APPROXIMATE and says
// so: the editor shows it with ≈ and the teacher decides whether to add it as an authored point (teacher-authored values are the
// authority; nothing here is ever graded, stored or shown to a student). Pure and bounded (≤ 600 grid points per curve or pair, ≤ 80
// refinement steps per feature, at most 40 features).
import { compileGraphCurves, curveValue, type CompiledCurve, type FunctionGraphSpecV1 } from "./functionGraphSpec";

export type GraphFeatureKind = "root" | "yIntercept" | "minimum" | "maximum" | "intersection" | "verticalAsymptote";
export type GraphFeature = { kind: GraphFeatureKind; x: number; y: number | null; curves: string[]; approximate: true };
export const ANALYSIS_LIMITS = Object.freeze({ grid: 600, features: 40 });

/** Snaps a value to a short decimal when it is that decimal to 1e-7 (1.99999999 → 2: numerical noise, not mathematics); otherwise keeps
 *  10 significant digits. The result stays APPROXIMATE (the editor shows ≈ and the teacher decides). */
export const snapGraphValue = (v: number): number => {
  for (let d = 0; d <= 6; d++) { const r = Number(v.toFixed(d)); if (Math.abs(r - v) <= 1e-7 * Math.max(1, Math.abs(v))) return r === 0 ? 0 : r; }
  return Number(v.toPrecision(10));
};

function bisectRoot(h: (x: number) => number, a: number, b: number): number | null {
  let fa = h(a);
  for (let i = 0; i < 80; i++) {
    const m = (a + b) / 2, fm = h(m);
    if (!Number.isFinite(fm)) return null;
    if (fm === 0) return m;
    if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}
/** An extremum in [a, b] as the sign change of the central-difference slope (≈ 1e-8 precise; a search on the values themselves stalls at
 *  ≈ 1e-6 because the curve is flat there and its values carry 12 significant digits). */
function slopeExtremum(f: (x: number) => number, a: number, b: number, max: boolean): number {
  const slope = (x: number) => { const h = 1e-5 * Math.max(1, Math.abs(x)); return (f(x + h) - f(x - h)) / (2 * h); };
  const rising = (x: number) => (max ? slope(x) > 0 : slope(x) < 0);
  if (!rising(a) || rising(b)) return (a + b) / 2;
  for (let i = 0; i < 80; i++) { const m = (a + b) / 2; if (rising(m)) a = m; else b = m; }
  return (a + b) / 2;
}

/** Approximate features of the explicit / piecewise curves inside the viewport (parametric curves are not analysed). */
export function analyzeFunctionGraph(g: FunctionGraphSpecV1): GraphFeature[] {
  const vp = g.viewport, n = ANALYSIS_LIMITS.grid, ySpan = vp.yMax - vp.yMin;
  const out: GraphFeature[] = [];
  const push = (f: GraphFeature) => {
    if (out.length >= ANALYSIS_LIMITS.features) return;
    const dup = out.some(o => o.kind === f.kind && o.curves.join() === f.curves.join() && Math.abs(o.x - f.x) <= 1e-6 * Math.max(1, Math.abs(f.x)));
    if (!dup) out.push(f);
  };
  const xs = Array.from({ length: n + 1 }, (_, i) => vp.xMin + ((vp.xMax - vp.xMin) * i) / n);
  const curves = compileGraphCurves(g).filter((c): c is Exclude<CompiledCurve, { kind: "parametric" }> => c.kind !== "parametric");
  const big = 10 * ySpan + Math.max(Math.abs(vp.yMin), Math.abs(vp.yMax));
  /** Sign changes of h on the grid that are true zeros (|h| small at the refined point), never the sign flip across a pole. */
  const zeros = (h: (x: number) => number): number[] => {
    const ys = xs.map(h), found: number[] = [];
    for (let i = 0; i <= n; i++) {
      if (ys[i] === 0) { found.push(xs[i]); continue; }
      if (i === n || !Number.isFinite(ys[i]) || !Number.isFinite(ys[i + 1]) || ys[i + 1] === 0 || (ys[i] < 0) === (ys[i + 1] < 0)) continue;
      const r = bisectRoot(h, xs[i], xs[i + 1]);
      if (r !== null && Math.abs(h(r)) <= 1e-6 * (1 + ySpan)) found.push(r);
    }
    return found;
  };
  for (const c of curves) {
    const f = (x: number) => curveValue(c, x), ys = xs.map(f);
    for (const r of zeros(f)) push({ kind: "root", x: snapGraphValue(r), y: 0, curves: [c.id], approximate: true });
    const y0 = f(0);
    if (vp.xMin <= 0 && vp.xMax >= 0 && Number.isFinite(y0)) push({ kind: "yIntercept", x: 0, y: snapGraphValue(y0), curves: [c.id], approximate: true });
    for (let i = 1; i < n; i++) {
      const a = ys[i - 1], m = ys[i], b = ys[i + 1];
      if (![a, m, b].every(Number.isFinite) || Math.abs(b - a) > ySpan) continue;
      const max = m > a && m >= b, min = m < a && m <= b;
      if (!max && !min) continue;
      const x = slopeExtremum(f, xs[i - 1], xs[i + 1], max), y = f(x);
      if (Number.isFinite(y)) push({ kind: max ? "maximum" : "minimum", x: snapGraphValue(x), y: snapGraphValue(y), curves: [c.id], approximate: true });
    }
    for (let i = 0; i < n; i++) {
      const a = ys[i], b = ys[i + 1];
      const pole = (Number.isFinite(a) && Number.isFinite(b) && (a < 0) !== (b < 0) && Math.abs(a) + Math.abs(b) > ySpan) || (Number.isFinite(a) !== Number.isFinite(b));
      if (!pole) continue;
      // narrow the gap (towards the defined side when one neighbour is undefined, onto the sign flip otherwise), then call it an asymptote
      // only when the curve really grows without bound next to it
      let lo = xs[i], hi = xs[i + 1];
      const leftOk = Number.isFinite(a), rightOk = Number.isFinite(b);
      for (let k = 0; k < 60; k++) {
        const m = (lo + hi) / 2, fm = f(m), ok = Number.isFinite(fm);
        if (leftOk && rightOk) { if (ok && (fm < 0) === (a < 0)) lo = m; else hi = m; }
        else if (leftOk) { if (ok) lo = m; else hi = m; }
        else { if (ok) hi = m; else lo = m; }
      }
      const l = f(lo), r = f(hi);
      // unbounded next to the gap: beyond ten viewports already, or |f| growing monotonically by more than a viewport over 14 decades of
      // approach (ln(x) at 0 grows slowly; sqrt(x) at 0 does not grow; sin(1/x) is not monotone)
      const w = xs[1] - xs[0];
      const grows = (edge: number, dir: number) => {
        const v = Array.from({ length: 14 }, (_, k) => Math.abs(f(edge + dir * w * 10 ** -(k + 2))));
        return v.every(Number.isFinite) && v.every((y, k) => k === 0 || y >= v[k - 1]) && v[13] - v[0] > ySpan;
      };
      const unbounded = (Number.isFinite(l) && (Math.abs(l) > big || grows(lo, -1))) || (Number.isFinite(r) && (Math.abs(r) > big || grows(hi, 1)));
      if (unbounded) push({ kind: "verticalAsymptote", x: snapGraphValue((lo + hi) / 2), y: null, curves: [c.id], approximate: true });
    }
  }
  for (let i = 0; i < curves.length; i++) for (let j = i + 1; j < curves.length; j++) {
    const a = curves[i], b = curves[j];
    const h = (x: number) => curveValue(a, x) - curveValue(b, x);
    for (const r of zeros(h)) {
      const y = curveValue(a, r);
      if (Number.isFinite(y) && y >= vp.yMin && y <= vp.yMax) push({ kind: "intersection", x: snapGraphValue(r), y: snapGraphValue(y), curves: [a.id, b.id], approximate: true });
    }
  }
  return out;
}
