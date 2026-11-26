import { useMemo } from "react";
import { buildScene } from "./automatonScene";
import { AutomatonPlayer } from "./AutomatonPlayer";
import type { MachineRules } from "./machineDraft";
import { BLANK, BOTTOM, checkDraft, labLayout, nextStateName, removeState, unreachableStates, type LabDraft, type PdaRow, type TmRow } from "../../studentTools/automataLab";
import AutomataLabCanvas, { finePointer } from "../../studentTools/AutomataLabCanvas";
import { PdaRows, TmRows, rowSymbols } from "../../studentTools/AutomataLabRows";
import "./automatonDesign.css";

/**
 * AUTO-A10 / A11a — the builder of a PUSH-DOWN automaton or a TURING machine, shared by the book's «صمّم الآلة» exercise (MachineDesignActivity)
 * and the machineDesign@1 exam question (the student's answer and the teacher's reference): the task's rules and examples, ١ the states,
 * ٢ the transitions with the automata lab's OWN row editors (and, on a desktop, its drawing editor), ٣ the machine run step by step with the
 * book's player on any word. It knows nothing of any answer. `disabled` (a submitted answer, a read-only view): every control off.
 */
export type MachineBuilderProps = {
  ids: string;
  rules: MachineRules;
  draft: LabDraft;
  onDraft: (next: LabDraft) => void;
  examples: { accept: string[]; reject: string[]; compute: { word: string; answer: string }[] };
  intro?: string;
  disabled?: boolean;
  onRun?: () => void;
};

const KIND_TEXT = { PDA: "أوتومات مكدّس (حتمي، كما في المادة)", TM: "آلة تورنغ (حتمية)" } as const;
const shownWord = (w: string) => (w === "" ? "ε" : w);

