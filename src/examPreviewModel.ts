// Roadmap #15 — the SINGLE safe display model for every teacher-facing exam preview.
//
// A teacher preview can originate from an exam object that still contains the grading secrets the
// teacher edits (question.answer, part.answer, field.correct, option.correct/isCorrect, plus foreign
// import metadata). `toSafePreviewExam` is the ONE enforcement point that removes ALL such secrets —
// recursively, from BOTH a structured exam (sections[].questions[]) and a legacy flat exam
// (questions[]) — before anything reaches a student-runtime renderer, its props, the DOM, or a
// serialized preview model. It never mutates the source (deep clone first) and never touches the
// authoritative marks/structure (those stay so the preview total equals the graded total).
//
// This supersedes the older per-field whitelist in ExamThemePreview.toPreviewQuestion(): rather than
// trusting a hand-maintained allowlist per call site, we deep-scrub a known denylist everywhere, so a
// secret nested inside an option, a field option, a compound part, or an imported foreign key can never
// slip through into a preview.

// Grading/teacher-only secret keys that must NEVER reach a preview. Superset of the documented builder
// schema secrets plus defensive extras for foreign / imported exam shapes.
export const PREVIEW_SECRET_KEYS: readonly string[] = [
  "answer", "answers",
  "correct", "isCorrect",
  "correctAnswer", "correctAnswers",
  "correctOption", "correctOptions", "correctOptionIndex",
  "expectedAnswer", "expected",
  "answerKey", "answerKeys",
  "solution", "modelAnswer", "rubric",
  "gradingKey", "grading", "manualGrade",
  "teacherNote", "teacherOnly", "aiInstruction", "hint", "importMeta"
];

const SECRET = new Set(PREVIEW_SECRET_KEYS);

// Recursively delete every secret key and descend into every remaining object/array value. Small
// preview exams only; the walk is intentionally exhaustive so no nesting depth (option → field →
// part → body) can hide a key.
function scrub(node: unknown): void {
  if (Array.isArray(node)) { for (const v of node) scrub(v); return; }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (SECRET.has(key)) { delete obj[key]; continue; }
    const value = obj[key];
    if (value && typeof value === "object") scrub(value);
  }
}

// A permissive structural exam shape — accepts the builder StructuredExam, a legacy flat App exam, and a
// library examSnapshot without any import coupling to those modules.
export type PreviewExamInput = {
  title?: string;
  presentationTheme?: string;
  metadata?: Record<string, unknown> | null;
  coverPage?: unknown;
  sections?: unknown[];
  questions?: unknown[];
} & Record<string, unknown>;

// Deep-clone + deep-scrub. Returns a safe, display-only copy; the input is never mutated.
export function toSafePreviewExam<T extends PreviewExamInput>(exam: T): T {
  const clone = JSON.parse(JSON.stringify(exam ?? {})) as T;
  scrub(clone);
  return clone;
}

// Exam-level general instructions (plain text) → clean bullet lines for safe rendering. Never HTML.
export function generalInstructionLines(exam: PreviewExamInput | null | undefined): string[] {
  const raw = exam?.metadata && typeof exam.metadata === "object"
    ? (exam.metadata as Record<string, unknown>).generalInstructions
    : undefined;
  return String(raw ?? "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}
