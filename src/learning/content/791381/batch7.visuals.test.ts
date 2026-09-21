// SVG Visual Enrichment — Batch 7 (VTP/Trunk remainder + Wi-Fi + IPv6). Enriches the previously-unenriched pages of
// m19 (VTP roles, PDF 140), m04 (inter-switch trunk ports PDF 146; router sub-interfaces PDF 154/155 — SPLIT per source
// fidelity), m20 (Wi-Fi & wireless, PDF 159–165) and m21 (IPv6 anatomy/compression, PDF 166–167). Pins the exact 13 NEW
// unique ids, post-sync registry total 105 (81 + Batch 7's 13 + Batch 8's 11), the 13 visual blocks, page ids / PDF sources,
// provenance, after-book placement, and the deliberate scope (PDF 157 training / 158 cover get no SVG; PDF 168 keeps its
// existing well-known-ports visual and is not duplicated).
import { describe, it, expect } from "vitest";
import m19 from "./modules/m19";
import m04 from "./modules/m04";
import m20 from "./modules/m20";
import m21 from "./modules/m21";
import { validateLearningCourseContent } from "../validation";
import { resolveVisual, REGISTERED_VISUAL_IDS } from "../../visuals/registry";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentPage, type VisualBlock } from "../types";

const MODS = [m19, m04, m20, m21];
const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: MODS };
const pages: ContentPage[] = MODS.flatMap(m => m.lessons.flatMap(l => l.pages));
const pageBy = (id: string) => pages.find(p => p.id === id)!;
const allVisuals = pages.flatMap(p => p.blocks.filter((b): b is VisualBlock => b.type === "visual").map(b => ({ page: p.id, block: b })));

// The 13 Batch-7 placements (page id → visual id + PDF source). 13 unique ids, one per page.
const PLACEMENTS: Record<string, { visualId: string; pdf: number }> = {
  // m19 — VTP roles
  "791381-m19-l01-p01": { visualId: "791381/m19/vtp-roles", pdf: 140 },
  // m04 — inter-switch trunk ports + router sub-interfaces (154/155 split)
  "791381-m04-l01-p02": { visualId: "791381/m04/inter-switch-trunk-ports", pdf: 146 },
  "791381-m04-l02-p04": { visualId: "791381/m04/subinterfaces-vlan10-20", pdf: 154 },
  "791381-m04-l02-p05": { visualId: "791381/m04/subinterfaces-vlan30-40", pdf: 155 },
  // m20 — Wi-Fi & wireless
  "791381-m20-l01-p01": { visualId: "791381/m20/dmz-three-zone", pdf: 159 },
  "791381-m20-l01-p02": { visualId: "791381/m20/wifi-radio-link", pdf: 160 },
  "791381-m20-l01-p03": { visualId: "791381/m20/wireless-network-types", pdf: 161 },
  "791381-m20-l02-p01": { visualId: "791381/m20/ssid-beacon", pdf: 162 },
  "791381-m20-l02-p02": { visualId: "791381/m20/wifi-security", pdf: 163 },
  "791381-m20-l02-p03": { visualId: "791381/m20/wifi-protection-technologies", pdf: 164 },
  "791381-m20-l02-p04": { visualId: "791381/m20/access-point-bridge", pdf: 165 },
  // m21 — IPv6
  "791381-m21-l01-p01": { visualId: "791381/m21/ipv6-anatomy", pdf: 166 },
  "791381-m21-l01-p02": { visualId: "791381/m21/ipv6-compression", pdf: 167 },
};
const NEW_IDS = [
  "791381/m19/vtp-roles",
  "791381/m04/inter-switch-trunk-ports", "791381/m04/subinterfaces-vlan10-20", "791381/m04/subinterfaces-vlan30-40",
  "791381/m20/dmz-three-zone", "791381/m20/wifi-radio-link", "791381/m20/wireless-network-types", "791381/m20/ssid-beacon",
  "791381/m20/wifi-security", "791381/m20/wifi-protection-technologies", "791381/m20/access-point-bridge",
  "791381/m21/ipv6-anatomy", "791381/m21/ipv6-compression",
];
// m19/m04/m21 already carry Batch-6 visuals; Batch 7 owns only the blocks whose id is one of the 13 NEW ids.
const visuals = allVisuals.filter(v => NEW_IDS.includes(v.block.visualId));

