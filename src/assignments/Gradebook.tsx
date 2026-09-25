import type { ReactNode } from "react";
import { formatRemaining } from "./attemptPolicy";
import ActionMenu from "../ui/ActionMenu";
import StatusBadge from "../ui/StatusBadge";
import EmptyState from "../ui/EmptyState";
import VisuallyHidden from "../ui/VisuallyHidden";
import { IconSearch, IconSort, IconPlus, IconRestore, IconEdit } from "../icons";
import { gradingClass, gradingLabel, type GradingStatus } from "../gradingStatus";
import { LIFECYCLE_LABEL, type GradebookFilter, type GradebookSort, type Item, type StudentResult } from "./types";

export type GradebookProps = {
  assignment: Item;
  rows: StudentResult[];               // already searched / filtered / sorted by AssignmentsPanel
  totalRows: number;
  gradingOf: (s: StudentResult) => GradingStatus;   // the ONE resolver path (AssignmentsPanel.rowGrading)
  busy: boolean;
  search: string; onSearch: (v: string) => void;
  filter: GradebookFilter; onFilter: (v: GradebookFilter) => void;
  sort: GradebookSort; onSort: (v: GradebookSort) => void;
  onReview: (s: StudentResult) => void;
  onGrant: (s: StudentResult) => void;
  onReopen: (s: StudentResult) => void;
  onExtend: (s: StudentResult) => void;
  onDeadline: (s: StudentResult) => void;
  fmt: (value: string) => string;
};

const FILTERS: Array<[GradebookFilter, string]> = [["all", "الكل"], ["pendingReview", "بانتظار التصحيح"], ["final", "نهائي"], ["notSubmitted", "لم يسلّم"], ["active", "قيد المحاولة"]];

