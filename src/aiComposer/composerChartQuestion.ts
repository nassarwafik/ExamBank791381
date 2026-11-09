// Phase 21P — chartSelection@1 («اختيار من رسم بياني») in the AI Full Exam Composer. The model writes the stem, ONE chart descriptor (the
// 21A.1 descriptor: same data-integrity policy — teacher-provided numbers must come from the teacher's request, illustrative numbers only with
// the teacher's consent and always labelled) and a TASK from a closed list. CODE owns everything else:
//   • the chart (mapAiChart, then the ONE chart authority validateChartSpec);
//   • what the student selects: a category of a single-series bar / line / area chart or of a pie, one value of a multi-series or combo
//     chart, or a histogram bin; other chart kinds are refused;
//   • the ANSWER KEY, computed from the chart's own numbers: the largest / smallest value (refused on a tie), or every value above / below
//     a threshold (refused when the threshold equals a value, or when the answer would be nothing or everything);
//   • the selection mode and bound, and allOrNothing scoring — partial scoring pays "select every target" a share, so it is never used.
// validateStructuredExam (validateChartSelectionQuestion) then decides the question. The model never names the correct target.
import type { BuilderQuestion } from "../examTypes";
import { validateChartSpec, type ChartSpecV1 } from "../charts/chartSpec";
import { chartTargets, type ChartTargetKind } from "../charts/chartData";
import { buildAiChartSchema, mapAiChart, type AiChartPolicy } from "./composerChart";
import { COMPOSER_LIMITS, type ComposerIssue } from "./composerLimits";
import { cleanText, hasExactKeys, isEnum, isNum, isStr, sNull, sNum, sObj, sStr, type JsonSchema } from "./composerSchemaKit";

export const CHART_QUESTION_TASKS = Object.freeze(["max", "min", "above", "below"] as const);
export type ChartQuestionTask = (typeof CHART_QUESTION_TASKS)[number];

// Provider strict mode allows ≤ 1000 enum values across the patch schema (composerReviewFix1): here the chart `kind` and the `task` travel
// as plain strings and CODE checks them against the closed lists (mapAiChart: CHART_KINDS; below: CHART_QUESTION_TASKS); the prompt names
// the accepted values. Every other field of the 21A.1 descriptor keeps its schema.
export function buildChartQuestionSchema(): JsonSchema {
  const chart = buildAiChartSchema() as { properties: Record<string, JsonSchema> };
  return sObj({ text: sStr(), chart: { ...chart, properties: { ...chart.properties, kind: sStr() } }, task: sStr(), threshold: sNull(sNum()) });
}
const KEYS = ["text", "chart", "task", "threshold"] as const;

type Target = { key: string; value: number };
/** The selectable targets of a chart with their numbers (code decides the target kind from the chart kind), or why the chart cannot carry
 *  a code-checked selection task. */
function valuedTargets(spec: ChartSpecV1): { ok: true; kind: ChartTargetKind; targets: Target[] } | { ok: false; message: string } {
  switch (spec.kind) {
    case "bar": case "line": case "area": case "combo": {
      if (spec.series.some(s => s.values.some(v => v === null))) return { ok: false, message: "كل خلايا الرسم تحتاج قيمة (لا قيم فارغة في سؤال يُصحَّح من أرقام الرسم)." };
      if (spec.kind !== "combo" && spec.series.length === 1) return { ok: true, kind: "category", targets: spec.categories.map((c, i) => ({ key: c.id, value: spec.series[0].values[i] as number })) };
      return { ok: true, kind: "datum", targets: chartTargets(spec, "datum").map(t => ({ key: t.key, value: t.value as number })) };
    }
    case "pie": return { ok: true, kind: "category", targets: spec.slices.map(s => ({ key: s.id, value: s.value })) };
    case "histogram": return { ok: true, kind: "bin", targets: spec.bins.map(b => ({ key: b.id, value: b.count })) };
    default: return { ok: false, message: "سؤال الاختيار من الرسم يُبنى على رسم أعمدة أو خطي أو مساحي أو مركّب أو دائري أو مدرّج تكراري." };
  }
}

