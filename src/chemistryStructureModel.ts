// Phase 21D-D.1 — chemistryStructure@1: the PUBLIC configuration of the atomic & molecular structure simulations (pure; compiled into the
// shared server build). One versioned contract, three activities over the trusted chemistry core (src/chemistry/*):
//   { v: 1, activity, subject, view, tasks }
//   activity — "atom" (build an atom / ion, distribute electrons in shells, periodic table), "molecule" (a catalog molecule in 3D:
//              rotate / zoom / measure / select atoms and bonds), "formula" (a validated formula: composition and molar mass).
//   subject  — what the student is GIVEN (always visible: nothing secret may live in the public config): atom → null | { element,
//              massNumber, charge }; molecule → { molecule }; formula → { formula } in canonical text. A target that must stay hidden
//              (e.g. "build the ion of the element in period 3, group 2") belongs to a PRIVATE check (src/chemistryStructurePlugin.ts).
//   view     — periodicTable "hidden" | "basic" | "detailed"; identity (atom: name the BUILT species live; molecule: show name + formula);
//              details (atom: the subject's configuration; molecule: bonding facts; formula: composition table); measure (molecule probe).
//   tasks    — build (particles), shells, values, formulas, classifications, selection — every graded answer is an explicit decision.
// Strict: exact keys, exact version, catalog references, bounded text; anything else is REFUSED, never repaired.
import { hasControlCharacter, isPlainObject, isSemanticId } from "./trustedSimVocabulary";
import { CHEM_CATEGORIES, CHEM_SYMBOLS, chemElement, chemMassNumbers } from "./chemistry/elements";
import { MOLECULE_SHAPES, chemMolecule } from "./chemistry/molecules";
import { parseFormula } from "./chemistry/formula";

export const CHEM_PLUGIN_KEY = "chemistryStructure";
export const CHEM_PLUGIN_VERSION = 1;
export const CHEM_CONFIG_VERSION = 1 as const;
export const CHEM_ACTIVITIES = Object.freeze(["atom", "molecule", "formula"] as const);
export type ChemActivity = (typeof CHEM_ACTIVITIES)[number];
export const CHEM_LIMITS = Object.freeze({ values: 12, formulas: 6, classifications: 8, labelChars: 80, protonsMax: 36, neutronsMax: 60, electronsMax: 40, shellsMax: 4, shellElectronsMax: 32, valueAbsMax: 1e6 });
export const CHEM_PERIODIC_MODES = Object.freeze(["hidden", "basic", "detailed"] as const);
export type ChemPeriodicMode = (typeof CHEM_PERIODIC_MODES)[number];
export const CHEM_VALUE_UNITS = Object.freeze(["1", "g/mol", "%", "pm", "°"] as const);
export type ChemValueUnit = (typeof CHEM_VALUE_UNITS)[number];
export const CHEM_PROPERTIES = Object.freeze(["block", "category", "metalClass", "ionType", "shape", "polarity"] as const);
export type ChemProperty = (typeof CHEM_PROPERTIES)[number];
/** The options a classification task offers (code-owned vocabulary; a student can never submit anything else). */
export const CHEM_PROPERTY_OPTIONS: Readonly<Record<ChemProperty, readonly string[]>> = Object.freeze({
  block: Object.freeze(["s", "p", "d"]), category: CHEM_CATEGORIES, metalClass: Object.freeze(["metal", "metalloid", "nonmetal"]),
  ionType: Object.freeze(["cation", "anion", "neutral"]), shape: MOLECULE_SHAPES, polarity: Object.freeze(["polar", "nonpolar"])
});
export const CHEM_ACTIVITY_PROPERTIES: Readonly<Record<ChemActivity, readonly ChemProperty[]>> = Object.freeze({
  atom: Object.freeze(["block", "category", "metalClass", "ionType"] as ChemProperty[]), molecule: Object.freeze(["shape", "polarity"] as ChemProperty[]), formula: Object.freeze([] as ChemProperty[])
});
export const CHEM_SELECTION_TARGETS = Object.freeze(["elements", "atoms", "bonds"] as const);
export type ChemSelectionTarget = (typeof CHEM_SELECTION_TARGETS)[number];
const ACTIVITY_TARGETS: Readonly<Record<ChemActivity, readonly ChemSelectionTarget[]>> = Object.freeze({ atom: ["elements"], molecule: ["atoms", "bonds"], formula: ["elements"] });
export const CHEM_ACTIVITY_LABEL: Readonly<Record<ChemActivity, string>> = Object.freeze({ atom: "بنية الذرة والأيون", molecule: "الجزيء ثلاثي الأبعاد", formula: "الصيغة الكيميائية والتركيب" });

