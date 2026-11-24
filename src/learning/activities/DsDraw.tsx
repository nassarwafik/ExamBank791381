import type { ReactNode } from "react";
import type { RichText } from "../content/types";

/**
 * DS-A1 (docs/enterprise-data-structures-course.md) — the SVG drawings of the course's structures, shared by the trace, the lab
 * and the figure: a stack (the head on top), a queue (the head on the left, like ToString), a chain of cells with its arrows and
 * a binary tree. Left-to-right like the code beside them. Each drawing is one `role="img"` with a sentence saying what it shows;
 * the drawing never shrinks below 72% of its size (its box scrolls instead). No timers, no state.
 * Visual lab V4 (docs/enterprise-csharp-visual-lab-plan.md §12): an OPTIONAL `motion` / `fresh` marks what just entered or left, as
 * classes (is-enter / is-leave) that only the lab's player animates (src/studentTools/labTrace.css). The course never passes them.
 */
export type DrawMotion = { enter?: boolean; leaving?: string };
const MONO = 8.2;                     // the width of one monospace character at the drawings' 14px
const MIN_SCALE = 0.72;
const textW = (s: string) => [...s].length * MONO;
export type DrawLabel = { name: string; top?: boolean };

function Canvas({ w, h, label, children }: { w: number; h: number; label: string; children: ReactNode }) {
  return (
    <div className="learning-ds-canvas" dir="ltr">
      <svg className="learning-ds-svg" viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ minWidth: Math.round(w * MIN_SCALE) }} role="img" aria-label={label}>
        {children}
      </svg>
    </div>
  );
}
/** A line with an arrowhead at (x2, y2). Drawn by hand: no <marker>, so no element id is repeated across the page's drawings. */
function Arrow({ x1, y1, x2, y2, className }: { x1: number; y1: number; x2: number; y2: number; className: string }) {
  const a = Math.atan2(y2 - y1, x2 - x1), s = 7;
  const p = (da: number) => `${(x2 - s * Math.cos(a + da)).toFixed(1)} ${(y2 - s * Math.sin(a + da)).toFixed(1)}`;
  return (
    <g>
      <line className={className} x1={x1} y1={y1} x2={x2 - 3 * Math.cos(a)} y2={y2 - 3 * Math.sin(a)} />
      <path className={className + " learning-ds-head"} d={`M${x2} ${y2} L${p(0.45)} L${p(-0.45)}z`} />
    </g>
  );
}
const names = (labels: DrawLabel[] | undefined) => (labels ?? []).map(l => l.name).join(", ");

/** A stack: cells from the head (top) down, in an open-topped box. */
export function StackDrawing({ items, labels, changed, motion }: { items: string[]; labels?: DrawLabel[]; changed?: boolean; motion?: DrawMotion }) {
  const cw = Math.max(64, ...items.map(v => textW(v) + 24)), ch = 30, pad = 6;
  const rows = Math.max(items.length, 1);
  const w = cw + 2 * pad + 78, top = 26, h = top + rows * ch + pad + 26;
  const x = 8, name = names(labels);
  const say = (name ? "الراصّة " + name + ": " : "راصّة: ") + (items.length ? "من الرأس إلى القاع: " + items.join("، ") : "فارغة");
  return (
    <Canvas w={w} h={h} label={say}>
      <path className={"learning-ds-box" + (changed ? " is-changed" : "")} d={`M${x} ${top - 12} V${top + rows * ch + pad} H${x + cw + 2 * pad} V${top - 12}`} />
      {items.length === 0 && <text className="learning-ds-muted" x={x + pad + cw / 2} y={top + ch / 2 + 5} textAnchor="middle">فارغة</text>}
      {items.map((v, i) => (
        <g key={i} className={i === 0 && motion?.enter ? "is-enter is-from-top" : undefined}>
          <rect className={"learning-ds-cell" + (i === 0 ? " is-head" : "")} x={x + pad} y={top + i * ch} width={cw} height={ch - 3} rx="4" />
          <text className="learning-ds-value" x={x + pad + cw / 2} y={top + i * ch + ch / 2 + 3} textAnchor="middle">{v}</text>
        </g>
      ))}
      {motion?.leaving !== undefined && (
        <g className="is-leave is-to-top" aria-hidden="true">
          <rect className="learning-ds-cell is-head" x={x + pad} y={top} width={cw} height={ch - 3} rx="4" />
          <text className="learning-ds-value" x={x + pad + cw / 2} y={top + ch / 2 + 3} textAnchor="middle">{motion.leaving}</text>
        </g>
      )}
      {items.length > 0 && (
        <g>
          <Arrow className="learning-ds-pointer" x1={x + cw + 2 * pad + 34} y1={top + ch / 2 - 2} x2={x + cw + 2 * pad + 6} y2={top + ch / 2 - 2} />
          <text className="learning-ds-tag" x={x + cw + 2 * pad + 38} y={top + ch / 2 + 3}>الرأس</text>
        </g>
      )}
      {name && <text className="learning-ds-name" x={x + pad + cw / 2} y={h - 6} textAnchor="middle">{name}</text>}
    </Canvas>
  );
}

