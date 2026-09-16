import { useEffect, useMemo, useState } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler, type ChartOptions } from "chart.js";
import { Bar, Line, Doughnut } from "react-chartjs-2";
import { trackerGet } from "./api";
import ProjectHeatmap from "./ProjectHeatmap";
import { chartPalette } from "./chartPalette";
import { STAGE_STATUS_ORDER, stageStatusLabel } from "./teacherPresentation";
import ChartCard from "../ui/ChartCard";
import EmptyState from "../ui/EmptyState";
import type { ProjectAnalytics as AnalyticsData, ProjectGroup, StageStatus, TrackMeta } from "./types";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

type Props = { token: string; projectCode: string; classId: string; tracks: TrackMeta[] };

// Same `resource=analytics` read and the same datasets as before; only the presentation changed: every chart
// sits in a ChartCard (named figure + tabular equivalent), colours come from the token palette, animation is
// switched off under prefers-reduced-motion and the stage-completion track selector is text with aria-pressed.
export default function ProjectAnalytics({ token, projectCode, classId, tracks }: Props) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stageTrack, setStageTrack] = useState<string>(tracks[0]?.trackId || "");
  const palette = useMemo(() => chartPalette(), []);

  async function load() {
    setLoading(true); setError("");
    try {
      const r = await trackerGet<{ analytics: AnalyticsData; groups: ProjectGroup[] }>(token, projectCode, "analytics", { classId });
      setData(r.analytics); setGroups(r.groups || []);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل الإحصائيات."); }
    finally { setLoading(false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [classId, projectCode]);

  const barOptions = useMemo<ChartOptions<"bar">>(() => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: true }, tooltip: { rtl: true } },
    scales: { y: { beginAtZero: true, max: 100, grid: { color: palette.grid } }, x: { grid: { display: false } } }
  }), [palette]);
  const countOptions = useMemo<ChartOptions<"bar">>(() => ({ ...barOptions, scales: { ...barOptions.scales, y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: palette.grid } } } }), [barOptions, palette]);
  const doughnutOptions = useMemo<ChartOptions<"doughnut">>(() => ({ responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "bottom", rtl: true }, tooltip: { rtl: true } } }), []);
  const motion = (reduced: boolean) => (reduced ? { animation: false as const } : {});

  const perStudentData = useMemo(() => data && ({
    labels: data.perStudent.map(s => s.name),
    datasets: [{ label: "التقدم العام", data: data.perStudent.map(s => s.overall), backgroundColor: palette.series[0], borderRadius: 6 }]
  }), [data, palette]);

  const trackCompareData = useMemo(() => data && ({
    labels: data.perStudent.map(s => s.name),
    datasets: tracks.map((t, i) => ({ label: t.title, data: data.perStudent.map(s => s.trackProgress[t.trackId] || 0), backgroundColor: palette.series[i % palette.series.length], borderRadius: 6 }))
  }), [data, tracks, palette]);

  const stageRows = useMemo(() => data ? data.stageCompletion.filter(s => s.track === stageTrack) : [], [data, stageTrack]);
  const stageData = useMemo(() => ({ labels: stageRows.map(s => s.stageId), datasets: [{ label: "نسبة الاعتماد", data: stageRows.map(s => s.approvedPct), backgroundColor: palette.series[1], borderRadius: 5 }] }), [stageRows, palette]);

  const BUCKETS: (keyof AnalyticsData["buckets"])[] = ["0-25", "26-50", "51-75", "76-99", "100"];
  const bucketData = useMemo(() => data && ({
    labels: ["0–25", "26–50", "51–75", "76–99", "100"],
    datasets: [{ label: "عدد الطلاب", data: BUCKETS.map(b => data.buckets[b]), backgroundColor: palette.series[0], borderRadius: 6 }]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data, palette]);

  const trendData = useMemo(() => data && ({
    labels: data.weeklyTrend.map(w => w.weekStart),
    datasets: [{ label: "متوسط تقدّم الصف", data: data.weeklyTrend.map(w => w.avgOverall), borderColor: palette.primary, backgroundColor: palette.primarySoft, fill: true, tension: .3 }]
  }), [data, palette]);

  const statusCounts = useMemo(() => {
    const counts: Record<StageStatus, number> = { approved: 0, ready_for_review: 0, in_progress: 0, not_started: 0 };
    if (data) for (const row of data.heatmap.statuses) for (const key of Object.keys(row)) counts[row[key]] += 1;
    return counts;
  }, [data]);
  const STATUS_CHART_ORDER: StageStatus[] = ["approved", "ready_for_review", "in_progress", "not_started"];
  const statusDist = useMemo(() => ({
    labels: STATUS_CHART_ORDER.map(s => stageStatusLabel(s)),
    datasets: [{ data: STATUS_CHART_ORDER.map(s => statusCounts[s]), backgroundColor: STATUS_CHART_ORDER.map(s => palette.status[s]), borderWidth: 0 }]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [statusCounts, palette]);

  if (loading && !data) return <p className="eb-muted" role="status">جارٍ تحميل الإحصائيات...</p>;
  if (error) return <div className="platform-error assignment-inline-message" role="alert">{error} <button type="button" className="eb-button is-small" onClick={() => void load()}>إعادة المحاولة</button></div>;
  if (!data) return null;
  if (!data.perStudent.length) return <EmptyState title="لا توجد بيانات كافية للرسوم البيانية." description="تظهر الإحصائيات بعد وجود طلاب وتقدّم مسجّل في هذا الصف." />;

  return (
    <section className="eb-project-analytics" aria-labelledby="eb-project-analytics-title">
      <h2 id="eb-project-analytics-title" className="eb-subheading">الإحصائيات</h2>
      <div className="eb-chart-grid">
        <ChartCard title="تقدّم كل طالب" table={{ columns: ["الطالب", "التقدم العام %"], rows: data.perStudent.map(s => [s.name, s.overall]) }}>
          {({ reducedMotion }) => perStudentData && <div className="eb-chart-canvas"><Bar data={perStudentData} options={{ ...barOptions, ...motion(reducedMotion) }} /></div>}
        </ChartCard>
        <ChartCard title="مقارنة المسارات" table={{ columns: ["الطالب", ...tracks.map(t => t.title + " %")], rows: data.perStudent.map(s => [s.name, ...tracks.map(t => s.trackProgress[t.trackId] || 0)]) }}>
          {({ reducedMotion }) => trackCompareData && <div className="eb-chart-canvas"><Bar data={trackCompareData} options={{ ...barOptions, ...motion(reducedMotion) }} /></div>}
        </ChartCard>
        <ChartCard title="نسبة إنجاز كل مرحلة" description={"المسار: " + (tracks.find(t => t.trackId === stageTrack)?.title || "")}
          actions={<div className="eb-segmented" role="group" aria-label="مسار المراحل">{tracks.map(t => <button key={t.trackId} type="button" aria-pressed={stageTrack === t.trackId} onClick={() => setStageTrack(t.trackId)}>{t.title}</button>)}</div>}
          table={{ columns: ["المرحلة", "العنوان", "نسبة الاعتماد %"], rows: stageRows.map(s => [s.stageId, s.title, s.approvedPct]) }}>
          {({ reducedMotion }) => <div className="eb-chart-canvas is-tall"><Bar data={stageData} options={{ ...barOptions, ...motion(reducedMotion) }} /></div>}
        </ChartCard>
        <ChartCard title="توزيع الطلاب حسب التقدم" table={{ columns: ["النطاق", "عدد الطلاب"], rows: BUCKETS.map((b, i) => [["0–25", "26–50", "51–75", "76–99", "100"][i], data.buckets[b]]) }}>
          {({ reducedMotion }) => bucketData && <div className="eb-chart-canvas"><Bar data={bucketData} options={{ ...countOptions, ...motion(reducedMotion) }} /></div>}
        </ChartCard>
        <ChartCard title="تطوّر متوسط تقدّم الصف" table={{ columns: ["الأسبوع", "متوسط التقدّم %"], rows: data.weeklyTrend.map(w => [w.weekStart, w.avgOverall]) }}>
          {({ reducedMotion }) => data.weeklyTrend.length
            ? (trendData && <div className="eb-chart-canvas"><Line data={trendData} options={{ ...(barOptions as unknown as ChartOptions<"line">), ...motion(reducedMotion) }} /></div>)
            : <EmptyState compact title="لا توجد بيانات زمنية كافية بعد." />}
        </ChartCard>
        <ChartCard title="توزيع حالات المراحل في الصف" table={{ columns: ["الحالة", "عدد المراحل"], rows: STAGE_STATUS_ORDER.map(s => [stageStatusLabel(s), statusCounts[s]]) }}>
          {({ reducedMotion }) => <div className="eb-chart-canvas"><Doughnut data={statusDist} options={{ ...doughnutOptions, ...motion(reducedMotion) }} /></div>}
        </ChartCard>
      </div>
      <section className="eb-heatmap-card" aria-labelledby="eb-heatmap-title">
        <h3 id="eb-heatmap-title" className="eb-subheading">الخريطة الحرارية للمراحل</h3>
        <ProjectHeatmap heatmap={data.heatmap} tracks={tracks} groups={groups} />
      </section>
    </section>
  );
}
