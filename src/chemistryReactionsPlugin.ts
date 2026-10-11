// Phase 21D-D.2 — chemistryReactions@1, the reaction & equation SmartSim plugin (pure; compiled into the shared server build and registered
// by src/trustedSimPlugins.ts). It binds the exact reaction engine (src/chemistry/reactions.ts), the curated catalog
// (src/chemistry/reactionCatalog.ts) and the strict config (src/chemistryReactionsModel.ts) to the SmartSim contract:
//   actions — coefficient.set / clear (a positive whole number 1–999 in front of a NON-locked term), equation.reset (clears every
//             coefficient), species.select / deselect (a term for a selection task), reaction.classify / unclassify (one family — single
//             choice — or a set of families — multiple choice — among the task's options). Live atom counting, the particle picture, the 3D
//             molecule viewer and every other view are PRESENTATION: never actions, never stored, never graded.
//   checks  — rxn.balanced (every element and the charge conserved, any positive whole numbers), rxn.lowest (exactly the smallest whole
//             numbers), rxn.element (one element conserved), rxn.charge (net charge conserved), rxn.coefficient (one term's smallest
//             coefficient), rxn.classification, rxn.selection. Every EXPECTED answer is derived at grading time by the exact solver or the
//             curated catalog; a check never carries an expected value. Balance checks require the COMPLETE equation (every coefficient the
//             student must write): a blank equation can never earn a conservation mark. All comparisons are exact integer / set equality —
//             there is no numeric tolerance anywhere in this plugin.
import {
  RXN_PLUGIN_KEY, RXN_PLUGIN_VERSION, exactKeys, expectedFamilies, roleTerms, rxnContext, validateRxnConfig,
  type RxnConfigV1, type RxnContext
} from "./chemistryReactionsModel";
import {
  REACTION_LIMITS, conservationTable, describeChargeRow, describeConservationRow, equationText, hasChargedTerm, reactionElements, termText, type ConservationTable
} from "./chemistry/reactions";
import { REACTION_FAMILIES, REACTION_FAMILY_LABEL, type ReactionFamily } from "./chemistry/reactionCatalog";
import { chemElement } from "./chemistry/elements";
import { isPlainObject } from "./trustedSimVocabulary";
import type { SmartSimCheckBase, SmartSimCheckOutcome, SmartSimIssue, SmartSimPlugin } from "./trustedSimRegistry";
import type { SmartSimPluginDescriptorV1 } from "./trustedSimDescriptor";

export const RXN_LABEL = "التفاعلات والمعادلات الكيميائية (الوزن، حفظ الذرات والشحنة، تصنيف التفاعلات)";
export const RXN_MAX_ACTIONS = 500;
export const RXN_CHECK_KINDS: readonly string[] = Object.freeze(["rxn.balanced", "rxn.lowest", "rxn.element", "rxn.charge", "rxn.coefficient", "rxn.classification", "rxn.selection"]);
export const RXN_ACTION_KINDS: readonly string[] = Object.freeze(["coefficient.set", "coefficient.clear", "equation.reset", "species.select", "species.deselect", "reaction.classify", "reaction.unclassify"]);
export type RxnAction =
  | { type: "coefficient.set"; termId: string; value: number } | { type: "coefficient.clear"; termId: string } | { type: "equation.reset" }
  | { type: "species.select"; taskId: string; termId: string } | { type: "species.deselect"; taskId: string; termId: string }
  | { type: "reaction.classify"; taskId: string; families: ReactionFamily[] } | { type: "reaction.unclassify"; taskId: string };
export type RxnStateV1 = { v: 1; coefficients: Record<string, number>; classifications: Record<string, ReactionFamily[]>; selections: Record<string, string[]> };
type Runtime = { coefficients: Map<string, number>; classifications: Map<string, ReactionFamily[]>; selections: Map<string, string[]> };
export type RxnCheck = SmartSimCheckBase & Record<string, unknown>;