/** A queue: cells from the head (left) to the tail (right); values leave on the left and enter on the right. */
export function QueueDrawing({ items, labels, changed, motion }: { items: string[]; labels?: DrawLabel[]; changed?: boolean; motion?: DrawMotion }) {
  const ws = items.map(v => Math.max(42, textW(v) + 20));
  const inner = items.length ? ws.reduce((a, b) => a + b, 0) : 96;
  const x0 = 44, top = 24, ch = 34, w = x0 + inner + 12 + 44, h = top + ch + 44;
  const name = names(labels);
  const say = (name ? "الدور " + name + ": " : "دور: ") + (items.length ? "من الرأس إلى النهاية: " + items.join("، ") : "فارغ");
  const xs = ws.map((_, i) => x0 + 6 + ws.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <Canvas w={w} h={h} label={say}>
      <path className={"learning-ds-box" + (changed ? " is-changed" : "")} d={`M${x0 - 4} ${top - 5} H${x0 + inner + 16} M${x0 - 4} ${top + ch + 2} H${x0 + inner + 16}`} />
      <Arrow className="learning-ds-pointer" x1={x0 - 6} y1={top + ch / 2 - 1} x2={10} y2={top + ch / 2 - 1} />
      <Arrow className="learning-ds-pointer" x1={w - 8} y1={top + ch / 2 - 1} x2={x0 + inner + 20} y2={top + ch / 2 - 1} />
      <text className="learning-ds-tag" x={4} y={top - 8}>خروج</text>
      <text className="learning-ds-tag" x={w - 4} y={top - 8} textAnchor="end">دخول</text>
      {items.length === 0 && <text className="learning-ds-muted" x={x0 + 6 + inner / 2} y={top + ch / 2 + 4} textAnchor="middle">فارغ</text>}
      {items.map((v, i) => (
        <g key={i} className={i === items.length - 1 && motion?.enter ? "is-enter is-from-end" : undefined}>
          <rect className={"learning-ds-cell" + (i === 0 ? " is-head" : "")} x={xs[i] + 1.5} y={top} width={ws[i] - 3} height={ch - 3} rx="4" />
          <text className="learning-ds-value" x={xs[i] + ws[i] / 2} y={top + ch / 2 + 3} textAnchor="middle">{v}</text>
        </g>
      ))}
      {motion?.leaving !== undefined && (
        <g className="is-leave is-to-start" aria-hidden="true">
          <rect className="learning-ds-cell is-head" x={x0 + 6 + 1.5} y={top} width={Math.max(42, textW(motion.leaving) + 20) - 3} height={ch - 3} rx="4" />
          <text className="learning-ds-value" x={x0 + 6 + Math.max(42, textW(motion.leaving) + 20) / 2} y={top + ch / 2 + 3} textAnchor="middle">{motion.leaving}</text>
        </g>
      )}
      {items.length > 0 && <text className="learning-ds-tag" x={xs[0] + ws[0] / 2} y={top + ch + 17} textAnchor="middle">الرأس</text>}
      {items.length > 1 && <text className="learning-ds-tag" x={xs[items.length - 1] + ws[items.length - 1] / 2} y={top + ch + 17} textAnchor="middle">النهاية</text>}
      {name && <text className="learning-ds-name" x={x0 + 6 + inner / 2} y={h - 5} textAnchor="middle">{name}</text>}
    </Canvas>
  );
}

/**
 * Visual lab V5 — an array / List<T> (`indexed`: each cell's index under it, and the index variables that point at a cell — i, mid … —
 * as arrows above it) or a set (braces, no order to number). Only the teacher's visual run draws it; the course never has one.
 */
