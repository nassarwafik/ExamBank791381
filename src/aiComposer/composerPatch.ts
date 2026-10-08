// Phase 20F — AiExamPatchV1: AI MODIFICATION of an existing exam as a bounded list of DOMAIN operations (never "regenerate the whole exam",
// never an arbitrary object-path write). The model proposes operations against an AI-safe projection; the code:
//   1. normalizes every operation strictly (known op, exact fields, existing targets, catalog-only payloads; new questions / sections go
//      through the SAME item mapper as generation — 19A normalizer, code-built SmartSim, composite gates — with code-minted ids);
//   2. enforces the SCOPE LOCK of the mode the teacher chose (a selected question can only be rewritten / replaced; presentation-only
//      requests can only touch the presentation; a section request only that section) — an out-of-scope operation refuses the patch;
//   3. protects authority: text / rich / presentation operations never touch `answer`, marks, type or ids; hidden tests, private SmartSim
//      checks and rubric guidance are only ever replaced by an explicit replaceQuestion (shown in the diff with a warning);
//   4. carries the BASE REVISION of the exam it was computed for; applying it to any other revision is refused (STALE);
//   5. renders a teacher-readable DIFF; selective apply keeps every operation group of one target atomic;
//   6. applies purely and re-runs the composer verdict: a patch that would introduce a new blocking issue is refused, never "fixed".
import type { BuilderQuestion, BuilderSection, StructuredExam } from "../examTypes";
import { validatePresentation, validateQuestionPresentation, TYPE_VARIANTS } from "../presentation/presentationModel";
import type { RichContentV1 } from "../richContent/richContentModel";
import { COMPOSER_LIMITS, type ComposerIssue } from "./composerLimits";
import { COMPOSER_PRESETS, COMPOSER_TABLE_VARIANTS } from "./composerCatalog";
import { buildItemSchema, countFunctionSims, functionSimLimitIssue, normalizeComposerItem, type ComposerItemMeta } from "./composerDraft";
import { composerVerdict, withComposerHistory, allQuestions, verifyAiQuestion } from "./composerExam";
import { examRevision, isRevision } from "./composerRevision";
import { buildRichBlocksSchema, mapAiRichBlocks } from "./composerRich";
import type { AiChartPolicy } from "./composerChart";
import type { ComposerScope } from "./composerProjection";
import { cleanText, hasExactKeys, isArr, isEnum, isInt, isStr, sArr, sEnum, sInt, sNull, sObj, sStr, type JsonSchema } from "./composerSchemaKit";

type Rec = Record<string, unknown>;
const L = COMPOSER_LIMITS;
export const PATCH_OPS = Object.freeze(["updatePresentation", "updateQuestionText", "updateQuestionRichContent", "updateQuestionPresentation", "updateQuestionMarks", "replaceQuestion", "addQuestion", "removeQuestion", "moveQuestion", "addSection", "updateSection", "removeSection", "moveSection", "updateCompositePartText", "removeCompositePart"] as const);
export type PatchOpName = (typeof PATCH_OPS)[number];
export const COMPOSER_MODES = Object.freeze(["modifyExam", "generateSection", "replaceQuestion", "improveContent", "presentation"] as const);
export type ComposerMode = (typeof COMPOSER_MODES)[number];
const MODE_OPS: Readonly<Record<ComposerMode, readonly PatchOpName[]>> = Object.freeze({
  modifyExam: PATCH_OPS,
  generateSection: ["addSection"],
  replaceQuestion: ["replaceQuestion"],
  improveContent: ["updateQuestionText", "updateQuestionRichContent", "updateQuestionPresentation", "updateCompositePartText", "updateSection"],
  presentation: ["updatePresentation"]
});
/** The scope each mode requires (a mode can never widen its own scope). */
export function modeScopeOk(mode: ComposerMode, scope: ComposerScope): boolean {
  if (mode === "presentation") return scope.kind === "presentation";
  if (mode === "replaceQuestion") return scope.kind === "question";
  if (mode === "improveContent") return scope.kind === "question" || scope.kind === "section";
  if (mode === "generateSection") return scope.kind === "exam";
  return scope.kind === "exam" || scope.kind === "section";
}
const RICH_MODES = ["replace", "prepend", "append"] as const;

export function buildPatchSchema(): JsonSchema {
  const op = sObj({
    op: sEnum(PATCH_OPS), sectionId: sNull(sStr()), questionId: sNull(sStr()), partId: sNull(sStr()), position: sNull(sInt(0, 200)),
    text: sNull(sStr()), title: sNull(sStr()), marks: sNull(sInt(1, L.itemMarksMax)), preset: sNull(sEnum(COMPOSER_PRESETS as readonly string[])),
    tableVariant: sNull(sEnum(COMPOSER_TABLE_VARIANTS)), variant: sNull(sEnum(TYPE_VARIANTS)), richBlocks: sNull(buildRichBlocksSchema()), richMode: sNull(sEnum(RICH_MODES)),
    item: sNull(buildItemSchema()), section: sNull(sObj({ title: sStr(), instructions: sStr(), itemMarks: sArr(sInt(1, L.itemMarksMax), L.itemsPerSection) })),
    items: sNull(sArr(buildItemSchema(), L.itemsPerSection)),                  // addSection's items sit beside its header (one level shallower)
    reason: sStr()
  });
  return sObj({ summary: sStr(), operations: sArr(op, L.patchOperations) });
}
const OP_KEYS = ["op", "sectionId", "questionId", "partId", "position", "text", "title", "marks", "preset", "tableVariant", "variant", "richBlocks", "richMode", "item", "section", "items", "reason"] as const;

