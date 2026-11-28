// «محرّر المخططات» — how big each component is drawn (it grows with its text), where an arrow meets its border, and the arrows' paths.
// Pure but for `measureText`, which uses a canvas when the page has one (the app's own font) and a fair estimate otherwise.

import { edgeSpec, isTextSize, nodeSpec, TEXT_SIZES, type NodeSpec, type ShapeForm } from "./diagramCatalog";
import { routeApplies, routeOf, SEQ_STEP, type DEdge, type DiagramDoc, type DNode } from "./diagramDoc";

/** The text's own direction: Arabic first → right to left; anything else → left to right. */
export function textDir(s: string): "rtl" | "ltr" {
  const m = /[\p{L}\p{N}]/u.exec(s);
  return m && /[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(m[0]) ? "rtl" : "ltr";
}

export const FONT_FAMILY = "\"IBM Plex Sans Arabic\", \"Segoe UI\", Tahoma, Arial, sans-serif";
export const FONT_SIZE = 14;
export const SMALL = 12.5;
export const LINE = 19;
export const SMALL_LINE = 17;
const WRAP_AT = 200;

let ctx: CanvasRenderingContext2D | null | undefined;
const cache = new Map<string, number>();
/** The text's width in px at `size` (bold or not). */
export function measureText(text: string, size = FONT_SIZE, bold = false): number {
  const key = (bold ? "b" : "n") + size + "|" + text;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (ctx === undefined) {
    try { ctx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null; } catch { ctx = null; }
  }
  let w: number;
  if (ctx && typeof ctx.measureText === "function") {
    ctx.font = (bold ? "600 " : "400 ") + size + "px " + FONT_FAMILY;
    w = ctx.measureText(text).width;
    if (!Number.isFinite(w) || w <= 0) w = estimate(text, size, bold);
  } else w = estimate(text, size, bold);
  if (cache.size > 5000) cache.clear();
  cache.set(key, w);
  return w;
}
const estimate = (text: string, size: number, bold: boolean) => [...text].length * size * (bold ? 0.6 : 0.56);

/** A text in lines no wider than `max` (a long word stays whole). */
export function wrapText(text: string, max = WRAP_AT, size = FONT_SIZE, bold = false): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); continue; }
    let line = "";
    for (const w of words) {
      const next = line ? line + " " + w : w;
      if (line && measureText(next, size, bold) > max) { out.push(line); line = w; } else line = next;
    }
    out.push(line);
  }
  while (out.length > 1 && out[out.length - 1] === "") out.pop();
  return out;
}
const widest = (lines: readonly string[], size = FONT_SIZE, bold = false) => lines.reduce((m, l) => Math.max(m, measureText(l, size, bold)), 0);
const KEY = /^(PK|FK)\s+/i;
const linesOf = (s: string | undefined) => (s ?? "").split("\n").map(l => l.trimEnd()).filter((l, i, all) => l !== "" || (i > 0 && i < all.length - 1));

export type NodeBox = {
  node: DNode; spec: NodeSpec; form: ShapeForm;
  x: number; y: number; w: number; h: number;
  /** The name, in lines. */
  title: string[];
  /** A compartment box's sections (attributes, operations, fields, values); a state's body; a device's details. */
  sections: string[][];
  /** A DFD number (1.0, D1). */
  number: string;
};

