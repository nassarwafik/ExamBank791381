// Phase 21A.1 — AI → ChartSpecV1. The model never writes a ChartSpec (and never a rendering-library option): it fills ONE bounded, flat,
// closed chart DESCRIPTOR inside a `dataChart` rich block (strict provider schema), and code maps it field by field — every id is
// code-owned and deterministic, the provenance label is code-owned — before the ONE chart authority (validateChartSpec, through
// validateRichContent) decides. DATA INTEGRITY: a descriptor declares where its numbers come from. `teacherProvided` numbers must each
// appear in the teacher's own request (otherwise the section is refused with a repairable issue — the AI never "adjusts" teacher data);
// `illustrative` numbers are allowed only when the teacher enabled illustrative data, and such a chart is always labelled by code as
// illustrative (never presented as real data). Without a policy (no teacher request at hand) no AI chart is accepted (fail closed).
import { CHART_KINDS, CHART_LIMITS, type ChartKind, type ChartSpecV1 } from "../charts/chartSpec";
import { cleanText, hasExactKeys, isArr, isEnum, isNum, isStr, sArr, sBool, sEnum, sInt, sNull, sNum, sObj, sStr, type JsonSchema } from "./composerSchemaKit";
import type { ComposerIssue } from "./composerLimits";

export const AI_CHART_DATA_ORIGINS = Object.freeze(["teacherProvided", "illustrative"] as const);
export type AiChartDataOrigin = (typeof AI_CHART_DATA_ORIGINS)[number];
/** The policy the CALLER derives from the teacher's request: the request text (teacher-provided numbers must appear in it) and whether the
 *  teacher allowed illustrative (invented) data. */
export type AiChartPolicy = { request: string; illustrative: boolean; charts: boolean };
export const AI_CHART_SOURCE_LABELS: Readonly<Record<AiChartDataOrigin, string>> = Object.freeze({
  teacherProvided: "بيانات من طلب المعلم",
  illustrative: "بيانات توضيحية من إنشاء الذكاء الاصطناعي — ليست بيانات حقيقية"
});
const L = CHART_LIMITS;
const SERIES_MARKS = ["bar", "line"] as const;
/** Scatter points an AI descriptor may carry (the chart contract allows more; an AI-authored stimulus stays small). */
export const AI_CHART_POINTS = 200;

export function buildAiChartSchema(): JsonSchema {
  return sObj({
    kind: sEnum(CHART_KINDS), dataOrigin: sEnum(AI_CHART_DATA_ORIGINS), title: sStr(), description: sStr(),
    categories: sArr(sStr(), L.categories),
    series: sArr(sObj({ label: sStr(), values: sArr(sNull(sNum()), L.categories), mark: sEnum(SERIES_MARKS) }), L.series),
    points: sArr(sObj({ series: sInt(1, L.scatterSeries), x: sNum(), y: sNum(), label: sStr() }), AI_CHART_POINTS),
    bins: sArr(sObj({ start: sNum(), end: sNum(), count: sNum() }), L.bins),
    boxes: sArr(sObj({ label: sStr(), min: sNum(), q1: sNum(), median: sNum(), q3: sNum(), max: sNum() }), L.boxes),
    xLabel: sStr(), yLabel: sStr(), unit: sStr(), stacked: sBool(), horizontal: sBool(), donut: sBool()
  });
}
const CHART_KEYS = ["kind", "dataOrigin", "title", "description", "categories", "series", "points", "bins", "boxes", "xLabel", "yLabel", "unit", "stacked", "horizontal", "donut"] as const;

type R = { ok: true; chart: ChartSpecV1 } | { ok: false; issues: ComposerIssue[] };
const DIGITS = /[٠-٩۰-۹]/g;
/** Every number written in a text (Arabic-Indic / Persian digits, the Arabic decimal separator and a decimal comma between digits accepted). */
export function numbersInText(text: string): Set<number> {
  const t = String(text || "").replace(DIGITS, d => String(d.charCodeAt(0) & 0xf)).replace(/٫/g, ".").replace(/−/g, "-");
  const out = new Set<number>();
  for (const m of t.matchAll(/-?\d+(?:[.,]\d+)?/g)) { const n = Number(m[0].replace(",", ".")); if (Number.isFinite(n)) { out.add(n); out.add(Math.abs(n)); } }
  return out;
}

