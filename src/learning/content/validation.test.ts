// Learning Materials — Phase 2: validator tests. Behavior is asserted by issue CODE, never message text.
import { describe, it, expect } from "vitest";
import { validateLearningCourseContent, type ContentIssueCode } from "./validation";
import { cloneCourse } from "./content.fixtures";
import type { LearningCourseContent } from "./types";

const codes = (c: LearningCourseContent): ContentIssueCode[] => validateLearningCourseContent(c).map(i => i.code);
const has = (c: LearningCourseContent, code: ContentIssueCode) => expect(codes(c)).toContain(code);

describe("Phase 2 — content validator", () => {
  it("a valid multi-shape course produces ZERO issues", () => {
    expect(validateLearningCourseContent(cloneCourse())).toEqual([]);
  });

  it("flags an unknown catalog course", () => {
    const c = cloneCourse(); c.courseId = "000000";
    has(c, "unknown-course");
  });

  it("flags a schema-version mismatch", () => {
    const c = cloneCourse(); c.schemaVersion = 99;
    has(c, "schema-version-mismatch");
  });

  it("flags a duplicate module id", () => {
    const c = cloneCourse(); c.modules[1].id = c.modules[0].id;
    has(c, "duplicate-id");
  });
  it("flags a duplicate lesson id", () => {
    const c = cloneCourse(); c.modules[1].lessons[0].id = c.modules[0].lessons[0].id;
    has(c, "duplicate-id");
  });
  it("flags a duplicate page id", () => {
    const c = cloneCourse(); c.modules[1].lessons[0].pages[0].id = c.modules[0].lessons[0].pages[0].id;
    has(c, "duplicate-id");
  });
  it("flags a duplicate block id", () => {
    const c = cloneCourse(); c.modules[0].lessons[0].pages[0].blocks[1].id = c.modules[0].lessons[0].pages[0].blocks[0].id;
    has(c, "duplicate-id");
  });

  it("flags a missing id and a missing title", () => {
    const c = cloneCourse(); c.modules[0].id = ""; c.modules[0].title = "";
    const cs = codes(c);
    expect(cs).toContain("missing-id");
    expect(cs).toContain("missing-title");
  });

  it("flags empty modules / lessons / pages / a page with no blocks", () => {
    const empty = cloneCourse(); empty.modules = [];
    has(empty, "empty-modules");
    const noLessons = cloneCourse(); noLessons.modules[0].lessons = [];
    has(noLessons, "empty-lessons");
    const noPages = cloneCourse(); noPages.modules[0].lessons[0].pages = [];
    has(noPages, "empty-pages");
    const noBlocks = cloneCourse(); noBlocks.modules[0].lessons[0].pages[0].blocks = [];
    has(noBlocks, "page-no-blocks");
  });

  it("flags an invalid order and a duplicate sibling order", () => {
    const invalid = cloneCourse(); invalid.modules[0].order = -1;
    has(invalid, "invalid-order");
    const dup = cloneCourse(); dup.modules[1].order = dup.modules[0].order;
    has(dup, "duplicate-order");
  });

  it("flags a missing page source and an invalid source page number", () => {
    const missing = cloneCourse();
    delete (missing.modules[0].lessons[0].pages[0] as { source?: unknown }).source;
    has(missing, "missing-source");
    const bad = cloneCourse(); bad.modules[0].lessons[0].pages[0].source.pdfPageStart = 0;
    has(bad, "invalid-source-page");
    const badRange = cloneCourse();
    badRange.modules[0].lessons[0].pages[0].source.pdfPageEnd = 1;
    badRange.modules[0].lessons[0].pages[0].source.pdfPageStart = 5;
    has(badRange, "invalid-source-page");
  });

  it("flags an unsupported block type", () => {
    const c = cloneCourse();
    (c.modules[0].lessons[0].pages[0].blocks[0] as { type: string }).type = "hologram";
    has(c, "unsupported-block-type");
  });

  it("flags an image without alt unless decorative", () => {
    const c = cloneCourse();
    const img = c.modules[0].lessons[0].pages[0].blocks.find(b => b.type === "image")!;
    (img as { alt: string }).alt = "";
    has(c, "image-missing-alt");
    // decorative image needs no alt
    const ok = cloneCourse();
    const img2 = ok.modules[0].lessons[0].pages[0].blocks.find(b => b.type === "image")!;
    (img2 as { alt: string; decorative?: boolean }).alt = "";
    (img2 as { decorative?: boolean }).decorative = true;
    expect(codes(ok)).not.toContain("image-missing-alt");
  });

  it("flags an invalid direction on the course and on a block", () => {
    const course = cloneCourse(); (course as { direction: string }).direction = "sideways";
    has(course, "invalid-direction");
    const block = cloneCourse();
    (block.modules[2].lessons[0].pages[0].blocks[1] as { dir?: string }).dir = "up";
    has(block, "invalid-direction");
  });

  it("flags an empty MCQ options list and an MCQ without exactly one correct answer", () => {
    const empty = cloneCourse();
    const q1 = empty.modules[2].lessons[0].pages[1].blocks[0];
    (q1 as { question: { options: unknown[] } }).question.options = [];
    has(empty, "quiz-empty-options");
    const two = cloneCourse();
    const q2 = two.modules[2].lessons[0].pages[1].blocks[0] as { question: { options: { correct?: boolean }[] } };
    q2.question.options[1].correct = true; // now two correct
    has(two, "quiz-mcq-answer-count");
    const none = cloneCourse();
    const q3 = none.modules[2].lessons[0].pages[1].blocks[0] as { question: { options: { correct?: boolean }[] } };
    q3.question.options[0].correct = false; // an answer is present but zero true
    has(none, "quiz-mcq-answer-count");
  });

  it("does NOT enforce the MCQ answer count when no answer key is present", () => {
    const c = cloneCourse();
    const q = c.modules[2].lessons[0].pages[1].blocks[0] as { question: { options: { correct?: boolean }[] } };
    for (const o of q.question.options) delete o.correct;
    expect(codes(c)).not.toContain("quiz-mcq-answer-count");
  });

  it("flags an unsupported simulation type", () => {
    const c = cloneCourse();
    (c.modules[2].lessons[0].pages[2].blocks[0] as { simulationType: string }).simulationType = "teleport";
    has(c, "unsupported-simulation-type");
  });

  it("flags a table row that does not match the header count", () => {
    const c = cloneCourse();
    const table = c.modules[1].lessons[0].pages[0].blocks.find(b => b.type === "table")!;
    (table as { rows: string[][] }).rows[0] = ["1", "2"];
    has(c, "invalid-table-row");
  });

  it("is pure — it does not mutate the input", () => {
    const c = cloneCourse();
    const snapshot = JSON.stringify(c);
    validateLearningCourseContent(c);
    expect(JSON.stringify(c)).toBe(snapshot);
  });
});