/** The component as drawn: its size grows to hold its text (never below its stored size). */
export function layoutNode(doc: DiagramDoc, node: DNode): NodeBox | null {
  const spec = nodeSpec(doc.kind, node.type);
  if (!spec) return null;
  const form = spec.form;
  const t = node.text;
  const base = { node, spec, form, x: node.x, y: node.y, number: t.number ?? "" };
  const lineFields = spec.fields.filter(f => f.lines && f.key !== "name");
  let w = node.w, h = node.h;
  let title = wrapText(t.name ?? "", WRAP_AT, FONT_SIZE, true);
  let sections: string[][] = [];
  switch (form) {
    case "compartments": {
      title = [t.name ?? ""];
      sections = lineFields.map(f => linesOf(t[f.key]));
      const stereo = spec.stereotype ? 1 : 0;
      const head = 12 + stereo * SMALL_LINE + LINE;
      const body = sections.reduce((s, lines) => s + 10 + Math.max(1, lines.length) * SMALL_LINE, 0);
      // a section with keys draws its names after a PK / FK column (diagramShapes SideLine: 34 px in, the key word itself not measured)
      const lineW = (lines: string[]) => {
        const keyed = lines.some(l => KEY.test(l));
        return Math.max(0, ...lines.map(l => measureText(l.replace(KEY, ""), SMALL))) + (keyed ? 34 : 12) + 14;
      };
      w = Math.max(w, measureText(title[0], FONT_SIZE, true) + 28, spec.stereotype ? measureText(spec.stereotype, SMALL) + 28 : 0, ...sections.map(lineW));
      h = Math.max(h, head + body);
      break;
    }
    case "rect": case "round": case "doubleRect": case "component": case "cylinder": case "note": case "terminal": case "parallelogram": case "subroutine": {
      if (form === "note") { title = linesOf(t.name); sections = []; }
      // DG6: the oval's round ends, the parallelogram's slant on both sides, the predefined process's two inner bars
      const extra = form === "component" ? 34 : form === "doubleRect" ? 12 : form === "terminal" ? 24 : form === "parallelogram" ? 2 * SLANT : form === "subroutine" ? 24 : 0;
      w = Math.max(w, widest(title, FONT_SIZE, form !== "note") + 28 + extra);
      if (form === "round" && lineFields.length) {   // a state's body under its name
        sections = [linesOf(t.body)].filter(s => s.length);
        if (sections.length) w = Math.max(w, widest(sections[0], SMALL) + 28);
      }
      const bodyH = sections.length ? 8 + sections[0].length * SMALL_LINE : 0;
      h = Math.max(h, title.length * LINE + 22 + bodyH + (form === "cylinder" ? 22 : 0));
      break;
    }
    case "text": {   // DG10: a free text, each of its lines in its size
      const z = textStyle(t.size);
      title = (t.name ?? "").split("\n").flatMap(l => wrapText(l, 640, z.px, z.bold));
      while (title.length > 1 && !title[title.length - 1]) title.pop();
      w = Math.max(w, widest(title, z.px, z.bold) + 12);
      h = Math.max(h, title.length * Math.round(z.px * 1.4) + 8);
      break;
    }
    case "icon": {   // DG10: the picture, its name under it, then its short description
      if (!(t.name ?? "").trim()) title = [];
      sections = [wrapText(t.details ?? "", WRAP_AT, SMALL)].map(s => s.filter(Boolean)).filter(s => s.length);
      w = Math.max(w, ICON_SIZE + 12, widest(title, FONT_SIZE, true) + 14, ...sections.map(s => widest(s, SMALL) + 14));
      h = Math.max(h, ICON_TOP + ICON_SIZE + 6 + title.length * LINE + (sections[0]?.length ?? 0) * SMALL_LINE + 6);
      break;
    }
    case "ellipse": case "doubleEllipse": case "dashedEllipse": {
      w = Math.max(w, widest(title, FONT_SIZE, true) * 1.3 + 30);
      h = Math.max(h, title.length * LINE + 24);
      break;
    }
    case "diamond": case "doubleDiamond": {
      if (!title[0]) title = [];
      w = Math.max(w, widest(title, FONT_SIZE, true) * 1.7 + 30);
      h = Math.max(h, title.length * LINE * 1.7 + 24);
      break;
    }
    case "circle": {
      const all = [...title, t.number ?? ""];
      const d = Math.max(w, h, widest(all, FONT_SIZE, true) + 34, (title.length + 1) * LINE + 40);
      w = h = d;
      break;
    }
    case "processGS": {
      w = Math.max(w, widest(title, FONT_SIZE, true) + 28, measureText(t.number ?? "", SMALL) + 28);
      h = Math.max(h, 26 + title.length * LINE + 18);
      break;
    }
    case "store": {
      w = Math.max(w, 46 + widest(title, FONT_SIZE, true) + 24);
      h = Math.max(h, title.length * LINE + 18);
      break;
    }
    case "actor": {
      w = Math.max(w, widest(title, FONT_SIZE, true) + 12);
      h = Math.max(h, 64 + title.length * LINE + 6);
      break;
    }
    case "lifeline": {
      title = [t.name ?? ""];
      const actor = node.type === "actorLifeline";
      w = Math.max(w, measureText(title[0], FONT_SIZE, true) + (actor ? 12 : 28));
      h = actor ? 60 + LINE : Math.max(h, 40);
      break;
    }
    case "device": {
      sections = [linesOf(t.details)];
      w = Math.max(w, widest(title, FONT_SIZE, true) + 12, widest(sections[0], SMALL) + 12);
      h = 46 + title.length * LINE + sections[0].length * SMALL_LINE + 4;
      break;
    }
    case "frame": {
      title = [t.name ?? ""];
      sections = [[t.guard ?? ""]];
      w = Math.max(w, measureText(title[0], FONT_SIZE, true) + measureText(t.guard ?? "", SMALL) + 60);
      break;
    }
    case "room": {   // DG12: a room or the building: its name on a label at its top (none without a name)
      title = (t.name ?? "").trim() ? [t.name!.trim()] : [];
      w = Math.max(w, title.length ? measureText(title[0], SMALL, true) + 40 : 0);
      break;
    }
    case "furniture": {   // DG12: the piece's own drawing, and its label (if any) under it
      title = (t.name ?? "").trim() ? wrapText(t.name!.trim(), WRAP_AT, SMALL, true) : [];
      w = Math.max(w, spec.minW, widest(title, SMALL, true) + 26);
      h = Math.max(h, spec.minH + (title.length ? PLAN_LABEL_GAP + title.length * SMALL_LINE + 8 : 0));
      break;
    }
    case "container": case "node3d": {
      title = [t.name ?? ""];
      w = Math.max(w, measureText(title[0], FONT_SIZE, true) + 40);
      break;
    }
    case "start": case "end": case "bar":
      title = [];
      break;
  }
  return { ...base, title, sections, w: Math.ceil(w), h: Math.ceil(h) };
}

export const centerOf = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
/** DG10 — a free text's size in px, and whether it is bold (a size the file does not name: «عادي»). */
export const textStyle = (size: string | undefined) => TEXT_SIZES[isTextSize(size) ? size : "m"];
/** DG10 — an icon component: the picture's size, and how far under the component's top it starts. */
export const ICON_SIZE = 56, ICON_TOP = 4;
/** DG12 — the space between a piece of a plan and the label under it. */
export const PLAN_LABEL_GAP = 4;
/** DG6 — how far a flowchart's input / output parallelogram leans: its top edge starts this far in from the left. */
export const SLANT = 16;

