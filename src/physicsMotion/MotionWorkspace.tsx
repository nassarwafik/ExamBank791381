import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { SmartSimWorkspaceProps } from "../trustedSim/smartSimUiRegistry";
import { MOTION_EXPERIMENT_LABEL, MOTION_PRIMARY_AXES, motionControlOf, motionExplorationProblem, validateMotionConfig, type MotionConfigV1 } from "../physicsMotionModel";
import { replayMotion, type MotionStateV1 } from "../physicsMotionPlugin";
import { MOTION_PARAM_SPEC, fmtMotion, motionEndTime, motionFrame, motionSamples, type MotionModel, type MotionParams } from "../physics/motionCore";
import { ClockBar, ExplorationPanel, MeasurementTask, PointTask } from "../physicsShared/labWidgets";
import { DYNAMIC_LIMITS } from "../smartsim/dynamic/simulationClock";
import { useSimulationClock } from "../smartsim/dynamic/useSimulationClock";
import { usePrefersReducedMotion } from "../smartsim/dynamic/usePrefersReducedMotion";
import { visiblePrefix } from "../smartsim/dynamic/progressivePath";
import DynamicPlot2D, { type PlotEvent } from "../smartsim/dynamic/DynamicPlot2D";
import DynamicErrorBoundary from "../smartsim/dynamic/DynamicErrorBoundary";
import MotionScene from "./MotionScene";
import { STATUS_TEXT, motionEvents, motionGraphs, motionReadout, sceneScales, valueDomain } from "./motionView";
import "./motion.css";

// Phase 21D-A.1 — the physicsMotion@1 STUDENT workspace (lazy; also the teacher preview). It renders ONLY the canonical public config.
//   * Answers: the student's explicit "save" / "clear" decisions become SEMANTIC actions (measurement.set / clear, graphPoint.set / clear),
//     replayed through the same plugin code the server uses; a later decision on a task replaces the earlier one.
//   * Experiment: ONE presentation clock drives the scene, the synchronized graphs, the vectors, the live readout and the event
//     announcements; every value on screen is the closed-form model at the clock time (deterministic: the same t always shows the same
//     state). Play / pause / resume / reset / single-step / rate / scrub never produce an action and never reach the answer.
//   * Exploration: the teacher may permit some parameters to be adjusted within limits. Exploration is PRESENTATION ONLY in this version —
//     it is never saved and the tasks are always graded on the experiment the teacher authored; a banner says so whenever the explored
//     values differ, with a one-click return to the authored experiment.
// prefers-reduced-motion: no play control and no animation; stepping, the slider and time entry keep every value reachable.
type Act = { measurementId?: string; pointId?: string };
const taskOf = (a: unknown) => { const x = a as Act; return x && typeof x === "object" ? x.measurementId ?? x.pointId : undefined; };
type SavedPoint = { id: string; label: string; x: number; y: number };

const PLOT_W = 360, PLOT_H = 220, SAMPLE_COUNT = 240;
const ANNOUNCE = { paused: (t: number) => "تم إيقاف المحاكاة مؤقتًا عند t = " + fmtMotion(t) + " s.", reset: "أُعيدت المحاكاة إلى البداية (t = 0 s)." };

