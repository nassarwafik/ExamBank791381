import { useEffect, useMemo, useState } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler, type ChartOptions } from "chart.js";
import { Line, Doughnut, Bar } from "react-chartjs-2";
import ChartCard from "../ui/ChartCard";
import { chartPalette, tokenColor } from "../projects/chartPalette";
import { fmtPct, trendModel, trendPoints, submissionModel, distributionModel, classComparisonModel, topicModel, topicPoints } from "../teacher/dashboardChartTables";
import type { OwnerTeacherDashboard as Dashboard } from "./ownerApi";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

/**
 * Owner teacher dashboard (phase 3) — the charts of «لوحة البيانات». Each chart is the figure of a shared ChartCard: its title, its
 * accessible name (a text summary) and a data table with EXACTLY the series the chart draws (teacher/dashboardChartTables, the same
 * models as the teacher's own «لوحة المتابعة»). The canvases are aria-hidden; colours come from the theme tokens (both themes);
 * animation follows the reduced-motion preference (ChartCard passes it).
 */

const EMPTY_TABLE = { columns: [], rows: [] };
/** A number range like «90–100» drawn on a right-to-left canvas keeps its order inside a left-to-right isolate. */
const ltr = (label: string) => "\u2066" + label + "\u2069";
const clamp = (v: number | null) => Math.max(0, Math.min(100, Number(v ?? 0)));
const empty = (text: string) => <p className="eb-owner-dash-chart-empty">{text}</p>;
const animation = (reduce: boolean, duration: number) => (reduce ? false as const : { duration, easing: "easeOutQuart" as const });
/** Chart.js needs resolved colours: they are read from the theme tokens, and read again when the theme changes (the page's
 *  data-theme attribute, or the system's light / dark preference), so a chart never keeps the other theme's colours. */
