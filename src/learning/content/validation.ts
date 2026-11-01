// Learning Materials — Phase 2: deterministic, pure content validator.
//
// `validateLearningCourseContent()` returns a list of structured issues; it NEVER throws for normal content
// errors and NEVER mutates/normalizes/reorders/invents anything (§21). Callers branch on `issue.code`
// (a stable enum), never on the human Arabic-or-English `message`. An empty array means "no problems found".

import {
  BLOCK_TYPES, CALLOUT_KINDS, CODE_LANGUAGES, CONTENT_ORIGINS, EXAMPLE_MODES, ACTIVITY_CAPABILITY_KEYS,
  LEARNING_CONTENT_SCHEMA_VERSION, CONTENT_PAGE_LAYOUTS, isActivityBlock, activityKey, isStructuredKind, isNetworkLabBlock, NETWORK_LAB_VERSION,
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
  | "guided-duplicate-step-id"
  | "list-empty-items"
  | "list-invalid-item"
  | "unit-opener-missing-title"
  | "invalid-table-row"
  | "library-training-invalid"
  | "invalid-practice-table"
  | "visual-missing-id"
  | "invalid-reveal"
  | "invalid-page-layout"
  | "invalid-structured-question"
  | "invalid-network-lab"
  | "exam-item-invalid";

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
        checkPageLayout(p, blocks, add, pLoc);
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
    case "unit-opener":
      if (!isNonEmptyString(block.title)) add("unit-opener-missing-title", "unit-opener requires a non-empty title", loc);
      break;
    case "list":
      checkList(block, add, loc);
      break;
    case "practice":
      checkPractice(block.question, add, loc);
      if (isStructuredKind(block.question?.kind)) checkStructured(block.question, block.serverCheck === true, add, loc);
      if ((block as { reveal?: unknown }).reveal !== undefined) checkReveal(block, add, loc);
      break;
    case "practice-table":
      checkPracticeTable(block, add, loc);
      break;
    case "library-training":
      // Metadata only: a training id, a printed label and the gating module id. Anything content-like (questions,
      // options, answers, titles) does NOT belong in the book — it is served by the learning-training API.
      if (!isNonEmptyString(block.trainingId) || !isNonEmptyString(block.label) || !isNonEmptyString(block.requiredModuleId)) {
        add("library-training-invalid", "library-training requires non-empty trainingId, label and requiredModuleId", loc);
      } else if (!/^[A-Za-z0-9_-]{1,32}$/.test(block.trainingId)) {
        add("library-training-invalid", "library-training trainingId must be a short safe identifier", loc);
      } else if (/^library-training-/.test(block.trainingId) || Object.keys(block).some(k => /^(question|options|answer|title|exam)/i.test(k))) {
        add("library-training-invalid", "library-training carries metadata only (no questions, options, answers or titles)", loc);
      }
      break;
    case "exam-item":
      // 791381s Phase 8C-2 — metadata only: a safe item id and a label; never a question, option, answer or exam field
      // (the item lives in the API's private store), and always teacher enrichment (never a book block).
      if (!isNonEmptyString(block.itemId) || !/^[A-Za-z0-9_-]{1,64}$/.test(block.itemId) || !isNonEmptyString(block.label)) {
        add("exam-item-invalid", "exam-item requires a safe itemId and a non-empty label", loc);
      } else if (Object.keys(block).some(k => !["id", "type", "origin", "itemId", "label"].includes(k))) {
        add("exam-item-invalid", "exam-item carries metadata only (id, type, origin, itemId, label)", loc);
      }
      if (block.origin !== "teacher-enrichment") add("exam-item-invalid", "exam-item is teacher enrichment, never a book block", loc);
      break;
    case "simulation":
    case "animation":
    case "guided":
    case "interactive-diagram":
      checkActivity(block, add, loc);
      break;
    case "visual":
      // A visual is a meaningful illustration (never decorative): a non-empty registry KEY resolved by the trusted
      // allowlist, plus a required accessible `alt`. The key is opaque DATA (an unknown key ⇒ faithful fallback,
      // validated by the renderer, never executed here); provenance is enforced via isEnrichmentOnly above.
      if (!isNonEmptyString((block as { visualId?: string }).visualId)) {
        add("visual-missing-id", "visual requires a non-empty visualId (registry key)", loc);
      }
      if (!isNonEmptyString((block as { alt?: string }).alt)) {
        add("image-missing-alt", "visual requires a non-empty alt (accessible description)", loc);
      }
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
  if (isNetworkLabBlock(block)) checkNetworkLab(block, add, loc);
}