export function RowDrawing({ kind, type, items, labels, indexed, marks }: {
  kind: "array" | "set" | "string"; type: string; items: string[]; labels?: DrawLabel[]; indexed: boolean; marks?: { name: string; at: number; top?: boolean }[];
}) {
  const ws = items.map(v => Math.max(40, textW(v) + 18));
  const cellW = (i: number) => ws[i] ?? 40;
  const x0 = 12 + (kind === "set" ? 12 : 0);
  const xs = ws.map((_, i) => x0 + ws.slice(0, i).reduce((a, b) => a + b, 0));
  const inner = items.length ? ws.reduce((a, b) => a + b, 0) : 70;
  const byCell = new Map<number, { name: string; top?: boolean }[]>();
  for (const m of marks ?? []) byCell.set(m.at, [...(byCell.get(m.at) ?? []), m]);
  const maxMarks = Math.max(0, ...[...byCell.values()].map(l => l.length));
  const top = 22 + (maxMarks ? 22 + maxMarks * 15 : 0), ch = 32;
  const name = names(labels);
  const w = Math.max(x0 + inner + (kind === "set" ? 24 : 12) + (byCell.has(items.length) ? 40 : 0), textW(type) + 20, 90);
  const h = top + ch + (indexed ? 18 : 4) + (name ? 20 : 6);
  const mx = (at: number) => (at < items.length ? xs[at] + cellW(at) / 2 : x0 + inner + 18);
  const say = (kind === "set" ? "المجموعة " : kind === "string" ? "النص " : "المصفوفة ") + (name ? name + " " : "") + "(" + type + "): "
    + (items.length ? items.map((v, i) => (indexed ? i + ": " : "") + v).join("، ") : "فارغة")
    + [...(marks ?? [])].map(m => "، " + m.name + " = " + m.at).join("");
  return (
    <Canvas w={w} h={h} label={say}>
      <text className="learning-ds-tag" x={x0} y={14}>{type}</text>
      {kind === "set" && <>
        <text className="learning-ds-null" x={x0 - 12} y={top + ch / 2 + 5}>{"{"}</text>
        <text className="learning-ds-null" x={x0 + inner + 4} y={top + ch / 2 + 5}>{"}"}</text>
      </>}
      {items.length === 0 && <text className="learning-ds-muted" x={x0 + inner / 2} y={top + ch / 2 + 5} textAnchor="middle">فارغة</text>}
      {items.map((v, i) => (
        <g key={i}>
          <rect className={"learning-ds-cell" + (byCell.has(i) ? " is-head" : "")} x={xs[i] + 1} y={top} width={cellW(i) - 2} height={ch} rx={kind === "set" ? 10 : 2} />
          <text className="learning-ds-value" x={xs[i] + cellW(i) / 2} y={top + ch / 2 + 5} textAnchor="middle">{v}</text>
          {indexed && <text className="learning-ds-tag" x={xs[i] + cellW(i) / 2} y={top + ch + 14} textAnchor="middle">{i}</text>}
        </g>
      ))}
      {[...byCell.entries()].map(([at, list]) => (
        <g key={"m" + at}>
          <Arrow className="learning-ds-pointer" x1={mx(at)} y1={top - 18} x2={mx(at)} y2={top - 3} />
          {list.map((m, k) => (
            <text key={m.name} className={"learning-ds-name" + (m.top === false ? " is-dim" : "")} x={mx(at)} y={top - 22 - k * 15} textAnchor="middle">{m.name}</text>
          ))}
        </g>
      ))}
      {name && <text className="learning-ds-name" x={x0 + inner / 2} y={h - 5} textAnchor="middle">{name}</text>}
    </Canvas>
  );
}