/** Maps one AI chart descriptor (block index `index` of its document) to a ChartSpecV1 — the chart authority still decides afterwards. */
export function mapAiChart(raw: unknown, index: number, policy: AiChartPolicy | undefined, path: string): R {
  const fail = (code: string, message: string, p = path): R => ({ ok: false, issues: [{ code, message, path: p }] });
  if (!policy) return fail("AI_CHART_POLICY_MISSING", "لا يمكن قبول رسم بياني من الذكاء الاصطناعي دون طلب المعلم.");
  if (!policy.charts) return fail("AI_CHART_DISABLED", "ميزة الرسوم البيانية غير مفعّلة في طلب المعلم.");
  if (!hasExactKeys(raw, CHART_KEYS) || !isEnum(raw.kind, CHART_KINDS) || !isEnum(raw.dataOrigin, AI_CHART_DATA_ORIGINS)) return fail("AI_CHART_MALFORMED", "وصف الرسم البياني غير صالح البنية.");
  for (const k of ["title", "description", "xLabel", "yLabel", "unit"] as const) if (!isStr(raw[k], L.descriptionChars)) return fail("AI_CHART_MALFORMED", "نصوص الرسم البياني خارج الحدود.", path + "." + k);
  for (const k of ["stacked", "horizontal", "donut"] as const) if (typeof raw[k] !== "boolean") return fail("AI_CHART_MALFORMED", "خيارات الرسم البياني غير صالحة.", path + "." + k);
  const num = (v: unknown) => isNum(v, -L.absValue, L.absValue);
  if (!isArr(raw.categories, L.categories) || !raw.categories.every(c => isStr(c, L.labelChars))) return fail("AI_CHART_MALFORMED", "فئات الرسم البياني غير صالحة.", path + ".categories");
  if (!isArr(raw.series, L.series) || !raw.series.every(s => hasExactKeys(s, ["label", "values", "mark"]) && isStr(s.label, L.labelChars) && isEnum(s.mark, SERIES_MARKS) && isArr(s.values, L.categories) && s.values.every(v => v === null || num(v)))) return fail("AI_CHART_MALFORMED", "سلاسل الرسم البياني غير صالحة.", path + ".series");
  if (!isArr(raw.points, AI_CHART_POINTS) || !raw.points.every(p => hasExactKeys(p, ["series", "x", "y", "label"]) && Number.isInteger(p.series) && (p.series as number) >= 1 && num(p.x) && num(p.y) && isStr(p.label, L.labelChars))) return fail("AI_CHART_MALFORMED", "نقاط الرسم البياني غير صالحة.", path + ".points");
  if (!isArr(raw.bins, L.bins) || !raw.bins.every(b => hasExactKeys(b, ["start", "end", "count"]) && num(b.start) && num(b.end) && num(b.count))) return fail("AI_CHART_MALFORMED", "الفئات التكرارية غير صالحة.", path + ".bins");
  if (!isArr(raw.boxes, L.boxes) || !raw.boxes.every(b => hasExactKeys(b, ["label", "min", "q1", "median", "q3", "max"]) && isStr(b.label, L.labelChars) && [b.min, b.q1, b.median, b.q3, b.max].every(num))) return fail("AI_CHART_MALFORMED", "الصناديق غير صالحة.", path + ".boxes");
  const origin = raw.dataOrigin as AiChartDataOrigin;
  if (origin === "illustrative" && !policy.illustrative) return fail("AI_CHART_ILLUSTRATIVE_NOT_ALLOWED", "لم يسمح المعلم ببيانات توضيحية مخترعة؛ استخدم أرقام المعلم فقط أو لا تضف رسمًا بيانيًا.", path + ".dataOrigin");
  const kind = raw.kind as ChartKind;
  const categories = (raw.categories as string[]).map(cleanText);
  const series = raw.series as { label: string; values: (number | null)[]; mark: "bar" | "line" }[];
  const xLabel = cleanText(raw.xLabel as string), yLabel = cleanText(raw.yLabel as string), unit = cleanText(raw.unit as string);
  const axis = (label: string, withUnit: boolean) => (label || (withUnit && unit) ? { ...(label ? { label } : {}), ...(withUnit && unit ? { unit } : {}) } : undefined);
  const opt = <T,>(k: string, v: T | undefined) => (v === undefined ? {} : { [k]: v });
  const used: number[] = [];
  const common = { version: 1 as const, id: "chart" + (index + 1), title: cleanText(raw.title as string), description: cleanText(raw.description as string), source: AI_CHART_SOURCE_LABELS[origin] };
  const cats = categories.map((label, i) => ({ id: "c" + (i + 1), label }));
  let chart: Record<string, unknown>;
  switch (kind) {
    case "bar": case "line": case "area": case "combo": {
      const horizontal = kind === "bar" && raw.horizontal === true;
      const ss = series.map((s, i) => { used.push(...s.values.filter((v): v is number => v !== null)); return { id: "s" + (i + 1), label: cleanText(s.label), values: [...s.values], ...(kind === "combo" ? { mark: s.mark } : {}) }; });
      chart = { ...common, kind, categories: cats, series: ss, ...((kind === "bar" || kind === "area") && raw.stacked === true ? { stacked: true } : {}), ...(horizontal ? { orientation: "horizontal" } : {}),
        ...opt("xAxis", horizontal ? axis(yLabel, true) : axis(xLabel, false)), ...opt("yAxis", horizontal ? axis(xLabel, false) : axis(yLabel, true)) };
      break;
    }
    case "pie": {
      const values = series[0]?.values ?? [];
      used.push(...values.filter((v): v is number => v !== null));
      chart = { ...common, kind, slices: cats.map((c, i) => ({ id: "p" + (i + 1), label: c.label, value: values[i] as number })), ...(raw.donut === true ? { donut: true } : {}), ...(unit ? { unit } : {}) };
      break;
    }
    case "scatter": {
      const pts = raw.points as { series: number; x: number; y: number; label: string }[];
      const groups = series.length ? series : [{ label: "البيانات", values: [], mark: "bar" as const }];
      let n = 0;
      chart = { ...common, kind, series: groups.map((s, si) => ({ id: "s" + (si + 1), label: cleanText(s.label), points: pts.filter(p => p.series === si + 1).map(p => { used.push(p.x, p.y); const label = cleanText(p.label); return { id: "pt" + ++n, x: p.x, y: p.y, ...(label ? { label } : {}) }; }) })),
        ...opt("xAxis", axis(xLabel, false)), ...opt("yAxis", axis(yLabel, true)) };
      if (pts.some(p => p.series > groups.length)) return fail("AI_CHART_MALFORMED", "نقطة تنتمي إلى سلسلة غير موجودة.", path + ".points");
      break;
    }
    case "histogram": {
      const bins = (raw.bins as { start: number; end: number; count: number }[]).map((b, i) => { used.push(b.start, b.end, b.count); return { id: "b" + (i + 1), start: b.start, end: b.end, count: b.count }; });
      chart = { ...common, kind, bins, ...opt("xAxis", axis(xLabel, true)), ...opt("yAxis", axis(yLabel, false)) };
      break;
    }
    case "radar": {
      // the scale maximum is not data: code takes the largest value (every value then lies within 0..max)
      const all = series.flatMap(s => s.values.filter((v): v is number => v !== null));
      used.push(...all);
      const max = all.length ? Math.max(...all) : 1;
      chart = { ...common, kind, axes: cats.map((c, i) => ({ id: "a" + (i + 1), label: c.label, max: max > 0 ? max : 1 })), series: series.map((s, i) => ({ id: "s" + (i + 1), label: cleanText(s.label), values: [...s.values] })) };
      break;
    }
    case "boxplot": {
      const boxes = (raw.boxes as { label: string; min: number; q1: number; median: number; q3: number; max: number }[]).map((b, i) => { used.push(b.min, b.q1, b.median, b.q3, b.max); return { id: "x" + (i + 1), label: cleanText(b.label), min: b.min, q1: b.q1, median: b.median, q3: b.q3, max: b.max }; });
      chart = { ...common, kind, boxes, ...opt("xAxis", axis(xLabel, false)), ...opt("yAxis", axis(yLabel, true)) };
      break;
    }
    case "heatmap": {
      used.push(...series.flatMap(s => s.values.filter((v): v is number => v !== null)));
      chart = { ...common, kind, columns: cats.map((c, i) => ({ id: "k" + (i + 1), label: c.label })), rows: series.map((s, i) => ({ id: "r" + (i + 1), label: cleanText(s.label) })), values: series.map(s => [...s.values]), ...(unit ? { unit } : {}),
        ...opt("xAxis", axis(xLabel, false)), ...opt("yAxis", axis(yLabel, false)) };
      break;
    }
  }
  if (origin === "teacherProvided") {
    const given = numbersInText(policy.request);
    const missing = used.filter(v => !given.has(v));
    if (missing.length) return fail("AI_CHART_DATA_NOT_PROVIDED", "أرقام الرسم البياني يجب أن تكون أرقام المعلم كما وردت في طلبه (القيمة " + missing[0] + " غير موجودة في الطلب)؛ لا تعدّل بيانات المعلم ولا تخترعها.", path);
  }
  return { ok: true, chart: chart as ChartSpecV1 };
}
