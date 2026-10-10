import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { SmartSimWorkspaceProps } from "../trustedSim/smartSimUiRegistry";
import { LAB_EXPERIMENT_LABEL, LAB_PRIMARY_AXES, labControlOf, labExplorationProblem, validateLabConfig, type LabConfigV1 } from "../physicsLabModel";
import type { LabStateV1 } from "../physicsLabPlugin";
import { resolveSmartSimPlugin } from "../trustedSimPlugins";
import { replaySmartSimActions } from "../trustedSimQuestion";
import { LAB_PARAM_SPEC, fmtLab, labEndTime, labFrame, labSamples, type LabFrame, type LabModel, type LabParams } from "../physics/labCore";
import { DYNAMIC_LIMITS } from "../smartsim/dynamic/simulationClock";
import { useSimulationClock } from "../smartsim/dynamic/useSimulationClock";
import { usePrefersReducedMotion } from "../smartsim/dynamic/usePrefersReducedMotion";
import { visiblePrefix } from "../smartsim/dynamic/progressivePath";
import DynamicPlot2D, { type PlotEvent } from "../smartsim/dynamic/DynamicPlot2D";
import DynamicErrorBoundary from "../smartsim/dynamic/DynamicErrorBoundary";
import { ClockBar, ExplorationPanel, MeasurementTask, PointTask } from "../physicsShared/labWidgets";
import LabScene, { type DragSpec, type LabSceneScales } from "./LabScene";
import { STATUS_TEXT, circuitSweep, conservesEnergy, labEvents, labGraphs, labReadout, topologyLabel, valueDomain } from "./labView";
import "./lab.css";

// Phase 21D-A.2 — the physicsLab@1 STUDENT workspace (lazy; also the teacher preview): pendulum, spring, mechanical energy, DC circuits.
// It renders ONLY the canonical public config and follows the A.1 rules, through the SAME shared widgets:
//   * Answers: explicit "save" / "clear" decisions become SEMANTIC actions replayed through the plugin code the server uses.
//   * Experiment: ONE presentation clock drives the scene, the synchronized graphs, the energy bars and the live readout; every value is
//     the core evaluated at the clock time (deterministic). For the circuit the clock only animates the current markers (DC steady state).
//   * Exploration (teacher-permitted parameters, dragging the pendulum at t = 0, choosing the component a meter reads) is PRESENTATION:
//     never saved, never graded; a banner says so whenever the explored experiment differs, with a one-click return.
/** Answers are replayed through the REGISTERED plugin with the SmartSim core's own bounded replay (the one path every surface uses); the
 *  plugin modules therefore load with the registry instead of as extra chunks of the initial preload lists (Phase 21D-A.2 bundle budget). */
const replayState = (cfg: LabConfigV1, actions: readonly unknown[]): { ok: true; state: LabStateV1 } | { ok: false } => {
  const plugin = resolveSmartSimPlugin("physicsLab", 1), r = plugin ? replaySmartSimActions(plugin, cfg, actions) : null;
  return r && r.ok ? { ok: true, state: r.state as LabStateV1 } : { ok: false };
};
type Act = { measurementId?: string; pointId?: string };
const taskOf = (a: unknown) => { const x = a as Act; return x && typeof x === "object" ? x.measurementId ?? x.pointId : undefined; };
type SavedPoint = { id: string; label: string; x: number; y: number };
const PLOT_W = 360, PLOT_H = 220, SAMPLE_COUNT = 240;
const ANNOUNCE = { paused: (t: number) => "تم إيقاف المحاكاة مؤقتًا عند t = " + fmtLab(t) + " s.", reset: "أُعيدت المحاكاة إلى البداية (t = 0 s)." };

