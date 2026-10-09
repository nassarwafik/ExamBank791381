// Phase 21A.2 — FunctionGraphSpecV1: ExamBank's OWN declarative, versioned mathematical function-graph contract. Pure (no React, no DOM,
// no I/O): compiled into the shared server build, so the Builder, the student runtime, the API (finalization, sanitizer, ingest, grading)
// and the AI intake run the SAME authority.
//
// It is NOT a plotting-library configuration: nothing here mirrors JSXGraph / D3 / Plotly / ECharts options, nothing is executable (no
// callbacks, no HTML, no eval / Function — expressions are DATA, parsed by the one safe engine, src/parametricEngine.ts language 3), and the
// renderer (an owned SVG adapter today) only ever sees this validated value. Every key comes from a closed allow-list (unknown keys are
// REFUSED, never dropped); every text is bounded prose (no markup, no control / bidi-override / invisible characters); every number is a
// finite JSON number within ±1e6; every identity is a stable id unique across the graph; every collection is bounded. Teacher-authored
// mathematics is the authority and is checked, never rewritten: a point said to lie ON a curve must lie on it, an authored tangent slope or
// derivative curve must agree with the curve numerically, a shaded region must lie over a continuous stretch. Validation never throws and
// returns the canonical rebuilt copy (fixed key order, a fresh object) or issues; expressions are stored exactly as authored.
import { CONTROL, RAW_HTML } from "../richContent/proseGuard";
import { BIDI_CONTROL, INVISIBLE_CONTROL, normLabel } from "../charts/chartSpec";
import { compileGraphExpression, graphEvaluator, isGraphParameterId, type GraphVariable } from "./graphExpression";
import { sampleExplicit, sampleParametric } from "./graphSampling";
import type { ExprNode } from "../parametricExpression";

export const FUNCTION_GRAPH_VERSION = 1 as const;
export const GRAPH_CURVE_KINDS = Object.freeze(["explicit", "piecewise", "parametric"] as const);
export type GraphCurveKind = (typeof GRAPH_CURVE_KINDS)[number];
export const GRAPH_LINE_STYLES = Object.freeze(["solid", "dashed", "dotted"] as const);
export type GraphLineStyle = (typeof GRAPH_LINE_STYLES)[number];
/** Authoring roles of a point. A role is TEACHER information (it shapes the editor and the teacher's non-visual description); the student
 *  projection of a selection question strips it, so a role never tells a student which point is the answer. */
export const GRAPH_POINT_ROLES = Object.freeze(["point", "root", "yIntercept", "intersection", "minimum", "maximum", "inflection", "hole", "tangency", "endpoint"] as const);
export type GraphPointRole = (typeof GRAPH_POINT_ROLES)[number];
export const GRAPH_LINE_ROLES = Object.freeze(["reference", "asymptote"] as const);
export type GraphLineRole = (typeof GRAPH_LINE_ROLES)[number];
export const GRAPH_TICK_STYLES = Object.freeze(["decimal", "pi"] as const);
export const GRAPH_TANGENT_KINDS = Object.freeze(["tangent", "normal"] as const);
export const GRAPH_LIMITS = Object.freeze({
  titleChars: 160, descriptionChars: 1000, sourceChars: 300, labelChars: 80, axisLabelChars: 40,
  curves: 8, pieces: 8, expressions: 16, parameters: 8, points: 40, lines: 12, tangents: 8, regions: 6, intervals: 8, onCurves: 8,
  coordAbs: 1e6, minSpan: 1e-6, maxTicks: 200, colors: 6, serializedBytes: 65536,
  /** a point lies on a curve when |f(x) − y| ≤ this fraction of the viewport height (≈ half a pixel at 500 px) */
  onCurveTolerance: 1e-3
});

export type GraphDomainV1 = { min?: number; max?: number; minClosed?: boolean; maxClosed?: boolean };
export type GraphStyleV1 = { line?: GraphLineStyle; color?: number };
export type GraphExplicitCurveV1 = { id: string; kind: "explicit"; label?: string; expression: string; domain?: GraphDomainV1; derivativeOf?: string; style?: GraphStyleV1 };
export type GraphPieceV1 = { expression: string; domain: GraphDomainV1 };
export type GraphPiecewiseCurveV1 = { id: string; kind: "piecewise"; label?: string; pieces: GraphPieceV1[]; style?: GraphStyleV1 };
export type GraphParametricCurveV1 = { id: string; kind: "parametric"; label?: string; x: string; y: string; t: { min: number; max: number }; style?: GraphStyleV1 };
export type GraphCurveV1 = GraphExplicitCurveV1 | GraphPiecewiseCurveV1 | GraphParametricCurveV1;
export type GraphAxisV1 = { label?: string; grid?: boolean; step?: number; ticks?: "decimal" | "pi" };
export type GraphViewportV1 = { xMin: number; xMax: number; yMin: number; yMax: number };
export type GraphParameterV1 = { id: string; value: number };
export type GraphPointV1 = { id: string; x: number; y: number; label?: string; role?: GraphPointRole; on?: string[]; open?: boolean };
export type GraphLineV1 = { id: string; orientation: "vertical" | "horizontal"; value: number; label?: string; role?: GraphLineRole; style?: GraphStyleV1 };
export type GraphTangentV1 = { id: string; curve: string; x: number; kind: "tangent" | "normal"; slope?: number; label?: string };
export type GraphRegionV1 = { id: string; curve: string; lower?: string; from: number; to: number; label?: string };
export type GraphIntervalV1 = { id: string; from: number; to: number; fromClosed?: boolean; toClosed?: boolean; label?: string };
export type GraphInteractionV1 = { zoom?: boolean; pan?: boolean; trace?: boolean; crosshair?: boolean };
export type FunctionGraphSpecV1 = {
  version: 1; id: string; title: string; description: string; source?: string;
  viewport: GraphViewportV1; axes?: { x?: GraphAxisV1; y?: GraphAxisV1 }; parameters?: GraphParameterV1[];
  curves: GraphCurveV1[]; points?: GraphPointV1[]; lines?: GraphLineV1[]; tangents?: GraphTangentV1[]; regions?: GraphRegionV1[]; intervals?: GraphIntervalV1[];
  interaction?: GraphInteractionV1;
};
export type GraphIssue = { code: string; message: string; severity: "error"; path: string };
export type GraphResult = { ok: true; value: FunctionGraphSpecV1; issues: [] } | { ok: false; issues: GraphIssue[] };

