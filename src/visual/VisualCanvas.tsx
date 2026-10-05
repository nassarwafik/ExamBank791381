import { createContext, useCallback, useContext, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { clientPointToNormalized, containedContentRect, type NormalizedPoint, type VisualShape } from "../visualGeometry";
import { at } from "./visualPosition";
import "./visual.css";

// Phase 19D — the ONE shared visual canvas (student renderers, teacher editors, teacher review). The question image is drawn ONCE; the
// overlay is positioned over the displayed image CONTENT and carries (1) an SVG whose viewBox is the measured content box (W × H), in
// which every normalized shape is drawn scaled (x·W, y·H — a circle of normalized radius r is the ellipse rx = r·W, ry = r·H, exactly
// the region the grader tests) and (2) HTML children positioned in percent (markers, zone buttons, handles). Every pointer
// position is converted to normalized image-content coordinates by the shared pure engine from the <img> element's client rect and its
// intrinsic size (object-fit: contain letterboxing excluded) — browser pixels never leave this component. No canvas, no render loop:
// the content rectangle is measured on load and on resize only.
export type CanvasProps = {
  src: string; alt: string; describedBy?: string;
  /** click / tap on the image content (null outside it, e.g. in the letterbox) */
  onPoint?: (p: NormalizedPoint) => void;
  /** pointer moved / released over the overlay while the caller is dragging something */
  onDragMove?: (p: NormalizedPoint) => void; onDragEnd?: (p: NormalizedPoint | null) => void; dragging?: boolean;
  /** pointer pressed anywhere on the overlay (bubbles from shapes / handles, which mark WHAT is dragged) — the normalized start point */
  onPointerDownAt?: (p: NormalizedPoint | null) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  /** a focusable overlay (keyboard interaction) — with its accessible name */
  focusable?: boolean; label?: string;
  cursor?: NormalizedPoint | null;
  svg?: ReactNode; children?: ReactNode; className?: string;
};
export type ContentBox = { left: number; top: number; width: number; height: number };
type Scale = { w: number; h: number };
const ScaleContext = createContext<Scale>({ w: 1000, h: 1000 });
/** The drawing scale of the enclosing canvas (normalized → SVG user units). */
const useCanvasScale = () => useContext(ScaleContext);

export default function VisualCanvas({ src, alt, describedBy, onPoint, onDragMove, onDragEnd, dragging, onPointerDownAt, onKeyDown, focusable, label, cursor, svg, children, className }: CanvasProps) {
  const wrap = useRef<HTMLDivElement>(null), img = useRef<HTMLImageElement>(null);
  const [box, setBox] = useState<ContentBox | null>(null);
  const suppressClick = useRef(false);
  const measure = useCallback(() => {
    const w = wrap.current, i = img.current;
    if (!w || !i) return;
    const wr = w.getBoundingClientRect(), ir = i.getBoundingClientRect();
    if (!(ir.width > 0) || !(ir.height > 0)) { setBox(null); return; }
    const c = i.naturalWidth > 0 && i.naturalHeight > 0 ? containedContentRect({ width: ir.width, height: ir.height }, { width: i.naturalWidth, height: i.naturalHeight }) : { left: 0, top: 0, width: ir.width, height: ir.height };
    setBox({ left: ir.left - wr.left + c.left, top: ir.top - wr.top + c.top, width: c.width, height: c.height });
  }, []);
  useEffect(() => {
    const i = img.current;
    if (!i || typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(i);
    return () => ro.disconnect();
  }, [measure]);
  /** client pixels → normalized image-content coordinates (shared pure engine; the img rect + intrinsic size). */
  const toPoint = useCallback((clientX: number, clientY: number): NormalizedPoint | null => {
    const i = img.current;
    if (!i) return null;
    const r = i.getBoundingClientRect();
    const natural = i.naturalWidth > 0 && i.naturalHeight > 0 ? { width: i.naturalWidth, height: i.naturalHeight } : undefined;
    return clientPointToNormalized({ x: clientX, y: clientY }, { left: r.left, top: r.top, width: r.width, height: r.height }, natural);
  }, []);
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (!onPoint) return;
    const p = toPoint(e.clientX, e.clientY);
    if (p) onPoint(p);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => { if (!dragging || !onDragMove) return; const p = toPoint(e.clientX, e.clientY); if (p) onDragMove(p); };
  const onUp = (e: PointerEvent<HTMLDivElement>) => { if (!dragging || !onDragEnd) return; suppressClick.current = true; onDragEnd(toPoint(e.clientX, e.clientY)); };
  const style = box ? { left: box.left + "px", top: box.top + "px", width: box.width + "px", height: box.height + "px", right: "auto", bottom: "auto" } : undefined;
  const scale: Scale = box ? { w: Math.round(box.width * 100) / 100, h: Math.round(box.height * 100) / 100 } : { w: 1000, h: 1000 };
  return (
    <div ref={wrap} className={"vq-canvas" + (className ? " " + className : "")}>
      <img ref={img} className="vq-image" src={src} alt={alt} data-testid="visual-image" onLoad={measure} draggable={false} />
      <div className="vq-overlay" data-testid="visual-overlay" style={style} role={focusable ? "application" : undefined} tabIndex={focusable ? 0 : undefined} aria-label={focusable ? label : undefined} aria-describedby={focusable ? describedBy : undefined}
        onClick={onClick} onPointerDown={onPointerDownAt ? e => onPointerDownAt(toPoint(e.clientX, e.clientY)) : undefined} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKeyDown}>
        <ScaleContext.Provider value={scale}><svg className="vq-svg" viewBox={"0 0 " + scale.w + " " + scale.h} aria-hidden="true" focusable="false">{svg}</svg></ScaleContext.Provider>
        {children}
        {cursor && <span className="vq-cursor" data-testid="visual-cursor" aria-hidden="true" style={at(cursor)} />}
      </div>
    </div>
  );
}

/** One normalized shape as an SVG element, scaled to the canvas (a normalized circle is drawn as the matching ellipse). */
export function ShapeSvg({ shape, className, testId, onPointerDown, selected, matched }: { shape: VisualShape; className: string; testId?: string; onPointerDown?: (e: PointerEvent<SVGElement>) => void; selected?: boolean; matched?: boolean }) {
  const { w, h } = useCanvasScale();
  const common = { className, "data-testid": testId, onPointerDown, "data-selected": selected ? "true" : undefined, "data-matched": matched === undefined ? undefined : String(matched) };
  if (shape.kind === "rect") return <rect {...common} x={shape.x * w} y={shape.y * h} width={shape.width * w} height={shape.height * h} />;
  if (shape.kind === "circle") return <ellipse {...common} cx={shape.cx * w} cy={shape.cy * h} rx={shape.r * w} ry={shape.r * h} />;
  return <polygon {...common} points={shape.points.map(q => q.x * w + "," + q.y * h).join(" ")} />;
}
/** An open polyline through normalized points (the polygon being drawn), scaled to the canvas. */
export function PolylineSvg({ points, className }: { points: NormalizedPoint[]; className: string }) {
  const { w, h } = useCanvasScale();
  return <polyline className={className} points={points.map(q => q.x * w + "," + q.y * h).join(" ")} />;
}
