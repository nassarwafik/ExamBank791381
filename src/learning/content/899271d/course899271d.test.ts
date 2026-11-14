// DS-A2 (docs/enterprise-data-structures-course.md) — «الوحدة الرابعة: مبنى المعطيات» (899271d) is an independent fifth course:
//   • identity — the catalog card, every id prefixed `899271d-`, every source this course's; the overview's sections equal the
//     manifest's batches; the app's body list, the server registry and the committed page index agree;
//   • the committed files are exactly what scripts/build-ds-course.mjs produces from the authored units (no hand edit);
//   • the manifest is the one derived from the bodies; the whole course passes the content validator;
//   • provenance — a page taken from the book names its chapter and its book pages; an added page (trace and writing questions,
//     solutions, «تدريبات الوحدة») says «إثراء» and holds enrichment only;
//   • every activity is one of the three data-structure activities and its config is readable (ds-course.proof.test.ts proves
//     the programs behind them against the real C# compiler); the course wears the «booklet» skin.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import manifest from "./manifest";
import { COURSE_CONTENT_MODULE_IDS, registeredCourseIds } from "../registry";
import { loadBundledModuleContent } from "../bundledModules";
import { deriveManifest, LEARNING_CONTENT_SCHEMA_VERSION, type ContentModule, type LearningCourseContent } from "../types";
import { validateLearningCourseContent } from "../validation";
import { findLearningCourse, LEARNING_COURSES } from "../../catalog";
import { buildPageIndex } from "../../progress/buildPageIndex";
import { courseThemeId } from "../../themes/courseTheme";
import { productionActivityRegistry } from "../../activities/engine";
import { builtinActivityRegistry } from "../../activities/builtins";
import { readDsFigure, readDsLab, readDsTrace } from "../../activities/ds";
// @ts-expect-error — the server registry is an untyped CommonJS module; it is imported here on purpose to cross-check it.
import * as apiRegistry from "../../../../api/src/lib/learning-materials-registry.js";
// @ts-expect-error — plain ESM authoring tool; untyped on purpose.
import { render } from "../../../../scripts/build-ds-course.mjs";

const CID = "899271d";
const server = apiRegistry as unknown as { listLearningModules: (c: string) => { moduleId: string; title: string; order: number }[] };
const root = (rel: string) => fileURLToPath(new URL("../../../../" + rel, import.meta.url));
async function loadAll(): Promise<ContentModule[]> {
  const out: ContentModule[] = [];
  for (const m of manifest.modules) out.push(await loadBundledModuleContent(CID, m.id));
  return out;
}
const pagesOf = (mods: ContentModule[]) => mods.flatMap(m => m.lessons.flatMap(l => l.pages));

describe("899271d — identity and registration", () => {
  it("is the fifth catalog course with its card, independent of the automata course 899271", () => {
    expect(LEARNING_COURSES.map(c => c.id)).toEqual(["791381", "791381s", "899371", "899271", CID]);
    expect(findLearningCourse(CID)).toMatchObject({ title: "مبنى المعطيات", productTitle: "الوحدة الرابعة — مبنى المعطيات", subject: "علم الحاسوب", status: "available", year: "2026–2027" });
    expect(registeredCourseIds()).toContain(CID);
    expect(manifest.courseId).toBe(CID);
    expect(manifest.title).toBe(findLearningCourse(CID)!.title);
    for (const m of manifest.modules) expect(m.id.startsWith(CID + "-m"), m.id).toBe(true);
    for (const id of COURSE_CONTENT_MODULE_IDS["899271"]) expect(id.startsWith(CID), id).toBe(false);   // the two courses share no id
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

describe("899271d — generated, never hand-edited", () => {
  it("every committed file equals what the generator produces from the authored units", () => {
    const files = render() as Record<string, string>;
    expect(Object.keys(files).length).toBeGreaterThan(5);
    for (const [rel, text] of Object.entries(files)) expect(readFileSync(root(rel), "utf8") === text, rel + " is stale: run npm run build:ds-course").toBe(true);
  }, 60000);
});

describe("899271d — the bodies", () => {
  it("the manifest is exactly the one derived from the bodies", async () => {
    const mods = await loadAll();
    const derived = deriveManifest({ schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: CID, title: manifest.title, direction: "rtl", modules: mods });
    expect(JSON.parse(JSON.stringify(derived.modules))).toEqual(JSON.parse(JSON.stringify(manifest.modules)));
  }, 30000);
  it("the whole course passes the content validator with no issue", async () => {
    const content: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: CID, title: manifest.title, direction: "rtl", modules: await loadAll() };
    expect(validateLearningCourseContent(content)).toEqual([]);
  }, 30000);
  it("a page from the book names its chapter and its book pages; an added page says «إثراء» and holds enrichment only", async () => {
    for (const p of pagesOf(await loadAll())) {
      const note = p.source.sourceNote ?? "";
      expect(p.source.sourceId, p.id).toBe(CID);
      if (note.startsWith("إثراء")) expect(p.blocks.every(b => b.origin === "teacher-enrichment"), p.id).toBe(true);
      else {
        expect(note, p.id).toMatch(/^(المقدّمة|الفصل (الأول|الثاني|الثالث|الرابع|الخامس|السادس) «[^»]+») · ص \d+(–\d+)?$/);
        expect(p.blocks.some(b => b.origin === "book"), p.id + " has book content").toBe(true);
      }
    }
  }, 30000);
  it("every unit ends with its «تدريبات الوحدة» practice page", async () => {
    for (const m of await loadAll()) {
      const last = m.lessons.at(-1)!.pages.at(-1)!;
      expect([m.id, last.title, last.layout]).toEqual([m.id, "تدريبات الوحدة", "practice"]);
      expect(last.blocks.filter(b => b.type === "practice" || b.type === "practice-table").length, m.id).toBeGreaterThanOrEqual(6);
    }
  }, 30000);
  it("every activity is a data-structure activity (or the guided walkthrough) with a readable config and a fallback text", async () => {
    const blocks = pagesOf(await loadAll()).flatMap(p => p.blocks);
    let traces = 0, labs = 0, figures = 0;
    for (const b of blocks) {
      if (b.type === "guided") { expect(builtinActivityRegistry.resolve(b), b.id).toBeTruthy(); continue; }
      if (b.type !== "simulation" && b.type !== "interactive-diagram" && b.type !== "animation") continue;
      expect(productionActivityRegistry.resolve(b), b.id + " resolves to a registered renderer").toBeTruthy();
      expect(b.fallback?.text, b.id + " fallback").toBeTruthy();
      if (b.type === "simulation" && b.simulationType === "ds-trace") { traces++; expect(readDsTrace(b.config), b.id).not.toBeNull(); }
      else if (b.type === "simulation" && b.simulationType === "ds-lab") { labs++; expect(readDsLab(b.config), b.id).not.toBeNull(); }
      else if (b.type === "interactive-diagram" && b.interactionType === "ds-figure") { figures++; expect(readDsFigure(b.config), b.id).not.toBeNull(); }
      else throw new Error(b.id + ": an activity of another course");
    }
    expect(traces).toBeGreaterThan(15);
    expect(labs).toBeGreaterThan(1);
    expect(figures).toBeGreaterThan(2);
  }, 30000);
});
