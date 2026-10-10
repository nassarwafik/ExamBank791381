// Phase 21D-A.2 — physicsLab@1, the advanced-physics SmartSim plugin (pure; compiled into the shared server build and registered by
// src/trustedSimPlugins.ts): simple pendulum, Hooke's law / spring, mechanical energy, DC circuits. It binds the advanced core
// (src/physics/labCore.ts) and the strict config (src/physicsLabModel.ts) to the SmartSim contract through the SHARED measurement-task
// mechanics (src/physics/measurementTasks.ts) — the same actions, replay and comparison as physicsMotion@1, never a second copy:
//   actions — measurement.set / clear, graphPoint.set { x, y } / clear. Play / pause / step / seek / rate, dragging the pendulum, choosing
//             which component a meter reads and the student's exploration are PRESENTATION: never actions, never stored, never graded.
//   checks  — ONE plugin kind, lab.referenceValue (a measurement within the teacher's private tolerance of a reference quantity the core
//             derives from the AUTHORED experiment) plus the opt-in generic numericNear@1 / pointNear@1. No new grading engine.
import { LAB_LIMITS, LAB_PLUGIN_KEY, LAB_PLUGIN_VERSION, LAB_PRIMARY_AXES, validateLabConfig, type LabConfigV1 } from "./physicsLabModel";
import { LAB_QUANTITY_SPEC, fmtLab, labQuantities } from "./physics/labCore";
import {
  TASK_ACTION_KINDS, applyTaskAction, canonicalTaskState, createTaskRuntime, evaluateReferenceValue, exactKeys, initialTaskState, normalizeTaskAction,
  replayTaskActions, taskRuleView, type TaskAction, type TaskBounds, type TaskRuntime, type TaskStateV1
} from "./physics/measurementTasks";
import type { SmartSimCheckBase, SmartSimCheckOutcome, SmartSimIssue, SmartSimPlugin } from "./trustedSimRegistry";
import type { SmartSimPluginDescriptorV1 } from "./trustedSimDescriptor";
import type { SmartSimRuleView } from "./trustedSimRules";

export const LAB_LABEL = "مختبر الفيزياء المتقدم (البندول، النابض، الطاقة، الدوائر)";
export const LAB_MAX_ACTIONS = 500;
export const LAB_CHECK_KINDS: readonly string[] = Object.freeze(["lab.referenceValue"]);
export type LabAction = TaskAction;
export type LabStateV1 = TaskStateV1;
export type LabCheck = SmartSimCheckBase & { kind: "lab.referenceValue"; measurementId: string; quantity: string; tolerance: number };

const VMAX = LAB_LIMITS.valueAbsMax;
const CODES = { invalid: "LAB_ACTION_INVALID", tooMany: "LAB_ACTIONS_TOO_MANY" };
const boundsOf = (c: LabConfigV1): TaskBounds => {
  const xIsTime = LAB_PRIMARY_AXES[c.experiment].xIsTime;
  return { measurementIds: c.tasks.measurements.map(m => m.id), pointIds: c.tasks.points.map(p => p.id), valueAbsMax: VMAX, pointX: { min: xIsTime ? 0 : -VMAX, max: xIsTime ? c.view.maxTime : VMAX } };
};
export const normalizeLabAction = (raw: unknown, config: LabConfigV1) => normalizeTaskAction(raw, boundsOf(config), CODES.invalid);
export const initialLabState = (): LabStateV1 => initialTaskState();
/** Replays raw actions from the empty state (the client workspace and the parity tests use it; the core uses the plugin functions). */
export const replayLab = (config: LabConfigV1, rawActions: readonly unknown[]) => replayTaskActions(rawActions, boundsOf(config), LAB_MAX_ACTIONS, CODES);

const TOLERANCE_MAX = 1e7;
/** The trusted reference value of a check: derived from the AUTHORED experiment (never stored, never sent to the student). */
export const expectedLabValue = (check: LabCheck, config: LabConfigV1): number | null =>
  labQuantities({ kind: config.experiment, params: config.params }, config.view.maxTime)[check.quantity] ?? null;
