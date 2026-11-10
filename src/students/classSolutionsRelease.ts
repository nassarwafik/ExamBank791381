import type { Classroom } from "./types";

// 899371 enrichment P13 (decision D1) — the teacher's side of the solutions release, kept apart from classLearningMaterials.ts (which the
// Reader's class-reading panel also imports, so its first-load graph does not grow). Presentation only: the server decides and refuses.

/** The courses whose BOOK solutions and output tracers the teacher opens per module (only where the toggle appears). */
export const SOLUTION_RELEASE_COURSES: readonly string[] = ["899371"];

/** The modules of a course whose solutions this class has open, as the server last reported them ([] when none). Pure. */
export function classReleasedModuleIds(classroom: Classroom | null | undefined, courseId: string): string[] {
  const entry = (Array.isArray(classroom?.learningMaterials) ? classroom!.learningMaterials : []).find(e => e && e.courseId === courseId);
  return entry && Array.isArray(entry.releasedModuleIds) ? entry.releasedModuleIds.filter(id => typeof id === "string" && id) : [];
}
