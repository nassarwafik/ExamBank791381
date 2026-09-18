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
  /** Legacy single hint (kept for backward compatibility). Prefer the ordered `hints` ladder below. */
  hint?: string;
  /**
   * Ordered HINT LADDER (تلميح 1 → تلميح 2 → …). Phase 4 reveals these one at a time on request; Phase 3 never
   * renders them (answer-key secrecy). Backward-compatible: `hintLadder(feedback)` folds the legacy `hint` in.
   */
  hints?: string[];
  correctFeedback?: string;
  incorrectFeedback?: string;
  explanation?: string;
};
/** The ordered hint ladder for a feedback object, folding the legacy single `hint` in (BC). Pure; part of the
 *  Phase-3A foundation so Phase 4 needs no schema redesign. It is answer-key material — never rendered in Phase 3. */
export function hintLadder(feedback: PracticeFeedback | undefined): string[] {
  if (!feedback) return [];
  if (feedback.hints && feedback.hints.length > 0) return feedback.hints;
  return feedback.hint ? [feedback.hint] : [];
}
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

// ────────────────────────────────────────────────────────────────────────────
// Interactive Learning Engine (Phase 3A) — activity descriptor contract.
//
// The four interactive families (simulation / animation / guided / interactive-diagram) are ENRICHMENT layers
// (never faithful book content — enforced by the validator). They are pure DATA DESCRIPTORS: content supplies a
// registry KEY (a plain string such as "vlan") and an opaque, engine-validated `config` — NEVER a component name,
// a function, a module path, or any executable code. The trusted activity registry (src/learning/activities/) maps
// {family,key,version} → a component authored in THIS repo. Phase 3A ships the registry-backed production registry
// EMPTY (no real simulation/animation) plus one generic built-in presenter (guided/reveal/v1); any descriptor with
// no trusted renderer for its exact identity renders a faithful static fallback, so a page is always usable. `version` lets a
// renderer refuse a descriptor shape it does not understand (falling back) without a schema break.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Capabilities an activity RENDERER may declare. These are the authority for which shell controls appear: the
 * shell exposes a control ONLY when the registered renderer (or a built-in one) declares it — never because
 * untrusted content data asked for it, and never as a fake button the renderer cannot honor. `fullscreen`,
 * `reset` and `replay` drive generic shell controls; `pause`/`speed` are declared here so the contract is
 * future-safe (a renderer-specific control can honor them later) without an engine redesign; `animated` /
 * `interactive` are informational hints.
 */
export interface ActivityCapabilities {
  /** The activity has a meaningful expanded/fullscreen mode (the shell offers a توسيع affordance). */
  fullscreen?: boolean;
  /** The renderer can reset to its initial state (the shell offers an إعادة تعيين control → `reset` command). */
  reset?: boolean;
  /** The renderer can replay from the start (the shell offers an إعادة التشغيل control → `replay` command). */
  replay?: boolean;
  /** The renderer supports pause/resume (reserved; honored by a renderer-specific control, not a generic button). */
  pause?: boolean;
  /** The renderer supports variable speed (reserved; honored by a renderer-specific control). */
  speed?: boolean;
  /** The activity animates and must honor reduced-motion (the shell enforces the contract regardless). */
  animated?: boolean;
  /** The activity accepts keyboard/pointer interaction (informational; shells stay keyboard-accessible anyway). */
  interactive?: boolean;
}

/** The generic shell COMMANDS an activity renderer can be asked to perform (gated by `ActivityCapabilities`). */
export type ActivityCommand = "reset" | "replay";
export const ACTIVITY_COMMANDS: readonly ActivityCommand[] = ["reset", "replay"];
/** Every capability flag is a plain boolean; the validator rejects any non-boolean (see `activity-invalid-capabilities`). */
export const ACTIVITY_CAPABILITY_KEYS: readonly (keyof ActivityCapabilities)[] = [
  "fullscreen", "reset", "replay", "pause", "speed", "animated", "interactive",
];

/** A faithful STATIC fallback shown when no live renderer is available (EMPTY production registry, unsupported
 *  version, or a runtime error). It is book/enrichment-safe content only — never an answer key. */
export interface ActivityFallback {
  /** A short faithful description of what the activity would show. */
  text?: string;
  /** An optional already-vetted static image/diagram. */
  src?: string;
  /** Required (for the image) unless the fallback is text-only. */
  alt?: string;
}

/** Fields shared by every interactive-activity block. `config` is opaque data handed to the (future) renderer and
 *  engine-validated — it is NEVER executed and never carries a component/function/path. */
