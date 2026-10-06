// Phase 20A.2 — functionStudy2d@1: the PUBLIC configuration and the presentation sampler (pure; compiled into the shared server build).
//
// The authored function is parsed and evaluated ONLY by the repository's safe parametric engine (src/parametricEngine.ts, expression
// language 2: tokenizer → recursive-descent parser → bounded AST → bounded evaluator). There is no second expression evaluator, no
// JavaScript execution and no CAS: the only free identifier is the declared variable x, functions are the engine's closed list
// (abs, round, floor, ceil, min, max, sqrt, pow, log, log10, exp), and every evaluation is finite and bounded or an error.
// Sampling is deterministic PRESENTATION (a fixed grid; the path breaks at evaluation errors and at asymptote jumps) and never grading
// authority: the private checks (src/functionStudyPlugin.ts) are the analytical truth written by the teacher.
import { PARAMETRIC_LIMITS, evaluateExpression, parseExpression, type EvalResult, type ExprNode } from "./parametricEngine";
import { isPlainObject } from "./trustedSimVocabulary";

export const FUNCTION_STUDY_PLUGIN_KEY = "functionStudy2d";
export const FUNCTION_STUDY_PLUGIN_VERSION = 1;
export const FUNCTION_STUDY_CONFIG_VERSION = 1 as const;
export const FUNCTION_STUDY_LIMITS = Object.freeze({ sampleMin: 50, sampleMax: 2000, xAbsMax: 10000, yAbsMax: 1e6, sourceChars: PARAMETRIC_LIMITS.expressionChars, items: 20, valueAbsMax: 1e6, toleranceMax: 1000 });
/** The analysis task groups, in display order. A group the author switches off accepts no action and no check. */
export const FUNCTION_STUDY_TASKS = Object.freeze(["domainExclusions", "xIntercepts", "yIntercept", "verticalAsymptotes", "horizontalAsymptotes", "extrema", "monotonicIntervals"] as const);
export type FunctionStudyTask = (typeof FUNCTION_STUDY_TASKS)[number];
export type FunctionStudyExpression = { language: 2; variable: "x"; source: string };
export type FunctionStudyWindow = { xMin: number; xMax: number; yMin: number; yMax: number; sampleCount: number };
export type FunctionStudyConfigV1 = { v: 1; expression: FunctionStudyExpression; window: FunctionStudyWindow; tasks: Record<FunctionStudyTask, boolean> };
export type FunctionStudyIssue = { code: string; message: string; path?: string };
export type FunctionStudyConfigResult = { ok: true; config: FunctionStudyConfigV1 } | { ok: false; issues: FunctionStudyIssue[] };

const L = FUNCTION_STUDY_LIMITS;
const ROOT_KEYS = ["v", "expression", "window", "tasks"] as const;
const WINDOW_KEYS = ["xMin", "xMax", "yMin", "yMax", "sampleCount"] as const;
const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(o, k));
const finiteIn = (v: unknown, max: number): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= max;

// ── the safe expression (the parametric engine is the ONE authority) ──────────────────────────────────────────────────────────────
/** Parses f(x) with expression language 2; any identifier other than x is refused (FUNCSTUDY_VARIABLE_UNDECLARED). */
export function compileFunction(source: unknown): { ok: true; ast: ExprNode } | { ok: false; code: string } {
  if (typeof source !== "string" || !source.trim()) return { ok: false, code: "FUNCSTUDY_EXPRESSION_EMPTY" };
  const p = parseExpression(source, { language: 2 });
  if (!p.ok) return { ok: false, code: p.code };
  if (p.refs.some(r => r !== "x")) return { ok: false, code: "FUNCSTUDY_VARIABLE_UNDECLARED" };
  return { ok: true, ast: p.ast };
}
/** f(x) through the bounded evaluator: a value, or an error code (division by zero, domain, non-finite, out of range). */
export const evaluateFunctionAt = (ast: ExprNode, x: number): EvalResult => evaluateExpression(ast, new Map([["x", x]]));

