// Phase 21A.1 — AI → ChartSpecV1. The model never writes a ChartSpec (and never a rendering-library option): it fills ONE bounded, flat,
// closed chart DESCRIPTOR inside a `dataChart` rich block (strict provider schema), and code maps it field by field — every id is
// code-owned and deterministic, the provenance label is code-owned — before the ONE chart authority (validateChartSpec, through
// validateRichContent) decides. DATA INTEGRITY: a descriptor declares where its numbers come from. `teacherProvided` numbers are CHECKED
// against the teacher's own request: each must occur in it, a category the request writes with one number must keep that number in a
// single-series chart, and the title / description state no other number (otherwise the section is refused with a repairable issue). It is
// a check of what the teacher wrote, not a proof: values the request does not write as pairs can still be exchanged (design record §11);
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
/** Arabic-Indic / Persian digits → ASCII; the Arabic decimal separator → "."; the Arabic thousands separator → ","; the minus sign, and an
 *  en / figure dash written before a digit, → "-"; a comma list written without spaces ("120,80,95": groups not all three digits long) gets
 *  its spaces back, so those commas read as list separators, never as decimal points. */
const normDigits = (text: string) => String(text || "").replace(DIGITS, d => String(d.charCodeAt(0) & 0xf)).replace(/٫/g, ".").replace(/٬/g, ",")
  .replace(/[\u2012\u2013](?=\d)/g, "-").replace(/−/g, "-")
  .replace(/\d+(?:,\d+){2,}/g, run => (run.split(",").slice(1).every(g => g.length === 3) ? run : run.replace(/,/g, ", ")));
// One number as written: "," between groups of exactly three digits is a THOUSANDS separator ("1,200" = 1200, never 1.2); otherwise "." or
// "," before digits is the decimal separator ("1,5" = 1.5); an exponent is part of the number ("1.5e3" = 1500).
const NUMBER = /(-?)(\d{1,3}(?:,\d{3})+(?!\d)|\d+)(?:[.,](\d+))?(?:[eE]([+-]?\d{1,3}))?/g;
function readNumber(t: string, m: RegExpMatchArray): number {
  const n = Number(m[2].replace(/,/g, "") + (m[3] ? "." + m[3] : "") + (m[4] ? "e" + m[4] : ""));
  // a "-" right after a digit is a range / date separator ("10-20" = 10 and 20), never a sign; otherwise it is the number's sign
  const negative = m[1] === "-" && !((m.index ?? 0) > 0 && /\d/.test(t[(m.index ?? 0) - 1]));
  return negative ? -n : n === 0 ? 0 : n;
}
/** Every number written in a text, read by the rules above (see normDigits / NUMBER / readNumber): "1,200" is 1200, "-5" is -5, "1,5" is
 *  1.5 and "120,95,80" is a list. Writing that the rules read differently from its author's intent is listed in the design record §11. */
export function numbersInText(text: string): Set<number> {
  const t = normDigits(text);
  const out = new Set<number>();
  for (const m of t.matchAll(NUMBER)) { const n = readNumber(t, m); if (Number.isFinite(n)) out.add(n === 0 ? 0 : n); }
  return out;
}

// ── category ↔ value pairings the teacher WROTE (conservative: an unclear phrasing pairs nothing, it never invents a pairing) ─────────────
const INVISIBLE_OR_TATWEEL = /[\p{Default_Ignorable_Code_Point}\u0640]/gu;
/** Text as compared for pairing: compatibility forms folded (NFKC), invisible characters and tatweel removed, digits normalized, lower case. */
const pairText = (s: string) => normDigits(String(s || "").normalize("NFKC").replace(INVISIBLE_OR_TATWEEL, "")).toLowerCase();
/** A list separator: , ، ؛ ; / & (optionally followed by "and" / "و"), or "and" / "و" alone ("120 و80", "يناير وفبراير"). */
const LIST_SEP = "(?:\\s*[,،؛;/&]\\s*(?:(?:and\\b|و)\\s*)?|\\s+and\\s+|\\s+و\\s*)";
/** A short unit after a number ("%", "mm", "ملم", "وحدة") — never the "و" of a following list item. */
const UNIT = "(?:\\s*(?:[%٪]|(?!و(?:\\s|\\d))[^\\s\\d,،؛;/&.:=()\\-]{1,6}))?";
const sticky = (source: string, t: string, at: number) => { const re = new RegExp(source, "y"); re.lastIndex = at; return re.exec(t); };
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isYearLike = (s: string) => /^\d{4}$/.test(s) && Number(s) >= 1900 && Number(s) <= 2100;
/** The numbers of a written value list starting at `from` ("120, 80, 95", "120 و80 و95 ملم", "50%, 30%, 20%"). */
function numberRun(t: string, from: number): number[] {
  const out: number[] = [];
  for (let p = from; ;) {
    const m = sticky(NUMBER.source, t, p);
    if (!m) break;
    out.push(readNumber(t, m));
    p = m.index + m[0].length;
    p += sticky(UNIT, t, p)?.[0].length ?? 0;
    const sep = sticky(LIST_SEP, t, p);
    if (!sep || !sticky(NUMBER.source, t, p + sep[0].length)) break;
    p += sep[0].length;
  }
  return out;
}
/** True when a value list continues after the number that ends at `after` (a list item is not the value of the label before it). */
const continuesList = (t: string, after: number) => {
  const p = after + (sticky(UNIT, t, after)?.[0].length ?? 0), sep = sticky(LIST_SEP, t, p);
  return !!sep && !!sticky(NUMBER.source, t, p + sep[0].length);
};
/** The ONE number of the clause that follows a year qualifier ("january 2024 sales were 120", "jan (2023) 120"); undefined when none or
 *  several, or when the clause reaches another label first. */
