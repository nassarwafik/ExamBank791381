// Phase 19G — AI-ASSISTED SCENARIO AUTHORING: the deterministic layer between an AI model and a scenario (shared sources + several
// canonical questions of one section). Pure (no React, no DOM, no I/O): compiled into the shared server build (the endpoint) and used
// by the Builder dialog (client-side re-verification). The AI only PROPOSES; this module
//   1. checks the AI output SHAPE strictly (exact keys, bounded strings, plain objects, no prototype-sensitive keys);
//   2. maps the PUBLIC sources (text / table / display-only code — never an image: the AI cannot mint an authorized asset reference)
//      to canonical SourceStimulusV1 objects judged by the SAME strict contract manual authoring uses (nothing repaired);
//   3. normalizes EVERY question through the 19A single-question layer (normalizeAiQuestionDraft) — so every refusal of that layer
//      applies here too (no hidden tests, no reference solutions, no visual geometry, no simulator package, no private grading);
//   4. assembles ONE ScenarioV1 referencing the questions and lets the canonical finalization gate (validateStructuredExam, which runs
//      validateSectionScenarios and every registered type validator) decide. All or nothing: one refused question or source refuses the
//      whole scenario; nothing is inserted half-way. The AI never grades and never owns a score.
import { buildAiAuthorPrompt, buildAiAuthorSchema, classifyAuthorRequest, normalizeAiQuestionDraft, verifyAiQuestionNode, type AiAuthorIssue, type AuthorRequestSignals } from "./aiQuestionDraft";
import { validateSectionScenarios, validateSourceStimulus, type ScenarioV1, type SourceStimulusV1 } from "./scenarioSource";
import { validateStructuredExam } from "./examQuality";
import type { BuilderQuestion, StructuredExam } from "./examTypes";

export const AI_SCENARIO_LIMITS = Object.freeze({ requestChars: 2000, sources: 4, questions: 6, titleChars: 200, instructionsChars: 2000, explanationChars: 1000, textChars: 8000, codeChars: 16000, tableColumns: 6, tableRows: 20, cellChars: 200 });
/** The source kinds the AI may propose. `image` is deliberately absent: an image source needs a teacher-authorized asset. */
export const AI_SCENARIO_SOURCE_KINDS: readonly string[] = Object.freeze(["text", "table", "code"]);
const CODE_LANGS = ["python", "java", "csharp", "pseudocode"];
export const AI_SCENARIO_ID = "ai-scenario";
export type AiScenarioResult =
  | { ok: true; scenario: ScenarioV1; questions: BuilderQuestion[]; notes: string[] }
  | { ok: false; code: string; message: string; issues: AiAuthorIssue[] };

