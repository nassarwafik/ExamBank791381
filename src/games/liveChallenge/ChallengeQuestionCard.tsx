import { useState } from "react";
import type { BuilderQuestion } from "../../examTypes";
import QuestionComposer from "../../QuestionComposer";
import { CHALLENGE_SOURCE_LABELS, type ChallengeQuestion } from "../domain/challenge";

/**
 * Challenge-ONLY chrome around one authored question: a position badge, a source tag, and the row actions (preview,
 * move up/down, duplicate, delete). The actual question CONTENT is delegated to the SHARED QuestionComposer — the same
 * component the Structured Exam Builder uses — so there is no second question editor. This host deliberately omits the
 * exam-only chrome (display number, marks, shared stimulus/group, move-to-section): those have no role in a challenge.
 */
export default function ChallengeQuestionCard({ entry, index, total, onChange, onMove, onDuplicate, onDelete, onPreview, disabled }: {
  entry: ChallengeQuestion;
  index: number;
  total: number;
  onChange: (patch: Partial<BuilderQuestion>) => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPreview: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="sb-question eb-lcq" data-source={entry.source.kind}>
      <div className="sb-q-head">
        <button type="button" className="sb-collapse" onClick={() => setOpen(o => !o)} title={open ? "طيّ" : "فتح"}>{open ? "▾" : "▸"}</button>
        <span className="sb-q-badge">{index + 1}</span>
        <span className="eb-lcq-source">{CHALLENGE_SOURCE_LABELS[entry.source.kind]}</span>
        <span className="sb-spacer" />
        <button type="button" className="sb-icon-btn" title="معاينة الطالب" onClick={onPreview} disabled={disabled}>👁</button>
        <button type="button" className="sb-icon-btn" title="أعلى" onClick={() => onMove(-1)} disabled={disabled || index === 0}>↑</button>
        <button type="button" className="sb-icon-btn" title="أسفل" onClick={() => onMove(1)} disabled={disabled || index === total - 1}>↓</button>
        <button type="button" className="sb-icon-btn" title="تكرار" onClick={onDuplicate} disabled={disabled}>⧉</button>
        <button type="button" className="sb-icon-btn sb-danger" title="حذف" onClick={onDelete} disabled={disabled}>×</button>
      </div>
      {open && (
        <div className="sb-q-body">
          <QuestionComposer question={entry.question} onChange={onChange} disabled={disabled} />
        </div>
      )}
    </div>
  );
}
