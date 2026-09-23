// Live Challenge — the ONE place that turns an exam (a saved exam, or a local .json file) into the canonical
// BuilderQuestions a challenge can import. Pure (no IO, no React) and non-mutating.
//
// Both exam shapes the platform stores are supported — exactly the two the backend's structural question counter
// (countExamQuestions) already counts for the saved-exams list:
//   structured: exam.sections[].questions[]
//   legacy    : exam.questions[]            (converted through the canonical legacyToStructured, never re-implemented)
// Question types are resolved through the canonical registry (BUILDER_QUESTION_TYPES) and the existing import alias
// table (canonicalizeType — e.g. a legacy generated "open" is a shortAnswer); there is no second list of types and no
// second question model. JSON files are parsed as DATA only, through the existing structured-exam JSON parser.
import { BUILDER_QUESTION_TYPES, type BuilderQuestion, type BuilderQuestionType } from "../../examTypes";
import { legacyToStructured, genId } from "../../examBuilderState";
import { canonicalizeType, parseStructuredExamJson, MAX_IMPORT_BYTES } from "../../structuredExamImport";

/** ok = at least one importable question; empty = a recognized exam with genuinely no questions; unrecognized = the
 *  data is not a recognizable exam, or it has question entries none of which is a supported canonical question. */