const LAB_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const LAB_CONFIG_KEYS = new Set(["topology", "task", "checks", "feedback", "solution"]);
/**
 * 791381s Phase 8B — the STRUCTURE of a network lab (`simulation` / `network-lab` v1). The simulator itself (topology, check
 * parameters, the authored solution passing every check, an untouched lab passing none) is proven by src/learning/lab/
 * networkLabProof.ts over every authored lab — kept out of this validator so it never pulls the simulator into a bundle.
 */
function checkNetworkLab(block: ActivityBlock, add: (c: ContentIssueCode, m: string, l?: Loc) => void, loc: Loc) {
  const bad = (m: string) => add("invalid-network-lab", "network-lab: " + m, loc);
  if (block.version !== NETWORK_LAB_VERSION) bad("only version " + NETWORK_LAB_VERSION + " exists");
  if ("reveal" in (block as object)) bad("a lab never reveals (the checks are judged, not shown)");
  if ("serverCheck" in (block as object)) bad("serverCheck is a served-body marker, never authored");
  const config = block.config as Record<string, unknown> | undefined;
  if (!config || typeof config !== "object" || Array.isArray(config)) { bad("config must be an object"); return; }
  for (const k of Object.keys(config)) if (!LAB_CONFIG_KEYS.has(k)) bad("unknown config field " + k);
  const { topology, task, checks, feedback, solution } = config as { topology?: unknown; task?: { intro?: unknown; goals?: unknown }; checks?: unknown; feedback?: unknown; solution?: unknown };
  if (!topology || typeof topology !== "object" || Array.isArray(topology)) bad("topology must be a networkTopology@2 configuration object");
  if (!task || typeof task !== "object" || !isNonEmptyString(task.intro)) bad("task.intro is required");
  const goals = Array.isArray(task?.goals) ? (task!.goals as { id?: unknown; label?: unknown }[]) : null;
  if (!goals || goals.length === 0 || !goals.every(g => g && typeof g.id === "string" && LAB_ID.test(g.id) && isNonEmptyString(g.label))) bad("task.goals must list one { id, label } per check");
  if (!Array.isArray(checks) || checks.length === 0 || !checks.every(c => c && typeof c === "object" && !Array.isArray(c) && typeof (c as { id?: unknown }).id === "string")) bad("checks must be a non-empty list of check objects");
  else if (goals) {
    const ids = (checks as { id: string }[]).map(c => c.id);
    if (new Set(ids).size !== ids.length) bad("check ids must be unique");
    if (ids.join("|") !== goals.map(g => String(g.id)).join("|")) bad("task.goals must name the checks, same ids in the same order");
  }
  if (!Array.isArray(solution) || solution.length === 0 || !solution.every(a => a && typeof a === "object" && !Array.isArray(a))) bad("solution must be the authored action list that passes every check");
  if (feedback !== undefined) {
    const f = feedback as Record<string, unknown>;
    const strOk = (v: unknown) => v === undefined || typeof v === "string";
    if (!f || typeof f !== "object" || Array.isArray(f) || !strOk(f.correctFeedback) || !strOk(f.incorrectFeedback) || !strOk(f.explanation)
      || (f.hints !== undefined && !(Array.isArray(f.hints) && f.hints.every(h => typeof h === "string")))) bad("feedback holds correctFeedback / incorrectFeedback / explanation strings and a hints list");
  }
}

