import { useEffect, useMemo, useState } from "react";
import "../learning/activities/activities.css";
import "./labTrace.css";
import DsTraceView from "../learning/activities/DsTraceView";
import type { DsTrace } from "../learning/activities/ds";
import { nextBreak, PLAY_SPEEDS as SPEEDS, structureSteps } from "../learning/activities/dsMotion";
import Dialog from "../ui/Dialog";
import { usePrefersReducedMotion } from "../ui/usePrefersReducedMotion";

// Visual lab V3–V4 (docs/enterprise-csharp-visual-lab-plan.md §11, §12) — the teacher's «تشغيل مرئي»: the recorded run in the COURSE'S
// OWN trace view (DsTraceView), driven by a player:
//   • ▶ تشغيل تلقائي / ⏸ إيقاف, at three speeds; it stops at the last step and at a breakpoint;
//   • breakpoints: a click on a line number of the program toggles one; «إلى نقطة التوقف التالية» jumps there;
//   • «عمليات المباني فقط»: walk only the steps where a structure changed (Push / Pop / Insert / Remove / a new cell …);
//   • motion: what enters a stack / queue slides in, what leaves slides out, a new cell appears (dsMotion.ts). None with
//     prefers-reduced-motion — the steps are the same, only still;
//   • «توسيع»: the same player in a wide window, for the class. One state for both places.
// Its own lazy chunk (with its CSS): the editor and the reader carry none of it until a visual run is asked for.
type Speed = keyof typeof SPEEDS;
const SPEED_NAMES: Record<Speed, string> = { slow: "بطيء", normal: "عادي", fast: "سريع" };

export default function LabTraceView({ trace, epoch }: { trace: DsTrace; epoch: number }) {
  return <Player key={epoch} trace={trace} epoch={epoch} />;
}

function Player({ trace, epoch }: { trace: DsTrace; epoch: number }) {
  const total = trace.steps.length;
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [opsOnly, setOpsOnly] = useState(false);
  const [breakpoints, setBreakpoints] = useState<ReadonlySet<number>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const reduced = usePrefersReducedMotion();

  const ops = useMemo(() => structureSteps(trace), [trace]);
  const pool = useMemo(() => (opsOnly ? ops : trace.steps.map((_, i) => i)), [opsOnly, ops, trace]);
  const after = (i: number) => pool.find(p => p > i) ?? null;
  const before = (i: number) => [...pool].reverse().find(p => p < i) ?? null;

  // auto-play: one move per tick; it stops on ARRIVING at the last step of the walk or at a breakpoint (inside the timer, never in
  // the render). Manual moves while playing simply continue from there.
  useEffect(() => {
    if (!playing) return;
    const next = pool.find(p => p > at);
    if (next === undefined) return;
    const t = setTimeout(() => {
      setAt(next);
      const line = trace.steps[next].line;
      if (breakpoints.has(line)) { setPlaying(false); setNote("توقف عند نقطة التوقف على السطر " + line + "."); }
      else if (pool.find(p => p > next) === undefined) setPlaying(false);
    }, SPEEDS[speed]);
    return () => clearTimeout(t);
  }, [playing, at, speed, pool, breakpoints, trace]);

  const move = (to: number | null) => { if (to !== null) { setAt(to); setNote(""); } };
  const toggle = (line: number) => setBreakpoints(b => { const n = new Set(b); if (n.has(line)) n.delete(line); else n.add(line); return n; });
  const toBreak = () => {
    const i = nextBreak(trace, at, breakpoints, pool);
    if (i === null) setNote(breakpoints.size ? "لا نقطة توقّف بعد هذه الخطوة." : "لا نقاط توقّف: انقر رقم سطر في البرنامج لتضع واحدة.");
    else move(i);
  };
  const setOps = (on: boolean) => {
    setOpsOnly(on);
    // the step shown stays a step of the walk: the nearest structure step at or before it
    if (on && !ops.includes(at)) setAt([...ops].reverse().find(p => p <= at) ?? 0);
  };
  const isLast = after(at) === null, isFirst = before(at) === null;

  const body = (
    <div className={"lab-trace" + (reduced ? "" : " has-motion")} data-testid={expanded ? "csharp-trace-wide" : "csharp-trace"}>
      <div className="lab-trace-bar" role="toolbar" aria-label="التحكم بالتشغيل المرئي">
        <button type="button" className="learning-trace-btn" onClick={() => { setAt(pool[0] ?? 0); setPlaying(false); setNote(""); }} disabled={at === (pool[0] ?? 0)}>من البداية</button>
        <button type="button" className="learning-trace-btn" onClick={() => move(before(at))} disabled={isFirst}>الخطوة السابقة</button>
        <button type="button" className="learning-trace-btn is-next" onClick={() => move(after(at))} disabled={isLast}>الخطوة التالية</button>
        <button type="button" className="learning-trace-btn is-play" aria-pressed={playing} onClick={() => { setNote(""); setPlaying(p => !p); }} disabled={!playing && isLast}>
          {playing ? "⏸ إيقاف" : "▶ تشغيل تلقائي"}
        </button>
        <label className="lab-trace-speed">السرعة
          <select value={speed} onChange={e => setSpeed(e.target.value as Speed)}>
            {(Object.keys(SPEEDS) as Speed[]).map(k => <option key={k} value={k}>{SPEED_NAMES[k]}</option>)}
          </select>
        </label>
        <button type="button" className="learning-trace-btn" onClick={toBreak}>إلى نقطة التوقف التالية</button>
        <label className="lab-trace-check"><input type="checkbox" checked={opsOnly} onChange={e => setOps(e.target.checked)} /> عمليات المباني فقط</label>
        {!expanded && <button type="button" className="learning-trace-btn" onClick={() => setExpanded(true)}>توسيع</button>}
        <span className="learning-trace-counter">الخطوة <span dir="ltr">{at + 1} / {total}</span></span>
        {total > 12 && (
          <input type="range" className="learning-trace-slider" dir="ltr" min={1} max={total} value={at + 1} aria-label="انتقل إلى الخطوة"
            aria-valuetext={"الخطوة " + (at + 1) + " من " + total} onChange={e => { setAt(Number(e.target.value) - 1); setNote(""); }} />
        )}
      </div>
      <p className="lab-trace-note" role="status" aria-live="polite">{note || (breakpoints.size ? "نقاط التوقف: السطر " + [...breakpoints].sort((a, b) => a - b).join("، ") + "." : "انقر رقم سطر في البرنامج لتضع نقطة توقّف.")}</p>
      <DsTraceView cfg={trace} epoch={epoch} at={at} controls={false} breakpoints={breakpoints} onToggleBreakpoint={toggle} motion={!reduced} />
    </div>
  );

  return (
    <>
      {expanded ? <p className="stt-hint" role="note">التشغيل المرئي معروض في نافذة موسّعة.</p> : body}
      <Dialog open={expanded} title="التشغيل المرئي" onClose={() => setExpanded(false)} size="lg" className="lab-trace-dialog">{expanded && body}</Dialog>
    </>
  );
}
