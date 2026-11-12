import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler } from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { useReport } from "./useReport";
import { ReportHeader, ReportNote, ReportTable, LoadingState, ErrorState, EmptyState, SortHeader, TableSearch } from "./ui";
import { useTableSort } from "./useTableSort";
import { sortRows, matchesQuery } from "./tableTools";
import { pct, isoDay } from "./format";
import { downloadCsv } from "./csv";
import { resolveTrack } from "./trackState";
import * as csvRows from "./reportCsv";
import { PerformanceTrendChart, SubmissionStatusChart, StudentStandingChart, StudentTrendChart, GapToClassChart, StageStatusChart, WeeklyChangeChart } from "./ReportCharts";
import SegmentedBar from "./SegmentedBar";
import { usePrefersReducedMotion } from "../ui/usePrefersReducedMotion";
import { GRADED_LABEL, latestChange, signed, projectStudentSplit, gradedValue, gapToClass, finiteOrNull, type ClassInsights, type StudentInsights, type StudentStanding, type StudentAssessmentPoint } from "./insights";
import { stageStatusLabel } from "../projects/teacherPresentation";
import ProjectAnalyticsCharts from "../projects/ProjectAnalyticsCharts";
import { reportPalette, chartMotion, percentLineOptions, barOptions as kitBarOptions, barSeries, lineSeries } from "./chartKit";
import ChartCard from "../ui/ChartCard";
import StatCard from "../ui/StatCard";
import StatusBadge from "../ui/StatusBadge";
import ProgressBar from "../ui/ProgressBar";
import VisuallyHidden from "../ui/VisuallyHidden";
import { toneForTrack } from "../projects/teacherPresentation";
import type { ProjectAnalytics as AnalyticsData, TrackMeta } from "../projects/types";
import type { AssignmentDrillTarget } from "../assignments/drillTarget";
import { reasonText, criteriaText, type FollowUp, type FollowUpStudent } from "./followUp";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

export type ReportType = "class" | "student" | "assignments" | "project" | "track" | "ready" | "delayed" | "timeline";
export type Filters = { schoolYear: string; classId: string; studentId: string; projectCode: string; track: string; from: string; to: string };

/** Truthful meaning of every assessment number the Reports API returns (latest submitted attempt, not a final grade). */
export const LATEST_ATTEMPT_LABEL = "نتيجة آخر محاولة مسلّمة";
// Phase R-1 (owner decision D-1): a result still awaiting the teacher is «بانتظار التصحيح» — handed in (counted in the submission
// rate) but never a zero and never in an average or a distribution; the API sends it with no percentage.
export const LATEST_ATTEMPT_NOTE = "الأرقام هنا هي نتيجة آخر محاولة مسلّمة لكل طالب كما يعيدها نظام التقارير. التسليمات التي ما زالت بانتظار تصحيح المعلم تظهر «بانتظار التصحيح» ولا تدخل في المتوسط أو التوزيع؛ وهذه الأرقام ليست درجات نهائية معتمدة.";
export const AVERAGE_NOTE = "المتوسطات ونسب التوزيع مبنية على نتيجة آخر محاولة مسلّمة لكل طالب في كل تقييم (ضمن الفترة المختارة)؛ التسليمات التي ما زالت بانتظار تصحيح المعلم تُحسب في نسبة التسليم لكنها لا تدخل في المتوسط.";
const MISSING_LABEL = "لم يسلّم";
const PENDING_LABEL = "بانتظار التصحيح";
/** The average's hint: what it means, plus how many results awaiting the teacher it leaves out (when any). */
const averageHint = (pending: number | undefined) => pending ? "لا يشمل " + pending + " " + PENDING_LABEL : LATEST_ATTEMPT_LABEL;

// Adds date-range params (from/to) to a report request when present.
function withRange(params: Record<string, string>, f: Filters): Record<string, string> {
  const out = { ...params };
  if (f.from) out.from = f.from;
  if (f.to) out.to = f.to;
  return out;
}

function usePalette() { return useMemo(() => reportPalette(), []); }

/* ---------------- Academic ---------------- */

type ClassProjectSection = { projectCode: string; title: string; tracks: TrackMeta[]; avgOverall: number; trackAverages: Record<string, number>; completedCount: number; notStartedCount?: number; studentCount?: number };

// Phase R-5a — the three states of a student × assessment cell, as one bar (the same wording as the assessments matrix).
function submissionSegments(split: { graded: number; pending: number; missing: number }) {
  return [
    { key: "graded", label: GRADED_LABEL, value: split.graded, tone: "success" as const },
    { key: "pending", label: PENDING_LABEL, value: split.pending, tone: "info" as const },
    { key: "missing", label: MISSING_LABEL, value: split.missing, tone: "neutral" as const }
  ];
}

function ProjectSummaryCard({ title, tracks, overall, trackValues, footer, level = 4, children }: { title: string; tracks: TrackMeta[]; overall: number; trackValues: Record<string, number>; footer?: ReactNode; level?: 3 | 4; children?: ReactNode }) {
  const H = level === 3 ? "h3" : "h4";
  return (
    <section className="eb-report-project" aria-label={title}>
      <H className="eb-subheading">{title}</H>
      <ProgressBar label="التقدم العام" value={overall} tone="primary" />
      <div className="eb-report-track-bars">
        {tracks.map((t, i) => <ProgressBar key={t.trackId} label={t.title} value={trackValues[t.trackId] || 0} tone={toneForTrack(i)} size="sm" />)}
      </div>
      {children}
      {footer && <p className="eb-report-project-foot">{footer}</p>}
    </section>
  );
}

