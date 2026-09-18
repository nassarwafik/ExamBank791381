// Learning Materials — Phase 2: deterministic, pure content validator.
//
// `validateLearningCourseContent()` returns a list of structured issues; it NEVER throws for normal content
// errors and NEVER mutates/normalizes/reorders/invents anything (§21). Callers branch on `issue.code`
// (a stable enum), never on the human Arabic-or-English `message`. An empty array means "no problems found".

import {
  BLOCK_TYPES, CALLOUT_KINDS, CODE_LANGUAGES, CONTENT_ORIGINS, EXAMPLE_MODES, ACTIVITY_CAPABILITY_KEYS,
  LEARNING_CONTENT_SCHEMA_VERSION, isActivityBlock, activityKey,
  type LearningCourseContent, type ContentBlock, type ActivityBlock, type ContentSource, type ContentDirection,
} from "./types";
import { findLearningCourse } from "../catalog";

/** Stable issue codes — behavior is driven by these, not by message text (§19). */
export type ContentIssueCode =
  | "schema-version-mismatch"
  | "unknown-course"
  | "missing-id"
  | "duplicate-id"
  | "missing-title"
  | "empty-modules"
  | "empty-lessons"
  | "empty-pages"
  | "page-no-blocks"
  | "invalid-order"
  | "duplicate-order"
  | "missing-source"
  | "invalid-source-page"
  | "source-id-mismatch"
  | "missing-origin"
  | "invalid-origin"
  | "origin-policy-violation"
  | "invalid-example-mode"
  | "unsupported-block-type"
  | "image-missing-alt"
  | "invalid-direction"
  | "quiz-empty-options"
  | "quiz-mcq-answer-count"
  | "activity-missing-key"
  | "activity-invalid-version"
  | "activity-missing-title"
  | "activity-invalid-capabilities"
  | "guided-empty-steps"
  | "guided-invalid-step"
  | "invalid-table-row";

/** A single structured validation finding. Location fields are filled in from the outermost known node. */
export interface ContentValidationIssue {
  code: ContentIssueCode;
  message: string;
  courseId?: string;
  moduleId?: string;
  lessonId?: string;
  pageId?: string;
  blockId?: string;
}

type Loc = { courseId?: string; moduleId?: string; lessonId?: string; pageId?: string; blockId?: string };

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isValidOrder = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isDirection = (v: unknown): v is ContentDirection => v === "rtl" || v === "ltr";
const isPositiveInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1;

/**
 * Validate a full course content tree. Pure and deterministic: same input → same issue list (in document order).
 */
export function validateLearningCourseContent(content: LearningCourseContent): ContentValidationIssue[] {
  const issues: ContentValidationIssue[] = [];
  const add = (code: ContentIssueCode, message: string, loc: Loc = {}) => issues.push({ code, message, ...loc });

  const courseId = content?.courseId;

  if (content?.schemaVersion !== LEARNING_CONTENT_SCHEMA_VERSION) {
    add("schema-version-mismatch", `schemaVersion must be ${LEARNING_CONTENT_SCHEMA_VERSION}`, { courseId });
  }
  if (!isNonEmptyString(courseId)) {
    add("missing-id", "course courseId is required", {});
  } else if (!findLearningCourse(courseId)) {
    add("unknown-course", `courseId "${courseId}" is not in the catalog`, { courseId });
  }
  if (!isNonEmptyString(content?.title)) add("missing-title", "course title is required", { courseId });
  if (!isDirection(content?.direction)) add("invalid-direction", "course direction must be rtl|ltr", { courseId });

  // Global ID uniqueness across every id-bearing node (module/lesson/page/block).
  const seenIds = new Set<string>();
  const noteId = (id: unknown, loc: Loc) => {
    if (!isNonEmptyString(id)) { add("missing-id", "id is required", loc); return; }
    if (seenIds.has(id)) add("duplicate-id", `duplicate id "${id}"`, loc);
    else seenIds.add(id);
  };

  const modules = Array.isArray(content?.modules) ? content.modules : [];
  if (modules.length === 0) add("empty-modules", "course has no modules", { courseId });
  checkSiblingOrders(modules, add, { courseId });

  for (const m of modules) {
    const mLoc: Loc = { courseId, moduleId: m?.id };
    noteId(m?.id, mLoc);
    if (!isNonEmptyString(m?.title)) add("missing-title", "module title is required", mLoc);
    if (!isValidOrder(m?.order)) add("invalid-order", "module order must be a non-negative integer", mLoc);
    if (m?.source) checkSource(m.source, courseId, add, mLoc);

    const lessons = Array.isArray(m?.lessons) ? m.lessons : [];
    if (lessons.length === 0) add("empty-lessons", "module has no lessons", mLoc);
    checkSiblingOrders(lessons, add, mLoc);

    for (const l of lessons) {
      const lLoc: Loc = { courseId, moduleId: m?.id, lessonId: l?.id };
      noteId(l?.id, lLoc);
      if (!isNonEmptyString(l?.title)) add("missing-title", "lesson title is required", lLoc);
      if (!isValidOrder(l?.order)) add("invalid-order", "lesson order must be a non-negative integer", lLoc);

      const pages = Array.isArray(l?.pages) ? l.pages : [];
      if (pages.length === 0) add("empty-pages", "lesson has no pages", lLoc);
      checkSiblingOrders(pages, add, lLoc);

      for (const p of pages) {
        const pLoc: Loc = { courseId, moduleId: m?.id, lessonId: l?.id, pageId: p?.id };
        noteId(p?.id, pLoc);
        if (!isNonEmptyString(p?.title)) add("missing-title", "page title is required", pLoc);
        if (!isValidOrder(p?.order)) add("invalid-order", "page order must be a non-negative integer", pLoc);
        if (!p?.source) add("missing-source", "page is missing its source reference", pLoc);
        else checkSource(p.source, courseId, add, pLoc);

        const blocks = Array.isArray(p?.blocks) ? p.blocks : [];
        if (blocks.length === 0) add("page-no-blocks", "page has no blocks", pLoc);
        for (const b of blocks) checkBlock(b, courseId, add, { ...pLoc, blockId: b?.id }, noteId);
      }
    }
  }
  return issues;
}

