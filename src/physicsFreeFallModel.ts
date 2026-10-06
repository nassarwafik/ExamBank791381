// Phase 20A.2 — physicsFreeFall@1: the PUBLIC configuration and the trusted PHYSICS ENGINE (pure; compiled into the shared server build).
//
// Vertical one-dimensional free fall in SI units: y = 0 is the ground, +y points up, the body starts at height h0 (m) with velocity v0
// (m/s, positive = upward) under a constant gravitational acceleration g (m/s², a positive magnitude). No air resistance, no mass (it
// does not change the motion). The engine is plain arithmetic on the public model: no clock, no randomness, no DOM, no animation state.
//   y(t) = h0 + v0·t − ½·g·t²        v(t) = v0 − g·t
//   impact time  = the POSITIVE root of y(t) = 0 = (v0 + √(v0² + 2·g·h0)) / g   (computed in its cancellation-free form)
//   impact speed = |v(t_impact)| = √(v0² + 2·g·h0)                                (a magnitude; energy form, exact)
// The configuration is strict and bounded (finite numbers within declared ranges, exact keys, exact version); anything else is REFUSED,
// never clamped or repaired. Animation sampling below is PRESENTATION only and never an academic input.
import { hasControlCharacter, isPlainObject, isSemanticId } from "./trustedSimVocabulary";

export const FREE_FALL_PLUGIN_KEY = "physicsFreeFall";
export const FREE_FALL_PLUGIN_VERSION = 1;
export const FREE_FALL_CONFIG_VERSION = 1 as const;
export const FREE_FALL_LIMITS = Object.freeze({
  heightMax: 10000, velocityAbsMax: 1000, gravityMin: 0.1, gravityMax: 100, maxTimeMax: 600,
  measurements: 12, points: 12, labelChars: 80, valueAbsMax: 1e6, samplesMax: 2001
});
export const FREE_FALL_UNITS: readonly string[] = Object.freeze(["s", "m", "m/s"]);
export type FreeFallUnit = "s" | "m" | "m/s";
export type FreeFallModel = { initialHeight: number; initialVelocity: number; gravity: number };
export type FreeFallView = { maxTime: number; showVelocityGraph: boolean };
export type FreeFallMeasurementTask = { id: string; label: string; unit: FreeFallUnit };
export type FreeFallPointTask = { id: string; label: string };
export type FreeFallConfigV1 = { v: 1; model: FreeFallModel; view: FreeFallView; tasks: { measurements: FreeFallMeasurementTask[]; points: FreeFallPointTask[] } };
export type FreeFallIssue = { code: string; message: string; path?: string };
export type FreeFallConfigResult = { ok: true; config: FreeFallConfigV1 } | { ok: false; issues: FreeFallIssue[] };

const L = FREE_FALL_LIMITS;
const ROOT_KEYS = ["v", "model", "view", "tasks"] as const;
const MODEL_KEYS = ["initialHeight", "initialVelocity", "gravity"] as const;
const VIEW_KEYS = ["maxTime", "showVelocityGraph"] as const;
const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(o, k));
const num = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const isLabel = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= L.labelChars && !hasControlCharacter(v);

