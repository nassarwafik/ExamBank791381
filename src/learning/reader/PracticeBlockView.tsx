import { useEffect, useId, useRef, useState } from "react";
import { IconCheck, IconClose } from "../../icons";
import { hintLadder, type PracticeQuestion } from "../content/types";
import { localEvaluator, revealNextHint, INITIAL_FEEDBACK_STATE, type LearningFeedbackState, type LearningResponse } from "../practice/evaluator";
import { practiceQuestionKey } from "../study/eligibility";
import type { StudyAttemptResponse, StudyHost, StudyReveal } from "../study/types";

/** A server check of one answer (L.6b): in flight, answered, or not reachable (never shown as a wrong answer). */
type ServerCheck = { stamp: string; kind: "pending" } | { stamp: string; kind: "done"; r: StudyAttemptResponse } | { stamp: string; kind: "error" };
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
 *
 * STUDY PRACTICE STRENGTH: when a study HOST is injected (a student session), a locally-right answer of an ELIGIBLE
 * exercise is reported once to the server, which alone judges it and decides the points; the view then shows the
 * server's outcome — «+n نقطة قوة» when the module's Strength rose, a quiet «محسوبة سابقًا» for a repeat, «سُجّل
 * الدراسة لهذه الصفحة» once the page is full — and nothing on a transport failure. Without a host nothing is sent.
 *
 * SERVER CHECK (L.6b): a SERVED block carries no key, no feedback and no hint (`serverCheck` instead). Every answer is then sent
 * to the host, and the verdict, the message, the hints and the explanation shown are the server's reply for that answer. While
 * the reply is on its way the view says so; when the server cannot be reached it says that and offers a retry — a transport
 * failure is never shown as a wrong answer. Each distinct answer is asked once per mount. Without a host a served block is
 * shown statically. An authored block (the key in the content: tests and tools) keeps the local checker above.
 *
 * REVEAL MODE (791381s Phase 2, `reveal`): the owner's «يختار الطالب، يظهر الخطأ بالأحمر والصحيح بالأخضر مع شرح بسيط تحته».
 * After an answer the question locks: the chosen wrong option turns red (✕ إجابتك), the right option green (✓ الإجابة الصحيحة),
 * and the explanation shows under the verdict for a right or a wrong answer alike; «أعد السؤال» clears it. No hint ladder. The
 * right answer comes from the server's reply to that answer (served block) or from the authored key (tools/tests) — never before
 * an answer. A right answer after a shown answer earns nothing: the server says `revealedBefore`, and the local path never
 * reports it either.
 */