type ViewProps = { cfg: LabConfigV1; model: LabModel; savedPoints: readonly SavedPoint[]; nowRef: RefObject<number>; onDragAngle?: (deg: number) => void };
function LabDynamicView({ cfg, model: m, savedPoints, nowRef, onDragAngle }: ViewProps) {
  const reduced = usePrefersReducedMotion(), circuit = m.kind === "circuit";
  const end = useMemo(() => labEndTime(m, cfg.view.maxTime), [m, cfg.view.maxTime]);
  const clock = useSimulationClock(end, { reducedMotion: reduced });
  const { time, playing, rate } = clock.state;
  const [vectors, setVectors] = useState(cfg.view.showVectors);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [announce, setAnnounce] = useState("");
  const conserved = conservesEnergy(m);

  // per-run precomputation (never per frame)
  const pre = useMemo(() => {
    const samples = circuit ? circuitSweep(m) : labSamples(m, end, SAMPLE_COUNT), specs = labGraphs(m, cfg.view.graphs), events = labEvents(m, end);
    const plots = specs.map(g => {
      const series = g.series.map(s => ({ id: s.id, className: s.className, label: s.label, pick: s.pick, points: samples.map(f => ({ t: f.t, ...s.pick(f) })) }));
      const xs = series.flatMap(s => s.points.map(p => p.x)), ys = series.flatMap(s => s.points.map(p => p.y));
      const xDomain: [number, number] = g.xIsTime ? [0, end || 1] : valueDomain(xs);
      const evs = g.xIsTime ? events.map<PlotEvent>(e => { const q = g.series[0].pick(labFrame(m, e.t, end)); return { x: q.x, y: q.y, label: e.label, kind: e.kind }; }) : [];
      return { spec: g, series, xDomain, yDomain: valueDomain(ys), events: evs };
    });
    let speedMax = 0, forceMax = 0, energyMax = 0, qMax = 0, extMin = Infinity, extMax = -Infinity;
    for (const f of circuit ? [] : samples) {
      speedMax = Math.max(speedMax, f.speed); qMax = Math.max(qMax, Math.abs(f.q)); extMin = Math.min(extMin, -f.position.y); extMax = Math.max(extMax, -f.position.y);
      for (const fo of f.forces) forceMax = Math.max(forceMax, fo.magnitude);
      if (f.energy) energyMax = Math.max(energyMax, f.energy.total, f.energy.kinetic, f.energy.potential, f.energy.dissipated);
    }
    const scales: LabSceneScales = { speedMax, forceMax, energyMax, qMax, extMin: Number.isFinite(extMin) ? extMin : 0, extMax: Number.isFinite(extMax) ? extMax : 0 };
    return { plots, events, scales };
  }, [m, end, cfg.view.graphs, circuit]);

  const frame: LabFrame = labFrame(m, time, end);
  useEffect(() => { nowRef.current = frame.t; }, [frame.t, nowRef]);
  const prev = useRef({ time: 0, playing: false }), manual = useRef(false);
  useEffect(() => {
    const p = prev.current;
    prev.current = { time, playing };
    if (manual.current) { manual.current = false; return; }
    if (!p.playing || !(time > p.time)) return;
    const crossed = pre.events.filter(e => p.time < e.t && e.t <= time);
    if (crossed.length) setAnnounce(crossed.map(e => e.label + " عند t = " + fmtLab(e.t) + " s.").join(" "));
  }, [time, playing, pre]);
  const onPlay = () => { setAnnounce(""); clock.play(); };
  const onPause = () => { if (playing) setAnnounce(ANNOUNCE.paused(time)); clock.pause(); };
  const onReset = () => { manual.current = true; setAnnounce(ANNOUNCE.reset); clock.restart(); };
  const onSeek = (t: number) => { manual.current = true; clock.seek(t); };
  const onStep = (dt: number) => { manual.current = true; clock.step(dt); };

  const control = labControlOf(cfg, "initialAngle");
  const drag: DragSpec | undefined = m.kind === "pendulum" && control && onDragAngle && time === 0 && !playing ? { min: control.min, max: control.max, step: control.step, onAngle: onDragAngle } : undefined;
  const primaryEvents = useMemo(() => {
    const base = pre.plots[0].events, room = Math.max(0, DYNAMIC_LIMITS.eventMarkersMax - base.length);
    return [...base, ...savedPoints.slice(0, room).map<PlotEvent>(p => ({ x: p.x, y: p.y, label: p.label + " (" + fmtLab(p.x) + ", " + fmtLab(p.y) + ")", kind: "student-point" }))];
  }, [pre, savedPoints]);
  const readout = labReadout(m, frame);
  const sel = circuit && selected ? frame.circuit!.branches.find(b => b.id === selected) : undefined;
  const fallback = <p className="motion-fallback" role="note" data-testid="lab-static-fallback">تعذّر عرض الرسم المتحرك على هذا الجهاز؛ القيم العددية أدناه وأدوات الزمن والمهام تبقى متاحة.</p>;
  return (
    <div className="smartsim-dyn motion-dyn lab-dyn">
      <DynamicErrorBoundary fallback={fallback} resetKey={m}>
        <div className="motion-stage">
          <div className="motion-scene lab-scene">
            <LabScene model={m} frame={frame} scales={pre.scales} showVectors={vectors} conserved={conserved} drag={drag} selected={selected} onSelect={id => setSelected(s => (s === id ? undefined : id))} />
          </div>
          <div className="motion-graphs" data-testid="lab-graphs">
            {pre.plots.map((pl, i) => {
              const cur = pl.spec.series[0].pick(frame);
              const progress = pl.spec.xIsTime ? pl.series.map(s => ({ id: s.id, className: s.className, points: visiblePrefix(s.points, frame.t, { t: frame.t, ...s.pick(frame) }) })) : pl.series.map(s => ({ id: s.id, className: s.className, points: s.points }));
              return (
                <DynamicPlot2D key={pl.spec.id} width={PLOT_W} height={PLOT_H} xDomain={pl.xDomain} yDomain={pl.yDomain} xLabel={pl.spec.xLabel} yLabel={pl.spec.yLabel} title={pl.spec.title}
                  testId={"lab-graph-" + pl.spec.id} reference={pl.series.map(s => ({ id: s.id + "-full", points: s.points }))} progress={progress}
                  marker={{ x: cur.x, y: cur.y, label: pl.spec.series[0].label + " = " + fmtLab(cur.y) }} nowX={pl.spec.xIsTime ? frame.t : undefined}
                  events={i === 0 ? primaryEvents : pl.events} zeroLine />
              );
            })}
            {pl2Legend(pre.plots)}
          </div>
        </div>
      </DynamicErrorBoundary>
      {savedPoints.length > 0 && (
        <ul className="motion-points-legend" aria-label="النقاط المحفوظة على المنحنى الرئيسي">
          {savedPoints.map(p => <li key={p.id} data-testid="lab-graph-point" data-id={p.id}>{p.label}: <span className="motion-ltr">({fmtLab(p.x)}, {fmtLab(p.y)})</span></li>)}
        </ul>
      )}
      <ClockBar ns="lab" reduced={reduced} playing={playing} time={frame.t} end={end} rate={rate} fmt={fmtLab} onPlay={onPlay} onPause={onPause} onReset={onReset} onStep={onStep} onRate={r => clock.setRate(r)} onSeek={onSeek}
        toggles={cfg.view.showVectors && (
          <span className="motion-toggles" role="group" aria-label="العرض">
            <button type="button" className="is-secondary" aria-pressed={vectors} onClick={() => setVectors(v => !v)}>{circuit ? "اتجاه التيار" : "المتجهات"}</button>
          </span>
        )} />
      {circuit && (
        <p className="lab-meter" data-testid="lab-meter" aria-live="polite">
          {sel
            ? <>الفولتميتر على <strong>{sel.id.toUpperCase()}</strong>: <span className="motion-ltr">{fmtLab(Math.abs(sel.voltage))} V</span> — الأميتر في فرعه: <span className="motion-ltr">{fmtLab(Math.abs(sel.current))} A</span> — القدرة: <span className="motion-ltr">{fmtLab(Math.abs(sel.power))} W</span></>
            : "اختر مقاومة في المخطط (نقرة أو Enter) لوصل الفولتميتر بين طرفيها وقراءة التيار المار فيها."}
          {" "}<small>({topologyLabel(m.params.topology)}؛ الأسهم تبيّن اتجاه التيار الاصطلاحي وسرعتها رمزية لا تمثل سرعة الإلكترونات.)</small>
        </p>
      )}
      <dl className="motion-readout" data-testid="lab-readout" data-status={frame.status} aria-live={playing ? "off" : "polite"}>
        {readout.map(r => <div key={r.id} data-id={r.id}><dt>{r.label}</dt><dd className="motion-ltr">{r.value} {r.unit}</dd></div>)}
        <div data-id="status"><dt>الحالة</dt><dd>{STATUS_TEXT[frame.status] ?? frame.status}</dd></div>
      </dl>
      {!circuit && <p className="motion-note" data-testid="lab-energy-note">{conserved ? "لا يوجد تخميد ولا مقاومة: الطاقة الميكانيكية الكلية محفوظة (ثابتة)." : "توجد قوة مبددة: الطاقة الميكانيكية تتناقص، والطاقة المبددة تساوي النقص فيها (الحركية + الوضع + المبددة = الطاقة الابتدائية)."}</p>}
      <p className="smartsim-dyn-status motion-announce" role="status" data-testid="lab-announce">{announce}</p>
    </div>
  );
}
/** A compact legend for multi-series graphs (energy). */
function pl2Legend(plots: { spec: { id: string }; series: { id: string; label: string; className?: string }[] }[]) {
  const multi = plots.flatMap(p => (p.series.length > 1 ? p.series.map(s => ({ ...s, graph: p.spec.id })) : []));
  if (!multi.length) return null;
  const seen = new Set<string>();
  return (
    <ul className="lab-legend" aria-label="مفتاح المنحنيات">
      {multi.filter(s => (seen.has(s.id) ? false : (seen.add(s.id), true))).map(s => <li key={s.id} className={s.className}><span className="lab-swatch" aria-hidden="true" /> {s.label}</li>)}
    </ul>
  );
}

