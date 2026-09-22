import { useEffect, useState } from "react";
import type { BuilderQuestion } from "../../examTypes";
import { QUESTION_TYPE_LABELS } from "../../examTypes";
import type { ChallengeQuestionSource } from "../domain/challenge";
import type { LiveChallengeClient, SourceExamListItem } from "./liveChallengeClient";

/**
 * Import questions into a challenge from an EXISTING saved exam (the canonical, no-transform source: a saved
 * structured exam already stores BuilderQuestion objects). The teacher picks an exam, selects one or more of its
 * questions, and adds them. The parent snapshots each selection immutably, so the source exam is never linked or
 * mutated afterward. (Training / Bank sources plug into the same {question, source} shape via their own loaders.)
 */
export default function ChallengeImportPicker({ client, onAdd, onCancel }: {
  client: LiveChallengeClient;
  onAdd: (items: { question: BuilderQuestion; source: ChallengeQuestionSource }[]) => void;
  onCancel: () => void;
}) {
  const [exams, setExams] = useState<SourceExamListItem[] | null>(null);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState<SourceExamListItem | null>(null);
  const [questions, setQuestions] = useState<BuilderQuestion[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = false;
    (async () => {
      try { const list = await client.listSourceExams(); if (!off) setExams(list); }
      catch { if (!off) setError("تعذّر تحميل قائمة الامتحانات."); }
    })();
    return () => { off = true; };
  }, [client]);

  const openExam = async (exam: SourceExamListItem) => {
    setBusy(true); setError(""); setCurrent(exam); setQuestions(null); setChecked(new Set());
    try {
      const src = await client.loadSourceQuestions(exam.blobName);
      setQuestions(src.questions);
    } catch { setError("تعذّر تحميل أسئلة الامتحان."); }
    finally { setBusy(false); }
  };

  const toggle = (id: string) => setChecked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const addSelected = () => {
    if (!questions || !current) return;
    const items = questions.filter(q => checked.has(q.examQuestionId)).map(q => ({
      question: q,
      source: { kind: "exam", sourceId: current.examId, sourceTitle: current.title } as ChallengeQuestionSource,
    }));
    if (items.length) onAdd(items);
  };

  return (
    <div className="eb-lc-import" role="dialog" aria-modal="true" aria-label="استيراد أسئلة من امتحان">
      <div className="eb-lc-import-panel">
        <div className="sb-row-between">
          <strong>استيراد من امتحان محفوظ</strong>
          <button type="button" className="eb-button is-quiet is-small" onClick={onCancel}>إغلاق</button>
        </div>
        {error && <div className="platform-error" role="alert">{error}</div>}

        {!current && (
          <div className="eb-lc-import-list">
            {exams === null && <p className="eb-muted" role="status">جارٍ تحميل الامتحانات…</p>}
            {exams !== null && exams.length === 0 && <p className="eb-muted">لا توجد امتحانات محفوظة بعد.</p>}
            {exams?.map(ex => (
              <button type="button" key={ex.blobName} className="eb-lc-import-exam" onClick={() => openExam(ex)}>
                <span className="eb-lc-import-exam-title">{ex.title || ex.examId}</span>
                {typeof ex.questionCount === "number" && <span className="eb-lc-import-exam-count" dir="ltr">{ex.questionCount} سؤال</span>}
              </button>
            ))}
          </div>
        )}

        {current && (
          <div className="eb-lc-import-questions">
            <div className="sb-row-between">
              <button type="button" className="eb-button is-quiet is-small" onClick={() => { setCurrent(null); setQuestions(null); }}>◄ الامتحانات</button>
              <span className="eb-muted">{current.title || current.examId}</span>
            </div>
            {busy && <p className="eb-muted" role="status">جارٍ التحميل…</p>}
            {questions !== null && questions.length === 0 && !busy && <p className="eb-muted">لا توجد أسئلة قابلة للاستيراد في هذا الامتحان.</p>}
            {questions?.map((q, i) => (
              <label className="eb-lc-import-q" key={q.examQuestionId}>
                <input type="checkbox" checked={checked.has(q.examQuestionId)} onChange={() => toggle(q.examQuestionId)} />
                <span className="eb-lc-import-q-type">{QUESTION_TYPE_LABELS[q.presentationType]}</span>
                <span className="eb-lc-import-q-text">{(q.text || "").slice(0, 80) || "سؤال " + (i + 1)}</span>
              </label>
            ))}
            {questions && questions.length > 0 && (
              <button type="button" className="eb-button is-primary" disabled={checked.size === 0} onClick={addSelected}>
                أضف المحدّد ({checked.size})
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