// ── the trusted physics engine ─────────────────────────────────────────────────────────────────────────────────────────────────────
export const heightAt = (m: FreeFallModel, t: number): number => m.initialHeight + m.initialVelocity * t - 0.5 * m.gravity * t * t;
export const velocityAt = (m: FreeFallModel, t: number): number => m.initialVelocity - m.gravity * t;
/** The positive root of y(t) = 0. For v0 ≤ 0 the algebraically equal form 2·h0 / (√D − v0) avoids cancellation. */
export function impactTime(m: FreeFallModel): number {
  const root = Math.sqrt(m.initialVelocity * m.initialVelocity + 2 * m.gravity * m.initialHeight);
  return m.initialVelocity > 0 ? (m.initialVelocity + root) / m.gravity : (2 * m.initialHeight) / (root - m.initialVelocity || 1);
}
/** |v(t_impact)| = √(v0² + 2·g·h0) — a speed is a magnitude. */
export const impactSpeed = (m: FreeFallModel): number => Math.sqrt(m.initialVelocity * m.initialVelocity + 2 * m.gravity * m.initialHeight);
/** The highest point reached (h0 when thrown down or dropped). */
export const peakHeight = (m: FreeFallModel): number => (m.initialVelocity > 0 ? m.initialHeight + (m.initialVelocity * m.initialVelocity) / (2 * m.gravity) : m.initialHeight);
/** The body's state at a presentation time: frozen on the ground after impact (presentation only). */
export function bodyAt(m: FreeFallModel, t: number): { t: number; y: number; v: number; landed: boolean } {
  const ti = impactTime(m);
  if (!(t < ti)) return { t, y: 0, v: velocityAt(m, ti), landed: true };
  const time = t > 0 ? t : 0;
  return { t: time, y: heightAt(m, time), v: velocityAt(m, time), landed: false };
}
/** Deterministic, bounded presentation samples of y(t) on [0, min(maxTime, t_impact)] (≤ 2001 points). Never grading input. */
export function sampleTrajectory(m: FreeFallModel, maxTime: number, count: number): { t: number; y: number; v: number }[] {
  const n = Math.max(2, Math.min(L.samplesMax, Number.isFinite(count) ? Math.floor(count) : 2));
  const end = Math.min(Number.isFinite(maxTime) && maxTime > 0 ? maxTime : 0, impactTime(m));
  const out: { t: number; y: number; v: number }[] = [];
  for (let i = 0; i < n; i++) { const t = (i * end) / (n - 1); out.push({ t, y: Math.max(0, heightAt(m, t)), v: velocityAt(m, t) }); }
  return out;
}

