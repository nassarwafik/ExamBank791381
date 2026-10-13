// Phase 21E.2 — the accessible equivalents of the five teacher-dashboard charts: one text summary (the figure's accessible
// name) and one data table per chart, derived from EXACTLY the series each chart hands to Chart.js. Nothing is recomputed,
// re-aggregated or re-rounded beyond the display formatting the dashboard already uses (fmtPct), so a table can never show a
// figure the chart does not. Pure functions, no React, no chart library.
import type { ChartTable } from "../ui/ChartCard";

export const fmtPct = (value: number | null) => (value === null ? "—" : value.toFixed(1).replace(/\.0$/, "") + "%");

export type TrendPoint = { title: string; className: string; average: number | null };
export type ClassPoint = { classId: string; name: string; students: number; completionRate: number; average: number | null };
export type TopicPoint = { topic: string; average: number | null; gradedQuestions: number };
export type DistributionPoint = { label: string; count: number };

export type ChartModel = { summary: string; table: ChartTable };

/** The trend line plots only assignments that have an average (nulls are dropped); the table lists the same points. */
export function trendPoints<T extends TrendPoint>(items: T[]): T[] { return items.filter(x => x.average !== null); }
export function trendModel(items: TrendPoint[], student: boolean): ChartModel | null {
  const points = trendPoints(items);
  if (points.length < 2) return null;
  const first = points[0], last = points[points.length - 1];
  return {
    summary: `${student ? "تطور علامات الطالب" : "تطور متوسط الأداء"} عبر ${points.length} واجبات: من ${fmtPct(first.average)} في «${first.title}» إلى ${fmtPct(last.average)} في «${last.title}».`,
    table: { columns: ["الواجب", "الصف", student ? "علامة الطالب" : "متوسط العلامات"], rows: points.map(p => [p.title, p.className || "—", fmtPct(p.average)]) }
  };
}

export function submissionModel(submitted: number, missing: number, pendingReview: number): ChartModel {
  const total = Math.max(1, submitted + missing);
  return {
    summary: `حالة التسليم: ${fmtPct(submitted / total * 100)} نسبة التسليم، ${submitted} تم التسليم، ${missing} لم يُسلّم، ${pendingReview} تحتاج مراجعة.`,
    table: { columns: ["الحالة", "العدد"], rows: [["تم التسليم", submitted], ["لم يُسلّم", missing], ["تحتاج مراجعة", pendingReview], ["نسبة التسليم", fmtPct(submitted / total * 100)]] }
  };
}

export function distributionModel(items: DistributionPoint[], student: boolean): ChartModel | null {
  if (!items.length) return null;
  return {
    summary: "توزيع العلامات: " + items.map(x => `${x.label}: ${x.count}`).join("، ") + ".",
    table: { columns: ["فئة العلامة", student ? "عدد الواجبات" : "عدد الطلاب"], rows: items.map(x => [x.label, x.count]) }
  };
}

export function classComparisonModel(items: ClassPoint[]): ChartModel | null {
  if (!items.length) return null;
  return {
    summary: "مقارنة الصفوف: " + items.map(x => `${x.name}: ${fmtPct(x.average)}`).join("، ") + ".",
    table: { columns: ["الصف", "متوسط الصف", "الطلاب", "نسبة التسليم"], rows: items.map(x => [x.name, fmtPct(x.average), x.students, fmtPct(x.completionRate)]) }
  };
}

/** The topic chart shows the first ten topics (the payload is already ordered weakest first); the table shows the same ten. */
export const TOPIC_CHART_LIMIT = 10;
export function topicPoints<T extends TopicPoint>(items: T[]): T[] { return items.slice(0, TOPIC_CHART_LIMIT); }
export function topicModel(items: TopicPoint[]): ChartModel | null {
  const visible = topicPoints(items);
  if (!visible.length) return null;
  return {
    summary: "الأداء حسب الموضوع: " + visible.map(x => `${x.topic}: ${fmtPct(x.average)}`).join("، ") + ".",
    table: { columns: ["الموضوع", "المتوسط", "إجابات مصححة"], rows: visible.map(x => [x.topic, fmtPct(x.average), x.gradedQuestions]) }
  };
}
