// SVG Visual Enrichment — Batch 3 (units m10/m11/m12/m13/m14, source PDF 57–92). Scope, provenance, accessibility,
// placement (appended after book content), registry resolution, and the deliberate SKIPs (activity pages + openers).
import { describe, it, expect } from "vitest";
import m10 from "./modules/m10";
import m11 from "./modules/m11";
import m12 from "./modules/m12";
import m13 from "./modules/m13";
import m14 from "./modules/m14";
import m15 from "./modules/m15";
import { validateLearningCourseContent } from "../validation";
import { resolveVisual } from "../../visuals/registry";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentPage, type VisualBlock } from "../types";

const MODS = [m10, m11, m12, m13, m14, m15];
const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: MODS };
const pages: ContentPage[] = MODS.flatMap(m => m.lessons.flatMap(l => l.pages));
const pageBy = (id: string) => pages.find(p => p.id === id)!;
const allVisuals = pages.flatMap(p => p.blocks.filter((b): b is VisualBlock => b.type === "visual").map(b => ({ page: p.id, block: b })));

// The 18 deliberate selections: page → { visualId, source PDF }.
const SELECTION: Record<string, { visualId: string; pdf: number }> = {
  "791381-m10-l01-p01": { visualId: "791381/m10/p2p-direct", pdf: 58 },
  "791381-m10-l01-p02": { visualId: "791381/m10/bus-collision", pdf: 59 },
  "791381-m11-l01-p01": { visualId: "791381/m11/utp-vs-stp", pdf: 62 },
  "791381-m11-l02-p02": { visualId: "791381/m11/mac-frame-delivery", pdf: 65 },
  "791381-m12-l01-p01": { visualId: "791381/m12/message-types", pdf: 67 },
  "791381-m12-l01-p02": { visualId: "791381/m12/unicast-multicast", pdf: 68 },
  "791381-m12-l03-p01": { visualId: "791381/m12/storage-units", pdf: 72 },
  "791381-m12-l03-p02": { visualId: "791381/m12/message-structure", pdf: 73 },
  "791381-m13-l02-p02": { visualId: "791381/m13/tcpip-layers", pdf: 82 },
  "791381-m13-l02-p03": { visualId: "791381/m13/osi-vs-tcpip", pdf: 83 },
  "791381-m13-l03-p01": { visualId: "791381/m13/tcp-vs-udp", pdf: 84 },
  "791381-m14-l01-p01": { visualId: "791381/m14/protocol-agreement", pdf: 87 },
  "791381-m14-l01-p02": { visualId: "791381/m14/dns-http-dhcp", pdf: 88 },
  "791381-m14-l02-p02": { visualId: "791381/m14/ssh-vs-telnet", pdf: 90 },
  "791381-m14-l03-p02": { visualId: "791381/m14/protocols-by-transport", pdf: 92 },
  // m15 — network-check commands (completes the 40-page discovery m10–m15, PDF 57–97)
  "791381-m15-l01-p01": { visualId: "791381/m15/ping-echo", pdf: 93 },
  "791381-m15-l02-p01": { visualId: "791381/m15/tracert-hops", pdf: 95 },
  "791381-m15-l02-p03": { visualId: "791381/m15/arp-association", pdf: 97 },
};

// m12/m13 later gained Batch-5 backlog visuals (broadcast-message-structure, osi-seven-layers); Batch 3 owns only its own ids.
const B3_IDS = new Set(Object.values(SELECTION).map(s => s.visualId));
const visuals = allVisuals.filter(v => B3_IDS.has(v.block.visualId));

// Pages deliberately SKIPPED because they already carry a strong interactive activity (would duplicate).
const SKIP_WITH_ACTIVITY: Record<string, string> = {
  "791381-m10-l02-p01": "interactive-diagram", // network-topologies explorer
  "791381-m11-l01-p02": "interactive-diagram",
  "791381-m11-l02-p01": "interactive-diagram", // mac-address anatomy
  "791381-m12-l01-p03": "simulation",          // message-delivery
  "791381-m12-l02-p01": "interactive-diagram", // broadcast-address
  "791381-m13-l01-p04": "interactive-diagram", // osi-layers explorer
};

describe("Batch 3 — scope and quality", () => {
  it("the five modules validate with the visuals present (no schema/provenance regression)", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
  });

  it("adds exactly 18 visuals (target 15–18), one per selected page, on the intended pages", () => {
    expect(visuals.length).toBe(18);
    const byPage = Object.fromEntries(visuals.map(v => [v.page, v.block.visualId]));
    expect(byPage).toEqual(Object.fromEntries(Object.entries(SELECTION).map(([p, s]) => [p, s.visualId])));
  });

  it("each visual is teacher-enrichment, source-associated to its page's PDF, resolves in the registry, and is accessible", () => {
    for (const { page, block } of visuals) {
      const sel = SELECTION[page];
      expect(sel, page).toBeTruthy();
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

  it("SKIPS the unit-opener pages (no visual on a title page)", () => {
    for (const id of ["791381-m10-l00-p01", "791381-m11-l00-p01", "791381-m12-l00-p01"]) {
      expect(pageBy(id).blocks.some(b => b.type === "visual"), id).toBe(false);
    }
  });
});
