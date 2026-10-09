// Phase 21A.2 — AI → FunctionGraphSpecV1, FAIL CLOSED. The model never writes a FunctionGraphSpec (and never a plotting-library option): it
// fills ONE small, flat, closed graph DESCRIPTOR inside a `functionGraph` rich block (strict provider schema) and code maps it — ids,
// axes and the provenance line are code-owned — before the ONE graph authority (validateFunctionGraphSpec, through validateRichContent)
// decides. MATHEMATICAL INTEGRITY: the AI may only draw what the teacher STATED. Every expression must be one the teacher wrote in the
// request — the right-hand side of "f(x) = …" / "y = …" or a standalone formula — compared after a notation-only normalization (spaces,
// × · for *, π for pi, superscript powers, Arabic-Indic digits, the implicit product of a number and a letter); a request that only
// DESCRIBES a function ("a quadratic with roots 1 and 3") is refused, never inferred. Viewport and domain numbers must occur in the request
// (all four viewport bounds null ⇒ the code default). Points, roots, extrema, asymptotes, intervals, roles and answer keys are never
// AI-authored. Without a policy (no teacher request at hand) or with visual content disabled, no AI graph is accepted.
import { validateFunctionGraphSpec, GRAPH_LIMITS, type FunctionGraphSpecV1 } from "../functionGraphs/functionGraphSpec";
import { cleanText, hasExactKeys, isArr, isNum, isStr, sArr, sNull, sNum, sObj, sStr, type JsonSchema } from "./composerSchemaKit";
import { numbersInText, type AiChartPolicy } from "./composerChart";
import type { ComposerIssue } from "./composerLimits";

/** Curves an AI graph may carry (the contract allows more; an AI-drawn stimulus stays small). */
export const AI_GRAPH_CURVES = 4;
export const AI_GRAPH_DEFAULT_VIEWPORT = Object.freeze({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 });
export const AI_GRAPH_SOURCE = "رسم الذكاء الاصطناعي لدالة كتبها المعلم في طلبه";
export function buildAiGraphSchema(): JsonSchema {
  return sObj({
    title: sStr(), description: sStr(), xMin: sNull(sNum()), xMax: sNull(sNum()), yMin: sNull(sNum()), yMax: sNull(sNum()),
    curves: sArr(sObj({ label: sStr(), expression: sStr(), domainMin: sNull(sNum()), domainMax: sNull(sNum()) }), AI_GRAPH_CURVES)
  });
}
const GRAPH_KEYS = ["title", "description", "xMin", "xMax", "yMin", "yMax", "curves"] as const;
const CURVE_KEYS = ["label", "expression", "domainMin", "domainMax"] as const;

