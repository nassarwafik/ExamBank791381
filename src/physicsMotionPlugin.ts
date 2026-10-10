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
import {
  TASK_ACTION_KINDS, TASK_STATE_VERSION, applyTaskAction, canonicalTaskState, createTaskRuntime, evaluateReferenceValue, exactKeys, initialTaskState,
  normalizeTaskAction, replayTaskActions, taskRuleView, type TaskAction, type TaskBounds, type TaskRuntime, type TaskStateV1
} from "./physics/measurementTasks";
import type { SmartSimCheckBase, SmartSimCheckOutcome, SmartSimIssue, SmartSimPlugin } from "./trustedSimRegistry";
import type { SmartSimPluginDescriptorV1 } from "./trustedSimDescriptor";
import type { SmartSimRuleView } from "./trustedSimRules";

// Phase 21D-A.2 — the action / state / replay / comparison mechanics moved, unchanged, to the shared src/physics/measurementTasks.ts
// (also used by physicsLab@1); this module binds them to the physicsMotion@1 config and keeps its public names and error codes.
export const MOTION_LABEL = "تجارب الحركة (فيزياء)";
export const MOTION_STATE_VERSION = TASK_STATE_VERSION;
export const MOTION_MAX_ACTIONS = 500;
export const MOTION_ACTION_KINDS: readonly string[] = TASK_ACTION_KINDS;
export const MOTION_CHECK_KINDS: readonly string[] = Object.freeze(["motion.referenceValue"]);
export type MotionAction = TaskAction;
export type MotionStateV1 = TaskStateV1;
export type MotionCheck = SmartSimCheckBase & { kind: "motion.referenceValue"; measurementId: string; quantity: string; tolerance: number };
type Runtime = TaskRuntime;

const value = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const VMAX = MOTION_LIMITS.valueAbsMax;
const measurementOf = (c: MotionConfigV1, id: unknown) => (typeof id === "string" ? c.tasks.measurements.find(m => m.id === id) : undefined);
/** The task bounds of a motion config: the primary graph's x axis is [0, maxTime] when it is time, else ±valueAbsMax. */
const boundsOf = (c: MotionConfigV1): TaskBounds => {
  const xIsTime = MOTION_PRIMARY_AXES[c.experiment].xIsTime;
  return { measurementIds: c.tasks.measurements.map(m => m.id), pointIds: c.tasks.points.map(p => p.id), valueAbsMax: VMAX, pointX: { min: xIsTime ? 0 : -VMAX, max: xIsTime ? c.view.maxTime : VMAX } };
};
const CODES = { invalid: "MOTION_ACTION_INVALID", tooMany: "MOTION_ACTIONS_TOO_MANY" };

export function normalizeMotionAction(raw: unknown, config: MotionConfigV1): { ok: true; action: MotionAction } | { ok: false; code: string } {
  return normalizeTaskAction(raw, boundsOf(config), CODES.invalid);
}
const createRuntime = createTaskRuntime;
const applyAction = applyTaskAction;
const canonicalState = canonicalTaskState;
export const initialMotionState = (): MotionStateV1 => initialTaskState();
/** Replays raw actions from the empty state (the client workspace and the parity tests use it; the core uses the plugin functions). */
export function replayMotion(config: MotionConfigV1, rawActions: readonly unknown[]): { ok: true; actions: MotionAction[]; state: MotionStateV1 } | { ok: false; code: string } {
  return replayTaskActions(rawActions, boundsOf(config), MOTION_MAX_ACTIONS, CODES);
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
export function evaluateMotionCheck(check: MotionCheck, state: MotionStateV1, config: MotionConfigV1): SmartSimCheckOutcome {
  return evaluateReferenceValue(expectedMotionValue(check, config), state, check.measurementId, check.tolerance, fmtMotion);
}
/** The neutral view the opt-in generic rules read: values = measurements, points = primary-graph points. */
export function motionRuleView(state: MotionStateV1, config: MotionConfigV1): SmartSimRuleView {
  return taskRuleView(state, config.tasks.measurements.map(m => m.id), config.tasks.points.map(p => p.id));
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
