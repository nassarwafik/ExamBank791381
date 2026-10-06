// Phase 20F — SmartSim through the composer. The model never writes a plugin config or a check: it fills a bounded SIMULATION SPEC that
// can only name catalog entries, and CODE builds the public envelope and the PRIVATE weighted checks:
//   networkTopology@2 — the AI picks a curriculum scenario id; config + checks are the production template (code-owned, pinned to give no
//                       free credit). A composite part may take a SUBSET of the scenario's check ids.
//   physicsFreeFall@1 — the AI picks a bounded model and task kinds; every expected value is COMPUTED by code from the model (never typed
//                       by the AI); apex tasks exist only for an upward throw.
//   functionStudy2d@1 — the AI picks a language-2 expression, a window, the task groups and the expected answers (the academic key, like an
//                       MCQ index); code PROBES each expected value numerically against the expression and refuses an inconsistent key.
// Then the production validators decide (validateSmartSimEnvelope / validateSmartSimAnswerKey) and the NO-FREE-CREDIT gate runs: the
// key evaluated on an empty action stream must award nothing.
import { validateSmartSimEnvelope, validateSmartSimAnswerKey, evaluateSmartSim } from "../trustedSimQuestion";
import "../trustedSimPlugins";
import { impactTime, peakHeight, validateFreeFallConfig, type FreeFallConfigV1, type FreeFallModel } from "../physicsFreeFallModel";
import { compileFunction, evaluateFunctionAt, validateFunctionStudyConfig, FUNCTION_STUDY_TASKS } from "../functionStudyModel";
import { net2TemplateById } from "../networkTopology2/net2Templates";
import { COMPOSER_LIMITS, type ComposerIssue } from "./composerLimits";
import { COMPOSER_FUNCTION_TASKS, COMPOSER_NET_SCENARIOS, COMPOSER_PHYSICS_MEASUREMENTS, COMPOSER_PHYSICS_POINTS, COMPOSER_SIM_PLUGIN_KEYS, composerSimVersion, type ComposerSimPluginKey } from "./composerCatalog";
import { cleanText, hasExactKeys, isArr, isEnum, isNum, isStr, sArr, sEnum, sNull, sNum, sObj, sStr, type JsonSchema } from "./composerSchemaKit";

export type SimCheck = { id: string; label: string; weight: number; kind: string } & Record<string, unknown>;
export type SimEnvelope = { schemaVersion: 1; pluginKey: string; pluginVersion: number; config: unknown };
export type BuiltSim = { plugin: ComposerSimPluginKey; title: string; instructions: string; envelope: SimEnvelope; checks: SimCheck[] };
type R<T> = { ok: true; value: T } | { ok: false; issues: ComposerIssue[] };
const fail = <T>(code: string, message: string, path?: string): R<T> => ({ ok: false, issues: [{ code, message, ...(path ? { path } : {}) }] });
const L = COMPOSER_LIMITS;
const INTERVAL_KINDS = ["increasing", "decreasing"] as const;

export function buildSimSpecSchema(): JsonSchema {
  return sObj({
    plugin: sEnum(COMPOSER_SIM_PLUGIN_KEYS), title: sStr(), instructions: sStr(),
    network: sNull(sObj({ scenario: sEnum(COMPOSER_NET_SCENARIOS) })),
    physics: sNull(sObj({ initialHeight: sNum(), initialVelocity: sNum(), gravity: sNum(), measurements: sArr(sEnum(COMPOSER_PHYSICS_MEASUREMENTS), COMPOSER_PHYSICS_MEASUREMENTS.length), probeTime: sNum(), points: sArr(sEnum(COMPOSER_PHYSICS_POINTS), COMPOSER_PHYSICS_POINTS.length) })),
    function: sNull(sObj({
      source: sStr(), xMin: sNum(), xMax: sNum(), yMin: sNum(), yMax: sNum(), tasks: sArr(sEnum(COMPOSER_FUNCTION_TASKS), COMPOSER_FUNCTION_TASKS.length),
      domainExclusions: sArr(sNum(), 10), xIntercepts: sArr(sNum(), 10), yIntercept: sNull(sNum()), verticalAsymptotes: sArr(sNum(), 10), horizontalAsymptotes: sArr(sNum(), 2),
      extrema: sArr(sObj({ kind: sEnum(["min", "max"]), x: sNum(), y: sNum() }), 10), intervals: sArr(sObj({ kind: sEnum(INTERVAL_KINDS), from: sStr(), to: sStr() }), 12)
    }))
  });
}
const SPEC_KEYS = ["plugin", "title", "instructions", "network", "physics", "function"] as const;