const SUPERSCRIPT: Readonly<Record<string, string>> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
const FUNCTIONS = ["asin", "acos", "atan", "sin", "cos", "tan", "sqrt", "abs", "exp", "ln", "log10", "pow", "min", "max", "round", "floor", "ceil"];
const KNOWN_WORDS = new Set([...FUNCTIONS, "pi", "log"]);
/** Notation-only normalization shared by the request and the AI expression (it never changes which function is written). */
export function normalizeMathNotation(s: string): string {
  let t = String(s || "").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, m => "^" + [...m].map(c => SUPERSCRIPT[c]).join(""));
  t = t.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6f0)).normalize("NFKC");
  t = t.replace(/[−‒–—]/g, "-").replace(/[×·∙⋅]/g, "*").replace(/÷/g, "/").replace(/π/g, "pi").replace(/√\s*\(/g, "sqrt(").replace(/√\s*([A-Za-z0-9.]+)/g, "sqrt($1)");
  // a one-token argument written without parentheses ("sin x", "ln 2") is the same call as "sin(x)"
  t = t.replace(new RegExp("\\b(" + FUNCTIONS.join("|") + ")\\s+([A-Za-z]|\\d+(?:\\.\\d+)?)(?![A-Za-z0-9.(])", "g"), "$1($2)");
  t = t.replace(/\s+/g, "");
  return t.replace(/(\d)\*(?=[A-Za-z(])/g, "$1").replace(/\)\*\(/g, ")(");
}
const MATH_RUN = /[A-Za-z0-9٠-٩۰-۹.+\-−–*/^()=,;×·÷πθ√⁰¹²³⁴⁵⁶⁷⁸⁹\s]+/g;
const FUNCTION_HEAD = /^(?:[a-zA-Z]\(x\)|y)$/;
const isOperatorFormula = (t: string) => /[+\-*/^]|\b(?:sin|cos|tan|asin|acos|atan|sqrt|abs|exp|ln|log10|pow|min|max|round|floor|ceil)\(/.test(t) && !/^-?\d+(?:\.\d+)?$/.test(t);
/** The formulas a request STATES: the right-hand sides of "f(x) = …" / "y = …" (any formula, a constant included) and standalone runs that
 *  contain an operator or a function call (never a bare variable or number, never the right-hand side of "x = …"). Normalized. */
export function statedFormulas(request: string): Set<string> {
  const out = new Set<string>();
  for (const m of String(request || "").matchAll(MATH_RUN)) {
    // an ASCII word that is not a function / constant name ("plot", "and", "where") ends a formula, exactly like a separator
    const run = m[0].replace(/\b[A-Za-z]{2,}\b/g, w => (KNOWN_WORDS.has(w.toLowerCase()) ? w : ";"));
    for (const piece of run.split(/[;,]/)) {
      const sides = piece.split("=").map(normalizeMathNotation);
      for (let i = 0; i < sides.length; i++) {
        const t = sides[i];
        if (!t) continue;
        if (i > 0 && FUNCTION_HEAD.test(sides[i - 1])) out.add(t);
        else if (sides.length === 1 && isOperatorFormula(t)) out.add(t);
      }
    }
  }
  return out;
}
/** Every number written in a request, including multiples of π ("2π", "-π/2", "3*pi/4") and both signs of "±k". */
export function requestNumbers(request: string): number[] {
  const t = normalizeMathNotation(String(request || "").replace(/[^\S\r\n]+/g, " "));
  const nums = [...numbersInText(request)];
  for (const m of t.matchAll(/(-?)(\d+(?:\.\d+)?)?\*?pi(?:\/(\d+(?:\.\d+)?))?/g)) {
    const k = m[2] ? Number(m[2]) : 1, d = m[3] ? Number(m[3]) : 1;
    if (Number.isFinite(k) && Number.isFinite(d) && d !== 0) nums.push((m[1] === "-" ? -1 : 1) * k * Math.PI / d);
  }
  for (const m of String(request || "").matchAll(/±\s*(\d+(?:\.\d+)?)/g)) nums.push(Number(m[1]), -Number(m[1]));
  return nums;
}
const written = (v: number, nums: readonly number[]) => nums.some(n => Math.abs(n - v) <= 1e-9 * Math.max(1, Math.abs(v)));

type R = { ok: true; graph: FunctionGraphSpecV1 } | { ok: false; issues: ComposerIssue[] };
/** Maps one AI graph descriptor (block index `index` of its document) to a FunctionGraphSpecV1 — the graph authority still decides. */
export function mapAiGraph(raw: unknown, index: number, policy: AiChartPolicy | undefined, path: string): R {
  const fail = (code: string, message: string, p = path): R => ({ ok: false, issues: [{ code, message, path: p }] });
  if (!policy) return fail("AI_GRAPH_POLICY_MISSING", "لا يمكن قبول رسم دالة من الذكاء الاصطناعي دون طلب المعلم.");
  if (!policy.charts) return fail("AI_GRAPH_DISABLED", "ميزة الرسوم غير مفعّلة في طلب المعلم.");
  if (!hasExactKeys(raw, GRAPH_KEYS)) return fail("AI_GRAPH_MALFORMED", "وصف رسم الدالة غير صالح البنية.");
  if (!isStr(raw.title, GRAPH_LIMITS.titleChars) || !isStr(raw.description, GRAPH_LIMITS.descriptionChars)) return fail("AI_GRAPH_MALFORMED", "عنوان رسم الدالة أو وصفه خارج الحدود.");
  if (!isArr(raw.curves, AI_GRAPH_CURVES) || raw.curves.length === 0 || !raw.curves.every(c => hasExactKeys(c, CURVE_KEYS) && isStr(c.label, GRAPH_LIMITS.labelChars) && isStr(c.expression, 500, 1) && (c.domainMin === null || isNum(c.domainMin, -GRAPH_LIMITS.coordAbs, GRAPH_LIMITS.coordAbs)) && (c.domainMax === null || isNum(c.domainMax, -GRAPH_LIMITS.coordAbs, GRAPH_LIMITS.coordAbs))))
    return fail("AI_GRAPH_MALFORMED", "منحنيات رسم الدالة غير صالحة (من 1 إلى " + AI_GRAPH_CURVES + ").", path + ".curves");
  const stated = statedFormulas(policy.request), nums = requestNumbers(policy.request);
  const curves = raw.curves as { label: string; expression: string; domainMin: number | null; domainMax: number | null }[];
  for (let i = 0; i < curves.length; i++) {
    const c = curves[i], at = path + ".curves[" + i + "]";
    if (!stated.has(normalizeMathNotation(c.expression))) return fail("AI_GRAPH_EXPRESSION_NOT_STATED", "التعبير «" + c.expression.slice(0, 60) + "» لم يكتبه المعلم صراحةً في طلبه؛ لا يُخمَّن تعبير دالة.", at + ".expression");
    for (const k of ["domainMin", "domainMax"] as const) if (c[k] !== null && !written(c[k] as number, nums)) return fail("AI_GRAPH_NUMBER_NOT_STATED", "حد مجال لم يكتبه المعلم في طلبه.", at + "." + k);
  }
  const vp = [raw.xMin, raw.xMax, raw.yMin, raw.yMax];
  let viewport: FunctionGraphSpecV1["viewport"];
  if (vp.every(v => v === null)) viewport = { ...AI_GRAPH_DEFAULT_VIEWPORT };
  else if (vp.every(v => isNum(v, -GRAPH_LIMITS.coordAbs, GRAPH_LIMITS.coordAbs))) {
    const bad = (["xMin", "xMax", "yMin", "yMax"] as const).find(k => !written(raw[k] as number, nums));
    if (bad) return fail("AI_GRAPH_NUMBER_NOT_STATED", "حد نافذة العرض لم يكتبه المعلم في طلبه؛ اترك الحدود الأربعة فارغة (null) لاستخدام النافذة الافتراضية.", path + "." + bad);
    viewport = { xMin: raw.xMin as number, xMax: raw.xMax as number, yMin: raw.yMin as number, yMax: raw.yMax as number };
  } else return fail("AI_GRAPH_MALFORMED", "حدود نافذة العرض: إمّا الأربعة أرقامًا كتبها المعلم وإمّا الأربعة null.", path + ".xMin");
  const graph: FunctionGraphSpecV1 = {
    version: 1, id: "graph" + (index + 1), title: cleanText(raw.title as string), description: cleanText(raw.description as string), source: AI_GRAPH_SOURCE,
    viewport, axes: { x: { label: "x", grid: true }, y: { label: "y", grid: true } },
    curves: curves.map((c, i) => {
      const label = cleanText(c.label);
      const domain = { ...(c.domainMin !== null ? { min: c.domainMin } : {}), ...(c.domainMax !== null ? { max: c.domainMax } : {}) };
      return { id: "c" + (i + 1), kind: "explicit" as const, ...(label ? { label } : {}), expression: c.expression, ...(Object.keys(domain).length ? { domain } : {}) };
    })
  };
  const v = validateFunctionGraphSpec(graph, path);
  if (!v.ok) return { ok: false, issues: v.issues.map(i => ({ code: "AI_GRAPH_INVALID", message: i.message + " [" + i.code + "]", path: i.path })) };
  return { ok: true, graph: v.value };
}
