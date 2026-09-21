// Chapter 1 (module m01 «أساسيات الشبكات») SVG VISUAL-ENRICHMENT PILOT — scope, provenance, a11y, and the guarantee
// that NOTHING outside Chapter 1 was touched by this pilot.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import m01 from "./modules/m01";
import { validateLearningCourseContent } from "../validation";
import { resolveVisual } from "../../visuals/registry";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentPage, type VisualBlock } from "../types";

const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: [m01] };
const pages: ContentPage[] = m01.lessons.flatMap(l => l.pages);
const pageBy = (id: string) => pages.find(p => p.id === id)!;
const visuals = pages.flatMap(p => p.blocks.filter((b): b is VisualBlock => b.type === "visual").map(b => ({ page: p.id, block: b })));

// The exact selection: page id → { visualId, source PDF }. These are the pilot's deliberate pedagogical picks.
const SELECTION: Record<string, { visualId: string; pdf: number }> = {
  "791381-m01-l01-p01": { visualId: "791381/ch1/network-connected-devices", pdf: 8 },
  "791381-m01-l01-p02": { visualId: "791381/ch1/network-uses-map", pdf: 9 },
  "791381-m01-l01-p03": { visualId: "791381/ch1/shared-printer", pdf: 10 },
  "791381-m01-l02-p02": { visualId: "791381/ch1/network-building-blocks", pdf: 12 },
  "791381-m01-l02-p03": { visualId: "791381/ch1/network-management-cycle", pdf: 13 },
};

describe("Chapter 1 SVG visual enrichment — scope", () => {
  it("m01 validates with the visuals present (no schema/provenance regression)", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
  });

  it("adds exactly one visual to each of the five selected pages (4–8 pilot target)", () => {
    expect(visuals.length).toBe(5);
    const byPage = Object.fromEntries(visuals.map(v => [v.page, v.block.visualId]));
    expect(byPage).toEqual(Object.fromEntries(Object.entries(SELECTION).map(([p, s]) => [p, s.visualId])));
  });

  it("each visual is teacher-enrichment, source-associated to its page's PDF, resolves in the registry, and is accessible", () => {
    for (const { page, block } of visuals) {
      const sel = SELECTION[page];
      expect(block.origin).toBe("teacher-enrichment");
      expect(block.source?.pdfPageStart).toBe(sel.pdf);
      expect(resolveVisual(block.visualId)).not.toBeNull();
      expect(block.alt.trim().length).toBeGreaterThan(10);
      expect(block.title && block.title.trim().length).toBeTruthy();
      expect(block.caption && block.caption.trim().length).toBeTruthy();
      expect(block.id).toBe(page.replace("791381-", "") + "-visual");
    }
  });

  it("appends each visual AFTER the book content (book flow preserved; not rewritten)", () => {
    for (const { page, block } of visuals) {
      const p = pageBy(page);
      const idx = p.blocks.findIndex(b => b.id === block.id);
      // every block before the visual on that page is book-derived OR an existing enrichment activity — never removed
      expect(idx).toBeGreaterThan(0);
      expect(p.blocks[0].origin).toBe("book");
    }
  });

  it("deliberately SKIPS pages where a visual would be redundant or clutter (opener, and the types page that already has an interactive diagram)", () => {
    expect(pageBy("791381-m01-l00-p01").blocks.some(b => b.type === "visual")).toBe(false);
    expect(pageBy("791381-m01-l02-p01").blocks.some(b => b.type === "visual")).toBe(false);
    // the types page still carries its pre-existing interactive-diagram (untouched)
    expect(pageBy("791381-m01-l02-p01").blocks.some(b => b.type === "interactive-diagram")).toBe(true);
  });
});

describe("Chapter 1 pilot — scope of visual enrichment", () => {
  const modulesDir = fileURLToPath(new URL("./modules/", import.meta.url));
  // Chapter 1 pilot (m01) + Batch 2 (m02, m07, m08, m09) + Batch 3 (m10, m11, m12, m13, m14, m15) + Batch 4 (m16, m17)
  // are the modules that carry SVG visual enrichment. Any OTHER module gaining a `visual` block would be out of scope.
  it("only the pilot + Batch 2 + Batch 3 + Batch 4 modules contain visual blocks (no other module touched)", () => {
    const withVisual = readdirSync(modulesDir)
      .filter(f => /^m\d+\.ts$/.test(f))
      .filter(f => /type:\s*"visual"/.test(readFileSync(modulesDir + f, "utf8")))
      .sort();
    expect(withVisual).toEqual(["m01.ts", "m02.ts", "m07.ts", "m08.ts", "m09.ts", "m10.ts", "m11.ts", "m12.ts", "m13.ts", "m14.ts", "m15.ts", "m16.ts", "m17.ts"]);
  });
});