/** The point where a line from the component's centre toward (px, py) leaves its border. */
export function anchorToward(b: NodeBox, px: number, py: number): { x: number; y: number } {
  const c = centerOf(b);
  let dx = px - c.x, dy = py - c.y;
  if (!dx && !dy) dy = -1;
  const hw = b.w / 2, hh = b.h / 2;
  let t: number;
  switch (b.form) {
    case "ellipse": case "doubleEllipse": case "dashedEllipse": case "circle": case "start": case "end":
      t = 1 / Math.sqrt((dx * dx) / (hw * hw) + (dy * dy) / (hh * hh));
      break;
    case "diamond": case "doubleDiamond":
      t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
      break;
    case "actor": {   // the figure, not its name below
      const fx = Math.min(hw, 22), top = b.y, fh = 64;
      const fc = { x: c.x, y: top + fh / 2 };
      dx = px - fc.x; dy = py - fc.y;
      if (!dx && !dy) dy = -1;
      t = Math.min(fx / Math.abs(dx || 1e-9), fh / 2 / Math.abs(dy || 1e-9));
      return { x: fc.x + dx * t, y: fc.y + dy * t };
    }
    default:
      t = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
  }
  return { x: c.x + dx * t, y: c.y + dy * t };
}

export type EdgePath = {
  d: string;
  /** Where the middle text goes, and the two ends' texts. */
  mid: { x: number; y: number };
  fromAt: { x: number; y: number };
  toAt: { x: number; y: number };
  /** The angle of the line at its middle (the serial cable's zig-zag). */
  angle: number;
  /** The line as points (to find the arrow under the pointer). */
  pts: [number, number][];
};

const r1 = (v: number) => Math.round(v * 10) / 10;

/** A sequence diagram's lifeline: the dashed line's bottom (under the lowest message). */
export function lifelineBottom(doc: DiagramDoc): number {
  const low = doc.edges.reduce((m, e) => Math.max(m, e.y), 0);
  let heads = 0, others = 0;
  for (const n of doc.nodes) {
    if (nodeSpec(doc.kind, n.type)?.form === "lifeline") heads = Math.max(heads, n.y + (n.type === "actorLifeline" ? 64 + LINE : n.h));
    else others = Math.max(others, n.y + n.h);
  }
  return Math.max(low + SEQ_STEP, others + 20, heads + 120);
}

/** The arrow's path. Several arrows between the same two components are spread apart; an arrow to itself is a loop. */
export function edgePath(doc: DiagramDoc, edge: DEdge, boxes: ReadonlyMap<string, NodeBox>): EdgePath | null {
  const a = boxes.get(edge.from), b = boxes.get(edge.to);
  if (!a || !b) return null;
  if (doc.kind === "sequence") {
    const ax = centerOf(a).x, bx = centerOf(b).x, y = edge.y;
    if (edge.from === edge.to) {
      const x = ax;
      return { d: `M${r1(x)},${y} H${r1(x + 40)} V${y + 22} H${r1(x)}`, mid: { x: x + 46, y: y + 11 }, fromAt: { x, y }, toAt: { x, y: y + 22 }, angle: 0, pts: [[x, y], [x + 40, y], [x + 40, y + 22], [x, y + 22]] };
    }
    return { d: `M${r1(ax)},${y} H${r1(bx)}`, mid: { x: (ax + bx) / 2, y: y - 13 }, fromAt: { x: ax, y }, toAt: { x: bx, y }, angle: 0, pts: [[ax, y], [bx, y]] };
  }
  const ortho = routeOf(edge) === "ortho" && routeApplies(doc.kind);
  if (edge.from === edge.to && ortho) {
    // a loop of three straight runs over the top right corner
    const top = sidePoint(a, "top", a.x + a.w * 0.65), right = sidePoint(a, "right", a.y + a.h * 0.35);
    const up = a.y - 30, out = a.x + a.w + 30;
    return polyline([[top.x, top.y], [top.x, up], [out, up], [out, right.y], [right.x, right.y]], { x: out + 4, y: up - 12 });
  }
  if (edge.from === edge.to) {
    const top = { x: a.x + a.w * 0.65, y: a.y }, right = { x: a.x + a.w, y: a.y + a.h * 0.35 };
    const d = `M${r1(top.x)},${r1(top.y)} C${r1(top.x)},${r1(top.y - 50)} ${r1(right.x + 50)},${r1(right.y)} ${r1(right.x)},${r1(right.y)}`;
    const pts: [number, number][] = [];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12, v = 1 - u;
      pts.push([v * v * v * top.x + 3 * v * v * u * top.x + 3 * v * u * u * (right.x + 50) + u * u * u * right.x,
        v * v * v * top.y + 3 * v * v * u * (top.y - 50) + 3 * v * u * u * right.y + u * u * u * right.y]);
    }
    return { d, mid: { x: right.x + 26, y: top.y - 22 }, fromAt: top, toAt: right, angle: 0, pts };
  }
  // spread parallel arrows: their order among the arrows joining the same two components
  const same = doc.edges.filter(e => (e.from === edge.from && e.to === edge.to) || (e.from === edge.to && e.to === edge.from));
  const i = same.findIndex(e => e.id === edge.id);
  const ca = centerOf(a), cb = centerOf(b);
  const len = Math.hypot(cb.x - ca.x, cb.y - ca.y) || 1;
  const nx = -(cb.y - ca.y) / len, ny = (cb.x - ca.x) / len;
  // the offset is measured on one fixed side (from the lower id to the higher) so two opposite arrows separate
  const flip = edge.from < edge.to ? 1 : -1;
  const off = (i - (same.length - 1) / 2) * 16 * flip;
  if (ortho && doc.kind === "orgChart") {
    // DG11: down from the manager's bottom, along a bar just over the one who reports to him, and down into his top: the team of one
    // manager, on one level, share that bar
    const t = treePath(a, b);
    if (t) return polyline(t);
  }
  if (ortho) {
    // DG9: a flowchart's loop back goes round the left of the steps it returns over
    const back = loopBack(doc, boxes, edge, a, b);
    if (back) return polyline(back, undefined, doc.kind === "flowchart" && POINTED.includes(a.form));
    const o = orthoPath(a, b, edge.from < edge.to ? off : -off, port(doc, boxes, edge, a), port(doc, boxes, edge, b), obstacles(boxes, a, b),
      preferOf(doc, a), routeSides(doc, boxes, edge));
    if (o) return o;
  }
  const pa = anchorToward(a, cb.x + nx * off * 2, cb.y + ny * off * 2);
  const pb = anchorToward(b, ca.x + nx * off * 2, ca.y + ny * off * 2);
  const s = { x: pa.x + nx * (same.length > 1 ? off * 0.6 : 0), y: pa.y + ny * (same.length > 1 ? off * 0.6 : 0) };
  const t = { x: pb.x + nx * (same.length > 1 ? off * 0.6 : 0), y: pb.y + ny * (same.length > 1 ? off * 0.6 : 0) };
  const ux = (t.x - s.x) / (Math.hypot(t.x - s.x, t.y - s.y) || 1), uy = (t.y - s.y) / (Math.hypot(t.x - s.x, t.y - s.y) || 1);
  const mid = { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 };
  const side = (p: { x: number; y: number }, dir: number) => ({ x: p.x + ux * 22 * dir - uy * 12, y: p.y + uy * 22 * dir + ux * 12 });
  return { d: `M${r1(s.x)},${r1(s.y)} L${r1(t.x)},${r1(t.y)}`, mid, fromAt: side(s, 1), toAt: side(t, -1), angle: Math.atan2(t.y - s.y, t.x - s.x) * 180 / Math.PI, pts: [[s.x, s.y], [t.x, t.y]] };
}

