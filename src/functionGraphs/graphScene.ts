// Phase 21A.2 — the renderer ADAPTER's pure half: a validated FunctionGraphSpecV1 + the current view + a pixel box → a drawing scene
// (pixel geometry, ticks, labels, hit shapes). Pure and deterministic (no DOM): the SVG component only draws what this returns, so the
// renderer stays replaceable and the geometry is unit-tested. Bounded: one global work budget (AST nodes × evaluations) is shared by all
// curves, so the most complex legal graph still draws in bounded time (coarser, never missing, `truncated` reported).
import { compileGraphCurves, curveValue, numericDerivative, sampleCurve, graphInDomain, type CompiledCurve, type FunctionGraphSpecV1, type GraphViewportV1 } from "./functionGraphSpec";
import { formatGraphNumber, graphTargetKey } from "./graphTargets";
import type { SamplePoint } from "./graphSampling";

export const SCENE_LIMITS = Object.freeze({ workBudget: 3_000_000, maxEvaluationsPerCurve: 16000, minWidth: 160, maxWidth: 2400, clampSpans: 2 });
export type Px = { x: number; y: number };
export type SceneTick = { value: number; px: number; label: string };
export type SceneCurve = { id: string; key: string; label?: string; color: number; line: "solid" | "dashed" | "dotted"; d: string; truncated: boolean; labelAt?: Px };
export type ScenePoint = { id: string; key: string; label?: string; at: Px; open: boolean };
export type SceneEndpoint = { curve: string; at: Px; open: boolean };
/** A line's role never changes its drawing (roles are teacher-only semantics, removed from student projections). */
export type SceneLine = { id: string; key: string; label?: string; vertical: boolean; px: number; line: "solid" | "dashed" | "dotted"; color: number };
export type SceneTangent = { id: string; key: string; label?: string; kind: "tangent" | "normal"; a: Px; b: Px; at: Px; slope: number; approximate: boolean };
export type SceneRegion = { id: string; key: string; label?: string; d: string; labelAt: Px };
export type SceneInterval = { id: string; key: string; label?: string; x1: number; x2: number; fromClosed: boolean; toClosed: boolean };
export type GraphScene = {
  width: number; height: number; plot: { left: number; top: number; right: number; bottom: number }; view: GraphViewportV1;
  xTicks: SceneTick[]; yTicks: SceneTick[]; xAxisY: number | null; yAxisX: number | null; gridX: boolean; gridY: boolean;
  curves: SceneCurve[]; endpoints: SceneEndpoint[]; points: ScenePoint[]; lines: SceneLine[]; tangents: SceneTangent[]; regions: SceneRegion[]; intervals: SceneInterval[];
  evaluations: number; truncated: boolean;
};

/** "Nice" tick step for a span and a target count: 1, 2, 2.5 or 5 × 10^k. */
export function niceStep(span: number, target: number): number {
  const raw = span / Math.max(1, target), p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}
function ticks(min: number, max: number, step: number, toPx: (v: number) => number, pi: boolean): SceneTick[] {
  const out: SceneTick[] = [];
  const first = Math.ceil(min / step - 1e-9);
  for (let k = first; out.length < 201; k++) {
    const v = k * step;
    if (v > max + step * 1e-9) break;
    const value = Math.abs(v) < step * 1e-9 ? 0 : v;
    out.push({ value, px: toPx(value), label: pi ? formatGraphNumber(value) : formatTick(value, step) });
  }
  return out;
}
const formatTick = (v: number, step: number) => {
  const decimals = Math.max(0, Math.min(6, -Math.floor(Math.log10(step) + 1e-9) + (step / 10 ** Math.floor(Math.log10(step)) === 2.5 ? 1 : 0)));
  const s = v.toFixed(decimals).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s.replace("-", "−");
};
const r2 = (v: number) => Math.round(v * 100) / 100;

