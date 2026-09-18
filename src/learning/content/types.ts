// Learning Materials — Phase 2: the CANONICAL content model for interactive books.
//
// Hierarchy:  Course → Module → Lesson → Page → Blocks.
//
// This module defines TYPES ONLY (plus tiny pure helpers): no React, no network, no content bodies. It is the
// single source of truth the future Reader (Phase 3), Practice (Phase 4) and Simulations (Phase 5) will build on.
// Design rules honored here:
//   • Strongly-typed discriminated block union — never `Record<string, any>` / raw HTML as the content authority.
//   • Stable, position-independent IDs (see ID policy in docs/learning-content-architecture.md).
//   • Source traceability: every production Page records which original PDF page produced it.
//   • Mixed direction: the course is RTL, but individual blocks/fragments may opt into `dir: "ltr"` (CLI, IPv4…).
//   • Content order (reader position) is SEPARATE from source PDF page (traceability only).

/** Bump when the shape changes in a way that stored content must migrate to. */
export const LEARNING_CONTENT_SCHEMA_VERSION = 1 as const;

/** Writing direction. The course is RTL; technical blocks/spans may opt into LTR. */
export type ContentDirection = "rtl" | "ltr";

// ────────────────────────────────────────────────────────────────────────────
// Source traceability (§11) — "which original PDF page produced this page?"
// ────────────────────────────────────────────────────────────────────────────
export type ContentSource = {
  kind: "book";
  /** The owner book id — connects content back to the Phase-1 catalog course (e.g. "791381"). */
  sourceId: string;
  /** 1-based PDF page where this content starts (NOT the reader position, NOT the printed page). */
  pdfPageStart: number;
  /** 1-based PDF page where it ends, when a page spans a range. */
  pdfPageEnd?: number;
  /** The number PRINTED on the source page, which differs from the PDF page index. */
  printedPage?: number;
  /** Free-form provenance note (kept short). */
  sourceNote?: string;
};

// ────────────────────────────────────────────────────────────────────────────
// Safe inline text model (§13/§15) — structured spans, never raw HTML.
// ────────────────────────────────────────────────────────────────────────────
export type InlineStyle = "strong" | "em" | "term" | "code";
/** One run of inline text with an optional style and an optional inline direction (LTR term in RTL text). */
export type InlineSpan = { text: string; style?: InlineStyle; dir?: ContentDirection };
/** Ordered inline spans making up a paragraph / rich string. */
export type RichText = InlineSpan[];

// ────────────────────────────────────────────────────────────────────────────
// Provenance (OWNER §1) — faithful book-derived content vs added educational enrichment.
// This keeps the original book and any teacher-added material ALWAYS distinguishable. AI-generated provenance is
// deliberately NOT introduced here (that is Phase 8).
// ────────────────────────────────────────────────────────────────────────────
export type ContentOrigin = "book" | "teacher-enrichment";
export const CONTENT_ORIGINS: readonly ContentOrigin[] = ["book", "teacher-enrichment"];

// ────────────────────────────────────────────────────────────────────────────
// Block families (§12/§13) — discriminated union on `type`; every block has an id.
// ────────────────────────────────────────────────────────────────────────────
export interface BlockBase {
  id: string;
  /** Optional per-block direction override (defaults to the lesson/course direction). */
  dir?: ContentDirection;
  /**
   * Provenance (OWNER §1/§2). MANDATORY and never defaulted: every block must consciously declare "book"
   * (faithful source content) or "teacher-enrichment" (added examples / practice / hints / simulations /
   * clarifications / added visuals). There is NO silent default — a block can never accidentally masquerade as
   * the book. The validator additionally requires clarification callouts, practice and simulation to be
   * teacher-enrichment (origin-policy-violation).
   */
  origin: ContentOrigin;
  /**
   * Optional BLOCK-level source (OWNER §2). Inheritance rule:
   *   • origin "book" → may omit `source` and INHERIT the page's source (see `effectiveBlockSource`).
   *   • origin "teacher-enrichment" → `source` is optional because the block is explicitly supplementary.
   * When present, `source.sourceId` must still equal the course id (validated).
   */
  source?: ContentSource;
}

export interface TextBlock extends BlockBase { type: "text"; spans: RichText; }
export interface HeadingBlock extends BlockBase { type: "heading"; text: string; level: 2 | 3 | 4; }
export interface ImageBlock extends BlockBase {
  type: "image";
  src: string;
  /** Required unless `decorative` is true (accessibility, §13). */
  alt: string;
  caption?: string;
  decorative?: boolean;
}