/** Visual lab V9 — a two-dimensional array: a grid with its row and column numbers; the a[i, j] cell its index variables point at. */
export function GridDrawing({ type, rows, labels, mark }: { type: string; rows: string[][]; labels?: string[]; mark?: { r: number; c: number; names: string } | null }) {
  const cols = Math.max(1, ...rows.map(r => r.length));
  const cw = Math.max(40, ...rows.flat().map(v => textW(v) + 16)), ch = 30, x0 = 34, top = 34;
  const w = Math.max(x0 + cols * cw + 10, textW(type) + 20), name = (labels ?? []).join(", ");
  const h = top + rows.length * ch + (name ? 22 : 8);
  const say = "المصفوفة الثنائية " + (name ? name + " " : "") + "(" + type + "): " + rows.map((r, i) => "الصف " + i + ": " + r.join("، ")).join("؛ ")
    + (mark ? "؛ [" + mark.names + "] = [" + mark.r + ", " + mark.c + "]" : "");
  return (
    <Canvas w={w} h={h} label={say}>
      <text className="learning-ds-tag" x={x0} y={12}>{type}</text>
      {Array.from({ length: cols }, (_, c) => <text key={"c" + c} className="learning-ds-tag" x={x0 + c * cw + cw / 2} y={top - 6} textAnchor="middle">{c}</text>)}
      {rows.map((r, i) => (
        <g key={i}>
          <text className="learning-ds-tag" x={x0 - 8} y={top + i * ch + ch / 2 + 4} textAnchor="end">{i}</text>
          {r.map((v, c) => {
            const hot = !!mark && mark.r === i && mark.c === c;
            return (
              <g key={c}>
                <rect className={"learning-ds-cell" + (hot ? " is-head" : "")} x={x0 + c * cw + 1} y={top + i * ch + 1} width={cw - 2} height={ch - 2} rx="2" />
                <text className="learning-ds-value" x={x0 + c * cw + cw / 2} y={top + i * ch + ch / 2 + 5} textAnchor="middle">{v}</text>
              </g>
            );
          })}
        </g>
      ))}
      {mark && <text className="learning-ds-name" x={x0 + cols * cw} y={12} textAnchor="end">{"[" + mark.names + "]"}</text>}
      {name && <text className="learning-ds-name" x={x0 + (cols * cw) / 2} y={h - 6} textAnchor="middle">{name}</text>}
    </Canvas>
  );
}

/** Visual lab V9 — a number in its place values (base 10: … 100 10 1; base 2: … 4 2 1); «hot»: this step took its last digit (n % base). */
export function PlaceValueDrawing({ name, base, value, digits, hot }: { name: string; base: number; value: string; digits: string[]; hot: boolean }) {
  const cw = 46, ch = 34, x0 = 8, top = 22;
  const places = digits.map((_, i) => String(Math.pow(base, digits.length - 1 - i)));
  const w = Math.max(x0 + digits.length * cw + 8, textW(name + " = " + value) + 20), h = top + ch + 40;
  const say = "منازل " + name + " = " + value + " في الأساس " + base + ": " + digits.map((d, i) => d + " × " + places[i]).join(" + ") + (hot ? "؛ أُخذ الآن الرقم الأخير " + digits[digits.length - 1] : "");
  return (
    <Canvas w={w} h={h} label={say}>
      <text className="learning-ds-name" x={x0} y={14}>{name + " = " + value + (base !== 10 ? " (أساس " + base + ")" : "")}</text>
      {digits.map((d, i) => {
        const last = i === digits.length - 1;
        return (
          <g key={i}>
            <rect className={"learning-ds-cell" + (hot && last ? " is-head" : "")} x={x0 + i * cw + 2} y={top} width={cw - 4} height={ch} rx="4" />
            <text className="learning-ds-value" x={x0 + i * cw + cw / 2} y={top + ch / 2 + 5} textAnchor="middle">{d}</text>
            <text className="learning-ds-tag" x={x0 + i * cw + cw / 2} y={top + ch + 16} textAnchor="middle">{places[i]}</text>
          </g>
        );
      })}
    </Canvas>
  );
}

/** Visual lab V5 — a Dictionary: one row per key, «key → value». */
export function MapDrawing({ type, keys, items, labels }: { type: string; keys: string[]; items: string[]; labels?: DrawLabel[] }) {
  const kw = Math.max(48, ...keys.map(k => textW(k) + 18)), vw = Math.max(48, ...items.map(v => textW(v) + 18));
  const top = 22, rh = 30, GAP = 34, x0 = 10;
  const name = names(labels);
  const rows = Math.max(keys.length, 1);
  const w = Math.max(x0 + kw + GAP + vw + 10, textW(type) + 20), h = top + rows * rh + (name ? 24 : 8);
  const say = "القاموس " + (name ? name + " " : "") + "(" + type + "): " + (keys.length ? keys.map((k, i) => k + " ← " + items[i]).join("، ") : "فارغ");
  return (
    <Canvas w={w} h={h} label={say}>
      <text className="learning-ds-tag" x={x0} y={14}>{type}</text>
      {keys.length === 0 && <text className="learning-ds-muted" x={x0 + 10} y={top + rh / 2 + 4}>فارغ</text>}
      {keys.map((k, i) => (
        <g key={i}>
          <rect className="learning-ds-cell is-round" x={x0} y={top + i * rh} width={kw} height={rh - 4} rx="4" />
          <text className="learning-ds-value" x={x0 + kw / 2} y={top + i * rh + rh / 2 + 3} textAnchor="middle">{k}</text>
          <Arrow className="learning-ds-link" x1={x0 + kw + 4} y1={top + i * rh + rh / 2 - 2} x2={x0 + kw + GAP - 4} y2={top + i * rh + rh / 2 - 2} />
          <rect className="learning-ds-cell" x={x0 + kw + GAP} y={top + i * rh} width={vw} height={rh - 4} rx="4" />
          <text className="learning-ds-value" x={x0 + kw + GAP + vw / 2} y={top + i * rh + rh / 2 + 3} textAnchor="middle">{items[i]}</text>
        </g>
      ))}
      {name && <text className="learning-ds-name" x={x0 + (kw + GAP + vw) / 2} y={h - 6} textAnchor="middle">{name}</text>}
    </Canvas>
  );
}

