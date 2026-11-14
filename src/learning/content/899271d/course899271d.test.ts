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
import { readDsFigure, readDsLab, readDsSolution, readDsTrace } from "../../activities/ds";
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
    expect(findLearningCourse(CID)!.author).toBeUndefined();   // the owner asked for no author on this card
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
  it("DS-A3 — in every chapter each category's questions run from the easiest, five are solved on the page and the rest are homework with one «الحل» window each", async () => {
    const LEVELS = ["سهل", "متوسط", "متقدّم"];
    const plainTitle = (t: string) => t.replace(/[\u2066\u2069]/g, "");
    const question = (b: { type: string; text?: string }) => (b.type === "heading" ? /^سؤال (\d+) · (سهل|متوسط|متقدّم)(?: — |$)/.exec(plainTitle(b.text ?? "")) : null);
    let solvedPages = 0, homeworkPages = 0, solved = 0, homework = 0;
    for (const m of await loadAll()) {
      const unit = Number(m.id.slice(-2));
      const pages = m.lessons.flatMap(l => l.pages).map(p => ({ ...p, plain: plainTitle(p.title) }));
      const solvedHere = pages.filter(p => /^أسئلة .+ محلولة$/.test(p.plain)), homeworkHere = pages.filter(p => p.plain.startsWith("وظيفة: "));
      expect(pages.filter(p => /(^|\s)حلول(\s|$)/.test(p.plain)).map(p => p.plain), m.id + ": no separate solutions page").toEqual([]);   // the word, not the letters inside «محلولة»
      if (unit >= 1 && unit <= 7) {
        expect(solvedHere.length, m.id + " solved pages").toBe(2);
        expect(homeworkHere.map(p => p.plain).sort(), m.id + ": a homework page per category").toEqual(solvedHere.map(p => "وظيفة: " + p.plain.replace(/ محلولة$/, "")).sort());
      }
      for (const p of [...solvedHere, ...homeworkHere]) {
        const isSolved = solvedHere.includes(p);
        const at = p.blocks.map((b, i) => (question(b) ? i : -1)).filter(i => i >= 0);
        const qs = at.map(i => question(p.blocks[i])!);
        expect(qs.map(q => Number(q[1])), p.id + ": numbered 1, 2, 3 …").toEqual(qs.map((_, i) => i + 1));
        const levels = qs.map(q => LEVELS.indexOf(q[2]));
        expect(levels.every((l, i) => i === 0 || l >= levels[i - 1]), p.id + ": from the easiest to the hardest — " + qs.map(q => q[2]).join(", ")).toBe(true);
        expect(p.source.sourceNote, p.id + " is an added page").toMatch(/^إثراء/);
        if (isSolved) {
          solvedPages++; solved += qs.length;
          expect(qs.length, p.id + ": exactly five solved questions").toBe(5);
          expect(p.blocks.some(b => b.type === "practice" || b.type === "practice-table" || b.type === "guided"), p.id + ": a solved page shows its solutions (no exercise, no window)").toBe(false);
        } else {
          homeworkPages++; homework += qs.length;
          expect(qs.length, p.id + ": homework questions").toBeGreaterThanOrEqual(unit === 8 ? 2 : 3);
          expect(p.blocks.some(b => b.type === "simulation" && b.simulationType === "ds-trace"), p.id + ": no open trace on a homework page").toBe(false);
          at.forEach((start, k) => {
            const windows = p.blocks.slice(start, at[k + 1] ?? p.blocks.length).filter(b => b.type === "guided" && b.guidedType === "ds-solution");
            expect(windows.length, p.id + " سؤال " + (k + 1) + ": exactly one «الحل» window").toBe(1);
          });
        }
      }
    }
    expect([solvedPages, solved]).toEqual([14, 70]);                 // seven chapters × two categories × five solved
    expect(homeworkPages).toBe(16);                                    // the same fourteen and the review unit's two
    expect(homework).toBeGreaterThanOrEqual(14 * 3 + 6);
  }, 30000);
  it("a long code run in a worked example wraps instead of widening the page", async () => {
    // (A result that is an Arabic sentence is drawn right-to-left by the Reader: LearningPageRenderer.exampleResult.test.tsx.)
    const examples = pagesOf(await loadAll()).flatMap(p => p.blocks).filter(b => b.type === "example");
    expect(examples.length).toBeGreaterThan(100);
    expect(examples.filter(b => b.type === "example" && /[\u0600-\u06FF]/.test(b.result ?? "")).length).toBeGreaterThanOrEqual(40);   // sentences, in the «النتيجة» line
    // A stack of ten values (`[100,81,80,49,60,25,40,9,20,1]`) or a chained call has no break point: on a phone the step text
    // must wrap anywhere rather than scroll the whole page sideways.
    const css = readFileSync(fileURLToPath(new URL("../../reader/reader.css", import.meta.url)), "utf8");
    for (const rule of [".learning-reader-example-steps", ".learning-reader-example-prompt, .learning-reader-example-result"]) {
      const body = css.slice(css.indexOf(rule + "{"), css.indexOf("}", css.indexOf(rule + "{")));
      expect(body, rule).toContain("overflow-wrap:anywhere");
    }
  }, 30000);
  it("every activity is a data-structure activity (or the guided walkthrough / a solution window) with a readable config and a fallback text", async () => {
    const blocks = pagesOf(await loadAll()).flatMap(p => p.blocks);
    let traces = 0, labs = 0, figures = 0, solutions = 0;
    for (const b of blocks) {
      if (b.type === "guided" && b.guidedType === "reveal") { expect(builtinActivityRegistry.resolve(b), b.id).toBeTruthy(); continue; }
      if (b.type === "guided") {   // the «الحل» button and its solution window
        expect(productionActivityRegistry.resolve(b)?.key, b.id).toBe("ds-solution");
        expect(readDsSolution(b.config), b.id).not.toBeNull();
        expect(b.fallback?.text, b.id + " fallback").toBeTruthy();
        solutions++;
        continue;
      }
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
    expect(solutions).toBeGreaterThan(2);
  }, 30000);
});
