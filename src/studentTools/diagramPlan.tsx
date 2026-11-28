// DG12 «مخطط مبنى إداري» (docs/enterprise-diagram-editor-design.md §24) — how a building's plan is drawn: a room (its floor and its
// thick walls), and each piece (a door, a window, a desk, a chair…) as a small original drawing in its own box. Plain SVG with its paint
// written on each element (no CSS, no ids, no clip paths), on white paper, so a picture saved as PNG or SVG is what the learner sees.

import type { ReactNode } from "react";
import { DIAGRAM_COLORS, isTurn, type FurniturePiece } from "./diagramCatalog";
import { FONT_FAMILY, PLAN_LABEL_GAP, SMALL, SMALL_LINE, measureText, textDir, type NodeBox } from "./diagramLayout";

const INK = "#1f2937";
/** A room's floor (a warm light beige), the building's corridor (lighter), and the walls' thickness. */
export const FLOOR = "#fbf1e7", CORRIDOR = "#f8f5f0", WALL = 7;
const WOOD = "#e3bf8f", WOOD_DARK = "#9a6b3c", SEAT = "#4b5563", SEAT_DARK = "#1f2937", BLUE = "#60a5fa", BLUE_DARK = "#1e40af";
const GLASS = "#cfeaf8", LEAF = "#22a34a", LEAF_DARK = "#15803d", POT = "#d6a46a", METAL = "#94a3b8", BOX = "#d9a066", BINDER = "#2563eb";

/** A label on a white patch with a dark border («الاستقبال», «المدخل الرئيسي», a room's name). */
function Label({ lines, cx, top }: { lines: readonly string[]; cx: number; top: number }) {
  if (!lines.some(Boolean)) return null;
  const w = Math.max(...lines.map(l => measureText(l, SMALL, true))) + 20, h = lines.length * SMALL_LINE + 8;
  return (
    <g>
      <rect x={cx - w / 2} y={top} width={w} height={h} rx={7} fill="#ffffff" stroke={INK} strokeWidth={1.3} />
      {lines.map((l, i) => (
        <text key={i} x={cx} y={top + 4 + SMALL_LINE / 2 + i * SMALL_LINE} fontFamily={FONT_FAMILY} fontSize={SMALL} fontWeight={600} fill={INK}
          textAnchor="middle" dominantBaseline="central" direction={textDir(l)}>{l}</text>
      ))}
    </g>
  );
}

/** A room, or the building itself: the floor, then the walls drawn inside its box (so two rooms side by side share one wall line). */
export function RoomShape({ b }: { b: NodeBox }) {
  const building = b.node.type === "building";
  const floor = b.node.color === "none" ? (building ? CORRIDOR : FLOOR) : DIAGRAM_COLORS[b.node.color].fill;
  const half = WALL / 2;
  return <>
    <rect x={b.x + half} y={b.y + half} width={b.w - WALL} height={b.h - WALL} fill={floor} stroke={INK} strokeWidth={building ? WALL + 2 : WALL} strokeLinejoin="miter" />
    <Label lines={b.title} cx={b.x + b.w / 2} top={b.y + WALL + 6} />
  </>;
}

/** An office chair seen from the front: its back, its seat and its foot. */
const Chair = ({ x, y, w = 26, fill = SEAT }: { x: number; y: number; w?: number; fill?: string }) => <g>
  <rect x={x + 3} y={y} width={w - 6} height={w * 0.75} rx={5} fill={fill} stroke={SEAT_DARK} strokeWidth={1} />
  <rect x={x} y={y + w * 0.7} width={w} height={w * 0.28} rx={3} fill={fill} stroke={SEAT_DARK} strokeWidth={1} />
  <path d={`M${x + w / 2},${y + w} V${y + w * 1.25} M${x + 3},${y + w * 1.3} H${x + w - 3}`} stroke={SEAT_DARK} strokeWidth={2} strokeLinecap="round" />
</g>;
/** A screen on its foot. */
const Screen = ({ x, y }: { x: number; y: number }) => <g>
  <rect x={x} y={y} width={26} height={17} rx={2} fill="#334155" stroke={SEAT_DARK} strokeWidth={1} />
  <rect x={x + 2.5} y={y + 2.5} width={21} height={11} rx={1} fill="#93c5fd" />
  <path d={`M${x + 13},${y + 17} V${y + 21} M${x + 8},${y + 21.5} H${x + 18}`} stroke={SEAT_DARK} strokeWidth={2} strokeLinecap="round" />
