// Learning Practice — T05–T30 and F01–F06 connected to the six book review pages. Guard suite: Reader ordinal →
// page identity (98 / 110 / 145 / 178 / 214 / 215 are READER positions, not PDF numbers), exact association per
// page, cardinality across the WHOLE course (T05–T30 and F01–F06 exactly once, T01–T04 unchanged, nothing on any
// other page), metadata-only blocks (no titles / questions / keys / external URLs), the requiredModuleId gate map
// (page association ≠ release module), frontend ↔ server registry agreement, and the stale «not available in the
// platform» wording gone. Content only — the API / host decide availability; nothing here publishes anything.
import { describe, it, expect } from "vitest";
import m01 from "./modules/m01";
import m02 from "./modules/m02";
import m07 from "./modules/m07";
import m08 from "./modules/m08";
import m09 from "./modules/m09";
import m10 from "./modules/m10";
import m11 from "./modules/m11";
import m12 from "./modules/m12";
import m13 from "./modules/m13";
import m14 from "./modules/m14";
import m15 from "./modules/m15";
import m16 from "./modules/m16";
import m17 from "./modules/m17";
import m18 from "./modules/m18";
import m03 from "./modules/m03";
import m19 from "./modules/m19";
import m04 from "./modules/m04";
import m20 from "./modules/m20";
import m21 from "./modules/m21";
import m22 from "./modules/m22";
import m23 from "./modules/m23";
import m24 from "./modules/m24";
import m05 from "./modules/m05";
import m25 from "./modules/m25";
import m26 from "./modules/m26";
import m27 from "./modules/m27";
import m06 from "./modules/m06";
import m28 from "./modules/m28";
import manifest from "./manifest";
import { flattenPageRefs, pagePosition, findPage } from "../navigation";
import { validateLearningCourseContent } from "../validation";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentModule, type ContentPage, type LibraryTrainingBlock } from "../types";
// @ts-expect-error — the server registry is an untyped CommonJS module; it is imported here on purpose to cross-check it.
import * as apiRegistry from "../../../../api/src/lib/learning-training-registry.js";
// @ts-expect-error — untyped CommonJS: the Exam Library catalog (metadata only) to cross-check ids / titles.
import * as libraryStore from "../../../../api/src/lib/exam-library-store.js";

const ALL: ContentModule[] = [m01, m02, m07, m08, m09, m10, m11, m12, m13, m14, m15, m16, m17, m18, m03, m19, m04, m20, m21, m22, m23, m24, m05, m25, m26, m27, m06, m28];
const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: ALL };
const pagesOf = (m: ContentModule): ContentPage[] => [...m.lessons].sort((a, b) => a.order - b.order).flatMap(l => [...l.pages].sort((a, b) => a.order - b.order));
const allPages = ALL.flatMap(pagesOf);
const pageBy = (id: string): ContentPage => allPages.find(p => p.id === id)!;
const trainingsOf = (p: ContentPage) => p.blocks.filter((b): b is LibraryTrainingBlock => b.type === "library-training");
const registry = () => (apiRegistry as unknown as { listLearningTrainings: () => { trainingId: string; order: number; label: string; title: string; courseId: string; requiredModuleId: string }[] }).listLearningTrainings();
const catalog = () => (libraryStore as unknown as { readLibraryCatalog: () => { libraryItemId: string; title: string; publishable: boolean; conversionStatus: string; pageRange: string; category: string }[] }).readLibraryCatalog();
const ids = (from: number, to: number, prefix = "T") => Array.from({ length: to - from + 1 }, (_, i) => prefix + String(from + i).padStart(2, "0"));

