import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { DIAGRAM_LIMITS, insideOf, moveNodesBy, resizeNode, type DiagramDoc } from "./diagramDoc";
import { centerOf, edgeAt, lifelineBottom, nodeAt, type EdgePath, type NodeBox } from "./diagramLayout";
import { DiagramDrawing, Markers, PAPER } from "./diagramShapes";
import type { FindingLevel } from "./diagramChecks";

// «محرّر المخططات» — the drawing sheet. One SVG on white paper; the pointer is read against the diagram itself (not the DOM):
//   • press a component and drag: it moves (a container moves with what it holds), snapped to a 10 px grid;
//   • a selected component shows blue dots on its sides: drag from one to another component to draw the chosen arrow (to the same
//     component: an arrow to itself);
//   • a resizable component (a system boundary, a lane, a frame …) shows a square in its corner: drag it to resize;
//   • press an arrow to select it; press the empty paper to select nothing; double-click a component to type its text;
//   • DG5 — several at once: Shift / Ctrl + press adds or removes a component or an arrow; a rectangle dragged on the empty paper takes
//     what lies wholly inside it (and the arrows between those); «تحديد عدّة» (`multi`) makes every press add or remove, for a finger.
//     Dragging any chosen component moves them all.
// Everything the editor itself draws (the grid, the selection, the dots) carries `data-ui`, and the saved picture leaves it out.

export type Selection = { kind: "node" | "edge"; id: string } | { kind: "many"; nodes: string[]; edges: string[] } | null;
/** The chosen components / arrows, whatever the selection's form. */
export const selectedNodes = (s: Selection): string[] => (!s ? [] : s.kind === "node" ? [s.id] : s.kind === "many" ? s.nodes : []);
export const selectedEdges = (s: Selection): string[] => (!s ? [] : s.kind === "edge" ? [s.id] : s.kind === "many" ? s.edges : []);
/** The selection of these: nothing, one (the usual single selection) or many. */
export function makeSelection(nodes: readonly string[], edges: readonly string[]): Selection {
  const n = [...new Set(nodes)], e = [...new Set(edges)];
  if (!n.length && !e.length) return null;
  if (n.length + e.length === 1) return n.length ? { kind: "node", id: n[0] } : { kind: "edge", id: e[0] };
  return { kind: "many", nodes: n, edges: e };
}
/** The selection with one component (or arrow) added, or taken out when it was already in. */
export function toggleSelection(s: Selection, kind: "node" | "edge", id: string): Selection {
  const n = selectedNodes(s), e = selectedEdges(s);
  const list = kind === "node" ? n : e;
  const next = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
  return kind === "node" ? makeSelection(next, e) : makeSelection(n, next);
}
type Pt = { x: number; y: number };
type Drag =
  | { mode: "move"; pointer: number; ids: string[]; start: Pt; startDoc: DiagramDoc; moved: boolean; /** a press on a chosen one, released
      without moving: take it out (additive) or choose it alone */ after?: Selection }
  | { mode: "box"; pointer: number; start: Pt; base: Selection }
  | { mode: "link"; pointer: number; from: string; start: Pt }
  | { mode: "resize"; pointer: number; id: string; start: Pt; startDoc: DiagramDoc; w: number; h: number };

const W = DIAGRAM_LIMITS.canvasW, H = DIAGRAM_LIMITS.canvasH;
const HANDLE = 7;

type Props = {
  doc: DiagramDoc;
  boxes: ReadonlyMap<string, NodeBox>;
  paths: ReadonlyMap<string, EdgePath>;
  zoom: number;
  selection: Selection;
  prefix: string;
  label: string;
  svgRef: RefObject<SVGSVGElement | null>;
  onSelect: (s: Selection) => void;
  /** A drag in progress (no history step). */
  onPreview: (doc: DiagramDoc) => void;
  /** The drag ended: `startDoc` → the present is one history step. */
  onCommit: (startDoc: DiagramDoc) => void;
  onConnect: (from: string, to: string) => void;
  onEdit: (id: string) => void;
  /** DG5 — «تحديد عدّة»: every press adds or removes (a finger has no Shift key). */
  multi?: boolean;
  /** DG2 — what «افحص المخطط» found, by component / arrow id: drawn as a red (error) or amber (warning) mark. */
  marks?: ReadonlyMap<string, FindingLevel>;
};
const MARK = { error: "#dc2626", warning: "#d97706" } as const;

