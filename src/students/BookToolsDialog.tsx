import { Suspense, lazy, useState } from "react";
import Dialog from "../ui/Dialog";
import type { StudentToolsSpecV1 } from "../studentTools/studentToolsSpec";
import { BOOK_EXCLUDED_TOOLS } from "../studentTools/studentToolsSpec";
import { courseStudentTools } from "../studentTools/courseTools";
import { SAVE_LABELS } from "../teacher/saveLabels";

// Phase T11 — the teacher chooses the student tools of ONE course book for ONE class. The editor is the exam's «أدوات الطالب» editor
// without sections and without a formula sheet; an empty selection turns the book's tools off. «استعادة أدوات الكتاب» goes back to
// the book's built-in set. The server checks and stores the choice (TeacherPlatform owns the request).
const StudentToolsEditor = lazy(() => import("../studentTools/StudentToolsEditor"));

export default function BookToolsDialog({ open, courseId, courseTitle, className, chosen, busy, onClose, onSave }: {
  open: boolean; courseId: string; courseTitle: string; className: string; chosen: StudentToolsSpecV1 | undefined; busy: boolean;
  onClose: () => void; onSave: (spec: StudentToolsSpecV1 | null) => void;
}) {
  const [draft, setDraft] = useState<StudentToolsSpecV1>(() => chosen ?? courseStudentTools(courseId) ?? { version: 1, tools: [] });
  return (
    <Dialog open={open} title={"أدوات الطالب في «" + courseTitle + "» — الصف «" + className + "»"} onClose={onClose} size="md" className="eb-lm-tools-dialog"
      footer={<>
        <button type="button" className="eb-button" onClick={onClose}>إلغاء</button>
        {chosen && <button type="button" className="eb-button is-quiet" disabled={busy} onClick={() => onSave(null)}>استعادة أدوات الكتاب</button>}
        <button type="button" className="eb-button is-primary" disabled={busy} onClick={() => onSave(draft)}>{SAVE_LABELS.saveChanges}</button>
      </>}>
      <p className="eb-muted">تظهر هذه الأدوات للطالب في زر «الأدوات» أثناء قراءة الكتاب. الأدوات لا تحفظ شيئًا ولا ترسله ولا تصحّحه.</p>
      <Suspense fallback={<p className="eb-muted" role="status">جارٍ تحميل الأدوات…</p>}>
        <StudentToolsEditor value={draft} sections={[]} excludeTools={BOOK_EXCLUDED_TOOLS} place="book" onChange={next => setDraft(next ?? { version: 1, tools: [] })} />
      </Suspense>
    </Dialog>
  );
}
