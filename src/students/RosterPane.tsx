import { useState, type ReactNode } from "react";
import SectionHeader from "../ui/SectionHeader";
import StatusBadge from "../ui/StatusBadge";
import EmptyState from "../ui/EmptyState";
import VisuallyHidden from "../ui/VisuallyHidden";
import ActionMenu from "../ui/ActionMenu";
import BulkActionBar from "./BulkActionBar";
import StudentAvatar from "./StudentAvatar";
import { relativeTime } from "./rosterText";
import { arabicCount, arabicCountParts, STUDENTS, STUDENTS_AFTER_DIGITS } from "../learning/arabicCount";
import { IconSearch, IconDownload, IconUpload, IconPlus, IconRefresh, IconUser, IconEdit, IconCopy, IconTrash, IconArchive, IconRestore, IconHistory, IconHeart, IconSort, IconChevronDown, IconClose, IconChevronUp, IconPrint } from "../icons";
import { type CredentialBatch } from "../credentialBatch";
import { PasswordText, RevealToggle } from "./MaskedPassword";
import type { BulkError, BulkOperation, Classroom, Credential, SortKey, StatusFilter, Student } from "./types";

export type RosterPaneProps = {
  classroom: Classroom | null;
  classActive: boolean;
  students: Student[];
  visibleStudents: Student[];
  stats: { total: number; active: number; disabled: number; archived: number; neverLogged: number };
  /** The selected class's roster is not loaded yet (or, with no class selected, the classes are still loading). */
  loading: boolean;
  /** A read of the already loaded roster is in flight (the rows stay; only «تحديث» waits). */
  refreshing?: boolean;
  /** Phase S.0 — the roster read failed: shown as an error with «إعادة المحاولة», never as an empty class. */
  loadError?: string;
  onRetry?: () => void;
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
  /** Hand-out formats of the same in-memory batch (optional: older hosts show the JSON download only). */
  onDownloadBatchCsv?: () => void; onPrintBatch?: () => void;
  bulkErrors: BulkError[];
  statusLabel: (student: Student) => string;
  fmtDate: (value: string) => string;
  splitName: (value: unknown) => { firstName: string; familyName: string };
  /** Session token for the row avatars' authenticated photo reads. Omitted → preset / letter avatars only. */
  token?: string;
};

// The summary strip doubles as the status filter: each figure filters the roster to the students it counts.
const STAT_FILTERS: Array<{ key: keyof RosterPaneProps["stats"]; filter: StatusFilter; label: string; tone: string }> = [
  { key: "total", filter: "all", label: "إجمالي", tone: "neutral" },
  { key: "active", filter: "active", label: "فعّال", tone: "success" },
  { key: "disabled", filter: "disabled", label: "معطّل", tone: "attention" },
  { key: "archived", filter: "archived", label: "مؤرشف", tone: "neutral" },
  { key: "neverLogged", filter: "neverLogged", label: "لم يدخلوا بعد", tone: "info" }
];
const SKELETON_ROWS = 5;

const SORT_COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "firstName", label: "الاسم" }, { key: "familyName", label: "اسم العائلة" }, { key: "identityNumber", label: "رقم الهوية" }, { key: "status", label: "الحالة" }
];