// Phase R-5c — «طلاب يحتاجون متابعة». The server decided who is here and why (the owner's criteria); this only shows it: each
// reason in words with its own number (a reason this client does not know is left out, never guessed), the criteria in one
// sentence, and a way to the student's own report. Neutral wording: nobody here is "failing" — there is no pass mark.
function FollowUpSection({ followUp, onOpenStudent }: { followUp: FollowUp; onOpenStudent?: (studentId: string) => void }) {
  const rows = useMemo(() => followUp.students.map(s => ({ ...s, texts: s.reasons.map(reasonText).filter((t): t is string => t !== null) })).filter(s => s.texts.length > 0), [followUp]);
  type R = FollowUpStudent & { texts: string[] };
  return (
    <section className="eb-report-follow-up" aria-labelledby="eb-report-follow-up-title">
      <h3 id="eb-report-follow-up-title" className="eb-subheading">طلاب يحتاجون متابعة <StatusBadge tone={rows.length ? "warn" : "neutral"}>{rows.length}</StatusBadge></h3>
      <ReportNote>{criteriaText(followUp.criteria, followUp.classAverage)}</ReportNote>
      {rows.length === 0
        ? <EmptyState text="لا يوجد طالب تنطبق عليه معايير المتابعة في هذه الفترة." />
        : <ReportTable<R> capped caption="طلاب يحتاجون متابعة: الأسباب ومتوسط النتائج المصحَّحة وعدد التقييمات غير المسلَّمة" search={{ label: "بحث عن طالب", text: r => r.displayName }} columns={[
            { key: "displayName", label: "الطالب", sortValue: r => r.displayName },
            { key: "reasons", label: "الأسباب", render: r => <span className="eb-report-reasons">{r.texts.map((t, i) => <StatusBadge key={i} tone="warn">{t}</StatusBadge>)}</span>, sortValue: r => r.texts.length, numeric: false },
            { key: "average", label: "المتوسط", render: r => pct(r.average), numeric: true, sortValue: r => finiteOrNull(r.average) },
            { key: "missing", label: MISSING_LABEL, numeric: true, sortValue: r => r.missing },
            ...(onOpenStudent ? [{ key: "open", label: "فتح", render: (r: R) => <button type="button" className="eb-button is-quiet is-small eb-report-noprint" onClick={() => onOpenStudent(r.studentId)}>تقرير الطالب<VisuallyHidden> — {r.displayName}</VisuallyHidden></button> }] : [])
          ]} rows={rows} />}
    </section>
  );
}

function ClassReport({ token, filters, onOpenStudent }: { token: string; filters: Filters; onOpenStudent?: (studentId: string) => void }) {
  type Resp = { class: { name: string; schoolYear: string; status: string; studentCount: number }; kpis: { assignments: number; averageScore: number | null; submissionRate: number; pendingReview?: number } | null; insights?: ClassInsights | null; projects: ClassProjectSection[]; withheld?: string[] };
  const { data, loading, error, reload } = useReport<Resp>(token, filters.classId ? withRange({ type: "class", classId: filters.classId }, filters) : null);
  if (!filters.classId) return <EmptyState text="اختر صفًا لعرض تقريره." description="سيعرض التقرير أرقام الصف، تطوّر متوسطه ونسبة تسليمه من تقييم لآخر، ترتيب الطلاب، وتقدّمه في مشاريعه." />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (loading || !data) return <LoadingState />;
  const archived = data.class.status === "archived";
  // CSV parity: the exact legacy KPI labels/values (unchanged since the first Reports release).
  const csvKpis: csvRows.Kpi[] = [
    { label: "الحالة", value: archived ? "مؤرشف" : "نشط" },
    { label: "عدد الطلاب", value: data.class.studentCount },
    // Tadris+ P7-A1 — `kpis: null`: the teacher's access does not include assignments, so the server did not compute them.
    ...(data.kpis ? [
      { label: "عدد الواجبات", value: data.kpis.assignments },
      { label: "متوسط العلامات", value: pct(data.kpis.averageScore) },
      { label: "نسبة التسليم", value: pct(data.kpis.submissionRate) }
    ] : [])
  ];
  const kpis = data.kpis;
  // Phase R-5a — the chart series (academic part; absent on an older API or when withheld → the report is the figures alone).
  const insights = kpis ? data.insights || null : null;
  return (
    <div className="eb-report-result">
      <ReportHeader title={<>{data.class.name} <StatusBadge tone={archived ? "neutral" : "success"}>{archived ? "مؤرشف" : "نشط"}</StatusBadge></>} description={data.class.schoolYear}
        onExportCsv={() => downloadCsv(csvRows.classReportFilename(data), csvRows.classReportRows(csvKpis, data))} />
      <div className="eb-stat-grid is-primary eb-report-stats">
        <StatCard primary label="الطلاب" value={data.class.studentCount} />
        {kpis && <>
          <StatCard primary label="التقييمات" value={kpis.assignments} hint="ضمن الفترة المختارة" />
          <StatCard primary label="متوسط النتائج" value={pct(kpis.averageScore)} hint={averageHint(kpis.pendingReview)} />
          <StatCard primary label="نسبة التسليم" value={pct(kpis.submissionRate)} tone="info" />
        </>}
      </div>
      {kpis && <ReportNote>{AVERAGE_NOTE}</ReportNote>}
      {insights && insights.assessments.length > 0 && (
        <section className="eb-report-insights" aria-labelledby="eb-report-class-insights">
          <h3 id="eb-report-class-insights" className="eb-subheading">تطوّر الصف في التقييمات</h3>
          <SegmentedBar label="حالة التسليمات" unit="تسليمًا متوقَّعًا" segments={submissionSegments(insights.submission)} />
          <div className="eb-report-chart-grid">
            <PerformanceTrendChart title="تطوّر الأداء عبر التقييمات" firstColumn="التقييم" description="متوسط النتائج ونسبة التسليم في كل تقييم، من الأقدم إلى الأحدث."
              points={insights.assessments.map(a => ({ label: a.title, detail: a.date, average: a.average, submissionRate: a.submissionRate }))} />
            <SubmissionStatusChart rows={insights.assessments} />
          </div>
          <StudentStandingChart standings={insights.students} />
          {/* Phase R-5b — the spread of the students' averages, and the students as a table that sorts and searches. */}
          {insights.summary && insights.summary.withAverage > 0 && (
            <div className="eb-stat-grid is-primary eb-report-stats">
              <StatCard primary label="أعلى متوسط" value={pct(insights.summary.highest?.average)} hint={insights.summary.highest?.displayName} tone="success" />
              <StatCard primary label="الوسيط" value={pct(insights.summary.median)} hint={"من " + insights.summary.withAverage + " بنتيجة مصحَّحة"} />
              <StatCard primary label="أدنى متوسط" value={pct(insights.summary.lowest?.average)} hint={insights.summary.lowest?.displayName} tone="attention" />
              <StatCard primary label="الانحراف المعياري" value={insights.summary.stdDev === null ? "—" : String(insights.summary.stdDev)} hint="تباعد متوسطات الطلاب (نقاط مئوية)" />
            </div>
          )}
          {insights.followUp && <FollowUpSection followUp={insights.followUp} onOpenStudent={onOpenStudent} />}
          <section aria-labelledby="eb-report-class-students">
            <h3 id="eb-report-class-students" className="eb-subheading">طلاب الصف</h3>
            <ReportTable<StudentStanding> capped caption="طلاب الصف: متوسط النتائج المصحَّحة وعدد التقييمات في كل حالة" search={{ label: "بحث عن طالب", text: r => r.displayName }} columns={[
              { key: "displayName", label: "الطالب", sortValue: r => r.displayName },
              { key: "average", label: "المتوسط", render: r => pct(r.average), numeric: true, sortValue: r => finiteOrNull(r.average) },
              { key: "graded", label: GRADED_LABEL, numeric: true, sortValue: r => r.graded },
              { key: "pending", label: PENDING_LABEL, numeric: true, sortValue: r => r.pending },
              { key: "missing", label: MISSING_LABEL, numeric: true, sortValue: r => r.missing }
            ]} rows={insights.students} empty="لا يوجد طلاب في هذا الصف." />
          </section>
        </section>
      )}
      {data.projects.length > 0 && (
        <section className="eb-report-projects" aria-labelledby="eb-report-class-projects">
          <h3 id="eb-report-class-projects" className="eb-subheading">مشاريع الصف</h3>
          {/* Each project reported independently — never combine two projects into one % */}
          <div className="eb-report-project-grid">
            {data.projects.map(p => {
              const split = projectStudentSplit(p);
              return (
                <ProjectSummaryCard key={p.projectCode} title={p.title} tracks={p.tracks} overall={p.avgOverall} trackValues={p.trackAverages} footer={<><StatusBadge tone="success">مكتملون {p.completedCount}</StatusBadge>{p.notStartedCount ? <>{" "}<StatusBadge tone="warn">لم يبدأوا {p.notStartedCount}</StatusBadge></> : null}</>}>
                  {split && <SegmentedBar label="الطلاب حسب الحالة" unit="طالبًا" segments={[
                    { key: "completed", label: "أكملوا المشروع", value: split.completed, tone: "success" },
                    { key: "inProgress", label: "قيد التنفيذ", value: split.inProgress, tone: "info" },
                    { key: "notStarted", label: "لم يبدأوا بعد", value: split.notStarted, tone: "neutral" }
                  ]} />}
                </ProjectSummaryCard>
              );
            })}
          </div>
          <ReportNote>بيانات التقييمات حسب الفترة المختارة؛ بيانات المشاريع تمثل الوضع الحالي.</ReportNote>
        </section>
      )}
    </div>
  );
}