type ViewProps = { model: MotionModel; maxTime: number; graphs: readonly string[]; showVectors: boolean; savedPoints: readonly SavedPoint[]; nowRef: RefObject<number> };
/** The clock-driven presentation (scene, graphs, controls, timeline, readout, announcements). Never receives `onChange`. */
function MotionDynamicView({ model: m, maxTime, graphs, showVectors, savedPoints, nowRef }: ViewProps) {
  const reduced = usePrefersReducedMotion();
  const end = useMemo(() => motionEndTime(m, maxTime), [m, maxTime]);
  const clock = useSimulationClock(end, { reducedMotion: reduced });
  const { time, playing, rate } = clock.state;
  const [showV, setShowV] = useState(showVectors);
  const [showF, setShowF] = useState(showVectors);
  const [announce, setAnnounce] = useState("");

  // per-run precomputation (never per frame)
  const pre = useMemo(() => {
    const samples = motionSamples(m, end, SAMPLE_COUNT), specs = motionGraphs(m.kind, graphs), events = motionEvents(m, end);
    const plots = specs.map(g => {
      const series = g.series.map(s => ({ id: s.id, className: s.className, pick: s.pick, points: samples.map(f => ({ t: f.t, ...s.pick(f) })) }));
      const ys = series.flatMap(s => s.points.map(p => p.y)), xs = series.flatMap(s => s.points.map(p => p.x));
      const xDomain: [number, number] = g.xIsTime ? [0, end || 1] : valueDomain(xs);
      const evs = events.map<PlotEvent>(e => { const f = motionFrame(m, e.t, end), q = g.series[0].pick(f); return { x: q.x, y: q.y, label: e.label, kind: e.kind }; });   // named only: a future event's exact time / value is a graded quantity
      return { spec: g, series, xDomain, yDomain: valueDomain(ys), events: evs };
    });
    return { plots, events, scales: sceneScales(m, samples) };
  }, [m, end, graphs]);

  const frame = motionFrame(m, time, end);
  useEffect(() => { nowRef.current = frame.t; }, [frame.t, nowRef]);

  // Event announcements: only a forward crossing made BY PLAYBACK announces; a scrub or a step never does.
  const prev = useRef({ time: 0, playing: false });
  const manual = useRef(false);
  useEffect(() => {
    const p = prev.current;
    prev.current = { time, playing };
    if (manual.current) { manual.current = false; return; }
    if (!p.playing || !(time > p.time)) return;
    const crossed = pre.events.filter(e => p.time < e.t && e.t <= time);
    if (crossed.length) setAnnounce(crossed.map(e => e.label + " عند t = " + fmtMotion(e.t) + " s.").join(" "));
  }, [time, playing, pre]);

  const onPlay = () => { setAnnounce(""); clock.play(); };
  const onPause = () => { if (playing) setAnnounce(ANNOUNCE.paused(time)); clock.pause(); };
  const onReset = () => { manual.current = true; setAnnounce(ANNOUNCE.reset); clock.restart(); };
  const onSeek = (t: number) => { manual.current = true; clock.seek(t); };
  const onStep = (dt: number) => { manual.current = true; clock.step(dt); };

  const primaryEvents = useMemo(() => {
    const base = pre.plots[0].events, room = Math.max(0, DYNAMIC_LIMITS.eventMarkersMax - base.length);
    return [...base, ...savedPoints.slice(0, room).map<PlotEvent>(p => ({ x: p.x, y: p.y, label: p.label + " (" + fmtMotion(p.x) + ", " + fmtMotion(p.y) + ")", kind: "student-point" }))];
  }, [pre, savedPoints]);
  const readout = motionReadout(m, frame);
  const fallback = <p className="motion-fallback" role="note" data-testid="motion-static-fallback">تعذّر عرض الرسم المتحرك على هذا الجهاز؛ القيم العددية أدناه وأدوات الزمن والمهام تبقى متاحة.</p>;
  return (
    <div className="smartsim-dyn motion-dyn">
      <DynamicErrorBoundary fallback={fallback} resetKey={m}>
        <div className="motion-stage">
          <div className="motion-scene">
            <MotionScene model={m} frame={frame} scales={pre.scales} showVelocity={showVectors && showV} showForces={showVectors && showF} />
          </div>
          <div className="motion-graphs" data-testid="motion-graphs">
            {pre.plots.map((pl, i) => {
              const cur = pl.spec.series[0].pick(frame);
              return (
                <DynamicPlot2D key={pl.spec.id} width={PLOT_W} height={PLOT_H} xDomain={pl.xDomain} yDomain={pl.yDomain} xLabel={pl.spec.xLabel} yLabel={pl.spec.yLabel} title={pl.spec.title}
                  testId={"motion-graph-" + pl.spec.id} reference={pl.series.map(s => ({ id: s.id + "-full", points: s.points }))}
                  progress={pl.series.map(s => ({ id: s.id, className: s.className, points: visiblePrefix(s.points, frame.t, { t: frame.t, ...s.pick(frame) }) }))}
                  marker={{ x: cur.x, y: cur.y, label: pl.spec.series[0].label + " = " + fmtMotion(cur.y) }} nowX={pl.spec.xIsTime ? frame.t : undefined}
                  events={i === 0 ? primaryEvents : pl.events} zeroLine />
              );
            })}
          </div>
        </div>
      </DynamicErrorBoundary>
      {savedPoints.length > 0 && (
        <ul className="motion-points-legend" aria-label="النقاط المحفوظة على المنحنى الرئيسي">
          {savedPoints.map(p => <li key={p.id} data-testid="motion-graph-point" data-id={p.id}>{p.label}: <span className="motion-ltr">({fmtMotion(p.x)}, {fmtMotion(p.y)})</span></li>)}
        </ul>
      )}
      <ClockBar ns="motion" reduced={reduced} playing={playing} time={frame.t} end={end} rate={rate} fmt={fmtMotion} onPlay={onPlay} onPause={onPause} onReset={onReset} onStep={onStep} onRate={r => clock.setRate(r)} onSeek={onSeek}
        toggles={showVectors && (
          <span className="motion-toggles" role="group" aria-label="المتجهات">
            <button type="button" className="is-secondary" aria-pressed={showV} onClick={() => setShowV(s => !s)}>متجه السرعة</button>
            <button type="button" className="is-secondary" aria-pressed={showF} onClick={() => setShowF(s => !s)}>{m.kind === "freeFall" || m.kind === "projectile" ? "متجه التسارع" : "القوى"}</button>
          </span>
        )} />
      <dl className="motion-readout" data-testid="motion-readout" data-status={frame.status} aria-live={playing ? "off" : "polite"}>
        {readout.map(r => <div key={r.id} data-id={r.id}><dt>{r.label}</dt><dd className="motion-ltr">{r.value} {r.unit}</dd></div>)}
        <div data-id="status"><dt>الحالة</dt><dd>{STATUS_TEXT[frame.status] ?? frame.status}</dd></div>
      </dl>
      <p className="smartsim-dyn-status motion-announce" role="status" data-testid="motion-announce">{announce}</p>
    </div>
  );
}