export default function MachineBuilder({ ids, rules, draft, onDraft, examples: ex, intro, disabled = false, onRun }: MachineBuilderProps) {
  const task = rules;
  const checked = useMemo(() => checkDraft(draft), [draft]);
  const machine = checked.machine;
  const stamp = useMemo(() => JSON.stringify(checked.raw ?? null), [checked]);
  const layout = useMemo(() => (machine ? labLayout(machine, draft.layout) : null), [machine, draft.layout]);
  const scene = useMemo(() => (machine && layout ? buildScene(machine, layout) : null), [machine, layout]);
  const fine = useMemo(() => finePointer(), []);
  const unreachable = machine ? unreachableStates(machine) : [];

  const edit = (next: LabDraft) => { if (!disabled) onDraft({ ...next, alphabet: [...task.alphabet], leftEnd: task.leftEnd }); };   // the task's alphabet always
  const addState = () => { if (draft.states.length < task.maxStates) edit({ ...draft, states: [...draft.states, nextStateName(draft.states)] }); };
  const setPda = (i: number, patch: Partial<PdaRow>) => edit({ ...draft, pda: draft.pda.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const setTm = (i: number, patch: Partial<TmRow>) => edit({ ...draft, tm: draft.tm.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const addPda = () => edit({ ...draft, pda: [...draft.pda, { from: draft.start, read: task.alphabet[0], top: BOTTOM, op: "push", write: "", to: draft.start }] });
  const addTm = () => edit({ ...draft, tm: [...draft.tm, { from: draft.start, read: task.alphabet[0], write: task.alphabet[0], move: "R", to: draft.start }] });

  return (
    <>
      <div className="learning-autodesign-task">
        {intro && <p className="learning-autodesign-intro">{intro}</p>}
        <ul className="learning-autodesign-rules" aria-label="شروط التمرين">
          <li>{KIND_TEXT[task.machine]}</li>
          {task.machine === "TM" && <li>{task.mode === "compute" ? "تحسب دالة: الجواب على الشريط بين علامتي $ حين تتوقف" : "تميّز لغة: تتوقف في حالة قبول للكلمات المقبولة"}</li>}
          <li>الأبجدية <span dir="ltr" className="learning-autodesign-mono">{"{" + task.alphabet.join(", ") + "}"}</span>{task.machine === "TM" ? " · الفراغ " + BLANK + (task.leftEnd ? " · بداية الشريط ├" : "") : " · قاع المكدّس " + BOTTOM}</li>
          <li>حتى {task.maxStates} حالات</li>
        </ul>
        {(ex.accept.length > 0 || ex.reject.length > 0 || ex.compute.length > 0) && (
          <div className="learning-autodesign-examples">
            {ex.accept.length > 0 && <p><span className="learning-autodesign-tag is-accept">تُقبل</span>{ex.accept.map(w => <span key={w} className="learning-autodesign-word" dir="ltr">{shownWord(w)}</span>)}</p>}
            {ex.reject.length > 0 && <p><span className="learning-autodesign-tag is-reject">تُرفض</span>{ex.reject.map(w => <span key={w} className="learning-autodesign-word" dir="ltr">{shownWord(w)}</span>)}</p>}
            {ex.compute.length > 0 && <p><span className="learning-autodesign-tag is-accept">أمثلة</span>{ex.compute.map(x => <span key={x.word} className="learning-autodesign-word" dir="ltr">{shownWord(x.word) + " → $" + x.answer + "$"}</span>)}</p>}
          </div>
        )}
      </div>

      <fieldset className="learning-autodesign-builder" disabled={disabled}>
      <section className="learning-autodesign-section" aria-labelledby={ids + "-states"}>
        <h4 id={ids + "-states"} className="learning-autodesign-heading">١. الحالات</h4>
        <ul className="learning-autodesign-states">
          {draft.states.map(q => (
            <li key={q} className="learning-autodesign-staterow">
              <span className="learning-autodesign-statename" dir="ltr">{q}</span>
              <label className="learning-autodesign-toggle"><input type="radio" name={ids + "-start"} checked={draft.start === q} onChange={() => edit({ ...draft, start: q })} /><span>بداية</span></label>
              <label className="learning-autodesign-toggle"><input type="checkbox" checked={draft.accept.includes(q)} onChange={() => edit({ ...draft, accept: draft.accept.includes(q) ? draft.accept.filter(s => s !== q) : [...draft.accept, q] })} /><span>قبول</span></label>
              <button type="button" className="learning-autodesign-btn is-quiet" onClick={() => edit(removeState(draft, q))} disabled={draft.states.length <= 1} aria-label={"احذف الحالة " + q}>حذف</button>
            </li>
          ))}
        </ul>
        <button type="button" className="learning-autodesign-btn" onClick={addState} disabled={draft.states.length >= task.maxStates}>إضافة حالة {draft.states.length >= task.maxStates ? "(بلغت الحد)" : ""}</button>
      </section>

      <section className="learning-autodesign-section" aria-labelledby={ids + "-delta"}>
        <h4 id={ids + "-delta"} className="learning-autodesign-heading">٢. الانتقالات</h4>
        {fine && !disabled && machine && scene && layout && <AutomataLabCanvas ids={ids} draft={draft} machine={machine} scene={scene} layout={layout} edit={edit} maxStates={task.maxStates} />}
        {task.machine === "PDA"
          ? <PdaRows draft={draft} ids={ids} symbols={rowSymbols(draft, "pda")} set={setPda} remove={i => edit({ ...draft, pda: draft.pda.filter((_, k) => k !== i) })} add={addPda} />
          : <TmRows draft={draft} ids={ids} symbols={rowSymbols(draft, "tm")} set={setTm} remove={i => edit({ ...draft, tm: draft.tm.filter((_, k) => k !== i) })} add={addTm} />}
        {checked.issues.length > 0 && (
          <ul className="learning-autodesign-quick" data-testid="machine-design-issues" aria-label="ما ينقص الآلة">
            {checked.issues.map((i, k) => <li key={k}>{i.text}</li>)}
          </ul>
        )}
      </section>

      <section className="learning-autodesign-section" aria-labelledby={ids + "-run"}>
        <h4 id={ids + "-run"} className="learning-autodesign-heading">٣. شغّل آلتك خطوة خطوة</h4>
        {machine && scene
          ? <AutomatonPlayer key={stamp} machine={machine} scene={scene} words={[]} initialWord="" onRun={onRun} />
          : <p className="learning-autodesign-help">أكمل الانتقالات لتظهر الآلة وتشغّلها.</p>}
        {unreachable.length > 0 && <p className="learning-autodesign-help">لا يصل مسار من البداية إلى <span dir="ltr">{unreachable.join("، ")}</span>.</p>}
      </section>
      </fieldset>
    </>
  );
}
