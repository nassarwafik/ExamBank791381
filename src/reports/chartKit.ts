// Phase R-5a — the shared look and motion of the Reports Center charts (Chart.js). Presentation only: no dataset is computed here.
// Colours are read from the design tokens (resolved for the theme the page shows, like projects/chartPalette) and are assigned by
// the JOB a colour does, each set checked for colour-vision separation in the light and the dark theme
// (docs/enterprise-reports-insight-charts-r5a.md §5):
//   - one series ............ the theme's primary;
//   - the subject beside its context (a student beside the class) ... primary + a neutral grey;
//   - two measures to tell apart (average / submission rate) ........ info (cool) + warn (warm) — independent of the teacher's theme;
//   - above / below a baseline ...................................... info (above) + warn (below);
//   - a state ....................................................... success (graded / approved), info (awaiting), neutral (absent).
import type { ChartOptions } from "chart.js";
import { chartPalette, withAlpha, type ChartPalette } from "../projects/chartPalette";
import { resolveThemeColor } from "../ui/themeColor";
import { signed as signedText } from "./insights";

function token(name: string, fallback: string): string {
  if (typeof document !== "undefined" && typeof getComputedStyle === "function") {
    try {
      const v = resolveThemeColor(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
      if (v) return v;
    } catch { /* fall back below */ }
  }
  return fallback;
}
function bodyFont(): string {
  const fallback = "\"IBM Plex Sans Arabic\", \"Segoe UI\", Tahoma, Arial, sans-serif";
  if (typeof document === "undefined" || typeof getComputedStyle !== "function" || !document.body) return fallback;
  try { return getComputedStyle(document.body).fontFamily || fallback; } catch { return fallback; }
}

export type ReportPalette = ChartPalette & {
  surface: string; ink: string; info: string; infoSoft: string; warn: string; success: string; neutral: string; fontFamily: string;
};

export function reportPalette(): ReportPalette {
  const base = chartPalette();
  const info = token("--eb-info", "#0284c7");
  return {
    ...base,
    surface: token("--eb-surface", "#ffffff"),
    ink: token("--eb-muted", "#5f5a6e"),
    info, infoSoft: withAlpha(info, 0.12),
    warn: token("--eb-warn", "#d97706"),
    success: token("--eb-success", "#16a34a"),
    neutral: token("--eb-faint", "#a9a5b4"),
    fontFamily: bodyFont()
  };
}

/** What the entrance delay reads of a Chart.js scriptable context (the same fields on a bar and on a line chart). */
type MotionContext = { type: string; mode: string; dataIndex: number; datasetIndex: number };
export type ChartMotion = false | { duration: number; easing: "easeOutQuart"; delay: (ctx: MotionContext) => number; onComplete: () => void };

/**
 * The entrance of a chart: marks grow in one after the other (a short stagger per point, a longer one per series), then stay
 * still — the stagger is spent once, so a hover or a resize never replays it. Reduced motion (the viewer's explicit choice, else
 * the OS hint — usePrefersReducedMotion) → `false`: the chart is drawn at once.
 */
export function chartMotion(reduced: boolean, points: number): ChartMotion {
  if (reduced) return false;
  let entered = false;
  const step = Math.min(90, 640 / Math.max(1, points));
  return {
    duration: 850,
    easing: "easeOutQuart",
    onComplete: () => { entered = true; },
    delay: ctx => (!entered && ctx.type === "data" && ctx.mode === "default" ? ctx.dataIndex * step + ctx.datasetIndex * 140 : 0)
  };
}

type AxisTitle = { title: (items: { dataIndex: number }[]) => string };
const fullTitle = (titles: string[]): AxisTitle => ({ title: items => titles[items[0]?.dataIndex ?? 0] ?? "" });

/** A line chart on a 0–100 % axis; the tooltip shows every series of the hovered point (one crosshair read). */
export function percentLineOptions(palette: ReportPalette, animation: ChartMotion, titles: string[], legend: boolean): ChartOptions<"line"> {
  return {
    responsive: true, maintainAspectRatio: false, animation,
    font: { family: palette.fontFamily },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: legend, position: "bottom", rtl: true, labels: { usePointStyle: true, boxHeight: 8, color: palette.ink, font: { family: palette.fontFamily } } },
      tooltip: { rtl: true, titleFont: { family: palette.fontFamily }, bodyFont: { family: palette.fontFamily }, callbacks: { ...fullTitle(titles), label: i => " " + (i.dataset.label || "") + ": " + (i.raw === null || i.raw === undefined ? "—" : Math.round(Number(i.raw)) + "%") } }
    },
    scales: {
      y: { beginAtZero: true, max: 100, border: { display: false }, grid: { color: palette.grid }, ticks: { stepSize: 25, color: palette.ink, callback: v => v + "%" } },
      x: { grid: { display: false }, ticks: { color: palette.ink, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }
    }
  };
}