export default function Gradebook(p: GradebookProps) {
  const archived = p.assignment.status === "archived";
  const sortTh = (key: GradebookSort, label: string, asc: boolean) => (
    <th scope="col" aria-sort={p.sort === key ? (asc ? "ascending" : "descending") : undefined}>
      <button type="button" className={"eb-th-sort" + (p.sort === key ? " is-active" : "")} onClick={() => p.onSort(key)}>{label}<IconSort size={14} aria-hidden="true" /></button>
    </th>
  );
  let empty: ReactNode = null;
  if (p.totalRows === 0) empty = <EmptyState compact title="لا يوجد طلاب في هذا الواجب بعد." description="ستظهر صفوف الطلاب هنا عند وجود طلاب في الصف." />;
  else if (p.rows.length === 0) empty = <EmptyState compact title="لا توجد نتائج مطابقة." description="جرّب كلمة بحث أخرى أو غيّر المرشح." />;
  return (
    <section className="eb-gradebook" aria-labelledby="eb-gradebook-title">
      <h3 id="eb-gradebook-title" className="eb-subheading">سجل العلامات</h3>
      <div className="gradebook-controls eb-gradebook-controls">
        <div className="eb-search-field"><IconSearch size={16} aria-hidden="true" /><input className="gradebook-search" type="search" placeholder="بحث بالاسم أو الكود" aria-label="بحث بالاسم أو الكود" value={p.search} onChange={e => p.onSearch(e.target.value)} /></div>
        <div className="gradebook-filter-row eb-chip-group" role="group" aria-label="تصفية حسب حالة التصحيح">
          {FILTERS.map(([f, label]) => <button key={f} type="button" className={"gradebook-chip" + (p.filter === f ? " active" : "")} aria-pressed={p.filter === f} onClick={() => p.onFilter(f)}>{label}</button>)}
        </div>
        <button type="button" className={"eb-button is-small" + (p.sort === "pendingFirst" ? " is-quiet is-active" : "")} aria-pressed={p.sort === "pendingFirst"} onClick={() => p.onSort(p.sort === "pendingFirst" ? "name" : "pendingFirst")}>بانتظار التصحيح أولًا</button>
      </div>
      {p.rows.length > 0 && (
        <div className="students-table-wrap eb-gradebook-table-wrap"><table className="students-table eb-gradebook-table">
          <thead><tr>
            {sortTh("name", "الطالب", true)}
            <th scope="col">الحالة</th>
            <th scope="col">المحاولات</th>
            <th scope="col" aria-sort={p.sort === "highest" ? "descending" : p.sort === "lowest" ? "ascending" : undefined}>
              <button type="button" className={"eb-th-sort" + (p.sort === "highest" || p.sort === "lowest" ? " is-active" : "")} onClick={() => p.onSort(p.sort === "highest" ? "lowest" : "highest")}>العلامة<IconSort size={14} aria-hidden="true" />{p.sort === "highest" && <VisuallyHidden>، الأعلى أولًا</VisuallyHidden>}{p.sort === "lowest" && <VisuallyHidden>، الأدنى أولًا</VisuallyHidden>}</button>
            </th>
            <th scope="col" className="eb-col-actions"><VisuallyHidden>الإجراء</VisuallyHidden></th>
          </tr></thead>
          <tbody>{p.rows.map(s => {
            const gs = p.gradingOf(s);
            const pending = gs === "pendingReview";
            return (
              <tr key={s.studentId}>
                <td><strong>{s.studentName}</strong><small className="result-code">{s.studentCode}</small></td>
                <td>
                  <div className="eb-status-stack">
                    {s.attemptStatus && <StatusBadge tone={s.attemptStatus === "started" ? "info" : s.attemptStatus === "paused" || s.attemptStatus === "integrityExit" ? "warn" : "neutral"} className={"lifecycle-badge lifecycle-" + s.attemptStatus}>{LIFECYCLE_LABEL[s.attemptStatus] || s.attemptStatus}</StatusBadge>}
                    {gs === "notSubmitted"
                      ? <StatusBadge tone="neutral" className="review-state none">{gradingLabel(gs)}</StatusBadge>
                      : <StatusBadge tone={gs === "final" ? "success" : "warn"} className={"review-state " + gradingClass(gs)}>{gradingLabel(gs)}{pending && s.latestResult && s.latestResult.manualReviewMarks > 0 ? " (" + s.latestResult.manualReviewMarks + " ع.)" : ""}</StatusBadge>}
                    {s.activeAttempt?.startedAt && <small className="lifecycle-started">بدأ: {p.fmt(s.activeAttempt.startedAt)}</small>}
                    {s.timed && s.activeAttempt && s.effectiveAttemptEndsAt && s.activeAttempt.status !== "paused" && <small className="lifecycle-ends">ينتهي فعليًا: {p.fmt(s.effectiveAttemptEndsAt)}</small>}
                    {s.activeAttempt?.status === "paused" && <small className="lifecycle-paused">محفوظة مؤقتًا{s.activeAttempt.pausedAt ? " منذ " + p.fmt(s.activeAttempt.pausedAt) : ""}{typeof s.activeAttempt.pausedRemainingMs === "number" ? " · المتبقي " + formatRemaining(s.activeAttempt.pausedRemainingMs) : ""}</small>}
                    {s.activeAttempt?.extendedEndsAt && <small className="lifecycle-extended-badge">تم تمديد وقت المحاولة</small>}
                    {s.dueAtOverride && <small className="deadline-extended-badge">تمديد حتى: {p.fmt(s.dueAtOverride)}</small>}
                  </div>
                </td>
                <td>{s.attemptsUsed}/{s.allowedAttempts}</td>
                <td>{s.latestResult ? s.latestResult.score + "/" + s.latestResult.totalMarks + " (" + s.latestResult.percentage + "%)" : "—"}</td>
                <td className="eb-col-actions"><div className="eb-row-actions">
                  {s.latestResult && <button type="button" className={"eb-button is-small review-button" + (pending ? " is-primary" : "")} onClick={() => p.onReview(s)}>{pending ? "تصحيح الآن" : "عرض التصحيح"}</button>}
                  {!archived && (
                    <ActionMenu label={"إجراءات " + s.studentName}>
                      <button type="button" className="eb-menu-item" onClick={() => p.onGrant(s)} disabled={p.busy}><IconPlus size={16} />منح محاولة إضافية</button>
                      <button type="button" className="eb-menu-item" onClick={() => p.onReopen(s)} disabled={p.busy || !!s.activeAttempt}><IconRestore size={16} />إعادة فتح للطالب</button>
                      {s.timed && s.activeAttempt && s.activeAttempt.status !== "paused" && <button type="button" className="eb-menu-item" onClick={() => p.onExtend(s)} disabled={p.busy}><IconEdit size={16} />تمديد وقت المحاولة</button>}
                      <button type="button" className="eb-menu-item" onClick={() => p.onDeadline(s)} disabled={p.busy}><IconEdit size={16} />تمديد الموعد</button>
                    </ActionMenu>
                  )}
                </div></td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
      {empty}
    </section>
  );
}
