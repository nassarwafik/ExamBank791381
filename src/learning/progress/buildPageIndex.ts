// Phase L.3 — the server-side PAGE INDEX of a course: every module's page ids in canonical reading order. Built from the
// manifest only (no module body), consumed by scripts/build-learning-page-index.mjs → api/src/data/learning-pages/
// <courseId>.json, and pinned against the live manifest by pageIndex.sync.test.ts. The API uses it to accept a reading
// event only for a page that really exists in a module published to the student's class, and (L.4) to report how much
// of each module a class has read.
import { flattenPageRefs } from "../content/navigation";
import type { LearningCourseManifest } from "../content/types";

export type LearningPageIndex = {
  schemaVersion: 1;
  courseId: string;
  /** module id → its page ids in canonical reading order (the Reader's order). */
  modules: Record<string, string[]>;
};

export function buildPageIndex(manifest: LearningCourseManifest): LearningPageIndex {
  const modules: Record<string, string[]> = {};
  for (const ref of flattenPageRefs(manifest)) (modules[ref.module.id] ??= []).push(ref.page.id);
  return { schemaVersion: 1, courseId: manifest.courseId, modules };
}