const TOP_KEYS = ["version", "id", "title", "description", "source", "viewport", "axes", "parameters", "curves", "points", "lines", "tangents", "regions", "intervals", "interaction"] as const;
const CURVE_KEYS: Readonly<Record<GraphCurveKind, readonly string[]>> = Object.freeze({
  explicit: ["id", "kind", "label", "expression", "domain", "derivativeOf", "style"],
  piecewise: ["id", "kind", "label", "pieces", "style"],
  parametric: ["id", "kind", "label", "x", "y", "t", "style"]
});
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
/** The graph / object id rule (the same rule as ChartSpecV1 ids): ASCII letter first, then letters / digits / _ / -, at most 32. */
export const isGraphId = (v: unknown): v is string => typeof v === "string" && ID_RE.test(v) && !FORBIDDEN_KEYS.has(v);
const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const own = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
function utf8Bytes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1; else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; } else n += 3;
  }
  return n;
}

/** A compiled curve: the evaluators the validator, the renderer and the analysis share (built from a VALIDATED spec only). */
export type CompiledPiece = { f: (x: number) => number; domain: Required<GraphDomainV1>; cost: number };
/** `cost` = AST nodes evaluated per sample (the renderer divides its global work budget by it). */
export type CompiledCurve =
  | { id: string; kind: "explicit"; f: (x: number) => number; domain: Required<GraphDomainV1>; cost: number }
  | { id: string; kind: "piecewise"; pieces: CompiledPiece[]; cost: number }
  | { id: string; kind: "parametric"; fx: (t: number) => number; fy: (t: number) => number; t: { min: number; max: number }; cost: number };
const astNodes = (n: ExprNode): number => n.t === "num" || n.t === "var" ? 1 : n.t === "neg" ? 1 + astNodes(n.a) : n.t === "bin" ? 1 + astNodes(n.a) + astNodes(n.b) : 1 + n.args.reduce((a, x) => a + astNodes(x), 0);
const fullDomain = (d: GraphDomainV1 | undefined): Required<GraphDomainV1> =>
  ({ min: d?.min ?? -Infinity, max: d?.max ?? Infinity, minClosed: d?.minClosed ?? true, maxClosed: d?.maxClosed ?? true });
const inDomain = (x: number, d: Required<GraphDomainV1>) => (x > d.min || (x === d.min && d.minClosed)) && (x < d.max || (x === d.max && d.maxClosed));
/** The value of an explicit / piecewise curve at x (NaN when undefined there or outside every piece's domain). */
export function curveValue(c: CompiledCurve, x: number): number {
  if (c.kind === "explicit") return inDomain(x, c.domain) ? c.f(x) : NaN;
  if (c.kind === "piecewise") { for (const p of c.pieces) if (inDomain(x, p.domain)) return p.f(x); return NaN; }
  return NaN;
}

/** Compiles the curves of a VALIDATED graph (the expressions parse by construction; a defensive failure yields an always-undefined curve). */
export function compileGraphCurves(g: FunctionGraphSpecV1): CompiledCurve[] {
  const params = new Map((g.parameters ?? []).map(p => [p.id, p.value] as [string, number]));
  const names = new Set(params.keys());
  const fn = (src: string, v: GraphVariable): [(s: number) => number, number] => {
    const c = compileGraphExpression(src, v, names);
    return c.ok ? [graphEvaluator(c.value.ast, v, params), astNodes(c.value.ast)] : [() => NaN, 1];
  };
  return g.curves.map((c): CompiledCurve => {
    if (c.kind === "explicit") { const [f, cost] = fn(c.expression, "x"); return { id: c.id, kind: "explicit", f, domain: fullDomain(c.domain), cost }; }
    if (c.kind === "piecewise") {
      const pieces = c.pieces.map(p => { const [f, cost] = fn(p.expression, "x"); return { f, domain: fullDomain(p.domain), cost }; });
      return { id: c.id, kind: "piecewise", pieces, cost: Math.max(1, ...pieces.map(p => p.cost)) };
    }
    const [fx, cx] = fn(c.x, "t"), [fy, cy] = fn(c.y, "t");
    return { id: c.id, kind: "parametric", fx, fy, t: { min: c.t.min, max: c.t.max }, cost: cx + cy };
  });
}

/** Central-difference derivative with one Richardson step. `smooth` requires the curve to be defined at x, the two step sizes to agree,
 *  and the one-sided slopes to converge (their gap shrinks with the step — a kink such as |x| at 0 keeps a constant gap, a pole or a jump
 *  an undefined or exploding one), so a symmetric kink is never mistaken for a horizontal tangent. */
export function numericDerivative(f: (x: number) => number, x: number): { value: number; smooth: boolean } {
  const h = 1e-4 * Math.max(1, Math.abs(x));
  const f0 = f(x);
  const fp = [f(x + h), f(x - h), f(x + h / 2), f(x - h / 2)];
  if (!Number.isFinite(f0) || !fp.every(Number.isFinite)) return { value: NaN, smooth: false };
  const d1 = (fp[0] - fp[1]) / (2 * h), d2 = (fp[2] - fp[3]) / h;
  const r = (4 * d2 - d1) / 3;
  const gap1 = (fp[0] - f0) / h - (f0 - fp[1]) / h, gap2 = (fp[2] - f0) / (h / 2) - (f0 - fp[3]) / (h / 2);
  const smooth = Math.abs(d1 - d2) <= 1e-4 * (1 + Math.abs(r)) && Math.abs(gap2) <= 0.75 * Math.abs(gap1) + 1e-6 * (1 + Math.abs(r));
  return { value: r, smooth };
}

