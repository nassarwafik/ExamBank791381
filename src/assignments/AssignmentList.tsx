import { useState } from "react";
import ActionMenu from "../ui/ActionMenu";
import StatusBadge from "../ui/StatusBadge";
import EmptyState from "../ui/EmptyState";
import Dialog from "../ui/Dialog";
import { IconUpload, IconEyeOff, IconEdit, IconArchive, IconRestore, IconTrash } from "../icons";
import { STATUS_LABEL, type Item } from "./types";

export type AssignmentListProps = {
  items: Item[];                       // rows for the current view (already class-filtered / searched / archived-switched by AssignmentsPanel)
  showArchived: boolean;
  hasAnyInScope: boolean;              // false → "no assignments" empty state, true with no rows → "no matches"
  selectedId: string;
  busy: boolean;
  loading: boolean;
  onOpen: (item: Item, trigger: HTMLElement | null) => void;
  onPublish: (item: Item) => void;
  onUnpublish: (item: Item) => void;
  onEditAttempts: (item: Item) => void;
  onArchive: (item: Item) => void;
  onRestore: (item: Item) => void;
  onPurge: (item: Item) => void;
  onCreate: () => void;
  fmt: (value: string) => string;
};

export default function AssignmentList(p: AssignmentListProps) {
  let empty: React.ReactNode = null;
  if (!p.loading && p.items.length === 0) {
    if (p.showArchived) empty = <EmptyState compact title="لا توجد واجبات مؤرشفة." description="الواجبات المؤرشفة تحتفظ بكل التسليمات والنتائج ويمكن استعادتها في أي وقت." />;
    else if (!p.hasAnyInScope) empty = <EmptyState title="لا توجد واجبات بعد." description="أنشئ أول واجب من امتحان محفوظ أو من مكتبة 791381." action={<button type="button" className="eb-button is-primary is-small" onClick={p.onCreate}>إنشاء واجب</button>} />;
    else empty = <EmptyState compact title="لا توجد واجبات مطابقة." description="جرّب كلمة بحث أخرى أو غيّر مرشح الصف." />;
  }
  return (
    <section className="eb-assign-list" aria-labelledby="eb-assign-list-title">
      <h2 id="eb-assign-list-title" className="eb-visually-hidden">{p.showArchived ? "الواجبات المؤرشفة" : "الواجبات الحالية"}</h2>
      {p.loading && p.items.length === 0 && <div className="platform-loading" role="status">جارٍ تحميل الواجبات...</div>}
      <ul className="assignment-list eb-assign-rows">
        {p.items.map(item => {
          const selected = item.assignmentId === p.selectedId;
          const archived = item.status === "archived";
          return (
            <li key={item.assignmentId} className={"assignment-row eb-assign-row" + (selected ? " selected" : "") + (archived ? " archived" : "")}>
              <div className="eb-assign-row-main">
                <div className="eb-assign-row-title"><strong>{item.title}</strong><StatusBadge tone={item.status === "published" ? "success" : item.status === "archived" ? "neutral" : "warn"} className={"assignment-status " + item.status}>{STATUS_LABEL[item.status]}</StatusBadge></div>
                <span className="eb-assign-row-meta">{item.className}{item.className ? " · " : ""}{item.questionCount} سؤال · {item.totalMarks} علامة · {item.maxAttempts || 1} محاولة · {item.durationMinutes ? item.durationMinutes + " دقيقة" : "بدون مؤقت"}</span>
                <small className="eb-assign-row-due">التسليم: {p.fmt(item.dueAt)}{archived && item.archivedAt ? " · أُرشف: " + p.fmt(item.archivedAt) : ""}</small>
              </div>
              <div className="eb-assign-row-actions">
                <button type="button" className="eb-button is-small" aria-pressed={selected} onClick={e => p.onOpen(item, e.currentTarget)} disabled={p.busy}>فتح</button>
                <ActionMenu label={"إجراءات الواجب " + item.title}>
                  {archived ? <>
                    <button type="button" className="eb-menu-item" onClick={() => p.onRestore(item)} disabled={p.busy}><IconRestore size={16} />استعادة</button>
                    <hr className="eb-menu-sep" />
                    <button type="button" className="eb-menu-item is-danger assignment-delete-button" onClick={() => p.onPurge(item)} disabled={p.busy}><IconTrash size={16} />حذف نهائي</button>
                  </> : <>
                    {item.status !== "published"
                      ? <button type="button" className="eb-menu-item" onClick={() => p.onPublish(item)} disabled={p.busy}><IconUpload size={16} />نشر</button>
                      : <button type="button" className="eb-menu-item" onClick={() => p.onUnpublish(item)} disabled={p.busy}><IconEyeOff size={16} />إيقاف النشر</button>}
                    <button type="button" className="eb-menu-item" onClick={() => p.onEditAttempts(item)} disabled={p.busy}><IconEdit size={16} />تعديل عدد المحاولات</button>
                    <hr className="eb-menu-sep" />
                    <button type="button" className="eb-menu-item" onClick={() => p.onArchive(item)} disabled={p.busy}><IconArchive size={16} />أرشفة</button>
                  </>}
                </ActionMenu>
              </div>
            </li>
          );
        })}
      </ul>
      {empty}
    </section>
  );
}

/** Explicit max-attempts editor: cancel → no request, save → exactly one setMaxAttempts request (owned by AssignmentsPanel). */
export function MaxAttemptsDialog({ item, busy, onSave, onClose }: { item: Item | null; busy: boolean; onSave: (item: Item, maxAttempts: number) => void; onClose: () => void }) {
  return (
    <Dialog open={item !== null} title="تعديل عدد المحاولات" onClose={onClose} size="sm" hideClose>
      {item && <MaxAttemptsForm key={item.assignmentId} item={item} busy={busy} onSave={onSave} onClose={onClose} />}
    </Dialog>
  );
}
function MaxAttemptsForm({ item, busy, onSave, onClose }: { item: Item; busy: boolean; onSave: (item: Item, maxAttempts: number) => void; onClose: () => void }) {
  const [value, setValue] = useState(item.maxAttempts || 1);   // keyed by assignment → fresh per item
  return (
    <>
      <p className="eb-dialog-lead">الواجب: <strong>{item.title}</strong></p>
      <div className="eb-form-grid">
        <label>عدد المحاولات المسموح بها<select value={value} onChange={e => setValue(Number(e.target.value))}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} {n === 1 ? "محاولة" : "محاولات"}</option>)}</select></label>
      </div>
      <div className="eb-dialog-foot eb-dialog-foot-inline"><button type="button" className="eb-button" onClick={onClose}>إلغاء</button><button type="button" className="eb-button is-primary" onClick={() => onSave(item, value)} disabled={busy || value === (item.maxAttempts || 1)}>حفظ</button></div>
    </>
  );
}
