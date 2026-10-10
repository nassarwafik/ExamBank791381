import { useState, type ReactNode } from "react";
import { parseNumberInput } from "../trustedSim/smartSimNumberInput";
import { DYNAMIC_LIMITS } from "../smartsim/dynamic/simulationClock";
import { UNIT_TEXT } from "./units";
import "../physicsMotion/motion.css";

// Phase 21D-A.2 — the student-side widgets SHARED by the physics workspaces (physicsMotion@1 and physicsLab@1; lazy chunks only). Extracted
// unchanged from the A.1 motion workspace: a measurement task, a graph-point task and the teacher-permitted exploration panel. Saving or
// clearing a task is the ONLY thing that produces an action (through the caller); exploration is presentation only and always refers back
// to the authored experiment. `ns` namespaces the test ids so each plugin keeps its own ("motion-…", "lab-…"); styling is the shared
// motion.css design.
type Fmt = (n: number | null | undefined) => string;
export type TaskAxes = { x: string; y: string; xUnit: string; yUnit: string; xIsTime: boolean };
export type ParamInfo = { label: string; unit: string; options?: readonly { value: number; label: string }[] };
export type ExplorationControl = { param: string; min: number; max: number; step: number };

export function MeasurementTask({ ns, task, saved, disabled, onSave, onClear, fmt }: { ns: string; task: { id: string; label: string; unit: string }; saved: number | undefined; disabled?: boolean; onSave: (v: number) => void; onClear: () => void; fmt: Fmt }) {
  const [draft, setDraft] = useState(saved === undefined ? "" : String(saved));
  const [error, setError] = useState("");
  const unit = task.unit;
  const save = () => { const v = parseNumberInput(draft); if (v === undefined) { setError("أدخل رقمًا صالحًا (مثل 3.04 أو −9.8)."); return; } setError(""); onSave(v); };
  return (
    <fieldset className="motion-task" data-testid={ns + "-measurement"} data-id={task.id}>
      <legend>{task.label} <span className="motion-ltr">({unit})</span></legend>
      <div className="motion-row">
        <input type="text" inputMode="decimal" dir="ltr" autoComplete="off" spellCheck={false} aria-label={task.label + " (" + (UNIT_TEXT[unit] ?? unit) + ")"} value={draft} disabled={disabled}
          onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (!disabled) save(); } }} />
        {!disabled && <><button type="button" onClick={save}>حفظ القياس</button><button type="button" className="is-secondary" onClick={onClear} disabled={saved === undefined}>مسح</button></>}
      </div>
      {error && <p className="motion-error" role="alert">{error}</p>}
      <p className="motion-saved">{saved === undefined ? "لم يُحفظ بعد." : <>المحفوظ: <span className="motion-ltr">{fmt(saved)} {unit}</span></>}</p>
    </fieldset>
  );
}