/** Strict validation of a FunctionGraphSpecV1. Never throws (an unforeseen failure is a refusal); the canonical copy only when issue-free. */
export function validateFunctionGraphSpec(raw: unknown, path = "graph"): GraphResult {
  try { return validateUnguarded(raw, path); }
  catch { return { ok: false, issues: [{ code: "GRAPH_INVALID", message: "رسم الدالة غير صالح البنية.", severity: "error", path }] }; }
}

function validateUnguarded(raw: unknown, path: string): GraphResult {
  const L = GRAPH_LIMITS;
  const issues: GraphIssue[] = [];
  const add = (code: string, message: string, at: string) => { if (issues.length < 50) issues.push({ code, message, severity: "error", path: at }); };
  const keysOk = (o: Record<string, unknown>, allowed: readonly string[], at: string): boolean => {
    let ok = true;
    for (const k of Object.keys(o)) if (FORBIDDEN_KEYS.has(k) || !allowed.includes(k)) { add("GRAPH_UNKNOWN_KEY", "حقل غير معروف في رسم الدالة: " + k.slice(0, 40), at + "." + k.slice(0, 40)); ok = false; }
    return ok;
  };
  const text = (v: unknown, at: string, max: number, required: boolean): string | undefined => {
    if (typeof v !== "string") { add("GRAPH_TEXT_INVALID", "نص غير صالح في رسم الدالة.", at); return undefined; }
    if (required && v.trim() === "") { add("GRAPH_TEXT_EMPTY", "نص مطلوب فارغ في رسم الدالة.", at); return undefined; }
    if (v.length > max) { add("GRAPH_LIMIT", "نص أطول من الحد المسموح في رسم الدالة (" + max + ").", at); return undefined; }
    if (CONTROL.test(v) || BIDI_CONTROL.test(v) || INVISIBLE_CONTROL.test(v)) { add("GRAPH_TEXT_CONTROL", "محارف تحكم أو محارف خفية غير مسموحة في نص رسم الدالة.", at); return undefined; }
    if (RAW_HTML.test(v)) { add("GRAPH_TEXT_MARKUP", "نص رسم الدالة لا يقبل وسوم HTML أو روابط script.", at); return undefined; }
    return v;
  };
  const optText = (o: Record<string, unknown>, k: string, at: string, max: number, out: Record<string, unknown>) => {
    if (!own(o, k)) return;
    const v = text(o[k], at + "." + k, max, true);
    if (v !== undefined) out[k] = v;
  };
  const num = (v: unknown, at: string): number | undefined => {
    if (typeof v !== "number" || !Number.isFinite(v)) { add("GRAPH_NUMBER_INVALID", "القيمة يجب أن تكون رقمًا محدودًا (لا نص ولا NaN ولا لانهاية).", at); return undefined; }
    if (Math.abs(v) > L.coordAbs) { add("GRAPH_NUMBER_RANGE", "القيمة خارج المدى المسموح (±" + L.coordAbs + ").", at); return undefined; }
    return v === 0 ? 0 : v;
  };
  const bool = (o: Record<string, unknown>, k: string, at: string, out: Record<string, unknown>) => {
    if (!own(o, k)) return;
    if (typeof o[k] !== "boolean") { add("GRAPH_FLAG_INVALID", "قيمة منطقية غير صالحة.", at + "." + k); return; }
    out[k] = o[k];
  };
  const enumOf = <T extends string>(v: unknown, allowed: readonly T[], at: string, what: string): T | undefined => {
    if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T;
    add("GRAPH_ENUM_INVALID", what + " غير معروف.", at);
    return undefined;
  };
  const list = (v: unknown, at: string, max: number, min = 0): unknown[] | undefined => {
    if (!Array.isArray(v)) { add("GRAPH_LIST_INVALID", "قائمة غير صالحة في رسم الدالة.", at); return undefined; }
    if (v.length < min) { add("GRAPH_LIST_EMPTY", "القائمة تحتاج " + min + " عنصرًا على الأقل.", at); return undefined; }
    if (v.length > max) { add("GRAPH_LIMIT", "عدد العناصر أكبر من الحد المسموح (" + max + ").", at); return undefined; }
    return v;
  };

  if (!isPlain(raw)) return { ok: false, issues: [{ code: "GRAPH_INVALID", message: "رسم الدالة يجب أن يكون كائنًا.", severity: "error", path }] };
  // size first: a hostile document is refused before any expression is parsed or evaluated
  let size = 0;
  try { size = utf8Bytes(JSON.stringify(raw)); } catch { size = Infinity; }
  if (size > L.serializedBytes) return { ok: false, issues: [{ code: "GRAPH_TOO_LARGE", message: "رسم الدالة أكبر من الحد المسموح (" + L.serializedBytes + " بايت).", severity: "error", path }] };
  if (!keysOk(raw, TOP_KEYS, path)) return { ok: false, issues };
  if (raw.version !== FUNCTION_GRAPH_VERSION) { add("GRAPH_VERSION_UNSUPPORTED", "إصدار رسم الدالة غير مدعوم.", path + ".version"); return { ok: false, issues }; }
  const out: Record<string, unknown> = { version: 1 };
  if (!isGraphId(raw.id)) add("GRAPH_ID_INVALID", "معرّف رسم الدالة غير صالح.", path + ".id"); else out.id = raw.id;
  const title = text(raw.title, path + ".title", L.titleChars, true); if (title !== undefined) out.title = title;
  const description = text(raw.description, path + ".description", L.descriptionChars, true); if (description !== undefined) out.description = description;
  optText(raw, "source", path, L.sourceChars, out);

  // viewport
  let vp: GraphViewportV1 | undefined;
  if (!isPlain(raw.viewport) || !keysOk(raw.viewport, ["xMin", "xMax", "yMin", "yMax"], path + ".viewport")) { if (!isPlain(raw.viewport)) add("GRAPH_VIEWPORT_INVALID", "نافذة العرض مطلوبة: xMin و xMax و yMin و yMax.", path + ".viewport"); }
  else {
    const v = raw.viewport, at = path + ".viewport";
    const xMin = num(v.xMin, at + ".xMin"), xMax = num(v.xMax, at + ".xMax"), yMin = num(v.yMin, at + ".yMin"), yMax = num(v.yMax, at + ".yMax");
    if (xMin !== undefined && xMax !== undefined && yMin !== undefined && yMax !== undefined) {
      if (!(xMax - xMin >= L.minSpan) || !(yMax - yMin >= L.minSpan)) add("GRAPH_VIEWPORT_INVALID", "نافذة العرض غير صالحة: يجب أن يكون xMin < xMax و yMin < yMax.", at);
      else { vp = { xMin, xMax, yMin, yMax }; out.viewport = vp; }
    }
  }
  const xSpan = vp ? vp.xMax - vp.xMin : 1, ySpan = vp ? vp.yMax - vp.yMin : 1;

  // axes
  if (own(raw, "axes")) {
    const at = path + ".axes";
    if (!isPlain(raw.axes)) add("GRAPH_AXES_INVALID", "إعدادات المحاور غير صالحة.", at);
    else if (keysOk(raw.axes, ["x", "y"], at)) {
      const axes: Record<string, unknown> = {};
      for (const k of ["x", "y"] as const) {
        if (!own(raw.axes, k)) continue;
        const a = raw.axes[k], aat = at + "." + k;
        if (!isPlain(a)) { add("GRAPH_AXES_INVALID", "إعدادات المحور غير صالحة.", aat); continue; }
        if (!keysOk(a, ["label", "grid", "step", "ticks"], aat)) continue;
        const ax: Record<string, unknown> = {};
        optText(a, "label", aat, L.axisLabelChars, ax);
        bool(a, "grid", aat, ax);
        if (own(a, "step")) {
          const s = num(a.step, aat + ".step");
          const span = k === "x" ? xSpan : ySpan;
          if (s !== undefined) { if (!(s > 0) || span / s > L.maxTicks) add("GRAPH_AXIS_STEP", "خطوة التدريج يجب أن تكون موجبة وألا تتجاوز " + L.maxTicks + " علامة في النافذة.", aat + ".step"); else ax.step = s; }
        }
        if (own(a, "ticks")) { const t = enumOf(a.ticks, GRAPH_TICK_STYLES, aat + ".ticks", "نمط التدريج"); if (t) ax.ticks = t; }
        axes[k] = ax;
      }
      out.axes = axes;
    }
  }

  // parameters (named constants of the expressions)
  const params = new Map<string, number>();
  if (own(raw, "parameters")) {
    const at = path + ".parameters";
    const arr = list(raw.parameters, at, L.parameters);
    if (arr) {
      const ps: GraphParameterV1[] = [];
      arr.forEach((p, i) => {
        const pat = at + "[" + i + "]";
        if (!isPlain(p) || !keysOk(p, ["id", "value"], pat)) { if (!isPlain(p)) add("GRAPH_PARAMETER_INVALID", "معامل غير صالح.", pat); return; }
        if (!isGraphParameterId(p.id)) { add("GRAPH_PARAMETER_ID", "اسم المعامل غير صالح (حرف إنجليزي صغير ثم حتى 7 أحرف أو أرقام؛ ليس x أو t أو اسم دالة أو ثابت).", pat + ".id"); return; }
        if (params.has(p.id)) { add("GRAPH_DUPLICATE_ID", "المعامل «" + p.id + "» مكرر.", pat + ".id"); return; }
        const v = num(p.value, pat + ".value");
        if (v === undefined) return;
        params.set(p.id, v); ps.push({ id: p.id, value: v });
      });
      out.parameters = ps;
    }
  }
  const paramNames = new Set(params.keys());

  // object ids share ONE namespace (curve / point / line / tangent / region / interval)
  const ids = new Set<string>();
  const idOf = (o: Record<string, unknown>, at: string): string | undefined => {
    if (!isGraphId(o.id)) { add("GRAPH_ID_INVALID", "معرّف غير صالح (حرف إنجليزي أولًا ثم أحرف أو أرقام أو _ أو -، حتى 32).", at + ".id"); return undefined; }
    if (ids.has(o.id)) { add("GRAPH_DUPLICATE_ID", "المعرّف «" + o.id + "» مكرر في الرسم.", at + ".id"); return undefined; }
    ids.add(o.id);
    return o.id;
  };
  const labels = new Map<string, string>();
  const label = (o: Record<string, unknown>, at: string, dest: Record<string, unknown>) => {
    if (!own(o, "label")) return;
    const v = text(o.label, at + ".label", L.labelChars, true);
    if (v === undefined) return;
    const n = normLabel(v);
    if (labels.has(n)) { add("GRAPH_DUPLICATE_LABEL", "التسمية «" + v.slice(0, 40) + "» مكررة في الرسم (تسميات العناصر يجب أن تميّزها).", at + ".label"); return; }
    labels.set(n, v); dest.label = v;
  };
  const style = (o: Record<string, unknown>, at: string, dest: Record<string, unknown>) => {
    if (!own(o, "style")) return;
    const s = o.style, sat = at + ".style";
    if (!isPlain(s) || !keysOk(s, ["line", "color"], sat)) { if (!isPlain(s)) add("GRAPH_STYLE_INVALID", "نمط غير صالح.", sat); return; }
    const st: Record<string, unknown> = {};
    if (own(s, "line")) { const l = enumOf(s.line, GRAPH_LINE_STYLES, sat + ".line", "نمط الخط"); if (l) st.line = l; }
    if (own(s, "color")) { if (typeof s.color !== "number" || !Number.isInteger(s.color) || s.color < 1 || s.color > L.colors) add("GRAPH_STYLE_INVALID", "رقم اللون يجب أن يكون من 1 إلى " + L.colors + ".", sat + ".color"); else st.color = s.color; }
    dest.style = st;
  };
  let expressions = 0;
  const expression = (v: unknown, variable: GraphVariable, at: string): { src: string; ast: ExprNode } | undefined => {
    if (++expressions > L.expressions) { add("GRAPH_LIMIT", "عدد التعابير في الرسم أكبر من الحد المسموح (" + L.expressions + ").", at); return undefined; }
    if (typeof v !== "string") { add("GRAPH_EXPRESSION_INVALID", "التعبير يجب أن يكون نصًا.", at); return undefined; }
    if (CONTROL.test(v) || BIDI_CONTROL.test(v) || INVISIBLE_CONTROL.test(v)) { add("GRAPH_TEXT_CONTROL", "محارف تحكم أو محارف خفية غير مسموحة في التعبير.", at); return undefined; }
    const c = compileGraphExpression(v, variable, paramNames);
    if (!c.ok) { add("GRAPH_EXPRESSION_INVALID", c.message + " [" + c.code + "]", at); return undefined; }
    return { src: v, ast: c.value.ast };
  };
  const domain = (v: unknown, at: string, requireBound: boolean): GraphDomainV1 | undefined => {
    if (!isPlain(v) || !keysOk(v, ["min", "max", "minClosed", "maxClosed"], at)) { if (!isPlain(v)) add("GRAPH_DOMAIN_INVALID", "المجال غير صالح.", at); return undefined; }
    const d: Record<string, unknown> = {};
    let min: number | undefined, max: number | undefined, bad = false;
    if (own(v, "min")) { min = num(v.min, at + ".min"); if (min === undefined) bad = true; else d.min = min; }
    if (own(v, "max")) { max = num(v.max, at + ".max"); if (max === undefined) bad = true; else d.max = max; }
    for (const k of ["minClosed", "maxClosed"] as const) {
      if (!own(v, k)) continue;
      if (typeof v[k] !== "boolean") { add("GRAPH_FLAG_INVALID", "قيمة منطقية غير صالحة.", at + "." + k); bad = true; continue; }
      if ((k === "minClosed" && min === undefined) || (k === "maxClosed" && max === undefined)) { add("GRAPH_DOMAIN_INVALID", "لا معنى لطرف مغلق أو مفتوح بلا حد.", at + "." + k); bad = true; continue; }
      d[k] = v[k];
    }
    if (bad) return undefined;
    if (requireBound && min === undefined && max === undefined) { add("GRAPH_DOMAIN_INVALID", "مجال القطعة يحتاج حدًا واحدًا على الأقل.", at); return undefined; }
    if (min !== undefined && max !== undefined && !(max > min)) { add("GRAPH_DOMAIN_INVALID", "حد المجال الأدنى يجب أن يكون أصغر من الأعلى.", at); return undefined; }
    return d as GraphDomainV1;
  };

  // curves
  type Built = { id: string; kind: GraphCurveKind; derivativeOf?: string; at: string };
  const built: Built[] = [];
  const curveOut: Record<string, unknown>[] = [];
  const curveArr = list(raw.curves, path + ".curves", L.curves, 1);
  if (curveArr) curveArr.forEach((c, i) => {
    const at = path + ".curves[" + i + "]";
    if (!isPlain(c)) { add("GRAPH_CURVE_INVALID", "منحنى غير صالح.", at); return; }
    const kind = enumOf(c.kind, GRAPH_CURVE_KINDS, at + ".kind", "نوع المنحنى");
    if (!kind || !keysOk(c, CURVE_KEYS[kind], at)) return;
    const id = idOf(c, at);
    const co: Record<string, unknown> = { id, kind };
    label(c, at, co);
    let ok = id !== undefined;
    if (kind === "explicit") {
      const e = expression(c.expression, "x", at + ".expression"); if (e) co.expression = e.src; else ok = false;
      if (own(c, "domain")) { const d = domain(c.domain, at + ".domain", false); if (d) co.domain = d; else ok = false; }
      if (own(c, "derivativeOf")) { if (!isGraphId(c.derivativeOf)) { add("GRAPH_REFERENCE_INVALID", "مرجع المشتقة غير صالح.", at + ".derivativeOf"); ok = false; } else co.derivativeOf = c.derivativeOf; }
    } else if (kind === "piecewise") {
      const pieces = list(c.pieces, at + ".pieces", L.pieces, 1);
      if (!pieces) ok = false;
      else {
        const ps: Record<string, unknown>[] = [];
        pieces.forEach((p, j) => {
          const pat = at + ".pieces[" + j + "]";
          if (!isPlain(p) || !keysOk(p, ["expression", "domain"], pat)) { if (!isPlain(p)) add("GRAPH_PIECE_INVALID", "قطعة غير صالحة.", pat); ok = false; return; }
          const e = expression(p.expression, "x", pat + ".expression");
          const d = domain(p.domain, pat + ".domain", pieces.length > 1);
          if (!e || !d) { ok = false; return; }
          ps.push({ expression: e.src, domain: d });
        });
        if (ok) {
          // pieces may leave gaps but never overlap; a shared boundary belongs to at most one piece
          const sorted = ps.map((p, j) => ({ j, d: fullDomain(p.domain as GraphDomainV1) })).sort((a, b) => a.d.min - b.d.min || a.d.max - b.d.max);
          for (let k = 1; k < sorted.length; k++) {
            const a = sorted[k - 1].d, b = sorted[k].d;
            if (b.min < a.max || (b.min === a.max && a.maxClosed && b.minClosed)) { add("GRAPH_PIECEWISE_OVERLAP", "مجالا القطعتين يتداخلان (أو تشتركان في نقطة مغلقة في الطرفين).", at + ".pieces[" + sorted[k].j + "].domain"); ok = false; break; }
          }
          co.pieces = ps;
        }
      }
    } else {
      const ex = expression(c.x, "t", at + ".x"), ey = expression(c.y, "t", at + ".y");
      if (ex) co.x = ex.src; else ok = false;
      if (ey) co.y = ey.src; else ok = false;
      const t = c.t, tat = at + ".t";
      if (!isPlain(t) || !keysOk(t, ["min", "max"], tat)) { if (!isPlain(t)) add("GRAPH_PARAMETER_RANGE", "مدى t مطلوب: min و max.", tat); ok = false; }
      else {
        const mn = num(t.min, tat + ".min"), mx = num(t.max, tat + ".max");
        if (mn === undefined || mx === undefined) ok = false;
        else if (!(mx > mn)) { add("GRAPH_PARAMETER_RANGE", "مدى t غير صالح: يجب أن يكون min < max.", tat); ok = false; }
        else co.t = { min: mn, max: mx };
      }
    }
    style(c, at, co);
    curveOut.push(co);
    if (ok && id !== undefined) built.push({ id, kind, derivativeOf: co.derivativeOf as string | undefined, at });
  });
  out.curves = curveOut;
  const curveKind = new Map(built.map(b => [b.id, b.kind] as [string, GraphCurveKind]));
  for (const b of built) if (b.derivativeOf !== undefined && (b.derivativeOf === b.id || curveKind.get(b.derivativeOf) !== "explicit")) add("GRAPH_REFERENCE_INVALID", "المشتقة تشير إلى منحنى صريح آخر في الرسم.", b.at + ".derivativeOf");

  // overlays (structure first; the mathematical checks run below on the compiled curves)
  const pointsOut: Record<string, unknown>[] = [], linesOut: Record<string, unknown>[] = [], tangentsOut: Record<string, unknown>[] = [], regionsOut: Record<string, unknown>[] = [], intervalsOut: Record<string, unknown>[] = [];
  const inX = (v: number) => !vp || (v >= vp.xMin && v <= vp.xMax), inY = (v: number) => !vp || (v >= vp.yMin && v <= vp.yMax);
  const curveRef = (v: unknown, at: string, kinds: readonly GraphCurveKind[]): string | undefined => {
    if (!isGraphId(v) || !curveKind.has(v)) { add("GRAPH_REFERENCE_INVALID", "مرجع إلى منحنى غير موجود في الرسم.", at); return undefined; }
    if (!kinds.includes(curveKind.get(v)!)) { add("GRAPH_REFERENCE_INVALID", "هذا العنصر يحتاج منحنى من نوع " + kinds.join(" / ") + ".", at); return undefined; }
    return v;
  };
  const overlay = (key: "points" | "lines" | "tangents" | "regions" | "intervals", max: number, each: (o: Record<string, unknown>, at: string) => Record<string, unknown> | undefined, dest: Record<string, unknown>[], allowed: readonly string[]) => {
    if (!own(raw, key)) return;
    const arr = list(raw[key], path + "." + key, max);
    if (arr) arr.forEach((o, i) => {
      const at = path + "." + key + "[" + i + "]";
      if (!isPlain(o)) { add("GRAPH_OVERLAY_INVALID", "عنصر غير صالح في الرسم.", at); return; }
      if (!keysOk(o, allowed, at)) return;
      const r = each(o, at);
      if (r) dest.push(r);
    });
    out[key] = dest;
  };
  overlay("points", L.points, (p, at) => {
    const id = idOf(p, at), x = num(p.x, at + ".x"), y = num(p.y, at + ".y");
    const po: Record<string, unknown> = { id, x, y };
    label(p, at, po);
    if (own(p, "role")) { const r = enumOf(p.role, GRAPH_POINT_ROLES, at + ".role", "دور النقطة"); if (r) po.role = r; }
    if (own(p, "on")) {
      const on = list(p.on, at + ".on", L.onCurves, 1);
      if (on) {
        const refs: string[] = [];
        on.forEach((r, j) => { const c = curveRef(r, at + ".on[" + j + "]", GRAPH_CURVE_KINDS); if (c !== undefined) { if (refs.includes(c)) add("GRAPH_DUPLICATE_ID", "المنحنى مكرر في قائمة on.", at + ".on[" + j + "]"); else refs.push(c); } });
        po.on = refs;
      }
    }
    bool(p, "open", at, po);
    if (x !== undefined && y !== undefined && !(inX(x) && inY(y))) { add("GRAPH_OUTSIDE_VIEWPORT", "النقطة خارج نافذة العرض.", at); return undefined; }
    return id !== undefined && x !== undefined && y !== undefined ? po : undefined;
  }, pointsOut, ["id", "x", "y", "label", "role", "on", "open"]);
  overlay("lines", L.lines, (l, at) => {
    const id = idOf(l, at);
    const orientation = enumOf(l.orientation, ["vertical", "horizontal"] as const, at + ".orientation", "اتجاه الخط");
    const value = num(l.value, at + ".value");
    const lo: Record<string, unknown> = { id, orientation, value };
    label(l, at, lo);
    if (own(l, "role")) { const r = enumOf(l.role, GRAPH_LINE_ROLES, at + ".role", "دور الخط"); if (r) lo.role = r; }
    style(l, at, lo);
    if (orientation && value !== undefined && !(orientation === "vertical" ? inX(value) : inY(value))) { add("GRAPH_OUTSIDE_VIEWPORT", "الخط خارج نافذة العرض.", at + ".value"); return undefined; }
    return id !== undefined && orientation && value !== undefined ? lo : undefined;
  }, linesOut, ["id", "orientation", "value", "label", "role", "style"]);
  overlay("tangents", L.tangents, (t, at) => {
    const id = idOf(t, at), curve = curveRef(t.curve, at + ".curve", ["explicit", "piecewise"]), x = num(t.x, at + ".x");
    const kind = enumOf(t.kind, GRAPH_TANGENT_KINDS, at + ".kind", "نوع المماس");
    const to: Record<string, unknown> = { id, curve, x, kind };
    if (own(t, "slope")) { const s = num(t.slope, at + ".slope"); if (s === undefined) return undefined; to.slope = s; }
    label(t, at, to);
    if (x !== undefined && !inX(x)) { add("GRAPH_OUTSIDE_VIEWPORT", "نقطة التماس خارج نافذة العرض.", at + ".x"); return undefined; }
    return id !== undefined && curve !== undefined && x !== undefined && kind ? to : undefined;
  }, tangentsOut, ["id", "curve", "x", "kind", "slope", "label"]);
  overlay("regions", L.regions, (r, at) => {
    const id = idOf(r, at), curve = curveRef(r.curve, at + ".curve", ["explicit", "piecewise"]);
    const ro: Record<string, unknown> = { id, curve };
    let lower: string | undefined;
    if (own(r, "lower")) { lower = curveRef(r.lower, at + ".lower", ["explicit", "piecewise"]); if (lower === undefined) return undefined; if (lower === curve) { add("GRAPH_REFERENCE_INVALID", "الحد السفلي للمنطقة منحنى آخر.", at + ".lower"); return undefined; } ro.lower = lower; }
    const from = num(r.from, at + ".from"), to = num(r.to, at + ".to");
    ro.from = from; ro.to = to;
    label(r, at, ro);
    if (from !== undefined && to !== undefined && !(to > from)) { add("GRAPH_INTERVAL_INVALID", "بداية المنطقة يجب أن تكون أصغر من نهايتها.", at); return undefined; }
    if (from !== undefined && to !== undefined && !(inX(from) && inX(to))) { add("GRAPH_OUTSIDE_VIEWPORT", "المنطقة المظللة خارج نافذة العرض.", at); return undefined; }
    return id !== undefined && curve !== undefined && from !== undefined && to !== undefined ? ro : undefined;
  }, regionsOut, ["id", "curve", "lower", "from", "to", "label"]);
  overlay("intervals", L.intervals, (v, at) => {
    const id = idOf(v, at), from = num(v.from, at + ".from"), to = num(v.to, at + ".to");
    const io: Record<string, unknown> = { id, from, to };
    bool(v, "fromClosed", at, io); bool(v, "toClosed", at, io);
    label(v, at, io);
    if (from !== undefined && to !== undefined && !(to > from)) { add("GRAPH_INTERVAL_INVALID", "بداية الفترة يجب أن تكون أصغر من نهايتها.", at); return undefined; }
    if (from !== undefined && to !== undefined && !(inX(from) && inX(to))) { add("GRAPH_OUTSIDE_VIEWPORT", "الفترة خارج نافذة العرض.", at); return undefined; }
    return id !== undefined && from !== undefined && to !== undefined ? io : undefined;
  }, intervalsOut, ["id", "from", "to", "fromClosed", "toClosed", "label"]);
  if (own(raw, "interaction")) {
    const at = path + ".interaction";
    if (!isPlain(raw.interaction)) add("GRAPH_INTERACTION_INVALID", "إعدادات التفاعل غير صالحة.", at);
    else if (keysOk(raw.interaction, ["zoom", "pan", "trace", "crosshair"], at)) {
      const io: Record<string, unknown> = {};
      for (const k of ["zoom", "pan", "trace", "crosshair"]) bool(raw.interaction, k, at, io);
      out.interaction = io;
    }
  }
  if (issues.length) return { ok: false, issues };

  // ── mathematical checks on the structurally valid graph (teacher values are checked, never rewritten) ─────────────────────────────
  const g = out as unknown as FunctionGraphSpecV1;
  const compiled = new Map(compileGraphCurves(g).map(c => [c.id, c] as [string, CompiledCurve]));
  const tol = L.onCurveTolerance * ySpan;
  const near = (a: number, b: number) => Math.abs(a - b) <= tol;
  const grids = new Map<string, ParametricGrid>();
  const onCurve = (c: CompiledCurve, x: number, y: number, open: boolean): boolean => {
    if (c.kind === "parametric") {
      if (!grids.has(c.id)) grids.set(c.id, parametricGrid(c));
      return parametricDistance(c, grids.get(c.id)!, x, y, xSpan, ySpan) <= L.onCurveTolerance;
    }
    const v = curveValue(c, x);
    // a filled point is ON the curve: the curve is defined at x with that value
    if (!open) return Number.isFinite(v) && near(v, y);
    // an open point (a hole, an excluded end) is judged by the one-sided limits: the curve approaches it from at least one side
    const d = Math.max(1e-9, 1e-7 * Math.max(1, Math.abs(x)));
    const side = (s: number) => { const w = curveValue(c, x + s * d); return Number.isFinite(w) && near(w, y); };
    return side(-1) || side(1) || (Number.isFinite(v) && near(v, y));
  };
  (g.points ?? []).forEach((p, i) => {
    for (const cid of p.on ?? []) {
      const c = compiled.get(cid)!;
      if (!onCurve(c, p.x, p.y, p.open === true)) add("GRAPH_POINT_NOT_ON_CURVE", "النقطة «" + (p.label ?? p.id) + "» لا تقع على المنحنى «" + cid + "» (القيمة المحسوبة تختلف عن y المكتوبة).", path + ".points[" + i + "]");
    }
  });
  const derivativeOf = (cid: string) => g.curves.find(c => c.kind === "explicit" && c.derivativeOf === cid) as GraphExplicitCurveV1 | undefined;
  const checkPoints = (lo: number, hi: number, n: number) => Array.from({ length: n }, (_, k) => lo + (hi - lo) * (k + 0.5) / n);
  for (const [i, c] of g.curves.entries()) {
    if (c.kind !== "explicit" || c.derivativeOf === undefined || !vp) continue;
    const base = compiled.get(c.derivativeOf)!, der = compiled.get(c.id)!;
    let mismatch = false;
    for (const x of checkPoints(vp.xMin, vp.xMax, 16)) {
      const v = curveValue(der, x), d = numericDerivative(s => curveValue(base, s), x);
      if (!Number.isFinite(v) || !d.smooth) continue;
      if (Math.abs(v - d.value) > 1e-3 * (1 + Math.abs(d.value))) { mismatch = true; break; }
    }
    if (mismatch) add("GRAPH_DERIVATIVE_MISMATCH", "المنحنى «" + c.id + "» لا يطابق مشتقة «" + c.derivativeOf + "» عدديًا.", path + ".curves[" + i + "].derivativeOf");
  }
  (g.tangents ?? []).forEach((t, i) => {
    const c = compiled.get(t.curve)!;
    const y0 = curveValue(c, t.x);
    if (!Number.isFinite(y0)) { add("GRAPH_TANGENT_UNDEFINED", "المنحنى غير معرّف عند نقطة التماس.", path + ".tangents[" + i + "].x"); return; }
    const d = numericDerivative(s => curveValue(c, s), t.x);
    const authored = derivativeOf(t.curve);
    const exact = authored ? curveValue(compiled.get(authored.id)!, t.x) : NaN;
    if (!Number.isFinite(exact) && !d.smooth) { add("GRAPH_TANGENT_UNDEFINED", "لا يوجد مماس وحيد عند هذه النقطة (المنحنى غير قابل للاشتقاق هنا).", path + ".tangents[" + i + "].x"); return; }
    if (t.slope !== undefined) {
      const ref = Number.isFinite(exact) ? exact : d.value;
      if (Math.abs(t.slope - ref) > 1e-3 * (1 + Math.abs(ref))) add("GRAPH_TANGENT_SLOPE_MISMATCH", "الميل المكتوب لا يطابق ميل المنحنى عند x = " + t.x + ".", path + ".tangents[" + i + "].slope");
    }
  });
  (g.regions ?? []).forEach((r, i) => {
    const o = { xMin: r.from, xMax: r.to, yMin: vp!.yMin, yMax: vp!.yMax, samples: 200, maxDepth: 8, budget: 4000 };
    for (const cid of [r.curve, ...(r.lower !== undefined ? [r.lower] : [])]) {
      const c = compiled.get(cid)!;
      const s = sampleExplicit(x => curveValue(c, x), r.from, r.to, o);
      const covers = s.segments.length === 1 && s.breaks.length === 0 && s.segments[0][0][0] === r.from && s.segments[0][s.segments[0].length - 1][0] === r.to;
      if (!covers) { add("GRAPH_REGION_DISCONTINUOUS", "المنطقة المظللة تحتاج منحنى «" + cid + "» معرّفًا ومتصلًا على كامل الفترة.", path + ".regions[" + i + "]"); break; }
    }
  });
  if (issues.length) return { ok: false, issues };
  return { ok: true, value: g, issues: [] };
}

