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
  }
});
