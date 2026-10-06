// Phase 20F — ASSEMBLY of a generated exam and the composer's deterministic VERDICT. The generated exam is a NORMAL structured exam (no
// special "AI format"): sections → questions → the registered type nodes, an optional PresentationV1 preset, and teacher-only composer
// metadata (coverage tags + bounded authoring history, stripped for students). The verdict combines the canonical finalization authority
// (evaluateExamFinalization — the same decision the Builder, the final save and governance use) with composer gates: exact marks against
// the request, exact catalog identities, no SmartSim free credit, the coding hidden-test policy. Diversity / coverage / difficulty are
// WARNINGS (authoring heuristics, never claims of academic proof). The summary and coverage are computed by code from the exam itself.
import { evaluateExamFinalization } from "../examFinalization";
import { sectionMaxMarks, computeTotalMarks } from "../examBuilderState";
import { questionTypeDefinition, supportsQuestionTypeVersion } from "../questionTypeCatalog";
import { verifyAiQuestionNode } from "../aiQuestionDraft";
import { validatePresentation } from "../presentation/presentationModel";
import type { BuilderQuestion, BuilderSection, StructuredExam } from "../examTypes";
import { COMPOSER_LIMITS, type ComposerIssue } from "./composerLimits";
import { COMPOSER_CATALOG_VERSION, COMPOSER_DRAFT_TYPES, COMPOSER_SIM_PLUGINS } from "./composerCatalog";
import type { AiExamIntentV1 } from "./composerIntent";
import type { AiExamPlanV1 } from "./composerPlan";
import type { ComposerItemMeta } from "./composerDraft";
import { simFreeCreditIssues, type SimEnvelope, type SimCheck } from "./composerSim";

type Rec = Record<string, unknown>;
export type ComposerHistoryEntry = { at: string; mode: string; summary: string; baseRevision: string; status: "applied"; operations: number; warnings: number };
export type ComposerMetadata = { v: 1; catalog: string; coverage: { questionId: string; topic: string; difficulty: string }[]; history: ComposerHistoryEntry[] };

/** plan + validated sections → one canonical structured exam (code-owned display numbers; preset + direction from plan / intent). */
export function assembleComposerExam(input: { examId: string; intent: AiExamIntentV1; plan: AiExamPlanV1; sections: BuilderSection[]; meta: ComposerItemMeta[] }): StructuredExam {
  let n = 0;
  const sections = input.sections.map(s => ({ ...s, questions: s.questions.map(q => ({ ...q, displayNumber: String(++n) })) }));
  const presentation = { schemaVersion: 1 as const, preset: input.plan.presentationPreset, direction: input.intent.direction };
  const pv = validatePresentation(presentation);
  const metadata: ComposerMetadata = { v: 1, catalog: COMPOSER_CATALOG_VERSION, coverage: input.meta.map(m => ({ questionId: m.questionId, topic: m.topic, difficulty: m.difficulty })), history: [] };
  return {
    schemaVersion: 2, examId: input.examId, title: input.plan.title, status: "draft",
    ...(pv.ok && pv.value ? { presentation: pv.value } : {}),
    metadata: { aiComposer: metadata },
    sections
  } as StructuredExam;
}

export const composerMetadataOf = (exam: StructuredExam): ComposerMetadata | null => {
  const m = (exam.metadata as Rec | undefined)?.aiComposer as ComposerMetadata | undefined;
  return m && typeof m === "object" && m.v === 1 && Array.isArray(m.coverage) && Array.isArray(m.history) ? m : null;
};
/** Appends one bounded history entry (pure; the caller passes the time). Never stores prompts, reasoning or provider data. */
export function withComposerHistory(exam: StructuredExam, entry: ComposerHistoryEntry, coverage?: ComposerMetadata["coverage"]): StructuredExam {
  const prev = composerMetadataOf(exam) ?? { v: 1 as const, catalog: COMPOSER_CATALOG_VERSION, coverage: [], history: [] };
  const summary = entry.summary.slice(0, COMPOSER_LIMITS.historySummaryChars);
  const ids = new Set(allQuestions(exam).map(q => q.examQuestionId));
  const mergedCoverage = [...prev.coverage.filter(c => ids.has(c.questionId) && !(coverage ?? []).some(x => x.questionId === c.questionId)), ...(coverage ?? [])];
  const next: ComposerMetadata = { v: 1, catalog: COMPOSER_CATALOG_VERSION, coverage: mergedCoverage, history: [...prev.history, { ...entry, summary }].slice(-COMPOSER_LIMITS.historyEntries) };
  return { ...exam, metadata: { ...(exam.metadata as Rec | undefined), aiComposer: next } };
}