interface ActivityBlockBase extends BlockBase {
  /** Descriptor version — a positive integer the renderer matches against its supported versions. */
  version: number;
  title: string;
  description?: string;
  capabilities?: ActivityCapabilities;
  fallback?: ActivityFallback;
  /** Opaque, engine-validated configuration passed to the trusted renderer. Data only; never executed. */
  config?: Record<string, unknown>;
}

/** Native interactive simulation (e.g. VLAN/subnet/CLI). `simulationType` is a trusted registry KEY, not a name. */
export interface SimulationBlock extends ActivityBlockBase {
  type: "simulation";
  /** Trusted registry key (e.g. "vlan"). Resolved by the registry to a repo component — never executed as code. */
  simulationType: string;
}
/** A guided, stepped animation of a concept (e.g. a packet traversing a path). Registry key = `animationType`. */
export interface AnimationBlock extends ActivityBlockBase {
  type: "animation";
  animationType: string;
}
/** One step of a guided walkthrough (حل مع المعلم). `text` is structured safe spans — never raw HTML. */
export interface GuidedStep {
  /** Stable id (progressive-reveal state and future analytics key off it). */
  id: string;
  text: RichText;
  note?: string;
}
/**
 * A guided walkthrough (حل مع المعلم): a prompt → "think first" → progressively revealed steps → result +
 * explanation. It is a STRUCTURED learning model rendered by a built-in progressive-reveal presenter (not a bespoke
 * simulation), so it needs no registered component; `guidedType` selects the presenter variant ("reveal" default)
 * and keeps guided uniform with the other activity families (version, capabilities, origin enforcement).
 */
export interface GuidedBlock extends ActivityBlockBase {
  type: "guided";
  /** Presenter variant key (default "reveal"); the built-in progressive-reveal presenter handles it. */
  guidedType: string;
  /** Optional opening prompt shown before the student reveals any step. */
  prompt?: RichText;
  /** Ordered steps, revealed one at a time. Must be non-empty (validated). */
  steps: GuidedStep[];
  /** Optional final result, revealed after the last step. */
  result?: RichText;
  /** Optional closing explanation. */
  explanation?: string;
}
/** A diagram the student can inspect/toggle (hotspots, layer toggles). Registry key = `interactionType`. */
export interface InteractiveDiagramBlock extends ActivityBlockBase {
  type: "interactive-diagram";
  interactionType: string;
}

/** The interactive-activity family. All are enrichment-only (validated). */
export type ActivityBlock = SimulationBlock | AnimationBlock | GuidedBlock | InteractiveDiagramBlock;
export type ActivityBlockType = ActivityBlock["type"];
export const ACTIVITY_BLOCK_TYPES: readonly ActivityBlockType[] = ["simulation", "animation", "guided", "interactive-diagram"];

/** True when a block is one of the interactive-activity families (narrows to `ActivityBlock`). */
export function isActivityBlock(block: { type?: string }): block is ActivityBlock {
  return typeof block?.type === "string" && (ACTIVITY_BLOCK_TYPES as readonly string[]).includes(block.type);
}

/** The trusted registry KEY an activity block declares (the plain string; never a component/function/path). The
 *  key field differs per family (simulationType / animationType / guidedType / interactionType) so authoring stays
 *  self-describing; this helper gives the engine one uniform accessor. */
export function activityKey(block: ActivityBlock): string {
  switch (block.type) {
    case "simulation": return block.simulationType;
    case "animation": return block.animationType;
    case "guided": return block.guidedType;
    case "interactive-diagram": return block.interactionType;
  }
}

/** A uniform descriptor view of any activity block (family + key + version + capabilities), for the engine/registry. */
export interface ActivityDescriptor {
  kind: ActivityBlockType;
  key: string;
  version: number;
  capabilities?: ActivityCapabilities;
}
/** Pure projection of an activity block to its descriptor. Never invents fields. */
export function activityDescriptor(block: ActivityBlock): ActivityDescriptor {
  return { kind: block.type, key: activityKey(block), version: block.version, capabilities: block.capabilities };
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
  | SimulationBlock
  | AnimationBlock
  | GuidedBlock
  | InteractiveDiagramBlock;

export type BlockType = ContentBlock["type"];
/** The closed set of supported block types (used by the validator; keep in sync with the union). */
export const BLOCK_TYPES: readonly BlockType[] = [
  "text", "heading", "image", "callout", "example", "table", "code", "diagram", "practice",
  "simulation", "animation", "guided", "interactive-diagram",
];
export const CALLOUT_KINDS: readonly CalloutKind[] = ["remember", "important", "warning", "tip", "summary", "clarification"];
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
