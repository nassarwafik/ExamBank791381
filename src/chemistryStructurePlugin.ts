// Phase 21D-D.1 — chemistryStructure@1, the atomic & molecular structure SmartSim plugin (pure; compiled into the shared server build and
// registered by src/trustedSimPlugins.ts). It binds the trusted chemistry core (src/chemistry/*) and the strict config
// (src/chemistryStructureModel.ts) to the SmartSim contract:
//   actions — particles.set / clear (the built atom), shells.set / clear (electrons per shell K, L, M, N), value.set / clear,
//             formula.set / clear (parsed by the trusted parser and stored in canonical text), classification.set / clear (a code-owned
//             option), object.select / deselect (elements, molecule atoms or bonds; bounded by the task's max). Rotating, zooming,
//             labelling, measuring with the probe, browsing the periodic table and the live identity of the built atom are PRESENTATION:
//             never actions, never stored, never graded.
//   checks  — chem.particles, chem.shells, chem.value, chem.formula, chem.classification: every EXPECTED value is derived by trusted code
//             from the catalog and the authored subject — or from a PRIVATE species / formula carried by the check (never sent to the
//             student). Plus the opt-in generic objectSelected@1 / objectNotSelected@1 / setEquals@1 / numericNear@1.
//   A check whose reference is undefined for its subject is refused at authoring time (it can never award or withhold marks silently).
import {
  CHEM_ACTIVITY_PROPERTIES, CHEM_LIMITS, CHEM_PLUGIN_KEY, CHEM_PLUGIN_VERSION, CHEM_PROPERTY_OPTIONS, asSpecies, chemSelectableIds, exactKeys, speciesProblem, validateChemConfig,
  type ChemActivity, type ChemConfigV1, type ChemProperty, type ChemSpecies, type ChemValueUnit
} from "./chemistryStructureModel";
import { CHEM_CATEGORY_LABEL, CHEM_METAL_CLASS_LABEL, CHEM_WEIGHT_SCALE, chemElement, chemMetalClass } from "./chemistry/elements";
import { blockOf, outerShellElectrons, shellsOf, speciesConfiguration, valenceElectrons } from "./chemistry/electrons";
import { empiricalComposition, hillFormula, massPercent, molarMassScaled, parseFormula, sameComposition, type FormulaComposition } from "./chemistry/formula";
import { MOLECULE_POLARITY_LABEL, MOLECULE_SHAPE_LABEL, chemMolecule, lonePairTotal, moleculeComposition, piBonds, sigmaBonds, type Molecule } from "./chemistry/molecules";
import { isPlainObject } from "./trustedSimVocabulary";
import type { SmartSimCheckBase, SmartSimCheckOutcome, SmartSimIssue, SmartSimPlugin } from "./trustedSimRegistry";
import type { SmartSimPluginDescriptorV1 } from "./trustedSimDescriptor";
import type { SmartSimRuleView } from "./trustedSimRules";

export const CHEM_LABEL = "البنية الذرية والجزيئية (الذرات والأيونات، الجدول الدوري، الصيغ، الجزيئات)";
export const CHEM_MAX_ACTIONS = 500;
export const CHEM_CHECK_KINDS: readonly string[] = Object.freeze(["chem.particles", "chem.shells", "chem.value", "chem.formula", "chem.classification"]);
export const CHEM_ACTION_KINDS: readonly string[] = Object.freeze(["particles.set", "particles.clear", "shells.set", "shells.clear", "value.set", "value.clear", "formula.set", "formula.clear", "classification.set", "classification.clear", "object.select", "object.deselect"]);
export const CHEM_PARTICLES = Object.freeze(["protons", "neutrons", "electrons"] as const);
export type ChemParticle = (typeof CHEM_PARTICLES)[number];
export type ChemParticles = { protons: number; neutrons: number; electrons: number };
export type ChemAction =
  | { type: "particles.set"; protons: number; neutrons: number; electrons: number } | { type: "particles.clear" }
  | { type: "shells.set"; shells: number[] } | { type: "shells.clear" }
  | { type: "value.set"; valueId: string; value: number } | { type: "value.clear"; valueId: string }
  | { type: "formula.set"; formulaId: string; text: string } | { type: "formula.clear"; formulaId: string }
  | { type: "classification.set"; taskId: string; option: string } | { type: "classification.clear"; taskId: string }
  | { type: "object.select"; objectId: string } | { type: "object.deselect"; objectId: string };
