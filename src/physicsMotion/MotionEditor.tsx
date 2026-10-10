import { useState } from "react";
import type { SmartSimEditorProps } from "../trustedSim/smartSimUiRegistry";
import SmartSimDraftInput from "../trustedSim/SmartSimDraftInput";
import { MOTION_EXPERIMENT_LABEL, MOTION_GRAPHS, MOTION_LIMITS, MOTION_PRIMARY_AXES, MOTION_TASK_UNITS, validateMotionConfig } from "../physicsMotionModel";
import { MOTION_KINDS, MOTION_PARAM_SPEC, MOTION_QUANTITY_SPEC, fmtMotion, isMotionKind, motionQuantities, validateMotionParams, type MotionKind } from "../physics/motionCore";
import MotionWorkspace from "./MotionWorkspace";
import { MOTION_PRESETS } from "./motionTemplates";
import { UNIT_TEXT, motionGraphs } from "./motionView";
import "./motion.css";

// Phase 21D-A.1 — physicsMotion@1 AUTHORING (lazy). Structured editing only (never raw JSON): the experiment (each with a one-click
// classroom preset), its SI parameters, which parameters the student may explore and within which limits, the duration, the optional
// graphs and vectors, the student's measurement / graph-point tasks, the PRIVATE weighted checks and the scoring mode. Anything invalid is
// reported by the host's canonical validator and blocks finalization — never clamped. The teacher sees the reference values computed from
// the authored experiment (the expected values of motion.referenceValue checks); a collapsed preview runs the real student workspace.
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const show = (v: unknown) => (typeof v === "number" ? String(v) : typeof v === "string" ? v : "");
const nextId = (ids: string[], prefix: string) => { let n = ids.length + 1; while (ids.includes(prefix + n)) n++; return prefix + n; };
const CHECK_KIND_LABEL: Readonly<Record<string, string>> = Object.freeze({
  "motion.referenceValue": "قيمة مرجعية محسوبة من التجربة", "numericNear@1": "قيمة قريبة من قيمة محددة", "pointNear@1": "نقطة قريبة من نقطة محددة"
});
const GRAPH_LABEL: Readonly<Record<string, string>> = Object.freeze({ velocity: "منحنى السرعة", acceleration: "منحنى التسارع", height: "منحنى الارتفاع مع الزمن" });
/** A default exploration step for a parameter range (a power of ten ≈ 1/100 of the range). */
const stepFor = (min: number, max: number) => { const r = Math.max(max - min, 1e-9) / 100; return Number(Math.pow(10, Math.floor(Math.log10(r))).toPrecision(1)); };

function checkFor(kind: string, id: string, c: { experiment: MotionKind; measurements: Obj[]; points: Obj[] }): Obj {
  const base = { id, label: CHECK_KIND_LABEL[kind], weight: 1, kind };
  if (kind === "pointNear@1") return { ...base, pointId: String(c.points[0]?.id ?? ""), expected: { x: 0, y: 0 }, tolerance: 0.1 };
  if (kind === "numericNear@1") return { ...base, valueId: String(c.measurements[0]?.id ?? ""), expected: 0, tolerance: 0.05 };
  const m = c.measurements[0], q = MOTION_QUANTITY_SPEC[c.experiment].find(s => s.unit === m?.unit) ?? MOTION_QUANTITY_SPEC[c.experiment][0];
  return { ...base, measurementId: String(m?.id ?? ""), quantity: q.id, tolerance: 0.05 };
}

