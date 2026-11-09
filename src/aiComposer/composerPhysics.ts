// Phase 21L — the ADVANCED PHYSICS simulators through the AI Full Exam Composer: physicsMotion@1 (free fall, projectile, Newton's second law,
// inclined plane) and physicsLab@1 (pendulum, spring, mechanical energy, DC circuits). Both share one contract (experiment, params, controls,
// view, measurement tasks) and one check mechanism: a measurement compared with a reference quantity the physics core DERIVES from the
// authored experiment (motion.referenceValue / lab.referenceValue). Same rule as 20F / 21J / 21K: the model never writes the config or a
// check. It names an experiment, gives its parameters and names the quantities to measure; code builds the ids, the units (the quantity's
// own), an assessment view (no student-adjustable controls), the experiment duration and the private checks with a code-owned tolerance
// (2 % of the derived value). The production validators decide; composerSim.buildSimFromSpec runs the SmartSim validators and the
// no-free-credit gate. Graph-point tasks are not generated (their generic rule stores an expected point; measurements carry none).
import { MOTION_KINDS, MOTION_PARAM_SPEC, MOTION_QUANTITY_SPEC, motionNaturalEnd, motionParamsProblem, motionQuantities, type MotionKind } from "../physics/motionCore";
import { MOTION_GRAPHS, MOTION_LIMITS, MOTION_TASK_UNITS, validateMotionConfig } from "../physicsMotionModel";
import { LAB_KINDS, LAB_PARAM_SPEC, LAB_QUANTITY_SPEC, CIRCUIT_TOPOLOGIES, labEndTime, labParamsProblem, labQuantities, type LabKind } from "../physics/labCore";
import { LAB_GRAPHS, LAB_LIMITS, LAB_TASK_UNITS, validateLabConfig } from "../physicsLabModel";
import { SMART_SIM_LIMITS } from "../trustedSimRegistry";
import type { ComposerIssue } from "./composerLimits";
import { cleanText, hasExactKeys, isArr, isEnum, sArr, sBool, sEnum, sNull, sNum, sObj, sStr, type JsonSchema } from "./composerSchemaKit";

type SimCheck = { id: string; label: string; weight: number; kind: string } & Record<string, unknown>;
type R<T> = { ok: true; value: T } | { ok: false; issues: ComposerIssue[] };
const fail = <T>(code: string, message: string, path?: string): R<T> => ({ ok: false, issues: [{ code, message, ...(path ? { path } : {}) }] });

export const COMPOSER_PHYSICS_MAX_MEASUREMENTS = 8;
/** The relative tolerance of every generated measurement check (a 3-significant-figure answer is within 0.5 %). */
export const COMPOSER_PHYSICS_RELATIVE_TOLERANCE = 0.02;

type Family = {
  plugin: "physicsMotion" | "physicsLab";
  kinds: readonly string[];
  params: Readonly<Record<string, readonly { key: string; label: string; min: number; max: number; unit: string }[]>>;
  quantities: Readonly<Record<string, readonly { id: string; unit: string; label: string }[]>>;
  graphs: Readonly<Record<string, readonly string[]>>;
  units: readonly string[];
  maxTimeMax: number; labelChars: number;
  /** the time the experiment needs to finish naturally (null = periodic / steady: no natural end) */
  naturalEnd: (kind: string, params: Record<string, number>) => number | null;
  paramsProblem: (kind: string, params: unknown) => string | undefined;
  quantityValues: (kind: string, params: Record<string, number>, maxTime: number) => Record<string, number | null>;
  validate: (raw: unknown) => { ok: true; config: unknown } | { ok: false; issues: { message: string }[] };
  checkKind: string;
};
const MOTION: Family = {
  plugin: "physicsMotion", kinds: MOTION_KINDS, params: MOTION_PARAM_SPEC, quantities: MOTION_QUANTITY_SPEC, graphs: MOTION_GRAPHS, units: MOTION_TASK_UNITS,
  maxTimeMax: MOTION_LIMITS.maxTimeMax, labelChars: MOTION_LIMITS.labelChars,
  naturalEnd: (k, p) => (k === "freeFall" || k === "projectile" ? motionNaturalEnd({ kind: k as MotionKind, params: p }) : null),
  paramsProblem: (k, p) => motionParamsProblem(k as MotionKind, p),
  quantityValues: (k, p, t) => motionQuantities({ kind: k as MotionKind, params: p }, t),
  validate: raw => validateMotionConfig(raw), checkKind: "motion.referenceValue"
};
const LAB: Family = {
  plugin: "physicsLab", kinds: LAB_KINDS, params: LAB_PARAM_SPEC, quantities: LAB_QUANTITY_SPEC, graphs: LAB_GRAPHS, units: LAB_TASK_UNITS,
  maxTimeMax: LAB_LIMITS.maxTimeMax, labelChars: LAB_LIMITS.labelChars,
  naturalEnd: (k, p) => (k === "energy" ? labEndTime({ kind: k as LabKind, params: p }, Infinity) : null),
  paramsProblem: (k, p) => labParamsProblem(k as LabKind, p),
  quantityValues: (k, p, t) => labQuantities({ kind: k as LabKind, params: p }, t),
  validate: raw => validateLabConfig(raw), checkKind: "lab.referenceValue"
};
export const PHYSICS_FAMILIES = Object.freeze({ physicsMotion: MOTION, physicsLab: LAB });

