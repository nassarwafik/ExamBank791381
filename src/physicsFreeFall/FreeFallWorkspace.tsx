import { useEffect, useMemo, useRef, useState } from "react";
import type { SmartSimWorkspaceProps } from "../trustedSim/smartSimUiRegistry";
import { bodyAt, fmtPhysics, impactTime, peakHeight, sampleTrajectory, validateFreeFallConfig, type FreeFallConfigV1, type FreeFallMeasurementTask, type FreeFallPointTask } from "../physicsFreeFallModel";
import { replayFreeFall, type FreeFallStateV1 } from "../physicsFreeFallPlugin";
import { parseNumberInput } from "../trustedSim/smartSimNumberInput";
import { UNIT_LABEL } from "./freeFallLabels";
import "./freefall.css";

// Phase 20A.2 — the physicsFreeFall@1 STUDENT workspace (lazy; also the teacher preview). It renders ONLY the canonical public config,
// animates the trusted model as PRESENTATION (play / pause / restart / timeline scrubbing / time entry never produce an action and never
// reach the answer), and turns the student's explicit "save" / "clear" decisions into SEMANTIC actions (measurement.set / clear,
// graphPoint.set / clear). Saved values are replayed through the same plugin code the server uses; a later decision on the same task
// replaces the earlier one, so the stored action list stays compact. prefers-reduced-motion: no animation at all, manual time only.
const W = 320, H = 200, PAD = 34;
const prefersReducedMotion = () => { try { return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
type Act = { type: string; measurementId?: string; pointId?: string };
const taskOf = (a: unknown) => { const x = a as Act; return x && typeof x === "object" ? x.measurementId ?? x.pointId : undefined; };

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
function PointTask({ task, saved, now, maxTime, disabled, onSave, onClear }: { task: FreeFallPointTask; saved: { t: number; y: number } | undefined; now: number; maxTime: number; disabled?: boolean; onSave: (t: number, y: number) => void; onClear: () => void }) {
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
          <button type="button" className="is-secondary" onClick={() => setT(String(Number(now.toFixed(2))))}>استخدم زمن المحاكاة الحالي</button>
          <button type="button" onClick={save}>حفظ النقطة</button>
          <button type="button" className="is-secondary" onClick={onClear} disabled={!saved}>مسح النقطة</button>
        </div>
      )}
      {error && <p className="freefall-error" role="alert">{error}</p>}
      <p className="freefall-saved">{saved ? <>المحفوظ: <span className="freefall-ltr">(t = {fmtPhysics(saved.t)} s, y = {fmtPhysics(saved.y)} m)</span></> : "لم تُحفظ بعد."}</p>
    </fieldset>
  );
}

