import { useId, useState } from "react";
import type { SmartSimEditorProps } from "../trustedSim/smartSimUiRegistry";
import SmartSimDraftInput from "../trustedSim/SmartSimDraftInput";
import {
  CHEM_LAB_EXPERIMENTS, CHEM_LAB_EXPERIMENT_LABEL, CHEM_LAB_LIMITS, CHOICES, OBSERVATIONS, QUANTITIES, chemLabContext, quantityDimension, validateChemLabConfig,
  validateChemLabExperiment, type ChemLabConfigV1, type ChemLabExperiment, type ChemLabExperimentKind, type PhContext, type RateContext, type SolutionsContext,
  type TitrationContext
} from "../chemistryLabModel";
import { expectedChemLabText, optionText } from "../chemistryLabPlugin";
import { parseDecimal, toFixed, toNumber, type Q } from "../chemistry/lab/exact";
import { LAB_UNITS, isLabDimension } from "../chemistry/lab/units";
import { LAB_FLASKS_ML, LAB_PIPETTES_ML, LAB_SOLUTES, requiredAliquot, requiredMass } from "../chemistry/lab/solutions";
import { ACID_BASE_SPECIES, INDICATORS, PH_CLASS_LABEL, formatPh, indicatorById, phClassOf } from "../chemistry/lab/acidBase";
import { indicatorEndpoint, indicatorSuitability } from "../chemistry/lab/titration";
import { RATE_ORDER_LABEL, halfLife, initialRate } from "../chemistry/lab/kinetics";
import { CHEM_LAB_TEMPLATES, dilutionTemplate, phCompareTemplate, rateTemplate, titrationTemplate, type ChemLabTemplate } from "./labTemplates";
import ChemLabWorkspace from "./ChemLabWorkspace";
import { sig } from "./labView";
import "../chemistryStructure/chem.css";
import "./chemLab.css";

// Phase 21D-D.3 — chemistryLab@1 AUTHORING (lazy; structured, never raw JSON): the experiment (given data only — the student receives it),
// what the student may see (instrument readouts, graphs), the tasks, the PRIVATE weighted checks and the scoring mode. Expected answers are
// never typed: the editor shows what the trusted models derive, with the tolerance the precision policy gives (teacher only). Anything the
// canonical validator refuses is listed here and blocks finalization; nothing is repaired silently.
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const show = (v: unknown) => (typeof v === "number" ? String(v) : typeof v === "string" ? v : "");
const keepText = (t: string) => t.trim();
const asInt = (t: string): unknown => (/^\d{1,6}$/.test(t.trim()) ? Number(t.trim()) : t);
const nextId = (ids: string[], prefix: string) => { let n = ids.length + 1; while (ids.includes(prefix + n)) n++; return prefix + n; };
const STARTER: Readonly<Record<ChemLabExperimentKind, () => ChemLabTemplate>> = Object.freeze({ solutions: dilutionTemplate, ph: phCompareTemplate, titration: titrationTemplate, rate: rateTemplate });
const TASK_KIND_LABEL: Readonly<Record<string, string>> = Object.freeze({ number: "إجابة عددية", choice: "اختيار", prepare: "تحضير محلول", observe: "متطلب ملاحظة" });
const CHECK_FOR_TASK: Readonly<Record<string, string>> = Object.freeze({ number: "lab.number", choice: "lab.choice", prepare: "lab.prepared", observe: "lab.observed" });
const VIEW_TEXT: Readonly<Record<ChemLabExperimentKind, { readouts: string; graph: string }>> = Object.freeze({
  solutions: { readouts: "ملصق الدورق: يظهر التركيز المحسوب بعد الإكمال إلى العلامة (يكشف الإجابة؛ للتدريب)", graph: "منحنى التركيز مقابل الحجم عند ثبات كمية المادة" },
  ph: { readouts: "جهاز قياس pH (قراءة رقمية لكل محلول)", graph: "مقياس pH مع مدى تغيّر الكواشف (ومواضع المحاليل المقيسة)" },
  titration: { readouts: "جهاز قياس pH في الدورق أثناء المعايرة", graph: "منحنى المعايرة من القراءات التي يسجلها الطالب (يحتاج جهاز pH)" },
  rate: { readouts: "قراءة تركيز A عند زمن المشاهدة لكل تجربة", graph: "منحنيات التركيز مع الزمن للتجارب المشغّلة" }
});
/** A signed error to 0.001 mL; a value that rounds to zero is "0.000", never "-0.000". */
const signed = (x: number): string => { const r = Math.round(x * 1000) / 1000; return r === 0 ? "0.000" : (r > 0 ? "+" : "") + r.toFixed(3); };
const STRONG = ACID_BASE_SPECIES.filter(s => s.kind === "strongAcid" || s.kind === "strongBase");

