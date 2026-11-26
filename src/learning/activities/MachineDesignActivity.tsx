import { useId, useMemo, useRef, useState } from "react";
import type { ActivityCheckResult, LearningActivityProps } from "./engine";
import { IconCheck, IconClose } from "../../icons";
import { issueText } from "./automatonDesign";
import { counterexampleText, readMachineTask, type MachineTask } from "./machineDesign";
import MachineBuilder from "./MachineBuilder";
import { checkDraft, initialDraft, type LabDraft } from "../../studentTools/automataLab";
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
  const stamp = useMemo(() => JSON.stringify(checked.raw ?? null), [checked]);
  const current = state.kind !== "idle" && state.stamp === stamp ? state : null;
  const result = current?.kind === "done" ? current.result : null;

  const runCheck = () => {
    if (!check || !checked.raw || current?.kind === "pending") return;
    const mine = ++seq.current, at = stamp;
    setState({ kind: "pending", stamp: at });
    emit({ type: "interaction", activityId: blockId, name: "check" });
    check({ kind: "machine-design", machine: checked.raw })
      .then(r => { if (seq.current === mine) setState({ kind: "done", stamp: at, result: r }); })
      .catch(() => { if (seq.current === mine) setState({ kind: "error", stamp: at }); });
  };

  return (
    <div className="learning-autodesign learning-machine-design" dir="rtl">
      <MachineBuilder ids={ids} rules={task} draft={draft} onDraft={setDraft} examples={task.examples} intro={task.intro}
        onRun={() => emit({ type: "interaction", activityId: blockId, name: "try-word" })} />

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
        {task.mode === "compute" ? (
          // AUTO-A10b — a function is judged on the inputs the reference accepts (owner decision 2026-11-25): «every input», not «every word»
          <>
            <p className="learning-autodesign-verdicthead"><IconCheck size={16} aria-hidden="true" />
              ✓ آلتك تحسب ما يحسبه النموذج على كل المدخلات حتى الطول {a?.length ?? task.maxLength}{a ? " (" + a.words + " مدخلًا)" : ""}.
            </p>
            <p className="learning-autodesign-help">الكلمات التي ليست مدخلًا للدالة لا تُفحص. وهذا فحص بكل المدخلات حتى هذا الطول، وليس برهانًا على كل المدخلات.</p>
          </>
        ) : (
          <>
            <p className="learning-autodesign-verdicthead"><IconCheck size={16} aria-hidden="true" />
              ✓ آلتك تتفق مع النموذج على كل الكلمات حتى الطول {a?.length ?? task.maxLength}{a ? " (" + a.words + " كلمة)" : ""}.
            </p>
            <p className="learning-autodesign-help">هذا فحص بكل الكلمات حتى هذا الطول، وليس برهانًا على كل الكلمات.</p>
          </>
        )}
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