// ── the strict schema the AI must fill (every property required, nullable-free: unused payload fields are "" / []) ─────────
type JsonSchema = Record<string, unknown>;
const str = (): JsonSchema => ({ type: "string" });
const obj = (properties: Record<string, JsonSchema>): JsonSchema => ({ type: "object", additionalProperties: false, properties, required: Object.keys(properties) });
const arr = (items: JsonSchema, maxItems: number): JsonSchema => ({ type: "array", items, maxItems });
export function buildAiScenarioSchema() {
  return {
    type: "object" as const,
    additionalProperties: false as const,
    properties: {
      title: str(),
      instructions: str(),
      explanation: str(),
      sources: arr(obj({ kind: { type: "string", enum: [...AI_SCENARIO_SOURCE_KINDS] }, title: str(), text: str(), headers: arr(str(), AI_SCENARIO_LIMITS.tableColumns), rows: arr(arr(str(), AI_SCENARIO_LIMITS.tableColumns), AI_SCENARIO_LIMITS.tableRows), language: { type: "string", enum: CODE_LANGS }, source: str() }), AI_SCENARIO_LIMITS.sources),
      questions: arr(buildAiAuthorSchema(), AI_SCENARIO_LIMITS.questions)
    },
    required: ["title", "instructions", "explanation", "sources", "questions"]
  };
}
/** The prompt: the scenario rules (public sources, no answers in a source, no images), then the per-question rules of the 19A layer. */
export function buildAiScenarioPrompt(request: string, signals: AuthorRequestSignals): string {
  return [
    "You author ONE SCENARIO for SmartAssess: shared SOURCE material that several ordinary questions read, plus 2 to " + AI_SCENARIO_LIMITS.questions + " questions about it. Return JSON that follows the schema exactly.",
    "`title` names the scenario; `instructions` tell the student how to use the sources (optional, may be \"\").",
    "`sources` (1-" + AI_SCENARIO_LIMITS.sources + "): PUBLIC reading material only — kind \"text\" (a passage, a case, data; fill `text`), \"table\" (fill `headers` 1-" + AI_SCENARIO_LIMITS.tableColumns + " columns and `rows`, every row with exactly one cell per header), or \"code\" (a program shown for READING only, never executed: fill `language` and `source`). Fill ONLY the fields of the chosen kind; set the others to \"\" or []. Never propose an image: the teacher attaches images.",
    "A source NEVER contains an answer, a solution, a hint about the correct option, a rubric, a teacher note or any grading data. Students read every source verbatim.",
    "Every entry of `questions` is an ordinary question that can be answered FROM the sources and follows the per-question rules below exactly (one `intent` each; fill only that intent's payload). Do not repeat the source text inside a question.",
    "Per-question rules (apply to EVERY entry of `questions`):",
    buildAiAuthorPrompt(request, signals)
  ].join("\n");
}

// ── strict AI-output shape ─────────────────────────────────────────────────────────────────────────────────────────────────
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const hasForbiddenKey = (v: unknown, depth = 0): boolean => {
  if (depth > 10) return true;
  if (Array.isArray(v)) return v.some(x => hasForbiddenKey(x, depth + 1));
  if (v && typeof v === "object") return Object.keys(v).some(k => FORBIDDEN_KEYS.has(k) || hasForbiddenKey((v as Record<string, unknown>)[k], depth + 1));
  return false;
};
const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(o, k));
const isStr = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const strList = (v: unknown, max: number, each: number): v is string[] => Array.isArray(v) && v.length <= max && v.every(x => isStr(x, each));
type AiSource = { kind: string; title: string; text: string; headers: string[]; rows: string[][]; language: string; source: string };
type AiScenario = { title: string; instructions: string; explanation: string; sources: AiSource[]; questions: unknown[] };
const SOURCE_KEYS = ["kind", "title", "text", "headers", "rows", "language", "source"];
function sourceShapeOk(s: unknown): s is AiSource {
  if (!isPlain(s) || !exactKeys(s, SOURCE_KEYS)) return false;
  if (typeof s.kind !== "string" || !AI_SCENARIO_SOURCE_KINDS.includes(s.kind)) return false;
  if (!isStr(s.title, AI_SCENARIO_LIMITS.titleChars) || !isStr(s.text, AI_SCENARIO_LIMITS.textChars) || !isStr(s.source, AI_SCENARIO_LIMITS.codeChars)) return false;
  if (typeof s.language !== "string" || !(s.language === "" || CODE_LANGS.includes(s.language))) return false;
  if (!strList(s.headers, AI_SCENARIO_LIMITS.tableColumns, AI_SCENARIO_LIMITS.cellChars)) return false;
  if (!Array.isArray(s.rows) || s.rows.length > AI_SCENARIO_LIMITS.tableRows || !s.rows.every(r => strList(r, AI_SCENARIO_LIMITS.tableColumns, AI_SCENARIO_LIMITS.cellChars))) return false;
  return true;
}
function shapeOk(raw: unknown): raw is AiScenario {
  if (!isPlain(raw) || hasForbiddenKey(raw) || !exactKeys(raw, ["title", "instructions", "explanation", "sources", "questions"])) return false;
  if (!isStr(raw.title, AI_SCENARIO_LIMITS.titleChars) || !isStr(raw.instructions, AI_SCENARIO_LIMITS.instructionsChars) || !isStr(raw.explanation, AI_SCENARIO_LIMITS.explanationChars)) return false;
  if (!Array.isArray(raw.sources) || raw.sources.length < 1 || raw.sources.length > AI_SCENARIO_LIMITS.sources || !raw.sources.every(sourceShapeOk)) return false;
  if (!Array.isArray(raw.questions) || raw.questions.length < 1 || raw.questions.length > AI_SCENARIO_LIMITS.questions) return false;
  return true;
}
/** AI source row → canonical source (deterministic, field by field; the strict contract judges it). */
function mapSource(s: AiSource, i: number): unknown {
  const base: Record<string, unknown> = { id: "ai-src-" + (i + 1), version: 1, kind: s.kind };
  if (s.title.trim() !== "") base.title = s.title;
  if (s.kind === "text") return { ...base, text: s.text };
  if (s.kind === "table") return { ...base, columnHeaders: s.headers, rows: s.rows };
  return { ...base, language: s.language, source: s.source };
}