// ── physics: labels / units of the task vocabulary (code-owned) ─────────────────────────────────────────────────────────────────────
const MEASURE: Record<string, { id: string; label: string; unit: "s" | "m" | "m/s" }> = {
  impactTime: { id: "impactTime", label: "زمن الوصول إلى الأرض", unit: "s" }, impactSpeed: { id: "impactSpeed", label: "سرعة الارتطام (مقدار)", unit: "m/s" },
  maxHeight: { id: "maxHeight", label: "أقصى ارتفاع يبلغه الجسم", unit: "m" }, apexTime: { id: "apexTime", label: "زمن الوصول إلى أعلى نقطة", unit: "s" },
  heightAtTime: { id: "heightAtT", label: "الارتفاع عند زمن الفحص", unit: "m" }, velocityAtTime: { id: "velocityAtT", label: "السرعة المتجهة عند زمن الفحص (الأعلى موجب)", unit: "m/s" }
};
const POINT: Record<string, { id: string; label: string }> = {
  impactPoint: { id: "impactPoint", label: "نقطة الارتطام على منحنى الارتفاع–الزمن" }, apexPoint: { id: "apexPoint", label: "أعلى نقطة على منحنى الارتفاع–الزمن" },
  trajectoryPoint: { id: "trajPoint", label: "نقطة من منحنى الارتفاع–الزمن" }
};
const r6 = (n: number) => Number(n.toFixed(6));

function buildPhysics(p: unknown, path: string): R<{ config: FreeFallConfigV1; checks: SimCheck[] }> {
  if (!hasExactKeys(p, ["initialHeight", "initialVelocity", "gravity", "measurements", "probeTime", "points"])) return fail("AI_SIM_SPEC_MALFORMED", "مواصفة محاكاة السقوط الحر غير صالحة.", path);
  if (!isNum(p.initialHeight, -1e9, 1e9) || !isNum(p.initialVelocity, -1e9, 1e9) || !isNum(p.gravity, -1e9, 1e9) || !isNum(p.probeTime, -1e9, 1e9)) return fail("AI_SIM_SPEC_MALFORMED", "قيم النموذج الفيزيائي غير عددية.", path);
  const ms = p.measurements, ps = p.points;
  if (!isArr(ms, COMPOSER_PHYSICS_MEASUREMENTS.length) || !ms.every(m => isEnum(m, COMPOSER_PHYSICS_MEASUREMENTS)) || new Set(ms).size !== ms.length) return fail("AI_SIM_SPEC_MALFORMED", "مهام القياس غير صالحة.", path);
  if (!isArr(ps, COMPOSER_PHYSICS_POINTS.length) || !ps.every(m => isEnum(m, COMPOSER_PHYSICS_POINTS)) || new Set(ps).size !== ps.length) return fail("AI_SIM_SPEC_MALFORMED", "مهام النقاط غير صالحة.", path);
  if (!ms.length && !ps.length) return fail("AI_SIM_TASK_INVALID", "أضف مهمة قياس أو نقطة واحدة على الأقل.", path);
  const model: FreeFallModel = { initialHeight: p.initialHeight, initialVelocity: p.initialVelocity, gravity: p.gravity };
  const upward = model.initialVelocity > 0;
  const probe = (ms as string[]).some(m => m === "heightAtTime" || m === "velocityAtTime");
  if (!upward && ((ms as string[]).some(m => m === "maxHeight" || m === "apexTime") || (ps as string[]).includes("apexPoint"))) return fail("AI_SIM_TASK_INVALID", "مهام أعلى نقطة تخص القذف إلى الأعلى فقط (السرعة الابتدائية موجبة).", path);
  let end = NaN;
  try { end = impactTime(model); } catch { end = NaN; }
  const view = { maxTime: Number.isFinite(end) ? Math.min(COMPOSER_LIMITS.durationMax, Math.max(0.5, Math.ceil(end * 1.15 * 2) / 2)) : 1, showVelocityGraph: true };
  const config = { v: 1 as const, model, view, tasks: { measurements: (ms as string[]).map(m => ({ ...MEASURE[m] })), points: (ps as string[]).map(x => ({ ...POINT[x] })) } };
  const v = validateFreeFallConfig(config);
  if (!v.ok) return { ok: false, issues: v.issues.map(i => ({ code: "AI_SIM_CONFIG_INVALID", message: i.message, path })) };
  if (probe && !(p.probeTime > 0 && p.probeTime < end)) return fail("AI_SIM_TASK_INVALID", "زمن الفحص يجب أن يقع داخل الحركة (بين 0 ولحظة الارتطام).", path);
  const t = p.probeTime;
  const checks: SimCheck[] = [];
  for (const m of ms as string[]) {
    if (m === "impactTime") checks.push({ id: "impact-time", label: "زمن الوصول إلى الأرض", weight: 3, kind: "physics.impactTime", measurementId: "impactTime", tolerance: 0.05 });
    if (m === "impactSpeed") checks.push({ id: "impact-speed", label: "سرعة الارتطام", weight: 3, kind: "physics.impactSpeed", measurementId: "impactSpeed", tolerance: 0.1 });
    if (m === "maxHeight") checks.push({ id: "max-height", label: "أقصى ارتفاع", weight: 2, kind: "numericNear@1", valueId: "maxHeight", expected: r6(peakHeight(model)), tolerance: 0.05 });
    if (m === "apexTime") checks.push({ id: "apex-time", label: "زمن أعلى نقطة", weight: 2, kind: "numericNear@1", valueId: "apexTime", expected: r6(model.initialVelocity / model.gravity), tolerance: 0.05 });
    if (m === "heightAtTime") checks.push({ id: "height-at-t", label: "الارتفاع عند زمن الفحص", weight: 2, kind: "physics.heightAtTime", measurementId: "heightAtT", time: t, tolerance: 0.05 });
    if (m === "velocityAtTime") checks.push({ id: "velocity-at-t", label: "السرعة المتجهة عند زمن الفحص", weight: 1, kind: "physics.velocityAtTime", measurementId: "velocityAtT", time: t, tolerance: 0.05 });
  }
  for (const x of ps as string[]) {
    if (x === "impactPoint") checks.push({ id: "impact-point", label: "نقطة الارتطام على المنحنى", weight: 2, kind: "pointNear@1", pointId: "impactPoint", expected: { x: r6(end), y: 0 }, tolerance: 0.05 });
    if (x === "apexPoint") checks.push({ id: "apex-point", label: "أعلى نقطة على المنحنى", weight: 2, kind: "pointNear@1", pointId: "apexPoint", expected: { x: r6(model.initialVelocity / model.gravity), y: r6(peakHeight(model)) }, tolerance: 0.05 });
    if (x === "trajectoryPoint") checks.push({ id: "trajectory-point", label: "نقطة على منحنى الحركة", weight: 1, kind: "physics.pointOnTrajectory", pointId: "trajPoint", tolerance: 0.1 });
  }
  return { ok: true, value: { config: v.config, checks } };
}