// ── DG5: arrows with right angles ──────────────────────────────────────────────────────────────────────────────────────────────
type Side = "left" | "right" | "top" | "bottom";
type Pt = { x: number; y: number };
const ROUND: readonly ShapeForm[] = ["ellipse", "doubleEllipse", "dashedEllipse", "circle", "start", "end"];
const POINTED: readonly ShapeForm[] = ["diamond", "doubleDiamond"];

/** Where a level line (left / right side, at height `at`) or an upright one (top / bottom, at `at` across) meets the border. */
export function sidePoint(b: NodeBox, side: Side, at: number): Pt {
  const c = centerOf(b), hw = b.w / 2, hh = b.h / 2;
  const level = side === "left" || side === "right", sign = side === "left" || side === "top" ? -1 : 1;
  if (b.form === "actor") {   // the figure, not its name: its arms reach 22 px out
    return level ? { x: c.x + sign * Math.min(hw, 22), y: at } : { x: at, y: side === "top" ? b.y : b.y + b.h };
  }
  if (level && b.form === "terminal") {   // the round ends: half circles of the box's height
    const r = Math.min(hh, hw), dy = Math.min(1, Math.abs(at - c.y) / (r || 1));
    return { x: c.x + sign * (hw - r + r * Math.sqrt(1 - dy * dy)), y: at };
  }
  if (level && b.form === "parallelogram") {   // the slanted sides: the left one leans in at the top, the right one at the bottom
    const t = Math.max(0, Math.min(1, (at - b.y) / (b.h || 1)));
    return { x: side === "left" ? b.x + SLANT * (1 - t) : b.x + b.w - SLANT * t, y: at };
  }
  const u = level ? (at - c.y) / (hh || 1) : (at - c.x) / (hw || 1);
  const k = ROUND.includes(b.form) ? Math.sqrt(Math.max(0, 1 - u * u)) : POINTED.includes(b.form) ? Math.max(0, 1 - Math.abs(u)) : 1;
  return level ? { x: c.x + sign * hw * k, y: at } : { x: at, y: c.y + sign * hh * k };
}
/** The heights a level line may meet a side at (or the places across, for an upright line): away from the corners, and near the middle
 *  of a round or pointed shape, where the line meets it squarely. */
function span(b: NodeBox, level: boolean): [number, number] {
  if (level && b.form === "actor") return [b.y + 10, b.y + 54];
  const lo = level ? b.y : b.x, size = level ? b.h : b.w;
  const share = ROUND.includes(b.form) ? 0.3 : POINTED.includes(b.form) ? 0.25 : 0.5;
  const m = Math.min(size / 2 - 1, Math.max(8, size * (0.5 - share)));
  return [lo + m, lo + size - m];
}
const clampTo = (v: number, [lo, hi]: [number, number]) => Math.max(lo, Math.min(hi, v));

