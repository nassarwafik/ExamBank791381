// Phase 20F — AiExamPlanV1: the exam PLAN the model proposes BEFORE any question exists (title, goals, sections with marks and topics,
// the ordered item list with kind / topic / difficulty / marks, planned simulator use, the preset, unsupported requests). The plan is not
// the exam: it must pass deterministic constraints first — the MARKS ARITHMETIC is code-owned (Σ sections = the requested total exactly,
// Σ items = the section marks, every mark a positive integer), kinds come only from the intent's allowed set, simulators only from the
// catalog, the structured constraints win over the free text. A violating plan is refused with structured issues (bounded AI repair),
// never "fixed" by guessing the teacher's intent.
import { COMPOSER_LIMITS, type ComposerIssue } from "./composerLimits";
import { COMPOSER_ITEM_KINDS, COMPOSER_NET_SCENARIOS, COMPOSER_PRESETS, COMPOSER_SIM_PLUGIN_KEYS, type ComposerItemKind, type ComposerSimPluginKey } from "./composerCatalog";
import { intentAllowedKinds, type AiExamIntentV1 } from "./composerIntent";
import { cleanText, hasExactKeys, isArr, isEnum, isInt, isStr, sArr, sEnum, sInt, sNull, sObj, sStr, type JsonSchema } from "./composerSchemaKit";

export const PLAN_DIFFICULTIES = Object.freeze(["easy", "medium", "hard"] as const);
export type PlanDifficulty = (typeof PLAN_DIFFICULTIES)[number];
export type AiExamPlanItem = { key: string; kind: ComposerItemKind; topic: string; difficulty: PlanDifficulty; marks: number; simulator: ComposerSimPluginKey | null; scenario: string | null; note: string };
export type AiExamPlanSection = { key: string; title: string; instructions: string; marks: number; topics: string[]; items: AiExamPlanItem[] };
export type AiExamPlanV1 = { v: 1; title: string; learningGoals: string[]; presentationPreset: string; coverageNote: string; sections: AiExamPlanSection[]; unsupportedRequests: { capability: string; alternative: string }[] };
const L = COMPOSER_LIMITS;

const PLAN_ITEM = sObj({ kind: sEnum(COMPOSER_ITEM_KINDS), topic: sStr(), difficulty: sEnum(PLAN_DIFFICULTIES), marks: sInt(1, L.itemMarksMax), simulator: sNull(sEnum(COMPOSER_SIM_PLUGIN_KEYS)), scenario: sNull(sEnum(COMPOSER_NET_SCENARIOS)), note: sStr() });
const PLAN_SECTION = sObj({ title: sStr(), instructions: sStr(), marks: sInt(1, L.totalMarksMax), topics: sArr(sStr(), 8), items: sArr(PLAN_ITEM, L.itemsPerSection) });
/** The strict provider schema of the plan stage. */
export function buildPlanSchema(): JsonSchema {
  return sObj({
    title: sStr(), learningGoals: sArr(sStr(), L.learningGoals), presentationPreset: sEnum(COMPOSER_PRESETS as readonly string[]), coverageNote: sStr(),
    sections: sArr(PLAN_SECTION, L.sections), unsupportedRequests: sArr(sObj({ capability: sStr(), alternative: sStr() }), L.unsupportedRequests)
  });
}

const ITEM_KEYS = ["kind", "topic", "difficulty", "marks", "simulator", "scenario", "note"] as const;
const SECTION_KEYS = ["title", "instructions", "marks", "topics", "items"] as const;
const PLAN_KEYS = ["title", "learningGoals", "presentationPreset", "coverageNote", "sections", "unsupportedRequests"] as const;