export type ChemStateV1 = { v: 1; particles: ChemParticles | null; shells: number[] | null; values: Record<string, number>; formulas: Record<string, string>; classifications: Record<string, string>; selected: string[] };
type Runtime = { particles: ChemParticles | null; shells: number[] | null; values: Map<string, number>; formulas: Map<string, string>; classifications: Map<string, string>; selected: string[] };
export type ChemCheck = SmartSimCheckBase & Record<string, unknown>;

const L = CHEM_LIMITS;
const INVALID = { ok: false as const, code: "CHEM_ACTION_INVALID" };
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const declared = (ids: readonly string[], id: unknown): id is string => typeof id === "string" && ids.includes(id);
const trimShells = (s: readonly number[]) => { const out = [...s]; while (out.length && out[out.length - 1] === 0) out.pop(); return out; };
/** "180.156", "88.8093" — six significant digits at most, no trailing zeros. */
export const fmtChem = (n: number | null): string => (n === null || !Number.isFinite(n) ? "—" : String(Number(n.toPrecision(6))));

export function normalizeChemAction(raw: unknown, c: ChemConfigV1): { ok: true; action: ChemAction } | { ok: false; code: string } {
  if (!isPlainObject(raw) || typeof raw.type !== "string") return INVALID;
  const t = c.tasks;
  switch (raw.type) {
    case "particles.set":
      if (!t.build || !exactKeys(raw, ["type", "protons", "neutrons", "electrons"]) || !isInt(raw.protons, 0, L.protonsMax) || !isInt(raw.neutrons, 0, L.neutronsMax) || !isInt(raw.electrons, 0, L.electronsMax)) return INVALID;
      return { ok: true, action: { type: "particles.set", protons: raw.protons, neutrons: raw.neutrons, electrons: raw.electrons } };
    case "particles.clear":
      return t.build && exactKeys(raw, ["type"]) ? { ok: true, action: { type: "particles.clear" } } : INVALID;
    case "shells.set": {
      if (!t.shells || !exactKeys(raw, ["type", "shells"]) || !Array.isArray(raw.shells) || raw.shells.length < 1 || raw.shells.length > L.shellsMax || !raw.shells.every(n => isInt(n, 0, L.shellElectronsMax))) return INVALID;
      const shells = raw.shells as number[];
      if (shells.reduce((a, b) => a + b, 0) > L.electronsMax) return INVALID;
      return { ok: true, action: { type: "shells.set", shells: [...shells] } };
    }
    case "shells.clear":
      return t.shells && exactKeys(raw, ["type"]) ? { ok: true, action: { type: "shells.clear" } } : INVALID;
    case "value.set":
      if (!exactKeys(raw, ["type", "valueId", "value"]) || !declared(t.values.map(v => v.id), raw.valueId) || typeof raw.value !== "number" || !Number.isFinite(raw.value) || Math.abs(raw.value) > L.valueAbsMax) return INVALID;
      return { ok: true, action: { type: "value.set", valueId: raw.valueId, value: raw.value } };
    case "value.clear":
      return exactKeys(raw, ["type", "valueId"]) && declared(t.values.map(v => v.id), raw.valueId) ? { ok: true, action: { type: "value.clear", valueId: raw.valueId } } : INVALID;
    case "formula.set": {
      if (!exactKeys(raw, ["type", "formulaId", "text"]) || !declared(t.formulas.map(f => f.id), raw.formulaId) || typeof raw.text !== "string" || raw.text.length > 128) return INVALID;
      const p = parseFormula(raw.text);
      return p.ok ? { ok: true, action: { type: "formula.set", formulaId: raw.formulaId, text: p.text } } : INVALID;
    }
    case "formula.clear":
      return exactKeys(raw, ["type", "formulaId"]) && declared(t.formulas.map(f => f.id), raw.formulaId) ? { ok: true, action: { type: "formula.clear", formulaId: raw.formulaId } } : INVALID;
    case "classification.set": {
      const task = typeof raw.taskId === "string" ? t.classifications.find(k => k.id === raw.taskId) : undefined;
      if (!task || !exactKeys(raw, ["type", "taskId", "option"]) || typeof raw.option !== "string" || !CHEM_PROPERTY_OPTIONS[task.property].includes(raw.option)) return INVALID;
      return { ok: true, action: { type: "classification.set", taskId: task.id, option: raw.option } };
    }
    case "classification.clear":
      return exactKeys(raw, ["type", "taskId"]) && declared(t.classifications.map(k => k.id), raw.taskId) ? { ok: true, action: { type: "classification.clear", taskId: raw.taskId } } : INVALID;
    case "object.select":
    case "object.deselect":
      if (!exactKeys(raw, ["type", "objectId"]) || !declared(chemSelectableIds(c), raw.objectId)) return INVALID;
      return { ok: true, action: { type: raw.type, objectId: raw.objectId } };
    default:
      return INVALID;
  }
}
/** Whole-list bound: the selection never exceeds the task's max at any point of the replay. */
export function validateChemActions(actions: readonly ChemAction[], c: ChemConfigV1): string | undefined {
  const max = c.tasks.selection?.max ?? 0, on = new Set<string>();
  for (const a of actions) {
    if (a.type === "object.select") { on.add(a.objectId); if (on.size > max) return "CHEM_SELECTION_TOO_MANY"; }
    else if (a.type === "object.deselect") on.delete(a.objectId);
  }
  return undefined;
}
const createRuntime = (): Runtime => ({ particles: null, shells: null, values: new Map(), formulas: new Map(), classifications: new Map(), selected: [] });
function applyChemAction(rt: Runtime, a: ChemAction): Runtime {
  const next: Runtime = { particles: rt.particles, shells: rt.shells, values: new Map(rt.values), formulas: new Map(rt.formulas), classifications: new Map(rt.classifications), selected: [...rt.selected] };
  switch (a.type) {
    case "particles.set": next.particles = { protons: a.protons, neutrons: a.neutrons, electrons: a.electrons }; break;
    case "particles.clear": next.particles = null; break;
    case "shells.set": next.shells = trimShells(a.shells); break;
    case "shells.clear": next.shells = null; break;
    case "value.set": next.values.set(a.valueId, a.value); break;
    case "value.clear": next.values.delete(a.valueId); break;
    case "formula.set": next.formulas.set(a.formulaId, a.text); break;
    case "formula.clear": next.formulas.delete(a.formulaId); break;
    case "classification.set": next.classifications.set(a.taskId, a.option); break;
    case "classification.clear": next.classifications.delete(a.taskId); break;
    case "object.select": if (!next.selected.includes(a.objectId)) next.selected.push(a.objectId); break;
    case "object.deselect": next.selected = next.selected.filter(id => id !== a.objectId); break;
  }
  return next;
}
const sortedRecord = <T,>(m: Map<string, T>): Record<string, T> => { const o: Record<string, T> = {}; for (const k of [...m.keys()].sort()) o[k] = m.get(k) as T; return o; };
function canonicalChemState(rt: Runtime, c: ChemConfigV1): ChemStateV1 {
  const order = chemSelectableIds(c);
  return {
    v: 1, particles: rt.particles ? { ...rt.particles } : null, shells: rt.shells ? [...rt.shells] : null,
    values: sortedRecord(rt.values), formulas: sortedRecord(rt.formulas), classifications: sortedRecord(rt.classifications),
    selected: order.filter(id => rt.selected.includes(id))
  };
}
export const initialChemState = (): ChemStateV1 => ({ v: 1, particles: null, shells: null, values: {}, formulas: {}, classifications: {}, selected: [] });