/** One coarse grid of a parametric curve, shared by every on-curve check of that curve (bounded work: 401 evaluations per curve). */
type ParametricGrid = { step: number; pts: (readonly [number, number] | null)[] };
function parametricGrid(c: Extract<CompiledCurve, { kind: "parametric" }>): ParametricGrid {
  const n = 400, step = (c.t.max - c.t.min) / n;
  const pts = Array.from({ length: n + 1 }, (_, k) => { const t = c.t.min + step * k, px = c.fx(t), py = c.fy(t); return Number.isFinite(px) && Number.isFinite(py) ? [px, py] as const : null; });
  return { step, pts };
}
/** The smallest viewport-normalized distance from (x, y) to a parametric curve (shared coarse grid + 40 ternary steps; bounded work). */
function parametricDistance(c: Extract<CompiledCurve, { kind: "parametric" }>, grid: ParametricGrid, x: number, y: number, xSpan: number, ySpan: number): number {
  const d = (t: number) => { const px = c.fx(t), py = c.fy(t); return Number.isFinite(px) && Number.isFinite(py) ? Math.hypot((px - x) / xSpan, (py - y) / ySpan) : Infinity; };
  let best = Infinity, bestT = c.t.min;
  grid.pts.forEach((p, k) => { if (!p) return; const v = Math.hypot((p[0] - x) / xSpan, (p[1] - y) / ySpan); if (v < best) { best = v; bestT = c.t.min + grid.step * k; } });
  let lo = Math.max(c.t.min, bestT - grid.step), hi = Math.min(c.t.max, bestT + grid.step);
  for (let k = 0; k < 40; k++) {
    const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
    if (d(a) <= d(b)) hi = b; else lo = a;
  }
  return Math.min(best, d((lo + hi) / 2));
}

