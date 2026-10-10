import { useMemo, useState } from "react";
import type { SmartSimWorkspaceProps } from "../trustedSim/smartSimUiRegistry";
import { CHEM_ACTIVITY_LABEL, CHEM_LIMITS, CHEM_PROPERTY_OPTIONS, validateChemConfig, type ChemConfigV1, type ChemSpecies, type ChemValueTask } from "../chemistryStructureModel";
import { CHEM_OPTION_LABEL, fmtChem, type ChemStateV1 } from "../chemistryStructurePlugin";
import { resolveSmartSimPlugin } from "../trustedSimPlugins";
import { replaySmartSimActions } from "../trustedSimQuestion";
import { parseNumberInput } from "../trustedSim/smartSimNumberInput";
import { CHEM_WEIGHT_SCALE, chemElement } from "../chemistry/elements";
import { formatConfiguration, shellsOf, speciesConfiguration, chemShellLetter } from "../chemistry/electrons";
import { displayFormula, hillOrder, molarMassScaled, parseFormula, type FormulaComposition } from "../chemistry/formula";
import { MOLECULE_POLARITY_LABEL, MOLECULE_SHAPE_LABEL, chemMolecule, moleculeComposition } from "../chemistry/molecules";
import AtomModel from "./AtomModel";
import MoleculeView3D from "./MoleculeView3D";
import PeriodicTable from "./PeriodicTable";
import { builtSpecies, chargeText } from "./chemView";
import "./chem.css";

// Phase 21D-D.1 — the chemistryStructure@1 STUDENT workspace (lazy; also the teacher preview). It renders ONLY the canonical public config.
//   * Answers: explicit save / clear / choose decisions become SEMANTIC actions, replayed through the registered plugin (the code the server
//     uses) — the particle counters, shell counters, number and formula inputs are drafts until the student saves them.
//   * Presentation (never recorded): rotating / zooming / labelling / measuring the molecule, browsing the periodic table, the live identity
//     of the atom being built (only when the teacher allows it), the subject's details (only when the teacher allows them).
const replayState = (cfg: ChemConfigV1, actions: readonly unknown[]): { ok: true; state: ChemStateV1 } | { ok: false } => {
  const plugin = resolveSmartSimPlugin("chemistryStructure", 1), r = plugin ? replaySmartSimActions(plugin, cfg, actions) : null;
  return r && r.ok ? { ok: true, state: r.state as ChemStateV1 } : { ok: false };
};
type Act = { type?: string; valueId?: string; formulaId?: string; taskId?: string; objectId?: string };
const targetOf = (a: unknown): string => {
  const x = (a && typeof a === "object" ? a : {}) as Act, t = x.type ?? "";
  if (t.startsWith("particles.")) return "particles";
  if (t.startsWith("shells.")) return "shells";
  return t.split(".")[0] + ":" + (x.valueId ?? x.formulaId ?? x.taskId ?? x.objectId ?? "");
};
const UNIT_LABEL: Readonly<Record<string, string>> = Object.freeze({ "1": "", "g/mol": "g/mol", "%": "%", pm: "pm", "°": "°" });
const EMPTY: ChemStateV1 = { v: 1, particles: null, shells: null, values: {}, formulas: {}, classifications: {}, selected: [] };