export type BarShape = { horizontal?: boolean; stacked?: boolean; percent?: boolean; signed?: boolean; legend?: boolean; unit?: string };

/** A bar chart: vertical or horizontal, optionally stacked; values are percentages, signed differences or whole counts. */
export function barOptions(palette: ReportPalette, animation: ChartMotion, titles: string[], shape: BarShape = {}): ChartOptions<"bar"> {
  const { horizontal = false, stacked = false, percent = false, signed = false, legend = false, unit = "" } = shape;
  const value = {
    beginAtZero: true, stacked, border: { display: false }, grid: { color: palette.grid },
    ...(percent ? { max: 100 } : {}),
    ticks: { color: palette.ink, ...(percent ? { stepSize: 25 } : signed ? {} : { precision: 0 }), callback: (v: string | number) => (signed ? signedText(Number(v)) : String(v)) + (percent ? "%" : "") }
  };
  const category = { stacked, grid: { display: false }, ticks: { color: palette.ink, ...(horizontal ? { autoSkip: false } : { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }) } };
  return {
    responsive: true, maintainAspectRatio: false, animation,
    font: { family: palette.fontFamily },
    indexAxis: horizontal ? "y" : "x",
    interaction: { mode: "index", intersect: false, axis: horizontal ? "y" : "x" },
    plugins: {
      legend: { display: legend, position: "bottom", rtl: true, labels: { usePointStyle: true, pointStyle: "rectRounded", boxHeight: 8, color: palette.ink, font: { family: palette.fontFamily } } },
      tooltip: {
        rtl: true, titleFont: { family: palette.fontFamily }, bodyFont: { family: palette.fontFamily },
        filter: i => i.raw !== null && i.raw !== undefined,
        callbacks: { ...fullTitle(titles), label: i => " " + (i.dataset.label || "") + ": " + (signed ? signedText(Number(i.raw)) : String(i.raw)) + (percent ? "%" : unit ? " " + unit : "") }
      }
    },
    scales: horizontal ? { x: value, y: category } : { y: value, x: category }
  };
}

/** One bar series: thin marks with a 4 px rounded data end; a stacked segment keeps a surface-coloured hairline as its gap. */
export function barSeries(label: string, data: (number | null)[], color: string, palette: ReportPalette, stacked = false) {
  return {
    label, data, backgroundColor: color, borderRadius: 4, maxBarThickness: 22,
    ...(stacked ? { borderColor: palette.surface, borderWidth: 1 } : {})
  };
}

/** One line series: a 2 px line, 8 px markers ringed in the surface colour so they stay legible where lines cross. */
export function lineSeries(label: string, data: (number | null)[], color: string, palette: ReportPalette, fill?: string) {
  return {
    label, data, borderColor: color, backgroundColor: fill || color, fill: !!fill, tension: 0.3, borderWidth: 2, spanGaps: true,
    pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: color, pointBorderColor: palette.surface, pointBorderWidth: 2
  };
}

/** The canvas box of a horizontal bar chart grows with its rows (never a nested scroll, never squeezed labels). */
export function rowsHeight(rows: number, perRow = 30, chrome = 86): number {
  return Math.max(200, rows * perRow + chrome);
}
