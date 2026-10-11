// Phase 21D-D.2 — chemistryReactions@1: the PUBLIC configuration of the reaction & equation simulations (pure; compiled into the shared
// server build). One versioned contract over the trusted reaction engine (src/chemistry/reactions.ts) and catalog
// (src/chemistry/reactionCatalog.ts):
//   { v: 1, reaction, view, tasks }
//   reaction — { catalog: id } (a curated, sourced equation) | { custom: { reactants, products } } (a teacher's equation of
//              { formula, charge, state } terms, accepted only when the exact solver finds a UNIQUE positive balancing). It is always
//              visible to the student: the equation's species are the question, never a secret.
//   view     — conservation (the live atom-count table with differences and status — it tells the student whether the coefficients
//              balance), particles (the particle picture of every term × its coefficient), states (state symbols), names (substance
//              names; catalog only).
//   tasks    — balance ({ locked } — coefficients shown as given; the student supplies the others) · classifications (single or multiple
//              choice among offered families; catalog only, and never offering a family that is contested for that reaction) ·
//              selections (pick the terms with a role: oxidizing / reducing agent, acid, base, precipitate, fuel — catalog only — or
//              element, compound, ion — any reaction, by definition).
// Strict: exact keys, exact version, catalog references, bounded text; anything else is REFUSED, never repaired. Every expected answer
// (the smallest coefficients, the family, the role terms) is derived from trusted data at grading time — never stored here.
import { hasControlCharacter, isPlainObject, isSemanticId } from "./trustedSimVocabulary";
import {
  BALANCE_FAILURE_MESSAGE, REACTION_LIMITS, REACTION_STATES, balanceReaction, reactionTermIds, validateReaction, type ReactionV1
} from "./chemistry/reactions";
import {
  CATALOG_ONLY_ROLES, REACTION_FAMILIES, REACTION_FAMILY_LABEL, REACTION_ROLES, REACTION_ROLE_LABEL, catalogReaction, catalogReactionV1, catalogRoleTerms, familyStatus, termRole,
  type CatalogReaction, type ReactionFamily, type ReactionRole
} from "./chemistry/reactionCatalog";
import { parseFormula } from "./chemistry/formula";

export const RXN_PLUGIN_KEY = "chemistryReactions";
export const RXN_PLUGIN_VERSION = 1;
export const RXN_CONFIG_VERSION = 1 as const;
export const RXN_LIMITS = Object.freeze({ classifications: 4, selections: 4, labelChars: 80 });
export const RXN_CLASSIFICATION_MODES = Object.freeze(["single", "multiple"] as const);
export type RxnClassificationMode = (typeof RXN_CLASSIFICATION_MODES)[number];

export type RxnTermConfig = { formula: string; charge: number; state: string | null };
export type RxnReactionRef = { catalog: string } | { custom: { reactants: RxnTermConfig[]; products: RxnTermConfig[] } };
export type RxnView = { conservation: boolean; particles: boolean; states: boolean; names: boolean };
export type RxnBalanceTask = { locked: string[] };
export type RxnClassificationTask = { id: string; label: string; mode: RxnClassificationMode; options: ReactionFamily[] };
export type RxnSelectionTask = { id: string; label: string; role: ReactionRole };
export type RxnTasks = { balance: RxnBalanceTask | null; classifications: RxnClassificationTask[]; selections: RxnSelectionTask[] };
export type RxnConfigV1 = { v: 1; reaction: RxnReactionRef; view: RxnView; tasks: RxnTasks };
export type RxnIssue = { code: string; message: string; path?: string };
export type RxnConfigResult = { ok: true; config: RxnConfigV1 } | { ok: false; issues: RxnIssue[] };

/** The resolved, trusted context of a VALID config: the engine reaction, its catalog entry (or null), term ids and smallest coefficients. */
export type RxnContext = { reaction: ReactionV1; catalog: CatalogReaction | null; termIds: string[]; lowest: number[] };