/** A polyline path, with its middle text on the middle run and the ends' texts beside the first and last runs. */
function polyline(points: [number, number][], midAt?: Pt, firstRun = false): EdgePath {
  const pts = points.filter((p, k) => k === 0 || p[0] !== points[k - 1][0] || p[1] !== points[k - 1][1]);
  // the middle run; with one turn, the first run (a decision's «نعم» / «لا» stays beside the decision); DG9: out of a flowchart's
  // decision, always the first run, however the route goes on
  const seg = firstRun || pts.length === 3 ? 0 : Math.floor((pts.length - 1) / 2);
  const p0 = pts[seg], p1 = pts[Math.min(seg + 1, pts.length - 1)];
  const dir = (a: [number, number], b: [number, number]) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return { ux: (b[0] - a[0]) / l, uy: (b[1] - a[1]) / l }; };
  // as on a straight arrow: 22 px along the run from its end, 12 px to its side
  const last = pts.length - 1;
  const { ux: sx, uy: sy } = dir(pts[0], pts[1]), { ux: ex, uy: ey } = dir(pts[last - 1], pts[last]);
  const fromAt = { x: pts[0][0] + sx * 22 - sy * 12, y: pts[0][1] + sy * 22 + sx * 12 };
  const toAt = { x: pts[last][0] - ex * 22 - ey * 12, y: pts[last][1] - ey * 22 + ex * 12 };
  return {
    d: pts.map((p, k) => (k ? "L" : "M") + r1(p[0]) + "," + r1(p[1])).join(" "),
    mid: midAt ?? { x: (p0[0] + p1[0]) / 2, y: (p0[1] + p1[1]) / 2 },
    fromAt, toAt,
    angle: Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180 / Math.PI,
    pts,
  };
}

type Plan = { level: boolean; sa: Side; sb: Side } | null;
/** Which sides a right-angled arrow leaves and enters by: the facing ones, across the wider gap. Overlapping boxes: none. */
function plan(a: NodeBox, b: NodeBox): Plan {
  const ca = centerOf(a), cb = centerOf(b);
  const hgap = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w)), vgap = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  if (hgap <= 0 && vgap <= 0) return null;
  const level = hgap >= vgap;
  return { level, ...(level ? (cb.x >= ca.x ? { sa: "right", sb: "left" } : { sa: "left", sb: "right" }) : (cb.y >= ca.y ? { sa: "bottom", sb: "top" } : { sa: "top", sb: "bottom" })) } as Plan;
}
/** DG6: a flowchart reads top to bottom with one turn: out of a decision's side corner and down, otherwise down and into the side. */
const preferOf = (doc: DiagramDoc, a: NodeBox): "sideFirst" | "downFirst" | undefined =>
  doc.kind === "flowchart" ? (POINTED.includes(a.form) ? "sideFirst" : "downFirst") : undefined;
/** The sides a right-angled arrow really leaves and enters by (its route drawn without spreading: the shape chosen is the same). */
const sides = new WeakMap<ReadonlyMap<string, NodeBox>, Map<string, [Side, Side] | null>>();
function routeSides(doc: DiagramDoc, boxes: ReadonlyMap<string, NodeBox>, e: DEdge): [Side, Side] | null {
  let m = sides.get(boxes);
  if (!m) { m = new Map(); sides.set(boxes, m); }
  const key = e.from + ">" + e.to;
  if (!m.has(key)) {
    const a = boxes.get(e.from), b = boxes.get(e.to);
    const back = a && b ? loopBack(doc, boxes, e, a, b) : null;
    const o = back ? { pts: back } : a && b && e.from !== e.to ? orthoPath(a, b, 0, 0, 0, obstacles(boxes, a, b), preferOf(doc, a)) : null;
    const way = (p: [number, number], q: [number, number]): Side => (p[1] === q[1] ? (q[0] > p[0] ? "right" : "left") : (q[1] > p[1] ? "bottom" : "top"));
    const flip: Record<Side, Side> = { left: "right", right: "left", top: "bottom", bottom: "top" };
    m.set(key, o && o.pts.length > 1 ? [way(o.pts[0], o.pts[1]), flip[way(o.pts[o.pts.length - 2], o.pts[o.pts.length - 1])]] : null);
  }
  return m.get(key)!;
}
/** Where on its side the arrow meets `box` (px from the side's middle): the right-angled arrows meeting the same side are spread along
 *  it in the order of where they come from, so they never run on top of each other. Arrows of the same generalisation (an open triangle)
 *  into one parent share a place: UML draws them as one trunk. */
function port(doc: DiagramDoc, boxes: ReadonlyMap<string, NodeBox>, edge: DEdge, box: NodeBox): number {
  // DG6: a flowchart's decision is met at its corners (one way out of each), never beside them
  if (doc.kind === "flowchart" && POINTED.includes(box.form)) return 0;
  const id = box.node.id;
  const sideOf = (e: DEdge) => { const r = routeSides(doc, boxes, e); return r ? (e.from === id ? r[0] : r[1]) : null; };
  const side = sideOf(edge);
  if (!side) return 0;
  const level = side === "left" || side === "right";
  const trunk = (e: DEdge) => (e.to === id && edgeSpec(doc.kind, e.type)?.end === "triangle" ? "t:" + e.type : "e:" + e.id);
  const groups = new Map<string, number[]>();
  for (const e of doc.edges) {
    if (routeOf(e) !== "ortho" || e.from === e.to || (e.from !== id && e.to !== id) || sideOf(e) !== side) continue;
    const other = boxes.get(e.from === id ? e.to : e.from);
    if (!other) continue;
    const c = centerOf(other);
    const k = trunk(e);
    groups.set(k, [...(groups.get(k) ?? []), level ? c.y : c.x]);
  }
  if (groups.size < 2) return 0;
  const order = [...groups].map(([k, at]) => ({ k, at: at.reduce((s, v) => s + v, 0) / at.length })).sort((p, q) => p.at - q.at || (p.k < q.k ? -1 : 1));
  const i = order.findIndex(g => g.k === trunk(edge));
  const [lo, hi] = span(box, level);
  const step = Math.min(18, (hi - lo) / (order.length - 1 || 1));
  return (i - (order.length - 1) / 2) * step;
}

