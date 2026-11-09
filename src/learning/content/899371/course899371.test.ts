// 899371 P2 + P3 (docs/enterprise-899371-learning-plan.md §14, §15) — «أسس علم الحاسوب» is a faithful, independent third course:
//   • identity — the catalog card the owner set (grade 11, 2026–2027), the C# book's own sections, every id prefixed `899371-`,
//     every source this book's; the overview's batches equal the manifest's, the whole book (m00–m12) in its six sections;
//   • the manifest is exactly the one derived from the bodies; the app's body list, the server registry and the committed page
//     index agree;
//   • the whole course passes the content validator; every block of a book page is a BOOK block of a faithful type, and the only
//     enrichment is the lesson «تدريبات الوحدة» closing chapters 1–11 (P4, §16): exercise pages of code + practice blocks only, and
//     the walkthrough pages «نحلّ معًا» closing each summary lesson (P5, §17): code + guided blocks only;
//   • every drawing (the chapter-10 matrices, P3-c) is a protected file that exists, stays small, and no unreferenced file ships;
//   • every program is a C# code block (Reader P1); the course wears the existing «booklet» skin (presentation only).
// fidelity.p2.test.ts proves the text equal to the Word source; bookLock.test.ts keeps it from changing.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import manifest from "./manifest";
import { COURSE_CONTENT_MODULE_IDS, registeredCourseIds } from "../registry";
import { loadBundledModuleContent } from "../bundledModules";
import { deriveManifest, LEARNING_CONTENT_SCHEMA_VERSION, type ContentBlock, type ContentModule, type LearningCourseContent } from "../types";
import { validateLearningCourseContent } from "../validation";
import { findLearningCourse, LEARNING_COURSES } from "../../catalog";
import { buildPageIndex } from "../../progress/buildPageIndex";
import { courseThemeId, pageThemeFor } from "../../themes/courseTheme";
// @ts-expect-error — the server registry is an untyped CommonJS module; it is imported here on purpose to cross-check it.
import * as apiRegistry from "../../../../api/src/lib/learning-materials-registry.js";

const CID = "899371";
const server = apiRegistry as unknown as { listLearningModules: (c: string) => { moduleId: string; title: string; order: number }[] };
// @ts-expect-error — plain ESM tool shared with the converter; untyped on purpose.
import { PRACTICE_NOTE, GUIDED_NOTE } from "../../../../scripts/convert-899371.mjs";
const BOOK_BLOCKS = new Set(["text", "heading", "list", "table", "code", "unit-opener", "diagram"]);
const assetDir = fileURLToPath(new URL("../../../../api/src/data/content-assets/learning/" + CID + "/", import.meta.url));

async function loadAll(): Promise<ContentModule[]> {
  const out: ContentModule[] = [];
  for (const m of manifest.modules) out.push(await loadBundledModuleContent(CID, m.id));
  return out;
}
const ENRICHMENT_NOTES = new Set([PRACTICE_NOTE, GUIDED_NOTE]);
const blocksOf = (mods: ContentModule[]) => mods.flatMap(m => m.lessons.flatMap(l => l.pages.flatMap(p => p.blocks.map(b => ({ page: p.id, enrichment: ENRICHMENT_NOTES.has(p.source?.sourceNote), note: p.source?.sourceNote, b })))));

