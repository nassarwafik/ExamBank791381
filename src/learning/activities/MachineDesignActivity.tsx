import { useId, useMemo, useRef, useState } from "react";
import type { ActivityCheckResult, LearningActivityProps } from "./engine";
import { IconCheck, IconClose } from "../../icons";
import { buildScene } from "./automatonScene";
import { AutomatonPlayer } from "./AutomatonPlayer";
import { issueText } from "./automatonDesign";
import { counterexampleText, readMachineTask, type MachineTask } from "./machineDesign";
import { BLANK, BOTTOM, checkDraft, initialDraft, labLayout, nextStateName, removeState, unreachableStates, type LabDraft, type PdaRow, type TmRow } from "../../studentTools/automataLab";
import AutomataLabCanvas, { finePointer } from "../../studentTools/AutomataLabCanvas";
import { PdaRows, TmRows, rowSymbols } from "../../studentTools/AutomataLabRows";
import "./activities.css";
import "./automatonDesign.css";

/**
 * AUTO-A10 (docs/enterprise-automata-lab-a4.md §14) — `simulation / machine-design / v1`: «صمّم الآلة» for a PUSH-DOWN automaton or a
 * TURING machine (to recognise a language, or to compute a function — the answer on the tape between two $).
 *
 * The learner builds the machine with the automata lab's OWN editors — the states, the transitions in the course's notation
 * («ادفع a,⏊/S», «a/A,R»), and on a desktop the drawing editor — and runs it step by step on any word with the book's player.
 * «تحقّق من الآلة» sends the machine (in the automaton-trace format the course's reader read it from) through the host's `check` seam.
 * The SERVER runs it and the reference on every word up to a length: owner decision (2026-11-25) — the verdict says «agrees with the
 * reference on every word up to length N (K words)», honestly not a proof, or names the shortest word on which they certainly
 * disagree (for a function: the expected answer and the machine's). A Turing machine that does not halt where the reference does is
 * said so. A verdict belongs to the machine it judged: any edit clears it. A failure says «تعذّر التحقق» — never a wrong answer.
 * No timers, no persistence, no network of its own.
 */
type CheckState =
  | { kind: "idle" }
  | { kind: "pending"; stamp: string }
  | { kind: "done"; stamp: string; result: ActivityCheckResult }
  | { kind: "error"; stamp: string };

const KIND_TEXT = { PDA: "أوتومات مكدّس (حتمي، كما في المادة)", TM: "آلة تورنغ (حتمية)" } as const;
const draftFor = (task: MachineTask): LabDraft => ({ ...initialDraft(task.machine), alphabet: [...task.alphabet], leftEnd: task.leftEnd });
const shownWord = (w: string) => (w === "" ? "ε" : w);

export default function MachineDesignActivity({ block, commands, emit, check }: LearningActivityProps) {
  const task = useMemo(() => readMachineTask(block.config), [block.config]);
  if (!task) return <p className="learning-autodesign-unavailable" role="note">تعذّر عرض هذا التمرين في هذا الإصدار.</p>;
  return <Designer key={commands.reset} task={task} blockId={block.id} emit={emit} check={check} />;
}

