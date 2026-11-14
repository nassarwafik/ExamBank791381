import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import type { ActivityCheckResult, LearningActivityProps } from "./engine";
import { IconCheck, IconClose } from "../../icons";
import { gridLayout, readAutomatonConfig, runAutomaton, splitWord, type Machine } from "./automaton";
import { Diagram } from "./automatonDiagram";
import { buildScene } from "./automatonScene";
import { readDesignTask, issueText, type DesignTask } from "./automatonDesign";
import "./automatonDesign.css";

/**
 * AUTO-A3 (docs/enterprise-automata-design-a3.md) — `simulation / automaton-design / v1`: «صمّم الآلة».
 *
 * The task names a language; the learner BUILDS a finite automaton for it:
 *   • the states (add / remove, the start state, the accepting states) and the transition table (one cell per state and symbol:
 *     a choice of one state for a DFA, any set of states — and ε — for an NFA);
 *   • the machine is drawn live, with the same drawing as the lessons' simulators;
 *   • «جرّب كلمة» runs the learner's OWN machine on a word, in the browser (it knows nothing of the answer);
 *   • «تحقّق من الآلة» sends the machine through the host's `check` seam (the study host → POST /api/learning-study/…/attempt).
 *     The SERVER compares its language with the reference machine and answers right, or wrong with the public rule it broke or the
 *     shortest word on which the two disagree. The browser holds no reference and no answer.
 * A verdict belongs to the machine it judged: any edit clears it. A transport failure or a retryable server error says
 * «تعذّر التحقق» — never a wrong answer. Without a `check` seam the designer works and says the check happens on the platform.
 * The shell's «إعادة تعيين» returns to one empty start state. No timers, no persistence, no network of its own.
 */

type Draft = { states: string[]; start: string; accept: string[]; cells: Record<string, string[]> };
const cellKey = (state: string, symbol: string) => state + "|" + symbol;
const EPS = "ε";
const initialDraft = (): Draft => ({ states: ["q0"], start: "q0", accept: [], cells: {} });
const nextName = (states: string[]) => { let i = 0; while (states.includes("q" + i)) i++; return "q" + i; };
const shown = (w: string) => (w === "" ? "ε (الكلمة الفارغة)" : w);

/** The learner's draft as the machine the server reads: transitions [from, symbol, to] in table order. */
function machineOf(d: Draft, symbols: string[]) {
  const transitions: [string, string, string][] = [];
  for (const q of d.states) for (const s of symbols) for (const t of d.cells[cellKey(q, s)] ?? []) if (d.states.includes(t)) transitions.push([q, s, t]);
  return { states: [...d.states], start: d.start, accept: d.accept.filter(q => d.states.includes(q)), transitions };
}

type CheckState =
  | { kind: "idle" }
  | { kind: "pending"; stamp: string }
  | { kind: "done"; stamp: string; result: ActivityCheckResult }
  | { kind: "error"; stamp: string };

export default function AutomatonDesignActivity({ block, commands, emit, check }: LearningActivityProps) {
  const task = useMemo(() => readDesignTask(block.config), [block.config]);
  if (!task) return <p className="learning-autodesign-unavailable" role="note">تعذّر عرض هذا التمرين في هذا الإصدار.</p>;
  return <Designer key={commands.reset} task={task} blockId={block.id} emit={emit} check={check} />;
}