export default function RosterPane(p: RosterPaneProps) {
  const { classroom } = p;
  if (!classroom) {
    return (
      <section className="eb-roster-pane" aria-labelledby="eb-roster-title">
        <SectionHeader level={2} id="eb-roster-title" title="الطلاب" />
        {p.loading
          ? <div className="platform-loading" role="status">جارٍ التحميل...</div>
          : <EmptyState title="اختر صفًا لإدارة طلابه" description="أنشئ صفًا أو اختر صفًا من القائمة لعرض قائمة الطلاب وإدارتها." />}
      </section>
    );
  }
  // Phase S.0 — figures are shown only for a loaded roster; until then (or after a failed read) they read «—», never 0.
  const ready = !p.loading && !p.loadError;
  const shown = (n: number) => (ready ? String(n) : "—");
  const allVisibleSelected = p.visibleStudents.length > 0 && p.visibleStudents.every(s => p.selectedIds.includes(s.userId));
  const sortTh = (key: SortKey, label: string) => (
    <th key={key} scope="col" aria-sort={p.sortKey === key ? (p.sortAsc ? "ascending" : "descending") : undefined}>
      <button type="button" className={"eb-th-sort" + (p.sortKey === key ? " is-active" : "")} onClick={() => p.onSort(key)}>{label}<IconSort size={14} aria-hidden="true" />{p.sortKey === key && <VisuallyHidden>{p.sortAsc ? "، مرتّب تصاعديًا" : "، مرتّب تنازليًا"}</VisuallyHidden>}</button>
    </th>
  );
  const statusTone = (s: Student) => s.archived ? "neutral" : s.active ? "success" : "warn";
  let tableBody: ReactNode;
  if (p.loadError) tableBody = (
    <div className="eb-roster-load-error" role="alert">
      <EmptyState title="تعذر تحميل طلاب هذا الصف." description={p.loadError} action={p.onRetry ? <button type="button" className="eb-button is-small" onClick={p.onRetry}><IconRefresh size={16} />إعادة المحاولة</button> : undefined} />
    </div>
  );
  else if (p.loading) tableBody = (
    <div className="eb-roster-skeleton" role="status">
      <VisuallyHidden>جارٍ تحميل الطلاب...</VisuallyHidden>
      {Array.from({ length: SKELETON_ROWS }, (_, i) => <div key={i} className="eb-skeleton-row" aria-hidden="true"><span className="eb-skeleton-dot" /><span className="eb-skeleton-bar" /><span className="eb-skeleton-bar is-short" /></div>)}
    </div>
  );
  else if (p.students.length === 0) tableBody = <EmptyState title="لا يوجد طلاب في هذا الصف بعد." description="أضف طالبًا واحدًا أو استورد قائمة كاملة من ملف." action={p.classActive ? <button type="button" className="eb-button is-primary is-small" onClick={p.onAddStudent}><IconPlus size={16} />إضافة طالب</button> : undefined} />;
  else if (p.visibleStudents.length === 0) tableBody = <EmptyState compact title="لا توجد نتائج مطابقة." description="جرّب كلمة بحث أخرى أو غيّر مرشح الحالة." />;

  return (
    <section className="eb-roster-pane" aria-labelledby="eb-roster-title">
      <SectionHeader
        level={2}
        id="eb-roster-title"
        title={classroom.name}
        description={<><span className="student-count-badge">{shown(p.stats.total - p.stats.archived)}</span>{ready ? arabicCountParts(p.stats.total - p.stats.archived, STUDENTS_AFTER_DIGITS).after : " طالب"}{ready && p.stats.archived > 0 ? <> · {p.stats.archived} مؤرشف</> : ""} · {classroom.grade || "—"}{classroom.schoolYear ? <> · <bdi dir="ltr">{classroom.schoolYear}</bdi></> : ""} · <StatusBadge tone={p.classActive ? "success" : "neutral"}>{p.classActive ? "فعّال" : "مؤرشف"}</StatusBadge></>}
        actions={<>
          <button type="button" className="eb-button is-primary" onClick={p.onAddStudent} disabled={p.busy || !p.classActive}><IconPlus size={16} />إضافة طالب</button>
          <button type="button" className="eb-button" onClick={p.onImport} disabled={p.busy || !p.classActive}><IconUpload size={16} />استيراد</button>
          <ActionMenu label="المزيد من إجراءات الصف">
            <button type="button" className="eb-menu-item" onClick={p.onRefresh} disabled={p.loading || p.refreshing}><IconRefresh size={16} />تحديث</button>
            <button type="button" className="eb-menu-item" onClick={p.onExportCsv} disabled={!ready}><IconDownload size={16} />تصدير CSV</button>
          </ActionMenu>
        </>}
      />

      {p.credentialBox && <CredentialBox key={p.credentialBox.password} box={p.credentialBox} onCopy={p.onCopyCredentialBox} onHide={p.onHideCredentialBox} />}

      <div className="student-admin-stats eb-roster-stats" role="group" aria-label="ملخص الصف — اختر رقمًا لعرض طلابه" aria-busy={!ready || undefined}>
        {STAT_FILTERS.map(f => (
          <button key={f.key} type="button" className={"eb-roster-stat tone-" + f.tone} aria-pressed={p.statusFilter === f.filter} onClick={() => p.onStatusFilter(p.statusFilter === f.filter ? "all" : f.filter)}>
            <span className="eb-roster-stat-label">{f.label}</span><strong className="eb-roster-stat-value">{shown(p.stats[f.key])}</strong>
          </button>
        ))}
      </div>

      <div className="eb-roster-toolbar">
        <label className="student-search-field eb-search-field">
          <IconSearch size={16} aria-hidden="true" />
          <input value={p.searchText} onChange={e => p.onSearch(e.target.value)} placeholder="ابحث بالاسم، العائلة أو رقم الهوية" aria-label="ابحث بالاسم، العائلة أو رقم الهوية" />
        </label>
        <label className="eb-field-inline">الحالة<select className="student-status-select" value={p.statusFilter} onChange={e => p.onStatusFilter(e.target.value as StatusFilter)}>
          <option value="all">كل الحالات</option><option value="active">فعّال</option><option value="disabled">معطّل</option><option value="archived">مؤرشف</option><option value="neverLogged">لم يدخلوا بعد</option>
        </select></label>
      </div>

      {!p.classActive && <div className="platform-warning" role="status">الصف مؤرشف؛ فعّله قبل إضافة أو استعادة الطلاب.</div>}

      {p.selectedIds.length > 0 && <BulkActionBar count={p.selectedIds.length} busy={p.busy} targetClasses={p.bulk.targetClasses} targetClassId={p.bulk.targetClassId} onTargetChange={p.bulk.onTargetChange} onAction={p.bulk.onAction} onClear={p.onClearSelection} />}

      {p.credentialBatch && <CredentialBatchPanel key={p.credentialBatch.createdAt} batch={p.credentialBatch} onToggle={p.onToggleBatch} onDownload={p.onDownloadBatch} onDiscard={p.onDiscardBatch} onCopy={p.onCopyCredential} onDownloadCsv={p.onDownloadBatchCsv} onPrint={p.onPrintBatch} />}

      {p.bulkErrors.length > 0 && <div className="platform-warning" role="alert"><strong>عمليات لم تكتمل:</strong>{p.bulkErrors.map((x, i) => <div key={x.userId || i}>{x.displayName || x.userId || "السطر " + ((x.index ?? i) + 1)}: {x.error}</div>)}</div>}

      {p.visibleStudents.length > 0 && (
        <div className="students-table-wrap eb-roster-table-wrap"><table className="students-table students-table-pro eb-roster-table" aria-label={"طلاب " + classroom.name}>
          <thead><tr>
            <th scope="col" className="eb-col-select"><label className="eb-check-hit"><input type="checkbox" checked={allVisibleSelected} onChange={p.onToggleSelectVisible} aria-label="تحديد الكل" /></label></th>
            {SORT_COLUMNS.map(c => sortTh(c.key, c.label))}
            <th scope="col">آخر دخول</th><th scope="col">الواجبات</th><th scope="col" className="eb-col-actions"><VisuallyHidden>الإجراءات</VisuallyHidden></th>
          </tr></thead>
          <tbody>{p.visibleStudents.map(student => {
            const selected = p.selectedIds.includes(student.userId);
            const firstName = student.firstName || p.splitName(student.displayName).firstName;
            const familyName = student.familyName || p.splitName(student.displayName).familyName || "";
            const lastLogin = relativeTime(student.lastLoginAt);
            return <tr key={student.userId} className={[student.archived ? "student-row-archived" : "", selected ? "is-selected" : ""].filter(Boolean).join(" ")}>
            <td className="eb-col-select"><label className="eb-check-hit"><input type="checkbox" checked={selected} onChange={() => p.onToggleSelected(student.userId)} aria-label={"تحديد " + student.displayName} /></label></td>
            <td className="eb-col-name" data-label="الاسم"><span className="eb-name-cell"><StudentAvatar token={p.token} studentId={student.userId} name={student.displayName} avatarId={student.avatarId} profilePhoto={student.profilePhoto} /><strong data-family={familyName || undefined}>{firstName}</strong>{student.likesCount > 0 && <span className="student-likes-badge" title={student.likesCount + " ردّ فعل على إنجازاته"}><IconHeart size={12} aria-hidden="true" /> {student.likesCount}<VisuallyHidden> ردود فعل على إنجازاته</VisuallyHidden></span>}</span></td>
            <td data-label="اسم العائلة" className="eb-col-family">{familyName || "—"}</td>
            <td dir="ltr" data-label="رقم الهوية" className="eb-col-identity">{student.identityNumber || student.code || "يحتاج تحديث"}</td>
            <td data-label="الحالة" className="eb-col-status"><StatusBadge tone={statusTone(student)}>{p.statusLabel(student)}</StatusBadge></td>
            <td data-label="آخر دخول" className="eb-col-login">{lastLogin ? <time dateTime={student.lastLoginAt} title={lastLogin.full}>{lastLogin.label}</time> : <span className="never-login">لم يدخل بعد</span>}</td>
            <td data-label="الواجبات" className="eb-col-tasks">{student.submittedAssignmentsCount > 0 ? <button type="button" className="eb-link-button" onClick={() => p.onOpenHistory(student)} disabled={p.busy}><IconHistory size={14} />الواجبات ({student.submittedAssignmentsCount})<VisuallyHidden> — {student.displayName}</VisuallyHidden></button> : <span className="eb-muted"><span aria-hidden="true">—</span><VisuallyHidden>لا واجبات مسلّمة</VisuallyHidden></span>}</td>
            <td className="eb-col-actions"><div className="eb-row-actions">
              <button type="button" className="eb-button is-quiet is-small eb-icon-action" title={"تفاصيل " + student.displayName} onClick={() => p.onOpenProfile(student)} disabled={p.busy}><IconUser size={16} aria-hidden="true" /><VisuallyHidden>{"تفاصيل " + student.displayName}</VisuallyHidden></button>
              <ActionMenu label={"إجراءات " + student.displayName}>
                <button type="button" className="eb-menu-item" onClick={() => p.onEdit(student)} disabled={p.busy}><IconEdit size={16} />تعديل</button>
                <button type="button" className="eb-menu-item" onClick={() => p.onCopyIdentity(student)}><IconCopy size={16} />نسخ رقم الهوية</button>
                {!student.archived && <button type="button" className="eb-menu-item" onClick={() => p.onToggleActive(student)} disabled={p.busy}>{student.active ? "تعطيل الحساب" : "تفعيل الحساب"}</button>}
                <button type="button" className="eb-menu-item" onClick={() => p.onArchive(student)} disabled={p.busy}>{student.archived ? <><IconRestore size={16} />استعادة</> : <><IconArchive size={16} />أرشفة</>}</button>
                <hr className="eb-menu-sep" />
                <button type="button" className="eb-menu-item is-danger" onClick={() => p.onDelete(student)} disabled={p.busy}><IconTrash size={16} />حذف نهائي</button>
              </ActionMenu>
            </div></td>
          </tr>;
          })}</tbody>
        </table></div>
      )}
      {tableBody}
    </section>
  );
}