function checkSource(source: ContentSource, courseId: string, add: (c: ContentIssueCode, m: string, l?: Loc) => void, loc: Loc) {
  if (source.kind !== "book" || !isPositiveInt(source.pdfPageStart)) {
    add("invalid-source-page", "source.pdfPageStart must be a positive integer", loc);
  } else {
    if (source.pdfPageEnd !== undefined && (!isPositiveInt(source.pdfPageEnd) || source.pdfPageEnd < source.pdfPageStart)) {
      add("invalid-source-page", "source.pdfPageEnd must be a positive integer ≥ pdfPageStart", loc);
    }
    if (source.printedPage !== undefined && !isPositiveInt(source.printedPage)) {
      add("invalid-source-page", "source.printedPage must be a positive integer", loc);
    }
  }
  // OWNER §20 blocker fix: a source must belong to THIS course/book — sourceId must equal the course id.
  if (isNonEmptyString(courseId) && source.sourceId !== courseId) {
    add("source-id-mismatch", `source.sourceId "${String(source.sourceId)}" does not match courseId "${courseId}"`, loc);
  }
}

/** Detect invalid or duplicate `order` among an array of siblings. Passing `undefined` is a no-op. */
function checkSiblingOrders(
  items: { id?: string; order?: number }[] | undefined,
  add: (c: ContentIssueCode, m: string, l?: Loc) => void,
  loc: Loc,
) {
  if (!items) return;
  const seen = new Map<number, number>();
  for (const it of items) {
    if (!isValidOrder(it?.order)) continue; // invalid-order reported per-node elsewhere
    seen.set(it.order, (seen.get(it.order) || 0) + 1);
  }
  for (const [order, count] of seen) {
    if (count > 1) add("duplicate-order", `duplicate order ${order} among siblings`, loc);
  }
}

function checkBlock(
  block: ContentBlock,
  courseId: string,
  add: (c: ContentIssueCode, m: string, l?: Loc) => void,
  loc: Loc,
  noteId: (id: unknown, loc: Loc) => void,
) {
  noteId(block?.id, loc);
  const type = (block as { type?: string })?.type;
  if (!type || !BLOCK_TYPES.includes(type as ContentBlock["type"])) {
    add("unsupported-block-type", `unsupported block type "${String(type)}"`, loc);
    return;
  }
  if (block.dir !== undefined && !isDirection(block.dir)) add("invalid-direction", "block dir must be rtl|ltr", loc);
  // Provenance (OWNER §1–§6): origin is MANDATORY and never defaulted — a missing or invalid origin is an error,
  // so imported/generated content can never silently pass as the book.
  const origin = (block as { origin?: unknown }).origin;
  if (origin === undefined || origin === null) {
    add("missing-origin", "block origin is required (book|teacher-enrichment)", loc);
  } else if (!CONTENT_ORIGINS.includes(origin as (typeof CONTENT_ORIGINS)[number])) {
    add("invalid-origin", `block origin must be one of ${CONTENT_ORIGINS.join("|")}`, loc);
  } else if (origin === "book" && isEnrichmentOnly(block)) {
    // Clarification callouts, interactive practice and simulations are enrichment layers, never book content.
    add("origin-policy-violation", `${enrichmentKindLabel(block)} must be origin "teacher-enrichment", not "book"`, loc);
  }
  if (block.source) checkSource(block.source, courseId, add, loc);

  switch (block.type) {
    case "image":
    case "diagram":
      if (!block.decorative && !isNonEmptyString((block as { alt?: string }).alt)) {
        add("image-missing-alt", "image/diagram requires non-empty alt unless decorative", loc);
      }
      break;
    case "code":
      if (!CODE_LANGUAGES.includes(block.language)) add("unsupported-block-type", `unsupported code language "${String(block.language)}"`, loc);
      break;
    case "callout":
      if (!CALLOUT_KINDS.includes(block.kind)) add("unsupported-block-type", `unsupported callout kind "${String(block.kind)}"`, loc);
      break;
    case "example":
      if (block.mode !== undefined && !EXAMPLE_MODES.includes(block.mode)) {
        add("invalid-example-mode", `example mode must be one of ${EXAMPLE_MODES.join("|")}`, loc);
      }
      break;
    case "table":
      for (const row of block.rows || []) {
        if (!Array.isArray(row) || row.length !== (block.headers?.length ?? -1)) {
          add("invalid-table-row", "each table row must match the header count", loc);
          break;
        }
      }
      break;
    case "practice":
      checkPractice(block.question, add, loc);
      break;
    case "simulation":
    case "animation":
    case "guided":
    case "interactive-diagram":
      checkActivity(block, add, loc);
      break;
  }
}

