import { useState } from "react";
import type { ChemLabConfigV1, ChemLabStateV1, ChoiceTask, NumberTask, ObserveTask, PrepareTask } from "../chemistryLabModel";
import { PRECISION_TEXT } from "../chemistry/lab/precision";
import { indicatorById } from "../chemistry/lab/acidBase";
import { answerUnits, isolateQuantities, ltr, optionText, preparedView, recordRow, studentDecimal, unitText } from "./labView";

// Phase 21D-D.3 — the ANSWERS of a chemistryLab@1 question and the observation RECORD (UI only). Observations (what the bench showed and the
// student recorded), measurements (instrument readings) and answers (what the student submits for grading) are kept apart: only "save" in
// this panel writes an answer. Nothing here says whether an answer is right — the server decides; progress lines state facts only.
type AnswerProps = {
  cfg: ChemLabConfigV1; state: ChemLabStateV1; disabled?: boolean; uid: string;
  onNumber: (taskId: string, value: string, unit: string) => void; onChoice: (taskId: string, options: string[]) => void; onClear: (taskId: string) => void;
};

function NumberAnswer({ cfg, task, saved, disabled, onSave, onClear }: { cfg: ChemLabConfigV1; task: NumberTask; saved: { value: string; unit: string } | undefined; disabled?: boolean; onSave: (v: string, unit: string) => void; onClear: () => void }) {
  const units = answerUnits(cfg, task);
  const [draft, setDraft] = useState(saved?.value ?? "");
  const [unit, setUnit] = useState(saved?.unit ?? task.unit);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(saved);
  if (saved?.value !== sent?.value || saved?.unit !== sent?.unit) { setSent(saved); setDraft(saved?.value ?? ""); setUnit(saved?.unit ?? task.unit); } // restored / cleared elsewhere
  const save = () => {
    const v = studentDecimal(draft);
    if (v === null) { setError("أدخل عددًا عشريًا صالحًا (مثل 0.0930 أو 9.30e-3)."); return; }
    setError(""); setDraft(v); onSave(v, unit);
  };
  const unitLabel = units.find(u => u.id === unit);
  return (
    <fieldset className="chem-task clab-answer" data-testid="clab-number" data-id={task.id}>
      <legend>{isolateQuantities(task.label)}</legend>
      <p className="chem-help">اكتب الإجابة {PRECISION_TEXT(task.precision)}.</p>
      <div className="chem-row">
        <input type="text" inputMode="decimal" dir="ltr" autoComplete="off" spellCheck={false} maxLength={32} value={draft} disabled={disabled}
          aria-label={task.label + (unitLabel && unitLabel.label ? " (" + unitLabel.label + ")" : "")} aria-invalid={error ? true : undefined}
          onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (!disabled) save(); } }} />
        {units.length > 1
          ? <select aria-label={"وحدة " + task.label} value={unit} disabled={disabled} onChange={e => setUnit(e.target.value)}>{units.map(u => <option key={u.id} value={u.id}>{unitText(u)}</option>)}</select>
          : unitLabel && unitLabel.label && <span className="chem-ltr">{unitLabel.label}</span>}
      </div>
      {!disabled && <div className="chem-row"><button type="button" onClick={save}>حفظ الإجابة</button><button type="button" className="is-secondary" disabled={!saved} onClick={() => { setDraft(""); onClear(); }}>مسح</button></div>}
      {error && <p className="chem-error" role="alert">{error}</p>}
      <p className="clab-saved">{saved ? <>المحفوظ: <span className="chem-ltr">{saved.value} {units.find(u => u.id === saved.unit)?.label ?? ""}</span></> : "لم تُحفظ إجابة بعد."}</p>
    </fieldset>
  );
}
function ChoiceAnswer({ cfg, task, chosen, disabled, name, onChoose }: { cfg: ChemLabConfigV1; task: ChoiceTask; chosen: string[]; disabled?: boolean; name: string; onChoose: (o: string[]) => void }) {
  return (
    <fieldset className="chem-task clab-answer" data-testid="clab-choice" data-id={task.id}>
      <legend>{isolateQuantities(task.label)}{task.mode === "multiple" && <small> (اختر كل ما ينطبق)</small>}</legend>
      <div className="chem-options" role={task.mode === "single" ? "radiogroup" : "group"} aria-label={task.label}>
        {task.options.map(o => (
          <label key={o} className="chem-option">
            <input type={task.mode === "single" ? "radio" : "checkbox"} name={name} value={o} checked={chosen.includes(o)} disabled={disabled}
              onChange={e => onChoose(task.mode === "single" ? [o] : e.target.checked ? task.options.filter(x => x === o || chosen.includes(x)) : chosen.filter(x => x !== o))} />{isolateQuantities(optionText(cfg, o))}
          </label>
        ))}
      </div>
      {!disabled && chosen.length > 0 && <button type="button" className="is-secondary" onClick={() => onChoose([])}>مسح الاختيار</button>}
    </fieldset>
  );
}
function PrepareStatus({ cfg, state, task }: { cfg: ChemLabConfigV1; state: ChemLabStateV1; task: PrepareTask }) {
  const v = preparedView(cfg, state), lab = state.lab;
  const what = lab.kind === "solutions" ? (lab.mass !== null ? ltr(lab.mass + " g") : lab.pipette !== null ? ltr(lab.pipette + " mL") + " من المحلول الأم" : null) : null;
  const text = v.state === "pending" ? "لم يُكمل محلول إلى العلامة بعد." : v.state === "none" ? "—" : (what ?? "—") + " مكمّل إلى " + ltr(v.flask + " mL") + ".";
  return (
    <div className="chem-task clab-answer" data-testid="clab-prepare" data-id={task.id}>
      <p className="chem-task-label"><strong>{isolateQuantities(task.label)}</strong></p>
      <p className="chem-help">يُقيَّم المحلول الموجود في الدورق عند التسليم (يمكنك إفراغ الأدوات والتحضير من جديد).</p>
      <p className="clab-saved">المحلول الحالي: <span>{text}</span></p>
    </div>
  );
}
function ObserveStatus({ cfg, state, task }: { cfg: ChemLabConfigV1; state: ChemLabStateV1; task: ObserveTask }) {
  const obs = state.observations, e = cfg.experiment;
  let fact = "";
  switch (task.requirement) {
    case "distinctFlasks": fact = "سجّلت محاليل في " + new Set(obs.filter(o => o.kind === "solution").map(o => (o as { flask: number }).flask)).size + " دورق مختلف."; break;
    case "meterAll": fact = "قِست " + new Set(obs.filter(o => o.kind === "meter").map(o => (o as { solution: string }).solution)).size + " من " + (e.kind === "ph" ? e.solutions.length : 0) + " محاليل."; break;
    case "indicatorAll": fact = "اختبرت " + new Set(obs.filter(o => o.kind === "indicator" && o.indicator === task.subject).map(o => (o as { solution: string }).solution)).size + " من " + (e.kind === "ph" ? e.solutions.length : 0) + " محاليل بـ" + (indicatorById(task.subject)?.nameAr ?? "") + "."; break;
    case "readings": case "bracketEquivalence": fact = "سجّلت " + new Set(obs.filter(o => o.kind === "reading").map(o => (o as { added: string }).added)).size + " قراءات مختلفة."; break;
    case "runAll": fact = "شغّلت " + new Set(obs.filter(o => o.kind === "run").map(o => (o as { trial: string }).trial)).size + " من " + (e.kind === "rate" ? e.trials.length : 0) + " تجارب."; break;
  }
  return (
    <div className="chem-task clab-answer" data-testid="clab-observe" data-id={task.id}>
      <p className="chem-task-label"><strong>{isolateQuantities(task.label)}</strong></p>
      <p className="clab-saved">{fact}</p>
    </div>
  );
}
export function LabAnswers({ cfg, state, disabled, uid, onNumber, onChoice, onClear }: AnswerProps) {
  return (
    <section className="clab-answers" aria-label="المهام والإجابات">
      <h3 className="clab-h">المهام والإجابات</h3>
      <div className="chem-tasks">
        {cfg.tasks.map(t => {
          const a = state.answers[t.id];
          if (t.kind === "number") return <NumberAnswer key={t.id} cfg={cfg} task={t} saved={a && a.kind === "number" ? a : undefined} disabled={disabled} onSave={(v, u) => onNumber(t.id, v, u)} onClear={() => onClear(t.id)} />;
          if (t.kind === "choice") return <ChoiceAnswer key={t.id} cfg={cfg} task={t} chosen={a && a.kind === "choice" ? a.options : []} disabled={disabled} name={uid + "-" + t.id} onChoose={o => (o.length ? onChoice(t.id, o) : onClear(t.id))} />;
          if (t.kind === "prepare") return <PrepareStatus key={t.id} cfg={cfg} state={state} task={t} />;
          return <ObserveStatus key={t.id} cfg={cfg} state={state} task={t} />;
        })}
      </div>
    </section>
  );
}
export function LabRecord({ cfg, state, limit }: { cfg: ChemLabConfigV1; state: ChemLabStateV1; limit: number }) {
  const rows = state.observations.map(o => recordRow(cfg, o));
  return (
    <section className="clab-record" aria-label="جدول الملاحظات">
      <div className="clab-table-scroll">
        <table className="clab-table" data-testid="clab-record-table">
          <caption>جدول الملاحظات ({rows.length} / {limit})</caption>
          <thead><tr><th scope="col">#</th><th scope="col">النوع</th><th scope="col">العينة أو القراءة</th><th scope="col">ما لوحظ</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={4} className="clab-empty">لم تُسجَّل ملاحظات بعد.</td></tr>
              : rows.map((r, i) => <tr key={i} data-testid="clab-record-row"><td className="clab-num">{i + 1}</td><td>{r.kind}</td><td>{r.what}</td><td>{r.detail}</td></tr>)}
          </tbody>
        </table>
      </div>
      {rows.length >= limit && <p className="chem-error" role="status">امتلأ جدول الملاحظات ({limit} سجلًا)؛ لا تُضاف سجلات جديدة.</p>}
    </section>
  );
}