export function PointTask({ ns, task, saved, axes, getNow, xMax, disabled, onSave, onClear, fmt }: {
  ns: string; task: { id: string; label: string }; saved: { x: number; y: number } | undefined; axes: TaskAxes;
  getNow: () => number; xMax: number | null; disabled?: boolean; onSave: (x: number, y: number) => void; onClear: () => void; fmt: Fmt;
}) {
  const [x, setX] = useState(saved ? String(saved.x) : "");
  const [y, setY] = useState(saved ? String(saved.y) : "");
  const [error, setError] = useState("");
  const save = () => {
    const xv = parseNumberInput(x), yv = parseNumberInput(y);
    if (xv === undefined || yv === undefined) { setError("أدخل رقمين صالحين للإحداثيين."); return; }
    if (xMax !== null && (xv < 0 || xv > xMax)) { setError("الزمن يجب أن يكون بين 0 و" + fmt(xMax) + " ث."); return; }
    setError(""); onSave(xv, yv);
  };
  return (
    <fieldset className="motion-task" data-testid={ns + "-point"} data-id={task.id}>
      <legend>{task.label} <span className="motion-ltr">({axes.x}, {axes.y})</span></legend>
      <div className="motion-row">
        <label><span className="motion-ltr">{axes.x} ({axes.xUnit})</span><input type="text" inputMode="decimal" dir="ltr" autoComplete="off" value={x} disabled={disabled} onChange={e => setX(e.target.value)} /></label>
        <label><span className="motion-ltr">{axes.y} ({axes.yUnit})</span><input type="text" inputMode="decimal" dir="ltr" autoComplete="off" value={y} disabled={disabled} onChange={e => setY(e.target.value)} /></label>
      </div>
      {!disabled && (
        <div className="motion-row">
          {axes.xIsTime && <button type="button" className="is-secondary" onClick={() => setX(String(Number(getNow().toFixed(2))))}>استخدم زمن المحاكاة الحالي</button>}
          <button type="button" onClick={save}>حفظ النقطة</button>
          <button type="button" className="is-secondary" onClick={onClear} disabled={!saved}>مسح النقطة</button>
        </div>
      )}
      {error && <p className="motion-error" role="alert">{error}</p>}
      <p className="motion-saved">{saved ? <>المحفوظ: <span className="motion-ltr">({axes.x} = {fmt(saved.x)} {axes.xUnit}, {axes.y} = {fmt(saved.y)} {axes.yUnit})</span></> : "لم تُحفظ بعد."}</p>
    </fieldset>
  );
}

const sameParams = (a: Record<string, number>, b: Record<string, number>) => Object.keys(a).every(k => a[k] === b[k]);
/** The teacher-permitted parameter controls (presentation only). Invalid combinations are refused with a reason, never clamped. Option
 *  parameters (e.g. a circuit topology) are a select of their named options inside the permitted range. */
export function ExplorationPanel({ ns, controls, authored, params, info, problem, onParams, fmt, extra }: {
  ns: string; controls: readonly ExplorationControl[]; authored: Record<string, number>; params: Record<string, number>;
  info: (param: string) => ParamInfo | undefined; problem: (candidate: Record<string, number>) => string | undefined;
  onParams: (p: Record<string, number>) => void; fmt: Fmt; extra?: ReactNode;
}) {
  const [error, setError] = useState("");
  if (controls.length === 0) return null;
  const apply = (key: string, v: number | undefined) => {
    if (v === undefined) { setError("أدخل رقمًا صالحًا."); return; }
    const next = { ...params, [key]: v }, why = problem(next);
    if (why) { setError(why); return; }
    setError(""); onParams(next);
  };
  const changed = !sameParams(params, authored);
  return (
    <fieldset className="motion-explore" data-testid={ns + "-explore"}>
      <legend>استكشف التجربة (قيم يسمح بها المعلم)</legend>
      <div className="motion-explore-grid">
        {controls.map(k => {
          const spec = info(k.param);
          const unit = !spec || spec.unit === "1" ? "" : spec.unit;
          const label = (spec?.label ?? k.param) + (unit ? " (" + unit + ")" : "");
          const options = spec?.options?.filter(o => o.value >= k.min && o.value <= k.max);
          return (
            <label key={k.param} className="motion-explore-item" data-testid={ns + "-control"} data-param={k.param}>
              {options
                ? <><span>{spec?.label ?? k.param}</span>
                  <select value={params[k.param]} aria-label={label} onChange={e => apply(k.param, Number(e.target.value))}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></>
                : <><span>{spec?.label ?? k.param}{unit && <> <span className="motion-ltr">({unit})</span></>}: <span className="motion-ltr">{fmt(params[k.param])}</span> <small className="motion-ltr">[{fmt(k.min)} … {fmt(k.max)}]</small></span>
                  <span className="motion-row">
                    <input type="range" min={k.min} max={k.max} step={k.step} value={params[k.param]} aria-label={label} onChange={e => apply(k.param, Number(e.target.value))} />
                    <input type="number" dir="ltr" min={k.min} max={k.max} step={k.step} value={params[k.param]} aria-label={label + " — إدخال رقمي"} onChange={e => apply(k.param, parseNumberInput(e.target.value))} />
                  </span></>}
            </label>
          );
        })}
      </div>
      {extra}
      {error && <p className="motion-error" role="alert" data-testid={ns + "-explore-error"}>{error}</p>}
      {changed && (
        <div className="motion-banner" role="note" data-testid={ns + "-explore-banner"}>
          <p>أنت تستكشف قيمًا مختلفة عن التجربة المطلوبة. المهام والقياسات تُقيَّم على التجربة الأصلية التي حددها المعلم، والاستكشاف لا يُحفظ.</p>
          <button type="button" className="is-secondary" onClick={() => { setError(""); onParams({ ...authored }); }}>استعادة قيم التجربة الأصلية</button>
        </div>
      )}
    </fieldset>
  );
}

