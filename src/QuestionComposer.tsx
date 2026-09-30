
import type { BuilderQuestion, BuilderQuestionType } from "./examTypes";
import { typeChangePatch, typeSpecificContentPresent } from "./questionTypes/typeContent";
import { isKnownQuestionType, questionTypeLabel, listQuestionTypes } from "./questionTypeCatalog";
import { useConfirm } from "./ui/useConfirm";
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
  // Phase 16A §24 — changing the type is destructive to the type-specific body. When the question carries meaningful authored
  // content the change goes through the shared ConfirmDialog authority (never window.confirm); a fresh default question
  // changes silently. changeQuestionType (canonical) carries identity / prompt / marks / number / group / meta / media and
  // resets ONLY the body, initialising the new type at its current version.
  const { confirm, confirmDialog } = useConfirm();
  const currentKnown = isKnownQuestionType(q.presentationType);
  const requestTypeChange = async (next: BuilderQuestionType) => {
    if (next === q.presentationType) return;
    if (typeSpecificContentPresent(q as unknown as Record<string, unknown>)) {
      const ok = await confirm({ title: "تغيير نوع السؤال", message: "تغيير النوع إلى «" + (questionTypeLabel(next) ?? next) + "» سيحذف الخيارات / الحقول / مفتاح الإجابة الخاصة بالنوع الحالي.\nسيبقى نص السؤال والعلامة والرقم والتصنيف والصورة.", confirmLabel: "تغيير النوع", cancelLabel: "إلغاء", tone: "danger" });
      if (!ok) return;
    }
    onChange(typeChangePatch(q, next));
  };
  return (
    <div className="sb-composer">
      <div className="sb-composer-type">
        <select
          className="sb-input sb-input-sm"
          value={q.presentationType}
          onChange={e => { void requestTypeChange(e.target.value as BuilderQuestionType); }}
          disabled={disabled}
          aria-label="نوع السؤال"
        >
          {!currentKnown && <option value={q.presentationType}>{"غير مدعوم: " + String(q.presentationType)}</option>}
          {/* Review Fix 1 / R2-B: the LIVE canonical catalog (production types + registered plugins), never a frozen snapshot */}
          {listQuestionTypes().map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
      </div>
      {confirmDialog}

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
