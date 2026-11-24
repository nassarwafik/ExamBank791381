import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CallTreeView from "./CallTreeView";
import ObjectDiagram from "./ObjectDiagram";
import CallFlowDrawing from "./CallFlowDrawing";
import { callFlowOf } from "./callFlow";
import { objectGraphOf } from "./objectGraph";
import { callTreeOf, CALL_TREE_MAX } from "./callTree";
import "../learning/activities/activities.css";
import "./labTrace.css";
import DsTraceView, { type FlowDiagram, type HeapDiagram } from "../learning/activities/DsTraceView";
import type { DsTrace } from "../learning/activities/ds";
import { changesStructures, isStop, nextBreak, PLAY_SPEEDS as SPEEDS, structureSteps } from "../learning/activities/dsMotion";
import type { LabTraceOptions, LabTraceResult } from "./labTrace";
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
// V4 part 2 (§12):
//   • Viz.Pause("…") in the program is a stop like a breakpoint (auto-play halts there, «إلى نقطة التوقف التالية» goes there, and
//     «عمليات المباني فقط» keeps it); Viz.Show("…") titles a step (the step's note, drawn by the course's view);
//   • «اكشف الداخل»: records the SAME program again with the book's Stack<T> / Queue<T> as objects (their Node<T> chain) — the step,
//     the breakpoints and the other choices stay; a failed re-recording keeps the drawing it had and says so;
//   • «توقّع قبل أن ترى»: every step whose structures changed is covered until «اكشف» (auto-play halts at it) — the class predicts first.
// V12 (§22): «العمليات والدوال» — the running methods as frames, how each parameter was passed (a copy, or ref / out: the caller's very
// variable), and the value a method returns going back (callFlow.ts, CallFlowDrawing.tsx).
// V10 (§20): the objects of the writer's classes as an object diagram (objectGraph.ts, ObjectDiagram.tsx) — boxes of fields, arrows to
// the objects / arrays they refer to, the field that changed in this step lit, a new object marked «جديد».
// Its own lazy chunk (with its CSS): the editor and the reader carry none of it until a visual run is asked for.
type Speed = keyof typeof SPEEDS;
const SPEED_NAMES: Record<Speed, string> = { slow: "بطيء", normal: "عادي", fast: "سريع" };

type Retrace = (options: LabTraceOptions, signal: AbortSignal) => Promise<LabTraceResult>;

export default function LabTraceView({ trace, epoch, retrace }: { trace: DsTrace; epoch: number; retrace?: Retrace }) {
  return <Player key={epoch} first={trace} epoch={epoch} retrace={retrace} />;
}

const stopNote = (line: number, isBreak: boolean) => (isBreak ? "توقف عند نقطة التوقف على السطر " + line + "." : "توقف عند Viz.Pause على السطر " + line + ".");

