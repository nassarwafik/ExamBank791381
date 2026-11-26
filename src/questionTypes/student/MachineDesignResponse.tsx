import { useId, useMemo, useRef, useState } from "react";
import type { StudentRendererProps } from "../registryTypes";
import { projectMachineDesignConfigForStudent, type MachineDesignConfigV1 } from "../../machineDesignQuestion";
import MachineBuilder from "../../learning/activities/MachineBuilder";
import { draftOfMachineShape, examplesOfConfig, initialMachineDraft, machineOfLabDraft, rulesOfConfig } from "../../learning/activities/machineDraft";
import { layoutOfDraft } from "../../learning/activities/automatonDraft";
import type { LabDraft } from "../../studentTools/automataLab";
import "../../learning/activities/activities.css";

// AUTO-A11a — the student renderer of machineDesign@1 (lazy): the book exercises' own builder (MachineBuilder) — the states, the transitions
// in the course's notation with the automata lab's row editors (the phone's way), the drawing editor on a desktop, and the machine run
// step by step on any word the student types. The answer is the machine (states, start, accepting states, transitions as written) and
// where the states were put on the drawing — never a verdict: nothing here knows the reference, and the grade is the server's, after the
// exam. A rules config that does not read shows a note — the student's answer is never touched.
export default function MachineDesignResponse({ q, id, answer, onAnswer, disabled }: StudentRendererProps) {
  const cfg = useMemo(() => projectMachineDesignConfigForStudent((q as { machineDesign?: unknown }).machineDesign), [q]);
  if (!cfg) return <p className="vq-unavailable" role="note" data-testid="machine-design-unavailable">تعذّر عرض سؤال تصميم الآلة؛ أبلغ معلّمك.</p>;
  return <Designer key={id} cfg={cfg} answer={answer} onAnswer={onAnswer} disabled={disabled} />;
}

function Designer({ cfg, answer, onAnswer, disabled }: { cfg: MachineDesignConfigV1; answer: StudentRendererProps["answer"]; onAnswer: StudentRendererProps["onAnswer"]; disabled?: boolean }) {
  const ids = "mq" + useId().replace(/:/g, "");
  const rules = useMemo(() => rulesOfConfig(cfg), [cfg]);
  const examples = useMemo(() => examplesOfConfig(cfg), [cfg]);
  const [draft, setDraft] = useState<LabDraft>(() => (answer?.kind === "machineDesign" ? draftOfMachineShape(rules, answer.machine, answer.layout) : null) ?? initialMachineDraft(rules));
  const stampOf = (d: LabDraft) => JSON.stringify([machineOfLabDraft(d), layoutOfDraft(d) ?? null]);
  const sent = useRef(stampOf(draft));
  const onDraft = (next: LabDraft) => {
    if (disabled) return;
    setDraft(next);
    const stamp = stampOf(next);
    if (stamp === sent.current) return;                     // nothing the answer holds changed
    sent.current = stamp;
    const layout = layoutOfDraft(next);
    onAnswer({ kind: "machineDesign", machine: machineOfLabDraft(next), ...(layout ? { layout } : {}) });
  };
  return (
    <div className="learning-autodesign learning-machine-design qt-machine-response" dir="rtl" data-testid="machine-design-response">
      <MachineBuilder ids={ids} rules={rules} draft={draft} onDraft={onDraft} examples={examples} disabled={disabled} />
      <p className="learning-autodesign-help" role="note">
        {cfg.mode === "compute"
          ? "بعد التسليم يشغّل التصحيح آلتك والآلة النموذجية على كل المدخلات حتى طول معيّن، ويقارن الجواب بين علامتي $."
          : "بعد التسليم يشغّل التصحيح آلتك والآلة النموذجية على كل الكلمات حتى طول معيّن."}
      </p>
    </div>
  );
}
