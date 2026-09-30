import { useId, useRef, useState } from "react";
import Dialog from "../ui/Dialog";
import { NOTE_MAX_LENGTH, NOTE_REQUIRED_ACTIONS, WORKFLOW_ACTION_LABEL, type WorkflowAction } from "../examGovernance";

// Phase 14B Parts E–G / §24 — ONE decision dialog for every workflow action that may carry a note. The note is plain text
// (rendered as text only, never HTML), bounded to NOTE_MAX_LENGTH, REQUIRED for the negative decisions (request changes,
// reject approval, reject publication) and optional for complete-review / withdraw. The server re-validates the note; this
// dialog is convenience. Real form label, focus trap and focus restoration come from the shared Dialog primitive.
type Props = {
  action: WorkflowAction | "approve";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => void;
  /** Extra context shown above the field (e.g. the revision number). */
  context?: string;
};
const TITLE: Record<WorkflowAction | "approve", string> = { ...WORKFLOW_ACTION_LABEL, approve: "اعتماد" };
const HINT: Record<WorkflowAction | "approve", string> = {
  "complete-review": "تُسجَّل ملاحظتك (اختيارية) في سجل قرارات غير قابل للتغيير، وتنتقل المهمة إلى المعتمد المعيَّن.",
  "request-changes": "اكتب سبب طلب التعديلات. يعود الامتحان إلى المسودة، وتظهر ملاحظتك للمؤلف، ويستلزم أي تعديل دورة مراجعة جديدة.",
  "reject-approval": "اكتب سبب رفض الاعتماد. يعود الامتحان إلى المسودة مع ملاحظتك؛ لا يبقى أي اعتماد جزئي.",
  "reject-publication": "اكتب سبب إعادة الإصدار قبل النشر. يعود الامتحان إلى المسودة مع ملاحظتك؛ النسخة المنشورة السابقة (إن وجدت) لا تتغير.",
  "withdraw-review": "يمكنك بيان سبب السحب (اختياري). يعود الامتحان إلى المسودة وتُغلق مهمة المراجع.",
  approve: "ملاحظة اعتماد اختيارية تُحفظ في سجل القرارات."
};

export default function DecisionNoteDialog({ action, busy = false, onCancel, onConfirm, context }: Props) {
  const [note, setNote] = useState("");
  const required = (NOTE_REQUIRED_ACTIONS as readonly string[]).includes(action);
  const trimmed = note.trim();
  const tooLong = trimmed.length > NOTE_MAX_LENGTH;
  const missing = required && !trimmed;
  const id = useId();
  const fieldId = "gov-note-" + id.replace(/[^a-zA-Z0-9_-]/g, "");
  const ref = useRef<HTMLTextAreaElement>(null);
  const danger = action === "request-changes" || action === "reject-approval" || action === "reject-publication";
  const submit = () => { if (busy || missing || tooLong) return; onConfirm(note); };
  return (
    <Dialog open onClose={onCancel} size="md" title={TITLE[action]} tone={danger ? "danger" : "default"} className="sb-gov-decision" initialFocusRef={ref}
      footer={<>
        <button type="button" className="sb-btn" onClick={onCancel} disabled={busy}>إلغاء</button>
        <button type="button" className={"sb-btn " + (danger ? "sb-btn-danger" : "sb-btn-primary")} onClick={submit} disabled={busy || missing || tooLong} data-testid="decision-confirm">{busy ? "جارٍ التنفيذ…" : TITLE[action]}</button>
      </>}>
      <form className="sb-gov-decision-form" onSubmit={e => { e.preventDefault(); submit(); }}>
        {context && <p className="sb-hint">{context}</p>}
        <p className="sb-hint" id={fieldId + "-hint"}>{HINT[action]}</p>
        <label className="sb-field" htmlFor={fieldId}>
          <span>{required ? "الملاحظة (مطلوبة)" : "ملاحظة (اختيارية)"}</span>
          <textarea id={fieldId} ref={ref} className="sb-input sb-gov-note" rows={5} value={note} onChange={e => setNote(e.target.value)} maxLength={NOTE_MAX_LENGTH + 100}
            aria-describedby={fieldId + "-hint " + fieldId + "-count"} aria-required={required} aria-invalid={missing || tooLong ? true : undefined} disabled={busy} />
        </label>
        <p className={"sb-hint sb-gov-note-count" + (tooLong ? " is-error" : "")} id={fieldId + "-count"} aria-live="polite">{trimmed.length} / {NOTE_MAX_LENGTH}{tooLong ? " — الملاحظة أطول من الحد المسموح." : missing ? " — هذا القرار يستلزم ملاحظة مكتوبة." : ""}</p>
      </form>
    </Dialog>
  );
}
