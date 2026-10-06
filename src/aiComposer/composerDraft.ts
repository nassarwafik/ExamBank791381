// Phase 20F — the SECTION DRAFT stage: the model writes the questions of ONE planned section (one strict item per planned item, same order,
// same kind). Each item is mapped by code:
//   • a 19A family (MCQ, cloze, parametric, open response + rubric, coding public material, networkCli switch…) goes through the 19A
//     per-question normalizer UNCHANGED (normalizeAiQuestionDraft — its strict shape check, capability refusals, coding hidden-test policy
//     and the canonical validators);
//   • a SmartSim question is built from a catalog-only SIM SPEC (composerSim: code-owned config + private checks, no free credit);
//   • a composite@1 question gets ONE shared context (a SmartSim spec or a rich source), groups of child parts (19A drafts, or SmartSim
//     parts that take a SUBSET of the shared context's check ids), code-computed group maxima and code-checked marks.
// IDs, display numbers and marks are CODE-OWNED: question ids are minted from a nonce, the question's marks are the validated plan marks,
// a composite's part marks must sum exactly to them (never redistributed by code). The canonical validators (validateStructuredExam) then
// decide every question; an invalid item refuses the section with structured issues (bounded AI repair) — nothing is patched into validity.
import { buildAiAuthorSchema, normalizeAiQuestionDraft } from "../aiQuestionDraft";
import { validateStructuredExam } from "../examQuality";
import type { BuilderQuestion, BuilderSection } from "../examTypes";
import { COMPOSER_LIMITS, type ComposerIssue } from "./composerLimits";
import { COMPOSER_DRAFT_TYPES, COMPOSER_ITEM_KINDS, composerItemIdentity, type ComposerItemKind } from "./composerCatalog";
import type { AiExamPlanItem, AiExamPlanSection, PlanDifficulty } from "./composerPlan";
import { PLAN_DIFFICULTIES } from "./composerPlan";
import { buildRichBlocksSchema, mapAiRichBlocks } from "./composerRich";
import { buildSimFromSpec, buildSimSpecSchema, simFreeCreditIssues, type BuiltSim } from "./composerSim";
import { cleanText, hasExactKeys, isArr, isEnum, isInt, isStr, sArr, sBool, sEnum, sInt, sNull, sObj, sStr, type JsonSchema } from "./composerSchemaKit";

const L = COMPOSER_LIMITS;
const PART_KINDS = Object.freeze([...COMPOSER_DRAFT_TYPES, "smartSim"] as const);
const POLICIES = ["all", "firstNAnswered"] as const;
const LETTERS = ["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح", "ط", "ي", "ك", "ل"];

// The composite is FLAT on the wire (Review Fix 1 — provider strict-mode nesting): its text / context / group headers / parts are item
// fields, and every part names its group (1-based). Code rebuilds the nested composite before any judgement; the depth of the deepest
// path is item → part → 19A question → payload → entry → format.
export function buildItemSchema(): JsonSchema {
  const q = buildAiAuthorSchema() as unknown as JsonSchema;
  const part = sObj({ group: sInt(1, L.compositeGroups), kind: sEnum(PART_KINDS), linked: sBool(), marks: sInt(1, L.itemMarksMax), label: sStr(), simChecks: sArr(sStr(), 40), simText: sStr(), question: sNull(q) });
  const group = sObj({ title: sStr(), policy: sEnum(POLICIES), requiredAnswers: sNull(sInt(1, L.compositeParts)) });
  const context = sObj({ kind: sEnum(["smartSim", "source"]), sim: sNull(buildSimSpecSchema()), sourceTitle: sStr(), sourceBlocks: buildRichBlocksSchema() });
  return sObj({
    kind: sEnum(COMPOSER_ITEM_KINDS), topic: sStr(), difficulty: sEnum(PLAN_DIFFICULTIES), rationale: sStr(), stem: buildRichBlocksSchema(),
    question: sNull(q), smartSim: sNull(sObj({ text: sStr(), sim: buildSimSpecSchema() })),
    compositeText: sStr(), compositeContext: sNull(context), compositeGroups: sArr(group, L.compositeGroups), compositeParts: sArr(part, L.compositeParts),
    assetRequest: sNull(sObj({ description: sStr() }))
  });
}
export const buildSectionDraftSchema = (): JsonSchema => sObj({ items: sArr(buildItemSchema(), L.itemsPerSection) });