function clauseValue(t: string, from: number, others: readonly string[]): number | undefined {
  const values: number[] = [];
  let prev = from;
  for (const m of t.slice(from).matchAll(NUMBER)) {
    const at = from + (m.index ?? 0), gap = t.slice(prev, at);
    if (/[.!?؟\n؛;,،]/.test(gap) || others.some(o => o && gap.includes(o))) break;
    values.push(readNumber(t, Object.assign(m, { index: at })));
    prev = at + m[0].length;
  }
  return values.length === 1 ? values[0] : undefined;
}
/** The number paired with ONE label (`others`: the chart's other labels, so a label list is recognised as such). */
function pairedAt(t: string, l: string, others: readonly string[]): number | undefined {
  if (!l) return undefined;
  const found = new Set<number>();
  for (let at = t.indexOf(l); at >= 0; at = t.indexOf(l, at + 1)) {
    // an item of a list of this chart's labels ("jan, feb, mar: …", "يناير وفبراير ومارس: …"): its values are a list too
    const before = t.slice(0, at), sep = new RegExp("(?:" + LIST_SEP + ")$").exec(before);
    if (sep && others.some(o => o && before.slice(0, sep.index).trimEnd().endsWith(o))) continue;
    const lead = /^[\s:=(]*/.exec(t.slice(at + l.length))![0];
    if (!lead) continue;                                                   // "Q1" never pairs with the "0" of "Q10"; "jan," is a list item
    const from = at + l.length + lead.length, m = sticky(NUMBER.source, t, from);
    if (!m) continue;
    const after = from + m[0].length, rest = t.slice(after);
    if (isYearLike(m[0])) { const v = clauseValue(t, after, others); if (v !== undefined) found.add(v); continue; }   // a year qualifier
    if (/^[\s:=(]+/.test(rest) && sticky(NUMBER.source, rest.replace(/^[\s:=(]+/, ""), 0)) continue;                // a number, then another
    if (/^\s*(?:-|to\b|إلى|حتى)\s*-?\d/.test(rest)) continue;                                                          // a range
    if (continuesList(t, after)) continue;                                                                             // a value list
    const n = readNumber(t, m);
    if (Number.isFinite(n)) found.add(n);
  }
  return found.size === 1 ? [...found][0] : undefined;
}
/**
 * The values a request WRITES for the given category labels, in order (undefined where it writes none clearly): a list of these labels
 * followed by a value list of the same length pairs positionally ("Jan, Feb, Mar: 120, 80, 95", "في يناير وفبراير ومارس: 120 و80 و95");
 * otherwise each label pairs with the ONE number written right after it ("يناير ١٢٠", "Jan: 1,200"), or with the one number of the clause
 * after a year qualifier ("January 2024 sales were 120"). Never a pairing: a label glued to digits (Q1 / Q10), a number followed by another
 * number, a range, an item of a value list, a label written with different numbers. Labels match case-insensitively after NFKC, without
 * invisible characters or tatweel.
 */
export function pairedNumbers(request: string, labels: readonly string[]): (number | undefined)[] {
  const t = pairText(request), ls = labels.map(l => pairText(l).trim());
  if (ls.length >= 2 && ls.every(Boolean)) {
    for (const m of t.matchAll(new RegExp(ls.map(escapeRe).join(LIST_SEP) + "[\\s:=(]*", "g"))) {
      const run = numberRun(t, (m.index ?? 0) + m[0].length);
      if (run.length === ls.length) return run;
    }
  }
  return ls.map((l, i) => pairedAt(t, l, ls.filter((_, j) => j !== i)));
}
/** The value a request writes for one label (see pairedNumbers). */
export const pairedNumber = (request: string, label: string): number | undefined => pairedNumbers(request, [label])[0];

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
    // where the request pairs a category with ONE number ("يناير ١٢٠"), a single-series chart must give that category exactly that number
    // (a swapped or shifted value is refused even though it occurs somewhere in the request)
    // (the refusal never states a value: the pairing is a check of what the teacher wrote, not a value to copy)
    const one = (kind === "bar" || kind === "line" || kind === "area" || kind === "combo" || kind === "pie") && (kind === "pie" || series.length === 1) ? series[0]?.values ?? [] : null;
    const pairs = one ? pairedNumbers(policy.request, categories) : [];
    if (one) for (let i = 0; i < categories.length; i++) {
      const p = pairs[i], v = one[i];
      if (p !== undefined && v !== null && v !== undefined && v !== p) return fail("AI_CHART_DATA_NOT_PROVIDED", "قيمة «" + categories[i].slice(0, 40) + "» في الرسم لا تطابق ما كتبه المعلم لها في طلبه؛ انسخ قيمة كل فئة كما وردت معها في الطلب، دون تبديل أو إزاحة.", path + ".series");
    }
    // a teacher-data chart's title and description state no number the teacher did not write (no invented figures presented as real)
    const stated = [...numbersInText((raw.title as string) + "\n" + (raw.description as string))].filter(n => !given.has(n));
    if (stated.length) return fail("AI_CHART_DATA_NOT_PROVIDED", "عنوان الرسم أو وصفه يذكر رقمًا ليس في طلب المعلم (" + stated[0] + ")؛ احذفه أو استخدم أرقام المعلم فقط.", path + ".title");
  }
  return { ok: true, chart: chart as ChartSpecV1 };
}