/**
 * Validate an interactive-activity descriptor (simulation / animation / guided / interactive-diagram). The
 * descriptor is pure data: a non-empty registry KEY, a positive-integer `version`, and a title. `config` is opaque
 * (engine-validated by the renderer, never here) and is NEVER executed. A fallback image must carry alt text.
 */
function checkActivity(block: ActivityBlock, add: (c: ContentIssueCode, m: string, l?: Loc) => void, loc: Loc) {
  if (!isNonEmptyString(activityKey(block))) {
    add("activity-missing-key", `${block.type} requires a non-empty registry key`, loc);
  }
  if (!isPositiveInt((block as { version?: unknown }).version)) {
    add("activity-invalid-version", `${block.type} requires a positive integer version`, loc);
  }
  if (!isNonEmptyString((block as { title?: unknown }).title)) {
    add("activity-missing-title", `${block.type} requires a non-empty title`, loc);
  }
  if (block.fallback?.src && !isNonEmptyString(block.fallback.alt)) {
    add("image-missing-alt", "activity fallback image requires non-empty alt", loc);
  }
  // Capabilities are a plain object of optional BOOLEAN flags (fullscreen/reset/replay/pause/speed/animated/
  // interactive). Anything else — a non-object, an unknown key, or a non-boolean value such as `"yes"` — is a
  // malformed contract. (Even well-formed content capabilities never ENABLE a shell control: the renderer's
  // declaration is the authority; this check only rejects malformed data.)
  const caps = (block as { capabilities?: unknown }).capabilities;
  if (caps !== undefined) {
    if (caps === null || typeof caps !== "object" || Array.isArray(caps)) {
      add("activity-invalid-capabilities", "capabilities must be an object of boolean flags", loc);
    } else {
      for (const [k, v] of Object.entries(caps as Record<string, unknown>)) {
        if (!(ACTIVITY_CAPABILITY_KEYS as readonly string[]).includes(k) || (v !== undefined && typeof v !== "boolean")) {
          add("activity-invalid-capabilities", `capabilities.${k} must be a boolean flag`, loc);
          break;
        }
      }
    }
  }
  if (block.type === "guided") checkGuided(block, add, loc);
}

/**
 * Guided (حل مع المعلم) structure: a NON-EMPTY ordered `steps` array whose every step has a non-empty id and
 * non-empty structured `text` spans (never raw HTML). Empty/malformed steps would render a hollow walkthrough.
 */
function checkGuided(
  block: { steps?: unknown },
  add: (c: ContentIssueCode, m: string, l?: Loc) => void,
  loc: Loc,
) {
  const steps = block.steps;
  if (!Array.isArray(steps) || steps.length === 0) { add("guided-empty-steps", "guided requires a non-empty steps array", loc); return; }
  for (const s of steps as { id?: unknown; text?: unknown }[]) {
    const spans = Array.isArray(s?.text) ? (s.text as { text?: unknown }[]) : [];
    const hasText = spans.some(sp => isNonEmptyString(sp?.text));
    if (!isNonEmptyString(s?.id) || !hasText) {
      add("guided-invalid-step", "each guided step needs a non-empty id and non-empty text spans", loc);
      break;
    }
  }
}

/** Block families that are, by policy, ALWAYS teacher enrichment (never faithful book content). */
function isEnrichmentOnly(block: ContentBlock): boolean {
  return block.type === "practice" || isActivityBlock(block) || (block.type === "callout" && block.kind === "clarification");
}
function enrichmentKindLabel(block: ContentBlock): string {
  return block.type === "callout" ? "a clarification callout" : `a ${block.type} block`;
}

function checkPractice(
  question: { kind?: string; options?: { correct?: boolean }[] },
  add: (c: ContentIssueCode, m: string, l?: Loc) => void,
  loc: Loc,
) {
  if (question?.kind !== "multipleChoice") return;
  const options = Array.isArray(question.options) ? question.options : [];
  if (options.length === 0) { add("quiz-empty-options", "multipleChoice practice has no options", loc); return; }
  // Only enforce the answer count when an answer is expressed at all (some content authors the key separately).
  const hasAnyAnswer = options.some(o => o?.correct !== undefined);
  if (hasAnyAnswer) {
    const correctCount = options.filter(o => o?.correct === true).length;
    if (correctCount !== 1) add("quiz-mcq-answer-count", "multipleChoice must have exactly one correct option", loc);
  }
}
