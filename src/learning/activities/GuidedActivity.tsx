import { useState } from "react";
import RichTextRenderer from "../reader/RichTextRenderer";
import type { LearningActivityProps } from "./engine";

/**
 * Built-in GUIDED presenter (حل مع المعلم) — progressive reveal of a structured guided block:
 *
 *   Prompt → "think first" → step 1 → step 2 → … → result / explanation
 *
 * It is generic, content-driven and ships in production (it is NOT a registered simulation, so the production
 * activity registry stays empty). State is a single reveal counter kept in React state only (NO persistence). The
 * student reveals one step at a time with a real button (keyboard-accessible, ≥44px). Restart is the shell's
 * generic `reset` command (this built-in declares the `reset` capability, so the shell shows exactly one restart
 * control and this presenter reacts to the signal). Text is safe structured spans — never raw HTML. Reduced
 * motion disables the reveal transition (`data-reduced-motion`).
 */
export default function GuidedActivity({ block, reducedMotion, commands, emit }: LearningActivityProps) {
  // Reveal progress is stamped with the shell's reset EPOCH (`commands.reset`). A reset bumps the epoch, so any
  // progress stamped with an older epoch simply derives to 0 — a pure derivation, no effect, no cascading render.
  const [reveal, setReveal] = useState({ count: 0, epoch: 0 });
  const revealed = reveal.epoch === commands.reset ? reveal.count : 0;

  if (block.type !== "guided") return null;
  const steps = block.steps;
  const total = steps.length;
  const done = revealed >= total;

  const revealNext = () => {
    const next = Math.min(revealed + 1, total);
    setReveal({ count: next, epoch: commands.reset });
    emit({ type: "interaction", activityId: block.id, name: "guided-reveal", detail: { step: next, of: total } });
  };

  return (
    <div className="learning-guided" data-reduced-motion={reducedMotion || undefined} data-revealed={revealed}>
      {block.prompt && <p className="learning-guided-prompt"><RichTextRenderer spans={block.prompt} /></p>}
      {revealed === 0 && (
        <p className="learning-guided-think" role="note">فكّر أولًا في الحل، ثم اكشف الخطوات واحدةً تلو الأخرى.</p>
      )}
      {revealed > 0 && (
        <ol className="learning-guided-steps" aria-label="خطوات الحل">
          {steps.slice(0, revealed).map((s, i) => (
            <li key={s.id} className="learning-guided-step" data-step-id={s.id}>
              <span className="learning-guided-stepno" aria-hidden="true">{i + 1}</span>
              <span className="learning-guided-steptext"><RichTextRenderer spans={s.text} /></span>
              {s.note && <span className="learning-guided-stepnote">{s.note}</span>}
            </li>
          ))}
        </ol>
      )}
      {done && block.result && (
        <p className="learning-guided-result"><span className="learning-guided-tag">النتيجة</span><RichTextRenderer spans={block.result} /></p>
      )}
      {done && block.explanation && <p className="learning-guided-explain">{block.explanation}</p>}
      <p className="learning-guided-progress" aria-live="polite">الخطوة {Math.min(revealed, total)} من {total}</p>
      {!done && (
        <div className="learning-guided-controls">
          <button type="button" className="eb-button is-primary learning-guided-btn" onClick={revealNext}>
            {revealed === 0 ? "اعرض الخطوة الأولى" : "اعرض الخطوة التالية"}
          </button>
        </div>
      )}
    </div>
  );
}