type StudentProjectSection = { projectCode: string; title: string; tracks: TrackMeta[]; summary: { overallProgress: number; trackProgress: Record<string, number>; counts: Record<string, number>; complete: boolean }; nextStages?: Record<string, { stageId: string; title: string } | null>; lastActivity: string; balance: { leadingTrackTitle: string; laggingTrackTitle: string; diff: number } | null };

function StudentReport({ token, filters }: { token: string; filters: Filters }) {
  type Resp = { student: { displayName: string; className: string; schoolYear: string }; academic: { average: number | null; submittedCount: number; assessmentCount: number; submissionRate: number; pendingCount?: number } | null; insights?: StudentInsights | null; projects: StudentProjectSection[]; withheld?: string[] };
  const { data, loading, error, reload } = useReport<Resp>(token, filters.studentId ? withRange({ type: "student", studentId: filters.studentId, ...(filters.classId ? { classId: filters.classId } : {}) }, filters) : null);
  if (!filters.studentId) return <EmptyState text="اختر طالبًا لعرض تقريره." description="اختر الصف ثم الطالب. سيعرض التقرير نتائجه في كل تقييم بجانب متوسط الصف، حالة كل تقييم، وتقدّمه في مشاريع صفه." />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (loading || !data) return <LoadingState />;
  const csvKpis: csvRows.Kpi[] = [
    { label: "الصف", value: data.student.className || "—" },
    // Tadris+ P7-A1 — `academic: null`: not part of this teacher's access (the server did not compute it).
    ...(data.academic ? [
      { label: "متوسط التقييمات", value: pct(data.academic.average) },
      { label: "المسلَّمة", value: data.academic.submittedCount + " / " + data.academic.assessmentCount },
      { label: "نسبة التسليم", value: pct(data.academic.submissionRate) }
    ] : [])
  ];
  const academic = data.academic, projectsWithheld = (data.withheld || []).includes("projects");
  // Phase R-5a — the chart series (academic part; absent on an older API or when withheld → the report is the figures alone).
  const insights = academic ? data.insights || null : null;
  return (
    <div className="eb-report-result">
      <ReportHeader title={data.student.displayName} description={(data.student.className || "—") + " · " + data.student.schoolYear}
        onExportCsv={() => downloadCsv(csvRows.studentReportFilename(data), csvRows.studentReportRows(csvKpis, data))} />
      <div className="eb-stat-grid is-primary eb-report-stats">
        {academic && <>
          <StatCard primary label="متوسط التقييمات" value={pct(academic.average)} hint={averageHint(academic.pendingCount)} />
          <StatCard primary label="المسلَّمة" value={academic.submittedCount + " / " + academic.assessmentCount} hint="من تقييمات الفترة المختارة" />
          <StatCard primary label="نسبة التسليم" value={pct(academic.submissionRate)} tone="info" />
        </>}
        {!projectsWithheld && <StatCard primary label="مشاريع الصف" value={data.projects.length} />}
      </div>
      {academic && <ReportNote>{AVERAGE_NOTE}</ReportNote>}
      {insights && insights.assessments.length > 0 && (
        <section className="eb-report-insights" aria-labelledby="eb-report-student-insights">
          <h3 id="eb-report-student-insights" className="eb-subheading">تطوّر الطالب في التقييمات</h3>
          <SegmentedBar label="حالة تقييمات الطالب" unit="تقييمًا" segments={submissionSegments(insights.submission)} />
          <div className="eb-report-chart-grid">
            <StudentTrendChart points={insights.assessments} />
            <GapToClassChart points={insights.assessments} />
          </div>
          {/* Phase R-5b — every assessment of the student as a row: state, result, class average, gap, attempts. */}
          <section aria-labelledby="eb-report-student-assessments">
            <h3 id="eb-report-student-assessments" className="eb-subheading">تقييمات الطالب</h3>
            <StudentAssessmentsTable points={insights.assessments} />
          </section>
        </section>
      )}
      {data.projects.length > 0 && (
        <section className="eb-report-projects" aria-labelledby="eb-report-student-projects">
          <h3 id="eb-report-student-projects" className="eb-subheading">المشاريع</h3>
          <div className="eb-report-project-grid">
            {data.projects.map(p => (
              <ProjectSummaryCard key={p.projectCode} title={p.title} tracks={p.tracks} overall={p.summary.overallProgress} trackValues={p.summary.trackProgress}
                footer={<>
                  <StatusBadge tone="success">معتمدة {p.summary.counts.approved}</StatusBadge>{" "}
                  <StatusBadge tone="info">جاهزة للفحص {p.summary.counts.ready_for_review}</StatusBadge>
                  {p.summary.complete && <> <StatusBadge tone="success">مكتمل</StatusBadge></>}
                  {p.lastActivity ? <span className="eb-muted"> · آخر نشاط {isoDay(p.lastActivity)}</span> : null}
                  {p.nextStages && p.tracks.map(t => { const n = p.nextStages?.[t.trackId]; return n ? <span key={t.trackId} className="eb-muted"> · التالي في {t.title}: {n.stageId} — {n.title}</span> : null; })}
                  {p.balance && <span className="eb-report-balance" role="status"> · {p.balance.leadingTrackTitle} متقدّم على {p.balance.laggingTrackTitle} بـ {p.balance.diff}%</span>}
                </>}>
                <SegmentedBar label="المراحل حسب الحالة" unit="مرحلة" segments={[
                  { key: "approved", label: stageStatusLabel("approved"), value: p.summary.counts.approved || 0, tone: "success" },
                  { key: "ready_for_review", label: stageStatusLabel("ready_for_review"), value: p.summary.counts.ready_for_review || 0, tone: "info" },
                  { key: "in_progress", label: stageStatusLabel("in_progress"), value: p.summary.counts.in_progress || 0, tone: "warn" },
                  { key: "not_started", label: stageStatusLabel("not_started"), value: p.summary.counts.not_started || 0, tone: "neutral" }
                ]} />
              </ProjectSummaryCard>
            ))}
          </div>
          <ReportNote>متوسط التقييمات حسب الفترة المختارة؛ بيانات المشاريع تمثل الوضع الحالي.</ReportNote>
        </section>
      )}
    </div>
  );
}