export type NormOp =
  | { op: "updatePresentation"; preset: string; tableVariant: string | null; reason: string }
  | { op: "updateQuestionText"; questionId: string; text: string; reason: string }
  | { op: "updateQuestionRichContent"; questionId: string; richContent: RichContentV1 | null; mode: (typeof RICH_MODES)[number]; reason: string }
  | { op: "updateQuestionPresentation"; questionId: string; variant: string; reason: string }
  | { op: "updateQuestionMarks"; questionId: string; marks: number; reason: string }
  | { op: "replaceQuestion"; questionId: string; question: BuilderQuestion; meta: Omit<ComposerItemMeta, "questionId">; reason: string }
  | { op: "addQuestion"; sectionId: string; position: number | null; question: BuilderQuestion; meta: Omit<ComposerItemMeta, "questionId">; reason: string }
  | { op: "removeQuestion"; questionId: string; reason: string }
  | { op: "moveQuestion"; questionId: string; sectionId: string; position: number | null; reason: string }
  | { op: "addSection"; position: number | null; section: BuilderSection; meta: ComposerItemMeta[]; reason: string }
  | { op: "updateSection"; sectionId: string; title: string | null; instructions: string | null; reason: string }
  | { op: "removeSection"; sectionId: string; reason: string }
  | { op: "moveSection"; sectionId: string; position: number; reason: string }
  | { op: "updateCompositePartText"; questionId: string; partId: string; text: string; reason: string }
  | { op: "removeCompositePart"; questionId: string; partId: string; reason: string };
export type AiExamPatchV1 = { v: 1; baseRevision: string; mode: ComposerMode; scope: ComposerScope; summary: string; operations: NormOp[] };

// ── lookups ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function locate(exam: StructuredExam, questionId: string): { si: number; qi: number } | null {
  for (let si = 0; si < (exam.sections || []).length; si++) { const qi = (exam.sections[si].questions || []).findIndex(q => q.examQuestionId === questionId); if (qi >= 0) return { si, qi }; }
  return null;
}
const sectionIndex = (exam: StructuredExam, id: string) => (exam.sections || []).findIndex(s => s.id === id);
const compositeParts = (q: Rec): Rec[] => (((q.composite as Rec | undefined)?.groups as Rec[] | undefined) ?? []).flatMap(g => (g.parts as Rec[]) ?? []);

/** Scope check of ONE normalized op (target membership), given the exam. */
function opInScope(op: NormOp, scope: ComposerScope, exam: StructuredExam): boolean {
  const qSection = (qid: string) => { const l = locate(exam, qid); return l ? exam.sections[l.si].id : null; };
  if (scope.kind === "presentation") return op.op === "updatePresentation";
  if (scope.kind === "exam") return true;
  if (scope.kind === "question") return "questionId" in op && op.questionId === scope.questionId && op.op !== "moveQuestion" && op.op !== "removeQuestion";
  // section
  switch (op.op) {
    case "addQuestion": return op.sectionId === scope.sectionId;
    case "moveQuestion": return qSection(op.questionId) === scope.sectionId && op.sectionId === scope.sectionId;
    case "updateSection": return op.sectionId === scope.sectionId;
    case "updatePresentation": case "addSection": case "removeSection": case "moveSection": return false;
    default: return "questionId" in op && qSection(op.questionId) === scope.sectionId;
  }
}

