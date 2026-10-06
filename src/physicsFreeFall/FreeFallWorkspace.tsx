import { memo, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { SmartSimWorkspaceProps } from "../trustedSim/smartSimUiRegistry";
import { fmtPhysics, impactSpeed, impactTime, peakHeight, validateFreeFallConfig, type FreeFallConfigV1, type FreeFallMeasurementTask, type FreeFallModel, type FreeFallPointTask } from "../physicsFreeFallModel";
import { replayFreeFall, type FreeFallStateV1 } from "../physicsFreeFallPlugin";
import { parseNumberInput } from "../trustedSim/smartSimNumberInput";
import { DYNAMIC_LIMITS } from "../smartsim/dynamic/simulationClock";
import { useSimulationClock } from "../smartsim/dynamic/useSimulationClock";
import { usePrefersReducedMotion } from "../smartsim/dynamic/usePrefersReducedMotion";
import { niceTicks, visiblePrefix } from "../smartsim/dynamic/progressivePath";
import DynamicPlot2D, { type PlotEvent } from "../smartsim/dynamic/DynamicPlot2D";
import DynamicErrorBoundary from "../smartsim/dynamic/DynamicErrorBoundary";
import { freeFallEvents, freeFallFrame, freeFallSamples, type FreeFallEvent, type FreeFallFrame } from "./freeFallDynamics";
import { UNIT_LABEL } from "./freeFallLabels";
import "./freefall.css";

// Phase 20A.2 / 20E — the physicsFreeFall@1 STUDENT workspace (lazy; also the teacher preview). It renders ONLY the canonical public
// config and turns the student's explicit "save" / "clear" decisions into SEMANTIC actions (measurement.set / clear, graphPoint.set /
// clear). Saved values are replayed through the same plugin code the server uses; a later decision on the same task replaces the earlier
// one, so the stored action list stays compact.
//
// The dynamic experience (Phase 20E) is PRESENTATION only: ONE presentation clock (duration = the impact time) drives the body, the
// progressive height / velocity plots with their synchronized markers, the vectors, the readout and the event announcements; every value
// on screen is the analytic model evaluated at the clock time. Play / pause / restart / step / rate / scrub / vector toggles never produce
// an action and never reach the answer. The clock lives in its own child component so that a playing animation re-renders only the
// dynamic view (never the task forms), and so that a parent re-render (new `actions`, a composite answer elsewhere) never resets it.
// prefers-reduced-motion: no play control and no animation; stepping, the slider and time entry keep every value reachable.
type Act = { type: string; measurementId?: string; pointId?: string };
const taskOf = (a: unknown) => { const x = a as Act; return x && typeof x === "object" ? x.measurementId ?? x.pointId : undefined; };
type SavedPoint = { id: string; label: string; t: number; y: number };

const PLOT_W = 360, PLOT_H = 220, SAMPLE_COUNT = 240;
const SCENE_W = 200, SCENE_H = 300, GROUND_Y = 280, TOP_Y = 28, BALL_R = 10, VECTOR_MAX = 60, VECTOR_MIN = 8;
const RATE_LABEL = (r: number) => String(r) + "×";
const ANNOUNCE = {
  paused: (t: number) => "تم إيقاف المحاكاة مؤقتًا عند t = " + fmtPhysics(t) + " s.",
  restarted: "أُعيدت المحاكاة إلى البداية (t = 0 s).",
  apex: (e: FreeFallEvent) => "بلغ الجسم أعلى نقطة: y = " + fmtPhysics(e.y) + " m عند t = " + fmtPhysics(e.t) + " s، والسرعة صفر.",
  impact: (e: FreeFallEvent) => "وصل الجسم إلى الأرض عند t = " + fmtPhysics(e.t) + " s بسرعة ارتطام " + fmtPhysics(-e.v) + " m/s."
};
const directionOf = (v: number): "up" | "down" | "none" => (Math.abs(v) < 1e-9 ? "none" : v > 0 ? "up" : "down");

function MeasurementTask({ task, saved, disabled, onSave, onClear }: { task: FreeFallMeasurementTask; saved: number | undefined; disabled?: boolean; onSave: (v: number) => void; onClear: () => void }) {
  const [draft, setDraft] = useState(saved === undefined ? "" : String(saved));
  const [error, setError] = useState("");
  const unit = UNIT_LABEL[task.unit] ?? task.unit;
  const save = () => { const v = parseNumberInput(draft); if (v === undefined) { setError("أدخل رقمًا صالحًا (مثل 2.02 أو −9.8)."); return; } setError(""); onSave(v); };
  return (
    <fieldset className="freefall-task" data-testid="freefall-measurement" data-id={task.id}>
      <legend>{task.label} <span className="freefall-ltr">({unit})</span></legend>
      <div className="freefall-row">
        <input type="text" inputMode="decimal" dir="ltr" autoComplete="off" spellCheck={false} aria-label={task.label + " (" + unit + ")"} value={draft} disabled={disabled}
          onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (!disabled) save(); } }} />
        {!disabled && <><button type="button" onClick={save}>حفظ القياس</button><button type="button" className="is-secondary" onClick={onClear} disabled={saved === undefined}>مسح</button></>}
      </div>
      {error && <p className="freefall-error" role="alert">{error}</p>}
      <p className="freefall-saved">{saved === undefined ? "لم يُحفظ بعد." : <>المحفوظ: <span className="freefall-ltr">{fmtPhysics(saved)} {unit}</span></>}</p>
    </fieldset>
  );
}
function PointTask({ task, saved, getNow, maxTime, disabled, onSave, onClear }: { task: FreeFallPointTask; saved: { t: number; y: number } | undefined; getNow: () => number; maxTime: number; disabled?: boolean; onSave: (t: number, y: number) => void; onClear: () => void }) {
  const [t, setT] = useState(saved ? String(saved.t) : "");
  const [y, setY] = useState(saved ? String(saved.y) : "");
  const [error, setError] = useState("");
  const save = () => {
    const tv = parseNumberInput(t), yv = parseNumberInput(y);
    if (tv === undefined || yv === undefined) { setError("أدخل رقمًا صالحًا للزمن وللارتفاع."); return; }
    if (tv < 0 || tv > maxTime) { setError("الزمن يجب أن يكون بين 0 و" + fmtPhysics(maxTime) + " ث."); return; }
    setError(""); onSave(tv, yv);
  };
  return (
    <fieldset className="freefall-task" data-testid="freefall-point" data-id={task.id}>
      <legend>{task.label}</legend>
      <div className="freefall-row">
        <label><span>الزمن t (ث)</span><input type="text" inputMode="decimal" dir="ltr" autoComplete="off" value={t} disabled={disabled} onChange={e => setT(e.target.value)} /></label>
        <label><span>الارتفاع y (م)</span><input type="text" inputMode="decimal" dir="ltr" autoComplete="off" value={y} disabled={disabled} onChange={e => setY(e.target.value)} /></label>
      </div>
      {!disabled && (
        <div className="freefall-row">
          <button type="button" className="is-secondary" onClick={() => setT(String(Number(getNow().toFixed(2))))}>استخدم زمن المحاكاة الحالي</button>
          <button type="button" onClick={save}>حفظ النقطة</button>
          <button type="button" className="is-secondary" onClick={onClear} disabled={!saved}>مسح النقطة</button>
        </div>
      )}
      {error && <p className="freefall-error" role="alert">{error}</p>}
      <p className="freefall-saved">{saved ? <>المحفوظ: <span className="freefall-ltr">(t = {fmtPhysics(saved.t)} s, y = {fmtPhysics(saved.y)} m)</span></> : "لم تُحفظ بعد."}</p>
    </fieldset>
  );
}

