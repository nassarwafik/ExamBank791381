// Phase 20F — AiExamIntentV1: the teacher's request, NORMALIZED. Structured controls (subject, marks, sections, allowed types, feature
// toggles, preset) are hard constraints; the free natural-language instruction only refines them — when they conflict, the structured
// control wins (the prompt says so and every later stage validates against the intent, never against the free text). Strict: an
// unknown key, a prototype-sensitive key, a value out of bounds or an unknown type / preset is refused (never silently dropped).
import { COMPOSER_LIMITS, type ComposerIssue } from "./composerLimits";
import { COMPOSER_ITEM_KINDS, COMPOSER_PRESETS, detectUnsupportedCapabilities, type ComposerItemKind, type UnsupportedCapability } from "./composerCatalog";
import { cleanText, hasOnlyKeys, isArr, isEnum, isInt, isStr } from "./composerSchemaKit";
import type { AiChartPolicy } from "./composerChart";

export const COMPOSER_LANGUAGES = Object.freeze(["ar", "en", "he"] as const);
export const COMPOSER_DIFFICULTIES = Object.freeze(["easy", "medium", "hard", "mixed"] as const);
export const COMPOSER_CAPABILITY_FLAGS = Object.freeze(["composite", "smartSim", "coding", "parametric", "openResponse", "richContent", "tables", "visual", "rubrics", "charts", "illustrativeData"] as const);
/** Flags that are OFF unless the teacher turns them on (21A.1: illustrativeData — invented chart numbers need explicit consent). */
export const COMPOSER_CAPABILITY_DEFAULT_OFF: readonly string[] = Object.freeze(["visual", "illustrativeData"]);
export type ComposerCapabilityFlag = (typeof COMPOSER_CAPABILITY_FLAGS)[number];
export type DifficultyProfile = { easy: number; medium: number; hard: number };
export type AiExamIntentV1 = {
  v: 1;
  subject: string; course: string; grade: string;
  language: (typeof COMPOSER_LANGUAGES)[number]; direction: "rtl" | "ltr";
  totalMarks: number; durationMinutes: number | null;
  difficulty: (typeof COMPOSER_DIFFICULTIES)[number]; difficultyProfile: DifficultyProfile | null;
  sectionTarget: number | null; questionTarget: number | null;
  allowedQuestionTypes: ComposerItemKind[] | null;
  requiredTopics: string[]; excludedTopics: string[];
  capabilities: Record<ComposerCapabilityFlag, boolean>;
  presentationPreset: string | null;
  teacherInstruction: string;
  unsupportedRequested: UnsupportedCapability[];
};
const INTENT_KEYS = ["v", "subject", "course", "grade", "language", "direction", "totalMarks", "durationMinutes", "difficulty", "difficultyProfile", "sectionTarget", "questionTarget", "allowedQuestionTypes", "requiredTopics", "excludedTopics", "capabilities", "presentationPreset", "teacherInstruction"] as const;
const L = COMPOSER_LIMITS;

/** Item kinds an intent permits (allowed list ∩ feature toggles). The plan / draft may only use these. */
export function intentAllowedKinds(intent: AiExamIntentV1): ComposerItemKind[] {
  const c = intent.capabilities;
  return (intent.allowedQuestionTypes ?? [...COMPOSER_ITEM_KINDS]).filter(k =>
    (k !== "composite" || c.composite) && (k !== "smartSim" || c.smartSim) && (k !== "coding" || c.coding) &&
    (k !== "parametricNumeric" || c.parametric) && (k !== "openResponse" || c.openResponse));
}

