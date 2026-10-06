import type { AssessmentBlueprintV1, AssessmentMeta, AssessmentActivityDescriptor } from "./assessmentTypes";
import type { SimulationQuestionConfig } from "./smartsimManifest";
import type { CodingQuestionConfigV1 } from "./codingQuestion";
import type { NetworkCliQuestionConfigV1 } from "./networkCliQuestion";
import type { SmartSimEnvelopeV1 } from "./trustedSimQuestion";
import type { InlineClozeConfigV1 } from "./inlineClozeQuestion";
import type { HotspotConfigV1 } from "./hotspotQuestion";
import type { LabelDiagramConfigV1 } from "./labelDiagramQuestion";
import type { OpenResponseConfigV1 } from "./openResponseQuestion";
import type { CodeStimulus } from "./codeStimulus";
import type { RichContentV1 } from "./richContent/richContentModel";
import type { ExamPresentationV1, SectionPresentationV1, QuestionPresentationV1 } from "./presentation/presentationModel";
import type { ScenarioV1 } from "./scenarioSource";
import type { ParametricNumericConfigV1 } from "./parametricNumericQuestion";
import type { CompositeRootV1 } from "./compositeModel";
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
import { QUESTION_TYPE_CATALOG, compoundPartTypeKeys, type ProductionQuestionTypeKey } from "./questionTypeCatalog";

export type { ExamCoverPage } from "./examCover";

export type GradingPolicy = "all" | "capScore" | "firstNAnswered";
export type AnswerUnit = "question" | "part";

// The question/part types the structured engine supports and the builder can author. Review Fix 1 / R2-D: the compile-time
// union DERIVES from the `as const` production rows of the ONE canonical Question Type Catalog (src/questionTypeCatalog.ts) —
// adding a production type is one catalog row, never an edit here. Membership, order and labels at RUNTIME derive from the
// same catalog. Plugin types registered at module level (registerQuestionTypePlugin) are runtime data: they widen to `string`
// at the extension seams (listQuestionTypes / compoundPartTypeKeys / questionTypeLabel are the LIVE authorities every
// authoring, planning and student surface consults); the frozen constants below are the immutable PRODUCTION SNAPSHOT for
// callers that explicitly want production-only membership (structured import parity, Live Challenge source import).
export type BuilderQuestionType = ProductionQuestionTypeKey;

// Part types = every catalog type whose capability contract says `compoundPart` (compound never nests).
export type BuilderPartType = Exclude<BuilderQuestionType, "compound" | "composite">;

export const BUILDER_QUESTION_TYPES: readonly BuilderQuestionType[] = Object.freeze(QUESTION_TYPE_CATALOG.map(d => d.key as BuilderQuestionType));
export const BUILDER_PART_TYPES: readonly BuilderPartType[] = Object.freeze(compoundPartTypeKeys().filter(k => (BUILDER_QUESTION_TYPES as readonly string[]).includes(k)) as BuilderPartType[]);

export const QUESTION_TYPE_LABELS: Record<BuilderQuestionType, string> = Object.freeze(
  Object.fromEntries(QUESTION_TYPE_CATALOG.map(d => [d.key, d.label]))
) as Record<BuilderQuestionType, string>;

export const GRADING_POLICY_LABELS: Record<GradingPolicy, string> = {
  all: "تصحيح جميع الأسئلة",
  capScore: "تصحيح الإجابات مع سقف للعلامة",
  firstNAnswered: "تصحيح أول عدد محدد من الإجابات"
};

// `id` (Phase 16A) is the STABLE identity of an option for types whose answer key references options by identity
// (multipleSelect); legacy MCQ options stay index-addressed and never need one.
export type BuilderOption = { id?: string; value?: string; label?: string; text?: string };
// Phase 16A — Wave 1 type configuration (student-visible structure; every answer key lives ONLY under `answer`).
export type LabeledIdentity = { id: string; label: string };
export type NumericConfig = { unitRequired: boolean };
export type MatrixConfig = { rows: LabeledIdentity[]; columns: LabeledIdentity[] };
export type CategorizationConfig = { categories: LabeledIdentity[]; items: LabeledIdentity[] };

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
// `blobName` is the DURABLE identity of a bank image (origin "bank"); its `dataUrl` is a transient signed URL minted by the
// server whenever the exam is served (never authoritative persisted state).
export type BuilderImageAsset = { dataUrl?: string; id?: string; origin?: "uploaded" | "ai-generated" | "bank"; contentType?: string; blobName?: string };
export type BuilderImage = { exists?: boolean; visible?: boolean; assets?: BuilderImageAsset[] };