export default function ChemLabEditor({ config, checks, scoring, onChange, disabled }: SmartSimEditorProps) {
  const c = isObj(config) ? config : {};
  const exp = isObj(c.experiment) ? c.experiment : {};
  const view = isObj(c.view) ? c.view : { readouts: false, graph: false };
  const tasks = (Array.isArray(c.tasks) ? c.tasks : []).filter(isObj);
  const list = checks.filter(isObj);
  const [preview, setPreview] = useState(0);
  const valid = validateChemLabConfig(config);
  const cfg: ChemLabConfigV1 | null = valid.ok ? valid.config : null;
  const ev = validateChemLabExperiment(c.experiment);
  const e: ChemLabExperiment | null = ev.ok ? ev.experiment : null;
  const kind = (CHEM_LAB_EXPERIMENTS as readonly unknown[]).includes(exp.kind) ? (exp.kind as ChemLabExperimentKind) : null;
  const shell: ChemLabConfigV1 | null = e ? { v: 1, experiment: e, view: { readouts: view.readouts === true, graph: view.graph === true }, tasks: [] } : null;

  const setConfig = (patch: Obj) => onChange({ config: { v: 1, experiment: exp, view, tasks, ...patch } });
  const setExp = (patch: Obj) => setConfig({ experiment: { ...exp, ...patch } });
  const setTasks = (next: Obj[]) => setConfig({ tasks: next });
  const setTask = (i: number, patch: Obj) => setTasks(tasks.map((t, k) => (k === i ? { ...t, ...patch } : t)));
  const applyTemplate = (t: ChemLabTemplate) => onChange({ config: t.config, checks: t.checks, scoring: "proportional" });
  const used = (id: unknown) => list.some(k => k.taskId === id);
  const taskIds = tasks.map(t => String(t.id));

  // ── defaults for a new task (always a complete, editable shape; the validator decides) ──
  const subjects = (need: string | null): { id: string; label: string }[] => {
    if (!need || !e) return [];
    if (need === "solution" && e.kind === "ph") return e.solutions.map(s => ({ id: s.id, label: s.label }));
    if (need === "indicator" && (e.kind === "ph" || e.kind === "titration")) return e.indicators.map(id => ({ id, label: indicatorById(id)!.nameAr }));
    if (need === "trial" && e.kind === "rate") return e.trials.map(t => ({ id: t.id, label: t.label }));
    return [];
  };
  const newTask = (k: string): Obj | null => {
    if (!kind) return null;
    const id = nextId(taskIds, "task");
    if (k === "number") {
      const q = QUANTITIES[kind][0], subj = subjects(q.needs.subject), oth = subjects(q.needs.other);
      const dim = shell ? quantityDimension(shell, q) : null;
      return { id, label: q.label, kind: "number", quantity: q.id, subject: subj[0]?.id ?? null, other: oth[1]?.id ?? null, at: q.needs.at === "volume" ? "10.00" : q.needs.at === "time" ? "60" : null,
        unit: dim && isLabDimension(dim) ? LAB_UNITS[dim][0].id : "", precision: { significant: 3 } };
    }
    if (k === "choice") {
      const q = CHOICES[kind][0];
      return { id, label: q.label, kind: "choice", question: q.id, subject: null, other: null, mode: q.mode === "multiple" ? "multiple" : "single", options: shell ? [...q.options(shell, { subject: null, other: null })] : [] };
    }
    if (k === "prepare") return { id, label: "حضّر المحلول المطلوب.", kind: "prepare", concentration: "0.100", volume: Array.isArray(exp.flasks) ? (exp.flasks as number[])[0] ?? 100 : 100 };
    const o = OBSERVATIONS[kind][0];
    return { id, label: o.label, kind: "observe", requirement: o.id, subject: o.needs.subject ? subjects(o.needs.subject)[0]?.id ?? null : null, count: o.needs.count ? 3 : null };
  };
  const checkFor = (t: Obj, id: string): Obj => ({ id, label: String(t.label ?? "").slice(0, 120) || "فحص", weight: 1, kind: CHECK_FOR_TASK[String(t.kind)] ?? "lab.number", taskId: t.id });
  const suggested = () => tasks.map(t => checkFor(t, "c-" + String(t.id)));

  return (
    <div className="chem-editor clab-editor" data-testid="clab-editor" dir="rtl">
      <fieldset>
        <legend>القوالب الصفية</legend>
        <label><span>تطبيق قالب كامل (التجربة والمهام والفحوص)</span>
          <select value="" disabled={disabled} data-testid="clab-template" onChange={ev2 => { const make = CHEM_LAB_TEMPLATES.find(m => m().id === ev2.target.value); if (make) applyTemplate(make()); }}>
            <option value="">— اختر قالبًا —</option>
            {CHEM_LAB_TEMPLATES.map(make => { const t = make(); return <option key={t.id} value={t.id}>{t.title}</option>; })}
          </select>
        </label>
      </fieldset>
      <fieldset>
        <legend>التجربة (بيانات معطاة يراها الطالب)</legend>
        <label><span>نوع التجربة (التغيير يطبّق قالبها الأساسي)</span>
          <select value={kind ?? ""} disabled={disabled} data-testid="clab-kind" onChange={ev2 => { const k = ev2.target.value as ChemLabExperimentKind; if (STARTER[k]) applyTemplate(STARTER[k]()); }}>
            {!kind && <option value="">—</option>}
            {CHEM_LAB_EXPERIMENTS.map(k => <option key={k} value={k}>{CHEM_LAB_EXPERIMENT_LABEL[k]}</option>)}
          </select>
        </label>
        {kind === "solutions" && <SolutionsFields exp={exp} disabled={disabled} setExp={setExp} />}
        {kind === "ph" && <PhFields exp={exp} disabled={disabled} setExp={setExp} usedSubject={id => tasks.some(t => t.subject === id || t.other === id)} />}
        {kind === "titration" && <TitrationFields exp={exp} disabled={disabled} setExp={setExp} />}
        {kind === "rate" && <RateFields exp={exp} disabled={disabled} setExp={setExp} usedSubject={id => tasks.some(t => t.subject === id || t.other === id)} />}
        <div className="clab-derived" data-testid="clab-derived" role={ev.ok ? undefined : "alert"}>
          {ev.ok ? <Derived e={ev.experiment} tasks={tasks} /> : <p className="chem-error">{ev.issues[0]?.message ?? "إعداد التجربة غير صالح."}</p>}
        </div>
      </fieldset>
      {kind && (
        <fieldset>
          <legend>ما يُسمح للطالب برؤيته</legend>
          <label className="chem-inline"><input type="checkbox" checked={view.readouts === true} disabled={disabled} data-testid="clab-view-readouts" onChange={ev2 => setConfig({ view: { readouts: ev2.target.checked, graph: view.graph === true } })} /><span>{VIEW_TEXT[kind].readouts}</span></label>
          <label className="chem-inline"><input type="checkbox" checked={view.graph === true} disabled={disabled} data-testid="clab-view-graph" onChange={ev2 => setConfig({ view: { readouts: view.readouts === true, graph: ev2.target.checked } })} /><span>{VIEW_TEXT[kind].graph}</span></label>
        </fieldset>
      )}
      {kind && (
        <fieldset>
          <legend>مهام الطالب (حتى {CHEM_LAB_LIMITS.tasks})</legend>
          <ul aria-label="المهام">
            {tasks.map((t, i) => (
              <li key={String(t.id) + i} data-testid="clab-editor-task" data-kind={String(t.kind)}>
                <p className="chem-task-label"><strong>{i + 1}. {TASK_KIND_LABEL[String(t.kind)] ?? String(t.kind)}</strong> <small className="chem-ltr">{String(t.id)}</small></p>
                <label><span>نص المهمة</span><input value={show(t.label)} maxLength={CHEM_LAB_LIMITS.labelChars} disabled={disabled} onChange={ev2 => setTask(i, { label: ev2.target.value })} /></label>
                <TaskFields kind={kind} task={t} shell={shell} disabled={disabled} subjects={subjects} set={patch => setTask(i, patch)} />
                {cfg && cfg.tasks.some(x => x.id === t.id) && <p className="chem-expected" data-testid="clab-task-expected">المتوقع (محسوب من النموذج، للمعلم فقط): <span>{expectedChemLabText(cfg, String(t.id))}</span></p>}
                <button type="button" className="is-secondary" disabled={disabled || used(t.id)} title={used(t.id) ? "يستخدمه فحص؛ احذف الفحص أولًا" : undefined} onClick={() => setTasks(tasks.filter((_, k) => k !== i))}>حذف المهمة</button>
              </li>
            ))}
          </ul>
          <div className="chem-row">
            {(["number", "choice", ...(kind === "solutions" ? ["prepare"] : []), "observe"] as const).map(k => (
              <button key={k} type="button" className="is-secondary" data-testid={"clab-add-" + k} disabled={disabled || tasks.length >= CHEM_LAB_LIMITS.tasks || (k !== "prepare" && !shell)}
                onClick={() => { const t = newTask(k); if (t) setTasks([...tasks, t]); }}>+ {TASK_KIND_LABEL[k]}</button>
            ))}
          </div>
        </fieldset>
      )}
      {!valid.ok && <div className="rxn-issues" role="alert" data-testid="clab-issues"><p className="chem-error">مشكلات تمنع النشر:</p><ul>{valid.issues.slice(0, 8).map((x, i) => <li key={i} className="chem-error">{x.message}</li>)}</ul></div>}
      <fieldset>
        <legend>الفحوص الخاصة (لا تصل إلى الطالب)</legend>
        <label><span>طريقة احتساب العلامة</span>
          <select value={scoring === "allOrNothing" ? "allOrNothing" : "proportional"} disabled={disabled} onChange={ev2 => onChange({ scoring: ev2.target.value })}>
            <option value="proportional">جزئية حسب الأوزان</option><option value="allOrNothing">كل شيء أو لا شيء</option>
          </select>
        </label>
        <ul aria-label="الفحوص">
          {list.map((k, i) => {
            const task = tasks.find(t => t.id === k.taskId);
            return (
              <li key={String(k.id) + i} data-testid="clab-check">
                <label><span>المهمة التي يفحصها</span>
                  <select value={show(k.taskId)} disabled={disabled} onChange={ev2 => { const t = tasks.find(x => x.id === ev2.target.value); if (t) onChange({ checks: list.map((x, j) => (j === i ? { ...checkFor(t, String(x.id)), label: x.label, weight: x.weight } : x)) }); }}>
                    {!task && <option value={show(k.taskId)}>— مهمة غير موجودة —</option>}
                    {tasks.map(t => <option key={String(t.id)} value={String(t.id)}>{String(t.label)}</option>)}
                  </select>
                </label>
                <label><span>الوصف</span><input value={show(k.label)} maxLength={120} disabled={disabled} onChange={ev2 => onChange({ checks: list.map((x, j) => (j === i ? { ...x, label: ev2.target.value } : x)) })} /></label>
                <label><span>الوزن</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={k.weight} disabled={disabled} onValue={v => onChange({ checks: list.map((x, j) => (j === i ? { ...x, weight: v } : x)) })} /></label>
                <p className="chem-expected" data-testid="clab-check-expected">المتوقع: <span>{cfg && task ? expectedChemLabText(cfg, String(task.id)) : "أصلح الإعداد لعرض الإجابة المتوقعة."}</span></p>
                <button type="button" className="is-secondary" disabled={disabled} onClick={() => onChange({ checks: list.filter((_, j) => j !== i) })}>حذف الفحص</button>
              </li>
            );
          })}
        </ul>
        <div className="chem-row">
          <button type="button" className="is-secondary" disabled={disabled || tasks.length === 0} onClick={() => { const t = tasks.find(x => !used(x.id)) ?? tasks[0]; onChange({ checks: [...list, checkFor(t, nextId(list.map(x => String(x.id)), "check-"))] }); }}>+ فحص</button>
          <button type="button" className="is-secondary" data-testid="clab-suggest-checks" disabled={disabled || tasks.length === 0} onClick={() => onChange({ checks: suggested() })}>فحص لكل مهمة (يستبدل الحالية)</button>
        </div>
      </fieldset>
      <details className="chem-preview" data-testid="clab-preview" onToggle={ev2 => { if ((ev2.target as HTMLDetailsElement).open) setPreview(n => n + 1); }}>
        <summary>معاينة ما يراه الطالب (لا تُحفظ)</summary>
        {!valid.ok ? <p className="chem-note">أصلح الإعداد لعرض المعاينة: {valid.issues[0]?.message}</p> : preview > 0 ? <PreviewHost key={preview} config={valid.config} /> : null}
      </details>
    </div>
  );
}
function PreviewHost({ config }: { config: unknown }) {
  const [actions, setActions] = useState<unknown[]>([]);
  return <ChemLabWorkspace config={config} actions={actions} onChange={a => setActions(a)} label="معاينة" preview />;
}

