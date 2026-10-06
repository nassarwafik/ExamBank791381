// Phase 20A.2 — physicsFreeFall@1, the first PHYSICS production SmartSim plugin (pure; compiled into the shared server build and registered
// by src/trustedSimPlugins.ts). It binds the free-fall model (src/physicsFreeFallModel.ts) into the SmartSim contract:
//   actions — SEMANTIC submissions only: measurement.set { measurementId, value } / measurement.clear { measurementId } and
//             graphPoint.set { pointId, t, y } / graphPoint.clear { pointId }, strictly normalized against the declared tasks. Playing,
//             pausing, scrubbing, frames, camera and hover are PRESENTATION: they are never actions (the core refuses presentation
//             prefixes; every other type, including simulation.play / timeline.scrub / animation.frame, is refused here).
//   state   — { v: 1, measurements: { id: value }, points: { id: { t, y } } } — tiny, sorted, rebuilt by replay; no time, frame or camera
//   checks  — private, weighted physics facts DERIVED from the trusted public model (impact time / speed, height / velocity at a time,
//             a point on the trajectory) with the teacher's private tolerance, plus the opt-in generic numericNear@1 / pointNear@1
//             rules through the neutral rule view (values = measurements, points = graph points as (x = t, y)).
import {
  FREE_FALL_LIMITS, FREE_FALL_PLUGIN_KEY, FREE_FALL_PLUGIN_VERSION, fmtPhysics, heightAt, impactSpeed, impactTime, validateFreeFallConfig, velocityAt,
  type FreeFallConfigV1, type FreeFallUnit
} from "./physicsFreeFallModel";
import { isPlainObject } from "./trustedSimVocabulary";
import type { SmartSimCheckBase, SmartSimCheckOutcome, SmartSimIssue, SmartSimPlugin } from "./trustedSimRegistry";
import type { SmartSimPluginDescriptorV1 } from "./trustedSimDescriptor";
import type { SmartSimRuleView } from "./trustedSimRules";

export const FREE_FALL_LABEL = "السقوط الحر (فيزياء)";
export const FREE_FALL_STATE_VERSION = 1 as const;
export const FREE_FALL_MAX_ACTIONS = 500;
export const FREE_FALL_ACTION_KINDS: readonly string[] = Object.freeze(["measurement.set", "measurement.clear", "graphPoint.set", "graphPoint.clear"]);
export type FreeFallAction =
  | { type: "measurement.set"; measurementId: string; value: number }
  | { type: "measurement.clear"; measurementId: string }
  | { type: "graphPoint.set"; pointId: string; t: number; y: number }
  | { type: "graphPoint.clear"; pointId: string };
export type FreeFallStateV1 = { v: 1; measurements: Record<string, number>; points: Record<string, { t: number; y: number }> };
type Runtime = { measurements: Map<string, number>; points: Map<string, { t: number; y: number }> };

const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(o, k));
const value = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const VMAX = FREE_FALL_LIMITS.valueAbsMax;
const measurementOf = (c: FreeFallConfigV1, id: unknown) => (typeof id === "string" ? c.tasks.measurements.find(m => m.id === id) : undefined);
const pointOf = (c: FreeFallConfigV1, id: unknown) => (typeof id === "string" ? c.tasks.points.find(p => p.id === id) : undefined);