export type ChemSpecies = { element: string; massNumber: number; charge: number };
export type ChemSubject = ChemSpecies | { molecule: string } | { formula: string } | null;
export type ChemView = { periodicTable: ChemPeriodicMode; identity: boolean; details: boolean; measure: boolean };
export type ChemValueTask = { id: string; label: string; unit: ChemValueUnit };
export type ChemFormulaTask = { id: string; label: string };
export type ChemClassificationTask = { id: string; label: string; property: ChemProperty };
export type ChemSelectionTask = { label: string; target: ChemSelectionTarget; max: number };
export type ChemTasks = { build: boolean; shells: boolean; values: ChemValueTask[]; formulas: ChemFormulaTask[]; classifications: ChemClassificationTask[]; selection: ChemSelectionTask | null };
export type ChemConfigV1 = { v: 1; activity: ChemActivity; subject: ChemSubject; view: ChemView; tasks: ChemTasks };
export type ChemIssue = { code: string; message: string; path?: string };
export type ChemConfigResult = { ok: true; config: ChemConfigV1 } | { ok: false; issues: ChemIssue[] };

const L = CHEM_LIMITS;
const P = "smartSim.config";
export const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(o, k));
const isLabel = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= L.labelChars && !hasControlCharacter(v);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isActivity = (v: unknown): v is ChemActivity => typeof v === "string" && (CHEM_ACTIVITIES as readonly string[]).includes(v);

/** A species { element, massNumber, charge } of the catalog: catalogued mass number, neutral or a common ion of the element. */
export function speciesProblem(raw: unknown): string | undefined {
  if (!isPlainObject(raw) || !exactKeys(raw, ["element", "massNumber", "charge"])) return "النوع الكيميائي يحتاج العنصر والعدد الكتلي والشحنة فقط.";
  const e = chemElement(raw.element);
  if (!e) return "عنصر غير مدعوم: " + String(raw.element) + " (العناصر المدعومة من H إلى Kr).";
  if (!isInt(raw.massNumber, 1, 300) || !chemMassNumbers(e).includes(raw.massNumber)) return "العدد الكتلي " + String(raw.massNumber) + " ليس نظيرًا مدرجًا لـ " + e.symbol + " (" + chemMassNumbers(e).join("، ") + ").";
  if (!isInt(raw.charge, -3, 3) || (raw.charge !== 0 && !e.ions.includes(raw.charge))) return "الشحنة " + String(raw.charge) + " ليست أيونًا بسيطًا مدرجًا لـ " + e.symbol + (e.ions.length ? " (" + e.ions.map(q => (q > 0 ? "+" : "") + q).join("، ") + ")" : " (لا أيونات بسيطة مدرجة)") + ".";
  return undefined;
}
export const asSpecies = (raw: Record<string, unknown>): ChemSpecies => ({ element: raw.element as string, massNumber: raw.massNumber as number, charge: raw.charge as number });
/** The ids a selection task may name (element symbols, molecule atom ids or bond ids). */
export function chemSelectableIds(c: Pick<ChemConfigV1, "subject" | "tasks">): string[] {
  const t = c.tasks.selection?.target;
  if (t === "elements") return [...CHEM_SYMBOLS];
  const m = c.subject && "molecule" in c.subject ? chemMolecule(c.subject.molecule) : undefined;
  if (!m) return [];
  return t === "atoms" ? m.atoms.map(a => a.id) : t === "bonds" ? m.bonds.map(b => b.id) : [];
}

export function validateChemConfig(raw: unknown): ChemConfigResult {
  const issues: ChemIssue[] = [];
  const add = (code: string, message: string, path: string) => { issues.push({ code, message, path }); };
  if (!isPlainObject(raw)) return { ok: false, issues: [{ code: "CHEM_CONFIG_INVALID", message: "إعداد محاكاة الكيمياء مفقود أو غير صالح.", path: P }] };
  for (const k of Object.keys(raw)) if (!["v", "activity", "subject", "view", "tasks"].includes(k)) add("CHEM_CONFIG_UNKNOWN_KEY", "حقل غير مسموح في إعداد محاكاة الكيمياء: " + k, P + "." + k);
  if (raw.v !== CHEM_CONFIG_VERSION) add("CHEM_CONFIG_VERSION_UNSUPPORTED", "إصدار إعداد محاكاة الكيمياء غير مدعوم.", P + ".v");
  if (!isActivity(raw.activity)) { add("CHEM_ACTIVITY_UNKNOWN", "نوع النشاط غير مدعوم (الذرة، الجزيء، الصيغة).", P + ".activity"); return { ok: false, issues }; }
  const activity = raw.activity;
  const subject = validateSubject(activity, raw.subject, add);
  const view = validateView(activity, raw.view, add);
  const tasks = subject !== undefined && view ? validateTasks(activity, subject, view, raw.tasks, add) : undefined;
  if (issues.length || subject === undefined || !view || !tasks) return { ok: false, issues: issues.length ? issues : [{ code: "CHEM_CONFIG_INVALID", message: "إعداد محاكاة الكيمياء غير صالح.", path: P }] };
  return { ok: true, config: { v: CHEM_CONFIG_VERSION, activity, subject, view, tasks } };
}

