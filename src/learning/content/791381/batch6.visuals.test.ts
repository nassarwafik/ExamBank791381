// SVG Visual Enrichment — Batch 6. The routing / switch-services arc across the previously visual-free modules:
// Router on a Stick & Trunk (m04, PDF 147–156), VTP (m19, PDF 141), well-known ports (m21, PDF 168), DHCP (m22,
// PDF 170–171), Port Security (m23, PDF 181), Cisco device access (m24, PDF 186), WAN (m26, PDF 207), routing
// protocols (m27, PDF 212–222) and ACL (m06, PDF 223). Pins the exact 16 NEW unique ids, registry total 81, the 16
// visual blocks, page ids / PDF sources, provenance, and after-book placement. No existing interactive component is
// duplicated (the CLI-simulator config pages get no SVG).
import { describe, it, expect } from "vitest";
import m04 from "./modules/m04";
import m19 from "./modules/m19";
import m21 from "./modules/m21";
import m22 from "./modules/m22";
import m23 from "./modules/m23";
import m24 from "./modules/m24";
import m26 from "./modules/m26";
import m27 from "./modules/m27";
import m06 from "./modules/m06";
import { validateLearningCourseContent } from "../validation";
import { resolveVisual, REGISTERED_VISUAL_IDS } from "../../visuals/registry";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentPage, type VisualBlock } from "../types";

const MODS = [m04, m19, m21, m22, m23, m24, m26, m27, m06];
const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: MODS };
const pages: ContentPage[] = MODS.flatMap(m => m.lessons.flatMap(l => l.pages));
const pageBy = (id: string) => pages.find(p => p.id === id)!;
const allVisuals = pages.flatMap(p => p.blocks.filter((b): b is VisualBlock => b.type === "visual").map(b => ({ page: p.id, block: b })));

// The 16 visual-block placements (page id → visual id + PDF source). 16 unique ids, one per page (no reuse in Batch 6).
const PLACEMENTS: Record<string, { visualId: string; pdf: number }> = {
  // m04 — Router on a Stick & Trunk
  "791381-m04-l01-p03": { visualId: "791381/m04/trunk-multi-vlan", pdf: 147 },
  "791381-m04-l02-p02": { visualId: "791381/m04/dot1q-tag-frame", pdf: 152 },
  "791381-m04-l02-p01": { visualId: "791381/m04/router-on-a-stick", pdf: 151 },
  "791381-m04-l03-p01": { visualId: "791381/m04/inter-vlan-flow", pdf: 156 },
  // m19 — VTP
  "791381-m19-l01-p02": { visualId: "791381/m19/vtp-propagation", pdf: 141 },
  // m21 — well-known ports
  "791381-m21-l01-p03": { visualId: "791381/m21/well-known-ports", pdf: 168 },
  // m22 — DHCP
  "791381-m22-l01-p02": { visualId: "791381/m22/dhcp-dora", pdf: 170 },
  "791381-m22-l01-p03": { visualId: "791381/m22/dhcp-pool-excluded", pdf: 171 },
  // m23 — Port Security
  "791381-m23-l01-p02": { visualId: "791381/m23/port-security-scenario", pdf: 181 },
  // m24 — Cisco device access
  "791381-m24-l01-p02": { visualId: "791381/m24/device-access-paths", pdf: 186 },
  // m26 — WAN
  "791381-m26-l01-p01": { visualId: "791381/m26/wan-vs-lan-scope", pdf: 207 },
  // m27 — routing protocols
  "791381-m27-l01-p04": { visualId: "791381/m27/admin-distance", pdf: 213 },
  "791381-m27-l01-p03": { visualId: "791381/m27/routing-update-types", pdf: 212 },
  "791381-m27-l02-p02": { visualId: "791381/m27/ospf-topology", pdf: 215 },
  "791381-m27-l03-p05": { visualId: "791381/m27/show-ip-route", pdf: 222 },
  // m06 — ACL
  "791381-m06-l01-p02": { visualId: "791381/m06/acl-gate", pdf: 223 },
};
const NEW_IDS = [
  "791381/m04/trunk-multi-vlan", "791381/m04/dot1q-tag-frame", "791381/m04/router-on-a-stick", "791381/m04/inter-vlan-flow",
  "791381/m19/vtp-propagation", "791381/m21/well-known-ports", "791381/m22/dhcp-dora", "791381/m22/dhcp-pool-excluded",
  "791381/m23/port-security-scenario", "791381/m24/device-access-paths", "791381/m26/wan-vs-lan-scope",
  "791381/m27/admin-distance", "791381/m27/routing-update-types", "791381/m27/ospf-topology", "791381/m27/show-ip-route",
  "791381/m06/acl-gate",
];
// These modules carried NO visuals before Batch 6, so allVisuals == the Batch-6 set; the filter is defensive.
const visuals = allVisuals.filter(v => NEW_IDS.includes(v.block.visualId));

describe("Batch 6 — scope and placement (routing / switch-services arc)", () => {
  it("all nine modules validate with the visuals present", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
  });

  it("adds exactly 16 visual blocks across the intended pages", () => {
    expect(visuals.length).toBe(16);
    const byPage = Object.fromEntries(visuals.map(v => [v.page, v.block.visualId]));
    expect(byPage).toEqual(Object.fromEntries(Object.entries(PLACEMENTS).map(([p, s]) => [p, s.visualId])));
  });

  it("introduces exactly 16 NEW unique visual ids (no reuse within the batch)", () => {
    const used = new Set(visuals.map(v => v.block.visualId));
    expect([...used].sort()).toEqual([...NEW_IDS].sort());
    expect(used.size).toBe(16);
  });

  it("registry grew by exactly 16 (65 → 81) for Batch 6; each new id resolves (total is later 92 after Batch 9)", () => {
    // Batch 6 added these 16 ids; the branch-local registry total is 92 once Batch 9 appends its 11.
    expect(REGISTERED_VISUAL_IDS.length).toBe(92);
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

  it("appends each visual AFTER the book content, at most one per page, and the page still ends with a practice", () => {
    for (const p of pages) {
      const idxs = p.blocks.map((b, i) => (b.type === "visual" ? i : -1)).filter(i => i >= 0);
      expect(idxs.length, p.id).toBeLessThanOrEqual(1);
      if (idxs.length) {
        expect(idxs[0]).toBeGreaterThan(0);
        expect(p.blocks[0].origin).toBe("book");
        // never the very last block: the pedagogical tail (practice / review) stays after the figure
        expect(p.blocks.at(-1)!.type, p.id).toBe("practice");
      }
    }
  });

  it("introduces no visual on a page outside the intended 16 placements; every intended page carries its visual", () => {
    for (const { page } of visuals) expect(Object.prototype.hasOwnProperty.call(PLACEMENTS, page), page).toBe(true);
    for (const pid of Object.keys(PLACEMENTS)) expect(pageBy(pid).blocks.some(b => b.type === "visual"), pid).toBe(true);
  });

  it("does NOT duplicate the CLI simulator: the ONLY visual sharing a page with a simulation is the additive show-ip-route annotation (PDF 222)", () => {
    // Batch 6 avoids the CLI-config pages entirely; the single deliberate exception is show-ip-route, which ANNOTATES
    // the routing-table OUTPUT (it does not re-run the sim's commands) and so is additive, not a duplicate.
    const onSimPage = visuals.filter(v => pageBy(v.page).blocks.some(b => b.type === "simulation"));
    expect(onSimPage.map(v => v.block.visualId)).toEqual(["791381/m27/show-ip-route"]);
  });
});
