// The summary booklet course «أوراق تلخيص للمراجعة» (791381s): a book-only, verbatim conversion of the owner's 122-page booklet.
// These tests pin what makes it a faithful, independent second course:
//   • identity — every id carries the `791381s-` prefix, every source points at this booklet, the batches are the catalog's;
//   • the manifest is exactly the one derived from the authored bodies, and the app / server registries list the same modules;
//   • the whole course passes the content validator; every BOOK block is of a faithful type with no generated wording (no
//     `example` chrome, no untitled callout), and the book itself is pinned by the book lock (bookLock.test.ts);
//   • since Phase 2 (owner decisions D2/D3, docs/enterprise-791381s-enrichment-plan.md) enrichment is ADDED, never mixed into the
//     book: an added page is all enrichment (e.g. «تدريبات الوحدة», layout "practice"), and every enrichment block is
//     origin "teacher-enrichment" of an enrichment type;
//   • every diagram is a cropped PNG of the booklet under public/learning-assets/791381s/ that exists, stays small, and no
//     unreferenced asset ships.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { fileURLToPath } from "url";
import manifest from "./manifest";
import { COURSE_CONTENT_MODULE_IDS, registeredCourseIds } from "../registry";
import { loadBundledModuleContent } from "../bundledModules";
import { activityKey, deriveManifest, isActivityBlock, LEARNING_CONTENT_SCHEMA_VERSION, type ContentBlock, type ContentModule, type LearningCourseContent } from "../types";
import { validateLearningCourseContent } from "../validation";
import { findLearningCourse, LEARNING_COURSES } from "../../catalog";
import { buildPageIndex } from "../../progress/buildPageIndex";
import { REGISTERED_VISUAL_IDS } from "../../visuals/registry";
import { productionActivityRegistry } from "../../activities/engine";
// @ts-expect-error — the server registry is an untyped CommonJS module; it is imported here on purpose to cross-check it.
import * as apiRegistry from "../../../../api/src/lib/learning-materials-registry.js";

const CID = "791381s";
const server = apiRegistry as unknown as { listLearningModules: (c: string) => { moduleId: string; title: string; order: number }[] };
const assetDir = fileURLToPath(new URL("../../../../public/learning-assets/" + CID + "/", import.meta.url));
const ALLOWED_BLOCKS = new Set(["text", "heading", "callout", "list", "table", "code", "diagram", "unit-opener"]);
/** What enrichment may add (Phase 2 onward): exercises, visuals, activities, worked examples, teacher clarifications. */
const ENRICHMENT_BLOCKS = new Set(["practice", "practice-table", "visual", "simulation", "animation", "guided", "interactive-diagram", "example", "callout",
  // Phase 8A (§11.2): a metadata-only pointer to an Exam Library training — no question, option, answer or title in the content.
  "library-training"]);
const DIAGRAM_SRC = /^\/learning-assets\/791381s\/[0-9a-f]{16}\.png$/;

async function loadAll(): Promise<ContentModule[]> {
  const out: ContentModule[] = [];
  for (const m of manifest.modules) out.push(await loadBundledModuleContent(CID, m.id));
  return out;
}
const blocksOf = (mods: ContentModule[]) => mods.flatMap(m => m.lessons.flatMap(l => l.pages.flatMap(p => p.blocks.map(b => ({ page: p.id, b })))));

