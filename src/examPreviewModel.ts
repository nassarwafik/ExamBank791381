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

// Grading/teacher-only secret keys that must NEVER reach a preview. This is a STRICT SUPERSET of the real
// student sanitizer (api/src/lib/student-exam-sanitize.js): every key that sanitizer treats as
// secret/import-only is included here, plus defensive extras for foreign / imported exam shapes. The
// preview sanitizer may be stricter than the student one, never weaker.
export const PREVIEW_SECRET_KEYS: readonly string[] = [
  // answer keys / grading flags (student sanitizer FLAG_SECRET_KEYS + node answer keys)
  "answer", "answers",
  "correct", "isCorrect", "correctText",
  "correctAnswer", "correctAnswers",
  "correctOption", "correctOptions", "correctOptionIndex", "correctOptionValue", "correctOptionLabel",
  "expectedAnswer", "expected",
  "answerKey", "answerKeys",
  "solution", "modelAnswer", "rubric",
  "gradingKey", "grading", "manualGrade",
  // teacher-side / edit-history / rationale (student sanitizer NODE_SECRET_KEYS)
  "teacherNote", "teacherOnly", "aiInstruction", "hint",
  "history", "redoStack", "explanation", "rationale",
  // import-only provenance (student sanitizer IMPORT_ONLY_IMAGE_KEYS + top-level revisionHistory)
  "externalUrl", "importMeta", "revisionHistory"
];

import { sanitizeCoverForStudent } from "./examCover";

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

// Deep-clone + deep-scrub. Returns a safe, display-only copy; the input is never mutated. Mirrors the real
// student sanitizer's top-level protections: `revisionHistory` (via the denylist) and `metadata.import`
// (import provenance — removed explicitly, since "import" is too generic to denylist globally).
export function toSafePreviewExam<T extends PreviewExamInput>(exam: T): T {
  const clone = JSON.parse(JSON.stringify(exam ?? {})) as T;
  if (clone.metadata && typeof clone.metadata === "object" && "import" in (clone.metadata as Record<string, unknown>)) {
    delete (clone.metadata as Record<string, unknown>).import;
  }
  scrub(clone);
  // Cover parity with the real student sanitizer: the recursive denylist above only removes KNOWN secret
  // keys, so unknown teacher/foreign cover fields and an unsafe banner could otherwise survive. Replace the
  // whole coverPage with the existing cover authority's allowlist result (known display fields only; banner
  // kept only when it is a safe embedded raster data URL) so the safe preview model is safe BY ITSELF —
  // never dependent on a second sanitizer at render time. `undefined` (no/invalid cover) drops the key.
  if ("coverPage" in clone) clone.coverPage = sanitizeCoverForStudent(clone.coverPage);
  // Media parity with the real student sanitizer (applyStudentMediaVisibility): hidden question/part media — and a
  // legacy images[] fallback that would otherwise re-show it — never appears in the preview, so the teacher previews
  // exactly the images the student receives.
  for (const section of Array.isArray(clone.sections) ? clone.sections : []) {
    const questions = (section as { questions?: unknown }).questions;
    if (Array.isArray(questions)) questions.forEach(previewMediaVisibility);
  }
  if (Array.isArray(clone.questions)) clone.questions.forEach(previewMediaVisibility);
  return clone;
}

type MediaNode = { image?: unknown; images?: unknown; parts?: unknown };
// Same rule as the student sanitizer: canonical SHOWN (exists && visible) → its assets, images[] dropped (never
// rendered); canonical HIDDEN (exists && assets non-empty && visible === false) → no assets and no images[];
// otherwise (no canonical image, e.g. legacy images[]-only) → images[] unchanged. Applied to compound parts too.
function previewMediaVisibility(node: unknown): void {
  if (!node || typeof node !== "object") return;
  const n = node as MediaNode;
  const img = n.image && typeof n.image === "object" && !Array.isArray(n.image) ? (n.image as { exists?: unknown; visible?: unknown; assets?: unknown }) : null;
  if (img) {
    const shown = !!(img.exists && img.visible && Array.isArray(img.assets));
    const hidden = !!(img.exists && Array.isArray(img.assets) && img.assets.length && img.visible === false);
    if (!shown) n.image = { exists: img.exists, visible: img.visible };   // flags only: no assets / bytes
    if ((shown || hidden) && "images" in n) n.images = [];
  }
  if (Array.isArray(n.parts)) n.parts.forEach(previewMediaVisibility);
}

// Exam-level general instructions (plain text) → clean bullet lines for safe rendering. Never HTML.
export function generalInstructionLines(exam: PreviewExamInput | null | undefined): string[] {
  const raw = exam?.metadata && typeof exam.metadata === "object"
    ? (exam.metadata as Record<string, unknown>).generalInstructions
    : undefined;
  return String(raw ?? "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}