export type ChainCell = { key: number | string; v: string; labels?: DrawLabel[]; hi?: boolean; fresh?: boolean };
/** A chain of cells: [value | •] → [value | •] → null, with the names that point at each cell under it. */
export function ChainDrawing({ cells, end = "null", join, onPick, picked }: { cells: ChainCell[]; end?: "null" | "join" | "cycle"; join?: string; onPick?: (i: number) => void; picked?: number | null }) {
  const ws = cells.map(c => Math.max(40, textW(c.v) + 18));
  const NEXT = 20, GAP = 30, top = 12, ch = 34;
  const xs = ws.map((_, i) => 10 + ws.slice(0, i).reduce((a, b) => a + b + NEXT + GAP, 0));
  const x = 10 + ws.reduce((a, b) => a + b + NEXT + GAP, 0);
  const endText = end === "null" ? "null" : (end === "cycle" ? "↺ " : "→ ") + (join ?? "");
  const maxLabels = Math.max(0, ...cells.map(c => c.labels?.length ?? 0));
  const w = x + textW(endText) + 12, h = top + ch + 10 + (maxLabels ? 20 + maxLabels * 16 : 0);
  const say = cells.length
    ? "سلسلة خلايا: " + cells.map(c => c.v + (c.labels?.length ? " (يشير إليها " + names(c.labels) + ")" : "")).join(" ثم ") + (end === "null" ? " ثم null" : end === "cycle" ? " ثم تعود إلى " + join : " ثم الخلية " + join)
    : "سلسلة فارغة: null";
  return (
    <Canvas w={Math.max(w, 70)} h={h} label={say}>
      {cells.map((c, i) => {
        const cw = ws[i], mid = top + ch / 2;
        const active = picked === i;
        return (
          <g key={c.key} className={[onPick ? "learning-ds-pick" : "", c.fresh ? "is-enter is-pop" : ""].filter(Boolean).join(" ") || undefined} onClick={onPick ? () => onPick(i) : undefined}>
            <rect className={"learning-ds-cell" + (c.hi || active ? " is-head" : "")} x={xs[i]} y={top} width={cw + NEXT} height={ch} rx="5" />
            <line className="learning-ds-split" x1={xs[i] + cw} y1={top} x2={xs[i] + cw} y2={top + ch} />
            <text className="learning-ds-value" x={xs[i] + cw / 2} y={mid + 5} textAnchor="middle">{c.v}</text>
            <circle className="learning-ds-dot" cx={xs[i] + cw + NEXT / 2} cy={mid} r="3" />
            <Arrow className="learning-ds-link" x1={xs[i] + cw + NEXT / 2} y1={mid} x2={xs[i] + cw + NEXT + GAP - 3} y2={mid} />
            {(c.labels ?? []).map((l, k) => (
              <g key={l.name}>
                {k === 0 && <Arrow className="learning-ds-pointer" x1={xs[i] + cw / 2} y1={top + ch + 22} x2={xs[i] + cw / 2} y2={top + ch + 5} />}
                <text className={"learning-ds-name" + (l.top === false ? " is-dim" : "")} x={xs[i] + cw / 2} y={top + ch + 36 + k * 16} textAnchor="middle">{l.name}</text>
              </g>
            ))}
          </g>
        );
      })}
      <text className="learning-ds-null" x={x} y={top + ch / 2 + 5}>{endText}</text>
    </Canvas>
  );
}

