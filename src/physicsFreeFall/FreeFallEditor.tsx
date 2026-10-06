import { useState } from "react";
import type { SmartSimEditorProps } from "../trustedSim/smartSimUiRegistry";
import FreeFallWorkspace from "./FreeFallWorkspace";
import { freeFallClassroomChecks, freeFallClassroomConfig } from "./freeFallTemplates";
import { UNIT_LABEL } from "./freeFallLabels";
import { FREE_FALL_LIMITS, FREE_FALL_UNITS, fmtPhysics, impactSpeed, impactTime, validateFreeFallConfig, validateFreeFallModel } from "../physicsFreeFallModel";
import SmartSimDraftInput from "../trustedSim/SmartSimDraftInput";
import "./freefall.css";

// Phase 20A.2 — physicsFreeFall@1 AUTHORING (lazy). Structured editing only (never raw JSON): the one-click classroom preset, the physical
// model and the experiment duration (typed numbers; anything invalid is shown by the host's canonical validator and blocks finalization —
// never clamped), the student's measurement and graph-point tasks, the PRIVATE weighted checks (physics checks derive their expected value
// from the model; numericNear@1 / pointNear@1 carry an explicit expected value) and the scoring mode. The derived physics facts are shown
// to the teacher; a collapsed preview runs the real student workspace on a throw-away answer.
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const KIND_LABEL: Readonly<Record<string, string>> = Object.freeze({
  "physics.impactTime": "زمن الارتطام (من النموذج)", "physics.impactSpeed": "سرعة الارتطام (من النموذج)", "physics.heightAtTime": "الارتفاع عند زمن (من النموذج)",
  "physics.velocityAtTime": "السرعة عند زمن (من النموذج)", "physics.pointOnTrajectory": "نقطة على منحنى الحركة", "numericNear@1": "قيمة قريبة من قيمة محددة", "pointNear@1": "نقطة قريبة من نقطة محددة"
});
const KINDS = Object.keys(KIND_LABEL);
const POINT_KINDS = new Set(["physics.pointOnTrajectory", "pointNear@1"]);
const nextId = (ids: string[], prefix: string) => { let n = ids.length + 1; while (ids.includes(prefix + n)) n++; return prefix + n; };
const show = (v: unknown) => (typeof v === "number" ? String(v) : typeof v === "string" ? v : "");

function checkFor(kind: string, id: string, target: string): Obj {
  const base = { id, label: KIND_LABEL[kind], weight: 1, kind };
  switch (kind) {
    case "physics.heightAtTime": case "physics.velocityAtTime": return { ...base, measurementId: target, time: 1, tolerance: 0.05 };
    case "physics.pointOnTrajectory": return { ...base, pointId: target, tolerance: 0.1 };
    case "numericNear@1": return { ...base, valueId: target, expected: 0, tolerance: 0.05 };
    case "pointNear@1": return { ...base, pointId: target, expected: { x: 0, y: 0 }, tolerance: 0.05 };
    default: return { ...base, measurementId: target, tolerance: 0.05 };
  }
}

