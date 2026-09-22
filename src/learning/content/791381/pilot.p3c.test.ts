// Learning Materials — Phase 3C: source-fidelity + numeric-accuracy + mapping guards for the real Book 791381
// conversion of PDF pages 15–22 (number systems). Semantic assertions only; every page passes central validation;
// nothing beyond PDF 22 is converted; stable IDs are preserved; m02 stays partial (PDF 23 unconverted).
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
// The concatenated text of every LTR span on a page — this is what the student actually sees for numeric strings,
// so a digit-order regression under RTL would show up here.
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
const tableOf = (p: ContentPage, id: string) => {
  const b = p.blocks.find(x => x.id === id);
  if (b?.type !== "table") throw new Error("no table " + id);
  return b;
};

describe("Phase 3C — validation + exact scope PDF 15–22", () => {
  it("m01 + m02 produce ZERO validation issues after the batch", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
  });

  it("maps the eight converted pages 1:1 to their exact source PDF page (15..22), printed 13..20", () => {
    const map: Record<string, [number, number]> = {
      "791381-m02-l01-p04": [15, 13], "791381-m02-l01-p01": [16, 14], "791381-m02-l01-p05": [17, 15],
      "791381-m02-l01-p02": [18, 16], "791381-m02-l01-p06": [19, 17], "791381-m02-l01-p03": [20, 18],
      "791381-m02-l01-p07": [21, 19], "791381-m02-l01-p08": [22, 20],
    };
    for (const [id, [pdf, printed]] of Object.entries(map)) {
      expect(pageBy(id).source.pdfPageStart, id).toBe(pdf);
      expect(pageBy(id).source.printedPage, id).toBe(printed);
      expect(pageBy(id).source.pdfPageEnd, id).toBeUndefined();  // 1:1, no split/merge
    }
  });

  it("the 15–22 batch pages still map 1:1 within range (Unit-2 body now extends to PDF 23; nothing from Unit 3)", () => {
    // Phase 3C converted PDF 15–22; Phase 3D then added PDF 23 (Unit-2 summary), so the converted body now spans
    // 15–23. Nothing from Unit 3 (PDF 24 onward) is converted.
    const bodyPages = [m01, m02].flatMap(m => m.lessons.flatMap(l => l.pages));
    for (const p of bodyPages) expect(p.source.pdfPageStart, p.id).toBeLessThanOrEqual(23);
    expect(m02Pages.some(p => p.source.pdfPageStart >= 24)).toBe(false);   // Unit 3 (عناوين IP) not started
  });
});

describe("Phase 3C — stable IDs preserved (only order interleaved)", () => {
  it("keeps the Phase-2 m02 ids and maps them to their exact source pages", () => {
    for (const [id, pdf] of [["791381-m02-l01-p01", 16], ["791381-m02-l01-p02", 18], ["791381-m02-l01-p03", 20]] as const) {
      expect(pageBy(id).source.pdfPageStart, id).toBe(pdf);
    }
    // reading order is the exact source sequence 15..23
    const l01 = manifest.modules.find(m => m.id === "791381-m02")!.lessons.find(l => l.id === "791381-m02-l01")!;
    const byOrder = [...l01.pages].sort((a, b) => a.order - b.order).map(p => p.source!.pdfPageStart);
    expect(byOrder).toEqual([15, 16, 17, 18, 19, 20, 21, 22, 23]);
  });
});

describe("m02 completion (updated by Phase 3D — PDF 23 now converted)", () => {
  it("m02 is COMPLETE (no partial flag); every 15–22 page still has real blocks; PDF 23 now has a body too", () => {
    expect(m02.partial).toBeFalsy();                                                     // completed in Phase 3D
    for (const id of ["791381-m02-l01-p04", "791381-m02-l01-p08"]) expect(pageBy(id).blocks.length).toBeGreaterThan(0);
    expect(pageBy("791381-m02-l01-p09").blocks.length).toBeGreaterThan(0);               // PDF 23 body present
  });
});