/** The chartQuestion payload → a canonical chartSelection@1 question (code-owned id, plan marks, chart, target kind, mode and key). */
export function buildChartSelectionQuestion(raw: unknown, qid: string, marks: number, policy: AiChartPolicy | undefined, path: string): { ok: true; question: BuilderQuestion } | { ok: false; issues: ComposerIssue[] } {
  const bad = (code: string, message: string, at = path) => ({ ok: false as const, issues: [{ code, message, path: at, questionId: qid }] });
  if (!hasExactKeys(raw, KEYS) || !isStr(raw.text, COMPOSER_LIMITS.richTextChars, 1) || !isEnum(raw.task, CHART_QUESTION_TASKS) || !(raw.threshold === null || isNum(raw.threshold, -1e12, 1e12)))
    return bad("AI_CHARTQ_MALFORMED", "سؤال الاختيار من الرسم غير صالح البنية.");
  const m = mapAiChart(raw.chart, 0, policy, path + ".chart");
  if (!m.ok) return { ok: false, issues: m.issues.map(i => ({ ...i, questionId: qid })) };
  const v = validateChartSpec(m.chart, "chartSelection.chart");
  if (!v.ok) return { ok: false, issues: v.issues.slice(0, 8).map(i => ({ code: "AI_CHARTQ_CHART_INVALID", message: i.message, path: path + ".chart", questionId: qid })) };
  const spec = v.value;
  const t = valuedTargets(spec);
  if (!t.ok) return bad("AI_CHARTQ_KIND", t.message, path + ".chart");
  const targets = t.targets, task = raw.task as ChartQuestionTask, threshold = raw.threshold as number | null;
  if (targets.length < 2) return bad("AI_CHARTQ_TARGETS", "الرسم يحتاج عنصرين قابلين للاختيار على الأقل.", path + ".chart");
  let correct: string[];
  if (task === "max" || task === "min") {
    if (threshold !== null) return bad("AI_CHARTQ_THRESHOLD", "مهمة الأكبر / الأصغر لا تأخذ عتبة (threshold = null).", path + ".threshold");
    const best = task === "max" ? Math.max(...targets.map(x => x.value)) : Math.min(...targets.map(x => x.value));
    const hits = targets.filter(x => x.value === best);
    if (hits.length !== 1) return bad("AI_CHARTQ_TIE", "القيمة " + (task === "max" ? "الأكبر" : "الأصغر") + " مكرّرة في الرسم؛ اجعلها لعنصر واحد حتى تكون الإجابة واحدة.", path + ".chart");
    correct = [hits[0].key];
  } else {
    if (threshold === null) return bad("AI_CHARTQ_THRESHOLD", "مهمة «أكبر من» / «أصغر من» تحتاج عتبة رقمية.", path + ".threshold");
    if (targets.some(x => x.value === threshold)) return bad("AI_CHARTQ_THRESHOLD", "العتبة تساوي قيمة في الرسم فيصبح الجواب ملتبسًا؛ اختر عتبة لا تساوي أي قيمة.", path + ".threshold");
    correct = targets.filter(x => (task === "above" ? x.value > threshold : x.value < threshold)).map(x => x.key);
    if (correct.length === 0 || correct.length === targets.length) return bad("AI_CHARTQ_THRESHOLD", "العتبة تجعل الإجابة لا شيء أو كل العناصر؛ اختر عتبة تفصل بين العناصر.", path + ".threshold");
  }
  const single = task === "max" || task === "min";
  return { ok: true, question: { examQuestionId: qid, presentationType: "chartSelection", questionTypeVersion: 1, text: cleanText(raw.text as string), marks,
    chartSelection: { v: 1, chart: spec, target: t.kind, mode: single ? "single" : "multiple", maxSelections: single ? 1 : targets.length },
    answer: { scoring: "allOrNothing", correct } } as unknown as BuilderQuestion };
}

/** The model-facing rules, sent only with the prompts that may write a chartSelection question. */
export function chartQuestionRulesForPrompt(): string {
  return [
    "CHART QUESTION RULES (chartSelection): fill `chartQuestion` (question / structured = null): `text` is the instruction the student reads, `chart` ONE chart descriptor under the Charts rules, its kind ONLY bar, line, area, combo, pie or histogram (no empty values), and `task` ONLY one of max, min, above, below:",
    "- max / min: the student selects the largest / smallest value (threshold null; the extreme must be unique).",
    "- above / below: the student selects every value above / below `threshold` (a number equal to no value that splits the values).",
    "Never say which element is correct: code computes the answer from the chart's numbers."
  ].join("\n");
}
const CHART_QUESTION_WORDS = /chart ?selection|chartSelection|select (?:the|every|all) .{0,20}(?:bar|slice|bin|value)|اختيار من رسم|اختر من الرسم|الرسم البياني|رسم بياني|المدرج التكراري|العمود الأعلى/i;
export const mentionsChartQuestion = (text: string): boolean => CHART_QUESTION_WORDS.test(text);