// Phase R-5b — one row per assessment of the student. A number appears ONLY for a final result (gradedValue); awaiting the
// teacher and not handed in are a badge in words with «—» for the result, and they sort last in both directions.
function StudentAssessmentsTable({ points }: { points: StudentAssessmentPoint[] }) {
  const gaps = useMemo(() => gapToClass(points), [points]);
  const rows = useMemo(() => points.map((p, i) => ({ ...p, result: gradedValue(p), gap: gaps[i] })), [points, gaps]);
  type R = (typeof rows)[number];
  const state = (r: R) => (r.state === "missing" ? <StatusBadge tone="neutral">{MISSING_LABEL}</StatusBadge> : r.result === null ? <StatusBadge tone="info">{PENDING_LABEL}</StatusBadge> : <StatusBadge tone="success">{GRADED_LABEL}</StatusBadge>);
  return (
    <ReportTable<R> capped caption={"تقييمات الطالب: الحالة و" + LATEST_ATTEMPT_LABEL + " ومتوسط الصف والفرق وعدد المحاولات"} columns={[
      { key: "title", label: "التقييم", sortValue: r => r.title },
      { key: "date", label: "التاريخ", render: r => r.date || "—", sortValue: r => r.date || null },
      { key: "state", label: "الحالة", render: state, sortValue: r => (r.state === "missing" ? 2 : r.result === null ? 1 : 0) },
      { key: "result", label: "النتيجة", render: r => pct(r.result), numeric: true, sortValue: r => r.result },
      { key: "classAverage", label: "متوسط الصف", render: r => pct(r.classAverage), numeric: true, sortValue: r => finiteOrNull(r.classAverage) },
      { key: "gap", label: "الفرق عن الصف", render: r => (r.gap === null ? "—" : signed(r.gap)), numeric: true, sortValue: r => r.gap },
      { key: "attempts", label: "المحاولات", numeric: true, sortValue: r => r.attempts }
    ]} rows={rows} empty="لا توجد تقييمات ضمن الفترة المختارة." />
  );
}

