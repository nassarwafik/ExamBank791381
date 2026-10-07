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
import type { ExprNode } from "../parametricEngine";
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
/** COMPLETENESS probe (Review Fixes 1–6): what a student can find inside the window, located by code on a fixed grid (sign changes refined
 *  by bisection; touching roots — strict local minima of |f| — even poles and extrema by ternary search; limits by `functionLimits`). The
 *  grader compares SETS, so a key that omits a root, a pole, an extremum, a limit or a monotonic stretch would fail correct students: such
 *  a key is refused — and so is a key value the probe does not find within KEY_TOL. POLES are recognized by GROWTH, never by an absolute
 *  height (`poleKindAt`, fail-closed): rational and logarithmic poles at any window height; a hole, a cusp or a finite edge does not grow;
 *  what cannot be decided (overflow at 10⁻², growth too slow, a wide overflow run) refuses the key.
 *  BOUNDED: only the features of the enabled tasks are located; evaluations are capped (PROBE_BUDGET) and so is their weighted cost
 *  (PROBE_NODE_BUDGET, calls and powers weigh 10); a feature list longer than a key can hold stops the probe — an exhausted budget is a
 *  refusal (`overflow`), never a silent pass. A probe, not a proof: features finer than the grid are left to the teacher's review. */
type Probe = (x: number) => number | null;
export type FunctionFeatures = { roots: number[]; points: number[]; poles: number[]; extrema: { kind: "min" | "max"; x: number }[]; limits: number[]; slope: { x: number; dir: 1 | -1 }[]; edges: number[]; overflow: null | "budget" | "uncertain" | "roots" | "points" | "poles" | "extrema" };
export type FeatureNeeds = { roots: boolean; points: boolean; poles: boolean; extrema: boolean; limits: boolean; slope: boolean };
const PROBE_N = 2001;
export const PROBE_BUDGET = 20000;                                              // evaluations per simulator (sampling uses 2001)
export const PROBE_NODE_BUDGET = 600000;                                        // …and expression-node evaluations (a large expression gets fewer)
/** The cost weight of one evaluation of a compiled expression: 1 per arithmetic node, 10 per function call or power (exp / log / pow /
 *  round normalise with toPrecision and cost ~10× an addition), so nested call chains get proportionally fewer evaluations. */
const COSTLY_NODE = 10;
export function expressionCost(ast: unknown): number {
  if (!ast || typeof ast !== "object") return 0;
  const n = ast as Record<string, unknown>;
  let total = n.t === "call" || (n.t === "bin" && n.op === "^") ? COSTLY_NODE : 1;
  for (const k of ["a", "b"]) total += expressionCost(n[k]);
  if (Array.isArray(n.args)) for (const a of n.args) total += expressionCost(a);
  return total;
}
// Pole classification (Review Fixes 2–5), FAIL-CLOSED. A probe returns a number, `null` (undefined: domain, division by zero) or
// `Infinity` (the safe evaluator's range was exceeded — |f| is huge there). The |f| samples at x ± 10⁻² … 10⁻¹² on one side are:
//   "pole"      strictly increasing, the last decade not slowing below half the first, total > 1 (rational and logarithmic poles); or
//               strictly increasing until the evaluator overflows, with strong growth (≥ ×10, or one sample ≥ 10⁶ at 10⁻²);
//   "bounded"   undefined on that side (a domain edge), not increasing toward x (a hole, a jump, an edge), or increasing with steps that
//               vanish geometrically (ratio ≤ 0.85 — a cusp such as |x|^0.1 reaches a finite value);
//   "uncertain" anything else — overflow already at 10⁻² (x may be the edge of an overflow run, not the pole), growth too slow to confirm
//               or exclude (√|log|x||) — the callers REFUSE rather than guess (a refused key is a teacher task; a wrong key fails students).
const POLE_STEPS = [1e-2, 1e-3, 1e-4, 1e-5, 1e-6, 1e-7, 1e-8, 1e-9, 1e-10, 1e-11, 1e-12];
export type PoleKind = "pole" | "bounded" | "uncertain";
function sideKind(at: Probe, x: number, side: 1 | -1): PoleKind {
  const raw = POLE_STEPS.map(d => at(x + side * d));
  const k = raw.findIndex(v => v === null || !Number.isFinite(v));
  const fin = (k < 0 ? raw : raw.slice(0, k)).map(v => Math.abs(v as number));
  const increasing = fin.every((t, i) => i === 0 || t > fin[i - 1]);
  if (k === 0) return raw[0] === null ? "bounded" : "uncertain";
  if (k > 0) {
    const rest = raw.slice(k);
    if (rest.every(v => v !== null && !Number.isFinite(v)) && increasing && (fin.length >= 2 ? fin[fin.length - 1] > 10 * Math.max(1, fin[0]) : fin[0] >= 1e6)) return "pole";
    if (!increasing) return "bounded";
    // increasing toward an undefined point (a tiny domain gap): bounded only when the steps vanish geometrically
    const inc = fin.slice(1).map((t, i) => t - fin[i]);
    return rest.every(v => v === null) && inc.length >= 2 && inc.slice(1).every((t, i) => t <= 0.85 * inc[i]) ? "bounded" : "uncertain";
  }
  if (!increasing) return "bounded";
  const last = fin.length - 1;
  if (fin[last] - fin[0] > 1 && fin[last] - fin[last - 1] >= 0.5 * (fin[1] - fin[0])) return "pole";
  const inc = fin.slice(1).map((t, i) => t - fin[i]);
  return inc.slice(1).every((t, i) => t <= 0.85 * inc[i]) ? "bounded" : "uncertain";
}
/** Both sides of x: any "uncertain" side ⇒ uncertain; else any "pole" side ⇒ pole; else bounded. Shared by the probe and the key check. */
export function poleKindAt(at: Probe, x: number): PoleKind {
  const a = sideKind(at, x, 1), b = sideKind(at, x, -1);
  return a === "uncertain" || b === "uncertain" ? "uncertain" : a === "pole" || b === "pole" ? "pole" : "bounded";
}
/** A key value must lie within HALF the grading tolerance (0.01) of the probed truth (Review Fix 6): the grader compares a student's
 *  answer with the key, so a key off by more would fail a student who answers correctly to the stated precision. */
