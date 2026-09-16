import type { ReactNode } from "react";
import SectionHeader from "../ui/SectionHeader";
import StatCard from "../ui/StatCard";
import StatusBadge from "../ui/StatusBadge";
import EmptyState from "../ui/EmptyState";
import VisuallyHidden from "../ui/VisuallyHidden";
import ActionMenu from "./ActionMenu";
import BulkActionBar from "./BulkActionBar";
import { IconSearch, IconDownload, IconUpload, IconPlus, IconRefresh, IconUser, IconEdit, IconCopy, IconTrash, IconArchive, IconRestore, IconHistory, IconHeart, IconSort, IconChevronDown, IconClose, IconChevronUp } from "../icons";
import { type CredentialBatch } from "../credentialBatch";
import type { BulkError, BulkOperation, Classroom, Credential, SortKey, StatusFilter, Student } from "./types";

export type RosterPaneProps = {
  classroom: Classroom | null;
  classActive: boolean;
  students: Student[];
  visibleStudents: Student[];
  stats: { total: number; active: number; disabled: number; archived: number; neverLogged: number };
  loading: boolean;
  busy: boolean;
  searchText: string; onSearch: (v: string) => void;
  statusFilter: StatusFilter; onStatusFilter: (v: StatusFilter) => void;
  sortKey: SortKey; sortAsc: boolean; onSort: (key: SortKey) => void;
  selectedIds: string[]; onToggleSelected: (id: string) => void; onToggleSelectVisible: () => void; onClearSelection: () => void;
  onAddStudent: () => void; onImport: () => void; onRefresh: () => void; onExportCsv: () => void;
  onOpenProfile: (student: Student) => void; onOpenHistory: (student: Student) => void; onEdit: (student: Student) => void;
  onCopyIdentity: (student: Student) => void; onToggleActive: (student: Student) => void; onArchive: (student: Student) => void; onDelete: (student: Student) => void;
  bulk: { targetClasses: Classroom[]; targetClassId: string; onTargetChange: (id: string) => void; onAction: (operation: BulkOperation) => void };
  credentialBox: { name: string; identityNumber: string; password: string } | null;
  onCopyCredentialBox: () => void; onHideCredentialBox: () => void;
  credentialBatch: CredentialBatch | null;   // already filtered to the selected class by TeacherPlatform
  onToggleBatch: () => void; onDownloadBatch: () => void; onDiscardBatch: () => void; onCopyCredential: (credential: Credential) => void;
  bulkErrors: BulkError[];
  statusLabel: (student: Student) => string;
  fmtDate: (value: string) => string;
  splitName: (value: unknown) => { firstName: string; familyName: string };
};

const SORT_COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "firstName", label: "الاسم" }, { key: "familyName", label: "اسم العائلة" }, { key: "identityNumber", label: "رقم الهوية" }, { key: "status", label: "الحالة" }
];