describe("899371 — identity and registration", () => {
  it("is the third catalog course, with the card the owner set", () => {
    expect(LEARNING_COURSES.map(c => c.id)).toEqual(["791381", "791381s", CID]);
    expect(findLearningCourse(CID)).toMatchObject({ title: "أسس علم الحاسوب", productTitle: "مجمع أسئلة 899371 — أسس علم الحاسوب", subject: "علم الحاسوب", grades: "الصف الحادي عشر", year: "2026–2027", author: "الأستاذ وفيق نصار", status: "available" });
    expect(registeredCourseIds()).toContain(CID);
    expect(manifest.courseId).toBe(CID);
    expect(manifest.title).toBe(findLearningCourse(CID)!.title);
  });

  it("the overview sections are the manifest's batches, and every module of the book is in exactly one of them", () => {
    expect(manifest.batches!.map(b => ({ id: b.id, label: b.label }))).toEqual(findLearningCourse(CID)!.overviewBatches);
    const m = (...ns: number[]) => ns.map(n => "899371-m" + String(n).padStart(2, "0"));
    expect(manifest.batches!.map(b => [b.id, b.moduleIds])).toEqual([
      ["intro", m(0)], ["b1", m(1, 2, 3)], ["b2", m(4, 5, 6)], ["b3", m(7, 8)], ["b4", m(9, 10)], ["b5", m(11, 12)],
    ]);
    expect(manifest.modules.map(x => [x.id, x.order, x.title])).toEqual([
      ["899371-m00", 0, "افتتاحية"], ["899371-m01", 1, "الطباعة والمتغيرات"], ["899371-m02", 2, "العوامل والتعابير المنطقية"], ["899371-m03", 3, "المكتبة الرياضية"], ["899371-m04", 4, "جملة الشرط"],
      ["899371-m05", 5, "جملة التكرار for"], ["899371-m06", 6, "جملة التكرار while"], ["899371-m07", 7, "العمليات"], ["899371-m08", 8, "النصوص"], ["899371-m09", 9, "المصفوفات"],
      ["899371-m10", 10, "مصفوفة ثنائية الابعاد"], ["899371-m11", 11, "الكائنات"], ["899371-m12", 12, "الكلمة الختامية"],
    ]);
  });

  it("every chapter has its opener, its summary and its two assignments under the book's own table-of-contents names, then its exercises", () => {
    const lessons = manifest.modules.filter(m => m.order > 0 && m.order < 12).map(m => m.lessons.map(l => l.title));
    expect(lessons).toEqual([
      ["افتتاحية الوحدة", "الطباعة والمتغيرات", "الوظيفة الأولى بيتية", "الوظيفة الأولى برمجة", "تدريبات الوحدة"],
      ["افتتاحية الوحدة", "العوامل والتعابير المنطقية", "الوظيفة الثانية بيتية", "الوظيفة الثانية برمجة", "تدريبات الوحدة"],
      ["افتتاحية الوحدة", "المكتبة الرياضية", "الوظيفة الثالثة بيتية", "الوظيفة الثالثة برمجة", "تدريبات الوحدة"],
      ["افتتاحية الوحدة", "جملة الشرط", "الوظيفة الرابعة بيتية", "الوظيفة الرابعة برمجة", "تدريبات الوحدة"],
      ["افتتاحية الوحدة", "جملة التكرار for", "الوظيفة الخامسة بيتية", "الوظيفة الخامسة برمجة", "تدريبات الوحدة"],
      ["افتتاحية الوحدة", "جملة التكرار while", "الوظيفة السادسة بيتية", "الوظيفة السادسة برمجة", "تدريبات الوحدة"],
      ["افتتاحية الوحدة", "العمليات", "الوظيفة السابعة بيتية", "الوظيفة السابعة برمجة", "تدريبات الوحدة"],
      ["افتتاحية الوحدة", "النصوص", "الوظيفة الثامنة بيتية", "الوظيفة الثامنة برمجة", "تدريبات الوحدة"],
      ["افتتاحية الوحدة", "المصفوفات", "الوظيفة التاسعة بيتية", "الوظيفة التاسعة برمجة", "تدريبات الوحدة"],
      ["افتتاحية الوحدة", "مصفوفة ثنائية الابعاد", "الوظيفة العاشرة بيتية", "الوظيفة العاشرة برمجة", "تدريبات الوحدة"],
      ["افتتاحية الوحدة", "الكائنات", "الوظيفة الحادية عشرة بيتية", "الوظيفة الحادية عشرة برمجة", "تدريبات الوحدة"],
    ]);
    expect(manifest.modules.at(-1)!.lessons.map(l => l.title)).toEqual(["الكلمة الختامية"]);
  });

  it("each assignment page is titled by the question numbers printed on it (no «السؤال 32» from the typo of ¶97, no chapter-11 item as a question)", () => {
    // (the exercise lesson closing each chapter is P4's, not a book assignment)
    const titles = Object.fromEntries(manifest.modules.flatMap(m => m.lessons).filter(l => l.title.startsWith("الوظيفة")).map(l => [l.title, l.pages.map(p => p.title)]));
    const q = (...xs: string[]) => xs.map(x => (x.includes("–") ? "الأسئلة " : "السؤال ") + x);
    expect(titles).toEqual({
      "الوظيفة الأولى بيتية": q("1", "2", "3", "4–5"),
      "الوظيفة الأولى برمجة": q("1–4", "5–8", "9–10"),
      "الوظيفة الثانية بيتية": q("1", "2", "3", "4", "5", "6–9", "10", "11", "12", "13", "14", "15"),
      "الوظيفة الثانية برمجة": q("1", "2", "3", "4", "5", "6", "7", "8", "9", "10"),
      "الوظيفة الثالثة بيتية": q("1", "2", "3", "4", "5", "6", "7–10"),
      "الوظيفة الثالثة برمجة": q("1", "2", "3", "4", "5", "6–9", "10"),
      "الوظيفة الرابعة بيتية": q("1", "2", "3", "4", "5–7", "8", "9", "10", "11"),
      "الوظيفة الرابعة برمجة": q("1", "2", "3", "4", "5", "6–9", "10"),
      "الوظيفة الخامسة بيتية": q("1", "2", "3", "4", "5"),
      "الوظيفة الخامسة برمجة": q("1–2", "3–4", "5–6", "7", "8", "9", "10"),
      "الوظيفة السادسة بيتية": q("1", "2", "3", "4", "5"),
      "الوظيفة السادسة برمجة": q("1–2", "3", "4", "5"),
      "الوظيفة السابعة بيتية": q("1", "2", "3", "4", "5"),
      "الوظيفة السابعة برمجة": q("1", "2", "3", "4", "5", "6", "7", "8", "9", "10"),
      "الوظيفة الثامنة بيتية": q("1", "2", "3", "4", "5"),
      "الوظيفة الثامنة برمجة": q("1", "2", "3", "4"),
      "الوظيفة التاسعة بيتية": q("1", "2", "3", "4", "5"),
      "الوظيفة التاسعة برمجة": q("1", "2", "3", "4", "5", "6"),
      "الوظيفة العاشرة بيتية": q("1", "2", "3", "4", "5"),
      "الوظيفة العاشرة برمجة": q("1", "2", "3", "4", "5"),
      "الوظيفة الحادية عشرة بيتية": q("1", "2", "3", "4", "5"),
      "الوظيفة الحادية عشرة برمجة": q("1", "2", "3", "4", "5"),
    });
  });

  it("every id is course-prefixed and nested; every source is this book (printed page 3–140 + its Word paragraphs, or the exercises' note)", () => {
    for (const m of manifest.modules) for (const l of m.lessons) {
      expect(l.id.startsWith(m.id + "-l")).toBe(true);
      for (const p of l.pages) {
        expect(p.id.startsWith(l.id + "-p")).toBe(true);
        expect(p.source).toMatchObject({ kind: "book", sourceId: CID });
        expect(p.source!.printedPage).toBe(p.source!.pdfPageStart);
        expect(p.source!.pdfPageStart).toBeGreaterThanOrEqual(3);
        expect(p.source!.pdfPageStart).toBeLessThanOrEqual(140);
        if (l.title === "تدريبات الوحدة") expect(p.source!.sourceNote).toBe(PRACTICE_NOTE);
        else if (p.title.startsWith("نحلّ معًا: ")) expect(p.source!.sourceNote).toBe(GUIDED_NOTE);
        else expect(p.source!.sourceNote).toMatch(/^¶\d+(–\d+)?$/);
      }
    }
  });

  it("the app's body list, the manifest and the server registry name the same modules; the page index is the derived one", () => {
    expect([...COURSE_CONTENT_MODULE_IDS[CID]]).toEqual(manifest.modules.map(m => m.id));
    expect(server.listLearningModules(CID)).toEqual(manifest.modules.map(m => ({ moduleId: m.id, title: m.title, order: m.order })));
    const committed = JSON.parse(readFileSync(fileURLToPath(new URL("../../../../api/src/data/learning-pages/" + CID + ".json", import.meta.url)), "utf8"));
    expect(committed).toEqual(buildPageIndex(manifest));
  });

  it("wears the existing «booklet» skin, a colour per section", () => {
    expect(courseThemeId(CID)).toBe("booklet");
    expect(pageThemeFor(CID, manifest, "899371-m04")).toEqual({ id: "booklet", tone: "b2" });
  });
});