export default function FreeFallEditor({ config, checks, scoring, onChange, disabled }: SmartSimEditorProps) {
  const c = isObj(config) ? config : {};
  const model = isObj(c.model) ? c.model : {}, view = isObj(c.view) ? c.view : {};
  const tasks = isObj(c.tasks) ? c.tasks : {};
  const measurements = (Array.isArray(tasks.measurements) ? tasks.measurements : []).filter(isObj);
  const points = (Array.isArray(tasks.points) ? tasks.points : []).filter(isObj);
  const list = checks.filter(isObj);
  const [preview, setPreview] = useState(0);
  const valid = validateFreeFallConfig(config);
  const m = validateFreeFallModel(model);
  const setConfig = (next: Obj) => onChange({ config: { v: 1, model, view, tasks: { measurements, points }, ...next } });
  const setModel = (k: string, v: unknown) => setConfig({ model: { ...model, [k]: v } });
  const setTasks = (ms: Obj[], ps: Obj[]) => setConfig({ tasks: { measurements: ms, points: ps } });
  const setCheck = (i: number, patch: Obj) => onChange({ checks: list.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const allIds = [...measurements, ...points].map(t => String(t.id));
  const used = (id: string) => list.some(k => k.measurementId === id || k.pointId === id || k.valueId === id);
  return (
    <div className="freefall-editor" data-testid="freefall-editor">
      <div className="freefall-controls">
        <button type="button" disabled={disabled} onClick={() => onChange({ config: freeFallClassroomConfig(), checks: freeFallClassroomChecks(), scoring: "proportional" })}>تطبيق القالب الصفي (سقوط من 20 م، g = 9.8)</button>
      </div>
      <fieldset>
        <legend>النموذج الفيزيائي (وحدات SI، الأعلى موجب، الأرض y = 0)</legend>
        <div className="freefall-fields">
          <label><span>الارتفاع الابتدائي h0 (م، 0–{FREE_FALL_LIMITS.heightMax})</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={model.initialHeight} disabled={disabled} onValue={v => setModel("initialHeight", v)} /></label>
          <label><span>السرعة الابتدائية v0 (م/ث، الأعلى موجب)</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={model.initialVelocity} disabled={disabled} onValue={v => setModel("initialVelocity", v)} /></label>
          <label><span>الجاذبية g (م/ث²، قيمة موجبة)</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={model.gravity} disabled={disabled} onValue={v => setModel("gravity", v)} /></label>
          <label><span>مدة التجربة (ث، حتى {FREE_FALL_LIMITS.maxTimeMax})</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={view.maxTime} disabled={disabled} onValue={v => setConfig({ view: { ...view, maxTime: v } })} /></label>
          <label className="freefall-row"><input type="checkbox" checked={view.showVelocityGraph === true} disabled={disabled} onChange={e => setConfig({ view: { ...view, showVelocityGraph: e.target.checked } })} /><span>إظهار منحنى السرعة للطالب</span></label>
        </div>
        <p className="freefall-note" data-testid="freefall-derived">{m ? <>الحقائق المحسوبة (للمعلم فقط): زمن الارتطام <span className="freefall-ltr">{fmtPhysics(impactTime(m))} s</span>، سرعة الارتطام <span className="freefall-ltr">{fmtPhysics(impactSpeed(m))} m/s</span>.</> : "أكمل نموذجًا صالحًا لعرض زمن الارتطام وسرعته."}</p>
      </fieldset>
      <fieldset>
        <legend>مهام الطالب</legend>
        <ul className="freefall-list" aria-label="مهام القياس">
          {measurements.map((t, i) => (
            <li key={String(t.id) + i}>
              <label><span>وصف القياس {i + 1}</span><input value={show(t.label)} maxLength={FREE_FALL_LIMITS.labelChars} disabled={disabled} onChange={e => setTasks(measurements.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)), points)} /></label>
              <label><span>الوحدة</span><select value={show(t.unit)} disabled={disabled} onChange={e => setTasks(measurements.map((x, k) => (k === i ? { ...x, unit: e.target.value } : x)), points)}>{FREE_FALL_UNITS.map(u => <option key={u} value={u}>{u} ({UNIT_LABEL[u]})</option>)}</select></label>
              <button type="button" className="is-secondary" disabled={disabled || used(String(t.id))} title={used(String(t.id)) ? "يستخدمه فحص؛ احذف الفحص أولًا" : undefined} onClick={() => setTasks(measurements.filter((_, k) => k !== i), points)}>حذف</button>
            </li>
          ))}
        </ul>
        <ul className="freefall-list" aria-label="مهام النقاط">
          {points.map((t, i) => (
            <li key={String(t.id) + i}>
              <label><span>وصف النقطة {i + 1}</span><input value={show(t.label)} maxLength={FREE_FALL_LIMITS.labelChars} disabled={disabled} onChange={e => setTasks(measurements, points.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} /></label>
              <button type="button" className="is-secondary" disabled={disabled || used(String(t.id))} onClick={() => setTasks(measurements, points.filter((_, k) => k !== i))}>حذف</button>
            </li>
          ))}
        </ul>
        <div className="freefall-controls">
          <button type="button" className="is-secondary" disabled={disabled || measurements.length >= FREE_FALL_LIMITS.measurements} onClick={() => setTasks([...measurements, { id: nextId(allIds, "m"), label: "قياس جديد", unit: "s" }], points)}>+ قياس</button>
          <button type="button" className="is-secondary" disabled={disabled || points.length >= FREE_FALL_LIMITS.points} onClick={() => setTasks(measurements, [...points, { id: nextId(allIds, "p"), label: "نقطة على المنحنى" }])}>+ نقطة على المنحنى</button>
        </div>
      </fieldset>
      <fieldset>
        <legend>الفحوص الخاصة (لا تصل إلى الطالب)</legend>
        <label><span>طريقة احتساب العلامة</span>
          <select value={scoring === "allOrNothing" ? "allOrNothing" : "proportional"} disabled={disabled} onChange={e => onChange({ scoring: e.target.value })}>
            <option value="proportional">جزئية حسب الأوزان</option><option value="allOrNothing">كل شيء أو لا شيء</option>
          </select>
        </label>
        <ul className="freefall-list" aria-label="الفحوص">
          {list.map((k, i) => {
            const kind = String(k.kind), isPoint = POINT_KINDS.has(kind), targetKey = kind === "numericNear@1" ? "valueId" : isPoint ? "pointId" : "measurementId";
            const targets = isPoint ? points : measurements;
            const exp = isObj(k.expected) ? k.expected : {};
            return (
              <li key={String(k.id) + i} data-testid="freefall-check">
                <label><span>نوع الفحص {i + 1}</span><select value={kind} disabled={disabled} onChange={e => onChange({ checks: list.map((x, j) => (j === i ? checkFor(e.target.value, String(x.id), String((POINT_KINDS.has(e.target.value) ? points : measurements)[0]?.id ?? "")) : x)) })}>{KINDS.map(o => <option key={o} value={o}>{KIND_LABEL[o]}</option>)}</select></label>
                <label><span>الوصف</span><input value={show(k.label)} disabled={disabled} onChange={e => setCheck(i, { label: e.target.value })} /></label>
                <label><span>المهمة</span><select value={show(k[targetKey])} disabled={disabled} onChange={e => setCheck(i, { [targetKey]: e.target.value })}>{targets.map(t => <option key={String(t.id)} value={String(t.id)}>{String(t.label)}</option>)}</select></label>
                {(kind === "physics.heightAtTime" || kind === "physics.velocityAtTime") && <label><span>الزمن (ث)</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={k.time} disabled={disabled} onValue={v => setCheck(i, { time: v })} /></label>}
                {kind === "numericNear@1" && <label><span>القيمة المتوقعة</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={k.expected} disabled={disabled} onValue={v => setCheck(i, { expected: v })} /></label>}
                {kind === "pointNear@1" && <><label><span>t المتوقع</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={exp.x} disabled={disabled} onValue={v => setCheck(i, { expected: { ...exp, x: v } })} /></label><label><span>y المتوقع</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={exp.y} disabled={disabled} onValue={v => setCheck(i, { expected: { ...exp, y: v } })} /></label></>}
                <label><span>السماحية ±</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={k.tolerance} disabled={disabled} onValue={v => setCheck(i, { tolerance: v })} /></label>
                <label><span>الوزن</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={k.weight} disabled={disabled} onValue={v => setCheck(i, { weight: v })} /></label>
                <button type="button" className="is-secondary" disabled={disabled} onClick={() => onChange({ checks: list.filter((_, j) => j !== i) })}>حذف الفحص</button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="is-secondary" disabled={disabled || measurements.length === 0} onClick={() => onChange({ checks: [...list, checkFor("physics.impactTime", nextId(list.map(k => String(k.id)), "check-"), String(measurements[0]?.id ?? ""))] })}>+ فحص</button>
      </fieldset>
      <details className="freefall-preview" data-testid="freefall-preview" onToggle={e => { if ((e.target as HTMLDetailsElement).open) setPreview(n => n + 1); }}>
        <summary>معاينة ما يراه الطالب (لا تُحفظ)</summary>
        {!valid.ok ? <p className="freefall-note">أصلح الإعداد لعرض المعاينة.</p> : preview > 0 ? <PreviewHost key={preview} config={valid.config} /> : null}
      </details>
    </div>
  );
}
function PreviewHost({ config }: { config: unknown }) {
  const [actions, setActions] = useState<unknown[]>([]);
  return <FreeFallWorkspace config={config} actions={actions} onChange={a => setActions(a)} label="معاينة" preview />;
}
