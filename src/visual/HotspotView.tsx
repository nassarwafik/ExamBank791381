import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { StudentRendererProps } from "../questionTypes/registryTypes";
import { projectHotspotConfigForStudent } from "../hotspotQuestion";
import { clampUnit, visualImageSrc, type NormalizedPoint } from "../visualGeometry";
import VisualCanvas from "./VisualCanvas";
import { at, pct } from "./visualPosition";

// Phase 19D — the hotspot@1 student view (rendered for the student exam AND the teacher's in-editor student preview). It reads ONLY
// the strict public projection (mode, selections, image description) and the canonical question image — never `answer`, so target
// geometry can never be drawn. The student marks points: click / tap on the image content (letterbox excluded), or keyboard (arrows
// move a visible cursor, Shift = larger step, Enter / Space place a point). Markers are buttons: drag to move, arrows to nudge, Delete to
// remove; a selection summary lists every point with a remove button. The Answer is { kind: "hotspot", points } — normalized points only.
const STEP = 0.02, BIG = 0.1;
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
const move = (p: NormalizedPoint, dx: number, dy: number): NormalizedPoint => ({ x: round6(clampUnit(p.x + dx)), y: round6(clampUnit(p.y + dy)) });
const arrow = (key: string, big: boolean): [number, number] | null => {
  const s = big ? BIG : STEP;
  return key === "ArrowRight" ? [s, 0] : key === "ArrowLeft" ? [-s, 0] : key === "ArrowDown" ? [0, s] : key === "ArrowUp" ? [0, -s] : null;
};

export default function HotspotView({ q, answer, onAnswer, disabled, labelPrefix }: StudentRendererProps) {
  const cfg = useMemo(() => projectHotspotConfigForStudent((q as { hotspot?: unknown }).hotspot), [q]);
  const src = useMemo(() => visualImageSrc((q as { image?: unknown }).image), [q]);
  const points = useMemo<NormalizedPoint[]>(() => (answer?.kind === "hotspot" && Array.isArray(answer.points) ? answer.points.filter(p => p && typeof p.x === "number" && typeof p.y === "number") : []), [answer]);
  const [cursor, setCursor] = useState<NormalizedPoint | null>(null);
  const [notice, setNotice] = useState("");
  const [drag, setDrag] = useState<number | null>(null);
  const [live, setLive] = useState<NormalizedPoint[] | null>(null);
  const hintId = useId();
  if (!cfg || !src) return <p className="vq-unavailable" role="note" data-testid="visual-unavailable">تعذّر عرض صورة هذا السؤال؛ أبلغ معلّمك.</p>;
  const max = cfg.selections;
  const emit = (next: NormalizedPoint[]) => { if (!disabled) onAnswer({ kind: "hotspot", points: next }); };
  const place = (p: NormalizedPoint) => {
    if (disabled) return;
    if (cfg.mode === "single") { setNotice(""); emit([p]); return; }
    if (points.length >= max) { setNotice("بلغت الحد الأقصى (" + max + "): أزل نقطة أو اسحبها لتغيير موضعها."); return; }
    setNotice(""); emit([...points, p]);
  };
  const remove = (i: number) => { if (!disabled) { setNotice(""); emit(points.filter((_, j) => j !== i)); } };
  const onOverlayKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || e.target !== e.currentTarget) return;
    const d = arrow(e.key, e.shiftKey);
    if (d) { e.preventDefault(); setCursor(c => move(c ?? { x: 0.5, y: 0.5 }, d[0], d[1])); return; }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); place(cursor ?? { x: 0.5, y: 0.5 }); if (!cursor) setCursor({ x: 0.5, y: 0.5 }); }
  };
  const onMarkerKey = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const d = arrow(e.key, e.shiftKey);
    if (d) { e.preventDefault(); e.stopPropagation(); emit(points.map((p, j) => (j === i ? move(p, d[0], d[1]) : p))); return; }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); remove(i); }
  };
  const startDrag = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    e.stopPropagation();
    try { (e.target as Element).releasePointerCapture?.(e.pointerId); } catch { /* capture is best effort */ }
    setLive(points.slice()); setDrag(i);
  };
  const shown = live && drag !== null ? live : points;
  return (
    <div className="vq hotspot-response" data-testid="hotspot-response">
      <p className="vq-note" id={hintId}>{cfg.mode === "single" ? "انقر على الموضع المطلوب في الصورة." : "انقر على " + max + " مواضع في الصورة."} لوحة المفاتيح: الأسهم لتحريك المؤشر ثم Enter لوضع نقطة؛ اسحب النقطة أو استخدم الأسهم لتحريكها، وDelete لحذفها.</p>
      <VisualCanvas src={src} alt={cfg.alt} describedBy={hintId} focusable label={labelPrefix + " — صورة السؤال: " + cfg.alt} cursor={cursor}
        onPoint={disabled ? undefined : place} onKeyDown={onOverlayKey} dragging={drag !== null}
        onDragMove={p => { if (drag === null || !live) return; setLive(live.map((q2, j) => (j === drag ? p : q2))); }}
        onDragEnd={p => { const i = drag, next = live; setDrag(null); setLive(null); if (i === null || !next) return; emit(p ? next.map((q2, j) => (j === i ? p : q2)) : next); }}>
        {shown.map((p, i) => (
          <button type="button" key={i} className="vq-marker" data-testid="hotspot-marker" style={at(p)} aria-label={"النقطة " + (i + 1) + " (" + pct(p.x) + "، " + pct(p.y) + ")"} disabled={disabled}
            onClick={e => e.stopPropagation()} onPointerDown={startDrag(i)} onKeyDown={onMarkerKey(i)}>{i + 1}</button>
        ))}
      </VisualCanvas>
      <p className="vq-status" data-testid="hotspot-status" role="status" aria-live="polite">حدّدت {points.length} من {max}{notice ? " — " + notice : ""}</p>
      {points.length > 0 && (
        <ol className="vq-list" data-testid="hotspot-selections" aria-label="المواضع التي حدّدتها">
          {points.map((p, i) => <li key={i}><span>النقطة {i + 1}: <bdi dir="ltr">{pct(p.x)}، {pct(p.y)}</bdi></span><button type="button" onClick={() => remove(i)} disabled={disabled}>إزالة النقطة {i + 1}</button></li>)}
        </ol>
      )}
    </div>
  );
}