export function validateLabCheck(raw: Record<string, unknown>, config: LabConfigV1): { ok: true; check: LabCheck } | { ok: false; issues: SmartSimIssue[] } {
  const fail = (message: string) => ({ ok: false as const, issues: [{ code: "LAB_CHECK_INVALID", message }] });
  if (raw.kind !== "lab.referenceValue") return fail("نوع فحص غير معروف.");
  if (!exactKeys(raw, ["id", "label", "weight", "kind", "measurementId", "quantity", "tolerance"])) return fail("معاملات الفحص «" + String(raw.label) + "» غير مطابقة لنوعه.");
  if (typeof raw.tolerance !== "number" || !Number.isFinite(raw.tolerance) || raw.tolerance <= 0 || raw.tolerance > TOLERANCE_MAX) return fail("السماحية في الفحص «" + String(raw.label) + "» يجب أن تكون عددًا موجبًا.");
  const m = typeof raw.measurementId === "string" ? config.tasks.measurements.find(x => x.id === raw.measurementId) : undefined;
  if (!m) return fail("الفحص «" + String(raw.label) + "» يشير إلى قياس غير معرّف في المهام.");
  const q = LAB_QUANTITY_SPEC[config.experiment].find(s => s.id === raw.quantity);
  if (!q) return fail("الكمية المرجعية في الفحص «" + String(raw.label) + "» غير معروفة لهذه التجربة.");
  if (q.unit !== m.unit) return fail("وحدة القياس «" + m.label + "» لا تناسب الكمية «" + q.label + "» (" + q.unit + ").");
  const check: LabCheck = { id: raw.id as string, label: raw.label as string, weight: raw.weight as number, kind: "lab.referenceValue", measurementId: m.id, quantity: q.id, tolerance: raw.tolerance };
  const expected = expectedLabValue(check, config);
  if (expected === null || !Number.isFinite(expected)) return fail("الكمية «" + q.label + "» غير معرّفة في هذه التجربة بقيمها الحالية (مثلًا لا تكتمل اهتزازة خلال مدة التجربة أو التخميد حرج/فوق حرج).");
  return { ok: true, check };
}
export const evaluateLabCheck = (check: LabCheck, state: LabStateV1, config: LabConfigV1): SmartSimCheckOutcome =>
  evaluateReferenceValue(expectedLabValue(check, config), state, check.measurementId, check.tolerance, fmtLab);
export const labRuleView = (state: LabStateV1, config: LabConfigV1): SmartSimRuleView =>
  taskRuleView(state, config.tasks.measurements.map(m => m.id), config.tasks.points.map(p => p.id));

export const PHYSICS_LAB_DESCRIPTOR_V1: SmartSimPluginDescriptorV1 = {
  descriptorVersion: 1, key: LAB_PLUGIN_KEY, version: LAB_PLUGIN_VERSION, label: LAB_LABEL, domain: "physics",
  sceneKinds: ["2d"], rendererFamilies: ["svg2d", "graph2d", "form"],
  capabilities: ["scene.2d", "simulation.play", "simulation.pause", "simulation.scrub", "graph.2d", "point.place", "value.set"],
  actionKinds: [...TASK_ACTION_KINDS], checkKinds: [...LAB_CHECK_KINDS], genericRules: ["numericNear@1", "pointNear@1"], assetKinds: [],
  tools: ["play", "pause", "scrub", "placePoint", "form"], accessibility: ["keyboardAlternative", "semanticLabels", "toolLabels", "textTranscript"],
  supports: { autosave: true, restore: true, reset: true, partialCredit: true, offline: true, twoDimensional: true, threeDimensional: false }
};
export const physicsLabPluginV1: SmartSimPlugin<LabConfigV1, TaskRuntime, LabStateV1, LabAction, LabCheck> = Object.freeze({
  key: LAB_PLUGIN_KEY,
  version: LAB_PLUGIN_VERSION,
  label: LAB_LABEL,
  maxActions: LAB_MAX_ACTIONS,
  descriptor: PHYSICS_LAB_DESCRIPTOR_V1,
  checkKinds: LAB_CHECK_KINDS,
  validateConfig: (raw: unknown) => validateLabConfig(raw),
  createRuntime: createTaskRuntime,
  normalizeAction: normalizeLabAction,
  applyAction: (rt: TaskRuntime, a: LabAction) => applyTaskAction(rt, a),
  canonicalState: (rt: TaskRuntime) => canonicalTaskState(rt),
  serializeState: (s: LabStateV1) => JSON.stringify(s),
  validateCheck: validateLabCheck,
  evaluateCheck: evaluateLabCheck,
  ruleView: labRuleView
});
