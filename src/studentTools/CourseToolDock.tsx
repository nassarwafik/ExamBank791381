import { useMemo } from "react";
import StudentToolDock from "./StudentToolDock";
import { bookCSharpRunner } from "./csharpToolRun";
import { bookDeviceRunner, isDesktopViewport } from "./deviceCSharpLab";
import { courseStudentTools } from "./courseTools";
import { csharpVisualAllowedInBook, validateBookStudentTools } from "./studentToolsSpec";

// Phase T7 — the course book's tool bar: the course's fixed set (courseTools.ts) in the exam's StudentToolDock. One lazy chunk for
// the reader, so neither the course table nor the dock adds to the reader's first load; a course without a set renders nothing.
/** Phase T11 — `bookTools`: the tools the class's teacher chose for this book (the student endpoint delivers it). Absent ⇒ the book's
 *  built-in set. A value that is not a valid book tool set shows no tools rather than a partial bar; an empty list = tools off. */
/** Phase T14 — `runHeaders`: the Reader's session auth (its «جرّب الكود» access), so the C# editor can run in the book; absent → write only. */
/** Owner decisions: in a book the C# editor runs ON THE READER'S DEVICE (deviceCSharpLab.ts) — the teacher and students alike, no Runner
 *  cost — on a DESKTOP only (2026-11-23): on a phone or tablet the editor keeps the Runner path, exactly as before. `runHeaders` (the
 *  reader's session) are used on the device only to read the book's classes from the API, which checks the reader. */
/** Visual lab V3 — `visualRun` (the TEACHER's reader only): on the device, the editor also offers «تشغيل مرئي» (the program recorded step
 *  by step and drawn as the course's trace activity draws it). Presentation: the lab runs only the reader's own program on this device. */
/** Visual lab V7 (owner decision 2026-11-23) — a STUDENT gets «تشغيل مرئي» too when the class's teacher turned it on for this book
 *  (`allowVisual` of the book's C# editor, which needs running): on the student's own device, desktop only, never in an exam. */
export default function CourseToolDock({ courseId, bookTools, runHeaders, visualRun = false }: { courseId: string; bookTools?: unknown; runHeaders?: Record<string, string>; visualRun?: boolean }) {
  const chosen = bookTools === undefined ? undefined : validateBookStudentTools(bookTools);
  const tools = chosen === undefined ? courseStudentTools(courseId) : chosen.ok && chosen.value.tools.length ? chosen.value : undefined;
  const visual = visualRun || csharpVisualAllowedInBook(tools);
  const runner = useMemo(() => (runHeaders ? (isDesktopViewport() ? bookDeviceRunner(courseId, runHeaders, { visual }) : bookCSharpRunner(runHeaders, courseId)) : undefined), [runHeaders, courseId, visual]);
  return tools ? <StudentToolDock studentTools={tools} csharpRunner={runner} /> : null;
}
