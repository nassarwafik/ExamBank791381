import { useMemo } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler, type ChartOptions } from "chart.js";
import { Bar, Line, Doughnut } from "react-chartjs-2";
import ProjectHeatmap from "./ProjectHeatmap";
import { chartPalette } from "./chartPalette";
import { STAGE_STATUS_ORDER, stageStatusLabel } from "./teacherPresentation";
import ChartCard from "../ui/ChartCard";
import EmptyState from "../ui/EmptyState";
import type { ProjectAnalytics as AnalyticsData, ProjectGroup, StageStatus, TrackMeta } from "./types";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

type Props = {
  analytics: AnalyticsData;
  tracks: TrackMeta[];
  /** Group titles for the heatmap selector (falls back to group ids when absent, e.g. the Reports payload). */
  groups?: ProjectGroup[];
  /** Selected track for the stage-completion chart, owned by the caller. */
  stageTrack: string;
  onStageTrack: (trackId: string) => void;
  /** Heading level for the chart cards (3 inside a titled section, 2 at page level). */
  level?: 2 | 3;
};

const BUCKETS: (keyof AnalyticsData["buckets"])[] = ["0-25", "26-50", "51-75", "76-99", "100"];
const BUCKET_LABELS = ["0–25", "26–50", "51–75", "76–99", "100"];
const STATUS_CHART_ORDER: StageStatus[] = ["approved", "ready_for_review", "in_progress", "not_started"];

/**
 * PRESENTATION ONLY: the six project analytics charts + heatmap for an already-loaded `analytics` payload.
 * Shared by the Projects workspace (which fetches `resource=analytics`) and the Reports Center (whose
 * `type=project` response already carries the same `analytics` object, so it never fetches it again).
 * Same datasets and formulas as before; nothing is recomputed here beyond chart/table shaping.
 */
