import type { Classroom, ClassLearningMaterial } from "./types";

/** Normalized read of a class's learning materials on the frontend (never trusts a missing field). Pure. */
export function classLearningMaterials(classroom: Classroom | null | undefined): ClassLearningMaterial[] {
  const raw = classroom?.learningMaterials;
  return Array.isArray(raw)
    ? raw.filter(e => e && typeof e.courseId === "string" && e.courseId).map(e => ({ courseId: e.courseId, visibleModuleIds: Array.isArray(e.visibleModuleIds) ? e.visibleModuleIds.slice() : [] }))
    : [];
}
