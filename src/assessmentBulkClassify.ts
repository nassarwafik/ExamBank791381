// Phase 13C-B — BULK PEDAGOGICAL CLASSIFICATION (pure). Operates on the EXISTING selection's examQuestionIds over the
// sections of the exam the owner passes (the `prev` of ONE onChange updater), so a stale id is simply absent and a deleted
// question can never be resurrected. Every field distinguishes keep / set / clear; list fields add / remove / replace /
// clear. Untouched fields are preserved. A change that alters nothing returns the SAME sections reference (no history
// entry, not dirty). Bank provenance, answers, images and every non-meta field are never touched.
import type { BuilderQuestion, BuilderSection } from "./examTypes";
import type { AssessmentMeta } from "./assessmentTypes";

export type FieldOp<T> = { op: "keep" } | { op: "set"; value: T } | { op: "clear" };
export type ListOp = { op: "keep" } | { op: "add"; ids: string[] } | { op: "remove"; ids: string[] } | { op: "replace"; ids: string[] } | { op: "clear" };
export type BulkClassification = {
  primaryTopicId?: FieldOp<string>;
  difficulty?: FieldOp<number>;
  cognitiveLevel?: FieldOp<string>;
  objectiveIds?: ListOp;
  secondaryTopicIds?: ListOp;
  capabilities?: ListOp;
};

/** Drops empty / invalid fields; `undefined` when nothing remains (an empty meta is never stored as `{}`). */
export function normalizeAssessmentMeta(meta: AssessmentMeta | undefined | null): AssessmentMeta | undefined {
  if (!meta) return undefined;
  const out: AssessmentMeta = {};
  if (meta.primaryTopicId) out.primaryTopicId = meta.primaryTopicId;
  if (meta.secondaryTopicIds && meta.secondaryTopicIds.length) out.secondaryTopicIds = meta.secondaryTopicIds;
  if (meta.objectiveIds && meta.objectiveIds.length) out.objectiveIds = meta.objectiveIds;
  if (typeof meta.difficulty === "number" && Number.isFinite(meta.difficulty)) out.difficulty = meta.difficulty;
  if (meta.cognitiveLevel) out.cognitiveLevel = meta.cognitiveLevel;
  if (meta.capabilities && meta.capabilities.length) out.capabilities = meta.capabilities;
  return Object.keys(out).length ? out : undefined;
}
const isKeep = (op: FieldOp<unknown> | ListOp | undefined) => !op || op.op === "keep";
export function isBulkClassificationNoop(change: BulkClassification): boolean {
  return isKeep(change.primaryTopicId) && isKeep(change.difficulty) && isKeep(change.cognitiveLevel) && isKeep(change.objectiveIds) && isKeep(change.secondaryTopicIds) && isKeep(change.capabilities);
}
function applyField<T>(current: T | undefined, op: FieldOp<T> | undefined): T | undefined {
  if (!op || op.op === "keep") return current;
  return op.op === "set" ? op.value : undefined;
}
function applyList(current: string[] | undefined, op: ListOp | undefined): string[] | undefined {
  if (!op || op.op === "keep") return current;
  const cur = current ?? [];
  switch (op.op) {
    case "add": { const out = [...cur]; for (const id of op.ids) if (!out.includes(id)) out.push(id); return out; }
    case "remove": { const drop = new Set(op.ids); return cur.filter(id => !drop.has(id)); }
    case "replace": return [...new Set(op.ids)];
    case "clear": return undefined;
  }
}
const sameList = (a?: string[], b?: string[]) => (a?.length ?? 0) === (b?.length ?? 0) && (a ?? []).every((v, i) => v === (b ?? [])[i]);
function metaEqual(a: AssessmentMeta | undefined, b: AssessmentMeta | undefined): boolean {
  if (!a && !b) return true; if (!a || !b) return false;
  return a.primaryTopicId === b.primaryTopicId && a.difficulty === b.difficulty && a.cognitiveLevel === b.cognitiveLevel
    && sameList(a.objectiveIds, b.objectiveIds) && sameList(a.secondaryTopicIds, b.secondaryTopicIds) && sameList(a.capabilities, b.capabilities);
}
export function applyBulkClassification(sections: BuilderSection[], ids: Iterable<string>, change: BulkClassification): BuilderSection[] {
  if (isBulkClassificationNoop(change)) return sections;
  const idSet = new Set(ids);
  if (!idSet.size) return sections;
  let changed = false;
  const out = sections.map(s => {
    let sectionChanged = false;
    const questions = (s.questions || []).map((q: BuilderQuestion) => {
      if (!idSet.has(q.examQuestionId)) return q;
      const cur = normalizeAssessmentMeta(q.assessmentMeta);
      const next = normalizeAssessmentMeta({
        primaryTopicId: applyField(cur?.primaryTopicId, change.primaryTopicId),
        difficulty: applyField(cur?.difficulty, change.difficulty),
        cognitiveLevel: applyField(cur?.cognitiveLevel, change.cognitiveLevel),
        objectiveIds: applyList(cur?.objectiveIds, change.objectiveIds),
        secondaryTopicIds: applyList(cur?.secondaryTopicIds, change.secondaryTopicIds),
        capabilities: applyList(cur?.capabilities, change.capabilities)
      });
      if (metaEqual(cur, next)) return q;
      sectionChanged = true;
      const copy: BuilderQuestion = { ...q };
      if (next) copy.assessmentMeta = next; else delete copy.assessmentMeta;
      return copy;
    });
    if (!sectionChanged) return s;
    changed = true;
    return { ...s, questions };
  });
  return changed ? out : sections;
}
