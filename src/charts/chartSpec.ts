// Phase 21A.1 — ChartSpecV1: ExamBank's OWN declarative, versioned data-chart contract. Pure (no React, no DOM, no I/O): compiled into the
// shared server build, so the client, the API and the AI intake run the SAME authority.
//
// It is NOT an ECharts option: nothing here mirrors a rendering library, and nothing is executable. Every key comes from a closed per-kind
// allow-list (unknown keys are REFUSED, never dropped); every text is bounded prose (no markup, no control or bidi-override characters);
// every number is a finite JSON number (strings, NaN and ±Infinity are refused; -0 is stored as 0); a MISSING value is an explicit `null`
// (only where the kind documents it) and is never confused with 0; every identity is a stable id unique in its namespace; every collection
// is bounded. Validation never throws: it returns the canonical rebuilt copy (fixed key order, a fresh object — never a spread of input) or
// issues. The renderer (ECharts today, replaceable tomorrow) only ever sees this validated value through the ExamBank adapter.
import { isVisualId } from "../visualGeometry";
import { CONTROL, RAW_HTML } from "../richContent/proseGuard";

export const CHART_SPEC_VERSION = 1 as const;
/** bar (column / horizontal / stacked), line, area (stacked), combo (bar + line), pie (pie / donut), scatter, histogram, radar, boxplot, heatmap. */
export const CHART_KINDS = Object.freeze(["bar", "line", "area", "combo", "pie", "scatter", "histogram", "radar", "boxplot", "heatmap"] as const);
export type ChartKind = (typeof CHART_KINDS)[number];
export const CHART_ANIMATIONS = Object.freeze(["none", "subtle", "normal"] as const);
export type ChartAnimation = (typeof CHART_ANIMATIONS)[number];
export const CHART_PALETTES = Object.freeze(["categorical", "sequential", "diverging", "neutral"] as const);
export type ChartPalette = (typeof CHART_PALETTES)[number];
export const CHART_LEGENDS = Object.freeze(["auto", "none"] as const);
export const CHART_LIMITS = Object.freeze({
  titleChars: 160, descriptionChars: 1000, sourceChars: 300, labelChars: 80, unitChars: 24,
  categories: 60, series: 8, dataPoints: 480, slices: 24, scatterSeries: 6, scatterPoints: 500, bins: 40,
  radarAxesMin: 3, radarAxes: 12, radarSeries: 6, boxes: 24, heatmapColumns: 24, heatmapRows: 24, referenceLines: 4,
  absValue: 1e15, serializedBytes: 65536
});

export type ChartAxis = { label?: string; unit?: string; min?: number; max?: number };
export type ChartCategory = { id: string; label: string };
/** `mark` and `axis` exist on combo series only: the mark (bars or a line) and the value axis it is measured on (the secondary axis is a
 *  second, independently scaled value axis — e.g. sales in units with a margin in %; absent = primary). */
export type ChartSeries = { id: string; label: string; values: (number | null)[]; mark?: "bar" | "line"; axis?: "primary" | "secondary" };
export type ChartReferenceLine = { id: string; value: number; label: string };
export type ChartSlice = { id: string; label: string; value: number };
export type ChartPoint = { id: string; x: number; y: number; label?: string };
export type ChartPointSeries = { id: string; label: string; points: ChartPoint[] };
export type ChartBin = { id: string; start: number; end: number; count: number };
export type ChartRadarAxis = { id: string; label: string; max: number };
export type ChartRadarSeries = { id: string; label: string; values: number[] };
export type ChartBox = { id: string; label: string; min: number; q1: number; median: number; q3: number; max: number };