// ── actions ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function normalizeFreeFallAction(raw: unknown, config: FreeFallConfigV1): { ok: true; action: FreeFallAction } | { ok: false; code: string } {
  const bad = { ok: false as const, code: "FREEFALL_ACTION_INVALID" };
  if (!isPlainObject(raw) || typeof raw.type !== "string") return bad;
  switch (raw.type) {
    case "measurement.set":
      if (!exactKeys(raw, ["type", "measurementId", "value"]) || !measurementOf(config, raw.measurementId) || !value(raw.value, -VMAX, VMAX)) return bad;
      return { ok: true, action: { type: "measurement.set", measurementId: raw.measurementId as string, value: raw.value } };
    case "measurement.clear":
      if (!exactKeys(raw, ["type", "measurementId"]) || !measurementOf(config, raw.measurementId)) return bad;
      return { ok: true, action: { type: "measurement.clear", measurementId: raw.measurementId as string } };
    case "graphPoint.set":
      if (!exactKeys(raw, ["type", "pointId", "t", "y"]) || !pointOf(config, raw.pointId) || !value(raw.t, 0, config.view.maxTime) || !value(raw.y, -VMAX, VMAX)) return bad;
      return { ok: true, action: { type: "graphPoint.set", pointId: raw.pointId as string, t: raw.t, y: raw.y } };
    case "graphPoint.clear":
      if (!exactKeys(raw, ["type", "pointId"]) || !pointOf(config, raw.pointId)) return bad;
      return { ok: true, action: { type: "graphPoint.clear", pointId: raw.pointId as string } };
    default:
      return bad;
  }
}
const createRuntime = (): Runtime => ({ measurements: new Map(), points: new Map() });
function applyAction(rt: Runtime, a: FreeFallAction): Runtime {
  const next: Runtime = { measurements: new Map(rt.measurements), points: new Map(rt.points) };
  if (a.type === "measurement.set") next.measurements.set(a.measurementId, a.value);
  else if (a.type === "measurement.clear") next.measurements.delete(a.measurementId);
  else if (a.type === "graphPoint.set") next.points.set(a.pointId, { t: a.t, y: a.y });
  else next.points.delete(a.pointId);
  return next;
}
const byKey = <T,>(m: Map<string, T>) => [...m.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
function canonicalState(rt: Runtime): FreeFallStateV1 {
  const measurements: Record<string, number> = {}, points: Record<string, { t: number; y: number }> = {};
  for (const [id, v] of byKey(rt.measurements)) measurements[id] = v;
  for (const [id, p] of byKey(rt.points)) points[id] = { t: p.t, y: p.y };
  return { v: FREE_FALL_STATE_VERSION, measurements, points };
}
export const initialFreeFallState = (): FreeFallStateV1 => ({ v: FREE_FALL_STATE_VERSION, measurements: {}, points: {} });
/** Replays raw actions from the empty state (the client workspace and the parity tests use it; the core uses the plugin functions). */
export function replayFreeFall(config: FreeFallConfigV1, rawActions: readonly unknown[]): { ok: true; actions: FreeFallAction[]; state: FreeFallStateV1 } | { ok: false; code: string } {
  if (!Array.isArray(rawActions) || rawActions.length > FREE_FALL_MAX_ACTIONS) return { ok: false, code: "FREEFALL_ACTIONS_TOO_MANY" };
  const actions: FreeFallAction[] = [];
  let rt = createRuntime();
  for (const raw of rawActions) {
    const n = normalizeFreeFallAction(raw, config);
    if (!n.ok) return n;
    actions.push(n.action);
    rt = applyAction(rt, n.action);
  }
  return { ok: true, actions, state: canonicalState(rt) };
}

// ── checks ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type MeasurementKind = "physics.impactTime" | "physics.impactSpeed" | "physics.heightAtTime" | "physics.velocityAtTime";
const CHECK_SPEC: Readonly<Record<string, { params: readonly string[]; unit?: FreeFallUnit }>> = Object.freeze({
  "physics.impactTime": { params: ["measurementId", "tolerance"], unit: "s" },
  "physics.impactSpeed": { params: ["measurementId", "tolerance"], unit: "m/s" },
  "physics.heightAtTime": { params: ["measurementId", "time", "tolerance"], unit: "m" },
  "physics.velocityAtTime": { params: ["measurementId", "time", "tolerance"], unit: "m/s" },
  "physics.pointOnTrajectory": { params: ["pointId", "tolerance"] }
});
export const FREE_FALL_CHECK_KINDS: readonly string[] = Object.freeze(Object.keys(CHECK_SPEC));
export type FreeFallCheck = SmartSimCheckBase & (
  | { kind: MeasurementKind; measurementId: string; time?: number; tolerance: number }
  | { kind: "physics.pointOnTrajectory"; pointId: string; tolerance: number });
const TOLERANCE_MAX = 1e6;

export function validateFreeFallCheck(raw: Record<string, unknown>, config: FreeFallConfigV1): { ok: true; check: FreeFallCheck } | { ok: false; issues: SmartSimIssue[] } {
  const fail = (message: string) => ({ ok: false as const, issues: [{ code: "FREEFALL_CHECK_INVALID", message }] });
  const spec = typeof raw.kind === "string" && Object.prototype.hasOwnProperty.call(CHECK_SPEC, raw.kind) ? CHECK_SPEC[raw.kind] : undefined;
  if (!spec) return fail("نوع فحص غير معروف.");
  if (!exactKeys(raw, ["id", "label", "weight", "kind", ...spec.params])) return fail("معاملات الفحص «" + String(raw.label) + "» غير مطابقة لنوعه.");
  if (!value(raw.tolerance, Number.MIN_VALUE, TOLERANCE_MAX)) return fail("السماحية في الفحص «" + String(raw.label) + "» يجب أن تكون عددًا موجبًا.");
  const base = { id: raw.id as string, label: raw.label as string, weight: raw.weight as number };
  if (raw.kind === "physics.pointOnTrajectory") {
    if (!pointOf(config, raw.pointId)) return fail("الفحص «" + String(raw.label) + "» يشير إلى نقطة غير معرّفة في المهام.");
    return { ok: true, check: { ...base, kind: "physics.pointOnTrajectory", pointId: raw.pointId as string, tolerance: raw.tolerance } };
  }
  const m = measurementOf(config, raw.measurementId);
  if (!m) return fail("الفحص «" + String(raw.label) + "» يشير إلى قياس غير معرّف في المهام.");
  if (m.unit !== spec.unit) return fail("وحدة القياس «" + m.label + "» لا تناسب نوع الفحص (" + spec.unit + ").");
  const check = { ...base, kind: raw.kind as MeasurementKind, measurementId: m.id, tolerance: raw.tolerance } as FreeFallCheck & { time?: number };
  if (spec.params.includes("time")) {
    if (!value(raw.time, 0, Math.min(config.view.maxTime, impactTime(config.model)))) return fail("زمن الفحص «" + String(raw.label) + "» يجب أن يقع داخل التجربة (من 0 حتى لحظة الارتطام).");
    check.time = raw.time;
  }
  return { ok: true, check };
}
/** The trusted expected value of a measurement check, derived from the public model (never stored, never sent to the student). */
export function expectedFreeFallValue(check: FreeFallCheck, config: FreeFallConfigV1): number {
  const m = config.model;
  switch (check.kind) {
    case "physics.impactTime": return impactTime(m);
    case "physics.impactSpeed": return impactSpeed(m);
    case "physics.heightAtTime": return heightAt(m, check.time as number);
    case "physics.velocityAtTime": return velocityAt(m, check.time as number);
    default: return NaN;
  }
}
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
export function evaluateFreeFallCheck(check: FreeFallCheck, state: FreeFallStateV1, config: FreeFallConfigV1): SmartSimCheckOutcome {
  const tol = check.tolerance;
  if (check.kind === "physics.pointOnTrajectory") {
    const p = has(state.points, check.pointId) ? state.points[check.pointId] : undefined;
    const ti = impactTime(config.model);
    if (!p) return { expected: "نقطة على المنحنى ± " + fmtPhysics(tol), actual: "—", passed: false };
    const inFlight = p.t >= 0 && p.t <= ti;
    const onCurve = inFlight ? heightAt(config.model, p.t) : NaN;
    const passed = inFlight && Math.abs(p.y - onCurve) <= tol;
    return { expected: "y(t) ± " + fmtPhysics(tol), actual: "(" + fmtPhysics(p.t) + ", " + fmtPhysics(p.y) + ")", passed, evidence: inFlight ? ["y(" + fmtPhysics(p.t) + ") = " + fmtPhysics(onCurve)] : ["t خارج زمن الطيران"] };
  }
  const expected = expectedFreeFallValue(check, config);
  const got = has(state.measurements, check.measurementId) ? state.measurements[check.measurementId] : undefined;
  const passed = typeof got === "number" && Number.isFinite(got) && Number.isFinite(expected) && Math.abs(got - expected) <= tol;
  return { expected: fmtPhysics(expected) + " ± " + fmtPhysics(tol), actual: typeof got === "number" ? fmtPhysics(got) : "—", passed };
}
/** The neutral view the opt-in generic rules read: values = measurements, points = graph points with x = t. */
export function freeFallRuleView(state: FreeFallStateV1, config: FreeFallConfigV1): SmartSimRuleView {
  const points: Record<string, { x: number; y: number }> = {};
  for (const id of Object.keys(state.points)) points[id] = { x: state.points[id].t, y: state.points[id].y };
  return { ids: [...config.tasks.measurements.map(m => m.id), ...config.tasks.points.map(p => p.id)], selected: [], points, values: { ...state.measurements }, sequence: [], relations: [] };
}

// ── descriptor and plugin ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export const PHYSICS_FREE_FALL_DESCRIPTOR_V1: SmartSimPluginDescriptorV1 = {
  descriptorVersion: 1, key: FREE_FALL_PLUGIN_KEY, version: FREE_FALL_PLUGIN_VERSION, label: FREE_FALL_LABEL, domain: "physics",
  sceneKinds: ["2d"], rendererFamilies: ["svg2d", "graph2d", "form"],
  capabilities: ["scene.2d", "simulation.play", "simulation.pause", "simulation.scrub", "graph.2d", "point.place", "value.set"],
  actionKinds: [...FREE_FALL_ACTION_KINDS], checkKinds: [...FREE_FALL_CHECK_KINDS], genericRules: ["numericNear@1", "pointNear@1"], assetKinds: [],
  tools: ["play", "pause", "scrub", "placePoint", "form"], accessibility: ["keyboardAlternative", "semanticLabels", "toolLabels", "textTranscript"],
  supports: { autosave: true, restore: true, reset: true, partialCredit: true, offline: true, twoDimensional: true, threeDimensional: false }
};
export const physicsFreeFallPluginV1: SmartSimPlugin<FreeFallConfigV1, Runtime, FreeFallStateV1, FreeFallAction, FreeFallCheck> = Object.freeze({
  key: FREE_FALL_PLUGIN_KEY,
  version: FREE_FALL_PLUGIN_VERSION,
  label: FREE_FALL_LABEL,
  maxActions: FREE_FALL_MAX_ACTIONS,
  descriptor: PHYSICS_FREE_FALL_DESCRIPTOR_V1,
  checkKinds: FREE_FALL_CHECK_KINDS,
  validateConfig: (raw: unknown) => validateFreeFallConfig(raw),
  createRuntime,
  normalizeAction: normalizeFreeFallAction,
  applyAction: (rt: Runtime, a: FreeFallAction) => applyAction(rt, a),
  canonicalState: (rt: Runtime) => canonicalState(rt),
  serializeState: (s: FreeFallStateV1) => JSON.stringify(s),
  validateCheck: validateFreeFallCheck,
  evaluateCheck: evaluateFreeFallCheck,
  ruleView: freeFallRuleView
});
