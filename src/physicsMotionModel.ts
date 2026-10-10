// Phase 21D-A.1 — physicsMotion@1: the PUBLIC configuration of the motion experiments (pure; compiled into the shared server build).
//
// One versioned contract for four experiments that share the physics core (src/physics/motionCore.ts): freeFall, projectile, newton2,
// incline. physicsFreeFall@1 is untouched and keeps serving existing exams; this is a NEW exact identity (no migration of stored data).
//   { v: 1, experiment, params, controls, view, tasks }
//   params   — the authored experiment (SI; exact keys per experiment; bounds and cross-constraints from the core).
//   controls — the parameters the teacher lets the student change while exploring, each with its own [min, max] and step (inside the
//              core bounds, containing the authored value). Exploration is PRESENTATION: it is never an action, never stored, never graded;
//              graded tasks always refer to the authored experiment.
//   view     — experiment duration (s), the optional graphs next to the primary one, whether force / motion vectors are shown.
//   tasks    — the student's measurement tasks (with a unit) and graph-point tasks on the primary graph.
// Strict: exact keys, exact version, finite bounded numbers; anything else is REFUSED, never clamped or repaired.
import { hasControlCharacter, isPlainObject, isSemanticId } from "./trustedSimVocabulary";
import { MOTION_PARAM_SPEC, isMotionKind, motionNaturalEnd, motionParamsProblem, validateMotionParams, type MotionKind, type MotionParams } from "./physics/motionCore";

export const MOTION_PLUGIN_KEY = "physicsMotion";
export const MOTION_PLUGIN_VERSION = 1;
export const MOTION_CONFIG_VERSION = 1 as const;
export const MOTION_LIMITS = Object.freeze({ maxTimeMax: 600, measurements: 12, points: 12, labelChars: 80, valueAbsMax: 1e6 });
export const MOTION_TASK_UNITS: readonly string[] = Object.freeze(["s", "m", "m/s", "m/s²", "N"]);
export type MotionTaskUnit = "s" | "m" | "m/s" | "m/s²" | "N";
/** Optional graphs per experiment (the PRIMARY graph — where graph points are placed — is always shown). */
export const MOTION_GRAPHS: Readonly<Record<MotionKind, readonly string[]>> = Object.freeze({
  freeFall: Object.freeze(["velocity", "acceleration"]), projectile: Object.freeze(["height", "velocity"]),
  newton2: Object.freeze(["velocity", "acceleration"]), incline: Object.freeze(["velocity", "acceleration"])
});
/** The primary graph's axes: the x axis is time except for the projectile's trajectory (y against x). */
export const MOTION_PRIMARY_AXES: Readonly<Record<MotionKind, { x: string; y: string; xUnit: string; yUnit: string; title: string; xIsTime: boolean }>> = Object.freeze({
  freeFall: { x: "t", y: "y", xUnit: "s", yUnit: "m", title: "الارتفاع مع الزمن", xIsTime: true },
  projectile: { x: "x", y: "y", xUnit: "m", yUnit: "m", title: "مسار المقذوف", xIsTime: false },
  newton2: { x: "t", y: "x", xUnit: "s", yUnit: "m", title: "الإزاحة مع الزمن", xIsTime: true },
  incline: { x: "t", y: "s", xUnit: "s", yUnit: "m", title: "المسافة على المستوى مع الزمن", xIsTime: true }
});
export const MOTION_EXPERIMENT_LABEL: Readonly<Record<MotionKind, string>> = Object.freeze({
  freeFall: "السقوط الحر", projectile: "حركة المقذوفات", newton2: "قانون نيوتن الثاني", incline: "المستوى المائل"
});
export type MotionControl = { param: string; min: number; max: number; step: number };
export type MotionView = { maxTime: number; graphs: string[]; showVectors: boolean };
export type MotionMeasurementTask = { id: string; label: string; unit: MotionTaskUnit };
export type MotionPointTask = { id: string; label: string };
export type MotionConfigV1 = { v: 1; experiment: MotionKind; params: MotionParams; controls: MotionControl[]; view: MotionView; tasks: { measurements: MotionMeasurementTask[]; points: MotionPointTask[] } };
export type MotionIssue = { code: string; message: string; path?: string };
export type MotionConfigResult = { ok: true; config: MotionConfigV1 } | { ok: false; issues: MotionIssue[] };

const L = MOTION_LIMITS;
const ROOT_KEYS = ["v", "experiment", "params", "controls", "view", "tasks"] as const;
const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(o, k));
const num = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const isLabel = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= L.labelChars && !hasControlCharacter(v);