const ITEM_KEYS = ["kind", "topic", "difficulty", "rationale", "stem", "question", "smartSim", "compositeText", "compositeContext", "compositeGroups", "compositeParts", "assetRequest"] as const;
const FLAT_GROUP_KEYS = ["title", "policy", "requiredAnswers"] as const;
const PART_KEYS = ["kind", "linked", "marks", "label", "simChecks", "simText", "question"] as const;
const GROUP_KEYS = ["title", "policy", "requiredAnswers", "parts"] as const;
const CTX_KEYS = ["kind", "sim", "sourceTitle", "sourceBlocks"] as const;

export type ComposerItemMeta = { questionId: string; kind: ComposerItemKind; topic: string; difficulty: PlanDifficulty; rationale: string };
export type ComposerIds = { nonce: string };
export const isComposerNonce = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9]{6,16}$/.test(v);
export const composerQuestionId = (ids: ComposerIds, sectionIndex: number, itemIndex: number) => "ai" + ids.nonce + "-" + (sectionIndex + 1) + "-" + (itemIndex + 1);
export const composerSectionId = (ids: ComposerIds, sectionIndex: number) => "ai" + ids.nonce + "-s" + (sectionIndex + 1);

type R<T> = { ok: true; value: T } | { ok: false; issues: ComposerIssue[] };
const issue = (code: string, message: string, path: string, questionId?: string): ComposerIssue => ({ code, message, path, ...(questionId ? { questionId } : {}) });

/** One 19A draft → canonical node (the 19A normalizer, unchanged), with code-owned id / marks; the draft's intent must equal `kind`. */
function mapDraftQuestion(raw: unknown, kind: string, qid: string, marks: number, request: string, path: string): R<BuilderQuestion> {
  if (!hasExactKeys(raw, Object.keys((buildAiAuthorSchema() as { properties: object }).properties))) return { ok: false, issues: [issue("AI_DRAFT_MALFORMED", "مسودة السؤال غير صالحة البنية.", path, qid)] };
  if (raw.intent !== kind) return { ok: false, issues: [issue("AI_ITEM_KIND_MISMATCH", "نوع السؤال المكتوب (" + String(raw.intent) + ") لا يطابق نوع البند في الخطة (" + kind + ").", path, qid)] };
  const r = normalizeAiQuestionDraft(raw, { request });
  if (!r.ok) return { ok: false, issues: r.issues.length ? r.issues.map(i => issue(r.code, i.message, path, qid)) : [issue(r.code, r.message, path, qid)] };
  return { ok: true, value: { ...r.question, examQuestionId: qid, marks } };
}

function labelOf(raw: string, i: number): string { const t = cleanText(raw); return t && t.length <= 40 ? t : LETTERS[i] ?? String(i + 1); }