/** Reader ordinal → [pageId, source PDF, title, printed page, module, training ids]. */
const SIX: Record<number, [string, number, string, number | undefined, string, string[]]> = {
  98: ["791381-m16-l05-p01", 106, "تدريبات مراجعة سريعة", 106, "791381-m16", ids(5, 12)],
  110: ["791381-m18-l03-p01", 119, "تدريبات نهاية الدفعة", undefined, "791381-m18", ids(13, 18)],
  145: ["791381-m04-l03-p02", 157, "تدريبات نهاية الدفعة", undefined, "791381-m04", ids(19, 22)],
  178: ["791381-m24-l03-p01", 191, "تدريبات على DHCP و Security", 191, "791381-m24", ids(23, 26)],
  214: ["791381-m06-l02-p01", 228, "تدريبات", 228, "791381-m06", ids(27, 30)],
  215: ["791381-m06-l02-p02", 229, "امتحانات نهائية للتدريب", 229, "791381-m06", ids(1, 6, "F")],
};
/** The progressive-release gate: the LATEST learning module needed to understand each item (≠ the page's module). */
const GATE: Record<string, string> = {
  T05: "791381-m08", T06: "791381-m09", T07: "791381-m10", T08: "791381-m11", T09: "791381-m12", T10: "791381-m13", T11: "791381-m14", T12: "791381-m15",
  T13: "791381-m16", T14: "791381-m18", T15: "791381-m03", T16: "791381-m19", T17: "791381-m04", T18: "791381-m21",
  T19: "791381-m22", T20: "791381-m24", T21: "791381-m05", T22: "791381-m26", T23: "791381-m27", T24: "791381-m06",
  T25: "791381-m24", T26: "791381-m24", T27: "791381-m06", T28: "791381-m06", T29: "791381-m06", T30: "791381-m06",
  F01: "791381-m06", F02: "791381-m06", F03: "791381-m06", F04: "791381-m06", F05: "791381-m06", F06: "791381-m06",
};
const NEW_IDS = [...ids(5, 30), ...ids(1, 6, "F")];

describe("A. Reader ordinal → page identity (positions are footer numbers «n / 248», NOT PDF numbers)", () => {
  it("98 → m16-l05-p01 → PDF 106 · 110 → m18-l03-p01 → PDF 119 · 145 → m04-l03-p02 → PDF 157 · 178 → m24-l03-p01 → PDF 191 · 214 → m06-l02-p01 → PDF 228 · 215 → m06-l02-p02 → PDF 229; the course has 248 pages and m28 starts at 216", () => {
    const flat = flattenPageRefs(manifest);
    expect(flat.length).toBe(248);
    for (const [pos, [pageId, pdf, title, printed, moduleId]] of Object.entries(SIX)) {
      const ref = flat[Number(pos) - 1];
      expect([ref.page.id, ref.page.source!.pdfPageStart, ref.page.title, ref.page.source!.printedPage, ref.module.id], pos).toEqual([pageId, pdf, title, printed, moduleId]);
      expect(pagePosition(manifest, pageId), pageId).toEqual({ index: Number(pos), total: 248 });
      const body = pageBy(pageId);
      expect([body.source.pdfPageStart, body.title], pageId).toEqual([pdf, title]);
      expect(findPage(manifest, pageId)?.page.title).toBe(title);
    }
    expect(flat[215].module.id).toBe("791381-m28");   // position 216 is the first page of the final summary
    expect(flat[214].module.id).toBe("791381-m06");
  });
});

