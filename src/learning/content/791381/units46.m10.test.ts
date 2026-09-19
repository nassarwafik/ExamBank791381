// Units 4–6 phase — source-fidelity, mapping, provenance, pedagogy and hard-stop guards for Unit 6 «أنواع شبكات
// الاتصال» (PDF 57–60) as stable module m10. PDF 61 (Unit 7) is never converted.
import { describe, it, expect } from "vitest";
import m01 from "./modules/m01";
import m02 from "./modules/m02";
import m07 from "./modules/m07";
import m08 from "./modules/m08";
import m09 from "./modules/m09";
import m10 from "./modules/m10";
import manifest from "./manifest";
import { validateLearningCourseContent } from "../validation";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentBlock, type ContentPage, type PracticeTableSelectCell } from "../types";

const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: [m01, m02, m07, m08, m09, m10] };
const pages = m10.lessons.flatMap(l => l.pages);
const pageBy = (id: string): ContentPage => pages.find(p => p.id === id)!;
const blockBy = (p: ContentPage, id: string): ContentBlock => p.blocks.find(b => b.id === id)!;
const plain = (p: ContentPage): string => JSON.stringify(p.blocks);
const sel = (cell: unknown) => cell as PracticeTableSelectCell;

const MAP: Record<string, [number, number | undefined, string]> = {
  "791381-m10-l00-p01": [57, undefined, "أنواع شبكات الاتصال"],
  "791381-m10-l01-p01": [58, 58, "أنواع الشبكات البسيطة"],
  "791381-m10-l01-p02": [59, 59, "الشبكات السلكية التقليدية"],
  "791381-m10-l02-p01": [60, 60, "الشبكات الحديثة"],
};

describe("m10 — validation, mapping PDF 57–60, completeness, HARD STOP before PDF 61", () => {
  it("the WHOLE real course (m01, m02, m07, m08, m09, m10) produces ZERO validation issues", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
  });
  it("maps the four Unit-6 pages 1:1 to PDF 57..60; reading order = source order", () => {
    expect(pages.map(p => p.id).sort()).toEqual(Object.keys(MAP).sort());
    for (const [id, [pdf, printed, title]] of Object.entries(MAP)) {
      const p = pageBy(id);
      expect([p.source.sourceId, p.source.pdfPageStart, p.source.printedPage, p.source.pdfPageEnd, p.title], id).toEqual(["791381", pdf, printed, undefined, title]);
    }
    const ordered = [...m10.lessons].sort((a, b) => a.order - b.order).flatMap(l => [...l.pages].sort((a, b) => a.order - b.order));
    expect(ordered.map(p => p.source.pdfPageStart)).toEqual([57, 58, 59, 60]);
  });
  it("HARD STOP: no real body in the whole course reaches PDF 61 (Unit 7 «الكوابل وعنوان MAC» untouched); Unit-7 wording absent", () => {
    for (const m of [m01, m02, m07, m08, m09, m10]) for (const p of m.lessons.flatMap(l => l.pages)) expect(p.source.pdfPageStart, p.id).toBeLessThan(61);
    for (const m of manifest.modules.filter(x => ["791381-m08", "791381-m09", "791381-m10"].includes(x.id))) for (const p of m.lessons.flatMap(l => l.pages)) expect(p.source!.pdfPageStart, p.id).toBeLessThanOrEqual(60);
    expect(m10.source).toEqual({ kind: "book", sourceId: "791381", pdfPageStart: 57, pdfPageEnd: 60 });
    for (const banned of ["الكوابل وعنوان MAC", "Unicast", "Multicast", "الوحدة السابعة"]) expect(JSON.stringify([m08, m09, m10]), banned).not.toContain(banned);
  });
  it("m10 is COMPLETE: manifest ↔ body match; order 6; batch b2 lists m09 then m10", () => {
    const mm = manifest.modules.find(m => m.id === "791381-m10")!;
    expect(mm.order).toBe(6); expect(m10.order).toBe(6); expect(m10.partial).toBeFalsy();
    expect(mm.lessons.flatMap(l => l.pages.map(p => p.id)).sort()).toEqual(pages.map(p => p.id).sort());
    for (const l of mm.lessons) {
      const body = m10.lessons.find(x => x.id === l.id)!;
      expect([body.order, body.title], l.id).toEqual([l.order, l.title]);
      for (const p of l.pages) { const bp = pageBy(p.id); expect([bp.order, bp.title, bp.source.pdfPageStart, bp.source.printedPage], p.id).toEqual([p.order, p.title, p.source!.pdfPageStart, p.source!.printedPage]); }
    }
    expect(manifest.batches!.find(b => b.id === "b2")!.moduleIds).toEqual(["791381-m09", "791381-m10"]);
  });
});