export type SceneInput = { spec: FunctionGraphSpecV1; view?: GraphViewportV1; width: number; height: number; compiled?: CompiledCurve[] };
/** Builds the scene. `view` (zoom / pan state) defaults to the authored viewport; `compiled` may be passed to reuse evaluators. */
export function buildGraphScene({ spec, view, width: w, height: h, compiled }: SceneInput): GraphScene {
  const L = SCENE_LIMITS;
  const width = Math.max(L.minWidth, Math.min(L.maxWidth, Math.round(Number.isFinite(w) ? w : 640)));
  const height = Math.max(120, Math.min(L.maxWidth, Math.round(Number.isFinite(h) ? h : width * 0.7)));
  const vp = view ?? spec.viewport;
  const compact = width < 420;
  const plot = { left: compact ? 34 : 44, top: 12, right: width - (compact ? 10 : 14), bottom: height - (compact ? 24 : 28) };
  const pw = plot.right - plot.left, ph = plot.bottom - plot.top;
  const sx = (x: number) => plot.left + ((x - vp.xMin) / (vp.xMax - vp.xMin)) * pw;
  const sy = (y: number) => plot.bottom - ((y - vp.yMin) / (vp.yMax - vp.yMin)) * ph;
  const ySpan = vp.yMax - vp.yMin, xSpan = vp.xMax - vp.xMin;
  // off-screen values are clamped a few viewport-heights away: the visible part of the stroke keeps its direction, SVG never sees 1e15
  const cy = (y: number) => Math.max(vp.yMin - L.clampSpans * ySpan, Math.min(vp.yMax + L.clampSpans * ySpan, y));
  const cx = (x: number) => Math.max(vp.xMin - L.clampSpans * xSpan, Math.min(vp.xMax + L.clampSpans * xSpan, x));
  const toPx = (p: SamplePoint): Px => ({ x: r2(sx(cx(p[0]))), y: r2(sy(cy(p[1]))) });
  const ax = spec.axes?.x, ay = spec.axes?.y;
  const xPi = ax?.ticks === "pi", yPi = ay?.ticks === "pi";
  const autoX = xPi ? Math.PI / 2 * Math.max(1, Math.round(xSpan / (Math.PI / 2) / Math.max(2, pw / 70))) : niceStep(xSpan, Math.max(2, pw / 70));
  const autoY = yPi ? Math.PI / 2 * Math.max(1, Math.round(ySpan / (Math.PI / 2) / Math.max(2, ph / 45))) : niceStep(ySpan, Math.max(2, ph / 45));
  // an authored step is honoured while it leaves room for the labels; zoomed out, the step is multiplied (never a wall of labels)
  const fit = (step: number | undefined, auto: number, span: number, room: number) => {
    if (step === undefined) return auto;
    let s = step;
    while (span / s > room) s *= 2;
    return s;
  };
  const xStep = fit(ax?.step, autoX, xSpan, Math.max(2, pw / 40)), yStep = fit(ay?.step, autoY, ySpan, Math.max(2, ph / 22));
  const xTicks = ticks(vp.xMin, vp.xMax, xStep, v => r2(sx(v)), xPi), yTicks = ticks(vp.yMin, vp.yMax, yStep, v => r2(sy(v)), yPi);
  const xAxisY = vp.yMin <= 0 && vp.yMax >= 0 ? r2(sy(0)) : null, yAxisX = vp.xMin <= 0 && vp.xMax >= 0 ? r2(sx(0)) : null;

  const curvesC = compiled ?? compileGraphCurves(spec);
  const byId = new Map(curvesC.map(c => [c.id, c] as [string, CompiledCurve]));
  const totalCost = curvesC.reduce((a, c) => a + (c.kind === "piecewise" ? c.pieces.reduce((b, p) => b + p.cost, 0) : c.cost), 0) || 1;
  let evaluations = 0, truncated = false;
  const samples = Math.max(64, Math.min(1200, Math.round(pw)));
  const curves: SceneCurve[] = [], endpoints: SceneEndpoint[] = [];
  const inView = (x: number, y: number) => x >= vp.xMin && x <= vp.xMax && y >= vp.yMin && y <= vp.yMax;
  spec.curves.forEach((c, i) => {
    const cc = byId.get(c.id)!;
    // refinement budget: the global work budget shared in proportion to the AST size, never more than the sampler's own cap
    const pieces = cc.kind === "piecewise" ? cc.pieces.length : 1;
    const budget = Math.max(0, Math.min(L.maxEvaluationsPerCurve, Math.floor(L.workBudget / totalCost / pieces) - samples));
    const results = sampleCurve(cc, vp, samples, 0.5 / pw, budget);
    let d = "", t = false, best: SamplePoint[] = [];
    for (const r of results) {
      evaluations += r.evaluations; t = t || r.truncated;
      for (const seg of r.segments) {
        if (seg.length > best.length) best = seg;
        const pts = seg.map(toPx);
        if (pts.length === 1) { d += "M" + pts[0].x + " " + pts[0].y + "h0.01"; continue; }
        d += "M" + pts.map(p => p.x + " " + p.y).join("L");
      }
    }
    truncated = truncated || t;
    // label: at the right-most visible sample of the longest polyline
    let labelAt: Px | undefined;
    for (let k = best.length - 1; k >= 0; k--) if (inView(best[k][0], best[k][1])) { labelAt = toPx(best[k]); break; }
    curves.push({ id: c.id, key: graphTargetKey("curve", c.id), label: c.label, color: c.style?.color ?? ((i % 6) + 1), line: c.style?.line ?? "solid", d, truncated: t, labelAt });
    // domain end markers: a filled dot where the end belongs to the curve, an open dot where it does not
    const ends = cc.kind === "explicit" ? [cc.domain] : cc.kind === "piecewise" ? cc.pieces.map(p => p.domain) : [];
    for (const dm of ends) for (const [x, closed] of [[dm.min, dm.minClosed], [dm.max, dm.maxClosed]] as [number, boolean][]) {
      if (!Number.isFinite(x)) continue;
      const f = cc.kind === "explicit" ? cc.f : (cc as Extract<CompiledCurve, { kind: "piecewise" }>).pieces.find(p => p.domain === dm)!.f;
      let y = f(x);
      if (!Number.isFinite(y)) { const e = 1e-9 * Math.max(1, Math.abs(x)); y = f(x === dm.min ? x + e : x - e); }
      if (Number.isFinite(y) && inView(x, y)) endpoints.push({ curve: c.id, at: toPx([x, y]), open: !closed || !graphInDomain(x, dm) || !Number.isFinite(f(x)) });
    }
  });
  const points: ScenePoint[] = (spec.points ?? []).map(p => ({ id: p.id, key: graphTargetKey("point", p.id), label: p.label, at: toPx([p.x, p.y]), open: p.open === true }));
  const lines: SceneLine[] = (spec.lines ?? []).map(l => ({ id: l.id, key: graphTargetKey("line", l.id), label: l.label, vertical: l.orientation === "vertical", px: l.orientation === "vertical" ? r2(sx(l.value)) : r2(sy(l.value)), line: l.style?.line ?? "solid", color: l.style?.color ?? 6 }));
  const tangents: SceneTangent[] = (spec.tangents ?? []).map(t => {
    const cc = byId.get(t.curve)!;
    const y0 = curveValue(cc, t.x);
    const authoredDerivative = spec.curves.find(c => c.kind === "explicit" && c.derivativeOf === t.curve);
    const exact = t.slope ?? (authoredDerivative ? curveValue(byId.get(authoredDerivative.id)!, t.x) : NaN);
    const m0 = Number.isFinite(exact) ? exact : numericDerivative(s => curveValue(cc, s), t.x).value;
    const approximate = !Number.isFinite(exact);
    const slope = t.kind === "tangent" ? m0 : m0 === 0 ? Infinity : -1 / m0;
    let a: SamplePoint, b: SamplePoint;
    if (!Number.isFinite(slope)) { a = [t.x, vp.yMin - ySpan]; b = [t.x, vp.yMax + ySpan]; }
    else { const x1 = vp.xMin - xSpan, x2 = vp.xMax + xSpan; a = [x1, y0 + slope * (x1 - t.x)]; b = [x2, y0 + slope * (x2 - t.x)]; }
    return { id: t.id, key: graphTargetKey("tangent", t.id), label: t.label, kind: t.kind, a: toPx(a), b: toPx(b), at: toPx([t.x, y0]), slope, approximate };
  });
  const regions: SceneRegion[] = (spec.regions ?? []).map(r => {
    const upper = byId.get(r.curve)!, lower = r.lower !== undefined ? byId.get(r.lower)! : undefined;
    const n = 160, xs = Array.from({ length: n + 1 }, (_, k) => r.from + ((r.to - r.from) * k) / n);
    evaluations += lower ? 2 * (n + 1) : n + 1;
    const top = xs.map(x => toPx([x, curveValue(upper, x)]));
    const bottom = lower ? xs.map(x => toPx([x, curveValue(lower, x)])).reverse() : [toPx([r.to, 0]), toPx([r.from, 0])];
    const poly = [...top, ...bottom];
    const mid = Math.floor(n / 2), my = lower ? (top[mid].y + bottom[n - mid].y) / 2 : (top[mid].y + toPx([xs[mid], 0]).y) / 2;
    return { id: r.id, key: graphTargetKey("region", r.id), label: r.label, d: "M" + poly.map(p => p.x + " " + p.y).join("L") + "Z", labelAt: { x: top[mid].x, y: r2(my) } };
  });
  const intervals: SceneInterval[] = (spec.intervals ?? []).map(v => ({ id: v.id, key: graphTargetKey("interval", v.id), label: v.label, x1: r2(sx(v.from)), x2: r2(sx(v.to)), fromClosed: v.fromClosed ?? true, toClosed: v.toClosed ?? true }));
  return {
    width, height, plot, view: vp, xTicks, yTicks, xAxisY, yAxisX, gridX: ax?.grid ?? true, gridY: ay?.grid ?? true,
    curves, endpoints, points, lines, tangents, regions, intervals, evaluations, truncated
  };
}