describe("B + C. Exact association per page and cardinality across the whole course", () => {
  it("98 = T05–T12 · 110 = T13–T18 · 145 = T19–T22 · 178 = T23–T26 · 214 = T27–T30 · 215 = F01–F06, in that order, one block per real library id (no combined ids such as T05-T06)", () => {
    for (const [pos, [pageId, , , , , expected]] of Object.entries(SIX)) {
      expect(trainingsOf(pageBy(pageId)).map(t => t.trainingId), pos).toEqual(expected);
    }
  });
  it("T05–T30 and F01–F06 appear EXACTLY once across all 248 pages; T01–T04 stay on PDF 22 only; no other page carries a library-training block; no duplicate block id", () => {
    const where: Record<string, string[]> = {};
    for (const p of allPages) for (const t of trainingsOf(p)) (where[t.trainingId] ??= []).push(p.id);
    for (const id of NEW_IDS) expect(where[id], id).toHaveLength(1);
    expect(where.T01).toEqual(["791381-m02-l01-p08"]); expect(where.T02).toEqual(["791381-m02-l01-p08"]); expect(where.T03).toEqual(["791381-m02-l01-p08"]); expect(where.T04).toEqual(["791381-m02-l01-p08"]);
    expect(Object.keys(where).sort()).toEqual([...ids(1, 30), ...ids(1, 6, "F")].sort());
    const pagesWithTraining = allPages.filter(p => trainingsOf(p).length > 0).map(p => p.id).sort();
    expect(pagesWithTraining).toEqual(["791381-m02-l01-p08", ...Object.values(SIX).map(s => s[0])].sort());
    const blockIds = allPages.flatMap(p => p.blocks.map(b => b.id));
    expect(new Set(blockIds).size).toBe(blockIds.length);
    expect(trainingsOf(pageBy("791381-m02-l01-p08")).map(t => [t.trainingId, t.label, t.requiredModuleId])).toEqual([["T01", "تدريب 1", "791381-m01"], ["T02", "تدريب 2", "791381-m02"], ["T03", "تدريب 3", "791381-m07"], ["T04", "تدريب 4", "791381-m07"]]);
  });
  it("every new block is metadata only: exactly {id, type, origin, trainingId, label, requiredModuleId}, origin book (the printed page lists them, like T01–T04), labels «تدريب N» / «الامتحان …»; no title, question, answer, URL, QR target or GitHub Pages link anywhere on the six pages", () => {
    for (const [pos, [pageId, , , , , expected]] of Object.entries(SIX)) {
      const page = pageBy(pageId);
      for (const t of trainingsOf(page)) {
        expect(Object.keys(t).sort(), t.id).toEqual(["id", "label", "origin", "requiredModuleId", "trainingId", "type"]);
        expect(t.origin, t.id).toBe("book");
        expect(t.id, t.id).toBe(page.id.replace("791381-", "") + "-l" + t.trainingId.toLowerCase());
        if (t.trainingId.startsWith("T")) expect(t.label).toBe("تدريب " + Number(t.trainingId.slice(1)));
        else expect(t.label).toMatch(/^الامتحان (الأول|الثاني|الثالث|الرابع|الخامس|السادس)$/);
        expect(t.requiredModuleId).toBe(GATE[t.trainingId]);
        expect(manifest.modules.some(m => m.id === t.requiredModuleId), t.id).toBe(true);
      }
      const json = JSON.stringify(page);
      for (const banned of ["http", "github.io", "Book791381", "nassarwafik", "qr.", "url", "examSnapshot", "correctOptionIndex", "LIB-", "questions\":"]) expect(json, pos + " " + banned).not.toContain(banned);
      for (const title of catalog().filter(c => expected.includes(c.libraryItemId)).map(c => c.title)) expect(json, pos + " " + title).not.toContain(title);
      expect(json).not.toMatch(/غير متاحة داخل المنصة|لا تُقدَّم داخل المنصة|لا library-training/);
      expect(json).toMatch(/من داخل المنصة عندما يصبح الجزء المرتبط/);
      const heading = page.blocks.find(b => b.type === "heading" && b.id.endsWith("-practice"));
      expect(heading && heading.type === "heading" ? heading.text : null, pos).toBe(Number(pos) === 215 ? "امتحانات نهائية للتدريب" : "تدريبات مرتبطة بهذه الصفحة");
      expect(page.blocks.at(-1)!.type, pos).toBe("practice");   // the closing review still ends the page
    }
    // The book's visual grouping is preserved as sub-headings on 98 / 110 only.
    expect(pageBy(SIX[98][0]).blocks.filter(b => b.type === "heading" && b.level === 4).map(b => b.type === "heading" ? b.text : "")).toEqual(["تدريب 5–6", "تدريب 7–8", "تدريب 9–12"]);
    expect(pageBy(SIX[110][0]).blocks.filter(b => b.type === "heading" && b.level === 4).map(b => b.type === "heading" ? b.text : "")).toEqual(["تدريب 13–14", "تدريب 15–16", "تدريب 17–18"]);
    expect(validateLearningCourseContent(course)).toEqual([]);
  });
  it("the printed book cards (provenance) remain on every page exactly as before", () => {
    expect(pageBy(SIX[98][0]).blocks.find(b => b.id === "m16-l05-p01-cards")?.origin).toBe("book");
    expect(pageBy(SIX[110][0]).blocks.find(b => b.id === "m18-l03-p01-cards")?.origin).toBe("book");
    expect(pageBy(SIX[145][0]).blocks.find(b => b.id === "m04-l03-p02-cards")?.origin).toBe("book");
    expect(pageBy(SIX[178][0]).blocks.find(b => b.id === "m24-l03-p01-cards")?.origin).toBe("book");
    expect(pageBy(SIX[214][0]).blocks.find(b => b.id === "m06-l02-p01-cards")?.origin).toBe("book");
    const f = pageBy(SIX[215][0]).blocks.find(b => b.id === "m06-l02-p02-cards");
    expect(f && f.type === "list" ? f.items.map(i => i.term) : null).toEqual(["F01", "F02", "F03", "F04", "F05", "F06"]);
  });
});