function Designer({ task, blockId, emit, check }: { task: MachineTask; blockId: string; emit: LearningActivityProps["emit"]; check: LearningActivityProps["check"] }) {
  const ids = "md" + useId().replace(/:/g, "");
  const [draft, setDraft] = useState<LabDraft>(() => draftFor(task));
  const [state, setState] = useState<CheckState>({ kind: "idle" });
  const seq = useRef(0);
  const checked = useMemo(() => checkDraft(draft), [draft]);
  const machine = checked.machine;
  const stamp = useMemo(() => JSON.stringify(checked.raw ?? null), [checked]);
  const current = state.kind !== "idle" && state.stamp === stamp ? state : null;
  const result = current?.kind === "done" ? current.result : null;
  const layout = useMemo(() => (machine ? labLayout(machine, draft.layout) : null), [machine, draft.layout]);
  const scene = useMemo(() => (machine && layout ? buildScene(machine, layout) : null), [machine, layout]);
  const fine = useMemo(() => finePointer(), []);
  const unreachable = machine ? unreachableStates(machine) : [];

  const edit = (next: LabDraft) => setDraft({ ...next, alphabet: [...task.alphabet], leftEnd: task.leftEnd });   // the task's alphabet always
  const addState = () => { if (draft.states.length < task.maxStates) edit({ ...draft, states: [...draft.states, nextStateName(draft.states)] }); };
  const setPda = (i: number, patch: Partial<PdaRow>) => edit({ ...draft, pda: draft.pda.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const setTm = (i: number, patch: Partial<TmRow>) => edit({ ...draft, tm: draft.tm.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const addPda = () => edit({ ...draft, pda: [...draft.pda, { from: draft.start, read: task.alphabet[0], top: BOTTOM, op: "push", write: "", to: draft.start }] });
  const addTm = () => edit({ ...draft, tm: [...draft.tm, { from: draft.start, read: task.alphabet[0], write: task.alphabet[0], move: "R", to: draft.start }] });

  const runCheck = () => {
    if (!check || !checked.raw || current?.kind === "pending") return;
    const mine = ++seq.current, at = stamp;
    setState({ kind: "pending", stamp: at });
    emit({ type: "interaction", activityId: blockId, name: "check" });
    check({ kind: "machine-design", machine: checked.raw })
      .then(r => { if (seq.current === mine) setState({ kind: "done", stamp: at, result: r }); })
      .catch(() => { if (seq.current === mine) setState({ kind: "error", stamp: at }); });
  };

  const ex = task.examples;
  return (
    <div className="learning-autodesign learning-machine-design" dir="rtl">
      <div className="learning-autodesign-task">
        <p className="learning-autodesign-intro">{task.intro}</p>
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
        {fine && machine && scene && layout && <AutomataLabCanvas ids={ids} draft={draft} machine={machine} scene={scene} layout={layout} edit={edit} maxStates={task.maxStates} />}
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
          ? <AutomatonPlayer key={stamp} machine={machine} scene={scene} words={[]} initialWord="" onRun={() => emit({ type: "interaction", activityId: blockId, name: "try-word" })} />
          : <p className="learning-autodesign-help">أكمل الانتقالات لتظهر الآلة وتشغّلها.</p>}
        {unreachable.length > 0 && <p className="learning-autodesign-help">لا يصل مسار من البداية إلى <span dir="ltr">{unreachable.join("، ")}</span>.</p>}
      </section>

      <div className="learning-autodesign-checkbar">
        {check
          ? <button type="button" className="learning-autodesign-btn is-primary" onClick={runCheck} disabled={!checked.raw || current?.kind === "pending"}>{current?.kind === "pending" ? "جارٍ التحقق…" : "تحقّق من الآلة"}</button>
          : <p className="learning-autodesign-help" role="note">يُفحص تصميمك عند فتح المادة من المنصة.</p>}
      </div>
      {current?.kind === "error" && <p className="learning-autodesign-verdict is-error" role="alert">تعذّر التحقق الآن. آلتك لم تُعتبر خطأ — حاول مرة أخرى بعد قليل.</p>}
      {result && <Verdict result={result} task={task} />}
    </div>
  );
}

function Verdict({ result, task }: { result: ActivityCheckResult; task: MachineTask }) {
  const fb = result.feedback ?? {};
  if (result.correct) {
    const a = result.agreesUpTo;
    return (
      <div className="learning-autodesign-verdict is-right" role="status" data-testid="machine-design-verdict">
        <p className="learning-autodesign-verdicthead"><IconCheck size={16} aria-hidden="true" />
          ✓ آلتك تتفق مع النموذج على كل الكلمات حتى الطول {a?.length ?? task.maxLength}{a ? " (" + a.words + " كلمة)" : ""}.
        </p>
        <p className="learning-autodesign-help">هذا فحص بكل الكلمات حتى هذا الطول، وليس برهانًا على كل الكلمات.</p>
        {fb.message && <p>{fb.message}</p>}
        {fb.explanation && <p className="learning-autodesign-explain">{fb.explanation}</p>}
      </div>
    );
  }
  return (
    <div className="learning-autodesign-verdict is-wrong" role="status" data-testid="machine-design-verdict">
      <p className="learning-autodesign-verdicthead"><IconClose size={16} aria-hidden="true" />✗ ليست بعد.</p>
      {result.issue && <p>{result.issue.code === "malformed" ? "تعذّر قراءة الآلة: راجع الحالات والانتقالات." : issueText(result.issue)}</p>}
      {result.counterexample && <p>{counterexampleText(result.counterexample)} جرّبها خطوة خطوة على آلتك.</p>}
      {result.nohalt && <p>آلتك لم تتوقف على الكلمة <span dir="ltr">{shownWord(result.nohalt.word)}</span> (بعد ألف خطوة)، والنموذج يتوقف عليها.</p>}
      {fb.message && <p>{fb.message}</p>}
      {fb.hints && fb.hints.length > 0 && <ul className="learning-autodesign-hints">{fb.hints.map((h, i) => <li key={i}>{h}</li>)}</ul>}
    </div>
  );
}