// ── experiment fields ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type FieldProps = { exp: Obj; disabled?: boolean; setExp: (patch: Obj) => void };
const toggle = (list: unknown, v: number | string, on: boolean): unknown[] => { const l = Array.isArray(list) ? list : []; return on ? [...l.filter(x => x !== v), v] : l.filter(x => x !== v); };
function DecimalField({ label, value, disabled, onValue, testId }: { label: string; value: unknown; disabled?: boolean; onValue: (v: unknown) => void; testId?: string }) {
  return <label><span>{label}</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={value} disabled={disabled} parse={keepText} onValue={onValue} data-testid={testId} /></label>;
}
function SolutionsFields({ exp, disabled, setExp }: FieldProps) {
  const solid = exp.source !== "stock", name = "clab-source" + useId();
  return (
    <div className="clab-grid">
      <label><span>المادة المذابة</span><select value={show(exp.solute)} disabled={disabled} onChange={ev => setExp({ solute: ev.target.value })}>{LAB_SOLUTES.map(s => <option key={s.id} value={s.id}>{s.nameAr} ({s.formula})</option>)}</select></label>
      <div role="radiogroup" aria-label="مصدر المادة">
        <label className="chem-inline"><input type="radio" name={name} checked={solid} disabled={disabled} onChange={() => setExp({ source: "solid", stock: null, pipettes: [] })} /><span>مادة صلبة توزن</span></label>
        <label className="chem-inline"><input type="radio" name={name} checked={!solid} disabled={disabled} onChange={() => setExp({ source: "stock", stock: "0.500", pipettes: [10, 20, 25] })} /><span>تخفيف محلول أم</span></label>
      </div>
      {!solid && <DecimalField label="تركيز المحلول الأم (mol/L)" value={exp.stock} disabled={disabled} onValue={v => setExp({ stock: v })} />}
      <fieldset><legend>الدوارق الحجمية المتاحة</legend><div className="chem-options">{LAB_FLASKS_ML.map(v => <label key={v} className="chem-inline"><input type="checkbox" checked={Array.isArray(exp.flasks) && exp.flasks.includes(v)} disabled={disabled} onChange={ev => setExp({ flasks: toggle(exp.flasks, v, ev.target.checked) })} /><span className="chem-ltr">{v} mL</span></label>)}</div></fieldset>
      {!solid && <fieldset><legend>الماصّات المتاحة</legend><div className="chem-options">{LAB_PIPETTES_ML.map(v => <label key={v} className="chem-inline"><input type="checkbox" checked={Array.isArray(exp.pipettes) && exp.pipettes.includes(v)} disabled={disabled} onChange={ev => setExp({ pipettes: toggle(exp.pipettes, v, ev.target.checked) })} /><span className="chem-ltr">{v} mL</span></label>)}</div></fieldset>}
    </div>
  );
}
function PhFields({ exp, disabled, setExp, usedSubject }: FieldProps & { usedSubject: (id: string) => boolean }) {
  const sols = (Array.isArray(exp.solutions) ? exp.solutions : []).filter(isObj);
  const set = (i: number, patch: Obj) => setExp({ solutions: sols.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const free = "ABCDEF".split("").find(l => !sols.some(s => s.id === l));
  return (
    <div className="clab-grid">
      <ul aria-label="المحاليل">
        {sols.map((s, i) => (
          <li key={String(s.id) + i} data-testid="clab-editor-solution">
            <p className="chem-task-label"><strong>المحلول {String(s.id)}</strong></p>
            <label><span>الاسم الظاهر للطالب</span><input value={show(s.label)} maxLength={CHEM_LAB_LIMITS.shortLabelChars} disabled={disabled} onChange={ev => set(i, { label: ev.target.value })} /></label>
            <label><span>المادة</span><select value={show(s.species)} disabled={disabled} onChange={ev => set(i, { species: ev.target.value, concentration: ev.target.value === "H2O" ? "0" : s.concentration === "0" ? "0.010" : s.concentration })}>{ACID_BASE_SPECIES.map(x => <option key={x.id} value={x.id}>{x.nameAr} ({x.formula})</option>)}</select></label>
            <DecimalField label="التركيز (mol/L)" value={s.concentration} disabled={disabled || s.species === "H2O"} onValue={v => set(i, { concentration: v })} />
            <button type="button" className="is-secondary" disabled={disabled || sols.length <= 1 || usedSubject(String(s.id))} onClick={() => setExp({ solutions: sols.filter((_, k) => k !== i) })}>حذف</button>
          </li>
        ))}
      </ul>
      <button type="button" className="is-secondary" disabled={disabled || !free || sols.length >= CHEM_LAB_LIMITS.solutions} onClick={() => setExp({ solutions: [...sols, { id: free, label: "المحلول " + free, species: "NaCl", concentration: "0.10" }] })}>+ محلول</button>
      <IndicatorBoxes exp={exp} disabled={disabled} setExp={setExp} />
    </div>
  );
}
function IndicatorBoxes({ exp, disabled, setExp }: FieldProps) {
  return <fieldset><legend>الكواشف المتاحة (حتى {CHEM_LAB_LIMITS.indicators})</legend><div className="chem-options">{INDICATORS.map(ind => <label key={ind.id} className="chem-inline"><input type="checkbox" checked={Array.isArray(exp.indicators) && exp.indicators.includes(ind.id)} disabled={disabled} onChange={ev => setExp({ indicators: toggle(exp.indicators, ind.id, ev.target.checked) })} /><span>{ind.nameAr} <small className="chem-ltr">({ind.low}–{ind.high})</small></span></label>)}</div></fieldset>;
}
function TitrationFields({ exp, disabled, setExp }: FieldProps) {
  const a = isObj(exp.analyte) ? exp.analyte : {}, t = isObj(exp.titrant) ? exp.titrant : {}, unknown = a.equivalence !== null && a.equivalence !== undefined;
  const name = "clab-analyte" + useId();
  return (
    <div className="clab-grid">
      <label><span>المادة في الدورق</span><select value={show(a.species)} disabled={disabled} onChange={ev => setExp({ analyte: { ...a, species: ev.target.value } })}>{STRONG.map(x => <option key={x.id} value={x.id}>{x.nameAr} ({x.formula})</option>)}</select></label>
      <DecimalField label="حجمها في الدورق (mL)" value={a.volume} disabled={disabled} onValue={v => setExp({ analyte: { ...a, volume: v } })} />
      <div role="radiogroup" aria-label="تركيز المادة في الدورق">
        <label className="chem-inline"><input type="radio" name={name} checked={!unknown} disabled={disabled} onChange={() => setExp({ analyte: { ...a, concentration: "0.100", equivalence: null } })} /><span>تركيز معلوم</span></label>
        <label className="chem-inline"><input type="radio" name={name} checked={unknown} disabled={disabled} onChange={() => setExp({ analyte: { ...a, concentration: null, equivalence: "20.00" } })} /><span>تركيز مجهول (يحدده الطالب)</span></label>
      </div>
      {unknown
        ? <DecimalField label="حجم نقطة التكافؤ (mL) — يحدد التركيز المجهول ويُنشر للطالب ضمن الإعداد" value={a.equivalence} disabled={disabled} onValue={v => setExp({ analyte: { ...a, equivalence: v } })} />
        : <DecimalField label="تركيزها (mol/L)" value={a.concentration} disabled={disabled} onValue={v => setExp({ analyte: { ...a, concentration: v } })} />}
      <label><span>المحلول القياسي في السحاحة</span><select value={show(t.species)} disabled={disabled} onChange={ev => setExp({ titrant: { ...t, species: ev.target.value } })}>{STRONG.map(x => <option key={x.id} value={x.id}>{x.nameAr} ({x.formula})</option>)}</select></label>
      <DecimalField label="تركيزه (mol/L)" value={t.concentration} disabled={disabled} onValue={v => setExp({ titrant: { ...t, concentration: v } })} />
      <IndicatorBoxes exp={exp} disabled={disabled} setExp={setExp} />
      {unknown && <p className="chem-help">تنبيه: إعداد السؤال يصل إلى جهاز الطالب؛ لذلك يُكتب حجم نقطة التكافؤ (قابل للملاحظة) بدل التركيز، ويُشتق التركيز على الخادم.</p>}
    </div>
  );
}
function RateFields({ exp, disabled, setExp, usedSubject }: FieldProps & { usedSubject: (id: string) => boolean }) {
  const trials = (Array.isArray(exp.trials) ? exp.trials : []).filter(isObj);
  const set = (i: number, patch: Obj) => setExp({ trials: trials.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  return (
    <div className="clab-grid">
      <label><span>رتبة التفاعل</span><select value={show(exp.order)} disabled={disabled} onChange={ev => setExp({ order: Number(ev.target.value) })}>{([0, 1, 2] as const).map(o => <option key={o} value={o}>{RATE_ORDER_LABEL[o]}</option>)}</select></label>
      <DecimalField label="ثابت السرعة عند 25 °C (يُسمح بالصيغة العلمية مثل 2.0e-3)" value={exp.k25} disabled={disabled} onValue={v => setExp({ k25: v })} />
      <DecimalField label="طاقة التنشيط Ea (kJ/mol)" value={exp.ea} disabled={disabled} onValue={v => setExp({ ea: v })} />
      <label className="chem-inline"><input type="checkbox" checked={exp.catalystDrop !== null && exp.catalystDrop !== undefined} disabled={disabled} onChange={ev => setExp({ catalystDrop: ev.target.checked ? "5" : null, ...(ev.target.checked ? {} : { trials: trials.map(t => ({ ...t, catalyst: false })) }) })} /><span>يتوفر حافز</span></label>
      {exp.catalystDrop !== null && exp.catalystDrop !== undefined && <DecimalField label="خفض طاقة التنشيط بالحافز (kJ/mol)" value={exp.catalystDrop} disabled={disabled} onValue={v => setExp({ catalystDrop: v })} />}
      <label><span>مدة المشاهدة (ث، عدد صحيح)</span><SmartSimDraftInput dir="ltr" inputMode="numeric" value={exp.duration} disabled={disabled} parse={asInt} onValue={v => setExp({ duration: v })} /></label>
      <ul aria-label="التجارب">
        {trials.map((t, i) => (
          <li key={String(t.id) + i} data-testid="clab-editor-trial">
            <label><span>اسم التجربة</span><input value={show(t.label)} maxLength={CHEM_LAB_LIMITS.shortLabelChars} disabled={disabled} onChange={ev => set(i, { label: ev.target.value })} /></label>
            <DecimalField label="درجة الحرارة (°C)" value={t.temperature} disabled={disabled} onValue={v => set(i, { temperature: v })} />
            <DecimalField label="[A]₀ (mol/L)" value={t.concentration} disabled={disabled} onValue={v => set(i, { concentration: v })} />
            <label className="chem-inline"><input type="checkbox" checked={t.catalyst === true} disabled={disabled || exp.catalystDrop === null} onChange={ev => set(i, { catalyst: ev.target.checked })} /><span>مع الحافز</span></label>
            <button type="button" className="is-secondary" disabled={disabled || trials.length <= 1 || usedSubject(String(t.id))} onClick={() => setExp({ trials: trials.filter((_, k) => k !== i) })}>حذف</button>
          </li>
        ))}
      </ul>
      <button type="button" className="is-secondary" disabled={disabled || trials.length >= CHEM_LAB_LIMITS.trials}
        onClick={() => { const id = nextId(trials.map(t => String(t.id)), "t"); setExp({ trials: [...trials, { id, label: "التجربة " + (trials.length + 1), temperature: "25", concentration: "0.100", catalyst: false }] }); }}>+ تجربة</button>
    </div>
  );
}

// ── task fields ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function TaskFields({ kind, task: t, shell, disabled, subjects, set }: { kind: ChemLabExperimentKind; task: Obj; shell: ChemLabConfigV1 | null; disabled?: boolean; subjects: (need: string | null) => { id: string; label: string }[]; set: (patch: Obj) => void }) {
  const ref = (label: string, need: string | null, key: "subject" | "other") => need && (
    <label><span>{label}</span><select value={show(t[key])} disabled={disabled} onChange={ev => set({ [key]: ev.target.value })}>
      {!subjects(need).some(s => s.id === t[key]) && <option value={show(t[key])}>—</option>}
      {subjects(need).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
    </select></label>
  );
  if (t.kind === "number") {
    const q = QUANTITIES[kind].find(x => x.id === t.quantity), dim = q && shell ? quantityDimension(shell, q) : null;
    const precision = isObj(t.precision) ? t.precision : { significant: 3 }, mode = "decimals" in precision ? "decimals" : "significant";
    return (
      <div className="clab-grid">
        <label><span>الكمية المطلوبة</span><select value={show(t.quantity)} disabled={disabled} onChange={ev => {
          const nq = QUANTITIES[kind].find(x => x.id === ev.target.value);
          if (!nq) return;
          const d = shell ? quantityDimension(shell, nq) : null;
          set({ quantity: nq.id, label: nq.label, subject: subjects(nq.needs.subject)[0]?.id ?? null, other: subjects(nq.needs.other)[1]?.id ?? null, at: nq.needs.at === "volume" ? "10.00" : nq.needs.at === "time" ? "60" : null, unit: d && isLabDimension(d) ? LAB_UNITS[d][0].id : "" });
        }}>{QUANTITIES[kind].map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
        {q && ref(q.needs.subject === "trial" ? "التجربة" : q.needs.subject === "indicator" ? "الكاشف" : "المحلول", q.needs.subject, "subject")}
        {q && ref("مقارنة بالتجربة", q.needs.other, "other")}
        {q?.needs.at && <DecimalField label={q.needs.at === "volume" ? "بعد إضافة (mL، مضاعف 0.05)" : "عند الزمن (ث)"} value={t.at} disabled={disabled} onValue={v => set({ at: v })} />}
        <label><span>الوحدة المطلوبة</span><select value={show(t.unit)} disabled={disabled} onChange={ev => set({ unit: ev.target.value })}>
          {dim && isLabDimension(dim) ? LAB_UNITS[dim].map(u => <option key={u.id} value={u.id}>{u.id === "1" ? "بلا وحدة (نسبة)" : u.id === "pH" ? "pH" : u.label}</option>) : <option value={show(t.unit)}>{show(t.unit) || "—"}</option>}
        </select></label>
        <label><span>دقة الإجابة</span><select value={mode} disabled={disabled} onChange={ev => set({ precision: ev.target.value === "decimals" ? { decimals: 2 } : { significant: 3 } })}>
          <option value="significant">أرقام معنوية</option><option value="decimals">منازل عشرية</option></select></label>
        <label><span>{mode === "decimals" ? "عدد المنازل العشرية (0–6)" : "عدد الأرقام المعنوية (1–6)"}</span>
          <SmartSimDraftInput dir="ltr" inputMode="numeric" value={mode === "decimals" ? precision.decimals : precision.significant} disabled={disabled} parse={asInt} onValue={v => set({ precision: { [mode]: v } })} /></label>
        <p className="chem-help">السماحية = نصف وحدة في آخر منزلة مطلوبة، أو حد دقة الأداة إن كان أكبر (قراءة السحاحة ±0.05 mL، حجم المعايرة ±0.10 mL).</p>
      </div>
    );
  }
  if (t.kind === "choice") {
    const q = CHOICES[kind].find(x => x.id === t.question), options = Array.isArray(t.options) ? (t.options as string[]) : [];
    const offered = q && shell ? q.options(shell, { subject: (t.subject as string) ?? null, other: (t.other as string) ?? null }) : options;
    return (
      <div className="clab-grid">
        <label><span>السؤال</span><select value={show(t.question)} disabled={disabled} onChange={ev => {
          const nq = CHOICES[kind].find(x => x.id === ev.target.value);
          if (!nq) return;
          const subject = subjects(nq.needs.subject)[0]?.id ?? null, other = subjects(nq.needs.other)[0]?.id ?? null;
          set({ question: nq.id, label: nq.label, subject, other, mode: nq.mode === "multiple" ? "multiple" : "single", options: shell ? [...nq.options(shell, { subject, other })] : [] });
        }}>{CHOICES[kind].map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
        {q && ref("المحلول", q.needs.subject, "subject")}
        {q && ref("الكاشف", q.needs.other, "other")}
        <p className="chem-help">نمط الاختيار: {t.mode === "multiple" ? "اختيار متعدد (كل ما ينطبق)" : "اختيار واحد"}.</p>
        <fieldset><legend>الخيارات المعروضة</legend><div className="chem-options">
          {offered.map(o => <label key={o} className="chem-inline"><input type="checkbox" checked={options.includes(o)} disabled={disabled} onChange={ev => set({ options: offered.filter(x => (x === o ? ev.target.checked : options.includes(x))) })} /><span>{shell ? optionText(shell, o) : o}</span></label>)}
        </div></fieldset>
      </div>
    );
  }
  if (t.kind === "prepare") {
    const flasks = shell && shell.experiment.kind === "solutions" ? shell.experiment.flasks : [];
    return (
      <div className="clab-grid">
        <DecimalField label="التركيز المطلوب (mol/L)" value={t.concentration} disabled={disabled} onValue={v => set({ concentration: v })} />
        <label><span>الحجم (دورق)</span><select value={show(t.volume)} disabled={disabled} onChange={ev => set({ volume: Number(ev.target.value) })}>
          {!flasks.includes(t.volume as number) && <option value={show(t.volume)}>—</option>}{flasks.map(v => <option key={v} value={v}>{v} mL</option>)}</select></label>
      </div>
    );
  }
  const o = OBSERVATIONS[kind].find(x => x.id === t.requirement);
  return (
    <div className="clab-grid">
      <label><span>المتطلب</span><select value={show(t.requirement)} disabled={disabled} onChange={ev => {
        const no = OBSERVATIONS[kind].find(x => x.id === ev.target.value);
        if (no) set({ requirement: no.id, label: no.label, subject: no.needs.subject ? subjects(no.needs.subject)[0]?.id ?? null : null, count: no.needs.count ? 3 : null });
      }}>{OBSERVATIONS[kind].map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
      {o && ref("الكاشف", o.needs.subject, "subject")}
      {o?.needs.count && <label><span>العدد المطلوب (1–{CHEM_LAB_LIMITS.observeCountMax})</span><SmartSimDraftInput dir="ltr" inputMode="numeric" value={t.count} disabled={disabled} parse={asInt} onValue={v => set({ count: v })} /></label>}
    </div>
  );
}

// ── derived data (teacher only) ────────────────────────────────────────────────────────────────────────────────────────────────────────
function Derived({ e, tasks }: { e: ChemLabExperiment; tasks: Obj[] }) {
  const ctx = chemLabContext(e);
  if (e.kind === "solutions") {
    const x = ctx as SolutionsContext;
    const preps = tasks.filter(t => t.kind === "prepare" && typeof t.concentration === "string" && parseDecimal(t.concentration) && typeof t.volume === "number");
    return <>
      <p>للمعلم: الكتلة المولية <span className="chem-ltr">{toFixed(x.solute.molarMass, 3)} g/mol</span>{x.maxMass && <> · حد الميزان <span className="chem-ltr">{toFixed(x.maxMass, 2)} g</span></>} · حد النموذج <span className="chem-ltr">{toNumber(x.solute.maxConcentration)} mol/L</span></p>
      {preps.map(t => { const target = parseDecimal(t.concentration as string) as Q; return <p key={String(t.id)}>«{String(t.label)}»: {e.source === "solid"
        ? <>الكتلة اللازمة <span className="chem-ltr">{toFixed(requiredMass(x.solute, target, t.volume as number).exact, 4)} g</span> (على الميزان {toFixed(requiredMass(x.solute, target, t.volume as number).weighable, 2)} g)</>
        : <>الحجم اللازم من المحلول الأم <span className="chem-ltr">{x.stock ? toFixed(requiredAliquot(x.stock, target, t.volume as number), 2) : "—"} mL</span></>}</p>; })}
    </>;
  }
  if (e.kind === "ph") {
    const x = ctx as PhContext;
    return <p>للمعلم: {e.solutions.map(s => { const r = x.results[s.id]; return s.label + " → pH " + (r && r.ok ? formatPh(r.pH) : "—") + " (" + PH_CLASS_LABEL[phClassOf(x.species[s.id])] + ")"; }).join(" · ")}</p>;
  }
  if (e.kind === "titration") {
    const x = ctx as TitrationContext, s = x.setup;
    return <>
      <p>للمعلم: <span className="chem-ltr chem-formula">{s.equation}</span> · حجم التكافؤ <span className="chem-ltr">{toFixed(s.equivalenceML, 2)} mL</span> · تركيز المادة في الدورق <span className="chem-ltr">{sig(toNumber(s.ca), 4)} mol/L</span>{x.unknown && " (مشتق)"}</p>
      <ul className="clab-derived-list">{e.indicators.map(id => { const ind = indicatorById(id)!, p = indicatorEndpoint(s, ind), v = indicatorSuitability(s, ind); return (
        <li key={id}>{ind.nameAr}: نقطة النهاية <span className="chem-ltr">{p.volumeML.toFixed(2)} mL</span> (خطأ <span className="chem-ltr">{signed(p.errorML)} mL</span>) — {v === "suitable" ? "مناسب" : v === "unsuitable" ? "غير مناسب" : "حدّي (لا يُعرض في سؤال مقيَّم)"}</li>
      ); })}</ul>
    </>;
  }
  const x = ctx as RateContext;
  return <ul className="clab-derived-list">{e.trials.map(t => { const tr = x.trials[t.id]; return <li key={t.id}>{t.label}: <span className="chem-ltr">k = {sig(tr.k)}</span> · عمر النصف <span className="chem-ltr">{sig(halfLife(x.model.order, tr.k, tr.a0))} s</span> · السرعة الابتدائية <span className="chem-ltr">{sig(initialRate(x.model.order, tr.k, tr.a0))} mol/(L·s)</span></li>; })}</ul>;
}