export type NormalizeContext = { exam: StructuredExam; mode: ComposerMode; scope: ComposerScope; nonce: string; request: string };
/** Normalizes the model's patch against the exam it was given. Out-of-scope / unknown / malformed ⇒ the whole patch is refused. */
// 21A.1 — a MODIFY request carries no feature toggles: AI charts take only the numbers the teacher wrote in the instruction (never
// illustrative data); charts are otherwise available.
const modifyChartPolicy = (request: string): AiChartPolicy => ({ request, illustrative: false, charts: true });
export function normalizeComposerPatch(raw: unknown, ctx: NormalizeContext): { ok: true; patch: AiExamPatchV1 } | { ok: false; issues: ComposerIssue[] } {
  const fail = (code: string, message: string, path = "$"): { ok: false; issues: ComposerIssue[] } => ({ ok: false, issues: [{ code, message, path }] });
  if (!modeScopeOk(ctx.mode, ctx.scope)) return fail("PATCH_SCOPE_INVALID", "نطاق الطلب لا يناسب نوع التعديل.");
  if (!hasExactKeys(raw, ["summary", "operations"]) || !isStr(raw.summary, L.goalChars * 2) || !isArr(raw.operations, L.patchOperations)) return fail("PATCH_MALFORMED", "اقتراح التعديل غير صالح البنية.");
  if (!raw.operations.length) return fail("PATCH_EMPTY", "لم يقترح الذكاء الاصطناعي أي تعديل.");
  const opItems = (raw.operations as unknown[]).flatMap(o => (o && typeof o === "object" ? [(o as Record<string, unknown>).item, ...(Array.isArray((o as Record<string, unknown>).items) ? ((o as Record<string, unknown>).items as unknown[]) : [])] : []));
  if (countFunctionSims(opItems) > L.functionSims) return { ok: false, issues: [functionSimLimitIssue("$.operations")] };
  const allowed = MODE_OPS[ctx.mode];
  const issues: ComposerIssue[] = [];
  const ops: NormOp[] = [];
  let newQ = 0, newS = 0;
  const exam = ctx.exam;
  const qExists = (id: unknown): id is string => typeof id === "string" && !!locate(exam, id);
  const sExists = (id: unknown): id is string => typeof id === "string" && sectionIndex(exam, id) >= 0;
  raw.operations.forEach((o, i) => {
    const p = "$.operations[" + i + "]";
    if (!hasExactKeys(o, OP_KEYS) || !isEnum(o.op, PATCH_OPS) || !isStr(o.reason, L.rationaleChars)) { issues.push({ code: "PATCH_OP_MALFORMED", message: "عملية تعديل غير صالحة البنية.", path: p }); return; }
    if (!allowed.includes(o.op)) { issues.push({ code: "PATCH_SCOPE_VIOLATION", message: "العملية «" + o.op + "» خارج نطاق هذا الطلب.", path: p }); return; }
    const reason = cleanText(o.reason);
    const mapItem = (item: unknown, marks: number, qid: string): { question: BuilderQuestion; meta: Omit<ComposerItemMeta, "questionId"> } | null => {
      const r = normalizeComposerItem(item, { marks, qid, request: ctx.request, path: p + ".item", chartPolicy: modifyChartPolicy(ctx.request) });
      if (!r.ok) { issues.push(...r.issues); return null; }
      return { question: r.value.question, meta: r.value.meta };
    };
    switch (o.op) {
      case "updatePresentation": {
        if (!isEnum(o.preset, COMPOSER_PRESETS as readonly string[])) { issues.push({ code: "PATCH_OP_MALFORMED", message: "قالب عرض غير معروف.", path: p }); return; }
        ops.push({ op: "updatePresentation", preset: o.preset, tableVariant: isEnum(o.tableVariant, COMPOSER_TABLE_VARIANTS) ? o.tableVariant : null, reason }); return;
      }
      case "updateQuestionText": case "updateQuestionRichContent": case "updateQuestionPresentation": case "updateQuestionMarks": case "replaceQuestion": case "removeQuestion": {
        if (!qExists(o.questionId)) { issues.push({ code: "PATCH_TARGET_MISSING", message: "السؤال المستهدف غير موجود.", path: p }); return; }
        const qid = o.questionId;
        const loc = locate(exam, qid)!;
        const cur = exam.sections[loc.si].questions[loc.qi] as unknown as Rec;
        if (o.op === "updateQuestionText") { if (!isStr(o.text, L.richTextChars, 1)) { issues.push({ code: "PATCH_OP_MALFORMED", message: "نص السؤال الجديد غير صالح.", path: p }); return; } ops.push({ op: o.op, questionId: qid, text: cleanText(o.text), reason }); return; }
        if (o.op === "updateQuestionRichContent") {
          if (cur.presentationType === "parametricNumeric") { issues.push({ code: "PARAMETRIC_RICH_CONTENT_FORBIDDEN", message: "سؤال المعطيات المتغيرة لا يدعم المحتوى المنسق.", path: p }); return; }
          const rc = mapAiRichBlocks(o.richBlocks ?? [], p + ".richBlocks", modifyChartPolicy(ctx.request));
          if (!rc.ok) { issues.push(...rc.issues); return; }
          ops.push({ op: o.op, questionId: qid, richContent: rc.richContent, mode: isEnum(o.richMode, RICH_MODES) ? o.richMode : "replace", reason }); return;
        }
        if (o.op === "updateQuestionPresentation") { if (!isEnum(o.variant, TYPE_VARIANTS)) { issues.push({ code: "PATCH_OP_MALFORMED", message: "شكل السؤال غير معروف.", path: p }); return; } ops.push({ op: o.op, questionId: qid, variant: o.variant, reason }); return; }
        if (o.op === "updateQuestionMarks") {
          if (!isInt(o.marks, 1, L.itemMarksMax)) { issues.push({ code: "PATCH_OP_MALFORMED", message: "العلامة الجديدة غير صالحة.", path: p }); return; }
          if (cur.presentationType === "composite") { issues.push({ code: "PATCH_COMPOSITE_MARKS", message: "علامة السؤال المركّب تُشتق من بنوده؛ عدّل البنود أو استبدل السؤال.", path: p }); return; }
          ops.push({ op: o.op, questionId: qid, marks: o.marks, reason }); return;
        }
        if (o.op === "removeQuestion") { ops.push({ op: o.op, questionId: qid, reason }); return; }
        const marks = isInt(o.marks, 1, L.itemMarksMax) ? o.marks : Number(cur.marks) || 1;
        const m = mapItem(o.item, marks, qid);
        if (m) ops.push({ op: "replaceQuestion", questionId: qid, question: m.question, meta: m.meta, reason });
        return;
      }
      case "addQuestion": {
        if (!sExists(o.sectionId)) { issues.push({ code: "PATCH_TARGET_MISSING", message: "القسم المستهدف غير موجود.", path: p }); return; }
        if (!isInt(o.marks, 1, L.itemMarksMax)) { issues.push({ code: "PATCH_OP_MALFORMED", message: "السؤال الجديد يحتاج إلى علامة.", path: p }); return; }
        const qid = "ai" + ctx.nonce + "-m" + ++newQ;
        const m = mapItem(o.item, o.marks, qid);
        if (m) ops.push({ op: "addQuestion", sectionId: o.sectionId, position: isInt(o.position, 0, 200) ? o.position : null, question: m.question, meta: m.meta, reason });
        return;
      }
      case "moveQuestion": {
        if (!qExists(o.questionId) || !sExists(o.sectionId)) { issues.push({ code: "PATCH_TARGET_MISSING", message: "هدف النقل غير موجود.", path: p }); return; }
        ops.push({ op: "moveQuestion", questionId: o.questionId, sectionId: o.sectionId, position: isInt(o.position, 0, 200) ? o.position : null, reason }); return;
      }
      case "addSection": {
        const s = o.section, items = o.items;
        if (!hasExactKeys(s, ["title", "instructions", "itemMarks"]) || !isStr(s.title, L.titleChars, 1) || !isStr(s.instructions, L.goalChars * 4) || !isArr(items, L.itemsPerSection) || !items.length || !isArr(s.itemMarks, L.itemsPerSection) || s.itemMarks.length !== items.length || !s.itemMarks.every(m => isInt(m, 1, L.itemMarksMax))) { issues.push({ code: "PATCH_OP_MALFORMED", message: "القسم الجديد غير صالح.", path: p }); return; }
        const sid = "ai" + ctx.nonce + "-ms" + ++newS;
        const questions: BuilderQuestion[] = [], meta: ComposerItemMeta[] = [];
        let bad = false;
        (items as unknown[]).forEach((it, k) => { const qid = sid + "-" + (k + 1); const m = mapItem(it, (s.itemMarks as number[])[k], qid); if (!m) bad = true; else { questions.push(m.question); meta.push({ questionId: qid, ...m.meta }); } });
        if (bad) return;
        const instructions = cleanText(s.instructions);
        ops.push({ op: "addSection", position: isInt(o.position, 0, 200) ? o.position : null, section: { id: sid, title: cleanText(s.title), ...(instructions ? { instructions } : {}), gradingPolicy: "all", questions }, meta, reason });
        return;
      }
      case "updateSection": {
        if (!sExists(o.sectionId)) { issues.push({ code: "PATCH_TARGET_MISSING", message: "القسم المستهدف غير موجود.", path: p }); return; }
        const title = o.title === null ? null : isStr(o.title, L.titleChars, 1) ? cleanText(o.title) : undefined;
        const instructions = o.text === null ? null : isStr(o.text, L.goalChars * 4) ? cleanText(o.text) : undefined;
        if (title === undefined || instructions === undefined || (title === null && instructions === null)) { issues.push({ code: "PATCH_OP_MALFORMED", message: "تعديل القسم غير صالح.", path: p }); return; }
        ops.push({ op: "updateSection", sectionId: o.sectionId, title, instructions, reason }); return;
      }
      case "removeSection": { if (!sExists(o.sectionId)) { issues.push({ code: "PATCH_TARGET_MISSING", message: "القسم المستهدف غير موجود.", path: p }); return; } ops.push({ op: "removeSection", sectionId: o.sectionId, reason }); return; }
      case "moveSection": { if (!sExists(o.sectionId) || !isInt(o.position, 0, 200)) { issues.push({ code: "PATCH_TARGET_MISSING", message: "هدف النقل غير صالح.", path: p }); return; } ops.push({ op: "moveSection", sectionId: o.sectionId, position: o.position, reason }); return; }
      case "updateCompositePartText": case "removeCompositePart": {
        if (!qExists(o.questionId) || typeof o.partId !== "string") { issues.push({ code: "PATCH_TARGET_MISSING", message: "البند المستهدف غير موجود.", path: p }); return; }
        const loc = locate(exam, o.questionId)!;
        const cur = exam.sections[loc.si].questions[loc.qi] as unknown as Rec;
        if (cur.presentationType !== "composite" || !compositeParts(cur).some(x => x.id === o.partId)) { issues.push({ code: "PATCH_TARGET_MISSING", message: "البند المستهدف غير موجود في السؤال المركّب.", path: p }); return; }
        if (o.op === "updateCompositePartText") { if (!isStr(o.text, L.richTextChars, 1)) { issues.push({ code: "PATCH_OP_MALFORMED", message: "نص البند غير صالح.", path: p }); return; } ops.push({ op: o.op, questionId: o.questionId, partId: o.partId, text: cleanText(o.text), reason }); return; }
        ops.push({ op: "removeCompositePart", questionId: o.questionId, partId: o.partId, reason }); return;
      }
    }
  });
  if (issues.length) return { ok: false, issues };
  for (const op of ops) if (!opInScope(op, ctx.scope, exam)) return fail("PATCH_SCOPE_VIOLATION", "اقتراح التعديل يتجاوز نطاق ما حدده المعلم؛ رُفض بالكامل.");
  const targets = ops.filter(o => "questionId" in o && (o.op === "replaceQuestion" || o.op === "removeQuestion")).map(o => (o as { questionId: string }).questionId);
  if (new Set(targets).size !== targets.length) return fail("PATCH_CONFLICT", "عمليتان متعارضتان على السؤال نفسه.");
  return { ok: true, patch: { v: 1, baseRevision: examRevision(exam), mode: ctx.mode, scope: ctx.scope, summary: cleanText(raw.summary), operations: ops } };
}

