// Phase 20A.2 — functionStudy2d@1, the first MATHEMATICS production SmartSim plugin (pure; compiled into the shared server build and
// registered by src/trustedSimPlugins.ts). The student studies a PUBLIC function and submits a STRUCTURED analysis:
//   actions — one semantic action per analysis group, each REPLACING that group (bounded, idempotent):
//             domain.setExclusions { values } · intercepts.setX { points: [{x, y}] } · intercept.setY { y | null }
//             asymptotes.setVertical { values } · asymptotes.setHorizontal { values } · extrema.set { points: [{kind, x, y}] }
//             intervals.set { intervals: [{kind, from: number | "-inf", to: number | "+inf"}] }
//             Exact keys, finite bounded numbers, strict enums, no duplicates, ≤ 20 items, only for groups the author enabled. Zoom, pan,
//             hover and probing are presentation and never actions.
//   state   — { v: 1, domainExclusions, xIntercepts, yIntercept, verticalAsymptotes, horizontalAsymptotes, extrema, monotonicIntervals }
//             canonically ordered (sets sorted; intervals by their start, −∞ first), so the state never depends on entry order
//   checks  — private, weighted, with an explicit tolerance: the teacher's analytical truth (no symbolic CAS in v1) compared as SETS
//             (order-independent, kind-sensitive, every expected item matched and nothing extra)
import { FUNCTION_STUDY_LIMITS, FUNCTION_STUDY_PLUGIN_KEY, FUNCTION_STUDY_PLUGIN_VERSION, validateFunctionStudyConfig, type FunctionStudyConfigV1, type FunctionStudyTask } from "./functionStudyModel";
import { isPlainObject } from "./trustedSimVocabulary";
import type { SmartSimCheckBase, SmartSimCheckOutcome, SmartSimIssue, SmartSimPlugin } from "./trustedSimRegistry";
import type { SmartSimPluginDescriptorV1 } from "./trustedSimDescriptor";

export const FUNCTION_STUDY_LABEL = "دراسة دالة (رياضيات)";
export const FUNCTION_STUDY_STATE_VERSION = 1 as const;
export const FUNCTION_STUDY_MAX_ACTIONS = 300;
export type Extremum = { kind: "min" | "max"; x: number; y: number };
export type Endpoint = number | "-inf" | "+inf";
export type MonotonicInterval = { kind: "increasing" | "decreasing"; from: number | "-inf"; to: number | "+inf" };
export type FunctionStudyStateV1 = {
  v: 1; domainExclusions: number[]; xIntercepts: { x: number; y: number }[]; yIntercept: { x: 0; y: number } | null;
  verticalAsymptotes: number[]; horizontalAsymptotes: number[]; extrema: Extremum[]; monotonicIntervals: MonotonicInterval[];
};
export type FunctionStudyAction =
  | { type: "domain.setExclusions" | "asymptotes.setVertical" | "asymptotes.setHorizontal"; values: number[] }
  | { type: "intercepts.setX"; points: { x: number; y: number }[] }
  | { type: "intercept.setY"; y: number | null }
  | { type: "extrema.set"; points: Extremum[] }
  | { type: "intervals.set"; intervals: MonotonicInterval[] };

/** action type → [the task group it needs, its payload key]. */
const ACTIONS: Readonly<Record<string, readonly [FunctionStudyTask, string]>> = Object.freeze({
  "domain.setExclusions": ["domainExclusions", "values"],
  "intercepts.setX": ["xIntercepts", "points"],
  "intercept.setY": ["yIntercept", "y"],
  "asymptotes.setVertical": ["verticalAsymptotes", "values"],
  "asymptotes.setHorizontal": ["horizontalAsymptotes", "values"],
  "extrema.set": ["extrema", "points"],
  "intervals.set": ["monotonicIntervals", "intervals"]
});
export const FUNCTION_STUDY_ACTION_KINDS: readonly string[] = Object.freeze(Object.keys(ACTIONS));
const L = FUNCTION_STUDY_LIMITS;
const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(o, k));
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= L.valueAbsMax;
const z = (v: number) => (v === 0 ? 0 : v);                                                                    // never a negative zero