const P = "smartSim.config";
const L = RXN_LIMITS;
export const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(o, k));
const isLabel = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= L.labelChars && !hasControlCharacter(v);
const ENGINE_MESSAGE: Readonly<Record<string, string>> = Object.freeze({
  REACTION_SCHEMA_INVALID: "المعادلة تحتاج قائمة المتفاعلات وقائمة النواتج فقط.",
  REACTION_TERMS_INVALID: "من مادة واحدة إلى " + REACTION_LIMITS.termsPerSide + " مواد في كل جهة، و" + REACTION_LIMITS.totalTerms + " مادة على الأكثر في المعادلة.",
  REACTION_TERM_INVALID: "كل مادة تحتاج الصيغة والشحنة (عدد صحيح من −" + REACTION_LIMITS.chargeAbsMax + " إلى +" + REACTION_LIMITS.chargeAbsMax + ") والحالة (s أو l أو g أو aq أو بلا حالة) فقط.",
  REACTION_FORMULA_INVALID: "صيغة غير صالحة أو غير معيارية.",
  REACTION_TERM_DUPLICATE: "المادة نفسها (التركيب والشحنة) مكررة في المعادلة."
});

/** Resolves a reaction reference: the engine reaction and its catalog entry, or the first problem (with an Arabic message). */
export function resolveReactionRef(raw: unknown): { ok: true; reaction: ReactionV1; catalog: CatalogReaction | null; ref: RxnReactionRef } | { ok: false; issue: RxnIssue } {
  const where = P + ".reaction";
  const bad = (code: string, message: string, path = where) => ({ ok: false as const, issue: { code, message, path } });
  if (isPlainObject(raw) && exactKeys(raw, ["catalog"])) {
    const c = catalogReaction(raw.catalog), r = c ? catalogReactionV1(c) : undefined;
    if (!c || !r) return bad("RXN_REACTION_UNKNOWN", "تفاعل غير موجود في فهرس التفاعلات الموثّقة: " + String(raw.catalog), where + ".catalog");
    return { ok: true, reaction: r, catalog: c, ref: { catalog: c.id } };
  }
  if (!isPlainObject(raw) || !exactKeys(raw, ["custom"]) || !isPlainObject(raw.custom) || !exactKeys(raw.custom, ["reactants", "products"])) {
    return bad("RXN_REACTION_INVALID", "اختر تفاعلًا من الفهرس أو اكتب معادلة (متفاعلات ونواتج).");
  }
  const custom = raw.custom;
  for (const side of ["reactants", "products"] as const) {
    const list = custom[side];
    if (Array.isArray(list)) for (const [i, t] of list.entries()) {
      if (!isPlainObject(t) || !exactKeys(t, ["formula", "charge", "state"])) return bad("RXN_REACTION_INVALID", ENGINE_MESSAGE.REACTION_TERM_INVALID, where + ".custom." + side + "[" + i + "]");
      if (typeof t.formula === "string") {
        const p = parseFormula(t.formula);
        if (!p.ok) return bad("RXN_REACTION_INVALID", "الصيغة «" + t.formula + "» غير صالحة: " + p.message, where + ".custom." + side + "[" + i + "].formula");
        if (p.text !== t.formula) return bad("RXN_REACTION_INVALID", "اكتب الصيغة بالصورة المعيارية: " + p.text, where + ".custom." + side + "[" + i + "].formula");
      }
    }
  }
  const v = validateReaction(custom);
  if (!v.ok) return bad("RXN_REACTION_INVALID", ENGINE_MESSAGE[v.code] ?? "المعادلة غير صالحة.", v.path.replace(/^reaction/, where + ".custom"));
  const b = balanceReaction(v.reaction);
  if (!b.ok) return bad("RXN_REACTION_UNBALANCEABLE", BALANCE_FAILURE_MESSAGE[b.code] + (b.elements?.length ? " (" + b.elements.join("، ") + ")" : "") + ".");
  const terms = (list: unknown[]) => list.map(t => { const x = t as Record<string, unknown>; return { formula: x.formula as string, charge: x.charge as number, state: (x.state as string | null) ?? null }; });
  return { ok: true, reaction: v.reaction, catalog: null, ref: { custom: { reactants: terms(custom.reactants as unknown[]), products: terms(custom.products as unknown[]) } } };
}

