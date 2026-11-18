import { useEffect, useId, useRef, useState } from "react";
import type { ScratchPadToolV1 } from "./studentToolsSpec";

// Phase T5 — the student's scratch paper: notes and, when the teacher allowed it, a pen. Nothing here is stored, sent or graded: it lives
// in this component for the attempt (the dock keeps an opened tool mounted) and is gone when the page is left — said on the panel itself.

const MAX_NOTES = 20000;
type Stroke = { erase: boolean; points: [number, number][] };
const MAX_STROKES = 500;

function Drawing() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [erase, setErase] = useState(false);
  const live = useRef<Stroke | null>(null);

  const paint = (list: Stroke[]) => {
    const c = canvasRef.current, ctx = c?.getContext?.("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const s of list) {
      if (s.points.length < 1) continue;
      ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
      ctx.lineWidth = s.erase ? 18 : 2.5;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = getComputedStyle(c).color || "currentColor";
      ctx.beginPath();
      ctx.moveTo(s.points[0][0], s.points[0][1]);
      for (const [x, y] of s.points.slice(1)) ctx.lineTo(x, y);
      if (s.points.length === 1) ctx.lineTo(s.points[0][0] + 0.1, s.points[0][1]);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  };
  useEffect(() => { paint(strokes); }, [strokes]);

  const at = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const c = e.currentTarget, r = c.getBoundingClientRect();
    return [((e.clientX - r.left) / (r.width || 1)) * c.width, ((e.clientY - r.top) / (r.height || 1)) * c.height];
  };
  return (
    <div className="stt-draw">
      <div className="stt-row stt-draw-tools" role="group" aria-label="أدوات الرسم">
        <button type="button" className={"stt-btn" + (!erase ? " is-primary" : "")} aria-pressed={!erase} onClick={() => setErase(false)}>قلم</button>
        <button type="button" className={"stt-btn" + (erase ? " is-primary" : "")} aria-pressed={erase} onClick={() => setErase(true)}>ممحاة</button>
        <button type="button" className="stt-btn" onClick={() => setStrokes(s => s.slice(0, -1))} disabled={!strokes.length}>تراجع</button>
        <button type="button" className="stt-btn" onClick={() => setStrokes([])} disabled={!strokes.length}>مسح الرسم</button>
      </div>
      <canvas ref={canvasRef} className="stt-canvas" width={640} height={360} data-testid="scratch-canvas"
        aria-label="مساحة رسم حر (لا تُحفظ)" role="img"
        onPointerDown={e => { if (e.button !== 0 || strokes.length >= MAX_STROKES) return; e.currentTarget.setPointerCapture?.(e.pointerId); live.current = { erase, points: [at(e)] }; }}
        onPointerMove={e => { const s = live.current; if (!s || s.points.length > 4000) return; s.points.push(at(e)); paint([...strokes, s]); }}
        onPointerUp={() => { const s = live.current; live.current = null; if (s) setStrokes(list => [...list, s].slice(-MAX_STROKES)); }}
        onPointerCancel={() => { live.current = null; paint(strokes); }} />
      <p className="stt-hint" data-testid="scratch-strokes">{strokes.length ? "عدد الخطوط: " + strokes.length : "ارسم بالفأرة أو بالإصبع أو بالقلم."}</p>
    </div>
  );
}

export default function ScratchPadTool({ config }: { config: ScratchPadToolV1 }) {
  const id = useId();
  const [notes, setNotes] = useState("");
  return (
    <div className="stt-scratch" data-testid="tool-scratchPad">
      <p className="stt-hint" role="note">مسودة لك وحدك: لا تُحفظ ولا تُرسل ولا تُصحّح، وتُمسح عند مغادرة صفحة الامتحان. اكتب إجابتك في مكانها من السؤال.</p>
      <label className="stt-label" htmlFor={id + "-notes"}>ملاحظات</label>
      <textarea id={id + "-notes"} className="stt-input stt-notes" dir="auto" maxLength={MAX_NOTES} value={notes} onChange={e => setNotes(e.target.value)} rows={6} spellCheck={false} />
      {config.drawing && <Drawing />}
    </div>
  );
}
