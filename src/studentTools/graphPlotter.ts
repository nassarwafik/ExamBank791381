// Phase T4 — the function plotter behind the `graphPlotter` student tool: student expressions → a FunctionGraphSpecV1 drawn by the
// existing owned SVG renderer (FunctionGraphView, Phase 21A.2).
//
// Pure, no React. The graph engine stays the authority: every expression is compiled by compileGraphExpression (expression language 3)
// and the whole spec is validated by validateFunctionGraphSpec before anything is drawn — this module only (1) rewrites the school
// notation the calculator accepts into the engine's strict language, (2) checks the window, and (3) turns the engine's own analysis
// (analyzeFunctionGraph) into labelled points when the teacher allowed it. Nothing here is stored or sent; the engine is not modified.

import { compileGraphExpression } from "../functionGraphs/graphExpression";
import { validateFunctionGraphSpec, compileGraphCurves, curveValue, GRAPH_LIMITS, type FunctionGraphSpecV1, type GraphViewportV1, type GraphPointV1, type GraphLineV1, type GraphPointRole } from "../functionGraphs/functionGraphSpec";
import { analyzeFunctionGraph, snapGraphValue, type GraphFeatureKind } from "../functionGraphs/graphAnalysis";

export const PLOT_NAMES = ["f", "g", "h"] as const;
export const DEFAULT_WINDOW: GraphViewportV1 = Object.freeze({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 });
export const MAX_EXPRESSION_LENGTH = 120;

/**
 * School notation → engine language 3, conservatively (each rule only inserts what is unambiguous):
 *   × · ÷ − → * * / -;  π → pi;  √( → sqrt(;  log( → log10( (school log, like the calculator);
 *   2x → 2*x, 2(x+1) → 2*(x+1), 2pi → 2*pi  (a number not inside a name: log10( is untouched);
 *   )( → )*(, )x → )*x, )2 → )*2;   x( → x*(  (x not inside a name: exp( is untouched).
 * Anything else is left for the engine to accept or refuse with its own message.
 */
