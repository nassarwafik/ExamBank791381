// Phase 21A.2 — pure AUTHORING helpers for function graphs (the Builder's graph editor and the functionGraphSelection editor): starter
// templates, unique object ids, the structural targets of a graph that is being edited (possibly invalid), key pruning, duplication and the
// conversion of an APPROXIMATE detected feature into an authored point (the teacher confirms; the point is then checked like any other).
import type { FunctionGraphSpecV1, GraphCurveV1 } from "./functionGraphSpec";
import type { GraphFeature } from "./graphAnalysis";
import { graphTargetKey, type GraphTargetKind } from "./graphTargets";
import { parseExpression, evaluateExpression } from "../parametricExpression";

const ARABIC_DIGITS = /[٠-٩]/g;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const PI = Math.PI;
export const GRAPH_TEMPLATE_KEYS = Object.freeze(["quadratic", "linear", "rational", "sine", "exponential", "piecewise", "parametric"] as const);
export type GraphTemplateKey = (typeof GRAPH_TEMPLATE_KEYS)[number];
export const GRAPH_TEMPLATE_LABELS: Readonly<Record<GraphTemplateKey, string>> = Object.freeze({
  quadratic: "دالة تربيعية", linear: "دالة خطية", rational: "دالة كسرية (خط تقارب)", sine: "دالة الجيب", exponential: "دالة أسية ولوغاريتمية", piecewise: "دالة متعددة القواعد", parametric: "منحنى وسيطي (دائرة)"
});
/** A fresh, VALID starter graph (the teacher replaces the mathematics; every number is exact). */
export function graphTemplate(key: GraphTemplateKey, id: string): FunctionGraphSpecV1 {
  const axes = { x: { label: "x", grid: true }, y: { label: "y", grid: true } };
  switch (key) {
    case "quadratic": return { version: 1, id, title: "منحنى دالة تربيعية", description: "منحنى الدالة f(x) = x² − 4x + 3.", viewport: { xMin: -2, xMax: 6, yMin: -3, yMax: 8 }, axes, curves: [{ id: "c1", kind: "explicit", label: "f(x)", expression: "x^2 - 4*x + 3" }] };
    case "linear": return { version: 1, id, title: "منحنى دالة خطية", description: "منحنى الدالة f(x) = 2x + 1.", viewport: { xMin: -5, xMax: 5, yMin: -5, yMax: 5 }, axes, curves: [{ id: "c1", kind: "explicit", label: "f(x)", expression: "2*x + 1" }] };
    case "rational": return { version: 1, id, title: "منحنى دالة كسرية", description: "منحنى الدالة f(x) = 1/(x − 2) وخط تقاربها الرأسي.", viewport: { xMin: -4, xMax: 8, yMin: -6, yMax: 6 }, axes, curves: [{ id: "c1", kind: "explicit", label: "f(x)", expression: "1/(x - 2)" }], lines: [{ id: "l1", orientation: "vertical", value: 2, label: "x = 2", role: "asymptote", style: { line: "dashed" } }] };
    case "sine": return { version: 1, id, title: "منحنى دالة الجيب", description: "منحنى الدالة y = sin(x) على الفترة من −2π إلى 2π.", viewport: { xMin: -2 * PI, xMax: 2 * PI, yMin: -1.5, yMax: 1.5 }, axes: { x: { label: "x", grid: true, step: PI / 2, ticks: "pi" }, y: { label: "y", grid: true, step: 0.5 } }, curves: [{ id: "c1", kind: "explicit", label: "y = sin(x)", expression: "sin(x)" }] };
    case "exponential": return { version: 1, id, title: "دالة أسية ولوغاريتمية", description: "منحنيا الدالتين y = e^x و y = ln(x).", viewport: { xMin: -3, xMax: 5, yMin: -3, yMax: 6 }, axes, curves: [{ id: "c1", kind: "explicit", label: "y = e^x", expression: "exp(x)" }, { id: "c2", kind: "explicit", label: "y = ln(x)", expression: "ln(x)", style: { line: "dashed" } }] };
    case "piecewise": return { version: 1, id, title: "دالة متعددة القواعد", description: "دالة معرّفة بقاعدتين على x < 0 و x ≥ 0.", viewport: { xMin: -4, xMax: 4, yMin: -2, yMax: 6 }, axes, curves: [{ id: "c1", kind: "piecewise", label: "f(x)", pieces: [{ expression: "-x", domain: { max: 0, maxClosed: false } }, { expression: "x^2", domain: { min: 0 } }] }] };
    case "parametric": return { version: 1, id, title: "منحنى وسيطي", description: "الدائرة x = 2cos(t), y = 2sin(t).", viewport: { xMin: -3, xMax: 3, yMin: -3, yMax: 3 }, axes, curves: [{ id: "c1", kind: "parametric", label: "الدائرة", x: "2*cos(t)", y: "2*sin(t)", t: { min: 0, max: 2 * PI } }] };
  }
}
export const defaultFunctionGraph = (id: string): FunctionGraphSpecV1 => graphTemplate("quadratic", id);

