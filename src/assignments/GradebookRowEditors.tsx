import Dialog from "../ui/Dialog";
import type { Item, StudentResult } from "./types";

/* Small labelled Dialogs replacing the old inline <tr colSpan> editors. Values, validation and requests are
   owned by AssignmentsPanel; these components only lay the fields out. */

type EditorBase = { student: StudentResult | null; assignment: Item | null; busy: boolean; value: string; onValue: (v: string) => void; onClose: () => void; fmt: (value: string) => string };

export function DeadlineDialog(p: EditorBase & { onSave: (s: StudentResult) => void; onClear: (s: StudentResult) => void }) {
  const s = p.student;
  return (
    <Dialog open={!!s && !!p.assignment} title="تمديد الموعد" onClose={p.onClose} size="sm" className="deadline-edit-dialog"
      footer={<><button type="button" className="eb-button" onClick={p.onClose}>إغلاق</button>{s?.dueAtOverride && <button type="button" className="eb-button" onClick={() => s && p.onClear(s)} disabled={p.busy}>إلغاء التمديد</button>}<button type="button" className="eb-button is-primary" onClick={() => s && p.onSave(s)} disabled={p.busy || !p.value}>حفظ التمديد</button></>}>
      {s && p.assignment && <>
        <p className="eb-dialog-lead">الطالب: <strong>{s.studentName}</strong></p>
        <dl className="eb-dl">
          <div><dt>الموعد الأصلي</dt><dd>{p.fmt(p.assignment.dueAt)}</dd></div>
          {s.dueAtOverride && <div><dt>التمديد الحالي</dt><dd>{p.fmt(s.dueAtOverride)}</dd></div>}
        </dl>
        <div className="eb-form-grid"><label>الموعد الجديد<input type="datetime-local" value={p.value} onChange={e => p.onValue(e.target.value)} /></label></div>
      </>}
    </Dialog>
  );
}

export function ReopenDialog(p: EditorBase & { onSave: (s: StudentResult) => void }) {
  const s = p.student;
  return (
    <Dialog open={!!s && !!p.assignment} title="إعادة فتح للطالب" onClose={p.onClose} size="sm" className="reopen-edit-dialog"
      footer={<><button type="button" className="eb-button" onClick={p.onClose}>إغلاق</button><button type="button" className="eb-button is-primary" onClick={() => s && p.onSave(s)} disabled={p.busy}>حفظ إعادة الفتح</button></>}>
      {s && <>
        <p className="eb-dialog-lead">الطالب: <strong>{s.studentName}</strong></p>
        <div className="eb-form-grid"><label>إعادة الفتح حتى (اختياري)<input type="datetime-local" value={p.value} onChange={e => p.onValue(e.target.value)} /></label></div>
        <p className="eb-muted reopen-hint">تُتاح محاولة واحدة إذا لزم · لا تُحذف النتيجة السابقة · لا تبدأ المحاولة الآن</p>
      </>}
    </Dialog>
  );
}

export function ExtendDialog(p: EditorBase & { willClip: boolean; onSave: (s: StudentResult) => void }) {
  const s = p.student;
  return (
    <Dialog open={!!s && !!p.assignment} title="تمديد وقت المحاولة" onClose={p.onClose} size="sm" className="extend-edit-dialog"
      footer={<><button type="button" className="eb-button" onClick={p.onClose}>إغلاق</button><button type="button" className="eb-button is-primary" onClick={() => s && p.onSave(s)} disabled={p.busy || !p.value}>حفظ التمديد</button></>}>
      {s && <>
        <p className="eb-dialog-lead">الطالب: <strong>{s.studentName}</strong></p>
        <dl className="eb-dl">
          <div><dt>البداية</dt><dd>{p.fmt(s.activeAttempt?.startedAt || "")}</dd></div>
          <div><dt>النهاية الأصلية</dt><dd>{p.fmt(s.activeAttempt?.endsAt || "")}</dd></div>
          {s.activeAttempt?.extendedEndsAt && <div><dt>التمديد الحالي</dt><dd>{p.fmt(s.activeAttempt.extendedEndsAt)}</dd></div>}
          <div><dt>النهاية الفعلية الحالية</dt><dd>{p.fmt(s.effectiveAttemptEndsAt || "")}</dd></div>
        </dl>
        <div className="eb-form-grid"><label>النهاية الجديدة<input type="datetime-local" value={p.value} onChange={e => p.onValue(e.target.value)} /></label></div>
        {p.willClip && <p className="platform-warning extend-clip-warning" role="status">ملاحظة: موعد تسليم الطالب الحالي سيوقف المحاولة قبل هذا الوقت. مدّد موعد التسليم أيضًا إذا أردت إعطاء الوقت كاملًا.</p>}
      </>}
    </Dialog>
  );
}

/** Permanent purge: danger Dialog with the typed-title guard (impact gating happens before it opens, in AssignmentsPanel). */
export function PurgeDialog({ item, title, onTitle, busy, onConfirm, onClose }: { item: Item | null; title: string; onTitle: (v: string) => void; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog open={item !== null} title="حذف نهائي" onClose={onClose} size="sm" tone="danger" className="purge-modal"
      footer={<><button type="button" className="eb-button" onClick={onClose} disabled={busy}>إلغاء</button><button type="button" className="eb-button is-danger assignment-delete-button" onClick={onConfirm} disabled={busy || !item || title !== item.title}>حذف نهائي</button></>}>
      {item && <>
        <div className="platform-error" role="alert">هذا حذف نهائي ولا يمكن التراجع عنه.</div>
        <p className="eb-dialog-lead">لتأكيد حذف الواجب «{item.title}» نهائيًا، اكتب عنوان الواجب بالضبط:</p>
        <div className="eb-form-grid"><label>عنوان الواجب<input className="purge-title-input" value={title} onChange={e => onTitle(e.target.value)} placeholder={item.title} autoComplete="off" /></label></div>
      </>}
    </Dialog>
  );
}