/** The shape a patch must have when it comes BACK from the server (untrusted on the client): structural re-check only; apply re-validates. */
export function isPatchShape(v: unknown): v is AiExamPatchV1 {
  return hasExactKeys(v, ["v", "baseRevision", "mode", "scope", "summary", "operations"]) && v.v === 1 && isRevision(v.baseRevision) && isEnum(v.mode, COMPOSER_MODES) && Array.isArray(v.operations) && v.operations.length <= L.patchOperations && v.operations.every(o => o && typeof o === "object" && isEnum((o as Rec).op, PATCH_OPS));
}

// ── groups (atomic selection), diff, apply ─────────────────────────────────────────────────────────────────────────────────────────────
/** Operation groups: every op on the same question / section target is one atomic group (selective apply never splits a composite edit). */
export function patchGroups(patch: AiExamPatchV1): number[][] {
  const key = (o: NormOp, i: number): string =>
    o.op === "addQuestion" || o.op === "addSection" ? "add:" + i
    : o.op === "updatePresentation" ? "presentation"
    : "questionId" in o ? "q:" + o.questionId
    : "s:" + o.sectionId;
  const map = new Map<string, number[]>();
  patch.operations.forEach((o, i) => { const k = key(o, i); map.set(k, [...(map.get(k) ?? []), i]); });
  return [...map.values()];
}

