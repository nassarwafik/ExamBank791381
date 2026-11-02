import "./console.css";

/**
 * Tadris+ P4-A — Stepper: the steps of a multi-step task as an ordered list; the current step carries aria-current="step" and
 * the completed ones say so in words (never colour or a tick alone). Presentation only: the caller owns the progress.
 */
export type StepItem = { id: string; label: string };

export default function Stepper({ label, steps, currentId }: { label: string; steps: StepItem[]; currentId: string }) {
  const current = Math.max(0, steps.findIndex(s => s.id === currentId));
  return (
    <ol className="eb-stepper" aria-label={label}>
      {steps.map((s, i) => {
        const state = i < current ? "complete" : i === current ? "current" : "upcoming";
        return (
          <li key={s.id} className={"eb-step is-" + state} aria-current={state === "current" ? "step" : undefined}>
            <span>{s.label}</span>
            {state === "complete" && <span className="eb-visually-hidden"> (مكتملة)</span>}
          </li>
        );
      })}
    </ol>
  );
}
