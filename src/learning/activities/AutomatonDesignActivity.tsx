import { useId, useMemo, useRef, useState } from "react";
import type { ActivityCheckResult, LearningActivityProps } from "./engine";
import { IconCheck, IconClose } from "../../icons";
import { readDesignTask, issueText, type DesignTask } from "./automatonDesign";
import { initialFaDraft, machineOfDraft } from "./automatonDraft";
import AutomatonBuilder from "./AutomatonBuilder";
import type { LabDraft } from "../../studentTools/automataLab";
import { copyDraft, useLabOpener } from "../../studentTools/automataLabHandoff";
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
 *
 * AUTO-A7 (docs/enterprise-automata-lab-a4.md §10) — the automata lab inside the activity (the judge does not change):
 *   • on a desktop (a fine pointer) «آلتك» is the lab's drawing editor: drag states, draw arrows, double-click for a state — within the
 *     exercise's state limit; the table stays, and is the phone's way. Where a state was put is the drawing's only (never sent);
 *   • «فحص سريع لآلتك»: what the lab sees in the learner's OWN machine — states no path reaches, the missing arrows of a complete
 *     automaton (and «أضف حالة مصيدة», the book's step). It knows nothing of the answer and never says the machine is right;
 *   • «افتح في مختبر الآلات»: a copy of the machine in the book's tool bar lab (automataLabHandoff.ts), where it can be run on many words,
 *     listed, converted, compared… Offered only where the page's tool bar has the lab, for this kind. The activity's machine stays.
 */

/** The learner's draft: the lab's own draft (automataLab.ts) of the exercise's kind and alphabet — so the lab's editor and checks apply.
 *  AUTO-A8: the builder (states, table, drawing, «جرّب كلمة», «فحص سريع») is AutomatonBuilder.tsx, shared with the exam's question. */
type Draft = LabDraft;
const shown = (w: string) => (w === "" ? "ε (الكلمة الفارغة)" : w);

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
  const [draft, setDraft] = useState<Draft>(() => initialFaDraft(task));
  const [state, setState] = useState<CheckState>({ kind: "idle" });
  const seq = useRef(0);
  const machine = useMemo(() => machineOfDraft(draft, task), [draft, task]);
  const stamp = JSON.stringify(machine);
  const current = state.kind !== "idle" && state.stamp === stamp ? state : null;
  const result = current?.kind === "done" ? current.result : null;
  const openInLab = useLabOpener(task.machine);

  const runCheck = () => {
    if (!check || current?.kind === "pending") return;
    const mine = ++seq.current, at = stamp, sent = machineOfDraft(draft, task);
    setState({ kind: "pending", stamp: at });
    emit({ type: "interaction", activityId: blockId, name: "check" });
    check({ kind: "automaton-design", machine: sent })
      .then(r => { if (seq.current === mine) setState({ kind: "done", stamp: at, result: r }); })
      .catch(() => { if (seq.current === mine) setState({ kind: "error", stamp: at }); });
  };
  const toLab = () => {
    if (!openInLab) return;
    openInLab(copyDraft(draft));
    emit({ type: "interaction", activityId: blockId, name: "open-lab" });
  };

  return (
    <div className="learning-autodesign" dir="rtl">
      <AutomatonBuilder ids={ids} rules={task} draft={draft} onDraft={setDraft} intro={task.intro} examples={task.examples}
        onTryWord={() => emit({ type: "interaction", activityId: blockId, name: "try-word" })} />

      <div className="learning-autodesign-checkbar">
        {check
          ? <button type="button" className="learning-autodesign-btn is-primary" onClick={runCheck} disabled={current?.kind === "pending"}>{current?.kind === "pending" ? "جارٍ التحقق…" : "تحقّق من الآلة"}</button>
          : <p className="learning-autodesign-help" role="note">يُفحص تصميمك عند فتح المادة من المنصة.</p>}
        {openInLab && (
          <button type="button" className="learning-autodesign-btn" onClick={toLab} title="نسخة من آلتك في مختبر الآلات: التمرين لا يتغيّر">
            افتح في مختبر الآلات
          </button>
        )}
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