/** The components a route should not cross: all but the two ends and the containers (a system boundary, a lane: lines cross those). */
const obstacles = (boxes: ReadonlyMap<string, NodeBox>, a: NodeBox, b: NodeBox): NodeBox[] =>
  [...boxes.values()].filter(x => x !== a && x !== b && !x.spec.resizable && x.form !== "lifeline");
/** How many components the route's runs pass through, or run along within 4 px of (that reads as touching them). */
function crossings(pts: [number, number][], obs: readonly NodeBox[]): number {
  let n = 0;
  for (const o of obs) {
    const x0 = o.x - 4, y0 = o.y - 4, x1 = o.x + o.w + 4, y1 = o.y + o.h + 4;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [p, q] = [pts[k], pts[k + 1]];
      const hit = p[1] === q[1]
        ? p[1] > y0 && p[1] < y1 && Math.max(p[0], q[0]) > x0 && Math.min(p[0], q[0]) < x1
        : p[0] > x0 && p[0] < x1 && Math.max(p[1], q[1]) > y0 && Math.min(p[1], q[1]) < y1;
      if (hit) { n++; break; }
    }
  }
  return n;
}

/** DG11 — an organisation chart's line from `a` (above) to `b` (below), or up the same way: out of the middle of the facing side, along
 *  a bar 30 px from the manager (the same bar for all his team, whatever their heights), into the middle of the other's facing side.
 *  Side by side (no gap between them up and down): null. */
function treePath(a: NodeBox, b: NodeBox): [number, number][] | null {
  const down = b.y >= a.y + a.h, up = a.y >= b.y + b.h;
  if (!down && !up) return null;
  const s = { x: a.x + a.w / 2, y: down ? a.y + a.h : a.y }, t = { x: b.x + b.w / 2, y: down ? b.y : b.y + b.h };
  const gap = Math.abs(t.y - s.y), bar = down ? s.y + Math.min(30, gap / 2) : s.y - Math.min(30, gap / 2);
  // within a pixel of each other: one upright line (never a slant)
  return Math.abs(s.x - t.x) < 1 ? [[s.x, s.y], [s.x, t.y]] : [[s.x, s.y], [s.x, bar], [t.x, bar], [t.x, t.y]];
}
/** DG9 — is `b` wholly above `a` (an arrow between them goes back up)? */
const above = (a: NodeBox, b: NodeBox) => b.y + b.h <= a.y;
/** A vertical lane at `x` moved outward (to the left or the right) past every component it would run through between `y0` and `y1`. */
function laneX(obs: readonly NodeBox[], x: number, y0: number, y1: number, side: "left" | "right"): number {
  for (let pass = 0; pass <= obs.length; pass++) {
    const hit = obs.find(o => o.y - 4 < y1 && o.y + o.h + 4 > y0 && x > o.x - 4 && x < o.x + o.w + 4);
    if (!hit) break;
    x = side === "left" ? hit.x - 30 : hit.x + hit.w + 30;
  }
  return x;
}
/** The same, for a level run at `y` between `x0` and `x1`, moved down (or up). */
function laneY(obs: readonly NodeBox[], y: number, x0: number, x1: number, side: "top" | "bottom"): number {
  for (let pass = 0; pass <= obs.length; pass++) {
    const hit = obs.find(o => o.x - 4 < x1 && o.x + o.w + 4 > x0 && y > o.y - 4 && y < o.y + o.h + 4);
    if (!hit) break;
    y = side === "top" ? hit.y - 30 : hit.y + hit.h + 30;
  }
  return y;
}
/** The sides of `box` its other right-angled arrows already use (those that do not go back up: their routes never ask this). An arrow
 *  coming back up into it takes its left side. */
function usedSides(doc: DiagramDoc, boxes: ReadonlyMap<string, NodeBox>, box: NodeBox, except: DEdge): Set<Side> {
  const used = new Set<Side>();
  const id = box.node.id;
  for (const o of doc.edges) {
    if (o === except || o.from === o.to || routeOf(o) !== "ortho" || (o.from !== id && o.to !== id)) continue;
    const other = boxes.get(o.from === id ? o.to : o.from);
    if (!other) continue;
    if (o.from === id ? above(box, other) : above(other, box)) { if (o.to === id) used.add("left"); continue; }
    const r = routeSides(doc, boxes, o);
    if (r) used.add(o.from === id ? r[0] : r[1]);
  }
  return used;
}
/** DG9 — a flowchart's arrow back up (a loop's return to its question): round the left of everything between, into the left side (a
 *  decision: its left corner) of the step it goes back to. It leaves by the left side; when that side is taken (an «if» that leaves
 *  by it with «نعم»), by the bottom, under the steps below first. Only a route crossing nothing is drawn (otherwise: null, and the
 *  arrow is routed as any other). */
