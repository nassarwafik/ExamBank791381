// Phase 21A.2 — the functionGraphSelection@1 QUESTION model («اختيار من رسم دالة»): the student answers by selecting SEMANTIC targets of a
// mathematical function graph (curves, points, lines, tangents, shaded regions or intervals). Pure (no React, no DOM, no I/O): compiled into
// the shared server build. The graph is validated by the ONE graph authority (functionGraphs/functionGraphSpec.ts) and its targets come from
// the ONE semantic view (functionGraphs/graphTargets.ts) — nothing is duplicated here.
//
// Public vs private:
//   • PUBLIC  `question.functionGraphSelection` = { v: 1, graph, target, mode, maxSelections, label? } — the graph (declarative
//     FunctionGraphSpecV1, never a plotting-library option), the selectable target kind, single / multiple and the selection bound. The
//     STUDENT receives it through projectFunctionGraphSelectionConfigForStudent: the same drawing without teacher-only semantics (roles,
//     on-curve claims, derivative relations, authored slopes).
//   • PRIVATE `question.answer` = { scoring: "allOrNothing" | "partial", correct: [targetKey…] } — never sent to a student.
//   • The student answer is `{ kind: "functionGraphSelection", graphId, targets: ["point:p1", …] }`: semantic keys only — never pixels,
//     coordinates, zoom or trace state. `graphId` binds the answer to the graph it was given on.
//
// Grading (server-authoritative, deterministic, pixel-free): config and key are re-validated through ONE strict authority before comparison;
// invalid ⇒ 0 + manual review (never a silent academic zero). A response naming another graph, an unknown target (or one of another kind),
// a duplicate or more targets than allowed is malformed ⇒ an ordinary 0 (no manual review). Order never matters. allOrNothing = marks only
// for exactly the key; partial = marks × |selected ∩ key| / |selected ∪ key|.
import { effectiveQuestionTypeVersion } from "./questionTypeCatalog";
import { BIDI_CONTROL, INVISIBLE_CONTROL } from "./charts/chartSpec";
import { CONTROL, RAW_HTML } from "./richContent/proseGuard";
import { validateFunctionGraphSpec, projectGraphForStudent, type FunctionGraphSpecV1 } from "./functionGraphs/functionGraphSpec";
import { graphTargets, GRAPH_TARGET_KINDS, GRAPH_TARGET_KIND_LABELS, type GraphTarget, type GraphTargetKind } from "./functionGraphs/graphTargets";

export const FUNCTION_GRAPH_SELECTION_TYPE_KEY = "functionGraphSelection";
export const FUNCTION_GRAPH_SELECTION_CONFIG_VERSION = 1;
export const FUNCTION_GRAPH_SELECTION_LIMITS = Object.freeze({ labelChars: 160, minTargets: 2, responseTargets: 64 });
export const FUNCTION_GRAPH_SELECTION_MODES = Object.freeze(["single", "multiple"] as const);
export type FunctionGraphSelectionMode = (typeof FUNCTION_GRAPH_SELECTION_MODES)[number];
export const FUNCTION_GRAPH_SELECTION_SCORING = Object.freeze(["allOrNothing", "partial"] as const);
export type FunctionGraphSelectionScoring = (typeof FUNCTION_GRAPH_SELECTION_SCORING)[number];
export type FunctionGraphSelectionConfigV1 = { v: 1; graph: FunctionGraphSpecV1; target: GraphTargetKind; mode: FunctionGraphSelectionMode; maxSelections: number; label?: string };
export type FunctionGraphSelectionAnswerKeyV1 = { scoring: FunctionGraphSelectionScoring; correct: string[] };
export type FunctionGraphSelectionAnswer = { kind: "functionGraphSelection"; graphId: string; targets: string[] };
export type FunctionGraphSelectionIssue = { code: string; message: string; severity: "error"; path?: string };