/**
 * A generic `list` block needs a NON-EMPTY `items` array; every item needs a non-empty id and non-empty text spans
 * (never raw HTML), and item ids must be unique within the block (they are React keys / analytics identities).
 */
function checkList(
  block: { items?: unknown },
  add: (c: ContentIssueCode, m: string, l?: Loc) => void,
  loc: Loc,
) {
  const items = block.items;
  if (!Array.isArray(items) || items.length === 0) { add("list-empty-items", "list requires a non-empty items array", loc); return; }
  const seen = new Set<string>();
  for (const it of items as { id?: unknown; text?: unknown }[]) {
    const spans = Array.isArray(it?.text) ? (it.text as { text?: unknown }[]) : [];
    const hasText = spans.some(sp => isNonEmptyString(sp?.text));
    if (!isNonEmptyString(it?.id) || !hasText || seen.has(it.id)) {
      add("list-invalid-item", "each list item needs a unique non-empty id and non-empty text spans", loc);
      break;
    }
    seen.add(it.id);
  }
}

/**
 * Guided (حل مع المعلم) structure: a NON-EMPTY ordered `steps` array whose every step has a non-empty id and
 * non-empty structured `text` spans (never raw HTML), and whose step ids are unique WITHIN this guided block
 * (they are the React key and the future reveal/analytics identity; uniqueness across different guided blocks is
 * not required). Empty/malformed/duplicated steps would render a hollow or ambiguous walkthrough.
 */
function checkGuided(
  block: { steps?: unknown },
  add: (c: ContentIssueCode, m: string, l?: Loc) => void,
  loc: Loc,
) {
  const steps = block.steps;
  if (!Array.isArray(steps) || steps.length === 0) { add("guided-empty-steps", "guided requires a non-empty steps array", loc); return; }
  const seen = new Set<string>();
  let dupReported = false;
  for (const s of steps as { id?: unknown; text?: unknown }[]) {
    const spans = Array.isArray(s?.text) ? (s.text as { text?: unknown }[]) : [];
    const hasText = spans.some(sp => isNonEmptyString(sp?.text));
    if (!isNonEmptyString(s?.id) || !hasText) {
      add("guided-invalid-step", "each guided step needs a non-empty id and non-empty text spans", loc);
      break;
    }
    if (seen.has(s.id)) {
      if (!dupReported) { add("guided-duplicate-step-id", `duplicate guided step id "${s.id}" within one guided block`, loc); dupReported = true; }
    } else {
      seen.add(s.id);
    }
  }
}

/**
 * A `practice-table` is a `table` whose answerable cells are small closed choices: every row matches the header
 * count; every select cell has ≥ 2 unique non-empty options and an expected choice that IS one of them; and at
 * least one cell is a select cell (a table with none is just a `table`). Cells are plain strings or select objects —
 * never raw HTML, never a free-text field.
 */
function checkPracticeTable(
  block: { headers?: unknown; rows?: unknown },
  add: (c: ContentIssueCode, m: string, l?: Loc) => void,
  loc: Loc,
) {
  const headers = Array.isArray(block.headers) ? block.headers : [];
  if (headers.length === 0 || !headers.every(isNonEmptyString)) { add("invalid-practice-table", "practice-table requires non-empty headers", loc); return; }
  const rows = Array.isArray(block.rows) ? block.rows : [];
  if (rows.length === 0) { add("invalid-practice-table", "practice-table requires at least one row", loc); return; }
  let selects = 0;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== headers.length) { add("invalid-table-row", "each practice-table row must match the header count", loc); return; }
    for (const cell of row as unknown[]) {
      if (typeof cell === "string") continue;
      const sel = cell as { kind?: unknown; options?: unknown; key?: unknown } | null;
      const options = Array.isArray(sel?.options) ? (sel!.options as unknown[]) : [];
      const unique = new Set(options);
      if (!sel || sel.kind !== "select" || options.length < 2 || !options.every(isNonEmptyString) || unique.size !== options.length || !isNonEmptyString(sel.key) || !options.includes(sel.key)) {
        add("invalid-practice-table", "each practice-table select cell needs ≥ 2 unique non-empty options and a key that is one of them", loc);
        return;
      }
      selects += 1;
    }
  }
  if (selects === 0) add("invalid-practice-table", "practice-table requires at least one select cell (otherwise author a table)", loc);
}