export const KEY_TOL = 0.005;
// Limits at ±∞ (Review Fixes 4–5), FAIL-CLOSED: at the LARGEST magnitude t where f(t), f(t/2), f(t/4), f(t/8), f(t/16) can all be
// evaluated (searched downward by halving from 10⁶ — the safe evaluator refuses huge values, so a logistic curve is read near x = ∓60):
//   flat (all steps ≤ 10⁻¹⁰·|f|, the evaluator's rounding)                        → the limit f(t);
//   steps small (≤ 1 % of |f|) and shrinking geometrically (ratios in [0, 0.8])   → a limit: f(t) plus the geometric tail;
//   steps of one sign that do not shrink (ratios ≥ 0.999: polynomial, exp, log, x^0.01) → no limit (diverges);
//   anything else — noise, a non-monotone approach, steps shrinking too slowly to tell (ratios in (0.8, 0.999): x^-0.15, 1/log x,
//   Review Fix 6), or f defined at moderate |x| but at no evaluable magnitude → UNCERTAIN (refused).
// Sample points are scaled off round numbers so periodic expressions cannot alias.
const LIMIT_ALIAS = 1.0137291379;
const LIMIT_TOPS = Array.from({ length: 19 }, (_, i) => 1e6 / 2 ** i);       // 10⁶ … ≈ 3.8
type LimitKind = { kind: "limit"; L: number } | { kind: "none" } | { kind: "uncertain" };
function limitAt(at: Probe, sgn: 1 | -1): LimitKind {
  const val = (x: number) => { const v = at(x); return v !== null && Number.isFinite(v) ? v : null; };
  for (const top of LIMIT_TOPS) {
    const F = [0, 1, 2, 3, 4].map(k => val(sgn * LIMIT_ALIAS * top / 2 ** k));
    if (F.some(v => v === null)) continue;
    const f = F as number[], d = [0, 1, 2, 3].map(k => f[k] - f[k + 1]), scale = Math.max(1, Math.abs(f[0]));
    if (d.every(x => Math.abs(x) <= 1e-10 * scale)) return { kind: "limit", L: f[0] };
    const r = [d[0] / d[1], d[1] / d[2]];
    if (Math.abs(d[0]) <= 1e-2 * scale && r.every(x => Number.isFinite(x) && x >= 0 && x <= 0.8)) return { kind: "limit", L: f[0] + d[0] * r[0] / (1 - r[0]) };
    if (d.every(x => Math.sign(x) === Math.sign(d[0]) && x !== 0) && r.every(x => Number.isFinite(x) && x >= 0.999)) return { kind: "none" };
    return { kind: "uncertain" };
  }
  return [1, 2, 3].some(m => at(sgn * m) !== null) ? { kind: "uncertain" } : { kind: "none" };
}
/** Horizontal limits at +∞ / −∞ (shared by the completeness probe and the key's soundness check); `uncertain` when a side is undecided. */
export function functionLimits(at: Probe): { limits: number[]; uncertain: boolean } {
  const limits: number[] = [];
  let uncertain = false;
  for (const sgn of [1, -1] as const) {
    const r = limitAt(at, sgn);
    if (r.kind === "uncertain") uncertain = true;
    else if (r.kind === "limit" && !limits.some(l => Math.abs(l - r.L) <= KEY_TOL)) limits.push(r.L);
  }
  return { limits, uncertain };
}
const KEY_CAP = 10;                                                             // the longest key list a function-study spec may hold
const ALL_NEEDS: FeatureNeeds = { roots: true, points: true, poles: true, extrema: true, limits: true, slope: true };
class ProbeStop extends Error { why: Exclude<FunctionFeatures["overflow"], null>; constructor(why: Exclude<FunctionFeatures["overflow"], null>) { super(why); this.why = why; } }
/** OUTSIDE THE WINDOW (Review Fix 7): the student studies the WHOLE function ("الرسم للاستكشاف فقط"), so the window must contain every
 *  feature the tasks ask for. Each side beyond the window is scanned on a geometric grid, 10⁻³ … 10⁶ past the edge (≈ 2.6 % apart):
 *  - a sign change (a root or a pole), an exact zero, a change between defined and undefined, or a local minimum of |f| that reaches 0
 *    (a touching root), when roots, poles, domain points or monotonic stretches are asked for;
 *  - a change of slope beyond the evaluator's rounding, when extrema or monotonic stretches are asked for.
 *  The first such x is returned (the key is refused: "widen the window"). Bounded like the probe; a probe, not a proof — two features
 *  closer than the grid's spacing far from the window can hide each other. */
