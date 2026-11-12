import { useMemo } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler } from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import ChartCard from "../ui/ChartCard";
import { usePrefersReducedMotion } from "../ui/usePrefersReducedMotion";
import { STAGE_STATUS_ORDER, stageStatusLabel } from "../projects/teacherPresentation";
import type { StageStatus } from "../projects/types";
import { reportPalette, chartMotion, percentLineOptions, barOptions, barSeries, lineSeries, rowsHeight } from "./chartKit";
import {
  GRADED_LABEL, PENDING_LABEL, MISSING_LABEL, finiteOrNull, gradedValue, stateText, latestChange, signed, rankStandings, gapToClass,
  aboveClassCount, weeklyDeltas, rowSplit, shortLabel,
  type StudentStanding, type StudentAssessmentPoint, type OverviewClass
} from "./insights";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

/**
 * Phase R-5a — the Reports Center charts. PRESENTATION ONLY: every component draws series the API already computed (or a
 * difference of two of its numbers) inside a ChartCard, whose table is the same data in words, so the canvas is never the only
 * way to read a value. A value that is not a final result (awaiting the teacher, not handed in) is a gap on the chart and its
 * state in the table — never a zero. Motion: marks grow in once (chartKit.chartMotion); reduced motion draws them at once.
 */
type Level = 2 | 3;
const usePalette = () => useMemo(() => reportPalette(), []);
const dash = (v: number | null | undefined) => (v === null || v === undefined ? "—" : Math.round(v) + "%");
const changeText = (values: (number | null)[], subject: string, previous: string) => {
  const c = latestChange(values);
  return c ? subject + " " + Math.round(c.last) + "% — " + (c.delta === 0 ? "بلا تغيّر عن " + previous : signed(c.delta) + " نقطة عن " + previous) + "." : "";
};

/* ---------------- average + submission rate along a sequence (assessments or months) ---------------- */

export type TrendPoint = { label: string; detail?: string; average: number | null; submissionRate: number };

export function PerformanceTrendChart({ points, title, description, firstColumn, level = 3 }: { points: TrendPoint[]; title: string; description?: string; firstColumn: string; level?: Level }) {
  const palette = usePalette();
  const reduced = usePrefersReducedMotion();
  const animation = useMemo(() => chartMotion(reduced, points.length), [reduced, points.length]);
  const data = useMemo(() => ({
    labels: points.map(p => shortLabel(p.label)),
    datasets: [
      lineSeries("متوسط النتائج", points.map(p => finiteOrNull(p.average)), palette.info, palette, palette.infoSoft),
      lineSeries("نسبة التسليم", points.map(p => p.submissionRate), palette.warn, palette)
    ]
  }), [points, palette]);
  const options = useMemo(() => percentLineOptions(palette, animation, points.map(p => p.label + (p.detail ? " · " + p.detail : "")), true), [palette, animation, points]);
  const change = changeText(points.map(p => finiteOrNull(p.average)), "آخر متوسط", "الذي قبله");
  return (
    <ChartCard level={level} title={title} description={[description, change].filter(Boolean).join(" ")}
      table={{ columns: [firstColumn, ...(points.some(p => p.detail) ? ["التاريخ"] : []), "متوسط النتائج %", "نسبة التسليم %"], rows: points.map(p => [p.label, ...(points.some(q => q.detail) ? [p.detail || "—"] : []), p.average === null ? "—" : p.average, p.submissionRate]) }}>
      <div className="eb-chart-canvas"><Line data={data} options={options} aria-hidden="true" /></div>
    </ChartCard>
  );
}

/* ---------------- graded / pending / missing per assessment ---------------- */

export type StatusRow = { title: string; submitted: number; missing: number; pendingReview?: number };