// ── the strict public configuration ────────────────────────────────────────────────────────────────────────────────────────────────
export function validateFreeFallModel(raw: unknown): FreeFallModel | undefined {
  if (!isPlainObject(raw) || !exactKeys(raw, MODEL_KEYS)) return undefined;
  const { initialHeight: h, initialVelocity: v, gravity: g } = raw;
  if (!num(h, 0, L.heightMax) || !num(v, -L.velocityAbsMax, L.velocityAbsMax) || !num(g, L.gravityMin, L.gravityMax)) return undefined;
  if (h === 0 && v <= 0) return undefined;                                                    // on the ground and not thrown up: no flight
  return { initialHeight: h, initialVelocity: v, gravity: g };
}
export function validateFreeFallConfig(raw: unknown): FreeFallConfigResult {
  const issues: FreeFallIssue[] = [];
  const add = (code: string, message: string, path: string) => { issues.push({ code, message, path }); };
  if (!isPlainObject(raw)) return { ok: false, issues: [{ code: "FREEFALL_CONFIG_INVALID", message: "إعداد محاكاة السقوط الحر مفقود أو غير صالح.", path: "smartSim.config" }] };
  for (const k of Object.keys(raw)) if (!(ROOT_KEYS as readonly string[]).includes(k)) add("FREEFALL_CONFIG_UNKNOWN_KEY", "حقل غير مسموح في إعداد السقوط الحر: " + k, "smartSim.config." + k);
  if (raw.v !== FREE_FALL_CONFIG_VERSION) add("FREEFALL_CONFIG_VERSION_UNSUPPORTED", "إصدار إعداد السقوط الحر غير مدعوم.", "smartSim.config.v");
  const model = validateFreeFallModel(raw.model);
  if (!model) add("FREEFALL_MODEL_INVALID", "النموذج الفيزيائي غير صالح: الارتفاع الابتدائي 0–" + L.heightMax + " م، السرعة الابتدائية ±" + L.velocityAbsMax + " م/ث، الجاذبية " + L.gravityMin + "–" + L.gravityMax + " م/ث² (قيمة موجبة)، ويجب أن يبدأ الجسم فوق الأرض أو يُقذف إلى الأعلى.", "smartSim.config.model");
  let view: FreeFallView | undefined;
  const rv = raw.view;
  if (!isPlainObject(rv) || !exactKeys(rv, VIEW_KEYS) || !num(rv.maxTime, Number.MIN_VALUE, L.maxTimeMax) || typeof rv.showVelocityGraph !== "boolean")
    add("FREEFALL_VIEW_INVALID", "إعداد العرض غير صالح: مدة التجربة عدد موجب حتى " + L.maxTimeMax + " ث.", "smartSim.config.view");
  else {
    view = { maxTime: rv.maxTime, showVelocityGraph: rv.showVelocityGraph };
    if (model && view.maxTime < impactTime(model)) add("FREEFALL_VIEW_TOO_SHORT", "مدة التجربة أقصر من زمن وصول الجسم إلى الأرض (" + fmtPhysics(impactTime(model)) + " ث).", "smartSim.config.view.maxTime");
  }
  const tasks = validateTasks(raw.tasks, add);
  if (issues.length || !model || !view || !tasks) return { ok: false, issues };
  return { ok: true, config: { v: FREE_FALL_CONFIG_VERSION, model, view, tasks } };
}
function validateTasks(raw: unknown, add: (code: string, message: string, path: string) => void): FreeFallConfigV1["tasks"] | undefined {
  const where = "smartSim.config.tasks";
  if (!isPlainObject(raw) || !exactKeys(raw, ["measurements", "points"]) || !Array.isArray(raw.measurements) || !Array.isArray(raw.points)) { add("FREEFALL_TASK_INVALID", "قائمة المهام غير صالحة.", where); return undefined; }
  if (raw.measurements.length > L.measurements || raw.points.length > L.points) { add("FREEFALL_TASKS_TOO_MANY", "عدد المهام يتجاوز الحد (" + L.measurements + " قياسًا و" + L.points + " نقطة).", where); return undefined; }
  if (raw.measurements.length + raw.points.length === 0) { add("FREEFALL_TASKS_EMPTY", "أضف مهمة قياس أو نقطة واحدة على الأقل.", where); return undefined; }
  let ok = true;
  const seen = new Set<string>();
  const ident = (id: unknown, path: string): id is string => {
    if (!isSemanticId(id)) { add("FREEFALL_TASK_INVALID", "معرّف المهمة غير صالح.", path); ok = false; return false; }
    if (seen.has(id)) { add("FREEFALL_TASK_ID_DUPLICATE", "معرّف مهمة مكرر: " + id, path); ok = false; return false; }
    seen.add(id); return true;
  };
  const measurements: FreeFallMeasurementTask[] = [];
  raw.measurements.forEach((m, i) => {
    const path = where + ".measurements[" + i + "]";
    if (!isPlainObject(m) || !exactKeys(m, ["id", "label", "unit"]) || !isLabel(m.label) || typeof m.unit !== "string" || !FREE_FALL_UNITS.includes(m.unit)) { add("FREEFALL_TASK_INVALID", "مهمة القياس رقم " + (i + 1) + " غير صالحة (المعرّف، الوصف حتى " + L.labelChars + " حرفًا، الوحدة s أو m أو m/s).", path); ok = false; return; }
    if (ident(m.id, path)) measurements.push({ id: m.id, label: m.label, unit: m.unit as FreeFallUnit });
  });
  const points: FreeFallPointTask[] = [];
  raw.points.forEach((p, i) => {
    const path = where + ".points[" + i + "]";
    if (!isPlainObject(p) || !exactKeys(p, ["id", "label"]) || !isLabel(p.label)) { add("FREEFALL_TASK_INVALID", "مهمة النقطة رقم " + (i + 1) + " غير صالحة.", path); ok = false; return; }
    if (ident(p.id, path)) points.push({ id: p.id, label: p.label });
  });
  return ok ? { measurements, points } : undefined;
}
/** Display formatting shared by the plugin facts and the UI (≤ 6 significant digits, no exponent noise). */
export const fmtPhysics = (n: number): string => (Number.isFinite(n) ? String(Number(n.toPrecision(6))) : "—");
