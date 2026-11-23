import { useMemo } from "react";
import StudentToolDock from "./StudentToolDock";
import { bookCSharpRunner } from "./csharpToolRun";
import { bookDeviceRunner, isDesktopViewport } from "./deviceCSharpLab";
import { courseStudentTools } from "./courseTools";
import { validateBookStudentTools } from "./studentToolsSpec";

// Phase T7 — the course book's tool bar: the course's fixed set (courseTools.ts) in the exam's StudentToolDock. One lazy chunk for
// the reader, so neither the course table nor the dock adds to the reader's first load; a course without a set renders nothing.
/** Phase T11 — `bookTools`: the tools the class's teacher chose for this book (the student endpoint delivers it). Absent ⇒ the book's
 *  built-in set. A value that is not a valid book tool set shows no tools rather than a partial bar; an empty list = tools off. */
/** Phase T14 — `runHeaders`: the Reader's session auth (its «جرّب الكود» access), so the C# editor can run in the book; absent → write only. */
/** Owner decisions: in a book the C# editor runs ON THE READER'S DEVICE (deviceCSharpLab.ts) — the teacher and students alike, no Runner
 *  cost — on a DESKTOP only (2026-11-23): on a phone or tablet the editor keeps the Runner path, exactly as before. `runHeaders` (the
 *  reader's session) are used on the device only to read the book's classes from the API, which checks the reader. */
export default function CourseToolDock({ courseId, bookTools, runHeaders }: { courseId: string; bookTools?: unknown; runHeaders?: Record<string, string> }) {
  const runner = useMemo(() => (runHeaders ? (isDesktopViewport() ? bookDeviceRunner(courseId, runHeaders) : bookCSharpRunner(runHeaders, courseId)) : undefined), [runHeaders, courseId]);
  const chosen = bookTools === undefined ? undefined : validateBookStudentTools(bookTools);
  const tools = chosen === undefined ? courseStudentTools(courseId) : chosen.ok && chosen.value.tools.length ? chosen.value : undefined;
  return tools ? <StudentToolDock studentTools={tools} csharpRunner={runner} /> : null;
}
