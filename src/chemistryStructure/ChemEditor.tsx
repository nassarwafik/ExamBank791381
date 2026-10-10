import { useState } from "react";
import type { SmartSimEditorProps } from "../trustedSim/smartSimUiRegistry";
import SmartSimDraftInput from "../trustedSim/SmartSimDraftInput";
import {
  CHEM_ACTIVITIES, CHEM_ACTIVITY_LABEL, CHEM_ACTIVITY_PROPERTIES, CHEM_LIMITS, CHEM_VALUE_UNITS, chemSelectableIds, validateChemConfig,
  type ChemActivity, type ChemConfigV1, type ChemSpecies
} from "../chemistryStructureModel";
import { CHEM_QUANTITIES, chemistryStructurePluginV1, chemClassification, expectedComposition, expectedValue, fmtChem, speciesParticles, speciesShells, CHEM_OPTION_LABEL, type ChemCheck } from "../chemistryStructurePlugin";
import { CHEM_ELEMENTS, chemElement, chemMassNumbers } from "../chemistry/elements";
import { hillFormula, parseFormula } from "../chemistry/formula";
import { MOLECULES, chemMolecule } from "../chemistry/molecules";
import { CHEM_PRESETS, glucosePreset, moleculePreset, sodiumIonPreset } from "./chemTemplates";
import ChemWorkspace from "./ChemWorkspace";
import "./chem.css";

// Phase 21D-D.1 — chemistryStructure@1 AUTHORING (lazy; structured, never raw JSON): the activity (each with classroom presets), the GIVEN
// subject, what the student may see (periodic table, live identity, details, measuring probe), the student's tasks, the PRIVATE weighted
// checks and the scoring mode. Expected values are never typed for derived checks: the editor shows the value the trusted core derives
// from the subject or from a private species. Anything invalid is reported by the host's canonical validator and blocks finalization.
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const show = (v: unknown) => (typeof v === "number" ? String(v) : typeof v === "string" ? v : "");
const omit = (o: Obj, keys: string[]): Obj => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
const nextId = (ids: string[], prefix: string) => { let n = ids.length + 1; while (ids.includes(prefix + n)) n++; return prefix + n; };
const KIND_LABEL: Readonly<Record<string, string>> = Object.freeze({
  "chem.particles": "بناء الذرة: عدد الجسيمات", "chem.shells": "توزيع الإلكترونات على الأغلفة", "chem.value": "قيمة مرجعية محسوبة", "chem.formula": "صيغة كيميائية (بالتركيب)",
  "chem.classification": "تصنيف محسوب", "setEquals@1": "مجموعة الاختيار مطابقة تمامًا", "objectSelected@1": "عنصر محدد مختار", "numericNear@1": "قيمة قريبة من قيمة يحددها المعلم"
});
const UNIT_TEXT: Readonly<Record<string, string>> = Object.freeze({ "1": "عدد (بلا وحدة)", "g/mol": "g/mol", "%": "%", pm: "pm", "°": "° (درجة)" });
const PARTICLE_LABEL: Readonly<Record<string, string>> = Object.freeze({ protons: "البروتونات", neutrons: "النيوترونات", electrons: "الإلكترونات" });
const DEFAULT_SPECIES: ChemSpecies = { element: "Na", massNumber: 23, charge: 0 };
const ionLabel = (q: number) => (q === 0 ? "0 (متعادل)" : (q > 0 ? "+" : "−") + Math.abs(q));

function SpeciesFields({ value, onValue, disabled, testId }: { value: Obj; onValue: (s: ChemSpecies) => void; disabled?: boolean; testId: string }) {
  const e = chemElement(value.element) ?? chemElement("Na")!;
  const masses = chemMassNumbers(e), charges = [0, ...e.ions];
  const cur = { element: e.symbol, massNumber: typeof value.massNumber === "number" ? value.massNumber : masses[0], charge: typeof value.charge === "number" ? value.charge : 0 };
  return (
    <span className="chem-inline" data-testid={testId}>
      <label><span>العنصر</span><select value={e.symbol} disabled={disabled} onChange={ev => { const n = chemElement(ev.target.value)!; onValue({ element: n.symbol, massNumber: n.isotopes[0], charge: 0 }); }}>
        {CHEM_ELEMENTS.map(x => <option key={x.symbol} value={x.symbol}>{x.symbol} — {x.nameAr} ({x.z})</option>)}</select></label>
      <label><span>العدد الكتلي</span><select value={cur.massNumber} disabled={disabled} onChange={ev => onValue({ ...cur, massNumber: Number(ev.target.value) })}>
        {masses.map(a => <option key={a} value={a}>{a}{e.radioisotopes.includes(a) ? " (مشع)" : ""}</option>)}</select></label>
      <label><span>الشحنة</span><select value={cur.charge} disabled={disabled} onChange={ev => onValue({ ...cur, charge: Number(ev.target.value) })}>
        {charges.map(q => <option key={q} value={q}>{ionLabel(q)}</option>)}</select></label>
    </span>
  );
}

