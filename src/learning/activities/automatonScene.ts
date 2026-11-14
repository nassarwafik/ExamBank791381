import { drawnEdges, edgeKey, type DrawnEdge, type Machine } from "./automaton";

// The LAYOUT of the state diagram of a finite / push-down automaton or a Turing machine (pure; the view is automatonDiagram.tsx), shared by «تتبّع الآلة خطوة بخطوة» (AUTO-A1,
// AutomatonTraceActivity) and «صمّم الآلة» (AUTO-A3, AutomatonDesignActivity): the same layout, arrows and labels in both, so a
// machine the learner builds is drawn exactly like the machines of the lessons. Pure layout + an SVG view; no state, no effects.

const CELL_W = 150, CELL_H = 120, CHAR_W = 7.8;
export const LINE_H = 15;
/** The circle radius and name size for a machine: a short name (q0) in the standard circle, a long one (q0p0t0 of a product
 *  automaton, q0q1q2 of a subset conversion) in a smaller font and a wider circle, so a name never spills out of its state. */
function stateSizing(states: string[]): { r: number; font: number } {
  const longest = Math.max(...states.map(s => [...s].length));
  const font = longest <= 3 ? 15 : longest <= 5 ? 13 : 11;
  return { font, r: Math.max(24, Math.ceil((longest * font * 0.62) / 2) + 7) };
}
export const KIND_TEXT: Record<Machine["kind"], string> = { DFA: "أوتومات منتهٍ حتمي", NFA: "أوتومات منتهٍ غير حتمي", PDA: "أوتومات مكدّس", TM: "آلة تورنغ" };
/** The drawing never shrinks below this share of its natural size on a narrow screen (then its box scrolls instead). */
export const MIN_SCALE = 0.72;

type Pt = { x: number; y: number };
type Box = { x1: number; y1: number; x2: number; y2: number };
export type Placed = { lines: string[]; at: Pt; anchor: "start" | "middle" | "end"; grow: "up" | "down" | "center" };

/** Where a straight segment a→b passes closer than `r` to a point (another state in the way). */
const passesNear = (a: Pt, b: Pt, p: Pt, r: number) => {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  if (!len2) return false;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y) < r;
};
/** The candidate directions around a state, in order of preference (up, down, the sides, the diagonals). */
const SLOTS = [-90, 90, 0, 180, -45, -135, 45, 135].map(d => (d * Math.PI) / 180);
const angleGap = (a: number, b: number) => { const d = Math.abs(a - b) % (2 * Math.PI); return Math.min(d, 2 * Math.PI - d); };
/** The free slot farthest from every arrow touching the state (ties keep the preference order). */
const freeSlot = (taken: number[], skip: number[] = [], slots: number[] = SLOTS) => {
  let best = slots[0], score = -1;
  for (const s of slots) {
    if (skip.some(k => angleGap(k, s) < 0.01)) continue;
    const gap = taken.length ? Math.min(...taken.map(a => angleGap(a, s))) : Math.PI;
    if (gap > score + 0.05) { best = s; score = gap; }
  }
  return best;
};
const unit = (a: number): Pt => ({ x: Math.cos(a), y: Math.sin(a) });
/** How a text block sits beside a point in direction `a` (anchor + which way its lines stack). */
const placeAt = (lines: string[], p: Pt, a: number): Placed => {
  const u = unit(a);
  return { lines, at: p, anchor: u.x > 0.5 ? "start" : u.x < -0.5 ? "end" : "middle", grow: u.y < -0.5 ? "up" : u.y > 0.5 ? "down" : "center" };
};
const textWidth = (lines: string[]) => Math.max(...lines.map(l => [...l].length)) * CHAR_W;
const textBox = (pl: Placed): Box => {
  const w = textWidth(pl.lines), h = pl.lines.length * LINE_H;
  const x1 = pl.anchor === "start" ? pl.at.x : pl.anchor === "end" ? pl.at.x - w : pl.at.x - w / 2;
  const y1 = pl.grow === "up" ? pl.at.y - h + 4 : pl.grow === "down" ? pl.at.y - 4 : pl.at.y - h / 2;
  return { x1, y1, x2: x1 + w, y2: y1 + h };
};
/** The baseline of the first line, so the block grows the chosen way from its anchor point. */
export const firstBaseline = (pl: Placed) => {
  const n = pl.lines.length;
  return pl.grow === "up" ? pl.at.y - (n - 1) * LINE_H : pl.grow === "down" ? pl.at.y + 12 : pl.at.y - ((n - 1) * LINE_H) / 2 + 5;
};

export type Scene = {
  r: number;
  font: number;
  pos: Record<string, Pt>;
  edges: { e: DrawnEdge; d: string; label: Placed }[];
  stateLabels: Record<string, Placed>;
  start: { d: string };
  box: Box;
};