export type SourceExamStatus = "ok" | "empty" | "unrecognized";
export type SourceExamShape = "structured" | "legacy";
export interface SourceExamQuestions {
  status: SourceExamStatus;
  questions: BuilderQuestion[];
  /** Entries present in the exam but skipped because they are not a supported canonical question. */
  skipped: number;
  shape: SourceExamShape | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const deepCopy = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** One raw (already deep-copied) entry → a canonical BuilderQuestion, or null when it is not a supported question. */
function canonicalQuestion(raw: unknown): BuilderQuestion | null {
  if (!isObj(raw)) return null;
  const { type, known } = canonicalizeType(raw.presentationType ?? raw.type);
  if (!known || !(BUILDER_QUESTION_TYPES as readonly string[]).includes(type)) return null;
  const marks = Number(raw.marks ?? raw.points);
  return {
    ...raw,
    presentationType: type as BuilderQuestionType,
    examQuestionId: typeof raw.examQuestionId === "string" && raw.examQuestionId ? raw.examQuestionId : genId("q"),
    text: typeof raw.text === "string" ? raw.text : "",
    marks: Number.isFinite(marks) ? marks : 0,
  } as BuilderQuestion;
}

/**
 * The importable canonical questions of an exam, in source order. Structured → sections[].questions[]; legacy →
 * questions[] (via legacyToStructured). The source object is never mutated: everything returned is a deep copy.
 */
export function questionsFromSourceExam(exam: unknown): SourceExamQuestions {
  if (!isObj(exam)) return { status: "unrecognized", questions: [], skipped: 0, shape: null };
  let raws: unknown[];
  let shape: SourceExamShape;
  if (Array.isArray(exam.sections)) {
    shape = "structured";
    raws = (deepCopy(exam.sections) as unknown[]).flatMap(s => (isObj(s) && Array.isArray(s.questions) ? s.questions : []));
  } else if (Array.isArray(exam.questions)) {
    shape = "legacy";
    raws = legacyToStructured(exam).sections[0]?.questions ?? [];   // the canonical (deep-copying) legacy conversion
  } else {
    return { status: "unrecognized", questions: [], skipped: 0, shape: null };
  }
  if (raws.length === 0) return { status: "empty", questions: [], skipped: 0, shape };
  const questions = raws.map(canonicalQuestion).filter((q): q is BuilderQuestion => q !== null);
  if (questions.length === 0) return { status: "unrecognized", questions: [], skipped: raws.length, shape };
  return { status: "ok", questions, skipped: raws.length - questions.length, shape };
}

/** A short, readable one-line preview of a question's text (compound falls back to its first part). */
export function questionPreviewText(q: BuilderQuestion, max = 120): string {
  const raw = (q.text || "").trim() || (q.parts || []).map(p => (p.text || "").trim()).find(Boolean) || "";
  const oneLine = raw.replace(/\s+/g, " ");
  return oneLine.length > max ? oneLine.slice(0, max - 1).trimEnd() + "…" : oneLine;
}

// ── Local JSON file import ────────────────────────────────────────────────────────────────────────────────────

export const JSON_IMPORT_MESSAGES = {
  tooLarge: "حجم الملف أكبر من الحد المسموح (" + Math.round(MAX_IMPORT_BYTES / (1024 * 1024)) + " ميغابايت).",
  malformed: "تعذّر قراءة ملف JSON. تأكّد من صحة الملف.",
  noExam: "لم يتم العثور على امتحان صالح في الملف.",
  noQuestions: "لا يحتوي الملف على أسئلة قابلة للاستيراد.",
  unrecognized: "تعذّر التعرّف على بنية أسئلة هذا الامتحان.",
} as const;

export type JsonExamImport =
  | { ok: true; title: string; sourceId: string; questions: BuilderQuestion[]; skipped: number; shape: SourceExamShape }
  | { ok: false; error: string };

const byteLength = (text: string) => new TextEncoder().encode(text).length;
const cap = (s: string, n = 200) => (s.length > n ? s.slice(0, n) : s);

/** Questions from a parseStructuredExamJson result: fatal parse problems → the parser's own concise reason. */
function fromParsed(parsed: ReturnType<typeof parseStructuredExamJson>, fallbackTitle: string, sourceId: string, shape: SourceExamShape): JsonExamImport {
  if (!parsed.canOpen || !parsed.exam) {
    const reason = parsed.parseErrors[0]?.message;
    return { ok: false, error: reason ? "تعذّر استيراد الامتحان من الملف: " + reason : JSON_IMPORT_MESSAGES.noExam };
  }
  const got = questionsFromSourceExam(parsed.exam);
  if (got.status === "empty") return { ok: false, error: JSON_IMPORT_MESSAGES.noQuestions };
  if (got.status !== "ok") return { ok: false, error: JSON_IMPORT_MESSAGES.unrecognized };
  return { ok: true, title: cap(parsed.exam.title || fallbackTitle), sourceId, questions: got.questions, skipped: got.skipped, shape };
}

/**
 * Parse a local exam .json file (text) into importable canonical questions. Accepts the canonical Structured Exam
 * JSON, a legacy flat exam ({ questions: [...] }), and either wrapped as a saved-exam document ({ exam: {...} }).
 * EVERY local file passes the EXISTING structured-import boundary, parseStructuredExamJson — the security authority
 * for imported exams (type aliases, generated ids, and the image-source sanitizer that strips external / SVG /
 * non-raster renderable sources). A legacy exam is first converted with the canonical legacyToStructured, then parsed
 * by that same function; there is no second parser and no second sanitizer here. Data only: nothing is executed,
 * fetched or stored. (Saved exams from /api/saved-exams are application-stored data and use questionsFromSourceExam.)
 */
export function parseExamJsonForChallenge(text: string, fileName: string): JsonExamImport {
  if (byteLength(text) > MAX_IMPORT_BYTES) return { ok: false, error: JSON_IMPORT_MESSAGES.tooLarge };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: JSON_IMPORT_MESSAGES.malformed }; }
  let wrapped = false;
  if (isObj(raw) && isObj(raw.exam) && !Array.isArray(raw.sections) && !Array.isArray(raw.questions)) { raw = raw.exam; wrapped = true; }
  if (!isObj(raw)) return { ok: false, error: JSON_IMPORT_MESSAGES.noExam };
  const originalId = typeof raw.examId === "string" ? raw.examId.trim() : "";
  const sourceId = cap("json:" + (originalId || fileName));

  if (Array.isArray(raw.sections)) {
    return fromParsed(parseStructuredExamJson(wrapped ? JSON.stringify(raw) : text, fileName), fileName, sourceId, "structured");
  }
  if (Array.isArray(raw.questions)) {
    // legacy flat → the canonical one-section structured exam → the SAME parser/security boundary as structured JSON
    return fromParsed(parseStructuredExamJson(JSON.stringify(legacyToStructured(raw)), fileName), fileName, sourceId, "legacy");
  }
  return { ok: false, error: JSON_IMPORT_MESSAGES.noExam };
}