// ── function study: the AI's key, numerically probed against the expression (structure + consistency, not academic proof) ──────────
const parseBound = (s: string): number | "-inf" | "+inf" | null => {
  const t = s.trim().toLowerCase();
  if (t === "-inf" || t === "-∞") return "-inf";
  if (t === "+inf" || t === "inf" || t === "+∞" || t === "∞") return "+inf";
  const n = Number(t);
  return t !== "" && Number.isFinite(n) ? n : null;
};
/** COMPLETENESS probe (Review Fixes 1–2): what a student can find inside the window, located by code on a fixed grid (sign changes refined
 *  by bisection, touching roots / even poles / extrema by ternary search, limits from f(±10⁷) / f(±10⁹)). The grader compares SETS, so a
 *  key that omits a root, a pole, an extremum, a limit or a monotonic stretch would fail correct students: such a key is refused.
 *  POLES are recognized by GROWTH, never by an absolute height: |f| keeps increasing, without slowing down, as the probe closes in over
 *  four decades (10⁻³ … 10⁻¹²) — rational and logarithmic poles alike, whatever the window height; a removable hole or a finite edge does
 *  not grow. BOUNDED: only the features of the enabled tasks are located, every evaluation counts against PROBE_BUDGET, and a feature list
 *  longer than a key can hold stops the probe — an exhausted budget is a refusal (`overflow`), never a silent pass. A probe, not a proof:
 *  features finer than the grid, or growing too slowly to show over four decades, are left to the teacher's review. */
type Probe = (x: number) => number | null;
export type FunctionFeatures = { roots: number[]; points: number[]; poles: number[]; extrema: { kind: "min" | "max"; x: number }[]; limits: number[]; slope: { x: number; dir: 1 | -1 }[]; overflow: null | "budget" | "roots" | "points" | "poles" | "extrema" };
export type FeatureNeeds = { roots: boolean; points: boolean; poles: boolean; extrema: boolean; limits: boolean; slope: boolean };
const PROBE_N = 2001;
export const PROBE_BUDGET = 20000;                                              // evaluations per simulator (sampling uses 2001)
export const PROBE_NODE_BUDGET = 600000;                                        // …and expression-node evaluations (a large expression gets fewer)
/** The size of a compiled expression (every AST object counts) — the cost weight of one evaluation. */
export function expressionCost(ast: unknown): number {
  if (!ast || typeof ast !== "object") return 0;
  let n = 1;
  for (const v of Object.values(ast as Record<string, unknown>)) n += Array.isArray(v) ? v.reduce<number>((t, w) => t + expressionCost(w), 0) : expressionCost(v);
  return n;
}
// growth on one side of x: |f| strictly increasing as the probe closes in decade by decade (10⁻² … 10⁻¹²), the last decade not slowing
// below half the first, total > 1 — rational poles of any order and logarithmic poles alike; a cusp, a hole or a finite edge does not grow.
// The safe evaluator refuses huge values, so a strongly growing sequence (×10 at least) may end in "undefined" (overflow).
const POLE_STEPS = [1e-2, 1e-3, 1e-4, 1e-5, 1e-6, 1e-7, 1e-8, 1e-9, 1e-10, 1e-11, 1e-12];
function growsToward(g: (x: number) => number, x: number, side: 1 | -1): boolean {
  const v = POLE_STEPS.map(d => g(x + side * d));
  const k = v.findIndex(t => !Number.isFinite(t)), fin = k < 0 ? v : v.slice(0, k);
  if (fin.length < 2 || !fin.every((t, i) => i === 0 || t > fin[i - 1])) return false;
  if (k >= 0) return v.slice(k).every(t => !Number.isFinite(t)) && fin[fin.length - 1] > 10 * Math.max(1, fin[0]);
  const last = v.length - 1;
  return v[last] - v[0] > 1 && v[last] - v[last - 1] >= 0.5 * (v[1] - v[0]);
}
const absOf = (at: Probe) => (x: number) => { const v = at(x); return v === null || !Number.isFinite(v) ? Infinity : Math.abs(v); };
/** A vertical asymptote at x (either side grows) — shared by the completeness probe and the key's soundness check. */
export const isPoleAt = (at: Probe, x: number): boolean => growsToward(absOf(at), x, 1) || growsToward(absOf(at), x, -1);
/** A horizontal limit matches a key value within 0.02, or within 0.1 % of its size (large limits converge slowly). */
export const limitTolerance = (l: number) => Math.max(0.02, 1e-3 * Math.abs(l));
// sample points avoid round numbers (periodic round / floor expressions would alias there); a tier is used only when it can be evaluated
// (the safe evaluator refuses huge values: exp(−x) at −10⁵), falling back to smaller magnitudes — never when the values merely do not settle
const LIMIT_TIERS = [[1e5, 3e5, 1e6], [1e3, 3e3, 1e4], [10, 20, 30]].map(t => t.map(x => x * 1.0137));
/** Horizontal limits at +∞ / −∞: the values must settle (within 1 %) and the first-order extrapolation L ≈ (x₂f₂ − x₁f₁)/(x₂ − x₁) of both
 *  pairs must agree — slowly converging rational limits are estimated exactly, oscillations and logs are not limits. */