export const allQuestions = (exam: StructuredExam): BuilderQuestion[] => (exam.sections || []).flatMap(s => s.questions || []);
const partsOf = (q: BuilderQuestion): Rec[] => {
  const c = (q as unknown as Rec).composite as Rec | undefined;
  return c && Array.isArray(c.groups) ? (c.groups as Rec[]).flatMap(g => (Array.isArray(g.parts) ? (g.parts as Rec[]) : [])) : [];
};

// ── grading mode per node (summary: automatic vs manual-review marks) ──────────────────────────────────────────────────────────────────
function isManual(type: string, node: Rec): boolean {
  const def = questionTypeDefinition(type);
  if (!def) return true;
  if (type === "coding") return ((node.answer as Rec | undefined)?.gradingMode) !== "hiddenTests";
  if (type === "shortAnswer") { const t = (node.answer as Rec | undefined)?.text; return !(typeof t === "string" && t.trim()); }
  return def.gradingMode === "manual";
}
function marksSplit(q: BuilderQuestion): { auto: number; manual: number } {
  if (q.presentationType !== "composite") return isManual(q.presentationType, q as unknown as Rec) ? { auto: 0, manual: Number(q.marks) || 0 } : { auto: Number(q.marks) || 0, manual: 0 };
  const groups = (((q as unknown as Rec).composite as Rec | undefined)?.groups as Rec[] | undefined) ?? [];
  let auto = 0, manual = 0;
  for (const g of groups) {
    const parts = (g.parts as Rec[]) ?? [];
    const sum = parts.reduce((n, p) => n + (Number(p.marks) || 0), 0);
    const scale = g.gradingPolicy === "firstNAnswered" && sum > 0 ? (Number(g.maxMarks) || 0) / sum : 1;
    for (const p of parts) { const m = (Number(p.marks) || 0) * scale; if (isManual(String(p.type), p)) manual += m; else auto += m; }
  }
  return { auto, manual };
}

export type ComposerSummary = {
  totalMarks: number; requestedMarks: number | null; sections: number; questions: number; typeMix: Record<string, number>;
  automaticMarks: number; manualMarks: number; composite: number; smartSim: number; coding: number; parametric: number; openResponse: number;
  richTables: number; presentation: string | null; blocking: number; warnings: number;
};
export type ComposerVerdict = { ok: boolean; blocking: ComposerIssue[]; warnings: ComposerIssue[]; summary: ComposerSummary; coverage: { topic: string; marks: number; questions: number }[] };

const SIM_ALLOWED = new Set(COMPOSER_SIM_PLUGINS.map(p => p.pluginKey + "@" + p.pluginVersion));
const normStem = (t: unknown) => String(t ?? "").replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim().toLowerCase();
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Composer gates on the questions an AI produced (`aiQuestionIds`; all questions of a generated exam). */
function aiQuestionIssues(q: BuilderQuestion): ComposerIssue[] {
  const out: ComposerIssue[] = [];
  const qid = q.examQuestionId;
  const node = q as unknown as Rec;
  const ident = (type: string, version: unknown, where: string) => {
    if (!questionTypeDefinition(type) || !supportsQuestionTypeVersion(type, version ?? 1)) out.push({ code: "COMPOSER_UNSUPPORTED_TYPE", message: "نوع / إصدار غير مدعوم: " + type + "@" + String(version ?? 1) + " (" + where + ").", questionId: qid });
  };
  ident(q.presentationType, q.questionTypeVersion, "السؤال");
  const sim = (env: unknown, checks: unknown, where: string) => {
    const e = env as Rec | undefined;
    if (!e || !SIM_ALLOWED.has(String(e.pluginKey) + "@" + String(e.pluginVersion))) { out.push({ code: "COMPOSER_SIM_NOT_ALLOWED", message: "المحاكي غير مسموح للمؤلف الآلي (" + where + ").", questionId: qid }); return; }
    if (Array.isArray(checks)) out.push(...simFreeCreditIssues(e as unknown as SimEnvelope, checks as SimCheck[], where).map(i => ({ ...i, questionId: qid })));
  };
  const coding = (n: Rec, where: string) => {
    const a = (n.answer as Rec | undefined) ?? {};
    if ((Array.isArray(a.hiddenTests) && a.hiddenTests.length) || a.gradingMode === "hiddenTests" || (a.referenceSolutions && typeof a.referenceSolutions === "object" && Object.keys(a.referenceSolutions as object).length))
      out.push({ code: "AI_CODING_TRUSTED_MATERIAL_FORBIDDEN", message: "سؤال البرمجة المؤلف آليًا لا يحمل اختبارات مخفية أو حلولًا مرجعية (" + where + ").", questionId: qid });
  };
  if (q.presentationType === "smartSim") sim(node.smartSim, (node.answer as Rec | undefined)?.checks, "السؤال");
  if (q.presentationType === "coding") coding(node, "السؤال");
  if (q.presentationType === "composite") {
    const ctx = (((node.composite as Rec | undefined)?.contexts as Rec[] | undefined) ?? []);
    for (const p of partsOf(q)) {
      ident(String(p.type), p.questionTypeVersion, "البند " + String(p.id));
      if (p.type === "coding") coding(p, "البند " + String(p.id));
      if (p.type === "smartSim") { const c = ctx.find(x => x.id === p.contextId); sim(c?.smartSim ?? p.smartSim, (p.answer as Rec | undefined)?.checks, "البند " + String(p.id)); }
    }
    if (partsOf(q).some(p => p.type === "composite")) out.push({ code: "COMPOSITE_NESTED", message: "لا يُسمح بسؤال مركّب داخل سؤال مركّب.", questionId: qid });
  }
  return out;
}

