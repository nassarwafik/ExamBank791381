// Phase 21D-A.2 — the SHARED measurement-task mechanics of the trusted physics plugins (pure; compiled into the shared server build).
// Extracted unchanged from physicsMotion@1 (Phase 21D-A.1) so that every physics plugin uses ONE implementation of what a student may
// submit and how it is replayed and compared — never a second copy of trusted grading logic:
//   actions — SEMANTIC submissions only: measurement.set { measurementId, value } / measurement.clear and graphPoint.set { pointId, x, y } /
//             graphPoint.clear, strictly normalized against the declared tasks (exact keys, declared ids, finite bounded numbers).
//   state   — { v: 1, measurements: { id: value }, points: { id: { x, y } } } — tiny, sorted, rebuilt by replay.
//   compare — a measurement against a trusted reference value within the teacher's private absolute tolerance.
// The plugins bind it to their own config (task lists, the primary graph's x bounds) and their own error codes.
import { isPlainObject } from "../trustedSimVocabulary";
import type { SmartSimCheckOutcome } from "../trustedSimRegistry";
import type { SmartSimRuleView } from "../trustedSimRules";

export const TASK_STATE_VERSION = 1 as const;
export const TASK_ACTION_KINDS: readonly string[] = Object.freeze(["measurement.set", "measurement.clear", "graphPoint.set", "graphPoint.clear"]);
export type TaskAction =
  | { type: "measurement.set"; measurementId: string; value: number }
  | { type: "measurement.clear"; measurementId: string }
  | { type: "graphPoint.set"; pointId: string; x: number; y: number }
  | { type: "graphPoint.clear"; pointId: string };
export type TaskStateV1 = { v: 1; measurements: Record<string, number>; points: Record<string, { x: number; y: number }> };
export type TaskRuntime = { measurements: Map<string, number>; points: Map<string, { x: number; y: number }> };
/** What a plugin's config allows: its declared task ids, the value bound and the primary graph's x range for points. */
export type TaskBounds = { measurementIds: readonly string[]; pointIds: readonly string[]; valueAbsMax: number; pointX: { min: number; max: number } };

export const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(o, k));
const value = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const declared = (ids: readonly string[], id: unknown): id is string => typeof id === "string" && ids.includes(id);

export function normalizeTaskAction(raw: unknown, b: TaskBounds, invalidCode: string): { ok: true; action: TaskAction } | { ok: false; code: string } {
  const bad = { ok: false as const, code: invalidCode }, V = b.valueAbsMax;
  if (!isPlainObject(raw) || typeof raw.type !== "string") return bad;
  switch (raw.type) {
    case "measurement.set":
      if (!exactKeys(raw, ["type", "measurementId", "value"]) || !declared(b.measurementIds, raw.measurementId) || !value(raw.value, -V, V)) return bad;
      return { ok: true, action: { type: "measurement.set", measurementId: raw.measurementId, value: raw.value } };
    case "measurement.clear":
      if (!exactKeys(raw, ["type", "measurementId"]) || !declared(b.measurementIds, raw.measurementId)) return bad;
      return { ok: true, action: { type: "measurement.clear", measurementId: raw.measurementId } };
    case "graphPoint.set":
      if (!exactKeys(raw, ["type", "pointId", "x", "y"]) || !declared(b.pointIds, raw.pointId) || !value(raw.x, b.pointX.min, b.pointX.max) || !value(raw.y, -V, V)) return bad;
      return { ok: true, action: { type: "graphPoint.set", pointId: raw.pointId, x: raw.x, y: raw.y } };
    case "graphPoint.clear":
      if (!exactKeys(raw, ["type", "pointId"]) || !declared(b.pointIds, raw.pointId)) return bad;
      return { ok: true, action: { type: "graphPoint.clear", pointId: raw.pointId } };
    default:
      return bad;
  }
}
export const createTaskRuntime = (): TaskRuntime => ({ measurements: new Map(), points: new Map() });
export function applyTaskAction(rt: TaskRuntime, a: TaskAction): TaskRuntime {
  const next: TaskRuntime = { measurements: new Map(rt.measurements), points: new Map(rt.points) };
  if (a.type === "measurement.set") next.measurements.set(a.measurementId, a.value);
  else if (a.type === "measurement.clear") next.measurements.delete(a.measurementId);
  else if (a.type === "graphPoint.set") next.points.set(a.pointId, { x: a.x, y: a.y });
  else next.points.delete(a.pointId);
  return next;
}
const byKey = <T,>(m: Map<string, T>) => [...m.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
export function canonicalTaskState(rt: TaskRuntime): TaskStateV1 {
  const measurements: Record<string, number> = {}, points: Record<string, { x: number; y: number }> = {};
  for (const [id, v] of byKey(rt.measurements)) measurements[id] = v;
  for (const [id, p] of byKey(rt.points)) points[id] = { x: p.x, y: p.y };
  return { v: TASK_STATE_VERSION, measurements, points };
}
export const initialTaskState = (): TaskStateV1 => ({ v: TASK_STATE_VERSION, measurements: {}, points: {} });
/** Replays raw actions from the empty state (client workspaces and parity tests use it; the SmartSim core uses the plugin functions). */
export function replayTaskActions(rawActions: readonly unknown[], b: TaskBounds, maxActions: number, codes: { invalid: string; tooMany: string }):
  { ok: true; actions: TaskAction[]; state: TaskStateV1 } | { ok: false; code: string } {
  if (!Array.isArray(rawActions) || rawActions.length > maxActions) return { ok: false, code: codes.tooMany };
  const actions: TaskAction[] = [];
  let rt = createTaskRuntime();
  for (const raw of rawActions) {
    const n = normalizeTaskAction(raw, b, codes.invalid);
    if (!n.ok) return n;
    actions.push(n.action);
    rt = applyTaskAction(rt, n.action);
  }
  return { ok: true, actions, state: canonicalTaskState(rt) };
}
/** A measurement against a trusted reference value (null / non-finite reference ⇒ never passes). */
export function evaluateReferenceValue(expected: number | null, state: TaskStateV1, measurementId: string, tolerance: number, fmt: (n: number | null) => string): SmartSimCheckOutcome {
  const got = Object.prototype.hasOwnProperty.call(state.measurements, measurementId) ? state.measurements[measurementId] : undefined;
  const passed = typeof got === "number" && Number.isFinite(got) && expected !== null && Number.isFinite(expected) && Math.abs(got - expected) <= tolerance;
  return { expected: fmt(expected) + " ± " + fmt(tolerance), actual: typeof got === "number" ? fmt(got) : "—", passed };
}
/** The neutral view the opt-in generic rules (numericNear@1, pointNear@1) read: values = measurements, points = primary-graph points. */
export function taskRuleView(state: TaskStateV1, measurementIds: readonly string[], pointIds: readonly string[]): SmartSimRuleView {
  const points: Record<string, { x: number; y: number }> = {};
  for (const id of Object.keys(state.points)) points[id] = { x: state.points[id].x, y: state.points[id].y };
  return { ids: [...measurementIds, ...pointIds], selected: [], points, values: { ...state.measurements }, sequence: [], relations: [] };
}