/** An arrow from (x, y0) of signed length `len` (positive = up on screen), as trusted SVG primitives built from numbers. */
function Arrow({ testId, kind, x, y0, len, direction, label }: { testId: string; kind: "v" | "a"; x: number; y0: number; len: number; direction: "up" | "down" | "none"; label: string }) {
  if (direction === "none") {
    return <g className={"freefall-vector is-" + kind} data-testid={testId} data-direction="none"><title>{label}</title><circle cx={x} cy={y0} r={3} /></g>;
  }
  const sign = direction === "up" ? -1 : 1, tip = y0 + sign * len, head = Math.min(8, len * 0.6);
  return (
    <g className={"freefall-vector is-" + kind} data-testid={testId} data-direction={direction}>
      <title>{label}</title>
      <line x1={x} x2={x} y1={y0} y2={(tip - sign * head).toFixed(2)} />
      <polygon points={x + "," + tip.toFixed(2) + " " + (x - 5) + "," + (tip - sign * head).toFixed(2) + " " + (x + 5) + "," + (tip - sign * head).toFixed(2)} />
      <text x={x + 7} y={(y0 + sign * len * 0.5 + 4).toFixed(2)}>{kind}</text>
    </g>
  );
}

type SceneProps = { model: FreeFallModel; frame: FreeFallFrame; peak: number; vScale: number; showV: boolean; showA: boolean };
const FreeFallScene = memo(function FreeFallScene({ model, frame, peak, vScale, showV, showA }: SceneProps) {
  const span = GROUND_Y - TOP_Y;
  const sy = (y: number) => GROUND_Y - (y / (peak || 1)) * span;
  const ticks = niceTicks(0, peak, 5);
  const cy = sy(frame.y) - BALL_R;
  const vLen = Math.max(VECTOR_MIN, Math.min(VECTOR_MAX, (Math.abs(frame.v) / (vScale || 1)) * VECTOR_MAX));
  const vText = "متجه السرعة v = " + fmtPhysics(frame.v) + " m/s", aText = "متجه التسارع a = " + fmtPhysics(frame.a) + " m/s²";
  return (
    <svg viewBox={"0 0 " + SCENE_W + " " + SCENE_H} role="img" aria-label={"الجسم على ارتفاع " + fmtPhysics(frame.y) + " متر عند الزمن " + fmtPhysics(frame.t) + " ثانية"}>
      {ticks.map(v => (
        <g key={v} className="freefall-scale">
          <line x1={26} x2={34} y1={sy(v)} y2={sy(v)} />
          <text x={22} y={sy(v) + 4} textAnchor="end">{fmtPhysics(v)}</text>
        </g>
      ))}
      <line className="freefall-scale-axis" x1={34} x2={34} y1={TOP_Y} y2={GROUND_Y} />
      <text className="freefall-scale-unit" x={4} y={14}>y (m)</text>
      <line className="freefall-start" x1={40} x2={SCENE_W - 10} y1={sy(model.initialHeight)} y2={sy(model.initialHeight)} />
      <rect className="freefall-ground" x="0" y={GROUND_Y} width={SCENE_W} height={SCENE_H - GROUND_Y} />
      <line className="freefall-ground-line" x1="0" x2={SCENE_W} y1={GROUND_Y} y2={GROUND_Y} />
      <circle className={"freefall-ball" + (frame.landed ? " is-landed" : "")} data-testid="freefall-body" cx="110" cy={cy.toFixed(2)} r={BALL_R} />
      {showV && <Arrow testId="freefall-vector-v" kind="v" x={138} y0={cy} len={vLen} direction={directionOf(frame.v)} label={vText} />}
      {showA && <Arrow testId="freefall-vector-a" kind="a" x={82} y0={cy} len={VECTOR_MAX * 0.6} direction={directionOf(frame.a)} label={aText} />}
    </svg>
  );
});