export default function RosterPane(p: RosterPaneProps) {
  const { classroom } = p;
  if (!classroom) {
    return (
      <section className="eb-roster-pane" aria-labelledby="eb-roster-title">
        <SectionHeader level={2} id="eb-roster-title" title="الطلاب" />
        <EmptyState title="اختر صفًا لإدارة طلابه" description="أنشئ صفًا أو اختر صفًا من القائمة لعرض قائمة الطلاب وإدارتها." />
      </section>
    );
  }
  const allVisibleSelected = p.visibleStudents.length > 0 && p.visibleStudents.every(s => p.selectedIds.includes(s.userId));
  const sortTh = (key: SortKey, label: string) => (
    <th key={key} scope="col" aria-sort={p.sortKey === key ? (p.sortAsc ? "ascending" : "descending") : undefined}>
      <button type="button" className={"eb-th-sort" + (p.sortKey === key ? " is-active" : "")} onClick={() => p.onSort(key)}>{label}<IconSort size={14} aria-hidden="true" />{p.sortKey === key && <VisuallyHidden>{p.sortAsc ? "، مرتّب تصاعديًا" : "، مرتّب تنازليًا"}</VisuallyHidden>}</button>
    </th>
  );
  const statusTone = (s: Student) => s.archived ? "neutral" : s.active ? "success" : "warn";
  let tableBody: ReactNode;
  if (p.loading && p.students.length === 0) tableBody = <div className="platform-loading" role="status">جارٍ تحميل الطلاب...</div>;
  else if (!p.loading && p.students.length === 0) tableBody = <EmptyState title="لا يوجد طلاب في هذا الصف بعد." description="أضف طالبًا واحدًا أو استورد قائمة كاملة من ملف." action={p.classActive ? <button type="button" className="eb-button is-primary is-small" onClick={p.onAddStudent}><IconPlus size={16} />إضافة طالب</button> : undefined} />;
  else if (p.visibleStudents.length === 0) tableBody = <EmptyState compact title="لا توجد نتائج مطابقة." description="جرّب كلمة بحث أخرى أو غيّر مرشح الحالة." />;

  return (
    <section className="eb-roster-pane" aria-labelledby="eb-roster-title">
      <SectionHeader
        level={2}
        id="eb-roster-title"
        title={classroom.name}
        description={<><span className="student-count-badge">{p.students.length}</span> طالب · {classroom.grade || "—"}{classroom.schoolYear ? " · " + classroom.schoolYear : ""} · <StatusBadge tone={p.classActive ? "success" : "neutral"}>{p.classActive ? "فعّال" : "مؤرشف"}</StatusBadge></>}
        actions={<>
          <button type="button" className="eb-button is-primary" onClick={p.onAddStudent} disabled={p.busy || !p.classActive}><IconPlus size={16} />إضافة طالب</button>
          <button type="button" className="eb-button" onClick={p.onImport} disabled={p.busy || !p.classActive}><IconUpload size={16} />استيراد</button>
          <ActionMenu label="المزيد من إجراءات الصف">
            <button type="button" className="eb-menu-item" onClick={p.onRefresh} disabled={p.loading}><IconRefresh size={16} />تحديث</button>
            <button type="button" className="eb-menu-item" onClick={p.onExportCsv}><IconDownload size={16} />تصدير CSV</button>
          </ActionMenu>
        </>}
      />

      {p.credentialBox && (
        <section className="credential-box eb-credential-box" aria-label="بيانات دخول جديدة">
          <h3 className="eb-subheading">بيانات دخول جديدة · {p.credentialBox.name}</h3>
          <div className="credential-values">
            <div><span>رقم الهوية / الدخول</span><strong dir="ltr">{p.credentialBox.identityNumber}</strong></div>
            <div><span>كلمة المرور</span><strong dir="ltr">{p.credentialBox.password}</strong></div>
          </div>
          <div className="eb-inline-actions">
            <button type="button" className="eb-button is-small" onClick={p.onCopyCredentialBox}><IconCopy size={14} />نسخ بيانات الدخول</button>
            <button type="button" className="eb-button is-small" onClick={p.onHideCredentialBox}>إخفاء</button>
          </div>
        </section>
      )}

      <div className="student-admin-stats eb-roster-stats">
        <StatCard label="إجمالي" value={p.stats.total} />
        <StatCard label="فعّال" value={p.stats.active} tone="success" />
        <StatCard label="معطّل" value={p.stats.disabled} tone="attention" />
        <StatCard label="مؤرشف" value={p.stats.archived} />
        <StatCard label="لم يدخلوا بعد" value={p.stats.neverLogged} tone="info" />
      </div>

      <div className="eb-roster-toolbar">
        <div className="student-search-field eb-search-field">
          <IconSearch size={16} aria-hidden="true" />
          <input value={p.searchText} onChange={e => p.onSearch(e.target.value)} placeholder="ابحث بالاسم، العائلة أو رقم الهوية" aria-label="ابحث بالاسم، العائلة أو رقم الهوية" />
        </div>
        <label className="eb-field-inline">الحالة<select className="student-status-select" value={p.statusFilter} onChange={e => p.onStatusFilter(e.target.value as StatusFilter)}>
          <option value="all">كل الحالات</option><option value="active">فعّال</option><option value="disabled">معطّل</option><option value="archived">مؤرشف</option>
        </select></label>
      </div>

      {!p.classActive && <div className="platform-warning" role="status">الصف مؤرشف؛ فعّله قبل إضافة أو استعادة الطلاب.</div>}

      {p.selectedIds.length > 0 && <BulkActionBar count={p.selectedIds.length} busy={p.busy} targetClasses={p.bulk.targetClasses} targetClassId={p.bulk.targetClassId} onTargetChange={p.bulk.onTargetChange} onAction={p.bulk.onAction} onClear={p.onClearSelection} />}

      {p.credentialBatch && (
        <section className="credential-box eb-credential-box" aria-label="بيانات الدخول الجديدة">
          <div className="eb-credential-head">
            <div><h3 className="eb-subheading">بيانات الدخول الجديدة</h3><p className="eb-muted">{p.credentialBatch.credentials.length} طالبًا · احفظ هذه البيانات الآن؛ كلمات المرور لا تُعرض لاحقًا كنص واضح.</p></div>
            <div className="eb-inline-actions">
              <button type="button" className="eb-button is-small" onClick={p.onToggleBatch} aria-expanded={!p.credentialBatch.collapsed}>{p.credentialBatch.collapsed ? <><IconChevronDown size={14} />إظهار</> : <><IconChevronUp size={14} />طي</>}</button>
              <button type="button" className="eb-button is-small" onClick={p.onDownloadBatch}><IconDownload size={14} />تنزيل JSON</button>
              <button type="button" className="eb-button is-small" onClick={p.onDiscardBatch}><IconClose size={14} />إغلاق</button>
            </div>
          </div>
          {!p.credentialBatch.collapsed && (
            <div className="students-table-wrap"><table className="students-table">
              <thead><tr><th scope="col">الاسم</th><th scope="col">العائلة</th><th scope="col">رقم الهوية</th><th scope="col">كلمة المرور</th><th scope="col"><VisuallyHidden>نسخ</VisuallyHidden></th></tr></thead>
              <tbody>{p.credentialBatch.credentials.map((c, i) => <tr key={(c.userId || c.code) + i}><td>{c.firstName}</td><td>{c.familyName}</td><td dir="ltr">{c.identityNumber || c.code}</td><td dir="ltr"><strong>{c.password}</strong></td>
                <td><button type="button" className="eb-button is-small" onClick={() => p.onCopyCredential(c)}><IconCopy size={14} />نسخ</button></td></tr>)}</tbody>
            </table></div>
          )}
        </section>
      )}

      {p.bulkErrors.length > 0 && <div className="platform-warning" role="alert"><strong>عمليات لم تكتمل:</strong>{p.bulkErrors.map((x, i) => <div key={x.userId || i}>{x.displayName || x.userId || "السطر " + ((x.index ?? i) + 1)}: {x.error}</div>)}</div>}

      {p.visibleStudents.length > 0 && (
        <div className="students-table-wrap eb-roster-table-wrap"><table className="students-table students-table-pro eb-roster-table">
          <thead><tr>
            <th scope="col" className="eb-col-select"><input type="checkbox" checked={allVisibleSelected} onChange={p.onToggleSelectVisible} aria-label="تحديد الكل" /></th>
            {SORT_COLUMNS.map(c => sortTh(c.key, c.label))}
            <th scope="col">آخر دخول</th><th scope="col">الوظائف</th><th scope="col" className="eb-col-actions"><VisuallyHidden>الإجراءات</VisuallyHidden></th>
          </tr></thead>
          <tbody>{p.visibleStudents.map(student => <tr key={student.userId} className={student.archived ? "student-row-archived" : ""}>
            <td className="eb-col-select"><input type="checkbox" checked={p.selectedIds.includes(student.userId)} onChange={() => p.onToggleSelected(student.userId)} aria-label={"تحديد " + student.displayName} /></td>
            <td><strong>{student.firstName || p.splitName(student.displayName).firstName}</strong>{student.likesCount > 0 && <span className="student-likes-badge" title={student.likesCount + " ردّ فعل على إنجازاته"}><IconHeart size={12} aria-hidden="true" /> {student.likesCount}<VisuallyHidden> ردود فعل على إنجازاته</VisuallyHidden></span>}</td>
            <td>{student.familyName || p.splitName(student.displayName).familyName || "—"}</td>
            <td dir="ltr">{student.identityNumber || student.code || "يحتاج تحديث"}</td>
            <td><StatusBadge tone={statusTone(student)}>{p.statusLabel(student)}</StatusBadge></td>
            <td>{student.lastLoginAt ? p.fmtDate(student.lastLoginAt) : <span className="never-login">لم يدخل بعد</span>}</td>
            <td>{student.submittedAssignmentsCount > 0 ? <button type="button" className="eb-link-button" onClick={() => p.onOpenHistory(student)} disabled={p.busy}><IconHistory size={14} />الوظائف ({student.submittedAssignmentsCount})</button> : <span className="eb-muted">—</span>}</td>
            <td className="eb-col-actions"><div className="eb-row-actions">
              <button type="button" className="eb-button is-quiet is-small" onClick={() => p.onOpenProfile(student)} disabled={p.busy}><IconUser size={14} />التفاصيل</button>
              <ActionMenu label={"إجراءات " + student.displayName}>
                <button type="button" className="eb-menu-item" onClick={() => p.onEdit(student)} disabled={p.busy}><IconEdit size={16} />تعديل</button>
                <button type="button" className="eb-menu-item" onClick={() => p.onCopyIdentity(student)}><IconCopy size={16} />نسخ رقم الهوية</button>
                {!student.archived && <button type="button" className="eb-menu-item" onClick={() => p.onToggleActive(student)} disabled={p.busy}>{student.active ? "تعطيل الحساب" : "تفعيل الحساب"}</button>}
                <button type="button" className="eb-menu-item" onClick={() => p.onArchive(student)} disabled={p.busy}>{student.archived ? <><IconRestore size={16} />استعادة</> : <><IconArchive size={16} />أرشفة</>}</button>
                <hr className="eb-menu-sep" />
                <button type="button" className="eb-menu-item is-danger" onClick={() => p.onDelete(student)} disabled={p.busy}><IconTrash size={16} />حذف نهائي</button>
              </ActionMenu>
            </div></td>
          </tr>)}</tbody>
        </table></div>
      )}
      {tableBody}
    </section>
  );
}