type ChartCommon = { version: 1; id: string; title: string; description: string; source?: string; animation?: ChartAnimation; palette?: ChartPalette; legend?: "auto" | "none" };
export type CategoryChartSpec = ChartCommon & {
  kind: "bar" | "line" | "area" | "combo"; categories: ChartCategory[]; series: ChartSeries[];
  orientation?: "vertical" | "horizontal"; stacked?: boolean; valueLabels?: boolean; xAxis?: ChartAxis; yAxis?: ChartAxis; referenceLines?: ChartReferenceLine[];
  /** combo only: the secondary value axis (label / unit / bounds) — allowed only when a series is on it. Reference lines use the primary axis. */
  y2Axis?: ChartAxis;
};
export type PieChartSpec = ChartCommon & { kind: "pie"; slices: ChartSlice[]; donut?: boolean; unit?: string; valueLabels?: boolean };
export type ScatterChartSpec = ChartCommon & { kind: "scatter"; series: ChartPointSeries[]; xAxis?: ChartAxis; yAxis?: ChartAxis; referenceLines?: ChartReferenceLine[] };
export type HistogramChartSpec = ChartCommon & { kind: "histogram"; bins: ChartBin[]; valueLabels?: boolean; xAxis?: ChartAxis; yAxis?: ChartAxis };
export type RadarChartSpec = ChartCommon & { kind: "radar"; axes: ChartRadarAxis[]; series: ChartRadarSeries[] };
export type BoxplotChartSpec = ChartCommon & { kind: "boxplot"; boxes: ChartBox[]; xAxis?: ChartAxis; yAxis?: ChartAxis };
export type HeatmapChartSpec = ChartCommon & { kind: "heatmap"; columns: ChartCategory[]; rows: ChartCategory[]; values: (number | null)[][]; unit?: string; valueLabels?: boolean; xAxis?: ChartAxis; yAxis?: ChartAxis };
export type ChartSpecV1 = CategoryChartSpec | PieChartSpec | ScatterChartSpec | HistogramChartSpec | RadarChartSpec | BoxplotChartSpec | HeatmapChartSpec;
export type ChartIssue = { code: string; message: string; severity: "error"; path: string };
export type ChartResult = { ok: true; value: ChartSpecV1; issues: [] } | { ok: false; issues: ChartIssue[] };

const COMMON_KEYS = ["version", "id", "kind", "title", "description", "source", "animation", "palette", "legend"] as const;
const AXIS_KEYS = ["label", "unit", "min", "max"] as const;
/** The closed key allow-list of every kind (common keys included). */
export const CHART_KEYS: Readonly<Record<ChartKind, readonly string[]>> = Object.freeze({
  bar: [...COMMON_KEYS, "categories", "series", "orientation", "stacked", "valueLabels", "xAxis", "yAxis", "referenceLines"],
  line: [...COMMON_KEYS, "categories", "series", "valueLabels", "xAxis", "yAxis", "referenceLines"],
  area: [...COMMON_KEYS, "categories", "series", "stacked", "valueLabels", "xAxis", "yAxis", "referenceLines"],
  combo: [...COMMON_KEYS, "categories", "series", "valueLabels", "xAxis", "yAxis", "y2Axis", "referenceLines"],
  pie: [...COMMON_KEYS, "slices", "donut", "unit", "valueLabels"],
  scatter: [...COMMON_KEYS, "series", "xAxis", "yAxis", "referenceLines"],
  histogram: [...COMMON_KEYS, "bins", "valueLabels", "xAxis", "yAxis"],
  radar: [...COMMON_KEYS, "axes", "series"],
  boxplot: [...COMMON_KEYS, "boxes", "xAxis", "yAxis"],
  heatmap: [...COMMON_KEYS, "columns", "rows", "values", "unit", "valueLabels", "xAxis", "yAxis"]
});
/** Category-axis kinds (shared categories × series data model). */
export const CATEGORY_CHART_KINDS: readonly ChartKind[] = Object.freeze(["bar", "line", "area", "combo"]);
export const isCategoryChart = (c: ChartSpecV1): c is CategoryChartSpec => (CATEGORY_CHART_KINDS as readonly string[]).includes(c.kind);

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
// explicit embedding / override / isolate controls (LRE RLE PDF LRO RLO, LRI RLI FSI PDI) spoof the visual order of a label; the plain
// marks (LRM / RLM / ALM) stay allowed. The adapter adds its own isolates when it hands labels to a renderer.
const BIDI_CONTROL = /[‪-‮⁦-⁩]/;
const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const own = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
/** Label identity for duplicate detection: Unicode NFC, whitespace collapsed, case-insensitive. */
export const normLabel = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
function utf8Bytes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1; else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; } else n += 3;
  }
  return n;
}