export function normalizeComposerIntent(raw: unknown): { ok: true; intent: AiExamIntentV1 } | { ok: false; issues: ComposerIssue[] } {
  const issues: ComposerIssue[] = [];
  const bad = (path: string, message: string) => { issues.push({ code: "INTENT_INVALID", message, path }); };
  if (!hasOnlyKeys(raw, INTENT_KEYS)) return { ok: false, issues: [{ code: "INTENT_MALFORMED", message: "طلب الامتحان يحتوي حقولًا غير معروفة أو غير صالحة." }] };
  const r = raw;
  if (r.v !== 1) bad("v", "إصدار الطلب غير مدعوم.");
  const text = (k: string, max: number, required: boolean): string => {
    const v = r[k];
    if (v === undefined || v === null || v === "") { if (required) bad(k, "الحقل مطلوب: " + k); return ""; }
    if (!isStr(v, max)) { bad(k, "قيمة غير صالحة: " + k); return ""; }
    return cleanText(v);
  };
  const subject = text("subject", L.shortText, true);
  const course = text("course", L.shortText, false);
  const grade = text("grade", L.shortText, false);
  const teacherInstruction = text("teacherInstruction", L.instructionChars, false);
  const language = r.language === undefined ? "ar" : r.language;
  if (!isEnum(language, COMPOSER_LANGUAGES)) bad("language", "لغة غير مدعومة.");
  const direction = r.direction === undefined ? (language === "en" ? "ltr" : "rtl") : r.direction;
  if (direction !== "rtl" && direction !== "ltr") bad("direction", "اتجاه غير صالح.");
  if (!isInt(r.totalMarks, 1, L.totalMarksMax)) bad("totalMarks", "مجموع العلامات يجب أن يكون عددًا صحيحًا بين 1 و" + L.totalMarksMax + ".");
  const duration = r.durationMinutes ?? null;
  if (duration !== null && !isInt(duration, 1, L.durationMax)) bad("durationMinutes", "مدة الامتحان غير صالحة.");
  const difficulty = r.difficulty === undefined ? "mixed" : r.difficulty;
  if (!isEnum(difficulty, COMPOSER_DIFFICULTIES)) bad("difficulty", "مستوى صعوبة غير معروف.");
  let profile: DifficultyProfile | null = null;
  if (r.difficultyProfile !== undefined && r.difficultyProfile !== null) {
    const p = r.difficultyProfile;
    if (!hasOnlyKeys(p, ["easy", "medium", "hard"]) || !isInt(p.easy, 0, 100) || !isInt(p.medium, 0, 100) || !isInt(p.hard, 0, 100) || p.easy + p.medium + p.hard !== 100) bad("difficultyProfile", "توزيع الصعوبة يجب أن يكون نسبًا صحيحة مجموعها 100.");
    else profile = { easy: p.easy, medium: p.medium, hard: p.hard };
  }
  const sectionTarget = r.sectionTarget ?? null;
  if (sectionTarget !== null && !isInt(sectionTarget, 1, L.sections)) bad("sectionTarget", "عدد الأقسام بين 1 و" + L.sections + ".");
  const questionTarget = r.questionTarget ?? null;
  if (questionTarget !== null && !isInt(questionTarget, 1, L.items)) bad("questionTarget", "عدد الأسئلة بين 1 و" + L.items + ".");
  let allowed: ComposerItemKind[] | null = null;
  if (r.allowedQuestionTypes !== undefined && r.allowedQuestionTypes !== null) {
    const a = r.allowedQuestionTypes;
    if (!isArr(a, COMPOSER_ITEM_KINDS.length) || !a.length || !a.every(k => isEnum(k, COMPOSER_ITEM_KINDS)) || new Set(a).size !== a.length) bad("allowedQuestionTypes", "قائمة الأنواع المسموحة تحتوي نوعًا غير مدعوم.");
    else allowed = a as ComposerItemKind[];
  }
  const topics = (k: "requiredTopics" | "excludedTopics"): string[] => {
    const v = r[k];
    if (v === undefined || v === null) return [];
    if (!isArr(v, L.topics) || !v.every(t => isStr(t, L.topicChars, 1))) { bad(k, "قائمة الموضوعات غير صالحة."); return []; }
    return [...new Set((v as string[]).map(cleanText).filter(Boolean))];
  };
  const requiredTopics = topics("requiredTopics");
  const excludedTopics = topics("excludedTopics");
  const caps = {} as Record<ComposerCapabilityFlag, boolean>;
  const rc = r.capabilities ?? {};
  if (!hasOnlyKeys(rc, COMPOSER_CAPABILITY_FLAGS)) bad("capabilities", "خيارات الميزات غير صالحة.");
  else for (const f of COMPOSER_CAPABILITY_FLAGS) {
    const v = (rc as Record<string, unknown>)[f];
    if (v !== undefined && typeof v !== "boolean") bad("capabilities." + f, "قيمة غير صالحة.");
    caps[f] = v === undefined ? !COMPOSER_CAPABILITY_DEFAULT_OFF.includes(f) : v === true;
  }
  const preset = r.presentationPreset ?? null;
  if (preset !== null && preset !== "auto" && !isEnum(preset, COMPOSER_PRESETS as readonly string[])) bad("presentationPreset", "قالب العرض غير معروف.");
  if (issues.length) return { ok: false, issues };
  const intent: AiExamIntentV1 = {
    v: 1, subject, course, grade, language: language as AiExamIntentV1["language"], direction: direction as "rtl" | "ltr",
    totalMarks: r.totalMarks as number, durationMinutes: duration as number | null,
    difficulty: difficulty as AiExamIntentV1["difficulty"], difficultyProfile: profile,
    sectionTarget: sectionTarget as number | null, questionTarget: questionTarget as number | null,
    allowedQuestionTypes: allowed, requiredTopics, excludedTopics, capabilities: caps,
    presentationPreset: preset === "auto" ? null : (preset as string | null), teacherInstruction,
    unsupportedRequested: detectUnsupportedCapabilities(teacherInstruction + " " + requiredTopics.join(" "))
  };
  if (!intentAllowedKinds(intent).length) return { ok: false, issues: [{ code: "INTENT_NO_TYPES", message: "لا يبقى أي نوع سؤال مسموح بعد تطبيق الخيارات المحددة.", path: "allowedQuestionTypes" }] };
  return { ok: true, intent };
}

