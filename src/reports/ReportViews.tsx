import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler, type ChartOptions } from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { reportGet } from "./api";
import { ReportHeader, ReportNote, ReportTable, LoadingState, ErrorState, EmptyState } from "./ui";
import { pct, isoDay } from "./format";
import { downloadCsv } from "./csv";
import { resolveTrack } from "./trackState";
import * as csvRows from "./reportCsv";
import ProjectAnalyticsCharts from "../projects/ProjectAnalyticsCharts";
import { chartPalette } from "../projects/chartPalette";
import ChartCard from "../ui/ChartCard";
import StatCard from "../ui/StatCard";
import StatusBadge from "../ui/StatusBadge";
import ProgressBar from "../ui/ProgressBar";
import VisuallyHidden from "../ui/VisuallyHidden";
import { toneForTrack } from "../projects/teacherPresentation";
import type { ProjectAnalytics as AnalyticsData, TrackMeta } from "../projects/types";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

export type ReportType = "class" | "student" | "assignments" | "project" | "track" | "ready" | "delayed" | "timeline";
export type Filters = { schoolYear: string; classId: string; studentId: string; projectCode: string; track: string; from: string; to: string };

/** Truthful meaning of every assessment number the Reports API returns (latest submitted attempt, not a final grade). */
export const LATEST_ATTEMPT_LABEL = "نتيجة آخر محاولة مسلّمة";
export const LATEST_ATTEMPT_NOTE = "الأرقام هنا هي نتيجة آخر محاولة مسلّمة لكل طالب كما يعيدها نظام التقارير، وقد تشمل تسليمات ما زالت بانتظار مراجعة المعلم؛ فهي ليست درجات نهائية معتمدة.";
export const AVERAGE_NOTE = "المتوسطات ونسب التوزيع مبنية على نتيجة آخر محاولة مسلّمة لكل طالب في كل تقييم (ضمن الفترة المختارة)، وليست على الدرجات النهائية المعتمدة فقط.";
const MISSING_LABEL = "لم يسلّم";

// Adds date-range params (from/to) to a report request when present.
function withRange(params: Record<string, string>, f: Filters): Record<string, string> {
  const out = { ...params };
  if (f.from) out.from = f.from;
  if (f.to) out.to = f.to;
  return out;
}

/**
 * Report fetch hook with stale-response protection: data is stored WITH the params key it was fetched for, so
 * the moment the params change the exposed `data` is null (old rows never show against new filters), and a
 * late response for an older key is discarded (cancelled on cleanup and key-checked on arrival).
 */