type ViewProps = { model: FreeFallModel; showVelocityGraph: boolean; savedPoints: readonly SavedPoint[]; nowRef: RefObject<number> };
/** The clock-driven presentation (scene, plots, controls, timeline, readout, announcements). Never receives `onChange`. */
function FreeFallDynamicView({ model: rawModel, showVelocityGraph, savedPoints, nowRef }: ViewProps) {
  const { initialHeight: h0, initialVelocity: v0, gravity: g } = rawModel;
  const m = useMemo<FreeFallModel>(() => ({ initialHeight: h0, initialVelocity: v0, gravity: g }), [h0, v0, g]);
  const reduced = usePrefersReducedMotion();
  const end = useMemo(() => impactTime(m), [m]);
  const clock = useSimulationClock(end, { reducedMotion: reduced });
  const { time, playing, rate } = clock.state;
  const [showV, setShowV] = useState(false);
  const [showA, setShowA] = useState(false);
  const [announce, setAnnounce] = useState("");

  // per-model precomputation (never per frame): samples as plot points, events, domains
  const pre = useMemo(() => {
    const samples = freeFallSamples(m, SAMPLE_COUNT);
    const events = freeFallEvents(m);
    const peak = peakHeight(m), speed = impactSpeed(m);
    const vTop = Math.max(m.initialVelocity, 0), vBottom = -speed, vSpan = vTop - vBottom || 1;
    return {
      events, peak,
      heightPts: samples.map(s => ({ t: s.t, x: s.t, y: s.y })),
      velocityPts: samples.map(s => ({ t: s.t, x: s.t, y: s.v })),
      heightEvents: events.map<PlotEvent>(e => ({ x: e.t, y: e.y, label: e.label, kind: e.kind })),
      velocityEvents: events.map<PlotEvent>(e => ({ x: e.t, y: e.v, label: e.label, kind: e.kind })),
      xDomain: [0, end] as const,
      hDomain: [0, (peak || 1) * 1.05] as const,
      vDomain: [vBottom - 0.05 * vSpan, vTop + 0.08 * vSpan] as const,
      vScale: Math.max(Math.abs(m.initialVelocity), speed, 1e-9)
    };
  }, [m, end]);
  const heightEvents = useMemo(() => {
    const room = Math.max(0, DYNAMIC_LIMITS.eventMarkersMax - pre.heightEvents.length);
    return [...pre.heightEvents, ...savedPoints.slice(0, room).map<PlotEvent>(p => ({ x: p.t, y: p.y, label: p.label + " (t = " + fmtPhysics(p.t) + " s, y = " + fmtPhysics(p.y) + " m)", kind: "student-point" }))];
  }, [pre, savedPoints]);

  const frame = freeFallFrame(m, time);
  const heightProgress = [{ id: "height", points: visiblePrefix(pre.heightPts, frame.t, { t: frame.t, x: frame.t, y: frame.y }) }];
  const velocityProgress = [{ id: "velocity", className: "is-velocity", points: visiblePrefix(pre.velocityPts, frame.t, { t: frame.t, x: frame.t, y: frame.v }) }];

  useEffect(() => { nowRef.current = frame.t; }, [frame.t, nowRef]);

  // Event announcements: only a forward crossing made BY PLAYBACK announces apex / impact; a scrub or a step never does.
  const prev = useRef({ time: 0, playing: false });
  const manual = useRef(false);
  useEffect(() => {
    const p = prev.current;
    prev.current = { time, playing };
    if (manual.current) { manual.current = false; return; }
    if (!p.playing || !(time > p.time)) return;
    const crossed = pre.events.filter(e => p.time < e.t && e.t <= time);
    if (crossed.length) setAnnounce(crossed.map(e => (e.kind === "apex" ? ANNOUNCE.apex(e) : ANNOUNCE.impact(e))).join(" "));
  }, [time, playing, pre]);

  const onPlay = () => { setAnnounce(""); clock.play(); };
  const onPause = () => { if (playing) setAnnounce(ANNOUNCE.paused(time)); clock.pause(); };
  const onRestart = () => { manual.current = true; setAnnounce(ANNOUNCE.restarted); clock.restart(); };
  const onSeek = (t: number) => { manual.current = true; clock.seek(t); };
  const onStep = (dt: number) => { manual.current = true; clock.step(dt); };

  const fallback = (
    <p className="freefall-fallback" role="note" data-testid="freefall-static-fallback">
      تعذّر عرض الرسم المتحرك على هذا الجهاز؛ القيم العددية أدناه وأدوات الزمن والمهام تبقى متاحة.
    </p>
  );
  return (
    <div className="smartsim-dyn freefall-dyn">
      <DynamicErrorBoundary fallback={fallback} resetKey={m}>
        <div className="freefall-stage">
          <div className="freefall-scene">
            <FreeFallScene model={m} frame={frame} peak={pre.peak} vScale={pre.vScale} showV={showV} showA={showA} />
          </div>
          <div className="freefall-graph" data-testid="freefall-graph">
            <DynamicPlot2D width={PLOT_W} height={PLOT_H} xDomain={pre.xDomain} yDomain={pre.hDomain} xLabel="t (s)" yLabel="y (m)" title="منحنى الارتفاع مع الزمن"
              testId="freefall-height-plot" reference={[{ id: "height-full", points: pre.heightPts }]} progress={heightProgress}
              marker={{ x: frame.t, y: frame.y, label: "y = " + fmtPhysics(frame.y) + " m" }} nowX={frame.t} events={heightEvents} />
            {showVelocityGraph && (
              <DynamicPlot2D width={PLOT_W} height={PLOT_H} xDomain={pre.xDomain} yDomain={pre.vDomain} xLabel="t (s)" yLabel="v (m/s)" title="منحنى السرعة مع الزمن"
                testId="freefall-velocity-graph" reference={[{ id: "velocity-full", points: pre.velocityPts }]} progress={velocityProgress}
                marker={{ x: frame.t, y: frame.v, label: "v = " + fmtPhysics(frame.v) + " m/s" }} nowX={frame.t} events={pre.velocityEvents} zeroLine />
            )}
          </div>
        </div>
      </DynamicErrorBoundary>
      {savedPoints.length > 0 && (
        <ul className="freefall-points-legend" aria-label="النقاط المحفوظة على منحنى الارتفاع">
          {savedPoints.map(p => <li key={p.id} data-testid="freefall-graph-point" data-id={p.id}>{p.label}: <span className="freefall-ltr">(t = {fmtPhysics(p.t)} s, y = {fmtPhysics(p.y)} m)</span></li>)}
        </ul>
      )}
      <div className="smartsim-dyn-controls freefall-controls" role="group" aria-label="التحكم في عرض المحاكاة">
        {reduced
          ? <p className="freefall-note" data-testid="freefall-reduced-motion">الحركة المخففة مفعّلة على جهازك: لا تشغيل تلقائي؛ استخدم أزرار الخطوة أو شريط الزمن أو أدخل الزمن مباشرة.</p>
          : <><button type="button" onClick={onPlay}>تشغيل</button><button type="button" className="is-secondary" onClick={onPause}>إيقاف مؤقت</button></>}
        <button type="button" className="is-secondary" onClick={onRestart}>إعادة العرض</button>
        <button type="button" className="is-secondary" onClick={() => onStep(-DYNAMIC_LIMITS.stepSeconds)}>خطوة للخلف</button>
        <button type="button" className="is-secondary" onClick={() => onStep(DYNAMIC_LIMITS.stepSeconds)}>خطوة للأمام</button>
        {!reduced && (
          <span className="freefall-rates" role="group" aria-label="سرعة التشغيل">
            {DYNAMIC_LIMITS.rates.map(r => (
              <button key={r} type="button" className="is-secondary" data-testid={"freefall-rate-" + r} aria-pressed={rate === r} onClick={() => clock.setRate(r)}>{RATE_LABEL(r)}</button>
            ))}
          </span>
        )}
        <span className="freefall-toggles" role="group" aria-label="المتجهات">
          <button type="button" className="is-secondary" aria-pressed={showV} onClick={() => setShowV(s => !s)}>متجه السرعة</button>
          <button type="button" className="is-secondary" aria-pressed={showA} onClick={() => setShowA(s => !s)}>متجه التسارع</button>
        </span>
      </div>
      <div className="freefall-timeline">
        <input type="range" min={0} max={end} step={0.01} value={frame.t} aria-label="زمن المحاكاة (ث)" aria-valuetext={fmtPhysics(frame.t) + " ثانية"} onChange={e => onSeek(Number(e.target.value))} />
        <label><span>الزمن (ث)</span><input type="number" dir="ltr" min={0} max={end} step={0.01} value={Number(frame.t.toFixed(2))} onChange={e => { const v = parseNumberInput(e.target.value); if (v !== undefined) onSeek(v); }} /></label>
      </div>
      <p className="freefall-readout" data-testid="freefall-readout" aria-live={playing ? "off" : "polite"}>
        <span className="freefall-ltr">t = {fmtPhysics(frame.t)} s</span> · الارتفاع <span className="freefall-ltr">y = {fmtPhysics(frame.y)} m</span> · السرعة <span className="freefall-ltr">v = {fmtPhysics(frame.v)} m/s</span> · التسارع <span className="freefall-ltr">a = {fmtPhysics(frame.a)} m/s²</span>{frame.landed ? " · وصل الجسم إلى الأرض" : ""}
      </p>
      <p className="smartsim-dyn-status freefall-announce" role="status" data-testid="freefall-announce">{announce}</p>
    </div>
  );
}