/** Shape-normalizes a plan (provider output OR a plan echoed back by the client — both untrusted). No intent rules here. */
export function normalizePlanShape(raw: unknown): { ok: true; plan: AiExamPlanV1 } | { ok: false; issues: ComposerIssue[] } {
  const malformed = (path: string): { ok: false; issues: ComposerIssue[] } => ({ ok: false, issues: [{ code: "PLAN_MALFORMED", message: "خطة الامتحان المقترحة غير صالحة البنية.", path }] });
  if (!hasExactKeys(raw, PLAN_KEYS)) return malformed("$");
  if (!isStr(raw.title, L.titleChars, 1) || !isArr(raw.learningGoals, L.learningGoals) || !raw.learningGoals.every(g => isStr(g, L.goalChars)) || !isStr(raw.coverageNote, L.goalChars * 2)) return malformed("$.title");
  if (!isEnum(raw.presentationPreset, COMPOSER_PRESETS as readonly string[])) return malformed("$.presentationPreset");
  if (!isArr(raw.sections, L.sections) || !raw.sections.length) return malformed("$.sections");
  if (!isArr(raw.unsupportedRequests, L.unsupportedRequests) || !raw.unsupportedRequests.every(u => hasExactKeys(u, ["capability", "alternative"]) && isStr(u.capability, L.shortText) && isStr(u.alternative, L.goalChars))) return malformed("$.unsupportedRequests");
  const sections: AiExamPlanSection[] = [];
  for (let si = 0; si < raw.sections.length; si++) {
    const s = raw.sections[si];
    const sp = "$.sections[" + si + "]";
    if (!hasExactKeys(s, SECTION_KEYS) || !isStr(s.title, L.titleChars, 1) || !isStr(s.instructions, L.goalChars * 4) || !isInt(s.marks, 1, L.totalMarksMax) || !isArr(s.topics, 8) || !s.topics.every(t => isStr(t, L.topicChars)) || !isArr(s.items, L.itemsPerSection) || !s.items.length) return malformed(sp);
    const items: AiExamPlanItem[] = [];
    for (let ii = 0; ii < s.items.length; ii++) {
      const it = s.items[ii];
      if (!hasExactKeys(it, ITEM_KEYS) || !isEnum(it.kind, COMPOSER_ITEM_KINDS) || !isStr(it.topic, L.topicChars) || !isEnum(it.difficulty, PLAN_DIFFICULTIES) || !isInt(it.marks, 1, L.itemMarksMax) || !isStr(it.note, L.rationaleChars)) return malformed(sp + ".items[" + ii + "]");
      if (it.simulator !== null && !isEnum(it.simulator, COMPOSER_SIM_PLUGIN_KEYS)) return malformed(sp + ".items[" + ii + "].simulator");
      if (it.scenario !== null && !isEnum(it.scenario, COMPOSER_NET_SCENARIOS)) return malformed(sp + ".items[" + ii + "].scenario");
      items.push({ key: "S" + (si + 1) + "-" + (ii + 1), kind: it.kind, topic: cleanText(it.topic), difficulty: it.difficulty, marks: it.marks, simulator: it.simulator as ComposerSimPluginKey | null, scenario: it.scenario as string | null, note: cleanText(it.note) });
    }
    sections.push({ key: "S" + (si + 1), title: cleanText(s.title), instructions: cleanText(s.instructions), marks: s.marks, topics: (s.topics as string[]).map(cleanText).filter(Boolean), items });
  }
  return { ok: true, plan: { v: 1, title: cleanText(raw.title), learningGoals: (raw.learningGoals as string[]).map(cleanText).filter(Boolean), presentationPreset: raw.presentationPreset, coverageNote: cleanText(raw.coverageNote), sections, unsupportedRequests: (raw.unsupportedRequests as { capability: string; alternative: string }[]).map(u => ({ capability: cleanText(u.capability), alternative: cleanText(u.alternative) })) } };
}