const err = (code: string, message: string, path?: string): FunctionGraphSelectionIssue => ({ code, message, severity: "error", ...(path ? { path } : {}) });
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const onlyKeys = (o: Record<string, unknown>, allowed: readonly string[]): boolean => Object.keys(o).every(k => allowed.includes(k) && !FORBIDDEN_KEYS.has(k));
const own = (o: Record<string, unknown>, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
/** A target key: "<kind>:<graph object id>" (ids are ASCII letter-first, ≤ 32 characters, never ":"). */
const TARGET_KEY = /^(curve|point|line|tangent|region|interval):[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const GRAPH_ID = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;

export const defaultFunctionGraphSelectionAnswerKey = (): FunctionGraphSelectionAnswerKeyV1 => ({ scoring: "allOrNothing", correct: [] });
export const functionGraphSelectionQuestionVersion = (node: unknown): number | undefined => (isPlain(node) ? effectiveQuestionTypeVersion(FUNCTION_GRAPH_SELECTION_TYPE_KEY, node.questionTypeVersion) : undefined);

// ── the PUBLIC contract ────────────────────────────────────────────────────────────────────────────────────────────────────
export type FunctionGraphSelectionConfigResult = { ok: true; config: FunctionGraphSelectionConfigV1; targets: GraphTarget[]; issues: [] } | { ok: false; issues: FunctionGraphSelectionIssue[] };
/** Root exactly { v: 1, graph, target, mode, maxSelections, label? }: a VALID graph; a target kind the graph offers at least twice; single /
 *  multiple; an integer maxSelections (single → 1, otherwise 1..targets); an optional plain-prose label. Unknown fields are REFUSED. */
export function validateFunctionGraphSelectionConfig(raw: unknown): FunctionGraphSelectionConfigResult {
  if (!isPlain(raw)) return { ok: false, issues: [err("GRAPH_SELECTION_CONFIG_MISSING", "إعداد سؤال «اختيار من رسم دالة» مفقود أو غير صالح.", "functionGraphSelection")] };
  const issues: FunctionGraphSelectionIssue[] = [];
  if (!onlyKeys(raw, ["v", "graph", "target", "mode", "maxSelections", "label"])) issues.push(err("GRAPH_SELECTION_UNKNOWN_KEY", "إعداد السؤال يحتوي حقولًا غير معروفة.", "functionGraphSelection"));
  if (raw.v !== FUNCTION_GRAPH_SELECTION_CONFIG_VERSION) issues.push(err("GRAPH_SELECTION_VERSION", "إصدار بنية سؤال الاختيار من رسم الدالة غير مدعوم.", "functionGraphSelection.v"));
  const graph = validateFunctionGraphSpec(raw.graph, "functionGraphSelection.graph");
  if (!graph.ok) issues.push(...graph.issues.slice(0, 8).map(i => err("GRAPH_SELECTION_GRAPH_INVALID", i.message + " [" + i.code + "]", i.path)));
  const target = raw.target, mode = raw.mode;
  if (typeof target !== "string" || !(GRAPH_TARGET_KINDS as readonly string[]).includes(target)) issues.push(err("GRAPH_SELECTION_TARGET_INVALID", "حدّد ما يختاره الطالب من الرسم (منحنى أو نقطة أو مستقيم أو مماس أو منطقة مظللة أو فترة).", "functionGraphSelection.target"));
  if (typeof mode !== "string" || !(FUNCTION_GRAPH_SELECTION_MODES as readonly string[]).includes(mode)) issues.push(err("GRAPH_SELECTION_MODE_INVALID", "طريقة الاختيار غير معروفة (اختيار واحد أو متعدد).", "functionGraphSelection.mode"));
  let label: string | undefined;
  if (own(raw, "label")) {
    const l = raw.label;
    if (typeof l !== "string" || l.trim() === "" || l.trim().length > FUNCTION_GRAPH_SELECTION_LIMITS.labelChars || CONTROL.test(l) || BIDI_CONTROL.test(l) || INVISIBLE_CONTROL.test(l) || RAW_HTML.test(l)) issues.push(err("GRAPH_SELECTION_LABEL_INVALID", "تعليمة الاختيار نص عادي غير فارغ حتى " + FUNCTION_GRAPH_SELECTION_LIMITS.labelChars + " حرفًا.", "functionGraphSelection.label"));
    else label = l.trim();
  }
  let targets: GraphTarget[] = [];
  if (graph.ok && typeof target === "string" && (GRAPH_TARGET_KINDS as readonly string[]).includes(target)) {
    targets = graphTargets(graph.value, target as GraphTargetKind);
    if (targets.length < FUNCTION_GRAPH_SELECTION_LIMITS.minTargets) issues.push(err("GRAPH_SELECTION_TARGETS_TOO_FEW", "يحتاج السؤال عنصرين على الأقل من نوع «" + GRAPH_TARGET_KIND_LABELS[target as GraphTargetKind] + "» في الرسم.", "functionGraphSelection.target"));
  }
  const max = raw.maxSelections;
  if (typeof max !== "number" || !Number.isInteger(max) || max < 1 || (targets.length > 0 && max > targets.length) || (mode === "single" && max !== 1)) issues.push(err("GRAPH_SELECTION_MAX_INVALID", "الحد الأقصى للاختيارات عدد صحيح من 1 حتى عدد العناصر القابلة للاختيار (1 في الاختيار الواحد).", "functionGraphSelection.maxSelections"));
  if (issues.length || !graph.ok) return { ok: false, issues };
  return { ok: true, config: { v: 1, graph: graph.value, target: target as GraphTargetKind, mode: mode as FunctionGraphSelectionMode, maxSelections: max as number, ...(label !== undefined ? { label } : {}) }, targets, issues: [] };
}

// ── the PRIVATE contract ───────────────────────────────────────────────────────────────────────────────────────────────────
export type FunctionGraphSelectionKeyResult = { ok: true; key: FunctionGraphSelectionAnswerKeyV1; issues: [] } | { ok: false; issues: FunctionGraphSelectionIssue[] };
/** The key against a VALID config: exactly { scoring, correct }; scoring never defaulted (single → allOrNothing); 1..maxSelections distinct
 *  known targets of the selectable kind (single → exactly one). Canonical: graph document order. Any problem invalidates it. */
function checkAnswerKey(raw: unknown, cfg: { config: FunctionGraphSelectionConfigV1; targets: GraphTarget[] } | null): FunctionGraphSelectionKeyResult {
  if (!isPlain(raw)) return { ok: false, issues: [err("GRAPH_SELECTION_KEY_INVALID", "مفتاح تصحيح سؤال الاختيار من رسم الدالة مفقود أو غير صالح.", "answer")] };
  const issues: FunctionGraphSelectionIssue[] = [];
  if (!onlyKeys(raw, ["scoring", "correct"])) issues.push(err("GRAPH_SELECTION_KEY_INVALID", "مفتاح التصحيح يحتوي حقولًا غير معروفة.", "answer"));
  const scoring = raw.scoring;
  if (typeof scoring !== "string" || !(FUNCTION_GRAPH_SELECTION_SCORING as readonly string[]).includes(scoring)) issues.push(err("GRAPH_SELECTION_SCORING_UNKNOWN", "طريقة الاحتساب غير معروفة (الكل أو لا شيء، أو جزئية).", "answer.scoring"));
  const correct = raw.correct;
  if (!Array.isArray(correct) || correct.some(k => typeof k !== "string")) { issues.push(err("GRAPH_SELECTION_KEY_INVALID", "الاختيارات الصحيحة في مفتاح التصحيح غير صالحة.", "answer.correct")); return { ok: false, issues }; }
  if (!cfg) return issues.length ? { ok: false, issues } : { ok: true, key: { scoring: scoring as FunctionGraphSelectionScoring, correct: [...(correct as string[])] }, issues: [] };
  const { config, targets } = cfg;
  if (config.mode === "single" && scoring === "partial") issues.push(err("GRAPH_SELECTION_SCORING_UNKNOWN", "الاختيار الواحد يُصحَّح بالكل أو لا شيء.", "answer.scoring"));
  const order = targets.map(t => t.key), keys = correct as string[];
  if (keys.length === 0) issues.push(err("GRAPH_SELECTION_KEY_EMPTY", "حدّد الاختيار الصحيح في الرسم.", "answer.correct"));
  if (new Set(keys).size !== keys.length) issues.push(err("GRAPH_SELECTION_KEY_DUPLICATE", "الاختيار الصحيح مكرّر في مفتاح التصحيح.", "answer.correct"));
  const unknown = keys.filter(k => !order.includes(k));
  if (unknown.length) issues.push(err("GRAPH_SELECTION_KEY_UNKNOWN_TARGET", "مفتاح التصحيح يذكر عنصرًا غير موجود في الرسم (أو من نوع آخر): «" + unknown[0].slice(0, 48) + "».", "answer.correct"));
  if (config.mode === "single" && keys.length > 1) issues.push(err("GRAPH_SELECTION_KEY_SINGLE", "الاختيار الواحد له إجابة صحيحة واحدة.", "answer.correct"));
  if (keys.length > config.maxSelections) issues.push(err("GRAPH_SELECTION_KEY_UNREACHABLE", "عدد الاختيارات الصحيحة أكبر من الحد الأقصى المسموح للطالب؛ لا يمكن الوصول إلى الدرجة الكاملة.", "answer.correct"));
  if (issues.length) return { ok: false, issues };
  return { ok: true, key: { scoring: scoring as FunctionGraphSelectionScoring, correct: order.filter(k => keys.includes(k)) }, issues: [] };
}
export function validateFunctionGraphSelectionAnswerKey(raw: unknown, rawConfig: unknown): FunctionGraphSelectionKeyResult {
  const cfg = validateFunctionGraphSelectionConfig(rawConfig);
  if (!cfg.ok) return { ok: false, issues: [err("GRAPH_SELECTION_KEY_CONFIG_INVALID", "لا يمكن التحقق من الاختيار الصحيح لأن إعداد السؤال غير صالح.", "functionGraphSelection")] };
  return checkAnswerKey(raw, cfg);
}

/** functionGraphSelection@1 finalization rules (client and server run the same code). */
export function validateFunctionGraphSelectionQuestion(node: Record<string, unknown>): FunctionGraphSelectionIssue[] {
  const out: FunctionGraphSelectionIssue[] = [];
  if (functionGraphSelectionQuestionVersion(node) === undefined) out.push(err("GRAPH_SELECTION_VERSION_UNSUPPORTED", "إصدار سؤال «اختيار من رسم دالة» غير مدعوم في هذا الإصدار من التطبيق.", "questionTypeVersion"));
  const cfg = validateFunctionGraphSelectionConfig(node.functionGraphSelection);
  if (!cfg.ok) out.push(...cfg.issues);
  const key = checkAnswerKey(node.answer, cfg.ok ? cfg : null);
  if (!key.ok) out.push(...key.issues);
  return out;
}

/** The student projection: the strictly valid canonical public config with the graph's teacher-only semantics removed, or null — never a
 *  repaired config, never the key. */
export function projectFunctionGraphSelectionConfigForStudent(raw: unknown): FunctionGraphSelectionConfigV1 | null {
  const r = validateFunctionGraphSelectionConfig(raw);
  return r.ok ? { ...r.config, graph: projectGraphForStudent(r.config.graph) } : null;
}

// ── student answers ────────────────────────────────────────────────────────────────────────────────────────────────────────
export const isFunctionGraphSelectionAnswerAnswered = (a: unknown): boolean => isPlain(a) && a.kind === "functionGraphSelection" && Array.isArray(a.targets) && a.targets.length > 0;
type ReadResult = { ok: true; targets: string[] } | { ok: false; code: string };
/** Reads a response against a VALID config: the same graph, known targets of the selectable kind only, no duplicates, at most maxSelections.
 *  The result is in graph document order (order never matters). Empty = unanswered (valid). */
function readResponse(response: unknown, cfg: { config: FunctionGraphSelectionConfigV1; targets: GraphTarget[] }): ReadResult {
  if (!isPlain(response) || response.kind !== "functionGraphSelection" || !Array.isArray(response.targets)) return { ok: false, code: "GRAPH_SELECTION_ANSWER_INVALID" };
  if (response.graphId !== cfg.config.graph.id) return { ok: false, code: "GRAPH_SELECTION_GRAPH_MISMATCH" };
  const given = response.targets;
  if (given.length > Math.min(cfg.config.maxSelections, FUNCTION_GRAPH_SELECTION_LIMITS.responseTargets)) return { ok: false, code: "GRAPH_SELECTION_TOO_MANY" };
  if (given.some(k => typeof k !== "string")) return { ok: false, code: "GRAPH_SELECTION_ANSWER_INVALID" };
  const order = cfg.targets.map(t => t.key);
  if ((given as string[]).some(k => !order.includes(k))) return { ok: false, code: "GRAPH_SELECTION_TARGET_UNKNOWN" };
  if (new Set(given).size !== given.length) return { ok: false, code: "GRAPH_SELECTION_DUPLICATE" };
  return { ok: true, targets: order.filter(k => (given as string[]).includes(k)) };
}
export type FunctionGraphSelectionAnswerResult = { ok: true; answer: FunctionGraphSelectionAnswer } | { ok: false; code: string };
/** Shape / bounds only (no question at hand): exactly { kind, graphId, targets } with well-formed keys, duplicate-free, bounded. */
export function normalizeFunctionGraphSelectionAnswer(a: unknown): FunctionGraphSelectionAnswerResult {
  if (!isPlain(a) || a.kind !== "functionGraphSelection" || typeof a.graphId !== "string" || !GRAPH_ID.test(a.graphId) || FORBIDDEN_KEYS.has(a.graphId) || !Array.isArray(a.targets)) return { ok: false, code: "GRAPH_SELECTION_ANSWER_INVALID" };
  if (a.targets.length > FUNCTION_GRAPH_SELECTION_LIMITS.responseTargets) return { ok: false, code: "GRAPH_SELECTION_TOO_MANY" };
  if (a.targets.some(k => typeof k !== "string" || !TARGET_KEY.test(k))) return { ok: false, code: "GRAPH_SELECTION_ANSWER_INVALID" };
  if (new Set(a.targets).size !== a.targets.length) return { ok: false, code: "GRAPH_SELECTION_DUPLICATE" };
  return { ok: true, answer: { kind: "functionGraphSelection", graphId: a.graphId, targets: [...(a.targets as string[])] } };
}
/** Ingest binding (draft save / submit / pause): rebuilt to exactly { kind, graphId, targets } (a client score, coordinates or any other
 *  field is dropped) and checked against the question's VALID public config — anything else is REFUSED, never repaired. A defective published
 *  config keeps a shape-valid answer (a teacher-side defect never destroys the student's work) — grading still fails closed. */
export function bindFunctionGraphSelectionAnswerToQuestion(a: unknown, question: unknown): FunctionGraphSelectionAnswerResult {
  const shape = normalizeFunctionGraphSelectionAnswer(a);
  if (!shape.ok) return shape;
  const cfg = isPlain(question) ? validateFunctionGraphSelectionConfig(question.functionGraphSelection) : null;
  if (!cfg || !cfg.ok) return shape;
  const r = readResponse(shape.answer, cfg);
  return r.ok ? { ok: true, answer: { kind: "functionGraphSelection", graphId: cfg.config.graph.id, targets: r.targets } } : r;
}

// ── grading + review ───────────────────────────────────────────────────────────────────────────────────────────────────────
export type FunctionGraphSelectionScore = { score: number; correct: boolean; manualReview: boolean; parts: { correct: number; total: number } };
export const FUNCTION_GRAPH_SELECTION_FAIL_CLOSED: Readonly<FunctionGraphSelectionScore> = Object.freeze({ score: 0, correct: false, manualReview: true, parts: Object.freeze({ correct: 0, total: 0 }) });
type Authority = { config: FunctionGraphSelectionConfigV1; targets: GraphTarget[]; key: FunctionGraphSelectionAnswerKeyV1 };
function authorityOf(rawConfig: unknown, rawKey: unknown): Authority | null {
  const cfg = validateFunctionGraphSelectionConfig(rawConfig);
  if (!cfg.ok) return null;
  const key = checkAnswerKey(rawKey, cfg);
  return key.ok ? { config: cfg.config, targets: cfg.targets, key: key.key } : null;
}
/** The authoritative scorer (server grader + teacher review). */
export function scoreFunctionGraphSelection(input: { config: unknown; answerKey: unknown; response: unknown; maxMarks: number }): FunctionGraphSelectionScore {
  const max = Number.isFinite(input.maxMarks) ? Math.max(0, input.maxMarks) : 0;
  const auth = authorityOf(input.config, input.answerKey);
  if (!auth) return { ...FUNCTION_GRAPH_SELECTION_FAIL_CLOSED, parts: { ...FUNCTION_GRAPH_SELECTION_FAIL_CLOSED.parts } };
  const total = auth.key.correct.length;
  const r = readResponse(input.response, auth);
  if (!r.ok) return { score: 0, correct: false, manualReview: false, parts: { correct: 0, total } };
  const hits = r.targets.filter(k => auth.key.correct.includes(k)).length;
  const union = new Set([...r.targets, ...auth.key.correct]).size;
  const exact = hits === total && r.targets.length === total;
  const score = auth.key.scoring === "allOrNothing" ? (exact ? max : 0) : max * hits / union;
  return { score: Math.min(max, Math.max(0, score)), correct: exact, manualReview: false, parts: { correct: hits, total } };
}
export type FunctionGraphSelectionEvaluation =
  | { ok: true; correct: number; total: number; exact: boolean; results: { key: string; label: string; detail: string; selected: boolean; expected: boolean; mark: "correct" | "incorrect" | "missed" | null }[] }
  | { ok: false; issues: FunctionGraphSelectionIssue[] };
/** Teacher review only (it carries the key): every selectable target with the student's choice, the key and ✓ / ✗ / missed. */
export function evaluateFunctionGraphSelection(rawConfig: unknown, rawKey: unknown, rawResponse: unknown): FunctionGraphSelectionEvaluation {
  const auth = authorityOf(rawConfig, rawKey);
  if (!auth) {
    const cfg = validateFunctionGraphSelectionConfig(rawConfig);
    return { ok: false, issues: cfg.ok ? validateFunctionGraphSelectionAnswerKey(rawKey, rawConfig).issues : cfg.issues };
  }
  const r = readResponse(rawResponse, auth);
  const chosen = new Set(r.ok ? r.targets : []);
  const results = auth.targets.map(t => {
    const selected = chosen.has(t.key), expected = auth.key.correct.includes(t.key);
    return { key: t.key, label: t.label, detail: t.detail, selected, expected, mark: selected && expected ? "correct" as const : selected ? "incorrect" as const : expected ? "missed" as const : null };
  });
  const hits = results.filter(x => x.mark === "correct").length;
  return { ok: true, correct: hits, total: auth.key.correct.length, exact: hits === auth.key.correct.length && chosen.size === hits, results };
}