// "clarification" is the OWNER-required, clearly-separate teacher note used INSTEAD of silently "correcting" an
// apparent source typo/inconsistency (OWNER Book-Fidelity rule). It is always authored as origin:"teacher-enrichment".
export type CalloutKind = "remember" | "important" | "warning" | "tip" | "summary" | "clarification";
/** Book "boxes" such as تذكّر / الخلاصة / الفكرة map here; "clarification" carries a separable teacher note. */
export interface CalloutBlock extends BlockBase { type: "callout"; kind: CalloutKind; title?: string; spans: RichText; }

/** One step of a worked example (structured, not a single blob string). */
export type ExampleStep = { text: string; note?: string };
/**
 * `mode` (OWNER §6/§7): a "solved" example (مثال محلول) shows full steps + result + optional explanation; a
 * "practice" example (مثال للحل) presents the problem for the student to attempt. Omitted ⇒ "solved". Interactive
 * answer checking + immediate feedback lives on the PracticeBlock, not here.
 */
export type ExampleMode = "solved" | "practice";
export const EXAMPLE_MODES: readonly ExampleMode[] = ["solved", "practice"];
export interface ExampleBlock extends BlockBase {
  type: "example";
  mode?: ExampleMode;
  title?: string;
  prompt?: string;
  steps: ExampleStep[];
  result?: string;
  explanation?: string;
}

export interface TableBlock extends BlockBase {
  type: "table";
  caption?: string;
  headers: string[];
  /** Row-major cells; every row should match `headers.length` (validated). */
  rows: string[][];
}

export type CodeLanguage = "cli" | "text" | "config";
/** Commands / syntax. Whitespace preserved; usually `dir:"ltr"` even inside an RTL lesson. */
export interface CodeBlock extends BlockBase { type: "code"; language: CodeLanguage; code: string; }

/** A semantic learning diagram: a local image asset + metadata. NO simulation behavior (that is Phase 5). */
export interface DiagramBlock extends BlockBase {
  type: "diagram";
  /** Local asset reference (optional in Phase 2 — a diagram may be metadata-only until conversion). */
  src?: string;
  /** Required unless `decorative` is true (accessibility, §13). */
  alt: string;
  decorative?: boolean;
  diagramType?: string;
  caption?: string;
}

// Lightweight interactive PRACTICE (OWNER §7/§8/§9, §25) — أمثلة للحل / تدريب. This is educational content only:
// NOT the ExamBank exam schema, NOT graded, NOT a rank/medal input. Immediate-feedback fields are carried here so
// Phase 4 can render check-answer / correct-incorrect / hint / retry without a schema redesign.
export type PracticeFeedback = {
  hint?: string;
  correctFeedback?: string;
  incorrectFeedback?: string;
  explanation?: string;
};
export type PracticeOption = { id: string; text: string; correct?: boolean };
/**
 * Base practice-question kinds modeled in Phase 2. EXTENSION PATH (OWNER §9): richer kinds — matching, ordering,
 * classify/categorize, binary-value entry, IP/CIDR calculation, CLI command entry — are added as NEW members of
 * this union (their interactive forms may also be expressed as `simulation` blocks); nothing here needs to change
 * and the ExamBank exam schema is never duplicated.
 */
export type PracticeQuestion =
  | { kind: "multipleChoice"; prompt: string; options: PracticeOption[]; feedback?: PracticeFeedback }
  | { kind: "trueFalse"; prompt: string; answer?: boolean; feedback?: PracticeFeedback }
  | { kind: "shortInput"; prompt: string; answer?: string; feedback?: PracticeFeedback }
  | { kind: "fillBlank"; prompt: string; answers?: string[]; feedback?: PracticeFeedback };
export type PracticeQuestionKind = PracticeQuestion["kind"];
export const PRACTICE_QUESTION_KINDS: readonly PracticeQuestionKind[] = ["multipleChoice", "trueFalse", "shortInput", "fillBlank"];
export interface PracticeBlock extends BlockBase { type: "practice"; question: PracticeQuestion; }

/** Supported simulation kinds (§13). A controlled registry maps these to components later (Phase 5). */
export type SimulationType = "network-flow" | "binary-box" | "subnet" | "vlan" | "cli";
/** Phase-2 placeholder contract only: a typed minimal descriptor — detailed configs are deferred to Phase 5. */
export interface SimulationBlock extends BlockBase {
  type: "simulation";
  simulationType: SimulationType;
  title: string;
  description?: string;
}

/** The canonical, strongly-typed block union. */
export type ContentBlock =
  | TextBlock
  | HeadingBlock
  | ImageBlock
  | CalloutBlock
  | ExampleBlock
  | TableBlock
  | CodeBlock
  | DiagramBlock
  | PracticeBlock
  | SimulationBlock;