const OUTER_N = 800;
// GUARDS (Review Fix 8): where the EXPRESSION excludes x, whatever the grid — a zero of a denominator, of a log argument, or of a power's
// base under a negative exponent (a removable hole at 1 in (x−1)/(x²−1) is found though no sample lands on it). Each guarded
// sub-expression is sampled and its sign changes, exact zeros and touching zeros are refined. These zeros are also the OPEN domain edges
// (log x at 0); a zero of a sqrt argument is a CLOSED edge (√0 = 0), so x·√(1.21−x²) has roots at ±1.1.
type Guard = { kind: "div" | "log" | "pow" | "sqrt"; node: ExprNode; exp?: ExprNode };
const hasVar = (n: unknown): boolean => { if (!n || typeof n !== "object") return false; const o = n as Record<string, unknown>; return o.t === "var" || hasVar(o.a) || hasVar(o.b) || (Array.isArray(o.args) && o.args.some(hasVar)); };
function collectGuards(ast: unknown, out: Guard[] = [], seen = new Set<string>()): Guard[] {
  if (!ast || typeof ast !== "object") return out;
  const n = ast as Record<string, unknown>, args = Array.isArray(n.args) ? (n.args as ExprNode[]) : [];
  const push = (g: Guard) => { const k = g.kind + JSON.stringify(g.node); if (hasVar(g.node) && !seen.has(k)) { seen.add(k); out.push(g); } };
  if (n.t === "bin" && (n.op === "/" || n.op === "%")) push({ kind: "div", node: n.b as ExprNode });
  if (n.t === "bin" && n.op === "^") push({ kind: "pow", node: n.a as ExprNode, exp: n.b as ExprNode });
  if (n.t === "call" && (n.fn === "log" || n.fn === "log10") && args[0]) push({ kind: "log", node: args[0] });
  if (n.t === "call" && n.fn === "pow" && args[0]) push({ kind: "pow", node: args[0], exp: args[1] });
  if (n.t === "call" && n.fn === "sqrt" && args[0]) push({ kind: "sqrt", node: args[0] });
  for (const k of ["a", "b"]) collectGuards(n[k], out, seen);
  for (const a of args) collectGuards(a, out, seen);
  return out;
}
function zerosOf(g: (x: number) => number | null, xs: number[]): number[] {
  const z: number[] = [], put = (x: number) => { const v = Number(x.toPrecision(12)); if (!z.some(t => Math.abs(t - v) <= 1e-9 * Math.max(1, Math.abs(v)))) z.push(v); };
  // a zero at the EDGE of g's own domain (√(x + 2) at −2 — Review Fix 9): g is defined on one side only and vanishes there
  const edgeZero = (def: number, undef: number) => {
    let lo = def, hi = undef;
    for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (g(m) === null) hi = m; else lo = m; }
    const sn = Number(lo.toPrecision(12)), g0 = g(lo), far = g(lo + Math.sign(def - undef) * 1e-4 * Math.max(1, Math.abs(lo)));
    if (g(sn) === 0) put(sn);
    else if (g0 !== null && far !== null && (g0 === 0 || Math.abs(g0) <= 1e-3 * Math.abs(far))) put(lo);
  };
  let pp: { x: number; v: number } | null = null, p: { x: number; v: number } | null = null, undefAt: number | null = null;
  for (const x of xs) {
    const v = g(x);
    if (v === null) { if (p) edgeZero(p.x, x); pp = p = null; undefAt = x; continue; }
    if (undefAt !== null) { edgeZero(x, undefAt); undefAt = null; }
    if (v === 0) put(x);
    else if (p && p.v !== 0 && Math.sign(p.v) !== Math.sign(v)) {
      let a = p.x, b = x, fa = p.v;
      for (let k = 0; k < 60; k++) { const m = (a + b) / 2, fm = g(m); if (fm === null || fm === 0) { a = b = m; break; } if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else b = m; }
      put((a + b) / 2);
    } else if (pp && p && Math.abs(p.v) <= Math.abs(pp.v) && Math.abs(p.v) <= Math.abs(v) && (Math.abs(p.v) < Math.abs(pp.v) || Math.abs(p.v) < Math.abs(v)) && Math.sign(pp.v) === Math.sign(v)) {
      // touching zero — a local minimum of |g|, ties included (a zero exactly halfway between two samples leaves them equal — RF9)
      let a = pp.x, b = x;
      for (let k = 0; k < 60; k++) { const l = a + (b - a) / 3, r = b - (b - a) / 3, gl = g(l), gr = g(r); if (gl === null || gr === null) break; if (Math.abs(gl) > Math.abs(gr)) a = l; else b = r; }
      // a zero: exactly 0 at the point rounded to 12 digits, negligible at the minimum, or small and STEEP around it (√(10|x − a|) is
      // ≈ 10⁻⁶ there and 10⁻¹ just beside it — judged by the ratio, not an absolute level, RF9); a shallow minimum (x² + 10⁻⁷) is not one
      const m = (a + b) / 2, gm = g(m), sn = Number(m.toPrecision(12)), scale = Math.max(1, Math.abs(pp.v), Math.abs(v)), dm = 1e-4 * Math.max(1, Math.abs(m));
      const steep = (t: number) => { const u = g(t); return u !== null && Math.abs(u) >= 1e3 * Math.abs(gm as number); };
      if (g(sn) === 0) put(sn);
      else if (gm !== null && (Math.abs(gm) <= 1e-12 * scale || (Math.abs(gm) <= 1e-3 * scale && steep(m - dm) && steep(m + dm)))) put(m);
    }
    pp = p; p = { x, v };
  }
  return z;
}
const GUARD_MAX = 12;
type GuardInfo = { excluded: number[]; open: number[] };
/** The excluded zeros (also the open domain edges) of every guard, sampled on `xs`; null when the guards are too many or too costly. */
function guardInfo(ast: unknown, xs: number[]): GuardInfo | null {
  const gs = collectGuards(ast);
  if (gs.length > GUARD_MAX || gs.reduce((t, g) => t + expressionCost(g.node) + (g.exp ? expressionCost(g.exp) : 0), 0) * (xs.length + 400) > PROBE_NODE_BUDGET) return null;
  const val = (n: ExprNode, x: number) => { const r = evaluateFunctionAt(n, x); return r.ok ? r.value : null; };
  const excluded: number[] = [];
  for (const g of gs) {
    if (g.kind === "sqrt") continue;                                                // √0 = 0: a closed edge, never an exclusion
    for (const z of zerosOf(x => val(g.node, x), xs)) {
      if (g.kind === "pow") { const e = g.exp ? val(g.exp, z) : null; if (e !== null && e >= 0) continue; }   // 0^e excludes only for e < 0
      if (!excluded.some(t => Math.abs(t - z) <= 1e-9 * Math.max(1, Math.abs(z)))) excluded.push(z);
      if (excluded.length > 4 * KEY_CAP) return null;
    }
  }
  return { excluded, open: excluded };
}
/** A domain edge e (f defined on the `dir` side) is a ROOT when |f| shrinks steadily toward it (10⁻² … 10⁻⁸), is negligible at e, and
 *  the edge itself belongs to the domain: with the expression's guards (Review Fix 8) an edge is OPEN when it is a zero of a denominator
 *  or a log argument (x·log x at 0) and CLOSED otherwise (x·√(4−x²) at 2, x·√(1.21−x²) at 1.1); without them every edge is closed. */
