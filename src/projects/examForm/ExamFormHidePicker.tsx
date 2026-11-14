// Phase F3-UI — before the first open, the teacher may hide questions for this class (owner decision 1). A ticked question
// is asked; an unticked one is hidden. A section keeps at least one question (the server refuses otherwise), and the choice
// cannot change after the first open: the questions are frozen into the class then.
import { useEffect, useRef, useState } from "react";
import { trackerGet } from "../api";
import type { TeacherFormQuestions } from "./teacherTypes";

type Props = {
  token: string; projectCode: string; classId: string;
  hidden: string[];
  onChange: (hidden: string[]) => void;
  disabled?: boolean;
};

export default function ExamFormHidePicker({ token, projectCode, classId, hidden, onChange, disabled = false }: Props) {
  const [data, setData] = useState<TeacherFormQuestions | null>(null);
  const [error, setError] = useState("");
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    let live = true;
    queueMicrotask(() => {
      if (!live) return;
      trackerGet<TeacherFormQuestions>(token, projectCode, "exam-form-questions", { classId })
        .then(r => { if (live && mine === seq.current) { setData(r); setError(""); } })
        .catch(e => { if (live && mine === seq.current) setError(e instanceof Error ? e.message : "تعذر تحميل الأسئلة."); });
    });
    return () => { live = false; };
  }, [token, projectCode, classId]);

  if (error) return <p className="platform-error assignment-inline-message" role="alert">{error}</p>;
  if (!data) return <p className="eb-muted" role="status">جارٍ تحميل الأسئلة...</p>;

  const hiddenSet = new Set(hidden);
  const toggle = (questionId: string, shown: boolean) => {
    const next = new Set(hiddenSet);
    if (shown) next.delete(questionId); else next.add(questionId);
    onChange([...next]);
  };

  return (
    <div className="eb-project-form-picker" data-testid="exam-form-picker">
      <p className="eb-muted">أزل العلامة عن السؤال الذي لا تريد طرحه على هذا الصف. يبقى في كل قسم سؤال واحد على الأقل، ولا يمكن تغيير الاختيار بعد أول فتح.</p>
      {data.sections.map((section, index) => {
        const shown = section.questions.filter(q => !hiddenSet.has(q.questionId));
        return (
          <details key={section.sectionId} className="eb-project-form-picker-section">
            <summary>
              <span dir="ltr">{index + 1}</span>. {section.title}
              <span className="eb-muted"> — <span dir="ltr">{shown.length}</span> من <span dir="ltr">{section.questions.length}</span></span>
            </summary>
            <ul className="eb-project-form-picker-list">
              {section.questions.map(q => {
                const isShown = !hiddenSet.has(q.questionId);
                // The last shown question of a section cannot be hidden.
                const locked = disabled || (isShown && shown.length === 1);
                return (
                  <li key={q.questionId}>
                    <label className="eb-sp-form-option">
                      <input type="checkbox" checked={isShown} disabled={locked} onChange={e => toggle(q.questionId, e.target.checked)} />
                      <span dir="auto">{q.prompt}{q.grading === "auto" ? " (آلي)" : ""}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
      <p className="eb-project-form-picker-count" role="status">
        {hidden.length ? <>عدد الأسئلة المخفية عن هذا الصف: <strong dir="ltr">{hidden.length}</strong>.</> : "ستُطرح كل الأسئلة."}
        {hidden.length > 0 && !disabled && <> <button type="button" className="eb-button is-small is-quiet" onClick={() => onChange([])}>إظهار الكل</button></>}
      </p>
    </div>
  );
}