export default function ChemEditor({ config, checks, scoring, onChange, disabled }: SmartSimEditorProps) {
  const c = isObj(config) ? config : {};
  const activity: ChemActivity = (CHEM_ACTIVITIES as readonly string[]).includes(String(c.activity)) ? (c.activity as ChemActivity) : "atom";
  const view = isObj(c.view) ? c.view : {}, tasks = isObj(c.tasks) ? c.tasks : {};
  const values = (Array.isArray(tasks.values) ? tasks.values : []).filter(isObj), formulas = (Array.isArray(tasks.formulas) ? tasks.formulas : []).filter(isObj);
  const classes = (Array.isArray(tasks.classifications) ? tasks.classifications : []).filter(isObj);
  const selection = isObj(tasks.selection) ? tasks.selection : null;
  const subject = c.subject === null ? null : isObj(c.subject) ? c.subject : null;
  const list = checks.filter(isObj);
  const [preview, setPreview] = useState(0);
  const valid = validateChemConfig(config);
  const cfg: ChemConfigV1 | null = valid.ok ? valid.config : null;
  const setConfig = (next: Obj) => onChange({ config: { v: 1, activity, subject: c.subject ?? null, view, tasks, ...next } });
  const setTasks = (patch: Obj) => setConfig({ tasks: { build: false, shells: false, values, formulas, classifications: classes, selection, ...tasks, ...patch } });
  const setCheck = (i: number, patch: Obj) => onChange({ checks: list.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const applyPreset = (make: () => { config: unknown; checks: unknown[] }) => { const p = make(); onChange({ config: p.config, checks: p.checks, scoring: "proportional" }); };
  const taskIds = [...values, ...formulas, ...classes].map(t => String(t.id));
  const used = (id: string) => list.some(k => k.valueId === id || k.formulaId === id || k.taskId === id);
  const selectable = cfg ? chemSelectableIds(cfg) : [];
  const composition = (() => { if (activity === "molecule") { const m = chemMolecule(subject?.molecule); return m ? [...new Set(m.atoms.map(a => a.element))] : []; } if (activity === "formula") { const p = parseFormula(subject?.formula); return p.ok ? Object.keys(p.composition) : []; } return []; })();
  const molecule = activity === "molecule" ? chemMolecule(subject?.molecule) : undefined;
  // the teacher's formula TEXT while typing; re-derived when the stored subject changes from elsewhere (a preset, undo)
  const [formulaEdit, setFormulaEdit] = useState({ draft: show(subject?.formula), sent: show(subject?.formula) });
  if (show(subject?.formula) !== formulaEdit.sent) setFormulaEdit({ draft: show(subject?.formula), sent: show(subject?.formula) });
  const formulaDraft = formulaEdit.draft;
  const formulaParse = activity === "formula" ? parseFormula(formulaDraft) : null;
  const kinds = [...(tasks.build ? ["chem.particles"] : []), ...(tasks.shells ? ["chem.shells"] : []), ...(values.length ? ["chem.value", "numericNear@1"] : []), ...(formulas.length ? ["chem.formula"] : []),
    ...(classes.length ? ["chem.classification"] : []), ...(selection ? ["setEquals@1", "objectSelected@1"] : [])];
  const checkFor = (kind: string, id: string): Obj => {
    const base = { id, label: KIND_LABEL[kind], weight: 1, kind };
    const priv = activity === "atom" && !subject ? { species: { ...DEFAULT_SPECIES } } : {};
    switch (kind) {
      case "chem.particles": return { ...base, particles: ["protons", "neutrons", "electrons"], ...priv };
      case "chem.shells": return { ...base, ...priv };
      case "chem.value": { const t = values[0], q = CHEM_QUANTITIES.find(x => x.activities.includes(activity) && x.unit === t?.unit) ?? CHEM_QUANTITIES.find(x => x.activities.includes(activity))!;
        return { ...base, valueId: String(t?.id ?? ""), quantity: q.id, tolerance: 0, ...(q.needs === "element" ? { element: composition[0] ?? "H" } : {}), ...(q.needs && q.needs !== "element" ? { parameter: molecule?.params.find(p => p.kind === q.needs)?.id ?? "" } : {}), ...priv }; }
      case "chem.formula": return { ...base, formulaId: String(formulas[0]?.id ?? ""), target: "molecular", ...(activity === "atom" ? { formula: "H2O" } : {}) };
      case "chem.classification": return { ...base, taskId: String(classes[0]?.id ?? ""), ...priv };
      case "setEquals@1": return { ...base, expectedIds: selectable.slice(0, 1) };
      case "objectSelected@1": return { ...base, objectId: selectable[0] ?? "" };
      default: return { ...base, valueId: String(values[0]?.id ?? ""), expected: 0, tolerance: 0.1 };
    }
  };
  /** what the trusted core derives for a check (teacher only). */
  const expectedText = (k: Obj): string => {
    if (!cfg) return "أصلح إعداد النشاط لعرض القيمة المتوقعة.";
    if (!String(k.kind).startsWith("chem.")) return "";
    const r = chemistryStructurePluginV1.validateCheck(k, cfg);
    if (!r.ok) return r.issues[0]?.message ?? "فحص غير صالح.";
    const chk = r.check as ChemCheck, sp = (chk.species as ChemSpecies | undefined) ?? (cfg.subject && "element" in cfg.subject ? cfg.subject : null);
    switch (chk.kind) {
      case "chem.particles": { const p = speciesParticles(sp!); return (chk.particles as string[]).map(x => PARTICLE_LABEL[x] + " = " + p[x as keyof typeof p]).join("، "); }
      case "chem.shells": return speciesShells(sp!).join("، ") || "لا إلكترونات";
      case "chem.value": return fmtChem(expectedValue(chk, cfg)) + " ± " + fmtChem(chk.tolerance as number);
      case "chem.formula": { const w = expectedComposition(chk, cfg); return w ? hillFormula(w) : "—"; }
      case "chem.classification": { const t = cfg.tasks.classifications.find(x => x.id === chk.taskId); const v = t ? chemClassification(cfg, t.property, chk.species as ChemSpecies | undefined) : null; return v ? CHEM_OPTION_LABEL[v] ?? v : "—"; }
    }
    return "";
  };
  return (
    <div className="chem-editor" data-testid="chem-editor" dir="rtl">
      <fieldset>
        <legend>النشاط والقوالب الصفية</legend>
        <label><span>نوع النشاط</span>
          <select value={activity} disabled={disabled} data-testid="chem-activity" onChange={e => applyPreset(e.target.value === "molecule" ? () => moleculePreset("water") : e.target.value === "formula" ? glucosePreset : sodiumIonPreset)}>
            {CHEM_ACTIVITIES.map(a => <option key={a} value={a}>{CHEM_ACTIVITY_LABEL[a]}</option>)}
          </select>
        </label>
        <label><span>تطبيق قالب صفي كامل (الإعداد والمهام والفحوص)</span>
          <select value="" disabled={disabled} data-testid="chem-preset" onChange={e => { const p = CHEM_PRESETS[e.target.value]; if (p) applyPreset(p.make); }}>
            <option value="">— اختر قالبًا —</option>
            {Object.entries(CHEM_PRESETS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
          </select>
        </label>
        <p className="chem-note">تغيير نوع النشاط يحمّل قالبه كاملًا ثم يمكنك تعديله. المعطى ظاهر للطالب دائمًا؛ ضع الهدف السري في الفحوص الخاصة.</p>
      </fieldset>
      <fieldset>
        <legend>المعطى للطالب</legend>
        {activity === "atom" && <>
          <label className="chem-inline"><input type="checkbox" checked={!!subject} disabled={disabled} data-testid="chem-subject-toggle" onChange={e => setConfig({ subject: e.target.checked ? { ...DEFAULT_SPECIES } : null })} /><span>نوع كيميائي معطى (ذرة أو أيون يظهر للطالب)</span></label>
          {subject && <SpeciesFields value={subject} disabled={disabled} testId="chem-subject" onValue={s => setConfig({ subject: s })} />}
        </>}
        {activity === "molecule" && <div className="chem-row">
          <label><span>الجزيء</span><select value={show(subject?.molecule)} disabled={disabled} data-testid="chem-molecule-select" onChange={e => setConfig({ subject: { molecule: e.target.value } })}>
            {MOLECULES.map(m => <option key={m.id} value={m.id}>{m.nameAr} ({m.formula})</option>)}</select></label>
          <button type="button" className="is-secondary" disabled={disabled} onClick={() => applyPreset(() => moleculePreset(show(subject?.molecule)))}>تطبيق قالب هذا الجزيء</button>
        </div>}
        {activity === "formula" && <label><span>الصيغة الكيميائية (مثل CuSO4·5H2O)</span>
          <input dir="ltr" value={formulaDraft} maxLength={64} disabled={disabled} data-testid="chem-formula-input" onChange={e => { const p = parseFormula(e.target.value), stored = p.ok ? p.text : e.target.value; setFormulaEdit({ draft: e.target.value, sent: stored }); setConfig({ subject: { formula: stored } }); }} />
          <small className={formulaParse && !formulaParse.ok ? "chem-error" : "chem-note"}>{formulaParse ? (formulaParse.ok ? "صيغة صالحة: " + hillFormula(formulaParse.composition) + " (ترتيب هيل)" : formulaParse.message) : ""}</small>
        </label>}
      </fieldset>
      <fieldset>
        <legend>ما يُسمح للطالب برؤيته</legend>
        <label><span>الجدول الدوري</span><select value={show(view.periodicTable) || "hidden"} disabled={disabled} onChange={e => setConfig({ view: { ...view, periodicTable: e.target.value } })}>
          <option value="hidden">مخفي</option><option value="basic">أساسي (الرمز والعدد الذري والاسم)</option><option value="detailed">مفصّل (+ الكتلة الذرية والمجموعة والدورة والتصنيف والفئة)</option></select></label>
        <label className="chem-inline"><input type="checkbox" checked={view.identity === true} disabled={disabled} onChange={e => setConfig({ view: { ...view, identity: e.target.checked } })} />
          <span>{activity === "atom" ? "إظهار هوية الذرة التي يبنيها الطالب أثناء البناء (يكشف الإجابة)" : activity === "molecule" ? "إظهار اسم الجزيء وصيغته" : "إظهار الهوية"}</span></label>
        <label className="chem-inline"><input type="checkbox" checked={view.details === true} disabled={disabled} onChange={e => setConfig({ view: { ...view, details: e.target.checked } })} />
          <span>{activity === "atom" ? "إظهار التوزيع الإلكتروني للمعطى" : activity === "molecule" ? "إظهار الشكل والقطبية والأزواج غير الرابطة وجدول التركيب (يكشف إجابات التصنيف)" : "إظهار جدول التركيب والكتلة المولية (يكشف الإجابة)"}</span></label>
        {activity === "molecule" && <label className="chem-inline"><input type="checkbox" checked={view.measure === true} disabled={disabled} onChange={e => setConfig({ view: { ...view, measure: e.target.checked } })} /><span>أداة قياس المسافات والزوايا</span></label>}
      </fieldset>
      <fieldset>
        <legend>مهام الطالب</legend>
        {activity === "atom" && <div className="chem-row">
          <label className="chem-inline"><input type="checkbox" checked={tasks.build === true} disabled={disabled} data-testid="chem-task-build" onChange={e => setTasks({ build: e.target.checked })} /><span>بناء الذرة أو الأيون (البروتونات والنيوترونات والإلكترونات)</span></label>
          <label className="chem-inline"><input type="checkbox" checked={tasks.shells === true} disabled={disabled} onChange={e => setTasks({ shells: e.target.checked })} /><span>توزيع الإلكترونات على الأغلفة</span></label>
        </div>}
        <ul aria-label="مهام القيم">
          {values.map((t, i) => <li key={String(t.id) + i}>
            <label><span>وصف القيمة {i + 1}</span><input value={show(t.label)} maxLength={CHEM_LIMITS.labelChars} disabled={disabled} onChange={e => setTasks({ values: values.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} /></label>
            <label><span>الوحدة</span><select value={show(t.unit)} disabled={disabled} onChange={e => setTasks({ values: values.map((x, k) => (k === i ? { ...x, unit: e.target.value } : x)) })}>{CHEM_VALUE_UNITS.map(u => <option key={u} value={u}>{UNIT_TEXT[u]}</option>)}</select></label>
            <button type="button" className="is-secondary" disabled={disabled || used(String(t.id))} title={used(String(t.id)) ? "يستخدمه فحص؛ احذف الفحص أولًا" : undefined} onClick={() => setTasks({ values: values.filter((_, k) => k !== i) })}>حذف</button>
          </li>)}
          {formulas.map((t, i) => <li key={String(t.id) + i}>
            <label><span>وصف مهمة الصيغة {i + 1}</span><input value={show(t.label)} maxLength={CHEM_LIMITS.labelChars} disabled={disabled} onChange={e => setTasks({ formulas: formulas.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} /></label>
            <button type="button" className="is-secondary" disabled={disabled || used(String(t.id))} onClick={() => setTasks({ formulas: formulas.filter((_, k) => k !== i) })}>حذف</button>
          </li>)}
          {classes.map((t, i) => <li key={String(t.id) + i}>
            <label><span>وصف التصنيف {i + 1}</span><input value={show(t.label)} maxLength={CHEM_LIMITS.labelChars} disabled={disabled} onChange={e => setTasks({ classifications: classes.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} /></label>
            <label><span>الخاصية</span><select value={show(t.property)} disabled={disabled} onChange={e => setTasks({ classifications: classes.map((x, k) => (k === i ? { ...x, property: e.target.value } : x)) })}>
              {CHEM_ACTIVITY_PROPERTIES[activity].map(p => <option key={p} value={p}>{({ block: "الفئة (s / p / d)", category: "التصنيف في الجدول", metalClass: "فلز / شبه فلز / لافلز", ionType: "نوع النوع الكيميائي (موجب / سالب / متعادل)", shape: "الشكل الهندسي (VSEPR)", polarity: "القطبية" } as Record<string, string>)[p]}</option>)}</select></label>
            <button type="button" className="is-secondary" disabled={disabled || used(String(t.id))} onClick={() => setTasks({ classifications: classes.filter((_, k) => k !== i) })}>حذف</button>
          </li>)}
        </ul>
        <div className="chem-row">
          <button type="button" className="is-secondary" disabled={disabled || values.length >= CHEM_LIMITS.values} onClick={() => setTasks({ values: [...values, { id: nextId(taskIds, "v"), label: "قيمة جديدة", unit: "1" }] })}>+ قيمة</button>
          <button type="button" className="is-secondary" disabled={disabled || formulas.length >= CHEM_LIMITS.formulas} onClick={() => setTasks({ formulas: [...formulas, { id: nextId(taskIds, "f"), label: "اكتب الصيغة" }] })}>+ صيغة</button>
          {CHEM_ACTIVITY_PROPERTIES[activity].length > 0 && <button type="button" className="is-secondary" disabled={disabled || classes.length >= CHEM_LIMITS.classifications} onClick={() => setTasks({ classifications: [...classes, { id: nextId(taskIds, "c"), label: "صنّف", property: CHEM_ACTIVITY_PROPERTIES[activity][0] }] })}>+ تصنيف</button>}
        </div>
        <label className="chem-inline"><input type="checkbox" checked={!!selection} disabled={disabled} data-testid="chem-task-selection" onChange={e => setTasks({ selection: e.target.checked ? { label: activity === "molecule" ? "حدّد الذرات المطلوبة" : "حدّد العنصر في الجدول", target: activity === "molecule" ? "atoms" : "elements", max: 1 } : null })} /><span>مهمة اختيار ({activity === "molecule" ? "ذرات أو روابط في الجزيء" : "عناصر في الجدول الدوري"})</span></label>
        {selection && <div className="chem-row">
          <label><span>نص المهمة</span><input value={show(selection.label)} maxLength={CHEM_LIMITS.labelChars} disabled={disabled} onChange={e => setTasks({ selection: { ...selection, label: e.target.value } })} /></label>
          {activity === "molecule" && <label><span>الهدف</span><select value={show(selection.target)} disabled={disabled} onChange={e => setTasks({ selection: { ...selection, target: e.target.value } })}><option value="atoms">الذرات</option><option value="bonds">الروابط</option></select></label>}
          <label><span>أقصى عدد للاختيار</span><SmartSimDraftInput dir="ltr" inputMode="numeric" value={selection.max} disabled={disabled} onValue={v => setTasks({ selection: { ...selection, max: v } })} /></label>
        </div>}
      </fieldset>
      <fieldset>
        <legend>الفحوص الخاصة (لا تصل إلى الطالب)</legend>
        <label><span>طريقة احتساب العلامة</span>
          <select value={scoring === "allOrNothing" ? "allOrNothing" : "proportional"} disabled={disabled} onChange={e => onChange({ scoring: e.target.value })}>
            <option value="proportional">جزئية حسب الأوزان</option><option value="allOrNothing">كل شيء أو لا شيء</option>
          </select>
        </label>
        <ul aria-label="الفحوص">
          {list.map((k, i) => {
            const kind = String(k.kind), q = CHEM_QUANTITIES.find(x => x.id === k.quantity), unit = values.find(t => t.id === k.valueId)?.unit;
            const species = isObj(k.species) ? k.species : null;
            return (
              <li key={String(k.id) + i} data-testid="chem-check">
                <label><span>نوع الفحص {i + 1}</span><select value={kind} disabled={disabled} onChange={e => onChange({ checks: list.map((x, j) => (j === i ? checkFor(e.target.value, String(x.id)) : x)) })}>
                  {[...new Set([kind, ...kinds])].map(o => <option key={o} value={o}>{KIND_LABEL[o] ?? o}</option>)}</select></label>
                <label><span>الوصف</span><input value={show(k.label)} disabled={disabled} onChange={e => setCheck(i, { label: e.target.value })} /></label>
                {kind === "chem.particles" && <span className="chem-inline">{["protons", "neutrons", "electrons"].map(p => { const ps = Array.isArray(k.particles) ? (k.particles as string[]) : []; return <label key={p} className="chem-inline"><input type="checkbox" checked={ps.includes(p)} disabled={disabled} onChange={e => setCheck(i, { particles: e.target.checked ? [...ps, p] : ps.filter(x => x !== p) })} />{PARTICLE_LABEL[p]}</label>; })}</span>}
                {(kind === "chem.value" || kind === "numericNear@1") && <label><span>مهمة القيمة</span><select value={show(k.valueId)} disabled={disabled} onChange={e => setCheck(i, { valueId: e.target.value })}>{values.map(t => <option key={String(t.id)} value={String(t.id)}>{String(t.label)}</option>)}</select></label>}
                {kind === "chem.value" && <label><span>الكمية المرجعية</span><select value={show(k.quantity)} disabled={disabled} onChange={e => { const nq = CHEM_QUANTITIES.find(x => x.id === e.target.value)!; const rest = omit(k, ["element", "parameter"]); onChange({ checks: list.map((x, j) => (j === i ? { ...rest, quantity: nq.id, ...(nq.needs === "element" ? { element: composition[0] ?? "H" } : {}), ...(nq.needs && nq.needs !== "element" ? { parameter: molecule?.params.find(p => p.kind === nq.needs)?.id ?? "" } : {}) } : x)) }); }}>
                  {CHEM_QUANTITIES.filter(x => x.activities.includes(activity) && (!unit || x.unit === unit)).map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>}
                {kind === "chem.value" && q?.needs === "element" && <label><span>العنصر</span><select value={show(k.element)} disabled={disabled} onChange={e => setCheck(i, { element: e.target.value })}>{composition.map(s => <option key={s} value={s}>{s} — {chemElement(s)?.nameAr}</option>)}</select></label>}
                {kind === "chem.value" && q?.needs && q.needs !== "element" && <label><span>{q.needs === "angle" ? "الزاوية" : "الرابطة"}</span><select value={show(k.parameter)} disabled={disabled} onChange={e => setCheck(i, { parameter: e.target.value })}>{molecule?.params.filter(p => p.kind === q.needs).map(p => <option key={p.id} value={p.id}>{p.atoms.join("–")} ({p.value}{p.kind === "angle" ? "°" : " pm"})</option>)}</select></label>}
                {kind === "chem.formula" && <>
                  <label><span>مهمة الصيغة</span><select value={show(k.formulaId)} disabled={disabled} onChange={e => setCheck(i, { formulaId: e.target.value })}>{formulas.map(t => <option key={String(t.id)} value={String(t.id)}>{String(t.label)}</option>)}</select></label>
                  <label><span>الصيغة المتوقعة</span><select value={show(k.target)} disabled={disabled} onChange={e => setCheck(i, { target: e.target.value })}><option value="molecular">الجزيئية (التركيب نفسه)</option><option value="empirical">الأولية (أبسط نسبة)</option></select></label>
                  <label><span>صيغة مرجعية خاصة (اختياري؛ فارغ = صيغة المعطى)</span><input dir="ltr" value={show(k.formula)} disabled={disabled} onChange={e => { const p = parseFormula(e.target.value); const rest = omit(k, ["formula"]); onChange({ checks: list.map((x, j) => (j === i ? (e.target.value.trim() ? { ...rest, formula: p.ok ? p.text : e.target.value } : rest) : x)) }); }} /></label>
                </>}
                {kind === "chem.classification" && <label><span>مهمة التصنيف</span><select value={show(k.taskId)} disabled={disabled} onChange={e => setCheck(i, { taskId: e.target.value })}>{classes.map(t => <option key={String(t.id)} value={String(t.id)}>{String(t.label)}</option>)}</select></label>}
                {activity === "atom" && ["chem.particles", "chem.shells", "chem.value", "chem.classification"].includes(kind) && <>
                  <label className="chem-inline"><input type="checkbox" checked={!!species} disabled={disabled} data-testid="chem-check-private" onChange={e => { const rest = omit(k, ["species"]); onChange({ checks: list.map((x, j) => (j === i ? (e.target.checked ? { ...rest, species: { ...DEFAULT_SPECIES } } : rest) : x)) }); }} /><span>نوع كيميائي خاص بهذا الفحص (لا يراه الطالب){subject ? "" : " — مطلوب لأن السؤال بلا معطى"}</span></label>
                  {species && <SpeciesFields value={species} disabled={disabled} testId="chem-check-species" onValue={s => setCheck(i, { species: s })} />}
                </>}
                {kind === "setEquals@1" && <fieldset className="chem-inline" aria-label="العناصر المتوقعة"><legend>المتوقع اختياره</legend>{selectable.map(id => { const ids = Array.isArray(k.expectedIds) ? (k.expectedIds as string[]) : []; return <label key={id} className="chem-inline"><input type="checkbox" checked={ids.includes(id)} disabled={disabled} onChange={e => setCheck(i, { expectedIds: e.target.checked ? [...ids, id] : ids.filter(x => x !== id) })} />{id}</label>; })}</fieldset>}
                {kind === "objectSelected@1" && <label><span>العنصر المتوقع اختياره</span><select value={show(k.objectId)} disabled={disabled} onChange={e => setCheck(i, { objectId: e.target.value })}>{selectable.map(id => <option key={id} value={id}>{id}</option>)}</select></label>}
                {kind === "numericNear@1" && <label><span>القيمة المتوقعة</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={k.expected} disabled={disabled} onValue={v => setCheck(i, { expected: v })} /></label>}
                {(kind === "chem.value" || kind === "numericNear@1") && <label><span>السماحية ±</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={k.tolerance} disabled={disabled} onValue={v => setCheck(i, { tolerance: v })} /></label>}
                <label><span>الوزن</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={k.weight} disabled={disabled} onValue={v => setCheck(i, { weight: v })} /></label>
                {kind.startsWith("chem.") && <p className="chem-expected" data-testid="chem-check-expected">المتوقع (محسوب من البيانات الموثوقة): <span className="chem-ltr">{expectedText(k)}</span></p>}
                <button type="button" className="is-secondary" disabled={disabled} onClick={() => onChange({ checks: list.filter((_, j) => j !== i) })}>حذف الفحص</button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="is-secondary" disabled={disabled || kinds.length === 0} onClick={() => onChange({ checks: [...list, checkFor(kinds[0], nextId(list.map(k => String(k.id)), "check-"))] })}>+ فحص</button>
      </fieldset>
      <details className="chem-preview" data-testid="chem-preview" onToggle={e => { if ((e.target as HTMLDetailsElement).open) setPreview(n => n + 1); }}>
        <summary>معاينة ما يراه الطالب (لا تُحفظ)</summary>
        {!valid.ok ? <p className="chem-note">أصلح الإعداد لعرض المعاينة: {valid.issues[0]?.message}</p> : preview > 0 ? <PreviewHost key={preview} config={valid.config} /> : null}
      </details>
    </div>
  );
}
function PreviewHost({ config }: { config: unknown }) {
  const [actions, setActions] = useState<unknown[]>([]);
  return <ChemWorkspace config={config} actions={actions} onChange={a => setActions(a)} label="معاينة" preview />;
}