/** Block families that are, by policy, ALWAYS teacher enrichment (never faithful book content). */
function isEnrichmentOnly(block: ContentBlock): boolean {
  return block.type === "practice" || block.type === "visual" || isActivityBlock(block) || (block.type === "callout" && block.kind === "clarification");
}
function enrichmentKindLabel(block: ContentBlock): string {
  return block.type === "callout" ? "a clarification callout" : `a ${block.type} block`;
}

/**
 * Reveal mode (types.ts RevealMarker): exactly `true`, on a question kind whose right answer can be shown (multipleChoice /
 * trueFalse / the structured kinds), with an answer key and an explanation in the authored content. A SERVED body (serverCheck) carries
 * neither — the server holds them — so only the kind is checked there.
 */
function checkReveal(block: Extract<ContentBlock, { type: "practice" }>, add: (c: ContentIssueCode, m: string, l?: Loc) => void, loc: Loc) {
  const q = block.question;
  if (block.reveal !== true) { add("invalid-reveal", "reveal must be exactly true", loc); return; }
  if (q?.kind !== "multipleChoice" && q?.kind !== "trueFalse" && !isStructuredKind(q?.kind)) {
    add("invalid-reveal", "reveal is only for multipleChoice / trueFalse / wordBank / matching / ordering / classify questions", loc); return;
  }
  if (block.serverCheck === true) return;
  const keyed = q.kind === "multipleChoice" ? q.options.some(o => o.correct === true)
    : q.kind === "trueFalse" ? typeof q.answer === "boolean"
    : q.kind === "wordBank" ? !!q.answers && Object.keys(q.answers).length > 0
    : q.kind === "matching" ? !!q.pairs && Object.keys(q.pairs).length > 0
    : q.kind === "ordering" ? !!q.order && q.order.length > 0
    : q.kind === "classify" ? !!q.assign && Object.keys(q.assign).length > 0
    : false;
  if (!keyed) add("invalid-reveal", "a reveal question needs its answer key (the right answer is shown after an answer)", loc);
  if (!isNonEmptyString(q.feedback?.explanation)) add("invalid-reveal", "a reveal question needs an explanation (shown under every answer)", loc);
}

/**
 * The structured kinds (types.ts — wordBank / matching / ordering / classify). Presentation: non-empty unique ids and texts,
 * enough parts to be a real exercise. Key (authored content only — a served body has none): it covers EVERY part with a valid
 * choice; matching is one-to-one; an ordering's authored item order is not already the answer (the learner must reorder).
 */