describe("791381s — identity and registration", () => {
  it("is a catalog course after 791381, and its manifest batches are the catalog's overview sections", () => {
    expect(LEARNING_COURSES.map(c => c.id)).toEqual(["791381", CID]);
    const course = findLearningCourse(CID)!;
    expect(course.status).toBe("available");
    expect(manifest.courseId).toBe(CID);
    expect(manifest.title).toBe(course.title);
    expect(manifest.batches!.map(b => ({ id: b.id, label: b.label }))).toEqual(course.overviewBatches);
    expect(registeredCourseIds()).toEqual(["791381", CID]);
  });

  it("modules m00–m36 in section order; every batch module exists and each module is in exactly one batch", () => {
    const ids = manifest.modules.map(m => m.id);
    expect(ids).toEqual(Array.from({ length: 37 }, (_, n) => CID + "-m" + String(n).padStart(2, "0")));
    expect(manifest.modules.map(m => m.order)).toEqual(Array.from({ length: 37 }, (_, n) => n));
    const inBatches = manifest.batches!.flatMap(b => b.moduleIds);
    expect([...inBatches].sort()).toEqual([...ids].sort());
    expect(new Set(inBatches).size).toBe(inBatches.length);
  });

  it("every id is course-prefixed and nested under its parent; every page source is this booklet's PDF page (content pages 1–112)", () => {
    for (const m of manifest.modules) {
      for (const l of m.lessons) {
        expect(l.id.startsWith(m.id + "-l")).toBe(true);
        for (const p of l.pages) {
          expect(p.id.startsWith(l.id + "-p")).toBe(true);
          expect(p.source?.sourceId).toBe(CID);
          expect(p.source!.pdfPageStart).toBeGreaterThanOrEqual(1);
          expect(p.source!.pdfPageEnd ?? p.source!.pdfPageStart).toBeLessThanOrEqual(112);
        }
      }
    }
  });

  it("the app's body list, the manifest and the server's publishable registry name the same modules (ids, titles, order)", () => {
    expect([...COURSE_CONTENT_MODULE_IDS[CID]]).toEqual(manifest.modules.map(m => m.id));
    expect(server.listLearningModules(CID)).toEqual(manifest.modules.map(m => ({ moduleId: m.id, title: m.title, order: m.order })));
    // the 791381 book is untouched by the new course
    expect(server.listLearningModules("791381").every(m => m.moduleId.startsWith("791381-m"))).toBe(true);
  });

  it("the committed server page index is the manifest-derived one (run `npm run build:learning-page-index` after content changes)", () => {
    const committed = JSON.parse(readFileSync(fileURLToPath(new URL("../../../../api/src/data/learning-pages/" + CID + ".json", import.meta.url)), "utf8"));
    expect(committed).toEqual(buildPageIndex(manifest));
  });
});