function buildComposite(raw: unknown, qid: string, marks: number, plan: AiExamPlanItem, request: string, path: string): R<BuilderQuestion> {
  const issues: ComposerIssue[] = [];
  if (!hasExactKeys(raw, ["text", "context", "groups"]) || !isStr(raw.text, L.richTextChars, 1) || !isArr(raw.groups, L.compositeGroups) || !raw.groups.length) return { ok: false, issues: [issue("AI_COMPOSITE_MALFORMED", "السؤال المركّب غير صالح البنية.", path, qid)] };
  let sim: BuiltSim | null = null;
  const contexts: Record<string, unknown>[] = [];
  if (raw.context !== null) {
    const c = raw.context;
    if (!hasExactKeys(c, CTX_KEYS) || !isEnum(c.kind, ["smartSim", "source"]) || !isStr(c.sourceTitle, L.titleChars)) return { ok: false, issues: [issue("AI_COMPOSITE_MALFORMED", "سياق السؤال المركّب غير صالح.", path + ".context", qid)] };
    if (c.kind === "smartSim") {
      if (c.sim === null) return { ok: false, issues: [issue("AI_COMPOSITE_MALFORMED", "سياق المحاكاة يحتاج إلى مواصفة محاكاة.", path + ".context", qid)] };
      const b = buildSimFromSpec(c.sim, path + ".context.sim", plan.simulator, plan.scenario);
      if (!b.ok) return { ok: false, issues: b.issues.map(i => ({ ...i, questionId: qid })) };
      sim = b.value;
      contexts.push({ id: "ctx1", version: 1, kind: "smartSim", ...(sim.title ? { title: sim.title } : {}), ...(sim.instructions ? { instructions: sim.instructions } : {}), smartSim: sim.envelope });
    } else {
      if (c.sim !== null) return { ok: false, issues: [issue("AI_COMPOSITE_MALFORMED", "سياق المصدر لا يحمل محاكاة.", path + ".context", qid)] };
      const rc = mapAiRichBlocks(c.sourceBlocks, path + ".context.sourceBlocks");
      if (!rc.ok) return { ok: false, issues: rc.issues.map(i => ({ ...i, questionId: qid })) };
      if (!rc.richContent) return { ok: false, issues: [issue("AI_COMPOSITE_MALFORMED", "سياق المصدر فارغ.", path + ".context", qid)] };
      const title = cleanText(c.sourceTitle);
      contexts.push({ id: "ctx1", version: 1, kind: "source", ...(title ? { title } : {}), sources: [{ id: "src1", version: 1, kind: "rich", ...(title ? { title } : {}), richContent: rc.richContent }] });
    }
  }
  if (plan.simulator && !sim) issues.push(issue("AI_PLAN_SIMULATOR_MISSING", "الخطة تتطلب سياق محاكاة مشتركًا لهذا السؤال المركّب.", path, qid));
  let partNo = 0, official = 0;
  const usedChecks = new Set<string>();                                         // a check id grades at most ONE part (no double credit)
  const groups: Record<string, unknown>[] = [];
  (raw.groups as unknown[]).forEach((g, gi) => {
    const gp = path + ".groups[" + gi + "]";
    if (!hasExactKeys(g, GROUP_KEYS) || !isStr(g.title, L.titleChars) || !isEnum(g.policy, POLICIES) || !isArr(g.parts, L.compositeParts) || !g.parts.length || !(g.requiredAnswers === null || isInt(g.requiredAnswers, 1, L.compositeParts))) { issues.push(issue("AI_COMPOSITE_MALFORMED", "مجموعة غير صالحة البنية.", gp, qid)); return; }
    const parts: Record<string, unknown>[] = [];
    (g.parts as unknown[]).forEach((p, pi) => {
      const pp = gp + ".parts[" + pi + "]";
      if (!hasExactKeys(p, PART_KEYS) || !isEnum(p.kind, PART_KINDS) || typeof p.linked !== "boolean" || !isInt(p.marks, 1, L.itemMarksMax) || !isStr(p.label, 40) || !isArr(p.simChecks, 40) || !p.simChecks.every(x => isStr(x, 64, 1)) || !isStr(p.simText, L.richTextChars)) { issues.push(issue("AI_COMPOSITE_MALFORMED", "بند فرعي غير صالح البنية.", pp, qid)); return; }
      partNo++;
      const id = "p" + partNo, label = labelOf(p.label, partNo - 1);
      if (p.kind === "smartSim") {
        if (!sim || !p.linked) { issues.push(issue("AI_COMPOSITE_SMARTSIM_CONTEXT", "بند المحاكاة يجب أن يرتبط بسياق المحاكاة المشترك.", pp, qid)); return; }
        if (p.question !== null || !p.simChecks.length || new Set(p.simChecks).size !== p.simChecks.length) { issues.push(issue("AI_COMPOSITE_MALFORMED", "بند المحاكاة يحتاج إلى قائمة فحوص من السياق المشترك.", pp, qid)); return; }
        const picked = (p.simChecks as string[]).map(cid => sim!.checks.find(k => k.id === cid));
        if (picked.some(k => !k)) { issues.push(issue("AI_SIM_CHECK_UNKNOWN", "فحص غير موجود في سيناريو المحاكاة: " + (p.simChecks as string[]).filter((_, i) => !picked[i]).join(", "), pp, qid)); return; }
        const reused = (p.simChecks as string[]).filter(cid => usedChecks.has(cid));
        if (reused.length) { issues.push(issue("AI_COMPOSITE_SIM_CHECK_OVERLAP", "فحص المحاكاة مستخدم في بند آخر من السؤال نفسه (يُحتسب مرتين): " + reused.join(", "), pp, qid)); return; }
        for (const cid of p.simChecks as string[]) usedChecks.add(cid);
        const checks = picked.map(k => ({ ...k! }));
        issues.push(...simFreeCreditIssues(sim.envelope, checks, pp).map(i => ({ ...i, questionId: qid })));
        parts.push({ id, label, type: "smartSim", questionTypeVersion: 1, contextId: "ctx1", text: cleanText(p.simText) || label, marks: p.marks, answer: { scoring: "proportional", checks } });
        return;
      }
      if (p.question === null || p.simChecks.length) { issues.push(issue("AI_COMPOSITE_MALFORMED", "البند الفرعي يحتاج إلى مسودة سؤال.", pp, qid)); return; }
      const m = mapDraftQuestion(p.question, p.kind, qid + "::p", p.marks, request, pp + ".question");
      if (!m.ok) { issues.push(...m.issues); return; }
      const q = m.value as unknown as Record<string, unknown>;
      if (q.codeStimulus !== undefined) { issues.push(issue("AI_COMPOSITE_PART_FIELD", "مثير الكود غير متاح داخل بند فرعي.", pp, qid)); return; }
      const { examQuestionId: _id, presentationType, questionTypeVersion, text, marks: _m, displayNumber: _d, ...config } = q;
      void _id; void _m; void _d;
      parts.push({ id, label, type: presentationType, questionTypeVersion: questionTypeVersion ?? 1, ...(p.linked && contexts.length ? { contextId: "ctx1" } : {}), text, marks: p.marks, ...config });
    });
    const policy = g.policy as "all" | "firstNAnswered";
    let maxMarks: number | null = null, required: number | null = null;
    if (policy === "all") { if (g.requiredAnswers !== null) issues.push(issue("AI_COMPOSITE_MARKS_MISMATCH", "مجموعة «الكل» لا تحدد عدد إجابات مطلوبًا.", gp, qid)); official += parts.reduce((n, p) => n + (p.marks as number), 0); }
    else {
      const ms = new Set(parts.map(p => p.marks as number));
      required = g.requiredAnswers as number | null;
      if (required === null || required > parts.length || ms.size !== 1) issues.push(issue("AI_COMPOSITE_MARKS_MISMATCH", "مجموعة «أول N إجابات» تحتاج إلى عدد مطلوب صالح وعلامات متساوية لكل البنود.", gp, qid));
      else { maxMarks = required * [...ms][0]; official += maxMarks; }
    }
    const title = cleanText(g.title);
    groups.push({ id: "g" + (gi + 1), ...(title ? { title } : {}), gradingPolicy: policy, requiredAnswers: required, maxMarks, parts });
  });
  if (!issues.length && official !== marks) issues.push(issue("AI_COMPOSITE_MARKS_MISMATCH", "مجموع علامات البنود الفرعية " + official + " ويجب أن يساوي علامة السؤال في الخطة " + marks + ".", path, qid));
  if (issues.length) return { ok: false, issues };
  return { ok: true, value: { examQuestionId: qid, presentationType: "composite", questionTypeVersion: 1, text: cleanText(raw.text), marks, composite: { v: 1, contexts, groups } } as unknown as BuilderQuestion };
}

