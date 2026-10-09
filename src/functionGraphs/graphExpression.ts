// Phase 21A.2 — the function-graph expression layer. There is ONE expression language in ExamBank: the safe parametric engine
// (src/parametricEngine.ts — closed tokenizer, bounded recursive-descent parser, AST, bounded evaluator). Graphs use its language 3
// (language 2 + sin cos tan asin acos atan ln, the constants pi and e; `log` refused as ambiguous) and add only what plotting needs: the
// variable rule (x for y = f(x), t for parametric curves, plus the graph's declared parameters), a reader for teachers (Arabic messages,
// an explicit-multiplication hint) and a point evaluator that turns every refused evaluation (domain, division by zero, |value| > 1e15,
// an exponent beyond ±64, a fractional power of a negative base) into NaN — "undefined here", never a number. Pure: shared server build.
// No eval, no Function constructor, no dynamic code: evaluation walks the parsed AST.
import { parseExpression, evaluateExpression, isReservedParametricIdV3, PARAMETRIC_LIMITS, type ExprNode } from "../parametricExpression";

export type GraphVariable = "x" | "t";
export type CompiledGraphExpression = { ast: ExprNode; refs: string[] };
export type GraphExpressionResult = { ok: true; value: CompiledGraphExpression } | { ok: false; code: string; message: string };

/** Parameter identifiers: a lowercase ASCII letter then up to 7 lowercase letters / digits; never x, t, a function, a constant or `log`. */
const PARAM_RE = /^[a-z][a-z0-9]{0,7}$/;
export const isGraphParameterId = (v: unknown): v is string => typeof v === "string" && PARAM_RE.test(v) && v !== "x" && v !== "t" && !isReservedParametricIdV3(v);

const ENGINE_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  EXPR_EMPTY: "التعبير فارغ.",
  EXPR_TOO_LONG: "التعبير أطول من الحد المسموح (" + PARAMETRIC_LIMITS.expressionChars + " محرفًا).",
  EXPR_TOKEN_INVALID: "التعبير يحوي محرفًا أو رقمًا غير مسموح.",
  EXPR_TOO_MANY_TOKENS: "التعبير أطول من الحد المسموح.",
  EXPR_FORBIDDEN_IDENTIFIER: "اسم محجوز لا يُستخدم في التعبير.",
  EXPR_UNKNOWN_FUNCTION: "دالة غير معروفة؛ المسموح: sin cos tan asin acos atan sqrt abs exp ln log10 pow min max round floor ceil.",
  EXPR_AMBIGUOUS_LOG: "الدالة log ملتبسة: اكتب ln(x) للوغاريتم الطبيعي أو log10(x) للوغاريتم العشري.",
  EXPR_ARITY: "عدد وسائط الدالة غير صحيح.",
  EXPR_TOO_DEEP: "التعبير متداخل أكثر من الحد المسموح.",
  EXPR_TOO_COMPLEX: "التعبير أعقد من الحد المسموح.",
  EXPR_COMPARISON_NOT_ALLOWED: "التعبير لا يقبل المقارنة (< > =).",
  EXPR_SYNTAX: "صياغة التعبير غير صحيحة."
});
/** A teacher-facing message for an engine code (Arabic). A syntax error next to an implicit product ("4x", "2(x+1)", "3sin(x)") gets the hint. */
export function graphExpressionMessage(code: string, source?: unknown): string {
  const base = ENGINE_MESSAGES[code] ?? "التعبير غير صالح.";
  if (code === "EXPR_SYNTAX" && typeof source === "string" && /[0-9)]\s*[A-Za-z(]/.test(source)) return base + " اكتب الضرب صراحةً بالنجمة، مثل 4*x أو 2*(x+1).";
  return base;
}

/** Parses a graph expression (language 3) and enforces the variable rule: every identifier is `variable` or a declared parameter. */
export function compileGraphExpression(src: unknown, variable: GraphVariable, parameters: ReadonlySet<string>): GraphExpressionResult {
  const p = parseExpression(src, { language: 3 });
  if (!p.ok) return { ok: false, code: p.code, message: graphExpressionMessage(p.code, src) };
  for (const r of p.refs) {
    if (r === variable || parameters.has(r)) continue;
    const other = r === "x" || r === "t";
    return { ok: false, code: "GRAPH_EXPR_UNKNOWN_IDENTIFIER", message: other ? "هذا المنحنى يستخدم المتغير " + variable + " وحده، لا " + r + "." : "معرّف غير معروف في التعبير: " + r.slice(0, 32) + " (المسموح: " + variable + " والمعاملات المعرّفة)." };
  }
  return { ok: true, value: { ast: p.ast, refs: p.refs } };
}

/** f(v) for one compiled expression: the engine's bounded evaluator; any refusal is NaN (undefined at this value). One reused value map. */
export function graphEvaluator(ast: ExprNode, variable: GraphVariable, parameters: ReadonlyMap<string, number>): (v: number) => number {
  const values = new Map<string, number>(parameters);
  return (v: number) => {
    if (!Number.isFinite(v)) return NaN;
    values.set(variable, v);
    const r = evaluateExpression(ast, values);
    return r.ok ? r.value : NaN;
  };
}

/** Display form of an authored expression (never stored, never parsed): × for *, superscripts for small integer powers, π, √. LTR text. */
export function prettyGraphExpression(src: string): string {
  const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  return src
    .replace(/\^\s*([0-9])(?![0-9.])/g, (_m, d: string) => SUP[d])
    .replace(/\s*\*\s*/g, "·")
    .replace(/\bpi\b/g, "π")
    .replace(/\bsqrt\(/g, "√(")
    .replace(/\s*-\s*/g, " − ").replace(/\s*\+\s*/g, " + ")
    .replace(/^ − /, "−").replace(/\( − /g, "(−")
    .replace(/ {2,}/g, " ").trim();
}
