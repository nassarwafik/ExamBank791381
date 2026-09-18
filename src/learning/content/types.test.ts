// Learning Materials — Phase 2: provenance + source-inheritance helpers (OWNER §1/§2).
import { describe, it, expect } from "vitest";
import { blockOrigin, effectiveBlockSource, deriveManifest, type ContentPage, type ContentBlock } from "./types";
import { validCourse } from "./content.fixtures";

const page: ContentPage = {
  id: "p", title: "p", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 10 }, blocks: [],
};
const bookBlock: ContentBlock = { id: "b1", type: "text", origin: "book", spans: [{ text: "x" }] };
const enrichBlock: ContentBlock = { id: "b2", type: "text", origin: "teacher-enrichment", spans: [{ text: "y" }] };
const ownSourceBlock: ContentBlock = {
  id: "b3", type: "text", origin: "teacher-enrichment", source: { kind: "book", sourceId: "791381", pdfPageStart: 12 }, spans: [{ text: "z" }],
};

describe("Phase 2 — provenance & source inheritance", () => {
  it("blockOrigin returns the explicitly declared provenance (it never invents one)", () => {
    expect(blockOrigin(bookBlock)).toBe("book");
    expect(blockOrigin(enrichBlock)).toBe("teacher-enrichment");
  });

  it("a book block inherits the page source; an enrichment block does not, unless it declares its own", () => {
    expect(effectiveBlockSource(page, bookBlock)).toBe(page.source);          // inherited
    expect(effectiveBlockSource(page, enrichBlock)).toBeUndefined();          // supplementary, no inheritance
    expect(effectiveBlockSource(page, ownSourceBlock)?.pdfPageStart).toBe(12); // explicit block source wins
  });

  it("deriveManifest drops block bodies but keeps identities, order and source", () => {
    const m = deriveManifest(validCourse);
    expect(m.courseId).toBe(validCourse.courseId);
    const p0 = m.modules[0].lessons[0].pages[0];
    expect(p0.id).toBe(validCourse.modules[0].lessons[0].pages[0].id);
    expect((p0 as { blocks?: unknown }).blocks).toBeUndefined();
    expect(p0.source?.sourceId).toBe("791381");
  });
});