// A compound question's independent subpart.
export type BuilderPart = {
  id: string;
  label?: string;
  type: BuilderPartType;
  // Phase 16A — explicit type version (absent = the canonical V1 behaviour of the type; never bulk-written on legacy data).
  questionTypeVersion?: number;
  text?: string;
  marks?: number; // when every part supplies marks they are used verbatim; otherwise the engine splits
  options?: BuilderOption[];
  numeric?: NumericConfig;
  matrix?: MatrixConfig;
  categorization?: CategorizationConfig;
  // Phase 16B-A — the EXACT simulation package reference (simulation@1); never "latest".
  simulation?: SimulationQuestionConfig;
  // Phase 17A — the PUBLIC coding configuration (coding@1); private hidden tests / reference solutions live under `answer`.
  coding?: CodingQuestionConfigV1;
  // Phase 18C — the PUBLIC network CLI simulator configuration (networkCli@1: device + initial state); the private target state lives under `answer`.
  networkCli?: NetworkCliQuestionConfigV1;
  // Phase 19A — the PUBLIC inline cloze passage (inlineCloze@1: text + blank controls); accepted answers / correct options live under `answer`.
  inlineCloze?: InlineClozeConfigV1;
  // Phase 19B — the PUBLIC parametric config (parametricNumeric@1: generator version, variables, constraints, response presentation);
  // the answer expression / tolerance / required unit live under `answer`. A student receives only the per-attempt projection.
  parametric?: ParametricNumericConfigV1;
  // Phase 19F — an optional, PUBLIC, read-only code stimulus (predict the output / trace the execution) on any top-level question; the
  // answer stays the type's own. Strictly validated (./codeStimulus); never a part field.
  codeStimulus?: CodeStimulus;
  fields?: BuilderField[];
  wordBank?: string[];
  cli?: string;
  tableHeaders?: string[];
  tableRows?: string[][];
  answer?: Record<string, unknown>; // SECRET (e.g. { correctOptionIndex }, { correct }, { text }, { mode, values })
  assessmentMeta?: AssessmentMeta;
  // Phase 20D.1 — a composite@1 part's OPTIONAL rich prompt (never on compound@1 parts, which are frozen).
  richContent?: RichContentV1;
  activity?: AssessmentActivityDescriptor;
};

export type BuilderQuestion = {
  examQuestionId: string; // stable internal identity — NEVER the display number
  displayNumber?: string; // editable printed number, may repeat across the exam
  presentationType: BuilderQuestionType;
  // Phase 16A — explicit type version (absent = V1; a newly created Wave 1 question is stamped with its current version).
  questionTypeVersion?: number;
  text: string;
  // Phase 20D.1 — OPTIONAL rich stem (presentation only; `text` stays the plain fallback / search text) and the bounded question
  // presentation override. Academically inert: no grader, identity or marks function reads them.
  richContent?: RichContentV1;
  presentation?: QuestionPresentationV1;
  marks: number;
  options?: BuilderOption[];
  numeric?: NumericConfig;
  matrix?: MatrixConfig;
  categorization?: CategorizationConfig;
  // Phase 16B-A — the EXACT simulation package reference (simulation@1); never "latest".
  simulation?: SimulationQuestionConfig;
  // Phase 17A — the PUBLIC coding configuration (coding@1); private hidden tests / reference solutions live under `answer`.
  coding?: CodingQuestionConfigV1;
  // Phase 18C — the PUBLIC network CLI simulator configuration (networkCli@1: device + initial state); the private target state lives under `answer`.
  networkCli?: NetworkCliQuestionConfigV1;
  // Phase 20A — the PUBLIC trusted SmartSim envelope (smartSim@1: plugin identity + public config); the private weighted checks live under `answer`.
  smartSim?: SmartSimEnvelopeV1;
  // Phase 19A — the PUBLIC inline cloze passage (inlineCloze@1: text + blank controls); accepted answers / correct options live under `answer`.
  inlineCloze?: InlineClozeConfigV1;
  // Phase 19D — the PUBLIC visual configs (hotspot@1 / labelDiagram@1) on the canonical `image`; target regions / the correct mapping live under `answer`.
  hotspot?: HotspotConfigV1;
  labelDiagram?: LabelDiagramConfigV1;
  // Phase 19E — the PUBLIC open-response config (openResponse@1: profile, instructions, length bounds, rubric visibility); the rubric
  // (incl. private guidance) and the model answer live under `answer`.
  openResponse?: OpenResponseConfigV1;
  // Phase 19B — the PUBLIC parametric config (parametricNumeric@1: generator version, variables, constraints, response presentation);
  // the answer expression / tolerance / required unit live under `answer`. A student receives only the per-attempt projection.
  parametric?: ParametricNumericConfigV1;
  // Phase 19F — an optional, PUBLIC, read-only code stimulus (predict the output / trace the execution) on any top-level question; the
  // answer stays the type's own. Strictly validated (./codeStimulus); never a part field.
  codeStimulus?: CodeStimulus;
  fields?: BuilderField[];
  wordBank?: string[];
  cli?: string;
  tableHeaders?: string[];
  tableRows?: string[][];
  parts?: BuilderPart[];
  // Phase 20D — composite@1: the type-owned root (contexts + groups of heterogeneous children). NEVER `parts` (legacy compound detection).
  composite?: CompositeRootV1;
  groupId?: string; // links the question to a section stimulus
  image?: BuilderImage;
  images?: BuilderImageAsset[];
  answer?: Record<string, unknown>; // SECRET
  // Phase 13C-A — OPTIONAL, additive, domain-neutral pedagogical metadata (teacher planning data; stripped for students).
  assessmentMeta?: AssessmentMeta;
  // Phase 13C-A — OPTIONAL interactive CONTEXT (data descriptor only; never a scored response).
  activity?: AssessmentActivityDescriptor;
  // Phase 20F — an UNRESOLVED image request left by the AI composer (it never invents an image URL): a teacher-facing description of the
  // image the question needs. While present it BLOCKS finalization; the teacher attaches the image and removes the request. Teacher-only
  // (stripped for students); never academic data.
  assetRequest?: AssetRequestV1;
};
export type AssetRequestV1 = { v: 1; description: string };

