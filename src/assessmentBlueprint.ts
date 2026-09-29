// Phase 13C-A — the PURE Blueprint engine: validation (academic planning validity — separate from examQuality's
// structural validity), stable-id taxonomy helpers, the legacy-bank metadata bridge, the profile (fact extraction) and
// the projection seam to the legacy generator's ExamPlan. ZERO subject-specific behaviour: every id here is data.
//
// Marks: every figure reuses the builder's authoritative helpers (questionMaxMarks / sectionMaxMarks / computeTotalMarks),
// which mirror api/src/lib/exam-structure.js and the grader — never a third implementation.
import type { StructuredExam, BuilderQuestion, BuilderSection } from "./examTypes";
import { BUILDER_QUESTION_TYPES } from "./examTypes";
import { questionMaxMarks, sectionMaxMarks, computeTotalMarks, countQuestions, genId } from "./examBuilderState";
import {
  ASSESSMENT_BLUEPRINT_SCHEMA_VERSION, BLUEPRINT_DIMENSIONS, BLUEPRINT_METRICS, BLUEPRINT_UNITS, DEFAULT_COGNITIVE_LEVELS, DEFAULT_DIFFICULTY_SCALE,
  type AssessmentBlueprintV1, type AssessmentMeta, type BlueprintConstraint, type BlueprintIdentity, type BlueprintObjective, type BlueprintTopic,
  type CognitiveLevelDef, type DifficultyScale
} from "./assessmentTypes";

// ── construction ─────────────────────────────────────────────────────────────────────────────────────────────────
/** A new blueprint has NO subject (the teacher names it) — nothing is ever inferred from the repository's origin. */
/** Context-aware validation against the REAL exam: section constraints must reference existing (stable) section ids. */
export function validateBlueprintForExam(bp: unknown, exam: Pick<StructuredExam, "sections">): BlueprintIssue[] {
  return validateBlueprint(bp, { sectionIds: (exam.sections || []).map(s => s.id) });
}
export function emptyBlueprint(): AssessmentBlueprintV1 {
  return { schemaVersion: ASSESSMENT_BLUEPRINT_SCHEMA_VERSION, subject: { id: "", label: "" }, topics: [], objectives: [], constraints: [] };
}
export const newTopicId = () => genId("t");
export const newObjectiveId = () => genId("o");
export const newConstraintId = () => genId("c");

export function blueprintCognitiveLevels(bp: AssessmentBlueprintV1 | undefined): readonly CognitiveLevelDef[] {
  return bp?.cognitiveLevels && bp.cognitiveLevels.length ? bp.cognitiveLevels : DEFAULT_COGNITIVE_LEVELS;
}
export function blueprintDifficultyScale(bp: AssessmentBlueprintV1 | undefined): DifficultyScale {
  return bp?.difficultyScale ?? DEFAULT_DIFFICULTY_SCALE;
}
export function difficultyValues(bp: AssessmentBlueprintV1 | undefined): number[] {
  const s = blueprintDifficultyScale(bp);
  const out: number[] = [];
  if (Number.isInteger(s.min) && Number.isInteger(s.max) && s.min <= s.max && s.max - s.min < 50) for (let v = s.min; v <= s.max; v++) out.push(v);
  return out;
}

// ── validation (structured issues; never repairs) ─────────────────────────────────────────────────────────────────
export type BlueprintIssueCode =
  | "UNSUPPORTED_SCHEMA_VERSION" | "MISSING_SUBJECT_ID" | "MISSING_SUBJECT_LABEL" | "INVALID_IDENTITY" | "MISSING_CONTEXT_ID" | "MISSING_CONTEXT_LABEL"
  | "INVALID_TOPICS" | "INVALID_TOPIC_ID" | "DUPLICATE_TOPIC_ID" | "MISSING_TOPIC_LABEL" | "BROKEN_PARENT_REF" | "TOPIC_CYCLE"
  | "INVALID_OBJECTIVES" | "INVALID_OBJECTIVE_ID" | "DUPLICATE_OBJECTIVE_ID" | "MISSING_OBJECTIVE_LABEL" | "BROKEN_OBJECTIVE_TOPIC_REF"
  | "INVALID_TARGET" | "INVALID_DIFFICULTY_SCALE" | "INVALID_COGNITIVE_LEVELS"
  | "INVALID_CONSTRAINTS" | "INVALID_CONSTRAINT_ID" | "DUPLICATE_CONSTRAINT_ID" | "INVALID_DIMENSION" | "INVALID_METRIC" | "INVALID_UNIT"
  | "MISSING_REF" | "BROKEN_TOPIC_REF" | "BROKEN_OBJECTIVE_REF" | "INVALID_DIFFICULTY" | "BROKEN_COGNITIVE_REF" | "INVALID_QUESTION_TYPE" | "BROKEN_SECTION_REF"
  | "INVALID_LIMIT" | "NEGATIVE_LIMIT" | "PERCENT_OUT_OF_RANGE" | "CONTRADICTORY_LIMITS" | "EMPTY_CONSTRAINT" | "DUPLICATE_EQUIVALENT_CONSTRAINT";