export type VerdictOptions = { intent?: AiExamIntentV1 | null; plan?: AiExamPlanV1 | null; aiQuestionIds?: ReadonlySet<string> | null };
/** The composer verdict on a whole exam: canonical finalization + composer gates (blocking) + heuristics (warnings) + summary + coverage. */
export function composerVerdict(exam: StructuredExam, opts: VerdictOptions = {}): ComposerVerdict {
  const blocking: ComposerIssue[] = [], warnings: ComposerIssue[] = [];
  const fin = evaluateExamFinalization(exam);
  for (const i of fin.structuralErrors) {
    const issue = { code: i.code, message: i.message, ...(i.sectionId ? { sectionId: String(i.sectionId) } : {}), ...(i.questionId ? { questionId: String(i.questionId) } : {}) };
    if (i.code === "AI_ASSET_REQUEST_UNRESOLVED") warnings.push(issue); else blocking.push(issue);
  }
  for (const i of fin.structuralWarnings) warnings.push({ code: i.code, message: i.message, ...(i.questionId ? { questionId: String(i.questionId) } : {}) });
  const qs = allQuestions(exam);
  const ai = opts.aiQuestionIds ?? new Set(qs.map(q => q.examQuestionId));
  for (const q of qs) if (ai.has(q.examQuestionId)) blocking.push(...aiQuestionIssues(q));
  const total = computeTotalMarks(exam);
  if (opts.intent && Math.abs(total - opts.intent.totalMarks) > 1e-9) blocking.push({ code: "COMPOSER_TOTAL_MISMATCH", message: "مجموع علامات الامتحان " + r2(total) + " والمطلوب " + opts.intent.totalMarks + "." });
  if (opts.plan) {
    if (opts.plan.sections.length !== (exam.sections || []).length) blocking.push({ code: "COMPOSER_PLAN_DRIFT", message: "عدد أقسام الامتحان لا يطابق الخطة." });
    else (exam.sections || []).forEach((s, i) => { const m = sectionMaxMarks(s); if (Math.abs(m - opts.plan!.sections[i].marks) > 1e-9) blocking.push({ code: "COMPOSER_SECTION_MARKS_MISMATCH", message: "علامة القسم «" + s.title + "» " + r2(m) + " والخطة " + opts.plan!.sections[i].marks + ".", sectionId: s.id }); });
  }
  // ── heuristics (warnings): diversity, duplicates, coverage ──
  const typeMix: Record<string, number> = {};
  for (const q of qs) typeMix[q.presentationType] = (typeMix[q.presentationType] ?? 0) + 1;
  let run = 1;
  for (let i = 1; i < qs.length; i++) { run = qs[i].presentationType === qs[i - 1].presentationType ? run + 1 : 1; if (run === 5) warnings.push({ code: "COMPOSER_DIVERSITY_RUN", message: "خمسة أسئلة متتالية أو أكثر من النوع نفسه (" + qs[i].presentationType + ").", questionId: qs[i].examQuestionId }); }
  if (qs.length >= 6 && !(opts.intent?.allowedQuestionTypes && opts.intent.allowedQuestionTypes.length === 1)) for (const [t, c] of Object.entries(typeMix)) if (c / qs.length > 0.7) warnings.push({ code: "COMPOSER_DIVERSITY_TYPE", message: "نسبة كبيرة من الأسئلة من نوع واحد (" + t + ": " + c + " من " + qs.length + ")." });
  const seen = new Map<string, string>();
  for (const q of qs) {
    const k = normStem(q.text);
    if (k.length >= 12) { const prev = seen.get(k); if (prev) warnings.push({ code: "COMPOSER_DUPLICATE_STEM", message: "نص سؤال مكرر.", questionId: q.examQuestionId }); else seen.set(k, q.examQuestionId); }
    const opts2 = Array.isArray(q.options) ? q.options.map(o => normStem((o as Rec).text)) : [];
    if (opts2.length && new Set(opts2).size !== opts2.length) warnings.push({ code: "COMPOSER_DUPLICATE_OPTIONS", message: "خيارات متطابقة في السؤال نفسه.", questionId: q.examQuestionId });
  }
  const meta = composerMetadataOf(exam);
  const marksOf = new Map(qs.map(q => [q.examQuestionId, Number(q.marks) || 0]));
  const cov = new Map<string, { topic: string; marks: number; questions: number }>();
  for (const q of qs) {
    const t = meta?.coverage.find(c => c.questionId === q.examQuestionId)?.topic || "غير مصنّف";
    const e = cov.get(t) ?? { topic: t, marks: 0, questions: 0 };
    e.marks += marksOf.get(q.examQuestionId) ?? 0; e.questions += 1; cov.set(t, e);
  }
  const coverage = [...cov.values()].map(c => ({ ...c, marks: r2(c.marks) })).sort((a, b) => b.marks - a.marks || a.topic.localeCompare(b.topic));
  if (opts.intent) for (const t of opts.intent.requiredTopics) if (!coverage.some(c => c.topic.toLowerCase().includes(t.toLowerCase())) && !qs.some(q => String(q.text).toLowerCase().includes(t.toLowerCase()))) warnings.push({ code: "COMPOSER_TOPIC_UNCOVERED", message: "الموضوع المطلوب «" + t + "» غير مغطّى في الأسئلة." });
  let automaticMarks = 0, manualMarks = 0;
  for (const q of qs) { const m = marksSplit(q); automaticMarks += m.auto; manualMarks += m.manual; }
  const count = (t: string) => qs.filter(q => q.presentationType === t).length + qs.flatMap(partsOf).filter(p => p.type === t).length;
  const richTables = qs.reduce((n, q) => n + ((((q as unknown as Rec).richContent as Rec | undefined)?.blocks as Rec[] | undefined) ?? []).filter(b => b.type === "table").length, 0);
  const summary: ComposerSummary = {
    totalMarks: r2(total), requestedMarks: opts.intent?.totalMarks ?? null, sections: (exam.sections || []).length, questions: qs.length, typeMix,
    automaticMarks: r2(automaticMarks), manualMarks: r2(manualMarks), composite: count("composite"), smartSim: count("smartSim"), coding: count("coding"),
    parametric: count("parametricNumeric"), openResponse: count("openResponse"), richTables,
    presentation: ((exam.presentation as Rec | undefined)?.preset as string | undefined) ?? null, blocking: blocking.length, warnings: warnings.length
  };
  return { ok: blocking.length === 0, blocking, warnings, summary, coverage };
}