export function Nuclide({ s }: { s: ChemSpecies }) {
  const e = chemElement(s.element);
  return <span className="chem-nuclide" dir="ltr" data-testid="chem-nuclide"><span className="chem-nuclide-az"><sup>{s.massNumber}</sup><sub>{e?.z}</sub></span>{s.element}{s.charge !== 0 && <sup>{chargeText(s.charge)}</sup>}</span>;
}
function Counter({ label, value, min, max, disabled, onValue, testId }: { label: string; value: number; min: number; max: number; disabled?: boolean; onValue: (n: number) => void; testId: string }) {
  return (
    <div className="chem-counter" data-testid={testId}>
      <span>{label}</span>
      <button type="button" aria-label={"إنقاص " + label} disabled={disabled || value <= min} onClick={() => onValue(value - 1)}>−</button>
      <input type="number" inputMode="numeric" dir="ltr" min={min} max={max} value={value} disabled={disabled} aria-label={label}
        onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= min && n <= max) onValue(n); }} />
      <button type="button" aria-label={"زيادة " + label} disabled={disabled || value >= max} onClick={() => onValue(value + 1)}>+</button>
    </div>
  );
}
function ValueTask({ task, saved, disabled, onSave, onClear }: { task: ChemValueTask; saved: number | undefined; disabled?: boolean; onSave: (v: number) => void; onClear: () => void }) {
  const [draft, setDraft] = useState(saved === undefined ? "" : String(saved));
  const [error, setError] = useState("");
  const unit = UNIT_LABEL[task.unit];
  const save = () => { const v = parseNumberInput(draft); if (v === undefined) { setError("أدخل رقمًا صالحًا (مثل 18.015)."); return; } setError(""); onSave(v); };
  return (
    <fieldset className="chem-task" data-testid="chem-value" data-id={task.id}>
      <legend>{task.label}{unit && <> <span className="chem-ltr">({unit})</span></>}</legend>
      <div className="chem-row">
        <input type="text" inputMode="decimal" dir="ltr" autoComplete="off" spellCheck={false} aria-label={task.label} value={draft} disabled={disabled}
          onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (!disabled) save(); } }} />
        {!disabled && <><button type="button" onClick={save}>حفظ القيمة</button><button type="button" className="is-secondary" onClick={onClear} disabled={saved === undefined}>مسح</button></>}
      </div>
      {error && <p className="chem-error" role="alert">{error}</p>}
      <p className="chem-saved">{saved === undefined ? "لم تُحفظ بعد." : <>المحفوظ: <span className="chem-ltr">{fmtChem(saved)} {unit}</span></>}</p>
    </fieldset>
  );
}
function FormulaTask({ task, saved, disabled, onSave, onClear }: { task: { id: string; label: string }; saved: string | undefined; disabled?: boolean; onSave: (t: string) => void; onClear: () => void }) {
  const [draft, setDraft] = useState(saved ?? "");
  const parsed = draft.trim() ? parseFormula(draft) : null;
  return (
    <fieldset className="chem-task" data-testid="chem-formula-task" data-id={task.id}>
      <legend>{task.label}</legend>
      <div className="chem-row">
        <input type="text" dir="ltr" autoComplete="off" spellCheck={false} aria-label={task.label} value={draft} disabled={disabled} maxLength={64} placeholder="مثل H2O أو Ca(OH)2"
          onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && parsed?.ok && !disabled) { e.preventDefault(); onSave(parsed.text); } }} />
        {!disabled && <><button type="button" disabled={!parsed?.ok} onClick={() => parsed?.ok && onSave(parsed.text)}>حفظ الصيغة</button><button type="button" className="is-secondary" onClick={onClear} disabled={saved === undefined}>مسح</button></>}
      </div>
      <p className={parsed && !parsed.ok ? "chem-error" : "chem-note"} role={parsed && !parsed.ok ? "alert" : undefined}>
        {!parsed ? "اكتب الرموز بحروفها الصحيحة (Na وليس na) والأعداد بعد الرمز؛ مثال: CuSO4·5H2O." : parsed.ok ? <>تُقرأ: <span className="chem-ltr chem-formula">{displayFormula(parsed.text)}</span></> : parsed.message}
      </p>
      <p className="chem-saved">{saved === undefined ? "لم تُحفظ بعد." : <>المحفوظ: <span className="chem-ltr chem-formula">{displayFormula(saved)}</span></>}</p>
    </fieldset>
  );
}
function CompositionTable({ comp }: { comp: FormulaComposition }) {
  const total = molarMassScaled(comp) / CHEM_WEIGHT_SCALE;
  return (
    <table className="chem-table" data-testid="chem-composition">
      <caption>تركيب وحدة الصيغة (الكتل الذرية: CIAAW 2024)</caption>
      <thead><tr><th scope="col">العنصر</th><th scope="col">عدد الذرات</th><th scope="col">الكتلة الذرية</th><th scope="col">المساهمة (g/mol)</th></tr></thead>
      <tbody>{hillOrder(comp).map(k => { const e = chemElement(k)!; return <tr key={k}><td>{e.nameAr} <span className="chem-ltr">{k}</span></td><td className="chem-ltr">{comp[k]}</td><td className="chem-ltr">{e.weightText}</td><td className="chem-ltr">{fmtChem(comp[k] * e.weightScaled / CHEM_WEIGHT_SCALE)}</td></tr>; })}</tbody>
      <tfoot><tr><th scope="row" colSpan={3}>الكتلة المولية</th><td className="chem-ltr">{fmtChem(total)} g/mol</td></tr></tfoot>
    </table>
  );
}