// ---------------------------------------------------------------------------------------------------------------------------------------
// Trusted reference quantities (derived, never stored).
export type ChemQuantitySpec = { id: string; label: string; unit: ChemValueUnit; activities: readonly ChemActivity[]; needs?: "element" | "length" | "angle" };
export const CHEM_QUANTITIES: readonly ChemQuantitySpec[] = Object.freeze([
  { id: "atomicNumber", label: "العدد الذري Z", unit: "1", activities: ["atom"] },
  { id: "massNumber", label: "العدد الكتلي A", unit: "1", activities: ["atom"] },
  { id: "protons", label: "عدد البروتونات", unit: "1", activities: ["atom"] },
  { id: "neutrons", label: "عدد النيوترونات", unit: "1", activities: ["atom"] },
  { id: "electrons", label: "عدد الإلكترونات", unit: "1", activities: ["atom"] },
  { id: "charge", label: "شحنة النوع الكيميائي", unit: "1", activities: ["atom"] },
  { id: "valenceElectrons", label: "إلكترونات التكافؤ (ذرة متعادلة من الفئتين s وp)", unit: "1", activities: ["atom"] },
  { id: "outerShellElectrons", label: "إلكترونات الغلاف الخارجي المشغول", unit: "1", activities: ["atom"] },
  { id: "shellCount", label: "عدد الأغلفة المشغولة", unit: "1", activities: ["atom"] },
  { id: "period", label: "رقم الدورة", unit: "1", activities: ["atom"] },
  { id: "group", label: "رقم المجموعة (1–18)", unit: "1", activities: ["atom"] },
  { id: "elementMolarMass", label: "الكتلة المولية للعنصر", unit: "g/mol", activities: ["atom"] },
  { id: "molarMass", label: "الكتلة المولية", unit: "g/mol", activities: ["molecule", "formula"] },
  { id: "atomCount", label: "عدد الذرات في وحدة الصيغة", unit: "1", activities: ["molecule", "formula"] },
  { id: "elementCount", label: "عدد العناصر المختلفة", unit: "1", activities: ["molecule", "formula"] },
  { id: "countOf", label: "عدد ذرات عنصر محدد", unit: "1", activities: ["molecule", "formula"], needs: "element" },
  { id: "massPercent", label: "النسبة المئوية بالكتلة لعنصر", unit: "%", activities: ["molecule", "formula"], needs: "element" },
  { id: "sigmaBonds", label: "عدد روابط سيغما σ", unit: "1", activities: ["molecule"] },
  { id: "piBonds", label: "عدد روابط باي π", unit: "1", activities: ["molecule"] },
  { id: "sharedPairs", label: "عدد أزواج الإلكترونات الرابطة", unit: "1", activities: ["molecule"] },
  { id: "lonePairs", label: "مجموع الأزواج غير الرابطة", unit: "1", activities: ["molecule"] },
  { id: "centralLonePairs", label: "الأزواج غير الرابطة على الذرة المركزية", unit: "1", activities: ["molecule"] },
  { id: "valenceElectronTotal", label: "مجموع إلكترونات التكافؤ في الجزيء", unit: "1", activities: ["molecule"] },
  { id: "bondLength", label: "طول رابطة (pm)", unit: "pm", activities: ["molecule"], needs: "length" },
  { id: "bondAngle", label: "زاوية رابطة (°)", unit: "°", activities: ["molecule"], needs: "angle" }
] as ChemQuantitySpec[]);
const QUANTITY = new Map(CHEM_QUANTITIES.map(q => [q.id, q]));
export const chemQuantitySpec = (id: unknown) => (typeof id === "string" ? QUANTITY.get(id) : undefined);
const subjectSpecies = (c: ChemConfigV1): ChemSpecies | null => (c.activity === "atom" && c.subject && "element" in c.subject ? c.subject : null);
const subjectMolecule = (c: ChemConfigV1): Molecule | undefined => (c.subject && "molecule" in c.subject ? chemMolecule(c.subject.molecule) : undefined);
/** The composition of the subject (molecule or formula), or undefined for the atom activity. */
export function subjectComposition(c: ChemConfigV1): FormulaComposition | undefined {
  const m = subjectMolecule(c);
  if (m) return moleculeComposition(m);
  if (c.subject && "formula" in c.subject) { const p = parseFormula(c.subject.formula); return p.ok ? p.composition : undefined; }
  return undefined;
}
/** The trusted value of a quantity for the given species (atom) or the subject (molecule / formula); null = undefined for it. */
export function chemQuantity(c: ChemConfigV1, quantity: string, opts: { species?: ChemSpecies | null; element?: string; parameter?: string } = {}): number | null {
  const q = chemQuantitySpec(quantity);
  if (!q || !q.activities.includes(c.activity)) return null;
  if (c.activity === "atom") {
    const s = opts.species ?? subjectSpecies(c), e = s ? chemElement(s.element) : undefined;
    if (!s || !e) return null;
    switch (quantity) {
      case "atomicNumber": case "protons": return e.z;
      case "massNumber": return s.massNumber;
      case "neutrons": return s.massNumber - e.z;
      case "electrons": return e.z - s.charge;
      case "charge": return s.charge;
      case "valenceElectrons": return s.charge === 0 ? valenceElectrons(e) : null;
      case "outerShellElectrons": return outerShellElectrons(e.z, s.charge);
      case "shellCount": return shellsOf(speciesConfiguration(e.z, s.charge)).length;
      case "period": return e.period;
      case "group": return e.group;
      case "elementMolarMass": return e.weightScaled / CHEM_WEIGHT_SCALE;
    }
    return null;
  }
  const comp = subjectComposition(c), m = subjectMolecule(c);
  if (!comp) return null;
  switch (quantity) {
    case "molarMass": return molarMassScaled(comp) / CHEM_WEIGHT_SCALE;
    case "atomCount": return Object.values(comp).reduce((a, b) => a + b, 0);
    case "elementCount": return Object.keys(comp).length;
    case "countOf": return opts.element && comp[opts.element] ? comp[opts.element] : null;
    case "massPercent": return opts.element && comp[opts.element] ? massPercent(comp, opts.element) : null;
  }
  if (!m) return null;
  switch (quantity) {
    case "sigmaBonds": return sigmaBonds(m);
    case "piBonds": return piBonds(m);
    case "sharedPairs": return m.bonds.reduce((n, b) => n + b.order, 0);
    case "lonePairs": return lonePairTotal(m);
    case "centralLonePairs": return m.central.length === 1 ? m.atoms.find(a => a.id === m.central[0])!.lonePairs : null;
    case "valenceElectronTotal": return m.atoms.reduce((n, a) => n + (valenceElectrons(chemElement(a.element)!) ?? 0), 0);
    case "bondLength": { const p = m.params.find(x => x.id === opts.parameter && x.kind === "length"); return p ? p.value : null; }
    case "bondAngle": { const p = m.params.find(x => x.id === opts.parameter && x.kind === "angle"); return p ? p.value : null; }
  }
  return null;
}
export const CHEM_OPTION_LABEL: Readonly<Record<string, string>> = Object.freeze({
  s: "الفئة s", p: "الفئة p", d: "الفئة d", cation: "أيون موجب", anion: "أيون سالب", neutral: "ذرة متعادلة",
  ...CHEM_CATEGORY_LABEL, ...CHEM_METAL_CLASS_LABEL, ...MOLECULE_SHAPE_LABEL, ...MOLECULE_POLARITY_LABEL
});
/** The trusted answer of a classification property for the species (atom) or the subject molecule; null = undefined. */
export function chemClassification(c: ChemConfigV1, property: ChemProperty, species?: ChemSpecies | null): string | null {
  if (!CHEM_ACTIVITY_PROPERTIES[c.activity].includes(property)) return null;
  if (c.activity === "atom") {
    const s = species ?? subjectSpecies(c), e = s ? chemElement(s.element) : undefined;
    if (!s || !e) return null;
    if (property === "block") return blockOf(e);
    if (property === "category") return e.category;
    if (property === "metalClass") return chemMetalClass(e.category);
    if (property === "ionType") return s.charge > 0 ? "cation" : s.charge < 0 ? "anion" : "neutral";
    return null;
  }
  const m = subjectMolecule(c);
  if (!m) return null;
  return property === "shape" ? m.shape : property === "polarity" ? m.polarity : null;
}
/** Expected particles / shells of a species. */
export const speciesParticles = (s: ChemSpecies): ChemParticles => { const z = chemElement(s.element)!.z; return { protons: z, neutrons: s.massNumber - z, electrons: z - s.charge }; };
export const speciesShells = (s: ChemSpecies): number[] => shellsOf(speciesConfiguration(chemElement(s.element)!.z, s.charge));

