// Phase 21A.2 — the SEMANTIC targets of a function graph and its plain-text / non-visual reading. Pure: shared server build.
// A target is identified by a role-neutral key "<kind>:<id>" (curve:f, point:p1, line:l1, tangent:t1, region:r1, interval:i1) — never by
// pixels or coordinates — so answers, grading and review name the SAME objects whatever the zoom, the screen or the renderer. The target's
// display name is the teacher's label (or a neutral ordinal) plus its authored position; it never states a role ("root", "minimum"), so a
// selection list never tells a student which target is the answer.
import { prettyGraphExpression } from "./graphExpression";
import type { FunctionGraphSpecV1, GraphCurveV1, GraphDomainV1 } from "./functionGraphSpec";

export const GRAPH_TARGET_KINDS = Object.freeze(["curve", "point", "line", "tangent", "region", "interval"] as const);
export type GraphTargetKind = (typeof GRAPH_TARGET_KINDS)[number];
export const GRAPH_TARGET_KIND_LABELS: Readonly<Record<GraphTargetKind, string>> = Object.freeze({ curve: "منحنى", point: "نقطة", line: "مستقيم", tangent: "مماس", region: "منطقة مظللة", interval: "فترة" });
export const GRAPH_TARGET_KIND_PLURALS: Readonly<Record<GraphTargetKind, string>> = Object.freeze({ curve: "المنحنيات", point: "النقاط", line: "المستقيمات", tangent: "المماسات", region: "المناطق المظللة", interval: "الفترات" });
export type GraphTarget = { key: string; kind: GraphTargetKind; id: string; label: string; detail: string };
export const graphTargetKey = (kind: GraphTargetKind, id: string) => kind + ":" + id;

const PI_FRACTIONS: readonly [number, number][] = [[1, 1], [1, 2], [1, 3], [1, 4], [1, 6], [2, 3], [3, 4], [5, 6], [3, 2], [5, 4], [7, 4], [4, 3], [5, 3], [7, 6], [11, 6], [2, 1], [5, 2], [3, 1], [7, 2], [4, 1]];
/** A number as a reader sees it: an exact multiple of π (π/2, −3π/4…) when it is one (to 1e-9), else at most 6 significant digits. LTR. */
export function formatGraphNumber(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v), sign = v < 0 ? "−" : "";
  for (const [p, q] of PI_FRACTIONS) {
    if (Math.abs(a - (p * Math.PI) / q) <= 1e-9 * Math.max(1, a)) return sign + (p === 1 ? "" : String(p)) + "π" + (q === 1 ? "" : "/" + q);
  }
  const s = Number(a.toPrecision(6)).toString();
  return sign + (s.includes("e") ? a.toExponential(3) : s);
}
const pt = (x: number, y: number) => "(" + formatGraphNumber(x) + ", " + formatGraphNumber(y) + ")";
function domainText(d: GraphDomainV1 | undefined): string {
  if (!d || (d.min === undefined && d.max === undefined)) return "";
  const lo = d.min === undefined ? "−∞" : formatGraphNumber(d.min), hi = d.max === undefined ? "∞" : formatGraphNumber(d.max);
  return (d.min !== undefined && (d.minClosed ?? true) ? "[" : "(") + lo + ", " + hi + (d.max !== undefined && (d.maxClosed ?? true) ? "]" : ")");
}
/** The authored mathematics of a curve as text (y = …, a piecewise list, or the two parametric coordinates). */
export function curveFormula(c: GraphCurveV1): string {
  if (c.kind === "explicit") return "y = " + prettyGraphExpression(c.expression) + (c.domain ? "، x ∈ " + domainText(c.domain) : "");
  if (c.kind === "piecewise") return c.pieces.map(p => "y = " + prettyGraphExpression(p.expression) + " عندما x ∈ " + domainText(p.domain)).join("؛ ");
  return "x = " + prettyGraphExpression(c.x) + "، y = " + prettyGraphExpression(c.y) + "، t ∈ [" + formatGraphNumber(c.t.min) + ", " + formatGraphNumber(c.t.max) + "]";
}

/** Every selectable target of a graph (optionally of one kind), in document order. */
export function graphTargets(g: FunctionGraphSpecV1, kind?: GraphTargetKind): GraphTarget[] {
  const out: GraphTarget[] = [];
  const push = (k: GraphTargetKind, id: string, label: string | undefined, n: number, detail: string) => {
    if (kind === undefined || kind === k) out.push({ key: graphTargetKey(k, id), kind: k, id, label: label ?? GRAPH_TARGET_KIND_LABELS[k] + " " + n, detail });
  };
  g.curves.forEach((c, i) => push("curve", c.id, c.label, i + 1, curveFormula(c)));
  (g.points ?? []).forEach((p, i) => push("point", p.id, p.label, i + 1, pt(p.x, p.y)));
  (g.lines ?? []).forEach((l, i) => push("line", l.id, l.label, i + 1, (l.orientation === "vertical" ? "x = " : "y = ") + formatGraphNumber(l.value)));
  (g.tangents ?? []).forEach((t, i) => push("tangent", t.id, t.label, i + 1, "عند x = " + formatGraphNumber(t.x)));
  (g.regions ?? []).forEach((r, i) => push("region", r.id, r.label, i + 1, "من x = " + formatGraphNumber(r.from) + " إلى x = " + formatGraphNumber(r.to)));
  (g.intervals ?? []).forEach((v, i) => push("interval", v.id, v.label, i + 1, ((v.fromClosed ?? true) ? "[" : "(") + formatGraphNumber(v.from) + ", " + formatGraphNumber(v.to) + ((v.toClosed ?? true) ? "]" : ")")));
  return out;
}

/** Plain text of a graph (search, fallbacks, the AI modify projection): title, source, description and the authored formulas. */
export function graphPlainText(g: FunctionGraphSpecV1): string {
  return [g.title, g.source ?? "", g.description, ...g.curves.map(c => (c.label ? c.label + ": " : "") + curveFormula(c))].filter(Boolean).join("\n");
}