/** The flat wire composite → the nested shape the composite gates judge; `null` when the item carries no composite at all. A part whose
 *  group does not exist, or a malformed header, is refused (never re-homed). */
function nestedComposite(raw: Record<string, unknown>, qid: string, path: string): { present: boolean; value?: unknown; issues?: ComposerIssue[] } {
  const groups = raw.compositeGroups, parts = raw.compositeParts;
  if (!isStr(raw.compositeText, L.richTextChars) || !isArr(groups, L.compositeGroups) || !isArr(parts, L.compositeParts)) return { present: true, issues: [issue("AI_COMPOSITE_MALFORMED", "السؤال المركّب غير صالح البنية.", path, qid)] };
  const present = raw.compositeText !== "" || raw.compositeContext !== null || groups.length > 0 || parts.length > 0;
  if (!present) return { present: false };
  if (!groups.every(g => hasExactKeys(g, FLAT_GROUP_KEYS)) || !parts.every(p => p !== null && typeof p === "object" && !Array.isArray(p) && isInt((p as Record<string, unknown>).group, 1, groups.length)))
    return { present: true, issues: [issue("AI_COMPOSITE_MALFORMED", "مجموعات البنود أو انتماء البنود إليها غير صالح.", path, qid)] };
  const nested = (groups as Record<string, unknown>[]).map((g, gi) => ({ ...g, parts: (parts as Record<string, unknown>[]).filter(p => p.group === gi + 1).map(p => { const { group: _g, ...rest } = p; void _g; return rest; }) }));
  return { present: true, value: { text: raw.compositeText, context: raw.compositeContext, groups: nested } };
}

