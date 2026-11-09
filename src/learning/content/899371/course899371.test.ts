// 899371 P2 (docs/enterprise-899371-learning-plan.md §14) — «أسس علم الحاسوب» is a faithful, independent third course:
//   • identity — the catalog card the owner set (grade 11, 2026–2027), the C# book's own sections, every id prefixed `899371-`,
//     every source this book's; the overview's batches equal the manifest's (later chapters' sections are empty → «قريبًا»);
//   • the manifest is exactly the one derived from the bodies; the app's body list, the server registry and the committed page
//     index agree;
//   • the whole course passes the content validator; every block is a BOOK block of a faithful type — P2 adds no enrichment;
//   • every program is a C# code block (Reader P1); the course wears the existing «booklet» skin (presentation only).
// fidelity.p2.test.ts proves the text equal to the Word source; bookLock.test.ts keeps it from changing.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
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
const BOOK_BLOCKS = new Set(["text", "heading", "list", "table", "code", "unit-opener"]);

async function loadAll(): Promise<ContentModule[]> {
  const out: ContentModule[] = [];
  for (const m of manifest.modules) out.push(await loadBundledModuleContent(CID, m.id));
  return out;
}
const blocksOf = (mods: ContentModule[]) => mods.flatMap(m => m.lessons.flatMap(l => l.pages.flatMap(p => p.blocks.map(b => ({ page: p.id, b })))));

describe("899371 — identity and registration", () => {
  it("is the third catalog course, with the card the owner set", () => {
    expect(LEARNING_COURSES.map(c => c.id)).toEqual(["791381", "791381s", CID]);
    expect(findLearningCourse(CID)).toMatchObject({ title: "أسس علم الحاسوب", productTitle: "مجمع أسئلة 899371 — أسس علم الحاسوب", subject: "علم الحاسوب", grades: "الصف الحادي عشر", year: "2026–2027", author: "الأستاذ وفيق نصار", status: "available" });
    expect(registeredCourseIds()).toContain(CID);
    expect(manifest.courseId).toBe(CID);
    expect(manifest.title).toBe(findLearningCourse(CID)!.title);
  });

  it("the overview sections are the manifest's batches; m00–m04 are converted, the later sections are still empty («قريبًا»)", () => {
    expect(manifest.batches!.map(b => ({ id: b.id, label: b.label }))).toEqual(findLearningCourse(CID)!.overviewBatches);
    expect(manifest.batches!.map(b => [b.id, b.moduleIds])).toEqual([
      ["intro", ["899371-m00"]], ["b1", ["899371-m01", "899371-m02", "899371-m03"]], ["b2", ["899371-m04"]], ["b3", []], ["b4", []], ["b5", []],
    ]);
    expect(manifest.modules.map(m => [m.id, m.order, m.title])).toEqual([
      ["899371-m00", 0, "افتتاحية"], ["899371-m01", 1, "الطباعة والمتغيرات"], ["899371-m02", 2, "العوامل والتعابير المنطقية"], ["899371-m03", 3, "المكتبة الرياضية"], ["899371-m04", 4, "جملة الشرط"],
    ]);
  });

  it("every chapter has its opener, its summary and its two assignments under the book's own table-of-contents names", () => {
    const lessons = manifest.modules.filter(m => m.order > 0).map(m => m.lessons.map(l => l.title));
    expect(lessons).toEqual([
      ["افتتاحية الوحدة", "الطباعة والمتغيرات", "الوظيفة الأولى بيتية", "الوظيفة الأولى برمجة"],
      ["افتتاحية الوحدة", "العوامل والتعابير المنطقية", "الوظيفة الثانية بيتية", "الوظيفة الثانية برمجة"],
      ["افتتاحية الوحدة", "المكتبة الرياضية", "الوظيفة الثالثة بيتية", "الوظيفة الثالثة برمجة"],
      ["افتتاحية الوحدة", "جملة الشرط", "الوظيفة الرابعة بيتية", "الوظيفة الرابعة برمجة"],
    ]);
  });

  it("each assignment page is titled by the question numbers printed on it (no «السؤال 32» from the typo «32. -» of ¶97)", () => {
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
    });
  });

  it("every id is course-prefixed and nested; every source is this book (printed page 3–140 + its Word paragraphs)", () => {
    for (const m of manifest.modules) for (const l of m.lessons) {
      expect(l.id.startsWith(m.id + "-l")).toBe(true);
      for (const p of l.pages) {
        expect(p.id.startsWith(l.id + "-p")).toBe(true);
        expect(p.source).toMatchObject({ kind: "book", sourceId: CID });
        expect(p.source!.printedPage).toBe(p.source!.pdfPageStart);
        expect(p.source!.pdfPageStart).toBeGreaterThanOrEqual(3);
        expect(p.source!.pdfPageStart).toBeLessThanOrEqual(140);
        expect(p.source!.sourceNote).toMatch(/^¶\d+(–\d+)?$/);
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

  it("every block is a book block of a faithful type, with a page-prefixed id; P2 adds no enrichment", async () => {
    const all = blocksOf(await loadAll());
    expect(all.length).toBe(406);
    for (const { page, b } of all) {
      const where = page + " / " + b.id;
      expect(b.origin, where).toBe("book");
      expect(BOOK_BLOCKS.has(b.type), where + " type " + b.type).toBe(true);
      expect(b.id.startsWith(page.slice(CID.length + 1) + "-"), where).toBe(true);
    }
  }, 30000);

  it("every program is a C# code block shown left to right", async () => {
    const code = blocksOf(await loadAll()).filter(x => x.b.type === "code").map(x => x.b as Extract<ContentBlock, { type: "code" }>);
    expect(code.length).toBeGreaterThan(60);
    for (const c of code) expect([c.language, c.dir], c.id).toEqual(["csharp", "ltr"]);
  }, 30000);
});