// ── strict item shapes (shared by actions and private checks) ─────────────────────────────────────────────────────────────────────
const list = <T,>(raw: unknown, item: (v: unknown) => T | undefined, sameItem: (a: T, b: T) => boolean): T[] | undefined => {
  if (!Array.isArray(raw) || raw.length > L.items) return undefined;
  const out: T[] = [];
  for (const r of raw) { const v = item(r); if (v === undefined || out.some(o => sameItem(o, v))) return undefined; out.push(v); }
  return out;
};
const numbers = (raw: unknown) => list(raw, v => (num(v) ? z(v) : undefined), (a, b) => a === b);
const point = (v: unknown) => (isPlainObject(v) && exactKeys(v, ["x", "y"]) && num(v.x) && num(v.y) ? { x: z(v.x), y: z(v.y) } : undefined);
const points = (raw: unknown) => list(raw, point, (a, b) => a.x === b.x);
const extremum = (v: unknown): Extremum | undefined => (isPlainObject(v) && exactKeys(v, ["kind", "x", "y"]) && (v.kind === "min" || v.kind === "max") && num(v.x) && num(v.y) ? { kind: v.kind, x: z(v.x), y: z(v.y) } : undefined);
const extremaList = (raw: unknown) => list(raw, extremum, (a, b) => a.x === b.x);
function interval(v: unknown): MonotonicInterval | undefined {
  if (!isPlainObject(v) || !exactKeys(v, ["kind", "from", "to"]) || (v.kind !== "increasing" && v.kind !== "decreasing")) return undefined;
  const from = v.from === "-inf" ? "-inf" : num(v.from) ? z(v.from) : undefined;
  const to = v.to === "+inf" ? "+inf" : num(v.to) ? z(v.to) : undefined;
  if (from === undefined || to === undefined || (typeof from === "number" && typeof to === "number" && !(from < to))) return undefined;
  return { kind: v.kind, from, to };
}
const intervals = (raw: unknown) => list(raw, interval, (a, b) => a.from === b.from && a.to === b.to);