export default function MotionEditor({ config, checks, scoring, onChange, disabled }: SmartSimEditorProps) {
  const c = isObj(config) ? config : {};
  const experiment: MotionKind = isMotionKind(c.experiment) ? c.experiment : "projectile";
  const params = isObj(c.params) ? c.params : {}, view = isObj(c.view) ? c.view : {}, tasks = isObj(c.tasks) ? c.tasks : {};
  const controls = (Array.isArray(c.controls) ? c.controls : []).filter(isObj);
  const graphs = (Array.isArray(view.graphs) ? view.graphs : []).filter((g): g is string => typeof g === "string");
  const measurements = (Array.isArray(tasks.measurements) ? tasks.measurements : []).filter(isObj);
  const points = (Array.isArray(tasks.points) ? tasks.points : []).filter(isObj);
  const list = checks.filter(isObj);
  const [preview, setPreview] = useState(0);
  const valid = validateMotionConfig(config);
  const authored = validateMotionParams(experiment, params);
  const maxTime = typeof view.maxTime === "number" ? view.maxTime : 0;
  const reference = authored && maxTime > 0 ? motionQuantities({ kind: experiment, params: authored }, maxTime) : null;
  const setConfig = (next: Obj) => onChange({ config: { v: 1, experiment, params, controls, view, tasks: { measurements, points }, ...next } });
  const setTasks = (ms: Obj[], ps: Obj[]) => setConfig({ tasks: { measurements: ms, points: ps } });
  const setControl = (param: string, patch: Obj | null) => {
    const rest = controls.filter(k => k.param !== param);
    if (patch === null) return setConfig({ controls: rest });
    const cur = controls.find(k => k.param === param) ?? {};
    const order = MOTION_PARAM_SPEC[experiment].map(s => s.key);
    setConfig({ controls: [...rest, { param, ...cur, ...patch }].sort((a, b) => order.indexOf(String(a.param)) - order.indexOf(String(b.param))) });
  };
  const setCheck = (i: number, patch: Obj) => onChange({ checks: list.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const applyPreset = (k: MotionKind) => { const p = MOTION_PRESETS[k](); onChange({ config: p.config, checks: p.checks, scoring: "proportional" }); };
  const allIds = [...measurements, ...points].map(t => String(t.id));
  const used = (id: string) => list.some(k => k.measurementId === id || k.pointId === id || k.valueId === id);
  const axes = MOTION_PRIMARY_AXES[experiment];
  return (
    <div className="motion-editor" data-testid="motion-editor" dir="rtl">
      <fieldset>
        <legend>التجربة</legend>
        <div className="motion-row">
          <label><span>نوع التجربة</span>
            <select value={experiment} disabled={disabled} data-testid="motion-experiment" onChange={e => applyPreset(e.target.value as MotionKind)}>
              {MOTION_KINDS.map(k => <option key={k} value={k}>{MOTION_EXPERIMENT_LABEL[k]}</option>)}
            </select>
          </label>
          <button type="button" disabled={disabled} onClick={() => applyPreset(experiment)}>تطبيق القالب الصفي لهذه التجربة</button>
        </div>
        <p className="motion-note">تغيير نوع التجربة يحمّل قالبها الصفي كاملًا (القيم والمهام والفحوص)، ثم يمكنك تعديله.</p>
      </fieldset>
      <fieldset>
        <legend>القيم الفيزيائية (SI) وما يُسمح للطالب باستكشافه</legend>
        <ul className="motion-list" aria-label="القيم الفيزيائية">
          {MOTION_PARAM_SPEC[experiment].map(s => {
            const k = controls.find(x => x.param === s.key);
            const unit = s.unit === "1" ? "" : " (" + s.unit + ")";
            return (
              <li key={s.key} data-testid="motion-param" data-param={s.key}>
                <label><span>{s.label}{unit} <small className="motion-ltr">[{fmtMotion(s.min)} … {fmtMotion(s.max)}]</small></span>
                  <SmartSimDraftInput dir="ltr" inputMode="decimal" value={params[s.key]} disabled={disabled} onValue={v => setConfig({ params: { ...params, [s.key]: v } })} /></label>
                <label className="motion-row"><input type="checkbox" checked={!!k} disabled={disabled} data-testid="motion-allow" onChange={e => setControl(s.key, e.target.checked ? { min: s.min, max: s.max, step: stepFor(s.min, s.max) } : null)} /><span>يسمح للطالب بتعديله</span></label>
                {k && <>
                  <label><span>الحد الأدنى</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={k.min} disabled={disabled} onValue={v => setControl(s.key, { min: v })} /></label>
                  <label><span>الحد الأعلى</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={k.max} disabled={disabled} onValue={v => setControl(s.key, { max: v })} /></label>
                  <label><span>الخطوة</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={k.step} disabled={disabled} onValue={v => setControl(s.key, { step: v })} /></label>
                </>}
              </li>
            );
          })}
        </ul>
      </fieldset>
      <fieldset>
        <legend>العرض</legend>
        <div className="motion-fields">
          <label><span>مدة التجربة (ث، حتى {MOTION_LIMITS.maxTimeMax})</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={view.maxTime} disabled={disabled} onValue={v => setConfig({ view: { ...view, maxTime: v } })} /></label>
          {MOTION_GRAPHS[experiment].map(g => (
            <label key={g} className="motion-row"><input type="checkbox" checked={graphs.includes(g)} disabled={disabled} onChange={e => setConfig({ view: { ...view, graphs: e.target.checked ? [...graphs, g] : graphs.filter(x => x !== g) } })} /><span>{GRAPH_LABEL[g] ?? g}</span></label>
          ))}
          <label className="motion-row"><input type="checkbox" checked={view.showVectors === true} disabled={disabled} onChange={e => setConfig({ view: { ...view, showVectors: e.target.checked } })} /><span>إظهار متجهات السرعة والقوى</span></label>
        </div>
        <p className="motion-note">المنحنى الرئيسي ({motionGraphs(experiment, [])[0].title}) يظهر دائمًا، وعليه تُحدَّد نقاط الطالب.</p>
      </fieldset>
      <fieldset>
        <legend>القيم المرجعية للتجربة المحددة (للمعلم فقط)</legend>
        {reference
          ? <dl className="motion-reference" data-testid="motion-reference">{MOTION_QUANTITY_SPEC[experiment].map(q => <div key={q.id} data-id={q.id}><dt>{q.label}</dt><dd className="motion-ltr">{reference[q.id] === null ? "غير معرّفة" : fmtMotion(reference[q.id]) + " " + q.unit}</dd></div>)}</dl>
          : <p className="motion-note" data-testid="motion-reference">أكمل قيمًا فيزيائية صالحة ومدة تجربة لعرض القيم المرجعية.</p>}
      </fieldset>
      <fieldset>
        <legend>مهام الطالب</legend>
        <ul className="motion-list" aria-label="مهام القياس">
          {measurements.map((t, i) => (
            <li key={String(t.id) + i}>
              <label><span>وصف القياس {i + 1}</span><input value={show(t.label)} maxLength={MOTION_LIMITS.labelChars} disabled={disabled} onChange={e => setTasks(measurements.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)), points)} /></label>
              <label><span>الوحدة</span><select value={show(t.unit)} disabled={disabled} onChange={e => setTasks(measurements.map((x, k) => (k === i ? { ...x, unit: e.target.value } : x)), points)}>{MOTION_TASK_UNITS.map(u => <option key={u} value={u}>{u} ({UNIT_TEXT[u]})</option>)}</select></label>
              <button type="button" className="is-secondary" disabled={disabled || used(String(t.id))} title={used(String(t.id)) ? "يستخدمه فحص؛ احذف الفحص أولًا" : undefined} onClick={() => setTasks(measurements.filter((_, k) => k !== i), points)}>حذف</button>
            </li>
          ))}
        </ul>
        <ul className="motion-list" aria-label="مهام النقاط">
          {points.map((t, i) => (
            <li key={String(t.id) + i}>
              <label><span>وصف النقطة {i + 1} على منحنى <span className="motion-ltr">{axes.y}({axes.x})</span></span><input value={show(t.label)} maxLength={MOTION_LIMITS.labelChars} disabled={disabled} onChange={e => setTasks(measurements, points.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} /></label>
              <button type="button" className="is-secondary" disabled={disabled || used(String(t.id))} onClick={() => setTasks(measurements, points.filter((_, k) => k !== i))}>حذف</button>
            </li>
          ))}
        </ul>
        <div className="motion-row">
          <button type="button" className="is-secondary" disabled={disabled || measurements.length >= MOTION_LIMITS.measurements} onClick={() => setTasks([...measurements, { id: nextId(allIds, "m"), label: "قياس جديد", unit: "s" }], points)}>+ قياس</button>
          <button type="button" className="is-secondary" disabled={disabled || points.length >= MOTION_LIMITS.points} onClick={() => setTasks(measurements, [...points, { id: nextId(allIds, "p"), label: "نقطة على المنحنى" }])}>+ نقطة على المنحنى</button>
        </div>
      </fieldset>
      <fieldset>
        <legend>الفحوص الخاصة (لا تصل إلى الطالب)</legend>
        <label><span>طريقة احتساب العلامة</span>
          <select value={scoring === "allOrNothing" ? "allOrNothing" : "proportional"} disabled={disabled} onChange={e => onChange({ scoring: e.target.value })}>
            <option value="proportional">جزئية حسب الأوزان</option><option value="allOrNothing">كل شيء أو لا شيء</option>
          </select>
        </label>
        <ul className="motion-list" aria-label="الفحوص">
          {list.map((k, i) => {
            const kind = String(k.kind), exp = isObj(k.expected) ? k.expected : {};
            const target = kind === "pointNear@1" ? "pointId" : kind === "numericNear@1" ? "valueId" : "measurementId";
            const targets = kind === "pointNear@1" ? points : measurements;
            const unit = measurements.find(m => m.id === k.measurementId)?.unit;
            const quantities = MOTION_QUANTITY_SPEC[experiment].filter(q => q.unit === unit);
            const expected = kind === "motion.referenceValue" && reference ? reference[String(k.quantity)] : undefined;
            return (
              <li key={String(k.id) + i} data-testid="motion-check">
                <label><span>نوع الفحص {i + 1}</span><select value={kind} disabled={disabled} onChange={e => onChange({ checks: list.map((x, j) => (j === i ? checkFor(e.target.value, String(x.id), { experiment, measurements, points }) : x)) })}>{Object.keys(CHECK_KIND_LABEL).map(o => <option key={o} value={o}>{CHECK_KIND_LABEL[o]}</option>)}</select></label>
                <label><span>الوصف</span><input value={show(k.label)} disabled={disabled} onChange={e => setCheck(i, { label: e.target.value })} /></label>
                <label><span>المهمة</span><select value={show(k[target])} disabled={disabled} onChange={e => setCheck(i, { [target]: e.target.value })}>{targets.map(t => <option key={String(t.id)} value={String(t.id)}>{String(t.label)}</option>)}</select></label>
                {kind === "motion.referenceValue" && <label><span>الكمية المرجعية</span><select value={show(k.quantity)} disabled={disabled} onChange={e => setCheck(i, { quantity: e.target.value })}>{quantities.map(q => <option key={q.id} value={q.id}>{q.label} ({q.unit})</option>)}</select></label>}
                {kind === "motion.referenceValue" && <p className="motion-note" data-testid="motion-check-expected">القيمة المتوقعة: <span className="motion-ltr">{expected === undefined ? "—" : expected === null ? "غير معرّفة" : fmtMotion(expected)}</span></p>}
                {kind === "numericNear@1" && <label><span>القيمة المتوقعة</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={k.expected} disabled={disabled} onValue={v => setCheck(i, { expected: v })} /></label>}
                {kind === "pointNear@1" && <><label><span className="motion-ltr">{axes.x} المتوقع</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={exp.x} disabled={disabled} onValue={v => setCheck(i, { expected: { ...exp, x: v } })} /></label><label><span className="motion-ltr">{axes.y} المتوقع</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={exp.y} disabled={disabled} onValue={v => setCheck(i, { expected: { ...exp, y: v } })} /></label></>}
                <label><span>السماحية ±</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={k.tolerance} disabled={disabled} onValue={v => setCheck(i, { tolerance: v })} /></label>
                <label><span>الوزن</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={k.weight} disabled={disabled} onValue={v => setCheck(i, { weight: v })} /></label>
                <button type="button" className="is-secondary" disabled={disabled} onClick={() => onChange({ checks: list.filter((_, j) => j !== i) })}>حذف الفحص</button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="is-secondary" disabled={disabled || measurements.length === 0} onClick={() => onChange({ checks: [...list, checkFor("motion.referenceValue", nextId(list.map(k => String(k.id)), "check-"), { experiment, measurements, points })] })}>+ فحص</button>
      </fieldset>
      <details className="motion-preview" data-testid="motion-preview" onToggle={e => { if ((e.target as HTMLDetailsElement).open) setPreview(n => n + 1); }}>
        <summary>معاينة ما يراه الطالب (لا تُحفظ)</summary>
        {!valid.ok ? <p className="motion-note">أصلح الإعداد لعرض المعاينة: {valid.issues[0]?.message}</p> : preview > 0 ? <PreviewHost key={preview} config={valid.config} /> : null}
      </details>
    </div>
  );
}
function PreviewHost({ config }: { config: unknown }) {
  const [actions, setActions] = useState<unknown[]>([]);
  return <MotionWorkspace config={config} actions={actions} onChange={a => setActions(a)} label="معاينة" preview />;
}