// Phase S.3 — the password of a newly created student is masked until «إظهار كلمة المرور»; a new box starts masked again.
function CredentialBox({ box, onCopy, onHide }: { box: NonNullable<RosterPaneProps["credentialBox"]>; onCopy: () => void; onHide: () => void }) {
  const [shown, setShown] = useState(false);
  return (
    <section className="credential-box eb-credential-box" aria-label="بيانات دخول جديدة">
      <h3 className="eb-subheading">بيانات دخول جديدة · {box.name}</h3>
      <div className="credential-values">
        <div><span>رقم الهوية / الدخول</span><strong dir="ltr">{box.identityNumber}</strong></div>
        <div><span>كلمة المرور</span><strong dir="ltr"><PasswordText value={box.password} shown={shown} /></strong></div>
      </div>
      <div className="eb-inline-actions">
        <RevealToggle label="إظهار كلمة المرور" shown={shown} onToggle={() => setShown(x => !x)} />
        <button type="button" className="eb-button is-small" onClick={onCopy}><IconCopy size={14} />نسخ بيانات الدخول</button>
        <button type="button" className="eb-button is-small" onClick={onHide}>إخفاء</button>
      </div>
    </section>
  );
}

// Phase S.3 — the batch's passwords are masked until «إظهار كلمات المرور». The panel unmounts while another class is selected,
// so coming back (or a new batch) always starts masked. «لم تُحفظ بعد» until a download or a print took a copy.
function CredentialBatchPanel({ batch, onToggle, onDownload, onDiscard, onCopy, onDownloadCsv, onPrint }: {
  batch: CredentialBatch; onToggle: () => void; onDownload: () => void; onDiscard: () => void; onCopy: (credential: Credential) => void;
  onDownloadCsv?: () => void; onPrint?: () => void;
}) {
  const [shown, setShown] = useState(false);
  return (
    <section className="credential-box eb-credential-box" aria-label="بيانات الدخول الجديدة">
      <div className="eb-credential-head">
        <div><h3 className="eb-subheading">بيانات الدخول الجديدة</h3><p className="eb-muted">{arabicCount(batch.credentials.length, STUDENTS)} · {batch.savedAt ? "✓ حُفظت نسخة منها (تنزيل أو طباعة)." : "لم تُحفظ بعد: نزّلها أو اطبعها الآن؛ كلمات المرور لا تُعرض لاحقًا كنص واضح."}</p></div>
        <div className="eb-inline-actions">
          <button type="button" className="eb-button is-small" onClick={onToggle} aria-expanded={!batch.collapsed}>{batch.collapsed ? <><IconChevronDown size={14} />إظهار</> : <><IconChevronUp size={14} />طي</>}</button>
          {!batch.collapsed && <RevealToggle label="إظهار كلمات المرور" shown={shown} onToggle={() => setShown(x => !x)} />}
          {onPrint && <button type="button" className="eb-button is-small is-primary" onClick={onPrint}><IconPrint size={14} />طباعة بطاقات الدخول</button>}
          {onDownloadCsv && <button type="button" className="eb-button is-small" onClick={onDownloadCsv}><IconDownload size={14} />تنزيل CSV</button>}
          <button type="button" className="eb-button is-small" onClick={onDownload}><IconDownload size={14} />تنزيل JSON</button>
          <button type="button" className="eb-button is-small" onClick={onDiscard}><IconClose size={14} />إغلاق</button>
        </div>
      </div>
      {!batch.collapsed && (
        <div className="students-table-wrap"><table className="students-table">
          <thead><tr><th scope="col">الاسم</th><th scope="col">العائلة</th><th scope="col">رقم الهوية</th><th scope="col">كلمة المرور</th><th scope="col"><VisuallyHidden>نسخ</VisuallyHidden></th></tr></thead>
          <tbody>{batch.credentials.map((c, i) => <tr key={(c.userId || c.code) + i}><td>{c.firstName}</td><td>{c.familyName}</td><td dir="ltr">{c.identityNumber || c.code}</td><td dir="ltr"><strong><PasswordText value={c.password} shown={shown} /></strong></td>
            <td><button type="button" className="eb-button is-small" onClick={() => onCopy(c)}><IconCopy size={14} />نسخ</button></td></tr>)}</tbody>
        </table></div>
      )}
    </section>
  );
}