// The type-specific answer body shared by both a question and a compound part, so one set of body
// editors and one set of pure helpers work for both. Identity/label/marks live outside this.
export type QuestionBody = {
  text?: string;
  questionTypeVersion?: number;
  options?: BuilderOption[];
  numeric?: NumericConfig;
  matrix?: MatrixConfig;
  categorization?: CategorizationConfig;
  // Phase 16B-A — the EXACT simulation package reference (simulation@1); never "latest".
  simulation?: SimulationQuestionConfig;
  // Phase 17A — the PUBLIC coding configuration (coding@1); private hidden tests / reference solutions live under `answer`.
  coding?: CodingQuestionConfigV1;
  // Phase 18C — the PUBLIC network CLI simulator configuration (networkCli@1: device + initial state); the private target state lives under `answer`.
  networkCli?: NetworkCliQuestionConfigV1;
  // Phase 20A — the PUBLIC trusted SmartSim envelope (smartSim@1: plugin identity + public config); the private weighted checks live under `answer`.
  smartSim?: SmartSimEnvelopeV1;
  // Phase 19A — the PUBLIC inline cloze passage (inlineCloze@1: text + blank controls); accepted answers / correct options live under `answer`.
  inlineCloze?: InlineClozeConfigV1;
  // Phase 19D — the PUBLIC visual configs (hotspot@1 / labelDiagram@1) on the canonical `image`; target regions / the correct mapping live under `answer`.
  hotspot?: HotspotConfigV1;
  labelDiagram?: LabelDiagramConfigV1;
  // Phase 19E — the PUBLIC open-response config (openResponse@1: profile, instructions, length bounds, rubric visibility); the rubric
  // (incl. private guidance) and the model answer live under `answer`.
  openResponse?: OpenResponseConfigV1;
  // Phase 19B — the PUBLIC parametric config (parametricNumeric@1: generator version, variables, constraints, response presentation);
  // the answer expression / tolerance / required unit live under `answer`. A student receives only the per-attempt projection.
  parametric?: ParametricNumericConfigV1;
  fields?: BuilderField[];
  wordBank?: string[];
  cli?: string;
  tableHeaders?: string[];
  tableRows?: string[][];
  answer?: Record<string, unknown>;
};

// Phase 13C-A — a shared stimulus may carry ONE interactive context (data descriptor) for every question in its group.
export type Stimulus = { title?: string; text?: string; image?: { dataUrl?: string }; activity?: AssessmentActivityDescriptor };

export type BuilderSection = {
  id: string;
  title: string;
  instructions?: string;
  maxMarks?: number | null;
  gradingPolicy: GradingPolicy;
  requiredAnswers?: number | null;
  answerUnit?: AnswerUnit;
  stimuli?: Record<string, Stimulus>;
  // Phase 19G — the section-owned SCENARIOS (shared sources + the ids of the SAME section's questions that read them). Presentation /
  // composition only: no grader, no marks, no answer; membership lives ONLY here (a question carries no scenario field). Strictly
  // validated (./scenarioSource); absent on every existing exam, never inferred from the legacy `stimuli` / `groupId` model.
  scenarios?: ScenarioV1[];
  // Phase 20D.1 — OPTIONAL rich section instructions (plain `instructions` stays the fallback) and the bounded section override.
  instructionsRichContent?: RichContentV1;
  presentation?: SectionPresentationV1;
  questions: BuilderQuestion[];
};

// A structured exam. Extra unknown fields from an existing saved exam are preserved on round-trip via
// the index signature (see toStructuredExam / fromStructuredExam in examBuilderState).
export type StructuredExam = {
  schemaVersion?: number;
  examId: string;
  title: string;
  presentationTheme?: ExamTheme;
  // Phase 20D.1 — OPTIONAL enterprise presentation (absent ⇒ the legacy presentationTheme path, unchanged). Never migrated automatically.
  presentation?: ExamPresentationV1;
  metadata?: Record<string, unknown>;
  totalMarks?: number;
  status?: "draft" | "final";
  createdAt?: string;
  updatedAt?: string;
  // OPTIONAL cover/start page, configured post-import. Absent on existing exams (they behave as before).
  coverPage?: ExamCoverPage;
  // Phase 13C-A — OPTIONAL canonical assessment blueprint (teacher planning data; never delivered to students).
  // Absent on every existing exam: nothing is inferred or migrated by opening / saving.
  blueprint?: AssessmentBlueprintV1;
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
