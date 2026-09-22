
import type { BuilderQuestion, BuilderQuestionType } from "./examTypes";
import { QUESTION_TYPE_LABELS, BUILDER_QUESTION_TYPES } from "./examTypes";
import { changeQuestionType } from "./examBuilderState";
import QuestionBodyEditor from "./QuestionBodyEditor";
import CompoundQuestionEditor from "./CompoundQuestionEditor";

// The SHARED question-authoring core: everything about editing a question's CONTENT and nothing about where it lives.
// It owns the type selector, the question prompt, and the type-specific body (delegating to QuestionBodyEditor, or to
// CompoundQuestionEditor for a compound question's independent parts). It edits the canonical BuilderQuestion in place
// through onChange(patch) — no second question model and no transform layer — so the Structured Exam Builder today and
// the Live Challenge composer later drive the SAME editors over the SAME shapes. Exam-specific chrome (display number,
// marks, stimulus/section, move/duplicate/delete, preview) is NOT here; it stays with the host (StructuredQuestionEditor).
// Type changes go through the canonical changeQuestionType helper — the reset/default logic is never reimplemented here.

type Props = {
  question: BuilderQuestion;
  onChange: (patch: Partial<BuilderQuestion>) => void;
  disabled?: boolean;
};

export default function QuestionComposer({ question: q, onChange, disabled }: Props) {
  return (
    <div className="sb-composer">
      <div className="sb-composer-type">
        <select
          className="sb-input sb-input-sm"
          value={q.presentationType}
          onChange={e => onChange(changeQuestionType(q, e.target.value as BuilderQuestionType))}
          disabled={disabled}
          aria-label="نوع السؤال"
        >
          {BUILDER_QUESTION_TYPES.map(t => <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>)}
        </select>
      </div>

      <textarea
        className="sb-input sb-textarea"
        value={q.text ?? ""}
        placeholder={q.presentationType === "compound" ? "نص السؤال المركّب (اختياري)" : "نص السؤال"}
        onChange={e => onChange({ text: e.target.value })}
        disabled={disabled}
      />

      {q.presentationType === "compound"
        ? <CompoundQuestionEditor question={q} onChange={onChange} disabled={disabled} />
        : <QuestionBodyEditor node={q} type={q.presentationType} onChange={onChange} disabled={disabled} />}
    </div>
  );
}
