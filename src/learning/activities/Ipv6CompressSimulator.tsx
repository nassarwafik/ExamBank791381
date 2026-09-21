import { useMemo, useState } from "react";
import { IconCheck, IconClose } from "../../icons";
import type { LearningActivityProps } from "./engine";
import { normalizeShort, readExamples } from "./ipv6";

/**
 * Reader follow-up — `simulation / ipv6-compress / v1` (Book 791381 PDF 167).
 *
 * A tiny, LOCAL learning practice: the student is shown a FULL IPv6 address and must type its SHORTENED form. The
 * check is deterministic and offline (no grading, no persistence, no network, no rank/Strength) and uses ONLY the
 * three exact book examples from PDF 167 (v1). For v1 correctness is the book's exact short form, compared
 * case-insensitively and with surrounding whitespace ignored (`normalizeShort`): typing the full long address back,
 * or an only-partially-shortened form that is not the book's target, is WRONG — the task is «اكتب العنوان المختصر».
 * The answer is NEVER placed in the DOM before a correct check. Two hints teach the method without revealing the
 * answer. Keyboard + touch, shell reset (epoch stamp), reduced-motion aware (no motion is used anyway).
 */
export default function Ipv6CompressSimulator({ block, commands, emit }: LearningActivityProps) {
  const examples = useMemo(() => readExamples(block.config), [block.config]);
  const [state, setState] = useState({ index: 0, input: "", checked: false, hint1: false, hint2: false, epoch: 0 });
  const fresh = { index: 0, input: "", checked: false, hint1: false, hint2: false, epoch: commands.reset };
  const live = state.epoch === commands.reset ? state : fresh;

  const ex = examples[Math.min(live.index, examples.length - 1)];
  const isCorrect = (input: string) => normalizeShort(input) === normalizeShort(ex.short);   // the book's exact short form only
  const right = live.checked && isCorrect(live.input);

  const patch = (p: Partial<typeof state>, name: string, detail?: Record<string, unknown>) => {
    setState({ ...live, ...p, epoch: commands.reset });
    if (name) emit({ type: "interaction", activityId: block.id, name, detail });
  };

  return (
    <div className="learning-ipv6c" dir="rtl">
      <p className="learning-ipv6c-prompt">حوّل العنوان الكامل إلى شكله المختصر:</p>
      <p className="learning-ipv6c-full" dir="ltr" data-full={ex.long}><code>{ex.long}</code></p>

      <label className="learning-ipv6c-label" htmlFor={`${block.id}-in`}>اكتب العنوان المختصر</label>
      <div className="learning-ipv6c-row">
        <input id={`${block.id}-in`} className="learning-ipv6c-input" dir="ltr" type="text" inputMode="text" autoComplete="off" spellCheck={false}
          value={live.input} aria-label="اكتب العنوان المختصر"
          onChange={e => patch({ input: e.target.value, checked: false }, "")} />
        <button type="button" className="eb-button is-primary learning-ipv6c-check" disabled={!live.input.trim()}
          onClick={() => patch({ checked: true }, "ipv6c-check", { correct: isCorrect(live.input) })}>تحقّق</button>
      </div>

      {live.checked && (
        <p className={"learning-ipv6c-verdict " + (right ? "is-right" : "is-wrong")} role="status" aria-live="polite">
          {right
            ? <><IconCheck size={14} aria-hidden="true" /> صحيح — <code dir="ltr">{ex.short}</code></>
            : <><IconClose size={14} aria-hidden="true" /> حاول مرة أخرى — راجِع خطوتي التصغير.</>}
        </p>
      )}

      <div className="learning-ipv6c-hints">
        <button type="button" className="eb-button is-quiet" aria-pressed={live.hint1} onClick={() => patch({ hint1: !live.hint1 }, "ipv6c-hint", { n: 1 })}>تلميح ١</button>
        <button type="button" className="eb-button is-quiet" aria-pressed={live.hint2} onClick={() => patch({ hint2: !live.hint2 }, "ipv6c-hint", { n: 2 })}>تلميح ٢</button>
      </div>
      {live.hint1 && <p className="learning-ipv6c-hint" role="note">احذف الأصفار في بداية كل Hextet.</p>}
      {live.hint2 && <p className="learning-ipv6c-hint" role="note">استبدل المجموعات الصفرية المتتالية بـ «::» مرة واحدة.</p>}

      {right && examples.length > 1 && (
        <button type="button" className="eb-button learning-ipv6c-next"
          onClick={() => patch({ index: (live.index + 1) % examples.length, input: "", checked: false, hint1: false, hint2: false }, "ipv6c-next", { index: (live.index + 1) % examples.length })}>مثال آخر</button>
      )}
    </div>
  );
}
