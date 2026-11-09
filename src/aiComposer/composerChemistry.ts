// Phase 21J — CHEMISTRY SmartSim through the AI Full Exam Composer. Same rule as 20F: the model never writes a plugin config or a check.
// It fills a bounded spec that can only NAME catalog entries, and CODE builds the public config and the PRIVATE weighted checks:
//   chemistryReactions@1 — the model picks a curated reaction id (src/chemistry/reactionCatalog.ts) and the tasks (balance, classify, roles).
//                          Code builds the view, the classification options (never a contested family), the role tasks (only roles the
//                          reaction actually has) and the checks. Every expected answer (smallest coefficients, families, role terms) is
//                          derived by the exact solver / the curated catalog at grading time — no expected value is ever stored.
//   chemistryStructure@1 — the model picks an activity and its PUBLIC subject: an atom / ion (element, isotope, simple charge), a catalog
//                          molecule, or a formula (canonicalized by the trusted parser), then quantities, classifications and formula
//                          targets from code-owned vocabularies. Every expected value is derived by the trusted chemistry core.
// The production validators then decide (validateSmartSimEnvelope / validateSmartSimAnswerKey in composerSim.buildSimFromSpec) and the
// no-free-credit gate runs on the untouched initial state, exactly as for the other simulators.
import { REACTION_CATALOG, REACTION_FAMILIES, REACTION_ROLES, REACTION_ROLE_LABEL, catalogReaction, catalogReactionV1, catalogRoleTerms, familyStatus, type ReactionRole } from "../chemistry/reactionCatalog";
import { equationText } from "../chemistry/reactions";
import { RXN_CONFIG_VERSION, RXN_LIMITS, type RxnConfigV1 } from "../chemistryReactionsModel";
import { CHEM_ACTIVITIES, CHEM_ACTIVITY_PROPERTIES, CHEM_CONFIG_VERSION, CHEM_LIMITS, CHEM_PERIODIC_MODES, CHEM_PROPERTIES, speciesProblem, type ChemActivity, type ChemConfigV1, type ChemProperty } from "../chemistryStructureModel";
import { CHEM_QUANTITIES } from "../chemistryStructurePlugin";
import { CHEM_SYMBOLS, chemElement, chemMassNumbers } from "../chemistry/elements";
import { MOLECULES, chemMolecule } from "../chemistry/molecules";
import { parseFormula } from "../chemistry/formula";
import type { ComposerIssue } from "./composerLimits";
import { hasExactKeys, isArr, isEnum, sArr, sBool, sEnum, sInt, sNull, sObj, sStr, type JsonSchema } from "./composerSchemaKit";

type SimCheck = { id: string; label: string; weight: number; kind: string } & Record<string, unknown>;
type R<T> = { ok: true; value: T } | { ok: false; issues: ComposerIssue[] };
const fail = <T>(code: string, message: string, path?: string): R<T> => ({ ok: false, issues: [{ code, message, ...(path ? { path } : {}) }] });

// ── vocabularies (derived from the production catalogs; the provider schema uses them as enums, the builders re-check them) ──────────
export const COMPOSER_REACTION_IDS: readonly string[] = Object.freeze(REACTION_CATALOG.map(r => r.id));
export const COMPOSER_MOLECULE_IDS: readonly string[] = Object.freeze(MOLECULES.map(m => m.id));
export const COMPOSER_ELEMENT_SYMBOLS: readonly string[] = CHEM_SYMBOLS;
/** Quantities the composer may ask for: every trusted quantity except bond lengths / angles (they need molecule-specific parameter ids
 *  the teacher picks in the editor). */
export const COMPOSER_CHEM_QUANTITIES: readonly string[] = Object.freeze(CHEM_QUANTITIES.filter(q => q.needs !== "length" && q.needs !== "angle").map(q => q.id));
export const COMPOSER_FORMULA_TARGETS = Object.freeze(["molecular", "empirical"] as const);
export const COMPOSER_CHEM_ACTIVITIES = CHEM_ACTIVITIES;
export const COMPOSER_CHEM_PROPERTIES = CHEM_PROPERTIES;
export const COMPOSER_PERIODIC_MODES = CHEM_PERIODIC_MODES;
export const COMPOSER_REACTION_ROLES = REACTION_ROLES;
const MAX_QUANTITIES = 6;

