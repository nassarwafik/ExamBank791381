import { useRef, useState, type KeyboardEvent } from "react";
import { VISUAL_LIMITS, clampUnit, roundNormalized, shapeAnchor, validateVisualShape, type NormalizedPoint, type VisualShape } from "../visualGeometry";
import VisualCanvas, { PolylineSvg, ShapeSvg } from "./VisualCanvas";
import { at } from "./visualPosition";

// Phase 19D — the ONE shared teacher region editor (hotspot targets AND labelDiagram zones). Tools: rectangle, circle, polygon (click
// vertices, then «إنهاء المضلع»), select & move (drag a region; drag the corner / edge handle to resize a rectangle / circle). Every
// region is also editable through labelled percentage fields (zoom-safe, keyboard-accessible, precise), and deletable. Coordinates are
// normalized (rounded to 4 decimals) before they reach the question — browser pixels never do. Dragging clamps a region INSIDE the
// image (UI convenience); typed values are stored as typed and judged by the canonical validator (never silently repaired).
export type EditorRegion = { id: string; shape: VisualShape };
type Tool = "select" | "rect" | "circle" | "polygon";
type Drag = { mode: "move" | "resize"; index: number; start: NormalizedPoint; orig: VisualShape };
const r4 = (v: number) => roundNormalized(v, 4);
const DEFAULT_SIZE = 0.1, DEFAULT_R = 0.05, MIN = VISUAL_LIMITS.minSize * 2;

function moved(s: VisualShape, dx: number, dy: number): VisualShape {
  if (s.kind === "rect") return { ...s, x: r4(Math.min(Math.max(s.x + dx, 0), 1 - s.width)), y: r4(Math.min(Math.max(s.y + dy, 0), 1 - s.height)) };
  if (s.kind === "circle") return { ...s, cx: r4(clampUnit(s.cx + dx)), cy: r4(clampUnit(s.cy + dy)) };
  const xs = s.points.map(p => p.x), ys = s.points.map(p => p.y);
  const ddx = Math.min(Math.max(dx, -Math.min(...xs)), 1 - Math.max(...xs)), ddy = Math.min(Math.max(dy, -Math.min(...ys)), 1 - Math.max(...ys));
  return { kind: "polygon", points: s.points.map(p => ({ x: r4(p.x + ddx), y: r4(p.y + ddy) })) };
}
function resized(s: VisualShape, p: NormalizedPoint): VisualShape {
  if (s.kind === "rect") return { ...s, width: r4(Math.min(Math.max(p.x - s.x, MIN), 1 - s.x)), height: r4(Math.min(Math.max(p.y - s.y, MIN), 1 - s.y)) };
  if (s.kind === "circle") return { ...s, r: r4(Math.min(Math.max(Math.hypot(p.x - s.cx, p.y - s.cy), MIN), VISUAL_LIMITS.maxRadius)) };
  return s;
}
const handleAt = (s: VisualShape): NormalizedPoint | null => (s.kind === "rect" ? { x: s.x + s.width, y: s.y + s.height } : s.kind === "circle" ? { x: s.cx + s.r, y: s.cy } : null);
const KIND_LABEL: Record<string, string> = { rect: "مستطيل", circle: "دائرة", polygon: "مضلع" };

type Props = { src: string; alt: string; regions: EditorRegion[]; onChange: (next: EditorRegion[]) => void; nextId: () => string; canAdd: boolean; addHint?: string; disabled?: boolean };

