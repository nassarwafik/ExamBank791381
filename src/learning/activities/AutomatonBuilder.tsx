import { useMemo, useState, type FormEvent } from "react";
import { readAutomatonConfig, runAutomaton, splitWord, type Machine } from "./automaton";
import { Diagram } from "./automatonDiagram";
import { buildScene } from "./automatonScene";
import { machineOfDraft, symbolsOf, type FaRules } from "./automatonDraft";
import { addTrapState, labLayout, missingArrows, nextStateName, removeState, unreachableStates, type LabDraft } from "../../studentTools/automataLab";
import AutomataLabCanvas, { finePointer } from "../../studentTools/AutomataLabCanvas";
import "./automatonDesign.css";

/**
 * AUTO-A8 (docs/enterprise-automata-lab-a4.md §11) — the finite-automaton BUILDER, moved out of the book's «صمّم الآلة» activity
 * (AUTO-A3 / A7) unchanged, so the exam's automatonDesign@1 question uses the very same one — the student's answer and the teacher's
 * reference machine:
 *   the task box (an optional intro, the rules, the example words) · ١ the states · ٢ the transition table (the phone's way) ·
 *   ٣ the machine drawn — on a desktop the lab's drawing editor, within the state limit — and «جرّب كلمة» on THIS machine ·
 *   ٤ «فحص سريع»: unreachable states, a complete automaton's missing arrows and «أضف حالة مصيدة».
 * It knows nothing of any answer. `disabled` (a submitted answer, a read-only view): every control off, the drawing static.
 */
const cellKey = (state: string, symbol: string) => state + "|" + symbol;
const shown = (w: string) => (w === "" ? "ε (الكلمة الفارغة)" : w);

export type AutomatonBuilderProps = {
  ids: string;
  rules: FaRules;
  draft: LabDraft;
  onDraft: (next: LabDraft) => void;
  intro?: string;
  examples?: { accept: string[]; reject: string[] };
  /** The heading of ٣ («آلتك»; the teacher's reference: «الآلة النموذجية»). */
  machineTitle?: string;
  /** The heading of ٤ («فحص سريع لآلتك»). */
  quickTitle?: string;
  /** The quick check's last sentence when it has nothing to say: who decides whether the machine is right. */
  decidedBy?: string;
  disabled?: boolean;
  onTryWord?: () => void;
};

