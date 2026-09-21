// SVG Visual Enrichment — Batch 5. Three owner-requested backlog visuals (m08 CIDR/PDF41, m12 broadcast-message/PDF74,
// m13 OSI seven-layers/PDF78) + the roadmap scope (m18 encapsulation/anatomy PDF116–117, m03 switch CLI & VLAN
// PDF121–138). Pins the exact 16 NEW unique ids (2 source-fidelity splits), registry total 65, the 23 visual blocks, page ids/PDF sources,
// provenance, placement, and the deliberate skips (PDF118 tcp-handshake interactive, PDF119 trainings, PDF120 cover).
import { describe, it, expect } from "vitest";
import m08 from "./modules/m08";
import m12 from "./modules/m12";
import m13 from "./modules/m13";
import m18 from "./modules/m18";
import m03 from "./modules/m03";
import { validateLearningCourseContent } from "../validation";
import { resolveVisual, REGISTERED_VISUAL_IDS } from "../../visuals/registry";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentPage, type VisualBlock } from "../types";

const MODS = [m08, m12, m13, m18, m03];
const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: MODS };
const pages: ContentPage[] = MODS.flatMap(m => m.lessons.flatMap(l => l.pages));
const pageBy = (id: string) => pages.find(p => p.id === id)!;
const allVisuals = pages.flatMap(p => p.blocks.filter((b): b is VisualBlock => b.type === "visual").map(b => ({ page: p.id, block: b })));

// The 23 visual-block placements (page id → visual id + PDF source). 16 unique ids; some reused across pages.
const PLACEMENTS: Record<string, { visualId: string; pdf: number }> = {
  // backlog
  "791381-m08-l02-p02": { visualId: "791381/m08/cidr-prefix", pdf: 41 },
  "791381-m12-l03-p03": { visualId: "791381/m12/broadcast-message-structure", pdf: 74 },
  "791381-m13-l01-p02": { visualId: "791381/m13/osi-seven-layers", pdf: 78 },
  // m18
  "791381-m18-l01-p01": { visualId: "791381/m18/encapsulation-stack", pdf: 116 },
  "791381-m18-l01-p02": { visualId: "791381/m18/pdu-anatomy", pdf: 117 },
  // m03 — CLI interface (PDF121, generic) / CLI ladder (PDF122), ports map (PDF123/124)
  "791381-m03-l01-p03": { visualId: "791381/m03/cli-interface", pdf: 121 },
  "791381-m03-l01-p04": { visualId: "791381/m03/cli-mode-ladder", pdf: 122 },
  "791381-m03-l01-p01": { visualId: "791381/m03/switch-ports-map", pdf: 123 },
  "791381-m03-l01-p02": { visualId: "791381/m03/switch-ports-map", pdf: 124 },
  // m03 — VLAN concept (PDF125/127), terms (PDF126)
  "791381-m03-l02-p01": { visualId: "791381/m03/vlan-segmentation", pdf: 125 },
  "791381-m03-l02-p02": { visualId: "791381/m03/vlan-access-trunk-terms", pdf: 126 },
  "791381-m03-l02-p03": { visualId: "791381/m03/vlan-segmentation", pdf: 127 },
  // m03 — example topology (PDF128/129), create (PDF130)
  "791381-m03-l02-p04": { visualId: "791381/m03/vlan-example-topology", pdf: 128 },
  "791381-m03-l02-p05": { visualId: "791381/m03/vlan-example-topology", pdf: 129 },
  "791381-m03-l03-p01": { visualId: "791381/m03/create-vlan", pdf: 130 },
  // m03 — access port assignment (PDF131/132/138), SVI interface (PDF133) / SVI gateway (PDF134)
  "791381-m03-l03-p02": { visualId: "791381/m03/access-port-assignment", pdf: 131 },
  "791381-m03-l03-p03": { visualId: "791381/m03/access-port-assignment", pdf: 132 },
  "791381-m03-l03-p04": { visualId: "791381/m03/svi-interface", pdf: 133 },
  "791381-m03-l03-p05": { visualId: "791381/m03/svi-gateway", pdf: 134 },
  // m03 — tagged/untagged/native (PDF135/136/137), access on PDF138
  "791381-m03-l04-p01": { visualId: "791381/m03/tagged-untagged-native", pdf: 135 },
  "791381-m03-l04-p02": { visualId: "791381/m03/tagged-untagged-native", pdf: 136 },
  "791381-m03-l04-p03": { visualId: "791381/m03/tagged-untagged-native", pdf: 137 },
  "791381-m03-l04-p04": { visualId: "791381/m03/access-port-assignment", pdf: 138 },
};
const NEW_IDS = [
  "791381/m08/cidr-prefix", "791381/m12/broadcast-message-structure", "791381/m13/osi-seven-layers",
  "791381/m18/encapsulation-stack", "791381/m18/pdu-anatomy",
  "791381/m03/cli-interface", "791381/m03/cli-mode-ladder", "791381/m03/switch-ports-map",
  "791381/m03/svi-interface", "791381/m03/vlan-segmentation",
  "791381/m03/vlan-access-trunk-terms", "791381/m03/vlan-example-topology", "791381/m03/create-vlan",
  "791381/m03/access-port-assignment", "791381/m03/svi-gateway", "791381/m03/tagged-untagged-native",
];
// m08/m12/m13 already carry Batch-2/3 visuals; Batch 5 owns only the blocks whose id is one of the 16 NEW ids.
const visuals = allVisuals.filter(v => NEW_IDS.includes(v.block.visualId));