const INVALID = { ok: false as const, code: "RXN_ACTION_INVALID" };
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export function normalizeRxnAction(raw: unknown, c: RxnConfigV1): { ok: true; action: RxnAction } | { ok: false; code: string } {
  if (!isPlainObject(raw) || typeof raw.type !== "string") return INVALID;
  const ctx = rxnContext(c), t = c.tasks, open = (id: unknown): id is string => typeof id === "string" && ctx.termIds.includes(id) && !!t.balance && !t.balance.locked.includes(id);
  switch (raw.type) {
    case "coefficient.set":
      if (!exactKeys(raw, ["type", "termId", "value"]) || !open(raw.termId) || !isInt(raw.value, 1, REACTION_LIMITS.coefficientMax)) return INVALID;
      return { ok: true, action: { type: "coefficient.set", termId: raw.termId, value: raw.value } };
    case "coefficient.clear":
      return exactKeys(raw, ["type", "termId"]) && open(raw.termId) ? { ok: true, action: { type: "coefficient.clear", termId: raw.termId } } : INVALID;
    case "equation.reset":
      return exactKeys(raw, ["type"]) && t.balance ? { ok: true, action: { type: "equation.reset" } } : INVALID;
    case "species.select":
    case "species.deselect":
      if (!exactKeys(raw, ["type", "taskId", "termId"]) || typeof raw.taskId !== "string" || !t.selections.some(s => s.id === raw.taskId) || typeof raw.termId !== "string" || !ctx.termIds.includes(raw.termId)) return INVALID;
      return { ok: true, action: { type: raw.type, taskId: raw.taskId, termId: raw.termId } };
    case "reaction.classify": {
      const task = typeof raw.taskId === "string" ? t.classifications.find(k => k.id === raw.taskId) : undefined;
      if (!task || !exactKeys(raw, ["type", "taskId", "families"]) || !Array.isArray(raw.families) || !raw.families.every(f => typeof f === "string" && (task.options as string[]).includes(f))
        || new Set(raw.families).size !== raw.families.length || raw.families.length < 1 || (task.mode === "single" && raw.families.length !== 1)) return INVALID;
      const chosen = raw.families as string[];
      return { ok: true, action: { type: "reaction.classify", taskId: task.id, families: REACTION_FAMILIES.filter(f => chosen.includes(f)) } };
    }
    case "reaction.unclassify":
      return exactKeys(raw, ["type", "taskId"]) && typeof raw.taskId === "string" && t.classifications.some(k => k.id === raw.taskId) ? { ok: true, action: { type: "reaction.unclassify", taskId: raw.taskId } } : INVALID;
    default:
      return INVALID;
  }
}
const createRuntime = (): Runtime => ({ coefficients: new Map(), classifications: new Map(), selections: new Map() });
function applyRxnAction(rt: Runtime, a: RxnAction): Runtime {
  const next: Runtime = { coefficients: new Map(rt.coefficients), classifications: new Map(rt.classifications), selections: new Map(rt.selections) };
  switch (a.type) {
    case "coefficient.set": next.coefficients.set(a.termId, a.value); break;
    case "coefficient.clear": next.coefficients.delete(a.termId); break;
    case "equation.reset": next.coefficients.clear(); break;
    case "species.select": { const cur = next.selections.get(a.taskId) ?? []; if (!cur.includes(a.termId)) next.selections.set(a.taskId, [...cur, a.termId]); break; }
    case "species.deselect": { const cur = (next.selections.get(a.taskId) ?? []).filter(id => id !== a.termId); if (cur.length) next.selections.set(a.taskId, cur); else next.selections.delete(a.taskId); break; }
    case "reaction.classify": next.classifications.set(a.taskId, [...a.families]); break;
    case "reaction.unclassify": next.classifications.delete(a.taskId); break;
  }
  return next;
}
/** Canonical state: coefficients in term order, task answers in task order, selected terms in term order. */
function canonicalRxnState(rt: Runtime, c: RxnConfigV1): RxnStateV1 {
  const ids = rxnContext(c).termIds;
  const coefficients: Record<string, number> = {}, classifications: Record<string, ReactionFamily[]> = {}, selections: Record<string, string[]> = {};
  for (const id of ids) if (rt.coefficients.has(id)) coefficients[id] = rt.coefficients.get(id)!;
  for (const t of c.tasks.classifications) if (rt.classifications.has(t.id)) classifications[t.id] = [...rt.classifications.get(t.id)!];
  for (const t of c.tasks.selections) { const s = rt.selections.get(t.id); if (s?.length) selections[t.id] = ids.filter(id => s.includes(id)); }
  return { v: 1, coefficients, classifications, selections };
}
export const initialRxnState = (): RxnStateV1 => ({ v: 1, coefficients: {}, classifications: {}, selections: {} });