/** The control limits a student exploration value must respect (undefined if the parameter is not student-adjustable). */
export const motionControlOf = (c: Pick<MotionConfigV1, "controls">, param: string): MotionControl | undefined => c.controls.find(k => k.param === param);
/** A candidate exploration parameter set: every changed value is a permitted control inside its limits, and the set is physically valid. */
export function motionExplorationProblem(c: MotionConfigV1, candidate: MotionParams): string | undefined {
  for (const s of MOTION_PARAM_SPEC[c.experiment]) {
    const v = candidate[s.key];
    if (v === c.params[s.key]) continue;
    const k = motionControlOf(c, s.key);
    if (!k) return s.label + " غير قابل للتعديل في هذه التجربة.";
    if (!num(v, k.min, k.max)) return s.label + " يجب أن يكون بين " + k.min + " و" + k.max + ".";
  }
  return motionParamsProblem(c.experiment, candidate);
}

export function validateMotionConfig(raw: unknown): MotionConfigResult {
  const issues: MotionIssue[] = [];
  const add = (code: string, message: string, path: string) => { issues.push({ code, message, path }); };
  const P = "smartSim.config";
  if (!isPlainObject(raw)) return { ok: false, issues: [{ code: "MOTION_CONFIG_INVALID", message: "إعداد تجربة الحركة مفقود أو غير صالح.", path: P }] };
  for (const k of Object.keys(raw)) if (!(ROOT_KEYS as readonly string[]).includes(k)) add("MOTION_CONFIG_UNKNOWN_KEY", "حقل غير مسموح في إعداد تجربة الحركة: " + k, P + "." + k);
  if (raw.v !== MOTION_CONFIG_VERSION) add("MOTION_CONFIG_VERSION_UNSUPPORTED", "إصدار إعداد تجربة الحركة غير مدعوم.", P + ".v");
  if (!isMotionKind(raw.experiment)) { add("MOTION_EXPERIMENT_UNKNOWN", "نوع التجربة غير مدعوم (السقوط الحر، المقذوفات، قانون نيوتن الثاني، المستوى المائل).", P + ".experiment"); return { ok: false, issues }; }
  const kind = raw.experiment;
  const problem = motionParamsProblem(kind, raw.params);
  if (problem) add("MOTION_PARAMS_INVALID", "القيم الفيزيائية غير صالحة: " + problem, P + ".params");
  const params = problem ? undefined : validateMotionParams(kind, raw.params);
  const controls = validateControls(raw.controls, kind, params, add);
  const view = validateView(raw.view, kind, params, add);
  const tasks = validateTasks(raw.tasks, add);
  if (issues.length || !params || !controls || !view || !tasks) return { ok: false, issues };
  return { ok: true, config: { v: MOTION_CONFIG_VERSION, experiment: kind, params, controls, view, tasks } };
}