function Player({ first, epoch, retrace }: { first: DsTrace; epoch: number; retrace?: Retrace }) {
  const [trace, setTrace] = useState(first);
  const total = trace.steps.length;
  const [atRaw, setAt] = useState(0);
  const at = Math.min(atRaw, total - 1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [opsOnly, setOpsOnly] = useState(false);
  const [breakpoints, setBreakpoints] = useState<ReadonlySet<number>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const [inside, setInside] = useState(false);
  const [recording, setRecording] = useState(false);
  const [predict, setPredict] = useState(false);
  const [showCalls, setShowCalls] = useState(false);
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set());
  const reduced = usePrefersReducedMotion();
  const heap = useCallback<HeapDiagram>((step, prev, marks) => {
    const graph = objectGraphOf(step, prev, marks);
    return graph ? { node: <ObjectDiagram graph={graph} motion={!reduced} />, drawn: new Set(graph.nodes.map(n => n.id)) } : null;
  }, [reduced]);
  const flow = useCallback<FlowDiagram>((step, prev, cfg, text) => {   // V12: the running methods, while one called another
    const f = callFlowOf(step, prev, cfg, text);
    return f ? <CallFlowDrawing flow={f} names={i => step.frames[i]?.name ?? ""} /> : null;
  }, []);
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);

  const ops = useMemo(() => structureSteps(trace), [trace]);
  // «عمليات المباني فقط» keeps the writer's own Viz.Pause() stops too
  const pool = useMemo(() => (opsOnly ? trace.steps.map((_, i) => i).filter(i => ops.includes(i) || trace.steps[i].pause === true) : trace.steps.map((_, i) => i)),
    [opsOnly, ops, trace]);
  const isHidden = (i: number) => predict && !revealed.has(i) && changesStructures(trace, i);
  // V8 «شجرة الاستدعاءات»: offered when the run called something besides its entry (a method, a recursion)
  const hasCalls = useMemo(() => { const t = callTreeOf(trace, trace.steps.length - 1); return !!t && t.total > 1; }, [trace]);
  const calls = useMemo(() => (showCalls && hasCalls ? callTreeOf(trace, at) : null), [showCalls, hasCalls, trace, at]);
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
      const step = trace.steps[next];
      if (isStop(step, breakpoints)) { setPlaying(false); setNote(stopNote(step.line, breakpoints.has(step.line))); }
      else if (predict && !revealed.has(next) && changesStructures(trace, next)) { setPlaying(false); setNote("تغيّرت المباني: توقّعوا كيف أصبحت، ثم اكشفوا."); }
      else if (pool.find(p => p > next) === undefined) setPlaying(false);
    }, SPEEDS[speed]);
    return () => clearTimeout(t);
  }, [playing, at, speed, pool, breakpoints, trace, predict, revealed]);

  const move = (to: number | null) => { if (to !== null) { setAt(to); setNote(""); } };
  const toggle = (line: number) => setBreakpoints(b => { const n = new Set(b); if (n.has(line)) n.delete(line); else n.add(line); return n; });
  const toBreak = () => {
    const i = nextBreak(trace, at, breakpoints, pool);
    if (i === null) setNote(breakpoints.size || trace.steps.some(s => s.pause) ? "لا نقطة توقّف بعد هذه الخطوة." : "لا نقاط توقّف: انقر رقم سطر في البرنامج لتضع واحدة.");
    else move(i);
  };
  // «اكشف الداخل»: the same program recorded again; what the teacher chose stays (step, breakpoints, speed, walk)
  const lookInside = async (on: boolean) => {
    if (!retrace) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setPlaying(false);
    setRecording(true);
    setInside(on);
    setNote(on ? "جارٍ تسجيل البرنامج مع داخل المكدّس والطابور…" : "جارٍ تسجيل البرنامج كما يُرسم عادة…");
    try {
      const r = await retrace({ inside: on }, c.signal);
      if (c.signal.aborted) return;
      if (!r.trace) { setInside(!on); setNote("تعذّر التسجيل الآن، فبقي العرض كما كان." + (r.status === "compile-error" ? " (خطأ ترجمة)" : "")); return; }
      setTrace(r.trace);
      setRevealed(new Set());
      setNote(on ? "المكدّس والطابور معروضان من الداخل: عقد مترابطة (Node) يشير إليها رأسهما." : "عاد المكدّس والطابور إلى رسمهما المعتاد.");
    } catch {
      if (!c.signal.aborted) { setInside(!on); setNote("تعذّر التسجيل الآن، فبقي العرض كما كان."); }
    } finally {
      if (!c.signal.aborted) setRecording(false);
    }
  };
  const setGuess = (on: boolean) => { setPredict(on); setRevealed(new Set()); setNote(on ? "عند كل خطوة تغيّر المباني: توقّعوا أولًا، ثم «اكشف»." : ""); };
  const reveal = () => { setRevealed(r => new Set(r).add(at)); setNote(""); };
  const setOps = (on: boolean) => {
    setOpsOnly(on);
    // the step shown stays a step of the walk: the nearest structure step at or before it
    const kept = (i: number) => ops.includes(i) || trace.steps[i].pause === true;
    if (on && !kept(at)) setAt(trace.steps.map((_, i) => i).filter(i => i <= at && kept(i)).pop() ?? 0);
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
        {retrace && (
          <label className="lab-trace-check" title="يرسم Stack و Queue الخاصّين بالكتاب كعقد مترابطة كما بُنيا">
            <input type="checkbox" checked={inside} disabled={recording} onChange={e => void lookInside(e.target.checked)} /> اكشف الداخل
          </label>
        )}
        <label className="lab-trace-check"><input type="checkbox" checked={predict} onChange={e => setGuess(e.target.checked)} /> توقّع قبل أن ترى</label>
        {hasCalls && <label className="lab-trace-check"><input type="checkbox" checked={showCalls} onChange={e => setShowCalls(e.target.checked)} /> شجرة الاستدعاءات</label>}
        {!expanded && <button type="button" className="learning-trace-btn" onClick={() => setExpanded(true)}>توسيع</button>}
        <span className="learning-trace-counter">الخطوة <span dir="ltr">{at + 1} / {total}</span></span>
        {total > 12 && (
          <input type="range" className="learning-trace-slider" dir="ltr" min={1} max={total} value={at + 1} aria-label="انتقل إلى الخطوة"
            aria-valuetext={"الخطوة " + (at + 1) + " من " + total} onChange={e => { setAt(Number(e.target.value) - 1); setNote(""); }} />
        )}
      </div>
      <p className="lab-trace-note" role="status" aria-live="polite">{note || (breakpoints.size ? "نقاط التوقف: السطر " + [...breakpoints].sort((a, b) => a - b).join("، ") + "." : "انقر رقم سطر في البرنامج لتضع نقطة توقّف.")}</p>
      <DsTraceView cfg={trace} epoch={epoch} at={at} controls={false} breakpoints={breakpoints} onToggleBreakpoint={toggle} motion={!reduced}
        hidden={isHidden(at)} onReveal={reveal} heap={heap} flow={flow} />
      {calls && !isHidden(at) && (
        <section className="lab-trace-calls" aria-label="شجرة الاستدعاءات">
          <h4 className="learning-trace-heading">شجرة الاستدعاءات</h4>
          {calls.clipped && <p className="stt-hint" role="note">الاستدعاءات أكثر من {CALL_TREE_MAX}: تُعرض أول {CALL_TREE_MAX} استدعاءً.</p>}
          <CallTreeView tree={calls} />
        </section>
      )}
    </div>
  );

  return (
    <>
      {expanded ? <p className="stt-hint" role="note">التشغيل المرئي معروض في نافذة موسّعة.</p> : body}
      <Dialog open={expanded} title="التشغيل المرئي" onClose={() => setExpanded(false)} size="lg" className="lab-trace-dialog">{expanded && body}</Dialog>
    </>
  );
}