/** Strict validation of a ChartSpecV1. Never throws; returns the canonical rebuilt copy only when there is no issue. */
export function validateChartSpec(raw: unknown, path = "chart"): ChartResult {
  const issues: ChartIssue[] = [];
  const add = (code: string, message: string, at: string) => { if (issues.length < 50) issues.push({ code, message, severity: "error", path: at }); };
  const keysOk = (o: Record<string, unknown>, allowed: readonly string[], at: string): boolean => {
    let ok = true;
    for (const k of Object.keys(o)) if (FORBIDDEN_KEYS.has(k) || !allowed.includes(k)) { add("CHART_UNKNOWN_KEY", "حقل غير معروف في الرسم البياني: " + k.slice(0, 40), at + "." + k.slice(0, 40)); ok = false; }
    return ok;
  };
  const text = (v: unknown, at: string, max: number, required: boolean): string | undefined => {
    if (typeof v !== "string") { add("CHART_TEXT_INVALID", "نص غير صالح في الرسم البياني.", at); return undefined; }
    if (required && v.trim() === "") { add("CHART_TEXT_EMPTY", "نص مطلوب فارغ في الرسم البياني.", at); return undefined; }
    if (v.length > max) { add("CHART_LIMIT", "نص أطول من الحد المسموح في الرسم البياني (" + max + ").", at); return undefined; }
    if (CONTROL.test(v) || BIDI_CONTROL.test(v)) { add("CHART_TEXT_CONTROL", "محارف تحكم غير مسموحة في نص الرسم البياني.", at); return undefined; }
    if (RAW_HTML.test(v)) { add("CHART_TEXT_MARKUP", "نص الرسم البياني لا يقبل وسوم HTML أو روابط script.", at); return undefined; }
    return v;
  };
  const optText = (o: Record<string, unknown>, k: string, at: string, max: number, out: Record<string, unknown>) => {
    if (!own(o, k)) return;
    const v = text(o[k], at + "." + k, max, true);
    if (v !== undefined) out[k] = v;
  };
  const num = (v: unknown, at: string): number | undefined => {
    if (typeof v !== "number" || !Number.isFinite(v)) { add("CHART_NUMBER_INVALID", "القيمة يجب أن تكون رقمًا محدودًا (لا نص ولا NaN ولا لانهاية).", at); return undefined; }
    if (Math.abs(v) > CHART_LIMITS.absValue) { add("CHART_LIMIT", "القيمة الرقمية أكبر من الحد المسموح.", at); return undefined; }
    return v === 0 ? 0 : v;                                                                                       // -0 → 0
  };
  const optBool = (o: Record<string, unknown>, k: string, at: string, out: Record<string, unknown>) => {
    if (!own(o, k)) return;
    if (typeof o[k] !== "boolean") { add("CHART_INVALID", "الخيار «" + k + "» يجب أن يكون منطقيًا.", at + "." + k); return; }
    out[k] = o[k];
  };
  const optEnum = (o: Record<string, unknown>, k: string, allowed: readonly string[], at: string, out: Record<string, unknown>) => {
    if (!own(o, k)) return;
    if (typeof o[k] !== "string" || !allowed.includes(o[k] as string)) { add("CHART_ENUM_INVALID", "قيمة «" + k + "» غير مسموحة في الرسم البياني.", at + "." + k); return; }
    out[k] = o[k];
  };
  const ids = new Map<string, Set<string>>(), labels = new Map<string, Set<string>>();
  const id = (v: unknown, at: string, ns: string): string | undefined => {
    if (!isVisualId(v)) { add("CHART_ID_INVALID", "معرّف غير صالح في الرسم البياني (حرف لاتيني أولًا ثم حروف أو أرقام أو - أو _ حتى 32).", at); return undefined; }
    const set = ids.get(ns) ?? new Set<string>();
    ids.set(ns, set);
    if (set.has(v)) { add("CHART_ID_DUPLICATE", "المعرّف «" + v + "» مكرّر في الرسم البياني.", at); return undefined; }
    set.add(v);
    return v;
  };
  const list = (v: unknown, at: string, min: number, max: number, what: string): unknown[] | undefined => {
    if (!Array.isArray(v)) { add("CHART_INVALID", what + " يجب أن تكون قائمة.", at); return undefined; }
    if (v.length < min) { add("CHART_EMPTY", what + ": أضف " + min + " على الأقل.", at); return undefined; }
    if (v.length > max) { add("CHART_LIMIT", what + ": العدد أكبر من الحد المسموح (" + max + ").", at); return undefined; }
    return v;
  };
  const axis = (o: Record<string, unknown>, k: "xAxis" | "yAxis" | "y2Axis", at: string, out: Record<string, unknown>, numeric: boolean) => {
    if (!own(o, k)) return;
    const a = o[k], ap = at + "." + k;
    if (!isPlain(a)) { add("CHART_INVALID", "إعداد المحور غير صالح.", ap); return; }
    const allowed = numeric ? AXIS_KEYS : (["label"] as const);
    if (!keysOk(a, allowed, ap)) return;
    const r: ChartAxis = {};
    if (own(a, "label")) { const t = text(a.label, ap + ".label", CHART_LIMITS.labelChars, true); if (t !== undefined) r.label = t; }
    if (own(a, "unit")) { const t = text(a.unit, ap + ".unit", CHART_LIMITS.unitChars, true); if (t !== undefined) r.unit = t; }
    if (own(a, "min")) { const n = num(a.min, ap + ".min"); if (n !== undefined) r.min = n; }
    if (own(a, "max")) { const n = num(a.max, ap + ".max"); if (n !== undefined) r.max = n; }
    if (r.min !== undefined && r.max !== undefined && !(r.min < r.max)) add("CHART_AXIS_RANGE", "الحد الأدنى للمحور يجب أن يكون أصغر من الحد الأعلى.", ap);
    out[k] = r;
  };
  const labelled = (v: unknown, at: string, ns: string, extraKeys: readonly string[]): { id: string; label: string; o: Record<string, unknown> } | undefined => {
    if (!isPlain(v)) { add("CHART_INVALID", "عنصر غير صالح في الرسم البياني.", at); return undefined; }
    if (!keysOk(v, ["id", "label", ...extraKeys], at)) return undefined;
    const i = id(v.id, at + ".id", ns), l = text(v.label, at + ".label", CHART_LIMITS.labelChars, true);
    if (l !== undefined) {
      const set = labels.get(ns) ?? new Set<string>(), norm = normLabel(l);
      labels.set(ns, set);
      if (set.has(norm)) { add("CHART_LABEL_DUPLICATE", "التسمية «" + l.slice(0, 40) + "» مكرّرة في الرسم البياني.", at + ".label"); return undefined; }
      set.add(norm);
    }
    return i !== undefined && l !== undefined ? { id: i, label: l, o: v } : undefined;
  };
  const categories = (v: unknown, at: string, max: number, ns: string): ChartCategory[] | undefined => {
    const arr = list(v, at, 1, max, "الفئات");
    if (!arr) return undefined;
    const out: ChartCategory[] = [];
    arr.forEach((c, i) => { const r = labelled(c, at + "[" + i + "]", ns, []); if (r) out.push({ id: r.id, label: r.label }); });
    return out.length === arr.length ? out : undefined;
  };
  const values = (v: unknown, at: string, n: number, nullable: boolean): (number | null)[] | undefined => {
    if (!Array.isArray(v)) { add("CHART_INVALID", "قيم السلسلة يجب أن تكون قائمة.", at); return undefined; }
    if (v.length !== n) { add("CHART_VALUES_LENGTH", "عدد القيم (" + v.length + ") لا يساوي عدد الفئات (" + n + ").", at); return undefined; }
    const out: (number | null)[] = [];
    let bad = false;
    v.forEach((x, i) => {
      if (x === null && nullable) { out.push(null); return; }
      if (x === null) { add("CHART_VALUE_MISSING", "القيمة المفقودة غير مسموحة في هذا النوع من الرسم.", at + "[" + i + "]"); bad = true; return; }
      const n2 = num(x, at + "[" + i + "]");
      if (n2 === undefined) bad = true; else out.push(n2);
    });
    if (bad) return undefined;
    if (out.every(x => x === null)) { add("CHART_SERIES_EMPTY", "السلسلة لا تحمل أي قيمة (كل القيم مفقودة).", at); return undefined; }
    return out;
  };
  const referenceLines = (o: Record<string, unknown>, at: string, out: Record<string, unknown>) => {
    if (!own(o, "referenceLines")) return;
    const arr = list(o.referenceLines, at + ".referenceLines", 1, CHART_LIMITS.referenceLines, "الخطوط المرجعية");
    if (!arr) return;
    const lines: ChartReferenceLine[] = [];
    arr.forEach((l, i) => {
      const lp = at + ".referenceLines[" + i + "]";
      const r = labelled(l, lp, "referenceLines", ["value"]);
      if (!r) return;
      const v = num(r.o.value, lp + ".value");
      if (v !== undefined) lines.push({ id: r.id, value: v, label: r.label });
    });
    if (lines.length === arr.length) out.referenceLines = lines;
  };

  if (!isPlain(raw)) { add("CHART_INVALID", "الرسم البياني يجب أن يكون كائنًا منظمًا (لا إعدادات مكتبة ولا شيفرة).", path); return { ok: false, issues }; }
  if (raw.version !== CHART_SPEC_VERSION) { add("CHART_VERSION", "إصدار الرسم البياني غير مدعوم (المدعوم: 1).", path + ".version"); return { ok: false, issues }; }
  const kind = raw.kind;
  if (typeof kind !== "string" || !(CHART_KINDS as readonly string[]).includes(kind)) { add("CHART_KIND", "نوع الرسم البياني غير مسموح: " + String(kind).slice(0, 40), path + ".kind"); return { ok: false, issues }; }
  const k = kind as ChartKind;
  if (!keysOk(raw, CHART_KEYS[k], path)) return { ok: false, issues };
  const out: Record<string, unknown> = { version: 1 };
  const cid = id(raw.id, path + ".id", "chart");
  if (cid !== undefined) out.id = cid;
  out.kind = k;
  const title = text(raw.title, path + ".title", CHART_LIMITS.titleChars, true);
  if (title !== undefined) out.title = title;
  const desc = text(raw.description, path + ".description", CHART_LIMITS.descriptionChars, true);
  if (desc !== undefined) out.description = desc;
  optText(raw, "source", path, CHART_LIMITS.sourceChars, out);
  optEnum(raw, "animation", CHART_ANIMATIONS, path, out);
  optEnum(raw, "palette", CHART_PALETTES, path, out);
  optEnum(raw, "legend", CHART_LEGENDS, path, out);

  switch (k) {
    case "bar": case "line": case "area": case "combo": {
      const cats = categories(raw.categories, path + ".categories", CHART_LIMITS.categories, "categories");
      if (cats) out.categories = cats;
      const arr = list(raw.series, path + ".series", 1, CHART_LIMITS.series, "السلاسل");
      if (arr && cats) {
        if (cats.length * arr.length > CHART_LIMITS.dataPoints) add("CHART_LIMIT", "عدد نقاط البيانات (الفئات × السلاسل) أكبر من الحد المسموح (" + CHART_LIMITS.dataPoints + ").", path + ".series");
        else {
          const series: ChartSeries[] = [];
          arr.forEach((s, i) => {
            const sp = path + ".series[" + i + "]";
            const r = labelled(s, sp, "series", k === "combo" ? ["values", "mark", "axis"] : ["values"]);
            if (!r) return;
            const vs = values(r.o.values, sp + ".values", cats.length, true);
            const one: ChartSeries = { id: r.id, label: r.label, values: vs || [] };
            if (k === "combo") {
              if (r.o.mark !== "bar" && r.o.mark !== "line") { add("CHART_ENUM_INVALID", "سلسلة الرسم المركّب تحتاج شكلًا: عمود أو خط.", sp + ".mark"); return; }
              one.mark = r.o.mark;
              if (own(r.o, "axis")) {
                if (r.o.axis !== "primary" && r.o.axis !== "secondary") { add("CHART_ENUM_INVALID", "محور السلسلة في الرسم المركّب: أساسي أو ثانوي.", sp + ".axis"); return; }
                one.axis = r.o.axis;
              }
            }
            if (vs) series.push(one);
          });
          if (series.length === arr.length) out.series = series;
        }
      }
      if (k === "bar") optEnum(raw, "orientation", ["vertical", "horizontal"], path, out);
      if (k === "bar" || k === "area") optBool(raw, "stacked", path, out);
      optBool(raw, "valueLabels", path, out);
      axis(raw, "xAxis", path, out, k === "bar" && raw.orientation === "horizontal");
      axis(raw, "yAxis", path, out, !(k === "bar" && raw.orientation === "horizontal"));
      if (k === "combo") {
        axis(raw, "y2Axis", path, out, true);
        const ss = out.series as ChartSeries[] | undefined;
        if (ss) {
          const secondary = ss.some(x => x.axis === "secondary");
          if (secondary && ss.every(x => x.axis === "secondary")) add("CHART_AXIS_PRIMARY_EMPTY", "اترك سلسلة واحدة على الأقل على المحور الأساسي.", path + ".series");
          if (!secondary && own(raw, "y2Axis")) add("CHART_AXIS_UNUSED", "المحور الثانوي معرَّف ولا توجد سلسلة عليه.", path + ".y2Axis");
        }
      }
      referenceLines(raw, path, out);
      break;
    }
    case "pie": {
      const arr = list(raw.slices, path + ".slices", 1, CHART_LIMITS.slices, "شرائح الدائرة");
      if (arr) {
        const slices: ChartSlice[] = [];
        arr.forEach((s, i) => {
          const sp = path + ".slices[" + i + "]";
          const r = labelled(s, sp, "slices", ["value"]);
          if (!r) return;
          const v = num(r.o.value, sp + ".value");
          if (v === undefined) return;
          if (v < 0) { add("CHART_VALUE_NEGATIVE", "قيمة شريحة الدائرة لا تكون سالبة.", sp + ".value"); return; }
          slices.push({ id: r.id, label: r.label, value: v });
        });
        if (slices.length === arr.length) {
          if (!slices.some(s => s.value > 0)) add("CHART_SERIES_EMPTY", "مجموع شرائح الدائرة يجب أن يكون أكبر من صفر.", path + ".slices");
          else out.slices = slices;
        }
      }
      optBool(raw, "donut", path, out);
      optText(raw, "unit", path, CHART_LIMITS.unitChars, out);
      optBool(raw, "valueLabels", path, out);
      break;
    }
    case "scatter": {
      const arr = list(raw.series, path + ".series", 1, CHART_LIMITS.scatterSeries, "سلاسل النقاط");
      if (arr) {
        let total = 0;
        const series: ChartPointSeries[] = [];
        arr.forEach((s, i) => {
          const sp = path + ".series[" + i + "]";
          const r = labelled(s, sp, "series", ["points"]);
          if (!r) return;
          const pts = list(r.o.points, sp + ".points", 1, CHART_LIMITS.scatterPoints, "النقاط");
          if (!pts) return;
          total += pts.length;
          if (total > CHART_LIMITS.scatterPoints) { add("CHART_LIMIT", "عدد النقاط أكبر من الحد المسموح (" + CHART_LIMITS.scatterPoints + ").", sp + ".points"); return; }
          const points: ChartPoint[] = [];
          pts.forEach((p, j) => {
            const pp = sp + ".points[" + j + "]";
            if (!isPlain(p)) { add("CHART_INVALID", "نقطة غير صالحة.", pp); return; }
            if (!keysOk(p, ["id", "x", "y", "label"], pp)) return;
            const pid = id(p.id, pp + ".id", "points"), x = num(p.x, pp + ".x"), y = num(p.y, pp + ".y");
            const point: ChartPoint = { id: pid || "", x: x ?? 0, y: y ?? 0 };
            if (own(p, "label")) { const t = text(p.label, pp + ".label", CHART_LIMITS.labelChars, true); if (t === undefined) return; point.label = t; }
            if (pid !== undefined && x !== undefined && y !== undefined) points.push(point);
          });
          if (points.length === pts.length) series.push({ id: r.id, label: r.label, points });
        });
        if (series.length === arr.length) out.series = series;
      }
      axis(raw, "xAxis", path, out, true);
      axis(raw, "yAxis", path, out, true);
      referenceLines(raw, path, out);
      break;
    }
    case "histogram": {
      const arr = list(raw.bins, path + ".bins", 1, CHART_LIMITS.bins, "فئات المدرّج التكراري");
      if (arr) {
        const bins: ChartBin[] = [];
        arr.forEach((b, i) => {
          const bp = path + ".bins[" + i + "]";
          if (!isPlain(b)) { add("CHART_INVALID", "فئة تكرارية غير صالحة.", bp); return; }
          if (!keysOk(b, ["id", "start", "end", "count"], bp)) return;
          const bid = id(b.id, bp + ".id", "bins"), s = num(b.start, bp + ".start"), e = num(b.end, bp + ".end"), c = num(b.count, bp + ".count");
          if (bid === undefined || s === undefined || e === undefined || c === undefined) return;
          if (!(s < e)) { add("CHART_BIN_RANGE", "بداية الفئة يجب أن تكون أصغر من نهايتها.", bp); return; }
          if (c < 0) { add("CHART_VALUE_NEGATIVE", "التكرار لا يكون سالبًا.", bp + ".count"); return; }
          if (bins.length && bins[bins.length - 1].end !== s) { add("CHART_BIN_GAP", "الفئات التكرارية يجب أن تكون متتالية بلا فجوات ولا تداخل (بداية كل فئة = نهاية السابقة).", bp + ".start"); return; }
          bins.push({ id: bid, start: s, end: e, count: c });
        });
        if (bins.length === arr.length) out.bins = bins;
      }
      optBool(raw, "valueLabels", path, out);
      axis(raw, "xAxis", path, out, true);
      axis(raw, "yAxis", path, out, true);
      break;
    }
    case "radar": {
      const arr = list(raw.axes, path + ".axes", CHART_LIMITS.radarAxesMin, CHART_LIMITS.radarAxes, "محاور الرسم الراداري");
      let axes: ChartRadarAxis[] | undefined;
      if (arr) {
        const list2: ChartRadarAxis[] = [];
        arr.forEach((a, i) => {
          const ap = path + ".axes[" + i + "]";
          const r = labelled(a, ap, "axes", ["max"]);
          if (!r) return;
          const m = num(r.o.max, ap + ".max");
          if (m === undefined) return;
          if (!(m > 0)) { add("CHART_AXIS_RANGE", "الحد الأعلى لمحور الرادار يجب أن يكون أكبر من صفر.", ap + ".max"); return; }
          list2.push({ id: r.id, label: r.label, max: m });
        });
        if (list2.length === arr.length) { axes = list2; out.axes = list2; }
      }
      const sarr = list(raw.series, path + ".series", 1, CHART_LIMITS.radarSeries, "سلاسل الرادار");
      if (sarr && axes) {
        const series: ChartRadarSeries[] = [];
        sarr.forEach((s, i) => {
          const sp = path + ".series[" + i + "]";
          const r = labelled(s, sp, "series", ["values"]);
          if (!r) return;
          const vs = values(r.o.values, sp + ".values", axes!.length, false);
          if (!vs) return;
          const bad = vs.findIndex((v, j) => (v as number) < 0 || (v as number) > axes![j].max);
          if (bad >= 0) { add("CHART_VALUE_RANGE", "قيمة الرادار خارج مدى محورها (0 إلى الحد الأعلى).", sp + ".values[" + bad + "]"); return; }
          series.push({ id: r.id, label: r.label, values: vs as number[] });
        });
        if (series.length === sarr.length) out.series = series;
      }
      break;
    }
    case "boxplot": {
      const arr = list(raw.boxes, path + ".boxes", 1, CHART_LIMITS.boxes, "صناديق الرسم الصندوقي");
      if (arr) {
        const boxes: ChartBox[] = [];
        arr.forEach((b, i) => {
          const bp = path + ".boxes[" + i + "]";
          const r = labelled(b, bp, "boxes", ["min", "q1", "median", "q3", "max"]);
          if (!r) return;
          const five = (["min", "q1", "median", "q3", "max"] as const).map(f => num(r.o[f], bp + "." + f));
          if (five.some(x => x === undefined)) return;
          const [mn, q1, md, q3, mx] = five as number[];
          if (!(mn <= q1 && q1 <= md && md <= q3 && q3 <= mx)) { add("CHART_BOX_ORDER", "قيم الصندوق يجب أن تكون مرتبة: أدنى ≤ الربيع الأول ≤ الوسيط ≤ الربيع الثالث ≤ أعلى.", bp); return; }
          boxes.push({ id: r.id, label: r.label, min: mn, q1, median: md, q3, max: mx });
        });
        if (boxes.length === arr.length) out.boxes = boxes;
      }
      axis(raw, "xAxis", path, out, false);
      axis(raw, "yAxis", path, out, true);
      break;
    }
    case "heatmap": {
      const cols = categories(raw.columns, path + ".columns", CHART_LIMITS.heatmapColumns, "columns");
      const rows = categories(raw.rows, path + ".rows", CHART_LIMITS.heatmapRows, "rows");
      if (cols) out.columns = cols;
      if (rows) out.rows = rows;
      if (cols && rows) {
        const m = raw.values;
        if (!Array.isArray(m) || m.length !== rows.length) add("CHART_VALUES_LENGTH", "مصفوفة القيم تحتاج صفًا لكل فئة من فئات الصفوف (" + rows.length + ").", path + ".values");
        else {
          const grid: (number | null)[][] = [];
          m.forEach((row, i) => { const r = values(row, path + ".values[" + i + "]", cols.length, true); if (r) grid.push(r); });
          if (grid.length === rows.length) out.values = grid;
        }
      }
      optText(raw, "unit", path, CHART_LIMITS.unitChars, out);
      optBool(raw, "valueLabels", path, out);
      axis(raw, "xAxis", path, out, false);
      axis(raw, "yAxis", path, out, false);
      break;
    }
  }
  if (issues.length === 0) {
    let bytes = Infinity;
    try { bytes = utf8Bytes(JSON.stringify(out)); } catch { /* unreachable for a rebuilt value */ }
    if (bytes > CHART_LIMITS.serializedBytes) add("CHART_LIMIT", "حجم الرسم البياني أكبر من الحد المسموح.", path);
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: out as unknown as ChartSpecV1, issues: [] };
}
