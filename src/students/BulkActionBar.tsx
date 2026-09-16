import { IconKey, IconTrash, IconArchive, IconRestore } from "../icons";
import type { BulkOperation, Classroom } from "./types";

/**
 * BulkActionBar — shown only while students are selected. Groups the seven operations (status,
 * archive, move, credentials) and keeps the destructive delete visibly apart. Operation values and the
 * target-class guard are exactly those TeacherPlatform.runBulkAction expects.
 */
export default function BulkActionBar({ count, busy, targetClasses, targetClassId, onTargetChange, onAction, onClear }: {
  count: number; busy: boolean; targetClasses: Classroom[]; targetClassId: string;
  onTargetChange: (classId: string) => void; onAction: (operation: BulkOperation) => void; onClear: () => void;
}) {
  return (
    <section className="student-bulk-bar eb-bulk-bar" aria-label="إجراءات جماعية">
      <div className="eb-bulk-summary"><strong>{count} طالب محدد</strong><button type="button" className="eb-link-button" onClick={onClear}>إلغاء التحديد</button></div>
      <div className="eb-bulk-groups">
        <div className="eb-bulk-group" role="group" aria-label="الحالة">
          <span className="eb-bulk-group-label">الحالة</span>
          <button type="button" className="eb-button is-small" onClick={() => onAction("activate")} disabled={busy}>تفعيل</button>
          <button type="button" className="eb-button is-small" onClick={() => onAction("deactivate")} disabled={busy}>تعطيل</button>
        </div>
        <div className="eb-bulk-group" role="group" aria-label="الأرشفة">
          <span className="eb-bulk-group-label">الأرشفة</span>
          <button type="button" className="eb-button is-small" onClick={() => onAction("archive")} disabled={busy}><IconArchive size={14} />أرشفة</button>
          <button type="button" className="eb-button is-small" onClick={() => onAction("unarchive")} disabled={busy}><IconRestore size={14} />استعادة</button>
        </div>
        <div className="eb-bulk-group" role="group" aria-label="النقل">
          <label className="eb-bulk-group-label" htmlFor="eb-bulk-target">النقل إلى</label>
          <select id="eb-bulk-target" value={targetClassId} onChange={e => onTargetChange(e.target.value)}>
            <option value="">اختر صفًا للنقل</option>
            {targetClasses.map(c => <option key={c.classId} value={c.classId}>{c.name}</option>)}
          </select>
          <button type="button" className="eb-button is-small" onClick={() => onAction("move")} disabled={busy || !targetClassId}>نقل</button>
        </div>
        <div className="eb-bulk-group" role="group" aria-label="بيانات الدخول">
          <span className="eb-bulk-group-label">بيانات الدخول</span>
          <button type="button" className="eb-button is-small" onClick={() => onAction("resetpasswords")} disabled={busy}><IconKey size={14} />كلمات مرور جديدة</button>
        </div>
      </div>
      <div className="student-bulk-danger eb-bulk-danger">
        <button type="button" className="eb-button is-danger is-small" onClick={() => onAction("delete")} disabled={busy}><IconTrash size={14} />حذف نهائي</button>
      </div>
    </section>
  );
}