function edgeIsRoot(at: (x: number) => number | null, e: number, dir: number, open?: number[]): boolean {
  const f0 = at(e); if (f0 === null) return false;
  if (f0 !== 0) {
    const v = [1e-2, 1e-4, 1e-6, 1e-8].map(d => at(e + dir * d));
    if (v.some(t => t === null)) return false;
    const a = v.map(t => Math.abs(t as number));
    if (!(a.every((t, k) => k === 0 || t < a[k - 1]) && a[3] <= 1e-2 * a[0] && Math.abs(f0) <= 1e-3 * a[3])) return false;
  }
  return !(open ?? []).some(z => Math.abs(z - e) <= 1e-6 * Math.max(1, Math.abs(e)));
}
export function featureOutsideWindow(rawAt: Probe, xMin: number, xMax: number, need: FeatureNeeds, ast?: unknown): number | null {
  const wantRoots = need.roots, wantBreaks = need.poles || need.points || need.slope, wantSlope = need.extrema || need.slope;
  if (!wantRoots && !wantBreaks && !wantSlope) return null;
  const n = Math.max(100, Math.min(OUTER_N, Math.floor(PROBE_NODE_BUDGET / 4 / Math.max(1, ast === undefined ? 1 : expressionCost(ast)))));
  const raw = (x: number) => rawAt(x), at = (x: number) => { const r = rawAt(x); return r !== null && Number.isFinite(r) ? r : null; };
  for (const [edge, dir] of [[xMax, 1], [xMin, -1]] as const) {
    let def: boolean | null = null, last: { x: number; v: number } | null = null, slope = 0, prevX = edge, zeroAt: number | null = null;
    let pp: { x: number; a: number } | null = null, p: { x: number; a: number } | null = null;                     // |f| history (touching roots)
    const xs = Array.from({ length: n }, (_, k) => edge + dir * 1e-3 * 1e9 ** (k / (n - 1)));                      // strictly beyond the window
    // the expression's own exclusions beyond the window (a removable hole, a pole) — Review Fix 8
    const gi = ast !== undefined && (wantRoots || wantBreaks) ? guardInfo(ast, [edge, ...xs]) : null;
    for (const z of gi ? gi.excluded : []) {
      if (dir * (z - edge) <= 0) continue;
      const d = 1e-7 * Math.max(1, Math.abs(z));
      if (raw(z - d) === null && raw(z + d) === null) continue;                     // f is not defined there at all (√x/(x² − 4) at −2, RF9)
      if (need.points || need.slope) return z;
      if (need.poles && poleKindAt(raw, z) !== "bounded") return z;
    }
    const e0 = at(edge); if (e0 !== null && e0 !== 0) last = { x: edge, v: e0 };     // the window's edge value: a root just past it is seen
    for (let k = 0; k < n; k++) {                                                   // (a pole ON the edge is inside the window)
      const x = xs[k], r = raw(x), d = r !== null, v = d && Number.isFinite(r) ? r : null;
      if (def !== null && d !== def) {                                              // defined ↔ undefined: a domain edge, a hole or a pole
        if (need.points || need.slope) return x;                                    // the domain changes: exclusions and monotony depend on it
        let lo = d ? x : prevX, hi = d ? prevX : x;                                 // lo defined, hi undefined
        for (let t = 0; t < 80; t++) { const m = (lo + hi) / 2; if (raw(m) === null) hi = m; else lo = m; }
        if (wantRoots && edgeIsRoot(at, lo, Math.sign(lo - hi), gi ? gi.open : undefined)) return lo;
      }
      def = d; prevX = x;
      if (v === null) { last = null; slope = 0; pp = p = null; zeroAt = null; continue; }
      // an exact zero is a root only if f leaves 0 again (a stretch of zeros is the evaluator's underflow: x·e^(−x) far out)
      if (v === 0) { if (zeroAt === null) zeroAt = x; continue; }
      if (zeroAt !== null) { if (wantRoots) return zeroAt; zeroAt = null; }
      if (last && v !== 0 && last.v !== 0 && Math.sign(v) !== Math.sign(last.v)) {   // a sign change: a root or a pole between the samples
        let a = last.x, b = x, fa = last.v, pole = false;
        for (let t = 0; t < 80; t++) { const m = (a + b) / 2, fm = at(m); if (fm === null) { pole = true; break; } if (fm === 0) { a = b = m; fa = 0; break; } if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else b = m; }
        const fb = at(b);
        const root = !pole && fb !== null && Math.min(Math.abs(fa), Math.abs(fb)) <= 1e-6 * Math.max(1, Math.abs(last.v), Math.abs(v));
        if (root ? wantRoots : wantBreaks) return (a + b) / 2;
      }
      if (last && wantSlope) {
        const dv = v - last.v;
        if (Math.abs(dv) > 1e-9 * Math.max(1, Math.abs(v), Math.abs(last.v))) { const sg = Math.sign(dv); if (slope !== 0 && sg !== slope) return x; slope = sg; }
      }
      if (wantRoots && pp && p && p.a < pp.a && p.a < Math.abs(v)) {                                             // a local minimum of |f|
        let lo = pp.x, hi = x;
        for (let t = 0; t < 60; t++) { const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3, fa = at(a), fb = at(b); if (fa === null || fb === null) break; if (Math.abs(fa) > Math.abs(fb)) lo = a; else hi = b; }
        const m = at((lo + hi) / 2);
        if (m !== null && Math.abs(m) <= 1e-9 * Math.max(1, pp.a, Math.abs(v))) return (lo + hi) / 2;
      }
      pp = p; p = { x, a: Math.abs(v) }; last = { x, v };
    }
  }
  return null;
}
export function probeFunctionFeatures(rawAt: Probe, xMin: number, xMax: number, scale: number, need: FeatureNeeds = ALL_NEEDS, ast?: unknown): FunctionFeatures {
  void scale;
  const budget = Math.min(PROBE_BUDGET, Math.floor(PROBE_NODE_BUDGET / Math.max(1, ast === undefined ? 1 : expressionCost(ast))));
  let evaluations = 0;
  const atRaw: Probe = x => { if (++evaluations > budget) throw new ProbeStop("budget"); return rawAt(x); };       // keeps Infinity (overflow)
  const at: Probe = x => { const v = atRaw(x); return v !== null && Number.isFinite(v) ? v : null; };
  const g = (x: number) => { const v = at(x); return v === null ? Infinity : Math.abs(v); };
  const ternary = (lo: number, hi: number, f: (x: number) => number, max: boolean) => {
    for (let k = 0; k < 80; k++) { const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3; if (max ? f(a) < f(b) : f(a) > f(b)) lo = a; else hi = b; }
    return (lo + hi) / 2;
  };
  const roots: number[] = [], points: number[] = [], poles: number[] = [], extrema: { kind: "min" | "max"; x: number }[] = [], limits: number[] = [], slope: { x: number; dir: 1 | -1 }[] = [], edges: number[] = [];
  const add = (list: number[], x: number, why: "roots" | "points" | "poles") => { if (list.some(v => Math.abs(v - x) < 1e-3)) return; list.push(x); if (list.length > KEY_CAP && need[why]) throw new ProbeStop(why); };
  // a candidate that lands on an OVERFLOW PLATEAU (|f| beyond the evaluator's range around a steep pole) is moved to the plateau's centre —
  // the pole — never left on its edge (lo / hi are finite points on either side)
  const finiteAt = (x: number) => { const v = atRaw(x); return v !== null && Number.isFinite(v); };
  const plateauCentre = (lo: number, x: number, hi: number) => {
    if (finiteAt(x)) return x;
    let a = lo, b = x, c = x, d = hi;
    for (let k = 0; k < 60; k++) { const m = (a + b) / 2; if (finiteAt(m)) a = m; else b = m; }
    for (let k = 0; k < 60; k++) { const m = (c + d) / 2; if (finiteAt(m)) d = m; else c = m; }
    return (b + c) / 2;
  };
  // a domain edge is a ROOT when f tends to 0 there (Review Fix 7): |f| shrinks steadily as the probe closes in from the defined side
  // (10⁻² … 10⁻⁸) and is negligible at the edge itself — an edge where f tends to a non-zero value or grows is not one
  let guardOpen: number[] | undefined;
  const edgeRoot = (e: number, dir: number) => edgeIsRoot(at, e, dir, guardOpen);
  // a candidate singular point: a pole is recorded, an uncertain one stops the probe (fail closed) when poles are asked for
  const isPole = (x: number) => { const k = poleKindAt(atRaw, x); if (k === "uncertain" && need.poles) throw new ProbeStop("uncertain"); return k === "pole"; };
  const flatCentre = (x: number, fx: (x: number) => number, step: number) => {
    const v = fx(x), tol = 4 * Number.EPSILON * Math.max(1, Math.abs(v)), same = (t: number) => Math.abs(fx(t) - v) <= tol;
    let w = step; while (w <= 16 * step && (same(x - w) || same(x + w))) w *= 2;
    if (w > 16 * step) return x;                                                  // a plateau, not an extremum: left to the side test
    let a = x - w, b = x, c = x, d = x + w;
    for (let k = 0; k < 50; k++) { const m = (a + b) / 2; if (same(m)) b = m; else a = m; }
    for (let k = 0; k < 50; k++) { const m = (c + d) / 2; if (same(m)) c = m; else d = m; }
    return (b + c) / 2;
  };
  try {
    const step = (xMax - xMin) / (PROBE_N - 1);
    const xs: number[] = [], ys: (number | null)[] = [];
    const overflowAt: boolean[] = [];
    for (let i = 0; i < PROBE_N; i++) { const x = i === PROBE_N - 1 ? xMax : xMin + i * step; const v = atRaw(x); xs.push(x); ys.push(v !== null && Number.isFinite(v) ? v : null); overflowAt.push(v !== null && !Number.isFinite(v)); }
    const singular = need.points || need.poles || need.extrema || need.slope;     // extrema / slopes skip the neighbourhood of poles
    if (ast !== undefined && (singular || need.roots)) {                          // the expression's own exclusions (Review Fix 8)
      const gi = guardInfo(ast, xs); if (gi === null) throw new ProbeStop("budget");
      guardOpen = gi.open;
      if (singular) for (const z of gi.excluded) {
        if (z < xMin - 1e-9 || z > xMax + 1e-9) continue;
        const d = 1e-7 * Math.max(1, Math.abs(z));
        if (atRaw(z - d) !== null && atRaw(z + d) !== null) { add(points, z, "points"); if (isPole(z)) add(poles, z, "poles"); }
      }
    }
    // a window end that is also a domain edge (√x on [0, 9]) may end a monotonic interval (Review Fix 8)
    if (singular) for (const [k, dir] of [[0, -1], [PROBE_N - 1, 1]] as const) if (ys[k] !== null && atRaw(xs[k] + dir * 1e-9 * Math.max(1, Math.abs(xs[k]))) === null && !edges.some(v => Math.abs(v - xs[k]) < 1e-3)) edges.push(xs[k]);
    for (let i = 0; i < PROBE_N; i++) {
      const y = ys[i];
      if (y === null) {
        let j = i; while (j + 1 < PROBE_N && ys[j + 1] === null) j++;
        // a run where the evaluator OVERFLOWS hides what is inside (a steep pole, its domain point, extrema): refuse, never guess — except
        // a NARROW run (≤ 2 samples, all overflow, finite on both sides; Review Fix 6): its plateau centre must then classify as a pole
        if (singular && overflowAt.slice(i, j + 1).some(Boolean)) {
          if (!(j - i <= 1 && i > 0 && j < PROBE_N - 1 && overflowAt.slice(i, j + 1).every(Boolean))) throw new ProbeStop("uncertain");
          const x = plateauCentre(xs[i - 1], xs[i], xs[j + 1]);
          if (!isPole(x)) throw new ProbeStop("uncertain");
          add(poles, x, "poles"); add(points, x, "points");
          i = j; continue;
        }
        if (singular || need.roots) {
          if (j - i <= 1 && i > 0 && j < PROBE_N - 1) { if (singular) { const x = (xs[i] + xs[j]) / 2; add(points, x, "points"); if (isPole(x)) add(poles, x, "poles"); } }
          else for (const [edge, inside] of [[i, i - 1], [j, j + 1]] as const) {                              // the edge of a domain gap
            if (inside < 0 || inside >= PROBE_N) continue;
            let lo = xs[inside], hi = xs[edge];
            // the gap starts where f is UNDEFINED — an overflow between the samples is the defined side (a pole at the window's edge)
            for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (atRaw(m) === null) hi = m; else lo = m; }
            if (singular && isPole(hi)) add(poles, hi, "poles");
            else {
              if (singular && !edges.some(v => Math.abs(v - hi) < 1e-3)) edges.push(hi);                     // a monotonic stretch may end here
              if (need.roots && edgeRoot(lo, Math.sign(xs[inside] - xs[edge]))) add(roots, lo, "roots");     // x·√(4−x²) at ±2 (Review Fix 7)
            }
          }
        }
        i = j; continue;
      }
      if (y === 0) { if (need.roots) add(roots, xs[i], "roots"); continue; }
      const n = i + 1 < PROBE_N ? ys[i + 1] : null;
      if ((need.roots || singular) && n !== null && n !== 0 && Math.sign(n) !== Math.sign(y)) {             // sign change: root or pole
        let a = xs[i], b = xs[i + 1], fa = y, fb = n, undefinedAt: number | null = null;
        for (let k = 0; k < 80; k++) { const m = (a + b) / 2, fm = at(m); if (fm === null) { undefinedAt = m; break; } if (fm === 0) { a = b = m; fa = fb = 0; break; } if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else { b = m; fb = fm; } }
        const x = undefinedAt === null ? (a + b) / 2 : plateauCentre(a, undefinedAt, b);
        if (undefinedAt !== null || Math.min(Math.abs(fa), Math.abs(fb)) > 1e-6) { if (singular && isPole(x)) { add(poles, x, "poles"); add(points, x, "points"); } }
        else if (need.roots) add(roots, x, "roots");
      }
      const p = i > 0 ? ys[i - 1] : null;
      if (p === null || n === null || Math.sign(p) !== Math.sign(y) || Math.sign(n) !== Math.sign(y)) continue;
      // touching root: a strict local minimum of |f| (a flat stretch is not one — it would start a search at every sample — nor is the
      // evaluator's rounding noise along it)
      const noise = 1e-12 * Math.max(1, Math.abs(y));
      if (need.roots && Math.abs(y) <= Math.abs(p) && Math.abs(y) <= Math.abs(n) && (Math.abs(p) - Math.abs(y) > noise || Math.abs(n) - Math.abs(y) > noise)) {
        const x = ternary(xs[i - 1], xs[i + 1], g, false);
        if (g(x) < 1e-9) add(roots, x, "roots");
      }
      // an even pole between samples needs no search of its own: it is a zero of a denominator, a negative power's base or a log argument,
      // found by the guards (Review Fix 8)
    }
    const nearSingular = (x: number, d: number) => poles.some(v => Math.abs(v - x) < d) || points.some(v => Math.abs(v - x) < d);
    if (need.extrema || need.slope) for (let i = 1; i < PROBE_N - 1; i++) {
      const p = ys[i - 1], y = ys[i], n = ys[i + 1];
      if (p === null || y === null || n === null || nearSingular(xs[i], 3 * step)) continue;
      const eps = 1e-12 * Math.max(1, Math.abs(y));
      let kind: "min" | "max" | null = y - p > eps && y - n >= -eps && y >= n ? "max" : p - y > eps && n - y >= -eps && y <= n ? "min" : null, m = 1;
      // both neighbours equal to f within rounding (a very flat extremum beside a large value, (x−2)⁸ + 1000): compare 4, then 16 samples
      // away, where it must rise (or fall) on BOTH sides — a plateau or a slope does not (Review Fix 7)
      if (!kind && Math.abs(p - y) <= eps && Math.abs(n - y) <= eps) for (const k of [4, 16]) {
        const pk = i - k >= 0 ? ys[i - k] : null, nk = i + k < PROBE_N ? ys[i + k] : null;
        if (pk === null || nk === null || nearSingular(xs[i], (k + 2) * step)) break;
        if (pk - y > eps && nk - y > eps) { kind = "min"; m = k; break; }
        if (y - pk > eps && y - nk > eps) { kind = "max"; m = k; break; }
        if (Math.abs(pk - y) > eps || Math.abs(nk - y) > eps) break;
      }
      if (!kind) continue;
      const fx = (x: number) => { const v = at(x); return v === null ? (kind === "max" ? -Infinity : Infinity) : v; };
      // a very flat extremum ((x−2)⁶ + 10) is equal to f(x) over a stretch of rounding: the search lands anywhere on it, so it is moved to
      // the stretch's centre; its rise is measured 1, 4 and 16 steps away (x⁵ − 5x⁴ + 50 at 0 rises 3·10⁻⁹ one step away) — Review Fix 7
      const x = flatCentre(ternary(xs[i - m], xs[i + m], fx, kind === "max"), fx, step);
      const v = fx(x), side = Math.max(...[1, 4, 16].map(m => Math.min(Math.abs(v - fx(x - m * step)), Math.abs(v - fx(x + m * step)))));
      if (side > 1e-12 * Math.max(1, Math.abs(v)) && !extrema.some(e => Math.abs(e.x - x) < 1e-3)) { extrema.push({ kind, x }); if (extrema.length > KEY_CAP && need.extrema) throw new ProbeStop("extrema"); }
    }
    if (need.limits) { const fl = functionLimits(atRaw); if (fl.uncertain) throw new ProbeStop("uncertain"); limits.push(...fl.limits); }
    if (need.slope) for (let i = 0; i + 1 < PROBE_N; i++) {
      const y = ys[i], n = ys[i + 1], x = (xs[i] + xs[i + 1]) / 2;
      if (y === null || n === null || nearSingular(x, 3 * step) || extrema.some(e => Math.abs(e.x - x) < 3 * step)) continue;
      const d = n - y;
      if (Math.abs(d) > 1e-12 * Math.max(1, Math.abs(y))) slope.push({ x, dir: d > 0 ? 1 : -1 });
    }
    return { roots, points, poles, extrema, limits, slope, edges, overflow: null };
  } catch (e) {
    if (e instanceof ProbeStop) return { roots, points, poles, extrema, limits, slope, edges, overflow: e.why };
    throw e;
  }
}