export type BlockType = ContentBlock["type"];
/** The closed set of supported block types (used by the validator; keep in sync with the union). */
export const BLOCK_TYPES: readonly BlockType[] = [
  "text", "heading", "image", "callout", "example", "table", "code", "diagram", "practice", "simulation",
];
export const CALLOUT_KINDS: readonly CalloutKind[] = ["remember", "important", "warning", "tip", "summary", "clarification"];
export const SIMULATION_TYPES: readonly SimulationType[] = ["network-flow", "binary-box", "subnet", "vlan", "cli"];
export const CODE_LANGUAGES: readonly CodeLanguage[] = ["cli", "text", "config"];

// ────────────────────────────────────────────────────────────────────────────
// Hierarchy: Course → Module → Lesson → Page. Page is the future Reader unit.
// ────────────────────────────────────────────────────────────────────────────
export interface ContentPage {
  id: string;
  title: string;
  /** Position within its lesson (authoritative; NOT the array index). */
  order: number;
  blocks: ContentBlock[];
  /**
   * REQUIRED for production pages: the source mapping — which original PDF page(s) produced this interactive page
   * (§11, OWNER §4/§5). `source` IS the page's source mapping (`{sourceId, pdfPageStart, pdfPageEnd?}`), so no
   * duplicate `sourceMapping` field is introduced. Default mapping is 1 book page → 1 interactive page; a
   * controlled split (one dense page → two interactive pages) or merge (two small adjacent pages → one) is
   * expressed by the page range + `conversionNote`, and never loses the exact source reference.
   */
  source: ContentSource;
  /** Optional human note explaining a controlled split/merge or other conversion decision (OWNER §5). */
  conversionNote?: string;
  subtitle?: string;
  learningObjective?: string;
  keywords?: string[];
}

/** The explicit provenance of a block. Returns the declared value; it never invents provenance. */
export function blockOrigin(block: BlockBase): ContentOrigin {
  return block.origin;
}

/**
 * The effective source of a block (OWNER §2 inheritance rule, unchanged): an explicit block `source` wins;
 * otherwise a book-origin block inherits its page's source, and a teacher-enrichment block without a source has
 * none. (A block missing/invalid `origin` is a validation error and does not inherit book provenance here.)
 */
export function effectiveBlockSource(page: ContentPage, block: BlockBase): ContentSource | undefined {
  if (block.source) return block.source;
  return block.origin === "book" ? page.source : undefined;
}

export interface ContentLesson {
  id: string;
  title: string;
  description?: string;
  order: number;
  pages: ContentPage[];
  estimatedMinutes?: number;
}

export interface ContentModule {
  id: string;
  title: string;
  shortTitle?: string;
  description?: string;
  order: number;
  lessons: ContentLesson[];
  /** Modules may carry their own coarse source range. */
  source?: ContentSource;
}

export interface LearningCourseContent {
  schemaVersion: number;
  /** Connects the content to the Phase-1 catalog course (must equal a catalog course id). */
  courseId: string;
  title: string;
  direction: ContentDirection;
  modules: ContentModule[];
}

// ────────────────────────────────────────────────────────────────────────────
// Lightweight MANIFEST (§18) — module/lesson/page identities WITHOUT block bodies.
// Used for the table of contents, jump navigation, search indexing and lazy loading:
// the reader can show a full TOC without loading a single page body.
// ────────────────────────────────────────────────────────────────────────────
export interface PageRef {
  id: string;
  title: string;
  order: number;
  source?: ContentSource;
  keywords?: string[];
}
export interface LessonRef {
  id: string;
  title: string;
  order: number;
  pages: PageRef[];
}
export interface ModuleRef {
  id: string;
  title: string;
  shortTitle?: string;
  order: number;
  lessons: LessonRef[];
}
/** Optional presentation grouping: a Phase-1 "batch" can span MULTIPLE modules (§29). */
export interface BatchRef {
  id: string;
  label: string;
  moduleIds: string[];
}
export interface LearningCourseManifest {
  schemaVersion: number;
  courseId: string;
  title: string;
  direction: ContentDirection;
  modules: ModuleRef[];
  batches?: BatchRef[];
}

/** Derive the lightweight manifest from full content (drops all block bodies). Pure. */
export function deriveManifest(content: LearningCourseContent): LearningCourseManifest {
  return {
    schemaVersion: content.schemaVersion,
    courseId: content.courseId,
    title: content.title,
    direction: content.direction,
    modules: content.modules.map(m => ({
      id: m.id,
      title: m.title,
      shortTitle: m.shortTitle,
      order: m.order,
      lessons: m.lessons.map(l => ({
        id: l.id,
        title: l.title,
        order: l.order,
        pages: l.pages.map(p => ({ id: p.id, title: p.title, order: p.order, source: p.source, keywords: p.keywords })),
      })),
    })),
  };
}