// ---------------------------------------------------------------------------------------------------------------------------------------
// Trusted derived answers (never stored).
/** The full coefficient vector the student's state stands for: locked terms carry the smallest coefficient, the rest the student's (or null). */
export function studentCoefficients(state: Pick<RxnStateV1, "coefficients">, c: RxnConfigV1): (number | null)[] {
  const ctx = rxnContext(c), locked = c.tasks.balance?.locked ?? [];
  return ctx.termIds.map((id, i) => (locked.includes(id) ? ctx.lowest[i] : own(state.coefficients, id) && isInt(state.coefficients[id], 1, REACTION_LIMITS.coefficientMax) ? state.coefficients[id] : null));
}
export const studentTable = (state: Pick<RxnStateV1, "coefficients">, c: RxnConfigV1): ConservationTable => conservationTable(rxnContext(c).reaction, studentCoefficients(state, c));
const termLabel = (ctx: RxnContext, id: string) => { const i = ctx.termIds.indexOf(id), t = [...ctx.reaction.reactants, ...ctx.reaction.products][i]; return t ? termText(t) : id; };
const familiesText = (fs: readonly string[] | undefined) => (fs && fs.length ? fs.map(f => REACTION_FAMILY_LABEL[f as ReactionFamily] ?? f).join("، ") : "—");
const elementName = (el: string) => chemElement(el)?.nameAr ?? "";