const MESSAGES = Object.freeze({
  AI_SCENARIO_MALFORMED: "استجابة الذكاء الاصطناعي لا تطابق بنية السيناريو المطلوبة؛ لم يُنشأ أي سيناريو.",
  AI_SCENARIO_SOURCE_INVALID: "أحد المصادر المقترحة لا يجتاز التحقق القياسي للمصادر المشتركة؛ لم يُنشأ أي سيناريو.",
  AI_SCENARIO_QUESTION_INVALID: "أحد أسئلة السيناريو المقترح رُفض؛ لم يُنشأ أي سيناريو (يُدرج السيناريو كاملًا أو لا يُدرج).",
  AI_SCENARIO_INVALID: "السيناريو المقترح لا يجتاز التحقق القياسي (المصادر، الربط بالأسئلة، أنواع الأسئلة)؛ لم يُنشأ أي سيناريو."
});
const refuse = (code: keyof typeof MESSAGES, issues: AiAuthorIssue[] = [], suffix = ""): AiScenarioResult => ({ ok: false, code, message: MESSAGES[code] + suffix, issues });
const syntheticExam = (questions: unknown[], scenario: unknown): StructuredExam => ({ examId: "ai-authoring", title: "AI", status: "draft", schemaVersion: 2, sections: [{ id: "ai-section", title: "AI", instructions: "", maxMarks: null, gradingPolicy: "all", requiredAnswers: null, answerUnit: "question", stimuli: {}, scenarios: [scenario], questions }] } as unknown as StructuredExam);

/** AI scenario draft → canonical scenario + canonical questions (or a refusal with the canonical issues). Deterministic. */
export function normalizeAiScenarioDraft(raw: unknown, context: { request: string }): AiScenarioResult {
  if (!shapeOk(raw)) return refuse("AI_SCENARIO_MALFORMED");
  const sources: SourceStimulusV1[] = [];
  const sourceIssues: AiAuthorIssue[] = [];
  raw.sources.forEach((s, i) => {
    const r = validateSourceStimulus(mapSource(s, i), "sources[" + i + "]");
    if (r.ok) sources.push(r.source); else sourceIssues.push(...r.issues.map(x => ({ code: x.code, message: "المصدر " + (i + 1) + ": " + x.message })));
  });
  if (sourceIssues.length) return refuse("AI_SCENARIO_SOURCE_INVALID", sourceIssues);
  const questions: BuilderQuestion[] = [];
  const notes: string[] = raw.explanation.trim() ? [raw.explanation] : [];
  for (let i = 0; i < raw.questions.length; i++) {
    const r = normalizeAiQuestionDraft(raw.questions[i], context);
    if (!r.ok) return refuse("AI_SCENARIO_QUESTION_INVALID", [{ code: r.code, message: "السؤال " + (i + 1) + ": " + r.message }, ...r.issues.map(x => ({ code: x.code, message: "السؤال " + (i + 1) + ": " + x.message }))]);
    questions.push({ ...r.question, examQuestionId: "ai-scn-q" + (i + 1) });
    for (const n of r.notes) if (!notes.includes(n)) notes.push(n);
  }
  const scenario: ScenarioV1 = { id: AI_SCENARIO_ID, version: 1, ...(raw.title.trim() ? { title: raw.title } : {}), ...(raw.instructions.trim() ? { instructions: raw.instructions } : {}), sources, questionIds: questions.map(q => q.examQuestionId) };
  const verdict = verifyAiScenarioDraft({ scenario, questions });
  if (!verdict.ok) return refuse("AI_SCENARIO_INVALID", verdict.issues);
  return { ok: true, scenario: verdict.scenario, questions: verdict.questions, notes };
}