</g>;
/** A row of binders on a shelf (blue spines with a white label). */
const Binders = ({ x, y, n, h = 16 }: { x: number; y: number; n: number; h?: number }) => <g>
  {Array.from({ length: n }, (_, i) => <g key={i}><rect x={x + i * 6} y={y} width={5} height={h} fill={BINDER} stroke={BLUE_DARK} strokeWidth={0.6} /><rect x={x + i * 6 + 1} y={y + 3} width={3} height={3} fill="#fff" /></g>)}
</g>;
/** A cardboard box. */
const Box = ({ x, y, w = 20, h = 14 }: { x: number; y: number; w?: number; h?: number }) => <g>
  <rect x={x} y={y} width={w} height={h} fill={BOX} stroke="#8a5a2b" strokeWidth={0.9} /><path d={`M${x + w / 2 - 3},${y} V${y + 4} H${x + w / 2 + 3} V${y}`} fill="none" stroke="#8a5a2b" strokeWidth={0.8} />
</g>;
/** A small plant in its pot. */
const Plant = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => <g transform={`translate(${x},${y}) scale(${s})`}>
  <path d="M18,24 C10,20 4,14 3,6 C10,8 15,14 18,24 Z M18,24 C26,20 32,14 33,6 C26,8 21,14 18,24 Z M18,24 C14,15 14,6 18,0 C22,6 22,15 18,24 Z M18,24 C9,24 3,20 0,15 C8,14 14,18 18,24 Z M18,24 C27,24 33,20 36,15 C28,14 22,18 18,24 Z"
    fill={LEAF} stroke={LEAF_DARK} strokeWidth={0.9} strokeLinejoin="round" />
  <path d="M9,26 H27 L24,44 H12 Z" fill={POT} stroke={WOOD_DARK} strokeWidth={1} strokeLinejoin="round" /><rect x={8} y={24} width={20} height={4} rx={1} fill={POT} stroke={WOOD_DARK} strokeWidth={1} />
</g>;