function useReport<T>(token: string, params: Record<string, string> | null) {
  const key = params ? JSON.stringify(params) : "";
  const [stored, setStored] = useState<{ key: string; data: T | null; error: string }>({ key: "", data: null, error: "" });
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!params) return;
    let cancelled = false;
    setLoading(true);
    reportGet<T>(token, params)
      .then(r => { if (!cancelled) setStored({ key, data: r, error: "" }); })
      .catch(e => { if (!cancelled) setStored({ key, data: null, error: e instanceof Error ? e.message : "تعذر تجهيز التقرير." }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, key, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = stored.key === key && key !== "";
  return { data: current ? stored.data : null, error: current ? stored.error : "", loading: !!params && (loading || !current), reload: () => setNonce(n => n + 1) };
}

function usePalette() { return useMemo(() => chartPalette(), []); }
const motion = (reduced: boolean) => (reduced ? { animation: false as const } : {});

/* ---------------- Academic ---------------- */

type ClassProjectSection = { projectCode: string; title: string; tracks: TrackMeta[]; avgOverall: number; trackAverages: Record<string, number>; completedCount: number };

function ProjectSummaryCard({ title, tracks, overall, trackValues, footer, level = 4 }: { title: string; tracks: TrackMeta[]; overall: number; trackValues: Record<string, number>; footer?: ReactNode; level?: 3 | 4 }) {
  const H = level === 3 ? "h3" : "h4";
  return (
    <section className="eb-report-project" aria-label={title}>
      <H className="eb-subheading">{title}</H>
      <ProgressBar label="التقدم العام" value={overall} tone="primary" />
      <div className="eb-report-track-bars">
        {tracks.map((t, i) => <ProgressBar key={t.trackId} label={t.title} value={trackValues[t.trackId] || 0} tone={toneForTrack(i)} size="sm" />)}
      </div>
      {footer && <p className="eb-report-project-foot">{footer}</p>}
    </section>
  );
}

function ClassReport({ token, filters }: { token: string; filters: Filters }) {
  type Resp = { class: { name: string; schoolYear: string; status: string; studentCount: number }; kpis: { assignments: number; averageScore: number | null; submissionRate: number }; projects: ClassProjectSection[] };
  const { data, loading, error, reload } = useReport<Resp>(token, filters.classId ? withRange({ type: "class", classId: filters.classId }, filters) : null);
  if (!filters.classId) return <EmptyState text="اختر صفًا لعرض تقريره." />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (loading || !data) return <LoadingState />;
  const archived = data.class.status === "archived";
  // CSV parity: the exact legacy KPI labels/values (unchanged since the first Reports release).
  const csvKpis: csvRows.Kpi[] = [
    { label: "الحالة", value: archived ? "مؤرشف" : "نشط" },
    { label: "عدد الطلاب", value: data.class.studentCount },
    { label: "عدد الواجبات", value: data.kpis.assignments },
    { label: "متوسط العلامات", value: pct(data.kpis.averageScore) },
    { label: "نسبة التسليم", value: pct(data.kpis.submissionRate) }
  ];
  return (
    <div className="eb-report-result">
      <ReportHeader title={<>{data.class.name} <StatusBadge tone={archived ? "neutral" : "success"}>{archived ? "مؤرشف" : "نشط"}</StatusBadge></>} description={data.class.schoolYear}
        onExportCsv={() => downloadCsv(csvRows.classReportFilename(data), csvRows.classReportRows(csvKpis, data))} />
      <div className="eb-stat-grid is-primary eb-report-stats">
        <StatCard primary label="الطلاب" value={data.class.studentCount} />
        <StatCard primary label="التقييمات" value={data.kpis.assignments} hint="ضمن الفترة المختارة" />
        <StatCard primary label="متوسط النتائج" value={pct(data.kpis.averageScore)} hint={LATEST_ATTEMPT_LABEL} />
        <StatCard primary label="نسبة التسليم" value={pct(data.kpis.submissionRate)} tone="info" />
      </div>
      <ReportNote>{AVERAGE_NOTE}</ReportNote>
      {data.projects.length > 0 && (
        <section className="eb-report-projects" aria-labelledby="eb-report-class-projects">
          <h3 id="eb-report-class-projects" className="eb-subheading">مشاريع الصف</h3>
          {/* Each project reported independently — never combine two projects into one % */}
          <div className="eb-report-project-grid">
            {data.projects.map(p => <ProjectSummaryCard key={p.projectCode} title={p.title} tracks={p.tracks} overall={p.avgOverall} trackValues={p.trackAverages} footer={<StatusBadge tone="success">مكتملون {p.completedCount}</StatusBadge>} />)}
          </div>
          <ReportNote>بيانات التقييمات حسب الفترة المختارة؛ بيانات المشاريع تمثل الوضع الحالي.</ReportNote>
        </section>
      )}
    </div>
  );
}

type StudentProjectSection = { projectCode: string; title: string; tracks: TrackMeta[]; summary: { overallProgress: number; trackProgress: Record<string, number>; counts: Record<string, number>; complete: boolean }; nextStages?: Record<string, { stageId: string; title: string } | null>; lastActivity: string; balance: { leadingTrackTitle: string; laggingTrackTitle: string; diff: number } | null };

function StudentReport({ token, filters }: { token: string; filters: Filters }) {
  type Resp = { student: { displayName: string; className: string; schoolYear: string }; academic: { average: number | null; submittedCount: number; assessmentCount: number; submissionRate: number }; projects: StudentProjectSection[] };
  const { data, loading, error, reload } = useReport<Resp>(token, filters.studentId ? withRange({ type: "student", studentId: filters.studentId }, filters) : null);
  if (!filters.studentId) return <EmptyState text="اختر طالبًا لعرض تقريره." />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (loading || !data) return <LoadingState />;
  const csvKpis: csvRows.Kpi[] = [
    { label: "الصف", value: data.student.className || "—" },
    { label: "متوسط التقييمات", value: pct(data.academic.average) },
    { label: "المسلَّمة", value: data.academic.submittedCount + " / " + data.academic.assessmentCount },
    { label: "نسبة التسليم", value: pct(data.academic.submissionRate) }
  ];
  return (
    <div className="eb-report-result">
      <ReportHeader title={data.student.displayName} description={(data.student.className || "—") + " · " + data.student.schoolYear}
        onExportCsv={() => downloadCsv(csvRows.studentReportFilename(data), csvRows.studentReportRows(csvKpis, data))} />
      <div className="eb-stat-grid is-primary eb-report-stats">
        <StatCard primary label="متوسط التقييمات" value={pct(data.academic.average)} hint={LATEST_ATTEMPT_LABEL} />
        <StatCard primary label="المسلَّمة" value={data.academic.submittedCount + " / " + data.academic.assessmentCount} hint="من تقييمات الفترة المختارة" />
        <StatCard primary label="نسبة التسليم" value={pct(data.academic.submissionRate)} tone="info" />
        <StatCard primary label="مشاريع الصف" value={data.projects.length} />
      </div>
      <ReportNote>{AVERAGE_NOTE}</ReportNote>
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
                </>} />
            ))}
          </div>
          <ReportNote>متوسط التقييمات حسب الفترة المختارة؛ بيانات المشاريع تمثل الوضع الحالي.</ReportNote>
        </section>
      )}
    </div>
  );
}