function checkStructured(
  question: Extract<ContentBlock, { type: "practice" }>["question"],
  served: boolean,
  add: (c: ContentIssueCode, m: string, l?: Loc) => void,
  loc: Loc,
) {
  const bad = (m: string) => add("invalid-structured-question", m, loc);
  const items = (xs: unknown, min: number, what: string): string[] | null => {
    if (!Array.isArray(xs) || xs.length < min) { bad(`${what} needs at least ${min} items`); return null; }
    const ids = xs.map(x => (x && typeof x === "object" ? (x as { id?: unknown }).id : undefined));
    if (xs.some(x => !isNonEmptyString((x as { id?: unknown })?.id) || !isNonEmptyString((x as { text?: unknown })?.text))) { bad(`${what}: every item needs an id and a text`); return null; }
    if (new Set(ids).size !== ids.length) { bad(`${what}: duplicate item id`); return null; }
    return ids as string[];
  };
  const coversMap = (map: unknown, parts: string[], values: string[], what: string): boolean => {
    if (!map || typeof map !== "object" || Array.isArray(map)) { bad(`${what} key missing`); return false; }
    const m = map as Record<string, unknown>;
    if (Object.keys(m).length !== parts.length || !parts.every(p => Object.prototype.hasOwnProperty.call(m, p))) { bad(`${what} key must cover every part exactly`); return false; }
    if (!parts.every(p => typeof m[p] === "string" && values.includes(m[p] as string))) { bad(`${what} key holds a choice that is not offered`); return false; }
    return true;
  };
  switch (question.kind) {
    case "wordBank": {
      const segs = Array.isArray(question.segments) ? question.segments : [];
      const blanks = segs.filter((s): s is { blank: string } => !!s && typeof s === "object" && isNonEmptyString((s as { blank?: unknown }).blank)).map(s => s.blank);
      if (segs.some(s => typeof s !== "string" && !(s && typeof s === "object" && isNonEmptyString((s as { blank?: unknown }).blank)))) bad("wordBank segment must be text or { blank }");
      if (blanks.length === 0) { bad("wordBank needs at least one blank"); return; }
      if (new Set(blanks).size !== blanks.length) { bad("wordBank: duplicate blank id"); return; }
      const bank = Array.isArray(question.bank) ? question.bank : [];
      if (bank.length < blanks.length || bank.some(w => !isNonEmptyString(w)) || new Set(bank).size !== bank.length) { bad("wordBank bank needs ≥ one unique word per blank"); return; }
      if (!served) coversMap(question.answers, blanks, bank, "wordBank");
      return;
    }
    case "matching": {
      const left = items(question.left, 2, "matching left"), right = items(question.right, 2, "matching right");
      if (!left || !right) return;
      if (right.length < left.length) { bad("matching needs at least as many right items as left items"); return; }
      if (!served && coversMap(question.pairs, left, right, "matching")) {
        const values = Object.values(question.pairs!);
        if (new Set(values).size !== values.length) bad("matching key must be one-to-one");
      }
      return;
    }
    case "ordering": {
      const ids = items(question.items, 3, "ordering items");
      if (!ids || served) return;
      const order = question.order;
      if (!Array.isArray(order) || order.length !== ids.length || new Set(order).size !== ids.length || !ids.every(id => order.includes(id))) { bad("ordering key must be a permutation of the item ids"); return; }
      if (order.every((id, i) => ids[i] === id)) bad("ordering items must not be authored in the answer order");
      return;
    }
    case "classify": {
      const groups = items(question.groups, 2, "classify groups"), its = items(question.items, 2, "classify items");
      if (!groups || !its || served) return;
      coversMap(question.assign, its, groups, "classify");
      return;
    }
  }
}

/**
 * Page layout: one of CONTENT_PAGE_LAYOUTS. A "practice" page («تدريبات الوحدة») is added enrichment: every block on it is
 * teacher-enrichment and at least one is an exercise (practice / practice-table).
 */
function checkPageLayout(
  page: { layout?: unknown },
  blocks: ContentBlock[],
  add: (c: ContentIssueCode, m: string, l?: Loc) => void,
  loc: Loc,
) {
  if (page.layout === undefined) return;
  if (!(CONTENT_PAGE_LAYOUTS as readonly unknown[]).includes(page.layout)) { add("invalid-page-layout", "unknown page layout", loc); return; }
  if (page.layout !== "practice") return;
  if (blocks.some(b => b?.origin !== "teacher-enrichment")) add("invalid-page-layout", "a practice page holds only teacher-enrichment blocks (never book content)", loc);
  if (!blocks.some(b => b?.type === "practice" || b?.type === "practice-table")) add("invalid-page-layout", "a practice page needs at least one exercise", loc);
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