export function normalizePlotExpression(src: string): string {
  let s = String(src).trim()
    .replace(/[×·]/g, "*").replace(/÷/g, "/").replace(/[−–]/g, "-").replace(/π/g, "pi")
    .replace(/√\s*\(/g, "sqrt(");
  s = s.replace(/(?<![A-Za-z_])log\s*\(/g, "log10(");
  s = s.replace(/(?<![A-Za-z_0-9.])(\d+(?:\.\d+)?)\s*(?=[A-Za-z(])/g, "$1*");
  s = s.replace(/\)\s*(?=[A-Za-z0-9(])/g, ")*");
  s = s.replace(/(?<![A-Za-z_])x\s*(?=\()/g, "x*");
  return s;
}

export type PlotWindowResult = { ok: true; value: GraphViewportV1 } | { ok: false; message: string };

/** The plotting window from the four text fields: finite numbers within the engine's range, min < max with a usable span. */
export function readPlotWindow(raw: { xMin: string; xMax: string; yMin: string; yMax: string }): PlotWindowResult {
  const vals: number[] = [];
  for (const k of ["xMin", "xMax", "yMin", "yMax"] as const) {
    const t = String(raw[k]).trim().replace(/[−–]/g, "-");
    if (!/^-?(\d+(\.\d+)?|\.\d+)$/.test(t)) return { ok: false, message: "حدود نافذة الرسم يجب أن تكون أرقامًا." };
    const v = Number(t);
    if (!Number.isFinite(v) || Math.abs(v) > GRAPH_LIMITS.coordAbs) return { ok: false, message: "حدود نافذة الرسم خارج المدى المسموح (±" + GRAPH_LIMITS.coordAbs + ")." };
    vals.push(v);
  }
  const [xMin, xMax, yMin, yMax] = vals;
  if (!(xMin < xMax) || !(yMin < yMax)) return { ok: false, message: "يجب أن تكون القيمة الصغرى أقل من الكبرى في نافذة الرسم." };
  if (xMax - xMin < GRAPH_LIMITS.minSpan * 1e3 || yMax - yMin < GRAPH_LIMITS.minSpan * 1e3) return { ok: false, message: "نافذة الرسم ضيقة جدًّا." };
  return { ok: true, value: { xMin, xMax, yMin, yMax } };
}

export type PlotBuild =
  | { ok: true; spec: FunctionGraphSpecV1; names: string[] }
  | { ok: false; errors: (string | null)[]; message?: string };

const ROLE: Partial<Record<GraphFeatureKind, GraphPointRole>> = { root: "root", yIntercept: "yIntercept", minimum: "minimum", maximum: "maximum", intersection: "intersection" };
const ROLE_LABEL: Partial<Record<GraphFeatureKind, string>> = { root: "جذر", yIntercept: "مقطع y", minimum: "قيمة صغرى", maximum: "قيمة عظمى", intersection: "تقاطع" };

export function formatPlotNumber(v: number): string {
  const s = snapGraphValue(v);
  if (Object.is(s, -0) || s === 0) return "0";
  return String(Number(s.toPrecision(6)));
}

/** Build and validate the spec for the non-empty expressions (at most `maxFunctions`). `errors[i]` is field i's message, or null. */
export function buildPlotSpec(expressions: readonly string[], view: GraphViewportV1, maxFunctions: number, analysis: boolean): PlotBuild {
  const fields = expressions.slice(0, Math.min(maxFunctions, PLOT_NAMES.length));
  const errors: (string | null)[] = fields.map(() => null);
  const curves: FunctionGraphSpecV1["curves"] = [];
  const names: string[] = [];
  fields.forEach((raw, i) => {
    if (!String(raw).trim()) return;
    if (String(raw).length > MAX_EXPRESSION_LENGTH) { errors[i] = "الدالة أطول من المسموح."; return; }
    const expression = normalizePlotExpression(raw);
    const c = compileGraphExpression(expression, "x", new Set());
    if (!c.ok) { errors[i] = c.message; return; }
    curves.push({ id: PLOT_NAMES[i], kind: "explicit", label: PLOT_NAMES[i] + "(x)", expression, style: { color: i + 1 } });
    names.push(PLOT_NAMES[i] + "(x)");
  });
  if (errors.some(e => e !== null)) return { ok: false, errors };
  if (!curves.length) return { ok: false, errors, message: "اكتب دالة واحدة على الأقل." };
  const base: FunctionGraphSpecV1 = {
    version: 1, id: "studentPlot", title: "رسم الدوال", description: "رسم دوال الطالب",
    viewport: { ...view }, axes: { x: { grid: true }, y: { grid: true } }, curves,
    interaction: { zoom: true, pan: true, trace: true }
  };
  const first = validateFunctionGraphSpec(base);
  if (!first.ok) return { ok: false, errors, message: first.issues[0]?.message ?? "تعذّر رسم الدوال." };
  if (!analysis) return { ok: true, spec: first.value, names };

  const points: GraphPointV1[] = [];
  const lines: GraphLineV1[] = [];
  for (const f of analyzeFunctionGraph(first.value)) {
    if (f.kind === "verticalAsymptote") {
      if (lines.length < GRAPH_LIMITS.lines && Math.abs(f.x) <= GRAPH_LIMITS.coordAbs && !lines.some(l => Math.abs(l.value - snapGraphValue(f.x)) < 1e-9)) lines.push({ id: "a" + lines.length, orientation: "vertical", value: snapGraphValue(f.x), role: "asymptote", label: "x = " + formatPlotNumber(f.x) });
      continue;
    }
    const role = ROLE[f.kind];
    if (!role || f.y === null || points.length >= GRAPH_LIMITS.points || Math.abs(f.x) > GRAPH_LIMITS.coordAbs || Math.abs(f.y) > GRAPH_LIMITS.coordAbs) continue;
    // The engine requires distinct labels: name the curve(s), and skip an exact repeat.
    const label = ROLE_LABEL[f.kind] + " " + f.curves.join(" و ") + " (" + formatPlotNumber(f.x) + "، " + formatPlotNumber(f.y) + ")";
    if (points.some(p => p.label === label)) continue;
    points.push({ id: "p" + points.length, x: snapGraphValue(f.x), y: snapGraphValue(f.y), role, label });
  }
  if (!points.length && !lines.length) return { ok: true, spec: first.value, names };
  const withAnalysis = validateFunctionGraphSpec({ ...first.value, ...(points.length ? { points } : {}), ...(lines.length ? { lines } : {}) });
  // The analysis only decorates: if the engine refuses the decorated spec, the plain (already valid) graph is drawn.
  return { ok: true, spec: withAnalysis.ok ? withAnalysis.value : first.value, names };
}

/** f(x), g(x), h(x) at one x — null where the function is undefined. */
export function plotValuesAt(spec: FunctionGraphSpecV1, x: number): { name: string; y: number | null }[] {
  const compiled = compileGraphCurves(spec);
  return spec.curves.map((c, i) => {
    const y = curveValue(compiled[i], x);
    return { name: (c.label ?? c.id), y: Number.isFinite(y) ? y : null };
  });
}
