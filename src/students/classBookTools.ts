// Phase T11 — the student tools a class's course book offers (docs/enterprise-student-tools-t.md §18). Presentation helpers only: the
// server checks, stores and delivers the choice (manage-classrooms setLearningCourseTools, student-learning-materials).
import type { Classroom } from "./types";
import { validateBookStudentTools, type StudentToolsSpecV1 } from "../studentTools/studentToolsSpec";
import { courseStudentTools } from "../studentTools/courseTools";
import { studentToolsSummary } from "../studentTools/studentToolsCatalog";

/** The tools the teacher chose for this course in this class (canonical), or undefined when the book's built-in set applies. */
export function classBookTools(classroom: Classroom | null | undefined, courseId: string): StudentToolsSpecV1 | undefined {
  const raw = classroom?.learningMaterials;
  if (!Array.isArray(raw)) return undefined;
  const entry = raw.find(e => e && e.courseId === courseId) as { studentTools?: unknown } | undefined;
  if (!entry || entry.studentTools === undefined) return undefined;
  const v = validateBookStudentTools(entry.studentTools);
  return v.ok ? v.value : undefined;
}

/** What the book offers now, in words: the teacher's choice, the built-in set, or nothing. */
export function bookToolsLine(chosen: StudentToolsSpecV1 | undefined, courseId: string): { source: "chosen" | "builtIn" | "none"; text: string } {
  const spec = chosen ?? courseStudentTools(courseId);
  const names = spec ? studentToolsSummary(spec) : [];
  if (chosen) return { source: "chosen", text: names.length ? names.join("، ") : "متوقفة (لا أدوات في هذا الكتاب)" };
  return spec && names.length ? { source: "builtIn", text: names.join("، ") } : { source: "none", text: "لا أدوات لهذا الكتاب" };
}