function AssignmentsReport({ token, filters }: { token: string; filters: Filters }) {
  type Row = csvRows.AssignmentRow & { assignmentId: string };
  type Cell = { studentId: string; state: string; percentage: number | null };
  type Resp = { class: { name: string }; students: { studentId: string; displayName: string }[]; overall: { assessmentCount: number; participants: number; average: number | null; submissionRate: number; distribution: Record<string, number> }; perAssignment: Row[]; matrix: { assignmentId: string; title: string; cells: Cell[] }[] };
  const { data, loading, error, reload } = useReport<Resp>(token, filters.classId ? withRange({ type: "assignments", classId: filters.classId }, filters) : null);
  const palette = usePalette();
  const distLabels = useMemo(() => data ? Object.keys(data.overall.distribution) : [], [data]);
  const dist = useMemo(() => data && ({ labels: distLabels, datasets: [{ label: "عدد التسليمات", data: distLabels.map(k => data.overall.distribution[k]), backgroundColor: palette.series[0], borderRadius: 6 }] }), [data, distLabels, palette]);
  const barOptions = useMemo<ChartOptions<"bar">>(() => ({ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true }, tooltip: { rtl: true } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: palette.grid } }, x: { grid: { display: false } } } }), [palette]);
  if (!filters.classId) return <EmptyState text="اختر صفًا." />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (loading || !data) return <LoadingState />;
  return (
    <div className="eb-report-result">
      <ReportHeader title={data.class.name} description={"تقييمات الصف ضمن الفترة المختارة — " + LATEST_ATTEMPT_LABEL}
        onExportCsv={() => downloadCsv(csvRows.assignmentsReportFilename(data.class.name), csvRows.assignmentsReportRows(data.perAssignment))} />
      <div className="eb-stat-grid is-primary eb-report-stats">
        <StatCard primary label="التقييمات" value={data.overall.assessmentCount} />
        <StatCard primary label="التسليمات" value={data.overall.participants} hint="طالب × تقييم" />
        <StatCard primary label="متوسط النتائج" value={pct(data.overall.average)} hint={LATEST_ATTEMPT_LABEL} />
        <StatCard primary label="نسبة التسليم" value={pct(data.overall.submissionRate)} tone="info" />
      </div>
      <ReportNote>{LATEST_ATTEMPT_NOTE}</ReportNote>
      <ChartCard level={3} title="توزيع النتائج" description={"عدد التسليمات في كل نطاق (%) — " + LATEST_ATTEMPT_LABEL} table={{ columns: ["النطاق %", "عدد التسليمات"], rows: distLabels.map(k => [k, data.overall.distribution[k]]) }}>
        {({ reducedMotion }) => dist && <div className="eb-chart-canvas"><Bar data={dist} options={{ ...barOptions, ...motion(reducedMotion) }} /></div>}
      </ChartCard>
      <section aria-labelledby="eb-report-per-assignment">
        <h3 id="eb-report-per-assignment" className="eb-subheading">ملخص كل تقييم</h3>
        <ReportTable caption="ملخص كل تقييم: نسبة التسليم والمتوسط وعدد المسلِّمين" columns={[
          { key: "title", label: "التقييم" },
          { key: "submissionRate", label: "نسبة التسليم", render: r => pct(r.submissionRate), numeric: true },
          { key: "submitted", label: "مُسلَّم", numeric: true }, { key: "missing", label: MISSING_LABEL, numeric: true }, { key: "zeroScores", label: "سلّم بعلامة صفر", numeric: true },
          { key: "average", label: "المتوسط (" + LATEST_ATTEMPT_LABEL + ")", render: r => pct(r.average), numeric: true }, { key: "avgAttempts", label: "متوسط المحاولات", numeric: true }
        ]} rows={data.perAssignment} empty="لا توجد تقييمات ضمن الفترة المختارة." />
      </section>
      {data.matrix.length > 0 && (
        <section aria-labelledby="eb-report-matrix-title">
          <h3 id="eb-report-matrix-title" className="eb-subheading">مصفوفة الطالب × التقييم</h3>
          <p className="eb-muted eb-report-legend">القيمة = {LATEST_ATTEMPT_LABEL} (%) · 0 = سلّم بعلامة صفر · «{MISSING_LABEL}» = لا توجد محاولة مسلّمة</p>
          <div className="eb-report-table-scroll">
            <table className="eb-report-table eb-report-matrix">
              <caption className="eb-visually-hidden">مصفوفة الطالب × التقييم — {LATEST_ATTEMPT_LABEL} بالنسبة المئوية لكل طالب في كل تقييم؛ «{MISSING_LABEL}» تعني عدم وجود محاولة مسلّمة</caption>
              <thead><tr><th scope="col">الطالب</th>{data.matrix.map(m => <th key={m.assignmentId} scope="col" title={m.title}>{m.title}</th>)}</tr></thead>
              <tbody>
                {data.students.map(stu => (
                  <tr key={stu.studentId}><th scope="row">{stu.displayName}</th>
                    {data.matrix.map(m => {
                      const cell = m.cells.find(c => c.studentId === stu.studentId);
                      if (!cell || cell.state === "missing") return <td key={m.assignmentId} className="is-missing"><span className="eb-report-matrix-cell is-missing">{MISSING_LABEL}</span></td>;
                      const value = Math.round(cell.percentage || 0);
                      const zero = cell.percentage === 0;
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
  type Resp = { tracks: TrackMeta[]; class: { name: string }; summary: { avgOverall: number; trackAverages: Record<string, number>; completedCount: number; studentsReadyForReview: number; staleCount: number; studentCount: number }; analytics?: AnalyticsData };
  const params = filters.projectCode && filters.classId ? { type: "project", projectCode: filters.projectCode, classId: filters.classId } : null;
  const { data, loading, error, reload } = useReport<Resp>(token, params);
  const [stageTrack, setStageTrack] = useState("");
  if (!params) return <EmptyState text="اختر مشروعًا وصفًا." />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (loading || !data) return <LoadingState />;
  // CSV parity: exact legacy KPI labels/values.
  const csvKpis: csvRows.Kpi[] = [
    { label: "عدد الطلاب", value: data.summary.studentCount },
    { label: "التقدم العام", value: pct(data.summary.avgOverall) },
    ...data.tracks.map(t => ({ label: t.title, value: pct(data.summary.trackAverages[t.trackId] || 0) })),
    { label: "✅ مكتملون", value: data.summary.completedCount },
    { label: "🔵 ينتظرون الفحص", value: data.summary.studentsReadyForReview },
    { label: "⚠ متأخرون", value: data.summary.staleCount }
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
  const [track, setTrack] = useState("");
  const [groupId, setGroupId] = useState("");
  // Reset the track/group when the project or class changes, so a stale track from another project
  // (e.g. "access") never carries over to a project that doesn't have it.
  useEffect(() => { setTrack(""); setGroupId(""); }, [filters.projectCode, filters.classId]);
  const params = filters.projectCode && filters.classId ? { type: "track", projectCode: filters.projectCode, classId: filters.classId, ...(track ? { track } : {}), ...(groupId ? { groupId } : {}) } : null;
  const { data, loading, error, reload } = useReport<Resp>(token, params);
  // An explicitly chosen track that no longer exists (project/class changed) falls back to the server default;
  // an empty selection simply means "the server's default track" and costs no extra request.
  useEffect(() => {
    if (data && track && !data.tracks.some(t => t.trackId === track)) setTrack(resolveTrack(track, data.tracks.map(t => t.trackId), data.track));
  }, [data, track]);
  if (!params) return <EmptyState text="اختر مشروعًا وصفًا." />;
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
      <ReportTable caption={"حالة مراحل مسار " + trackTitle + ": عدد الطلاب في كل حالة ونسبة الاعتماد"} columns={[
        { key: "stageId", label: "المرحلة" }, { key: "title", label: "العنوان" },
        { key: "approved", label: "معتمد", numeric: true }, { key: "ready_for_review", label: "جاهز للفحص", numeric: true },
        { key: "in_progress", label: "قيد التنفيذ", numeric: true }, { key: "not_started", label: "لم يبدأ", numeric: true },
        { key: "approvedPct", label: "نسبة الاعتماد", render: r => <ProgressBar ariaLabel={"نسبة اعتماد " + r.stageId} value={r.approvedPct} size="sm" tone="success" />, numeric: true }
      ]} rows={data.rows} empty="لا توجد مراحل." />
    </div>
  );
}

function ReadyReport({ token, filters, onOpenProject }: { token: string; filters: Filters; onOpenProject?: (projectCode: string) => void }) {
  type Resp = { tracks: TrackMeta[]; class: { name: string; status: string }; students: { studentId: string; displayName: string; stages: { stageId: string; title: string; track: string }[] }[]; totalReady: number };
  const params = filters.projectCode && filters.classId ? { type: "ready", projectCode: filters.projectCode, classId: filters.classId } : null;
  const { data, loading, error, reload } = useReport<Resp>(token, params);
  if (!params) return <EmptyState text="اختر مشروعًا وصفًا." />;
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
  if (!params) return <EmptyState text="اختر مشروعًا وصفًا." />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (loading || !data) return <LoadingState />;
  return (
    <div className="eb-report-result">
      <ReportHeader title={<>{data.class.name} <StatusBadge tone={data.students.length ? "warn" : "neutral"}>{data.students.length} متأخرون</StatusBadge></>} description={"عتبة التأخّر حسب إعداد الصف: " + data.lateThreshold + "%"}
        onExportCsv={() => downloadCsv(csvRows.delayedReportFilename(filters.projectCode, data.class.name), csvRows.delayedReportRows(data.tracks, data.students))} />
      <ReportTable caption="الطلاب المتأخرون: التقدم العام وتقدم كل مسار وآخر تحديث وسبب التأخر" columns={[
        { key: "displayName", label: "الطالب" },
        { key: "overall", label: "التقدم العام", render: (r: Row) => <ProgressBar ariaLabel={"التقدم العام " + r.displayName} value={r.overall} size="sm" />, numeric: true },
        ...data.tracks.map(t => ({ key: t.trackId, label: t.title, render: (r: Row) => pct(r.trackProgress[t.trackId] || 0), numeric: true })),
        { key: "updatedAt", label: "آخر تحديث", render: (r: Row) => isoDay(r.updatedAt) },
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
  const chart = useMemo(() => data && ({ labels: data.trend.map(t => t.weekStart), datasets: [{ label: "متوسط التقدّم", data: data.trend.map(t => t.avgOverall), borderColor: palette.primary, backgroundColor: palette.primarySoft, fill: true, tension: .3 }] }), [data, palette]);
  const lineOptions = useMemo<ChartOptions<"line">>(() => ({ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true }, tooltip: { rtl: true } }, scales: { y: { beginAtZero: true, max: 100, grid: { color: palette.grid } }, x: { grid: { display: false } } } }), [palette]);
  if (!params) return <EmptyState text="اختر مشروعًا وصفًا." />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (loading || !data) return <LoadingState />;
  return (
    <div className="eb-report-result">
      <ReportHeader title={data.class.name} description={data.scope === "student" ? "طالب محدد — متوسط التقدّم الأسبوعي" : "الصف كامل — متوسط التقدّم الأسبوعي"}
        onExportCsv={() => downloadCsv(csvRows.timelineReportFilename(filters.projectCode, data.class.name), csvRows.timelineReportRows(data.trend))} />
      {data.trend.length
        ? <ChartCard level={3} title="متوسط التقدّم الأسبوعي" description="متوسط التقدّم (%) في نهاية كل أسبوع" table={{ columns: ["الأسبوع", "متوسط التقدّم %"], rows: data.trend.map(t => [t.weekStart, t.avgOverall]) }}>
            {({ reducedMotion }) => chart && <div className="eb-chart-canvas"><Line data={chart} options={{ ...lineOptions, ...motion(reducedMotion) }} /></div>}
          </ChartCard>
        : <EmptyState text="لا توجد بيانات زمنية كافية بعد." />}
    </div>
  );
}

export default function ReportView({ type, token, filters, onOpenProject }: { type: ReportType; token: string; filters: Filters; onOpenProject?: (projectCode: string) => void }) {
  switch (type) {
    case "class": return <ClassReport token={token} filters={filters} />;
    case "student": return <StudentReport token={token} filters={filters} />;
    case "assignments": return <AssignmentsReport token={token} filters={filters} />;
    case "project": return <ProjectReport token={token} filters={filters} onOpenProject={onOpenProject} />;
    case "track": return <TrackReport token={token} filters={filters} />;
    case "ready": return <ReadyReport token={token} filters={filters} onOpenProject={onOpenProject} />;
    case "delayed": return <DelayedReport token={token} filters={filters} />;
    case "timeline": return <TimelineReport token={token} filters={filters} />;
    default: return <EmptyState />;
  }
}