export default function ProjectAnalyticsCharts({ analytics: data, tracks, groups = [], stageTrack, onStageTrack, level = 3 }: Props) {
  const palette = useMemo(() => chartPalette(), []);
  const barOptions = useMemo<ChartOptions<"bar">>(() => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: true }, tooltip: { rtl: true } },
    scales: { y: { beginAtZero: true, max: 100, grid: { color: palette.grid } }, x: { grid: { display: false } } }
  }), [palette]);
  const countOptions = useMemo<ChartOptions<"bar">>(() => ({ ...barOptions, scales: { ...barOptions.scales, y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: palette.grid } } } }), [barOptions, palette]);
  const doughnutOptions = useMemo<ChartOptions<"doughnut">>(() => ({ responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "bottom", rtl: true }, tooltip: { rtl: true } } }), []);
  const motion = (reduced: boolean) => (reduced ? { animation: false as const } : {});

  const perStudentData = useMemo(() => ({
    labels: data.perStudent.map(s => s.name),
    datasets: [{ label: "التقدم العام", data: data.perStudent.map(s => s.overall), backgroundColor: palette.series[0], borderRadius: 6 }]
  }), [data, palette]);
  const trackCompareData = useMemo(() => ({
    labels: data.perStudent.map(s => s.name),
    datasets: tracks.map((t, i) => ({ label: t.title, data: data.perStudent.map(s => s.trackProgress[t.trackId] || 0), backgroundColor: palette.series[i % palette.series.length], borderRadius: 6 }))
  }), [data, tracks, palette]);
  const stageRows = useMemo(() => data.stageCompletion.filter(s => s.track === stageTrack), [data, stageTrack]);
  const stageData = useMemo(() => ({ labels: stageRows.map(s => s.stageId), datasets: [{ label: "نسبة الاعتماد", data: stageRows.map(s => s.approvedPct), backgroundColor: palette.series[1], borderRadius: 5 }] }), [stageRows, palette]);
  const bucketData = useMemo(() => ({
    labels: BUCKET_LABELS,
    datasets: [{ label: "عدد الطلاب", data: BUCKETS.map(b => data.buckets[b]), backgroundColor: palette.series[0], borderRadius: 6 }]
  }), [data, palette]);
  const trendData = useMemo(() => ({
    labels: data.weeklyTrend.map(w => w.weekStart),
    datasets: [{ label: "متوسط تقدّم الصف", data: data.weeklyTrend.map(w => w.avgOverall), borderColor: palette.primary, backgroundColor: palette.primarySoft, fill: true, tension: .3 }]
  }), [data, palette]);
  const statusCounts = useMemo(() => {
    const counts: Record<StageStatus, number> = { approved: 0, ready_for_review: 0, in_progress: 0, not_started: 0 };
    for (const row of data.heatmap.statuses) for (const key of Object.keys(row)) counts[row[key]] += 1;
    return counts;
  }, [data]);
  const statusDist = useMemo(() => ({
    labels: STATUS_CHART_ORDER.map(s => stageStatusLabel(s)),
    datasets: [{ data: STATUS_CHART_ORDER.map(s => statusCounts[s]), backgroundColor: STATUS_CHART_ORDER.map(s => palette.status[s]), borderWidth: 0 }]
  }), [statusCounts, palette]);

  if (!data.perStudent.length) return <EmptyState title="لا توجد بيانات كافية للرسوم البيانية." description="تظهر الإحصائيات بعد وجود طلاب وتقدّم مسجّل في هذا الصف." />;
  const HeatHeading = level === 2 ? "h2" : "h3";

  return (
    <>
      <div className="eb-chart-grid">
        <ChartCard level={level} title="تقدّم كل طالب" table={{ columns: ["الطالب", "التقدم العام %"], rows: data.perStudent.map(s => [s.name, s.overall]) }}>
          {({ reducedMotion }) => <div className="eb-chart-canvas"><Bar data={perStudentData} options={{ ...barOptions, ...motion(reducedMotion) }} /></div>}
        </ChartCard>
        <ChartCard level={level} title="مقارنة المسارات" table={{ columns: ["الطالب", ...tracks.map(t => t.title + " %")], rows: data.perStudent.map(s => [s.name, ...tracks.map(t => s.trackProgress[t.trackId] || 0)]) }}>
          {({ reducedMotion }) => <div className="eb-chart-canvas"><Bar data={trackCompareData} options={{ ...barOptions, ...motion(reducedMotion) }} /></div>}
        </ChartCard>
        <ChartCard level={level} title="نسبة إنجاز كل مرحلة" description={"المسار: " + (tracks.find(t => t.trackId === stageTrack)?.title || "")}
          actions={<div className="eb-segmented" role="group" aria-label="مسار المراحل">{tracks.map(t => <button key={t.trackId} type="button" aria-pressed={stageTrack === t.trackId} onClick={() => onStageTrack(t.trackId)}>{t.title}</button>)}</div>}
          table={{ columns: ["المرحلة", "العنوان", "نسبة الاعتماد %"], rows: stageRows.map(s => [s.stageId, s.title, s.approvedPct]) }}>
          {({ reducedMotion }) => <div className="eb-chart-canvas is-tall"><Bar data={stageData} options={{ ...barOptions, ...motion(reducedMotion) }} /></div>}
        </ChartCard>
        <ChartCard level={level} title="توزيع الطلاب حسب التقدم" table={{ columns: ["النطاق", "عدد الطلاب"], rows: BUCKETS.map((b, i) => [BUCKET_LABELS[i], data.buckets[b]]) }}>
          {({ reducedMotion }) => <div className="eb-chart-canvas"><Bar data={bucketData} options={{ ...countOptions, ...motion(reducedMotion) }} /></div>}
        </ChartCard>
        <ChartCard level={level} title="تطوّر متوسط تقدّم الصف" table={{ columns: ["الأسبوع", "متوسط التقدّم %"], rows: data.weeklyTrend.map(w => [w.weekStart, w.avgOverall]) }}>
          {({ reducedMotion }) => data.weeklyTrend.length
            ? <div className="eb-chart-canvas"><Line data={trendData} options={{ ...(barOptions as unknown as ChartOptions<"line">), ...motion(reducedMotion) }} /></div>
            : <EmptyState compact title="لا توجد بيانات زمنية كافية بعد." />}
        </ChartCard>
        <ChartCard level={level} title="توزيع حالات المراحل في الصف" table={{ columns: ["الحالة", "عدد المراحل"], rows: STAGE_STATUS_ORDER.map(s => [stageStatusLabel(s), statusCounts[s]]) }}>
          {({ reducedMotion }) => <div className="eb-chart-canvas"><Doughnut data={statusDist} options={{ ...doughnutOptions, ...motion(reducedMotion) }} /></div>}
        </ChartCard>
      </div>
      <section className="eb-heatmap-card" aria-labelledby="eb-heatmap-title">
        <HeatHeading id="eb-heatmap-title" className="eb-subheading">الخريطة الحرارية للمراحل</HeatHeading>
        <ProjectHeatmap heatmap={data.heatmap} tracks={tracks} groups={groups} />
      </section>
    </>
  );
}