// The catalogs themselves (41 reactions, 36 elements, molecules, quantities) travel as STRINGS checked by code, not as provider enums:
// the patch schema embeds the simulator spec several times and strict mode allows 1000 enum values in total. The prompt names the valid
// values, and a refused value comes back with the valid list for the bounded repair.
export function buildReactionsSpecSchema(): JsonSchema {
  return sObj({ reaction: sStr(), balance: sBool(), classify: sBool(), roles: sArr(sEnum(REACTION_ROLES), RXN_LIMITS.selections), conservationAid: sBool() });
}
export function buildStructureSpecSchema(): JsonSchema {
  return sObj({
    activity: sEnum(CHEM_ACTIVITIES),
    element: sNull(sStr()), massNumber: sNull(sInt(1, 300)), charge: sNull(sInt(-3, 3)),
    molecule: sNull(sStr()), formula: sNull(sStr()),
    periodicTable: sEnum(CHEM_PERIODIC_MODES), build: sBool(), shells: sBool(),
    quantities: sArr(sObj({ quantity: sStr(), element: sNull(sStr()) }), MAX_QUANTITIES),
    classifications: sArr(sEnum(CHEM_PROPERTIES), CHEM_LIMITS.classifications), formulaTargets: sArr(sEnum(COMPOSER_FORMULA_TARGETS), 2)
  });
}

// ── chemistryReactions@1 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const ROLE_TASK_LABEL = (role: ReactionRole) => ("حدّد في المعادلة: " + REACTION_ROLE_LABEL[role]).slice(0, RXN_LIMITS.labelChars);
/** The roles a catalog reaction can be asked about (non-empty term set), in vocabulary order. */
export const reactionRolesOf = (id: string): ReactionRole[] => { const c = catalogReaction(id); return c ? REACTION_ROLES.filter(r => (catalogRoleTerms(c, r) ?? []).length > 0) : []; };

export function buildReactionsSim(p: unknown, path: string): R<{ config: RxnConfigV1; checks: SimCheck[] }> {
  if (!hasExactKeys(p, ["reaction", "balance", "classify", "roles", "conservationAid"]) || typeof p.balance !== "boolean" || typeof p.classify !== "boolean" || typeof p.conservationAid !== "boolean"
    || !isArr(p.roles, RXN_LIMITS.selections) || !p.roles.every(r => isEnum(r, REACTION_ROLES)) || new Set(p.roles).size !== p.roles.length) return fail("AI_SIM_SPEC_MALFORMED", "مواصفة محاكاة التفاعلات غير صالحة.", path);
  const cat = catalogReaction(p.reaction);
  if (!cat) return fail("AI_SIM_TASK_INVALID", "التفاعل «" + String(p.reaction).slice(0, 60) + "» غير موجود في فهرس التفاعلات الموثّقة (المتاح: " + COMPOSER_REACTION_IDS.join(", ") + ").", path);
  const roles = p.roles as ReactionRole[];
  if (!p.balance && !p.classify && !roles.length) return fail("AI_SIM_TASK_INVALID", "أضف مهمة واحدة على الأقل (الوزن أو التصنيف أو تحديد دور مادة).", path);
  const available = reactionRolesOf(cat.id);
  const missing = roles.filter(r => !available.includes(r));
  if (missing.length) return fail("AI_SIM_TASK_INVALID", "تفاعل «" + cat.nameAr + "» لا يحتوي مادة بالدور: " + missing.map(r => REACTION_ROLE_LABEL[r]).join("، ") + (available.length ? " (الأدوار المتاحة: " + available.join(", ") + ")." : "."), path);
  // classification: every family that is not contested for this reaction; single choice only when exactly one of them is correct
  const options = REACTION_FAMILIES.filter(f => familyStatus(cat, f) !== "contested");
  const yes = options.filter(f => familyStatus(cat, f) === "yes");
  if (p.classify && !yes.length) return fail("AI_SIM_TASK_INVALID", "لا يوجد تصنيف متفق عليه لهذا التفاعل في الفهرس؛ احذف مهمة التصنيف.", path);
  const single = yes.length === 1;
  const config: RxnConfigV1 = {
    v: RXN_CONFIG_VERSION,
    reaction: { catalog: cat.id },
    // the conservation table tells the student whether the coefficients balance: an AID, off unless the spec asks for it
    view: { conservation: p.conservationAid, particles: p.conservationAid, states: true, names: true },
    tasks: {
      balance: p.balance ? { locked: [] } : null,
      classifications: p.classify ? [{ id: "family", label: single ? "ما نوع هذا التفاعل؟" : "اختر كل الأنواع التي ينتمي إليها هذا التفاعل", mode: single ? "single" : "multiple", options }] : [],
      selections: roles.map(role => ({ id: "role-" + role, label: ROLE_TASK_LABEL(role), role }))
    }
  };
  const checks: SimCheck[] = [];
  if (p.balance) {
    checks.push({ id: "balanced", label: "المعادلة موزونة (حفظ الذرات والشحنة)", weight: 2, kind: "rxn.balanced" });
    checks.push({ id: "lowest", label: "أصغر معاملات صحيحة", weight: 1, kind: "rxn.lowest" });
  }
  if (p.classify) checks.push({ id: "family-check", label: "تصنيف التفاعل", weight: 1, kind: "rxn.classification", taskId: "family" });
  for (const role of roles) checks.push({ id: "role-" + role + "-check", label: REACTION_ROLE_LABEL[role].slice(0, RXN_LIMITS.labelChars), weight: 1, kind: "rxn.selection", taskId: "role-" + role });
  return { ok: true, value: { config, checks } };
}

