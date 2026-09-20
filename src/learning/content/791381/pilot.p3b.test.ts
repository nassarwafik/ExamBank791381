// Learning Materials — Phase 3B PILOT: source-fidelity + validation guards for the real Book 791381 conversion of
// PDF pages 7–14. Semantic assertions only (no giant literal-string comparisons); every page passes central
// validation; nothing is converted beyond PDF 14.
import { describe, it, expect } from "vitest";
import m01 from "./modules/m01";
import m02 from "./modules/m02";
import manifest from "./manifest";
import { validateLearningCourseContent } from "../validation";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentBlock, type ContentPage } from "../types";

const pilotCourse: LearningCourseContent = {
  schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl",
  modules: [m01, m02],
};

// Phase 3B assertions are scoped to the 3B batch (PDF 7–14); Phase 3C (PDF 15–22) is covered by its own test.
const allPages = [m01, m02].flatMap(m => m.lessons.flatMap(l => l.pages)).filter(p => p.source.pdfPageStart <= 14);
const pageBy = (id: string): ContentPage => allPages.find(p => p.id === id)!;
const blocksText = (p: ContentPage): string => JSON.stringify(p.blocks);
const flatSpanText = (p: ContentPage): string => {
  const acc: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") { for (const val of Object.values(v)) walk(val); }
    else if (typeof v === "string") acc.push(v);
  };
  walk(p.blocks);
  return acc.join(" ");
};

describe("Phase 3B — pilot passes central validation and is scoped to PDF 7–14", () => {
  it("the real converted bodies (m01 + m02, both now complete) produce ZERO validation issues", () => {
    expect(validateLearningCourseContent(pilotCourse)).toEqual([]);
  });

  it("every converted page maps 1:1 to its exact source PDF page (7..14) and to course 791381", () => {
    const mapping: Record<string, number> = {
      "791381-m01-l00-p01": 7, "791381-m01-l01-p01": 8, "791381-m01-l01-p02": 9, "791381-m01-l01-p03": 10,
      "791381-m01-l02-p01": 11, "791381-m01-l02-p02": 12, "791381-m01-l02-p03": 13, "791381-m02-l00-p01": 14,
    };
    for (const [id, pdf] of Object.entries(mapping)) {
      expect(pageBy(id).source.pdfPageStart, id).toBe(pdf);
      expect(pageBy(id).source.sourceId, id).toBe("791381");
      expect(pageBy(id).source.pdfPageEnd, id).toBeUndefined();   // 1:1, no split/merge
    }
    // exactly 8 converted pages, no more
    expect(allPages.length).toBe(8);
    // NOTHING beyond PDF 14 was converted (no body page maps to a later source page)
    for (const p of allPages) expect(p.source.pdfPageStart).toBeLessThanOrEqual(14);
  });

  it("printed page numbers are only set where visibly established (PDF 8..13 → 6..11); openers omit it", () => {
    expect(pageBy("791381-m01-l01-p01").source.printedPage).toBe(6);
    expect(pageBy("791381-m01-l01-p03").source.printedPage).toBe(8);
    expect(pageBy("791381-m01-l02-p03").source.printedPage).toBe(11);
    expect(pageBy("791381-m01-l00-p01").source.printedPage).toBeUndefined();  // unit opener
    expect(pageBy("791381-m02-l00-p01").source.printedPage).toBeUndefined();
  });
});

describe("Phase 3B — book fidelity: key source concepts are present", () => {
  it("PDF 11 contains the three network types PAN / LAN / WAN and the scope difference", () => {
    const t = flatSpanText(pageBy("791381-m01-l02-p01"));
    for (const k of ["PAN", "LAN", "WAN"]) expect(t).toContain(k);
    expect(t).toContain("حجم الشبكة والمسافة");
  });
  it("PDF 12 contains the three fundamentals (بنية تحتية / عناوين IP / بروتوكول اتصال) and TCP/IP", () => {
    const t = flatSpanText(pageBy("791381-m01-l02-p02"));
    expect(t).toContain("بنية تحتية");
    expect(t).toContain("IP");
    expect(t).toContain("بروتوكول");
    expect(t).toContain("TCP/IP");
  });
  it("PDF 13 includes the ping and ipconfig maintenance commands", () => {
    const t = flatSpanText(pageBy("791381-m01-l02-p03"));
    expect(t).toContain("ping");
    expect(t).toContain("ipconfig");
  });
  it("PDF 14 is ONLY the unit-2 opener — no actual binary-conversion lesson content", () => {
    const p = pageBy("791381-m02-l00-p01");
    expect(p.layout).toBe("opener");
    expect(p.blocks.every(b => b.type === "unit-opener")).toBe(true);
    const t = flatSpanText(p);
    // the opener names the topics but must not teach the conversion (no worked binary example / bit values)
    expect(t).not.toContain("00101100");
    expect(t).not.toContain("128 64 32");
    expect(t).not.toMatch(/1\s*0\s*1\s*1/);
  });
});