export function SubmissionStatusChart({ rows, level = 3 }: { rows: StatusRow[]; level?: Level }) {
  const palette = usePalette();
  const reduced = usePrefersReducedMotion();
  const animation = useMemo(() => chartMotion(reduced, rows.length), [reduced, rows.length]);
  const splits = useMemo(() => rows.map(rowSplit), [rows]);
  const data = useMemo(() => ({
    labels: rows.map(r => shortLabel(r.title, 22)),
    datasets: [
      barSeries(GRADED_LABEL, splits.map(s => s.graded), palette.success, palette, true),
      barSeries(PENDING_LABEL, splits.map(s => s.pending), palette.info, palette, true),
      barSeries(MISSING_LABEL, splits.map(s => s.missing), palette.neutral, palette, true)
    ]
  }), [rows, splits, palette]);
  const options = useMemo(() => barOptions(palette, animation, rows.map(r => r.title), { horizontal: true, stacked: true, legend: true, unit: "طالب" }), [palette, animation, rows]);
  return (
    <ChartCard level={level} title="حالة التسليم في كل تقييم" description="عدد الطلاب في كل حالة: مصحَّح، بانتظار تصحيح المعلم، أو لم يسلّم."
      table={{ columns: ["التقييم", GRADED_LABEL, PENDING_LABEL, MISSING_LABEL], rows: rows.map((r, i) => [r.title, splits[i].graded, splits[i].pending, splits[i].missing]) }}>
      <div className="eb-chart-canvas" style={{ height: rowsHeight(rows.length, 34) }}><Bar data={data} options={options} aria-hidden="true" /></div>
    </ChartCard>
  );
}

/* ---------------- each student's average, ranked ---------------- */

export function StudentStandingChart({ standings, level = 3 }: { standings: StudentStanding[]; level?: Level }) {
  const palette = usePalette();
  const reduced = usePrefersReducedMotion();
  const ranked = useMemo(() => rankStandings(standings), [standings]);
  const drawn = useMemo(() => ranked.filter(s => finiteOrNull(s.average) !== null), [ranked]);
  const animation = useMemo(() => chartMotion(reduced, drawn.length), [reduced, drawn.length]);
  const data = useMemo(() => ({ labels: drawn.map(s => shortLabel(s.displayName, 22)), datasets: [{ ...barSeries("متوسط الطالب", drawn.map(s => s.average), palette.series[0], palette), maxBarThickness: 16 }] }), [drawn, palette]);
  const options = useMemo(() => barOptions(palette, animation, drawn.map(s => s.displayName), { horizontal: true, percent: true }), [palette, animation, drawn]);
  const without = ranked.length - drawn.length;
  return (
    <ChartCard level={level} title="متوسط كل طالب" description={"متوسط النتائج المصحَّحة لكل طالب، من الأعلى إلى الأدنى." + (without ? " " + without + " بلا نتيجة مصحَّحة بعد — في الجدول، وليس صفرًا." : "")}
      empty={drawn.length ? undefined : "لا توجد نتائج مصحَّحة بعد."}
      table={{ columns: ["الطالب", "المتوسط %", GRADED_LABEL, PENDING_LABEL, MISSING_LABEL], rows: ranked.map(s => [s.displayName, s.average === null ? "—" : s.average, s.graded, s.pending, s.missing]) }}>
      <div className="eb-chart-canvas" style={{ height: rowsHeight(drawn.length, 28) }}><Bar data={data} options={options} aria-hidden="true" /></div>
    </ChartCard>
  );
}

/* ---------------- one student beside the class ---------------- */