export default function AutomatonBuilder({ ids, rules, draft, onDraft, intro, examples, machineTitle = "آلتك", quickTitle = "فحص سريع لآلتك", decidedBy = "هذا ما يقرّره «تحقّق من الآلة».", disabled = false, onTryWord }: AutomatonBuilderProps) {
  const [word, setWord] = useState("");
  const [tried, setTried] = useState<{ word: string; stamp: string; accepted: boolean } | { word: string; stamp: string; bad: string } | null>(null);
  const symbols = useMemo(() => symbolsOf(rules), [rules]);
  const machine = useMemo(() => machineOfDraft(draft, rules), [draft, rules]);
  const stamp = JSON.stringify(machine);
  // The drawing and the local run use the simulator's own reader: the draft is always a machine it reads.
  const drawn: Machine | null = useMemo(() => {
    const read = readAutomatonConfig({ automaton: { kind: rules.machine, alphabet: rules.alphabet, states: machine.states, start: machine.start, accept: machine.accept, transitions: machine.transitions } });
    return read ? read.machine : null;
  }, [stamp, rules.machine]);   // eslint-disable-line react-hooks/exhaustive-deps
  // AUTO-A7 — the book's automatic layout, with the cells the learner chose by mouse (the drawing and the editor share it)
  const layout = useMemo(() => (drawn ? labLayout(drawn, draft.layout) : null), [drawn, draft.layout]);
  const scene = useMemo(() => (drawn && layout ? buildScene(drawn, layout) : null), [drawn, layout]);
  const fine = useMemo(() => finePointer(), []);

  const edit = (next: LabDraft) => { if (disabled) return; onDraft(next); setTried(null); };
  const addState = () => {
    if (draft.states.length >= rules.maxStates) return;
    edit({ ...draft, states: [...draft.states, nextStateName(draft.states)] });
  };
  const dropState = (q: string) => edit(removeState(draft, q));
  const setStart = (q: string) => edit({ ...draft, start: q });
  const toggleAccept = (q: string) => edit({ ...draft, accept: draft.accept.includes(q) ? draft.accept.filter(s => s !== q) : [...draft.accept, q] });
  const setCell = (q: string, s: string, to: string) => edit({ ...draft, cells: { ...draft.cells, [cellKey(q, s)]: to ? [to] : [] } });
  const toggleCell = (q: string, s: string, to: string) => {
    const now = draft.cells[cellKey(q, s)] ?? [];
    edit({ ...draft, cells: { ...draft.cells, [cellKey(q, s)]: now.includes(to) ? now.filter(t => t !== to) : [...now, to] } });
  };

  const tryWord = (e: FormEvent) => {
    e.preventDefault();
    if (!drawn) return;
    const w = word.trim();
    const split = splitWord(drawn, w);
    if (!split.ok) { setTried({ word: w, stamp, bad: split.bad }); return; }
    const run = runAutomaton(drawn, split.symbols);
    setTried({ word: w, stamp, accepted: run.verdict === "accept" });
    onTryWord?.();
  };
  const triedNow = tried && tried.stamp === stamp ? tried : null;
  const missing = rules.complete ? draft.states.flatMap(q => rules.alphabet.filter(s => !(draft.cells[cellKey(q, s)] ?? []).length).map(s => q + "," + s)) : [];
  // AUTO-A7 — «فحص سريع»: this machine only
  const unreachable = drawn ? unreachableStates(drawn) : [];
  const holes = rules.complete ? missingArrows(draft) : [];
  const trapRoom = draft.states.length < rules.maxStates;
  const addTrap = () => { if (trapRoom) edit(addTrapState(draft)); };
  const ex = examples ?? { accept: [], reject: [] };

  return (
    <>
      <div className="learning-autodesign-task">
        {intro && <p className="learning-autodesign-intro">{intro}</p>}
        <ul className="learning-autodesign-rules" aria-label="شروط التمرين">
          <li>{rules.machine === "DFA" ? "أوتومات منتهٍ حتمي" : "أوتومات منتهٍ غير حتمي (يُسمح بـ ε)"}</li>
          <li>الأبجدية <span dir="ltr" className="learning-autodesign-mono">{"{" + rules.alphabet.join(", ") + "}"}</span></li>
          <li>حتى {rules.maxStates} حالات</li>
          {rules.complete && <li>أوتومات كامل: سهم لكل حالة ولكل رمز</li>}
        </ul>
        {(ex.accept.length > 0 || ex.reject.length > 0) && (
          <div className="learning-autodesign-examples">
            {ex.accept.length > 0 && <p><span className="learning-autodesign-tag is-accept">تُقبل</span>{ex.accept.map(w => <span key={w} className="learning-autodesign-word" dir="ltr">{w === "" ? "ε" : w}</span>)}</p>}
            {ex.reject.length > 0 && <p><span className="learning-autodesign-tag is-reject">تُرفض</span>{ex.reject.map(w => <span key={w} className="learning-autodesign-word" dir="ltr">{w === "" ? "ε" : w}</span>)}</p>}
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
              <label className="learning-autodesign-toggle">
                <input type="radio" name={ids + "-start"} checked={draft.start === q} onChange={() => setStart(q)} />
                <span>بداية</span>
              </label>
              <label className="learning-autodesign-toggle">
                <input type="checkbox" checked={draft.accept.includes(q)} onChange={() => toggleAccept(q)} />
                <span>قبول</span>
              </label>
              <button type="button" className="learning-autodesign-btn is-quiet" onClick={() => dropState(q)} disabled={draft.states.length <= 1} aria-label={"احذف الحالة " + q}>حذف</button>
            </li>
          ))}
        </ul>
        <button type="button" className="learning-autodesign-btn" onClick={addState} disabled={draft.states.length >= rules.maxStates}>
          إضافة حالة {draft.states.length >= rules.maxStates ? "(بلغت الحد)" : ""}
        </button>
      </section>

      <section className="learning-autodesign-section" aria-labelledby={ids + "-delta"}>
        <h4 id={ids + "-delta"} className="learning-autodesign-heading">٢. الانتقالات</h4>
        <p className="learning-autodesign-help">
          {rules.machine === "DFA" ? "اختر لكل حالة ولكل رمز الحالة التي ننتقل إليها." : "اختر لكل حالة ولكل رمز كل الحالات التي يمكن الانتقال إليها (أو لا شيء)."}
          {rules.machine === "DFA" && !rules.complete && " «—» يعني لا سهم: الكلمة تُرفض إن وصلت إلى هنا."}
        </p>
        <div className="learning-autodesign-tablewrap" tabIndex={0} role="region" aria-label="جدول الانتقالات">
          <table className="learning-autodesign-table">
            <thead>
              <tr><th scope="col">الحالة</th>{symbols.map(s => <th key={s} scope="col" dir="ltr">{s}</th>)}</tr>
            </thead>
            <tbody>
              {draft.states.map(q => (
                <tr key={q}>
                  <th scope="row" dir="ltr">{q}</th>
                  {symbols.map(s => {
                    const now = draft.cells[cellKey(q, s)] ?? [];
                    const label = "من " + q + " بالرمز " + s;
                    return (
                      <td key={s}>
                        {rules.machine === "DFA"
                          ? (
                            <select className="learning-autodesign-select" value={now[0] ?? ""} onChange={e => setCell(q, s, e.target.value)} aria-label={label + " إلى"} dir="ltr">
                              <option value="">—</option>
                              {draft.states.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          )
                          : (
                            <div className="learning-autodesign-targets" role="group" aria-label={label + " إلى"}>
                              {draft.states.map(t => (
                                <button key={t} type="button" dir="ltr" className={"learning-autodesign-target" + (now.includes(t) ? " is-on" : "")} aria-pressed={now.includes(t)} onClick={() => toggleCell(q, s, t)}>{t}</button>
                              ))}
                            </div>
                          )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rules.complete && missing.length > 0 && <p className="learning-autodesign-help">ينقص {missing.length} {missing.length === 1 ? "سهم" : "أسهم"} ليكون الأوتومات كاملًا.</p>}
      </section>

      <section className="learning-autodesign-section" aria-labelledby={ids + "-draw"}>
        <h4 id={ids + "-draw"} className="learning-autodesign-heading">٣. {machineTitle}</h4>
        {drawn && scene && layout
          ? fine && !disabled
            ? <AutomataLabCanvas ids={ids} draft={draft} machine={drawn} scene={scene} layout={layout} edit={edit} maxStates={rules.maxStates} />
            : <Diagram machine={drawn} scene={scene} step={{ active: [], used: [] }} ids={ids} live={false} />
          : <p className="learning-autodesign-help">أكمل الحالات لتظهر الآلة.</p>}
        <form className="learning-autodesign-try" onSubmit={tryWord}>
          <label className="learning-autodesign-trylabel" htmlFor={ids + "-word"}>جرّب كلمة على {machineTitle}</label>
          <input id={ids + "-word"} className="learning-autodesign-input" dir="ltr" value={word} maxLength={40} autoComplete="off" spellCheck={false}
            onChange={e => { setWord(e.target.value); setTried(null); }} placeholder={rules.alphabet.join("") || "ab"} />
          <button type="submit" className="learning-autodesign-btn" disabled={!drawn}>شغّل</button>
        </form>
        {triedNow && (
          <p className="learning-autodesign-tried" role="status">
            {"bad" in triedNow
              ? <>الرمز <span dir="ltr">«{triedNow.bad}»</span> ليس في الأبجدية.</>
              : <>{machineTitle} {triedNow.accepted ? "تقبل" : "ترفض"} الكلمة <span dir="ltr" className="learning-autodesign-mono">{shown(triedNow.word)}</span>. (هذا تشغيل للآلة فقط، ليس فحصًا للحل.)</>}
          </p>
        )}
      </section>

      <section className="learning-autodesign-section" aria-labelledby={ids + "-quick"} data-testid="autodesign-quick">
        <h4 id={ids + "-quick"} className="learning-autodesign-heading">٤. {quickTitle}</h4>
        <ul className="learning-autodesign-quick">
          {unreachable.length > 0 && <li>لا يصل مسار من البداية إلى <span dir="ltr">{unreachable.join("، ")}</span>: {unreachable.length === 1 ? "هذه الحالة لا تؤثر" : "هذه الحالات لا تؤثر"} في الكلمات المقبولة.</li>}
          {holes.length > 0 && (
            <li>
              ينقص {holes.length === 1 ? "سهم" : "أسهم"} ليكون الأوتومات كاملًا: <span dir="ltr">{holes.slice(0, 6).map(h => "(" + h.state + ", " + h.symbol + ")").join(" ")}{holes.length > 6 ? " …" : ""}</span>.{" "}
              <button type="button" className="learning-autodesign-btn is-quiet" onClick={addTrap} disabled={!trapRoom}>أضف حالة مصيدة</button>
              {!trapRoom && <> (لا مكان لحالة أخرى: الحد {rules.maxStates})</>}
            </li>
          )}
          {unreachable.length === 0 && holes.length === 0 && <li>لا ملاحظات على شكل الآلة. هل تقبل اللغة المطلوبة؟ {decidedBy}</li>}
        </ul>
      </section>
      </fieldset>
    </>
  );
}