// ---------------------------------------------------------------------------------------------------------------------------------------
// Checks.
const GENERIC = ["id", "label", "weight", "kind"];
const TOLERANCE_MAX = 1e6;
export function validateChemCheck(raw: Record<string, unknown>, c: ChemConfigV1): { ok: true; check: ChemCheck } | { ok: false; issues: SmartSimIssue[] } {
  const label = String(raw.label);
  const fail = (message: string) => ({ ok: false as const, issues: [{ code: "CHEM_CHECK_INVALID", message: "الفحص «" + label + "»: " + message }] });
  const base = { id: raw.id as string, label: raw.label as string, weight: raw.weight as number, kind: raw.kind as string };
  const has = (k: string) => Object.prototype.hasOwnProperty.call(raw, k);
  /** an optional PRIVATE species (atom activity only); undefined = the public subject. */
  const species = (): { ok: true; value: ChemSpecies | null } | { ok: false; message: string } => {
    if (!has("species")) return subjectSpecies(c) ? { ok: true, value: null } : { ok: false, message: "لا يوجد نوع كيميائي معطى في السؤال؛ حدّد النوع الكيميائي المطلوب في الفحص (خاص بالمعلم)." };
    if (c.activity !== "atom") return { ok: false, message: "النوع الكيميائي الخاص متاح في نشاط الذرة فقط." };
    const problem = speciesProblem(raw.species);
    return problem ? { ok: false, message: problem } : { ok: true, value: asSpecies(raw.species as Record<string, unknown>) };
  };
  const optional = (keys: string[]) => keys.filter(has);
  switch (raw.kind) {
    case "chem.particles": {
      if (!c.tasks.build) return fail("لا توجد مهمة بناء ذرة في هذا السؤال.");
      if (!exactKeys(raw, [...GENERIC, "particles", ...optional(["species"])])) return fail("معاملات الفحص غير مطابقة لنوعه.");
      const ps = raw.particles;
      if (!Array.isArray(ps) || !ps.length || new Set(ps).size !== ps.length || !ps.every(p => (CHEM_PARTICLES as readonly string[]).includes(p as string))) return fail("حدّد الجسيمات المطلوب مطابقتها (البروتونات، النيوترونات، الإلكترونات) دون تكرار.");
      const s = species();
      if (!s.ok) return fail(s.message);
      return { ok: true, check: { ...base, particles: CHEM_PARTICLES.filter(p => ps.includes(p)), ...(s.value ? { species: s.value } : {}) } };
    }
    case "chem.shells": {
      if (!c.tasks.shells) return fail("لا توجد مهمة توزيع إلكترونات في هذا السؤال.");
      if (!exactKeys(raw, [...GENERIC, ...optional(["species"])])) return fail("معاملات الفحص غير مطابقة لنوعه.");
      const s = species();
      if (!s.ok) return fail(s.message);
      if (speciesShells((s.value ?? subjectSpecies(c)) as ChemSpecies).length > L.shellsMax) return fail("توزيع هذا النوع يتجاوز أربعة أغلفة.");
      return { ok: true, check: { ...base, ...(s.value ? { species: s.value } : {}) } };
    }
    case "chem.value": {
      const q = chemQuantitySpec(raw.quantity);
      if (!q || !q.activities.includes(c.activity)) return fail("الكمية المرجعية غير معروفة لهذا النشاط.");
      const need = q.needs === "element" ? ["element"] : q.needs ? ["parameter"] : [];
      if (!exactKeys(raw, [...GENERIC, "valueId", "quantity", "tolerance", ...need, ...optional(c.activity === "atom" ? ["species"] : [])])) return fail("معاملات الفحص غير مطابقة لنوعه.");
      const task = c.tasks.values.find(v => v.id === raw.valueId);
      if (!task) return fail("يشير إلى مهمة قيمة غير معرّفة.");
      if (task.unit !== q.unit) return fail("وحدة المهمة «" + task.label + "» (" + task.unit + ") لا تناسب الكمية «" + q.label + "» (" + q.unit + ").");
      if (typeof raw.tolerance !== "number" || !Number.isFinite(raw.tolerance) || raw.tolerance < 0 || raw.tolerance > TOLERANCE_MAX) return fail("السماحية يجب أن تكون عددًا غير سالب.");
      if (q.needs === "element" && !chemElement(raw.element)) return fail("حدّد عنصرًا من الجدول.");
      if (q.needs && q.needs !== "element" && typeof raw.parameter !== "string") return fail("حدّد الرابطة أو الزاوية من بيانات الجزيء.");
      const s = c.activity === "atom" ? species() : { ok: true as const, value: null };
      if (!s.ok) return fail(s.message);
      const check: ChemCheck = { ...base, valueId: task.id, quantity: q.id, tolerance: raw.tolerance, ...(q.needs === "element" ? { element: raw.element as string } : {}), ...(q.needs && q.needs !== "element" ? { parameter: raw.parameter as string } : {}), ...(s.value ? { species: s.value } : {}) };
      if (expectedValue(check, c) === null) return fail("الكمية «" + q.label + "» غير معرّفة لهذا النوع أو الجزيء أو العنصر (مثلًا إلكترونات التكافؤ لعنصر من الفئة d أو لأيون، أو عنصر غير موجود في الصيغة).");
      return { ok: true, check };
    }
    case "chem.formula": {
      if (!exactKeys(raw, [...GENERIC, "formulaId", "target", ...optional(["formula"])])) return fail("معاملات الفحص غير مطابقة لنوعه.");
      if (!c.tasks.formulas.some(f => f.id === raw.formulaId)) return fail("يشير إلى مهمة صيغة غير معرّفة.");
      if (raw.target !== "molecular" && raw.target !== "empirical") return fail("نوع الصيغة المتوقعة: جزيئية أو أولية.");
      if (has("formula")) {
        const p = parseFormula(raw.formula);
        if (!p.ok) return fail("الصيغة المرجعية غير صالحة: " + p.message);
        if (p.text !== raw.formula) return fail("اكتب الصيغة المرجعية بالصورة المعيارية: " + p.text);
      } else if (!subjectComposition(c)) return fail("حدّد الصيغة المرجعية (لا توجد صيغة أو جزيء معطى في السؤال).");
      return { ok: true, check: { ...base, formulaId: raw.formulaId as string, target: raw.target, ...(has("formula") ? { formula: raw.formula as string } : {}) } };
    }
    case "chem.classification": {
      if (!exactKeys(raw, [...GENERIC, "taskId", ...optional(c.activity === "atom" ? ["species"] : [])])) return fail("معاملات الفحص غير مطابقة لنوعه.");
      const task = c.tasks.classifications.find(k => k.id === raw.taskId);
      if (!task) return fail("يشير إلى مهمة تصنيف غير معرّفة.");
      const s = c.activity === "atom" ? species() : { ok: true as const, value: null };
      if (!s.ok) return fail(s.message);
      if (chemClassification(c, task.property, s.value) === null) return fail("التصنيف غير معرّف لهذا النوع أو الجزيء.");
      return { ok: true, check: { ...base, taskId: task.id, ...(s.value ? { species: s.value } : {}) } };
    }
    default:
      return fail("نوع فحص غير معروف.");
  }
}
const checkSpecies = (check: ChemCheck, c: ChemConfigV1): ChemSpecies | null => (check.species as ChemSpecies | undefined) ?? subjectSpecies(c);
/** The trusted expected value of a validated chem.value check (null when undefined). */
export const expectedValue = (check: ChemCheck, c: ChemConfigV1): number | null =>
  chemQuantity(c, check.quantity as string, { species: check.species as ChemSpecies | undefined, element: check.element as string | undefined, parameter: check.parameter as string | undefined });
