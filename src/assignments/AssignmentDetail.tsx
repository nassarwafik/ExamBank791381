import type { ReactNode, RefObject } from "react";
import { attemptPolicyLabel } from "./attemptPolicy";
import StatCard from "../ui/StatCard";
import StatusBadge from "../ui/StatusBadge";
import EmptyState from "../ui/EmptyState";
import { IconChevronBack } from "../icons";
import { PAGE_TABS, type PageTab } from "./assignmentPage";
import { STATUS_LABEL, type AnalysisSort, type Item, type ItemAnalysis, type QuestionStat, type Stats } from "./types";

export type AssignmentDetailProps = {
  item: Item;
  stats: Stats | null;
  loading: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  // item analysis — lazy, only on request
  analysis: ItemAnalysis | null;
  analysisBusy: boolean;
  analysisSort: AnalysisSort;
  onAnalysisSort: (s: AnalysisSort) => void;
  /** Phase 21G.3 — the page's sections; «تحليل الأسئلة» loads lazily the first time it is chosen. */
  tab: PageTab;
  onTab: (t: PageTab) => void;
  overview: ReactNode;
  /** The assignment's action menu (the same one its hidden list row offers). */
  actions?: ReactNode;
  sortedQuestions: QuestionStat[];
  analysisSummary: { overallAverage: number | null; hardest: QuestionStat | null; easiest: QuestionStat | null } | null;
  fmt: (value: string) => string;
  children: ReactNode;                 // the Gradebook
};

const ANALYSIS_SORTS: Array<[AnalysisSort, string]> = [["number", "رقم السؤال"], ["hardest", "الأصعب أولًا"], ["easiest", "الأسهل أولًا"]];

/**
 * Phase 21G.3 — the FULL-WIDTH assignment page (non-modal; the list waits behind it): back to the list, the header, the four
 * operational StatCards, then one of three sections: «الطلاب» (the gradebook, the default), «نظرة عامة» (distribution, status,
 * settings) and «تحليل الأسئلة» (lazy). The section switch is a pressed-button group (no tab roles, as the UX-5 guard requires).
 */