describe("Phase 3B — provenance: book vs teacher-enrichment is explicit and correct", () => {
  // The two interactive activities PLUS the five Chapter-1 SVG visual-enrichment illustrations (pilot). Every other
  // block on m01 remains faithful book content.
  const enrichmentIds = new Set([
    "m01-l02-p01-scope", "m01-l02-p02-guided",
    "m01-l01-p01-visual", "m01-l01-p02-visual", "m01-l01-p03-visual", "m01-l02-p02-visual", "m01-l02-p03-visual",
  ]);
  it("every book-derived block is origin:book; the two activities + five SVG visuals are the only teacher-enrichment blocks", () => {
    const enrich: string[] = [];
    for (const p of allPages) for (const b of p.blocks as ContentBlock[]) {
      if (b.origin === "teacher-enrichment") enrich.push(b.id);
      else expect(b.origin, b.id).toBe("book");
    }
    expect(new Set(enrich)).toEqual(enrichmentIds);
  });
  it("the shared-printer example (PDF 10) is a real ExampleBlock with origin:book (never an enrichment example)", () => {
    const ex = pageBy("791381-m01-l01-p03").blocks.find(b => b.type === "example")!;
    expect(ex.origin).toBe("book");
    expect(blocksText(pageBy("791381-m01-l01-p03"))).toContain("الطابعة");
  });
  it("the interactive activities carry a block-level book SOURCE (association) yet stay teacher-enrichment (origin ≠ source)", () => {
    for (const id of enrichmentIds) {
      const b = allPages.flatMap(p => p.blocks).find(x => x.id === id)!;
      expect(b.origin).toBe("teacher-enrichment");
      expect(b.source?.sourceId).toBe("791381");
    }
  });
});

describe("Phase 3B — activities use exact trusted identities", () => {
  it("PDF 11 uses interactive-diagram/network-scope/v1 with PAN/LAN/WAN scope config", () => {
    const d = pageBy("791381-m01-l02-p01").blocks.find(b => b.type === "interactive-diagram");
    if (d?.type !== "interactive-diagram") throw new Error("no diagram");
    expect(d.interactionType).toBe("network-scope");
    expect(d.version).toBe(1);
    const scopes = (d.config as { scopes: { name: string }[] }).scopes;
    expect(scopes.map(s => s.name)).toEqual(["PAN", "LAN", "WAN"]);
  });
  it("PDF 12 uses the built-in guided/reveal/v1 with three faithful steps", () => {
    const g = pageBy("791381-m01-l02-p02").blocks.find(b => b.type === "guided");
    if (g?.type !== "guided") throw new Error("no guided");
    expect(g.guidedType).toBe("reveal");
    expect(g.version).toBe(1);
    expect(g.steps.length).toBe(3);
  });
});

describe("Phase 3B — manifest stays additive (existing stable ids unchanged)", () => {
  it("preserves the Phase-2 PDF 8/9/10 and m02 PDF 16/18/20 ids exactly", () => {
    const ids = new Set(manifest.modules.flatMap(m => m.lessons.flatMap(l => l.pages.map(p => p.id))));
    for (const id of [
      "791381-m01-l01-p01", "791381-m01-l01-p02", "791381-m01-l01-p03",
      "791381-m02-l01-p01", "791381-m02-l01-p02", "791381-m02-l01-p03",
    ]) expect(ids.has(id), id).toBe(true);
    // new opener + PDF 11–13 ids added
    for (const id of ["791381-m01-l00-p01", "791381-m01-l02-p01", "791381-m01-l02-p03", "791381-m02-l00-p01"]) {
      expect(ids.has(id), id).toBe(true);
    }
  });
});
