import { useId, useState } from "react";
import { IconCheck, IconClose } from "../../icons";
import { hintLadder, type PracticeQuestion } from "../content/types";
import { localEvaluator, revealNextHint, INITIAL_FEEDBACK_STATE, type LearningFeedbackState, type LearningResponse } from "../practice/evaluator";

/**
 * Inline learning practice (جرّب بنفسك) — the immediate, LOCAL checker for a `practice` block.
 *
 * Pedagogy contract (Units 4–6 standard): the student answers → the verdict is immediate and never colour-only
 * (icon + word) → a WRONG answer shows what to CHECK (the authored `incorrectFeedback`) and offers the ordered hint
 * ladder one rung at a time (تلميح 1 → تلميح 2 → …) → a RIGHT answer shows the authored `correctFeedback` and the
 * explanation → everything is retryable in place. It is learning practice only: component-local state, nothing
 * stored, sent or scored — no Strength points, no medals, no assignment record, no project effect.
 *
 * Answer-key discipline: before the student answers, nothing from the key reaches the DOM (no `correct` flag, no
 * hint, no feedback text, no attribute); feedback appears only for the answer actually given, and class names never
 * spell the key (`is-right` / `is-wrong`). A question WITHOUT an answer key (the evaluator says "unknown"), or of
 * a kind whose interactive surface is not implemented here yet (`fillBlank`), renders the static shape with a note
 * — exactly the pre-existing behaviour.
 */