export default function FreeFallWorkspace({ config: rawConfig, actions, onChange, disabled, label }: SmartSimWorkspaceProps) {
  const cfg = useMemo<FreeFallConfigV1 | null>(() => { const r = validateFreeFallConfig(rawConfig); return r.ok ? r.config : null; }, [rawConfig]);
  const replay = useMemo(() => (cfg ? replayFreeFall(cfg, actions) : null), [cfg, actions]);
  const [confirm, setConfirm] = useState(false);
  const nowRef = useRef(0);
  const savedPoints = useMemo<SavedPoint[]>(() => {
    if (!cfg || !replay || !replay.ok) return [];
    const pts = replay.state.points;
    return cfg.tasks.points.filter(p => Object.prototype.hasOwnProperty.call(pts, p.id)).map(p => ({ id: p.id, label: p.label, t: pts[p.id].t, y: pts[p.id].y }));
  }, [cfg, replay]);
  if (!cfg) return <p className="ncli-unavailable" role="note" data-testid="freefall-unavailable">إعداد محاكاة السقوط الحر لهذا السؤال غير متوفر في هذا الإصدار.</p>;
  const state: FreeFallStateV1 = replay && replay.ok ? replay.state : { v: 1, measurements: {}, points: {} };
  const base = replay && replay.ok ? [...actions] : [];
  const emit = (next: unknown[]) => { const r = replayFreeFall(cfg, next); if (r.ok) onChange(next, r.state); };
  /** A later decision on a task replaces every earlier action on the same task (the replayed state is identical; the list stays small). */
  const decide = (id: string, action: Record<string, unknown>) => emit([...base.filter(a => taskOf(a) !== id), action]);
  const getNow = () => nowRef.current;
  const m = cfg.model, maxT = cfg.view.maxTime;
  return (
    <div className="freefall" data-testid="freefall-workspace" aria-label={label ? label + " — محاكاة السقوط الحر" : "محاكاة السقوط الحر"}>
      <p className="freefall-note">جسم يبدأ من ارتفاع <span className="freefall-ltr">{fmtPhysics(m.initialHeight)} m</span> بسرعة ابتدائية <span className="freefall-ltr">{fmtPhysics(m.initialVelocity)} m/s</span> (الأعلى موجب) وتسارع جاذبية <span className="freefall-ltr">g = {fmtPhysics(m.gravity)} m/s²</span>، بإهمال مقاومة الهواء. شغّل المحاكاة أو حرّك الزمن لتقيس، ثم احفظ إجاباتك صراحةً — التشغيل والتحريك لا يُحفظان ولا يُقيَّمان.</p>
      <FreeFallDynamicView model={m} showVelocityGraph={cfg.view.showVelocityGraph} savedPoints={savedPoints} nowRef={nowRef} />
      <div className="freefall-tasks">
        {cfg.tasks.measurements.map(t => (
          <MeasurementTask key={t.id} task={t} saved={state.measurements[t.id]} disabled={disabled}
            onSave={v => decide(t.id, { type: "measurement.set", measurementId: t.id, value: v })} onClear={() => decide(t.id, { type: "measurement.clear", measurementId: t.id })} />
        ))}
        {cfg.tasks.points.map(p => (
          <PointTask key={p.id} task={p} saved={state.points[p.id]} getNow={getNow} maxTime={maxT} disabled={disabled}
            onSave={(t, y) => decide(p.id, { type: "graphPoint.set", pointId: p.id, t, y })} onClear={() => decide(p.id, { type: "graphPoint.clear", pointId: p.id })} />
        ))}
      </div>
      {!disabled && (
        <div className="freefall-controls">
          {confirm
            ? <><button type="button" className="is-danger" onClick={() => { setConfirm(false); emit([]); }}>تأكيد مسح كل الإجابات</button><button type="button" className="is-secondary" onClick={() => setConfirm(false)}>إلغاء</button></>
            : <button type="button" className="is-secondary" onClick={() => setConfirm(true)} disabled={base.length === 0}>مسح كل الإجابات</button>}
        </div>
      )}
    </div>
  );
}