/**
 * Judges a generated scenario with the canonical authorities manual authoring uses (shared with the Builder dialog's client-side
 * re-verification): every question through verifyAiQuestionNode (generated types only, canonical keys only, the quality gate), the
 * scenario's sources limited to the AI kinds (no image), its membership exactly the questions, and the structured-exam quality gate
 * (section scenarios + registered type validators) reporting no error.
 */
export function verifyAiScenarioDraft(raw: unknown): { ok: true; scenario: ScenarioV1; questions: BuilderQuestion[] } | { ok: false; code: "AI_SCENARIO_INVALID"; message: string; issues: AiAuthorIssue[] } {
  const fail = (issues: AiAuthorIssue[]) => ({ ok: false as const, code: "AI_SCENARIO_INVALID" as const, message: MESSAGES.AI_SCENARIO_INVALID, issues });
  if (!isPlain(raw) || hasForbiddenKey(raw) || !exactKeys(raw, ["scenario", "questions"])) return fail([{ code: "AI_SCENARIO_MALFORMED", message: "بنية السيناريو المقترح غير صالحة." }]);
  if (!Array.isArray(raw.questions) || raw.questions.length < 1 || raw.questions.length > AI_SCENARIO_LIMITS.questions) return fail([{ code: "AI_SCENARIO_QUESTIONS_COUNT", message: "عدد أسئلة السيناريو المقترح خارج الحد المسموح." }]);
  const questions: BuilderQuestion[] = [];
  for (let i = 0; i < raw.questions.length; i++) {
    const v = verifyAiQuestionNode(raw.questions[i]);
    if (!v.ok) return fail(v.issues.map(x => ({ code: x.code, message: "السؤال " + (i + 1) + ": " + x.message })));
    questions.push(v.question);
  }
  const ids = questions.map(q => q.examQuestionId);
  if (new Set(ids).size !== ids.length) return fail([{ code: "AI_SCENARIO_QUESTION_IDS", message: "معرّفات أسئلة السيناريو المقترح مكرّرة." }]);
  const section = validateSectionScenarios({ questions, scenarios: [raw.scenario] });
  if (!section.ok || section.scenarios.length !== 1) return fail(section.issues.map(x => ({ code: x.code, message: x.message })));
  const scenario = section.scenarios[0];
  if (scenario.sources.some(s => !AI_SCENARIO_SOURCE_KINDS.includes(s.kind))) return fail([{ code: "AI_SCENARIO_SOURCE_KIND_FORBIDDEN", message: "لا يُنشئ الذكاء الاصطناعي مصادر صور؛ يرفقها المعلم بنفسه." }]);
  if (scenario.questionIds.length !== ids.length || ids.some(id => !scenario.questionIds.includes(id))) return fail([{ code: "AI_SCENARIO_MEMBERSHIP", message: "السيناريو المقترح لا يربط أسئلته بالضبط." }]);
  const errors = validateStructuredExam(syntheticExam(questions, raw.scenario)).filter(i => i.severity === "error");
  if (errors.length) return fail(errors.map(i => ({ code: i.code, message: i.message })));
  return { ok: true, scenario, questions };
}

export { classifyAuthorRequest };