describe("D + E. Canonical library and the release gate (page association ≠ release module)", () => {
  it("the server registry lists exactly T01–T30 + F01–F06 (36, orders 1..36) with the REAL catalog titles; every item is ready / publishable; no invented id", () => {
    const reg = registry();
    expect(reg.map(t => t.trainingId)).toEqual([...ids(1, 30), ...ids(1, 6, "F")]);
    expect(reg.map(t => t.order)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
    const cat = Object.fromEntries(catalog().map(c => [c.libraryItemId, c]));
    for (const t of reg) {
      expect(cat[t.trainingId], t.trainingId).toBeTruthy();
      expect(t.title, t.trainingId).toBe(cat[t.trainingId].title);
      expect([cat[t.trainingId].publishable, cat[t.trainingId].conversionStatus], t.trainingId).toEqual([true, "ready"]);
      expect(t.courseId).toBe("791381");
    }
    expect(cat["T05"].category).toBe("foundation"); expect(cat["T25"].category).toBe("comprehensive"); expect(cat["T27"].category).toBe("advanced"); expect(cat["F01"].category).toBe("final");
  });
  it("FRONTEND ↔ SERVER agreement: every block's requiredModuleId equals the registry's; the gate map is pinned; examples where the page's module ≠ the release module", () => {
    const reg = Object.fromEntries(registry().map(t => [t.trainingId, t]));
    for (const p of allPages) for (const t of trainingsOf(p)) expect(t.requiredModuleId, t.trainingId).toBe(reg[t.trainingId].requiredModuleId);
    for (const [id, mod] of Object.entries(GATE)) expect(reg[id].requiredModuleId, id).toBe(mod);
    const moduleOf = (pageId: string) => findPage(manifest, pageId)!.module.id;
    const shownOn = (id: string) => allPages.find(p => trainingsOf(p).some(t => t.trainingId === id))!.id;
    for (const [id, page, gate] of [["T05", SIX[98][0], "791381-m08"], ["T14", SIX[110][0], "791381-m18"], ["T18", SIX[110][0], "791381-m21"], ["T23", SIX[178][0], "791381-m27"], ["T24", SIX[178][0], "791381-m06"], ["T21", SIX[145][0], "791381-m05"], ["T25", SIX[178][0], "791381-m24"]] as const) {
      expect(shownOn(id), id).toBe(page);
      expect(reg[id].requiredModuleId, id).toBe(gate);
      expect(moduleOf(page) === gate, id + " page module vs gate").toBe(id === "T25" || id === "T14");   // only T14 (110 / m18) and T25 (178 / m24) sit on the page of their own gate
    }
    expect(moduleOf(SIX[215][0])).toBe("791381-m06"); expect(reg.F01.requiredModuleId).toBe("791381-m06");
  });
});
