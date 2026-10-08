// Phase 21A.1 — the chartSelection@1 QUESTION model («اختيار من رسم بياني»): the student answers by selecting SEMANTIC targets of a data chart
// (a category, a series, one value, a scatter point, a histogram bin, or a contiguous range of categories / bins). Pure (no React, no DOM, no
// I/O): compiled into the shared server build. The chart is validated by the ONE chart authority (charts/chartSpec.ts) and its selectable
// targets come from the ONE semantic view (charts/chartData.ts) — nothing is duplicated here.
//
// Public vs private:
//   • PUBLIC  `question.chartSelection` = { v: 1, chart, target, mode, maxSelections, label? } — the chart (declarative ChartSpecV1, never a
//     rendering-library option), which kind of target is selectable, single / multiple / range and the most targets a student may select.
//   • PRIVATE `question.answer` = { scoring: "allOrNothing" | "partial", correct: [targetKey…] } — never sent to a student.
//   • The student answer is `{ kind: "chartSelection", chartId, targets: [targetKey…] }`: semantic keys only — never screen coordinates,
//     pixels, zoom, hover or legend state. `chartId` binds the answer to the chart it was given on.
//
// Grading (server-authoritative, deterministic, pixel-free): config and key are re-validated through ONE strict authority before comparison;
// invalid ⇒ 0 + manual review (never a silent academic zero). A response naming another chart, an unknown target, a duplicate, more targets
// than allowed or (range mode) a non-contiguous run is malformed ⇒ an ordinary 0 (no manual review). Order never matters. allOrNothing =
// marks only for exactly the key; partial = marks × |selected ∩ key| / |selected ∪ key| (so selecting everything never pays).
import { effectiveQuestionTypeVersion } from "./questionTypeCatalog";
import { BIDI_CONTROL, validateChartSpec, type ChartSpecV1 } from "./charts/chartSpec";
import { CHART_SELECTION_MODES, CHART_TARGET_KINDS, RANGE_TARGET_KINDS, chartTargetKinds, chartTargets, isContiguousRun, type ChartSelectionMode, type ChartTarget, type ChartTargetKind } from "./charts/chartData";
import { CONTROL, RAW_HTML } from "./richContent/proseGuard";

export const CHART_SELECTION_TYPE_KEY = "chartSelection";
export const CHART_SELECTION_CONFIG_VERSION = 1;
export const CHART_SELECTION_LIMITS = Object.freeze({ labelChars: 160, minTargets: 2, responseTargets: 500 });
export const CHART_SELECTION_SCORING = Object.freeze(["allOrNothing", "partial"] as const);
export type ChartSelectionScoring = (typeof CHART_SELECTION_SCORING)[number];
export type ChartSelectionConfigV1 = { v: 1; chart: ChartSpecV1; target: ChartTargetKind; mode: ChartSelectionMode; maxSelections: number; label?: string };
export type ChartSelectionAnswerKeyV1 = { scoring: ChartSelectionScoring; correct: string[] };
export type ChartSelectionAnswer = { kind: "chartSelection"; chartId: string; targets: string[] };
export type ChartSelectionIssue = { code: string; message: string; severity: "error"; path?: string };

