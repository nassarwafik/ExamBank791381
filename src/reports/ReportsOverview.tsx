import { useEffect, useState } from "react";
import { useReport } from "./useReport";
import { LoadingState, ErrorState, EmptyState, ReportNote } from "./ui";
import { pct } from "./format";
import { ClassComparisonChart, PerformanceTrendChart } from "./ReportCharts";
import SegmentedBar from "./SegmentedBar";
import StatCard from "../ui/StatCard";
import { IconRefresh } from "../icons";
import VisuallyHidden from "../ui/VisuallyHidden";
import { GRADED_LABEL, PENDING_LABEL, MISSING_LABEL, monthLabel, type OverviewData } from "./insights";

export const OVERVIEW_NOTE = "الأرقام هنا لصفوفك النشطة فقط، ومبنية على نتيجة آخر محاولة مسلّمة لكل طالب في كل تقييم. التسليمات التي ما زالت بانتظار تصحيح المعلم تُحسب في نسبة التسليم ولا تدخل في أي متوسط؛ وهذه الأرقام ليست درجات نهائية معتمدة.";

export type OverviewResponse = { overview: OverviewData | null; withheld?: string[] };

/**
 * Phase R-5a — the Reports Center hub overview («نظرة عامة»): the teacher's active classes side by side, the totals and a
 * month-by-month trend, from ONE request (`type=overview`). Code-split (it draws charts), and it never blocks the report cards:
 * it has its own loading / error / retry. The academic part withheld for this teacher (`overview: null`) → nothing is shown.
 * The hub unmounts while a report is open, so the Reports Center keeps what was loaded (`kept`, told through `onLoaded`): coming
 * back shows it with no request; «تحديث» drops it (`onDrop`) and asks again.
 */
export default function ReportsOverview({ token, onOpenClass, kept, onLoaded, onDrop }: { token: string; onOpenClass: (classId: string, schoolYear: string) => void; kept: OverviewResponse | null; onLoaded: (data: OverviewResponse) => void; onDrop: () => void }) {
  const [initial] = useState(kept);                              // what was kept when this hub mounted
  const [useKept, setUseKept] = useState(!!initial);
  const { data: fetched, loading, error, reload } = useReport<OverviewResponse>(token, useKept ? null : { type: "overview" });
  useEffect(() => { if (fetched) onLoaded(fetched); }, [fetched]); // eslint-disable-line react-hooks/exhaustive-deps
  const data = useKept ? initial : fetched;
  const refreshNow = () => { onDrop(); if (useKept) setUseKept(false); else reload(); };
  if (data && !data.overview) return null;
  const o = data?.overview || null;
  const split = o ? o.classes.reduce((s, c) => ({ graded: s.graded + c.graded, pending: s.pending + c.pending, missing: s.missing + c.missing }), { graded: 0, pending: 0, missing: 0 }) : null;
  return (
    <section className="eb-reports-overview" aria-labelledby="eb-reports-overview-title">
      <div className="eb-reports-overview-head">
        <div className="eb-reports-group-head">
          <h2 id="eb-reports-overview-title" className="eb-subheading">نظرة عامة</h2>
          <p className="eb-muted">صفوفك النشطة جنبًا إلى جنب: النتائج والتسليم وتطوّرهما.</p>
        </div>
        {o && <button type="button" className="eb-button is-quiet is-small" onClick={refreshNow}><IconRefresh size={16} />تحديث<VisuallyHidden> النظرة العامة</VisuallyHidden></button>}
      </div>
      {error ? <ErrorState text={error} onRetry={reload} />
        : loading || !o ? <LoadingState text="جارٍ تجهيز النظرة العامة..." />
        : !o.classes.length ? <EmptyState text="لا توجد صفوف نشطة بعد." description="تظهر النظرة العامة بعد إنشاء صف ونشر تقييم له." />
        : (
          <div className="eb-overview-body">
            <div className="eb-stat-grid is-primary eb-report-stats">
              <StatCard primary label="الصفوف النشطة" value={o.totals.classes} />
              <StatCard primary label="الطلاب" value={o.totals.students} />
              <StatCard primary label="التقييمات" value={o.totals.assessments} />
              <StatCard primary label="متوسط النتائج" value={pct(o.totals.average)} hint="نتيجة آخر محاولة مسلّمة" />
              <StatCard primary label="نسبة التسليم" value={o.totals.assessments ? pct(o.totals.submissionRate) : "—"} tone="info" />
              <StatCard primary label={PENDING_LABEL} value={o.totals.pendingReview} tone={o.totals.pendingReview > 0 ? "attention" : "neutral"} hint="تسليمات لم تُصحَّح بعد" />
            </div>
            {o.totals.assessments > 0 ? (
              <>
                {split && <SegmentedBar label="حالة التسليمات في كل الصفوف" unit="تسليمًا متوقَّعًا" segments={[
                  { key: "graded", label: GRADED_LABEL, value: split.graded, tone: "success" },
                  { key: "pending", label: PENDING_LABEL, value: split.pending, tone: "info" },
                  { key: "missing", label: MISSING_LABEL, value: split.missing, tone: "neutral" }
                ]} />}
                <div className="eb-report-chart-grid">
                  <ClassComparisonChart level={3} classes={o.classes} />
                  {o.trend.length > 0 && <PerformanceTrendChart level={3} title="التطوّر الشهري" firstColumn="الشهر"
                    description="متوسط النتائج ونسبة التسليم لتقييمات كل شهر، في كل صفوفك النشطة."
                    points={o.trend.map(m => ({ label: monthLabel(m.month), average: m.average, submissionRate: m.submissionRate }))} />}
                </div>
                <ReportNote>{OVERVIEW_NOTE}</ReportNote>
              </>
            ) : <EmptyState text="لا توجد تقييمات منشورة لصفوفك النشطة بعد." />}
            <ul className="eb-overview-classes" aria-label="فتح تقرير صف">
              {o.classes.map(c => (
                <li key={c.classId}>
                  <button type="button" className="eb-button is-quiet is-small" onClick={() => onOpenClass(c.classId, c.schoolYear)}>
                    <VisuallyHidden>فتح تقرير الصف </VisuallyHidden>{c.name}<span className="eb-muted"> · {c.assessments ? pct(c.average) : "بلا تقييمات"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
    </section>
  );
}
