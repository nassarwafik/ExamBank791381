// SVG Visual Enrichment — Batch 8. The services / routing arc across the previously visual-free CONCEPT pages:
// DHCP intro & dedicated server (m22, PDF 169 / 176), Port Security concept (m23, PDF 180), Cisco device security
// framing (m24, PDF 185), the Cisco command reference maps (m05, PDF 192 / 198), WAN technologies (m26, PDF 208 /
// 209) and routing protocols (m27, PDF 210 / 211 / 218). Pins the exact 11 NEW unique ids, branch-local registry
// post-sync registry total 105 (81 + Batch 7's 13 + Batch 8's 11), the 11 visual blocks, page ids / PDF sources, provenance and after-book placement.
// The CLI-simulator command pages get NO redundant SVG; the two existing components enhanced in place (DHCP pool
// PDF 171, Admin Distance PDF 213) keep their ids and add no new registry entry.
import { describe, it, expect } from "vitest";
import m22 from "./modules/m22";
import m23 from "./modules/m23";
import m24 from "./modules/m24";
import m05 from "./modules/m05";
import m26 from "./modules/m26";
import m27 from "./modules/m27";
import { validateLearningCourseContent } from "../validation";
import { resolveVisual, REGISTERED_VISUAL_IDS } from "../../visuals/registry";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentPage, type VisualBlock } from "../types";

const MODS = [m22, m23, m24, m05, m26, m27];
const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: MODS };
const pages: ContentPage[] = MODS.flatMap(m => m.lessons.flatMap(l => l.pages));
const pageBy = (id: string) => pages.find(p => p.id === id)!;
const allVisuals = pages.flatMap(p => p.blocks.filter((b): b is VisualBlock => b.type === "visual").map(b => ({ page: p.id, block: b })));

// The 11 NEW visual-block placements (page id → visual id + PDF source). 11 unique ids, one per page (no reuse).
const PLACEMENTS: Record<string, { visualId: string; pdf: number }> = {
  // m22 — DHCP concept pages
  "791381-m22-l01-p01": { visualId: "791381/m22/dhcp-automatic-config", pdf: 169 },
  "791381-m22-l03-p01": { visualId: "791381/m22/dedicated-dhcp-server", pdf: 176 },
  // m23 — Port Security concept
  "791381-m23-l01-p01": { visualId: "791381/m23/port-security-concept", pdf: 180 },
  // m24 — Cisco device security framing
  "791381-m24-l01-p01": { visualId: "791381/m24/device-security-layers", pdf: 185 },
  // m05 — Cisco command reference maps
  "791381-m05-l01-p03": { visualId: "791381/m05/cisco-cli-overview", pdf: 192 },
  "791381-m05-l03-p01": { visualId: "791381/m05/show-commands-map", pdf: 198 },
  // m26 — WAN technologies
  "791381-m26-l01-p02": { visualId: "791381/m26/frame-relay-vs-atm", pdf: 208 },
  "791381-m26-l01-p03": { visualId: "791381/m26/hdlc-vs-metro", pdf: 209 },
  // m27 — routing protocols
  "791381-m27-l01-p01": { visualId: "791381/m27/routing-methods-overview", pdf: 210 },
  "791381-m27-l01-p02": { visualId: "791381/m27/static-route-path", pdf: 211 },
  "791381-m27-l03-p01": { visualId: "791381/m27/eigrp-metric-adaptation", pdf: 218 },
};
const NEW_IDS = [
  "791381/m22/dhcp-automatic-config", "791381/m22/dedicated-dhcp-server",
  "791381/m23/port-security-concept",
  "791381/m24/device-security-layers",
  "791381/m05/cisco-cli-overview", "791381/m05/show-commands-map",
  "791381/m26/frame-relay-vs-atm", "791381/m26/hdlc-vs-metro",
  "791381/m27/routing-methods-overview", "791381/m27/static-route-path", "791381/m27/eigrp-metric-adaptation",
];
// Two EXISTING (Batch 6) components enhanced in place — same id, NO new registry entry.
const ENHANCED_EXISTING_IDS = ["791381/m22/dhcp-pool-excluded", "791381/m27/admin-distance"];
// m22/m23/m24/m05/m26/m27 already carried Batch-6 visuals, so filter to the NEW batch-8 set for the batch's counts.
const visuals = allVisuals.filter(v => NEW_IDS.includes(v.block.visualId));

describe("Batch 8 — scope and placement (services / routing concept arc)", () => {
  it("all six modules validate with the visuals present", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
  });

  it("adds exactly 11 NEW visual blocks across the intended concept pages", () => {
    expect(visuals.length).toBe(11);
    const byPage = Object.fromEntries(visuals.map(v => [v.page, v.block.visualId]));
    expect(byPage).toEqual(Object.fromEntries(Object.entries(PLACEMENTS).map(([p, s]) => [p, s.visualId])));
  });

  it("introduces exactly 11 NEW unique visual ids (no reuse within the batch)", () => {
    const used = new Set(visuals.map(v => v.block.visualId));
    expect([...used].sort()).toEqual([...NEW_IDS].sort());
    expect(used.size).toBe(11);
  });

  it("post-sync registry total = 81 + Batch 7 (13) + Batch 8 (11) + Batch 9 (16) = 121; each new Batch 8 id resolves", () => {
    expect(REGISTERED_VISUAL_IDS.length).toBe(121);
    for (const id of NEW_IDS) expect(resolveVisual(id), id).not.toBeNull();
  });

  it("the two enhanced existing components keep their ids and add NO new registry entry", () => {
    for (const id of ENHANCED_EXISTING_IDS) expect(resolveVisual(id), id).not.toBeNull();
    for (const id of ENHANCED_EXISTING_IDS) expect(NEW_IDS.includes(id), id).toBe(false);
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

  it("appends each NEW visual AFTER the book content, at most one per page, and the page still ends with a practice", () => {
    for (const { page } of visuals) {
      const p = pageBy(page);
      const idxs = p.blocks.map((b, i) => (b.type === "visual" ? i : -1)).filter(i => i >= 0);
      expect(idxs.length, p.id).toBe(1);
      expect(idxs[0], p.id).toBeGreaterThan(0);
      expect(p.blocks[0].origin, p.id).toBe("book");
      expect(p.blocks.at(-1)!.type, p.id).toBe("practice");
    }
  });

  it("introduces no NEW visual on a page outside the intended 11 placements; every intended page carries its visual", () => {
    for (const { page } of visuals) expect(Object.prototype.hasOwnProperty.call(PLACEMENTS, page), page).toBe(true);
    for (const pid of Object.keys(PLACEMENTS)) {
      const on = pageBy(pid).blocks.filter((b): b is VisualBlock => b.type === "visual").map(b => b.visualId);
      expect(on.includes(PLACEMENTS[pid].visualId), pid).toBe(true);
    }
  });

  it("does NOT place a NEW visual on any CLI-simulator page (the simulator is stronger for command pages)", () => {
    const onSimPage = visuals.filter(v => pageBy(v.page).blocks.some(b => b.type === "simulation"));
    expect(onSimPage.map(v => v.block.visualId)).toEqual([]);
  });
});