/** Lays the whole drawing out once per machine: arrows, loops on the freest side, labels clear of the arrows, the bounds. */
export function buildScene(machine: Machine, layout: Record<string, [number, number]>): Scene {
  const { r: R, font } = stateSizing(machine.states);
  const cw = Math.max(CELL_W, 2 * R + 100), ch = Math.max(CELL_H, 2 * R + 72);
  const pos: Record<string, Pt> = {};
  for (const s of machine.states) { const [c, r] = layout[s]; pos[s] = { x: c * cw, y: r * ch }; }
  const all = drawnEdges(machine);
  const pairs = new Set(all.map(e => e.key));
  const touching: Record<string, number[]> = Object.fromEntries(machine.states.map(s => [s, [] as number[]]));
  const startAngle = Math.PI;                                            // the start arrow comes in from the left
  touching[machine.start].push(startAngle);
  const edges: Scene["edges"] = [];
  const curvePeaks: Pt[] = [];                                           // the farthest point of each bent arrow, for the bounds
  const pending: { e: DrawnEdge }[] = [];
  for (const e of all) {
    if (e.from === e.to) { pending.push({ e }); continue; }
    const a = pos[e.from], b = pos[e.to];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len;                                 // the left-hand normal of a→b
    const blocked = Object.entries(pos).some(([s, p]) => s !== e.from && s !== e.to && passesNear(a, b, p, R + 10));
    const bend = pairs.has(edgeKey(e.to, e.from)) ? 26 : blocked ? 62 : 0;
    const c = { x: (a.x + b.x) / 2 + nx * bend * 2, y: (a.y + b.y) / 2 + ny * bend * 2 };
    const toward = (from: Pt, to: Pt, dist: number) => { const l = Math.hypot(to.x - from.x, to.y - from.y) || 1; return { x: from.x + (to.x - from.x) / l * dist, y: from.y + (to.y - from.y) / l * dist }; };
    const s = toward(a, bend ? c : b, R), t = toward(b, bend ? c : a, R + 2);
    touching[e.from].push(Math.atan2((bend ? c : b).y - a.y, (bend ? c : b).x - a.x));
    touching[e.to].push(Math.atan2((bend ? c : a).y - b.y, (bend ? c : a).x - b.x));
    const mid = bend ? { x: (s.x + 2 * c.x + t.x) / 4, y: (s.y + 2 * c.y + t.y) / 4 } : { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 };
    if (bend) {
      curvePeaks.push(mid);
      // a state this arrow bends around sees the arrow on that side (so its loop and label go elsewhere)
      for (const [st, p] of Object.entries(pos)) if (st !== e.from && st !== e.to && passesNear(a, b, p, R + 10)) touching[st].push(Math.atan2(mid.y - p.y, mid.x - p.x));
    }
    const side = Math.atan2(ny, nx);
    edges.push({ e, d: bend ? `M ${s.x} ${s.y} Q ${c.x} ${c.y} ${t.x} ${t.y}` : `M ${s.x} ${s.y} L ${t.x} ${t.y}`, label: placeAt(e.labels, { x: mid.x + nx * 10, y: mid.y + ny * 10 }, side) });
  }
  const loopAt: Record<string, number> = {};
  for (const { e } of pending) {
    const a = pos[e.from];
    // a loop goes straight up or down when either side is reasonably free (a sideways loop pushes its label past the edge)
    const upDown = freeSlot(touching[e.from], [], [SLOTS[0], SLOTS[1]]);
    const clear = touching[e.from].every(x => angleGap(x, upDown) >= Math.PI / 4);
    const ang = clear ? upDown : freeSlot(touching[e.from]);
    loopAt[e.from] = ang;
    touching[e.from].push(ang);
    const p1 = { x: a.x + Math.cos(ang - 0.5) * R, y: a.y + Math.sin(ang - 0.5) * R };
    const p2 = { x: a.x + Math.cos(ang + 0.5) * R, y: a.y + Math.sin(ang + 0.5) * R };
    const c1 = { x: a.x + Math.cos(ang - 0.62) * (R + 52), y: a.y + Math.sin(ang - 0.62) * (R + 52) };
    const c2 = { x: a.x + Math.cos(ang + 0.62) * (R + 52), y: a.y + Math.sin(ang + 0.62) * (R + 52) };
    const tip = { x: a.x + Math.cos(ang) * (R + 44), y: a.y + Math.sin(ang) * (R + 44) };
    edges.push({ e, d: `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`, label: placeAt(e.labels, tip, ang) });
  }
  const stateLabels: Scene["stateLabels"] = {};
  for (const s of machine.states) {
    const text = machine.stateLabels[s];
    if (!text) continue;
    const ang = freeSlot(touching[s], loopAt[s] === undefined ? [] : [loopAt[s]]);
    const u = unit(ang);
    stateLabels[s] = placeAt([text], { x: pos[s].x + u.x * (R + 8), y: pos[s].y + u.y * (R + 8) }, ang);
  }
  const sp = pos[machine.start];
  const start = { d: `M ${sp.x - R - 40} ${sp.y} L ${sp.x - R - 2} ${sp.y}` };
  const box: Box = { x1: sp.x - R - 44, y1: Infinity, x2: -Infinity, y2: -Infinity };
  const grow = (b: Box) => { box.x1 = Math.min(box.x1, b.x1); box.y1 = Math.min(box.y1, b.y1); box.x2 = Math.max(box.x2, b.x2); box.y2 = Math.max(box.y2, b.y2); };
  for (const p of Object.values(pos)) grow({ x1: p.x - R - 2, y1: p.y - R - 2, x2: p.x + R + 2, y2: p.y + R + 2 });
  for (const { e, label } of edges) {
    grow(textBox(label));
    if (e.from === e.to) { const a = pos[e.from], ang = loopAt[e.from]; grow({ x1: a.x + Math.cos(ang) * (R + 46) - 30, y1: a.y + Math.sin(ang) * (R + 46) - 30, x2: a.x + Math.cos(ang) * (R + 46) + 30, y2: a.y + Math.sin(ang) * (R + 46) + 30 }); }

  }
  for (const l of Object.values(stateLabels)) grow(textBox(l));
  for (const p of curvePeaks) grow({ x1: p.x - 4, y1: p.y - 4, x2: p.x + 4, y2: p.y + 4 });
  return { r: R, font, pos, edges, stateLabels, start, box: { x1: box.x1 - 12, y1: box.y1 - 12, x2: box.x2 + 12, y2: box.y2 + 12 } };
}