// ── chemistryStructure@1 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const PROPERTY_LABEL: Readonly<Record<ChemProperty, string>> = Object.freeze({
  block: "فئة العنصر في الجدول الدوري (s / p / d)", category: "تصنيف العنصر في الجدول الدوري", metalClass: "هل العنصر فلز أم شبه فلز أم لافلز؟",
  ionType: "نوع هذا النوع الكيميائي (أيون موجب / أيون سالب / متعادل)", shape: "الشكل الهندسي للجزيء", polarity: "قطبية الجزيء"
});
const TOLERANCE: Readonly<Record<string, number>> = Object.freeze({ "1": 0, "g/mol": 0.05, "%": 0.5 });
const QUANTITY = new Map(CHEM_QUANTITIES.map(q => [q.id, q]));

export function buildStructureSim(p: unknown, path: string): R<{ config: ChemConfigV1; checks: SimCheck[] }> {
  const KEYS = ["activity", "element", "massNumber", "charge", "molecule", "formula", "periodicTable", "build", "shells", "quantities", "classifications", "formulaTargets"];
  if (!hasExactKeys(p, KEYS) || !isEnum(p.activity, CHEM_ACTIVITIES) || !isEnum(p.periodicTable, CHEM_PERIODIC_MODES) || typeof p.build !== "boolean" || typeof p.shells !== "boolean"
    || !isArr(p.quantities, MAX_QUANTITIES) || !isArr(p.classifications, CHEM_LIMITS.classifications) || !isArr(p.formulaTargets, 2)) return fail("AI_SIM_SPEC_MALFORMED", "مواصفة محاكاة بنية المادة غير صالحة.", path);
  const activity = p.activity as ChemActivity;
  const bad = (message: string) => fail<{ config: ChemConfigV1; checks: SimCheck[] }>("AI_SIM_TASK_INVALID", message, path);
  // the public subject of the activity; the fields of the other activities must be null (never a silent drop)
  let subject: ChemConfigV1["subject"];
  if (activity === "atom") {
    if (p.molecule !== null || p.formula !== null) return bad("نشاط الذرة لا يأخذ جزيئًا ولا صيغة.");
    const e = chemElement(p.element);
    if (!e) return bad("حدّد رمز عنصر من الجدول (من H إلى Kr): " + CHEM_SYMBOLS.join(" ") + ".");
    if (p.massNumber === null) return bad("حدّد العدد الكتلي لنظير مدرج لـ " + e.symbol + " (" + chemMassNumbers(e).join("، ") + ").");
    const species = { element: e.symbol, massNumber: p.massNumber, charge: p.charge === null ? 0 : p.charge };
    const problem = speciesProblem(species);
    if (problem) return bad(problem);
    subject = species as { element: string; massNumber: number; charge: number };
  } else {
    if (p.element !== null || p.massNumber !== null || p.charge !== null) return bad("العنصر والعدد الكتلي والشحنة خاصة بنشاط الذرة.");
    if (activity === "molecule") {
      if (p.formula !== null || !chemMolecule(p.molecule)) return bad("اختر جزيئًا من فهرس الجزيئات (" + COMPOSER_MOLECULE_IDS.join(", ") + ").");
      subject = { molecule: p.molecule as string };
    } else {
      if (p.molecule !== null || typeof p.formula !== "string" || !p.formula.trim() || p.formula.length > 60) return bad("نشاط الصيغة يحتاج صيغة كيميائية (حتى 60 حرفًا).");
      const parsed = parseFormula(p.formula);
      if (!parsed.ok) return bad("الصيغة «" + p.formula + "» غير صالحة: " + parsed.message);
      subject = { formula: parsed.text };      // canonicalized by the trusted parser
    }
  }
  if ((p.build || p.shells) && activity !== "atom") return bad("بناء الذرة وتوزيع الإلكترونات متاحان في نشاط الذرة فقط.");
  // quantities → value tasks + chem.value checks (expected values derived by the trusted core at grading time)
  const values: ChemConfigV1["tasks"]["values"] = [];
  const checks: SimCheck[] = [];
  if (p.build) checks.push({ id: "particles", label: "بناء النوع الكيميائي (البروتونات والنيوترونات والإلكترونات)", weight: 3, kind: "chem.particles", particles: ["protons", "neutrons", "electrons"] });
  if (p.shells) checks.push({ id: "shells", label: "توزيع الإلكترونات على الأغلفة", weight: 2, kind: "chem.shells" });
  const seen = new Set<string>();
  for (const [i, raw] of (p.quantities as unknown[]).entries()) {
    if (!hasExactKeys(raw, ["quantity", "element"])) return fail("AI_SIM_SPEC_MALFORMED", "كمية مطلوبة غير صالحة.", path + ".quantities[" + i + "]");
    if (!isEnum(raw.quantity, COMPOSER_CHEM_QUANTITIES)) return bad("الكمية «" + String(raw.quantity).slice(0, 40) + "» غير معروفة (المتاح: " + COMPOSER_CHEM_QUANTITIES.join(", ") + ").");
    const q = QUANTITY.get(raw.quantity as string)!;
    if (!q.activities.includes(activity)) return bad("الكمية «" + q.label + "» غير متاحة في هذا النشاط.");
    let element: string | null = null;
    if (q.needs === "element") {
      const e = chemElement(raw.element);
      if (!e) return bad("الكمية «" + q.label + "» تحتاج رمز عنصر موجود في الجزيء أو الصيغة.");
      element = e.symbol;
    } else if (raw.element !== null) return bad("الكمية «" + q.label + "» لا تأخذ عنصرًا.");
    const id = "v-" + q.id + (element ? "-" + element : "");
    if (seen.has(id)) return bad("الكمية «" + q.label + "» مكررة.");
    seen.add(id);
    const label = (q.label + (element ? " (" + element + ")" : "")).slice(0, CHEM_LIMITS.labelChars);
    values.push({ id, label, unit: q.unit });
    checks.push({ id: id + "-check", label, weight: 1, kind: "chem.value", valueId: id, quantity: q.id, tolerance: TOLERANCE[q.unit] ?? 0, ...(element ? { element } : {}) });
  }
  const props = p.classifications as unknown[];
  if (!props.every(x => isEnum(x, CHEM_PROPERTIES)) || new Set(props).size !== props.length) return fail("AI_SIM_SPEC_MALFORMED", "التصنيفات المطلوبة غير صالحة.", path);
  const allowed = CHEM_ACTIVITY_PROPERTIES[activity];
  const wrong = (props as ChemProperty[]).filter(x => !allowed.includes(x));
  if (wrong.length) return bad("التصنيف «" + wrong.join("، ") + "» غير متاح في هذا النشاط" + (allowed.length ? " (المتاح: " + allowed.join(", ") + ")." : "."));
  const classifications = (props as ChemProperty[]).map(property => ({ id: "c-" + property, label: PROPERTY_LABEL[property], property }));
  for (const c of classifications) checks.push({ id: c.id + "-check", label: c.label, weight: 1, kind: "chem.classification", taskId: c.id });
  const targets = p.formulaTargets as unknown[];
  if (!targets.every(t => isEnum(t, COMPOSER_FORMULA_TARGETS)) || new Set(targets).size !== targets.length) return fail("AI_SIM_SPEC_MALFORMED", "أنواع الصيغ المطلوبة غير صالحة.", path);
  // a formula answer needs a composition to compare with, and must not be the visible subject itself
  if (targets.length && activity === "atom") return bad("كتابة الصيغة متاحة في نشاطي الجزيء والصيغة فقط.");
  if (activity === "formula" && targets.includes("molecular")) return bad("الصيغة الجزيئية معطاة في نشاط الصيغة؛ اطلب الصيغة الأولية فقط.");
  const formulas = (targets as ("molecular" | "empirical")[]).map(t => ({ id: "f-" + t, label: t === "molecular" ? "اكتب الصيغة الجزيئية للجزيء" : "اكتب الصيغة الأولية (أبسط نسبة عددية)" }));
  for (const f of formulas) checks.push({ id: f.id + "-check", label: f.label, weight: 2, kind: "chem.formula", formulaId: f.id, target: f.id.slice(2) });
  if (!checks.length) return bad("أضف مهمة واحدة على الأقل للطالب.");
  const config: ChemConfigV1 = {
    v: CHEM_CONFIG_VERSION, activity, subject,
    // identity / details would show the answers (the built species' name, the configuration, the formula): off for an assessment
    view: { periodicTable: activity === "molecule" ? "hidden" : p.periodicTable as ChemConfigV1["view"]["periodicTable"], identity: false, details: false, measure: false },
    tasks: { build: p.build as boolean, shells: p.shells as boolean, values, formulas, classifications, selection: null }
  };
  return { ok: true, value: { config, checks } };
}

