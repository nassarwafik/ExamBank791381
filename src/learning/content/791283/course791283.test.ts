// HW-A2 (docs/enterprise-791283-course.md) — «أنظمة محوسبة» (791283) is an independent course:
//   • identity — the catalog card, every id prefixed `791283-`; the overview's sections equal the manifest's batches; the app's body
//     list, the server registry and the committed page index agree; the «booklet» skin;
//   • the committed files are exactly what scripts/build-hw-course.mjs produces from the authored units (no hand edit);
//   • the manifest is the one derived from the bodies; the whole course passes the content validator;
//   • provenance — a book page names the book's pages; an added page says «إثراء» and holds enrichment only;
//   • the owner's requests: every unit ends with a questions lesson of exactly TEN numbered questions (from past Bagrut exams of
//     model 791282, completed by the teacher where the exam bank has fewer); every 3D model of a part reads under the activity's
//     strict reader (hw-part-3d) and every piece of it carries an explanation.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import manifest from "./manifest";
import { COURSE_CONTENT_MODULE_IDS, registeredCourseIds } from "../registry";
import { loadBundledModuleContent } from "../bundledModules";
import { deriveManifest, LEARNING_CONTENT_SCHEMA_VERSION, type ContentModule, type LearningCourseContent } from "../types";
import { validateLearningCourseContent } from "../validation";
import { findLearningCourse } from "../../catalog";
import { buildPageIndex } from "../../progress/buildPageIndex";
import { courseThemeId } from "../../themes/courseTheme";
import { readHwPart3D } from "../../activities/hwPart3d";
import { productionActivityRegistry } from "../../activities/engine";
// @ts-expect-error — the server registry is an untyped CommonJS module; it is imported here on purpose to cross-check it.
import * as apiRegistry from "../../../../api/src/lib/learning-materials-registry.js";
// @ts-expect-error — plain ESM authoring tool; untyped on purpose.
import { render } from "../../../../scripts/build-hw-course.mjs";

const CID = "791283";
const server = apiRegistry as unknown as { listLearningModules: (c: string) => { moduleId: string; title: string; order: number }[] };
const root = (rel: string) => fileURLToPath(new URL("../../../../" + rel, import.meta.url));
async function loadAll(): Promise<ContentModule[]> {
  const out: ContentModule[] = [];
  for (const m of manifest.modules) out.push(await loadBundledModuleContent(CID, m.id));
  return out;
}
const pagesOf = (mods: ContentModule[]) => mods.flatMap(m => m.lessons.flatMap(l => l.pages));

describe("791283 — identity and registration", () => {
  it("is a catalog course with its card", () => {
    expect(findLearningCourse(CID)).toMatchObject({ title: "أنظمة محوسبة", subject: "أنظمة محوسبة", status: "available", year: "2026–2027" });
    expect(registeredCourseIds()).toContain(CID);
    expect(manifest.courseId).toBe(CID);
    expect(manifest.title).toBe(findLearningCourse(CID)!.title);
  });
  it("the overview sections are the manifest's batches, and every module is in exactly one", () => {
    expect(manifest.batches!.map(b => ({ id: b.id, label: b.label }))).toEqual(findLearningCourse(CID)!.overviewBatches);
    expect(manifest.batches!.flatMap(b => b.moduleIds).sort()).toEqual(manifest.modules.map(m => m.id).sort());
  });
  it("the app's body list, the manifest and the server registry name the same modules; the page index is the derived one", () => {
    expect([...COURSE_CONTENT_MODULE_IDS[CID]]).toEqual(manifest.modules.map(m => m.id));
    expect(server.listLearningModules(CID)).toEqual(manifest.modules.map(m => ({ moduleId: m.id, title: m.title, order: m.order })));
    const committed = JSON.parse(readFileSync(root("api/src/data/learning-pages/" + CID + ".json"), "utf8"));
    expect(committed).toEqual(buildPageIndex(manifest));
  });
  it("wears the «booklet» skin", () => { expect(courseThemeId(CID)).toBe("booklet"); });
});

