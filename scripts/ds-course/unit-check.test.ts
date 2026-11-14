// DS-A2 — the AUTHOR's check of the units while they are written (the course's own tests are course899271d.test.ts and
// ds-course.proof.test.ts):   DS_UNIT=5 npx vitest run scripts/ds-course/unit-check.test.ts   (no DS_UNIT = every unit).
// Each unit alone passes the site's content validator, and every activity config it produced is readable by its activity.
import { describe, it, expect } from "vitest";
// @ts-expect-error — plain ESM authoring tools, untyped on purpose.
import { buildCourse } from "../build-ds-course.mjs";
// @ts-expect-error — plain ESM authoring tools, untyped on purpose.
import { COURSE, UNITS } from "./index.mjs";
import { LEARNING_CONTENT_SCHEMA_VERSION, type ContentModule, type LearningCourseContent } from "../../src/learning/content/types";
import { validateLearningCourseContent } from "../../src/learning/content/validation";
import { readDsFigure, readDsLab, readDsSolution, readDsTrace } from "../../src/learning/activities/ds";

type Unit = { n: number; title: string };
const wanted = process.env.DS_UNIT ? Number(process.env.DS_UNIT) : null;
const units: Unit[] = wanted === null ? (UNITS as Unit[]) : [((await import(/* @vite-ignore */ "./u" + String(wanted).padStart(2, "0") + ".mjs")) as { default: Unit }).default];

describe("each unit of «مبنى المعطيات» alone", () => {
  for (const u of units) {
    it("unit " + u.n + " «" + u.title + "» — the content validator has no issue; every activity config is readable", () => {
      const { modules, raw } = buildCourse([u]) as { modules: ContentModule[]; raw: { enrichmentPage: boolean; block: Record<string, unknown> & { id: string; type: string; origin: string } }[] };
      const content: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: COURSE.id, title: COURSE.title, direction: "rtl", modules };
      expect(validateLearningCourseContent(content).map(i => i.code + " " + i.message + " @ " + JSON.stringify(i))).toEqual([]);
      for (const r of raw) {
        const b = r.block;
        if (r.enrichmentPage) expect(b.origin, b.id + ": a page without `src` is an added page — every block on it must be enrichment (use the X* helpers)").toBe("teacher-enrichment");
        if (b.simulationType === "ds-trace") expect(readDsTrace(b.config), b.id + " trace").not.toBeNull();
        if (b.simulationType === "ds-lab") expect(readDsLab(b.config), b.id + " lab").not.toBeNull();
        if (b.interactionType === "ds-figure") expect(readDsFigure(b.config), b.id + " figure").not.toBeNull();
        if (b.guidedType === "ds-solution") expect(readDsSolution(b.config), b.id + " solution").not.toBeNull();
      }
    });
    it("unit " + u.n + " — its question pages: by difficulty, five solved per category, the rest homework with one «الحل» window each", () => {
      const { modules, raw } = buildCourse([u]) as { modules: ContentModule[]; raw: Raw[] };
      const problems = questionPageProblems(u.n, modules, raw);
      expect(problems, "\n" + problems.join("\n")).toEqual([]);
    });
  }
});

type Raw = { pageId: string; enrichmentPage: boolean; block: Record<string, unknown> & { id: string; type: string; origin: string; _question?: { n: number; level: string } } };
const LEVEL_ORDER = ["سهل", "متوسط", "متقدّم"];
/**
 * DS-A3 — the rules of a unit's question pages (the owner's request): in every chapter the questions of each category are ordered
 * from the easiest, the first five are SOLVED on a page «أسئلة … محلولة» and the rest are HOMEWORK on a page «وظيفة: أسئلة …»,
 * each with exactly one «الحل» button (a solution window). Returns what is wrong, in words.
 */
function questionPageProblems(unit: number, modules: ContentModule[], raw: Raw[]): string[] {
  const out: string[] = [];
  const pages = modules.flatMap(m => m.lessons.flatMap(l => l.pages)).map(p => ({ id: p.id, title: p.title.replace(/[\u2066\u2069]/g, ""), blocks: raw.filter(r => r.pageId === p.id).map(r => r.block) }));
  const solved = pages.filter(p => /^أسئلة .+ محلولة$/.test(p.title)), homework = pages.filter(p => p.title.startsWith("وظيفة: "));
  if (unit >= 1 && unit <= 7) {
    if (solved.length < 2) out.push("the unit needs two «أسئلة … محلولة» pages (one per category); it has " + solved.length);
    if (homework.length < 2) out.push("the unit needs two «وظيفة: أسئلة …» pages (one per category); it has " + homework.length);
    for (const p of solved) if (!homework.some(h => h.title === "وظيفة: " + p.title.replace(/ محلولة$/, ""))) out.push("«" + p.title + "» has no homework page named «وظيفة: " + p.title.replace(/ محلولة$/, "") + "»");
  }
  for (const p of pages) if (/(^|\s)حلول(\s|$)/.test(p.title)) out.push("«" + p.title + "»: a separate solutions page — a solved question shows its solution in place, a homework question in its «الحل» window");
  for (const p of [...solved, ...homework]) {
    const isSolved = solved.includes(p);
    const at = p.blocks.map((b, i) => (b._question ? i : -1)).filter(i => i >= 0);
    const qs = at.map(i => p.blocks[i]._question!);
    const where = "«" + p.title + "»";
    if (!qs.length) { out.push(where + ": no question heading — write each question's heading with QH(n, level, title)"); continue; }
    if (qs.some((q, i) => q.n !== i + 1)) out.push(where + ": the questions are numbered " + qs.map(q => q.n).join(", ") + " — number them 1, 2, 3 … on each page");
    if (qs.some((q, i) => i > 0 && LEVEL_ORDER.indexOf(q.level) < LEVEL_ORDER.indexOf(qs[i - 1].level))) out.push(where + ": the levels are " + qs.map(q => q.level).join(", ") + " — order the questions from the easiest (سهل) to the hardest (متقدّم)");
    if (isSolved && qs.length !== 5) out.push(where + ": " + qs.length + " solved questions — exactly 5");
    if (!isSolved && qs.length < (unit === 8 ? 2 : 3)) out.push(where + ": " + qs.length + " homework question(s) — at least 3");
    if (isSolved && p.blocks.some(b => b.type === "practice" || b.type === "practice-table")) out.push(where + ": a solved page shows the solution; it holds no interactive exercise (put those in the homework or in «تدريبات الوحدة»)");
    if (isSolved && p.blocks.some(b => b.guidedType === "ds-solution")) out.push(where + ": a solved question shows its solution on the page, not behind a «الحل» button");
    if (!isSolved && p.blocks.some(b => b.simulationType === "ds-trace")) out.push(where + ": a homework page holds no open TRACE (it would give the answer away) — put the trace inside SOLUTION({ trace })");
    at.forEach((start, k) => {
      const part = p.blocks.slice(start, at[k + 1] ?? p.blocks.length);
      const windows = part.filter(b => b.guidedType === "ds-solution").length;
      if (!isSolved && windows !== 1) out.push(where + " سؤال " + (k + 1) + ": " + windows + " «الحل» window(s) — exactly one per homework question");
      if (isSolved && !part.some(b => b.type === "example" || b.type === "code" || b.simulationType === "ds-trace")) out.push(where + " سؤال " + (k + 1) + ": a solved question needs its solution (an example with steps, the code, or a trace)");
    });
  }
  return out;
}