export type DiffChange = { field: string; before: string; after: string };
export type DiffEntry = { index: number; group: number; op: PatchOpName; target: string; changes: DiffChange[]; warnings: string[]; reason: string };
const TYPE_LABEL = (t: unknown) => String(t ?? "");
const clip = (s: unknown, n = 160) => { const t = typeof s === "string" ? s : ""; return t.length > n ? t.slice(0, n) + "…" : t; };
function qLabel(exam: StructuredExam, qid: string): string { const l = locate(exam, qid); if (!l) return "سؤال"; const q = exam.sections[l.si].questions[l.qi]; return "السؤال " + (q.displayNumber || String(l.qi + 1)) + " — «" + clip(exam.sections[l.si].title, 40) + "»"; }
function sLabel(exam: StructuredExam, sid: string): string { const i = sectionIndex(exam, sid); return i >= 0 ? "القسم «" + clip(exam.sections[i].title, 60) + "»" : "قسم"; }
const blockTypes = (rc: unknown) => (((rc as Rec | undefined)?.blocks as Rec[] | undefined) ?? []).map(b => String(b.type)).join("، ") || "—";
const hasHidden = (q: Rec) => [q, ...compositeParts(q)].some(n => Array.isArray((n.answer as Rec | undefined)?.hiddenTests) && ((n.answer as Rec).hiddenTests as unknown[]).length > 0);