const CONTEXT = new WeakMap<object, RxnContext>();
/** The trusted context of a VALID config (memoized per canonical config object). */
export function rxnContext(c: RxnConfigV1): RxnContext {
  const hit = CONTEXT.get(c);
  if (hit) return hit;
  const r = resolveReactionRef(c.reaction);
  if (!r.ok) throw new Error("rxnContext requires a valid config");
  const b = balanceReaction(r.reaction);
  if (!b.ok) throw new Error("rxnContext requires a balanceable reaction");
  const ctx: RxnContext = { reaction: r.reaction, catalog: r.catalog, termIds: reactionTermIds(r.reaction), lowest: b.coefficients };
  CONTEXT.set(c, ctx);
  return ctx;
}
/** The term ids having a role (derived or curated), in term order; null when the role is not answerable for this reaction. */
export function roleTerms(ctx: Pick<RxnContext, "reaction" | "catalog" | "termIds">, role: ReactionRole): string[] | null {
  if (ctx.catalog) return catalogRoleTerms(ctx.catalog, role);
  if (CATALOG_ONLY_ROLES.includes(role)) return null;
  const terms = [...ctx.reaction.reactants, ...ctx.reaction.products];
  return ctx.termIds.filter((_, i) => termRole(terms[i]) === role);
}
/** The families a classification task expects (catalog "yes" families among its options, in vocabulary order); null when undefined. */
export function expectedFamilies(ctx: Pick<RxnContext, "catalog">, task: Pick<RxnClassificationTask, "options">): ReactionFamily[] | null {
  if (!ctx.catalog) return null;
  const cat = ctx.catalog;
  if (task.options.some(f => familyStatus(cat, f) === "contested")) return null;
  return REACTION_FAMILIES.filter(f => task.options.includes(f) && familyStatus(cat, f) === "yes");
}

export function validateRxnConfig(raw: unknown): RxnConfigResult {
  const issues: RxnIssue[] = [];
  const add = (code: string, message: string, path: string) => { issues.push({ code, message, path }); };
  if (!isPlainObject(raw)) return { ok: false, issues: [{ code: "RXN_CONFIG_INVALID", message: "إعداد محاكاة التفاعلات مفقود أو غير صالح.", path: P }] };
  for (const k of Object.keys(raw)) if (!["v", "reaction", "view", "tasks"].includes(k)) add("RXN_CONFIG_UNKNOWN_KEY", "حقل غير مسموح في إعداد محاكاة التفاعلات: " + k, P + "." + k);
  if (raw.v !== RXN_CONFIG_VERSION) add("RXN_CONFIG_VERSION_UNSUPPORTED", "إصدار إعداد محاكاة التفاعلات غير مدعوم.", P + ".v");
  const resolved = resolveReactionRef(raw.reaction);
  if (!resolved.ok) { issues.push(resolved.issue); return { ok: false, issues }; }
  const ctx: Pick<RxnContext, "reaction" | "catalog" | "termIds"> = { reaction: resolved.reaction, catalog: resolved.catalog, termIds: reactionTermIds(resolved.reaction) };
  const view = validateView(raw.view, ctx, add);
  const tasks = validateTasks(raw.tasks, ctx, add);
  if (issues.length || !view || !tasks) return { ok: false, issues: issues.length ? issues : [{ code: "RXN_CONFIG_INVALID", message: "إعداد محاكاة التفاعلات غير صالح.", path: P }] };
  return { ok: true, config: { v: RXN_CONFIG_VERSION, reaction: resolved.ref, view, tasks } };
}

