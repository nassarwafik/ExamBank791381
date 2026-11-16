// PRESENTATION ONLY — the charts of the project exam form in the teacher's «الإحصائيات» view, for an already-loaded
// `exam-form-stats` payload: how many students stand where, how far each one filled the form, which sections the class is
// stuck on, and (during a live follow-up) how the class average moved from one refresh to the next. Nothing is fetched and
// nothing is recomputed here beyond chart / table shaping. Every chart keeps a tabular equivalent (ChartCard).
import { useMemo } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler, type ChartOptions } from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { chartPalette, tokenColor, withAlpha } from "../chartPalette";
import ChartCard from "../../ui/ChartCard";
import StatCard from "../../ui/StatCard";
import StatusBadge from "../../ui/StatusBadge";
import type { FormStats, FormStatsBucket, FormStatsTrendPoint, TeacherFormStatus } from "./teacherTypes";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

type Props = { stats: FormStats; trend: FormStatsTrendPoint[]; live: boolean };

const STATUS_ORDER: TeacherFormStatus[] = ["approved", "submitted", "returned", "draft", "not_started"];
const STATUS_TEXT: Record<TeacherFormStatus, string> = { not_started: "لم يبدأ", draft: "قيد التعبئة", submitted: "سُلّمت", returned: "أُعيدت للتصحيح", approved: "اعتُمدت" };
const BUCKETS: FormStatsBucket[] = ["0", "1-25", "26-50", "51-75", "76-99", "100"];
const BUCKET_TEXT = ["0", "1–25", "26–50", "51–75", "76–99", "100"];
// On the canvas (an RTL page) a bare «1–25» is drawn as «25–1»: the range is embedded left-to-right. Tables use the bare text.
const BUCKET_LABELS = BUCKET_TEXT.map(t => "\u202A" + t + "\u202C");
const ROW_PX = 26;

export const clockOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-GB", { hour12: false });
};

