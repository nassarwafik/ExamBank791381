import StudentToolDock from "./StudentToolDock";
import { courseStudentTools } from "./courseTools";
import { validateBookStudentTools } from "./studentToolsSpec";

// Phase T7 — the course book's tool bar: the course's fixed set (courseTools.ts) in the exam's StudentToolDock. One lazy chunk for
// the reader, so neither the course table nor the dock adds to the reader's first load; a course without a set renders nothing.
/** Phase T11 — `bookTools`: the tools the class's teacher chose for this book (the student endpoint delivers it). Absent ⇒ the book's
 *  built-in set. A value that is not a valid book tool set shows no tools rather than a partial bar; an empty list = tools off. */
export default function CourseToolDock({ courseId, bookTools }: { courseId: string; bookTools?: unknown }) {
  const chosen = bookTools === undefined ? undefined : validateBookStudentTools(bookTools);
  const tools = chosen === undefined ? courseStudentTools(courseId) : chosen.ok && chosen.value.tools.length ? chosen.value : undefined;
  return tools ? <StudentToolDock studentTools={tools} /> : null;
}
