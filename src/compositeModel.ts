// Phase 20D — the LIGHT composite@1 authority (pure, React-free, compiled into the shared server build). It owns the identities, bounds,
// group / mark semantics and first-N selection of the advanced composite family; the heavy strict validation (sources, SmartSim envelopes and
// keys, exact keys of every node) lives in ./compositeQuestion, which re-exports this module. Kept dependency-light on purpose: the student
// initial graph reaches it through examStructure (structural marks), so it imports only the catalog and the answer predicate.
//
// Why a NEW family: legacy `compound` is detected STRUCTURALLY (`question.parts` non-empty) everywhere (grading, marks, units, binding,
// rendering). composite@1 therefore never stores anything under `parts`: its children live under the type-owned root `question.composite`,
// so compound@1 behaviour cannot change. Canonical shape (strict exact keys, validated by ./compositeQuestion):
//   question  = { examQuestionId, presentationType: "composite", questionTypeVersion: 1, text, marks, composite, displayNumber?, assessmentMeta? }
//   composite = { v: 1, contexts: Context[], groups: Group[] }
//   Context   = { id, version: 1, kind: "source", title?, instructions?, sources: SourceStimulusV1[] }
//             | { id, version: 1, kind: "smartSim", title?, instructions?, smartSim: SmartSimEnvelopeV1 }
//   Group     = { id, title?, instructions?, gradingPolicy: "all" | "firstNAnswered", requiredAnswers, maxMarks, parts: Part[] }
//   Part      = { id, label?, type, questionTypeVersion?, text?, marks, contextId?, answer?, image?, images?, assessmentMeta?, <type-owned config> }
//   Answer    = { kind: "composite", parts: { [partId]: Answer }, contexts: { [contextId]: SmartSimAnswer } }
import { effectiveQuestionTypeVersion } from "./questionTypeCatalog";
import { answered, type Answer } from "./answerState";