function loopBack(doc: DiagramDoc, boxes: ReadonlyMap<string, NodeBox>, e: DEdge, a: NodeBox, b: NodeBox): [number, number][] | null {
  if (doc.kind !== "flowchart" || e.from === e.to || routeOf(e) !== "ortho" || !above(a, b)) return null;
  const obs = obstacles(boxes, a, b);
  const used = usedSides(doc, boxes, a, e);
  const ca = centerOf(a), cb = centerOf(b);
  const t = sidePoint(b, "left", clampTo(cb.y, span(b, true)));
  const tries: [number, number][][] = [];
  if (!used.has("left")) {
    const s = sidePoint(a, "left", clampTo(ca.y, span(a, true)));
    const x = laneX(obs, Math.min(a.x, b.x) - 30, t.y, s.y, "left");
    tries.push([[s.x, s.y], [x, s.y], [x, t.y], [t.x, t.y]]);
  }
  if (!used.has("bottom")) {
    const s = sidePoint(a, "bottom", clampTo(ca.x, span(a, false)));
    let x = Math.min(a.x, b.x) - 30, y = a.y + a.h + 18;
    for (let k = 0; k < 3; k++) { y = laneY(obs, y, x, s.x, "bottom"); x = laneX(obs, x, t.y, y, "left"); }
    tries.push([[s.x, s.y], [s.x, y], [x, y], [x, t.y], [t.x, t.y]]);
  }
  return tries.find(r => !crossings(r, obs)) ?? null;
}

/** From `a` to `b` in level and upright runs: one straight run when the two face each other (side by side, or one over the other),
 *  else out of the facing sides and across in the middle (a Z). Should that pass through another component, the other shapes are tried
 *  (an L either way, the Z the other way) and the one crossing fewest is drawn. Boxes that overlap have no such route (null: a straight
 *  line). `pa` / `pb`: the arrow's place along each side (see `port`). */
function orthoPath(a: NodeBox, b: NodeBox, off: number, pa = 0, pb = 0, obs: readonly NodeBox[] = [], prefer?: "sideFirst" | "downFirst",
  real?: [Side, Side] | null): EdgePath | null {
  const p = plan(a, b);
  if (!p) return null;
  const ca = centerOf(a), cb = centerOf(b);
  // the spreading was worked out for the sides the arrow really uses
  const [ra0, rb0] = real ?? [p.sa, p.sb];
  const portA = (side: Side) => (side === ra0 ? pa : 0), portB = (side: Side) => (side === rb0 ? pb : 0);
  const zRoute = (level: boolean): [number, number][] | null => {
    if ((level ? Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w)) : Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h))) <= 0) return null;
    const sa: Side = level ? (cb.x >= ca.x ? "right" : "left") : (cb.y >= ca.y ? "bottom" : "top");
    const sb: Side = level ? (sa === "right" ? "left" : "right") : (sa === "bottom" ? "top" : "bottom");
    const ra = span(a, level), rb = span(b, level);
    const lo = Math.max(ra[0], rb[0]), hi = Math.min(ra[1], rb[1]);
    if (lo <= hi) {   // they face each other: one straight run
      const at = clampTo(((level ? ca.y + cb.y : ca.x + cb.x) / 2) + off + portA(sa) + portB(sb), [lo, hi]);
      const s = sidePoint(a, sa, at), t = sidePoint(b, sb, at);
      return [[s.x, s.y], [t.x, t.y]];
    }
    const s = sidePoint(a, sa, clampTo((level ? ca.y : ca.x) + off + portA(sa), ra)), t = sidePoint(b, sb, clampTo((level ? cb.y : cb.x) + off + portB(sb), rb));
    const m = (level ? (s.x + t.x) / 2 : (s.y + t.y) / 2) + off;
    return level ? [[s.x, s.y], [m, s.y], [m, t.y], [t.x, t.y]] : [[s.x, s.y], [s.x, m], [t.x, m], [t.x, t.y]];
  };
  /** Out of `a` level (or upright), one turn, into `b` upright (or level): only when each run leaves and enters squarely. */
  const lRoute = (levelFirst: boolean): [number, number][] | null => {
    if (levelFirst ? (cb.x >= a.x && cb.x <= a.x + a.w) || (ca.y >= b.y && ca.y <= b.y + b.h) : (cb.y >= a.y && cb.y <= a.y + a.h) || (ca.x >= b.x && ca.x <= b.x + b.w)) return null;
    const sa: Side = levelFirst ? (cb.x >= ca.x ? "right" : "left") : (cb.y >= ca.y ? "bottom" : "top");
    const sb: Side = levelFirst ? (ca.y <= cb.y ? "top" : "bottom") : (ca.x <= cb.x ? "left" : "right");
    const s = sidePoint(a, sa, clampTo((levelFirst ? ca.y : ca.x) + portA(sa), span(a, levelFirst)));
    const t = sidePoint(b, sb, clampTo((levelFirst ? cb.x : cb.y) + portB(sb), span(b, !levelFirst)));
    return levelFirst ? [[s.x, s.y], [t.x, s.y], [t.x, t.y]] : [[s.x, s.y], [s.x, t.y], [t.x, t.y]];
  };
  // DG9: in a flowchart, a step's arrow down into a question comes in by its top corner (its side corners are its «نعم» / «لا»):
  // branches that join again before a question meet over it
  if (prefer === "downFirst" && POINTED.includes(b.form) && b.y >= a.y + a.h) {
    // down from the step's bottom and across a bar just over the question (every branch joins it on the same bar)
    const s = sidePoint(a, "bottom", clampTo(ca.x, span(a, false))), t = { x: cb.x, y: b.y };
    const bar = t.y - 18 > s.y + 4 ? t.y - 18 : (s.y + t.y) / 2;
    const z: [number, number][] = Math.abs(s.x - t.x) < 1 ? [[t.x, s.y], [t.x, t.y]] : [[s.x, s.y], [s.x, bar], [t.x, bar], [t.x, t.y]];
    if (!crossings(z, obs)) return polyline(z);
  }
  // a preferred one-turn shape, when it can be drawn and crosses nothing
  const liked = prefer ? lRoute(prefer === "sideFirst") : null;
  if (liked && !crossings(liked, obs)) return polyline(liked);
  const first = zRoute(p.level);
  if (!first) return null;
  if (!obs.length || !crossings(first, obs)) return polyline(first, undefined, prefer === "sideFirst");
  /** Around the outside (a loop back): out of the same side of both, past the further one — DG9: and past whatever stands in the way
   *  of the run along the outside — and in (a C). */
  const cRoute = (side: Side): [number, number][] => {
    if (side === "left" || side === "right") {
      const s = sidePoint(a, side, clampTo(ca.y, span(a, true))), t = sidePoint(b, side, clampTo(cb.y, span(b, true)));
      const x = laneX(obs, side === "left" ? Math.min(a.x, b.x) - 30 : Math.max(a.x + a.w, b.x + b.w) + 30, Math.min(s.y, t.y), Math.max(s.y, t.y), side);
      return [[s.x, s.y], [x, s.y], [x, t.y], [t.x, t.y]];
    }
    const s = sidePoint(a, side, clampTo(ca.x, span(a, false))), t = sidePoint(b, side, clampTo(cb.x, span(b, false)));
    const y = laneY(obs, side === "top" ? Math.min(a.y, b.y) - 30 : Math.max(a.y + a.h, b.y + b.h) + 30, Math.min(s.x, t.x), Math.max(s.x, t.x), side);
    return [[s.x, s.y], [s.x, y], [t.x, y], [t.x, t.y]];
  };
  let best = first, fewest = crossings(first, obs);
  // DG9: a flowchart goes round the right first (a loop's «لا» leaves its right corner; the left is the way back up)
  const around: readonly Side[] = prefer ? ["right", "left", "bottom", "top"] : ["left", "right", "top", "bottom"];
  for (const r of [lRoute(p.level), lRoute(!p.level), zRoute(!p.level), ...around.map(cRoute)]) {
    if (!r) continue;
    const c = crossings(r, obs);
    if (c < fewest) { best = r; fewest = c; }
  }
  return polyline(best, undefined, prefer === "sideFirst");
}

