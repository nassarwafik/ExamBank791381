// «محرّر المخططات» — how big each component is drawn (it grows with its text), where an arrow meets its border, and the arrows' paths.
// Pure but for `measureText`, which uses a canvas when the page has one (the app's own font) and a fair estimate otherwise.

import { nodeSpec, type NodeSpec, type ShapeForm } from "./diagramCatalog";
import { SEQ_STEP, type DEdge, type DiagramDoc, type DNode } from "./diagramDoc";

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
    case "rect": case "round": case "doubleRect": case "component": case "cylinder": case "note": {
      if (form === "note") { title = linesOf(t.name); sections = []; }
      const extra = form === "component" ? 34 : form === "doubleRect" ? 12 : 0;
      w = Math.max(w, widest(title, FONT_SIZE, form !== "note") + 28 + extra);
      if (form === "round" && lineFields.length) {   // a state's body under its name
        sections = [linesOf(t.body)].filter(s => s.length);
        if (sections.length) w = Math.max(w, widest(sections[0], SMALL) + 28);
      }
      const bodyH = sections.length ? 8 + sections[0].length * SMALL_LINE : 0;
      h = Math.max(h, title.length * LINE + 22 + bodyH + (form === "cylinder" ? 22 : 0));
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
  const pa = anchorToward(a, cb.x + nx * off * 2, cb.y + ny * off * 2);
  const pb = anchorToward(b, ca.x + nx * off * 2, ca.y + ny * off * 2);
  const s = { x: pa.x + nx * (same.length > 1 ? off * 0.6 : 0), y: pa.y + ny * (same.length > 1 ? off * 0.6 : 0) };
  const t = { x: pb.x + nx * (same.length > 1 ? off * 0.6 : 0), y: pb.y + ny * (same.length > 1 ? off * 0.6 : 0) };
  const ux = (t.x - s.x) / (Math.hypot(t.x - s.x, t.y - s.y) || 1), uy = (t.y - s.y) / (Math.hypot(t.x - s.x, t.y - s.y) || 1);
  const mid = { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 };
  const side = (p: { x: number; y: number }, dir: number) => ({ x: p.x + ux * 22 * dir - uy * 12, y: p.y + uy * 22 * dir + ux * 12 });
  return { d: `M${r1(s.x)},${r1(s.y)} L${r1(t.x)},${r1(t.y)}`, mid, fromAt: side(s, 1), toAt: side(t, -1), angle: Math.atan2(t.y - s.y, t.x - s.x) * 180 / Math.PI, pts: [[s.x, s.y], [t.x, t.y]] };
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