export const COMPOSITE_TYPE_KEY = "composite";
export const COMPOSITE_SCHEMA_VERSION = 1 as const;
export const COMPOSITE_CONTEXT_VERSION = 1 as const;
/** Conservative v1 bounds (the global bounded-JSON guard of the SmartSim core is 64 keys / depth 8 / 256 KB per answer). */
export const COMPOSITE_LIMITS = Object.freeze({
  groups: 12, parts: 40, contexts: 8, smartSimContexts: 3, sourceContexts: 6, sourcesPerContext: 8, codingChildren: 4,
  titleChars: 200, instructionsChars: 4000, labelChars: 40, questionIdChars: 80,
  /** serialized composite root, image data URLs excluded */ configBytes: 1048576,
  /** serialized composite answer */ answerBytes: 1048576,
  /** Σ actions over every shared SmartSim context of one answer */ contextActions: 3000
});
export const COMPOSITE_GROUP_POLICIES: readonly string[] = Object.freeze(["all", "firstNAnswered"]);
/** Group / part / context ids: ONE namespace per composite; no "." or ":" (keeps <questionId>::part::<partId> unambiguous). */
export const COMPOSITE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const FORBIDDEN_IDS: ReadonlySet<string> = new Set(["constructor", "prototype", "toString", "toLocaleString", "valueOf", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "__proto__", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__"]);
export const isCompositeId = (v: unknown): v is string => typeof v === "string" && COMPOSITE_ID.test(v) && !FORBIDDEN_IDS.has(v);
/** A composite question's own (section-scoped) id: the coding / review / storage-safe charset, bounded, never containing the separator. */
export const COMPOSITE_QUESTION_ID = /^[A-Za-z0-9._:-]{1,80}$/;
export const COMPOSITE_CHILD_SEPARATOR = "::part::";
export const isCompositeQuestionId = (v: unknown): v is string => typeof v === "string" && COMPOSITE_QUESTION_ID.test(v) && !v.includes(COMPOSITE_CHILD_SEPARATOR);
/** THE server-owned child identity: coding target key = per-part review / override key = parametric generation key. */
export const compositeChildKey = (questionId: string, partId: string): string => questionId + COMPOSITE_CHILD_SEPARATOR + partId;
export function parseCompositeChildKey(key: unknown): { questionId: string; partId: string } | null {
  if (typeof key !== "string") return null;
  const i = key.lastIndexOf(COMPOSITE_CHILD_SEPARATOR);
  if (i <= 0) return null;
  const questionId = key.slice(0, i), partId = key.slice(i + COMPOSITE_CHILD_SEPARATOR.length);
  return isCompositeId(partId) && isCompositeQuestionId(questionId) ? { questionId, partId } : null;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const finitePositive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const EPS = 1e-9;
export const isCompositeQuestionNode = (q: unknown): q is Record<string, unknown> => isObj(q) && String(q.presentationType ?? q.type ?? "") === COMPOSITE_TYPE_KEY;
/** The effective QUESTION TYPE version (catalog authority): absent = 1; anything unsupported = undefined (fail closed). */
export const compositeQuestionVersion = (node: unknown): number | undefined => (isObj(node) ? effectiveQuestionTypeVersion(COMPOSITE_TYPE_KEY, node.questionTypeVersion) : undefined);

/** The persisted root (strictly validated by ./compositeQuestion; typed loosely here — the authority is the validator, never the type). */
export type CompositeRootV1 = { v: 1; contexts: Record<string, unknown>[]; groups: Record<string, unknown>[] };
export type CompositeShapePart = { id: string; type: string; marks: number; contextId?: string; groupId: string };
export type CompositeShapeGroup = { id: string; gradingPolicy: "all" | "firstNAnswered"; requiredAnswers: number | null; maxMarks: number | null; officialMax: number; parts: CompositeShapePart[] };
export type CompositeShape = { groups: CompositeShapeGroup[]; contexts: { id: string; kind: string }[]; officialMax: number };
export type CompositeShapeIssue = { code: string; message: string; path?: string };

/**
 * The LIGHT structural shape of a composite (no source / envelope / child-body validation): version, root, ids, bounds, group policies,
 * first-N invariants, mark invariants and context references. Returns the canonical shape or the first-class issues. Every structural
 * consumer (marks, first-N, grading, projection) goes through it — the strict authority in ./compositeQuestion adds the content rules.
 */
export function compositeShape(node: unknown): { ok: true; shape: CompositeShape } | { ok: false; issues: CompositeShapeIssue[] } {
  const issues: CompositeShapeIssue[] = [];
  const add = (code: string, message: string, path?: string) => { issues.push(path === undefined ? { code, message } : { code, message, path }); };
  if (!isCompositeQuestionNode(node)) return { ok: false, issues: [{ code: "COMPOSITE_MISSING", message: "ليس سؤالًا مركّبًا متقدّمًا." }] };
  if (compositeQuestionVersion(node) !== 1) add("UNSUPPORTED_QUESTION_TYPE_VERSION", "إصدار السؤال المركّب المتقدّم غير مدعوم في هذا الإصدار من التطبيق.", "questionTypeVersion");
  const root = node.composite;
  if (!isObj(root)) { add("COMPOSITE_MISSING", "بنية السؤال المركّب المتقدّم مفقودة.", "composite"); return { ok: false, issues }; }
  if (root.v !== COMPOSITE_SCHEMA_VERSION) { add("COMPOSITE_SCHEMA_UNSUPPORTED", "إصدار مخطط السؤال المركّب غير مدعوم (لا يُرقّى تلقائيًا).", "composite.v"); return { ok: false, issues }; }
  const seen = new Set<string>();
  const claim = (id: unknown, path: string): id is string => {
    if (!isCompositeId(id)) { add("COMPOSITE_ID_INVALID", "معرّف غير صالح: " + String(id).slice(0, 60), path); return false; }
    if (seen.has(id)) { add("COMPOSITE_ID_DUPLICATE", "معرّف مكرّر داخل السؤال المركّب: " + id, path); return false; }
    seen.add(id); return true;
  };
  const contexts: { id: string; kind: string }[] = [];
  if (!Array.isArray(root.contexts)) add("COMPOSITE_CONTEXT_INVALID", "قائمة السياقات المشتركة غير صالحة.", "composite.contexts");
  else if (root.contexts.length > COMPOSITE_LIMITS.contexts) add("COMPOSITE_LIMIT", "عدد السياقات المشتركة يتجاوز الحد (" + COMPOSITE_LIMITS.contexts + ").", "composite.contexts");
  else root.contexts.forEach((c, i) => {
    const path = "composite.contexts[" + i + "]";
    if (!isObj(c)) { add("COMPOSITE_CONTEXT_INVALID", "سياق مشترك غير صالح.", path); return; }
    if (c.version !== COMPOSITE_CONTEXT_VERSION || (c.kind !== "source" && c.kind !== "smartSim")) { add("COMPOSITE_CONTEXT_INVALID", "نوع السياق أو إصداره غير مدعوم.", path); return; }
    if (claim(c.id, path + ".id")) contexts.push({ id: c.id, kind: c.kind });
  });
  if (contexts.filter(c => c.kind === "smartSim").length > COMPOSITE_LIMITS.smartSimContexts) add("COMPOSITE_LIMIT", "عدد سياقات المحاكاة المشتركة يتجاوز الحد (" + COMPOSITE_LIMITS.smartSimContexts + ").", "composite.contexts");
  if (contexts.filter(c => c.kind === "source").length > COMPOSITE_LIMITS.sourceContexts) add("COMPOSITE_LIMIT", "عدد مصادر النصوص المشتركة يتجاوز الحد (" + COMPOSITE_LIMITS.sourceContexts + ").", "composite.contexts");
  const contextKind = new Map(contexts.map(c => [c.id, c.kind]));
  const groups: CompositeShapeGroup[] = [];
  let totalParts = 0, coding = 0;
  if (!Array.isArray(root.groups) || root.groups.length === 0) add("COMPOSITE_GROUPS_EMPTY", "أضف مجموعة واحدة على الأقل إلى السؤال المركّب.", "composite.groups");
  else if (root.groups.length > COMPOSITE_LIMITS.groups) add("COMPOSITE_LIMIT", "عدد المجموعات يتجاوز الحد (" + COMPOSITE_LIMITS.groups + ").", "composite.groups");
  else root.groups.forEach((g, gi) => {
    const path = "composite.groups[" + gi + "]";
    if (!isObj(g)) { add("COMPOSITE_GROUP_INVALID", "مجموعة غير صالحة.", path); return; }
    const gid = claim(g.id, path + ".id") ? (g.id as string) : "";
    const policy = g.gradingPolicy === "all" || g.gradingPolicy === "firstNAnswered" ? g.gradingPolicy : undefined;
    if (!policy) add("COMPOSITE_GROUP_POLICY_INVALID", "قاعدة تصحيح المجموعة غير معروفة (جميع البنود أو أول عدد محدد).", path + ".gradingPolicy");
    const parts: CompositeShapePart[] = [];
    if (!Array.isArray(g.parts) || g.parts.length === 0) { add("COMPOSITE_GROUP_EMPTY", "المجموعة «" + String(g.title ?? gid) + "» بلا بنود.", path + ".parts"); }
    else g.parts.forEach((p, pi) => {
      const pp = path + ".parts[" + pi + "]";
      totalParts++;
      if (!isObj(p)) { add("COMPOSITE_PART_INVALID", "بند غير صالح.", pp); return; }
      const pid = claim(p.id, pp + ".id") ? (p.id as string) : "";
      if (!finitePositive(p.marks)) add("COMPOSITE_PART_MARKS_INVALID", "علامة البند يجب أن تكون عددًا موجبًا.", pp + ".marks");
      if (typeof p.type !== "string") add("COMPOSITE_CHILD_TYPE_UNSUPPORTED", "نوع البند مفقود.", pp + ".type");
      if (p.type === "coding") coding++;
      if (p.contextId !== undefined) {
        if (typeof p.contextId !== "string" || !contextKind.has(p.contextId)) add("COMPOSITE_CONTEXT_REF_DANGLING", "البند يشير إلى سياق مشترك غير موجود.", pp + ".contextId");
        else if (p.type === "smartSim" && contextKind.get(p.contextId) !== "smartSim") add("COMPOSITE_CONTEXT_REF_KIND", "بند المحاكاة يرتبط بسياق محاكاة مشترك فقط.", pp + ".contextId");
      }
      if (pid && finitePositive(p.marks) && typeof p.type === "string") parts.push({ id: pid, type: p.type, marks: p.marks, groupId: gid, ...(typeof p.contextId === "string" ? { contextId: p.contextId } : {}) });
    });
    let officialMax = parts.reduce((s, p) => s + p.marks, 0), requiredAnswers: number | null = null, maxMarks: number | null = null;
    if (policy === "all") {
      if ((g.requiredAnswers !== null && g.requiredAnswers !== undefined) || (g.maxMarks !== null && g.maxMarks !== undefined)) add("COMPOSITE_GROUP_POLICY_INVALID", "مجموعة «جميع البنود» لا تحمل عددًا مطلوبًا ولا حدًّا أقصى.", path);
    } else if (policy === "firstNAnswered") {
      const n = g.requiredAnswers, partCount = Array.isArray(g.parts) ? g.parts.length : 0;
      const marks = parts.map(p => p.marks);
      const equal = marks.length > 0 && marks.every(m => Math.abs(m - marks[0]) <= EPS);
      if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > partCount) add("COMPOSITE_FIRSTN_INVALID", "عدد الإجابات المطلوبة في المجموعة يجب أن يكون عددًا صحيحًا بين 1 وعدد البنود.", path + ".requiredAnswers");
      else if (!finitePositive(g.maxMarks)) add("COMPOSITE_FIRSTN_INVALID", "مجموعة «أول عدد محدد» تحتاج علامة قصوى صريحة.", path + ".maxMarks");
      else if (!equal) add("COMPOSITE_FIRSTN_INVALID", "بنود مجموعة «أول عدد محدد» يجب أن تحمل علامات متساوية.", path + ".parts");
      else if (Math.abs(g.maxMarks - n * marks[0]) > EPS) add("COMPOSITE_FIRSTN_INVALID", "العلامة القصوى للمجموعة يجب أن تساوي عدد الإجابات المطلوبة × علامة البند.", path + ".maxMarks");
      else { requiredAnswers = n; maxMarks = g.maxMarks; officialMax = g.maxMarks; }
      // Phase 20D policy A (documented): a SmartSim part scored on a SHARED context has no unambiguous "answered" state of its own.
      if (Array.isArray(g.parts) && g.parts.some(p => isObj(p) && p.type === "smartSim" && p.contextId !== undefined)) add("COMPOSITE_FIRSTN_SHARED_SMARTSIM", "بنود المحاكاة المرتبطة بسياق مشترك غير مسموحة في مجموعة «أول عدد محدد».", path);
    }
    if (gid && policy) groups.push({ id: gid, gradingPolicy: policy, requiredAnswers, maxMarks, officialMax, parts });
  });
  if (totalParts > COMPOSITE_LIMITS.parts) add("COMPOSITE_LIMIT", "عدد البنود يتجاوز الحد (" + COMPOSITE_LIMITS.parts + ").", "composite.groups");
  if (coding > COMPOSITE_LIMITS.codingChildren) add("COMPOSITE_LIMIT", "عدد بنود البرمجة يتجاوز الحد (" + COMPOSITE_LIMITS.codingChildren + ").", "composite.groups");
  if (issues.length) return { ok: false, issues };
  const officialMax = groups.reduce((s, g) => s + g.officialMax, 0);
  if (!finitePositive(node.marks) || Math.abs(node.marks - officialMax) > EPS) return { ok: false, issues: [{ code: "COMPOSITE_MARKS_MISMATCH", message: "علامة السؤال (" + String(node.marks) + ") لا تساوي مجموع العلامات الرسمية للمجموعات (" + officialMax + ").", path: "marks" }] };
  return { ok: true, shape: { groups, contexts, officialMax } };
}

/** The answer-independent OFFICIAL maximum of a structurally valid composite; undefined when the shape is invalid. */
export function compositeOfficialMaxMarks(node: unknown): number | undefined {
  const s = compositeShape(node);
  return s.ok ? s.shape.officialMax : undefined;
}
/** Marks contributed by a composite to every total: the official maximum, or the stored marks when the shape is invalid (never guessed). */
export function compositeQuestionMaxMarks(node: Record<string, unknown>): number {
  const m = compositeOfficialMaxMarks(node);
  if (m !== undefined) return m;
  const n = Number(node.marks ?? node.points);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** answered ⇔ some part answered or some context carries at least one action (mirror: api exam-structure.js isResponseAnswered). */
export function isCompositeAnswerAnswered(a: unknown): boolean {
  if (!isObj(a) || a.kind !== "composite") return false;
  const parts = isObj(a.parts) ? Object.values(a.parts) : [], contexts = isObj(a.contexts) ? Object.values(a.contexts) : [];
  return parts.some(p => answered(p as Answer)) || contexts.some(c => answered(c as Answer));
}
const partAnswerOf = (a: unknown, pid: string): Answer | undefined => (isObj(a) && a.kind === "composite" && isObj(a.parts) && Object.prototype.hasOwnProperty.call(a.parts, pid) ? (a.parts[pid] as Answer) : undefined);

export type CompositePartSelection = { counted: boolean; answered: boolean; ignored: boolean };
/**
 * First-N at GROUP level (the ONE selection rule, mirrored client / server through the shared build): in an "all" group every part counts;
 * in a "firstNAnswered" group the first `requiredAnswers` ANSWERED parts in display order count, unanswered parts never consume a slot
 * (and carry no counted marks of their own: the group maximum stays requiredAnswers × part marks),
 * answered parts beyond the quota are IGNORED (kept, never graded, never a coding job). A shared-context SmartSim part never sits in a
 * firstN group (finalization blocker), so "answered" is always the part's own answer.
 */
export function selectCompositeCountedParts(node: unknown, answer: unknown): Map<string, CompositePartSelection> {
  const out = new Map<string, CompositePartSelection>();
  const s = compositeShape(node);
  if (!s.ok) return out;
  for (const g of s.shape.groups) {
    let taken = 0;
    for (const p of g.parts) {
      const isAnswered = answered(partAnswerOf(answer, p.id));
      if (g.gradingPolicy !== "firstNAnswered") { out.set(p.id, { counted: true, answered: isAnswered, ignored: false }); continue; }
      if (isAnswered && taken < (g.requiredAnswers as number)) { taken++; out.set(p.id, { counted: true, answered: true, ignored: false }); }
      // an unanswered firstN part fills no slot (no counted marks, never pending review — mirror of a section's firstN unit); an answered
      // part beyond the quota is excess
      else out.set(p.id, isAnswered ? { counted: false, answered: true, ignored: true } : { counted: false, answered: false, ignored: false });
    }
  }
  return out;
}

/**
 * Copy / duplicate / import authority: a deep copy of a composite root whose EVERY group, part and context id is fresh (`newId`) and whose
 * part → context references follow the new context ids. Type versions, marks, private keys and every child configuration are preserved
 * byte-for-byte (child-internal ids — fields, options, blanks, checks — are scoped to their part and keep their meaning). A malformed root
 * is copied verbatim (never repaired; finalization still judges it).
 */
export function cloneCompositeWithNewIds(root: unknown, newId: (prefix: string) => string): unknown {
  const copy = JSON.parse(JSON.stringify(root ?? null)) as unknown;
  if (!isObj(copy)) return copy;
  const ctxMap = new Map<string, string>();
  if (Array.isArray(copy.contexts)) for (const c of copy.contexts) if (isObj(c) && typeof c.id === "string") { const id = newId("ctx"); ctxMap.set(c.id, id); c.id = id; }
  if (Array.isArray(copy.groups)) for (const g of copy.groups) {
    if (!isObj(g)) continue;
    g.id = newId("g");
    if (Array.isArray(g.parts)) for (const p of g.parts) {
      if (!isObj(p)) continue;
      p.id = newId("p");
      if (typeof p.contextId === "string" && ctxMap.has(p.contextId)) p.contextId = ctxMap.get(p.contextId);
    }
  }
  return copy;
}