/** The trusted expected composition of a validated chem.formula check. */
export function expectedComposition(check: ChemCheck, c: ChemConfigV1): FormulaComposition | undefined {
  const base = typeof check.formula === "string" ? (parseFormula(check.formula) as { ok: boolean; composition?: FormulaComposition }).composition : subjectComposition(c);
  if (!base) return undefined;
  return check.target === "empirical" ? empiricalComposition(base) : base;
}
const showParticles = (p: Partial<ChemParticles>, keys: readonly ChemParticle[]) => keys.map(k => ({ protons: "p", neutrons: "n", electrons: "e" })[k] + " = " + p[k]).join("، ");
export function evaluateChemCheck(check: ChemCheck, state: ChemStateV1, c: ChemConfigV1): SmartSimCheckOutcome {
  const none = (expected: string): SmartSimCheckOutcome => ({ expected, actual: "—", passed: false });
  switch (check.kind) {
    case "chem.particles": {
      const s = checkSpecies(check, c), keys = check.particles as ChemParticle[];
      if (!s) return none("—");
      const want = speciesParticles(s), got = state.particles;
      if (!got) return none(showParticles(want, keys));
      return { expected: showParticles(want, keys), actual: showParticles(got, keys), passed: keys.every(k => got[k] === want[k]) };
    }
    case "chem.shells": {
      const s = checkSpecies(check, c);
      if (!s) return none("—");
      const want = speciesShells(s), got = state.shells;
      if (!got) return none(want.join("، ") || "لا إلكترونات");
      const g = trimShells(got);
      return { expected: want.join("، ") || "لا إلكترونات", actual: g.join("، ") || "لا إلكترونات", passed: g.length === want.length && g.every((n, i) => n === want[i]) };
    }
    case "chem.value": {
      const e = expectedValue(check, c), tol = check.tolerance as number;
      const got = Object.prototype.hasOwnProperty.call(state.values, check.valueId as string) ? state.values[check.valueId as string] : undefined;
      const passed = typeof got === "number" && Number.isFinite(got) && e !== null && Math.abs(got - e) <= tol;
      return { expected: fmtChem(e) + " ± " + fmtChem(tol), actual: typeof got === "number" ? fmtChem(got) : "—", passed };
    }
    case "chem.formula": {
      const want = expectedComposition(check, c);
      const text = Object.prototype.hasOwnProperty.call(state.formulas, check.formulaId as string) ? state.formulas[check.formulaId as string] : undefined;
      if (!want) return none("—");
      if (typeof text !== "string") return none(hillFormula(want));
      const p = parseFormula(text);
      return { expected: hillFormula(want), actual: text, passed: p.ok && sameComposition(p.composition, want) };
    }
    case "chem.classification": {
      const task = c.tasks.classifications.find(k => k.id === check.taskId);
      const want = task ? chemClassification(c, task.property, check.species as ChemSpecies | undefined) : null;
      const got = Object.prototype.hasOwnProperty.call(state.classifications, check.taskId as string) ? state.classifications[check.taskId as string] : undefined;
      const lbl = (v: string | null | undefined) => (v ? CHEM_OPTION_LABEL[v] ?? v : "—");
      return { expected: lbl(want), actual: lbl(got), passed: want !== null && got === want };
    }
  }
  return none("—");
}
export const chemRuleView = (state: ChemStateV1, c: ChemConfigV1): SmartSimRuleView => ({
  ids: [...chemSelectableIds(c), ...c.tasks.values.map(v => v.id)], selected: [...state.selected], points: {}, values: { ...state.values }, sequence: [], relations: []
});