function AssignmentsReport({ token, filters, onOpenAssignment }: { token: string; filters: Filters; onOpenAssignment?: (target: AssignmentDrillTarget) => void }) {
  // Phase R-5b — the row's day and highest / lowest / median are optional: an API that does not send them shows the earlier columns.
  type Row = csvRows.AssignmentRow & { assignmentId: string; date?: string; highest?: number | null; lowest?: number | null; median?: number | null };
  type Cell = { studentId: string; state: string; percentage: number | null; zero?: boolean };
  type Resp = { class: { name: string }; students: { studentId: string; displayName: string }[]; overall: { assessmentCount: number; participants: number; pendingReview?: number; average: number | null; submissionRate: number; distribution: Record<string, number> }; perAssignment: Row[]; matrix: { assignmentId: string; title: string; cells: Cell[] }[] };
  const { data, loading, error, reload } = useReport<Resp>(token, filters.classId ? withRange({ type: "assignments", classId: filters.classId }, filters) : null);
  const palette = usePalette();
  const distLabels = useMemo(() => data ? Object.keys(data.overall.distribution) : [], [data]);
  const dist = useMemo(() => data && ({ labels: distLabels, datasets: [barSeries("عدد التسليمات", distLabels.map(k => data.overall.distribution[k]), palette.series[0], palette)] }), [data, distLabels, palette]);
  // One lookup per matrix column (studentId → cell) instead of a linear search per rendered cell.
  const cellsByAssignment = useMemo(() => new Map((data?.matrix || []).map(m => [m.assignmentId, new Map(m.cells.map(c => [c.studentId, c]))])), [data]);
  // Phase R-5b — the matrix sorts by the student or by any assessment, and finds a student. Only a FINAL result is a sort value:
  // pending, missing or unknown cells are empty, so they stay last in both directions (never ordered as a 0).
  const matrixSort = useTableSort();
  const [matrixQuery, setMatrixQuery] = useState("");
  const matrixStudents = useMemo(() => {
    const all = data?.students || [];
    const found = matrixQuery.trim() ? all.filter(s => matchesQuery(s.displayName, matrixQuery)) : all;
    const sort = matrixSort.sort;
    if (!sort) return found;
    if (sort.key === "student") return sortRows(found, s => s.displayName, sort.dir);
    const cells = cellsByAssignment.get(sort.key);
    return sortRows(found, s => { const c = cells?.get(s.studentId); return c && c.state === "submitted" ? finiteOrNull(c.percentage) : null; }, sort.dir);
  }, [data, matrixQuery, matrixSort.sort, cellsByAssignment]);
  const withSpread = !!data && data.perAssignment.some(r => r.highest !== undefined);
  const withDate = !!data && data.perAssignment.some(r => !!r.date);
  // Phase R-5a — the same look and entrance as the other report charts (one series: its title names it, so no legend box).
  const reduced = usePrefersReducedMotion();
  const barOptions = useMemo(() => kitBarOptions(palette, chartMotion(reduced, distLabels.length), distLabels.map(k => "النطاق " + k + "%"), { unit: "تسليم" }), [palette, reduced, distLabels]);
  if (!filters.classId) return <EmptyState text="اختر صفًا." description="سيعرض التقرير متوسط كل تقييم ونسبة تسليمه، توزيع النتائج، ومصفوفة الطالب × التقييم." />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (loading || !data) return <LoadingState />;
  return (
    <div className="eb-report-result">
      <ReportHeader title={data.class.name} description={"تقييمات الصف ضمن الفترة المختارة — " + LATEST_ATTEMPT_LABEL}
        onExportCsv={() => downloadCsv(csvRows.assignmentsReportFilename(data.class.name), csvRows.assignmentsReportRows(data.perAssignment))} />
      <div className="eb-stat-grid is-primary eb-report-stats">
        <StatCard primary label="التقييمات" value={data.overall.assessmentCount} />
        <StatCard primary label="التسليمات" value={data.overall.participants} hint="طالب × تقييم" />
        <StatCard primary label="متوسط النتائج" value={pct(data.overall.average)} hint={averageHint(data.overall.pendingReview)} />
        <StatCard primary label="نسبة التسليم" value={pct(data.overall.submissionRate)} tone="info" />
      </div>
      <ReportNote>{LATEST_ATTEMPT_NOTE}</ReportNote>
      {data.perAssignment.length > 0 && (
        <div className="eb-report-chart-grid">
          <PerformanceTrendChart title="تطوّر الأداء عبر التقييمات" firstColumn="التقييم" description="متوسط النتائج ونسبة التسليم في كل تقييم، من الأقدم إلى الأحدث."
            points={data.perAssignment.map(a => ({ label: a.title, average: a.average, submissionRate: a.submissionRate }))} />
          <SubmissionStatusChart rows={data.perAssignment} />
        </div>
      )}
      <ChartCard level={3} title="توزيع النتائج" description={"عدد التسليمات في كل نطاق (%) — " + LATEST_ATTEMPT_LABEL} table={{ columns: ["النطاق %", "عدد التسليمات"], rows: distLabels.map(k => [k, data.overall.distribution[k]]) }}>
        {dist && <div className="eb-chart-canvas"><Bar data={dist} options={barOptions} aria-hidden="true" /></div>}
      </ChartCard>
      <section aria-labelledby="eb-report-per-assignment">
        <h3 id="eb-report-per-assignment" className="eb-subheading">ملخص كل تقييم</h3>
        <ReportTable<Row> capped caption="ملخص كل تقييم: نسبة التسليم والمتوسط وعدد المسلِّمين" columns={[
          { key: "title", label: "التقييم", sortValue: r => r.title },
          ...(withDate ? [{ key: "date", label: "التاريخ", render: (r: Row) => r.date || "—", sortValue: (r: Row) => r.date || null }] : []),
          { key: "submissionRate", label: "نسبة التسليم", render: r => pct(r.submissionRate), numeric: true, sortValue: r => r.submissionRate },
          { key: "submitted", label: "مُسلَّم", numeric: true, sortValue: r => r.submitted }, { key: "missing", label: MISSING_LABEL, numeric: true, sortValue: r => r.missing },
          { key: "pendingReview", label: PENDING_LABEL, render: r => String(r.pendingReview ?? 0), numeric: true, sortValue: r => r.pendingReview ?? 0 }, { key: "zeroScores", label: "سلّم بعلامة صفر", numeric: true, sortValue: r => r.zeroScores },
          { key: "average", label: "المتوسط (" + LATEST_ATTEMPT_LABEL + ")", render: r => pct(r.average), numeric: true, sortValue: r => finiteOrNull(r.average) },
          ...(withSpread ? [
            { key: "highest", label: "الأعلى", render: (r: Row) => pct(r.highest), numeric: true, sortValue: (r: Row) => finiteOrNull(r.highest) },
            { key: "median", label: "الوسيط", render: (r: Row) => pct(r.median), numeric: true, sortValue: (r: Row) => finiteOrNull(r.median) },
            { key: "lowest", label: "الأدنى", render: (r: Row) => pct(r.lowest), numeric: true, sortValue: (r: Row) => finiteOrNull(r.lowest) }
          ] : []),
          { key: "avgAttempts", label: "متوسط المحاولات", numeric: true, sortValue: r => r.avgAttempts },
          // Phase R-5d — from a row to that exact assignment's gradebook (the shell's own drill: identifiers and intent only).
          ...(onOpenAssignment ? [{ key: "open", label: "فتح", render: (r: Row) => (
            <span className="eb-report-row-actions eb-report-noprint">
              <button type="button" className="eb-button is-quiet is-small" onClick={() => onOpenAssignment({ assignmentId: r.assignmentId, mode: "assignment" })}>دفتر الدرجات<VisuallyHidden> — {r.title}</VisuallyHidden></button>
              {(r.pendingReview ?? 0) > 0 && <button type="button" className="eb-button is-quiet is-small" onClick={() => onOpenAssignment({ assignmentId: r.assignmentId, mode: "pendingReview" })}>{PENDING_LABEL} ({r.pendingReview})<VisuallyHidden> — {r.title}</VisuallyHidden></button>}
              {r.missing > 0 && <button type="button" className="eb-button is-quiet is-small" onClick={() => onOpenAssignment({ assignmentId: r.assignmentId, mode: "notSubmitted" })}>{MISSING_LABEL} ({r.missing})<VisuallyHidden> — {r.title}</VisuallyHidden></button>}
            </span>
          ) }] : [])
        ]} rows={data.perAssignment} empty="لا توجد تقييمات ضمن الفترة المختارة." />
      </section>
      {data.matrix.length > 0 && (
        <section className="eb-report-matrix-section" aria-labelledby="eb-report-matrix-title">
          <h3 id="eb-report-matrix-title" className="eb-subheading">مصفوفة الطالب × التقييم</h3>
          <TableSearch label="بحث عن طالب" value={matrixQuery} onChange={setMatrixQuery} shown={matrixStudents.length} total={data.students.length} />
          <p className="eb-muted eb-report-legend">القيمة = {LATEST_ATTEMPT_LABEL} (%) · 0 = سلّم بعلامة صفر · «{PENDING_LABEL}» = سلّم والنتيجة لم تُصحَّح بعد · «{MISSING_LABEL}» = لا توجد محاولة مسلّمة</p>
          <div className="eb-report-table-scroll" role="region" aria-labelledby="eb-report-matrix-title" tabIndex={0}>
            <table className="eb-report-table eb-report-matrix">
              <caption className="eb-visually-hidden">مصفوفة الطالب × التقييم — {LATEST_ATTEMPT_LABEL} بالنسبة المئوية لكل طالب في كل تقييم؛ «{MISSING_LABEL}» تعني عدم وجود محاولة مسلّمة</caption>
              <thead><tr><SortHeader label="الطالب" sortKey="student" sort={matrixSort.sort} onToggle={matrixSort.toggle} />{data.matrix.map(m => <SortHeader key={m.assignmentId} label={m.title} title={m.title} sortKey={m.assignmentId} numeric sort={matrixSort.sort} onToggle={matrixSort.toggle} />)}</tr></thead>
              <tbody>
                {!matrixStudents.length && <tr><td colSpan={data.matrix.length + 1} className="eb-report-table-none">لا نتائج مطابقة للبحث.</td></tr>}
                {matrixStudents.map(stu => (
                  <tr key={stu.studentId}><th scope="row">{stu.displayName}</th>
                    {data.matrix.map(m => {
                      const cell = cellsByAssignment.get(m.assignmentId)?.get(stu.studentId);
                      if (!cell || cell.state === "missing") return <td key={m.assignmentId} className="is-missing"><span className="eb-report-matrix-cell is-missing">{MISSING_LABEL}</span></td>;
                      // Fail closed: any state that is not a final submitted result (pending, or one this client does not know) is never a number.
                      if (cell.state !== "submitted" || cell.percentage === null) return <td key={m.assignmentId} className="is-pending"><span className="eb-report-matrix-cell is-pending">{PENDING_LABEL}</span></td>;
                      const value = Math.round(cell.percentage);
                      const zero = cell.zero ?? cell.percentage === 0;              // the server's flag = the «سلّم بعلامة صفر» count
                      return <td key={m.assignmentId} className={zero ? "is-zero" : "is-submitted"}><span className={"eb-report-matrix-cell " + (zero ? "is-zero" : "is-submitted")}>{value}<VisuallyHidden>{zero ? " سلّم بعلامة صفر" : "% " + LATEST_ATTEMPT_LABEL}</VisuallyHidden></span></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------------- Project (generic) ---------------- */

function ProjectReport({ token, filters, onOpenProject }: { token: string; filters: Filters; onOpenProject?: (projectCode: string) => void }) {
  type Resp = { tracks: TrackMeta[]; class: { name: string }; summary: { avgOverall: number; trackAverages: Record<string, number>; completedCount: number; studentsReadyForReview: number; staleCount: number; studentCount: number; notStartedCount?: number }; analytics?: AnalyticsData };
  const params = filters.projectCode && filters.classId ? { type: "project", projectCode: filters.projectCode, classId: filters.classId } : null;
  const { data, loading, error, reload } = useReport<Resp>(token, params);
  const [stageTrack, setStageTrack] = useState("");
  if (!params) return <EmptyState text="اختر مشروعًا وصفًا." description="تقارير المشاريع تعرض الوضع الحالي لصف مسجَّل في المشروع؛ اختر المشروع أولًا لتظهر صفوفه." />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (loading || !data) return <LoadingState />;
  // CSV parity: exact legacy KPI labels/values.
  const csvKpis: csvRows.Kpi[] = [
    { label: "عدد الطلاب", value: data.summary.studentCount },
    { label: "التقدم العام", value: pct(data.summary.avgOverall) },
    ...data.tracks.map(t => ({ label: t.title, value: pct(data.summary.trackAverages[t.trackId] || 0) })),
    { label: "✅ مكتملون", value: data.summary.completedCount },
    { label: "🔵 ينتظرون الفحص", value: data.summary.studentsReadyForReview },
    { label: "⚠ متأخرون", value: data.summary.staleCount },
    // Phase P-5d — appended (the frozen rows above are unchanged) and only when the server reports students who have not started.
    ...(data.summary.notStartedCount ? [{ label: "لم يبدأوا", value: data.summary.notStartedCount }] : [])
  ];
  const track = resolveTrack(stageTrack, data.tracks.map(t => t.trackId), data.tracks[0]?.trackId || "");
  return (
    <div className="eb-report-result">
      <ReportHeader title={data.class.name} description={"مشروع " + filters.projectCode + " — الوضع الحالي"}
        onExportCsv={() => downloadCsv(csvRows.projectReportFilename(filters.projectCode, data.class.name), csvRows.projectReportRows(csvKpis))}>
        {onOpenProject && <button type="button" className="eb-button is-quiet is-small" onClick={() => onOpenProject(filters.projectCode)}>فتح في مساحة المشاريع</button>}
      </ReportHeader>
      <div className="eb-stat-grid is-primary eb-report-stats">
        <StatCard primary label="الطلاب" value={data.summary.studentCount} />
        <StatCard primary label="مكتملون" value={data.summary.completedCount} tone="success" />
        <StatCard primary label="ينتظرون الفحص" value={data.summary.studentsReadyForReview} tone={data.summary.studentsReadyForReview > 0 ? "attention" : "neutral"} />
        <StatCard primary label="بلا تحديث" value={data.summary.staleCount} tone={data.summary.staleCount > 0 ? "danger" : "neutral"} hint="متأخرون حسب إعداد الصف" />
        {(data.summary.notStartedCount || 0) > 0 && <StatCard primary label="لم يبدأوا" value={data.summary.notStartedCount} tone="attention" hint="لم يبدأ أي مرحلة بعد" />}
      </div>
      <ProjectSummaryCard level={3} title="التقدم العام والمسارات" tracks={data.tracks} overall={data.summary.avgOverall} trackValues={data.summary.trackAverages} />
      {/* The `type=project` response already carries `analytics`; it is rendered directly (no second analytics GET). */}
      {data.analytics
        ? <section className="eb-report-analytics" aria-labelledby="eb-report-analytics-title"><h3 id="eb-report-analytics-title" className="eb-subheading">الإحصائيات</h3><ProjectAnalyticsCharts level={3} analytics={data.analytics} tracks={data.tracks} stageTrack={track} onStageTrack={setStageTrack} /></section>
        : <EmptyState text="لا توجد إحصائيات لهذا المشروع بعد." />}
    </div>
  );
}

function TrackReport({ token, filters }: { token: string; filters: Filters }) {
  type Resp = { tracks: TrackMeta[]; track: string; groups: { groupId: string; title: string }[]; class: { name: string }; rows: csvRows.TrackRow[] };
  // The track/group start empty for every project + class: ReportView keys this component by both (Phase R-2), so a stale
  // track from another project (e.g. "access") never carries over — and is never sent, not even once, before a reset.
  const [track, setTrack] = useState("");
  const [groupId, setGroupId] = useState("");
  const params = filters.projectCode && filters.classId ? { type: "track", projectCode: filters.projectCode, classId: filters.classId, ...(track ? { track } : {}), ...(groupId ? { groupId } : {}) } : null;
  const { data, loading, error, reload } = useReport<Resp>(token, params);
  // An explicitly chosen track that no longer exists (project/class changed) falls back to the server default;
  // an empty selection simply means "the server's default track" and costs no extra request.
  useEffect(() => {
    if (data && track && !data.tracks.some(t => t.trackId === track)) setTrack(resolveTrack(track, data.tracks.map(t => t.trackId), data.track));
  }, [data, track]);
  if (!params) return <EmptyState text="اختر مشروعًا وصفًا." description="تقارير المشاريع تعرض الوضع الحالي لصف مسجَّل في المشروع؛ اختر المشروع أولًا لتظهر صفوفه." />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (loading || !data) return <LoadingState />;
  const trackTitle = data.tracks.find(t => t.trackId === data.track)?.title || data.track;
  return (
    <div className="eb-report-result">
      <ReportHeader title={data.class.name} description={"مسار " + trackTitle + " — حالة كل مرحلة عبر طلاب الصف"}
        onExportCsv={() => downloadCsv(csvRows.trackReportFilename(data.track, data.class.name), csvRows.trackReportRows(data.rows))} />
      <div className="eb-report-subfilters eb-report-noprint" role="region" aria-label="خيارات تقرير المسار">
        <div className="eb-segmented" role="group" aria-label="المسار">
          {data.tracks.map(t => <button key={t.trackId} type="button" aria-pressed={data.track === t.trackId} onClick={() => { setTrack(t.trackId); setGroupId(""); }}>{t.title}</button>)}
        </div>
        <label className="eb-field-inline">المجموعة<select value={groupId} onChange={e => setGroupId(e.target.value)}><option value="">الكل</option>{data.groups.map(g => <option key={g.groupId} value={g.groupId}>{g.title}</option>)}</select></label>
      </div>
      {data.rows.length > 0 && <StageStatusChart rows={data.rows} trackTitle={trackTitle} />}
      <ReportTable caption={"حالة مراحل مسار " + trackTitle + ": عدد الطلاب في كل حالة ونسبة الاعتماد"} columns={[
        { key: "stageId", label: "المرحلة", sortValue: r => r.stageId }, { key: "title", label: "العنوان", sortValue: r => r.title },
        { key: "approved", label: "معتمد", numeric: true, sortValue: r => r.approved }, { key: "ready_for_review", label: "جاهز للفحص", numeric: true, sortValue: r => r.ready_for_review },
        { key: "in_progress", label: "قيد التنفيذ", numeric: true, sortValue: r => r.in_progress }, { key: "not_started", label: "لم يبدأ", numeric: true, sortValue: r => r.not_started },
        { key: "approvedPct", label: "نسبة الاعتماد", render: r => <ProgressBar ariaLabel={"نسبة اعتماد " + r.stageId} value={r.approvedPct} size="sm" tone="success" />, numeric: true, sortValue: r => r.approvedPct }
      ]} rows={data.rows} empty="لا توجد مراحل." />
    </div>
  );
}

function ReadyReport({ token, filters, onOpenProject }: { token: string; filters: Filters; onOpenProject?: (projectCode: string) => void }) {
  type Resp = { tracks: TrackMeta[]; class: { name: string; status: string }; students: { studentId: string; displayName: string; stages: { stageId: string; title: string; track: string }[] }[]; totalReady: number };
  const params = filters.projectCode && filters.classId ? { type: "ready", projectCode: filters.projectCode, classId: filters.classId } : null;
  const { data, loading, error, reload } = useReport<Resp>(token, params);
  if (!params) return <EmptyState text="اختر مشروعًا وصفًا." description="تقارير المشاريع تعرض الوضع الحالي لصف مسجَّل في المشروع؛ اختر المشروع أولًا لتظهر صفوفه." />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (loading || !data) return <LoadingState />;
  const trackTitle = (id: string) => data.tracks.find(t => t.trackId === id)?.title || id;
  return (
    <div className="eb-report-result">
      <ReportHeader title={<>{data.class.name} <StatusBadge tone={data.totalReady > 0 ? "info" : "neutral"}>{data.totalReady} مرحلة بانتظار الفحص</StatusBadge></>}
        description={data.class.status === "archived" ? "الصف مؤرشف — عرض للقراءة فقط." : "المراحل التي علّمها الطلاب جاهزة للفحص؛ الاعتماد يتم من مساحة المشاريع."}
        onExportCsv={() => downloadCsv(csvRows.readyReportFilename(filters.projectCode, data.class.name), csvRows.readyReportRows(data.students))}>
        {onOpenProject && data.class.status !== "archived" && <button type="button" className="eb-button is-quiet is-small" onClick={() => onOpenProject(filters.projectCode)}>فتح في مساحة المشاريع</button>}
      </ReportHeader>
      {!data.students.length ? <EmptyState text="لا توجد مراحل بانتظار الفحص." /> : data.students.map(s => (
        <section key={s.studentId} className="eb-report-block" aria-label={s.displayName}>
          <h3 className="eb-subheading">{s.displayName} <StatusBadge tone="info">{s.stages.length}</StatusBadge></h3>
          <ReportTable caption={"المراحل الجاهزة للفحص للطالب " + s.displayName} columns={[
            { key: "stageId", label: "المرحلة" }, { key: "title", label: "العنوان" }, { key: "track", label: "المسار", render: r => trackTitle(String(r.track)) }
          ]} rows={s.stages} />
        </section>
      ))}
    </div>
  );
}

function DelayedReport({ token, filters }: { token: string; filters: Filters }) {
  type Row = csvRows.DelayedRow & { studentId: string };
  type Resp = { tracks: TrackMeta[]; lateThreshold: number; class: { name: string }; students: Row[] };
  const params = filters.projectCode && filters.classId ? { type: "delayed", projectCode: filters.projectCode, classId: filters.classId } : null;
  const { data, loading, error, reload } = useReport<Resp>(token, params);
  if (!params) return <EmptyState text="اختر مشروعًا وصفًا." description="تقارير المشاريع تعرض الوضع الحالي لصف مسجَّل في المشروع؛ اختر المشروع أولًا لتظهر صفوفه." />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (loading || !data) return <LoadingState />;
  return (
    <div className="eb-report-result">
      <ReportHeader title={<>{data.class.name} <StatusBadge tone={data.students.length ? "warn" : "neutral"}>{data.students.length} متأخرون</StatusBadge></>} description={"عتبة التأخّر حسب إعداد الصف: " + data.lateThreshold + "%"}
        onExportCsv={() => downloadCsv(csvRows.delayedReportFilename(filters.projectCode, data.class.name), csvRows.delayedReportRows(data.tracks, data.students))} />
      <ReportTable capped search={{ label: "بحث عن طالب", text: (r: Row) => r.displayName }} caption="الطلاب المتأخرون: التقدم العام وتقدم كل مسار وآخر تحديث وسبب التأخر" columns={[
        { key: "displayName", label: "الطالب", sortValue: (r: Row) => r.displayName },
        { key: "overall", label: "التقدم العام", render: (r: Row) => <ProgressBar ariaLabel={"التقدم العام " + r.displayName} value={r.overall} size="sm" />, numeric: true, sortValue: (r: Row) => r.overall },
        ...data.tracks.map(t => ({ key: t.trackId, label: t.title, render: (r: Row) => pct(r.trackProgress[t.trackId] || 0), numeric: true, sortValue: (r: Row) => r.trackProgress[t.trackId] || 0 })),
        { key: "updatedAt", label: "آخر تحديث", render: (r: Row) => isoDay(r.updatedAt), sortValue: (r: Row) => r.updatedAt || null },
        { key: "reasons", label: "السبب", render: (r: Row) => <span className="eb-report-reasons">{r.reasons.map((x, i) => <StatusBadge key={i} tone="warn">{x}</StatusBadge>)}</span> }
      ]} rows={data.students} empty="لا يوجد طلاب متأخرون." />
    </div>
  );
}

function TimelineReport({ token, filters }: { token: string; filters: Filters }) {
  type Resp = { class: { name: string }; scope: string; trend: { weekStart: string; avgOverall: number }[] };
  const params = filters.projectCode && filters.classId ? withRange({ type: "timeline", projectCode: filters.projectCode, classId: filters.classId, ...(filters.studentId ? { studentId: filters.studentId } : {}) }, filters) : null;
  const { data, loading, error, reload } = useReport<Resp>(token, params);
  const palette = usePalette();
  const chart = useMemo(() => data && ({ labels: data.trend.map(t => t.weekStart), datasets: [lineSeries("متوسط التقدّم", data.trend.map(t => t.avgOverall), palette.primary, palette, palette.primarySoft)] }), [data, palette]);
  const reduced = usePrefersReducedMotion();
  const weeks = data ? data.trend.length : 0;
  const lineOptions = useMemo(() => percentLineOptions(palette, chartMotion(reduced, weeks), (data ? data.trend : []).map(t => "أسبوع " + t.weekStart), false), [palette, reduced, weeks, data]);
  if (!params) return <EmptyState text="اختر مشروعًا وصفًا." description="تقارير المشاريع تعرض الوضع الحالي لصف مسجَّل في المشروع؛ اختر المشروع أولًا لتظهر صفوفه." />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (loading || !data) return <LoadingState />;
  return (
    <div className="eb-report-result">
      <ReportHeader title={data.class.name} description={data.scope === "student" ? "طالب محدد — متوسط التقدّم الأسبوعي" : "الصف كامل — متوسط التقدّم الأسبوعي"}
        onExportCsv={() => downloadCsv(csvRows.timelineReportFilename(filters.projectCode, data.class.name), csvRows.timelineReportRows(data.trend))} />
      {data.trend.length > 1 && (() => {
        // Phase R-5a — where the period started, where it ended and the net change between the two (the chart's own points).
        const first = data.trend[0].avgOverall, last = data.trend[data.trend.length - 1].avgOverall, net = Math.round((last - first) * 10) / 10;
        const week = latestChange(data.trend.map(t => t.avgOverall));
        return (
          <div className="eb-stat-grid is-primary eb-report-stats">
            <StatCard primary label="بداية الفترة" value={pct(first)} hint={"أسبوع " + data.trend[0].weekStart} />
            <StatCard primary label="آخر أسبوع" value={pct(last)} hint={"أسبوع " + data.trend[data.trend.length - 1].weekStart} />
            <StatCard primary label="صافي التغيّر" value={signed(net) + " نقطة"} tone={net > 0 ? "success" : net < 0 ? "attention" : "neutral"} hint={data.trend.length + " أسابيع"} />
            {week && <StatCard primary label="عن الأسبوع السابق" value={signed(week.delta) + " نقطة"} tone={week.delta > 0 ? "success" : week.delta < 0 ? "attention" : "neutral"} />}
          </div>
        );
      })()}
      {data.trend.length === 1 && <ReportNote>الفترة المختارة تغطي أسبوعًا واحدًا فقط، فيظهر نقطة واحدة دون اتجاه؛ اختر فترة أطول لرؤية تطوّر التقدّم.</ReportNote>}
      {data.trend.length
        ? <ChartCard level={3} title="متوسط التقدّم الأسبوعي" description="متوسط التقدّم (%) في نهاية كل أسبوع" table={{ columns: ["الأسبوع", "متوسط التقدّم %"], rows: data.trend.map(t => [t.weekStart, t.avgOverall]) }}>
            {chart && <div className="eb-chart-canvas"><Line data={chart} options={lineOptions} aria-hidden="true" /></div>}
          </ChartCard>
        : <EmptyState text="لا توجد بيانات زمنية كافية بعد." />}
      {data.trend.length > 1 && <WeeklyChangeChart trend={data.trend} />}
    </div>
  );
}

// Phase R-5a — the report's entrance motion (cards rise, progress bars grow) is CSS keyed on this wrapper, so it follows the same
// preference as the charts: the viewer's explicit choice, else the OS hint. The wrapper has no box (display: contents).
export default function ReportView(props: { type: ReportType; token: string; filters: Filters; onOpenProject?: (projectCode: string) => void; onOpenAssignment?: (target: AssignmentDrillTarget) => void; /** Phase R-5c — from a follow-up row to that student's report */ onOpenStudent?: (studentId: string) => void }) {
  const reduced = usePrefersReducedMotion();
  return <div className="eb-report-motion" data-motion={reduced ? "off" : "on"}><ReportBody {...props} /></div>;
}

function ReportBody({ type, token, filters, onOpenProject, onOpenAssignment, onOpenStudent }: { type: ReportType; token: string; filters: Filters; onOpenProject?: (projectCode: string) => void; onOpenAssignment?: (target: AssignmentDrillTarget) => void; onOpenStudent?: (studentId: string) => void }) {
  switch (type) {
    case "class": return <ClassReport token={token} filters={filters} onOpenStudent={onOpenStudent} />;
    case "student": return <StudentReport token={token} filters={filters} />;
    case "assignments": return <AssignmentsReport token={token} filters={filters} onOpenAssignment={onOpenAssignment} />;
    case "project": return <ProjectReport token={token} filters={filters} onOpenProject={onOpenProject} />;
    case "track": return <TrackReport key={filters.projectCode + "|" + filters.classId} token={token} filters={filters} />;
    case "ready": return <ReadyReport token={token} filters={filters} onOpenProject={onOpenProject} />;
    case "delayed": return <DelayedReport token={token} filters={filters} />;
    case "timeline": return <TimelineReport token={token} filters={filters} />;
    default: return <EmptyState />;
  }
}
