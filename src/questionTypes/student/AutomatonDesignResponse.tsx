import { useId, useMemo, useRef, useState } from "react";
import type { StudentRendererProps } from "../registryTypes";
import { projectAutomatonDesignConfigForStudent, type AutomatonDesignConfigV1 } from "../../automatonDesignQuestion";
import AutomatonBuilder from "../../learning/activities/AutomatonBuilder";
import { draftOfMachine, initialFaDraft, layoutOfDraft, machineOfDraft, type FaRules } from "../../learning/activities/automatonDraft";
import type { LabDraft } from "../../studentTools/automataLab";
import "../../learning/activities/activities.css";

// AUTO-A8 — the student renderer of automatonDesign@1 (lazy): the book exercises' own builder (AutomatonBuilder) — the states, the table
// (the phone's way), the machine drawn (on a desktop, the lab's drawing editor within the question's state limit), «جرّب كلمة» on the
// student's OWN machine, and «فحص سريع». The answer is the machine (states, start, accepting states, arrows) — never a verdict: nothing
// here knows the reference, and the grade is the server's, after the exam. AUTO-A9 — where the student put the states on the drawing
// travels beside the machine (`layout`, presentation only: the grade never reads it), so a saved answer comes back as it was left. A rules
// config that does not read shows a note — the student's answer is never touched.
export default function AutomatonDesignResponse({ q, id, answer, onAnswer, disabled }: StudentRendererProps) {
  const cfg = useMemo(() => projectAutomatonDesignConfigForStudent((q as { automatonDesign?: unknown }).automatonDesign), [q]);
  if (!cfg) return <p className="vq-unavailable" role="note" data-testid="automaton-design-unavailable">تعذّر عرض سؤال تصميم الأوتومات؛ أبلغ معلّمك.</p>;
  return <Designer key={id} cfg={cfg} answer={answer} onAnswer={onAnswer} disabled={disabled} />;
}

function Designer({ cfg, answer, onAnswer, disabled }: { cfg: AutomatonDesignConfigV1; answer: StudentRendererProps["answer"]; onAnswer: StudentRendererProps["onAnswer"]; disabled?: boolean }) {
  const ids = "ad" + useId().replace(/:/g, "");
  const rules = useMemo<FaRules>(() => ({ machine: cfg.machine, alphabet: cfg.alphabet, maxStates: cfg.maxStates, complete: cfg.complete === true }), [cfg]);
  const [draft, setDraft] = useState<LabDraft>(() => (answer?.kind === "automatonDesign" ? draftOfMachine(rules, answer.machine, answer.layout) : null) ?? initialFaDraft(rules));
  const stampOf = (d: LabDraft) => JSON.stringify([machineOfDraft(d, rules), layoutOfDraft(d) ?? null]);
  const sent = useRef(stampOf(draft));
  const onDraft = (next: LabDraft) => {
    if (disabled) return;
    setDraft(next);
    const stamp = stampOf(next);
    if (stamp === sent.current) return;                     // nothing the answer holds changed
    sent.current = stamp;
    const layout = layoutOfDraft(next);
    onAnswer({ kind: "automatonDesign", machine: machineOfDraft(next, rules), ...(layout ? { layout } : {}) });
  };
  return (
    <div className="learning-autodesign qt-automaton-response" dir="rtl" data-testid="automaton-design-response">
      <AutomatonBuilder ids={ids} rules={rules} draft={draft} onDraft={onDraft} examples={cfg.examples} disabled={disabled}
        decidedBy="هذا ما يقرّره التصحيح بعد التسليم." />
    </div>
  );
}