export function functionLimits(at: Probe): number[] {
  const out: number[] = [];
  for (const sgn of [1, -1]) {
    for (const tier of LIMIT_TIERS) {
      const X = tier.map(x => sgn * x), F = X.map(x => { const v = at(x); return v !== null && Number.isFinite(v) ? v : null; });
      if (F.some(v => v === null)) continue;
      const [f1, f2, f3] = F as number[], [x1, x2, x3] = X;
      if (Math.abs(f3 - f1) <= 1e-2 * Math.max(1, Math.abs(f3))) {
        const L1 = (x3 * f3 - x1 * f1) / (x3 - x1), L2 = (x3 * f3 - x2 * f2) / (x3 - x2);
        if (Math.abs(L1 - L2) <= limitTolerance(L1) / 2 && !out.some(l => Math.abs(l - L1) <= limitTolerance(l))) out.push(L1);
      }
      break;
    }
  }
  return out;
}
const KEY_CAP = 10;                                                             // the longest key list a function-study spec may hold
const ALL_NEEDS: FeatureNeeds = { roots: true, points: true, poles: true, extrema: true, limits: true, slope: true };
class ProbeStop extends Error { why: Exclude<FunctionFeatures["overflow"], null>; constructor(why: Exclude<FunctionFeatures["overflow"], null>) { super(why); this.why = why; } }
export function probeFunctionFeatures(rawAt: Probe, xMin: number, xMax: number, scale: number, need: FeatureNeeds = ALL_NEEDS, ast?: unknown): FunctionFeatures {
  void scale;
  const budget = Math.min(PROBE_BUDGET, Math.floor(PROBE_NODE_BUDGET / Math.max(1, ast === undefined ? 1 : expressionCost(ast))));
  let evaluations = 0;
  const at: Probe = x => { if (++evaluations > budget) throw new ProbeStop("budget"); const v = rawAt(x); return v !== null && Number.isFinite(v) ? v : null; };
  const g = (x: number) => { const v = at(x); return v === null ? Infinity : Math.abs(v); };
  const ternary = (lo: number, hi: number, f: (x: number) => number, max: boolean) => {
    for (let k = 0; k < 80; k++) { const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3; if (max ? f(a) < f(b) : f(a) > f(b)) lo = a; else hi = b; }
    return (lo + hi) / 2;
  };
  const roots: number[] = [], points: number[] = [], poles: number[] = [], extrema: { kind: "min" | "max"; x: number }[] = [], limits: number[] = [], slope: { x: number; dir: 1 | -1 }[] = [];
  const add = (list: number[], x: number, why: "roots" | "points" | "poles") => { if (list.some(v => Math.abs(v - x) < 1e-3)) return; list.push(x); if (list.length > KEY_CAP && need[why]) throw new ProbeStop(why); };
  const grows = (x: number, side: 1 | -1) => growsToward(g, x, side);
  const isPole = (x: number) => grows(x, 1) || grows(x, -1);
  try {
    const step = (xMax - xMin) / (PROBE_N - 1);
    const xs: number[] = [], ys: (number | null)[] = [];
    for (let i = 0; i < PROBE_N; i++) { const x = i === PROBE_N - 1 ? xMax : xMin + i * step; xs.push(x); ys.push(at(x)); }
    const singular = need.points || need.poles || need.extrema || need.slope;     // extrema / slopes skip the neighbourhood of poles
    for (let i = 0; i < PROBE_N; i++) {
      const y = ys[i];
      if (y === null) {
        let j = i; while (j + 1 < PROBE_N && ys[j + 1] === null) j++;
        if (singular) {
          if (j - i <= 1 && i > 0 && j < PROBE_N - 1) { const x = (xs[i] + xs[j]) / 2; add(points, x, "points"); if (isPole(x)) add(poles, x, "poles"); }
          else for (const [edge, inside] of [[i, i - 1], [j, j + 1]] as const) {                              // the edge of a domain gap
            if (inside < 0 || inside >= PROBE_N) continue;
            let lo = xs[inside], hi = xs[edge];
            for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (at(m) === null) hi = m; else lo = m; }
            if (grows(hi, inside < edge ? -1 : 1)) add(poles, hi, "poles");
          }
        }
        i = j; continue;
      }
      if (y === 0) { if (need.roots) add(roots, xs[i], "roots"); continue; }
      const n = i + 1 < PROBE_N ? ys[i + 1] : null;
      if ((need.roots || singular) && n !== null && n !== 0 && Math.sign(n) !== Math.sign(y)) {             // sign change: root or pole
        let a = xs[i], b = xs[i + 1], fa = y, fb = n, undefinedAt: number | null = null;
        for (let k = 0; k < 80; k++) { const m = (a + b) / 2, fm = at(m); if (fm === null) { undefinedAt = m; break; } if (fm === 0) { a = b = m; fa = fb = 0; break; } if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else { b = m; fb = fm; } }
        const x = undefinedAt ?? (a + b) / 2;
        if (undefinedAt !== null || Math.min(Math.abs(fa), Math.abs(fb)) > 1e-6) { if (singular && isPole(x)) { add(poles, x, "poles"); add(points, x, "points"); } }
        else if (need.roots) add(roots, x, "roots");
      }
      const p = i > 0 ? ys[i - 1] : null;
      if (p === null || n === null || Math.sign(p) !== Math.sign(y) || Math.sign(n) !== Math.sign(y)) continue;
      // touching root: a strict local minimum of |f| (a flat stretch is not one — it would start a search at every sample)
      if (need.roots && Math.abs(y) <= Math.abs(p) && Math.abs(y) <= Math.abs(n) && (Math.abs(y) < Math.abs(p) || Math.abs(y) < Math.abs(n))) {
        const x = ternary(xs[i - 1], xs[i + 1], g, false);
        if (g(x) < 1e-9) add(roots, x, "roots");
      }
      if (singular && Math.abs(y) > Math.abs(p) && Math.abs(y) >= Math.abs(n)) {
        const x = ternary(xs[i - 1], xs[i + 1], g, true);                                                      // even pole between samples
        if (isPole(x)) { add(poles, x, "poles"); add(points, x, "points"); }
      }
    }
    const nearSingular = (x: number, d: number) => poles.some(v => Math.abs(v - x) < d) || points.some(v => Math.abs(v - x) < d);
    if (need.extrema || need.slope) for (let i = 1; i < PROBE_N - 1; i++) {
      const p = ys[i - 1], y = ys[i], n = ys[i + 1];
      if (p === null || y === null || n === null || nearSingular(xs[i], 3 * step)) continue;
      const eps = 1e-12 * Math.max(1, Math.abs(y));
      const kind = y - p > eps && y - n >= -eps && y >= n ? "max" : p - y > eps && n - y >= -eps && y <= n ? "min" : null;
      if (!kind) continue;
      const fx = (x: number) => { const v = at(x); return v === null ? (kind === "max" ? -Infinity : Infinity) : v; };
      const x = ternary(xs[i - 1], xs[i + 1], fx, kind === "max");
      const v = fx(x), side = Math.min(Math.abs(v - fx(x - step)), Math.abs(v - fx(x + step)));
      if (side > 1e-10 * Math.max(1, Math.abs(v)) && !extrema.some(e => Math.abs(e.x - x) < 1e-3)) { extrema.push({ kind, x }); if (extrema.length > KEY_CAP && need.extrema) throw new ProbeStop("extrema"); }
    }
    if (need.limits) limits.push(...functionLimits(at));
    if (need.slope) for (let i = 0; i + 1 < PROBE_N; i++) {
      const y = ys[i], n = ys[i + 1], x = (xs[i] + xs[i + 1]) / 2;
      if (y === null || n === null || nearSingular(x, 3 * step) || extrema.some(e => Math.abs(e.x - x) < 3 * step)) continue;
      const d = n - y;
      if (Math.abs(d) > 1e-12 * Math.max(1, Math.abs(y))) slope.push({ x, dir: d > 0 ? 1 : -1 });
    }
    return { roots, points, poles, extrema, limits, slope, overflow: null };
  } catch (e) {
    if (e instanceof ProbeStop) return { roots, points, poles, extrema, limits, slope, overflow: e.why };
    throw e;
  }
}

