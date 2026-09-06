import { useEffect, useMemo, useState } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler, type ChartOptions } from "chart.js";
import { Bar, Line, Doughnut } from "react-chartjs-2";
import { projectApi } from "./api";
import ProjectHeatmap from "./ProjectHeatmap";
import { STATUS_META } from "./helpers";
import type { ProjectAnalytics as AnalyticsData, Track, StageStatus } from "./types";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

const BLUE = "rgba(37,99,235,.82)";
const TEAL = "rgba(13,148,136,.82)";
const barOptions: ChartOptions<"bar"> = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: true, labels: { font: { family: "inherit" } } }, tooltip: { rtl: true } },
  scales: { y: { beginAtZero: true, max: 100, grid: { color: "rgba(148,163,184,.18)" } }, x: { grid: { display: false } } }
};

export default function ProjectAnalytics({ token, classId }: { token: string; classId: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stageTrack, setStageTrack] = useState<Track>("book");

  async function load() {
    setLoading(true); setError("");
    try {
      const r = await projectApi<{ analytics: AnalyticsData }>(token, "/api/project-794589?resource=analytics&classId=" + encodeURIComponent(classId));
      setData(r.analytics);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل الإحصائيات."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [classId]);

  const perStudentData = useMemo(() => data && ({
    labels: data.perStudent.map(s => s.name),
    datasets: [{ label: "التقدم العام", data: data.perStudent.map(s => s.overall), backgroundColor: BLUE, borderRadius: 6 }]
  }), [data]);

  const bookVsPtData = useMemo(() => data && ({
    labels: data.perStudent.map(s => s.name),
    datasets: [
      { label: "📘 الكتاب", data: data.perStudent.map(s => s.book), backgroundColor: BLUE, borderRadius: 6 },
      { label: "🖧 Packet Tracer", data: data.perStudent.map(s => s.packetTracer), backgroundColor: TEAL, borderRadius: 6 }
    ]
  }), [data]);

  const stageData = useMemo(() => {
    if (!data) return null;
    const rows = data.stageCompletion.filter(s => s.track === stageTrack);
    return { labels: rows.map(s => s.stageId), datasets: [{ label: "نسبة الاعتماد", data: rows.map(s => s.approvedPct), backgroundColor: TEAL, borderRadius: 5 }] };
  }, [data, stageTrack]);

  const bucketData = useMemo(() => data && ({
    labels: ["0–25", "26–50", "51–75", "76–99", "100"],
    datasets: [{ label: "عدد الطلاب", data: [data.buckets["0-25"], data.buckets["26-50"], data.buckets["51-75"], data.buckets["76-99"], data.buckets["100"]], backgroundColor: BLUE, borderRadius: 6 }]
  }), [data]);

  const trendData = useMemo(() => data && ({
    labels: data.weeklyTrend.map(w => w.weekStart),
    datasets: [{ label: "متوسط تقدّم الصف", data: data.weeklyTrend.map(w => w.avgOverall), borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,.14)", fill: true, tension: .3 }]
  }), [data]);

  // Class-wide distribution of every student×stage cell's status (derived from the heatmap payload).
  const statusDist = useMemo(() => {
    if (!data) return null;
    const order: StageStatus[] = ["approved", "ready_for_review", "in_progress", "not_started"];
    const counts: Record<StageStatus, number> = { approved: 0, ready_for_review: 0, in_progress: 0, not_started: 0 };
    for (const row of data.heatmap.statuses) for (const key of Object.keys(row)) counts[row[key]] += 1;
    return {
      labels: order.map(s => STATUS_META[s].label),
      datasets: [{ data: order.map(s => counts[s]), backgroundColor: ["#22c55e", "#60a5fa", "#fde047", "#e2e8f0"], borderWidth: 0 }]
    };
  }, [data]);
  const doughnutOptions: ChartOptions<"doughnut"> = { responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "bottom", rtl: true }, tooltip: { rtl: true } } };

  if (loading && !data) return <div className="platform-loading">⏳ جارٍ التحميل...</div>;
  if (error) return <div className="platform-error">{error} <button onClick={() => void load()}>إعادة المحاولة</button></div>;
  if (!data) return null;
  if (!data.perStudent.length) return <div className="platform-empty">لا توجد بيانات كافية للرسوم البيانية.</div>;

  return (
    <>
    <div className="p794-analytics">
      <section className="platform-card"><h3>تقدّم كل طالب</h3><div className="p794-chart">{perStudentData && <Bar data={perStudentData} options={barOptions} />}</div></section>
      <section className="platform-card"><h3>📘 الكتاب مقابل 🖧 Packet Tracer</h3><div className="p794-chart">{bookVsPtData && <Bar data={bookVsPtData} options={barOptions} />}</div></section>
      <section className="platform-card">
        <div className="platform-card-heading"><h3>نسبة إنجاز كل مرحلة</h3>
          <div className="analytics-view-tabs">
            {(["book", "packetTracer"] as Track[]).map(t => <button key={t} type="button" className={"analytics-view-tab " + (stageTrack === t ? "active" : "")} onClick={() => setStageTrack(t)}>{t === "book" ? "📘" : "🖧"}</button>)}
          </div>
        </div>
        <div className="p794-chart p794-chart-tall">{stageData && <Bar data={stageData} options={barOptions} />}</div>
      </section>
      <section className="platform-card"><h3>توزيع الطلاب حسب التقدم</h3><div className="p794-chart">{bucketData && <Bar data={bucketData} options={{ ...barOptions, scales: { ...barOptions.scales, y: { beginAtZero: true, ticks: { precision: 0 } } } }} />}</div></section>
      <section className="platform-card"><h3>تطوّر متوسط تقدّم الصف</h3><div className="p794-chart">{data.weeklyTrend.length ? (trendData && <Line data={trendData} options={barOptions as unknown as ChartOptions<"line">} />) : <div className="platform-empty">لا توجد بيانات زمنية كافية بعد.</div>}</div></section>
      <section className="platform-card"><h3>توزيع حالات المراحل في الصف</h3><div className="p794-chart">{statusDist && <Doughnut data={statusDist} options={doughnutOptions} />}</div></section>
    </div>
    <section className="platform-card p794-heatmap-card"><h3>الخريطة الحرارية للمراحل</h3><ProjectHeatmap heatmap={data.heatmap} /></section>
    </>
  );
}