describe("791283 — generated, never hand-edited", () => {
  it("every committed file equals what the generator produces from the authored units", () => {
    const files = render() as Record<string, string>;
    expect(Object.keys(files).length).toBe(9);
    for (const [rel, text] of Object.entries(files)) expect(readFileSync(root(rel), "utf8"), rel).toBe(text);
  });
});

describe("791283 — the bodies", () => {
  it("the manifest is exactly the one derived from the bodies", async () => {
    const mods = await loadAll();
    const derived = deriveManifest({ schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: CID, title: manifest.title, direction: "rtl", modules: mods });
    expect(JSON.parse(JSON.stringify(derived.modules))).toEqual(JSON.parse(JSON.stringify(manifest.modules)));
  }, 30000);
  it("the whole course passes the content validator with no issue", async () => {
    const content: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: CID, title: manifest.title, direction: "rtl", modules: await loadAll() };
    expect(validateLearningCourseContent(content)).toEqual([]);
  }, 30000);
  it("a book page names the book's pages; an added page says «إثراء» and holds enrichment only", async () => {
    const pages = pagesOf(await loadAll());
    expect(pages.length).toBe(41);
    for (const p of pages) {
      const note = p.source.sourceNote ?? "";
      if (note.startsWith("إثراء")) expect(p.blocks.every(b => b.origin === "teacher-enrichment"), p.id).toBe(true);
      else expect(note, p.id).toMatch(/^كتاب أنظمة محوسبة · (الصفحة \d+|الصفحات \d+–\d+)$/);
      expect(p.source.pdfPageStart, p.id).toBeGreaterThanOrEqual(2);
      expect(p.source.pdfPageEnd ?? p.source.pdfPageStart, p.id).toBeLessThanOrEqual(62);
    }
  }, 30000);
});

describe("791283 — the owner's requests", () => {
  it("every unit ends with a questions lesson of exactly ten numbered questions", async () => {
    for (const m of await loadAll()) {
      const last = m.lessons[m.lessons.length - 1];
      expect(last.title, m.id).toMatch(/^أسئلة الفصل/);
      const blocks = last.pages.flatMap(p => p.blocks);
      const heads = blocks.filter(b => b.type === "heading" && /^سؤال \d+ · /.test((b as { text: string }).text)).map(b => (b as { text: string }).text);
      expect(heads.map(h => Number(/^سؤال (\d+)/.exec(h)![1])), m.id).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(blocks.filter(b => b.type === "practice").length, m.id).toBe(10);
      // every question heading is followed by its question
      for (let i = 0; i < blocks.length; i++) if (blocks[i].type === "heading" && /^سؤال \d+/.test((blocks[i] as { text: string }).text)) expect(blocks[i + 1]?.type, m.id + " #" + i).toBe("practice");
      expect(blocks.every(b => b.origin === "teacher-enrichment"), m.id).toBe(true);
    }
  }, 30000);
  it("every 3D model of a part reads under the strict reader, every piece carries an explanation, and the renderer is registered", async () => {
    const models = pagesOf(await loadAll()).flatMap(p => p.blocks).filter(b => b.type === "interactive-diagram");
    expect(models.length).toBe(8);
    for (const b of models) {
      expect(b.type === "interactive-diagram" && b.interactionType === "hw-part-3d" && b.version === 1 && b.origin === "teacher-enrichment", b.id).toBe(true);
      const cfg = readHwPart3D((b as { config?: unknown }).config);
      expect(cfg, b.id).not.toBeNull();
      expect(cfg!.scene.targets.every(t => !!t.detail && t.detail.length > 10), b.id).toBe(true);
      expect(productionActivityRegistry.resolve(b as never)?.key, b.id).toBe("hw-part-3d");
    }
    expect(new Set(models.map(b => (b as unknown as { config: { scene: { id: string } } }).config.scene.id)).size).toBe(8);
  }, 30000);
});