function buildFunction(f: unknown, path: string): R<{ config: unknown; checks: SimCheck[] }> {
  const keys = ["source", "xMin", "xMax", "yMin", "yMax", "tasks", "domainExclusions", "xIntercepts", "yIntercept", "verticalAsymptotes", "horizontalAsymptotes", "extrema", "intervals"] as const;
  if (!hasExactKeys(f, keys) || !isStr(f.source, 400, 1) || ![f.xMin, f.xMax, f.yMin, f.yMax].every(v => isNum(v, -1e9, 1e9))) return fail("AI_SIM_SPEC_MALFORMED", "مواصفة دراسة الدالة غير صالحة.", path);
  if (!isArr(f.tasks, FUNCTION_STUDY_TASKS.length) || !f.tasks.length || !f.tasks.every(t => isEnum(t, FUNCTION_STUDY_TASKS)) || new Set(f.tasks).size !== f.tasks.length) return fail("AI_SIM_SPEC_MALFORMED", "مهام دراسة الدالة غير صالحة.", path);
  const nums = (v: unknown, max: number): v is number[] => isArr(v, max) && v.every(x => isNum(x, -1e6, 1e6));
  if (!nums(f.domainExclusions, 10) || !nums(f.xIntercepts, 10) || !nums(f.verticalAsymptotes, 10) || !nums(f.horizontalAsymptotes, 2) || !(f.yIntercept === null || isNum(f.yIntercept, -1e6, 1e6))) return fail("AI_SIM_SPEC_MALFORMED", "قيم مفتاح الدالة غير عددية.", path);
  if (!isArr(f.extrema, 10) || !f.extrema.every(e => hasExactKeys(e, ["kind", "x", "y"]) && (e.kind === "min" || e.kind === "max") && isNum(e.x, -1e6, 1e6) && isNum(e.y, -1e6, 1e6))) return fail("AI_SIM_SPEC_MALFORMED", "القيم القصوى غير صالحة.", path);
  if (!isArr(f.intervals, 12) || !f.intervals.every(e => hasExactKeys(e, ["kind", "from", "to"]) && isEnum(e.kind, INTERVAL_KINDS) && isStr(e.from, 20) && isStr(e.to, 20))) return fail("AI_SIM_SPEC_MALFORMED", "فترات التزايد والتناقص غير صالحة.", path);
  const tasks = Object.fromEntries(FUNCTION_STUDY_TASKS.map(t => [t, (f.tasks as string[]).includes(t)])) as Record<string, boolean>;
  const config = { v: 1, expression: { language: 2, variable: "x", source: f.source.trim() }, window: { xMin: f.xMin, xMax: f.xMax, yMin: f.yMin, yMax: f.yMax, sampleCount: 701 }, tasks };
  const vc = validateFunctionStudyConfig(config);
  if (!vc.ok) return { ok: false, issues: vc.issues.map(i => ({ code: "AI_SIM_CONFIG_INVALID", message: i.message, path })) };
  const c = compileFunction(config.expression.source);
  if (!c.ok) return fail("AI_SIM_CONFIG_INVALID", "تعبير الدالة غير صالح في لغة التعبيرات الآمنة.", path);
  const at = (x: number): number | null => { const r = evaluateFunctionAt(c.ast, x); return r.ok ? r.value : null; };
  const near = (a: number | null, b: number, tol = 0.01) => a !== null && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
  const issues: ComposerIssue[] = [];
  const bad = (m: string) => issues.push({ code: "AI_FUNCTION_KEY_INCONSISTENT", message: "مفتاح دراسة الدالة لا يطابق التعبير: " + m, path });
  const ex = f.domainExclusions as number[], xi = f.xIntercepts as number[], va = f.verticalAsymptotes as number[], ha = f.horizontalAsymptotes as number[];
  const ext = f.extrema as { kind: "min" | "max"; x: number; y: number }[];
  if (tasks.domainExclusions) for (const x of ex) if (at(x) !== null) bad("الدالة معرّفة عند x = " + x + ".");
  // the same growth test as the completeness probe: |f| must keep growing toward x on at least one side (rational or logarithmic)
  if (tasks.verticalAsymptotes) for (const x of va) if (at(x) !== null || !isPoleAt(at, x)) bad("لا يوجد خط تقارب رأسي عند x = " + x + ".");
  if (tasks.xIntercepts) for (const x of xi) if (!near(at(x), 0)) bad("f(" + x + ") ≠ 0.");
  if (tasks.yIntercept) { if (f.yIntercept === null) bad("المقطع الصادي مفقود."); else if (!near(at(0), f.yIntercept as number)) bad("f(0) ≠ " + f.yIntercept + "."); }
  const keyLimits = tasks.horizontalAsymptotes ? functionLimits(at) : [];      // the same extrapolated limits as the completeness probe
  if (tasks.horizontalAsymptotes) for (const y of ha) if (!keyLimits.some(l => Math.abs(l - y) <= limitTolerance(l)) && !near(at(1e4), y, 0.02) && !near(at(-1e4), y, 0.02)) bad("لا يقترب منحنى الدالة من y = " + y + ".");
  if (tasks.extrema) for (const e of ext) {
    const y = at(e.x), l = at(e.x - 1e-3), r = at(e.x + 1e-3);
    if (!near(y, e.y) || l === null || r === null || (e.kind === "min" ? !(l >= (y as number) - 1e-9 && r >= (y as number) - 1e-9) : !(l <= (y as number) + 1e-9 && r <= (y as number) + 1e-9))) bad("النقطة (" + e.x + ", " + e.y + ") ليست " + (e.kind === "min" ? "قيمة صغرى" : "قيمة عظمى") + " محلية.");
  }
  const intervals: { kind: string; from: number | "-inf" | "+inf"; to: number | "-inf" | "+inf" }[] = [];
  if (tasks.monotonicIntervals) for (const iv of f.intervals as { kind: string; from: string; to: string }[]) {
    const a = parseBound(iv.from), b = parseBound(iv.to);
    if (a === null || b === null || a === "+inf" || b === "-inf") { bad("حدود فترة غير صالحة."); continue; }
    intervals.push({ kind: iv.kind, from: a, to: b });
    const lo = a === "-inf" ? (typeof b === "number" ? b - 10 : -10) : a, hi = b === "+inf" ? (typeof a === "number" ? a + 10 : 10) : b;
    if (!(lo < hi)) { bad("فترة فارغة."); continue; }
    const m = (lo + hi) / 2, y1 = at(m - 1e-4), y2 = at(m + 1e-4);
    if (y1 === null || y2 === null || (iv.kind === "increasing" ? !(y2 > y1) : !(y2 < y1))) bad("الدالة ليست " + (iv.kind === "increasing" ? "متزايدة" : "متناقصة") + " على (" + iv.from + ", " + iv.to + ").");
  }
  // window + completeness (Review Fix 1): every key point must be findable inside the window, and every feature the probe finds there
  // must be in the key — the grader compares sets, so an incomplete key would fail the students who answer correctly.
  const xMin = f.xMin as number, xMax = f.xMax as number;
  const inWin = (x: number) => x >= xMin - 1e-9 && x <= xMax + 1e-9;
  const outside = [...(tasks.domainExclusions ? ex : []), ...(tasks.xIntercepts ? xi : []), ...(tasks.verticalAsymptotes ? va : []), ...(tasks.extrema ? ext.map(e => e.x) : [])].filter(x => !inWin(x));
  if (outside.length) issues.push({ code: "AI_FUNCTION_KEY_OUTSIDE_WINDOW", message: "نقاط في المفتاح خارج نافذة الرسم فلا يستطيع الطالب تحديدها: " + outside.join("، ") + ".", path });
  if (!issues.length) {
    const need: FeatureNeeds = { roots: tasks.xIntercepts, points: tasks.domainExclusions, poles: tasks.verticalAsymptotes, extrema: tasks.extrema, limits: tasks.horizontalAsymptotes, slope: tasks.monotonicIntervals };
    const ft: FunctionFeatures = Object.values(need).some(Boolean) ? probeFunctionFeatures(at, xMin, xMax, Math.max(1, Math.abs(f.yMin as number), Math.abs(f.yMax as number)), need, c.ast)
      : { roots: [], points: [], poles: [], extrema: [], limits: [], slope: [], overflow: null };
    if (ft.overflow === "budget") return fail("AI_FUNCTION_TOO_COMPLEX", "الدالة أعقد من أن تُفحص آليًا داخل النافذة (تذبذب أو نقاط كثيرة)؛ اختر دالة أبسط أو نافذة أضيق.", path);
    if (ft.overflow) return fail("AI_FUNCTION_KEY_INCOMPLETE", "للدالة داخل النافذة نقاط أكثر مما يتسع له المفتاح؛ اختر نافذة أضيق أو دالة أبسط.", path);
    const K = 0.02;
    const missing = (label: string, found: number[], key: number[], tol: (x: number) => number = () => K) => { const miss = found.filter(x => !key.some(k => Math.abs(k - x) <= tol(x))); if (miss.length) issues.push({ code: "AI_FUNCTION_KEY_INCOMPLETE", message: "مفتاح دراسة الدالة ناقص (" + label + "): " + miss.map(x => String(Number(x.toFixed(4)))).join("، ") + ".", path }); };
    if (tasks.xIntercepts) missing("المقاطع السينية", ft.roots, xi);
    if (tasks.domainExclusions) missing("استثناءات المجال", ft.points, ex);
    if (tasks.verticalAsymptotes) missing("خطوط التقارب الرأسية", ft.poles, va);
    if (tasks.horizontalAsymptotes) missing("خطوط التقارب الأفقية", ft.limits, ha, limitTolerance);
    if (tasks.extrema) { const miss = ft.extrema.filter(e => !ext.some(k => k.kind === e.kind && Math.abs(k.x - e.x) <= K)); if (miss.length) issues.push({ code: "AI_FUNCTION_KEY_INCOMPLETE", message: "مفتاح دراسة الدالة ناقص (القيم القصوى): " + miss.map(e => (e.kind === "min" ? "صغرى" : "عظمى") + " عند x = " + Number(e.x.toFixed(4))).join("، ") + ".", path }); }
    if (tasks.monotonicIntervals && intervals.length === (f.intervals as unknown[]).length) {
      const covers = (x: number, dir: 1 | -1) => intervals.some(iv => iv.kind === (dir > 0 ? "increasing" : "decreasing") && (iv.from === "-inf" || (typeof iv.from === "number" && iv.from < x)) && (iv.to === "+inf" || (typeof iv.to === "number" && x < iv.to)));
      const miss = ft.slope.find(s => !covers(s.x, s.dir));
      if (miss) issues.push({ code: "AI_FUNCTION_KEY_INCOMPLETE", message: "مفتاح دراسة الدالة ناقص (فترات التزايد والتناقص): الدالة " + (miss.dir > 0 ? "متزايدة" : "متناقصة") + " قرب x = " + Number(miss.x.toFixed(3)) + " ولا تغطيها أي فترة.", path });
    }
  }
  if (issues.length) return { ok: false, issues };
  const checks: SimCheck[] = [];
  const T = 0.01;
  if (tasks.domainExclusions) checks.push({ id: "domain", label: "استثناءات المجال", weight: 2, kind: "domain.exclusions", expected: ex, tolerance: T });
  if (tasks.xIntercepts) checks.push({ id: "x-intercepts", label: "المقاطع السينية", weight: 1, kind: "intercepts.x", expected: xi.map(x => ({ x, y: 0 })), tolerance: T });
  if (tasks.yIntercept) checks.push({ id: "y-intercept", label: "المقطع الصادي", weight: 1, kind: "intercept.y", expected: f.yIntercept, tolerance: T });
  if (tasks.verticalAsymptotes) checks.push({ id: "vertical-asymptotes", label: "خطوط التقارب الرأسية", weight: 2, kind: "asymptotes.vertical", expected: va, tolerance: T });
  if (tasks.horizontalAsymptotes) checks.push({ id: "horizontal-asymptotes", label: "خطوط التقارب الأفقية", weight: 1, kind: "asymptotes.horizontal", expected: ha, tolerance: T });
  if (tasks.extrema) checks.push({ id: "extrema", label: "القيم القصوى المحلية", weight: 3, kind: "extrema.points", expected: ext.map(e => ({ kind: e.kind, x: e.x, y: e.y })), tolerance: T });
  if (tasks.monotonicIntervals) checks.push({ id: "monotonic", label: "فترات التزايد والتناقص", weight: 3, kind: "monotonic.intervals", tolerance: T, expected: intervals });
  return { ok: true, value: { config: vc.config, checks } };
}

