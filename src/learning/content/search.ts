// Learning Materials — Phase 2: search-index PREPARATION (§24).
//
// A pure helper that turns a manifest into lightweight, per-page searchable metadata. This is NOT full-text
// search and there is NO search UI or API in Phase 2 — it only proves the manifest carries enough (titles +
// keywords + the id path) to build an index later without loading any page body.

import type { LearningCourseManifest } from "./types";
import { flattenPageRefs } from "./navigation";

/** One lightweight, indexable record per page. */
export interface SearchEntry {
  courseId: string;
  moduleId: string;
  lessonId: string;
  pageId: string;
  title: string;
  keywords: string[];
}

/** Build the per-page search metadata from a manifest, in reading order. Pure; no page bodies are read. */
export function buildSearchIndex(manifest: LearningCourseManifest): SearchEntry[] {
  return flattenPageRefs(manifest).map(({ page, lesson, module }) => ({
    courseId: manifest.courseId,
    moduleId: module.id,
    lessonId: lesson.id,
    pageId: page.id,
    title: page.title,
    keywords: page.keywords ?? [],
  }));
}