/** The piece's drawing, in its own box (`w` × `h`, its size in the catalog) with its top-left corner at x, y. */
function pieceArt(p: FurniturePiece, w: number, h: number): ReactNode {
  switch (p) {
    case "door": return <>   {/* in the top wall, opening down: the gap in the wall, the leaf, and the arc it sweeps */}
      <rect x={0} y={-1} width={w} height={WALL + 2} fill={FLOOR} />
      <path d={`M2,${WALL / 2} V${h - 2}`} stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
      <path d={`M2,${h - 2} A${h - 2 - WALL / 2},${h - 2 - WALL / 2} 0 0 0 ${w - 2},${WALL / 2}`} fill="none" stroke={INK} strokeWidth={1.2} />
      <path d={`M0,0 V${WALL} M${w},0 V${WALL}`} stroke={INK} strokeWidth={2} />
    </>;
    case "entrance": return <>   {/* a glass double door standing open, its step under it */}
      <rect x={0} y={h - 12} width={w} height={12} fill="#e5e7eb" stroke={METAL} strokeWidth={1} />
      <path d={`M${w / 4},${h - 12} V${h} M${w / 2},${h - 12} V${h} M${(3 * w) / 4},${h - 12} V${h}`} stroke={METAL} strokeWidth={0.8} />
      <path d={`M6,${h - 12} V16 Q6,4 ${w / 2 - 2},4 V${h - 12} Z`} fill={GLASS} stroke="#1e3a5f" strokeWidth={1.4} strokeLinejoin="round" />
      <path d={`M${w - 6},${h - 12} V16 Q${w - 6},4 ${w / 2 + 2},4 V${h - 12} Z`} fill={GLASS} stroke="#1e3a5f" strokeWidth={1.4} strokeLinejoin="round" />
      <path d={`M${w / 2 - 7},${h / 2 - 6} V${h / 2 + 4} M${w / 2 + 7},${h / 2 - 6} V${h / 2 + 4}`} stroke="#1e3a5f" strokeWidth={2} strokeLinecap="round" />
    </>;
    case "windowH": case "windowV": return <>
      <rect x={0} y={0} width={w} height={h} fill={GLASS} stroke={INK} strokeWidth={1.2} />
      {p === "windowH" ? <path d={`M2,${h / 2} H${w - 2}`} stroke="#0369a1" strokeWidth={1} /> : <path d={`M${w / 2},2 V${h - 2}`} stroke="#0369a1" strokeWidth={1} />}
    </>;
    case "desk": return <>   {/* the chair behind the desk, the screen on it, two chairs in front of it */}
      <rect x={w / 2 - 15} y={0} width={30} height={26} rx={7} fill={SEAT} stroke={SEAT_DARK} strokeWidth={1} />
      <Screen x={w - 42} y={10} />
      <rect x={4} y={30} width={w - 8} height={9} rx={2} fill={WOOD} stroke={WOOD_DARK} strokeWidth={1.2} />
      <path d={`M10,39 V${h - 4} M${w - 10},39 V${h - 4}`} stroke={WOOD_DARK} strokeWidth={3} strokeLinecap="round" />
      <Chair x={w / 2 - 34} y={h - 34} w={24} /><Chair x={w / 2 + 10} y={h - 34} w={24} />
    </>;
    case "chair": return <>   {/* seen from above, facing down: its back at the top */}
      <rect x={3} y={6} width={w - 6} height={h - 9} rx={6} fill={SEAT} stroke={SEAT_DARK} strokeWidth={1.2} />
      <rect x={2} y={1} width={w - 4} height={8} rx={4} fill={SEAT_DARK} />
    </>;
    case "reception": return <>   {/* the chair and the screen behind a curved counter */}
      <rect x={w / 2 - 14} y={0} width={28} height={24} rx={7} fill={SEAT} stroke={SEAT_DARK} strokeWidth={1} />
      <Screen x={w / 2 - 44} y={8} />
      <path d={`M4,30 Q${w / 2},14 ${w - 4},30 L${w - 8},${h - 2} Q${w / 2},${h - 14} 8,${h - 2} Z`} fill="#c98a4b" stroke="#7c4a1e" strokeWidth={1.4} strokeLinejoin="round" />
      <path d={`M4,30 Q${w / 2},14 ${w - 4},30 L${w - 5},36 Q${w / 2},20 5,36 Z`} fill="#f3e3cf" stroke="#7c4a1e" strokeWidth={1.2} strokeLinejoin="round" />
    </>;
    case "meeting": return <>   {/* a long table, three chairs on each side and one at each end, seen from above */}
      {[0.25, 0.5, 0.75].map(f => <g key={f}><rect x={w * f - 10} y={2} width={20} height={16} rx={5} fill={SEAT} /><rect x={w * f - 10} y={h - 18} width={20} height={16} rx={5} fill={SEAT} /></g>)}
      <rect x={2} y={h / 2 - 10} width={16} height={20} rx={5} fill={SEAT} /><rect x={w - 18} y={h / 2 - 10} width={16} height={20} rx={5} fill={SEAT} />
      <rect x={14} y={14} width={w - 28} height={h - 28} rx={(h - 28) / 2} fill={WOOD} stroke={WOOD_DARK} strokeWidth={1.4} />
    </>;
    case "waiting": return <>   {/* three seats joined on one bar */}
      {[0, 1, 2].map(i => <g key={i}>
        <rect x={2 + i * (w - 4) / 3 + 1} y={2} width={(w - 4) / 3 - 2} height={20} rx={7} fill={BLUE} stroke={BLUE_DARK} strokeWidth={1.1} />
        <rect x={2 + i * (w - 4) / 3} y={20} width={(w - 4) / 3} height={10} rx={4} fill={BLUE} stroke={BLUE_DARK} strokeWidth={1.1} />
      </g>)}
      <path d={`M8,30 V${h - 2} M${w - 8},30 V${h - 2} M8,${h - 6} H${w - 8}`} stroke={SEAT_DARK} strokeWidth={2} strokeLinecap="round" />
    </>;
    case "coffee": return <>
      <rect x={2} y={h / 2 - 4} width={w - 4} height={7} rx={2} fill={WOOD} stroke={WOOD_DARK} strokeWidth={1.2} />
      <path d={`M8,${h / 2 + 3} V${h - 2} M${w - 8},${h / 2 + 3} V${h - 2}`} stroke={WOOD_DARK} strokeWidth={2.4} strokeLinecap="round" />
    </>;
    case "cabinet": return <>   {/* binders on two shelves, two doors under them */}
      <rect x={1} y={1} width={w - 2} height={h - 2} rx={2} fill="#d6a96c" stroke={WOOD_DARK} strokeWidth={1.4} />
      <rect x={5} y={5} width={w - 10} height={h / 2 - 6} fill="#f3e3cf" stroke={WOOD_DARK} strokeWidth={0.8} />
      <path d={`M5,${h / 4 + 1} H${w - 5}`} stroke={WOOD_DARK} strokeWidth={1} />
      <Binders x={7} y={7} n={Math.floor((w - 14) / 6)} h={h / 4 - 7} /><Binders x={7} y={h / 4 + 3} n={Math.floor((w - 14) / 6)} h={h / 4 - 7} />
      <path d={`M${w / 2},${h / 2 + 2} V${h - 5} M5,${h / 2 + 2} H${w - 5}`} stroke={WOOD_DARK} strokeWidth={1} />
      <path d={`M${w / 2 - 4},${(3 * h) / 4 - 3} V${(3 * h) / 4 + 3} M${w / 2 + 4},${(3 * h) / 4 - 3} V${(3 * h) / 4 + 3}`} stroke={WOOD_DARK} strokeWidth={1.6} strokeLinecap="round" />
    </>;
    case "shelves": return <>   {/* a metal shelf unit: boxes and binders on three shelves */}
      {[0, 1, 2].map(i => <path key={i} d={`M2,${6 + i * 25 + 22} H${w - 2}`} stroke={METAL} strokeWidth={3} />)}
      <path d={`M3,2 V${h} M${w / 2},2 V${h} M${w - 3},2 V${h}`} stroke={METAL} strokeWidth={3} />
      <Binders x={8} y={12} n={6} /><Box x={w / 2 + 6} y={14} w={22} /><Box x={w / 2 + 30} y={14} w={20} />
      <Box x={8} y={39} w={22} /><Box x={32} y={39} w={20} /><Box x={w / 2 + 6} y={39} w={22} /><Binders x={w / 2 + 32} y={37} n={3} />
      <Box x={8} y={64} w={22} h={10} /><Binders x={34} y={60} n={3} h={14} /><Box x={w / 2 + 6} y={64} w={22} h={10} /><Box x={w / 2 + 30} y={64} w={20} h={10} />
    </>;
    case "plant": return <Plant x={0} y={0} />;
    case "hedge": {   // a row of round bushes
      const n = Math.max(1, Math.round(w / 24)), step = w / n;
      return <>{Array.from({ length: n }, (_, i) => {
        const cx = step * i + step / 2;
        return <g key={i}><circle cx={cx} cy={h / 2 + 2} r={Math.min(step, h) / 2 + 1} fill={LEAF} stroke={LEAF_DARK} strokeWidth={1} />
          <circle cx={cx - 3} cy={h / 2 - 2} r={3} fill="#4ade80" /></g>;
      })}</>;
    }
  }
}

/** A piece of the plan: its drawing (turned, for a door or a chair), and its label under it. */
export function FurnitureShape({ b }: { b: NodeBox }) {
  const p = b.spec.piece!, w = b.spec.minW, h = b.spec.minH;
  const x = b.x + (b.w - w) / 2, y = b.y;
  const turn = isTurn(b.node.text.turn) ? Number(b.node.text.turn) : 0;
  return <>
    {b.node.color !== "none" && <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={6} fill={DIAGRAM_COLORS[b.node.color].fill} />}
    <g transform={`translate(${x},${y})${turn ? ` rotate(${turn},${w / 2},${h / 2})` : ""}`} strokeLinejoin="round">{pieceArt(p, w, h)}</g>
    <Label lines={b.title} cx={b.x + b.w / 2} top={y + h + PLAN_LABEL_GAP} />
  </>;
}
