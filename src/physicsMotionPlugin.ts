// Phase 21D-A.1 — physicsMotion@1, the motion-experiments SmartSim plugin (pure; compiled into the shared server build and registered by
// src/trustedSimPlugins.ts). It binds the shared physics core (src/physics/motionCore.ts) and the strict config (src/physicsMotionModel.ts)
// into the SmartSim contract, reusing physicsFreeFall@1's established mechanisms:
//   actions — SEMANTIC submissions only: measurement.set { measurementId, value } / measurement.clear and graphPoint.set { pointId, x, y } /
//             graphPoint.clear, strictly normalized against the declared tasks. Play / pause / step / seek / rate and the student's
//             exploration of permitted parameters are PRESENTATION: never actions, never stored, never graded.
//   state   — { v: 1, measurements: { id: value }, points: { id: { x, y } } } — tiny, sorted, rebuilt by replay.
//   checks  — ONE plugin check kind, motion.referenceValue: a measurement compared, within the teacher's private absolute tolerance, with
//             a reference quantity the core derives from the AUTHORED experiment (the same mechanism as physicsFreeFall@1's physics.*
//             checks); plus the opt-in generic numericNear@1 / pointNear@1 rules. No new grading engine (experiment-based grading is A.3).
import { MOTION_LIMITS, MOTION_PLUGIN_KEY, MOTION_PLUGIN_VERSION, MOTION_PRIMARY_AXES, validateMotionConfig, type MotionConfigV1 } from "./physicsMotionModel";
import { MOTION_QUANTITY_SPEC, fmtMotion, motionQuantities } from "./physics/motionCore";
import { isPlainObject } from "./trustedSimVocabulary";
import type { SmartSimCheckBase, SmartSimCheckOutcome, SmartSimIssue, SmartSimPlugin } from "./trustedSimRegistry";
import type { SmartSimPluginDescriptorV1 } from "./trustedSimDescriptor";
import type { SmartSimRuleView } from "./trustedSimRules";

export const MOTION_LABEL = "تجارب الحركة (فيزياء)";
export const MOTION_STATE_VERSION = 1 as const;
export const MOTION_MAX_ACTIONS = 500;
export const MOTION_ACTION_KINDS: readonly string[] = Object.freeze(["measurement.set", "measurement.clear", "graphPoint.set", "graphPoint.clear"]);
export const MOTION_CHECK_KINDS: readonly string[] = Object.freeze(["motion.referenceValue"]);
export type MotionAction =
  | { type: "measurement.set"; measurementId: string; value: number }
  | { type: "measurement.clear"; measurementId: string }
  | { type: "graphPoint.set"; pointId: string; x: number; y: number }
  | { type: "graphPoint.clear"; pointId: string };
export type MotionStateV1 = { v: 1; measurements: Record<string, number>; points: Record<string, { x: number; y: number }> };
export type MotionCheck = SmartSimCheckBase & { kind: "motion.referenceValue"; measurementId: string; quantity: string; tolerance: number };
type Runtime = { measurements: Map<string, number>; points: Map<string, { x: number; y: number }> };

const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(o, k));
const value = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const VMAX = MOTION_LIMITS.valueAbsMax;
const measurementOf = (c: MotionConfigV1, id: unknown) => (typeof id === "string" ? c.tasks.measurements.find(m => m.id === id) : undefined);
const pointOf = (c: MotionConfigV1, id: unknown) => (typeof id === "string" ? c.tasks.points.find(p => p.id === id) : undefined);

