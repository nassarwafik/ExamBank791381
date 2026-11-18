import StudentToolDock from "./StudentToolDock";
import { courseStudentTools } from "./courseTools";

// Phase T7 — the course book's tool bar: the course's fixed set (courseTools.ts) in the exam's StudentToolDock. One lazy chunk for
// the reader, so neither the course table nor the dock adds to the reader's first load; a course without a set renders nothing.
export default function CourseToolDock({ courseId }: { courseId: string }) {
  const tools = courseStudentTools(courseId);
  return tools ? <StudentToolDock studentTools={tools} /> : null;
}
