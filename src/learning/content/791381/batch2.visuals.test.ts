// SVG Visual Enrichment — Batch 2 (40-page discovery batch across m02/m07/m08/m09). Scope, provenance, accessibility,
// placement (appended after book content), registry resolution, and the deliberate SKIPs.
import { describe, it, expect } from "vitest";
import m02 from "./modules/m02";
import m07 from "./modules/m07";
import m08 from "./modules/m08";
import m09 from "./modules/m09";
import { validateLearningCourseContent } from "../validation";
import { resolveVisual } from "../../visuals/registry";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentPage, type VisualBlock } from "../types";

const MODS = [m02, m07, m08, m09];
const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: MODS };
const pages: ContentPage[] = MODS.flatMap(m => m.lessons.flatMap(l => l.pages));
const pageBy = (id: string) => pages.find(p => p.id === id)!;
const allVisuals = pages.flatMap(p => p.blocks.filter((b): b is VisualBlock => b.type === "visual").map(b => ({ page: p.id, block: b })));

// The 13 deliberate selections: page → { visualId, source PDF }.
const SELECTION: Record<string, { visualId: string; pdf: number }> = {
  "791381-m02-l01-p01": { visualId: "791381/m02/binary-to-decimal", pdf: 16 },
  "791381-m02-l01-p03": { visualId: "791381/m02/hex-to-binary", pdf: 20 },
  "791381-m02-l01-p09": { visualId: "791381/m02/conversion-map", pdf: 23 },
  "791381-m07-l01-p01": { visualId: "791381/m07/ip-identity", pdf: 25 },
  "791381-m07-l01-p02": { visualId: "791381/m07/ipv4-vs-ipv6", pdf: 26 },
  "791381-m07-l02-p01": { visualId: "791381/m07/private-public", pdf: 30 },
  "791381-m07-l02-p04": { visualId: "791381/m07/static-dynamic", pdf: 33 },
  "791381-m08-l01-p01": { visualId: "791381/m08/address-classes", pdf: 35 },
  "791381-m08-l01-p03": { visualId: "791381/m08/subnet-mask", pdf: 37 },
  "791381-m08-l03-p01": { visualId: "791381/m08/same-network", pdf: 43 },
  "791381-m09-l01-p02": { visualId: "791381/m09/hub-flood", pdf: 50 },
  "791381-m09-l01-p04": { visualId: "791381/m09/switch-unicast", pdf: 52 },
  "791381-m09-l02-p01": { visualId: "791381/m09/router-networks", pdf: 54 },
};

// m08 later gained a Batch-5 backlog visual (cidr-prefix); Batch 2 owns only the blocks whose id is one of its own.
const B2_IDS = new Set(Object.values(SELECTION).map(s => s.visualId));
const visuals = allVisuals.filter(v => B2_IDS.has(v.block.visualId));

// Pages deliberately SKIPPED because they already carry a strong interactive activity (would duplicate).
const SKIP_WITH_ACTIVITY: Record<string, string> = {
  "791381-m07-l01-p03": "interactive-diagram", // ipv4-octets
  "791381-m08-l02-p01": "interactive-diagram", // cidr-network-host
  "791381-m08-l03-p03": "animation",           // gateway-flow
  "791381-m09-l01-p01": "simulation",          // hub-switch-router-flow
};

describe("Batch 2 — scope and quality", () => {
  it("the four modules validate with the visuals present (no schema/provenance regression)", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
  });

  it("adds exactly 13 visuals (10–15 target), one per selected page, on the intended pages", () => {
    expect(visuals.length).toBe(13);
    const byPage = Object.fromEntries(visuals.map(v => [v.page, v.block.visualId]));
    expect(byPage).toEqual(Object.fromEntries(Object.entries(SELECTION).map(([p, s]) => [p, s.visualId])));
  });

  it("each visual is teacher-enrichment, source-associated to its page's PDF, resolves in the registry, and is accessible", () => {
    for (const { page, block } of visuals) {
      const sel = SELECTION[page];
      expect(block.origin).toBe("teacher-enrichment");
      expect(block.source?.pdfPageStart).toBe(sel.pdf);
      expect(resolveVisual(block.visualId)).not.toBeNull();
      expect(block.alt.trim().length).toBeGreaterThan(15);
      expect(block.title && block.title.trim().length).toBeTruthy();
      expect(block.caption && block.caption.trim().length).toBeTruthy();
      expect(block.id).toBe(page.replace("791381-", "") + "-visual");
    }
  });

  it("appends each visual AFTER the book content (book flow preserved; not rewritten), at most one per page", () => {
    for (const p of pages) {
      const idxs = p.blocks.map((b, i) => (b.type === "visual" ? i : -1)).filter(i => i >= 0);
      expect(idxs.length).toBeLessThanOrEqual(1);
      if (idxs.length) {
        expect(idxs[0]).toBeGreaterThan(0);
        expect(p.blocks[0].origin).toBe("book");
      }
    }
  });

  it("SKIPS pages that already carry a strong interactive activity (no duplicate visual added)", () => {
    for (const [id, kind] of Object.entries(SKIP_WITH_ACTIVITY)) {
      const p = pageBy(id);
      expect(p.blocks.some(b => b.type === "visual"), id).toBe(false);
      expect(p.blocks.some(b => b.type === kind), id).toBe(true);
    }
  });

  it("SKIPS the four unit-opener pages (no visual on a title page)", () => {
    for (const id of ["791381-m02-l00-p01", "791381-m07-l00-p01", "791381-m08-l00-p01", "791381-m09-l00-p01"]) {
      expect(pageBy(id).blocks.some(b => b.type === "visual"), id).toBe(false);
    }
  });
});