export default function ChemWorkspace({ config: rawConfig, actions, onChange, disabled, label }: SmartSimWorkspaceProps) {
  const cfg = useMemo<ChemConfigV1 | null>(() => { const r = validateChemConfig(rawConfig); return r.ok ? r.config : null; }, [rawConfig]);
  const replay = useMemo(() => (cfg ? replayState(cfg, actions) : null), [cfg, actions]);
  const state: ChemStateV1 = replay && replay.ok ? replay.state : EMPTY;
  const [build, setBuild] = useState(() => state.particles ?? { protons: 0, neutrons: 0, electrons: 0 });
  const [shellDraft, setShellDraft] = useState<number[]>(() => [0, 1, 2, 3].map(i => state.shells?.[i] ?? 0));
  const [confirm, setConfirm] = useState(false);
  if (!cfg) return <p className="ncli-unavailable" role="note" data-testid="chem-unavailable">إعداد محاكاة الكيمياء لهذا السؤال غير متوفر في هذا الإصدار.</p>;
  const base = replay && replay.ok ? [...actions] : [];
  const emit = (next: unknown[]) => { const r = replayState(cfg, next); if (r.ok) onChange(next, r.state); };
  const decide = (target: string, action: Record<string, unknown> | null) => emit([...base.filter(a => targetOf(a) !== target), ...(action ? [action] : [])]);
  const sel = cfg.tasks.selection;
  const toggle = (id: string) => {
    if (!sel || disabled) return;
    const on = state.selected.includes(id);
    if (on) return decide("object:" + id, null);
    // a single choice replaces the previous one; a multiple choice never exceeds the task's max (the server refuses it anyway)
    const kept = sel.max === 1 ? base.filter(a => !targetOf(a).startsWith("object:")) : base;
    if (sel.max > 1 && state.selected.length >= sel.max) return;
    emit([...kept.filter(a => targetOf(a) !== "object:" + id), { type: "object.select", objectId: id }]);
  };
  const subject = cfg.subject;
  const species = subject && "element" in subject ? subject : null;
  const molecule = subject && "molecule" in subject ? chemMolecule(subject.molecule) : undefined;
  const formula = subject && "formula" in subject ? subject.formula : undefined;
  const built = builtSpecies(build.protons, build.neutrons, build.electrons);
  const L = CHEM_LIMITS;
  const savedShells = state.shells;
  // what the atom diagram draws: the student's shell draft (shells task), else the subject's distribution when details are allowed
  const diagram = cfg.activity === "atom" ? (cfg.tasks.shells ? { shells: shellDraft.slice(0, Math.max(1, shellDraft.reduce((n, v, i) => (v > 0 ? i + 1 : n), 0))), cloud: undefined }
    : cfg.tasks.build ? { shells: null, cloud: build.electrons }
      : species && cfg.view.details ? { shells: shellsOf(speciesConfiguration(chemElement(species.element)!.z, species.charge)), cloud: undefined }
        : { shells: null, cloud: species ? chemElement(species.element)!.z - species.charge : undefined }) : null;
  const nucleus = cfg.tasks.build ? build : species ? { protons: chemElement(species.element)!.z, neutrons: species.massNumber - chemElement(species.element)!.z } : null;
  return (
    <div className="chem" dir="rtl" data-testid="chem-workspace" data-activity={cfg.activity} aria-label={(label ? label + " — " : "") + CHEM_ACTIVITY_LABEL[cfg.activity]}>
      <p className="chem-note"><strong>{CHEM_ACTIVITY_LABEL[cfg.activity]}</strong>
        {species && <> — المعطى: <Nuclide s={species} /> ({chemElement(species.element)!.nameAr}{species.charge === 0 ? "، ذرة متعادلة" : "، أيون"})</>}
        {molecule && cfg.view.identity && <> — الجزيء: {molecule.nameAr} <span className="chem-ltr chem-formula">{displayFormula(molecule.formula)}</span></>}
        {formula && <> — الصيغة: <span className="chem-ltr chem-formula" data-testid="chem-subject-formula">{displayFormula(formula)}</span></>}
        . احفظ كل إجابة صراحةً؛ التدوير والتكبير والقياس واستكشاف الجدول لا تُحفظ ولا تُقيَّم.</p>

      {cfg.activity === "atom" && nucleus && diagram && (
        <div className="chem-stage">
          <AtomModel protons={nucleus.protons} neutrons={nucleus.neutrons} shells={diagram.shells} cloud={diagram.cloud}
            caption={cfg.tasks.build ? "الذرة التي تبنيها" : species ? "نموذج " + chemElement(species.element)!.nameAr : "الذرة"} />
          <div className="chem-side">
            {species && cfg.view.details && <p className="chem-note" data-testid="chem-details">التوزيع الإلكتروني للمعطى: <span className="chem-ltr">{formatConfiguration(speciesConfiguration(chemElement(species.element)!.z, species.charge))}</span></p>}
            {cfg.tasks.build && (
              <fieldset className="chem-task" data-testid="chem-builder">
                <legend>ابنِ الذرة أو الأيون: عدد الجسيمات</legend>
                <Counter testId="chem-protons" label="البروتونات p⁺" value={build.protons} min={0} max={L.protonsMax} disabled={disabled} onValue={n => setBuild(b => ({ ...b, protons: n }))} />
                <Counter testId="chem-neutrons" label="النيوترونات n" value={build.neutrons} min={0} max={L.neutronsMax} disabled={disabled} onValue={n => setBuild(b => ({ ...b, neutrons: n }))} />
                <Counter testId="chem-electrons" label="الإلكترونات e⁻" value={build.electrons} min={0} max={L.electronsMax} disabled={disabled} onValue={n => setBuild(b => ({ ...b, electrons: n }))} />
                {cfg.view.identity && (
                  <p className="chem-identity" aria-live="polite" data-testid="chem-identity">
                    {built.element ? <>ما بنيته: <Nuclide s={{ element: built.element.symbol, massNumber: built.massNumber, charge: built.charge }} /> ({built.element.nameAr}){!built.catalogued && " — عدد كتلي غير مدرج ضمن نظائر هذا العنصر"}{!built.commonIon && " — شحنة غير مألوفة لهذا العنصر"}</> : "أضف بروتونات لتحديد العنصر (من 1 إلى 36)."}
                  </p>
                )}
                {!disabled && <div className="chem-row">
                  <button type="button" data-testid="chem-save-particles" onClick={() => decide("particles", { type: "particles.set", ...build })}>حفظ البناء</button>
                  <button type="button" className="is-secondary" disabled={!state.particles} onClick={() => decide("particles", null)}>مسح</button>
                </div>}
                <p className="chem-saved">{state.particles ? <>المحفوظ: <span className="chem-ltr">p = {state.particles.protons}، n = {state.particles.neutrons}، e = {state.particles.electrons}</span></> : "لم يُحفظ بعد."}</p>
              </fieldset>
            )}
            {cfg.tasks.shells && (
              <fieldset className="chem-task" data-testid="chem-shells">
                <legend>وزّع الإلكترونات على الأغلفة</legend>
                {shellDraft.map((n, i) => <Counter key={i} testId={"chem-shell-" + i} label={"الغلاف " + chemShellLetter(i) + " (n = " + (i + 1) + ")"} value={n} min={0} max={L.shellElectronsMax} disabled={disabled}
                  onValue={v => setShellDraft(s => s.map((x, k) => (k === i ? v : x)))} />)}
                {!disabled && <div className="chem-row">
                  <button type="button" data-testid="chem-save-shells" disabled={shellDraft.reduce((a, b) => a + b, 0) > L.electronsMax} onClick={() => decide("shells", { type: "shells.set", shells: [...shellDraft] })}>حفظ التوزيع</button>
                  <button type="button" className="is-secondary" disabled={!savedShells} onClick={() => decide("shells", null)}>مسح</button>
                </div>}
                <p className="chem-saved">{savedShells ? <>المحفوظ: <span className="chem-ltr">{savedShells.join("، ") || "لا إلكترونات"}</span></> : "لم يُحفظ بعد."}</p>
              </fieldset>
            )}
          </div>
        </div>
      )}

      {molecule && <MoleculeView3D molecule={molecule} measure={cfg.view.measure} lonePairsAllowed={cfg.view.details} showFormula={cfg.view.identity}
        selection={sel && sel.target !== "elements" ? { target: sel.target, selected: state.selected, max: sel.max, disabled, label: sel.label, onToggle: toggle } : undefined} />}
      {molecule && cfg.view.details && (
        <dl className="chem-facts" data-testid="chem-details">
          <div><dt>الشكل (VSEPR)</dt><dd>{MOLECULE_SHAPE_LABEL[molecule.shape]}</dd></div>
          <div><dt>القطبية</dt><dd>{MOLECULE_POLARITY_LABEL[molecule.polarity]}</dd></div>
          {molecule.notes.map((n, i) => <div key={i}><dt>ملاحظة</dt><dd>{n}</dd></div>)}
        </dl>
      )}
      {cfg.view.details && (formula || molecule) && <CompositionTable comp={formula ? (parseFormula(formula) as { composition: FormulaComposition }).composition : moleculeComposition(molecule!)} />}
      {cfg.view.periodicTable !== "hidden" && (
        <PeriodicTable mode={cfg.view.periodicTable} selectable={sel?.target === "elements"} selected={state.selected} max={sel?.max ?? 1} disabled={disabled} label={sel?.label} onToggle={toggle} />
      )}

      <div className="chem-tasks">
        {cfg.tasks.values.map(t => (
          <ValueTask key={t.id} task={t} saved={state.values[t.id]} disabled={disabled}
            onSave={v => decide("value:" + t.id, { type: "value.set", valueId: t.id, value: v })} onClear={() => decide("value:" + t.id, null)} />
        ))}
        {cfg.tasks.formulas.map(t => (
          <FormulaTask key={t.id} task={t} saved={state.formulas[t.id]} disabled={disabled}
            onSave={text => decide("formula:" + t.id, { type: "formula.set", formulaId: t.id, text })} onClear={() => decide("formula:" + t.id, null)} />
        ))}
        {cfg.tasks.classifications.map(t => (
          <fieldset key={t.id} className="chem-task" data-testid="chem-classification" data-id={t.id}>
            <legend>{t.label}</legend>
            <div className="chem-options" role="radiogroup" aria-label={t.label}>
              {CHEM_PROPERTY_OPTIONS[t.property].map(o => (
                <label key={o} className="chem-option"><input type="radio" name={"chem-" + t.id} value={o} checked={state.classifications[t.id] === o} disabled={disabled}
                  onChange={() => decide("classification:" + t.id, { type: "classification.set", taskId: t.id, option: o })} />{CHEM_OPTION_LABEL[o] ?? o}</label>
              ))}
            </div>
            {!disabled && state.classifications[t.id] !== undefined && <button type="button" className="is-secondary" onClick={() => decide("classification:" + t.id, null)}>مسح الاختيار</button>}
          </fieldset>
        ))}
      </div>
      {!disabled && (
        <div className="chem-row">
          {confirm
            ? <><button type="button" className="is-danger" onClick={() => { setConfirm(false); emit([]); }}>تأكيد مسح كل الإجابات</button><button type="button" className="is-secondary" onClick={() => setConfirm(false)}>إلغاء</button></>
            : <button type="button" className="is-secondary" onClick={() => setConfirm(true)} disabled={base.length === 0}>مسح كل الإجابات</button>}
        </div>
      )}
    </div>
  );
}