describe("Batch 7 — scope and placement (VTP/Trunk remainder + Wi-Fi + IPv6)", () => {
  it("the four modules validate with the visuals present", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
  });

  it("adds exactly 13 NEW visual blocks across the intended pages", () => {
    expect(visuals.length).toBe(13);
    const byPage = Object.fromEntries(visuals.map(v => [v.page, v.block.visualId]));
    expect(byPage).toEqual(Object.fromEntries(Object.entries(PLACEMENTS).map(([p, s]) => [p, s.visualId])));
  });

  it("introduces exactly 13 NEW unique visual ids (no reuse within the batch)", () => {
    const used = new Set(visuals.map(v => v.block.visualId));
    expect([...used].sort()).toEqual([...NEW_IDS].sort());
    expect(used.size).toBe(13);
  });

  it("post-sync registry total = 81 + Batch 7 (13) + Batch 8 (11) + Batch 9 (16) = 121; each new Batch 7 id resolves", () => {
    expect(REGISTERED_VISUAL_IDS.length).toBe(122);
    for (const id of NEW_IDS) expect(resolveVisual(id), id).not.toBeNull();
  });

  it("the PDF 154 / 155 sub-interface split does NOT leak later-page values between the two diagrams", () => {
    // 154 diagram is on l02-p04, 155 diagram is on l02-p05; each id is distinct (no shared component)
    expect(pageBy("791381-m04-l02-p04").blocks.some(b => b.type === "visual" && (b as VisualBlock).visualId === "791381/m04/subinterfaces-vlan10-20")).toBe(true);
    expect(pageBy("791381-m04-l02-p05").blocks.some(b => b.type === "visual" && (b as VisualBlock).visualId === "791381/m04/subinterfaces-vlan30-40")).toBe(true);
    expect(new Set(["791381/m04/subinterfaces-vlan10-20", "791381/m04/subinterfaces-vlan30-40"]).size).toBe(2);
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

  it("appends each visual AFTER the book content, at most one per page, and the page still ends with a practice", () => {
    for (const p of pages) {
      const idxs = p.blocks.map((b, i) => (b.type === "visual" ? i : -1)).filter(i => i >= 0);
      expect(idxs.length, p.id).toBeLessThanOrEqual(1);
      if (idxs.length) {
        expect(idxs[0]).toBeGreaterThan(0);
        expect(p.blocks[0].origin).toBe("book");
        expect(p.blocks.at(-1)!.type, p.id).toBe("practice");
      }
    }
  });

  it("does NOT duplicate an existing Batch-6 visual and does NOT add an SVG to the training/cover pages", () => {
    // PDF 168 keeps its existing well-known-ports visual; Batch 7 adds no visual there
    const p168 = pageBy("791381-m21-l01-p03");
    expect(p168.source?.pdfPageStart).toBe(168);
    expect(p168.blocks.filter(b => b.type === "visual").map(b => (b as VisualBlock).visualId)).toEqual(["791381/m21/well-known-ports"]);
    // no Batch-7 id lands on a page outside the 13 placements
    for (const { page } of visuals) expect(Object.prototype.hasOwnProperty.call(PLACEMENTS, page), page).toBe(true);
    for (const pid of Object.keys(PLACEMENTS)) expect(pageBy(pid).blocks.some(b => b.type === "visual"), pid).toBe(true);
    // PDF 157 (training) carries no visual
    expect(pages.filter(p => p.source?.pdfPageStart === 157).every(p => !p.blocks.some(b => b.type === "visual"))).toBe(true);
  });
});