/** The playback bar and timeline of a physics workspace (presentation only; extracted unchanged from the A.1 motion workspace):
 *  play / resume, pause, reset, single step back / forward, playback rates, optional toggles, the time slider and direct time entry.
 *  prefers-reduced-motion: no play control (stepping, the slider and time entry keep every value reachable). */
export function ClockBar({ ns, reduced, playing, time, end, rate, onPlay, onPause, onReset, onStep, onRate, onSeek, fmt, toggles }: {
  ns: string; reduced: boolean; playing: boolean; time: number; end: number; rate: number; fmt: Fmt;
  onPlay: () => void; onPause: () => void; onReset: () => void; onStep: (dt: number) => void; onRate: (r: number) => void; onSeek: (t: number) => void; toggles?: ReactNode;
}) {
  const atEnd = time >= end && end > 0;
  const playLabel = time > 0 && !atEnd ? "استئناف" : "تشغيل";
  return (
    <>
      <div className="smartsim-dyn-controls motion-controls" role="group" aria-label="التحكم في المحاكاة">
        {reduced
          ? <p className="motion-note" data-testid={ns + "-reduced-motion"}>الحركة المخففة مفعّلة على جهازك: لا تشغيل تلقائي؛ استخدم الخطوة المفردة أو شريط الزمن أو أدخل الزمن مباشرة.</p>
          : <><button type="button" data-testid={ns + "-play"} onClick={onPlay} disabled={playing || !(end > 0)}>{playLabel}</button><button type="button" className="is-secondary" data-testid={ns + "-pause"} onClick={onPause} disabled={!playing}>إيقاف مؤقت</button></>}
        <button type="button" className="is-secondary" data-testid={ns + "-reset"} onClick={onReset}>إعادة الضبط</button>
        <button type="button" className="is-secondary" data-testid={ns + "-step-back"} onClick={() => onStep(-DYNAMIC_LIMITS.stepSeconds)}>خطوة للخلف</button>
        <button type="button" className="is-secondary" data-testid={ns + "-step"} onClick={() => onStep(DYNAMIC_LIMITS.stepSeconds)}>خطوة واحدة</button>
        {!reduced && (
          <span className="motion-toggles" role="group" aria-label="سرعة التشغيل">
            {DYNAMIC_LIMITS.rates.map(r => <button key={r} type="button" className="is-secondary" aria-pressed={rate === r} onClick={() => onRate(r)}>{r}×</button>)}
          </span>
        )}
        {toggles}
      </div>
      <div className="motion-timeline">
        <input type="range" min={0} max={end} step={0.01} value={time} aria-label="زمن المحاكاة (ث)" aria-valuetext={fmt(time) + " ثانية"} onChange={e => onSeek(Number(e.target.value))} />
        <label><span>الزمن (ث)</span><input type="number" dir="ltr" min={0} max={end} step={0.01} value={Number(time.toFixed(2))} onChange={e => { const v = parseNumberInput(e.target.value); if (v !== undefined) onSeek(v); }} /></label>
      </div>
    </>
  );
}
