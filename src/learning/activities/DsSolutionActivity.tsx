import { useMemo, useState } from "react";
import Dialog from "../../ui/Dialog";
import type { LearningActivityProps } from "./engine";
import { readDsSolution } from "./ds";
import { Marked, Spans } from "./DsDraw";
import DsTraceView from "./DsTraceView";

/**
 * DS-A3 (docs/enterprise-data-structures-course.md) — `guided / ds-solution / v1`: the solution of a homework question.
 *
 * The page shows one button, «الحل». Pressing it opens a WINDOW (the shared modal Dialog: labelled, focus-trapped, Escape and
 * backdrop close, focus back to the button) with the solution: the answer, the reasoning step by step, the solution's code,
 * what a correct solution must contain, and — when the author recorded one — the trace of the solution to step through.
 * Nothing is shown before the learner asks, so the question can be attempted first. Data only: the steps and the answer are the
 * guided block's own safe spans; code, checklist and trace are read by a strict reader (ds.ts). No timers, no network, no
 * persistence; closing the window forgets its trace position.
 */
export default function DsSolutionActivity({ block, emit }: LearningActivityProps) {
  const cfg = useMemo(() => readDsSolution(block.config), [block.config]);
  const [opened, setOpened] = useState(0);        // 0 = closed; each opening gets a new number, so the trace restarts
  const [count, setCount] = useState(0);
  if (block.type !== "guided" || !cfg) return <p className="learning-trace-empty" role="note">هذا الحل غير متوفر حاليًا.</p>;

  const open = () => { setCount(count + 1); setOpened(count + 1); emit({ type: "interaction", activityId: block.id, name: "solution-open" }); };
  return (
    <div className="learning-ds learning-ds-solution">
      <p className="learning-ds-solution-hint">حاول أولًا، ثم قارن حلّك.</p>
      <button type="button" className="learning-trace-btn is-next learning-ds-solution-btn" aria-haspopup="dialog" onClick={open}>الحل</button>
      <Dialog open={opened > 0} title={block.title} onClose={() => setOpened(0)} size="lg" className="learning-ds-solution-dialog">
        <div className="learning-ds-solution-body">
          {block.result && <p className="learning-ds-solution-answer"><span className="learning-trace-label">الجواب:</span> <Spans spans={block.result} /></p>}
          <section aria-label="شرح الحل">
            <h4 className="learning-trace-heading">شرح الحل</h4>
            <ol className="learning-ds-solution-steps">
              {block.steps.map(s => <li key={s.id}><Spans spans={s.text} /></li>)}
            </ol>
          </section>
          {cfg.code && (
            <section aria-label="كود الحل">
              <h4 className="learning-trace-heading">كود الحل</h4>
              <ol className="learning-trace-code" dir="ltr" tabIndex={0} aria-label="كود الحل">
                {cfg.code.split("\n").map((l, i) => (
                  <li key={i} className="learning-trace-line"><span className="learning-trace-lineno" aria-hidden="true">{i + 1}</span><code className="learning-trace-linecode">{l || " "}</code></li>
                ))}
              </ol>
            </section>
          )}
          {cfg.checklist.length > 0 && (
            <section aria-label="ما يُفحص في الحل">
              <h4 className="learning-trace-heading">ما يُفحص في الحل</h4>
              <ul className="learning-ds-solution-checklist">{cfg.checklist.map((t, i) => <li key={i}><Marked text={t} /></li>)}</ul>
            </section>
          )}
          {cfg.trace && (
            <section aria-label="تتبّع الحل">
              <h4 className="learning-trace-heading">تتبّع الحل خطوة بخطوة</h4>
              <DsTraceView cfg={cfg.trace} epoch={opened} />
            </section>
          )}
          {block.explanation && <p className="learning-ds-solution-note">{block.explanation}</p>}
        </div>
      </Dialog>
    </div>
  );
}
