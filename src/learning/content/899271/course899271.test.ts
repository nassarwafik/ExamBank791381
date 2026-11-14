// AUTO-A2 (docs/enterprise-automata-course-a2.md) — «الوحدة الخامسة: الأتمتة» (899271) is an independent fourth course:
//   • identity — the catalog card, every id prefixed `899271-`, every source this course's; the overview's sections equal the
//     manifest's batches; the app's body list, the server registry and the committed page index agree;
//   • the committed files are exactly what scripts/build-automata-course.mjs produces from the authored units (no hand edit);
//   • the manifest is the one derived from the bodies; the whole course passes the content validator;
//   • provenance — a page translated from the slides names its deck and slides; an added page (exercises, «نحلّ معًا») says
//     «إثراء» and holds enrichment only; every machine is the simulator (automata-course.proof.test.ts proves them all);
//   • every illustration resolves to a registered SVG; the course wears the «booklet» skin.
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
import { resolveVisual } from "../../visuals/registry";
// @ts-expect-error — the server registry is an untyped CommonJS module; it is imported here on purpose to cross-check it.
import * as apiRegistry from "../../../../api/src/lib/learning-materials-registry.js";
// @ts-expect-error — plain ESM authoring tool; untyped on purpose.
import { render } from "../../../../scripts/build-automata-course.mjs";

const CID = "899271";
const server = apiRegistry as unknown as { listLearningModules: (c: string) => { moduleId: string; title: string; order: number }[] };
const root = (rel: string) => fileURLToPath(new URL("../../../../" + rel, import.meta.url));
async function loadAll(): Promise<ContentModule[]> {
  const out: ContentModule[] = [];
  for (const m of manifest.modules) out.push(await loadBundledModuleContent(CID, m.id));
  return out;
}
const pagesOf = (mods: ContentModule[]) => mods.flatMap(m => m.lessons.flatMap(l => l.pages));

describe("899271 — identity and registration", () => {
  it("is a catalog course with its card", () => {
    expect(findLearningCourse(CID)).toMatchObject({ title: "الأتمتة", productTitle: "الوحدة الخامسة — الأتمتة", subject: "علم الحاسوب", status: "available", year: "2026–2027" });
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

describe("899271 — generated, never hand-edited", () => {
  it("every committed file equals what the generator produces from the authored units", () => {
    const files = render() as Record<string, string>;
    expect(Object.keys(files).length).toBeGreaterThan(5);
    for (const [rel, text] of Object.entries(files)) expect(readFileSync(root(rel), "utf8"), rel).toBe(text);
  });
});

describe("899271 — the bodies", () => {
  it("the manifest is exactly the one derived from the bodies", async () => {
    const mods = await loadAll();
    const derived = deriveManifest({ schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: CID, title: manifest.title, direction: "rtl", modules: mods });
    expect(JSON.parse(JSON.stringify(derived.modules))).toEqual(JSON.parse(JSON.stringify(manifest.modules)));
  }, 30000);
  it("the whole course passes the content validator with no issue", async () => {
    const content: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: CID, title: manifest.title, direction: "rtl", modules: await loadAll() };
    expect(validateLearningCourseContent(content)).toEqual([]);
  }, 30000);
  it("a translated page names its deck and slides; an added page says «إثراء» and holds enrichment only", async () => {
    for (const p of pagesOf(await loadAll())) {
      const note = p.source.sourceNote ?? "";
      if (note.startsWith("إثراء")) expect(p.blocks.every(b => b.origin === "teacher-enrichment"), p.id).toBe(true);
      else expect(note, p.id).toMatch(/^(اللقاء [1-6]|أمثلة من الحياة اليومية|محاكاة أوتومات المكدّس|وظائف آلة تورنغ) · (الشريحة \d+|الشرائح \d+–\d+)$/);
    }
  }, 30000);
  it("every machine is shown by the simulator or built in «صمّم الآلة» (AUTO-A3), and every illustration resolves to a registered SVG", async () => {
    const blocks = pagesOf(await loadAll()).flatMap(p => p.blocks);
    const sims = blocks.filter(b => b.type === "simulation");
    expect(sims.length).toBeGreaterThan(20);
    expect(sims.every(b => b.type === "simulation" && (b.simulationType === "automaton-trace" || b.simulationType === "automaton-design") && b.version === 1)).toBe(true);
    // the ten «صمّم الآلة» exercises: units 2, 3 (two), 4, 5 (two) (AUTO-A3) and 6 (two), 7 (two) (AUTO-A3b); all enrichment, all
    // judged on the server
    const designs = sims.filter(b => b.type === "simulation" && b.simulationType === "automaton-design");
    expect(designs.map(b => b.id)).toEqual(["m02-l04-p02-b06", "m03-l05-p01-b04", "m03-l05-p01-b05", "m04-l04-p02-b06", "m05-l05-p02-b06", "m05-l05-p02-b07", "m06-l03-p02-b06", "m06-l03-p02-b07", "m07-l03-p02-b06", "m07-l03-p02-b07"]);
    expect(designs.every(b => b.origin === "teacher-enrichment")).toBe(true);
    for (const b of blocks) if (b.type === "visual") expect(resolveVisual(b.visualId), b.visualId).not.toBeNull();
  }, 30000);
});