export function StudentTrendChart({ points, level = 3 }: { points: StudentAssessmentPoint[]; level?: Level }) {
  const palette = usePalette();
  const reduced = usePrefersReducedMotion();
  const animation = useMemo(() => chartMotion(reduced, points.length), [reduced, points.length]);
  const mine = useMemo(() => points.map(gradedValue), [points]);
  const data = useMemo(() => ({
    labels: points.map(p => shortLabel(p.title)),
    datasets: [
      lineSeries("نتيجة الطالب", mine, palette.primary, palette, palette.primarySoft),
      { ...lineSeries("متوسط الصف", points.map(p => finiteOrNull(p.classAverage)), palette.neutral, palette), pointRadius: 3 }
    ]
  }), [points, mine, palette]);
  const options = useMemo(() => percentLineOptions(palette, animation, points.map(p => p.title + (p.date ? " · " + p.date : "")), true), [palette, animation, points]);
  const { above, of } = aboveClassCount(points);
  const description = [
    "نتيجة الطالب في كل تقييم (آخر محاولة مسلّمة) بجانب متوسط الصف. ما لم يُسلَّم أو ما زال بانتظار التصحيح يظهر فجوة، لا صفرًا.",
    changeText(mine, "آخر نتيجة", "التي قبلها"),
    of ? "عند متوسط الصف أو أعلى في " + above + " من " + of + "." : ""
  ].filter(Boolean).join(" ");
  return (
    <ChartCard level={level} title="تطوّر نتائج الطالب" description={description}
      empty={mine.some(v => v !== null) ? undefined : "لا توجد نتائج مصحَّحة لهذا الطالب ضمن الفترة المختارة بعد."}
      table={{ columns: ["التقييم", "التاريخ", "نتيجة الطالب", "متوسط الصف", "المحاولات"], rows: points.map(p => [p.title, p.date || "—", stateText(p), dash(p.classAverage), p.attempts]) }}>
      <div className="eb-chart-canvas"><Line data={data} options={options} aria-hidden="true" /></div>
    </ChartCard>
  );
}

export function GapToClassChart({ points, level = 3 }: { points: StudentAssessmentPoint[]; level?: Level }) {
  const palette = usePalette();
  const reduced = usePrefersReducedMotion();
  const animation = useMemo(() => chartMotion(reduced, points.length), [reduced, points.length]);
  const gaps = useMemo(() => gapToClass(points), [points]);
  const data = useMemo(() => ({
    labels: points.map(p => shortLabel(p.title)),
    datasets: [
      barSeries("أعلى من متوسط الصف", gaps.map(g => (g !== null && g >= 0 ? g : null)), palette.info, palette),
      barSeries("أقل من متوسط الصف", gaps.map(g => (g !== null && g < 0 ? g : null)), palette.warn, palette)
    ]
  }), [points, gaps, palette]);
  const options = useMemo(() => barOptions(palette, animation, points.map(p => p.title), { stacked: true, signed: true, legend: true, unit: "نقطة" }), [palette, animation, points]);
  return (
    <ChartCard level={level} title="الفرق عن متوسط الصف" description="نتيجة الطالب ناقص متوسط الصف في التقييم نفسه، بالنقاط المئوية. بلا عمود حيث لا نتيجة مصحَّحة."
      empty={gaps.some(g => g !== null) ? undefined : "لا توجد نتائج قابلة للمقارنة بمتوسط الصف بعد."}
      table={{ columns: ["التقييم", "نتيجة الطالب", "متوسط الصف", "الفرق (نقطة)"], rows: points.map((p, i) => [p.title, stateText(p), dash(p.classAverage), gaps[i] === null ? "—" : signed(gaps[i] as number)]) }}>
      <div className="eb-chart-canvas"><Bar data={data} options={options} aria-hidden="true" /></div>
    </ChartCard>
  );
}

/* ---------------- project stages by status (track report) ---------------- */

export type StageRow = { stageId: string; title: string } & Record<StageStatus, number>;
const STATUS_STACK: StageStatus[] = ["approved", "ready_for_review", "in_progress", "not_started"];