export default function MotionWorkspace({ config: rawConfig, actions, onChange, disabled, label }: SmartSimWorkspaceProps) {
  const cfg = useMemo<MotionConfigV1 | null>(() => { const r = validateMotionConfig(rawConfig); return r.ok ? r.config : null; }, [rawConfig]);
  const replay = useMemo(() => (cfg ? replayMotion(cfg, actions) : null), [cfg, actions]);
  const [confirm, setConfirm] = useState(false);
  const [explore, setExplore] = useState<{ base: MotionConfigV1 | null; params: MotionParams | null }>({ base: cfg, params: cfg ? { ...cfg.params } : null });
  if (explore.base !== cfg) setExplore({ base: cfg, params: cfg ? { ...cfg.params } : null });      // a new config restarts from the authored values
  const nowRef = useRef(0);
  const params = explore.base === cfg && explore.params ? explore.params : cfg?.params;
  const model = useMemo<MotionModel | null>(() => (cfg && params ? { kind: cfg.experiment, params } : null), [cfg, params]);
  const savedPoints = useMemo<SavedPoint[]>(() => {
    if (!cfg || !replay || !replay.ok) return [];
    const pts = replay.state.points;
    return cfg.tasks.points.filter(p => Object.prototype.hasOwnProperty.call(pts, p.id)).map(p => ({ id: p.id, label: p.label, x: pts[p.id].x, y: pts[p.id].y }));
  }, [cfg, replay]);
  if (!cfg || !model) return <p className="ncli-unavailable" role="note" data-testid="motion-unavailable">إعداد محاكاة الحركة لهذا السؤال غير متوفر في هذا الإصدار.</p>;
  const state: MotionStateV1 = replay && replay.ok ? replay.state : { v: 1, measurements: {}, points: {} };
  const base = replay && replay.ok ? [...actions] : [];
  const emit = (next: unknown[]) => { const r = replayMotion(cfg, next); if (r.ok) onChange(next, r.state); };
  const decide = (id: string, action: Record<string, unknown>) => emit([...base.filter(a => taskOf(a) !== id), action]);
  const axes = MOTION_PRIMARY_AXES[cfg.experiment];
  // each value + unit is an LTR island so labels ending in parentheses never reorder it in the RTL sentence
  const authored = MOTION_PARAM_SPEC[cfg.experiment].map(s => <>{s.label}: <span className="motion-ltr">{fmtMotion(cfg.params[s.key])}{s.unit === "1" ? "" : " " + s.unit}</span>{motionControlOf(cfg, s.key) ? " (قابل للاستكشاف)" : ""}</>);
  return (
    <div className="motion" dir="rtl" data-testid="motion-workspace" data-experiment={cfg.experiment} aria-label={(label ? label + " — " : "") + "محاكاة " + MOTION_EXPERIMENT_LABEL[cfg.experiment]}>
      <p className="motion-note"><strong>{MOTION_EXPERIMENT_LABEL[cfg.experiment]}</strong> — التجربة المطلوبة: <span data-testid="motion-authored">{authored.map((a, i) => <span key={i} className="motion-param">{a}</span>)}</span>. بإهمال مقاومة الهواء، وحدات SI. شغّل المحاكاة أو حرّك الزمن لتقيس، ثم احفظ إجاباتك صراحةً — التشغيل والاستكشاف لا يُحفظان ولا يُقيَّمان.</p>
      <ExplorationPanel ns="motion" controls={cfg.controls} authored={cfg.params} params={params ?? cfg.params} fmt={fmtMotion} onParams={p => setExplore({ base: cfg, params: p })}
        info={k => { const sp = MOTION_PARAM_SPEC[cfg.experiment].find(x => x.key === k); return sp && { label: sp.label, unit: sp.unit }; }} problem={next => motionExplorationProblem(cfg, next)} />
      <MotionDynamicView model={model} maxTime={cfg.view.maxTime} graphs={cfg.view.graphs} showVectors={cfg.view.showVectors} savedPoints={savedPoints} nowRef={nowRef} />
      <div className="motion-tasks">
        {cfg.tasks.measurements.map(t => (
          <MeasurementTask key={t.id} ns="motion" fmt={fmtMotion} task={t} saved={state.measurements[t.id]} disabled={disabled}
            onSave={v => decide(t.id, { type: "measurement.set", measurementId: t.id, value: v })} onClear={() => decide(t.id, { type: "measurement.clear", measurementId: t.id })} />
        ))}
        {cfg.tasks.points.map(p => (
          <PointTask key={p.id} ns="motion" fmt={fmtMotion} task={p} saved={state.points[p.id]} axes={axes} getNow={() => nowRef.current} xMax={axes.xIsTime ? cfg.view.maxTime : null} disabled={disabled}
            onSave={(x, y) => decide(p.id, { type: "graphPoint.set", pointId: p.id, x, y })} onClear={() => decide(p.id, { type: "graphPoint.clear", pointId: p.id })} />
        ))}
      </div>
      {!disabled && (
        <div className="motion-controls">
          {confirm
            ? <><button type="button" className="is-danger" onClick={() => { setConfirm(false); emit([]); }}>تأكيد مسح كل الإجابات</button><button type="button" className="is-secondary" onClick={() => setConfirm(false)}>إلغاء</button></>
            : <button type="button" className="is-secondary" onClick={() => setConfirm(true)} disabled={base.length === 0}>مسح كل الإجابات</button>}
        </div>
      )}
    </div>
  );
}
