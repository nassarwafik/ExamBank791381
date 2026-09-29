import { useState } from "react";
import { isValidQuestionMarks } from "./structuredExamProductivity";

// Phase 13B — the bulk action bar shown while at least one question is selected. Every action is ONE exam mutation
// (one undo step) performed by the owner; this component only validates the inputs and guards the pending-media and
// saving states. Destructive confirmation is the owner's (project ConfirmDialog), never window.confirm.

export const MEDIA_WAIT_SELECTED = "انتظر انتهاء معالجة الصور للأسئلة المحددة.";
export const MARKS_INVALID = "العلامة يجب أن تكون رقمًا أكبر من صفر.";
type Props = {
  count: number;
  sections: { id: string; title: string }[];
  /** A selected question has a pending image / upload operation: move / delete / duplicate are blocked. */
  mediaPending: boolean;
  disabled?: boolean;
  onMove: (targetSectionId: string) => void;
  onDuplicate: () => void;
  onSetMarks: (marks: number) => void;
  onDelete: () => void;
  onClear: () => void;
  /** Phase 13C-B — opens the owner's bulk pedagogical classification dialog (one undoable step). */
  onClassify?: () => void;
};

export default function BulkActionBar({ count, sections, mediaPending, disabled, onMove, onDuplicate, onSetMarks, onDelete, onClear, onClassify }: Props) {
  const [target, setTarget] = useState("");
  const [marks, setMarks] = useState("");
  const [marksError, setMarksError] = useState("");
  const blocked = disabled || mediaPending;
  const applyMarks = () => {
    const value = marks.trim() === "" ? NaN : Number(marks);
    if (!isValidQuestionMarks(value)) { setMarksError(MARKS_INVALID); return; }
    setMarksError("");
    onSetMarks(value);
  };
  const targetValid = sections.some(s => s.id === target);
  return (
    <div className="sb-bulk-bar" role="region" aria-label="إجراءات الأسئلة المحددة">
      <span className="sb-stat sb-bulk-count" role="status" aria-live="polite">{count} أسئلة محددة</span>
      <div className="sb-bulk-group">
        <select className="sb-input sb-input-sm" aria-label="القسم الهدف" value={target} onChange={e => setTarget(e.target.value)} disabled={blocked}>
          <option value="">اختر القسم…</option>
          {sections.map(s => <option key={s.id} value={s.id}>{s.title || "قسم"}</option>)}
        </select>
        <button type="button" className="sb-btn sb-btn-sm" onClick={() => targetValid && onMove(target)} disabled={blocked || !targetValid} title={mediaPending ? MEDIA_WAIT_SELECTED : undefined}>نقل إلى قسم</button>
      </div>
      <button type="button" className="sb-btn sb-btn-sm" onClick={onDuplicate} disabled={blocked} title={mediaPending ? MEDIA_WAIT_SELECTED : undefined}>تكرار</button>
      <div className="sb-bulk-group">
        <input className="sb-input sb-input-xs" type="number" step="0.25" min="0.25" aria-label="العلامة الجديدة" placeholder="العلامة" value={marks} onChange={e => { setMarks(e.target.value); if (marksError) setMarksError(""); }} disabled={disabled} />
        <button type="button" className="sb-btn sb-btn-sm" onClick={applyMarks} disabled={disabled}>تعيين العلامة</button>
      </div>
      {onClassify && <button type="button" className="sb-btn sb-btn-sm" onClick={onClassify} disabled={disabled}>تصنيف المحدد</button>}
      <button type="button" className="sb-btn sb-btn-sm sb-btn-danger" onClick={onDelete} disabled={blocked} title={mediaPending ? MEDIA_WAIT_SELECTED : undefined}>حذف</button>
      <button type="button" className="sb-btn sb-btn-sm" onClick={onClear} disabled={disabled}>إلغاء التحديد</button>
      {mediaPending && <span className="sb-bulk-wait">{MEDIA_WAIT_SELECTED}</span>}
      {marksError && <p className="sb-bulk-error" role="alert">{marksError}</p>}
    </div>
  );
}
