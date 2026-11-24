import type { OgGraph, OgNode } from "./objectGraph";

/**
 * Visual lab V13 (docs/enterprise-csharp-visual-lab-plan.md §23) — WHERE the object diagram's boxes go. Pure: numbers in, numbers out.
 *
 * V10 stacked each column from the top in the order the boxes were found, so an arrow often ran far up or down and crossed others.
 * Now, column by column from the left:
 *   • a box's WANTED height is level with the rows that refer to it (the average of their heights; for column 1 the variables);
 *   • the column is ordered by that height (ties: the order found), then placed top-down at its wanted height, pushed down only as
 *     far as needed to keep the gap — so a box with one parent gets a straight, level arrow, and a shared box sits between its parents;
 *   • the variables are then placed level with the box they refer to (pushed down likewise).
 * A box nothing on its left refers to keeps the order found, under the others. `crossings` counts the arrows that cross (straight
 * lines from a row, or a variable, to a box further right), so a layout can be measured.
 */
export const OL = { HEAD: 26, ROW: 24, GAP_X: 72, GAP_Y: 22, CHIP: 24, CHIP_GAP: 12, PAD: 8 } as const;
export type Box = { id: number; col: number; x: number; y: number; w: number; h: number; keyW: number };
export type PlacedRoot = { name: string; top: boolean; target: number; y: number };
export type ObjectLayout = { boxes: Map<number, Box>; roots: PlacedRoot[]; rootW: number; width: number; height: number };

const rowsOf = (n: OgNode) => Math.max(1, n.rows.length + (n.more ? 1 : 0));
/** The height of row `i`'s middle in a box at `y`. */
export const rowMid = (y: number, i: number) => y + OL.HEAD + i * OL.ROW + OL.ROW / 2;
const headMid = (y: number) => y + OL.HEAD / 2;

export function layoutObjects(g: OgGraph, measure: (n: OgNode) => { w: number; keyW: number }, rootW: number): ObjectLayout {
  const cols = Math.max(1, ...g.nodes.map(n => n.col));
  const sizes = new Map(g.nodes.map(n => [n.id, measure(n)]));
  const colW = Array.from({ length: cols }, (_, c) => Math.max(0, ...g.nodes.filter(n => n.col === c + 1).map(n => sizes.get(n.id)!.w)));
  const colX = colW.map((_, c) => OL.PAD + (rootW ? rootW + OL.GAP_X : 0) + colW.slice(0, c).reduce((a, w) => a + w + OL.GAP_X, 0));
  const order = new Map(g.nodes.map((n, i) => [n.id, i]));
  const boxes = new Map<number, Box>();
  // where the variables are before the boxes are placed: stacked from the top, in their order
  const firstRootY = g.roots.map((_, k) => OL.PAD + k * (OL.CHIP + OL.CHIP_GAP) + OL.CHIP / 2);

  for (let c = 1; c <= cols; c++) {
    const inCol = g.nodes.filter(n => n.col === c);
    const wanted = new Map<number, number>();
    for (const n of inCol) {
      const from: number[] = [];
      if (c === 1) g.roots.forEach((r, k) => { if (r.target === n.id) from.push(firstRootY[k]); });
      for (const b of boxes.values()) {
        if (b.col >= c) continue;
        const src = g.nodes[order.get(b.id)!];
        src.rows.forEach((r, i) => { if (r.ref === n.id) from.push(rowMid(b.y, i)); });
      }
      if (from.length) wanted.set(n.id, from.reduce((a, y) => a + y, 0) / from.length);
    }
    const sorted = [...inCol].sort((a, b) => {
      const wa = wanted.get(a.id), wb = wanted.get(b.id);
      if (wa !== undefined && wb !== undefined && wa !== wb) return wa - wb;
      if ((wa === undefined) !== (wb === undefined)) return wa === undefined ? 1 : -1;
      return order.get(a.id)! - order.get(b.id)!;
    });
    let cursor = OL.PAD;
    for (const n of sorted) {
      const h = OL.HEAD + rowsOf(n) * OL.ROW;
      const want = wanted.get(n.id);
      const y = Math.max(cursor, want === undefined ? cursor : want - OL.HEAD / 2);
      const { w, keyW } = sizes.get(n.id)!;
      boxes.set(n.id, { id: n.id, col: c, x: colX[c - 1], y, w, h, keyW });
      cursor = y + h + OL.GAP_Y;
    }
  }
  // the variables, level with their box (in the order of their box's height; pushed down to keep their gap)
  const roots: PlacedRoot[] = [];
  let cursor = OL.PAD;
  for (const r of [...g.roots].sort((a, b) => (boxes.get(a.target)?.y ?? 0) - (boxes.get(b.target)?.y ?? 0))) {
    const b = boxes.get(r.target);
    const y = Math.max(cursor, b ? headMid(b.y) - OL.CHIP / 2 : cursor);
    roots.push({ ...r, y });
    cursor = y + OL.CHIP + OL.CHIP_GAP;
  }
  const bottom = Math.max(cursor, ...[...boxes.values()].map(b => b.y + b.h + OL.GAP_Y));
  return { boxes, roots, rootW, width: colX[cols - 1] + colW[cols - 1] + 90, height: bottom - OL.GAP_Y + OL.PAD };
}

type Seg = { x1: number; y1: number; x2: number; y2: number };
/** The arrows drawn as straight lines from where they leave (a row's right side, a variable) to the box they enter (its left side,
 *  at its header), for the arrows that go RIGHT (an arrow back is drawn round the right side, apart). */
export function segmentsOf(g: OgGraph, l: ObjectLayout): Seg[] {
  const segs: Seg[] = [];
  for (const r of l.roots) { const b = l.boxes.get(r.target); if (b) segs.push({ x1: OL.PAD + l.rootW, y1: r.y + OL.CHIP / 2, x2: b.x, y2: headMid(b.y) }); }
  for (const n of g.nodes) {
    const a = l.boxes.get(n.id)!;
    n.rows.forEach((r, i) => {
      const b = r.ref === null ? undefined : l.boxes.get(r.ref);
      if (b && b.x > a.x) segs.push({ x1: a.x + a.w, y1: rowMid(a.y, i), x2: b.x, y2: headMid(b.y) });
    });
  }
  return segs;
}
/** How many pairs of those arrows cross (two arrows that meet at a box or leave one row do not count). */
export function crossings(g: OgGraph, l: ObjectLayout): number {
  const s = segmentsOf(g, l);
  const side = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
  let n = 0;
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
    const p = s[i], q = s[j];
    if ((p.x2 === q.x2 && p.y2 === q.y2) || (p.x1 === q.x1 && p.y1 === q.y1)) continue;
    const d1 = side(p.x1, p.y1, p.x2, p.y2, q.x1, q.y1), d2 = side(p.x1, p.y1, p.x2, p.y2, q.x2, q.y2);
    const d3 = side(q.x1, q.y1, q.x2, q.y2, p.x1, p.y1), d4 = side(q.x1, q.y1, q.x2, q.y2, p.x2, p.y2);
    if (d1 * d2 < 0 && d3 * d4 < 0) n++;
  }
  return n;
}
