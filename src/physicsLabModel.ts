// Phase 21D-A.2 — physicsLab@1: the PUBLIC configuration of the advanced physics experiments (pure; compiled into the shared server build).
//
// One versioned contract for four experiments that share the advanced core (src/physics/labCore.ts): pendulum (SIM-05), spring (SIM-06),
// energy (SIM-07), circuit (SIM-08). physicsFreeFall@1 and physicsMotion@1 are untouched; this is a NEW exact identity. The shape is the
// physicsMotion@1 shape, so authors and students meet one model:
//   { v: 1, experiment, params, controls, view, tasks }
//   params   — the authored experiment (SI; exact keys per experiment; bounds, integer options and cross-constraints from the core).
//   controls — the parameters the teacher lets the student change while exploring, each with its own [min, max] and step (inside the
//              core bounds, containing the authored value; option parameters use whole steps). Exploration is PRESENTATION: never an
//              action, never stored, never graded — graded tasks always refer to the authored experiment (experiment-based grading = A.3).
//   view     — experiment / animation duration (s, ≤ 120), the optional graphs next to the primary one, whether vectors are shown.
//   tasks    — the student's measurement tasks (with a unit) and graph-point tasks on the primary graph.
// Strict: exact keys, exact version, finite bounded numbers; anything else is REFUSED, never clamped or repaired.
import { hasControlCharacter, isPlainObject, isSemanticId } from "./trustedSimVocabulary";
import { LAB_PARAM_SPEC, isLabKind, labEndTime, labParamsProblem, validateLabParams, type LabKind, type LabParams } from "./physics/labCore";

export const LAB_PLUGIN_KEY = "physicsLab";
export const LAB_PLUGIN_VERSION = 1;
export const LAB_CONFIG_VERSION = 1 as const;
export const LAB_LIMITS = Object.freeze({ maxTimeMax: 120, measurements: 12, points: 12, labelChars: 80, valueAbsMax: 1e7 });
export const LAB_TASK_UNITS: readonly string[] = Object.freeze(["s", "m", "m/s", "m/s²", "N", "J", "W", "V", "A", "Ω", "rad/s"]);
export type LabTaskUnit = "s" | "m" | "m/s" | "m/s²" | "N" | "J" | "W" | "V" | "A" | "Ω" | "rad/s";
/** Optional graphs per experiment (the PRIMARY graph — where graph points are placed — is always shown). */
export const LAB_GRAPHS: Readonly<Record<LabKind, readonly string[]>> = Object.freeze({
  pendulum: Object.freeze(["angularVelocity", "energy"]), spring: Object.freeze(["force", "velocity", "energy"]),
  energy: Object.freeze(["height", "velocity"]), circuit: Object.freeze(["power"])
});
/** The primary graph's axes (x is time except for the circuit's current–voltage characteristic). */
export const LAB_PRIMARY_AXES: Readonly<Record<LabKind, { x: string; y: string; xUnit: string; yUnit: string; title: string; xIsTime: boolean }>> = Object.freeze({
  pendulum: { x: "t", y: "θ", xUnit: "s", yUnit: "°", title: "زاوية البندول مع الزمن", xIsTime: true },
  spring: { x: "t", y: "x", xUnit: "s", yUnit: "m", title: "الإزاحة عن الاتزان مع الزمن", xIsTime: true },
  energy: { x: "t", y: "E", xUnit: "s", yUnit: "J", title: "الطاقة مع الزمن", xIsTime: true },
  circuit: { x: "V", y: "I", xUnit: "V", yUnit: "A", title: "منحنى التيار–الجهد للدائرة", xIsTime: false }
});
export const LAB_EXPERIMENT_LABEL: Readonly<Record<LabKind, string>> = Object.freeze({
  pendulum: "البندول البسيط", spring: "قانون هوك والنابض", energy: "الطاقة الميكانيكية", circuit: "الدوائر الكهربائية المستمرة"
});
export type LabControl = { param: string; min: number; max: number; step: number };
export type LabView = { maxTime: number; graphs: string[]; showVectors: boolean };
export type LabMeasurementTask = { id: string; label: string; unit: LabTaskUnit };
export type LabPointTask = { id: string; label: string };
export type LabConfigV1 = { v: 1; experiment: LabKind; params: LabParams; controls: LabControl[]; view: LabView; tasks: { measurements: LabMeasurementTask[]; points: LabPointTask[] } };
export type LabIssue = { code: string; message: string; path?: string };
export type LabConfigResult = { ok: true; config: LabConfigV1 } | { ok: false; issues: LabIssue[] };