describe("m10 — key source facts", () => {
  it("PDF 57 opener; PDF 58 P2P + node-to-node cards and the basic idea", () => {
    const o = blockBy(pageBy("791381-m10-l00-p01"), "m10-l00-p01-opener");
    expect(o.type === "unit-opener" && [o.unitLabel, o.unitNumber, o.title, o.subtitle]).toEqual(["الوحدة السادسة", "06", "أنواع شبكات الاتصال", "الأشكال التي يمكن أن تُرتّب بها الأجهزة داخل الشبكة."]);
    const c = blockBy(pageBy("791381-m10-l01-p01"), "m10-l01-p01-cards");
    expect(c.type === "list" && c.items.map(i => [i.term, i.text.map(s => s.text).join("")])).toEqual([["نقطة لنقطة P2P", "جهازان يتواصلان مباشرة بدون جهاز وسيط."], ["عقدة لعقدة", "كل جهاز يمكنه التواصل مع جهاز آخر داخل الشبكة."]]);
    expect(plain(pageBy("791381-m10-l01-p01"))).toContain("شكل التوصيل يحدّد طريقة انتقال البيانات بين الأجهزة داخل الشبكة.");
  });
  it("PDF 59 Bus + Ring cards and the Bus collision warning; PDF 60 Star / Tree / Hybrid cards and «الأكثر استعمالًا»", () => {
    const c = blockBy(pageBy("791381-m10-l01-p02"), "m10-l01-p02-cards");
    expect(c.type === "list" && c.items.map(i => [i.term, i.text.map(s => s.text).join("")])).toEqual([["Bus", "خط واحد مشترك بين الأجهزة. رخيص وسهل، لكن الاصطدامات كثيرة."], ["Ring", "الأجهزة على شكل دائرة مغلقة، والبيانات تسير باتجاه محدّد."]]);
    expect(plain(pageBy("791381-m10-l01-p02"))).toContain("إذا أرسل أكثر من جهاز في نفس الوقت قد يحدث تصادم (");
    const m = blockBy(pageBy("791381-m10-l02-p01"), "m10-l02-p01-cards");
    expect(m.type === "list" && m.items.map(i => [i.term, i.text.map(s => s.text).join("")])).toEqual([["Star", "كل الأجهزة تتصل بجهاز مركزي مثل Switch."], ["Tree", "شبكة على شكل مستويات أو طبقات."], ["Hybrid", "دمج أكثر من نوع في شبكة واحدة."]]);
    expect(plain(pageBy("791381-m10-l02-p01"))).toContain(" هو الأكثر استعمالًا في المدارس والشركات.");
  });
  it("the topology explorer sits on the LAST page (after all six forms are introduced), covers exactly the six book forms in book order, enrichment, PDF 60, useful fallback", () => {
    const a = blockBy(pageBy("791381-m10-l02-p01"), "m10-l02-p01-explorer");
    expect(a.type === "interactive-diagram" && [a.interactionType, a.version, a.origin, a.source?.pdfPageStart]).toEqual(["network-topologies", 1, "teacher-enrichment", 60]);
    const cfg = (a as { config?: { topologies?: { id: string; name: string }[] } }).config!;
    expect(cfg.topologies!.map(t => t.id)).toEqual(["p2p", "bus", "ring", "star", "tree", "hybrid"]);
    expect(cfg.topologies!.map(t => t.name)).toEqual(["P2P", "Bus", "Ring", "Star", "Tree", "Hybrid"]);
    expect((a as { fallback?: { text?: string } }).fallback?.text).toMatch(/P2P.*Bus.*Ring.*Star.*Tree.*Hybrid/s);
    expect(pages.flatMap(p => p.blocks.filter(b => ["simulation", "animation", "guided", "interactive-diagram"].includes(b.type))).map(b => b.id)).toEqual(["m10-l02-p01-explorer"]);
  });
});

describe("m10 — pedagogy + provenance + safety", () => {
  it("1 solved example (3 steps), 1 matching worksheet over all six forms, 3 inline practices with «افحص» feedback + hints; all enrichment", () => {
    const ex = pages.flatMap(p => p.blocks.filter(b => b.type === "example"));
    expect(ex.length).toBe(1); expect(ex[0].type === "example" && ex[0].steps.length).toBe(3);
    const match = blockBy(pageBy("791381-m10-l02-p01"), "m10-l02-p01-match");
    if (match.type !== "practice-table") throw new Error("no matching worksheet");
    expect(match.origin).toBe("teacher-enrichment");
    expect(match.rows.map(r => sel(r[1]).key).sort()).toEqual(["Bus", "Hybrid", "P2P", "Ring", "Star", "Tree"]);
    for (const r of match.rows) expect(sel(r[1]).options).toEqual(["P2P", "Bus", "Ring", "Star", "Tree", "Hybrid"]);
    const practices = pages.flatMap(p => p.blocks.filter(b => b.type === "practice"));
    expect(practices.length).toBe(3);
    for (const b of practices) {
      if (b.type !== "practice") continue;
      expect(b.origin, b.id).toBe("teacher-enrichment");
      expect(b.question.feedback?.incorrectFeedback, b.id).toMatch(/افحص/);
      expect((b.question.feedback?.hints ?? []).length, b.id).toBeGreaterThanOrEqual(1);
      if (b.question.kind === "multipleChoice") expect(b.question.options.filter(o => o.correct).length, b.id).toBe(1);
    }
  });
  it("book cards/callouts are origin book; topology names are LTR tokens; no image/iframe/link; no invented artwork", () => {
    for (const id of ["m10-l01-p01-cards", "m10-l01-p02-cards", "m10-l01-p02-problem", "m10-l02-p01-cards", "m10-l02-p01-most"]) expect(pages.flatMap(p => p.blocks).find(b => b.id === id)!.origin, id).toBe("book");
    const json = JSON.stringify(m10);
    for (const tok of ["\"Switch\"", "\"Collision\"", "\"Star\""]) expect(json).toContain(tok);
    for (const banned of ["<iframe", ".pdf", "http", "<script", "من الكتاب", ".png", ".svg"]) expect(json, banned).not.toContain(banned);
    expect(pages.some(p => p.blocks.some(b => b.type === "image" || b.type === "diagram"))).toBe(false);
  });
});