/** Teacher-readable diff of a patch against the exam it targets (no colour needed: every change is a labelled before → after). */
export function buildPatchDiff(exam: StructuredExam, patch: AiExamPatchV1): DiffEntry[] {
  const groups = patchGroups(patch);
  const groupOf = (i: number) => groups.findIndex(g => g.includes(i));
  return patch.operations.map((o, index) => {
    const e: DiffEntry = { index, group: groupOf(index), op: o.op, target: "", changes: [], warnings: [], reason: o.reason };
    const cur = "questionId" in o ? (() => { const l = locate(exam, o.questionId); return l ? (exam.sections[l.si].questions[l.qi] as unknown as Rec) : undefined; })() : undefined;
    switch (o.op) {
      case "updatePresentation": e.target = "تصميم الامتحان"; e.changes.push({ field: "قالب العرض", before: String((exam.presentation as Rec | undefined)?.preset ?? "الافتراضي"), after: o.preset }); if (o.tableVariant) e.changes.push({ field: "شكل الجداول", before: String((((exam.presentation as Rec | undefined)?.components as Rec | undefined)?.table as Rec | undefined)?.variant ?? "—"), after: o.tableVariant }); break;
      case "updateQuestionText": e.target = qLabel(exam, o.questionId); e.changes.push({ field: "النص", before: clip(cur?.text), after: clip(o.text) }); if (cur?.richContent !== undefined) e.warnings.push("للسؤال محتوى منسق يراه الطالب؛ تغيّر النص العادي فقط."); break;
      case "updateQuestionRichContent": e.target = qLabel(exam, o.questionId); e.changes.push({ field: "المحتوى المنسق (" + (o.mode === "replace" ? "استبدال" : o.mode === "prepend" ? "إضافة في البداية" : "إضافة في النهاية") + ")", before: blockTypes(cur?.richContent), after: blockTypes(o.richContent) }); break;
      case "updateQuestionPresentation": e.target = qLabel(exam, o.questionId); e.changes.push({ field: "شكل السؤال", before: String((cur?.presentation as Rec | undefined)?.variant ?? "—"), after: o.variant }); break;
      case "updateQuestionMarks": e.target = qLabel(exam, o.questionId); e.changes.push({ field: "العلامة", before: String(cur?.marks ?? ""), after: String(o.marks) }); break;
      case "replaceQuestion": {
        e.target = qLabel(exam, o.questionId);
        e.changes.push({ field: "النوع", before: TYPE_LABEL(cur?.presentationType), after: TYPE_LABEL(o.question.presentationType) });
        if (Number(cur?.marks) !== Number(o.question.marks)) e.changes.push({ field: "العلامة", before: String(cur?.marks ?? ""), after: String(o.question.marks) });
        e.changes.push({ field: "النص", before: clip(cur?.text), after: clip(o.question.text) });
        e.warnings.push("سيُستبدل السؤال كاملًا بما فيه مفتاح الإجابة.");
        if (cur && hasHidden(cur)) e.warnings.push("سيُحذف ما في السؤال الحالي من اختبارات مخفية (السؤال الجديد يُصحَّح يدويًا حتى تضيف اختبارات وتتحقق منها).");
        const sim = (o.question as unknown as Rec).smartSim as Rec | undefined ?? (((o.question as unknown as Rec).composite as Rec | undefined)?.contexts as Rec[] | undefined)?.[0]?.smartSim as Rec | undefined;
        if (sim) e.changes.push({ field: "المحاكي", before: "—", after: String(sim.pluginKey) + "@" + String(sim.pluginVersion) });
        break;
      }
      case "addQuestion": e.target = sLabel(exam, o.sectionId); e.changes.push({ field: "سؤال جديد", before: "—", after: TYPE_LABEL(o.question.presentationType) + " · " + o.question.marks + " علامة · " + clip(o.question.text, 100) }); break;
      case "removeQuestion": e.target = qLabel(exam, o.questionId); e.changes.push({ field: "حذف سؤال", before: TYPE_LABEL(cur?.presentationType) + " · " + String(cur?.marks ?? "") + " علامة", after: "—" }); if (cur && hasHidden(cur)) e.warnings.push("السؤال المحذوف يحتوي اختبارات مخفية."); break;
      case "moveQuestion": e.target = qLabel(exam, o.questionId); e.changes.push({ field: "الموضع", before: "الحالي", after: sLabel(exam, o.sectionId) + (o.position !== null ? " · الموضع " + (o.position + 1) : "") }); break;
      case "addSection": e.target = "قسم جديد"; e.changes.push({ field: "قسم جديد", before: "—", after: "«" + o.section.title + "» · " + o.section.questions.length + " أسئلة · " + o.section.questions.reduce((n, q) => n + (Number(q.marks) || 0), 0) + " علامة" }); break;
      case "updateSection": e.target = sLabel(exam, o.sectionId); { const s = exam.sections[sectionIndex(exam, o.sectionId)]; if (o.title !== null) e.changes.push({ field: "العنوان", before: clip(s?.title), after: o.title }); if (o.instructions !== null) e.changes.push({ field: "التعليمات", before: clip(s?.instructions), after: clip(o.instructions) }); } break;
      case "removeSection": e.target = sLabel(exam, o.sectionId); e.changes.push({ field: "حذف قسم", before: String(exam.sections[sectionIndex(exam, o.sectionId)]?.questions.length ?? 0) + " أسئلة", after: "—" }); break;
      case "moveSection": e.target = sLabel(exam, o.sectionId); e.changes.push({ field: "الموضع", before: String(sectionIndex(exam, o.sectionId) + 1), after: String(o.position + 1) }); break;
      case "updateCompositePartText": e.target = qLabel(exam, o.questionId) + " · البند " + o.partId; e.changes.push({ field: "نص البند", before: clip(compositeParts(cur ?? {}).find(x => x.id === o.partId)?.text), after: clip(o.text) }); break;
      case "removeCompositePart": e.target = qLabel(exam, o.questionId) + " · البند " + o.partId; e.changes.push({ field: "حذف بند", before: String(compositeParts(cur ?? {}).find(x => x.id === o.partId)?.type ?? ""), after: "—" }); e.warnings.push("تُعاد حساب علامة السؤال المركّب من بنوده المتبقية."); break;
    }
    return e;
  });
}

function recomputeCompositeMarks(q: Rec): Rec {
  const c = q.composite as Rec;
  const groups = ((c.groups as Rec[]) ?? []).filter(g => Array.isArray(g.parts) && (g.parts as Rec[]).length > 0).map(g => {
    if (g.gradingPolicy !== "firstNAnswered") return g;
    const parts = g.parts as Rec[];
    const req = Math.min(Number(g.requiredAnswers) || 1, parts.length);
    return { ...g, requiredAnswers: req, maxMarks: req * (Number(parts[0].marks) || 0) };
  });
  const marks = groups.reduce((n, g) => n + (g.gradingPolicy === "firstNAnswered" ? Number(g.maxMarks) || 0 : (g.parts as Rec[]).reduce((t, p) => t + (Number(p.marks) || 0), 0)), 0);
  return { ...q, marks, composite: { ...c, groups } };
}

