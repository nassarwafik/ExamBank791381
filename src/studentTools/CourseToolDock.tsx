import { useMemo } from "react";
import StudentToolDock from "./StudentToolDock";
import { bookCSharpRunner } from "./csharpToolRun";
import { teacherLabRunner } from "./teacherCSharpLab";
import { courseStudentTools } from "./courseTools";
import { validateBookStudentTools } from "./studentToolsSpec";

// Phase T7 — the course book's tool bar: the course's fixed set (courseTools.ts) in the exam's StudentToolDock. One lazy chunk for
// the reader, so neither the course table nor the dock adds to the reader's first load; a course without a set renders nothing.
/** Phase T11 — `bookTools`: the tools the class's teacher chose for this book (the student endpoint delivers it). Absent ⇒ the book's
 *  built-in set. A value that is not a valid book tool set shows no tools rather than a partial bar; an empty list = tools off. */
/** Phase T14 — `runHeaders`: the Reader's session auth (its «جرّب الكود» access), so the C# editor can run in the book; absent → write only. */
/** `teacherLab` (owner decision): the TEACHER's reader runs C# on the teacher's own computer (teacherCSharpLab.ts) instead of the Runner. */
export default function CourseToolDock({ courseId, bookTools, runHeaders, teacherLab = false }: { courseId: string; bookTools?: unknown; runHeaders?: Record<string, string>; teacherLab?: boolean }) {
  const runner = useMemo(() => (teacherLab && runHeaders ? teacherLabRunner(courseId, runHeaders) : runHeaders ? bookCSharpRunner(runHeaders, courseId) : undefined), [teacherLab, runHeaders, courseId]);
  const chosen = bookTools === undefined ? undefined : validateBookStudentTools(bookTools);
  const tools = chosen === undefined ? courseStudentTools(courseId) : chosen.ok && chosen.value.tools.length ? chosen.value : undefined;
  return tools ? <StudentToolDock studentTools={tools} csharpRunner={runner} /> : null;
}
