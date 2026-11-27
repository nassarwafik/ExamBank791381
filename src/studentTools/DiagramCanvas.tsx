import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { DIAGRAM_LIMITS, insideOf, moveNodesBy, resizeNode, type DiagramDoc } from "./diagramDoc";
import { centerOf, edgeAt, lifelineBottom, nodeAt, type EdgePath, type NodeBox } from "./diagramLayout";
import { DiagramDrawing, Markers, PAPER } from "./diagramShapes";

// «محرّر المخططات» — the drawing sheet. One SVG on white paper; the pointer is read against the diagram itself (not the DOM):
//   • press a component and drag: it moves (a container moves with what it holds), snapped to a 10 px grid;
//   • a selected component shows blue dots on its sides: drag from one to another component to draw the chosen arrow (to the same
//     component: an arrow to itself);
//   • a resizable component (a system boundary, a lane, a frame …) shows a square in its corner: drag it to resize;
//   • press an arrow to select it; press the empty paper to select nothing; double-click a component to type its text.
// Everything the editor itself draws (the grid, the selection, the dots) carries `data-ui`, and the saved picture leaves it out.

export type Selection = { kind: "node" | "edge"; id: string } | null;
type Pt = { x: number; y: number };
type Drag =
  | { mode: "move"; pointer: number; ids: string[]; start: Pt; startDoc: DiagramDoc; moved: boolean }
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
};

/** The sides' dots of a selected component (a lifeline: beside its head). */
function linkDots(b: NodeBox): Pt[] {
  const c = centerOf(b);
  if (b.form === "lifeline") return [{ x: b.x + b.w + 10, y: b.y + 18 }];
  if (b.spec.resizable) return [{ x: b.x + b.w, y: b.y + 18 }];
  const gap = 10;
  return [{ x: c.x, y: b.y - gap }, { x: b.x + b.w + gap, y: c.y }, { x: c.x, y: b.y + b.h + gap }, { x: b.x - gap, y: c.y }];
}

export default function DiagramCanvas({ doc, boxes, paths, zoom, selection, prefix, label, svgRef, onSelect, onPreview, onCommit, onConnect, onEdit }: Props) {
  const drag = useRef<Drag | null>(null);
  const [link, setLink] = useState<{ from: Pt; to: Pt; target: string | null } | null>(null);

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
    const nodeId = nodeAt(doc, boxes, p.x, p.y);
    // an arrow over a container is easier to reach than the container
    const edgeId = edgeAt(paths, p.x, p.y);
    const overContainer = nodeId ? !!boxes.get(nodeId)?.spec.resizable : false;
    if (nodeId && !(edgeId && overContainer)) {
      onSelect({ kind: "node", id: nodeId });
      drag.current = { mode: "move", pointer: e.pointerId, ids: [nodeId, ...insideOf(doc, nodeId)], start: p, startDoc: doc, moved: false };
      svg?.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      return;
    }
    if (edgeId) { onSelect({ kind: "edge", id: edgeId }); return; }
    onSelect(null);
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
    if (cancelled) { onPreview(d.startDoc); return; }
    onCommit(d.startDoc);
  };

  const sel = selection?.kind === "node" ? boxes.get(selection.id) : undefined;
  const selPath = selection?.kind === "edge" ? paths.get(selection.id) : undefined;
  const bottom = doc.kind === "sequence" ? lifelineBottom(doc) : 0;
  const targetBox = link?.target ? boxes.get(link.target) : undefined;
  return (
    <svg ref={svgRef} className="dgm-svg" viewBox={`0 0 ${W} ${H}`} width={W * zoom} height={H * zoom} role="img" aria-label={label}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={e => end(e, false)} onPointerCancel={e => end(e, true)}
      onDoubleClick={e => { const p = toPoint(e); const id = nodeAt(doc, boxes, p.x, p.y); if (id) onEdit(id); }} data-testid="diagram-canvas"
      // on a touch screen the paper scrolls; once a component is chosen, a finger moves it instead (tap the paper to scroll again)
      style={{ touchAction: selection ? "none" : "pan-x pan-y" }}>
      <Markers prefix={prefix} />
      <defs data-ui="">
        <pattern id={prefix + "grid"} width={20} height={20} patternUnits="userSpaceOnUse"><circle cx={1} cy={1} r={1} fill="#cbd5e1" /></pattern>
      </defs>
      <rect data-ui="" x={0} y={0} width={W} height={H} fill={PAPER} />
      <rect data-ui="" x={0} y={0} width={W} height={H} fill={`url(#${prefix}grid)`} />
      <DiagramDrawing doc={doc} boxes={boxes} paths={paths} prefix={prefix} />
      {selPath && <path data-ui="" d={selPath.d} fill="none" stroke="#2563eb" strokeOpacity={0.35} strokeWidth={9} strokeLinecap="round" pointerEvents="none" />}
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
      {link && <line data-ui="" x1={link.from.x} y1={link.from.y} x2={link.to.x} y2={link.to.y} stroke="#2563eb" strokeWidth={2} strokeDasharray="6 4" pointerEvents="none" />}
    </svg>
  );
}