describe("899371 — the bodies", () => {
  it("the manifest is exactly the one derived from the bodies", async () => {
    const mods = await loadAll();
    const derived = deriveManifest({ schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: CID, title: manifest.title, direction: "rtl", modules: mods });
    expect(JSON.parse(JSON.stringify(derived.modules))).toEqual(JSON.parse(JSON.stringify(manifest.modules)));
  }, 30000);

  it("the whole course passes the content validator with no issue", async () => {
    const content: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: CID, title: manifest.title, direction: "rtl", modules: await loadAll() };
    expect(validateLearningCourseContent(content)).toEqual([]);
  }, 30000);

  it("every block of a book page is a book block of a faithful type; the only enrichment is the exercise and walkthrough pages", async () => {
    const all = blocksOf(await loadAll());
    expect(all.filter(x => !x.enrichment).length).toBe(1602);
    expect(all.filter(x => x.note === PRACTICE_NOTE).length).toBe(110 + 77);   // 110 exercises, 77 of them with their program above
    expect(all.filter(x => x.note === GUIDED_NOTE).length).toBe(44 + 43);      // 44 walkthroughs, 43 of them with their program above
    for (const { page, enrichment, note, b } of all) {
      const where = page + " / " + b.id;
      expect(b.id.startsWith(page.slice(CID.length + 1) + "-"), where).toBe(true);
      if (enrichment) { expect(b.origin, where).toBe("teacher-enrichment"); expect(note === PRACTICE_NOTE ? ["code", "practice"] : ["code", "guided"], where).toContain(b.type); continue; }
      expect(b.origin, where).toBe("book");
      expect(BOOK_BLOCKS.has(b.type), where + " type " + b.type).toBe(true);
    }
  }, 30000);

  it("every program is a C# code block shown left to right", async () => {
    const code = blocksOf(await loadAll()).filter(x => x.b.type === "code").map(x => x.b as Extract<ContentBlock, { type: "code" }>);
    expect(code.filter(c => c.origin === "book").length).toBe(224);
    expect(code.length).toBe(224 + 77 + 43);
    for (const c of code) expect([c.language, c.dir], c.id).toEqual(["csharp", "ltr"]);
  }, 30000);

  it("every drawing is a protected file that exists, stays small and is referenced; no unreferenced file ships", async () => {
    const drawings = blocksOf(await loadAll()).filter(x => x.b.type === "diagram").map(x => x.b as Extract<ContentBlock, { type: "diagram" }>);
    expect(drawings).toHaveLength(7);
    const used = new Set<string>();
    for (const d of drawings) {
      expect(d.src, d.id).toMatch(/^\/learning-assets\/899371\/[0-9a-f]{16}\.png$/);
      const file = d.src!.split("/").pop()!;
      expect(statSync(assetDir + file).size, d.src).toBeLessThanOrEqual(150 * 1024);
      used.add(file);
    }
    expect(readdirSync(assetDir).sort()).toEqual([...used].sort());
  }, 30000);
});