// ---------------------------------------------------------------------------------------------------------------------------------------
// Checks.
const GENERIC = ["id", "label", "weight", "kind"];
export function validateRxnCheck(raw: Record<string, unknown>, c: RxnConfigV1): { ok: true; check: RxnCheck } | { ok: false; issues: SmartSimIssue[] } {
  const label = String(raw.label);
  const fail = (message: string) => ({ ok: false as const, issues: [{ code: "RXN_CHECK_INVALID", message: "الفحص «" + label + "»: " + message }] });
  const base = { id: raw.id as string, label: raw.label as string, weight: raw.weight as number, kind: raw.kind as string };
  const ctx = rxnContext(c), balance = c.tasks.balance;
  const needBalance = () => (balance ? undefined : fail("لا توجد مهمة وزن في هذا السؤال."));
  switch (raw.kind) {
    case "rxn.balanced":
    case "rxn.lowest":
      if (!exactKeys(raw, GENERIC)) return fail("معاملات الفحص غير مطابقة لنوعه.");
      return needBalance() ?? { ok: true, check: base };
    case "rxn.charge":
      if (!exactKeys(raw, GENERIC)) return fail("معاملات الفحص غير مطابقة لنوعه.");
      if (!hasChargedTerm(ctx.reaction)) return fail("لا توجد أيونات في المعادلة؛ حفظ الشحنة متحقق دائمًا فلا يُقيَّم.");
      return needBalance() ?? { ok: true, check: base };
    case "rxn.element":
      if (!exactKeys(raw, [...GENERIC, "element"])) return fail("معاملات الفحص غير مطابقة لنوعه.");
      if (typeof raw.element !== "string" || !reactionElements(ctx.reaction).includes(raw.element)) return fail("حدّد عنصرًا موجودًا في المعادلة.");
      return needBalance() ?? { ok: true, check: { ...base, element: raw.element } };
    case "rxn.coefficient":
      if (!exactKeys(raw, [...GENERIC, "termId"])) return fail("معاملات الفحص غير مطابقة لنوعه.");
      if (typeof raw.termId !== "string" || !ctx.termIds.includes(raw.termId)) return fail("حدّد مادة من المعادلة.");
      if (balance?.locked.includes(raw.termId)) return fail("معامل هذه المادة معطى للطالب؛ اختر مادة يكتب الطالب معاملها.");
      return needBalance() ?? { ok: true, check: { ...base, termId: raw.termId } };
    case "rxn.classification": {
      if (!exactKeys(raw, [...GENERIC, "taskId"])) return fail("معاملات الفحص غير مطابقة لنوعه.");
      const task = c.tasks.classifications.find(k => k.id === raw.taskId);
      if (!task) return fail("يشير إلى مهمة تصنيف غير معرّفة.");
      if (!expectedFamilies(ctx, task)?.length) return fail("التصنيف غير معرّف لهذا التفاعل.");
      return { ok: true, check: { ...base, taskId: task.id } };
    }
    case "rxn.selection": {
      if (!exactKeys(raw, [...GENERIC, "taskId"])) return fail("معاملات الفحص غير مطابقة لنوعه.");
      const task = c.tasks.selections.find(k => k.id === raw.taskId);
      if (!task) return fail("يشير إلى مهمة اختيار غير معرّفة.");
      if (!roleTerms(ctx, task.role)?.length) return fail("الدور غير معرّف لهذا التفاعل.");
      return { ok: true, check: { ...base, taskId: task.id } };
    }
    default:
      return fail("نوع فحص غير معروف.");
  }
}
/** The trusted expected answer of a validated check, as display text (teacher authoring preview and review). */
export function expectedRxnText(check: RxnCheck, c: RxnConfigV1): string {
  const ctx = rxnContext(c);
  switch (check.kind) {
    case "rxn.balanced": return equationText(ctx.reaction, ctx.lowest) + " (أو أي مضاعف لها)";
    case "rxn.lowest": return equationText(ctx.reaction, ctx.lowest, { explicitOnes: true });
    case "rxn.element": return (elementName(check.element as string) + " " + String(check.element)).trim() + ": العدد نفسه في الجهتين";
    case "rxn.charge": return "الشحنة الكلية نفسها في الجهتين";
    case "rxn.coefficient": { const i = ctx.termIds.indexOf(check.termId as string); return ctx.lowest[i] + " " + termLabel(ctx, check.termId as string); }
    case "rxn.classification": { const task = c.tasks.classifications.find(k => k.id === check.taskId); return task ? familiesText(expectedFamilies(ctx, task) ?? []) : "—"; }
    case "rxn.selection": { const task = c.tasks.selections.find(k => k.id === check.taskId); return task ? (roleTerms(ctx, task.role) ?? []).map(id => termLabel(ctx, id)).join("، ") : "—"; }
  }
  return "—";
}
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
export function evaluateRxnCheck(check: RxnCheck, state: RxnStateV1, c: RxnConfigV1): SmartSimCheckOutcome {
  const ctx = rxnContext(c), expected = expectedRxnText(check, c);
  const coeffs = studentCoefficients(state, c), table = conservationTable(ctx.reaction, coeffs);
  const actualEquation = () => equationText(ctx.reaction, coeffs, { explicitOnes: true }) + (table.complete ? "" : " — ناقصة");
  const evidence = () => [...table.rows.filter(r => !r.balanced).map(r => describeConservationRow(r, elementName(r.element))), ...(table.charge && !table.charge.balanced ? [describeChargeRow(table.charge)] : [])].slice(0, 8);
  switch (check.kind) {
    case "rxn.balanced": {
      const ev = table.complete ? evidence() : [];
      return { expected, actual: actualEquation() + (table.complete ? (table.balanced ? " — موزونة" : " — غير موزونة") : ""), passed: table.balanced, ...(ev.length ? { evidence: ev } : {}) };
    }
    case "rxn.lowest":
      return { expected, actual: actualEquation(), passed: table.complete && coeffs.every((x, i) => x === ctx.lowest[i]) };
    case "rxn.element": {
      const row = table.rows.find(r => r.element === check.element);
      return { expected, actual: row ? describeConservationRow(row, elementName(row.element)) + (table.complete ? "" : " (المعادلة ناقصة)") : "—", passed: table.complete && !!row?.balanced };
    }
    case "rxn.charge":
      return { expected, actual: table.charge ? describeChargeRow(table.charge) + (table.complete ? "" : " (المعادلة ناقصة)") : "—", passed: table.complete && !!table.charge?.balanced };
    case "rxn.coefficient": {
      const i = ctx.termIds.indexOf(check.termId as string), got = coeffs[i];
      return { expected, actual: got === null || got === undefined ? "—" : got + " " + termLabel(ctx, check.termId as string), passed: got === ctx.lowest[i] };
    }
    case "rxn.classification": {
      const task = c.tasks.classifications.find(k => k.id === check.taskId), want = task ? expectedFamilies(ctx, task) : null;
      const got = own(state.classifications, check.taskId as string) ? state.classifications[check.taskId as string] : undefined;
      return { expected, actual: familiesText(got), passed: !!want && want.length > 0 && Array.isArray(got) && sameList(got, want) };
    }
    case "rxn.selection": {
      const task = c.tasks.selections.find(k => k.id === check.taskId), want = task ? roleTerms(ctx, task.role) : null;
      const got = own(state.selections, check.taskId as string) ? state.selections[check.taskId as string] : [];
      return { expected, actual: got.length ? got.map(id => termLabel(ctx, id)).join("، ") : "—", passed: !!want && want.length > 0 && sameList(got, want) };
    }
  }
  return { expected: "—", actual: "—", passed: false };
}

