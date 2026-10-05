// Phase 19E — the openResponse@1 QUESTION model («إجابة مفتوحة مع سلم تقييم»). Pure (no React, no DOM, no I/O): compiled into the shared
// server build. ONE family for essay / explain / justify / compare / analyze / sourceBased / general: a profile is an authoring and
// presentation hint, never a grading authority.
//
// Public vs private:
//   • PUBLIC  `question.openResponse` = { v: 1, profile, instructions, response: { minChars, maxChars }, studentRubricVisibility }.
//     `minChars` is guidance only (never blocks a save / submission, never scores); `maxChars` is the hard technical bound.
//   • PRIVATE `question.answer` = { rubric, modelAnswer } — the rubric (incl. every criterion's private guidance) and the model answer
//     never reach a student. When the teacher chose `studentRubricVisibility: "visible"`, the ONE canonical projection adds
//     `publicRubric` (titles, public descriptions, max points, level labels / points / descriptions) to the delivered config.
//   • The student answer is the existing `{ kind: "text", value }` Answer (plain text, verbatim), bounded by `maxChars`.
//
// Grading: the automatic grader NEVER awards marks (score 0 + manual review; no length, keyword, similarity, model-answer or AI
// heuristic). The teacher awards one level (or allowed custom points) per criterion; the SERVER validates the awards against the
// PUBLISHED rubric and computes score = round2(marks × awarded / rubricTotal) with the shared rubric engine. Malformed authority ⇒ no
// official rubric score (the question stays in manual review).
import { effectiveQuestionTypeVersion } from "./questionTypeCatalog";
import { defaultRubric, projectRubricForStudent, rubricTotalPoints, scoreRubric, validateRubric, type PublicRubric, type RubricAwards, type RubricIssue, type RubricV1 } from "./rubricEngine";

export const OPEN_RESPONSE_TYPE_KEY = "openResponse";
export const OPEN_RESPONSE_CONFIG_VERSION = 1;
export const OPEN_RESPONSE_PROFILES = Object.freeze(["essay", "explain", "justify", "compare", "analyze", "sourceBased", "general"] as const);
export type OpenResponseProfile = (typeof OPEN_RESPONSE_PROFILES)[number];
export const OPEN_RESPONSE_VISIBILITIES = Object.freeze(["visible", "hidden"] as const);
export type OpenResponseVisibility = (typeof OPEN_RESPONSE_VISIBILITIES)[number];
export const OPEN_RESPONSE_LIMITS = Object.freeze({ instructionsChars: 2000, maxCharsCap: 20000, defaultMaxChars: 6000, modelAnswerChars: 10000 });