// ── the strict public configuration ────────────────────────────────────────────────────────────────────────────────────────────────
export function validateFunctionStudyConfig(raw: unknown): FunctionStudyConfigResult {
  const issues: FunctionStudyIssue[] = [];
  const add = (code: string, message: string, path: string) => { issues.push({ code, message, path }); };
  if (!isPlainObject(raw)) return { ok: false, issues: [{ code: "FUNCSTUDY_CONFIG_INVALID", message: "إعداد دراسة الدالة مفقود أو غير صالح.", path: "smartSim.config" }] };
  for (const k of Object.keys(raw)) if (!(ROOT_KEYS as readonly string[]).includes(k)) add("FUNCSTUDY_CONFIG_UNKNOWN_KEY", "حقل غير مسموح في إعداد دراسة الدالة: " + k, "smartSim.config." + k);
  if (raw.v !== FUNCTION_STUDY_CONFIG_VERSION) add("FUNCSTUDY_CONFIG_VERSION_UNSUPPORTED", "إصدار إعداد دراسة الدالة غير مدعوم.", "smartSim.config.v");
  let expression: FunctionStudyExpression | undefined;
  const e = raw.expression;
  if (!isPlainObject(e) || !exactKeys(e, ["language", "variable", "source"]) || e.language !== 2 || e.variable !== "x" || typeof e.source !== "string" || e.source.length > L.sourceChars)
    add("FUNCSTUDY_EXPRESSION_INVALID", "الدالة يجب أن تُكتب بلغة التعابير الآمنة (الإصدار 2) بالمتغير x فقط، حتى " + L.sourceChars + " حرف.", "smartSim.config.expression");
  else {
    const c = compileFunction(e.source);
    if (!c.ok) add("FUNCSTUDY_EXPRESSION_INVALID", "تعذّر قراءة الدالة (" + c.code + "): استخدم x والأعداد و + − × ÷ ^ والدوال المسموحة فقط.", "smartSim.config.expression.source");
    else expression = { language: 2, variable: "x", source: e.source };
  }
  let win: FunctionStudyWindow | undefined;
  const w = raw.window;
  if (!isPlainObject(w) || !exactKeys(w, WINDOW_KEYS) || !finiteIn(w.xMin, L.xAbsMax) || !finiteIn(w.xMax, L.xAbsMax) || !finiteIn(w.yMin, L.yAbsMax) || !finiteIn(w.yMax, L.yAbsMax)
    || w.xMin >= w.xMax || w.yMin >= w.yMax || typeof w.sampleCount !== "number" || !Number.isInteger(w.sampleCount) || w.sampleCount < L.sampleMin || w.sampleCount > L.sampleMax)
    add("FUNCSTUDY_WINDOW_INVALID", "نافذة الرسم غير صالحة: xMin < xMax ضمن ±" + L.xAbsMax + "، yMin < yMax، وعدد العينات عدد صحيح من " + L.sampleMin + " إلى " + L.sampleMax + ".", "smartSim.config.window");
  else win = { xMin: w.xMin, xMax: w.xMax, yMin: w.yMin, yMax: w.yMax, sampleCount: w.sampleCount };
  let tasks: Record<FunctionStudyTask, boolean> | undefined;
  const t = raw.tasks;
  if (!isPlainObject(t) || !exactKeys(t, FUNCTION_STUDY_TASKS) || !FUNCTION_STUDY_TASKS.every(k => typeof t[k] === "boolean")) add("FUNCSTUDY_TASKS_INVALID", "مهام التحليل غير صالحة (مفاتيح محددة بقيم صح/خطأ).", "smartSim.config.tasks");
  else if (!FUNCTION_STUDY_TASKS.some(k => t[k] === true)) add("FUNCSTUDY_TASKS_EMPTY", "فعّل مهمة تحليل واحدة على الأقل.", "smartSim.config.tasks");
  else { const out = {} as Record<FunctionStudyTask, boolean>; for (const k of FUNCTION_STUDY_TASKS) out[k] = t[k] as boolean; tasks = out; }
  if (issues.length || !expression || !win || !tasks) return { ok: false, issues };
  return { ok: true, config: { v: FUNCTION_STUDY_CONFIG_VERSION, expression, window: win, tasks } };
}

// ── deterministic presentation sampling ───────────────────────────────────────────────────────────────────────────────────────────
export type FunctionSample = { x: number; y: number };
/**
 * Samples f on the fixed grid x_i = xMin + i·(xMax − xMin)/(n − 1) (exactly n evaluations, n ≤ 2000) and splits the polyline into
 * segments: at every evaluation error (a pole or a point outside the domain hit exactly) and at every ASYMPTOTE JUMP — a step larger than
 * the window height whose midpoint is not between its ends (or cannot be evaluated). Presentation only; never grading input.
 */
export function sampleFunction(config: FunctionStudyConfigV1): { segments: FunctionSample[][]; evaluated: number } {
  const c = compileFunction(config.expression.source);
  if (!c.ok) return { segments: [], evaluated: 0 };
  const { xMin, xMax, yMin, yMax, sampleCount } = config.window;
  const n = Math.max(L.sampleMin, Math.min(L.sampleMax, Math.floor(sampleCount)));
  const height = yMax - yMin;
  const segments: FunctionSample[][] = [];
  let current: FunctionSample[] = [];
  const flush = () => { if (current.length) segments.push(current); current = []; };
  for (let i = 0; i < n; i++) {
    const x = xMin + (i * (xMax - xMin)) / (n - 1);
    const r = evaluateFunctionAt(c.ast, x);
    if (!r.ok) { flush(); continue; }
    const prev = current.length ? current[current.length - 1] : undefined;
    if (prev && Math.abs(r.value - prev.y) > height) {
      const mid = evaluateFunctionAt(c.ast, (prev.x + x) / 2);
      const lo = Math.min(prev.y, r.value), hi = Math.max(prev.y, r.value);
      if (!mid.ok || mid.value < lo || mid.value > hi) flush();
    }
    current.push({ x, y: r.value });
  }
  flush();
  return { segments, evaluated: n };
}