describe("Batch 5 — scope and placement (backlog + m18 + m03)", () => {
  it("all five modules validate with the visuals present", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
  });

  it("adds exactly 23 visual blocks across the intended pages", () => {
    expect(visuals.length).toBe(23);
    const byPage = Object.fromEntries(visuals.map(v => [v.page, v.block.visualId]));
    expect(byPage).toEqual(Object.fromEntries(Object.entries(PLACEMENTS).map(([p, s]) => [p, s.visualId])));
  });

  it("introduces exactly 16 NEW unique visual ids", () => {
    const used = new Set(visuals.map(v => v.block.visualId));
    expect([...used].sort()).toEqual([...NEW_IDS].sort());
    expect(used.size).toBe(16);
  });

  it("registry grew by exactly 16 (49 → 65); each new id resolves", () => {
    expect(REGISTERED_VISUAL_IDS.length).toBe(105);
    for (const id of NEW_IDS) expect(resolveVisual(id), id).not.toBeNull();
  });

  it("each visual is teacher-enrichment, source-associated to its page's PDF, resolves, and is accessible", () => {
    for (const { page, block } of visuals) {
      const sel = PLACEMENTS[page];
      expect(sel, page).toBeTruthy();
      expect(block.visualId).toBe(sel.visualId);
      expect(block.origin).toBe("teacher-enrichment");
      expect(block.source?.pdfPageStart).toBe(sel.pdf);
      expect(resolveVisual(block.visualId)).not.toBeNull();
      expect(block.alt.trim().length).toBeGreaterThan(15);
      expect(block.title && block.title.trim().length).toBeTruthy();
      expect(block.caption && block.caption.trim().length).toBeTruthy();
      expect(block.id).toBe(page.replace("791381-", "") + "-visual");
    }
  });

  it("appends each visual AFTER the book content, at most one per page", () => {
    for (const p of pages) {
      const idxs = p.blocks.map((b, i) => (b.type === "visual" ? i : -1)).filter(i => i >= 0);
      expect(idxs.length, p.id).toBeLessThanOrEqual(1);
      if (idxs.length) { expect(idxs[0]).toBeGreaterThan(0); expect(p.blocks[0].origin).toBe("book"); }
    }
  });

  it("the three backlog visuals map to their EXACT site pages / PDF sources (site35→PDF41, site67→PDF74, site70→PDF78)", () => {
    expect(pageBy("791381-m08-l02-p02").source?.pdfPageStart).toBe(41);
    expect(pageBy("791381-m12-l03-p03").source?.pdfPageStart).toBe(74);
    expect(pageBy("791381-m13-l01-p02").source?.pdfPageStart).toBe(78);
    for (const [pid, pdf] of [["791381-m08-l02-p02", 41], ["791381-m12-l03-p03", 74], ["791381-m13-l01-p02", 78]] as const) {
      const v = visuals.find(x => x.page === pid)!;
      expect(v.block.source?.pdfPageStart, pid).toBe(pdf);
    }
  });

  it("SKIPS PDF118 (existing tcp-handshake interactive) — no new SVG on that page", () => {
    const p = pageBy("791381-m18-l02-p01");
    expect(p.source?.pdfPageStart).toBe(118);
    expect(p.blocks.some(b => b.type === "visual")).toBe(false);
    expect(p.blocks.some(b => b.type === "interactive-diagram")).toBe(true);
  });

  it("SKIPS PDF119 (trainings) — no SVG", () => {
    const p = pageBy("791381-m18-l03-p01");
    expect(p.source?.pdfPageStart).toBe(119);
    expect(p.blocks.some(b => b.type === "visual")).toBe(false);
  });

  it("PDF120 cover is absent (no page/visual sourced to PDF120)", () => {
    expect(pages.some(p => p.source?.pdfPageStart === 120)).toBe(false);
    expect(visuals.some(v => v.block.source?.pdfPageStart === 120)).toBe(false);
  });

  it("introduces no visual on a page outside the intended 23 placements", () => {
    for (const { page } of visuals) expect(Object.prototype.hasOwnProperty.call(PLACEMENTS, page), page).toBe(true);
    // every intended page actually carries its visual
    for (const pid of Object.keys(PLACEMENTS)) expect(pageBy(pid).blocks.some(b => b.type === "visual"), pid).toBe(true);
  });
});