const AI_UNSUPPORTED_CALLS = new Set(["round", "floor", "ceil", "min", "max"]);
/** Piecewise / periodic operators in a compiled expression (call names and `%`), sorted and unique. */
export function aiUnsupportedOperators(ast: unknown, out = new Set<string>()): string[] {
  if (ast && typeof ast === "object") {
    const n = ast as Record<string, unknown>;
    if (n.t === "call" && typeof n.fn === "string" && AI_UNSUPPORTED_CALLS.has(n.fn)) out.add(n.fn);
    if (n.t === "bin" && n.op === "%") out.add("%");
    for (const k of ["a", "b"]) aiUnsupportedOperators(n[k], out);
    if (Array.isArray(n.args)) for (const a of n.args) aiUnsupportedOperators(a, out);
  }
  return [...out].sort();
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
  // the AI may author keys only for functions whose behaviour code can verify: piecewise / periodic operators (round, floor, ceil, min,
  // max, %) are left to the teacher's manual authoring (Review Fix 5) — their jumps and noise defeat a numerical probe
  const unsupported = aiUnsupportedOperators(c.ast);
  if (unsupported.length) return fail("AI_FUNCTION_UNSUPPORTED", "دوال مثل " + unsupported.join("، ") + " غير متاحة لمفتاح يكتبه الذكاء الاصطناعي؛ استخدم كثيرات حدود أو دوالًا كسرية أو abs / sqrt / exp / log، أو أنشئ السؤال يدويًا.", path);
  // the probe sees `Infinity` where the safe evaluator's range was exceeded (|f| huge) and `null` where f is undefined
  const atRaw = (x: number): number | null => { const r = evaluateFunctionAt(c.ast, x); return r.ok ? r.value : r.code === "EVAL_OUT_OF_RANGE" || r.code === "EVAL_NON_FINITE" ? Infinity : null; };
  const at = (x: number): number | null => { const v = atRaw(x); return v !== null && Number.isFinite(v) ? v : null; };
  const near = (a: number | null, b: number, tol = KEY_TOL) => a !== null && Math.abs(a - b) <= tol;
  const issues: ComposerIssue[] = [];
  const bad = (m: string) => issues.push({ code: "AI_FUNCTION_KEY_INCONSISTENT", message: "مفتاح دراسة الدالة لا يطابق التعبير: " + m, path });
  const ex = f.domainExclusions as number[], xi = f.xIntercepts as number[], va = f.verticalAsymptotes as number[], ha = f.horizontalAsymptotes as number[];
  const ext = f.extrema as { kind: "min" | "max"; x: number; y: number }[];
  if (tasks.domainExclusions) for (const x of ex) if (at(x) !== null) bad("الدالة معرّفة عند x = " + x + ".");
  // the same growth test as the completeness probe: |f| must keep growing toward x on at least one side (rational or logarithmic)
  let uncertain = false;
  if (tasks.verticalAsymptotes) for (const x of va) { const k = at(x) !== null ? "bounded" : poleKindAt(atRaw, x); if (k === "uncertain") uncertain = true; else if (k !== "pole") bad("لا يوجد خط تقارب رأسي عند x = " + x + "."); }
  if (tasks.xIntercepts) for (const x of xi) if (at(x) !== null && !near(at(x), 0, 0.01)) bad("f(" + x + ") ≠ 0.");     // its x is checked against the probe below
  // two key values closer than the grading tolerance cannot both be matched by one correct answer
  const crowded = (label: string, v: number[]) => { if (v.some((a, i) => v.some((b, j) => j > i && Math.abs(a - b) <= 2 * KEY_TOL))) bad("قيم متقاربة جدًا أو مكررة في " + label + "."); };
  if (tasks.domainExclusions) crowded("استثناءات المجال", ex);
  if (tasks.xIntercepts) crowded("المقاطع السينية", xi);
  if (tasks.verticalAsymptotes) crowded("خطوط التقارب الرأسية", va);
  if (tasks.horizontalAsymptotes) crowded("خطوط التقارب الأفقية", ha);
  if (tasks.extrema) crowded("القيم القصوى", ext.map(e => e.x));
  if (tasks.yIntercept) { if (f.yIntercept === null) bad("المقطع الصادي مفقود."); else if (!near(at(0), f.yIntercept as number)) bad("f(0) ≠ " + f.yIntercept + "."); }
  const keyLimits = tasks.horizontalAsymptotes ? functionLimits(atRaw) : { limits: [], uncertain: false };   // the probe's own limits
  if (keyLimits.uncertain) uncertain = true;
  else if (tasks.horizontalAsymptotes) for (const y of ha) if (!keyLimits.limits.some(l => Math.abs(l - y) <= KEY_TOL)) bad("لا يقترب منحنى الدالة من y = " + y + ".");
  if (uncertain) return fail("AI_FUNCTION_TOO_COMPLEX", "لا يمكن التحقق آليًا من خطوط تقارب هذه الدالة (نمو بطيء جدًا أو قيم تتجاوز حدود الحساب)؛ اختر دالة أبسط أو أنشئ السؤال يدويًا.", path);
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
    const ft: FunctionFeatures = Object.values(need).some(Boolean) ? probeFunctionFeatures(atRaw, xMin, xMax, Math.max(1, Math.abs(f.yMin as number), Math.abs(f.yMax as number)), need, c.ast)
      : { roots: [], points: [], poles: [], extrema: [], limits: [], slope: [], edges: [], overflow: null };
    if (ft.overflow === "uncertain") return fail("AI_FUNCTION_TOO_COMPLEX", "لا يمكن التحقق آليًا من بعض نقاط الدالة داخل النافذة (قيم تتجاوز حدود الحساب أو سلوك غير محسوم)؛ اختر دالة أبسط أو أنشئ السؤال يدويًا.", path);
    if (ft.overflow === "budget") return fail("AI_FUNCTION_TOO_COMPLEX", "الدالة أعقد من أن تُفحص آليًا داخل النافذة (تذبذب أو نقاط كثيرة)؛ اختر دالة أبسط أو نافذة أضيق.", path);
    if (ft.overflow) return fail("AI_FUNCTION_KEY_INCOMPLETE", "للدالة داخل النافذة نقاط أكثر مما يتسع له المفتاح؛ اختر نافذة أضيق أو دالة أبسط.", path);
    const beyond = featureOutsideWindow(atRaw, xMin, xMax, need, c.ast);
    if (beyond !== null) return fail("AI_FUNCTION_WINDOW_TOO_NARROW", "للدالة نقاط تطلبها المهام خارج نافذة الرسم (قرب x ≈ " + Number(beyond.toPrecision(4)) + ")، والطالب يدرس الدالة كلها؛ وسّع النافذة لتشملها جميعًا.", path);
    const K = KEY_TOL;
    const missing = (label: string, found: number[], key: number[]) => { const miss = found.filter(x => !key.some(k => Math.abs(k - x) <= K)); if (miss.length) issues.push({ code: "AI_FUNCTION_KEY_INCOMPLETE", message: "مفتاح دراسة الدالة ناقص (" + label + "): " + miss.map(x => String(Number(x.toFixed(4)))).join("، ") + ".", path }); };
    if (tasks.xIntercepts) missing("المقاطع السينية", ft.roots, xi);
    if (tasks.domainExclusions) missing("استثناءات المجال", ft.points, ex);
    if (tasks.verticalAsymptotes) missing("خطوط التقارب الرأسية", ft.poles, va);
    if (tasks.horizontalAsymptotes) missing("خطوط التقارب الأفقية", ft.limits, ha);
    if (tasks.extrema) { const miss = ft.extrema.filter(e => !ext.some(k => k.kind === e.kind && Math.abs(k.x - e.x) <= K)); if (miss.length) issues.push({ code: "AI_FUNCTION_KEY_INCOMPLETE", message: "مفتاح دراسة الدالة ناقص (القيم القصوى): " + miss.map(e => (e.kind === "min" ? "صغرى" : "عظمى") + " عند x = " + Number(e.x.toFixed(4))).join("، ") + ".", path }); }
    if (tasks.monotonicIntervals && intervals.length === (f.intervals as unknown[]).length) {
      const covers = (x: number, dir: 1 | -1) => intervals.some(iv => iv.kind === (dir > 0 ? "increasing" : "decreasing") && (iv.from === "-inf" || (typeof iv.from === "number" && iv.from < x)) && (iv.to === "+inf" || (typeof iv.to === "number" && x < iv.to)));
      const miss = ft.slope.find(s => !covers(s.x, s.dir));
      if (miss) issues.push({ code: "AI_FUNCTION_KEY_INCOMPLETE", message: "مفتاح دراسة الدالة ناقص (فترات التزايد والتناقص): الدالة " + (miss.dir > 0 ? "متزايدة" : "متناقصة") + " قرب x = " + Number(miss.x.toFixed(3)) + " ولا تغطيها أي فترة.", path });
    }
    // …and every key value must be a feature the probe found (Review Fix 6): a root rounded too coarsely, an extremum beside the turning
    // point, or a monotonic interval that runs past a turning point, crosses a pole, ends elsewhere or overlaps another is refused
    const near1 = (x: number, found: number[]) => found.some(v => Math.abs(v - x) <= K);
    // a domain exclusion is an ISOLATED excluded point the probe finds (a hole, a jump, a pole — through the guards, Review Fix 8): a point
    // inside a domain gap, or outside the domain altogether, is not one
    if (tasks.domainExclusions) for (const x of ex) if (!near1(x, ft.points)) bad("x = " + x + " ليست نقطة معزولة خارج المجال (ثقب أو قفزة أو خط تقارب).");
    if (tasks.xIntercepts) for (const x of xi) if (!near1(x, ft.roots)) bad("لا يوجد مقطع سيني ضمن ±" + K + " من x = " + x + ".");
    // a very flat extremum ((x−2)⁶) may escape the probe: the key point is then accepted only if f at x ± K lies on the right side of f(x)
    // a very flat extremum the probe does not record ((x−2)⁸ + 1000 in a narrow window): the key point must lie within K of the CENTRE of
    // the stretch where f equals f(x) within the evaluator's rounding, and f must rise (min) / fall (max) beyond it on both sides — RF8
    const flatExtremum = (e: { kind: "min" | "max"; x: number }) => {
      const y = at(e.x); if (y === null) return false;
      const tol = 4 * Number.EPSILON * Math.max(1, Math.abs(y)), off = (x: number) => { const v = at(x); return v === null ? null : v - y; };
      const ends: number[] = [];
      for (const s of [-1, 1]) {
        let w = 1e-4, d = off(e.x + s * w);
        while (d !== null && Math.abs(d) <= tol && w < 1) { w *= 2; d = off(e.x + s * w); }
        if (d === null || Math.abs(d) <= tol || (e.kind === "min" ? d < 0 : d > 0)) return false;
        let lo = w === 1e-4 ? 0 : w / 2, hi = w;
        for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2, dm = off(e.x + s * m); if (dm !== null && Math.abs(dm) <= tol) lo = m; else hi = m; }
        ends.push(e.x + s * lo);
      }
      return Math.abs((ends[0] + ends[1]) / 2 - e.x) <= K;
    };
    if (tasks.extrema) for (const e of ext) if (!ft.extrema.some(p => p.kind === e.kind && Math.abs(p.x - e.x) <= K) && !flatExtremum(e)) bad("لا توجد قيمة " + (e.kind === "min" ? "صغرى" : "عظمى") + " ضمن ±" + K + " من x = " + e.x + ".");
    if (tasks.monotonicIntervals && intervals.length === (f.intervals as unknown[]).length) {
      const lo = (e: number | "-inf" | "+inf") => (e === "-inf" ? -Infinity : e === "+inf" ? Infinity : e);
      const breaks = [...ft.extrema.map(p => p.x), ...ft.poles, ...ft.points, ...ft.edges];
      for (const v of intervals) {
        for (const end of [v.from, v.to]) if (typeof end === "number" && !near1(end, breaks)) bad("طرف الفترة x = " + end + " ليس نقطة تحوّل ولا خط تقارب ولا حدًّا للمجال.");
        // a pole, a domain point or a domain edge inside the interval splits it, even when f keeps its direction on both sides
        const cut = [...ft.poles, ...ft.points, ...ft.edges].find(p => p > lo(v.from) + K && p < lo(v.to) - K);
        if (cut !== undefined) bad("الفترة (" + v.from + ", " + v.to + ") تعبر نقطة خارج المجال أو خط تقارب عند x = " + Number(cut.toFixed(4)) + ".");
        const dir = v.kind === "increasing" ? 1 : -1, wrong = ft.slope.find(sl => sl.x > lo(v.from) && sl.x < lo(v.to) && sl.dir !== dir);
        if (wrong) bad("الدالة " + (wrong.dir > 0 ? "متزايدة" : "متناقصة") + " قرب x = " + Number(wrong.x.toFixed(3)) + " داخل الفترة (" + v.from + ", " + v.to + ").");
      }
      if (intervals.some((a, i) => intervals.some((b, j) => j > i && lo(a.from) < lo(b.to) && lo(b.from) < lo(a.to)))) bad("فترات التزايد والتناقص متداخلة.");
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