/** Normalizes a SIM SPEC into a built simulator (envelope + full private check catalog) — production validators decide; no free credit. */
export function buildSimFromSpec(raw: unknown, path = "smartSim", expectPlugin?: ComposerSimPluginKey | null, expectScenario?: string | null): R<BuiltSim> {
  if (!hasExactKeys(raw, SPEC_KEYS) || !isEnum(raw.plugin, COMPOSER_SIM_PLUGIN_KEYS) || !isStr(raw.title, L.titleChars) || !isStr(raw.instructions, L.goalChars * 4)) return fail("AI_SIM_SPEC_MALFORMED", "مواصفة المحاكاة غير صالحة البنية.", path);
  const plugin = raw.plugin as ComposerSimPluginKey;
  if (expectPlugin && plugin !== expectPlugin) return fail("AI_SIM_PLUGIN_MISMATCH", "المحاكي المستخدم لا يطابق الخطة.", path);
  const others = { networkTopology: ["physics", "function"], physicsFreeFall: ["network", "function"], functionStudy2d: ["network", "physics"] }[plugin];
  if (others.some(k => raw[k] !== null)) return fail("AI_SIM_SPEC_MALFORMED", "مواصفة المحاكاة تحتوي إعدادات محاكٍ آخر.", path);
  let config: unknown, checks: SimCheck[];
  if (plugin === "networkTopology") {
    const n = raw.network;
    if (!hasExactKeys(n, ["scenario"]) || !isEnum(n.scenario, COMPOSER_NET_SCENARIOS)) return fail("AI_SIM_SPEC_MALFORMED", "سيناريو الشبكة غير معروف.", path);
    if (expectScenario && n.scenario !== expectScenario) return fail("AI_SIM_PLUGIN_MISMATCH", "سيناريو الشبكة لا يطابق الخطة.", path);
    const t = net2TemplateById(n.scenario)!;
    config = t.config(); checks = t.checks() as SimCheck[];
  } else if (plugin === "physicsFreeFall") {
    const b = buildPhysics(raw.physics, path); if (!b.ok) return b; config = b.value.config; checks = b.value.checks;
  } else {
    const b = buildFunction(raw.function, path); if (!b.ok) return b; config = b.value.config; checks = b.value.checks;
  }
  const envelope: SimEnvelope = { schemaVersion: 1, pluginKey: plugin, pluginVersion: composerSimVersion(plugin)!, config };
  const env = validateSmartSimEnvelope(envelope);
  if (!env.ok) return { ok: false, issues: env.issues.map(i => ({ code: "AI_SIM_CONFIG_INVALID", message: i.message, path })) };
  const key = validateSmartSimAnswerKey({ scoring: "proportional", checks }, env.plugin, env.envelope.config);
  if (!key.ok) return { ok: false, issues: key.issues.map(i => ({ code: "AI_SIM_CHECKS_INVALID", message: i.message, path })) };
  return { ok: true, value: { plugin, title: cleanText(raw.title), instructions: cleanText(raw.instructions), envelope, checks } };
}

/** NO FREE CREDIT: the key evaluated on an EMPTY action stream (the untouched initial state) must award nothing. */
export function simFreeCreditIssues(envelope: SimEnvelope, checks: SimCheck[], path: string): ComposerIssue[] {
  const e = evaluateSmartSim({ envelope, answerKey: { scoring: "proportional", checks }, response: { kind: "smartSim", pluginKey: envelope.pluginKey, pluginVersion: envelope.pluginVersion, actions: [], state: {} }, maxMarks: 1 });
  if (!e.valid) return [{ code: "AI_SIM_CHECKS_INVALID", message: "مفتاح المحاكاة غير صالح.", path }];
  return e.passedWeight > 0 ? [{ code: "AI_SIM_FREE_CREDIT", message: "فحوص المحاكاة تمنح علامات قبل أي عمل من الطالب (الحالة الابتدائية تحقق بعضها).", path }] : [];
}