/** One AI item → one canonical question (or issues). */
function mapItem(raw: unknown, plan: AiExamPlanItem, qid: string, request: string, path: string): R<{ question: BuilderQuestion; meta: Omit<ComposerItemMeta, "questionId">; warnings: ComposerIssue[] }> {
  const warnings: ComposerIssue[] = [];
  if (!hasExactKeys(raw, ITEM_KEYS) || !isEnum(raw.kind, COMPOSER_ITEM_KINDS) || !isStr(raw.topic, L.topicChars) || !isEnum(raw.difficulty, PLAN_DIFFICULTIES) || !isStr(raw.rationale, L.rationaleChars)) return { ok: false, issues: [issue("AI_ITEM_MALFORMED", "بند السؤال غير صالح البنية.", path, qid)] };
  if (raw.kind !== plan.kind) return { ok: false, issues: [issue("AI_ITEM_KIND_MISMATCH", "نوع البند (" + raw.kind + ") لا يطابق الخطة (" + plan.kind + ").", path, qid)] };
  const kind = raw.kind as ComposerItemKind;
  const comp = nestedComposite(raw, qid, path + ".composite");
  if (comp.issues) return { ok: false, issues: comp.issues };
  const present = [...(["question", "smartSim"] as const).filter(k => raw[k] !== null), ...(comp.present ? ["composite" as const] : [])];
  const want = kind === "smartSim" ? "smartSim" : kind === "composite" ? "composite" : "question";
  if (present.length !== 1 || present[0] !== want) return { ok: false, issues: [issue("AI_ITEM_PAYLOAD", "البند يجب أن يحمل محتوى نوعه فقط.", path, qid)] };
  let q: BuilderQuestion;
  if (want === "question") { const m = mapDraftQuestion(raw.question, kind, qid, plan.marks, request, path + ".question"); if (!m.ok) return m; q = m.value; }
  else if (want === "smartSim") {
    const s = raw.smartSim;
    if (!hasExactKeys(s, ["text", "sim"]) || !isStr(s.text, L.richTextChars, 1)) return { ok: false, issues: [issue("AI_ITEM_MALFORMED", "سؤال المحاكاة غير صالح.", path, qid)] };
    const b = buildSimFromSpec(s.sim, path + ".smartSim.sim", plan.simulator, plan.scenario);
    if (!b.ok) return { ok: false, issues: b.issues.map(i => ({ ...i, questionId: qid })) };
    const free = simFreeCreditIssues(b.value.envelope, b.value.checks, path);
    if (free.length) return { ok: false, issues: free.map(i => ({ ...i, questionId: qid })) };
    const id = composerItemIdentity("smartSim");
    q = { examQuestionId: qid, presentationType: "smartSim", questionTypeVersion: id.version, text: cleanText(s.text), marks: plan.marks, smartSim: b.value.envelope, answer: { scoring: "proportional", checks: b.value.checks } } as unknown as BuilderQuestion;
  } else { const c = buildComposite(comp.value, qid, plan.marks, plan, request, path + ".composite"); if (!c.ok) return c; q = c.value; }
  const stem = mapAiRichBlocks(raw.stem, path + ".stem");
  if (!stem.ok) return { ok: false, issues: stem.issues.map(i => ({ ...i, questionId: qid })) };
  if (stem.richContent) {
    if (kind === "parametricNumeric") warnings.push(issue("AI_RICH_STEM_DROPPED", "أُهمل التنسيق الغني لسؤال المعطيات المتغيرة (غير مدعوم لهذا النوع)؛ النص العادي باقٍ.", path, qid));
    else q = { ...q, richContent: stem.richContent };
  }
  if (raw.assetRequest !== null) {
    const a = raw.assetRequest;
    if (!hasExactKeys(a, ["description"]) || !isStr(a.description, L.assetDescriptionChars, 1)) return { ok: false, issues: [issue("AI_ITEM_MALFORMED", "طلب الصورة غير صالح.", path, qid)] };
    q = { ...q, assetRequest: { v: 1, description: cleanText(a.description) } } as BuilderQuestion;
    warnings.push(issue("AI_ASSET_REQUEST", "السؤال يحتاج إلى صورة يضيفها المعلم قبل الاعتماد: " + cleanText(a.description), path, qid));
  }
  return { ok: true, value: { question: q, meta: { kind, topic: cleanText(raw.topic) || plan.topic, difficulty: raw.difficulty as PlanDifficulty, rationale: cleanText(raw.rationale) }, warnings } };
}

