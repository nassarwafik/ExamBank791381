import { useEffect, useRef, type ReactNode } from "react";
import { studentsCount } from "./assignmentPage";
import { formatRemaining } from "./attemptPolicy";
import ActionMenu from "../ui/ActionMenu";
import StatusBadge from "../ui/StatusBadge";
import EmptyState from "../ui/EmptyState";
import VisuallyHidden from "../ui/VisuallyHidden";
import { IconSearch, IconSort, IconPlus, IconRestore, IconEdit, IconClose, IconDownload, IconBell } from "../icons";
import type { GradingStatus } from "../gradingStatus";
import { studentStatus } from "./gradebookStatus";
import type { CodingEvidenceTotals, CodingGradingStatus, GradebookFilter, GradebookSort, Item, StudentResult } from "./types";
import { codingStatusBadge, needsCodingRetry } from "./codingRecovery";
import { codingSummaryBadge } from "../coding/codingTeacherEvidence";
import { lateDurationLabel, lateStampOf } from "./latePolicy";

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
  onEndAttempt: (s: StudentResult) => void;    // Phase 7B — end the student's CURRENT attempt (server-graded draft)
  /** D5 (item 10) — waive (true) or restore (false) the late deduction of the student's latest attempt. */
  onLateWaiver?: (s: StudentResult, waived: boolean) => void;
  fmt: (value: string) => string;
  /** Phase 12B — the student a Today Hub drill asked for (present in the authoritative rows): that row is marked
   *  (aria-current + highlight) and scrolled into view once. Presentation only; filtering stays the panel's. */
  focusStudentId?: string;
  /** Phase 17D-A — assignment-level coding grading summary (server-derived) and the ONE bulk retry action. */
  codingSummary?: CodingGradingStatus | null;
  onBulkCodingRetry?: () => void;
  /** Phase 17E-D — assignment totals of the compact evidence summary (delayed = automatic recovery exhausted). */
  codingTotals?: CodingEvidenceTotals | null;
  /** Phase 21E.2 — export the whole gradebook of this assignment as CSV (every student, not only the filtered rows). */
  onExportCsv?: () => void;
  /** Phase 21G.7 — the same gradebook as an Excel workbook (.xlsx) and as a print-ready report (save as PDF). */
  onExportXlsx?: () => void;
  onPrint?: () => void;
  /** Phase 21G.4 — row selection for the bulk actions (absent = no selection, e.g. an archived assignment). The panel clears it
   *  whenever the visible rows change meaning (search, filter, another assignment), so a bulk action never reaches an unseen row. */
  selection?: {
    selected: ReadonlySet<string>;
    onToggle: (studentId: string) => void;
    onToggleAll: (studentIds: string[], on: boolean) => void;
    onClear: () => void;
    onBulkGrant: () => void;
    onBulkDeadline: () => void;
    /** Phase 21G.7 — a reminder to the ticked students (the server sends it only to those who can still submit). */
    onRemind?: () => void;
  };
  /** Phase 21G.7 — «تذكير من لم يسلّم» for a published assignment (the server decides who is eligible). */
  onRemindAll?: () => void;
};

const FILTERS: Array<[GradebookFilter, string]> = [["all", "الكل"], ["pendingReview", "بانتظار التصحيح"], ["final", "نهائي"], ["notSubmitted", "لم يسلّم"], ["active", "قيد المحاولة"]];

