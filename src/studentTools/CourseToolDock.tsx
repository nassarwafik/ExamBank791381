import { useEffect, useMemo } from "react";
import StudentToolDock from "./StudentToolDock";
import { bookCSharpRunner, type CSharpToolRunner } from "./csharpToolRun";
import { isDesktopViewport, teacherCSharpLab, type LabRunner } from "./csharpLab";
import { courseStudentTools } from "./courseTools";
import { validateBookStudentTools } from "./studentToolsSpec";

// Phase T7 — the course book's tool bar: the course's fixed set (courseTools.ts) in the exam's StudentToolDock. One lazy chunk for
// the reader, so neither the course table nor the dock adds to the reader's first load; a course without a set renders nothing.
/** Phase T11 — `bookTools`: the tools the class's teacher chose for this book (the student endpoint delivers it). Absent ⇒ the book's
 *  built-in set. A value that is not a valid book tool set shows no tools rather than a partial bar; an empty list = tools off. */
/** Phase T14 — `runHeaders`: the Reader's session auth (its «جرّب الكود» access), so the C# editor can run in the book; absent → write only. */
/** Teacher C# lab V1 — `labHeaders` (the TEACHER host only): on a desktop, the C# editor runs in this browser (csharpLab.ts) instead
 *  of on the Runner; on a phone it stays as it was. The lab's frame is made only when the editor is opened, and removed with the dock. */
export default function CourseToolDock({ courseId, bookTools, runHeaders, labHeaders }: { courseId: string; bookTools?: unknown; runHeaders?: Record<string, string>; labHeaders?: Record<string, string> }) {
  const runner = useMemo<CSharpToolRunner | LabRunner | undefined>(() => {
    if (labHeaders && isDesktopViewport()) return teacherCSharpLab(labHeaders, courseId);
    return runHeaders ? bookCSharpRunner(runHeaders, courseId) : undefined;
  }, [labHeaders, runHeaders, courseId]);
  useEffect(() => () => { if (runner && "dispose" in runner) runner.dispose(); }, [runner]);
  const chosen = bookTools === undefined ? undefined : validateBookStudentTools(bookTools);
  const tools = chosen === undefined ? courseStudentTools(courseId) : chosen.ok && chosen.value.tools.length ? chosen.value : undefined;
  return tools ? <StudentToolDock studentTools={tools} csharpRunner={runner} /> : null;
}