/** The spec of either family (motion / physicsLab fields of the simulator spec). Parameters travel as {key, value} pairs: the parameter set
 *  differs per experiment and strict mode needs fixed object keys. */
export function buildPhysicsSpecSchema(kinds: readonly string[], graphs: readonly string[]): JsonSchema {
  return sObj({
    experiment: sEnum(kinds), params: sArr(sObj({ key: sStr(), value: sNum() }), 8), maxTime: sNull(sNum()),
    graphs: sArr(sEnum(graphs), 3), showVectors: sBool(),
    measurements: sArr(sObj({ quantity: sStr(), label: sStr() }), COMPOSER_PHYSICS_MAX_MEASUREMENTS)
  });
}
export const buildMotionSpecSchema = () => buildPhysicsSpecSchema(MOTION_KINDS, [...new Set(Object.values(MOTION_GRAPHS).flat())]);
export const buildPhysicsLabSpecSchema = () => buildPhysicsSpecSchema(LAB_KINDS, [...new Set(Object.values(LAB_GRAPHS).flat())]);

const r6 = (n: number) => Number(n.toPrecision(6));

export function buildPhysicsSim(family: Family, raw: unknown, path: string): R<{ config: unknown; checks: SimCheck[] }> {
  if (!hasExactKeys(raw, ["experiment", "params", "maxTime", "graphs", "showVectors", "measurements"]) || !isEnum(raw.experiment, family.kinds) || typeof raw.showVectors !== "boolean"
    || !isArr(raw.params, 8) || !(raw.params as unknown[]).every(p => hasExactKeys(p, ["key", "value"]) && typeof p.key === "string" && typeof p.value === "number" && Number.isFinite(p.value))
    || !(raw.maxTime === null || (typeof raw.maxTime === "number" && Number.isFinite(raw.maxTime))) || !isArr(raw.graphs, 3) || !(raw.graphs as unknown[]).every(g => typeof g === "string")
    || !isArr(raw.measurements, COMPOSER_PHYSICS_MAX_MEASUREMENTS) || !(raw.measurements as unknown[]).every(m => hasExactKeys(m, ["quantity", "label"]) && typeof m.quantity === "string" && typeof m.label === "string")) {
    return fail("AI_SIM_SPEC_MALFORMED", "مواصفة محاكاة الفيزياء غير صالحة البنية.", path);
  }
  const kind = raw.experiment as string;
  const bad = (message: string) => fail<{ config: unknown; checks: SimCheck[] }>("AI_SIM_TASK_INVALID", message, path);
  // parameters: exactly the experiment's keys, once each (the physics core then checks bounds and cross-constraints)
  const spec = family.params[kind], pairs = raw.params as { key: string; value: number }[];
  const keys = spec.map(s => s.key), given = pairs.map(p => p.key);
  const missing = keys.filter(k => !given.includes(k)), extra = given.filter(k => !keys.includes(k));
  if (missing.length || extra.length || new Set(given).size !== given.length) {
    return bad("معاملات تجربة " + kind + " هي بالضبط: " + spec.map(s => s.key + " (" + s.min + "–" + s.max + " " + s.unit + ")").join("، ") + (missing.length ? "؛ الناقص: " + missing.join("، ") : "") + (extra.length ? "؛ الزائد: " + extra.join("، ") : "") + ".");
  }
  const params: Record<string, number> = {};
  for (const k of keys) params[k] = pairs.find(p => p.key === k)!.value;
  const problem = family.paramsProblem(kind, params);
  if (problem) return bad("القيم الفيزيائية غير صالحة: " + problem);
  // duration: an experiment with a natural end runs a little past it; a periodic / steady one uses the model's value or 10 s
  const end = family.naturalEnd(kind, params);
  let maxTime: number;
  if (end !== null && Number.isFinite(end)) {
    if (end > family.maxTimeMax) return bad("التجربة تستغرق " + r6(end) + " ث، أطول من الحد " + family.maxTimeMax + " ث؛ غيّر القيم.");
    maxTime = Math.min(family.maxTimeMax, Math.max(0.5, Math.ceil(end * 1.15 * 2) / 2));
  } else maxTime = raw.maxTime !== null && (raw.maxTime as number) > 0 && (raw.maxTime as number) <= family.maxTimeMax ? (raw.maxTime as number) : Math.min(10, family.maxTimeMax);
  const allowedGraphs = family.graphs[kind];
  const graphs = (raw.graphs as string[]).filter(g => allowedGraphs.includes(g));
  // measurements → tasks (the quantity's own unit) + checks (tolerance from the DERIVED value; never a value the model typed)
  const values = family.quantityValues(kind, params, maxTime);
  const measurements: { id: string; label: string; unit: string }[] = [], checks: SimCheck[] = [];
  const quantities = family.quantities[kind];
  const seen = new Set<string>();
  for (const [i, m] of (raw.measurements as { quantity: string; label: string }[]).entries()) {
    const q = quantities.find(x => x.id === m.quantity);
    if (!q) return bad("الكمية «" + m.quantity.slice(0, 40) + "» غير معروفة لتجربة " + kind + " (المتاح: " + quantities.map(x => x.id).join(", ") + ").");
    if (seen.has(q.id)) return bad("الكمية «" + q.label + "» مكررة.");
    seen.add(q.id);
    if (!family.units.includes(q.unit)) return bad("الكمية «" + q.label + "» لا تُقاس بوحدة مدعومة في المهام.");
    const expected = values[q.id];
    if (expected === null || expected === undefined || !Number.isFinite(expected)) return bad("الكمية «" + q.label + "» غير معرّفة بهذه القيم خلال " + maxTime + " ث (مثلًا لا تكتمل اهتزازة أو لا يصل الجسم إلى أسفل المستوى).");
    const id = "m" + (i + 1), label = (cleanText(m.label).slice(0, family.labelChars) || q.label.slice(0, family.labelChars));
    measurements.push({ id, label, unit: q.unit });
    checks.push({ id: "c-" + id, label: q.label.slice(0, SMART_SIM_LIMITS.checkLabelChars), weight: 1, kind: family.checkKind, measurementId: id, quantity: q.id, tolerance: Math.max(1e-6, r6(Math.abs(expected) * COMPOSER_PHYSICS_RELATIVE_TOLERANCE)) });
  }
  if (!measurements.length) return bad("أضف كمية واحدة على الأقل يقيسها الطالب أو يحسبها.");
  const v = family.validate({ v: 1, experiment: kind, params, controls: [], view: { maxTime, graphs, showVectors: raw.showVectors }, tasks: { measurements, points: [] } });
  if (!v.ok) return { ok: false, issues: v.issues.map(i => ({ code: "AI_SIM_TASK_INVALID", message: i.message, path })) };
  return { ok: true, value: { config: v.config, checks } };
}