function Designer({ task, blockId, emit, check }: { task: DesignTask; blockId: string; emit: LearningActivityProps["emit"]; check: LearningActivityProps["check"] }) {
  const ids = useId().replace(/:/g, "");
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [state, setState] = useState<CheckState>({ kind: "idle" });
  const [word, setWord] = useState("");
  const [tried, setTried] = useState<{ word: string; stamp: string; accepted: boolean } | { word: string; stamp: string; bad: string } | null>(null);
  const seq = useRef(0);
  const symbols = useMemo(() => (task.machine === "NFA" ? [...task.alphabet, EPS] : task.alphabet), [task]);
  const machine = useMemo(() => machineOf(draft, symbols), [draft, symbols]);
  const stamp = JSON.stringify(machine);
  const current = state.kind !== "idle" && state.stamp === stamp ? state : null;
  const result = current?.kind === "done" ? current.result : null;

  // The drawing and the local run use the simulator's own reader: the draft is always a machine it reads.
  const drawn: Machine | null = useMemo(() => {
    const read = readAutomatonConfig({ automaton: { kind: task.machine, alphabet: task.alphabet, states: machine.states, start: machine.start, accept: machine.accept, transitions: machine.transitions } });
    return read ? read.machine : null;
  }, [stamp, task.machine]);   // eslint-disable-line react-hooks/exhaustive-deps
  const scene = useMemo(() => (drawn ? buildScene(drawn, gridLayout(drawn)) : null), [drawn]);

  const edit = (next: Draft) => { setDraft(next); setTried(null); };
  const addState = () => {
    if (draft.states.length >= task.maxStates) return;
    edit({ ...draft, states: [...draft.states, nextName(draft.states)] });
  };
  const removeState = (q: string) => {
    if (draft.states.length <= 1) return;
    const states = draft.states.filter(s => s !== q);
    const cells: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(draft.cells)) if (!k.startsWith(q + "|")) cells[k] = v.filter(t => t !== q);
    edit({ states, start: draft.start === q ? states[0] : draft.start, accept: draft.accept.filter(s => s !== q), cells });
  };
  const setStart = (q: string) => edit({ ...draft, start: q });
  const toggleAccept = (q: string) => edit({ ...draft, accept: draft.accept.includes(q) ? draft.accept.filter(s => s !== q) : [...draft.accept, q] });
  const setCell = (q: string, s: string, to: string) => edit({ ...draft, cells: { ...draft.cells, [cellKey(q, s)]: to ? [to] : [] } });
  const toggleCell = (q: string, s: string, to: string) => {
    const now = draft.cells[cellKey(q, s)] ?? [];
    edit({ ...draft, cells: { ...draft.cells, [cellKey(q, s)]: now.includes(to) ? now.filter(t => t !== to) : [...now, to] } });
  };

  const runCheck = () => {
    if (!check || current?.kind === "pending") return;
    const mine = ++seq.current, at = stamp, sent = machineOf(draft, symbols);
    setState({ kind: "pending", stamp: at });
    emit({ type: "interaction", activityId: blockId, name: "check" });
    check({ kind: "automaton-design", machine: sent })
      .then(r => { if (seq.current === mine) setState({ kind: "done", stamp: at, result: r }); })
      .catch(() => { if (seq.current === mine) setState({ kind: "error", stamp: at }); });
  };

  const tryWord = (e: FormEvent) => {
    e.preventDefault();
    if (!drawn) return;
    const w = word.trim();
    const split = splitWord(drawn, w);
    if (!split.ok) { setTried({ word: w, stamp, bad: split.bad }); return; }
    const run = runAutomaton(drawn, split.symbols);
    setTried({ word: w, stamp, accepted: run.verdict === "accept" });
    emit({ type: "interaction", activityId: blockId, name: "try-word" });
  };
  const triedNow = tried && tried.stamp === stamp ? tried : null;
  const missing = task.complete ? draft.states.flatMap(q => task.alphabet.filter(s => !(draft.cells[cellKey(q, s)] ?? []).length).map(s => q + "," + s)) : [];

  return (
    <div className="learning-autodesign" dir="rtl">
      <div className="learning-autodesign-task">
        <p className="learning-autodesign-intro">{task.intro}</p>
        <ul className="learning-autodesign-rules" aria-label="شروط التمرين">
          <li>{task.machine === "DFA" ? "أوتومات منتهٍ حتمي" : "أوتومات منتهٍ غير حتمي (يُسمح بـ ε)"}</li>
          <li>الأبجدية <span dir="ltr" className="learning-autodesign-mono">{"{" + task.alphabet.join(", ") + "}"}</span></li>
          <li>حتى {task.maxStates} حالات</li>
          {task.complete && <li>أوتومات كامل: سهم لكل حالة ولكل رمز</li>}
        </ul>
        {(task.examples.accept.length > 0 || task.examples.reject.length > 0) && (
          <div className="learning-autodesign-examples">
            {task.examples.accept.length > 0 && <p><span className="learning-autodesign-tag is-accept">تُقبل</span>{task.examples.accept.map(w => <span key={w} className="learning-autodesign-word" dir="ltr">{w === "" ? "ε" : w}</span>)}</p>}
            {task.examples.reject.length > 0 && <p><span className="learning-autodesign-tag is-reject">تُرفض</span>{task.examples.reject.map(w => <span key={w} className="learning-autodesign-word" dir="ltr">{w === "" ? "ε" : w}</span>)}</p>}
          </div>
        )}
      </div>

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
              <button type="button" className="learning-autodesign-btn is-quiet" onClick={() => removeState(q)} disabled={draft.states.length <= 1} aria-label={"احذف الحالة " + q}>حذف</button>
            </li>
          ))}
        </ul>
        <button type="button" className="learning-autodesign-btn" onClick={addState} disabled={draft.states.length >= task.maxStates}>
          إضافة حالة {draft.states.length >= task.maxStates ? "(بلغت الحد)" : ""}
        </button>
      </section>

      <section className="learning-autodesign-section" aria-labelledby={ids + "-delta"}>
        <h4 id={ids + "-delta"} className="learning-autodesign-heading">٢. الانتقالات</h4>
        <p className="learning-autodesign-help">
          {task.machine === "DFA" ? "اختر لكل حالة ولكل رمز الحالة التي ننتقل إليها." : "اختر لكل حالة ولكل رمز كل الحالات التي يمكن الانتقال إليها (أو لا شيء)."}
          {task.machine === "DFA" && !task.complete && " «—» يعني لا سهم: الكلمة تُرفض إن وصلت إلى هنا."}
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
                        {task.machine === "DFA"
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
        {task.complete && missing.length > 0 && <p className="learning-autodesign-help">ينقص {missing.length} {missing.length === 1 ? "سهم" : "أسهم"} ليكون الأوتومات كاملًا.</p>}
      </section>

      <section className="learning-autodesign-section" aria-labelledby={ids + "-draw"}>
        <h4 id={ids + "-draw"} className="learning-autodesign-heading">٣. آلتك</h4>
        {drawn && scene ? <Diagram machine={drawn} scene={scene} step={{ active: [], used: [] }} ids={ids} live={false} /> : <p className="learning-autodesign-help">أكمل الحالات لتظهر الآلة.</p>}
        <form className="learning-autodesign-try" onSubmit={tryWord}>
          <label className="learning-autodesign-trylabel" htmlFor={ids + "-word"}>جرّب كلمة على آلتك</label>
          <input id={ids + "-word"} className="learning-autodesign-input" dir="ltr" value={word} maxLength={40} autoComplete="off" spellCheck={false}
            onChange={e => { setWord(e.target.value); setTried(null); }} placeholder={task.alphabet.join("") || "ab"} />
          <button type="submit" className="learning-autodesign-btn" disabled={!drawn}>شغّل</button>
        </form>
        {triedNow && (
          <p className="learning-autodesign-tried" role="status">
            {"bad" in triedNow
              ? <>الرمز <span dir="ltr">«{triedNow.bad}»</span> ليس في الأبجدية.</>
              : <>آلتك {triedNow.accepted ? "تقبل" : "ترفض"} الكلمة <span dir="ltr" className="learning-autodesign-mono">{shown(triedNow.word)}</span>. (هذا تشغيل لآلتك فقط، ليس فحصًا للحل.)</>}
          </p>
        )}
      </section>

      <div className="learning-autodesign-checkbar">
        {check
          ? <button type="button" className="learning-autodesign-btn is-primary" onClick={runCheck} disabled={current?.kind === "pending"}>{current?.kind === "pending" ? "جارٍ التحقق…" : "تحقّق من الآلة"}</button>
          : <p className="learning-autodesign-help" role="note">يُفحص تصميمك عند فتح المادة من المنصة.</p>}
      </div>
      {current?.kind === "error" && <p className="learning-autodesign-verdict is-error" role="alert">تعذّر التحقق الآن. آلتك لم تُعتبر خطأ — حاول مرة أخرى بعد قليل.</p>}
      {result && <Verdict result={result} />}
    </div>
  );
}