const L = LAB_LIMITS;
const ROOT_KEYS = ["v", "experiment", "params", "controls", "view", "tasks"] as const;
const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(o, k));
const num = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const isLabel = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= L.labelChars && !hasControlCharacter(v);

export const labControlOf = (c: Pick<LabConfigV1, "controls">, param: string): LabControl | undefined => c.controls.find(k => k.param === param);
/** A candidate exploration parameter set: every changed value is a permitted control inside its limits, and the set is physically valid. */
export function labExplorationProblem(c: LabConfigV1, candidate: LabParams): string | undefined {
  for (const s of LAB_PARAM_SPEC[c.experiment]) {
    const v = candidate[s.key];
    if (v === c.params[s.key]) continue;
    const k = labControlOf(c, s.key);
    if (!k) return s.label + " غير قابل للتعديل في هذه التجربة.";
    if (!num(v, k.min, k.max)) return s.label + " يجب أن يكون بين " + k.min + " و" + k.max + ".";
  }
  return labParamsProblem(c.experiment, candidate);
}

export function validateLabConfig(raw: unknown): LabConfigResult {
  const issues: LabIssue[] = [];
  const add = (code: string, message: string, path: string) => { issues.push({ code, message, path }); };
  const P = "smartSim.config";
  if (!isPlainObject(raw)) return { ok: false, issues: [{ code: "LAB_CONFIG_INVALID", message: "إعداد تجربة المختبر مفقود أو غير صالح.", path: P }] };
  for (const k of Object.keys(raw)) if (!(ROOT_KEYS as readonly string[]).includes(k)) add("LAB_CONFIG_UNKNOWN_KEY", "حقل غير مسموح في إعداد تجربة المختبر: " + k, P + "." + k);
  if (raw.v !== LAB_CONFIG_VERSION) add("LAB_CONFIG_VERSION_UNSUPPORTED", "إصدار إعداد تجربة المختبر غير مدعوم.", P + ".v");
  if (!isLabKind(raw.experiment)) { add("LAB_EXPERIMENT_UNKNOWN", "نوع التجربة غير مدعوم (البندول، النابض، الطاقة الميكانيكية، الدوائر الكهربائية).", P + ".experiment"); return { ok: false, issues }; }
  const kind = raw.experiment;
  const problem = labParamsProblem(kind, raw.params);
  if (problem) add("LAB_PARAMS_INVALID", "القيم الفيزيائية غير صالحة: " + problem, P + ".params");
  const params = problem ? undefined : validateLabParams(kind, raw.params);
  const controls = validateControls(raw.controls, kind, params, add);
  const view = validateView(raw.view, kind, params, add);
  const tasks = validateTasks(raw.tasks, add);
  if (issues.length || !params || !controls || !view || !tasks) return { ok: false, issues };
  return { ok: true, config: { v: LAB_CONFIG_VERSION, experiment: kind, params, controls, view, tasks } };
}