const ARRAYS = ["curves", "points", "lines", "tangents", "regions", "intervals"] as const;
/** Every object id used anywhere in a (possibly invalid) graph. */
export function graphObjectIds(raw: unknown): Set<string> {
  const out = new Set<string>();
  if (!isObj(raw)) return out;
  for (const k of ARRAYS) if (Array.isArray(raw[k])) for (const o of raw[k] as unknown[]) if (isObj(o) && typeof o.id === "string") out.add(o.id);
  return out;
}
/** A fresh object id with the prefix, unique across the graph's ONE id namespace (p1, p2…; never a reused id of a deleted object
 *  when `used` also carries the ids seen during the editing session). */
export function nextGraphObjectId(raw: unknown, prefix: string, used: ReadonlySet<string> = new Set()): string {
  const ids = graphObjectIds(raw);
  for (let n = 1; n < 10_000; n++) { const id = prefix + n; if (!ids.has(id) && !used.has(id)) return id; }
  return prefix + Date.now().toString(36);
}
const KIND_ARRAY: Readonly<Record<GraphTargetKind, (typeof ARRAYS)[number]>> = Object.freeze({ curve: "curves", point: "points", line: "lines", tangent: "tangents", region: "regions", interval: "intervals" });
/** The target keys of one kind as the graph's STRUCTURE stands — also while it is invalid (an expression being typed): key pruning reads
 *  this, so a key entry survives an unrelated invalid edit and dies with its object. */
export function structuralGraphTargetKeys(raw: unknown, kind: GraphTargetKind): string[] {
  if (!isObj(raw) || !Array.isArray(raw[KIND_ARRAY[kind]])) return [];
  return (raw[KIND_ARRAY[kind]] as unknown[]).filter((o): o is Record<string, unknown> => isObj(o) && typeof o.id === "string").map(o => graphTargetKey(kind, o.id as string));
}
/** Key entries that still name an object of the kind (order kept). */
export const pruneGraphKey = (correct: readonly string[], raw: unknown, kind: GraphTargetKind): string[] => {
  const keys = new Set(structuralGraphTargetKeys(raw, kind));
  return correct.filter(k => keys.has(k));
};
/** A copy with a new graph id (object ids are graph-local, so they stay). */
export const duplicateGraph = (g: FunctionGraphSpecV1, id: string): FunctionGraphSpecV1 => ({ ...(JSON.parse(JSON.stringify(g)) as FunctionGraphSpecV1), id });
const ROLE_OF: Readonly<Partial<Record<GraphFeature["kind"], NonNullable<NonNullable<FunctionGraphSpecV1["points"]>[number]["role"]>>>> = Object.freeze({ root: "root", yIntercept: "yIntercept", minimum: "minimum", maximum: "maximum", intersection: "intersection" });
/** An authored point from a detected feature (the teacher's explicit action; the validator checks it like any other point). */
export function pointFromFeature(g: FunctionGraphSpecV1, f: GraphFeature, used: ReadonlySet<string> = new Set()): FunctionGraphSpecV1 | null {
  if (f.y === null || !ROLE_OF[f.kind]) return null;
  const id = nextGraphObjectId(g, "p", used);
  return { ...g, points: [...(g.points ?? []), { id, x: f.x, y: f.y, role: ROLE_OF[f.kind], on: [...f.curves] }] };
}
/** A new curve of a kind with a valid starter expression. */
export function newCurve(kind: GraphCurveV1["kind"], id: string): GraphCurveV1 {
  if (kind === "explicit") return { id, kind, expression: "x" };
  if (kind === "piecewise") return { id, kind, pieces: [{ expression: "x", domain: { max: 0, maxClosed: false } }, { expression: "x^2", domain: { min: 0 } }] };
  return { id, kind, x: "cos(t)", y: "sin(t)", t: { min: 0, max: 2 * PI } };
}

/** A number typed by a teacher: a decimal, or a CONSTANT expression of the safe language (pi/2, -3*pi/4, sqrt(2)); undefined otherwise. */
export function parseGraphNumber(text: string): number | undefined {
  const t = text.replace(ARABIC_DIGITS, d => String(d.charCodeAt(0) - 0x660)).replace(/[−–]/g, "-").replace(/π/g, "pi").trim();
  if (t === "") return undefined;
  if (/^-?\d+(\.\d+)?$/.test(t)) { const v = Number(t); return Number.isFinite(v) ? v : undefined; }
  const p = parseExpression(t, { language: 3 });
  if (!p.ok || p.refs.length) return undefined;
  const r = evaluateExpression(p.ast, new Map());
  return r.ok && Number.isFinite(r.value) ? r.value : undefined;
}