const err = (code: string, message: string, path?: string): ChartSelectionIssue => ({ code, message, severity: "error", ...(path ? { path } : {}) });
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const onlyKeys = (o: Record<string, unknown>, allowed: readonly string[]): boolean => Object.keys(o).every(k => allowed.includes(k) && !FORBIDDEN_KEYS.has(k));
const own = (o: Record<string, unknown>, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
/** A target key: one chart id, or "seriesId/categoryId" for one value (chart ids are ASCII letter-first, ≤ 32 chars, never "/"). */
const TARGET_KEY = /^[A-Za-z][A-Za-z0-9_-]{0,31}(?:\/[A-Za-z][A-Za-z0-9_-]{0,31})?$/;
const CHART_ID = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;

export const TARGET_KIND_LABELS: Readonly<Record<ChartTargetKind, string>> = Object.freeze({ category: "فئة", series: "سلسلة", datum: "قيمة واحدة", point: "نقطة", bin: "فئة تكرارية" });
export const defaultChartSelectionAnswerKey = (): ChartSelectionAnswerKeyV1 => ({ scoring: "allOrNothing", correct: [] });
export const chartSelectionQuestionVersion = (node: unknown): number | undefined => (isPlain(node) ? effectiveQuestionTypeVersion(CHART_SELECTION_TYPE_KEY, node.questionTypeVersion) : undefined);

// ── the PUBLIC contract ────────────────────────────────────────────────────────────────────────────────────────────────────
export type ChartSelectionConfigResult = { ok: true; config: ChartSelectionConfigV1; targets: ChartTarget[]; issues: [] } | { ok: false; issues: ChartSelectionIssue[] };
/**
 * Root exactly { v: 1, chart, target, mode, maxSelections, label? }: a VALID ChartSpecV1; a target kind the chart offers with at least two
 * selectable targets; a mode (range only for categories / bins); an integer maxSelections (single → 1; otherwise 1..number of targets); an
 * optional plain-prose label. Unknown fields are REFUSED, never dropped. The canonical copy is rebuilt.
 */
export function validateChartSelectionConfig(raw: unknown): ChartSelectionConfigResult {
  if (!isPlain(raw)) return { ok: false, issues: [err("CHART_SELECTION_CONFIG_MISSING", "إعداد سؤال «اختيار من رسم بياني» مفقود أو غير صالح.", "chartSelection")] };
  const issues: ChartSelectionIssue[] = [];
  if (!onlyKeys(raw, ["v", "chart", "target", "mode", "maxSelections", "label"])) issues.push(err("CHART_SELECTION_UNKNOWN_KEY", "إعداد السؤال يحتوي حقولًا غير معروفة.", "chartSelection"));
  if (raw.v !== CHART_SELECTION_CONFIG_VERSION) issues.push(err("CHART_SELECTION_VERSION", "إصدار بنية سؤال الاختيار من الرسم غير مدعوم.", "chartSelection.v"));
  const chart = validateChartSpec(raw.chart, "chartSelection.chart");
  if (!chart.ok) issues.push(...chart.issues.slice(0, 8).map(i => err("CHART_SELECTION_CHART_INVALID", i.message, i.path)));
  const target = raw.target, mode = raw.mode;
  if (typeof target !== "string" || !(CHART_TARGET_KINDS as readonly string[]).includes(target)) issues.push(err("CHART_SELECTION_TARGET_INVALID", "حدّد ما يختاره الطالب من الرسم (فئة أو سلسلة أو قيمة أو نقطة أو فئة تكرارية).", "chartSelection.target"));
  if (typeof mode !== "string" || !(CHART_SELECTION_MODES as readonly string[]).includes(mode)) issues.push(err("CHART_SELECTION_MODE_INVALID", "طريقة الاختيار غير معروفة (اختيار واحد أو متعدد أو نطاق).", "chartSelection.mode"));
  let label: string | undefined;
  if (own(raw, "label")) {
    const l = raw.label;
    if (typeof l !== "string" || l.trim() === "" || l.trim().length > CHART_SELECTION_LIMITS.labelChars || CONTROL.test(l) || BIDI_CONTROL.test(l) || RAW_HTML.test(l)) issues.push(err("CHART_SELECTION_LABEL_INVALID", "تعليمة الاختيار نص عادي غير فارغ حتى " + CHART_SELECTION_LIMITS.labelChars + " حرفًا.", "chartSelection.label"));
    else label = l.trim();
  }
  let targets: ChartTarget[] = [];
  if (chart.ok && typeof target === "string" && (CHART_TARGET_KINDS as readonly string[]).includes(target)) {
    const kind = target as ChartTargetKind;
    if (!chartTargetKinds(chart.value).includes(kind)) issues.push(err("CHART_SELECTION_TARGET_UNSUPPORTED", "هذا النوع من الرسوم لا يتيح اختيار «" + TARGET_KIND_LABELS[kind] + "».", "chartSelection.target"));
    else {
      targets = chartTargets(chart.value, kind);
      if (targets.length < CHART_SELECTION_LIMITS.minTargets) issues.push(err("CHART_SELECTION_TARGETS_TOO_FEW", "يحتاج السؤال عنصرين قابلين للاختيار على الأقل في الرسم.", "chartSelection.target"));
    }
    if (mode === "range" && !RANGE_TARGET_KINDS.includes(kind)) issues.push(err("CHART_SELECTION_RANGE_UNSUPPORTED", "اختيار النطاق متاح للفئات والفئات التكرارية فقط.", "chartSelection.mode"));
  }
  const max = raw.maxSelections;
  if (typeof max !== "number" || !Number.isInteger(max) || max < 1 || (targets.length > 0 && max > targets.length) || (mode === "single" && max !== 1)) issues.push(err("CHART_SELECTION_MAX_INVALID", "الحد الأقصى للاختيارات عدد صحيح من 1 حتى عدد العناصر القابلة للاختيار (1 في الاختيار الواحد).", "chartSelection.maxSelections"));
  if (issues.length || !chart.ok) return { ok: false, issues };
  return { ok: true, config: { v: 1, chart: chart.value, target: target as ChartTargetKind, mode: mode as ChartSelectionMode, maxSelections: max as number, ...(label !== undefined ? { label } : {}) }, targets, issues: [] };
}

// ── the PRIVATE contract ───────────────────────────────────────────────────────────────────────────────────────────────────
export type ChartSelectionKeyResult = { ok: true; key: ChartSelectionAnswerKeyV1; issues: [] } | { ok: false; issues: ChartSelectionIssue[] };
/** The key against a VALID config: exactly { scoring, correct }; scoring never defaulted (single → allOrNothing); 1..maxSelections distinct
 *  known targets (single → exactly one; range → one contiguous run in chart order). Canonical: chart order. Any problem invalidates it. */
function checkAnswerKey(raw: unknown, cfg: { config: ChartSelectionConfigV1; targets: ChartTarget[] } | null): ChartSelectionKeyResult {
  if (!isPlain(raw)) return { ok: false, issues: [err("CHART_SELECTION_KEY_INVALID", "مفتاح تصحيح سؤال الاختيار من الرسم مفقود أو غير صالح.", "answer")] };
  const issues: ChartSelectionIssue[] = [];
  if (!onlyKeys(raw, ["scoring", "correct"])) issues.push(err("CHART_SELECTION_KEY_INVALID", "مفتاح التصحيح يحتوي حقولًا غير معروفة.", "answer"));
  const scoring = raw.scoring;
  if (typeof scoring !== "string" || !(CHART_SELECTION_SCORING as readonly string[]).includes(scoring)) issues.push(err("CHART_SELECTION_SCORING_UNKNOWN", "طريقة الاحتساب غير معروفة (الكل أو لا شيء، أو جزئية).", "answer.scoring"));
  const correct = raw.correct;
  if (!Array.isArray(correct) || correct.some(k => typeof k !== "string")) { issues.push(err("CHART_SELECTION_KEY_INVALID", "الاختيارات الصحيحة في مفتاح التصحيح غير صالحة.", "answer.correct")); return { ok: false, issues }; }
  if (!cfg) return issues.length ? { ok: false, issues } : { ok: true, key: { scoring: scoring as ChartSelectionScoring, correct: [...(correct as string[])] }, issues: [] };
  const { config, targets } = cfg;
  if (config.mode === "single" && scoring === "partial") issues.push(err("CHART_SELECTION_SCORING_UNKNOWN", "الاختيار الواحد يُصحَّح بالكل أو لا شيء.", "answer.scoring"));
  const order = targets.map(t => t.key);
  const keys = correct as string[];
  if (keys.length === 0) issues.push(err("CHART_SELECTION_KEY_EMPTY", "حدّد الاختيار الصحيح في الرسم.", "answer.correct"));
  if (new Set(keys).size !== keys.length) issues.push(err("CHART_SELECTION_KEY_DUPLICATE", "الاختيار الصحيح مكرّر في مفتاح التصحيح.", "answer.correct"));
  const unknown = keys.filter(k => !order.includes(k));
  if (unknown.length) issues.push(err("CHART_SELECTION_KEY_UNKNOWN_TARGET", "مفتاح التصحيح يذكر عنصرًا غير موجود في الرسم «" + unknown[0].slice(0, 40) + "».", "answer.correct"));
  if (config.mode === "single" && keys.length > 1) issues.push(err("CHART_SELECTION_KEY_SINGLE", "الاختيار الواحد له إجابة صحيحة واحدة.", "answer.correct"));
  if (keys.length > config.maxSelections) issues.push(err("CHART_SELECTION_KEY_UNREACHABLE", "عدد الاختيارات الصحيحة أكبر من الحد الأقصى المسموح للطالب؛ لا يمكن الوصول إلى الدرجة الكاملة.", "answer.correct"));
  if (config.mode === "range" && keys.length > 0 && !unknown.length && !isContiguousRun(order, keys)) issues.push(err("CHART_SELECTION_KEY_RANGE", "النطاق الصحيح يجب أن يكون متصلًا بترتيب الرسم.", "answer.correct"));
  if (issues.length) return { ok: false, issues };
  return { ok: true, key: { scoring: scoring as ChartSelectionScoring, correct: order.filter(k => keys.includes(k)) }, issues: [] };
}
export function validateChartSelectionAnswerKey(raw: unknown, rawConfig: unknown): ChartSelectionKeyResult {
  const cfg = validateChartSelectionConfig(rawConfig);
  if (!cfg.ok) return { ok: false, issues: [err("CHART_SELECTION_KEY_CONFIG_INVALID", "لا يمكن التحقق من الاختيار الصحيح لأن إعداد السؤال غير صالح.", "chartSelection")] };
  return checkAnswerKey(raw, cfg);
}

/** chartSelection@1 finalization rules (client and server run the same code). */
export function validateChartSelectionQuestion(node: Record<string, unknown>): ChartSelectionIssue[] {
  const out: ChartSelectionIssue[] = [];
  if (chartSelectionQuestionVersion(node) === undefined) out.push(err("CHART_SELECTION_VERSION_UNSUPPORTED", "إصدار سؤال «اختيار من رسم بياني» غير مدعوم في هذا الإصدار من التطبيق.", "questionTypeVersion"));
  const cfg = validateChartSelectionConfig(node.chartSelection);
  if (!cfg.ok) out.push(...cfg.issues);
  const key = checkAnswerKey(node.answer, cfg.ok ? cfg : null);
  if (!key.ok) out.push(...key.issues);
  return out;
}

/** The student projection: the strictly valid canonical public config (rebuilt) or null — never a repaired config, never the key. */
export function projectChartSelectionConfigForStudent(raw: unknown): ChartSelectionConfigV1 | null {
  const r = validateChartSelectionConfig(raw);
  return r.ok ? r.config : null;
}

// ── student answers ────────────────────────────────────────────────────────────────────────────────────────────────────────
export const isChartSelectionAnswerAnswered = (a: unknown): boolean => isPlain(a) && a.kind === "chartSelection" && Array.isArray(a.targets) && a.targets.length > 0;
type ReadResult = { ok: true; targets: string[] } | { ok: false; code: string };
/** Reads a response against a VALID config: the same chart, known targets only, no duplicates, at most maxSelections, a contiguous run in
 *  range mode. The result is in chart order (order never matters). Empty = unanswered (valid). */
function readResponse(response: unknown, cfg: { config: ChartSelectionConfigV1; targets: ChartTarget[] }): ReadResult {
  if (!isPlain(response) || response.kind !== "chartSelection" || !Array.isArray(response.targets)) return { ok: false, code: "CHART_SELECTION_ANSWER_INVALID" };
  if (response.chartId !== cfg.config.chart.id) return { ok: false, code: "CHART_SELECTION_CHART_MISMATCH" };
  const given = response.targets;
  if (given.length > Math.min(cfg.config.maxSelections, CHART_SELECTION_LIMITS.responseTargets)) return { ok: false, code: "CHART_SELECTION_TOO_MANY" };
  if (given.some(k => typeof k !== "string")) return { ok: false, code: "CHART_SELECTION_ANSWER_INVALID" };
  const order = cfg.targets.map(t => t.key);
  if ((given as string[]).some(k => !order.includes(k))) return { ok: false, code: "CHART_SELECTION_TARGET_UNKNOWN" };
  if (new Set(given).size !== given.length) return { ok: false, code: "CHART_SELECTION_DUPLICATE" };
  if (cfg.config.mode === "range" && given.length > 0 && !isContiguousRun(order, given as string[])) return { ok: false, code: "CHART_SELECTION_RANGE_INVALID" };
  return { ok: true, targets: order.filter(k => (given as string[]).includes(k)) };
}
export type ChartSelectionAnswerResult = { ok: true; answer: ChartSelectionAnswer } | { ok: false; code: string };
/** Shape / bounds only (no question at hand): exactly { kind, chartId, targets } with well-formed ids, duplicate-free, bounded. */
export function normalizeChartSelectionAnswer(a: unknown): ChartSelectionAnswerResult {
  if (!isPlain(a) || a.kind !== "chartSelection" || typeof a.chartId !== "string" || !CHART_ID.test(a.chartId) || !Array.isArray(a.targets)) return { ok: false, code: "CHART_SELECTION_ANSWER_INVALID" };
  if (a.targets.length > CHART_SELECTION_LIMITS.responseTargets) return { ok: false, code: "CHART_SELECTION_TOO_MANY" };
  if (a.targets.some(k => typeof k !== "string" || !TARGET_KEY.test(k))) return { ok: false, code: "CHART_SELECTION_ANSWER_INVALID" };
  if (new Set(a.targets).size !== a.targets.length) return { ok: false, code: "CHART_SELECTION_DUPLICATE" };
  return { ok: true, answer: { kind: "chartSelection", chartId: a.chartId, targets: [...(a.targets as string[])] } };
}
/**
 * Ingest binding (draft save / submit / pause) for an answer to a chartSelection@1 question: rebuilt to exactly { kind, chartId, targets }
 * (a client score, coordinates or any other field is dropped) and checked against the question's VALID public config (same chart, known
 * targets, no duplicates, the selection bound, contiguity in range mode) — anything else is REFUSED, never repaired. A defective published
 * config keeps a shape-valid answer (so a teacher-side defect never destroys the student's work) — grading still fails closed.
 */
export function bindChartSelectionAnswerToQuestion(a: unknown, question: unknown): ChartSelectionAnswerResult {
  const shape = normalizeChartSelectionAnswer(a);
  if (!shape.ok) return shape;
  const cfg = isPlain(question) ? validateChartSelectionConfig(question.chartSelection) : null;
  if (!cfg || !cfg.ok) return shape;
  const r = readResponse(shape.answer, cfg);
  return r.ok ? { ok: true, answer: { kind: "chartSelection", chartId: cfg.config.chart.id, targets: r.targets } } : r;
}

// ── grading + review ───────────────────────────────────────────────────────────────────────────────────────────────────────
export type ChartSelectionScore = { score: number; correct: boolean; manualReview: boolean; parts: { correct: number; total: number } };
export const CHART_SELECTION_FAIL_CLOSED: Readonly<ChartSelectionScore> = Object.freeze({ score: 0, correct: false, manualReview: true, parts: Object.freeze({ correct: 0, total: 0 }) });
type Authority = { config: ChartSelectionConfigV1; targets: ChartTarget[]; key: ChartSelectionAnswerKeyV1 };
function authorityOf(rawConfig: unknown, rawKey: unknown): Authority | null {
  const cfg = validateChartSelectionConfig(rawConfig);
  if (!cfg.ok) return null;
  const key = checkAnswerKey(rawKey, cfg);
  return key.ok ? { config: cfg.config, targets: cfg.targets, key: key.key } : null;
}
/** The authoritative scorer (server grader + teacher review). */
export function scoreChartSelection(input: { config: unknown; answerKey: unknown; response: unknown; maxMarks: number }): ChartSelectionScore {
  const max = Number.isFinite(input.maxMarks) ? Math.max(0, input.maxMarks) : 0;
  const auth = authorityOf(input.config, input.answerKey);
  if (!auth) return { ...CHART_SELECTION_FAIL_CLOSED, parts: { ...CHART_SELECTION_FAIL_CLOSED.parts } };
  const total = auth.key.correct.length;
  const r = readResponse(input.response, auth);
  if (!r.ok) return { score: 0, correct: false, manualReview: false, parts: { correct: 0, total } };
  const hits = r.targets.filter(k => auth.key.correct.includes(k)).length;
  const union = new Set([...r.targets, ...auth.key.correct]).size;
  const exact = hits === total && r.targets.length === total;
  const score = auth.key.scoring === "allOrNothing" ? (exact ? max : 0) : max * hits / union;
  return { score: Math.min(max, Math.max(0, score)), correct: exact, manualReview: false, parts: { correct: hits, total } };
}
export type ChartSelectionEvaluation =
  | { ok: true; correct: number; total: number; exact: boolean; results: { key: string; label: string; selected: boolean; expected: boolean; mark: "correct" | "incorrect" | "missed" | null }[] }
  | { ok: false; issues: ChartSelectionIssue[] };
/** Teacher review only (it carries the key): every selectable target with the student's choice, the key and ✓ / ✗ / missed. */
export function evaluateChartSelection(rawConfig: unknown, rawKey: unknown, rawResponse: unknown): ChartSelectionEvaluation {
  const auth = authorityOf(rawConfig, rawKey);
  if (!auth) {
    const cfg = validateChartSelectionConfig(rawConfig);
    return { ok: false, issues: cfg.ok ? validateChartSelectionAnswerKey(rawKey, rawConfig).issues : cfg.issues };
  }
  const r = readResponse(rawResponse, auth);
  const chosen = new Set(r.ok ? r.targets : []);
  const results = auth.targets.map(t => {
    const selected = chosen.has(t.key), expected = auth.key.correct.includes(t.key);
    return { key: t.key, label: t.label, selected, expected, mark: selected && expected ? "correct" as const : selected ? "incorrect" as const : expected ? "missed" as const : null };
  });
  const hits = results.filter(x => x.mark === "correct").length;
  return { ok: true, correct: hits, total: auth.key.correct.length, exact: hits === auth.key.correct.length && chosen.size === hits, results };
}