/** The model-facing catalog of both families (bounded; it travels only in the prompts that need advanced physics). */
export function physicsCatalogForPrompt(): string {
  const fam = (f: Family, field: string) => f.plugin + "@1 (fill `" + field + "`): experiment " + f.kinds.join(" | ") + ". params = {key, value} pairs, EXACTLY the experiment's keys (SI): " +
    f.kinds.map(k => k + " [" + f.params[k].map(s => s.key + " " + s.min + "–" + s.max + " " + s.unit).join(", ") + "]").join("; ") +
    ". measurements (≤ " + COMPOSER_PHYSICS_MAX_MEASUREMENTS + ") name quantities: " + f.kinds.map(k => k + " [" + f.quantities[k].map(q => q.id).join(", ") + "]").join("; ") +
    ". graphs: " + f.kinds.map(k => k + " [" + f.graphs[k].join(", ") + "]").join("; ") + ". maxTime null = automatic (≤ " + f.maxTimeMax + " s).";
  return [
    "ADVANCED PHYSICS CATALOG (exact ids; every expected value is derived by code from the parameters, never by you; the student measures or calculates it):",
    fam(MOTION, "motion"),
    fam(LAB, "physicsLab") + " circuit topology: " + CIRCUIT_TOPOLOGIES.map(t => t.value + " = " + t.label).join("، ") + "."
  ].join("\n");
}
export const PHYSICS_SIM_KEYS: readonly string[] = Object.freeze(["physicsMotion", "physicsLab"]);
const PHYSICS_WORDS = /physic|فيزي|פיזיק|بندول|نابض|زنبرك|مقذوف|مستوى مائل|نيوتن|دائر[ةه] كهرب|مقاوم|تيار|طاق[ةه]|pendulum|spring|projectile|incline|newton|circuit|resist|energy/i;
/** Whether a modify request or exam involves advanced physics (then its prompt carries the physics catalog). */
export const mentionsAdvancedPhysics = (text: string): boolean => PHYSICS_WORDS.test(text) || PHYSICS_SIM_KEYS.some(k => text.includes(k));