export default function ExamFormStatsCharts({ stats, trend, live }: Props) {
  const palette = useMemo(() => chartPalette(), []);
  const statusColor = useMemo<Record<TeacherFormStatus, string>>(() => ({
    approved: tokenColor("--eb-success"), submitted: tokenColor("--eb-info"), returned: tokenColor("--eb-danger"),
    draft: tokenColor("--eb-warn"), not_started: tokenColor("--eb-faint")
  }), []);
  const motion = (reduced: boolean) => (reduced ? { animation: false as const } : {});

  const percentAxis = useMemo(() => ({ beginAtZero: true, max: 100, grid: { color: palette.grid } }), [palette]);
  const barOptions = useMemo<ChartOptions<"bar">>(() => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { rtl: true } },
    scales: { y: percentAxis, x: { grid: { display: false } } }
  }), [percentAxis]);
  const horizontalOptions = useMemo<ChartOptions<"bar">>(() => ({
    responsive: true, maintainAspectRatio: false, indexAxis: "y",
    plugins: { legend: { display: false }, tooltip: { rtl: true } },
    scales: { x: percentAxis, y: { grid: { display: false }, ticks: { autoSkip: false } } }
  }), [percentAxis]);
  const countOptions = useMemo<ChartOptions<"bar">>(() => ({ ...barOptions, scales: { ...barOptions.scales, y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: palette.grid } } } }), [barOptions, palette]);
  const doughnutOptions = useMemo<ChartOptions<"doughnut">>(() => ({ responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "bottom", rtl: true }, tooltip: { rtl: true } } }), []);
  const lineOptions = useMemo<ChartOptions<"line">>(() => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: true }, tooltip: { rtl: true } },
    scales: { y: percentAxis, x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } } }
  }), [percentAxis]);

  // The fullest forms first; equal ones keep the class order (the server's, by name).
  const ranked = useMemo(() => stats.students.map((s, i) => ({ s, i })).sort((a, b) => b.s.percent - a.s.percent || a.i - b.i).map(x => x.s), [stats]);
  const statusData = useMemo(() => ({
    labels: STATUS_ORDER.map(s => STATUS_TEXT[s]),
    datasets: [{ data: STATUS_ORDER.map(s => stats.counts[s] || 0), backgroundColor: STATUS_ORDER.map(s => statusColor[s]), borderWidth: 0 }]
  }), [stats, statusColor]);
  const studentData = useMemo(() => ({
    labels: ranked.map(s => s.displayName),
    datasets: [{ label: "نسبة التعبئة", data: ranked.map(s => s.percent), backgroundColor: ranked.map(s => withAlpha(statusColor[s.status], 0.85)), borderRadius: 4 }]
  }), [ranked, statusColor]);
  const sectionData = useMemo(() => ({
    labels: stats.sections.map((_, i) => String(i + 1)),
    datasets: [{ label: "متوسط التعبئة", data: stats.sections.map(s => s.averagePercent), backgroundColor: palette.series[1], borderRadius: 5 }]
  }), [stats, palette]);
  const sectionOptions = useMemo<ChartOptions<"bar">>(() => ({
    ...barOptions,
    plugins: { ...barOptions.plugins, tooltip: { rtl: true, callbacks: { title: items => stats.sections[items[0]?.dataIndex ?? 0]?.title || "" } } }
  }), [barOptions, stats]);
  const bucketData = useMemo(() => ({
    labels: BUCKET_LABELS,
    datasets: [{ label: "عدد الطلاب", data: BUCKETS.map(b => stats.buckets[b] || 0), backgroundColor: palette.series[0], borderRadius: 6 }]
  }), [stats, palette]);
  const trendData = useMemo(() => ({
    labels: trend.map(p => clockOf(p.at)),
    datasets: [{ label: "متوسط تعبئة الصف", data: trend.map(p => p.averagePercent), borderColor: palette.primary, backgroundColor: palette.primarySoft, fill: true, tension: .3, pointRadius: trend.length > 40 ? 0 : 3 }]
  }), [trend, palette]);

  const handedIn = stats.counts.submitted + stats.counts.approved;
  return (
    <section className="eb-form-stats" aria-labelledby="eb-form-stats-title" data-testid="exam-form-stats">
      <div className="eb-form-stats-head">
        <h3 id="eb-form-stats-title" className="eb-subheading">تعبئة استمارة الامتحان</h3>
        <StatusBadge tone={stats.state === "open" ? "success" : "warn"}>{stats.state === "open" ? "مفتوحة للطلاب" : "مغلقة"}</StatusBadge>
        <span className="eb-muted"><span dir="ltr">{stats.totalQuestions}</span> سؤالًا لكل طالب</span>
      </div>
      <div className="eb-form-stats-kpis">
        <StatCard label="متوسط التعبئة" value={<span dir="ltr">{stats.averagePercent}%</span>} tone="info" />
        <StatCard label="يكتبون الآن" value={stats.activeNow} tone={stats.activeNow > 0 ? "success" : "neutral"} hint={"حفظوا خلال آخر " + Math.round(stats.activeWindowSeconds / 60) + " دقيقة"} />
        <StatCard label="لم يبدأوا" value={stats.counts.not_started} tone={stats.counts.not_started > 0 ? "attention" : "neutral"} />
        <StatCard label="قيد التعبئة" value={stats.counts.draft + stats.counts.returned} hint={stats.counts.returned > 0 ? "منها أُعيدت للتصحيح: " + stats.counts.returned : undefined} />
        <StatCard label="سلّموا" value={handedIn} tone="success" hint={"من " + stats.studentCount + " — اعتُمدت: " + stats.counts.approved} />
      </div>
      <div className="eb-chart-grid">
        <ChartCard title="حالات الاستمارات في الصف" table={{ columns: ["الحالة", "عدد الطلاب"], rows: STATUS_ORDER.map(s => [STATUS_TEXT[s], stats.counts[s] || 0]) }}>
          {({ reducedMotion }) => <div className="eb-chart-canvas"><Doughnut data={statusData} options={{ ...doughnutOptions, ...motion(reducedMotion) }} aria-hidden="true" /></div>}
        </ChartCard>
        <ChartCard title="توزيع الطلاب حسب نسبة التعبئة" table={{ columns: ["النطاق %", "عدد الطلاب"], rows: BUCKETS.map((b, i) => [BUCKET_TEXT[i], stats.buckets[b] || 0]) }}>
          {({ reducedMotion }) => <div className="eb-chart-canvas"><Bar data={bucketData} options={{ ...countOptions, ...motion(reducedMotion) }} aria-hidden="true" /></div>}
        </ChartCard>
        <ChartCard title="تعبئة كل طالب" description="من الأكثر تعبئة إلى الأقل. لون العمود حسب حالة الاستمارة."
          table={{ columns: ["الطالب", "الحالة", "المجاب", "التعبئة %", "آخر حفظ"], rows: ranked.map(s => [s.displayName, STATUS_TEXT[s.status], s.answered + " / " + s.total, s.percent, clockOf(s.updatedAt) || "—"]) }}>
          {({ reducedMotion }) => <div className="eb-chart-canvas" style={{ height: Math.max(220, ranked.length * ROW_PX + 40) }}><Bar data={studentData} options={{ ...horizontalOptions, ...motion(reducedMotion) }} aria-hidden="true" /></div>}
        </ChartCard>
        <ChartCard title="متوسط التعبئة في كل قسم" description="رقم العمود هو ترتيب القسم في الاستمارة؛ الأسماء في الجدول."
          table={{ columns: ["#", "القسم", "الأسئلة", "متوسط التعبئة %", "أكملوه"], rows: stats.sections.map((s, i) => [i + 1, s.title, s.questions, s.averagePercent, s.completeCount]) }}>
          {({ reducedMotion }) => <div className="eb-chart-canvas is-tall"><Bar data={sectionData} options={{ ...sectionOptions, ...motion(reducedMotion) }} aria-hidden="true" /></div>}
        </ChartCard>
        {(live || trend.length > 1) && (
          <ChartCard className="is-wide" title="تطوّر تعبئة الصف أثناء المتابعة المباشرة" description="نقطة عند كل تحديث منذ تشغيل Live."
            table={{ columns: ["الوقت", "متوسط التعبئة %", "يكتبون الآن", "سلّموا"], rows: trend.map(p => [clockOf(p.at), p.averagePercent, p.activeNow, p.handedIn]) }}>
            {({ reducedMotion }) => <div className="eb-chart-canvas"><Line data={trendData} options={{ ...lineOptions, ...motion(reducedMotion) }} aria-hidden="true" /></div>}
          </ChartCard>
        )}
      </div>
    </section>
  );
}
