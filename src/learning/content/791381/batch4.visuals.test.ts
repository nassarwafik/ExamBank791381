// SVG Visual Enrichment — Batch 4 (m16 domains/switching PDF 98–105, m17 security PDF 108–114; PDF115 SSH reuses the
// existing m14 ssh-vs-telnet visual). Scope, provenance, PDF association, registry resolution, placement, the exact
// 13 NEW unique ids (registry grows by 13 not 14), and the deliberate skips (PDF101 interactive, PDF106 trainings,
// PDF107 part-cover never a learner page).
import { describe, it, expect } from "vitest";
import m16 from "./modules/m16";
import m17 from "./modules/m17";
import { validateLearningCourseContent } from "../validation";
import { resolveVisual, REGISTERED_VISUAL_IDS } from "../../visuals/registry";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentPage, type VisualBlock } from "../types";

const MODS = [m16, m17];
const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: MODS };
const pages: ContentPage[] = MODS.flatMap(m => m.lessons.flatMap(l => l.pages));
const pageBy = (id: string) => pages.find(p => p.id === id)!;
const visuals = pages.flatMap(p => p.blocks.filter((b): b is VisualBlock => b.type === "visual").map(b => ({ page: p.id, block: b })));

// The 13 NEW unique visual concepts, each on its primary page.
const NEW_SELECTION: Record<string, { visualId: string; pdf: number }> = {
  "791381-m16-l01-p01": { visualId: "791381/m16/collision-domains", pdf: 98 },
  "791381-m16-l02-p01": { visualId: "791381/m16/broadcast-domain", pdf: 100 },
  "791381-m16-l03-p01": { visualId: "791381/m16/stp-loop-blocking", pdf: 102 },
  "791381-m16-l03-p02": { visualId: "791381/m16/half-full-duplex", pdf: 103 },
  "791381-m16-l04-p01": { visualId: "791381/m16/localhost-loopback", pdf: 104 },
  "791381-m16-l04-p02": { visualId: "791381/m16/apipa-fallback", pdf: 105 },
  "791381-m17-l01-p01": { visualId: "791381/m17/attack-targets", pdf: 108 },
  "791381-m17-l01-p02": { visualId: "791381/m17/dos-vs-ddos", pdf: 109 },
  "791381-m17-l01-p03": { visualId: "791381/m17/hijacking-vs-mitm", pdf: 110 },
  "791381-m17-l01-p04": { visualId: "791381/m17/phishing-vs-spoofing", pdf: 111 },
  "791381-m17-l02-p01": { visualId: "791381/m17/secure-two-pillars", pdf: 112 },
  "791381-m17-l02-p02": { visualId: "791381/m17/vpn-tunnel", pdf: 113 },
  "791381-m17-l02-p03": { visualId: "791381/m17/https-secure-channel", pdf: 114 },
};
// Two deliberate REUSES (not new unique concepts): the collision visual on the adjacent PDF99, and the existing
// m14 ssh-vs-telnet visual on PDF115.
const REUSE: Record<string, { visualId: string; pdf: number }> = {
  "791381-m16-l01-p02": { visualId: "791381/m16/collision-domains", pdf: 99 },   // same batch-4 id, adjacent page
  "791381-m17-l02-p04": { visualId: "791381/m14/ssh-vs-telnet", pdf: 115 },       // existing registry id, no new entry
};
const ALL = { ...NEW_SELECTION, ...REUSE };

describe("Batch 4 — scope and quality (m16 + m17, PDF 98–115)", () => {
  it("both modules validate with the visuals present", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
  });

  it("adds exactly 15 visual blocks: 13 new unique ids + collision reused on PDF99 + ssh reused on PDF115", () => {
    expect(visuals.length).toBe(15);
    const byPage = Object.fromEntries(visuals.map(v => [v.page, v.block.visualId]));
    expect(byPage).toEqual(Object.fromEntries(Object.entries(ALL).map(([p, s]) => [p, s.visualId])));
    // exactly 13 NEW unique ids introduced by Batch 4 (all under m16/m17)
    const newIds = new Set(Object.values(NEW_SELECTION).map(s => s.visualId));
    expect(newIds.size).toBe(13);
    // the SSH reuse points at the EXISTING m14 id, not a new one
    expect(pageBy("791381-m17-l02-p04").blocks.some(b => b.type === "visual" && b.visualId === "791381/m14/ssh-vs-telnet")).toBe(true);
  });

  it("the collision visual is used on BOTH PDF98 and PDF99 (adjacent-page reuse of one component)", () => {
    expect(pageBy("791381-m16-l01-p01").blocks.some(b => b.type === "visual" && b.visualId === "791381/m16/collision-domains")).toBe(true);
    expect(pageBy("791381-m16-l01-p02").blocks.some(b => b.type === "visual" && b.visualId === "791381/m16/collision-domains")).toBe(true);
  });

  it("registry grew by exactly 13 (36 → 49); the SSH reuse added NO new entry", () => {
    expect(REGISTERED_VISUAL_IDS.length).toBe(81);
    const m16m17New = REGISTERED_VISUAL_IDS.filter(id => /^791381\/m1[67]\//.test(id));
    expect(m16m17New.length).toBe(13);
  });

  it("each visual is teacher-enrichment, source-associated to its page's PDF, resolves in the registry, and is accessible", () => {
    for (const { page, block } of visuals) {
      const sel = ALL[page];
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

  it("appends each visual AFTER the book content, at most one per page", () => {
    for (const p of pages) {
      const idxs = p.blocks.map((b, i) => (b.type === "visual" ? i : -1)).filter(i => i >= 0);
      expect(idxs.length, p.id).toBeLessThanOrEqual(1);
      if (idxs.length) { expect(idxs[0]).toBeGreaterThan(0); expect(p.blocks[0].origin).toBe("book"); }
    }
  });

  it("SKIPS PDF101 (existing network-domains interactive) — no duplicate SVG", () => {
    const p = pageBy("791381-m16-l02-p02");
    expect(p.blocks.some(b => b.type === "visual")).toBe(false);
    expect(p.blocks.some(b => b.type === "interactive-diagram")).toBe(true);
  });

  it("SKIPS PDF106 (تدريبات مراجعة سريعة) — no SVG on a trainings page", () => {
    expect(pageBy("791381-m16-l05-p01").blocks.some(b => b.type === "visual")).toBe(false);
  });

  it("PDF107 part-cover is never a learner page and carries no visual (no page/visual is sourced to PDF107)", () => {
    expect(pages.some(p => p.source?.pdfPageStart === 107)).toBe(false);
    expect(visuals.some(v => v.block.source?.pdfPageStart === 107)).toBe(false);
  });

  it("introduces no visual outside m16/m17", () => {
    for (const { block } of visuals) expect(block.visualId).toMatch(/^791381\/(m1[67]|m14)\//);
  });
});