export default function PracticeBlockView({ question }: { question: PracticeQuestion }) {
  const baseId = useId();
  const [response, setResponse] = useState<LearningResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState<LearningFeedbackState>(INITIAL_FEEDBACK_STATE);
  // Interactive ONLY for kinds that have a complete answering surface below (multipleChoice / trueFalse /
  // shortInput) AND an answer key. A keyed `fillBlank` (supported by the evaluator, no per-blank input here yet)
  // keeps the controlled static surface — never a prompt with a "answer to see the result" footer and no field.
  const hasKey = hasInteractiveSurface(question) && localEvaluator.evaluate(question, probeResponse(question)).status !== "unknown";
  const result = response ? localEvaluator.evaluate(question, response) : null;
  const status = result?.status === "correct" ? "right" : result && result.status !== "unknown" ? "wrong" : "empty";
  const ladder = hintLadder(question.feedback);
  const shownHints = ladder.slice(0, feedback.revealedHints);
  const feedbackId = baseId + "-fb";

  const answer = (r: LearningResponse) => { setResponse(r); };
  const clear = () => { setResponse(null); setDraft(""); setFeedback(INITIAL_FEEDBACK_STATE); };

  if (!hasKey) return <StaticPractice question={question} />;

  return (
    <div className={"learning-reader-practice is-interactive" + (status === "empty" ? "" : " is-" + status)}>
      <p className="learning-reader-practice-prompt" id={baseId + "-q"}>{question.prompt}</p>

      {question.kind === "multipleChoice" && (
        <div className="learning-reader-practice-options" role="radiogroup" aria-labelledby={baseId + "-q"}>
          {question.options.map(o => {
            const picked = response?.kind === "multipleChoice" && response.optionId === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={picked}
                className={"learning-reader-practice-option" + (picked ? " is-picked is-" + status : "")}
                onClick={() => answer({ kind: "multipleChoice", optionId: o.id })}
              >
                <span className="learning-reader-practice-radio" aria-hidden="true">{picked ? "●" : "○"}</span>
                <span className="learning-reader-practice-optiontext">{o.text}</span>
              </button>
            );
          })}
        </div>
      )}

      {question.kind === "trueFalse" && (
        <div className="learning-reader-practice-options" role="radiogroup" aria-labelledby={baseId + "-q"}>
          {[{ value: true, label: "صح" }, { value: false, label: "خطأ" }].map(o => {
            const picked = response?.kind === "trueFalse" && response.value === o.value;
            return (
              <button key={o.label} type="button" role="radio" aria-checked={picked}
                className={"learning-reader-practice-option" + (picked ? " is-picked is-" + status : "")}
                onClick={() => answer({ kind: "trueFalse", value: o.value })}>
                <span className="learning-reader-practice-radio" aria-hidden="true">{picked ? "●" : "○"}</span>
                <span className="learning-reader-practice-optiontext">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {question.kind === "shortInput" && (
        <form className="learning-reader-practice-form" onSubmit={e => { e.preventDefault(); if (draft.trim()) answer({ kind: "shortInput", text: draft }); }}>
          <input
            className={"learning-reader-practice-textinput" + (status === "empty" ? "" : " is-" + status)}
            dir="ltr"
            inputMode="text"
            autoComplete="off"
            aria-labelledby={baseId + "-q"}
            aria-describedby={status === "empty" ? undefined : feedbackId}
            value={draft}
            onChange={e => { setDraft(e.target.value); if (response) setResponse(null); }}
          />
          <button type="submit" className="eb-button is-primary is-small" disabled={!draft.trim()}>تحقّق</button>
        </form>
      )}

      {status !== "empty" && (
        <div id={feedbackId} className={"learning-reader-practice-verdict is-" + status} role="status">
          <p className="learning-reader-practice-feedback">
            {status === "right"
              ? <><IconCheck size={14} aria-hidden="true" />✓ صحيح</>
              : <><IconClose size={14} aria-hidden="true" />✕ غير صحيح — حاول مرة أخرى</>}
          </p>
          {result?.message && <p className="learning-reader-practice-message">{result.message}</p>}
          {status === "right" && question.feedback?.explanation && <p className="learning-reader-practice-explain">{question.feedback.explanation}</p>}
          {status === "wrong" && shownHints.length > 0 && (
            <ol className="learning-reader-practice-hints" aria-label="التلميحات">
              {shownHints.map((h, i) => <li key={i}><span className="learning-reader-practice-hintno">تلميح {i + 1}</span>{h}</li>)}
            </ol>
          )}
        </div>
      )}

      <div className="learning-reader-practice-foot">
        <p className="learning-reader-practice-hint">تمرين ذاتي: أجب لترى النتيجة فورًا. لا يُحفظ شيء ولا تُحسب نقاط.</p>
        <div className="learning-reader-practice-actions">
          {status === "wrong" && feedback.revealedHints < ladder.length && (
            <button type="button" className="eb-button is-quiet is-small" onClick={() => setFeedback(s => revealNextHint(question.feedback, s))}>
              {feedback.revealedHints === 0 ? "ماذا أفحص؟ (تلميح)" : "تلميح آخر"}
            </button>
          )}
          {(response !== null || feedback.revealedHints > 0) && (
            <button type="button" className="eb-button is-quiet is-small" onClick={clear}>امسح الإجابة</button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The kinds that have a complete interactive answering surface in this view. */
function hasInteractiveSurface(question: PracticeQuestion): boolean {
  return question.kind === "multipleChoice" || question.kind === "trueFalse" || question.kind === "shortInput";
}

/** A throwaway response of the question's kind, used only to ask the evaluator whether a key exists at all. */
function probeResponse(question: PracticeQuestion): LearningResponse {
  switch (question.kind) {
    case "multipleChoice": return { kind: "multipleChoice", optionId: "" };
    case "trueFalse": return { kind: "trueFalse", value: true };
    case "shortInput": return { kind: "shortInput", text: "" };
    case "fillBlank": return { kind: "fillBlank", texts: [] };
  }
}

/** The pre-existing STATIC shape for a question without an answer key: prompt + option texts / an input hint. */
function StaticPractice({ question }: { question: PracticeQuestion }) {
  return (
    <div className="learning-reader-practice">
      <p className="learning-reader-practice-prompt">{question.prompt}</p>
      {question.kind === "multipleChoice" && (
        <ul className="learning-reader-practice-options">
          {question.options.map(o => <li key={o.id} className="learning-reader-practice-option">{o.text}</li>)}
        </ul>
      )}
      {question.kind === "trueFalse" && (
        <ul className="learning-reader-practice-options">
          <li className="learning-reader-practice-option">صح</li>
          <li className="learning-reader-practice-option">خطأ</li>
        </ul>
      )}
      {(question.kind === "shortInput" || question.kind === "fillBlank") && (
        <p className="learning-reader-practice-input" aria-hidden="true">✎ ________</p>
      )}
      <p className="learning-reader-practice-hint">سيتوفر التحقق من الإجابة في مرحلة لاحقة.</p>
    </div>
  );
}
