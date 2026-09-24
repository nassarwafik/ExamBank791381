// Teacher-side structured-exam types for the Structured Exam Builder (Phase 2).
//
// Design contract: a builder object is ALREADY in the engine-native shape that PR #51's student
// renderer and backend grader read (presentationType / type, fields, cli, tableHeaders/tableRows,
// parts, answer). The only difference from the student-facing types is that builder objects also
// carry the SECRET answer-key fields the teacher edits (question.answer, field.correct, part.answer).
// Those secrets stay server-side and are stripped by api/src/lib/student-exam-sanitize.js before an
// exam reaches a student — this module never weakens that. Because the builder edits the exact fields
// the engine consumes, there is no second copy of the questions and no transform layer: the same
// object is edited, saved, and graded.
//
// No React import — pure types + tiny constants, safe to import anywhere without cycles.

import type { ExamTheme } from "./examTheme";
import type { ExamCoverPage } from "./examCover";

export type { ExamCoverPage } from "./examCover";

export type GradingPolicy = "all" | "capScore" | "firstNAnswered";
export type AnswerUnit = "question" | "part";

// The question/part types the structured engine supports and the builder can author.
export type BuilderQuestionType =
  | "multipleChoice"
  | "trueFalse"
  | "multiTrueFalse"
  | "shortAnswer"
  | "fillBlank"
  | "wordBank"
  | "matching"
  | "ordering"
  | "tableFill"
  | "cliFill"
  | "compound";

// Part types are every question type EXCEPT compound (parts do not nest compounds in this phase).
export type BuilderPartType = Exclude<BuilderQuestionType, "compound">;

// Canonical, ordered registries of the authorable types. Defined ONCE here and shared by every authoring surface
// (the Structured Exam Builder / QuestionComposer today, the Live Challenge composer later) so the ordered lists are
// never duplicated per component. Frozen at runtime, matching the games-catalog registry convention. Display text
// always comes from QUESTION_TYPE_LABELS — these lists carry order + membership only.
export const BUILDER_QUESTION_TYPES: readonly BuilderQuestionType[] = Object.freeze([
  "multipleChoice", "trueFalse", "multiTrueFalse", "shortAnswer", "fillBlank", "wordBank", "matching", "ordering", "tableFill", "cliFill", "compound",
]);
// Parts allow every question type EXCEPT compound (no nested compounds) — derived from the single source above.
export const BUILDER_PART_TYPES: readonly BuilderPartType[] = Object.freeze(
  BUILDER_QUESTION_TYPES.filter((t): t is BuilderPartType => t !== "compound"),
);

export const QUESTION_TYPE_LABELS: Record<BuilderQuestionType, string> = {
  multipleChoice: "اختيار من متعدد",
  trueFalse: "صح أو خطأ",
  multiTrueFalse: "صح/خطأ متعدد",
  shortAnswer: "إجابة قصيرة / مفتوحة",
  fillBlank: "إكمال فراغات",
  wordBank: "مخزن كلمات",
  matching: "مطابقة",
  ordering: "ترتيب",
  tableFill: "إكمال جدول",
  cliFill: "أوامر CLI",
  compound: "سؤال مركّب"
};

export const GRADING_POLICY_LABELS: Record<GradingPolicy, string> = {
  all: "تصحيح جميع الأسئلة",
  capScore: "تصحيح الإجابات مع سقف للعلامة",
  firstNAnswered: "تصحيح أول عدد محدد من الإجابات"
};

export type BuilderOption = { value?: string; label?: string; text?: string };

// A generalized answer field (multiTrueFalse row, tableFill cell, cliFill blank, fill/wordBank blank).
// `correct` is the SECRET answer key — present on builder objects, stripped for students.
export type BuilderFieldKind = "text" | "select" | "boolean";
export type BuilderField = {
  id: string;
  label?: string;
  statement?: string; // multiTrueFalse row text
  kind?: BuilderFieldKind;
  row?: number; // tableFill cell coordinates
  column?: number;
  options?: BuilderOption[];
  correct?: string | boolean; // SECRET
};

// Phase 5B — optional asset metadata for parity with the AI endpoint's asset shape and local uploads.
// All optional and additive: existing/imported assets ({ dataUrl } only) remain valid, and the persisted
// AI prompt is deliberately NOT part of this shape (it is never stored on a structured question).
export type BuilderImageAsset = { dataUrl?: string; id?: string; origin?: "uploaded" | "ai-generated"; contentType?: string };
export type BuilderImage = { exists?: boolean; visible?: boolean; assets?: BuilderImageAsset[] };

