// Phase F3-UI — the class's exam forms for the teacher: every student with the state of their form, what they answered,
// how many sections are rated and the mark of an approved form. A form waiting for the teacher comes first.
import { useEffect, useRef, useState } from "react";
import { trackerGet } from "../api";
import StatusBadge from "../../ui/StatusBadge";
import { STATUS_BADGE, type TeacherFormList, type TeacherFormRow, type TeacherFormStatus } from "./teacherTypes";

type Props = {
  token: string; projectCode: string; classId: string;
  onOpen: (studentId: string) => void;
};

// What waits for the teacher first, then what is with the student, then what is done.
const ORDER: Record<TeacherFormStatus, number> = { submitted: 0, returned: 1, draft: 2, not_started: 3, approved: 4 };
const sorted = (rows: TeacherFormRow[]) => rows.slice().sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.displayName.localeCompare(b.displayName, "ar"));

export default function TeacherExamFormList({ token, projectCode, classId, onOpen }: Props) {
  const [list, setList] = useState<TeacherFormList | null>(null);
  const [error, setError] = useState("");
  const [round, setRound] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    let live = true;
    queueMicrotask(() => {
      if (!live) return;
      trackerGet<TeacherFormList>(token, projectCode, "exam-form-students", { classId })
        .then(r => { if (live && mine === seq.current) { setList(r); setError(""); } })
        .catch(e => { if (live && mine === seq.current) setError(e instanceof Error ? e.message : "تعذر تحميل استمارات الصف."); });
    });
    return () => { live = false; };
  }, [token, projectCode, classId, round]);

  if (error) return <div className="platform-error assignment-inline-message" role="alert">{error} <button type="button" className="eb-button is-small" onClick={() => setRound(n => n + 1)}>إعادة المحاولة</button></div>;
  if (!list) return <p className="eb-muted" role="status">جارٍ تحميل استمارات الصف...</p>;
  if (!list.students.length) return <p className="eb-muted">لا يوجد طلاب في هذا الصف بعد.</p>;

  const c = list.counts;
  return (
    <div className="eb-project-form-list" data-testid="exam-form-list">
      <p className="eb-project-form-counts">
        بانتظار تقديرك: <strong dir="ltr">{c.submitted}</strong> · معتمدة: <strong dir="ltr">{c.approved}</strong> · أُعيدت: <strong dir="ltr">{c.returned}</strong> ·
        قيد التعبئة: <strong dir="ltr">{c.draft}</strong> · لم يبدأوا: <strong dir="ltr">{c.not_started}</strong>
      </p>
      <ul className="eb-project-form-rows">
        {sorted(list.students).map(row => {
          const badge = STATUS_BADGE[row.status];
          return (
            <li key={row.studentId} className="eb-project-form-row" data-student={row.studentId}>
              <div className="eb-project-form-row-text">
                <p className="eb-project-form-row-name"><strong>{row.displayName || row.studentId}</strong> <StatusBadge tone={badge.tone}>{badge.text}</StatusBadge></p>
                <p className="eb-muted">
                  {row.status === "not_started"
                    ? "لم يفتح الاستمارة بعد."
                    : <>أجاب عن <span dir="ltr">{row.answered}</span> من <span dir="ltr">{row.total}</span>{row.status !== "draft" && <> · قُدّر <span dir="ltr">{row.rated}</span> من <span dir="ltr">{row.toRate}</span> قسمًا</>}</>}
                  {row.mark !== null && <> · العلامة <strong dir="ltr">{row.mark} / 100</strong></>}
                </p>
              </div>
              {row.status !== "not_started" && (
                <button type="button" className={"eb-button" + (row.status === "submitted" ? " is-primary" : "")} onClick={() => onOpen(row.studentId)}
                  aria-label={(row.status === "submitted" ? "تقدير استمارة " : "عرض استمارة ") + (row.displayName || row.studentId)}>
                  {row.status === "submitted" ? "تقدير" : "عرض"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