// ── actions, runtime and the canonical state ──────────────────────────────────────────────────────────────────────────────────────
export function normalizeFunctionStudyAction(raw: unknown, config: FunctionStudyConfigV1): { ok: true; action: FunctionStudyAction } | { ok: false; code: string } {
  const bad = { ok: false as const, code: "FUNCSTUDY_ACTION_INVALID" };
  if (!isPlainObject(raw) || typeof raw.type !== "string" || !Object.prototype.hasOwnProperty.call(ACTIONS, raw.type)) return bad;
  const [task, field] = ACTIONS[raw.type];
  if (config.tasks[task] !== true || !exactKeys(raw, ["type", field])) return bad;
  const p = raw[field];
  switch (raw.type) {
    case "domain.setExclusions": case "asymptotes.setVertical": case "asymptotes.setHorizontal": { const v = numbers(p); return v ? { ok: true, action: { type: raw.type, values: v } } : bad; }
    case "intercepts.setX": { const v = points(p); return v ? { ok: true, action: { type: "intercepts.setX", points: v } } : bad; }
    case "intercept.setY": return p === null ? { ok: true, action: { type: "intercept.setY", y: null } } : num(p) ? { ok: true, action: { type: "intercept.setY", y: z(p) } } : bad;
    case "extrema.set": { const v = extremaList(p); return v ? { ok: true, action: { type: "extrema.set", points: v } } : bad; }
    case "intervals.set": { const v = intervals(p); return v ? { ok: true, action: { type: "intervals.set", intervals: v } } : bad; }
  }
  return bad;
}
export const initialFunctionStudyState = (): FunctionStudyStateV1 => ({ v: FUNCTION_STUDY_STATE_VERSION, domainExclusions: [], xIntercepts: [], yIntercept: null, verticalAsymptotes: [], horizontalAsymptotes: [], extrema: [], monotonicIntervals: [] });
const startKey = (e: Endpoint) => (e === "-inf" ? -Infinity : e === "+inf" ? Infinity : e);
const asc = (a: number, b: number) => a - b;
const byInterval = (a: MonotonicInterval, b: MonotonicInterval) => startKey(a.from) - startKey(b.from) || startKey(a.to) - startKey(b.to);
function applyAction(s: FunctionStudyStateV1, a: FunctionStudyAction): FunctionStudyStateV1 {
  const n: FunctionStudyStateV1 = { ...s };
  switch (a.type) {
    case "domain.setExclusions": n.domainExclusions = [...a.values].sort(asc); break;
    case "asymptotes.setVertical": n.verticalAsymptotes = [...a.values].sort(asc); break;
    case "asymptotes.setHorizontal": n.horizontalAsymptotes = [...a.values].sort(asc); break;
    case "intercepts.setX": n.xIntercepts = a.points.map(p => ({ x: p.x, y: p.y })).sort((p, q) => p.x - q.x); break;
    case "intercept.setY": n.yIntercept = a.y === null ? null : { x: 0, y: a.y }; break;
    case "extrema.set": n.extrema = a.points.map(p => ({ kind: p.kind, x: p.x, y: p.y })).sort((p, q) => p.x - q.x); break;
    case "intervals.set": n.monotonicIntervals = a.intervals.map(i => ({ kind: i.kind, from: i.from, to: i.to })).sort(byInterval); break;
  }
  return n;
}
/** The canonical (fresh, key-ordered) copy of a state. */
const canonical = (s: FunctionStudyStateV1): FunctionStudyStateV1 => ({
  v: FUNCTION_STUDY_STATE_VERSION, domainExclusions: [...s.domainExclusions], xIntercepts: s.xIntercepts.map(p => ({ x: p.x, y: p.y })), yIntercept: s.yIntercept ? { x: 0, y: s.yIntercept.y } : null,
  verticalAsymptotes: [...s.verticalAsymptotes], horizontalAsymptotes: [...s.horizontalAsymptotes], extrema: s.extrema.map(p => ({ kind: p.kind, x: p.x, y: p.y })),
  monotonicIntervals: s.monotonicIntervals.map(i => ({ kind: i.kind, from: i.from, to: i.to }))
});
/** Replays raw actions from the empty analysis (the client workspace and the parity tests use it; the core uses the plugin functions). */
export function replayFunctionStudy(config: FunctionStudyConfigV1, rawActions: readonly unknown[]): { ok: true; actions: FunctionStudyAction[]; state: FunctionStudyStateV1 } | { ok: false; code: string } {
  if (!Array.isArray(rawActions) || rawActions.length > FUNCTION_STUDY_MAX_ACTIONS) return { ok: false, code: "FUNCSTUDY_ACTIONS_TOO_MANY" };
  const actions: FunctionStudyAction[] = [];
  let s = initialFunctionStudyState();
  for (const raw of rawActions) {
    const r = normalizeFunctionStudyAction(raw, config);
    if (!r.ok) return r;
    actions.push(r.action);
    s = applyAction(s, r.action);
  }
  return { ok: true, actions, state: canonical(s) };
}

// ── private checks: the teacher's analytical truth, compared as sets with an explicit tolerance ──────────────────────────────────────
type CheckSpec = { task: FunctionStudyTask; parse: (v: unknown) => unknown[] | undefined };
const nonEmpty = <T,>(f: (v: unknown) => T[] | undefined) => (v: unknown) => { const r = f(v); return r && r.length ? r : undefined; };
// An EMPTY expected answer ("none") is refused in v1: the empty initial state would otherwise earn credit without any work.
const CHECKS: Readonly<Record<string, CheckSpec>> = Object.freeze({
  "domain.exclusions": { task: "domainExclusions", parse: nonEmpty(numbers) },
  "intercepts.x": { task: "xIntercepts", parse: nonEmpty(points) },
  "intercept.y": { task: "yIntercept", parse: v => (num(v) ? [z(v)] : undefined) },
  "asymptotes.vertical": { task: "verticalAsymptotes", parse: nonEmpty(numbers) },
  "asymptotes.horizontal": { task: "horizontalAsymptotes", parse: nonEmpty(numbers) },
  "extrema.points": { task: "extrema", parse: nonEmpty(extremaList) },
  "monotonic.intervals": { task: "monotonicIntervals", parse: nonEmpty(intervals) }
});
export const FUNCTION_STUDY_CHECK_KINDS: readonly string[] = Object.freeze(Object.keys(CHECKS));
export type FunctionStudyCheck = SmartSimCheckBase & { expected: unknown; tolerance: number };