function Verdict({ result }: { result: ActivityCheckResult }) {
  const fb = result.feedback ?? {};
  if (result.correct) {
    return (
      <div className="learning-autodesign-verdict is-right" role="status">
        <p className="learning-autodesign-verdicthead"><IconCheck size={16} aria-hidden="true" />✓ آلتك صحيحة: تقبل اللغة المطلوبة بالضبط.</p>
        {fb.message && <p>{fb.message}</p>}
        {fb.explanation && <p className="learning-autodesign-explain">{fb.explanation}</p>}
      </div>
    );
  }
  const ce = result.counterexample;
  return (
    <div className="learning-autodesign-verdict is-wrong" role="status">
      <p className="learning-autodesign-verdicthead"><IconClose size={16} aria-hidden="true" />✗ ليست بعد.</p>
      {result.issue && <p>{issueText(result.issue)}</p>}
      {ce && (
        <p>
          الكلمة <span dir="ltr" className="learning-autodesign-mono">{shown(ce.word)}</span>{" "}
          {ce.shouldAccept ? "يجب أن تُقبل، لكن آلتك ترفضها." : "يجب أن تُرفض، لكن آلتك تقبلها."}
          {" "}جرّبها على آلتك وتتبّع أين تذهب.
        </p>
      )}
      {fb.message && <p>{fb.message}</p>}
      {fb.hints && fb.hints.length > 0 && <ul className="learning-autodesign-hints">{fb.hints.map((h, i) => <li key={i}>{h}</li>)}</ul>}
    </div>
  );
}