/** The arrow under a point (within `tol` px of its line), the last drawn first. */
export function edgeAt(paths: ReadonlyMap<string, EdgePath>, x: number, y: number, tol = 7): string | null {
  let best: string | null = null, bestD = tol;
  for (const [id, p] of paths) {
    for (let i = 0; i + 1 < p.pts.length; i++) {
      const d = segDist(x, y, p.pts[i], p.pts[i + 1]);
      if (d <= bestD) { bestD = d; best = id; }
    }
  }
  return best;
}
function segDist(x: number, y: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0;
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}

/** The drawing's extent (for the picture): every component and arrow, with a margin. */
export function contentBounds(doc: DiagramDoc, boxes: ReadonlyMap<string, NodeBox>, margin = 24): { x: number; y: number; w: number; h: number } | null {
  if (!boxes.size) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes.values()) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  if (doc.kind === "sequence") y1 = Math.max(y1, lifelineBottom(doc));
  for (const e of doc.edges) {
    if (e.from === e.to) { const a = boxes.get(e.from); if (a) { x1 = Math.max(x1, a.x + a.w + 80); y0 = Math.min(y0, a.y - 50); } }
    // DG6: a right-angled arrow can go round the outside (a loop back): the picture holds its whole route
    else if (routeOf(e) === "ortho" && doc.kind !== "sequence") {
      for (const [x, y] of edgePath(doc, e, boxes)?.pts ?? []) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
  }
  // the texts beside the lines can reach a little past the components
  x0 -= margin; y0 -= margin; x1 += margin; y1 += margin;
  return { x: Math.max(0, Math.floor(x0)), y: Math.max(0, Math.floor(y0)), w: Math.ceil(x1 - Math.max(0, x0)), h: Math.ceil(y1 - Math.max(0, y0)) };
}

/** The component under a point (the topmost; a container only when nothing else is there). */
export function nodeAt(doc: DiagramDoc, boxes: ReadonlyMap<string, NodeBox>, x: number, y: number, except?: string): string | null {
  let container: string | null = null;
  for (let i = doc.nodes.length - 1; i >= 0; i--) {
    const n = doc.nodes[i];
    if (n.id === except) continue;
    const b = boxes.get(n.id);
    if (!b) continue;
    const bottom = b.form === "lifeline" ? lifelineBottom(doc) : b.y + b.h;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= bottom) {
      if (b.spec.resizable) { container ??= n.id; continue; }
      return n.id;
    }
  }
  return container;
}