export default function RegionEditor({ src, alt, regions, onChange, nextId, canAdd, addHint, disabled }: Props) {
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState<NormalizedPoint[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<EditorRegion[] | null>(null);
  const pending = useRef<{ mode: "move" | "resize"; index: number } | null>(null);
  const shown = preview ?? regions;
  const valid = (s: unknown) => validateVisualShape(s).ok;
  const add = (shape: VisualShape) => { const next = [...regions, { id: nextId(), shape }]; onChange(next); setSelected(next.length - 1); };
  const onPoint = (p: NormalizedPoint) => {
    if (disabled) return;
    if (tool === "select") { setSelected(null); return; }
    if (!canAdd) return;
    if (tool === "rect") add({ kind: "rect", x: r4(Math.min(Math.max(p.x - DEFAULT_SIZE / 2, 0), 1 - DEFAULT_SIZE)), y: r4(Math.min(Math.max(p.y - DEFAULT_SIZE / 2, 0), 1 - DEFAULT_SIZE)), width: DEFAULT_SIZE, height: DEFAULT_SIZE });
    else if (tool === "circle") add({ kind: "circle", cx: r4(p.x), cy: r4(p.y), r: DEFAULT_R });
    else if (draft.length < VISUAL_LIMITS.polygonPoints) setDraft(d => [...d, { x: r4(p.x), y: r4(p.y) }]);
  };
  const finishPolygon = () => { if (draft.length >= 3) add({ kind: "polygon", points: draft }); setDraft([]); };
  const update = (i: number, shape: VisualShape) => onChange(regions.map((r, j) => (j === i ? { ...r, shape } : r)));
  const remove = (i: number) => { onChange(regions.filter((_, j) => j !== i)); setSelected(null); };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => { if (e.key === "Escape" && draft.length) { e.preventDefault(); setDraft([]); } };
  const field = (i: number, label: string, value: number, set: (v: number) => VisualShape) => (
    <label key={label}>{label}
      <input type="number" step="0.1" aria-label={label} value={Number.isFinite(value) ? String(Math.round(value * 10000) / 100) : ""} disabled={disabled}
        onChange={e => { const n = Number(e.target.value); if (e.target.value !== "" && Number.isFinite(n)) update(i, set(r4(n / 100))); }} />
    </label>
  );
  const sel = selected !== null && selected < regions.length ? selected : null;
  const selShape = sel !== null ? regions[sel].shape : null;
  const handle = sel !== null && tool === "select" && selShape && valid(selShape) ? handleAt(shown[sel].shape) : null;
  return (
    <div className="vq-region-editor">
      <div className="vq-tools" role="toolbar" aria-label="أدوات رسم المناطق">
        {(["rect", "circle", "polygon"] as const).map(t => <button type="button" key={t} aria-pressed={tool === t} disabled={disabled || !canAdd} onClick={() => { setTool(t); setDraft([]); }}>{KIND_LABEL[t]}</button>)}
        <button type="button" aria-pressed={tool === "select"} disabled={disabled} onClick={() => { setTool("select"); setDraft([]); }}>تحديد ونقل</button>
        {tool === "polygon" && <><button type="button" disabled={disabled || draft.length < 3} onClick={finishPolygon}>إنهاء المضلع</button><button type="button" disabled={disabled || !draft.length} onClick={() => setDraft([])}>إلغاء المضلع</button></>}
      </div>
      {!canAdd && addHint && <p className="vq-note">{addHint}</p>}
      <VisualCanvas src={src} alt={alt} focusable label="لوحة رسم المناطق على الصورة" onKeyDown={onKey}
        onPoint={onPoint} dragging={drag !== null}
        onPointerDownAt={p => { const pd = pending.current; pending.current = null; if (!pd || !p || disabled) return; const r = regions[pd.index]; if (!r || !valid(r.shape)) return; setDrag({ mode: pd.mode, index: pd.index, start: p, orig: r.shape }); }}
        onDragMove={p => { if (!drag) return; const s = drag.mode === "move" ? moved(drag.orig, p.x - drag.start.x, p.y - drag.start.y) : resized(drag.orig, p); setPreview(regions.map((r, j) => (j === drag.index ? { ...r, shape: s } : r))); }}
        onDragEnd={p => { const d = drag; setDrag(null); setPreview(null); if (!d || !p) return; update(d.index, d.mode === "move" ? moved(d.orig, p.x - d.start.x, p.y - d.start.y) : resized(d.orig, p)); }}
        svg={<>
          {shown.map((r, i) => valid(r.shape) ? <ShapeSvg key={r.id} shape={r.shape} testId="region-shape" selected={i === sel} className={"vq-shape" + (tool === "select" && !disabled ? " vq-shape-hit" : "")}
            onPointerDown={tool === "select" && !disabled ? () => { pending.current = { mode: "move", index: i }; setSelected(i); } : undefined} /> : null)}
          {draft.length > 1 && <PolylineSvg className="vq-draft" points={draft} />}
        </>}>
        {shown.map((r, i) => valid(r.shape) ? <span key={r.id} className="vq-badge" aria-hidden="true" style={at(shapeAnchor(r.shape))}>{i + 1}</span> : null)}
        {draft.map((p, i) => <span key={"d" + i} className="vq-badge" aria-hidden="true" style={at(p)}>•</span>)}
        {handle && <span className="vq-handle" data-testid="region-handle" aria-hidden="true" style={at(handle)} onPointerDown={() => { pending.current = { mode: "resize", index: sel as number }; }} />}
      </VisualCanvas>
      <ol className="vq-list" data-testid="region-list" aria-label="المناطق المرسومة">
        {regions.map((r, i) => (
          <li key={r.id}>
            <button type="button" aria-pressed={i === sel} onClick={() => { setSelected(i); setTool("select"); }} disabled={disabled}>المنطقة {i + 1}</button>
            <span>{KIND_LABEL[(r.shape as { kind?: string })?.kind ?? ""] ?? "شكل غير صالح"}{valid(r.shape) ? "" : " — غير صالح"}</span>
          </li>
        ))}
      </ol>
      {sel !== null && selShape && (
        <fieldset className="vq-selected">
          <legend>المنطقة {sel + 1}</legend>
          <div className="vq-fields">
            {selShape.kind === "rect" && [
              field(sel, "س (يسار) للمنطقة " + (sel + 1) + " (%)", selShape.x, v => ({ ...selShape, x: v })),
              field(sel, "ص (أعلى) للمنطقة " + (sel + 1) + " (%)", selShape.y, v => ({ ...selShape, y: v })),
              field(sel, "عرض المنطقة " + (sel + 1) + " (%)", selShape.width, v => ({ ...selShape, width: v })),
              field(sel, "ارتفاع المنطقة " + (sel + 1) + " (%)", selShape.height, v => ({ ...selShape, height: v }))
            ]}
            {selShape.kind === "circle" && [
              field(sel, "مركز س للمنطقة " + (sel + 1) + " (%)", selShape.cx, v => ({ ...selShape, cx: v })),
              field(sel, "مركز ص للمنطقة " + (sel + 1) + " (%)", selShape.cy, v => ({ ...selShape, cy: v })),
              field(sel, "نصف قطر المنطقة " + (sel + 1) + " (%)", selShape.r, v => ({ ...selShape, r: v }))
            ]}
            {selShape.kind === "polygon" && Array.isArray(selShape.points) && <span>مضلع من {selShape.points.length} نقاط — اسحبه لتحريكه.</span>}
          </div>
          <div className="vq-actions"><button type="button" onClick={() => remove(sel)} disabled={disabled}>حذف المنطقة {sel + 1}</button></div>
        </fieldset>
      )}
    </div>
  );
}