/** The sides' dots of a selected component (a lifeline: beside its head). */
function linkDots(b: NodeBox): Pt[] {
  const c = centerOf(b);
  if (b.form === "lifeline") return [{ x: b.x + b.w + 10, y: b.y + 18 }];
  if (b.spec.resizable) return [{ x: b.x + b.w, y: b.y + 18 }];
  const gap = 10;
  return [{ x: c.x, y: b.y - gap }, { x: b.x + b.w + gap, y: c.y }, { x: c.x, y: b.y + b.h + gap }, { x: b.x - gap, y: c.y }];
}

/** What a rectangle takes: the components wholly inside it (a lifeline: its head), and the arrows between two of them. */
export function inRect(doc: DiagramDoc, boxes: ReadonlyMap<string, NodeBox>, r: { x0: number; y0: number; x1: number; y1: number }): { nodes: string[]; edges: string[] } {
  const nodes = doc.nodes.filter(n => {
    const b = boxes.get(n.id);
    return !!b && b.x >= r.x0 && b.y >= r.y0 && b.x + b.w <= r.x1 && b.y + b.h <= r.y1;
  }).map(n => n.id);
  const set = new Set(nodes);
  return { nodes, edges: doc.edges.filter(e => set.has(e.from) && set.has(e.to)).map(e => e.id) };
}
const rectOf = (a: Pt, b: Pt) => ({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) });

