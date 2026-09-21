// SVG Visual Enrichment — Batch 9 (FINAL). The ACL decision detail (m06 Standard/Extended, PDF 224/227) and the
// comprehensive summary module m28 (PDF 231–262). Pins the 11 NEW unique ids, the branch-local registry total 92,
// the new placements, the existing-id REUSE placements (one per summary page, exact source association), the
// page-by-page audit decisions for PDF 231–262, and the pages intentionally DEFERRED for Batch 7/8 reuse after the
// controlled sync (IPv6 PDF 244, Metro-Ethernet PDF 250, Static Route PDF 251). No CLI-engine / grading / publication
// coupling; at most one visual block per page; every page still ends with its practice tail.
import { describe, it, expect } from "vitest";
import m06 from "./modules/m06";
import m28 from "./modules/m28";
import { validateLearningCourseContent } from "../validation";
import { resolveVisual, REGISTERED_VISUAL_IDS } from "../../visuals/registry";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentPage, type VisualBlock } from "../types";

const MODS = [m06, m28];
const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: MODS };
const pages: ContentPage[] = MODS.flatMap(m => m.lessons.flatMap(l => l.pages));
const pageBy = (id: string) => pages.find(p => p.id === id)!;
const allVisuals = pages.flatMap(p => p.blocks.filter((b): b is VisualBlock => b.type === "visual").map(b => ({ page: p.id, block: b })));

// The 11 NEW unique ids introduced by Batch 9 (2 in m06, 9 in m28).
const NEW_IDS = [
  "791381/m06/standard-acl-source", "791381/m06/extended-acl-decision",
  "791381/m28/ip-vs-mac-summary", "791381/m28/network-device-roles", "791381/m28/cable-media-overview",
  "791381/m28/subnetting-walkthrough", "791381/m28/wildcard-inversion", "791381/m28/nat-pat-apipa",
  "791381/m28/tcp-three-way-handshake", "791381/m28/web-opening-journey", "791381/m28/troubleshooting-command-map",
];

// NEW-visual placements: page id → { visual id, PDF source }.
const NEW_PLACEMENTS: Record<string, { visualId: string; pdf: number }> = {
  "791381-m06-l01-p03": { visualId: "791381/m06/standard-acl-source", pdf: 224 },
  "791381-m06-l01-p01": { visualId: "791381/m06/extended-acl-decision", pdf: 227 },
  "791381-m28-l01-p01": { visualId: "791381/m28/ip-vs-mac-summary", pdf: 231 },
  "791381-m28-l01-p04": { visualId: "791381/m28/network-device-roles", pdf: 234 },
  "791381-m28-l01-p05": { visualId: "791381/m28/cable-media-overview", pdf: 235 },
  "791381-m28-l03-p02": { visualId: "791381/m28/subnetting-walkthrough", pdf: 242 },
  "791381-m28-l03-p03": { visualId: "791381/m28/wildcard-inversion", pdf: 243 },
  "791381-m28-l07-p01": { visualId: "791381/m28/nat-pat-apipa", pdf: 258 },
  "791381-m28-l07-p03": { visualId: "791381/m28/tcp-three-way-handshake", pdf: 260 },
  "791381-m28-l07-p04": { visualId: "791381/m28/web-opening-journey", pdf: 261 },
  "791381-m28-l07-p05": { visualId: "791381/m28/troubleshooting-command-map", pdf: 262 },
};

// REUSE placements: page id → { EXISTING visual id, PDF source }. These reuse a strong visual we already own where
// the source match is exact; they add NO new registry entry.
const REUSE_PLACEMENTS: Record<string, { visualId: string; pdf: number }> = {
  "791381-m28-l01-p02": { visualId: "791381/m08/address-classes", pdf: 232 },
  "791381-m28-l01-p03": { visualId: "791381/m02/conversion-map", pdf: 233 },
  "791381-m28-l02-p01": { visualId: "791381/m13/osi-seven-layers", pdf: 237 },
  "791381-m28-l02-p02": { visualId: "791381/m21/well-known-ports", pdf: 238 },
  "791381-m28-l02-p03": { visualId: "791381/m13/tcp-vs-udp", pdf: 239 },
  "791381-m28-l02-p04": { visualId: "791381/m18/encapsulation-stack", pdf: 240 },
  "791381-m28-l04-p05": { visualId: "791381/m16/stp-loop-blocking", pdf: 249 },
  "791381-m28-l05-p02": { visualId: "791381/m27/admin-distance", pdf: 252 },
  "791381-m28-l06-p02": { visualId: "791381/m23/port-security-scenario", pdf: 255 },
  "791381-m28-l06-p03": { visualId: "791381/m24/device-access-paths", pdf: 256 },
  "791381-m28-l06-p04": { visualId: "791381/m06/acl-gate", pdf: 257 },
  "791381-m28-l07-p02": { visualId: "791381/m22/dhcp-dora", pdf: 259 },
};