function validateControls(raw: unknown, kind: LabKind, params: LabParams | undefined, add: (c: string, m: string, p: string) => void): LabControl[] | undefined {
  const where = "smartSim.config.controls", spec = LAB_PARAM_SPEC[kind];
  if (!Array.isArray(raw) || raw.length > spec.length) { add("LAB_CONTROLS_INVALID", "قائمة عناصر التحكم المسموحة للطالب غير صالحة.", where); return undefined; }
  const out: LabControl[] = [], seen = new Set<string>();
  let ok = true;
  raw.forEach((c, i) => {
    const path = where + "[" + i + "]", s = isPlainObject(c) ? spec.find(x => x.key === c.param) : undefined;
    if (!isPlainObject(c) || !exactKeys(c, ["param", "min", "max", "step"]) || !s || seen.has(s.key)) { add("LAB_CONTROLS_INVALID", "عنصر التحكم رقم " + (i + 1) + " غير صالح أو مكرر.", path); ok = false; return; }
    const whole = !s.integer || (Number.isInteger(c.min) && Number.isInteger(c.max) && c.step === 1);
    if (!num(c.min, s.min, s.max) || !num(c.max, s.min, s.max) || !(c.min < c.max) || !num(c.step, Number.MIN_VALUE, c.max - c.min) || !whole) {
      add("LAB_CONTROL_LIMITS_INVALID", "حدود «" + s.label + "» يجب أن تقع داخل " + s.min + "–" + s.max + " مع حد أدنى أصغر من الأعلى وخطوة موجبة" + (s.integer ? " (خيارات صحيحة وخطوة 1)" : "") + ".", path); ok = false; return;
    }
    if (params && !(params[s.key] >= c.min && params[s.key] <= c.max)) { add("LAB_CONTROL_EXCLUDES_AUTHORED", "حدود «" + s.label + "» يجب أن تشمل قيمة التجربة المعتمدة (" + params[s.key] + ").", path); ok = false; return; }
    seen.add(s.key); out.push({ param: s.key, min: c.min, max: c.max, step: c.step });
  });
  return ok ? out : undefined;
}
function validateView(raw: unknown, kind: LabKind, params: LabParams | undefined, add: (c: string, m: string, p: string) => void): LabView | undefined {
  const where = "smartSim.config.view", allowed = LAB_GRAPHS[kind];
  if (!isPlainObject(raw) || !exactKeys(raw, ["maxTime", "graphs", "showVectors"]) || !num(raw.maxTime, Number.MIN_VALUE, L.maxTimeMax) || typeof raw.showVectors !== "boolean"
    || !Array.isArray(raw.graphs) || raw.graphs.some(g => typeof g !== "string" || !allowed.includes(g)) || new Set(raw.graphs).size !== raw.graphs.length) {
    add("LAB_VIEW_INVALID", "إعداد العرض غير صالح: مدة التجربة عدد موجب حتى " + L.maxTimeMax + " ث، والرسوم من: " + allowed.join("، ") + ".", where); return undefined;
  }
  if (params && kind === "energy") {
    const end = labEndTime({ kind, params }, Infinity);
    if (raw.maxTime < end) { add("LAB_VIEW_TOO_SHORT", "مدة التجربة أقصر من زمن وصول الجسم إلى الأرض (" + String(Number(end.toPrecision(6))) + " ث).", where + ".maxTime"); return undefined; }
  }
  return { maxTime: raw.maxTime, graphs: allowed.filter(g => (raw.graphs as string[]).includes(g)), showVectors: raw.showVectors };
}
function validateTasks(raw: unknown, add: (c: string, m: string, p: string) => void): LabConfigV1["tasks"] | undefined {
  const where = "smartSim.config.tasks";
  if (!isPlainObject(raw) || !exactKeys(raw, ["measurements", "points"]) || !Array.isArray(raw.measurements) || !Array.isArray(raw.points)) { add("LAB_TASK_INVALID", "قائمة المهام غير صالحة.", where); return undefined; }
  if (raw.measurements.length > L.measurements || raw.points.length > L.points) { add("LAB_TASKS_TOO_MANY", "عدد المهام يتجاوز الحد (" + L.measurements + " قياسًا و" + L.points + " نقطة).", where); return undefined; }
  if (raw.measurements.length + raw.points.length === 0) { add("LAB_TASKS_EMPTY", "أضف مهمة قياس أو نقطة واحدة على الأقل.", where); return undefined; }
  let ok = true;
  const seen = new Set<string>();
  const ident = (id: unknown, path: string): id is string => {
    if (!isSemanticId(id)) { add("LAB_TASK_INVALID", "معرّف المهمة غير صالح.", path); ok = false; return false; }
    if (seen.has(id)) { add("LAB_TASK_ID_DUPLICATE", "معرّف مهمة مكرر: " + id, path); ok = false; return false; }
    seen.add(id); return true;
  };
  const measurements: LabMeasurementTask[] = [];
  raw.measurements.forEach((m, i) => {
    const path = where + ".measurements[" + i + "]";
    if (!isPlainObject(m) || !exactKeys(m, ["id", "label", "unit"]) || !isLabel(m.label) || typeof m.unit !== "string" || !LAB_TASK_UNITS.includes(m.unit)) {
      add("LAB_TASK_INVALID", "مهمة القياس رقم " + (i + 1) + " غير صالحة (المعرّف، الوصف حتى " + L.labelChars + " حرفًا، الوحدة من " + LAB_TASK_UNITS.join(" ") + ").", path); ok = false; return;
    }
    if (ident(m.id, path)) measurements.push({ id: m.id, label: m.label, unit: m.unit as LabTaskUnit });
  });
  const points: LabPointTask[] = [];
  raw.points.forEach((p, i) => {
    const path = where + ".points[" + i + "]";
    if (!isPlainObject(p) || !exactKeys(p, ["id", "label"]) || !isLabel(p.label)) { add("LAB_TASK_INVALID", "مهمة النقطة رقم " + (i + 1) + " غير صالحة.", path); ok = false; return; }
    if (ident(p.id, path)) points.push({ id: p.id, label: p.label });
  });
  return ok ? { measurements, points } : undefined;
}