export default function FreeFallWorkspace({ config: rawConfig, actions, onChange, disabled, label }: SmartSimWorkspaceProps) {
  const cfg = useMemo<FreeFallConfigV1 | null>(() => { const r = validateFreeFallConfig(rawConfig); return r.ok ? r.config : null; }, [rawConfig]);
  const replay = useMemo(() => (cfg ? replayFreeFall(cfg, actions) : null), [cfg, actions]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reduced] = useState(prefersReducedMotion);
  const [confirm, setConfirm] = useState(false);
  const last = useRef<number | null>(null);
  const now = useRef(0);
  useEffect(() => { now.current = time; }, [time]);
  const end = cfg ? Math.min(cfg.view.maxTime, impactTime(cfg.model)) : 0;
  useEffect(() => {
    if (!playing || reduced || !cfg || typeof requestAnimationFrame !== "function") return;
    let id = 0;
    const step = (ts: number) => {
      const dt = last.current === null ? 0 : (ts - last.current) / 1000;
      last.current = ts;
      const n = Math.min(end, now.current + dt);
      now.current = n;
      setTime(n);
      if (n >= end) { setPlaying(false); return; }
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(id); last.current = null; };
  }, [playing, reduced, cfg, end]);
  if (!cfg) return <p className="ncli-unavailable" role="note" data-testid="freefall-unavailable">إعداد محاكاة السقوط الحر لهذا السؤال غير متوفر في هذا الإصدار.</p>;
  const state: FreeFallStateV1 = replay && replay.ok ? replay.state : { v: 1, measurements: {}, points: {} };
  const base = replay && replay.ok ? [...actions] : [];
  const emit = (next: unknown[]) => { const r = replayFreeFall(cfg, next); if (r.ok) onChange(next, r.state); };
  /** A later decision on a task replaces every earlier action on the same task (the replayed state is identical; the list stays small). */
  const decide = (id: string, action: Record<string, unknown>) => emit([...base.filter(a => taskOf(a) !== id), action]);
  const setNow = (t: number) => { setPlaying(false); setTime(Math.min(cfg.view.maxTime, Math.max(0, t))); };
  const m = cfg.model, body = bodyAt(m, time), peak = peakHeight(m), maxT = cfg.view.maxTime;
  const sy = (y: number) => 280 - (y / (peak || 1)) * 250;
  const gx = (t: number) => PAD + (t / maxT) * (W - PAD - 10), gy = (y: number) => H - PAD + 10 - (y / (peak * 1.05 || 1)) * (H - PAD - 10);
  const curve = sampleTrajectory(m, maxT, 160);
  const savedPoints = cfg.tasks.points.filter(p => Object.prototype.hasOwnProperty.call(state.points, p.id));
  const vMax = Math.max(Math.abs(m.initialVelocity), Math.abs(curve[curve.length - 1].v), 1);
  const vy = (v: number) => H / 2 - (v / vMax) * (H / 2 - 16);
  return (
    <div className="freefall" data-testid="freefall-workspace" aria-label={label ? label + " — محاكاة السقوط الحر" : "محاكاة السقوط الحر"}>
      <p className="freefall-note">جسم يبدأ من ارتفاع <span className="freefall-ltr">{fmtPhysics(m.initialHeight)} m</span> بسرعة ابتدائية <span className="freefall-ltr">{fmtPhysics(m.initialVelocity)} m/s</span> (الأعلى موجب) وتسارع جاذبية <span className="freefall-ltr">g = {fmtPhysics(m.gravity)} m/s²</span>، بإهمال مقاومة الهواء. شغّل المحاكاة أو حرّك الزمن لتقيس، ثم احفظ إجاباتك صراحةً — التشغيل والتحريك لا يُحفظان ولا يُقيَّمان.</p>
      <div className="freefall-stage">
        <div className="freefall-scene">
          <svg viewBox="0 0 200 300" role="img" aria-label={"الجسم على ارتفاع " + fmtPhysics(body.y) + " متر عند الزمن " + fmtPhysics(body.t) + " ثانية"}>
            <line className="freefall-start" x1="20" x2="180" y1={sy(m.initialHeight)} y2={sy(m.initialHeight)} />
            <rect className="freefall-ground" x="0" y="280" width="200" height="20" />
            <line className="freefall-ground-line" x1="0" x2="200" y1="280" y2="280" />
            <circle className="freefall-ball" data-testid="freefall-body" cx="100" cy={sy(body.y) - 10} r="10" />
          </svg>
        </div>
        <div className="freefall-graph" data-testid="freefall-graph">
          <svg viewBox={"0 0 " + W + " " + H} role="img" aria-label="منحنى الارتفاع مع الزمن">
            <line className="freefall-axis" x1={PAD} y1={H - PAD + 10} x2={W - 6} y2={H - PAD + 10} />
            <line className="freefall-axis" x1={PAD} y1={8} x2={PAD} y2={H - PAD + 10} />
            <text className="freefall-tick" x={W - 40} y={H - 6}>t (s)</text>
            <text className="freefall-tick" x={4} y={14}>y (m)</text>
            <text className="freefall-tick" x={PAD - 4} y={H - 8}>0</text>
            <text className="freefall-tick" x={gx(maxT) - 14} y={H - 8}>{fmtPhysics(maxT)}</text>
            <text className="freefall-tick" x={2} y={gy(peak) + 4}>{fmtPhysics(peak)}</text>
            <polyline className="freefall-curve" points={curve.map(p => gx(p.t).toFixed(2) + "," + gy(p.y).toFixed(2)).join(" ")} />
            <line className="freefall-now" x1={gx(Math.min(time, maxT))} x2={gx(Math.min(time, maxT))} y1={8} y2={H - PAD + 10} />
            {savedPoints.map(p => <circle key={p.id} className="freefall-mark" data-testid="freefall-graph-point" cx={gx(state.points[p.id].t)} cy={gy(state.points[p.id].y)} r="5"><title>{p.label}</title></circle>)}
          </svg>
          {cfg.view.showVelocityGraph && (
            <svg viewBox={"0 0 " + W + " " + H} role="img" aria-label="منحنى السرعة مع الزمن" data-testid="freefall-velocity-graph">
              <line className="freefall-axis" x1={PAD} y1={H / 2} x2={W - 6} y2={H / 2} />
              <line className="freefall-axis" x1={PAD} y1={8} x2={PAD} y2={H - 8} />
              <text className="freefall-tick" x={W - 40} y={H / 2 - 6}>t (s)</text>
              <text className="freefall-tick" x={4} y={14}>v (m/s)</text>
              <polyline className="freefall-curve is-velocity" points={curve.map(p => gx(p.t).toFixed(2) + "," + vy(p.v).toFixed(2)).join(" ")} />
              <line className="freefall-now" x1={gx(Math.min(time, maxT))} x2={gx(Math.min(time, maxT))} y1={8} y2={H - 8} />
            </svg>
          )}
        </div>
      </div>
      <div className="freefall-controls">
        {reduced
          ? <p className="freefall-note" data-testid="freefall-reduced-motion">الحركة المخففة مفعّلة على جهازك: لا تشغيل تلقائي؛ استخدم شريط الزمن أو أدخل الزمن مباشرة.</p>
          : <><button type="button" onClick={() => { if (time >= end) setTime(0); setPlaying(true); }}>تشغيل</button><button type="button" className="is-secondary" onClick={() => setPlaying(false)}>إيقاف مؤقت</button></>}
        <button type="button" className="is-secondary" onClick={() => setNow(0)}>إعادة العرض</button>
      </div>
      <div className="freefall-timeline">
        <input type="range" min={0} max={maxT} step={0.01} value={Math.min(time, maxT)} aria-label="زمن المحاكاة (ث)" aria-valuetext={fmtPhysics(time) + " ثانية"} onChange={e => setNow(Number(e.target.value))} />
        <label><span>الزمن (ث)</span><input type="number" dir="ltr" min={0} max={maxT} step={0.01} value={Number(time.toFixed(2))} onChange={e => { const v = parseNumberInput(e.target.value); if (v !== undefined) setNow(v); }} /></label>
      </div>
      <p className="freefall-readout" data-testid="freefall-readout" aria-live="polite">
        <span className="freefall-ltr">t = {fmtPhysics(body.t)} s</span> · الارتفاع <span className="freefall-ltr">y = {fmtPhysics(body.y)} m</span> · السرعة <span className="freefall-ltr">v = {fmtPhysics(body.v)} m/s</span>{body.landed ? " · وصل الجسم إلى الأرض" : ""}
      </p>
      <div className="freefall-tasks">
        {cfg.tasks.measurements.map(t => (
          <MeasurementTask key={t.id} task={t} saved={state.measurements[t.id]} disabled={disabled}
            onSave={v => decide(t.id, { type: "measurement.set", measurementId: t.id, value: v })} onClear={() => decide(t.id, { type: "measurement.clear", measurementId: t.id })} />
        ))}
        {cfg.tasks.points.map(p => (
          <PointTask key={p.id} task={p} saved={state.points[p.id]} now={time} maxTime={maxT} disabled={disabled}
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