// ── the model-facing catalog text ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** One line in the general catalog (bounded size); the full chemistry catalog travels only in the prompts that need it. */
export const CHEMISTRY_POINTER = "Chemistry simulators: their catalogs come with the section task that uses them; expected answers are derived by code.";
/** The FULL chemistry catalog: appended to a section prompt whose plan uses a chemistry simulator, and to a chemistry modify prompt. */
export function chemistryCatalogForPrompt(): string {
  const reactions = REACTION_CATALOG.map(c => {
    const r = catalogReactionV1(c);
    const roles = reactionRolesOf(c.id);
    return c.id + " = " + c.nameAr + " [" + (r ? equationText(r, null) : "") + "; families: " + (c.families.join("/") || "none") + (c.contested.length ? "; contested: " + c.contested.join("/") : "") + "; roles: " + (roles.join("/") || "none") + "; " + c.level + "]";
  });
  return [
    "CHEMISTRY CATALOG (exact ids; anything else is refused):",
    "chemistryReactions@1 (fill `reactions`): pick ONE catalog reaction id, then tasks: balance (the student writes all coefficients), classify (the reaction family; options and the key are built by code), roles (ONLY roles listed for that reaction), conservationAid (true shows the live atom-count table — an aid that reveals whether the equation balances; false for assessment). Catalog: " + reactions.join(" || "),
    "chemistryStructure@1 (fill `structure`): activity atom (element symbol, one of " + COMPOSER_ELEMENT_SYMBOLS.join(" ") + "; massNumber of a listed natural isotope, charge 0 or a simple ion; build / shells tasks), molecule (catalog: " + MOLECULES.map(m => m.id + "=" + m.formula).join(", ") + "), or formula (a valid chemical formula, e.g. C6H12O6, CuSO4·5H2O). Fields of the other activities are null. quantities (≤ " + MAX_QUANTITIES + "): " + CHEM_QUANTITIES.filter(q => COMPOSER_CHEM_QUANTITIES.includes(q.id)).map(q => q.id + " [" + q.activities.join("/") + (q.needs === "element" ? ", needs element" : "") + "]").join(", ") + "; classifications: atom " + CHEM_ACTIVITY_PROPERTIES.atom.join("/") + ", molecule " + CHEM_ACTIVITY_PROPERTIES.molecule.join("/") + "; formulaTargets: molecule molecular/empirical, formula empirical only. The subject is visible to the student; every expected value is derived by code, never by you."
  ].join("\n");
}

/** Whether a prompt needs the full chemistry catalog: a planned chemistry simulator, or chemistry named in a modify request / exam. */
export const CHEMISTRY_SIM_KEYS: readonly string[] = Object.freeze(["chemistryReactions", "chemistryStructure"]);
const CHEMISTRY_WORDS = /chemi|كيمي|כימי|تفاعل|معادل|ذر[ةه]|جزي[ءئ]|عنصر|حمض|reaction|molecul|atom|equation|element/i;
export const mentionsChemistry = (text: string): boolean => CHEMISTRY_WORDS.test(text) || CHEMISTRY_SIM_KEYS.some(k => text.includes(k));