function validateView(raw: unknown, ctx: Pick<RxnContext, "catalog">, add: (c: string, m: string, p: string) => void): RxnView | undefined {
  const where = P + ".view";
  if (!isPlainObject(raw) || !exactKeys(raw, ["conservation", "particles", "states", "names"]) || !["conservation", "particles", "states", "names"].every(k => typeof raw[k] === "boolean")) {
    add("RXN_VIEW_INVALID", "إعداد العرض غير صالح (أربعة خيارات منطقية: جدول حفظ الذرات، صورة الجسيمات، الحالات، أسماء المواد).", where); return undefined;
  }
  if (raw.names && !ctx.catalog) { add("RXN_VIEW_INVALID", "أسماء المواد متاحة لتفاعلات الفهرس الموثّق فقط.", where + ".names"); return undefined; }
  return { conservation: raw.conservation as boolean, particles: raw.particles as boolean, states: raw.states as boolean, names: raw.names as boolean };
}
function validateTasks(raw: unknown, ctx: Pick<RxnContext, "reaction" | "catalog" | "termIds">, add: (c: string, m: string, p: string) => void): RxnTasks | undefined {
  const where = P + ".tasks";
  if (!isPlainObject(raw) || !exactKeys(raw, ["balance", "classifications", "selections"]) || !Array.isArray(raw.classifications) || !Array.isArray(raw.selections)) {
    add("RXN_TASK_INVALID", "قائمة المهام غير صالحة (الوزن، التصنيفات، الاختيارات).", where); return undefined;
  }
  let ok = true;
  const fail = (code: string, message: string, path: string) => { add(code, message, path); ok = false; };
  let balance: RxnBalanceTask | null = null;
  if (raw.balance !== null) {
    const b = raw.balance, path = where + ".balance";
    if (!isPlainObject(b) || !exactKeys(b, ["locked"]) || !Array.isArray(b.locked) || !b.locked.every(id => typeof id === "string" && ctx.termIds.includes(id)) || new Set(b.locked).size !== b.locked.length) {
      fail("RXN_BALANCE_INVALID", "مهمة الوزن غير صالحة: المعاملات المعطاة يجب أن تشير إلى مواد المعادلة دون تكرار.", path);
    } else if (b.locked.length >= ctx.termIds.length) {
      fail("RXN_BALANCE_INVALID", "اترك معاملًا واحدًا على الأقل يكتبه الطالب.", path + ".locked");
    } else balance = { locked: ctx.termIds.filter(id => (b.locked as string[]).includes(id)) };
  }
  if (raw.classifications.length > L.classifications || raw.selections.length > L.selections) {
    add("RXN_TASKS_TOO_MANY", "عدد المهام يتجاوز الحد (" + L.classifications + " تصنيفات و" + L.selections + " اختيارات).", where); return undefined;
  }
  const seen = new Set<string>();
  const ident = (id: unknown, path: string): id is string => {
    if (!isSemanticId(id)) { fail("RXN_TASK_INVALID", "معرّف المهمة غير صالح.", path); return false; }
    if (seen.has(id)) { fail("RXN_TASK_ID_DUPLICATE", "معرّف مهمة مكرر: " + id, path); return false; }
    if (ctx.termIds.includes(id)) { fail("RXN_TASK_ID_COLLISION", "معرّف المهمة «" + id + "» يطابق معرّف مادة في المعادلة؛ غيّره.", path); return false; }
    seen.add(id); return true;
  };
  const classifications: RxnClassificationTask[] = [];
  raw.classifications.forEach((t, i) => {
    const path = where + ".classifications[" + i + "]";
    if (!isPlainObject(t) || !exactKeys(t, ["id", "label", "mode", "options"]) || !isLabel(t.label) || typeof t.mode !== "string" || !(RXN_CLASSIFICATION_MODES as readonly string[]).includes(t.mode)
      || !Array.isArray(t.options) || t.options.length < 2 || !t.options.every(f => typeof f === "string" && (REACTION_FAMILIES as readonly string[]).includes(f)) || new Set(t.options).size !== t.options.length) {
      fail("RXN_TASK_INVALID", "مهمة التصنيف رقم " + (i + 1) + " غير صالحة (المعرّف، الوصف حتى " + L.labelChars + " حرفًا، نوع الاختيار، خياران مختلفان على الأقل من أنواع التفاعلات).", path); return;
    }
    if (!ident(t.id, path)) return;
    if (!ctx.catalog) { fail("RXN_CLASSIFICATION_UNSUPPORTED", "تصنيف التفاعل متاح لتفاعلات الفهرس الموثّق فقط؛ لا يُستنتج نوع التفاعل من شكل الصيغ.", path); return; }
    const cat = ctx.catalog, options = REACTION_FAMILIES.filter(f => (t.options as string[]).includes(f));
    const contested = options.filter(f => familyStatus(cat, f) === "contested"), yes = options.filter(f => familyStatus(cat, f) === "yes");
    if (contested.length) { fail("RXN_CLASSIFICATION_CONTESTED", "الخيار «" + contested.map(f => REACTION_FAMILY_LABEL[f]).join("»، «") + "» مختلف عليه لهذا التفاعل بين المناهج والظروف؛ احذفه من الخيارات حتى لا يُخطَّأ طالب في إجابة مقبولة.", path + ".options"); return; }
    if (t.mode === "single" && yes.length !== 1) { fail("RXN_CLASSIFICATION_AMBIGUOUS", yes.length === 0 ? "لا يوجد بين الخيارات تصنيف صحيح لهذا التفاعل." : "أكثر من خيار صحيح لهذا التفاعل (" + yes.map(f => REACTION_FAMILY_LABEL[f]).join("، ") + ")؛ استخدم الاختيار المتعدد أو احذف أحدها.", path + ".options"); return; }
    if (t.mode === "multiple" && yes.length === 0) { fail("RXN_CLASSIFICATION_AMBIGUOUS", "لا يوجد بين الخيارات تصنيف صحيح لهذا التفاعل.", path + ".options"); return; }
    classifications.push({ id: t.id, label: t.label as string, mode: t.mode as RxnClassificationMode, options });
  });
  const selections: RxnSelectionTask[] = [];
  raw.selections.forEach((t, i) => {
    const path = where + ".selections[" + i + "]";
    if (!isPlainObject(t) || !exactKeys(t, ["id", "label", "role"]) || !isLabel(t.label) || typeof t.role !== "string" || !(REACTION_ROLES as readonly string[]).includes(t.role)) {
      fail("RXN_TASK_INVALID", "مهمة الاختيار رقم " + (i + 1) + " غير صالحة (المعرّف، الوصف، الدور).", path); return;
    }
    if (!ident(t.id, path)) return;
    const role = t.role as ReactionRole, expected = roleTerms(ctx, role);
    if (expected === null) { fail("RXN_SELECTION_UNSUPPORTED", "الدور «" + REACTION_ROLE_LABEL[role] + "» متاح لتفاعلات الفهرس الموثّق فقط.", path + ".role"); return; }
    if (expected.length === 0) { fail("RXN_SELECTION_EMPTY", "لا توجد في هذا التفاعل مادة بالدور «" + REACTION_ROLE_LABEL[role] + "».", path + ".role"); return; }
    selections.push({ id: t.id, label: t.label as string, role });
  });
  if (!ok) return undefined;
  if (!balance && !classifications.length && !selections.length) { add("RXN_TASKS_EMPTY", "أضف مهمة واحدة على الأقل للطالب (الوزن أو التصنيف أو الاختيار).", where); return undefined; }
  return { balance, classifications, selections };
}
export const RXN_STATES = REACTION_STATES;