// Batch 9 introduces a visual on exactly these pages. (m06-l01-p02 already carries the Batch-6 acl-gate visual.)
const BATCH9_PAGES = new Set([...Object.keys(NEW_PLACEMENTS), ...Object.keys(REUSE_PLACEMENTS)]);

// m28 pages that intentionally get NO Batch-9 visual, recorded page-by-page.
const AUDIT_NO_VISUAL: Record<number, string> = {
  236: "PAN/LAN/MAN/WAN/WLAN — five-scope table; wan-vs-lan-scope covers only two, so the table is the better representation (B)",
  241: "special addresses + message types — two combined tables are the better representation (B)",
  245: "VLAN & VTP concept cards (+ DMZ/VPN) — multi-concept, no single visual matches without adding content (B)",
  246: "VLAN/Trunk CLI page — the live simulation is the representation; no CLI duplication (B)",
  247: "VTP modes/commands CLI page — modes table + simulation are the representation (B)",
  248: "Inter-VLAN Dot1Q CLI page — the Router-on-a-Stick simulation demonstrates it (B)",
  253: "routing-protocol comparison — page classifies EIGRP as Hybrid and prints no periodic/on-change; routing-update-types would add unsupported content, so the table is better (B)",
  254: "common-attacks table (7 types) — attack-targets shows attack TARGETS not TYPES; no single visual matches, table is better (B)",
};
const DEFERRED_FOR_SYNC: Record<number, string> = {
  244: "IPv6 — reuse a Batch 7/8 IPv6 visual only after the controlled sync",
  250: "Metro-Ethernet — reuse a Batch 7/8 Metro-Ethernet visual only after the controlled sync",
  251: "Static Route — reuse a Batch 7/8 static-route visual only after the controlled sync",
};

const isNew = (id: string) => NEW_IDS.includes(id);
const newVisuals = allVisuals.filter(v => Object.prototype.hasOwnProperty.call(NEW_PLACEMENTS, v.page) && isNew(v.block.visualId));
const reuseVisuals = allVisuals.filter(v => Object.prototype.hasOwnProperty.call(REUSE_PLACEMENTS, v.page));

describe("Batch 9 — scope, registry and the 11 new unique ids", () => {
  it("m06 + m28 validate with the visuals present", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
  });
  it("introduces exactly 11 NEW unique visual ids, each resolving in the registry", () => {
    expect(new Set(NEW_IDS).size).toBe(11);
    for (const id of NEW_IDS) expect(resolveVisual(id), id).not.toBeNull();
  });
  it("branch-local registry total is 92 (81 baseline + 11 Batch 9)", () => {
    expect(REGISTERED_VISUAL_IDS.length).toBe(92);
    expect(NEW_IDS.every(id => REGISTERED_VISUAL_IDS.includes(id))).toBe(true);
  });
  it("no Batch 7/8 future id is referenced (all reused ids exist on the frozen base)", () => {
    for (const { visualId } of Object.values(REUSE_PLACEMENTS)) {
      expect(resolveVisual(visualId), visualId).not.toBeNull();
      expect(isNew(visualId), visualId).toBe(false);   // reuse never points at a Batch-9 new id
    }
    // the deferred concepts get NO visual on this parallel PR
    for (const pdf of Object.keys(DEFERRED_FOR_SYNC).map(Number)) {
      const page = pages.find(p => p.source.pdfPageStart === pdf)!;
      expect(page.blocks.some(b => b.type === "visual"), String(pdf)).toBe(false);
    }
  });
});

describe("Batch 9 — NEW-visual placements (exact PDF association)", () => {
  it("places exactly the 11 new visuals on their intended pages", () => {
    expect(newVisuals.length).toBe(11);
    const byPage = Object.fromEntries(newVisuals.map(v => [v.page, v.block.visualId]));
    expect(byPage).toEqual(Object.fromEntries(Object.entries(NEW_PLACEMENTS).map(([p, s]) => [p, s.visualId])));
  });
  it("each new visual is teacher-enrichment, source-associated to its page's PDF, resolves, and is accessible", () => {
    for (const { page, block } of newVisuals) {
      const sel = NEW_PLACEMENTS[page];
      expect(block.visualId, page).toBe(sel.visualId);
      expect(block.origin).toBe("teacher-enrichment");
      expect(block.source?.pdfPageStart).toBe(sel.pdf);
      expect(resolveVisual(block.visualId)).not.toBeNull();
      expect(block.alt.trim().length).toBeGreaterThan(15);
      expect(block.title && block.title.trim().length).toBeTruthy();
      expect(block.caption && block.caption.trim().length).toBeTruthy();
      expect(block.id).toBe(page.replace("791381-", "") + "-visual");
    }
  });
});