const UNVERSIONED_19A = new Set(["multipleChoice", "trueFalse", "shortAnswer", "fillBlank", "tableFill"]);
/** The 19A node re-verification of an AI-produced question of a draft family (node key allow-list + coding hidden-test policy), so the
 *  client never trusts a staged draft the server returned. Composite children of draft families are verified the same way. */
export function verifyAiQuestion(q: BuilderQuestion): ComposerIssue[] {
  const one = (node: Rec, type: string, where: string): ComposerIssue[] => {
    if (!(COMPOSER_DRAFT_TYPES as readonly string[]).includes(type)) return [];
    const { richContent: _r, assetRequest: _a, displayNumber: _d, id: _i, label: _l, contextId: _c, type: _t, ...rest } = node;
    void _r; void _a; void _d; void _i; void _l; void _c; void _t;
    // a composite child always carries questionTypeVersion; the 19A node of a single-version legacy family has none (absent = 1)
    if (UNVERSIONED_19A.has(type) && rest.questionTypeVersion === 1) delete rest.questionTypeVersion;
    const v = verifyAiQuestionNode({ ...rest, presentationType: type, examQuestionId: "ai-draft" });
    return v.ok ? [] : v.issues.map(i => ({ code: v.code, message: where + ": " + i.message, questionId: q.examQuestionId }));
  };
  if (q.presentationType === "composite") return partsOf(q).flatMap(p => one(p, String(p.type), "البند " + String(p.id)));
  return one(q as unknown as Rec, q.presentationType, "السؤال");
}
/** Client-side re-verification of a whole staged generated exam: plan + verdict + every AI node. */
export function verifyGeneratedExam(exam: StructuredExam, intent: AiExamIntentV1, plan: AiExamPlanV1): ComposerVerdict {
  const v = composerVerdict(exam, { intent, plan });
  const extra = allQuestions(exam).flatMap(verifyAiQuestion);
  return extra.length ? { ...v, ok: false, blocking: [...v.blocking, ...extra], summary: { ...v.summary, blocking: v.blocking.length + extra.length } } : v;
}