export default function AssignmentDetail({ headingRef, ...p }: AssignmentDetailProps) {
  const { item, stats } = p;
  const pct = (v: number | null | undefined) => v === null || v === undefined ? "—" : v + "%";
  return (
    <section className="eb-assign-detail is-page" aria-labelledby="eb-assign-detail-title">
      <button type="button" className="eb-button is-ghost is-small eb-assign-back" onClick={p.onClose}><IconChevronBack size={16} />العودة إلى الواجبات</button>
      <div className="eb-assign-detail-head">
        <div className="eb-assign-detail-text">
          <h2 id="eb-assign-detail-title" ref={headingRef} tabIndex={-1} className="eb-assign-detail-title">{item.title}</h2>
          <div className="eb-assign-detail-meta">
            <StatusBadge tone={item.status === "published" ? "success" : item.status === "archived" ? "neutral" : "warn"} className={"assignment-status " + item.status}>{STATUS_LABEL[item.status]}</StatusBadge>
            <span>{item.className || "—"}</span>
            <span>يفتح: {p.fmt(item.openAt)}</span>
            <span>التسليم: {p.fmt(item.dueAt)}</span>
            <span>{item.maxAttempts || 1} محاولة</span>
            <span>{item.durationMinutes ? "مؤقّت · " + item.durationMinutes + " دقيقة" : "بدون مؤقت"}</span>
            <span>طريقة المحاولة: {attemptPolicyLabel(item.attemptPolicy)}</span>
          </div>
        </div>
        {p.actions && <div className="eb-assign-detail-actions">{p.actions}</div>}
      </div>

      {p.loading && !stats && <div className="platform-loading" role="status">جارٍ تحميل النتائج...</div>}
      {stats && (
        <div className="eb-assign-stats">
          <div className="eb-stat-grid is-primary gradebook-stats">
            <StatCard primary label="تم التسليم" value={stats.submitted + "/" + stats.students} tone="info" />
            <StatCard primary label="بانتظار التصحيح" value={stats.pendingReview} tone={stats.pendingReview ? "attention" : "neutral"} />
            <StatCard primary label="نهائي" value={stats.finalized ?? 0} tone="success" />
            <StatCard primary label="لم يسلّم" value={stats.notSubmitted ?? 0} />
          </div>
          <p className="eb-assign-stats-hints"><span>المعدل <b>{pct(stats.average)}</b></span><span>الأعلى <b>{pct(stats.highest)}</b></span><span>الأدنى <b>{pct(stats.lowest)}</b></span><span>قيد المحاولة <b>{stats.active ?? 0}</b></span></p>
        </div>
      )}

      <div className="eb-segmented eb-assign-sections" role="group" aria-label="أقسام الواجب">
        {PAGE_TABS.map(t => <button key={t.key} type="button" aria-pressed={p.tab === t.key} onClick={() => p.onTab(t.key)}>{t.label}</button>)}
      </div>

      {p.tab === "students" && p.children}
      {p.tab === "overview" && p.overview}

      {p.tab === "analysis" && p.analysisBusy && <div className="platform-loading" role="status">جارٍ تحليل الأسئلة...</div>}
      {p.tab === "analysis" && p.analysis && (
        <section className="eb-item-analysis" aria-labelledby="eb-item-analysis-title">
          <h3 id="eb-item-analysis-title" className="eb-subheading">تحليل الأسئلة</h3>
          <div className="eb-stat-grid is-secondary gradebook-stats">
            <StatCard label="طلاب في التحليل" value={p.analysis.studentsSubmitted + "/" + p.analysis.studentsInClass} hint={p.analysis.attemptsAnalyzed + " محاولة"} />
            <StatCard label="متوسط عام" value={p.analysisSummary?.overallAverage === null || p.analysisSummary?.overallAverage === undefined ? "—" : p.analysisSummary.overallAverage + "%"} />
            <StatCard label="أصعب سؤال" value={p.analysisSummary?.hardest ? "س" + p.analysisSummary.hardest.number : "—"} tone="danger" />
            <StatCard label="أسهل سؤال" value={p.analysisSummary?.easiest ? "س" + p.analysisSummary.easiest.number : "—"} tone="success" />
          </div>
          <div className="item-analysis-sort eb-chip-group" role="group" aria-label="ترتيب الأسئلة">
            {ANALYSIS_SORTS.map(([s, label]) => <button key={s} type="button" className={"gradebook-chip" + (p.analysisSort === s ? " active" : "")} aria-pressed={p.analysisSort === s} onClick={() => p.onAnalysisSort(s)}>{label}</button>)}
          </div>
          {p.sortedQuestions.length ? (
            <div className="students-table-wrap"><table className="students-table item-analysis-table">
              <thead><tr><th scope="col">#</th><th scope="col">نص السؤال</th><th scope="col">عدد الطلاب</th><th scope="col">نسبة الصحيح</th><th scope="col">متوسط العلامة</th><th scope="col">متوسط %</th><th scope="col">الصعوبة</th><th scope="col">مراجعة يدوية</th></tr></thead>
              <tbody>{p.sortedQuestions.map(q => <tr key={q.questionId}><td>{q.number}</td><td className="item-analysis-text">{q.text && q.text.length > 60 ? q.text.slice(0, 60) + "…" : q.text || "—"}</td><td>{q.studentsAnalyzed}</td><td>{q.correctRate === null ? "—" : q.correctRate + "%"}</td><td>{q.averageScore === null ? "—" : q.averageScore + "/" + q.maxMarks}</td><td>{q.averagePercentage === null ? "—" : q.averagePercentage + "%"}</td><td>{q.difficulty ? <StatusBadge tone={q.difficulty === "easy" ? "success" : q.difficulty === "medium" ? "warn" : "danger"} className={"difficulty-badge " + q.difficulty}>{q.difficulty === "easy" ? "سهل" : q.difficulty === "medium" ? "متوسط" : "صعب"}</StatusBadge> : "—"}</td><td>{q.manualReviewCount > 0 ? q.manualReviewCount : "—"}</td></tr>)}</tbody>
            </table></div>
          ) : <EmptyState compact title="لا توجد أسئلة لتحليلها." description="يظهر التحليل بعد وجود محاولات مسلّمة على أسئلة هذا الواجب." />}
        </section>
      )}
    </section>
  );
}
