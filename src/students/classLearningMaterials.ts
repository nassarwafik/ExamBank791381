import type { Classroom, ClassLearningMaterial } from "./types";

/** Normalized read of a class's learning materials on the frontend (never trusts a missing field). Pure. */
export function classLearningMaterials(classroom: Classroom | null | undefined): ClassLearningMaterial[] {
  const raw = classroom?.learningMaterials;
  return Array.isArray(raw)
    ? raw.filter(e => e && typeof e.courseId === "string" && e.courseId).map(e => ({ courseId: e.courseId, visibleModuleIds: Array.isArray(e.visibleModuleIds) ? e.visibleModuleIds.slice() : [] }))
    : [];
}

/** UI-only published module counts; null until every assigned book has catalog metadata.
 * Never count stale/unknown module IDs as published or show misleading partial totals. */
export function classLearningReleaseSummary(
  materials: ClassLearningMaterial[],
  catalog: import("./types").LearningCatalogCourse[] | null,
): { assignedCourses: number; publishedModules: number; hiddenModules: number } | null {
  if (!catalog) return null;
  let publishedModules = 0;
  let allModules = 0;
  for (const entry of materials) {
    const course = catalog.find(c => c.courseId === entry.courseId);
    if (!course) return null;
    allModules += course.modules.length;
    publishedModules += course.modules.filter(m => entry.visibleModuleIds.includes(m.moduleId)).length;
  }
  return { assignedCourses: materials.length, publishedModules, hiddenModules: allModules - publishedModules };
}