export type PlanValidation = { blocking: ComposerIssue[]; warnings: ComposerIssue[]; plan: AiExamPlanV1 };
/** The deterministic plan gate against the intent. Code-owned arithmetic; the structured preset wins (overridden + warned). */
export function validatePlan(plan: AiExamPlanV1, intent: AiExamIntentV1): PlanValidation {
  const blocking: ComposerIssue[] = [], warnings: ComposerIssue[] = [];
  const allowed = new Set(intentAllowedKinds(intent));
  const out: AiExamPlanV1 = { ...plan, sections: plan.sections.map(s => ({ ...s, items: s.items.map(i => ({ ...i })) })) };
  if (intent.presentationPreset && out.presentationPreset !== intent.presentationPreset) {
    warnings.push({ code: "PLAN_PRESET_OVERRIDDEN", message: "اعتُمد قالب العرض الذي حدده المعلم (" + intent.presentationPreset + ") بدل اقتراح الذكاء الاصطناعي." });
    out.presentationPreset = intent.presentationPreset;
  }
  if (intent.sectionTarget !== null && out.sections.length !== intent.sectionTarget) blocking.push({ code: "PLAN_SECTION_COUNT", message: "عدد الأقسام " + out.sections.length + " ويجب أن يكون " + intent.sectionTarget + "." });
  const total = out.sections.reduce((n, s) => n + s.marks, 0);
  if (total !== intent.totalMarks) blocking.push({ code: "PLAN_TOTAL_MISMATCH", message: "مجموع علامات الأقسام " + total + " ويجب أن يساوي " + intent.totalMarks + " تمامًا." });
  let items = 0;
  const excluded = intent.excludedTopics.map(t => t.toLowerCase());
  for (const s of out.sections) {
    const sum = s.items.reduce((n, i) => n + i.marks, 0);
    if (sum !== s.marks) blocking.push({ code: "PLAN_SECTION_MARKS_MISMATCH", message: "مجموع علامات بنود القسم «" + s.title + "» " + sum + " وعلامة القسم " + s.marks + ".", path: s.key });
    const fnSims = s.items.filter(i => i.simulator === "functionStudy2d").length;   // a section draft may carry at most this many (bounded probes)
    if (fnSims > COMPOSER_LIMITS.functionSims) blocking.push({ code: "PLAN_FUNCTION_SIM_LIMIT", message: "القسم «" + s.title + "» يحوي " + fnSims + " محاكاة دراسة دالة؛ الحد الأقصى " + COMPOSER_LIMITS.functionSims + " في القسم الواحد.", path: s.key });
    for (const i of s.items) {
      items++;
      if (!allowed.has(i.kind)) blocking.push({ code: "PLAN_KIND_NOT_ALLOWED", message: "نوع البند «" + i.kind + "» غير مسموح بحسب خيارات المعلم.", path: i.key });
      if (i.kind === "smartSim" && !i.simulator) blocking.push({ code: "PLAN_SIMULATOR_REQUIRED", message: "بند المحاكاة يحتاج إلى محاكٍ مسجّل.", path: i.key });
      if (i.kind !== "smartSim" && i.kind !== "composite" && i.simulator) blocking.push({ code: "PLAN_SIMULATOR_UNEXPECTED", message: "المحاكي يُستخدم فقط في بنود SmartSim أو المركّب.", path: i.key });
      if (i.simulator === "networkTopology" && !i.scenario) blocking.push({ code: "PLAN_SCENARIO_REQUIRED", message: "محاكي الشبكة يحتاج إلى سيناريو من الكتالوج.", path: i.key });
      if (i.scenario && i.simulator !== "networkTopology") blocking.push({ code: "PLAN_SCENARIO_UNEXPECTED", message: "السيناريو يخص محاكي الشبكة فقط.", path: i.key });
      if (i.simulator && !intent.capabilities.smartSim) blocking.push({ code: "PLAN_KIND_NOT_ALLOWED", message: "المحاكاة غير مفعّلة في خيارات المعلم.", path: i.key });
      if (excluded.length && excluded.some(t => i.topic.toLowerCase().includes(t))) blocking.push({ code: "PLAN_TOPIC_EXCLUDED", message: "الموضوع «" + i.topic + "» مستبعد بطلب المعلم.", path: i.key });
    }
  }
  if (items > COMPOSER_LIMITS.items) blocking.push({ code: "PLAN_TOO_MANY_ITEMS", message: "عدد البنود يتجاوز الحد (" + COMPOSER_LIMITS.items + ")." });
  if (intent.questionTarget !== null && Math.abs(items - intent.questionTarget) > Math.max(1, Math.round(intent.questionTarget * 0.25))) warnings.push({ code: "PLAN_QUESTION_TARGET", message: "عدد الأسئلة المخطط " + items + " بعيد عن الهدف " + intent.questionTarget + "." });
  const covered = out.sections.flatMap(s => [...s.topics, ...s.items.map(i => i.topic)]).join(" | ").toLowerCase();
  for (const t of intent.requiredTopics) if (!covered.includes(t.toLowerCase())) warnings.push({ code: "PLAN_TOPIC_UNCOVERED", message: "الموضوع المطلوب «" + t + "» لا يظهر في الخطة." });
  if (intent.difficultyProfile && total > 0) {
    const share = (d: PlanDifficulty) => Math.round((100 * out.sections.flatMap(s => s.items).filter(i => i.difficulty === d).reduce((n, i) => n + i.marks, 0)) / total);
    for (const d of PLAN_DIFFICULTIES) if (Math.abs(share(d) - intent.difficultyProfile[d]) > 20) warnings.push({ code: "PLAN_DIFFICULTY_PROFILE", message: "نسبة الصعوبة «" + d + "» في الخطة " + share(d) + "% والمطلوب " + intent.difficultyProfile[d] + "% (تقدير تأليفي، لا قياس)." });
  }
  for (const u of intent.unsupportedRequested) warnings.push({ code: "CAPABILITY_UNSUPPORTED", message: "الميزة المطلوبة «" + u.label + "» غير مدعومة في المحاكيات الحالية؛ لم تُنشأ محاكاة لها." });
  return { blocking, warnings, plan: out };
}

/** The topic → marks coverage of a plan (deterministic, from the plan's own item tags). */
export function planCoverage(plan: AiExamPlanV1): { topic: string; marks: number; items: number }[] {
  const map = new Map<string, { topic: string; marks: number; items: number }>();
  for (const s of plan.sections) for (const i of s.items) {
    const k = i.topic || s.title;
    const e = map.get(k) ?? { topic: k, marks: 0, items: 0 };
    e.marks += i.marks; e.items += 1; map.set(k, e);
  }
  return [...map.values()].sort((a, b) => b.marks - a.marks || a.topic.localeCompare(b.topic));
}
