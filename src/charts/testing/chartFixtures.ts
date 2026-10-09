// Phase 21A.1 — test-only chart builders: one valid ChartSpecV1 of every kind (Arabic and mixed labels, units, missing values, negatives,
// decimals), shared by the contract, adapter, renderer, editor, grading, AI and acceptance suites.
import type { ChartSpecV1 } from "../chartSpec";

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const MONTH_IDS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export const RAINFALL_2020 = [120, 95, 82, 40, 12.5, 0, 0, 3, 18, 135, 88, 60];

export const rainfallBar = (): ChartSpecV1 => ({
  version: 1, id: "rainfall-2020", kind: "bar", title: "الهطول الشهري — 2020", description: "كمية الأمطار الشهرية بالملّيمتر في عام 2020 (بيانات توضيحية).",
  source: "بيانات توضيحية لأغراض التعلّم", animation: "subtle", palette: "categorical",
  categories: MONTH_IDS.map((id, i) => ({ id, label: MONTHS_AR[i] })),
  series: [{ id: "rain", label: "الهطول", values: [...RAINFALL_2020] }],
  xAxis: { label: "الشهر" }, yAxis: { label: "الهطول", unit: "mm" }, referenceLines: [{ id: "avg", value: 50, label: "عتبة 50 mm" }]
});
export const temperatureLine = (): ChartSpecV1 => ({
  version: 1, id: "temp-week", kind: "line", title: "Temperature over a week", description: "Daily maximum and minimum temperature in °C; the Wednesday maximum is missing.",
  categories: ["mon", "tue", "wed", "thu", "fri"].map(id => ({ id, label: id.toUpperCase() })),
  series: [{ id: "tmax", label: "Max °C", values: [21.5, 23, null, -2, 0] }, { id: "tmin", label: "Min °C", values: [12, 13, 11, -8, -4] }],
  xAxis: { label: "Day" }, yAxis: { label: "Temperature", unit: "°C" }
});
export const stackedArea = (): ChartSpecV1 => ({
  version: 1, id: "energy-mix", kind: "area", title: "مزيج الطاقة", description: "إنتاج الكهرباء (GWh) حسب المصدر.", stacked: true,
  categories: ["y2019", "y2020", "y2021"].map((id, i) => ({ id, label: String(2019 + i) })),
  series: [{ id: "solar", label: "شمسية", values: [10, 14, 20] }, { id: "wind", label: "رياح", values: [5, 7, 9] }],
  yAxis: { label: "الإنتاج", unit: "GWh" }
});
export const comboChart = (): ChartSpecV1 => ({
  version: 1, id: "sales-combo", kind: "combo", title: "المبيعات والهامش", description: "المبيعات (أعمدة) ونسبة الربح (خط).",
  categories: ["q1", "q2", "q3", "q4"].map((id, i) => ({ id, label: "الربع " + (i + 1) })),
  series: [{ id: "sales", label: "المبيعات", values: [100, 120, 90, 150], mark: "bar" }, { id: "margin", label: "الهامش %", values: [12, 15, 9, 18], mark: "line", axis: "secondary" }],
  yAxis: { label: "المبيعات" }, y2Axis: { label: "الهامش", unit: "%" }
});
export const horizontalStackedBar = (): ChartSpecV1 => ({
  version: 1, id: "votes", kind: "bar", title: "Votes by region", description: "Stacked horizontal bars.", orientation: "horizontal", stacked: true, valueLabels: true,
  categories: [{ id: "north", label: "North" }, { id: "south", label: "South" }],
  series: [{ id: "yes", label: "Yes", values: [30, 45] }, { id: "no", label: "No", values: [20, 15] }],
  xAxis: { label: "Votes", min: 0 }
});
export const donutChart = (): ChartSpecV1 => ({
  version: 1, id: "budget", kind: "pie", title: "توزيع الميزانية", description: "نسب الإنفاق.", donut: true, unit: "%",
  slices: [{ id: "edu", label: "التعليم", value: 40 }, { id: "health", label: "الصحة", value: 35 }, { id: "other", label: "أخرى", value: 25 }]
});
export const scatterChart = (): ChartSpecV1 => ({
  version: 1, id: "height-mass", kind: "scatter", title: "الطول والكتلة", description: "طول الطلاب (cm) مقابل كتلتهم (kg)؛ نقطة واحدة شاذّة.",
  series: [{ id: "students", label: "الطلاب", points: [{ id: "p1", x: 150, y: 45 }, { id: "p3", x: 170, y: 60 }, { id: "p2", x: 160, y: 52 }, { id: "out", x: 155, y: 95, label: "قيمة شاذّة" }] }],
  xAxis: { label: "الطول", unit: "cm" }, yAxis: { label: "الكتلة", unit: "kg" }
});
export const histogramChart = (): ChartSpecV1 => ({
  version: 1, id: "scores", kind: "histogram", title: "توزيع الدرجات", description: "عدد الطلاب في كل فئة درجات.",
  bins: [{ id: "b0", start: 0, end: 10, count: 2 }, { id: "b1", start: 10, end: 20, count: 5 }, { id: "b2", start: 20, end: 30, count: 9 }, { id: "b3", start: 30, end: 40, count: 4 }],
  xAxis: { label: "الدرجة" }, yAxis: { label: "عدد الطلاب" }
});
export const radarChart = (): ChartSpecV1 => ({
  version: 1, id: "skills", kind: "radar", title: "Skills profile", description: "Two students across four skills (0–10).",
  axes: ["read", "write", "speak", "listen"].map(id => ({ id, label: id, max: 10 })),
  series: [{ id: "ali", label: "علي", values: [8, 6, 7, 9] }, { id: "sara", label: "سارة", values: [9, 8, 6, 7] }]
});
export const boxplotChart = (): ChartSpecV1 => ({
  version: 1, id: "class-scores", kind: "boxplot", title: "درجات الشعب", description: "ملخص الأرقام الخمسة لكل شعبة.",
  boxes: [{ id: "a", label: "الشعبة أ", min: 40, q1: 55, median: 65, q3: 75, max: 95 }, { id: "b", label: "الشعبة ب", min: 30, q1: 50, median: 60, q3: 70, max: 88 }],
  yAxis: { label: "الدرجة", min: 0, max: 100 }
});
export const heatmapChart = (): ChartSpecV1 => ({
  version: 1, id: "activity", kind: "heatmap", title: "نشاط المنصّة", description: "عدد الزيارات لكل يوم وفترة.", unit: "زيارة",
  columns: [{ id: "am", label: "صباحًا" }, { id: "pm", label: "مساءً" }],
  rows: [{ id: "sun", label: "الأحد" }, { id: "mon", label: "الاثنين" }, { id: "tue", label: "الثلاثاء" }],
  values: [[5, 9], [3, null], [7, 2]]
});
/** One valid chart of every kind (bar, line, area, combo, horizontal stacked bar, donut, scatter, histogram, radar, boxplot, heatmap). */
export const ALL_CHARTS = (): ChartSpecV1[] => [rainfallBar(), temperatureLine(), stackedArea(), comboChart(), horizontalStackedBar(), donutChart(), scatterChart(), histogramChart(), radarChart(), boxplotChart(), heatmapChart()];