/** The data point under a pixel (inverse of the scene mapping). */
export function sceneToData(scene: GraphScene, px: number, py: number): { x: number; y: number } {
  const { plot, view } = scene;
  return { x: view.xMin + ((px - plot.left) / (plot.right - plot.left)) * (view.xMax - view.xMin), y: view.yMin + ((plot.bottom - py) / (plot.bottom - plot.top)) * (view.yMax - view.yMin) };
}

/** Zoom about a data point by `factor` (> 1 zooms in), bounded so the view never becomes degenerate or absurdly large. */
export function zoomView(v: GraphViewportV1, factor: number, cx = (v.xMin + v.xMax) / 2, cy = (v.yMin + v.yMax) / 2): GraphViewportV1 {
  const f = Math.max(0.05, Math.min(20, factor));
  const nx = (v.xMax - v.xMin) / f, ny = (v.yMax - v.yMin) / f;
  if (nx < 1e-4 || ny < 1e-4 || nx > 4e6 || ny > 4e6) return v;
  const tx = (cx - v.xMin) / (v.xMax - v.xMin), ty = (cy - v.yMin) / (v.yMax - v.yMin);
  return { xMin: cx - tx * nx, xMax: cx + (1 - tx) * nx, yMin: cy - ty * ny, yMax: cy + (1 - ty) * ny };
}
/** Pan by a fraction of the view (dx, dy in view widths / heights). */
export function panView(v: GraphViewportV1, dx: number, dy: number): GraphViewportV1 {
  const w = v.xMax - v.xMin, h = v.yMax - v.yMin;
  const ox = Math.max(-1e6, Math.min(1e6, v.xMin + dx * w)) - v.xMin, oy = Math.max(-1e6, Math.min(1e6, v.yMin + dy * h)) - v.yMin;
  return { xMin: v.xMin + ox, xMax: v.xMax + ox, yMin: v.yMin + oy, yMax: v.yMax + oy };
}