/** The intent as the model sees it (structured constraints first; the free instruction is labelled as teacher text). */
export function intentForPrompt(intent: AiExamIntentV1): string {
  const c = intent.capabilities;
  return [
    "STRUCTURED CONSTRAINTS (authoritative; they override the free instruction whenever they conflict):",
    "subject: " + intent.subject + (intent.course ? " | course: " + intent.course : "") + (intent.grade ? " | grade: " + intent.grade : ""),
    "language: " + intent.language + " | direction: " + intent.direction + " | total marks (exact): " + intent.totalMarks + (intent.durationMinutes ? " | duration: " + intent.durationMinutes + " min" : ""),
    "difficulty: " + intent.difficulty + (intent.difficultyProfile ? " (easy " + intent.difficultyProfile.easy + "%, medium " + intent.difficultyProfile.medium + "%, hard " + intent.difficultyProfile.hard + "%)" : ""),
    (intent.sectionTarget ? "sections (exact): " + intent.sectionTarget : "sections: choose 1-" + COMPOSER_LIMITS.sections) + " | " + (intent.questionTarget ? "questions (target): " + intent.questionTarget : "questions: choose a sensible number"),
    "allowed item kinds: " + intentAllowedKinds(intent).join(", "),
    "features: " + COMPOSER_CAPABILITY_FLAGS.map(f => f + "=" + (c[f] ? "on" : "off")).join(", "),
    "required topics: " + (intent.requiredTopics.join(", ") || "(none)") + " | excluded topics: " + (intent.excludedTopics.join(", ") || "(none)"),
    "presentation preset: " + (intent.presentationPreset ?? "choose the best fitting preset"),
    intent.unsupportedRequested.length ? "requested but NOT supported by the platform (never simulate; report in unsupportedRequests with a safe alternative): " + intent.unsupportedRequested.map(u => u.label).join(", ") : ""
  ].filter(Boolean).join("\n");
}

/** Phase 21A.1 — the chart data policy of a generation request: the teacher's own words (every teacher-provided chart number must appear in
 *  them), whether invented illustrative data is allowed, and whether charts are enabled at all. */
export const composerChartPolicy = (intent: AiExamIntentV1): AiChartPolicy => ({
  request: [intent.teacherInstruction, ...intent.requiredTopics].join("\n"),
  illustrative: intent.capabilities.illustrativeData === true,
  charts: intent.capabilities.charts === true && intent.capabilities.richContent === true
});