function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion(v => v + 1);
    const observer = typeof MutationObserver === "function" ? new MutationObserver(bump) : null;
    observer?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
    const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    mq?.addEventListener?.("change", bump);
    return () => { observer?.disconnect(); mq?.removeEventListener?.("change", bump); };
  }, []);
  return version;
}
function useTheme() {
  const version = useThemeVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` is the trigger to read the tokens again
  return useMemo(() => ({ ...chartPalette(), text: tokenColor("--eb-muted") }), [version]);
}

function TrendLine({ items, label, reduce }: { items: { title: string; className: string; average: number | null }[]; label: string; reduce: boolean }) {
  const t = useTheme();
  const points = trendPoints(items);
  const data = { labels: points.map(p => p.title), datasets: [{ label, data: points.map(p => clamp(p.average)), borderColor: t.primary, backgroundColor: t.primarySoft, pointBackgroundColor: t.primary, pointRadius: 4, pointHoverRadius: 7, borderWidth: 3, tension: 0.35, fill: true }] };
  const options: ChartOptions<"line"> = {
    responsive: true, maintainAspectRatio: false, animation: animation(reduce, 900), interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false }, tooltip: { rtl: true, callbacks: { label: i => " " + label + ": " + Number(i.raw || 0).toFixed(1) + "%" } } },
    scales: { y: { position: "right", beginAtZero: true, max: 100, ticks: { color: t.text, callback: v => v + "%" }, grid: { color: t.grid } }, x: { reverse: true, grid: { display: false }, ticks: { color: t.text, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }, }
  };
  return <div className="eb-owner-dash-canvas is-line"><Line data={data} options={options} aria-hidden="true" /></div>;
}

function SubmissionDonut({ submitted, missing, pendingReview, reduce }: { submitted: number; missing: number; pendingReview: number; reduce: boolean }) {
  const t = useTheme();
  const total = Math.max(1, submitted + missing);
  const data = { labels: ["تم التسليم", "لم يُسلّم"], datasets: [{ data: [submitted, missing], backgroundColor: [t.primary, t.status.not_started], borderWidth: 0, hoverOffset: 8 }] };
  const options: ChartOptions<"doughnut"> = { responsive: true, maintainAspectRatio: false, cutout: "72%", animation: animation(reduce, 1000), plugins: { legend: { display: false }, tooltip: { rtl: true } } };
  return (
    <div className="eb-owner-dash-donut">
      <div className="eb-owner-dash-canvas is-donut">
        <Doughnut data={data} options={options} aria-hidden="true" />
        <div className="eb-owner-dash-donut-center" aria-hidden="true"><strong>{fmtPct(submitted / total * 100)}</strong><span>تسليم</span></div>
      </div>
      <ul className="eb-owner-dash-legend" aria-hidden="true">
        <li><i className="is-submitted" />تم التسليم <b>{submitted}</b></li>
        <li><i className="is-missing" />لم يُسلّم <b>{missing}</b></li>
        <li><i className="is-review" />تحتاج مراجعة <b>{pendingReview}</b></li>
      </ul>
    </div>
  );
}

function Bars({ labels, values, colors, label, horizontal = false, percent = false, reduce, onPick }: {
  labels: string[]; values: number[]; colors: string | string[]; label: string; horizontal?: boolean; percent?: boolean; reduce: boolean; onPick?: (index: number) => void;
}) {
  const t = useTheme();
  const data = { labels, datasets: [{ label, data: values, backgroundColor: colors, borderRadius: 7, borderSkipped: false as const }] };
  const valueAxis = { beginAtZero: true, ...(percent ? { max: 100 } : {}), ticks: { color: t.text, ...(percent ? { callback: (v: string | number) => v + "%" } : { precision: 0 }) }, grid: { color: t.grid } };
  const labelAxis = { grid: { display: false }, ticks: { color: t.text } };
  const options: ChartOptions<"bar"> = {
    responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? "y" : "x", animation: animation(reduce, 950),
    onClick: onPick ? (_e, els) => { const i = els[0]?.index; if (i !== undefined) onPick(i); } : undefined,
    plugins: { legend: { display: false }, tooltip: { rtl: true, callbacks: { label: i => " " + label + ": " + (percent ? Number(i.raw || 0).toFixed(1) + "%" : String(i.raw)) } } },
    // right to left (Arabic): a vertical chart reads from the right (value axis on the right); a horizontal one grows from the right
    scales: horizontal ? { x: { ...valueAxis, reverse: true }, y: { ...labelAxis, position: "right" as const } } : { y: { ...valueAxis, position: "right" as const }, x: { ...labelAxis, reverse: true } }
  };
  return <div className={"eb-owner-dash-canvas" + (horizontal ? " is-horizontal" : "")} style={horizontal ? { blockSize: Math.max(180, labels.length * 34 + 60) } : undefined}><Bar data={data} options={options} aria-hidden="true" /></div>;
}

export function DashboardCharts({ data, onPickClass }: { data: Dashboard; onPickClass?: (classId: string) => void }) {
  const t = useTheme();
  const student = Boolean(data.studentDetail);
  const trendItems = data.studentDetail
    ? data.studentDetail.scoreTrend.map(p => ({ title: p.title, className: data.studentDetail!.className, average: p.percentage }))
    : data.assignmentTrend;
  const trend = trendModel(trendItems, student);
  const status = submissionModel(data.submissionStatus.submitted, data.submissionStatus.missing, data.submissionStatus.pendingReview);
  const distribution = distributionModel(data.gradeDistribution, student);
  const classes = classComparisonModel(data.classComparison);
  const topicItems = data.studentDetail ? data.studentDetail.topicAnalytics : data.topicAnalytics;
  const topics = topicModel(topicItems);
  const visibleTopics = topicPoints(topicItems);
  const showClasses = !student && data.classComparison.length > 1;
  return (
    <div className="eb-owner-dash-charts">
      <ChartCard className="eb-owner-dash-chart is-wide" level={2} title={student ? "حركة علامات الطالب" : "تطور متوسط الأداء"} ariaLabel={trend?.summary} table={trend?.table || EMPTY_TABLE}
        empty={trend ? undefined : empty(student ? "تظهر حركة العلامات بعد نتيجتين على الأقل." : "يظهر تطور الأداء بعد نتيجتين على الأقل.")}>
        {({ reducedMotion }) => <TrendLine items={trendItems} label={student ? "العلامة" : "المتوسط"} reduce={reducedMotion} />}
      </ChartCard>
      <ChartCard className="eb-owner-dash-chart" level={2} title="حالة التسليم" ariaLabel={status.summary} table={status.table}
        empty={data.submissionStatus.submitted + data.submissionStatus.missing === 0 ? empty("لا توجد تسليمات متوقعة بعد.") : undefined}>
        {({ reducedMotion }) => <SubmissionDonut {...data.submissionStatus} reduce={reducedMotion} />}
      </ChartCard>
      <ChartCard className="eb-owner-dash-chart" level={2} title="توزيع العلامات" ariaLabel={distribution?.summary} table={distribution?.table || EMPTY_TABLE}
        empty={distribution && data.gradeDistribution.some(b => b.count > 0) ? undefined : empty("لا توجد علامات بعد.")}>
        {({ reducedMotion }) => <Bars labels={data.gradeDistribution.map(b => ltr(b.label))} values={data.gradeDistribution.map(b => b.count)} colors={t.series[0]} label={student ? "عدد الواجبات" : "عدد الطلاب"} reduce={reducedMotion} />}
      </ChartCard>
      {showClasses && (
        <ChartCard className="eb-owner-dash-chart" level={2} title="مقارنة الصفوف" description={onPickClass ? "اضغط على صف لعرض تفاصيله" : undefined} ariaLabel={classes?.summary} table={classes?.table || EMPTY_TABLE}
          after={onPickClass ? (
            <ul className="eb-owner-dash-picker" aria-label="اختيار صف">
              {data.classComparison.map(c => <li key={c.classId}><button type="button" className="eb-owner-chip" onClick={() => onPickClass(c.classId)}>{c.name} <b><bdi dir="ltr">{fmtPct(c.average)}</bdi></b></button></li>)}
            </ul>
          ) : undefined}>
          {({ reducedMotion }) => <Bars horizontal percent labels={data.classComparison.map(c => c.name)} values={data.classComparison.map(c => clamp(c.average))} colors={t.series[1]} label="متوسط الصف" reduce={reducedMotion}
            onPick={onPickClass ? i => { const c = data.classComparison[i]; if (c) onPickClass(c.classId); } : undefined} />}
        </ChartCard>
      )}
      <ChartCard className={"eb-owner-dash-chart" + (showClasses ? "" : " is-wide")} level={2} title={student ? "مواضيع الطالب" : "الأداء حسب الموضوع"} description="الأضعف أولًا" ariaLabel={topics?.summary} table={topics?.table || EMPTY_TABLE}
        empty={topics ? undefined : empty("تظهر المواضيع بعد وجود إجابات مصححة.")}>
        {({ reducedMotion }) => <Bars horizontal percent labels={visibleTopics.map(x => x.topic)} values={visibleTopics.map(x => clamp(x.average))}
          colors={visibleTopics.map(x => (Number(x.average || 0) < 60 ? t.scale.low : Number(x.average || 0) >= 80 ? t.scale.high : t.scale.mid))} label="المتوسط" reduce={reducedMotion} />}
      </ChartCard>
    </div>
  );
}