export function normalizeMotionAction(raw: unknown, config: MotionConfigV1): { ok: true; action: MotionAction } | { ok: false; code: string } {
  const bad = { ok: false as const, code: "MOTION_ACTION_INVALID" };
  if (!isPlainObject(raw) || typeof raw.type !== "string") return bad;
  switch (raw.type) {
    case "measurement.set":
      if (!exactKeys(raw, ["type", "measurementId", "value"]) || !measurementOf(config, raw.measurementId) || !value(raw.value, -VMAX, VMAX)) return bad;
      return { ok: true, action: { type: "measurement.set", measurementId: raw.measurementId as string, value: raw.value } };
    case "measurement.clear":
      if (!exactKeys(raw, ["type", "measurementId"]) || !measurementOf(config, raw.measurementId)) return bad;
      return { ok: true, action: { type: "measurement.clear", measurementId: raw.measurementId as string } };
    case "graphPoint.set": {
      const xMin = MOTION_PRIMARY_AXES[config.experiment].xIsTime ? 0 : -VMAX, xMax = MOTION_PRIMARY_AXES[config.experiment].xIsTime ? config.view.maxTime : VMAX;
      if (!exactKeys(raw, ["type", "pointId", "x", "y"]) || !pointOf(config, raw.pointId) || !value(raw.x, xMin, xMax) || !value(raw.y, -VMAX, VMAX)) return bad;
      return { ok: true, action: { type: "graphPoint.set", pointId: raw.pointId as string, x: raw.x, y: raw.y } };
    }
    case "graphPoint.clear":
      if (!exactKeys(raw, ["type", "pointId"]) || !pointOf(config, raw.pointId)) return bad;
      return { ok: true, action: { type: "graphPoint.clear", pointId: raw.pointId as string } };
    default:
      return bad;
  }
}
const createRuntime = (): Runtime => ({ measurements: new Map(), points: new Map() });
function applyAction(rt: Runtime, a: MotionAction): Runtime {
  const next: Runtime = { measurements: new Map(rt.measurements), points: new Map(rt.points) };
  if (a.type === "measurement.set") next.measurements.set(a.measurementId, a.value);
  else if (a.type === "measurement.clear") next.measurements.delete(a.measurementId);
  else if (a.type === "graphPoint.set") next.points.set(a.pointId, { x: a.x, y: a.y });
  else next.points.delete(a.pointId);
  return next;
}
const byKey = <T,>(m: Map<string, T>) => [...m.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
function canonicalState(rt: Runtime): MotionStateV1 {
  const measurements: Record<string, number> = {}, points: Record<string, { x: number; y: number }> = {};
  for (const [id, v] of byKey(rt.measurements)) measurements[id] = v;
  for (const [id, p] of byKey(rt.points)) points[id] = { x: p.x, y: p.y };
  return { v: MOTION_STATE_VERSION, measurements, points };
}
export const initialMotionState = (): MotionStateV1 => ({ v: MOTION_STATE_VERSION, measurements: {}, points: {} });
/** Replays raw actions from the empty state (the client workspace and the parity tests use it; the core uses the plugin functions). */
export function replayMotion(config: MotionConfigV1, rawActions: readonly unknown[]): { ok: true; actions: MotionAction[]; state: MotionStateV1 } | { ok: false; code: string } {
  if (!Array.isArray(rawActions) || rawActions.length > MOTION_MAX_ACTIONS) return { ok: false, code: "MOTION_ACTIONS_TOO_MANY" };
  const actions: MotionAction[] = [];
  let rt = createRuntime();
  for (const raw of rawActions) {
    const n = normalizeMotionAction(raw, config);
    if (!n.ok) return n;
    actions.push(n.action);
    rt = applyAction(rt, n.action);
  }
  return { ok: true, actions, state: canonicalState(rt) };
}

// ── checks ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const TOLERANCE_MAX = 1e6;
/** The trusted reference value of a check: derived from the AUTHORED experiment (never stored, never sent to the student). */
export const expectedMotionValue = (check: MotionCheck, config: MotionConfigV1): number | null =>
  motionQuantities({ kind: config.experiment, params: config.params }, config.view.maxTime)[check.quantity] ?? null;
export function validateMotionCheck(raw: Record<string, unknown>, config: MotionConfigV1): { ok: true; check: MotionCheck } | { ok: false; issues: SmartSimIssue[] } {
  const fail = (message: string) => ({ ok: false as const, issues: [{ code: "MOTION_CHECK_INVALID", message }] });
  if (raw.kind !== "motion.referenceValue") return fail("نوع فحص غير معروف.");
  if (!exactKeys(raw, ["id", "label", "weight", "kind", "measurementId", "quantity", "tolerance"])) return fail("معاملات الفحص «" + String(raw.label) + "» غير مطابقة لنوعه.");
  if (!value(raw.tolerance, Number.MIN_VALUE, TOLERANCE_MAX)) return fail("السماحية في الفحص «" + String(raw.label) + "» يجب أن تكون عددًا موجبًا.");
  const m = measurementOf(config, raw.measurementId);
  if (!m) return fail("الفحص «" + String(raw.label) + "» يشير إلى قياس غير معرّف في المهام.");
  const q = MOTION_QUANTITY_SPEC[config.experiment].find(s => s.id === raw.quantity);
  if (!q) return fail("الكمية المرجعية في الفحص «" + String(raw.label) + "» غير معروفة لهذه التجربة.");
  if (q.unit !== m.unit) return fail("وحدة القياس «" + m.label + "» لا تناسب الكمية «" + q.label + "» (" + q.unit + ").");
  const check: MotionCheck = { id: raw.id as string, label: raw.label as string, weight: raw.weight as number, kind: "motion.referenceValue", measurementId: m.id, quantity: q.id, tolerance: raw.tolerance };
  const expected = expectedMotionValue(check, config);
  if (expected === null || !Number.isFinite(expected)) return fail("الكمية «" + q.label + "» غير معرّفة في هذه التجربة بقيمها الحالية (مثلًا لا يصل الجسم إلى أسفل المستوى خلال مدة التجربة).");
  return { ok: true, check };
}
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
export function evaluateMotionCheck(check: MotionCheck, state: MotionStateV1, config: MotionConfigV1): SmartSimCheckOutcome {
  const expected = expectedMotionValue(check, config);
  const got = has(state.measurements, check.measurementId) ? state.measurements[check.measurementId] : undefined;
  const passed = typeof got === "number" && Number.isFinite(got) && expected !== null && Number.isFinite(expected) && Math.abs(got - expected) <= check.tolerance;
  return { expected: fmtMotion(expected) + " ± " + fmtMotion(check.tolerance), actual: typeof got === "number" ? fmtMotion(got) : "—", passed };
}
/** The neutral view the opt-in generic rules read: values = measurements, points = primary-graph points. */
export function motionRuleView(state: MotionStateV1, config: MotionConfigV1): SmartSimRuleView {
  const points: Record<string, { x: number; y: number }> = {};
  for (const id of Object.keys(state.points)) points[id] = { x: state.points[id].x, y: state.points[id].y };
  return { ids: [...config.tasks.measurements.map(m => m.id), ...config.tasks.points.map(p => p.id)], selected: [], points, values: { ...state.measurements }, sequence: [], relations: [] };
}

export const PHYSICS_MOTION_DESCRIPTOR_V1: SmartSimPluginDescriptorV1 = {
  descriptorVersion: 1, key: MOTION_PLUGIN_KEY, version: MOTION_PLUGIN_VERSION, label: MOTION_LABEL, domain: "physics",
  sceneKinds: ["2d"], rendererFamilies: ["svg2d", "graph2d", "form"],
  capabilities: ["scene.2d", "simulation.play", "simulation.pause", "simulation.scrub", "graph.2d", "point.place", "value.set"],
  actionKinds: [...MOTION_ACTION_KINDS], checkKinds: [...MOTION_CHECK_KINDS], genericRules: ["numericNear@1", "pointNear@1"], assetKinds: [],
  tools: ["play", "pause", "scrub", "placePoint", "form"], accessibility: ["keyboardAlternative", "semanticLabels", "toolLabels", "textTranscript"],
  supports: { autosave: true, restore: true, reset: true, partialCredit: true, offline: true, twoDimensional: true, threeDimensional: false }
};
export const physicsMotionPluginV1: SmartSimPlugin<MotionConfigV1, Runtime, MotionStateV1, MotionAction, MotionCheck> = Object.freeze({
  key: MOTION_PLUGIN_KEY,
  version: MOTION_PLUGIN_VERSION,
  label: MOTION_LABEL,
  maxActions: MOTION_MAX_ACTIONS,
  descriptor: PHYSICS_MOTION_DESCRIPTOR_V1,
  checkKinds: MOTION_CHECK_KINDS,
  validateConfig: (raw: unknown) => validateMotionConfig(raw),
  createRuntime,
  normalizeAction: normalizeMotionAction,
  applyAction: (rt: Runtime, a: MotionAction) => applyAction(rt, a),
  canonicalState: (rt: Runtime) => canonicalState(rt),
  serializeState: (s: MotionStateV1) => JSON.stringify(s),
  validateCheck: validateMotionCheck,
  evaluateCheck: evaluateMotionCheck,
  ruleView: motionRuleView
});