export type TreeCell = { key: number; v: string; x: number; depth: number; parent: number | null; labels?: DrawLabel[]; hi?: boolean; order?: number; fresh?: boolean };
/** A binary tree: in-order columns, one row per level; `order` writes a small visiting number beside the cell. */
export function TreeDrawing({ cells, onPick, picked, levels }: { cells: TreeCell[]; onPick?: (key: number) => void; picked?: number | null; levels?: boolean }) {
  const widest = Math.max(22, ...cells.map(c => textW(c.v) + 14));
  const R = Math.max(19, widest / 2), DX = Math.max(46, R * 2 + 10), DY = 62, left = (levels ? 74 : 16) + R, top = 26 + R;
  const cols = Math.max(1, ...cells.map(c => c.x + 1)), rows = Math.max(1, ...cells.map(c => c.depth + 1));
  const w = left + (cols - 1) * DX + R + 18, h = top + (rows - 1) * DY + R + 28;
  const at = (c: TreeCell) => ({ cx: left + c.x * DX, cy: top + c.depth * DY });
  const byKey = new Map(cells.map(c => [c.key, c]));
  const root = cells.find(c => c.parent === null);
  const kids = (c: TreeCell) => cells.filter(k => k.parent === c.key).sort((a, b) => a.x - b.x);
  const say = !cells.length ? "شجرة فارغة: null" : "شجرة ثنائية جذرها " + root?.v + ". " + cells.filter(c => kids(c).length).map(c => {
    const l = kids(c).find(k => k.x < c.x), r = kids(c).find(k => k.x > c.x);
    return "الخلية " + c.v + ": " + [l ? "ابنها الأيسر " + l.v : "", r ? "ابنها الأيمن " + r.v : ""].filter(Boolean).join("، ");
  }).join("؛ ");
  return (
    <Canvas w={Math.max(w, 90)} h={Math.max(h, 70)} label={say}>
      {!cells.length && <text className="learning-ds-null" x={16} y={36}>null</text>}
      {levels && Array.from({ length: rows }, (_, d) => <text key={d} className="learning-ds-tag" x={4} y={top + d * DY + 4}>{"المستوى " + d}</text>)}
      {cells.map(c => {
        const p = c.parent === null ? undefined : byKey.get(c.parent);
        if (!p) return null;
        const a = at(p), b = at(c);
        return <line key={"e" + c.key} className="learning-ds-link" x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} />;
      })}
      {cells.map(c => {
        const { cx, cy } = at(c);
        return (
          <g key={c.key} className={[onPick ? "learning-ds-pick" : "", c.fresh ? "is-enter is-pop" : ""].filter(Boolean).join(" ") || undefined} onClick={onPick ? () => onPick(c.key) : undefined}>
            <circle className={"learning-ds-cell is-round" + (c.hi || picked === c.key ? " is-head" : "")} cx={cx} cy={cy} r={R} />
            <text className="learning-ds-value" x={cx} y={cy + 5} textAnchor="middle">{c.v}</text>
            {c.order !== undefined && <text className="learning-ds-order" x={cx + R + 2} y={cy - R + 6}>{c.order}</text>}
            {(c.labels ?? []).map((l, k) => <text key={l.name} className={"learning-ds-name" + (l.top === false ? " is-dim" : "")} x={cx} y={cy + R + 15 + k * 14} textAnchor="middle">{l.name}</text>)}
          </g>
        );
      })}
    </Canvas>
  );
}

/**
 * A guided block's safe inline spans (the steps and the answer of a solution window), drawn like `Marked`. The Reader's own
 * RichTextRenderer is deliberately NOT imported by these lazy chunks: a lazy importer would move it out of the Reader's
 * first-load chunk into one more file of that first load (scripts/check-bundle-budget.mjs measures it).
 */
export function Spans({ spans }: { spans: RichText }) {
  return <>{spans.map((s, i) => (
    s.style === "code" ? <code key={i} className="learning-ds-code" dir={s.dir ?? "ltr"}>{s.text}</code>
      : s.style === "strong" ? <strong key={i} dir={s.dir}>{s.text}</strong>
        : s.style === "em" ? <em key={i} dir={s.dir}>{s.text}</em>
          : s.dir ? <span key={i} dir={s.dir}>{s.text}</span> : s.text))}</>;
}

/** Text with `code` runs (backticks) and **bold** — the notes of a trace, the lab's messages, a solution's checklist. */
export function Marked({ text }: { text: string }) {
  return <>{text.split("`").map((part, i) => (i % 2
    ? <code key={i} className="learning-ds-code" dir="ltr">{part}</code>
    : part.split("**").map((piece, j) => (j % 2 ? <strong key={i + "-" + j}>{piece}</strong> : piece))))}</>;
}