function validateControls(raw: unknown, kind: MotionKind, params: MotionParams | undefined, add: (c: string, m: string, p: string) => void): MotionControl[] | undefined {
  const where = "smartSim.config.controls", spec = MOTION_PARAM_SPEC[kind];
  if (!Array.isArray(raw) || raw.length > spec.length) { add("MOTION_CONTROLS_INVALID", "قائمة عناصر التحكم المسموحة للطالب غير صالحة.", where); return undefined; }
  const out: MotionControl[] = [], seen = new Set<string>();
  let ok = true;
  raw.forEach((c, i) => {
    const path = where + "[" + i + "]", s = isPlainObject(c) ? spec.find(x => x.key === c.param) : undefined;
    if (!isPlainObject(c) || !exactKeys(c, ["param", "min", "max", "step"]) || !s || seen.has(s.key)) { add("MOTION_CONTROLS_INVALID", "عنصر التحكم رقم " + (i + 1) + " غير صالح أو مكرر.", path); ok = false; return; }
    if (!num(c.min, s.min, s.max) || !num(c.max, s.min, s.max) || !(c.min < c.max) || !num(c.step, Number.MIN_VALUE, c.max - c.min)) {
      add("MOTION_CONTROL_LIMITS_INVALID", "حدود «" + s.label + "» يجب أن تقع داخل " + s.min + "–" + s.max + " مع حد أدنى أصغر من الأعلى وخطوة موجبة.", path); ok = false; return;
    }
    if (params && !(params[s.key] >= c.min && params[s.key] <= c.max)) { add("MOTION_CONTROL_EXCLUDES_AUTHORED", "حدود «" + s.label + "» يجب أن تشمل قيمة التجربة المعتمدة (" + params[s.key] + ").", path); ok = false; return; }
    seen.add(s.key); out.push({ param: s.key, min: c.min, max: c.max, step: c.step });
  });
  return ok ? out : undefined;
}
function validateView(raw: unknown, kind: MotionKind, params: MotionParams | undefined, add: (c: string, m: string, p: string) => void): MotionView | undefined {
  const where = "smartSim.config.view", allowed = MOTION_GRAPHS[kind];
  if (!isPlainObject(raw) || !exactKeys(raw, ["maxTime", "graphs", "showVectors"]) || !num(raw.maxTime, Number.MIN_VALUE, L.maxTimeMax) || typeof raw.showVectors !== "boolean"
    || !Array.isArray(raw.graphs) || raw.graphs.some(g => typeof g !== "string" || !allowed.includes(g)) || new Set(raw.graphs).size !== raw.graphs.length) {
    add("MOTION_VIEW_INVALID", "إعداد العرض غير صالح: مدة التجربة عدد موجب حتى " + L.maxTimeMax + " ث، والرسوم من: " + allowed.join("، ") + ".", where); return undefined;
  }
  if (params && (kind === "freeFall" || kind === "projectile")) {
    const end = motionNaturalEnd({ kind, params });
    if (raw.maxTime < end) { add("MOTION_VIEW_TOO_SHORT", "مدة التجربة أقصر من زمن وصول الجسم إلى الأرض (" + String(Number(end.toPrecision(6))) + " ث).", where + ".maxTime"); return undefined; }
  }
  return { maxTime: raw.maxTime, graphs: allowed.filter(g => (raw.graphs as string[]).includes(g)), showVectors: raw.showVectors };
}
function validateTasks(raw: unknown, add: (c: string, m: string, p: string) => void): MotionConfigV1["tasks"] | undefined {
  const where = "smartSim.config.tasks";
  if (!isPlainObject(raw) || !exactKeys(raw, ["measurements", "points"]) || !Array.isArray(raw.measurements) || !Array.isArray(raw.points)) { add("MOTION_TASK_INVALID", "قائمة المهام غير صالحة.", where); return undefined; }
  if (raw.measurements.length > L.measurements || raw.points.length > L.points) { add("MOTION_TASKS_TOO_MANY", "عدد المهام يتجاوز الحد (" + L.measurements + " قياسًا و" + L.points + " نقطة).", where); return undefined; }
  if (raw.measurements.length + raw.points.length === 0) { add("MOTION_TASKS_EMPTY", "أضف مهمة قياس أو نقطة واحدة على الأقل.", where); return undefined; }
  let ok = true;
  const seen = new Set<string>();
  const ident = (id: unknown, path: string): id is string => {
    if (!isSemanticId(id)) { add("MOTION_TASK_INVALID", "معرّف المهمة غير صالح.", path); ok = false; return false; }
    if (seen.has(id)) { add("MOTION_TASK_ID_DUPLICATE", "معرّف مهمة مكرر: " + id, path); ok = false; return false; }
    seen.add(id); return true;
  };
  const measurements: MotionMeasurementTask[] = [];
  raw.measurements.forEach((m, i) => {
    const path = where + ".measurements[" + i + "]";
    if (!isPlainObject(m) || !exactKeys(m, ["id", "label", "unit"]) || !isLabel(m.label) || typeof m.unit !== "string" || !MOTION_TASK_UNITS.includes(m.unit)) {
      add("MOTION_TASK_INVALID", "مهمة القياس رقم " + (i + 1) + " غير صالحة (المعرّف، الوصف حتى " + L.labelChars + " حرفًا، الوحدة من " + MOTION_TASK_UNITS.join(" ") + ").", path); ok = false; return;
    }
    if (ident(m.id, path)) measurements.push({ id: m.id, label: m.label, unit: m.unit as MotionTaskUnit });
  });
  const points: MotionPointTask[] = [];
  raw.points.forEach((p, i) => {
    const path = where + ".points[" + i + "]";
    if (!isPlainObject(p) || !exactKeys(p, ["id", "label"]) || !isLabel(p.label)) { add("MOTION_TASK_INVALID", "مهمة النقطة رقم " + (i + 1) + " غير صالحة.", path); ok = false; return; }
    if (ident(p.id, path)) points.push({ id: p.id, label: p.label });
  });
  return ok ? { measurements, points } : undefined;
}
