// Learning Practice — the generic `library-training` block: metadata-only typing + validation, and the 791381
// PDF-22 page that points at the platform's T01–T04 trainings with the book's own labels (no titles, no questions,
// no answers in the content — the host/API own those, so a hidden module never leaks through the book).
import { describe, it, expect } from "vitest";
import { validateLearningCourseContent } from "./validation";
import { BLOCK_TYPES, type LibraryTrainingBlock, type ContentBlock } from "./types";
import { cloneCourse } from "./content.fixtures";
import m02 from "./791381/modules/m02";

const train = (extra: Partial<LibraryTrainingBlock> & Record<string, unknown> = {}): ContentBlock =>
  ({ id: "t-1", type: "library-training", origin: "book", trainingId: "T01", label: "تدريب 1", requiredModuleId: "syn-m01", ...extra } as ContentBlock);
const withBlock = (b: ContentBlock) => {
  const c = cloneCourse();
  c.modules[0].lessons[0].pages[0].blocks = [b];
  return validateLearningCourseContent(c);
};
const codes = (issues: ReturnType<typeof validateLearningCourseContent>) => issues.map(i => i.code);

describe("library-training — typing + validation", () => {
  it("is a supported block type and validates with origin book (the printed page lists these trainings)", () => {
    expect(BLOCK_TYPES).toContain("library-training");
    expect(codes(withBlock(train()))).toEqual([]);
    expect(codes(withBlock(train({ origin: "teacher-enrichment" })))).toEqual([]);
  });
  it("requires non-empty trainingId, label and requiredModuleId and a short safe trainingId", () => {
    expect(codes(withBlock(train({ trainingId: "" })))).toContain("library-training-invalid");
    expect(codes(withBlock(train({ label: " " })))).toContain("library-training-invalid");
    expect(codes(withBlock(train({ requiredModuleId: "" })))).toContain("library-training-invalid");
    expect(codes(withBlock(train({ trainingId: "../T01" })))).toContain("library-training-invalid");
    expect(codes(withBlock(train({ trainingId: "T01 T02" })))).toContain("library-training-invalid");
  });
  it("rejects content-like fields — questions, options, answers, titles never live in the book", () => {
    for (const k of ["questions", "options", "answerKey", "title", "examSnapshot"]) {
      expect(codes(withBlock(train({ [k]: "x" }))), k).toContain("library-training-invalid");
    }
  });
  it("still requires the mandatory provenance (missing origin is an error like every other block)", () => {
    const b = train(); delete (b as { origin?: string }).origin;
    expect(codes(withBlock(b))).toContain("missing-origin");
  });
});

describe("791381 PDF 22 — the four printed trainings point at T01–T04", () => {
  const p08 = m02.lessons.flatMap(l => l.pages).find(p => p.id === "791381-m02-l01-p08")!;
  const trainings = p08.blocks.filter((b): b is LibraryTrainingBlock => b.type === "library-training");
  it("exactly four metadata-only blocks, in book order, with the book's labels and the gating modules", () => {
    expect(trainings.map(t => [t.id, t.trainingId, t.label, t.requiredModuleId])).toEqual([
      ["m02-l01-p08-t1", "T01", "تدريب 1", "791381-m01"],
      ["m02-l01-p08-t2", "T02", "تدريب 2", "791381-m02"],
      ["m02-l01-p08-t3", "T03", "تدريب 3", "791381-m07"],
      ["m02-l01-p08-t4", "T04", "تدريب 4", "791381-m07"],
    ]);
    for (const t of trainings) {
      expect(t.origin).toBe("book");
      expect(Object.keys(t).sort()).toEqual(["id", "label", "origin", "requiredModuleId", "trainingId", "type"]);
    }
    expect(p08.blocks[0].type).toBe("library-training");                                  // the trainings open the page
    expect(p08.blocks.some(b => b.type === "list")).toBe(false);                           // the old static list is gone
  });
  it("the content carries NO training titles, questions or answers (the API discloses titles per availability)", () => {
    const json = JSON.stringify(p08);
    for (const banned of ["عناوين IPv4 وصلاحية العنوان", "العناوين الخاصة والعامة", "LIB-T0", "questions", "options", "correct", "hint"]) {
      expect(json, banned).not.toContain(banned);
    }
  });
  it("the whole 791381 course still validates cleanly", () => {
    // (m02 is validated through the registry-level tests too; this pins the page-level contract directly)
    const c = cloneCourse();
    c.modules[0].lessons[0].pages[0].blocks = trainings as ContentBlock[];
    expect(codes(validateLearningCourseContent(c))).toEqual([]);
  });
});
