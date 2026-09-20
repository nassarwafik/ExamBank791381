// Validator coverage for the `visual` block: a registry key + accessible alt are required, and a visual is ALWAYS
// teacher-enrichment (a visual can never masquerade as faithful book content).
import { describe, it, expect } from "vitest";
import { validateLearningCourseContent } from "./validation";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentBlock } from "./types";

function courseWith(block: ContentBlock): LearningCourseContent {
  return {
    schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "t", direction: "rtl",
    modules: [{
      id: "791381-m01", title: "m", order: 1,
      lessons: [{ id: "791381-m01-l01", title: "l", order: 1, pages: [{
        id: "791381-m01-l01-p01", title: "p", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 8 },
        blocks: [block],
      }] }],
    }],
  };
}
const codes = (b: ContentBlock) => validateLearningCourseContent(courseWith(b)).map(i => i.code);

describe("validation — visual block", () => {
  const ok: ContentBlock = { id: "v", type: "visual", origin: "teacher-enrichment", visualId: "791381/ch1/shared-printer", alt: "وصف مقروء للرسم" };

  it("a well-formed visual has no issues", () => {
    expect(codes(ok)).toEqual([]);
  });
  it("a missing/empty visualId is a visual-missing-id error", () => {
    expect(codes({ ...ok, visualId: "" })).toContain("visual-missing-id");
    expect(codes({ id: "v", type: "visual", origin: "teacher-enrichment", alt: "x" } as unknown as ContentBlock)).toContain("visual-missing-id");
  });
  it("a missing/empty alt is an image-missing-alt error (a visual is meaningful, never decorative)", () => {
    expect(codes({ ...ok, alt: "" })).toContain("image-missing-alt");
  });
  it("origin:'book' on a visual is an origin-policy-violation (visuals are always enrichment)", () => {
    expect(codes({ ...ok, origin: "book" })).toContain("origin-policy-violation");
  });
});
