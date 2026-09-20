// Study Practice Strength — the SERVER-SIDE KEY INDEX builder. The API (CommonJS, no access to the frontend content
// modules) needs, per course, every eligible activity with its answer key: this derives that index from the real
// content through the same eligibility rule the Reader uses. Consumed by scripts/build-learning-study-index.mjs
// (writes api/src/data/learning-study/<courseId>.json) and by studyIndex.sync.test.ts (fails when content and the
// committed index drift apart).
import type { LearningCourseManifest, ContentModule } from "../content/types";
import { orderedModules } from "../content/navigation";
import { eligibleStudyActivities, type StudyActivityKey } from "./eligibility";

export interface StudyIndexPage { moduleId: string; activities: Record<string, StudyActivityKey>; }
export interface StudyIndex {
  schemaVersion: 1;
  courseId: string;
  /** Only pages that carry at least one eligible activity, keyed by page id (content order). */
  pages: Record<string, StudyIndexPage>;
}

export async function buildStudyIndex(courseId: string, manifest: LearningCourseManifest, loadModule: (courseId: string, moduleId: string) => Promise<ContentModule>): Promise<StudyIndex> {
  const pages: Record<string, StudyIndexPage> = {};
  for (const ref of orderedModules(manifest)) {
    const mod = await loadModule(courseId, ref.id);
    for (const lesson of [...mod.lessons].sort((a, b) => a.order - b.order)) {
      for (const page of [...lesson.pages].sort((a, b) => a.order - b.order)) {
        const specs = eligibleStudyActivities(page);
        if (specs.length === 0) continue;
        const activities: Record<string, StudyActivityKey> = {};
        for (const s of specs) activities[s.activityId] = s.key;
        pages[page.id] = { moduleId: mod.id, activities };
      }
    }
  }
  return { schemaVersion: 1, courseId, pages };
}