export default function DiagramCanvas({ doc, boxes, paths, zoom, selection, prefix, label, svgRef, onSelect, onPreview, onCommit, onConnect, onEdit, marks, multi }: Props) {
  const drag = useRef<Drag | null>(null);
  const [link, setLink] = useState<{ from: Pt; to: Pt; target: string | null } | null>(null);
  const [box, setBox] = useState<{ a: Pt; b: Pt } | null>(null);
  /** The components a move takes: the chosen ones and what the chosen containers hold. */
  const moving = (ids: readonly string[]) => [...new Set(ids.flatMap(id => [id, ...insideOf(doc, id)]))];

  const toPoint = (e: { clientX: number; clientY: number }): Pt => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return { x: 0, y: 0 };
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const p = toPoint(e);
    const handle = (e.target as Element).closest?.("[data-handle]")?.getAttribute("data-handle");
    const svg = svgRef.current;
    if (handle && selection?.kind === "node") {
      const b = boxes.get(selection.id);
      if (!b) return;
      if (handle === "resize") drag.current = { mode: "resize", pointer: e.pointerId, id: b.node.id, start: p, startDoc: doc, w: b.node.w, h: b.node.h };
      else { drag.current = { mode: "link", pointer: e.pointerId, from: b.node.id, start: p }; setLink({ from: p, to: p, target: null }); }
      svg?.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      return;
    }
    const additive = !!multi || e.shiftKey || e.ctrlKey || e.metaKey;
    const nodeId = nodeAt(doc, boxes, p.x, p.y);
    // an arrow over a container is easier to reach than the container
    const edgeId = edgeAt(paths, p.x, p.y);
    const overContainer = nodeId ? !!boxes.get(nodeId)?.spec.resizable : false;
    const chosen = selectedNodes(selection);
    if (nodeId && !(edgeId && overContainer)) {
      const was = chosen.includes(nodeId);
      let ids = [nodeId], after: Selection | undefined;
      if (additive) {
        // add it now (so a drag takes it too); a press on one already chosen takes it out, unless it is dragged
        if (!was) onSelect(toggleSelection(selection, "node", nodeId)); else after = toggleSelection(selection, "node", nodeId);
        ids = was ? chosen : [...chosen, nodeId];
      } else if (was && selection?.kind === "many") {
        // a press on one of many: drag them all; released where it was, choose it alone
        ids = chosen; after = { kind: "node", id: nodeId };
      } else onSelect({ kind: "node", id: nodeId });
      drag.current = { mode: "move", pointer: e.pointerId, ids: moving(ids), start: p, startDoc: doc, moved: false, after };
      svg?.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      return;
    }
    if (edgeId) { onSelect(additive ? toggleSelection(selection, "edge", edgeId) : { kind: "edge", id: edgeId }); return; }
    // the empty paper: a mouse (or «تحديد عدّة») draws a rectangle; a finger scrolls the paper
    if (!additive) onSelect(null);
    if (e.pointerType !== "touch" || multi) {
      drag.current = { mode: "box", pointer: e.pointerId, start: p, base: additive ? selection : null };
      setBox({ a: p, b: p });
      svg?.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const p = toPoint(e);
    if (d.mode === "move") {
      const dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      onPreview(moveNodesBy(d.startDoc, d.ids, dx, dy));
    } else if (d.mode === "resize") {
      onPreview(resizeNode(d.startDoc, d.id, d.w + (p.x - d.start.x), d.h + (p.y - d.start.y)));
    } else if (d.mode === "box") {
      setBox({ a: d.start, b: p });
    } else {
      const target = nodeAt(doc, boxes, p.x, p.y);
      setLink({ from: d.start, to: p, target });
    }
  };

  const end = (e: ReactPointerEvent<SVGSVGElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    drag.current = null;
    svgRef.current?.releasePointerCapture?.(e.pointerId);
    if (d.mode === "link") {
      const p = toPoint(e);
      setLink(null);
      if (cancelled) return;
      const target = nodeAt(doc, boxes, p.x, p.y);
      if (target && Math.hypot(p.x - d.start.x, p.y - d.start.y) > 12) onConnect(d.from, target);
      return;
    }
    if (d.mode === "box") {
      setBox(null);
      const p = toPoint(e);
      if (cancelled || Math.hypot(p.x - d.start.x, p.y - d.start.y) < 6) return;
      const got = inRect(doc, boxes, rectOf(d.start, p));
      onSelect(makeSelection([...selectedNodes(d.base), ...got.nodes], [...selectedEdges(d.base), ...got.edges]));
      return;
    }
    if (cancelled) { onPreview(d.startDoc); return; }
    if (d.mode === "move" && !d.moved && d.after !== undefined) onSelect(d.after);
    onCommit(d.startDoc);
  };

  const sel = selection?.kind === "node" ? boxes.get(selection.id) : undefined;
  const selPaths = selectedEdges(selection).map(id => paths.get(id)).filter((p): p is EdgePath => !!p);
  const manyBoxes = selection?.kind === "many" ? selection.nodes.map(id => boxes.get(id)).filter((b): b is NodeBox => !!b) : [];
  const boxRect = box && rectOf(box.a, box.b);
  const bottom = doc.kind === "sequence" ? lifelineBottom(doc) : 0;
  const targetBox = link?.target ? boxes.get(link.target) : undefined;
  return (
    <svg ref={svgRef} className="dgm-svg" viewBox={`0 0 ${W} ${H}`} width={W * zoom} height={H * zoom} role="img" aria-label={label}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={e => end(e, false)} onPointerCancel={e => end(e, true)}
      onDoubleClick={e => { const p = toPoint(e); const id = nodeAt(doc, boxes, p.x, p.y); if (id) onEdit(id); }} data-testid="diagram-canvas"
      // on a touch screen the paper scrolls; once a component is chosen, a finger moves it instead (tap the paper to scroll again)
      style={{ touchAction: selection || multi ? "none" : "pan-x pan-y" }} data-multi={multi ? "" : undefined}>
      <Markers prefix={prefix} />
      <defs data-ui="">
        <pattern id={prefix + "grid"} width={20} height={20} patternUnits="userSpaceOnUse"><circle cx={1} cy={1} r={1} fill="#cbd5e1" /></pattern>
      </defs>
      <rect data-ui="" x={0} y={0} width={W} height={H} fill={PAPER} />
      <rect data-ui="" x={0} y={0} width={W} height={H} fill={`url(#${prefix}grid)`} />
      <DiagramDrawing doc={doc} boxes={boxes} paths={paths} prefix={prefix} />
      {marks && marks.size > 0 && <g data-ui="" pointerEvents="none" data-testid="diagram-marks">
        {[...marks].map(([id, level]) => {
          const b = boxes.get(id), p = paths.get(id);
          if (b) return <rect key={id} data-mark={level} x={b.x - 7} y={b.y - 7} width={b.w + 14} height={(b.form === "lifeline" ? 60 : b.h) + 14} rx={8}
            fill={MARK[level]} fillOpacity={0.07} stroke={MARK[level]} strokeWidth={2} strokeDasharray="6 4" />;
          if (p) return <path key={id} data-mark={level} d={p.d} fill="none" stroke={MARK[level]} strokeOpacity={0.4} strokeWidth={8} strokeLinecap="round" />;
          return null;
        })}
      </g>}
      {selPaths.map((p, i) => <path key={i} data-ui="" data-selected="" d={p.d} fill="none" stroke="#2563eb" strokeOpacity={0.35} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />)}
      {manyBoxes.length > 0 && <g data-ui="" pointerEvents="none" data-testid="diagram-many">
        {manyBoxes.map(b => <rect key={b.node.id} data-selected={b.node.id} x={b.x - 5} y={b.y - 5} width={b.w + 10} height={b.h + 10} rx={6}
          fill="#2563eb" fillOpacity={0.05} stroke="#2563eb" strokeWidth={1.5} strokeDasharray="5 4" />)}
      </g>}
      {targetBox && <rect data-ui="" x={targetBox.x - 5} y={targetBox.y - 5} width={targetBox.w + 10} height={(targetBox.form === "lifeline" ? bottom - targetBox.y : targetBox.h) + 10}
        rx={8} fill="#2563eb" fillOpacity={0.08} stroke="#2563eb" strokeWidth={2} pointerEvents="none" />}
      {sel && <g data-ui="">
        <rect x={sel.x - 5} y={sel.y - 5} width={sel.w + 10} height={sel.h + 10} rx={6} fill="none" stroke="#2563eb" strokeWidth={1.5} strokeDasharray="5 4" pointerEvents="none" />
        {linkDots(sel).map((p, i) => (
          <g key={i} data-handle="link" style={{ cursor: "crosshair", touchAction: "none" }}>
            <circle cx={p.x} cy={p.y} r={HANDLE + 6} fill="transparent" />
            <circle cx={p.x} cy={p.y} r={HANDLE} fill="#2563eb" stroke="#fff" strokeWidth={2} />
          </g>
        ))}
        {sel.spec.resizable && <g data-handle="resize" style={{ cursor: "nwse-resize", touchAction: "none" }}>
          <rect x={sel.x + sel.w - 9} y={sel.y + sel.h - 9} width={18} height={18} fill="transparent" />
          <rect x={sel.x + sel.w - 6} y={sel.y + sel.h - 6} width={12} height={12} rx={2} fill="#fff" stroke="#2563eb" strokeWidth={2} />
        </g>}
      </g>}
      {boxRect && <rect data-ui="" data-testid="diagram-box" x={boxRect.x0} y={boxRect.y0} width={boxRect.x1 - boxRect.x0} height={boxRect.y1 - boxRect.y0}
        fill="#2563eb" fillOpacity={0.06} stroke="#2563eb" strokeWidth={1.5} strokeDasharray="6 4" pointerEvents="none" />}
      {link && <line data-ui="" x1={link.from.x} y1={link.from.y} x2={link.to.x} y2={link.to.y} stroke="#2563eb" strokeWidth={2} strokeDasharray="6 4" pointerEvents="none" />}
    </svg>
  );
}