/** 21A.1 — AI chart ids are positional within the generated blocks ("chart1", …); merged into an existing document (prepend / append) a
 *  colliding id is renumbered past every chart id the document already uses (rich chart ids are unique per document). */
function renumberCharts(incoming: readonly unknown[], existing: readonly unknown[]): unknown[] {
  const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
  const idOf = (b: unknown) => (isRec(b) && b.type === "dataChart" && isRec(b.chart) && typeof b.chart.id === "string" ? b.chart.id : undefined);
  const taken = new Set(existing.map(idOf).filter((x): x is string => x !== undefined));
  return incoming.map(b => {
    const id = idOf(b);
    if (id === undefined) return b;
    if (!taken.has(id)) { taken.add(id); return b; }
    let n = 1;
    while (taken.has("chart" + n)) n++;
    taken.add("chart" + n);
    return { ...(b as Rec), chart: { ...((b as Rec).chart as Rec), id: "chart" + n } };
  });
}

function applyOne(exam: StructuredExam, o: NormOp): StructuredExam {
  const x: StructuredExam = { ...exam, sections: exam.sections.map(s => ({ ...s, questions: [...s.questions] })) };
  const setQ = (qid: string, fn: (q: Rec) => Rec) => { const l = locate(x, qid); if (!l) throw new Error("PATCH_TARGET_MISSING"); x.sections[l.si].questions[l.qi] = fn({ ...(x.sections[l.si].questions[l.qi] as unknown as Rec) }) as unknown as BuilderQuestion; };
  switch (o.op) {
    case "updatePresentation": {
      const prev = (x.presentation as Rec | undefined) ?? {};
      const next: Rec = { ...prev, schemaVersion: 1, preset: o.preset };
      if (o.tableVariant) next.components = { ...((prev.components as Rec | undefined) ?? {}), table: { variant: o.tableVariant } };
      x.presentation = next as never; return x;
    }
    case "updateQuestionText": setQ(o.questionId, q => ({ ...q, text: o.text })); return x;
    case "updateQuestionRichContent": setQ(o.questionId, q => {
      const prevBlocks = (((q.richContent as Rec | undefined)?.blocks as unknown[]) ?? []);
      const nb = o.richContent ? o.richContent.blocks : [];
      const add = o.mode === "replace" ? nb : renumberCharts(nb, prevBlocks);
      const blocks = o.mode === "replace" ? nb : o.mode === "prepend" ? [...add, ...prevBlocks] : [...prevBlocks, ...add];
      const out = { ...q };
      if (blocks.length) out.richContent = { schemaVersion: 1, blocks }; else delete out.richContent;
      return out;
    }); return x;
    case "updateQuestionPresentation": setQ(o.questionId, q => ({ ...q, presentation: { ...((q.presentation as Rec | undefined) ?? {}), schemaVersion: 1, variant: o.variant } })); return x;
    case "updateQuestionMarks": setQ(o.questionId, q => ({ ...q, marks: o.marks })); return x;
    case "replaceQuestion": setQ(o.questionId, q => ({ ...(o.question as unknown as Rec), examQuestionId: q.examQuestionId, ...(q.displayNumber !== undefined ? { displayNumber: q.displayNumber } : {}) })); return x;
    case "addQuestion": { const si = sectionIndex(x, o.sectionId); const qs = x.sections[si].questions; const at = o.position === null ? qs.length : Math.min(o.position, qs.length); qs.splice(at, 0, o.question); return x; }
    case "removeQuestion": { const l = locate(x, o.questionId)!; x.sections[l.si].questions.splice(l.qi, 1); return x; }
    case "moveQuestion": { const l = locate(x, o.questionId)!; const [q] = x.sections[l.si].questions.splice(l.qi, 1); const si = sectionIndex(x, o.sectionId); const qs = x.sections[si].questions; qs.splice(o.position === null ? qs.length : Math.min(o.position, qs.length), 0, q); return x; }
    case "addSection": { const at = o.position === null ? x.sections.length : Math.min(o.position, x.sections.length); x.sections.splice(at, 0, { ...o.section, questions: [...o.section.questions] }); return x; }
    case "updateSection": { const si = sectionIndex(x, o.sectionId); const s = { ...x.sections[si] }; if (o.title !== null) s.title = o.title; if (o.instructions !== null) { if (o.instructions) s.instructions = o.instructions; else delete s.instructions; } x.sections[si] = s; return x; }
    case "removeSection": x.sections.splice(sectionIndex(x, o.sectionId), 1); return x;
    case "moveSection": { const si = sectionIndex(x, o.sectionId); const [s] = x.sections.splice(si, 1); x.sections.splice(Math.min(o.position, x.sections.length), 0, s); return x; }
    case "updateCompositePartText": setQ(o.questionId, q => ({ ...q, composite: { ...(q.composite as Rec), groups: (((q.composite as Rec).groups as Rec[]) ?? []).map(g => ({ ...g, parts: ((g.parts as Rec[]) ?? []).map(p => (p.id === o.partId ? { ...p, text: o.text } : p)) })) } })); return x;
    case "removeCompositePart": setQ(o.questionId, q => recomputeCompositeMarks({ ...q, composite: { ...(q.composite as Rec), groups: (((q.composite as Rec).groups as Rec[]) ?? []).map(g => ({ ...g, parts: ((g.parts as Rec[]) ?? []).filter(p => p.id !== o.partId) })) } })); return x;
  }
}