// A compound question's independent subpart.
export type BuilderPart = {
  id: string;
  label?: string;
  type: BuilderPartType;
  text?: string;
  marks?: number; // when every part supplies marks they are used verbatim; otherwise the engine splits
  options?: BuilderOption[];
  fields?: BuilderField[];
  wordBank?: string[];
  cli?: string;
  tableHeaders?: string[];
  tableRows?: string[][];
  answer?: Record<string, unknown>; // SECRET (e.g. { correctOptionIndex }, { correct }, { text }, { mode, values })
};

export type BuilderQuestion = {
  examQuestionId: string; // stable internal identity — NEVER the display number
  displayNumber?: string; // editable printed number, may repeat across the exam
  presentationType: BuilderQuestionType;
  text: string;
  marks: number;
  options?: BuilderOption[];
  fields?: BuilderField[];
  wordBank?: string[];
  cli?: string;
  tableHeaders?: string[];
  tableRows?: string[][];
  parts?: BuilderPart[];
  groupId?: string; // links the question to a section stimulus
  image?: BuilderImage;
  images?: BuilderImageAsset[];
  answer?: Record<string, unknown>; // SECRET
};

// The type-specific answer body shared by both a question and a compound part, so one set of body
// editors and one set of pure helpers work for both. Identity/label/marks live outside this.
export type QuestionBody = {
  text?: string;
  options?: BuilderOption[];
  fields?: BuilderField[];
  wordBank?: string[];
  cli?: string;
  tableHeaders?: string[];
  tableRows?: string[][];
  answer?: Record<string, unknown>;
};

export type Stimulus = { title?: string; text?: string; image?: { dataUrl?: string } };

export type BuilderSection = {
  id: string;
  title: string;
  instructions?: string;
  maxMarks?: number | null;
  gradingPolicy: GradingPolicy;
  requiredAnswers?: number | null;
  answerUnit?: AnswerUnit;
  stimuli?: Record<string, Stimulus>;
  questions: BuilderQuestion[];
};

// A structured exam. Extra unknown fields from an existing saved exam are preserved on round-trip via
// the index signature (see toStructuredExam / fromStructuredExam in examBuilderState).
export type StructuredExam = {
  schemaVersion?: number;
  examId: string;
  title: string;
  presentationTheme?: ExamTheme;
  metadata?: Record<string, unknown>;
  totalMarks?: number;
  status?: "draft" | "final";
  createdAt?: string;
  updatedAt?: string;
  // OPTIONAL cover/start page, configured post-import. Absent on existing exams (they behave as before).
  coverPage?: ExamCoverPage;
  sections: BuilderSection[];
  // Canonical question tree is sections[].questions[] — a structured exam carries NO top-level
  // questions[] (legacyToStructured / toSavedStructuredExam / the save-exam-artifact cleaner all
  // strip it, so there is no competing/stale copy). The optional field remains only so an incoming
  // (e.g. legacy) object is assignable before conversion; it is never persisted on a structured exam.
  questions?: unknown[];
  [key: string]: unknown;
};

// A structured exam is any exam object carrying a `sections` array. A legacy flat exam (questions[]
// only) returns false and keeps its existing editor.
export const isStructuredExam = (exam: unknown): exam is StructuredExam =>
  !!exam && typeof exam === "object" && Array.isArray((exam as { sections?: unknown }).sections);

// Question count that works for BOTH exam shapes (used wherever the UI previously read
// exam.questions.length — assignment source guard, source count display, etc.). Structured exams count
// sections[].questions[]; legacy exams count questions[]. Never reads a stale questions[] on a
// structured exam.
export function examQuestionCount(exam: unknown): number {
  if (!exam || typeof exam !== "object") return 0;
  const e = exam as { sections?: unknown; questions?: unknown };
  if (Array.isArray(e.sections)) {
    return e.sections.reduce((n: number, s: unknown) => n + (Array.isArray((s as { questions?: unknown }).questions) ? (s as { questions: unknown[] }).questions.length : 0), 0);
  }
  return Array.isArray(e.questions) ? e.questions.length : 0;
}
export const examHasQuestions = (exam: unknown): boolean => examQuestionCount(exam) > 0;