export default function LabWorkspace({ config: rawConfig, actions, onChange, disabled, label }: SmartSimWorkspaceProps) {
  const cfg = useMemo<LabConfigV1 | null>(() => { const r = validateLabConfig(rawConfig); return r.ok ? r.config : null; }, [rawConfig]);
  const replay = useMemo(() => (cfg ? replayState(cfg, actions) : null), [cfg, actions]);
  const [confirm, setConfirm] = useState(false);
  const [explore, setExplore] = useState<{ base: LabConfigV1 | null; params: LabParams | null }>({ base: cfg, params: cfg ? { ...cfg.params } : null });
  if (explore.base !== cfg) setExplore({ base: cfg, params: cfg ? { ...cfg.params } : null });      // a new config restarts from the authored values
  const nowRef = useRef(0);
  const params = explore.base === cfg && explore.params ? explore.params : cfg?.params;
  const model = useMemo<LabModel | null>(() => (cfg && params ? { kind: cfg.experiment, params } : null), [cfg, params]);
  const savedPoints = useMemo<SavedPoint[]>(() => {
    if (!cfg || !replay || !replay.ok) return [];
    const pts = replay.state.points;
    return cfg.tasks.points.filter(p => Object.prototype.hasOwnProperty.call(pts, p.id)).map(p => ({ id: p.id, label: p.label, x: pts[p.id].x, y: pts[p.id].y }));
  }, [cfg, replay]);
  if (!cfg || !model) return <p className="ncli-unavailable" role="note" data-testid="lab-unavailable">إعداد تجربة المختبر لهذا السؤال غير متوفر في هذا الإصدار.</p>;
  const state: LabStateV1 = replay && replay.ok ? replay.state : { v: 1, measurements: {}, points: {} };
  const base = replay && replay.ok ? [...actions] : [];
  const emit = (next: unknown[]) => { const r = replayState(cfg, next); if (r.ok) onChange(next, r.state); };
  const decide = (id: string, action: Record<string, unknown>) => emit([...base.filter(a => taskOf(a) !== id), action]);
  const axes = LAB_PRIMARY_AXES[cfg.experiment];
  const spec = LAB_PARAM_SPEC[cfg.experiment];
  const setParams = (p: LabParams) => setExplore({ base: cfg, params: p });
  const onDragAngle = (deg: number) => { const next = { ...(params ?? cfg.params), initialAngle: deg }; if (!labExplorationProblem(cfg, next)) setParams(next); };
  const authored = spec.map(s => {
    const opt = s.options?.find(o => o.value === cfg.params[s.key]);
    return <>{s.label}: <span className="motion-ltr">{opt ? "" : fmtLab(cfg.params[s.key]) + (s.unit === "1" ? "" : " " + s.unit)}</span>{opt ? opt.label : ""}{labControlOf(cfg, s.key) ? " (قابل للاستكشاف)" : ""}</>;
  });
  return (
    <div className="motion lab" dir="rtl" data-testid="lab-workspace" data-experiment={cfg.experiment} aria-label={(label ? label + " — " : "") + "محاكاة " + LAB_EXPERIMENT_LABEL[cfg.experiment]}>
      <p className="motion-note"><strong>{LAB_EXPERIMENT_LABEL[cfg.experiment]}</strong> — التجربة المطلوبة: <span data-testid="lab-authored">{authored.map((a, i) => <span key={i} className="motion-param">{a}</span>)}</span>. وحدات SI. شغّل المحاكاة أو حرّك الزمن لتقيس، ثم احفظ إجاباتك صراحةً — التشغيل والاستكشاف لا يُحفظان ولا يُقيَّمان.</p>
      <ExplorationPanel ns="lab" controls={cfg.controls} authored={cfg.params} params={params ?? cfg.params} fmt={fmtLab} onParams={setParams}
        info={k => { const sp = spec.find(x => x.key === k); return sp && { label: sp.label, unit: sp.unit, options: sp.options }; }} problem={next => labExplorationProblem(cfg, next)}
        extra={cfg.experiment === "pendulum" && labControlOf(cfg, "initialAngle") ? <p className="motion-note">يمكنك أيضًا سحب الثقل لضبط زاوية البدء (عند t = 0) أو تحديده والضغط على الأسهم.</p> : undefined} />
      <LabDynamicView cfg={cfg} model={model} savedPoints={savedPoints} nowRef={nowRef} onDragAngle={labControlOf(cfg, "initialAngle") ? onDragAngle : undefined} />
      <div className="motion-tasks">
        {cfg.tasks.measurements.map(t => (
          <MeasurementTask key={t.id} ns="lab" fmt={fmtLab} task={t} saved={state.measurements[t.id]} disabled={disabled}
            onSave={v => decide(t.id, { type: "measurement.set", measurementId: t.id, value: v })} onClear={() => decide(t.id, { type: "measurement.clear", measurementId: t.id })} />
        ))}
        {cfg.tasks.points.map(p => (
          <PointTask key={p.id} ns="lab" fmt={fmtLab} task={p} saved={state.points[p.id]} axes={axes} getNow={() => nowRef.current} xMax={axes.xIsTime ? cfg.view.maxTime : null} disabled={disabled}
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