export type OpenResponseConfigV1 = { v: 1; profile: OpenResponseProfile; instructions: string; response: { minChars: number; maxChars: number }; studentRubricVisibility: OpenResponseVisibility };
export type OpenResponseStudentConfig = OpenResponseConfigV1 & { publicRubric?: PublicRubric };
export type OpenResponseAnswerKeyV1 = { rubric: RubricV1; modelAnswer: string };
export type OpenResponseIssue = RubricIssue;

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const own = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const onlyKeys = (o: Record<string, unknown>, allowed: readonly string[]) => Object.keys(o).every(k => allowed.includes(k) && !FORBIDDEN_KEYS.has(k));
const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) => onlyKeys(o, keys) && keys.every(k => own(o, k));
const err = (code: string, message: string, path?: string): OpenResponseIssue => ({ code, message, severity: "error", ...(path ? { path } : {}) });
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** Arabic profile names (authoring + the student's presentation hint). */
export const OPEN_RESPONSE_PROFILE_LABELS: Readonly<Record<OpenResponseProfile, string>> = Object.freeze({ essay: "مقال", explain: "شرح", justify: "تعليل", compare: "مقارنة", analyze: "تحليل", sourceBased: "إجابة مستندة إلى مصدر", general: "إجابة مفتوحة" });
/** Profile defaults: authoring hints only (a suggested length bound); a profile never changes grading. */
export const OPEN_RESPONSE_PROFILE_MAX_CHARS: Readonly<Record<OpenResponseProfile, number>> = Object.freeze({ essay: 8000, explain: 3000, justify: 2000, compare: 4000, analyze: 6000, sourceBased: 6000, general: 6000 });
export const defaultOpenResponseConfig = (): OpenResponseConfigV1 => ({ v: 1, profile: "general", instructions: "", response: { minChars: 0, maxChars: OPEN_RESPONSE_LIMITS.defaultMaxChars }, studentRubricVisibility: "hidden" });
export const defaultOpenResponseAnswerKey = (): OpenResponseAnswerKeyV1 => ({ rubric: defaultRubric(), modelAnswer: "" });
export const openResponseQuestionVersion = (node: unknown): number | undefined => (isPlain(node) ? effectiveQuestionTypeVersion(OPEN_RESPONSE_TYPE_KEY, node.questionTypeVersion) : undefined);
export const isOpenResponseQuestion = (q: unknown): q is Record<string, unknown> => isPlain(q) && q.presentationType === OPEN_RESPONSE_TYPE_KEY;

const M = {
  config: "إعداد سؤال الإجابة المفتوحة غير صالح أو يحتوي حقولًا غير معروفة.",
  version: "إصدار سؤال الإجابة المفتوحة غير مدعوم.",
  profile: "نمط السؤال غير معروف.",
  visibility: "إعداد ظهور سلم التقييم للطالب غير معروف.",
  instructions: "تعليمات السؤال أطول من المسموح (" + OPEN_RESPONSE_LIMITS.instructionsChars + " حرف).",
  length: "حدود طول الإجابة غير صالحة: الحد الأقصى عدد صحيح من 1 إلى " + OPEN_RESPONSE_LIMITS.maxCharsCap + " والحد الأدنى بين 0 والحد الأقصى.",
  key: "بيانات التصحيح الخاصة بالسؤال غير صالحة.",
  model: "الإجابة النموذجية يجب أن تكون نصًا حتى " + OPEN_RESPONSE_LIMITS.modelAnswerChars + " حرف.",
  marks: "درجة السؤال يجب أن تكون عددًا موجبًا."
};

// ── the PUBLIC contract ────────────────────────────────────────────────────────────────────────────────────────────────────
export type OpenResponseConfigResult = { ok: true; config: OpenResponseConfigV1; issues: [] } | { ok: false; issues: OpenResponseIssue[] };
/** Root exactly { v: 1, profile, instructions, response: { minChars, maxChars }, studentRubricVisibility }; nothing is ever repaired. */
export function validateOpenResponseConfig(raw: unknown): OpenResponseConfigResult {
  if (!isPlain(raw) || !exactKeys(raw, ["v", "profile", "instructions", "response", "studentRubricVisibility"])) return { ok: false, issues: [err("OPEN_RESPONSE_CONFIG_INVALID", M.config, "openResponse")] };
  const issues: OpenResponseIssue[] = [];
  if (raw.v !== OPEN_RESPONSE_CONFIG_VERSION) issues.push(err("OPEN_RESPONSE_VERSION_UNSUPPORTED", M.version, "openResponse.v"));
  if (!(OPEN_RESPONSE_PROFILES as readonly unknown[]).includes(raw.profile)) issues.push(err("OPEN_RESPONSE_PROFILE_INVALID", M.profile, "openResponse.profile"));
  if (!(OPEN_RESPONSE_VISIBILITIES as readonly unknown[]).includes(raw.studentRubricVisibility)) issues.push(err("OPEN_RESPONSE_VISIBILITY_INVALID", M.visibility, "openResponse.studentRubricVisibility"));
  if (typeof raw.instructions !== "string" || raw.instructions.length > OPEN_RESPONSE_LIMITS.instructionsChars) issues.push(err("OPEN_RESPONSE_INSTRUCTIONS_INVALID", M.instructions, "openResponse.instructions"));
  const r = raw.response;
  if (!isPlain(r) || !exactKeys(r, ["minChars", "maxChars"]) || !isInt(r.maxChars, 1, OPEN_RESPONSE_LIMITS.maxCharsCap) || !isInt(r.minChars, 0, r.maxChars as number))
    issues.push(err("OPEN_RESPONSE_LENGTH_INVALID", M.length, "openResponse.response"));
  if (issues.length) return { ok: false, issues };
  const resp = r as { minChars: number; maxChars: number };
  return { ok: true, config: { v: 1, profile: raw.profile as OpenResponseProfile, instructions: raw.instructions as string, response: { minChars: resp.minChars, maxChars: resp.maxChars }, studentRubricVisibility: raw.studentRubricVisibility as OpenResponseVisibility }, issues: [] };
}

// ── the PRIVATE key ────────────────────────────────────────────────────────────────────────────────────────────────────────
export type OpenResponseKeyResult = { ok: true; key: OpenResponseAnswerKeyV1; issues: [] } | { ok: false; issues: OpenResponseIssue[] };
/** `answer` exactly { rubric, modelAnswer? }: the rubric through the shared engine; the model answer plain text ≤ the limit. */
export function validateOpenResponseAnswerKey(raw: unknown): OpenResponseKeyResult {
  if (!isPlain(raw) || !onlyKeys(raw, ["rubric", "modelAnswer"])) return { ok: false, issues: [err("OPEN_RESPONSE_KEY_INVALID", M.key, "answer")] };
  const issues: OpenResponseIssue[] = [];
  const rubric = validateRubric(raw.rubric, "answer.rubric");
  if (!rubric.ok) issues.push(...rubric.issues);
  if (own(raw, "modelAnswer") && (typeof raw.modelAnswer !== "string" || raw.modelAnswer.length > OPEN_RESPONSE_LIMITS.modelAnswerChars)) issues.push(err("OPEN_RESPONSE_MODEL_ANSWER_INVALID", M.model, "answer.modelAnswer"));
  if (issues.length || !rubric.ok) return { ok: false, issues };
  return { ok: true, key: { rubric: rubric.rubric, modelAnswer: typeof raw.modelAnswer === "string" ? raw.modelAnswer : "" }, issues: [] };
}

/** Finalization: the version, the public config, the private key and the marks; every issue is reported. */
export function validateOpenResponseQuestion(node: Record<string, unknown>): OpenResponseIssue[] {
  const out: OpenResponseIssue[] = [];
  if (openResponseQuestionVersion(node) !== 1) out.push(err("OPEN_RESPONSE_VERSION_UNSUPPORTED", M.version, "questionTypeVersion"));
  const cfg = validateOpenResponseConfig(node.openResponse);
  if (!cfg.ok) out.push(...cfg.issues);
  const key = validateOpenResponseAnswerKey(node.answer);
  if (!key.ok) out.push(...key.issues);
  const marks = node.marks;
  if (typeof marks !== "number" || !Number.isFinite(marks) || marks <= 0) out.push(err("OPEN_RESPONSE_MARKS_INVALID", M.marks, "marks"));
  return out;
}

// ── the ONE student projection ─────────────────────────────────────────────────────────────────────────────────────────────
/**
 * The delivered public config: the strictly valid canonical config (rebuilt) or null (malformed / smuggling ⇒ withheld). With
 * `studentRubricVisibility: "visible"` and a VALID private rubric, `publicRubric` is added from the engine's public projection; an
 * invalid private key projects no rubric at all (never from bad authority). The model answer is never part of it.
 */
export function projectOpenResponseForStudent(rawConfig: unknown, rawAnswerKey: unknown): OpenResponseStudentConfig | null {
  const cfg = validateOpenResponseConfig(rawConfig);
  if (!cfg.ok) return null;
  if (cfg.config.studentRubricVisibility !== "visible") return cfg.config;
  const rubric = isPlain(rawAnswerKey) ? validateRubric(rawAnswerKey.rubric) : null;
  return rubric && rubric.ok ? { ...cfg.config, publicRubric: projectRubricForStudent(rubric.rubric) } : cfg.config;
}

const isText = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
function readPublicRubric(raw: unknown): PublicRubric | null {
  if (!isPlain(raw) || !exactKeys(raw, ["totalPoints", "criteria"]) || typeof raw.totalPoints !== "number" || !Array.isArray(raw.criteria) || raw.criteria.length === 0 || raw.criteria.length > 12) return null;
  const criteria: PublicRubric["criteria"] = [];
  for (const c of raw.criteria) {
    if (!isPlain(c) || !exactKeys(c, ["title", "description", "maxPoints", "levels"]) || !isText(c.title, 120) || !isText(c.description, 600) || typeof c.maxPoints !== "number" || !Array.isArray(c.levels) || c.levels.length > 8) return null;
    const levels: PublicRubric["criteria"][number]["levels"] = [];
    for (const l of c.levels) {
      if (!isPlain(l) || !exactKeys(l, ["label", "points", "description"]) || !isText(l.label, 60) || typeof l.points !== "number" || !isText(l.description, 600)) return null;
      levels.push({ label: l.label as string, points: l.points as number, description: l.description as string });
    }
    criteria.push({ title: c.title as string, description: c.description as string, maxPoints: c.maxPoints as number, levels });
  }
  return { totalPoints: raw.totalPoints, criteria };
}
/** The client reads ONLY the strict delivered shape: a valid config plus an optional well-formed `publicRubric`; anything else ⇒ null. */
export function readOpenResponseStudentConfig(raw: unknown): OpenResponseStudentConfig | null {
  if (!isPlain(raw)) return null;
  const { publicRubric, ...rest } = raw;
  const cfg = validateOpenResponseConfig(rest);
  if (!cfg.ok) return null;
  if (!own(raw, "publicRubric")) return cfg.config;
  const pr = readPublicRubric(publicRubric);
  return pr ? { ...cfg.config, publicRubric: pr } : null;
}

// ── student answers ────────────────────────────────────────────────────────────────────────────────────────────────────────
export type OpenResponseAnswer = { kind: "text"; value: string };
export type OpenResponseAnswerResult = { ok: true; answer: OpenResponseAnswer } | { ok: false; code: "OPEN_RESPONSE_ANSWER_INVALID" | "OPEN_RESPONSE_ANSWER_TOO_LONG" };
/**
 * Ingest binding: rebuilt to exactly { kind: "text", value } (every other field — a score, rubric, model answer, comment — dropped);
 * the text is kept VERBATIM (paragraphs, RTL / LTR; no trimming, no HTML interpretation) and bounded by the question's `maxChars`
 * (the hard cap when the published config is unreadable). Over-long text is refused, never truncated.
 */
export function bindOpenResponseAnswerToQuestion(a: unknown, question: unknown): OpenResponseAnswerResult {
  if (!isPlain(a) || a.kind !== "text" || typeof a.value !== "string") return { ok: false, code: "OPEN_RESPONSE_ANSWER_INVALID" };
  const cfg = isPlain(question) ? validateOpenResponseConfig(question.openResponse) : null;
  const max = cfg && cfg.ok ? cfg.config.response.maxChars : OPEN_RESPONSE_LIMITS.maxCharsCap;
  if (a.value.length > max) return { ok: false, code: "OPEN_RESPONSE_ANSWER_TOO_LONG" };
  return { ok: true, answer: { kind: "text", value: a.value } };
}
/** Answered ⇔ the text has at least one non-blank character. */
export const isOpenResponseAnswerAnswered = (a: unknown): boolean => isPlain(a) && a.kind === "text" && typeof a.value === "string" && a.value.trim() !== "";

// ── grading ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The automatic result is ALWAYS 0 + manual review: openResponse@1 is teacher-graded; nothing is inferred from the text. */
export function gradeOpenResponse(_question: unknown, _response: unknown): { score: 0; correct: false; manualReview: true } {
  return { score: 0, correct: false, manualReview: true };
}

type Authority = { config: OpenResponseConfigV1; key: OpenResponseAnswerKeyV1; marks: number };
function authorityOf(question: unknown): Authority | null {
  if (!isOpenResponseQuestion(question) || openResponseQuestionVersion(question) !== 1) return null;
  const cfg = validateOpenResponseConfig(question.openResponse), key = validateOpenResponseAnswerKey(question.answer), marks = question.marks;
  if (!cfg.ok || !key.ok || typeof marks !== "number" || !Number.isFinite(marks) || marks <= 0) return null;
  return { config: cfg.config, key: key.key, marks };
}
export type OpenResponseRubricScore = { ok: true; score: number; awarded: number; total: number; awards: RubricAwards } | { ok: false; code: string; criterionId?: string };
/**
 * The OFFICIAL rubric score of a teacher's awards on a PUBLISHED question: type + version + config + rubric + marks re-validated (else
 * RUBRIC_AUTHORITY_INVALID), awards bound to that rubric (unknown / missing / forged ⇒ refused), score computed here — never taken
 * from the request.
 */
export function scoreOpenResponseRubric(question: unknown, awards: unknown): OpenResponseRubricScore {
  const auth = authorityOf(question);
  if (!auth) return { ok: false, code: "RUBRIC_AUTHORITY_INVALID" };
  return scoreRubric({ rubric: auth.key.rubric, awards, maxMarks: auth.marks });
}

export type OpenResponseReviewModel =
  | { ok: true; config: OpenResponseConfigV1; rubric: RubricV1; modelAnswer: string; total: number; awards: RubricAwards | null; stale: boolean; score: number | null }
  | { ok: false; code: string };
/**
 * Teacher review only (it carries the private rubric guidance and the model answer). A stored rubric review `{ v: 1, awards }` is
 * RE-BOUND against the CURRENT published rubric: if it no longer binds (stale selection), it is flagged and not shown as a grade.
 */
export function openResponseReviewModel(question: unknown, stored: unknown): OpenResponseReviewModel {
  const auth = authorityOf(question);
  if (!auth) return { ok: false, code: "RUBRIC_AUTHORITY_INVALID" };
  const base = { ok: true as const, config: auth.config, rubric: auth.key.rubric, modelAnswer: auth.key.modelAnswer, total: rubricTotalPoints(auth.key.rubric) };
  if (!isPlain(stored) || stored.v !== 1 || !isPlain(stored.awards)) return { ...base, awards: null, stale: false, score: null };
  const request: Record<string, unknown> = {};
  for (const [id, a] of Object.entries(stored.awards)) request[id] = isPlain(a) && typeof a.levelId === "string" ? { levelId: a.levelId } : isPlain(a) ? { points: a.points } : a;
  const r = scoreRubric({ rubric: auth.key.rubric, awards: request, maxMarks: auth.marks });
  return r.ok ? { ...base, awards: r.awards, stale: false, score: r.score } : { ...base, awards: null, stale: true, score: null };
}