export type BlueprintIssue = { code: BlueprintIssueCode; message: string; path?: string; refId?: string };

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const validId = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.trim() === v;
const validLabel = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const finiteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Optional exam context for validation. The blueprint stays pure: section ids are supplied by the caller (the builder
 *  passes the live exam's sections) so a `section` constraint can be checked against real, stable section ids; without
 *  context (templates, fixtures, question-free planning) section refs are not judged. */
export type BlueprintValidationContext = { sectionIds?: Iterable<string> };
const CONTEXT_LABEL: Record<string, string> = { curriculum: "المنهاج", course: "المقرر", level: "المستوى" };
export function validateBlueprint(input: unknown, context?: BlueprintValidationContext): BlueprintIssue[] {
  const issues: BlueprintIssue[] = [];
  const sectionIds = context?.sectionIds ? new Set(context.sectionIds) : undefined;
  const add = (code: BlueprintIssueCode, message: string, path?: string, refId?: string) => issues.push({ code, message, path, refId });
  if (!isPlainObject(input) || input.schemaVersion !== ASSESSMENT_BLUEPRINT_SCHEMA_VERSION) {
    add("UNSUPPORTED_SCHEMA_VERSION", "إصدار مخطط غير مدعوم.", "schemaVersion");
    return issues;
  }
  const bp = input as unknown as AssessmentBlueprintV1;

  const identity = (v: unknown, path: string, required: boolean) => {
    if (v === undefined) { if (required) { add("MISSING_SUBJECT_ID", "معرّف المادة مطلوب.", path + ".id"); add("MISSING_SUBJECT_LABEL", "اسم المادة مطلوب.", path + ".label"); } return; }
    if (!isPlainObject(v)) { add("INVALID_IDENTITY", "هوية غير صالحة.", path); return; }
    if (required) {
      if (!validId(v.id)) add("MISSING_SUBJECT_ID", "معرّف المادة مطلوب.", path + ".id");
      if (!validLabel(v.label)) add("MISSING_SUBJECT_LABEL", "اسم المادة مطلوب.", path + ".label");
    } else {
      // Review Fix 1 / R1: an OPTIONAL context identity, once present, is a COMPLETE identity — the stable id carries the
      // identity, the label is display text. A labelled identity with an empty id is an issue, never valid data.
      if (!validId(v.id)) add("MISSING_CONTEXT_ID", "معرّف " + CONTEXT_LABEL[path] + " مطلوب — الهوية هي المعرّف الثابت لا الاسم.", path + ".id");
      if (!validLabel(v.label)) add("MISSING_CONTEXT_LABEL", "اسم " + CONTEXT_LABEL[path] + " مطلوب.", path + ".label");
    }
  };
  identity(bp.subject, "subject", true);
  identity(bp.curriculum, "curriculum", false); identity(bp.course, "course", false); identity(bp.level, "level", false);

  // topics
  const topicIds = new Set<string>();
  const parentOf = new Map<string, string | undefined>();
  if (!Array.isArray(bp.topics)) add("INVALID_TOPICS", "قائمة المواضيع غير صالحة.", "topics");
  else bp.topics.forEach((t, i) => {
    const path = "topics[" + i + "]";
    if (!isPlainObject(t) || !validId(t.id)) { add("INVALID_TOPIC_ID", "معرّف موضوع غير صالح.", path); return; }
    if (topicIds.has(t.id)) add("DUPLICATE_TOPIC_ID", "معرّف الموضوع مكرر: " + t.id, path, t.id);
    topicIds.add(t.id);
    if (!validLabel(t.label)) add("MISSING_TOPIC_LABEL", "اسم الموضوع مطلوب.", path + ".label", t.id);
    if (t.parentId !== undefined && typeof t.parentId !== "string") add("BROKEN_PARENT_REF", "مرجع الموضوع الأب غير صالح.", path + ".parentId", t.id);
    parentOf.set(t.id, typeof t.parentId === "string" ? t.parentId : undefined);
  });
  for (const [id, parent] of parentOf) {
    if (parent === undefined) continue;
    if (!topicIds.has(parent)) { add("BROKEN_PARENT_REF", "الموضوع الأب غير موجود: " + parent, "topics", id); continue; }
    // walk up; a return to `id` (or self-parent) is a cycle
    let cur: string | undefined = parent; let steps = 0;
    while (cur !== undefined && steps++ <= parentOf.size) { if (cur === id) { add("TOPIC_CYCLE", "حلقة في تسلسل المواضيع عند: " + id, "topics", id); break; } cur = parentOf.get(cur); }
  }

  // objectives
  const objectiveIds = new Set<string>();
  if (!Array.isArray(bp.objectives)) add("INVALID_OBJECTIVES", "قائمة الأهداف غير صالحة.", "objectives");
  else bp.objectives.forEach((o, i) => {
    const path = "objectives[" + i + "]";
    if (!isPlainObject(o) || !validId(o.id)) { add("INVALID_OBJECTIVE_ID", "معرّف هدف غير صالح.", path); return; }
    if (objectiveIds.has(o.id)) add("DUPLICATE_OBJECTIVE_ID", "معرّف الهدف مكرر: " + o.id, path, o.id);
    objectiveIds.add(o.id);
    if (!validLabel(o.label)) add("MISSING_OBJECTIVE_LABEL", "نص الهدف مطلوب.", path + ".label", o.id);
    if (o.topicId !== undefined && (typeof o.topicId !== "string" || !topicIds.has(o.topicId))) add("BROKEN_OBJECTIVE_TOPIC_REF", "موضوع الهدف غير موجود.", path + ".topicId", o.id);
  });

  // targets / scale / vocabulary
  if (bp.targets !== undefined) {
    if (!isPlainObject(bp.targets)) add("INVALID_TARGET", "الأهداف الإجمالية غير صالحة.", "targets");
    else for (const k of ["totalQuestions", "totalMarks"] as const) { const v = bp.targets[k]; if (v !== undefined && (!finiteNum(v) || v < 0)) add("INVALID_TARGET", "قيمة إجمالية غير صالحة: " + k, "targets." + k); }
  }
  if (bp.difficultyScale !== undefined && (!isPlainObject(bp.difficultyScale) || !Number.isInteger(bp.difficultyScale.min) || !Number.isInteger(bp.difficultyScale.max) || bp.difficultyScale.min >= bp.difficultyScale.max)) add("INVALID_DIFFICULTY_SCALE", "سلّم الصعوبة غير صالح.", "difficultyScale");
  const levels = new Set<string>();
  if (bp.cognitiveLevels !== undefined) {
    if (!Array.isArray(bp.cognitiveLevels) || !bp.cognitiveLevels.length) add("INVALID_COGNITIVE_LEVELS", "قائمة المستويات المعرفية غير صالحة.", "cognitiveLevels");
    else bp.cognitiveLevels.forEach(l => { if (!isPlainObject(l) || !validId(l.id) || !validLabel(l.label) || levels.has(l.id)) add("INVALID_COGNITIVE_LEVELS", "مستوى معرفي غير صالح أو مكرر.", "cognitiveLevels"); else levels.add(l.id); });
  }
  const vocabulary = levels.size ? levels : new Set(DEFAULT_COGNITIVE_LEVELS.map(l => l.id));
  const scaleValues = new Set(difficultyValues(issues.some(i => i.code === "INVALID_DIFFICULTY_SCALE") ? undefined : bp));

  // constraints
  const constraintIds = new Set<string>(); const equivalence = new Set<string>();
  if (!Array.isArray(bp.constraints)) add("INVALID_CONSTRAINTS", "قائمة القيود غير صالحة.", "constraints");
  else bp.constraints.forEach((c, i) => {
    const path = "constraints[" + i + "]";
    if (!isPlainObject(c)) { add("INVALID_CONSTRAINT_ID", "قيد غير صالح.", path); return; }
    if (!validId(c.id)) add("INVALID_CONSTRAINT_ID", "معرّف القيد غير صالح.", path + ".id");
    else { if (constraintIds.has(c.id)) add("DUPLICATE_CONSTRAINT_ID", "معرّف القيد مكرر: " + c.id, path, c.id); constraintIds.add(c.id); }
    const refId = validId(c.id) ? c.id : undefined;
    if (!(BLUEPRINT_DIMENSIONS as readonly string[]).includes(c.dimension as string)) add("INVALID_DIMENSION", "بُعد القيد غير معروف.", path + ".dimension", refId);
    if (!(BLUEPRINT_METRICS as readonly string[]).includes(c.metric as string)) add("INVALID_METRIC", "مقياس القيد غير معروف.", path + ".metric", refId);
    if (!(BLUEPRINT_UNITS as readonly string[]).includes(c.unit as string)) add("INVALID_UNIT", "وحدة القيد غير معروفة.", path + ".unit", refId);
    const ref = typeof c.ref === "string" ? c.ref : "";
    if (!ref.trim()) add("MISSING_REF", "مرجع القيد مطلوب.", path + ".ref", refId);
    else switch (c.dimension) {
      case "topic": if (!topicIds.has(ref)) add("BROKEN_TOPIC_REF", "القيد يشير إلى موضوع غير موجود: " + ref, path + ".ref", refId); break;
      case "objective": if (!objectiveIds.has(ref)) add("BROKEN_OBJECTIVE_REF", "القيد يشير إلى هدف غير موجود: " + ref, path + ".ref", refId); break;
      case "difficulty": if (!/^-?\d+$/.test(ref) || !scaleValues.has(Number(ref))) add("INVALID_DIFFICULTY", "قيمة صعوبة خارج السلّم: " + ref, path + ".ref", refId); break;
      case "cognitiveLevel": if (!vocabulary.has(ref)) add("BROKEN_COGNITIVE_REF", "مستوى معرفي غير معرّف: " + ref, path + ".ref", refId); break;
      case "questionType": if (!(BUILDER_QUESTION_TYPES as readonly string[]).includes(ref)) add("INVALID_QUESTION_TYPE", "نوع سؤال غير معروف: " + ref, path + ".ref", refId); break;
      case "section": if (sectionIds && !sectionIds.has(ref)) add("BROKEN_SECTION_REF", "القيد يشير إلى قسم غير موجود في الامتحان: " + ref, path + ".ref", refId); break;   // Review Fix 1 / R4
      default: break;                                                        // capability: any non-empty stable id
    }
    const limits: Array<[string, unknown]> = [["min", c.min], ["target", c.target], ["max", c.max], ["tolerance", c.tolerance]];
    for (const [k, v] of limits) {
      if (v === undefined) continue;
      if (!finiteNum(v)) add("INVALID_LIMIT", "قيمة غير صالحة: " + k, path + "." + k, refId);
      else if (v < 0) add("NEGATIVE_LIMIT", "قيمة سالبة غير مسموحة: " + k, path + "." + k, refId);
      else if (c.unit === "percent" && k !== "tolerance" && v > 100) add("PERCENT_OUT_OF_RANGE", "النسبة يجب أن تكون بين 0 و100.", path + "." + k, refId);
    }
    if (c.min === undefined && c.target === undefined && c.max === undefined) add("EMPTY_CONSTRAINT", "القيد لا يحدد أي حدّ أو هدف.", path, refId);
    const mn = finiteNum(c.min) ? c.min : undefined, tg = finiteNum(c.target) ? c.target : undefined, mx = finiteNum(c.max) ? c.max : undefined;
    if ((mn !== undefined && tg !== undefined && mn > tg) || (tg !== undefined && mx !== undefined && tg > mx) || (mn !== undefined && mx !== undefined && mn > mx)) add("CONTRADICTORY_LIMITS", "الحدود متناقضة (الأدنى > الهدف أو الهدف > الأقصى).", path, refId);
    const eq = [c.dimension, ref, c.metric, c.unit].join("\u0000");
    if (equivalence.has(eq)) add("DUPLICATE_EQUIVALENT_CONSTRAINT", "قيد مكافئ مكرر على نفس البُعد والمرجع.", path, refId); else equivalence.add(eq);
  });
  return issues;
}

// ── taxonomy helpers (pure, id-based) ────────────────────────────────────────────────────────────────────────────
export type OrderedTopic = BlueprintTopic & { depth: number };
/** Depth-first order: roots in array/`order` order, then children. Broken parents render as roots; cycles are appended. */
export function orderedTopics(bp: AssessmentBlueprintV1 | undefined): OrderedTopic[] {
  const topics = bp?.topics ?? [];
  const ids = new Set(topics.map(t => t.id));
  const byParent = new Map<string | undefined, BlueprintTopic[]>();
  for (const t of topics) { const p = t.parentId && ids.has(t.parentId) && t.parentId !== t.id ? t.parentId : undefined; const arr = byParent.get(p) || []; arr.push(t); byParent.set(p, arr); }
  const sortGroup = (arr: BlueprintTopic[]) => arr.slice().sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
  const out: OrderedTopic[] = []; const seen = new Set<string>();
  const walk = (parent: string | undefined, depth: number) => { for (const t of sortGroup(byParent.get(parent) || [])) { if (seen.has(t.id)) continue; seen.add(t.id); out.push({ ...t, depth }); walk(t.id, depth + 1); } };
  walk(undefined, 0);
  for (const t of topics) if (!seen.has(t.id)) { seen.add(t.id); out.push({ ...t, depth: 0 }); }
  return out;
}
export function topicDepth(bp: AssessmentBlueprintV1, id: string): number { return orderedTopics(bp).find(t => t.id === id)?.depth ?? 0; }
export function addTopic(bp: AssessmentBlueprintV1, topic: BlueprintTopic): AssessmentBlueprintV1 { return { ...bp, topics: [...bp.topics, topic] }; }
export function updateTopic(bp: AssessmentBlueprintV1, id: string, patch: Partial<Omit<BlueprintTopic, "id">>): AssessmentBlueprintV1 {
  return { ...bp, topics: bp.topics.map(t => (t.id === id ? { ...t, ...patch } : t)) };
}
export function renameTopic(bp: AssessmentBlueprintV1, id: string, label: string): AssessmentBlueprintV1 { return updateTopic(bp, id, { label }); }
export function setTopicParent(bp: AssessmentBlueprintV1, id: string, parentId: string | undefined): AssessmentBlueprintV1 {
  return { ...bp, topics: bp.topics.map(t => { if (t.id !== id) return t; const next = { ...t }; if (parentId) next.parentId = parentId; else delete next.parentId; return next; }) };
}
/** Removes the topic ONLY; children / objectives / constraints that referenced it become validation issues (never silently repaired). */
export function removeTopic(bp: AssessmentBlueprintV1, id: string): AssessmentBlueprintV1 { return { ...bp, topics: bp.topics.filter(t => t.id !== id) }; }
export function addObjective(bp: AssessmentBlueprintV1, objective: BlueprintObjective): AssessmentBlueprintV1 { return { ...bp, objectives: [...bp.objectives, objective] }; }
export function updateObjective(bp: AssessmentBlueprintV1, id: string, patch: Partial<Omit<BlueprintObjective, "id">>): AssessmentBlueprintV1 {
  return { ...bp, objectives: bp.objectives.map(o => { if (o.id !== id) return o; const next = { ...o, ...patch }; if (next.topicId === undefined || next.topicId === "") delete next.topicId; return next; }) };
}
export function removeObjective(bp: AssessmentBlueprintV1, id: string): AssessmentBlueprintV1 { return { ...bp, objectives: bp.objectives.filter(o => o.id !== id) }; }
export function upsertConstraint(bp: AssessmentBlueprintV1, constraint: BlueprintConstraint): AssessmentBlueprintV1 {
  const exists = bp.constraints.some(c => c.id === constraint.id);
  return { ...bp, constraints: exists ? bp.constraints.map(c => (c.id === constraint.id ? constraint : c)) : [...bp.constraints, constraint] };
}
export function updateConstraint(bp: AssessmentBlueprintV1, id: string, patch: Partial<Omit<BlueprintConstraint, "id">>): AssessmentBlueprintV1 {
  return { ...bp, constraints: bp.constraints.map(c => { if (c.id !== id) return c; const next = { ...c, ...patch } as BlueprintConstraint & Record<string, unknown>; for (const k of ["min", "target", "max", "tolerance"]) if (next[k] === undefined) delete next[k]; return next as BlueprintConstraint; }) };
}
export function removeConstraint(bp: AssessmentBlueprintV1, id: string): AssessmentBlueprintV1 { return { ...bp, constraints: bp.constraints.filter(c => c.id !== id) }; }
export function setSubject(bp: AssessmentBlueprintV1, subject: BlueprintIdentity): AssessmentBlueprintV1 { return { ...bp, subject }; }
export function setContextIdentity(bp: AssessmentBlueprintV1, field: "curriculum" | "course" | "level", identity: BlueprintIdentity | undefined): AssessmentBlueprintV1 {
  const next = { ...bp }; if (identity && (identity.id || identity.label)) next[field] = identity; else delete next[field]; return next;
}
export function setTargets(bp: AssessmentBlueprintV1, targets: { totalQuestions?: number; totalMarks?: number }): AssessmentBlueprintV1 {
  const merged: { totalQuestions?: number; totalMarks?: number } = { ...(bp.targets || {}), ...targets };
  if (merged.totalQuestions === undefined) delete merged.totalQuestions; if (merged.totalMarks === undefined) delete merged.totalMarks;
  const next = { ...bp }; if (Object.keys(merged).length) next.targets = merged; else delete next.targets; return next;
}
/** The ONE exam-updater shape the builder dispatches through onChange(updater): edits the blueprint immutably. */
export function withBlueprint(exam: StructuredExam, fn: (bp: AssessmentBlueprintV1) => AssessmentBlueprintV1): StructuredExam {
  return { ...exam, blueprint: fn(exam.blueprint ?? emptyBlueprint()) };
}

// ── legacy bank bridge: explicit assessmentMeta is authoritative; bank fields are EVIDENCE with an exact mapping only ──
type BankEvidenceQuestion = { topic?: unknown; secondaryTopics?: unknown; difficulty?: unknown; hasCLI?: unknown; requiresCalculation?: unknown; assessmentMeta?: AssessmentMeta };
export type EffectiveAssessmentMeta = {
  primaryTopicId?: string;
  secondaryTopicIds: string[];
  objectiveIds: string[];
  difficulty?: number;
  cognitiveLevel?: string;
  capabilities: string[];
  source: { primaryTopic: "explicit" | "bank" | "none"; difficulty: "explicit" | "bank" | "none" };
  /** Bank topic codes that have NO exact blueprint topic id — exposed as evidence, never mapped by similarity. */
  unmappedBankTopics: string[];
  bankEvidence: { topic?: string; secondaryTopics: string[]; difficulty?: number; hasCLI: boolean; requiresCalculation: boolean };
};
/** Prepared taxonomy lookup for effectiveAssessmentMeta. Prepare ONCE per evaluation and reuse across every question
 *  (13C-B Review Fix 1 / R3-C): the semantics are identical to the two-argument call, only the Set is not rebuilt. */
export type AssessmentMetaContext = { topicIds: ReadonlySet<string> };
/** Pure diagnostics seam (tests): how many contexts were prepared. Never read by production code. */
export const assessmentMetaDiagnostics = { contextsPrepared: 0 };
export function prepareAssessmentMetaContext(blueprint?: AssessmentBlueprintV1 | null): AssessmentMetaContext {
  assessmentMetaDiagnostics.contextsPrepared += 1;
  return { topicIds: new Set((blueprint?.topics ?? []).map(t => t.id)) };
}
export function effectiveAssessmentMeta(question: BuilderQuestion | BankEvidenceQuestion, blueprint?: AssessmentBlueprintV1 | null, context?: AssessmentMetaContext): EffectiveAssessmentMeta {
  const q = question as BankEvidenceQuestion;
  const meta: AssessmentMeta = q.assessmentMeta && typeof q.assessmentMeta === "object" ? q.assessmentMeta : {};
  const topicIds = (context ?? prepareAssessmentMetaContext(blueprint)).topicIds;
  const bankTopic = typeof q.topic === "string" && q.topic.trim() ? q.topic : undefined;
  const bankSecondary = Array.isArray(q.secondaryTopics) ? q.secondaryTopics.filter((t): t is string => typeof t === "string" && !!t.trim()) : [];
  const bankDifficulty = typeof q.difficulty === "number" && Number.isInteger(q.difficulty) ? q.difficulty : (typeof q.difficulty === "string" && /^\d+$/.test(q.difficulty) ? Number(q.difficulty) : undefined);
  const hasCLI = q.hasCLI === true, requiresCalculation = q.requiresCalculation === true;
  const unmapped: string[] = [];
  let primaryTopicId: string | undefined, primarySource: EffectiveAssessmentMeta["source"]["primaryTopic"] = "none";
  if (typeof meta.primaryTopicId === "string" && meta.primaryTopicId) { primaryTopicId = meta.primaryTopicId; primarySource = "explicit"; }
  else if (bankTopic && topicIds.has(bankTopic)) { primaryTopicId = bankTopic; primarySource = "bank"; }
  else if (bankTopic) unmapped.push(bankTopic);
  let secondaryTopicIds: string[];
  if (Array.isArray(meta.secondaryTopicIds)) secondaryTopicIds = meta.secondaryTopicIds.filter(t => typeof t === "string");
  else { secondaryTopicIds = []; for (const t of bankSecondary) { if (topicIds.has(t)) secondaryTopicIds.push(t); else unmapped.push(t); } }
  let difficulty: number | undefined, difficultySource: EffectiveAssessmentMeta["source"]["difficulty"] = "none";
  if (typeof meta.difficulty === "number" && Number.isFinite(meta.difficulty)) { difficulty = meta.difficulty; difficultySource = "explicit"; }
  else if (bankDifficulty !== undefined) { difficulty = bankDifficulty; difficultySource = "bank"; }
  const capabilities = Array.isArray(meta.capabilities) ? meta.capabilities.filter(c => typeof c === "string") : [...(hasCLI ? ["cli"] : []), ...(requiresCalculation ? ["calculation"] : [])];
  return {
    primaryTopicId, secondaryTopicIds, objectiveIds: Array.isArray(meta.objectiveIds) ? meta.objectiveIds.filter(o => typeof o === "string") : [],
    difficulty, cognitiveLevel: typeof meta.cognitiveLevel === "string" && meta.cognitiveLevel ? meta.cognitiveLevel : undefined, capabilities,
    source: { primaryTopic: primarySource, difficulty: difficultySource }, unmappedBankTopics: unmapped,
    bankEvidence: { topic: bankTopic, secondaryTopics: bankSecondary, difficulty: bankDifficulty, hasCLI, requiresCalculation }
  };
}

// ── profile: single-pass FACT extraction (no targets vs actual, no score, no ranking) ──────────────────────────────
/**
 * Review Fix 1 / R2 — MARK SEMANTICS (the contract 13C-B constraints consume; see docs/enterprise-builder-13c-a.md §11).
 *  • weightMarks   = authored question weight = questionMaxMarks(q) (compound: the grader's part-mark distribution, never
 *                    q.marks). Sums to totalWeightMarks. Denominator for "share of authored weight".
 *  • officialMarks = cap-aware ATTRIBUTABLE official marks. Each question receives its section's official max
 *                    (sectionMaxMarks — the grader's rule: `all` never capped, capScore / firstNAnswered use section.maxMarks
 *                    when present) in proportion to its weight: weight × sectionOfficial / sectionWeightSum. For `all`
 *                    sections this equals weightMarks exactly. Sums to totalOfficialMarks (= computeTotalMarks =
 *                    examOfficialStats.totalMarks) minus unattributedOfficialMarks (official marks of capped sections whose
 *                    questions carry zero weight — nothing to attach them to). Denominator for "share of the official total".
 *  Structural / planning only: no student answers are involved (firstNAnswered's answer-dependent counting is deliberately
 *  NOT modelled; the proportional rule is the unique deterministic, answer-independent attribution that sums to the section's
 *  official max). Grading behaviour is untouched.
 */
export type Tally = { count: number; weightMarks: number; officialMarks: number };
export type SectionTally = Tally & { /** sectionOfficial / sectionWeightSum (1 for `all`; 0 when the section has no weight). */ officialFactor: number };
export type AssessmentProfile = {
  totalQuestions: number;
  /** Σ questionMaxMarks over every question (authored weight). */
  totalWeightMarks: number;
  /** Official total (section caps applied) — equals computeTotalMarks / examOfficialStats.totalMarks. */
  totalOfficialMarks: number;
  /** Official marks of capped sections with zero question weight: counted in totalOfficialMarks, attributable to nothing. */
  unattributedOfficialMarks: number;
  /** Per-question marks attributed to the PRIMARY topic only (exclusive attribution; no double counting). */
  byTopic: Record<string, Tally>;
  /** Objectives may overlap: a question counts once for each objective it measures. */
  byObjective: Record<string, Tally>;
  byDifficulty: Record<string, Tally>;
  byType: Record<string, Tally>;
  byCognitiveLevel: Record<string, Tally>;
  /** Capabilities may overlap (a question may need several skills). */
  byCapability: Record<string, Tally>;
  /** weightMarks = Σ question weights; officialMarks = the section's OFFICIAL max (cap applied) — Σ equals totalOfficialMarks. */
  bySection: Record<string, SectionTally>;
  /** Questions without a primary topic (their marks are NOT in byTopic). */
  unclassified: Tally;
  unmappedQuestions: { examQuestionId: string; bankTopics: string[] }[];
  unclassifiedQuestions: string[];
};
const sectionWeightSum = (s: BuilderSection): number => (s.questions || []).reduce((a, q) => a + questionMaxMarks(q), 0);
/** sectionOfficial / sectionWeightSum — 1 for `all` sections, section.maxMarks / Σweights for capped ones, 0 without weight. */
export function sectionOfficialFactor(s: BuilderSection): number {
  const w = sectionWeightSum(s);
  return w > 0 ? sectionMaxMarks(s) / w : 0;
}
/** Cap-aware attributable official marks of ONE question inside its section (weight × official / Σweights; 0 without weight). */
export function officialQuestionMarks(q: BuilderQuestion, s: BuilderSection): number {
  const w = sectionWeightSum(s);
  return w > 0 ? (questionMaxMarks(q) * sectionMaxMarks(s)) / w : 0;
}
const bump = (rec: Record<string, Tally>, key: string, weight: number, official: number) => { const t = rec[key] || (rec[key] = { count: 0, weightMarks: 0, officialMarks: 0 }); t.count += 1; t.weightMarks += weight; t.officialMarks += official; };
export function buildAssessmentProfile(exam: StructuredExam, blueprint?: AssessmentBlueprintV1 | null, context?: AssessmentMetaContext): AssessmentProfile {
  const bp = blueprint === undefined ? exam.blueprint : blueprint;
  const ctx = context ?? prepareAssessmentMetaContext(bp);
  const p: AssessmentProfile = {
    totalQuestions: countQuestions(exam), totalWeightMarks: 0, totalOfficialMarks: computeTotalMarks(exam), unattributedOfficialMarks: 0,
    byTopic: {}, byObjective: {}, byDifficulty: {}, byType: {}, byCognitiveLevel: {}, byCapability: {}, bySection: {},
    unclassified: { count: 0, weightMarks: 0, officialMarks: 0 }, unmappedQuestions: [], unclassifiedQuestions: []
  };
  for (const s of exam.sections || []) {
    const qs: BuilderQuestion[] = s.questions || [];
    const weightSum = sectionWeightSum(s as BuilderSection), official = sectionMaxMarks(s as BuilderSection);
    const factor = weightSum > 0 ? official / weightSum : 0;
    p.totalWeightMarks += weightSum;
    if (weightSum <= 0) p.unattributedOfficialMarks += official;
    p.bySection[s.id] = { count: qs.length, weightMarks: weightSum, officialMarks: official, officialFactor: factor };
    for (const q of qs) {
      const weight = questionMaxMarks(q);
      const marks = weightSum > 0 ? (weight * official) / weightSum : 0;
      const eff = effectiveAssessmentMeta(q, bp ?? undefined, ctx);
      if (eff.primaryTopicId) bump(p.byTopic, eff.primaryTopicId, weight, marks);
      else { p.unclassifiedQuestions.push(q.examQuestionId); p.unclassified.count += 1; p.unclassified.weightMarks += weight; p.unclassified.officialMarks += marks; }
      if (eff.unmappedBankTopics.length) p.unmappedQuestions.push({ examQuestionId: q.examQuestionId, bankTopics: eff.unmappedBankTopics });
      for (const o of eff.objectiveIds) bump(p.byObjective, o, weight, marks);
      bump(p.byDifficulty, eff.difficulty === undefined ? "unspecified" : String(eff.difficulty), weight, marks);
      bump(p.byType, String(q.presentationType || "unspecified"), weight, marks);
      bump(p.byCognitiveLevel, eff.cognitiveLevel ?? "unspecified", weight, marks);
      for (const c of eff.capabilities) bump(p.byCapability, c, weight, marks);
    }
  }
  return p;
}

// ── projection seam: legacy generator ExamPlan ⇄ canonical blueprint (the generator itself is untouched) ─────────
type LegacyPlanLike = {
  totalQuestions?: number; totalMarks?: number;
  topicTargets?: Array<{ topic: string; count: number }>;
  difficultyTargets?: Record<string, number>;
  typeTargets?: Record<string, number>;
  sectionTargets?: Record<string, number>;
  excludedTopics?: string[];
};
/** Legacy plan type names → engine question types (the same bridge the bank insertion uses: "open" is `shortAnswer`). */
const LEGACY_TYPE_TO_ENGINE: Record<string, string> = { open: "shortAnswer" };
const ENGINE_TYPE_TO_LEGACY: Record<string, string> = { shortAnswer: "open" };
const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** Project the current generator plan into a canonical blueprint. The subject is supplied by the caller — never defaulted. */
export function legacyPlanToBlueprint(plan: LegacyPlanLike, subject: BlueprintIdentity, options: { topicLabels?: Record<string, string>; sectionLabels?: Record<string, string> } = {}): AssessmentBlueprintV1 {
  const topics: BlueprintTopic[] = []; const constraints: BlueprintConstraint[] = [];
  for (const t of plan.topicTargets || []) {
    if (!t || typeof t.topic !== "string" || !t.topic || !positive(t.count)) continue;
    if (!topics.some(x => x.id === t.topic)) topics.push({ id: t.topic, label: options.topicLabels?.[t.topic] || t.topic });
    constraints.push({ id: "c-topic-" + t.topic, dimension: "topic", ref: t.topic, metric: "count", unit: "absolute", target: t.count });
  }
  for (const [level, count] of Object.entries(plan.difficultyTargets || {})) if (positive(count)) constraints.push({ id: "c-difficulty-" + level, dimension: "difficulty", ref: String(level), metric: "count", unit: "absolute", target: count });
  for (const [type, count] of Object.entries(plan.typeTargets || {})) if (positive(count)) { const engine = LEGACY_TYPE_TO_ENGINE[type] || type; constraints.push({ id: "c-type-" + engine, dimension: "questionType", ref: engine, metric: "count", unit: "absolute", target: count }); }
  for (const [section, count] of Object.entries(plan.sectionTargets || {})) if (positive(count)) constraints.push({ id: "c-section-" + section, dimension: "section", ref: section, metric: "count", unit: "absolute", target: count });
  const targets: { totalQuestions?: number; totalMarks?: number } = {};
  if (positive(plan.totalQuestions)) targets.totalQuestions = plan.totalQuestions;
  if (positive(plan.totalMarks)) targets.totalMarks = plan.totalMarks;
  const bp: AssessmentBlueprintV1 = { ...emptyBlueprint(), subject, topics, objectives: [], constraints };
  if (Object.keys(targets).length) bp.targets = targets;
  return bp;
}
/** Project the blueprint's ABSOLUTE COUNT targets back into the legacy plan vocabulary. Percent / range constraints do not project. */
export function blueprintToLegacyPlanTargets(bp: AssessmentBlueprintV1): { totalQuestions?: number; totalMarks?: number; topicTargets: Array<{ topic: string; count: number }>; difficultyTargets: Record<string, number>; typeTargets: Record<string, number> } {
  const out: ReturnType<typeof blueprintToLegacyPlanTargets> = { topicTargets: [], difficultyTargets: {}, typeTargets: {} };
  if (positive(bp.targets?.totalQuestions)) out.totalQuestions = bp.targets!.totalQuestions;
  if (positive(bp.targets?.totalMarks)) out.totalMarks = bp.targets!.totalMarks;
  for (const c of bp.constraints) {
    if (c.metric !== "count" || c.unit !== "absolute" || !positive(c.target)) continue;
    if (c.dimension === "topic") out.topicTargets.push({ topic: c.ref, count: c.target });
    else if (c.dimension === "difficulty") out.difficultyTargets[c.ref] = c.target;
    else if (c.dimension === "questionType") out.typeTargets[ENGINE_TYPE_TO_LEGACY[c.ref] || c.ref] = c.target;
  }
  return out;
}