describe("Batch 9 — REUSE placements (existing ids on summary pages)", () => {
  it("reuses exactly 12 existing visuals, one per intended summary page, exactly source-associated", () => {
    expect(reuseVisuals.length).toBe(12);
    const byPage = Object.fromEntries(reuseVisuals.map(v => [v.page, v.block.visualId]));
    expect(byPage).toEqual(Object.fromEntries(Object.entries(REUSE_PLACEMENTS).map(([p, s]) => [p, s.visualId])));
    for (const { page, block } of reuseVisuals) {
      const sel = REUSE_PLACEMENTS[page];
      expect(block.origin).toBe("teacher-enrichment");
      expect(block.source?.pdfPageStart, page).toBe(sel.pdf);
      expect(resolveVisual(block.visualId), block.visualId).not.toBeNull();
      expect(block.alt.trim().length).toBeGreaterThan(15);
      expect(block.id).toBe(page.replace("791381-", "") + "-visual");
    }
  });
  it("reuse adds NO registry entry (reused ids are all pre-Batch-9)", () => {
    for (const { block } of reuseVisuals) expect(isNew(block.visualId), block.visualId).toBe(false);
  });
});

describe("Batch 9 — one visual per page, appended after the book content, page still ends with practice", () => {
  it("m06 and m28: at most one visual per page; the visual follows a book block and never ends the page", () => {
    for (const p of pages) {
      const idxs = p.blocks.map((b, i) => (b.type === "visual" ? i : -1)).filter(i => i >= 0);
      expect(idxs.length, p.id).toBeLessThanOrEqual(1);
      if (idxs.length) {
        expect(idxs[0], p.id).toBeGreaterThan(0);
        expect(p.blocks[0].origin, p.id).toBe("book");
        expect(p.blocks.at(-1)!.type, p.id).toBe("practice");   // the pedagogical tail stays after the figure
      }
    }
  });
  it("every intended Batch-9 page carries its visual; no visual lands on a page outside the plan", () => {
    for (const p of pages) {
      const hasVisual = p.blocks.some(b => b.type === "visual");
      const planned = BATCH9_PAGES.has(p.id) || p.id === "791381-m06-l01-p02";   // p02 is the Batch-6 acl-gate
      expect(hasVisual, p.id).toBe(planned);
    }
    for (const pid of BATCH9_PAGES) expect(pageBy(pid).blocks.some(b => b.type === "visual"), pid).toBe(true);
  });
});

describe("Batch 9 — page-by-page audit for the summary module (PDF 231–262)", () => {
  it("every m28 learner page (PDF 231–262) is either a new visual, a reuse, an audited no-visual, or a deferred-for-sync page — accounted for exactly once", () => {
    const newPdfs = new Set(Object.values(NEW_PLACEMENTS).map(s => s.pdf));
    const reusePdfs = new Set(Object.values(REUSE_PLACEMENTS).map(s => s.pdf));
    const auditPdfs = new Set(Object.keys(AUDIT_NO_VISUAL).map(Number));
    const deferPdfs = new Set(Object.keys(DEFERRED_FOR_SYNC).map(Number));
    for (let pdf = 231; pdf <= 262; pdf++) {
      const buckets = [newPdfs.has(pdf), reusePdfs.has(pdf), auditPdfs.has(pdf), deferPdfs.has(pdf)].filter(Boolean).length;
      expect(buckets, `PDF ${pdf}`).toBe(1);   // each page decided exactly once
      const page = pages.find(p => p.source.pdfPageStart === pdf)!;
      const hasVisual = page.blocks.some(b => b.type === "visual");
      expect(hasVisual, `PDF ${pdf} visual?`).toBe(newPdfs.has(pdf) || reusePdfs.has(pdf));
    }
    // the closing page (PDF 263) is untouched (no forced visual)
    expect(pages.find(p => p.source.pdfPageStart === 263)!.blocks.some(b => b.type === "visual")).toBe(false);
  });
});

describe("Batch 9 — no forbidden coupling in the visual blocks", () => {
  it("no visual block names grading / Strength / publication / class / api / persistence", () => {
    const text = JSON.stringify(allVisuals.map(v => v.block));
    expect(text).not.toMatch(/strength|grade|gradebook|publish|visibleModule|assignment|localStorage|classId|\/api\b/i);
  });
});