describe("Phase 3C — numeric fidelity (exact source values, correct digit order under RTL)", () => {
  it("PDF 16 binary→decimal: 01111011 / place-value boxes / 64+32+16+8+2+1 = 123", () => {
    const p = pageBy("791381-m02-l01-p01");
    const t = tableOf(p, "m02-l01-p01-boxes");
    expect(t.dir).toBe("ltr");                                             // MSB-left, not reversed under RTL
    expect(t.headers).toEqual(["128", "64", "32", "16", "8", "4", "2", "1"]);
    expect(t.rows).toEqual([["0", "1", "1", "1", "1", "0", "1", "1"]]);
    const ltr = ltrText(p);
    expect(ltr).toContain("01111011");
    expect(ltr).toContain("64 + 32 + 16 + 8 + 2 + 1 = 123");
    expect(ltr).toContain("123");
  });

  it("PDF 17 decimal→binary: 44 → 00101100 / 32+8+4 = 44", () => {
    const p = pageBy("791381-m02-l01-p05");
    expect(tableOf(p, "m02-l01-p05-boxes").rows).toEqual([["0", "0", "1", "0", "1", "1", "0", "0"]]);
    const ltr = ltrText(p);
    expect(ltr).toContain("44");
    expect(ltr).toContain("32 + 8 + 4 = 44");
    expect(ltr).toContain("00101100");
  });

  it("PDF 18 Hex: letters A–F map to 10–15 exactly; symbol row 0–9 A–F", () => {
    const p = pageBy("791381-m02-l01-p02");
    const t = tableOf(p, "m02-l01-p02-values");
    expect(t.headers).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(t.rows).toEqual([["10", "11", "12", "13", "14", "15"]]);
    expect(ltrText(p)).toContain("0 1 2 3 4 5 6 7 8 9 A B C D E F");
  });

  it("PDF 19 hex↔binary table reproduces the SOURCE exactly (0–6 and 8–E; the source itself omits 7 and F)", () => {
    const t = tableOf(pageBy("791381-m02-l01-p06"), "m02-l01-p06-table");
    expect(t.headers).toEqual(["السادس عشر", "الثنائي"]);
    expect(t.rows).toEqual([
      ["0", "0000"], ["1", "0001"], ["2", "0010"], ["3", "0011"], ["4", "0100"], ["5", "0101"], ["6", "0110"],
      ["8", "1000"], ["9", "1001"], ["A", "1010"], ["B", "1011"], ["C", "1100"], ["D", "1101"], ["E", "1110"],
    ]);
    const hexCol = t.rows.map(r => r[0]);
    expect(hexCol).not.toContain("7");   // faithful to the source omission — never silently "completed"
    expect(hexCol).not.toContain("F");
  });

  it("PDF 20 hex→binary: A23F = 1010 0010 0011 1111 and 9A2C5 = 1001 1010 0010 1100 0101 (NOT digit-reversed)", () => {
    const p = pageBy("791381-m02-l01-p03");
    const t = tableOf(p, "m02-l01-p03-boxes");
    expect(t.headers).toEqual(["A", "2", "3", "F"]);
    expect(t.rows).toEqual([["1010", "0010", "0011", "1111"]]);
    const ltr = ltrText(p);
    expect(ltr).toContain("A23F = 1010 0010 0011 1111");
    expect(ltr).toContain("9A2C5 = 1001 1010 0010 1100 0101");
    // guard against the RTL reversal trap: the reversed binary must NOT appear
    expect(ltr.join(" ")).not.toContain("0101 1100 0010 1010 1001");
  });

  it("PDF 21 binary→hex: 0010 0101 1010 1001 = 25A9", () => {
    const p = pageBy("791381-m02-l01-p07");
    const t = tableOf(p, "m02-l01-p07-boxes");
    expect(t.headers).toEqual(["0010", "0101", "1010", "1001"]);
    expect(t.rows).toEqual([["2", "5", "A", "9"]]);
    expect(ltrText(p)).toContain("0010 0101 1010 1001 = 25A9");
    // the ordered method list is a numbered procedure (3 steps)
    const steps = p.blocks.find(b => b.id === "m02-l01-p07-steps");
    expect(steps?.type === "list" && steps.variant === "ordered" && steps.items.length === 3).toBe(true);
  });
});

describe("Phase 3C — provenance + answer-key safety", () => {
  it("every m02 converted block is origin:book except the QR clarification, the Batch-2 SVG visual enrichments and the Study-Practice exercises", () => {
    const enrich: string[] = [];
    for (const p of m02Pages) for (const b of p.blocks as ContentBlock[]) {
      if (b.origin === "teacher-enrichment") enrich.push(b.id);
      else expect(b.origin, b.id).toBe("book");
    }
    // the original QR clarification plus the three Batch-2 visual-enrichment blocks (m02 selections) plus the
    // thirteen Study-Practice exercises (Strength phase) — never on the trainings page (p08) itself
    expect([...enrich].sort()).toEqual([
      "m02-l01-p01-q1", "m02-l01-p01-q2", "m02-l01-p01-visual", "m02-l01-p02-q1", "m02-l01-p02-q2", "m02-l01-p03-q1", "m02-l01-p03-visual",
      "m02-l01-p04-q1", "m02-l01-p04-q2", "m02-l01-p05-q1", "m02-l01-p06-q1", "m02-l01-p06-q2", "m02-l01-p07-q1", "m02-l01-p07-q2",
      "m02-l01-p08-qrnote", "m02-l01-p09-q1", "m02-l01-p09-visual",
    ]);
  });

  it("the BOOK content carries NO answer keys and NO embedded image / iframe / external link (exercises page is a plain list); the Study-Practice exercises are the only practice blocks and never sit on the trainings page", () => {
    const bookOnly = { ...m02, lessons: m02.lessons.map(l => ({ ...l, pages: l.pages.map(p => ({ ...p, blocks: p.blocks.filter(b => b.type !== "practice") })) })) };
    const json = JSON.stringify(bookOnly);
    expect(pageBy("791381-m02-l01-p08").blocks.some(b => b.type === "practice")).toBe(false);   // the T01–T04 page carries no study exercise (no double bucket)
    expect(m02Pages.some(p => p.blocks.some(b => b.type === "image" || b.type === "diagram"))).toBe(false); // no QR/screenshot image
    for (const banned of ["<iframe", ".pdf", "http", "correct", "feedback", "PracticeFeedback"]) {
      expect(json, banned).not.toContain(banned);
    }
    // the QR clarification is teacher-enrichment and never claims book provenance
    expect(json).not.toContain("من الكتاب");
    const qr = pageBy("791381-m02-l01-p08").blocks.find(b => b.id === "m02-l01-p08-qrnote");
    expect(qr?.origin).toBe("teacher-enrichment");
  });
});