/** The STUDENT projection of a validated graph: the drawing is unchanged, the teacher-only semantics are removed — point roles ("root",
 *  "minimum"…), on-curve claims (which curves a point lies on: an intersection), line roles ("asymptote"), the derivative relation between
 *  curves and authored tangent slopes. None of them changes the picture (the renderer never reads a role, and an unauthored slope is
 *  computed), and any of them could state the answer of a selection question to a student reading the delivered JSON. */
export function projectGraphForStudent(g: FunctionGraphSpecV1): FunctionGraphSpecV1 {
  const out: FunctionGraphSpecV1 = { ...g, curves: g.curves.map(c => (c.kind === "explicit" && c.derivativeOf !== undefined ? (({ derivativeOf: _d, ...rest }) => rest)(c) : c)) };
  if (g.points) out.points = g.points.map(({ role: _r, on: _o, ...rest }) => rest);
  if (g.lines) out.lines = g.lines.map(({ role: _r, ...rest }) => rest);
  if (g.tangents) out.tangents = g.tangents.map(({ slope: _s, ...rest }) => rest);
  return out;
}

/** Sampling of one compiled curve in a viewport (the renderer and the analysis share it). Piecewise curves give one result per piece. */
export function sampleCurve(c: CompiledCurve, vp: GraphViewportV1, samples: number, smooth?: number, budget?: number) {
  const o = { ...vp, samples, smooth, budget };
  const clip = (d: Required<GraphDomainV1>) => [Math.max(vp.xMin, d.min), Math.min(vp.xMax, d.max)] as const;
  if (c.kind === "explicit") { const [a, b] = clip(c.domain); return [sampleExplicit(x => curveValue(c, x), a, b, o)]; }
  if (c.kind === "piecewise") return c.pieces.map(p => { const [a, b] = clip(p.domain); return sampleExplicit(x => (inDomain(x, p.domain) ? p.f(x) : NaN), a, b, o); });
  return [sampleParametric(c.fx, c.fy, c.t.min, c.t.max, { ...o, samples: samples * 2 })];
}
export { inDomain as graphInDomain, fullDomain as graphFullDomain };
