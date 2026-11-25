import { useId, useMemo, useRef, useState } from "react";
import type { StudentRendererProps } from "../registryTypes";
import { projectAutomatonDesignConfigForStudent, type AutomatonDesignConfigV1 } from "../../automatonDesignQuestion";
import AutomatonBuilder from "../../learning/activities/AutomatonBuilder";
import { draftOfMachine, initialFaDraft, machineOfDraft, type FaRules } from "../../learning/activities/automatonDraft";
import type { LabDraft } from "../../studentTools/automataLab";
import "../../learning/activities/activities.css";

// AUTO-A8 — the student renderer of automatonDesign@1 (lazy): the book exercises' own builder (AutomatonBuilder) — the states, the table
// (the phone's way), the machine drawn (on a desktop, the lab's drawing editor within the question's state limit), «جرّب كلمة» on the
// student's OWN machine, and «فحص سريع». The answer is the machine (states, start, accepting states, arrows) — never the drawing's layout,
// never a verdict: nothing here knows the reference, and the grade is the server's, after the exam. A saved answer is shown again (the
// drawing in the book's automatic layout). A rules config that does not read shows a note — the student's answer is never touched.
export default function AutomatonDesignResponse({ q, id, answer, onAnswer, disabled }: StudentRendererProps) {
  const cfg = useMemo(() => projectAutomatonDesignConfigForStudent((q as { automatonDesign?: unknown }).automatonDesign), [q]);
  if (!cfg) return <p className="vq-unavailable" role="note" data-testid="automaton-design-unavailable">تعذّر عرض سؤال تصميم الأوتومات؛ أبلغ معلّمك.</p>;
  return <Designer key={id} cfg={cfg} answer={answer} onAnswer={onAnswer} disabled={disabled} />;
}

function Designer({ cfg, answer, onAnswer, disabled }: { cfg: AutomatonDesignConfigV1; answer: StudentRendererProps["answer"]; onAnswer: StudentRendererProps["onAnswer"]; disabled?: boolean }) {
  const ids = "ad" + useId().replace(/:/g, "");
  const rules = useMemo<FaRules>(() => ({ machine: cfg.machine, alphabet: cfg.alphabet, maxStates: cfg.maxStates, complete: cfg.complete === true }), [cfg]);
  const [draft, setDraft] = useState<LabDraft>(() => (answer?.kind === "automatonDesign" ? draftOfMachine(rules, answer.machine) : null) ?? initialFaDraft(rules));
  const sent = useRef(JSON.stringify(machineOfDraft(draft, rules)));
  const onDraft = (next: LabDraft) => {
    if (disabled) return;
    setDraft(next);
    const machine = machineOfDraft(next, rules), stamp = JSON.stringify(machine);
    if (stamp === sent.current) return;                     // a state moved on the drawing: the same machine, nothing to save
    sent.current = stamp;
    onAnswer({ kind: "automatonDesign", machine });
  };
  return (
    <div className="learning-autodesign qt-automaton-response" dir="rtl" data-testid="automaton-design-response">
      <AutomatonBuilder ids={ids} rules={rules} draft={draft} onDraft={onDraft} examples={cfg.examples} disabled={disabled}
        decidedBy="هذا ما يقرّره التصحيح بعد التسليم." />
    </div>
  );
}