export const CHEMISTRY_STRUCTURE_DESCRIPTOR_V1: SmartSimPluginDescriptorV1 = {
  descriptorVersion: 1, key: CHEM_PLUGIN_KEY, version: CHEM_PLUGIN_VERSION, label: CHEM_LABEL, domain: "chemistry",
  sceneKinds: ["2d", "3d"], rendererFamilies: ["svg2d", "custom", "table", "form"],
  capabilities: ["scene.2d", "scene.3d", "camera.rotate", "camera.zoom", "object.select", "object.label", "value.set"],
  actionKinds: [...CHEM_ACTION_KINDS], checkKinds: [...CHEM_CHECK_KINDS], genericRules: ["numericNear@1", "objectNotSelected@1", "objectSelected@1", "setEquals@1"], assetKinds: [],
  tools: ["select", "rotateView", "zoomView", "label", "form", "probe"], accessibility: ["keyboardAlternative", "semanticLabels", "objectList", "toolLabels", "textTranscript"],
  supports: { autosave: true, restore: true, reset: true, partialCredit: true, offline: true, twoDimensional: true, threeDimensional: true }
};
export const chemistryStructurePluginV1: SmartSimPlugin<ChemConfigV1, Runtime, ChemStateV1, ChemAction, ChemCheck> = Object.freeze({
  key: CHEM_PLUGIN_KEY,
  version: CHEM_PLUGIN_VERSION,
  label: CHEM_LABEL,
  maxActions: CHEM_MAX_ACTIONS,
  descriptor: CHEMISTRY_STRUCTURE_DESCRIPTOR_V1,
  checkKinds: CHEM_CHECK_KINDS,
  validateConfig: (raw: unknown) => validateChemConfig(raw),
  createRuntime,
  normalizeAction: normalizeChemAction,
  validateActions: validateChemActions,
  applyAction: (rt: Runtime, a: ChemAction) => applyChemAction(rt, a),
  canonicalState: (rt: Runtime, c: ChemConfigV1) => canonicalChemState(rt, c),
  serializeState: (s: ChemStateV1) => JSON.stringify(s),
  validateCheck: validateChemCheck,
  evaluateCheck: evaluateChemCheck,
  ruleView: chemRuleView
});