describe("791381s — the bodies", () => {
  it("the manifest is exactly the one derived from the authored bodies", async () => {
    const mods = await loadAll();
    const derived = deriveManifest({ schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: CID, title: manifest.title, direction: "rtl", modules: mods });
    expect(JSON.parse(JSON.stringify(derived.modules))).toEqual(JSON.parse(JSON.stringify(manifest.modules)));
  }, 30000);

  it("the whole course passes the content validator with no issue", async () => {
    const content: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: CID, title: manifest.title, direction: "rtl", modules: await loadAll() };
    expect(validateLearningCourseContent(content)).toEqual([]);
  }, 30000);

  it("every book block is of a faithful type and adds no wording of its own; enrichment is only ever an added, marked block", async () => {
    const all = blocksOf(await loadAll());
    expect(all.filter(x => x.b.origin === "book").length).toBeGreaterThan(500);
    for (const { page, b } of all) {
      const where = page + " / " + b.id;
      expect(["book", "teacher-enrichment"], where).toContain(b.origin);
      if (b.origin === "teacher-enrichment") {
        expect(ENRICHMENT_BLOCKS.has(b.type), where + " enrichment type " + b.type).toBe(true);
        if (b.type === "callout") expect((b as Extract<ContentBlock, { type: "callout" }>).kind, where).toBe("clarification");
        expect(b.id.startsWith(page.slice(CID.length + 1) + "-"), where).toBe(true);
        continue;
      }
      expect(ALLOWED_BLOCKS.has(b.type), where + " type " + b.type).toBe(true);
      // block ids carry the page id without the course prefix (the bundle guard's body signature relies on it)
      expect(b.id.startsWith(page.slice(CID.length + 1) + "-"), where).toBe(true);
      // a callout always shows the booklet's own printed label — never a generic label word the renderer would add
      if (b.type === "callout") expect((b as Extract<ContentBlock, { type: "callout" }>).title?.trim(), where).toBeTruthy();
      const text = JSON.stringify(b);
      expect(text, where).not.toMatch(/⟦NUL⟧|\*\*/);     // no extraction marker left behind
    }
  }, 30000);

  it("an added page is all enrichment: a «تدريبات الوحدة» page (layout practice) holds only teacher-enrichment exercises", async () => {
    const mods = await loadAll();
    const practicePages = mods.flatMap(m => m.lessons.flatMap(l => l.pages)).filter(p => p.layout === "practice");
    expect(practicePages.map(p => p.id)).toContain("791381s-m01-l02-p01");
    for (const p of practicePages) {
      expect(p.blocks.length, p.id).toBeGreaterThan(0);
      for (const b of p.blocks) expect(b.origin, p.id + " / " + b.id).toBe("teacher-enrichment");
    }
  }, 30000);

  it("every enrichment visual and activity resolves to a trusted registered renderer (no «قيد الإعداد» fallback in the booklet)", async () => {
    const all = blocksOf(await loadAll()).filter(x => x.b.origin === "teacher-enrichment");
    const entries = productionActivityRegistry.list();
    for (const { page, b } of all) {
      if (b.type === "visual") expect(REGISTERED_VISUAL_IDS, page + " / " + b.id).toContain(b.visualId);
      if (isActivityBlock(b)) expect(entries.some(e => e.kind === b.type && e.key === activityKey(b) && e.versions.includes(b.version)), page + " / " + b.id).toBe(true);
    }
  }, 30000);

  it("Phases 4–7: every unit 1–36 closes with a «تدريبات الوحدة» page of 8+ reveal questions mixing kinds", async () => {
    const mods = await loadAll();
    for (const n of Array.from({ length: 36 }, (_, i) => String(i + 1).padStart(2, "0"))) {
      const mod = mods.find(m => m.id === CID + "-m" + n)!;
      const last = [...mod.lessons].sort((a, b) => a.order - b.order).at(-1)!;
      expect(last.title, mod.id).toBe("تدريبات الوحدة");
      const page = last.pages[0];
      expect(page.layout, mod.id).toBe("practice");
      const qs = page.blocks.filter(b => b.type === "practice") as Extract<ContentBlock, { type: "practice" }>[];
      expect(qs.length, mod.id).toBeGreaterThanOrEqual(8);
      for (const q of qs) expect(q.reveal, q.id).toBe(true);
      expect(new Set(qs.map(q => q.question.kind)).size, mod.id + " kinds").toBeGreaterThanOrEqual(3);
    }
  }, 30000);

  it("Phase 7: the «الملخّص الشامل» units 31–36 practise their review tables from memory — every practice-table twin sits on the unit's «تدريبات الوحدة» page, never under the book table", async () => {
    const mods = await loadAll();
    for (const n of ["31", "32", "33", "34", "35", "36"]) {
      const mod = mods.find(m => m.id === CID + "-m" + n)!;
      const pages = mod.lessons.flatMap(l => l.pages);
      const practice = pages.find(p => p.layout === "practice")!;
      expect(practice.blocks.filter(b => b.type === "practice-table").length, mod.id).toBeGreaterThanOrEqual(3);
      for (const p of pages) if (p !== practice) expect(p.blocks.some(b => b.type === "practice-table"), p.id).toBe(false);
    }
  }, 30000);

  it("every diagram is a cropped booklet PNG that exists, is small, and every shipped asset is referenced", async () => {
    const diagrams = blocksOf(await loadAll()).filter(x => x.b.type === "diagram").map(x => x.b as Extract<ContentBlock, { type: "diagram" }>);
    expect(diagrams.length).toBeGreaterThan(0);
    const used = new Set<string>();
    for (const d of diagrams) {
      expect(d.src, d.id).toMatch(DIAGRAM_SRC);
      expect(d.alt.trim().length, d.id).toBeGreaterThan(10);
      const file = d.src!.split("/").pop()!;
      expect(statSync(assetDir + file).size, d.src).toBeLessThanOrEqual(150 * 1024);
      used.add(file);
    }
    expect(readdirSync(assetDir).sort()).toEqual([...used].sort());
  }, 30000);
});