const issueKey = (i: ComposerIssue) => i.code + "|" + (i.questionId ?? "") + "|" + (i.sectionId ?? "");
export type ApplyResult = { ok: true; exam: StructuredExam; applied: number[]; diff: DiffEntry[] } | { ok: false; code: "STALE_REVISION" | "PATCH_INVALID" | "PATCH_NEW_BLOCKING"; issues: ComposerIssue[] };
/** Pure apply: base revision must match; the selection is widened to whole groups; the result must not add a blocking issue. */
export function applyComposerPatch(exam: StructuredExam, patch: AiExamPatchV1, opts: { selected?: readonly number[] | null; now: string; request: string }): ApplyResult {
  if (!isPatchShape(patch)) return { ok: false, code: "PATCH_INVALID", issues: [{ code: "PATCH_MALFORMED", message: "اقتراح التعديل غير صالح." }] };
  if (examRevision(exam) !== patch.baseRevision) return { ok: false, code: "STALE_REVISION", issues: [{ code: "STALE_REVISION", message: "تم تعديل الامتحان أثناء عمل الذكاء الاصطناعي." }] };
  const groups = patchGroups(patch);
  const wanted = new Set(opts.selected ?? patch.operations.map((_, i) => i));
  const applied = groups.filter(g => g.some(i => wanted.has(i))).flat().sort((a, b) => a - b);
  if (!applied.length) return { ok: false, code: "PATCH_INVALID", issues: [{ code: "PATCH_EMPTY", message: "لم يُحدَّد أي تعديل للتطبيق." }] };
  const before = composerVerdict(exam, { aiQuestionIds: new Set() });
  let next = exam;
  const newIds = new Set<string>();
  const coverage: { questionId: string; topic: string; difficulty: string }[] = [];
  const verifyIssues: ComposerIssue[] = [];
  try {
    for (const i of applied) {
      const o = patch.operations[i];
      if (o.op === "replaceQuestion" || o.op === "addQuestion") { const qid = o.op === "replaceQuestion" ? o.questionId : o.question.examQuestionId; newIds.add(qid); coverage.push({ questionId: qid, topic: o.meta.topic, difficulty: o.meta.difficulty }); verifyIssues.push(...verifyAiQuestion(o.question)); }
      if (o.op === "addSection") for (const q of o.section.questions) { newIds.add(q.examQuestionId); verifyIssues.push(...verifyAiQuestion(q)); }
      if (o.op === "addSection") coverage.push(...o.meta.map(m => ({ questionId: m.questionId, topic: m.topic, difficulty: m.difficulty })));
      next = applyOne(next, o);
    }
  } catch { return { ok: false, code: "PATCH_INVALID", issues: [{ code: "PATCH_TARGET_MISSING", message: "هدف تعديل غير موجود في الامتحان الحالي." }] }; }
  if (verifyIssues.length) return { ok: false, code: "PATCH_INVALID", issues: verifyIssues };
  const ids = allQuestions(next).map(q => q.examQuestionId);
  if (new Set(ids).size !== ids.length) return { ok: false, code: "PATCH_INVALID", issues: [{ code: "DUPLICATE_ID", message: "معرّف سؤال مكرر بعد التعديل." }] };
  const pv = next.presentation === undefined ? null : validatePresentation(next.presentation);
  if (pv && !pv.ok) return { ok: false, code: "PATCH_INVALID", issues: pv.issues.map(i => ({ code: i.code, message: i.message })) };
  for (const q of allQuestions(next)) if ((q as unknown as Rec).presentation !== undefined && !validateQuestionPresentation((q as unknown as Rec).presentation).ok) return { ok: false, code: "PATCH_INVALID", issues: [{ code: "PRESENTATION_INVALID", message: "شكل السؤال غير صالح.", questionId: q.examQuestionId }] };
  const after = composerVerdict(next, { aiQuestionIds: newIds });
  const had = new Set(before.blocking.map(issueKey));
  const introduced = after.blocking.filter(i => !had.has(issueKey(i)));
  if (introduced.length) return { ok: false, code: "PATCH_NEW_BLOCKING", issues: introduced };
  const diff = buildPatchDiff(exam, patch).filter(d => applied.includes(d.index));
  const out = withComposerHistory(next, { at: opts.now, mode: patch.mode, summary: opts.request || patch.summary, baseRevision: patch.baseRevision, status: "applied", operations: applied.length, warnings: after.warnings.length }, coverage);
  return { ok: true, exam: out, applied, diff };
}