export function validateFunctionStudyCheck(raw: Record<string, unknown>, config: FunctionStudyConfigV1): { ok: true; check: FunctionStudyCheck } | { ok: false; issues: SmartSimIssue[] } {
  const fail = (message: string) => ({ ok: false as const, issues: [{ code: "FUNCSTUDY_CHECK_INVALID", message }] });
  const spec = typeof raw.kind === "string" && Object.prototype.hasOwnProperty.call(CHECKS, raw.kind) ? CHECKS[raw.kind] : undefined;
  if (!spec) return fail("نوع فحص غير معروف.");
  if (!exactKeys(raw, ["id", "label", "weight", "kind", "expected", "tolerance"])) return fail("الفحص «" + String(raw.label) + "» يجب أن يحوي الإجابة المتوقعة والسماحية فقط.");
  if (config.tasks[spec.task] !== true) return fail("الفحص «" + String(raw.label) + "» يقيّم مهمة غير مفعّلة في إعداد الدالة.");
  if (typeof raw.tolerance !== "number" || !Number.isFinite(raw.tolerance) || raw.tolerance < 0 || raw.tolerance > L.toleranceMax) return fail("السماحية في الفحص «" + String(raw.label) + "» يجب أن تكون عددًا غير سالب.");
  const parsed = spec.parse(raw.expected);
  if (!parsed) return fail("الإجابة المتوقعة في الفحص «" + String(raw.label) + "» غير صالحة أو فارغة (قيم منتهية، بلا تكرار، ∞ في موضعه الصحيح).");
  const expected = raw.kind === "intercept.y" ? parsed[0] : parsed;
  return { ok: true, check: { id: raw.id as string, label: raw.label as string, weight: raw.weight as number, kind: raw.kind as string, expected, tolerance: raw.tolerance } };
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const endpointNear = (a: Endpoint, b: Endpoint, tol: number) => (typeof a === "number" && typeof b === "number" ? near(a, b, tol) : a === b);
/** Order-independent comparison: same size and, after canonical ordering, every pair matches (monotone matching is optimal in 1D). */
function sameSet<T>(want: T[], got: T[], key: (v: T) => number, match: (a: T, b: T) => boolean): boolean {
  if (want.length !== got.length) return false;
  const w = [...want].sort((a, b) => key(a) - key(b)), g = [...got].sort((a, b) => key(a) - key(b));
  return w.every((v, i) => match(v, g[i]));
}
const showNum = (n: number) => String(Number(n.toPrecision(10)));
const showEnd = (e: Endpoint) => (e === "-inf" ? "−∞" : e === "+inf" ? "+∞" : showNum(e));
const showList = (kind: string, v: unknown): string => {
  if (!Array.isArray(v)) return typeof v === "number" ? showNum(v) : v && typeof v === "object" ? showNum((v as { y: number }).y) : "—";
  if (!v.length) return "—";
  if (kind === "intercepts.x") return (v as { x: number; y: number }[]).map(p => "(" + showNum(p.x) + ", " + showNum(p.y) + ")").join("، ");
  if (kind === "extrema.points") return (v as Extremum[]).map(p => (p.kind === "min" ? "صغرى" : "عظمى") + " (" + showNum(p.x) + ", " + showNum(p.y) + ")").join("، ");
  if (kind === "monotonic.intervals") return (v as MonotonicInterval[]).map(i => (i.kind === "increasing" ? "متزايدة" : "متناقصة") + " (" + showEnd(i.from) + ", " + showEnd(i.to) + ")").join("، ");
  return (v as number[]).map(showNum).join("، ");
};
export function evaluateFunctionStudyCheck(check: FunctionStudyCheck, state: FunctionStudyStateV1): SmartSimCheckOutcome {
  const tol = check.tolerance;
  let actual: unknown, passed = false;
  switch (check.kind) {
    case "domain.exclusions": actual = state.domainExclusions; passed = sameSet(check.expected as number[], state.domainExclusions, v => v, (a, b) => near(a, b, tol)); break;
    case "asymptotes.vertical": actual = state.verticalAsymptotes; passed = sameSet(check.expected as number[], state.verticalAsymptotes, v => v, (a, b) => near(a, b, tol)); break;
    case "asymptotes.horizontal": actual = state.horizontalAsymptotes; passed = sameSet(check.expected as number[], state.horizontalAsymptotes, v => v, (a, b) => near(a, b, tol)); break;
    case "intercepts.x": actual = state.xIntercepts; passed = sameSet(check.expected as { x: number; y: number }[], state.xIntercepts, p => p.x, (a, b) => near(a.x, b.x, tol) && near(a.y, b.y, tol)); break;
    case "intercept.y": actual = state.yIntercept ?? "—"; passed = state.yIntercept !== null && near(check.expected as number, state.yIntercept.y, tol); break;
    case "extrema.points": actual = state.extrema; passed = sameSet(check.expected as Extremum[], state.extrema, p => p.x, (a, b) => a.kind === b.kind && near(a.x, b.x, tol) && near(a.y, b.y, tol)); break;
    case "monotonic.intervals": actual = state.monotonicIntervals; passed = sameSet(check.expected as MonotonicInterval[], state.monotonicIntervals, i => startKey(i.from), (a, b) => a.kind === b.kind && endpointNear(a.from, b.from, tol) && endpointNear(a.to, b.to, tol)); break;
  }
  return { expected: showList(check.kind, check.expected) + " (± " + showNum(tol) + ")", actual: actual === "—" ? "—" : showList(check.kind, actual), passed };
}

// ── descriptor and plugin ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export const FUNCTION_STUDY_DESCRIPTOR_V1: SmartSimPluginDescriptorV1 = {
  descriptorVersion: 1, key: FUNCTION_STUDY_PLUGIN_KEY, version: FUNCTION_STUDY_PLUGIN_VERSION, label: FUNCTION_STUDY_LABEL, domain: "mathematics",
  sceneKinds: ["2d"], rendererFamilies: ["graph2d", "form"],
  capabilities: ["scene.2d", "graph.2d", "point.place", "value.set"],
  actionKinds: [...FUNCTION_STUDY_ACTION_KINDS], checkKinds: [...FUNCTION_STUDY_CHECK_KINDS], genericRules: [], assetKinds: [],
  tools: ["form", "placePoint"], accessibility: ["keyboardAlternative", "semanticLabels", "toolLabels", "textTranscript"],
  supports: { autosave: true, restore: true, reset: true, partialCredit: true, offline: true, twoDimensional: true, threeDimensional: false }
};
export const functionStudy2dPluginV1: SmartSimPlugin<FunctionStudyConfigV1, FunctionStudyStateV1, FunctionStudyStateV1, FunctionStudyAction, FunctionStudyCheck> = Object.freeze({
  key: FUNCTION_STUDY_PLUGIN_KEY,
  version: FUNCTION_STUDY_PLUGIN_VERSION,
  label: FUNCTION_STUDY_LABEL,
  maxActions: FUNCTION_STUDY_MAX_ACTIONS,
  descriptor: FUNCTION_STUDY_DESCRIPTOR_V1,
  checkKinds: FUNCTION_STUDY_CHECK_KINDS,
  validateConfig: (raw: unknown) => validateFunctionStudyConfig(raw),
  createRuntime: () => initialFunctionStudyState(),
  normalizeAction: normalizeFunctionStudyAction,
  applyAction: (s: FunctionStudyStateV1, a: FunctionStudyAction) => applyAction(s, a),
  canonicalState: (s: FunctionStudyStateV1) => canonical(s),
  serializeState: (s: FunctionStudyStateV1) => JSON.stringify(canonical(s)),
  validateCheck: validateFunctionStudyCheck,
  evaluateCheck: (c: FunctionStudyCheck, s: FunctionStudyStateV1) => evaluateFunctionStudyCheck(c, s)
});