function validateSubject(activity: ChemActivity, raw: unknown, add: (c: string, m: string, p: string) => void): ChemSubject | undefined {
  const where = P + ".subject";
  if (activity === "atom") {
    if (raw === null) return null;
    const problem = speciesProblem(raw);
    if (problem) { add("CHEM_SUBJECT_INVALID", problem, where); return undefined; }
    return asSpecies(raw as Record<string, unknown>);
  }
  if (activity === "molecule") {
    if (!isPlainObject(raw) || !exactKeys(raw, ["molecule"]) || !chemMolecule(raw.molecule)) { add("CHEM_SUBJECT_INVALID", "اختر جزيئًا من فهرس الجزيئات المدعومة.", where); return undefined; }
    return { molecule: raw.molecule as string };
  }
  if (!isPlainObject(raw) || !exactKeys(raw, ["formula"]) || typeof raw.formula !== "string") { add("CHEM_SUBJECT_INVALID", "اكتب صيغة كيميائية صالحة.", where); return undefined; }
  const parsed = parseFormula(raw.formula);
  if (!parsed.ok) { add("CHEM_SUBJECT_FORMULA_INVALID", "الصيغة غير صالحة: " + parsed.message, where + ".formula"); return undefined; }
  if (parsed.text !== raw.formula) { add("CHEM_SUBJECT_FORMULA_NOT_CANONICAL", "اكتب الصيغة بالصورة المعيارية: " + parsed.text, where + ".formula"); return undefined; }
  return { formula: parsed.text };
}
function validateView(activity: ChemActivity, raw: unknown, add: (c: string, m: string, p: string) => void): ChemView | undefined {
  const where = P + ".view";
  if (!isPlainObject(raw) || !exactKeys(raw, ["periodicTable", "identity", "details", "measure"]) || typeof raw.periodicTable !== "string" || !(CHEM_PERIODIC_MODES as readonly string[]).includes(raw.periodicTable)
    || typeof raw.identity !== "boolean" || typeof raw.details !== "boolean" || typeof raw.measure !== "boolean") {
    add("CHEM_VIEW_INVALID", "إعداد العرض غير صالح (الجدول الدوري: مخفي / أساسي / مفصّل، وثلاثة خيارات منطقية).", where); return undefined;
  }
  if (raw.measure && activity !== "molecule") { add("CHEM_VIEW_INVALID", "أداة القياس متاحة لنشاط الجزيء فقط.", where + ".measure"); return undefined; }
  return { periodicTable: raw.periodicTable as ChemPeriodicMode, identity: raw.identity, details: raw.details, measure: raw.measure };
}
function validateTasks(activity: ChemActivity, subject: ChemSubject, view: ChemView, raw: unknown, add: (c: string, m: string, p: string) => void): ChemTasks | undefined {
  const where = P + ".tasks";
  if (!isPlainObject(raw) || !exactKeys(raw, ["build", "shells", "values", "formulas", "classifications", "selection"]) || typeof raw.build !== "boolean" || typeof raw.shells !== "boolean"
    || !Array.isArray(raw.values) || !Array.isArray(raw.formulas) || !Array.isArray(raw.classifications)) { add("CHEM_TASK_INVALID", "قائمة المهام غير صالحة.", where); return undefined; }
  if ((raw.build || raw.shells) && activity !== "atom") { add("CHEM_TASK_INVALID", "بناء الذرة وتوزيع الإلكترونات متاحان في نشاط الذرة فقط.", where); return undefined; }
  if (raw.values.length > L.values || raw.formulas.length > L.formulas || raw.classifications.length > L.classifications) {
    add("CHEM_TASKS_TOO_MANY", "عدد المهام يتجاوز الحد (" + L.values + " قيمة، " + L.formulas + " صيغ، " + L.classifications + " تصنيفات).", where); return undefined;
  }
  let ok = true;
  const seen = new Set<string>();
  const ident = (id: unknown, path: string): id is string => {
    if (!isSemanticId(id)) { add("CHEM_TASK_INVALID", "معرّف المهمة غير صالح.", path); ok = false; return false; }
    if (seen.has(id)) { add("CHEM_TASK_ID_DUPLICATE", "معرّف مهمة مكرر: " + id, path); ok = false; return false; }
    seen.add(id); return true;
  };
  const values: ChemValueTask[] = [];
  raw.values.forEach((t, i) => {
    const path = where + ".values[" + i + "]";
    if (!isPlainObject(t) || !exactKeys(t, ["id", "label", "unit"]) || !isLabel(t.label) || typeof t.unit !== "string" || !(CHEM_VALUE_UNITS as readonly string[]).includes(t.unit)) {
      add("CHEM_TASK_INVALID", "مهمة القيمة رقم " + (i + 1) + " غير صالحة (المعرّف، الوصف حتى " + L.labelChars + " حرفًا، الوحدة من: عدد، g/mol، %، pm، °).", path); ok = false; return;
    }
    if (ident(t.id, path)) values.push({ id: t.id, label: t.label, unit: t.unit as ChemValueUnit });
  });
  const formulas: ChemFormulaTask[] = [];
  raw.formulas.forEach((t, i) => {
    const path = where + ".formulas[" + i + "]";
    if (!isPlainObject(t) || !exactKeys(t, ["id", "label"]) || !isLabel(t.label)) { add("CHEM_TASK_INVALID", "مهمة الصيغة رقم " + (i + 1) + " غير صالحة.", path); ok = false; return; }
    if (ident(t.id, path)) formulas.push({ id: t.id, label: t.label });
  });
  const classifications: ChemClassificationTask[] = [];
  raw.classifications.forEach((t, i) => {
    const path = where + ".classifications[" + i + "]";
    if (!isPlainObject(t) || !exactKeys(t, ["id", "label", "property"]) || !isLabel(t.label) || typeof t.property !== "string" || !CHEM_ACTIVITY_PROPERTIES[activity].includes(t.property as ChemProperty)) {
      add("CHEM_TASK_INVALID", "مهمة التصنيف رقم " + (i + 1) + " غير صالحة لهذا النشاط" + (CHEM_ACTIVITY_PROPERTIES[activity].length ? " (الخصائص: " + CHEM_ACTIVITY_PROPERTIES[activity].join("، ") + ")." : " (لا تصنيفات في نشاط الصيغة)."), path); ok = false; return;
    }
    if (ident(t.id, path)) classifications.push({ id: t.id, label: t.label, property: t.property as ChemProperty });
  });
  let selection: ChemSelectionTask | null = null;
  if (raw.selection !== null) {
    const s = raw.selection, path = where + ".selection";
    if (!isPlainObject(s) || !exactKeys(s, ["label", "target", "max"]) || !isLabel(s.label) || typeof s.target !== "string" || !ACTIVITY_TARGETS[activity].includes(s.target as ChemSelectionTarget)) {
      add("CHEM_SELECTION_INVALID", "مهمة الاختيار غير صالحة لهذا النشاط (" + ACTIVITY_TARGETS[activity].join("، ") + ").", path); ok = false;
    } else if (s.target === "elements" && view.periodicTable === "hidden") {
      add("CHEM_SELECTION_INVALID", "اختيار العناصر يحتاج إظهار الجدول الدوري.", path); ok = false;
    } else {
      const ids = chemSelectableIds({ subject, tasks: { selection: { label: s.label, target: s.target as ChemSelectionTarget, max: 1 } } as ChemTasks });
      if (!isInt(s.max, 1, Math.max(1, ids.length))) { add("CHEM_SELECTION_INVALID", "الحد الأقصى للاختيار يجب أن يكون من 1 إلى " + ids.length + ".", path + ".max"); ok = false; }
      else {
        selection = { label: s.label, target: s.target as ChemSelectionTarget, max: s.max };
        for (const id of seen) if (ids.includes(id)) { add("CHEM_TASK_ID_COLLISION", "معرّف المهمة «" + id + "» يطابق معرّف عنصر قابل للاختيار؛ غيّره.", where); ok = false; }
      }
    }
  }
  if (!ok) return undefined;
  if (!raw.build && !raw.shells && !values.length && !formulas.length && !classifications.length && !selection) { add("CHEM_TASKS_EMPTY", "أضف مهمة واحدة على الأقل للطالب.", where); return undefined; }
  return { build: raw.build, shells: raw.shells, values, formulas, classifications, selection };
}