export default function PracticeBlockView({ question, activityId, pageId, study, serverCheck = false, studyEligible = true, reveal = false, onVerdict }: {
  question: PracticeQuestion; activityId?: string; pageId?: string; study?: StudyHost;
  /** Reveal mode (see the header): lock after an answer and show the right answer with the explanation. */
  reveal?: boolean;
  /** Told the verdict on screen (right / wrong, or null when cleared / undecided) — the practice page's running score. */
  onVerdict?: (activityId: string, verdict: "right" | "wrong" | null) => void;
  /** The block arrived without its answer material (L.6b): the server judges every answer. */
  serverCheck?: boolean;
  /** False for a self-check block (`studyEligible: false`): judged, never recorded. */
  studyEligible?: boolean;
}) {
  const baseId = useId();
  const [response, setResponse] = useState<LearningResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState<LearningFeedbackState>(INITIAL_FEEDBACK_STATE);
  const [outcome, setOutcome] = useState<StudyAttemptResponse | null>(null);
  const reportedRef = useRef<string | null>(null);        // the response the server ACCEPTED (never re-reported)
  const revealedRef = useRef(false);                      // reveal mode: the right answer was shown after a wrong answer
  const inFlightRef = useRef<string | null>(null);        // the response currently being reported (never duplicated)
  const latestStampRef = useRef<string | null>(null);     // the answer currently on screen (a late outcome for an old answer is dropped)
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const [check, setCheck] = useState<ServerCheck | null>(null);
  const checkedRef = useRef(new Map<string, StudyAttemptResponse>());   // server replies of this mount, by answer
  const askingRef = useRef(new Set<string>());                          // answers whose server check is in flight
  // SERVER mode: a served block of a kind with an answering surface, and a host to ask.
  const server = serverCheck && hasInteractiveSurface(question);
  const serverReady = server && !!study && !!activityId && !!pageId;
  const eligible = studyEligible && !!study && !!activityId && !!pageId && (server || practiceQuestionKey(question) !== null);
  // Interactive ONLY for kinds that have a complete answering surface below (multipleChoice / trueFalse /
  // shortInput) AND an answer key. A keyed `fillBlank` (supported by the evaluator, no per-blank input here yet)
  // keeps the controlled static surface — never a prompt with a "answer to see the result" footer and no field.
  const hasKey = serverReady || (!server && hasInteractiveSurface(question) && localEvaluator.evaluate(question, probeResponse(question)).status !== "unknown");
  const local = !server && response ? localEvaluator.evaluate(question, response) : null;
  const reply = server && check?.kind === "done" ? check.r : null;
  const status: "empty" | "right" | "wrong" | "checking" | "unreachable" = !response ? "empty"
    : server ? (check?.kind === "pending" ? "checking" : check?.kind === "error" ? "unreachable" : reply ? (reply.correct ? "right" : "wrong") : "checking")
    : local?.status === "correct" ? "right" : local && local.status !== "unknown" ? "wrong" : "empty";
  const message = server ? reply?.feedback?.message : local?.message;
  const explanation = server ? reply?.feedback?.explanation : question.feedback?.explanation;
  const ladder = reveal ? [] : server ? (reply?.feedback?.hints ?? []) : hintLadder(question.feedback);
  // Reveal mode: the right answer, known only once an answer has been judged (the server's reply, or the authored key).
  const revealed: StudyReveal | null = !reveal || (status !== "right" && status !== "wrong") ? null
    : server ? (reply?.reveal ?? null) : localReveal(question);
  const locked = reveal && (status === "right" || status === "wrong");
  // Remember that the right answer was shown after a wrong answer (declared before the reporting effect, which reads it).
  useEffect(() => { if (locked && status === "wrong") revealedRef.current = true; }, [locked, status]);
  const shownHints = ladder.slice(0, feedback.revealedHints);
  const feedbackId = baseId + "-fb";

  // Ask the server about ONE answer (server mode): a reply already received is reused, an answer in flight is never asked
  // twice, and only the reply for the answer on screen is shown (a late reply to an older answer is kept for reuse only).
  const ask = (r: LearningResponse) => {
    if (!serverReady || !study || !pageId || !activityId) return;
    const stamp = JSON.stringify(r);
    latestStampRef.current = stamp;
    const known = checkedRef.current.get(stamp);
    if (known) { setCheck({ stamp, kind: "done", r: known }); return; }
    setCheck({ stamp, kind: "pending" });
    if (askingRef.current.has(stamp)) return;
    askingRef.current.add(stamp);
    study.report(pageId, activityId, r as never)
      .then(res => {
        checkedRef.current.set(stamp, res);
        if (mountedRef.current && latestStampRef.current === stamp) { setCheck({ stamp, kind: "done", r: res }); setOutcome(res); }
      })
      .catch(() => { if (mountedRef.current && latestStampRef.current === stamp) setCheck({ stamp, kind: "error" }); })
      .finally(() => { askingRef.current.delete(stamp); });
  };
  const answer = (r: LearningResponse) => { setResponse(r); setOutcome(null); if (server) ask(r); };
  const clear = () => { setResponse(null); setDraft(""); setFeedback(INITIAL_FEEDBACK_STATE); setOutcome(null); setCheck(null); if (server) latestStampRef.current = null; };

  // Report a right answer ONCE: a response the server accepted is never re-reported (re-picking it is deduplicated),
  // a response in flight is never duplicated by a re-render, and a TRANSPORT FAILURE releases the marker so the same
  // right answer can be reported again (the server stays authoritative and idempotent — a retry can never farm).
  useEffect(() => {
    if (server) return;                                    // server mode: every answer was already asked (see `ask`)
    if (reveal && revealedRef.current) return;             // reveal mode: the answer was shown after a wrong one → never reported
    if (!eligible || !study || !activityId || !pageId || !response || status !== "right") { latestStampRef.current = null; return; }
    const stamp = JSON.stringify(response);
    latestStampRef.current = stamp;
    if (reportedRef.current === stamp || inFlightRef.current === stamp) return;
    inFlightRef.current = stamp;
    study.report(pageId, activityId, response as never)
      .then(r => { reportedRef.current = stamp; if (mountedRef.current && latestStampRef.current === stamp) setOutcome(r); })
      .catch(() => { /* quiet: the local verdict stands; the marker is released so a later pick reports again */ })
      .finally(() => { if (inFlightRef.current === stamp) inFlightRef.current = null; });
  }, [server, reveal, eligible, study, activityId, pageId, response, status]);

  // The practice page's running score: the verdict on screen, or null while there is none.
  const verdictNow: "right" | "wrong" | null = status === "right" || status === "wrong" ? status : null;
  useEffect(() => { if (onVerdict && activityId) onVerdict(activityId, verdictNow); }, [onVerdict, activityId, verdictNow]);

  if (!hasKey) return <StaticPractice question={question} offline={server} />;

  return (
    <div className={"learning-reader-practice is-interactive" + (status === "empty" ? "" : " is-" + status)}>
      <p className="learning-reader-practice-prompt" id={baseId + "-q"}>{question.prompt}</p>

      {question.kind === "multipleChoice" && (
        <div className="learning-reader-practice-options" role="radiogroup" aria-labelledby={baseId + "-q"}>
          {question.options.map(o => {
            const picked = response?.kind === "multipleChoice" && response.optionId === o.id;
            const isAnswer = revealed?.kind === "multipleChoice" && revealed.optionIds.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={picked}
                aria-disabled={locked || undefined}
                className={"learning-reader-practice-option" + (picked ? " is-picked is-" + status : "") + (isAnswer ? " is-answer" : "")}
                onClick={locked ? undefined : () => answer({ kind: "multipleChoice", optionId: o.id })}
              >
                <span className="learning-reader-practice-radio" aria-hidden="true">{picked ? "●" : "○"}</span>
                <span className="learning-reader-practice-optiontext">{o.text}</span>
                {locked && <RevealTag picked={picked} isAnswer={isAnswer} />}
              </button>
            );
          })}
        </div>
      )}

      {question.kind === "trueFalse" && (
        <div className="learning-reader-practice-options" role="radiogroup" aria-labelledby={baseId + "-q"}>
          {[{ value: true, label: "صح" }, { value: false, label: "خطأ" }].map(o => {
            const picked = response?.kind === "trueFalse" && response.value === o.value;
            const isAnswer = revealed?.kind === "trueFalse" && revealed.answer === o.value;
            return (
              <button key={o.label} type="button" role="radio" aria-checked={picked} aria-disabled={locked || undefined}
                className={"learning-reader-practice-option" + (picked ? " is-picked is-" + status : "") + (isAnswer ? " is-answer" : "")}
                onClick={locked ? undefined : () => answer({ kind: "trueFalse", value: o.value })}>
                <span className="learning-reader-practice-radio" aria-hidden="true">{picked ? "●" : "○"}</span>
                <span className="learning-reader-practice-optiontext">{o.label}</span>
                {locked && <RevealTag picked={picked} isAnswer={isAnswer} />}
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
            onChange={e => { setDraft(e.target.value); if (response) { setResponse(null); setCheck(null); if (server) latestStampRef.current = null; } }}
          />
          <button type="submit" className="eb-button is-primary is-small" disabled={!draft.trim()}>تحقّق</button>
        </form>
      )}

      {(status === "checking" || status === "unreachable") && (
        <div id={feedbackId} className={"learning-reader-practice-verdict is-" + status} role="status">
          {status === "checking"
            ? <p className="learning-reader-practice-feedback">جارٍ التحقق من إجابتك…</p>
            : <p className="learning-reader-practice-feedback">تعذّر التحقق من إجابتك الآن. تحقق من الاتصال ثم أعد المحاولة.</p>}
          {status === "unreachable" && response && <button type="button" className="eb-button is-small" onClick={() => ask(response)}>أعد المحاولة</button>}
        </div>
      )}

      {(status === "right" || status === "wrong") && (
        <div id={feedbackId} className={"learning-reader-practice-verdict is-" + status} role="status">
          <p className="learning-reader-practice-feedback">
            {status === "right"
              ? <><IconCheck size={14} aria-hidden="true" />✓ صحيح</>
              : reveal
                ? <><IconClose size={14} aria-hidden="true" /><span>✕ إجابة خاطئة{revealText(question, revealed) && <> — الإجابة الصحيحة: <strong>{revealText(question, revealed)}</strong></>}</span></>
                : <><IconClose size={14} aria-hidden="true" />✕ غير صحيح — حاول مرة أخرى</>}
          </p>
          {message && <p className="learning-reader-practice-message">{message}</p>}
          {(status === "right" || reveal) && explanation && <p className="learning-reader-practice-explain"><span className="learning-reader-practice-explain-label">الشرح: </span>{explanation}</p>}
          {status === "right" && outcome?.revealedBefore && <p className="learning-reader-study-outcome is-revealed" role="status">عُرضت الإجابة الصحيحة لهذا السؤال من قبل، لذلك لا تُحسب له نقاط قوة.</p>}
          {status === "right" && outcome && !outcome.revealedBefore && <StudyOutcome outcome={outcome} />}
          {status === "wrong" && shownHints.length > 0 && (
            <ol className="learning-reader-practice-hints" aria-label="التلميحات">
              {shownHints.map((h, i) => <li key={i}><span className="learning-reader-practice-hintno">تلميح {i + 1}</span>{h}</li>)}
            </ol>
          )}
        </div>
      )}

      <div className="learning-reader-practice-foot">
        <p className="learning-reader-practice-hint">{reveal
          ? (eligible ? "اختر إجابتك: تظهر الإجابة الصحيحة والشرح فورًا. إذا أجبت صحيحًا من أول مرة تُسجَّل لك وترفع نقاط قوة هذه الوحدة." : "اختر إجابتك: تظهر الإجابة الصحيحة والشرح فورًا. لا يُحفظ شيء ولا تُحسب نقاط.")
          : eligible ? "تمرين ذاتي: أجب لترى النتيجة فورًا. أول إجابة صحيحة تُسجَّل لك مرة واحدة وترفع نقاط قوة هذه الوحدة (حتى 20 نقطة للوحدة)." : "تمرين ذاتي: أجب لترى النتيجة فورًا. لا يُحفظ شيء ولا تُحسب نقاط."}</p>
        <div className="learning-reader-practice-actions">
          {status === "wrong" && feedback.revealedHints < ladder.length && (
            <button type="button" className="eb-button is-quiet is-small" onClick={() => setFeedback(s => (server ? { ...s, revealedHints: Math.min(s.revealedHints + 1, ladder.length) } : revealNextHint(question.feedback, s)))}>
              {feedback.revealedHints === 0 ? "ماذا أفحص؟ (تلميح)" : "تلميح آخر"}
            </button>
          )}
          {(response !== null || feedback.revealedHints > 0) && (
            <button type="button" className="eb-button is-quiet is-small" onClick={clear}>{reveal ? "أعد السؤال" : "امسح الإجابة"}</button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The SERVER's study outcome for a right answer — one quiet, truthful line, never colour-only, never animated:
 *  A) actual gain → «+n نقطة قوة» · B) repeat → «محسوبة سابقًا» · C) the module is complete → «أكملت … هذه الوحدة» ·
 *  D) recorded, but the module's rounded value did not move yet → «سُجّل … » with the module's progress. */
export function StudyOutcome({ outcome }: { outcome: StudyAttemptResponse }) {
  if (!outcome.correct || outcome.actor !== "student" || outcome.study === false) return null;
  if (outcome.gained > 0) return <p className="learning-reader-study-outcome is-gained" role="status">+{outcome.gained} نقطة قوة — أحسنت، واصل الدراسة. <span dir="ltr">{outcome.module.points} / {outcome.module.max}</span> من هذه الوحدة.</p>;
  if (outcome.alreadyCompleted) return <p className="learning-reader-study-outcome is-repeat" role="status">هذا التمرين محسوب سابقًا.</p>;
  if (outcome.module.points >= outcome.module.max) return <p className="learning-reader-study-outcome is-module-full" role="status">أكملت نقاط قوة هذه الوحدة: <span dir="ltr">{outcome.module.points} / {outcome.module.max}</span></p>;
  return <p className="learning-reader-study-outcome is-recorded" role="status">سُجّل التمرين ({outcome.module.completed} من {outcome.module.eligible} في هذه الوحدة) — نقاط قوة الوحدة: <span dir="ltr">{outcome.module.points} / {outcome.module.max}</span>.</p>;
}

/** Reveal mode: the tag beside an option once the question is locked — never colour-only (icon + words). */
function RevealTag({ picked, isAnswer }: { picked: boolean; isAnswer: boolean }) {
  if (isAnswer) return <span className="learning-reader-practice-revealtag is-answer"><IconCheck size={14} aria-hidden="true" />الإجابة الصحيحة</span>;
  if (picked) return <span className="learning-reader-practice-revealtag is-wrong"><IconClose size={14} aria-hidden="true" />إجابتك</span>;
  return null;
}

/** The right answer of an AUTHORED question (tools / tests; a served block gets it from the server's reply). */
function localReveal(question: PracticeQuestion): StudyReveal | null {
  if (question.kind === "multipleChoice") { const ids = question.options.filter(o => o.correct === true).map(o => o.id); return ids.length ? { kind: "multipleChoice", optionIds: ids } : null; }
  if (question.kind === "trueFalse" && typeof question.answer === "boolean") return { kind: "trueFalse", answer: question.answer };
  return null;
}

/** The right answer as words for the verdict line («الإجابة الصحيحة: …»), or "" when unknown. */
function revealText(question: PracticeQuestion, revealed: StudyReveal | null): string {
  if (!revealed) return "";
  if (revealed.kind === "trueFalse") return revealed.answer ? "صح" : "خطأ";
  if (question.kind !== "multipleChoice") return "";
  return question.options.filter(o => revealed.optionIds.includes(o.id)).map(o => o.text).join(" · ");
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

/** The pre-existing STATIC shape for a question without an answer key: prompt + option texts / an input hint. `offline`: a
 *  served block (its key is on the server) shown where no server check is available. */
function StaticPractice({ question, offline = false }: { question: PracticeQuestion; offline?: boolean }) {
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
      <p className="learning-reader-practice-hint">{offline ? "التحقق من هذه الإجابة يتم على المنصة، وهو غير متاح هنا." : "سيتوفر التحقق من الإجابة في مرحلة لاحقة."}</p>
    </div>
  );
}
