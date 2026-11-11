import { useDeferredValue, useId, useMemo, useState } from "react";
import type { StructuredExam } from "../examTypes";
import { editorQualityNotes } from "./qualityNotes";

// Phase 21W — «ملاحظات الجودة»: a collapsed, advisory list under the builder's issues (never part of them). Each note that names a
// question opens it in the builder; nothing here blocks saving or finalization. Computed from a deferred copy of the exam so typing
// never waits for it.
export default function QualityNotes({ exam, onOpenQuestion }: { exam: StructuredExam; onOpenQuestion: (questionId: string) => void }) {
  const deferred = useDeferredValue(exam);
  const notes = useMemo(() => editorQualityNotes(deferred), [deferred]);
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (!notes.length) return null;
  return (
    <div className="sb-issues sb-quality-notes" data-testid="builder-quality-notes">
      <button type="button" className="sb-issues-head" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(v => !v)}>
        ملاحظات الجودة ({notes.length}) <em className="sb-quality-hint">— استرشادية، لا تمنع الحفظ ولا الاعتماد</em>
      </button>
      {open && (
        <ul className="sb-issues-list" id={listId} aria-label="ملاحظات الجودة">
          {notes.map(note => {
            const what = <><span className="sb-issue-kind">ملاحظة:</span> <span className="sb-issue-text">{note.message}</span></>;
            return (
              <li key={note.key} className="sb-quality-note" data-quality-code={note.code}>
                {note.questionId
                  ? <button type="button" className="sb-issue-link" onClick={() => onOpenQuestion(note.questionId!)}>{what}{" — "}<span className="sb-issue-target">السؤال {note.number}</span></button>
                  : what}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