export function StageStatusChart({ rows, trackTitle, level = 3 }: { rows: StageRow[]; trackTitle: string; level?: Level }) {
  const palette = usePalette();
  const reduced = usePrefersReducedMotion();
  const animation = useMemo(() => chartMotion(reduced, rows.length), [reduced, rows.length]);
  const data = useMemo(() => ({ labels: rows.map(r => r.stageId), datasets: STATUS_STACK.map(s => barSeries(stageStatusLabel(s), rows.map(r => r[s]), palette.status[s], palette, true)) }), [rows, palette]);
  const options = useMemo(() => barOptions(palette, animation, rows.map(r => r.stageId + " — " + r.title), { horizontal: true, stacked: true, legend: true, unit: "طالب" }), [palette, animation, rows]);
  return (
    <ChartCard level={level} title="حالات المراحل" description={"مسار " + trackTitle + ": عدد الطلاب في كل حالة لكل مرحلة."}
      table={{ columns: ["المرحلة", "العنوان", ...STAGE_STATUS_ORDER.map(s => stageStatusLabel(s))], rows: rows.map(r => [r.stageId, r.title, ...STAGE_STATUS_ORDER.map(s => r[s])]) }}>
      <div className="eb-chart-canvas" style={{ height: rowsHeight(rows.length, 30) }}><Bar data={data} options={options} aria-hidden="true" /></div>
    </ChartCard>
  );
}

/* ---------------- week-over-week change (timeline report) ---------------- */

export function WeeklyChangeChart({ trend, level = 3 }: { trend: { weekStart: string; avgOverall: number }[]; level?: Level }) {
  const palette = usePalette();
  const reduced = usePrefersReducedMotion();
  const deltas = useMemo(() => weeklyDeltas(trend), [trend]);
  const animation = useMemo(() => chartMotion(reduced, deltas.length), [reduced, deltas.length]);
  const data = useMemo(() => ({
    labels: deltas.map(d => d.weekStart),
    datasets: [
      barSeries("تقدّم", deltas.map(d => (d.delta >= 0 ? d.delta : null)), palette.info, palette),
      barSeries("تراجع", deltas.map(d => (d.delta < 0 ? d.delta : null)), palette.warn, palette)
    ]
  }), [deltas, palette]);
  const options = useMemo(() => barOptions(palette, animation, deltas.map(d => "أسبوع " + d.weekStart), { stacked: true, signed: true, legend: true, unit: "نقطة" }), [palette, animation, deltas]);
  return (
    <ChartCard level={level} title="التغيّر الأسبوعي" description="فرق متوسط التقدّم عن الأسبوع السابق، بالنقاط المئوية."
      table={{ columns: ["الأسبوع", "التغيّر (نقطة)"], rows: deltas.map(d => [d.weekStart, signed(d.delta)]) }}>
      <div className="eb-chart-canvas"><Bar data={data} options={options} aria-hidden="true" /></div>
    </ChartCard>
  );
}

/* ---------------- classes side by side (hub overview) ---------------- */

export function ClassComparisonChart({ classes, level = 3 }: { classes: OverviewClass[]; level?: Level }) {
  const palette = usePalette();
  const reduced = usePrefersReducedMotion();
  const animation = useMemo(() => chartMotion(reduced, classes.length), [reduced, classes.length]);
  const data = useMemo(() => ({
    labels: classes.map(c => shortLabel(c.name, 22)),
    datasets: [
      barSeries("متوسط النتائج", classes.map(c => finiteOrNull(c.average)), palette.info, palette),
      barSeries("نسبة التسليم", classes.map(c => (c.assessments ? c.submissionRate : null)), palette.warn, palette)
    ]
  }), [classes, palette]);
  const options = useMemo(() => barOptions(palette, animation, classes.map(c => c.name + (c.schoolYear ? " — " + c.schoolYear : "")), { horizontal: true, percent: true, legend: true }), [palette, animation, classes]);
  return (
    <ChartCard level={level} title="مقارنة الصفوف" description="متوسط النتائج المصحَّحة ونسبة التسليم لكل صف نشط. صف بلا تقييمات يظهر بلا أعمدة."
      table={{ columns: ["الصف", "الطلاب", "التقييمات", "متوسط النتائج %", "نسبة التسليم %", PENDING_LABEL], rows: classes.map(c => [c.name, c.studentCount, c.assessments, c.average === null ? "—" : c.average, c.assessments ? c.submissionRate : "—", c.pendingReview]) }}>
      <div className="eb-chart-canvas" style={{ height: rowsHeight(classes.length, 52) }}><Bar data={data} options={options} aria-hidden="true" /></div>
    </ChartCard>
  );
}