export const CHEMISTRY_REACTIONS_DESCRIPTOR_V1: SmartSimPluginDescriptorV1 = {
  descriptorVersion: 1, key: RXN_PLUGIN_KEY, version: RXN_PLUGIN_VERSION, label: RXN_LABEL, domain: "chemistry",
  sceneKinds: ["2d", "3d"], rendererFamilies: ["svg2d", "custom", "table", "form"],
  capabilities: ["scene.2d", "scene.3d", "camera.rotate", "camera.zoom", "object.select", "value.set"],
  actionKinds: [...RXN_ACTION_KINDS], checkKinds: [...RXN_CHECK_KINDS], genericRules: [], assetKinds: [],
  tools: ["select", "form", "rotateView", "zoomView"], accessibility: ["keyboardAlternative", "semanticLabels", "objectList", "toolLabels", "textTranscript"],
  supports: { autosave: true, restore: true, reset: true, partialCredit: true, offline: true, twoDimensional: true, threeDimensional: true }
};
export const chemistryReactionsPluginV1: SmartSimPlugin<RxnConfigV1, Runtime, RxnStateV1, RxnAction, RxnCheck> = Object.freeze({
  key: RXN_PLUGIN_KEY,
  version: RXN_PLUGIN_VERSION,
  label: RXN_LABEL,
  maxActions: RXN_MAX_ACTIONS,
  descriptor: CHEMISTRY_REACTIONS_DESCRIPTOR_V1,
  checkKinds: RXN_CHECK_KINDS,
  validateConfig: (raw: unknown) => validateRxnConfig(raw),
  createRuntime,
  normalizeAction: normalizeRxnAction,
  applyAction: (rt: Runtime, a: RxnAction) => applyRxnAction(rt, a),
  canonicalState: (rt: Runtime, c: RxnConfigV1) => canonicalRxnState(rt, c),
  serializeState: (s: RxnStateV1) => JSON.stringify(s),
  validateCheck: validateRxnCheck,
  evaluateCheck: evaluateRxnCheck
});
