// Learning Materials — Phase 3D: converts Book 791381 PDF 23 (خلاصة التحويلات), the CLOSING summary page of Unit 2,
// which fills the existing p09 skeleton and COMPLETES module m02 (PDF 24 opens Unit 3, عناوين IP — not started here).
// Semantic assertions: central validation passes, the page maps 1:1 to PDF 23, m02 is now complete, the four
// conversion cards + the "why it matters" callout are source-faithful, the LTR technical tokens (IPv4/IPv6) are
// authored dir:"ltr", stable IDs are preserved, and no answer-key / practice / external material is introduced.
import { describe, it, expect } from "vitest";
import m01 from "./modules/m01";
import m02 from "./modules/m02";
import manifest from "./manifest";
import { validateLearningCourseContent } from "../validation";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentBlock, type ContentPage } from "../types";

const course: LearningCourseContent = {
  schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl",
  modules: [m01, m02],
};
const m02Pages = m02.lessons.flatMap(l => l.pages);
const pageBy = (id: string): ContentPage => m02Pages.find(p => p.id === id)!;
// Concatenated text of every dir:"ltr" span on a page — what the student actually sees for technical tokens.
const ltrText = (p: ContentPage): string[] => {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as { dir?: string; text?: string };
      if (o.dir === "ltr" && typeof o.text === "string") out.push(o.text);
      for (const val of Object.values(v)) if (val !== o.text) walk(val);
    }
  };
  walk(p.blocks);
  return out;
};

describe("Phase 3D — validation + exact scope (PDF 23 completes Unit 2)", () => {
  it("m01 + m02 produce ZERO validation issues after the batch", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
  });

  it("maps PDF 23 (printed 21) 1:1 to the existing p09 stable id; no split/merge", () => {
    const p = pageBy("791381-m02-l01-p09");
    expect(p.source.pdfPageStart).toBe(23);
    expect(p.source.printedPage).toBe(21);
    expect(p.source.pdfPageEnd).toBeUndefined();
    expect(p.title).toBe("خلاصة التحويلات");
    expect(p.order).toBe(9);
  });

  it("converts nothing from Unit 3 (PDF 24 عناوين IP onward is NOT started)", () => {
    const bodyPages = [m01, m02].flatMap(m => m.lessons.flatMap(l => l.pages));
    for (const p of bodyPages) expect(p.source.pdfPageStart, p.id).toBeLessThanOrEqual(23);
    // the manifest still lists later modules as skeletons, but none has a converted body page ≥ 24
    expect(bodyPages.some(p => p.source.pdfPageStart >= 24)).toBe(false);
  });
});

describe("Phase 3D — m02 is now COMPLETE (every manifest page has a body)", () => {
  it("m02 drops its partial flag and every manifest page of m02 has a real body", () => {
    expect(m02.partial).toBeFalsy();
    const manifestM02 = manifest.modules.find(m => m.id === "791381-m02")!;
    const manifestPageIds = manifestM02.lessons.flatMap(l => l.pages.map(p => p.id)).sort();
    const bodyPageIds = m02Pages.map(p => p.id).sort();
    expect(bodyPageIds).toEqual(manifestPageIds);                       // no manifest page left unconverted
    for (const p of m02Pages) expect(p.blocks.length, p.id).toBeGreaterThan(0);
  });

  it("preserves every stable Phase-2/3C id; reading order is the exact source sequence 15..23", () => {
    for (const id of ["791381-m02-l01-p01", "791381-m02-l01-p02", "791381-m02-l01-p03"]) {
      expect(pageBy(id), id).toBeTruthy();
    }
    const l01 = manifest.modules.find(m => m.id === "791381-m02")!.lessons.find(l => l.id === "791381-m02-l01")!;
    const byOrder = [...l01.pages].sort((a, b) => a.order - b.order).map(p => p.source!.pdfPageStart);
    expect(byOrder).toEqual([15, 16, 17, 18, 19, 20, 21, 22, 23]);
  });
});

describe("Phase 3D — PDF 23 source fidelity (four conversion methods + why-it-matters)", () => {
  const p = () => pageBy("791381-m02-l01-p09");

  it("the four summary cards carry the book's exact method wording", () => {
    const list = p().blocks.find(b => b.id === "m02-l01-p09-summary");
    if (list?.type !== "list") throw new Error("no summary list");
    const bodies = list.items.map(it => it.text.map(s => s.text).join(""));
    expect(bodies).toEqual([
      "استعمل الصناديق ثم اجمع القيم التي تحتها 1.",
      "ابنِ العدد من قيم الصناديق ثم اكتب 1 أو 0.",
      "كل رمز Hex يتحوّل إلى 4 بتات.",
      "قسّم إلى مجموعات من 4 ثم استعمل الجدول.",
    ]);
    expect(list.items.map(it => it.term)).toEqual([
      "من الثنائي إلى العشري", "من العشري إلى الثنائي", "من Hex إلى الثنائي", "من الثنائي إلى Hex",
    ]);
  });

  it("the 'why it matters' callout keeps IPv4 / IPv6 as LTR technical tokens (never reversed under RTL)", () => {
    const why = p().blocks.find(b => b.id === "m02-l01-p09-why");
    if (why?.type !== "callout") throw new Error("no why callout");
    expect(why.title).toBe("لماذا هذا مهم؟");
    const full = why.spans.map(s => s.text).join("");
    expect(full).toBe("هذه المهارات أساسية جدًا في أسئلة العناوين IPv4 و IPv6 وقناع الشبكة لاحقًا.");
    const ltr = ltrText(p());
    expect(ltr).toContain("IPv4");
    expect(ltr).toContain("IPv6");
  });
});

describe("Phase 3D — provenance + answer-key safety", () => {
  it("every PDF-23 block is faithful book content, except the appended Batch-2 visual enrichment", () => {
    for (const b of pageBy("791381-m02-l01-p09").blocks as ContentBlock[]) {
      if (b.type === "visual") expect(b.origin, b.id).toBe("teacher-enrichment");
      else expect(b.origin, b.id).toBe("book");
    }
  });

  it("adds NO practice, NO answers, NO image/iframe/external link/QR on the summary page", () => {
    const p9 = pageBy("791381-m02-l01-p09");
    expect(p9.blocks.some(b => b.type === "practice")).toBe(false);
    expect(p9.blocks.some(b => b.type === "image" || b.type === "diagram")).toBe(false);
    const json = JSON.stringify(p9);
    for (const banned of ["<iframe", ".pdf", "http", "correct", "feedback", "PracticeFeedback", "QR"]) {
      expect(json, banned).not.toContain(banned);
    }
  });

  // Phase 3D adds no enrichment of its own; the m02 teacher-enrichment blocks are the Phase-3C QR clarification plus
  // the three Batch-2 SVG visual enrichments (m02 selections).
  it("adds no NEW enrichment beyond the QR clarification and the Batch-2 visuals", () => {
    const enrich = m02Pages.flatMap(p => (p.blocks as ContentBlock[]).filter(b => b.origin === "teacher-enrichment").map(b => b.id));
    expect([...enrich].sort()).toEqual([
      "m02-l01-p01-visual", "m02-l01-p03-visual", "m02-l01-p08-qrnote", "m02-l01-p09-visual",
    ]);
  });
});
