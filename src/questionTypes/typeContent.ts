// Phase 16A — decides whether changing a node's question type would discard meaningful authored data (→ the shared
// confirmation dialog in QuestionComposer) and turns the canonical changeQuestionType / changePartType result into the PATCH
// form the builder hosts merge. Pure, builder-only: kept out of the shared build and the initial graph.
import type { BuilderPart, BuilderPartType, BuilderQuestion, BuilderQuestionType } from "../examTypes";
import { changePartType, changeQuestionType } from "../examBuilderState";

/** The PATCH form of changeQuestionType for hosts that merge patches: every key of the previous question that the new
 *  shape does not carry is reset explicitly (undefined → removed by mergePatch), so no stale option / field / key survives. */
export function typeChangePatch(q: BuilderQuestion, type: BuilderQuestionType): Partial<BuilderQuestion> {
  const next = changeQuestionType(q, type) as unknown as Record<string, unknown>;
  const patch: Record<string, unknown> = { ...next };
  for (const k of Object.keys(q)) if (!(k in next)) patch[k] = undefined;
  return patch as Partial<BuilderQuestion>;
}
export function partTypeChangePatch(p: BuilderPart, type: BuilderPartType): Partial<BuilderPart> {
  const next = changePartType(p, type) as unknown as Record<string, unknown>;
  const patch: Record<string, unknown> = { ...next };
  for (const k of Object.keys(p)) if (!(k in next)) patch[k] = undefined;
  return patch as Partial<BuilderPart>;
}

const text = (v: unknown) => String(v ?? "").trim();
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** True when the node carries authored, type-specific content beyond an untouched default (options text, keys, rows, parts…). */
export function typeSpecificContentPresent(node: Record<string, unknown>): boolean {
  const options = Array.isArray(node.options) ? node.options : [];
  if (options.some(o => isObj(o) && (text(o.text) || text(o.label) || text(o.value)))) return true;
  const fields = Array.isArray(node.fields) ? node.fields : [];
  if (fields.some(f => isObj(f) && (text(f.label) || text(f.statement) || f.correct !== undefined && text(f.correct) !== "" || (Array.isArray(f.options) && f.options.length)))) return true;
  if (Array.isArray(node.wordBank) && node.wordBank.some(w => text(w))) return true;
  if (text(node.cli)) return true;
  if (Array.isArray(node.tableRows) && node.tableRows.some(r => Array.isArray(r) && r.some(c => text(c)))) return true;
  if (Array.isArray(node.tableHeaders) && node.tableHeaders.some(h => text(h))) return true;
  if (Array.isArray(node.parts) && node.parts.some(p => isObj(p) && (text(p.text) || typeSpecificContentPresent(p)))) return true;
  for (const cfgKey of ["matrix", "categorization"]) {
    const cfg = node[cfgKey];
    if (isObj(cfg)) for (const list of Object.values(cfg)) if (Array.isArray(list) && list.some(e => isObj(e) && text(e.label))) return true;
  }
  const answer = isObj(node.answer) ? node.answer : {};
  // Phase 17A — coding: starter code, public samples, hidden tests or reference solutions are authored content.
  if (isObj(node.coding)) {
    const c = node.coding;
    if (isObj(c.starterCode) && Object.values(c.starterCode).some(v => text(v))) return true;
    if (Array.isArray(c.publicTests) && c.publicTests.length) return true;
  }
  if (Array.isArray(answer.hiddenTests) && answer.hiddenTests.length) return true;
  if (isObj(answer.referenceSolutions) && Object.values(answer.referenceSolutions).some(v => text(v))) return true;
  if (Array.isArray(answer.correctOptionIds) && answer.correctOptionIds.length) return true;
  if (isObj(answer.correctColumnByRow) && Object.keys(answer.correctColumnByRow).length) return true;
  if (isObj(answer.correctCategoryByItem) && Object.keys(answer.correctCategoryByItem).length) return true;
  if (text(answer.text)) return true;
  if (Array.isArray(answer.values) && answer.values.some(v => text(v))) return true;
  if (answer.mode === "range" || (answer.mode === "tolerance" && (Number(answer.expected) !== 0 || Number(answer.tolerance) !== 0))) return true;
  if (text(answer.unit)) return true;
  return false;
}