export default function Gradebook(p: GradebookProps) {
  const archived = p.assignment.status === "archived";
  // Phase 17E-D — the assignment-level coding summary card (counts only, server-derived). "بحاجة لإعادة محاولة" = retryable / stale
  // targets whose automatic recovery is still running; "متأخر" = automatic recovery exhausted (needs a teacher retry).
  const cs = p.codingSummary, ct = p.codingTotals;
  const codingCard = cs && (cs.pending + cs.retryable + cs.stale > 0 || (ct && ct.superseded > 0))
    ? { pending: cs.pending, retry: Math.max(0, cs.retryable + cs.stale - (ct ? ct.delayed : 0)), delayed: ct ? ct.delayed : 0, superseded: ct ? ct.superseded : 0 } : null;
  const focusRow = useRef<HTMLTableRowElement | null>(null);
  const focusVisible = !!p.focusStudentId && p.rows.some(s => s.studentId === p.focusStudentId);
  useEffect(() => { if (focusVisible) focusRow.current?.scrollIntoView?.({ block: "nearest" }); }, [p.focusStudentId, focusVisible]);
  const sortTh = (key: GradebookSort, label: string, asc: boolean, lead?: ReactNode) => (
    <th scope="col" className="is-sortable" aria-sort={p.sort === key ? (asc ? "ascending" : "descending") : undefined}>
      {lead ? <div className="eb-student-cell">{lead}{sortButton(key, label)}</div> : sortButton(key, label)}
    </th>
  );
  const sortButton = (key: GradebookSort, label: string) => (
      <button type="button" className={"eb-th-sort" + (p.sort === key ? " is-active" : "")} onClick={() => p.onSort(key)}>{label}<IconSort size={14} aria-hidden="true" /></button>
  );
  const sel = archived ? undefined : p.selection;
  const visibleIds = p.rows.map(s => s.studentId);
  const selectedVisible = sel ? visibleIds.filter(id => sel.selected.has(id)).length : 0;
  const allBox = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (allBox.current) allBox.current.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length; });
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
        {p.onExportCsv && <button type="button" className="eb-button is-small gradebook-export" onClick={p.onExportCsv} disabled={p.busy || p.totalRows === 0}><IconDownload size={16} aria-hidden="true" />تصدير سجل العلامات (CSV)</button>}
        {p.onExportXlsx && <button type="button" className="eb-button is-small gradebook-export-xlsx" onClick={p.onExportXlsx} disabled={p.busy || p.totalRows === 0}><IconDownload size={16} aria-hidden="true" />تصدير سجل العلامات (Excel)</button>}
        {p.onPrint && <button type="button" className="eb-button is-small gradebook-print" onClick={p.onPrint} disabled={p.busy || p.totalRows === 0}><IconDownload size={16} aria-hidden="true" />طباعة سجل العلامات (PDF)</button>}
        {p.onRemindAll && p.assignment.status === "published" && p.rows.some(s => !s.latestResult) && <button type="button" className="eb-button is-small gradebook-remind" onClick={p.onRemindAll} disabled={p.busy}><IconBell size={16} aria-hidden="true" />تذكير من لم يسلّم</button>}
        {!archived && p.onBulkCodingRetry && needsCodingRetry(p.codingSummary) && <button type="button" className="eb-button is-small coding-bulk-retry" disabled={p.busy} onClick={p.onBulkCodingRetry}>إعادة محاولة التصحيح البرمجي</button>}
      </div>
      {codingCard && <p className="eb-coding-summary" data-testid="coding-summary-card">
        <span>قيد التصحيح: {codingCard.pending}</span><span>بحاجة لإعادة محاولة: {codingCard.retry}</span><span>متأخر: {codingCard.delayed}</span>{codingCard.superseded > 0 && <span>علامة المعلم معتمدة: {codingCard.superseded}</span>}
      </p>}
      {sel && selectedVisible > 0 && (
        <div className="eb-gradebook-bulk" role="group" aria-label="إجراءات الطلاب المحددين">
          <span className="eb-gradebook-bulk-count" role="status">تم تحديد {studentsCount(selectedVisible)}</span>
          <button type="button" className="eb-button is-small" onClick={sel.onBulkGrant} disabled={p.busy}><IconPlus size={16} />منح محاولة إضافية</button>
          <button type="button" className="eb-button is-small" onClick={sel.onBulkDeadline} disabled={p.busy}><IconEdit size={16} />تمديد الموعد</button>
          {sel.onRemind && p.assignment.status === "published" && <button type="button" className="eb-button is-small" onClick={sel.onRemind} disabled={p.busy}><IconBell size={16} />تذكير المحددين</button>}
          <button type="button" className="eb-button is-small is-ghost" onClick={sel.onClear} disabled={p.busy}>إلغاء التحديد</button>
        </div>
      )}
      {p.rows.length > 0 && (
        <div className="students-table-wrap eb-gradebook-table-wrap"><table className="students-table eb-gradebook-table">
          <thead><tr>
            {sortTh("name", "الطالب", true, sel && <input ref={allBox} type="checkbox" className="eb-select-box" aria-label="تحديد كل الطلاب الظاهرين" checked={visibleIds.length > 0 && selectedVisible === visibleIds.length} onChange={e => sel.onToggleAll(visibleIds, e.target.checked)} disabled={p.busy} />)}
            <th scope="col">الحالة</th>
            <th scope="col">المحاولات</th>
            <th scope="col" className="is-sortable" aria-sort={p.sort === "highest" ? "descending" : p.sort === "lowest" ? "ascending" : undefined}>
              <button type="button" className={"eb-th-sort" + (p.sort === "highest" || p.sort === "lowest" ? " is-active" : "")} onClick={() => p.onSort(p.sort === "highest" ? "lowest" : "highest")}>العلامة<IconSort size={14} aria-hidden="true" />{p.sort === "highest" && <VisuallyHidden>، الأعلى أولًا</VisuallyHidden>}{p.sort === "lowest" && <VisuallyHidden>، الأدنى أولًا</VisuallyHidden>}</button>
            </th>
            <th scope="col" className="eb-col-actions"><VisuallyHidden>الإجراء</VisuallyHidden></th>
          </tr></thead>
          <tbody>{p.rows.map(s => {
            const gs = p.gradingOf(s), st = studentStatus(s, gs);
            const pending = gs === "pendingReview";
            const focused = s.studentId === p.focusStudentId;
            const late = lateStampOf(s.latestResult?.late);
            const coding = s.latestResult?.codingEvidenceSummary ? codingSummaryBadge(s.latestResult.codingEvidenceSummary) : codingStatusBadge(s.latestResult?.codingGrading);
            return (
              <tr key={s.studentId} className={[focused ? "is-drill-focus" : "", sel?.selected.has(s.studentId) ? "is-selected" : ""].filter(Boolean).join(" ") || undefined} aria-current={focused ? "true" : undefined} ref={focused ? focusRow : undefined}>
                <td data-label="الطالب"><div className="eb-student-cell">
                  {sel && <input type="checkbox" className="eb-select-box" aria-label={"تحديد " + s.studentName} checked={sel.selected.has(s.studentId)} onChange={() => sel.onToggle(s.studentId)} disabled={p.busy} />}
                  <div><strong>{s.studentName}</strong><small className="result-code">{s.studentCode}</small>{focused && <small className="eb-drill-focus-note">الطالب المطلوب</small>}</div>
                </div></td>
                <td data-label="الحالة">
                  <div className="eb-status-stack">
                    <StatusBadge tone={st.tone} className={"eb-student-status is-" + st.key + " " + st.className}>{st.label}</StatusBadge>
                    {st.note && <small className="eb-student-status-note">{st.note}</small>}
                    {coding && <StatusBadge tone={coding.tone} className="coding-grading-badge">{coding.label}</StatusBadge>}
                    {(s.latestResult?.technicalHolds || 0) > 0 && <StatusBadge tone="warn" className="technical-hold-badge">تعذّر عرض {s.latestResult!.technicalHolds === 1 ? "سؤال واحد" : s.latestResult!.technicalHolds + " أسئلة"} على جهاز الطالب — بانتظار قرارك</StatusBadge>}
                    {s.activeAttempt && <small className="lifecycle-attempt">المحاولة الحالية: {s.activeAttempt.attemptNumber}</small>}
                    {s.activeAttempt?.startedAt && <small className="lifecycle-started">بدأ: {p.fmt(s.activeAttempt.startedAt)}</small>}
                    {s.timed && s.activeAttempt && s.effectiveAttemptEndsAt && s.activeAttempt.status !== "paused" && <small className="lifecycle-ends">ينتهي فعليًا: {p.fmt(s.effectiveAttemptEndsAt)}</small>}
                    {s.activeAttempt?.status === "paused" && <small className="lifecycle-paused">محفوظة مؤقتًا{s.activeAttempt.pausedAt ? " منذ " + p.fmt(s.activeAttempt.pausedAt) : ""}{typeof s.activeAttempt.pausedRemainingMs === "number" ? " · المتبقي " + formatRemaining(s.activeAttempt.pausedRemainingMs) : ""}</small>}
                    {s.activeAttempt && (s.activeAttempt.pauseCount || 0) > 0 && <small className="lifecycle-pause-count">مرات الحفظ المؤقت: {s.activeAttempt.pauseCount}</small>}
                    {s.activeAttempt?.extendedEndsAt && <small className="lifecycle-extended-badge">تم تمديد وقت المحاولة</small>}
                    {late && <StatusBadge tone="warn" className="late-badge">متأخر {lateDurationLabel(late.minutesLate)}{late.waived ? " · أُلغي الخصم" : late.deductionPercent ? " · خصم " + late.deductionPercent + "٪" : ""}</StatusBadge>}
                    {s.dueAtOverride && <small className="deadline-extended-badge">تمديد حتى: {p.fmt(s.dueAtOverride)}</small>}
                  </div>
                </td>
                <td data-label="المحاولات">{s.attemptsUsed}/{s.allowedAttempts}</td>
                <td data-label="العلامة">{s.latestResult ? s.latestResult.score + "/" + s.latestResult.totalMarks + " (" + s.latestResult.percentage + "%)" : "—"}{late && !late.waived && (s.latestResult?.latePenalty || 0) > 0 && <small className="late-penalty-note">قبل الخصم: {s.latestResult!.rawScore}</small>}</td>
                <td className="eb-col-actions"><div className="eb-row-actions">
                  {s.latestResult && <button type="button" className={"eb-button is-small review-button" + (pending ? " is-primary" : "")} onClick={() => p.onReview(s)}>{pending ? "تصحيح الآن" : "عرض التصحيح"}</button>}
                  {!archived && (
                    <ActionMenu label={"إجراءات " + s.studentName}>
                      <button type="button" className="eb-menu-item" onClick={() => p.onGrant(s)} disabled={p.busy}><IconPlus size={16} />منح محاولة إضافية</button>
                      <button type="button" className="eb-menu-item" onClick={() => p.onReopen(s)} disabled={p.busy || !!s.activeAttempt}><IconRestore size={16} />إعادة فتح للطالب</button>
                      {s.timed && s.activeAttempt && s.activeAttempt.status !== "paused" && <button type="button" className="eb-menu-item" onClick={() => p.onExtend(s)} disabled={p.busy}><IconEdit size={16} />تمديد وقت المحاولة</button>}
                      <button type="button" className="eb-menu-item" onClick={() => p.onDeadline(s)} disabled={p.busy}><IconEdit size={16} />تمديد الموعد</button>
                      {late && p.onLateWaiver && late.deductionPercent > 0 && <button type="button" className="eb-menu-item late-waiver-button" onClick={() => p.onLateWaiver!(s, !late.waived)} disabled={p.busy}><IconRestore size={16} />{late.waived ? "إعادة خصم التأخير" : "إلغاء خصم التأخير"}</button>}
                      {s.activeAttempt && <button type="button" className="eb-menu-item is-danger end-attempt-button" onClick={() => p.onEndAttempt(s)} disabled={p.busy}><IconClose size={16} />إنهاء المحاولة الحالية</button>}
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