/** ONE composer item outside a plan (patch operations): marks come from the operation, the simulator is whatever catalog spec the item names. */
export function normalizeComposerItem(raw: unknown, ctx: { marks: number; qid: string; request: string; path: string }): R<{ question: BuilderQuestion; meta: Omit<ComposerItemMeta, "questionId">; warnings: ComposerIssue[] }> {
  const kind = hasExactKeys(raw, ITEM_KEYS) && isEnum(raw.kind, COMPOSER_ITEM_KINDS) ? (raw.kind as ComposerItemKind) : null;
  if (!kind) return { ok: false, issues: [issue("AI_ITEM_MALFORMED", "بند السؤال غير صالح البنية.", ctx.path, ctx.qid)] };
  const plan: AiExamPlanItem = { key: "patch", kind, topic: "", difficulty: "medium", marks: ctx.marks, simulator: null, scenario: null, note: "" };
  return mapItem(raw, plan, ctx.qid, ctx.request, ctx.path);
}

export type SectionDraftResult = { ok: true; section: BuilderSection; meta: ComposerItemMeta[]; warnings: ComposerIssue[] } | { ok: false; issues: ComposerIssue[] };
/** The section stage: AI section draft + its validated plan section → one canonical section (or structured issues for a bounded repair). */
/** `request` for the 19A per-question normalizer is the ITEM's own plan text (topic + note): its advisory simulator guard must judge the
 *  item, not every topic of the whole exam (a DHCP section elsewhere must not refuse a VLAN switch question). */
export function normalizeSectionDraft(raw: unknown, planSection: AiExamPlanSection, sectionIndex: number, ids: ComposerIds): SectionDraftResult {
  if (!hasExactKeys(raw, ["items"]) || !isArr(raw.items, L.itemsPerSection)) return { ok: false, issues: [issue("AI_SECTION_MALFORMED", "مسودة القسم غير صالحة البنية.", "$")] };
  if (raw.items.length !== planSection.items.length) return { ok: false, issues: [issue("AI_SECTION_ITEM_COUNT", "عدد البنود " + raw.items.length + " ويجب أن يطابق الخطة (" + planSection.items.length + ").", "$.items")] };
  const issues: ComposerIssue[] = [], warnings: ComposerIssue[] = [], questions: BuilderQuestion[] = [], meta: ComposerItemMeta[] = [];
  raw.items.forEach((it, i) => {
    const qid = composerQuestionId(ids, sectionIndex, i);
    const m = mapItem(it, planSection.items[i], qid, planSection.items[i].topic + " " + planSection.items[i].note, "$.items[" + i + "]");
    if (!m.ok) { issues.push(...m.issues); return; }
    questions.push(m.value.question); meta.push({ questionId: qid, ...m.value.meta }); warnings.push(...m.value.warnings);
  });
  if (issues.length) return { ok: false, issues };
  const section: BuilderSection = { id: composerSectionId(ids, sectionIndex), title: planSection.title, ...(planSection.instructions ? { instructions: planSection.instructions } : {}), gradingPolicy: "all", questions };
  const canonical = validateStructuredExam({ examId: "ai-check", title: "check", sections: [section] } as never).filter(i => i.severity === "error" && i.code !== "AI_ASSET_REQUEST_UNRESOLVED");
  if (canonical.length) return { ok: false, issues: canonical.map(i => ({ code: i.code, message: i.message, ...(i.questionId ? { questionId: String(i.questionId) } : {}) })) };
  return { ok: true, section, meta, warnings };
}
