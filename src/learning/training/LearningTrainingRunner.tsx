import { useCallback, useEffect, useRef, useState } from "react";
import { IconChevronBack, IconCheck, IconClose } from "../../icons";
import StudentQuestionCard, { qid, answered, optionsFor, type Answer, type Question } from "../../StudentQuestionCard";
import type { TrainingClient, TrainingLoadResponse, TrainingSubmitResponse } from "./types";
import "./training.css";

type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "solving"; data: TrainingLoadResponse }
  | { kind: "submitting"; data: TrainingLoadResponse }
  | { kind: "result"; data: TrainingLoadResponse; outcome: TrainingSubmitResponse };

const optionText = (q: Question, index: number | null) => {
  if (index === null || index === undefined) return "";
  const o = optionsFor(q)[index];
  return o ? String(o.text || o.label || o.value || "") : "";
};

/**
 * The ONE shared Learning-Practice runner (teacher preview and student practice both mount it; only the injected
 * `client` — i.e. the auth headers — and the `actor` differ). It loads the SANITIZED exam from the safe API (no
 * answers, no hints), collects choices through the student exam's own question primitive, sends ONLY the answers,
 * and renders the server's grading: the summary line, the Strength points (student) and a per-question review with
 * the chosen/right option and the hint. Nothing here scores, and nothing is stored in the browser.
 *
 * A training is NOT an assignment: no attempt limit, no due date, no gradebook — "أعد التدريب" simply restarts.
 */
export default function LearningTrainingRunner({ trainingId, actor, client, onExit, exitLabel = "العودة" }: {
  trainingId: string;
  actor: "student" | "teacher";
  client: TrainingClient;
  onExit: () => void;
  exitLabel?: string;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [nonce, setNonce] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // The exam is loaded from the async callbacks only (the initial state is already "loading"; a retry resets it
  // from the click handler), so nothing is set synchronously inside the effect.
  useEffect(() => {
    let alive = true;
    client.load(trainingId)
      .then(data => { if (alive) setPhase({ kind: "solving", data }); })
      .catch(e => { if (alive) setPhase({ kind: "error", message: e instanceof Error ? e.message : "تعذّر فتح التدريب." }); });
    return () => { alive = false; };
  }, [trainingId, client, nonce]);

  // After a phase change (result screen / restart) bring the top of the runner into view and give it focus.
  useEffect(() => {
    if (phase.kind !== "result" && phase.kind !== "solving") return;
    rootRef.current?.scrollTo?.({ top: 0 });
    rootRef.current?.querySelector<HTMLElement>(".learning-training-title")?.focus();
  }, [phase.kind]);

  const setChoice = useCallback((id: string, index: number) => setAnswers(a => ({ ...a, [id]: { kind: "choice", index } })), []);

  async function submit(data: TrainingLoadResponse) {
    setPhase({ kind: "submitting", data });
    try {
      const outcome = await client.submit(trainingId, answers);
      setPhase({ kind: "result", data, outcome });
    } catch (e) {
      setPhase({ kind: "solving", data });
      setSubmitError(e instanceof Error ? e.message : "تعذّر إرسال الإجابات.");
    }
  }
  const [submitError, setSubmitError] = useState("");
  function restart(data: TrainingLoadResponse) {
    setAnswers({});
    setSubmitError("");
    setPhase({ kind: "solving", data });
  }

  const backButton = (
    <button type="button" className="eb-button is-quiet is-small learning-training-back" onClick={onExit}>
      <IconChevronBack size={18} className="eb-flip-rtl" aria-hidden="true" />{exitLabel}
    </button>
  );

  if (phase.kind === "loading") {
    return <div className="learning-training" dir="rtl" ref={rootRef}>{backButton}<p className="learning-training-status" role="status">جارٍ فتح التدريب...</p></div>;
  }
  if (phase.kind === "error") {
    return (
      <div className="learning-training" dir="rtl" ref={rootRef}>
        {backButton}
        <div className="learning-training-state" role="alert">
          <p className="learning-training-state-title">{phase.message}</p>
          <button type="button" className="eb-button is-primary" onClick={() => { setPhase({ kind: "loading" }); setNonce(n => n + 1); }}>إعادة المحاولة</button>
        </div>
      </div>
    );
  }

  const { data } = phase;
  const questions = data.exam.questions || [];
  const total = questions.length;
  const answeredCount = questions.filter((q, i) => answered(answers[qid(q, i)])).length;
  const maxPoints = data.training.maxPoints;

  if (phase.kind === "result") {
    const { result, practice, persisted } = phase.outcome;
    const byId = new Map(result.review.map(r => [r.questionId, r]));
    return (
      <div className="learning-training" dir="rtl" ref={rootRef}>
        {backButton}
        <section className="learning-training-result" aria-labelledby="learning-training-result-title">
          <p className="learning-training-kicker">{data.training.label}</p>
          <h2 id="learning-training-result-title" className="learning-training-title" tabIndex={-1}>{data.training.title}</h2>
          <dl className="learning-training-summary">
            <div><dt>الإجابات الصحيحة</dt><dd><span dir="ltr" className="learning-training-num">{result.correctCount} / {result.questionCount}</span> إجابات صحيحة</dd></div>
            <div><dt>النسبة</dt><dd><span dir="ltr" className="learning-training-num">{result.percentage}%</span></dd></div>
            {actor === "student" && persisted && practice && (
              <div><dt>نقاط التقوية</dt><dd><span dir="ltr" className="learning-training-num">{practice.earnedPoints} / {practice.maxPoints}</span> نقاط تقوية</dd></div>
            )}
          </dl>
          {actor === "student" && persisted && practice && (
            <p className="learning-training-note" role="status">
              {practice.improved
                ? (practice.pointsGained > 0 ? `تحسّنت أفضل نتيجتك: +${practice.pointsGained} نقاط قوة.` : "تحسّنت أفضل نتيجتك.")
                : `أفضل نتيجتك المحفوظة ما زالت ${practice.bestPercentage}% (${practice.bestPoints} / ${practice.maxPoints} نقاط تقوية) — المحاولات لا تُنقصها أبدًا.`}
            </p>
          )}
          {actor === "teacher" && <p className="learning-training-note" role="status">معاينة المعلم: النتيجة لا تُحفظ ولا تُمنح عنها نقاط.</p>}
          <div className="learning-training-actions">
            <button type="button" className="eb-button is-primary" onClick={() => restart(data)}>أعد التدريب</button>
            <button type="button" className="eb-button" onClick={onExit}>{exitLabel}</button>
          </div>
        </section>
        <section className="learning-training-review" aria-label="مراجعة الأسئلة">
          <h3 className="learning-training-subtitle">مراجعة الإجابات</h3>
          <ol className="learning-training-review-list">
            {questions.map((q, i) => {
              const row = byId.get(qid(q, i));
              const right = row?.correct === true;
              return (
                <li key={qid(q, i)} className={"learning-training-review-item " + (right ? "is-right" : "is-wrong")}>
                  <p className="learning-training-review-head">
                    <span className={"learning-training-mark " + (right ? "is-right" : "is-wrong")}>
                      {right ? <IconCheck size={14} aria-hidden="true" /> : <IconClose size={14} aria-hidden="true" />}
                      {right ? "صحيح" : "غير صحيح"}
                    </span>
                    <span className="learning-training-review-num">السؤال {row?.questionNumber ?? i + 1}</span>
                  </p>
                  <p className="learning-training-review-text">{q.text}</p>
                  <p className="learning-training-review-line"><span className="learning-training-tag">إجابتك</span>{optionText(q, row?.chosenIndex ?? null) || "لم تُجب"}</p>
                  {!right && <p className="learning-training-review-line"><span className="learning-training-tag">الإجابة الصحيحة</span>{optionText(q, row?.correctOptionIndex ?? null)}</p>}
                  {row?.hint && <p className="learning-training-review-hint"><span className="learning-training-tag">تلميح</span>{row.hint}</p>}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    );
  }

  const submitting = phase.kind === "submitting";
  return (
    <div className="learning-training" dir="rtl" ref={rootRef}>
      {backButton}
      <header className="learning-training-head">
        <p className="learning-training-kicker">{data.training.label}</p>
        <h2 className="learning-training-title" tabIndex={-1}>{data.training.title}</h2>
        <p className="learning-training-meta">
          <span>{total} أسئلة</span>
          {actor === "student" && <span>حتى {maxPoints} نقطة تقوية</span>}
          {data.best && <span>أفضل نتيجة: <span dir="ltr">{data.best.bestPercentage}%</span></span>}
        </p>
        <p className="learning-training-hintline">تدريب حرّ: أعده كما تشاء — تُحفظ أفضل نتيجة فقط ولا تُحسب كواجب.</p>
      </header>
      <div className="learning-training-questions iex-list">
        {questions.map((q, i) => {
          const id = qid(q, i);
          return (
            <StudentQuestionCard
              key={id}
              q={q}
              index={i}
              id={"training-" + id}
              answer={answers[id]}
              onChoice={n => setChoice(id, n)}
              onSeq={() => {}}
              onTable={() => {}}
              onText={() => {}}
              disabled={submitting}
            />
          );
        })}
      </div>
      <div className="learning-training-submitbar">
        <span className="learning-training-count" aria-live="polite"><span dir="ltr">{answeredCount} / {total}</span> أسئلة مُجابة</span>
        {submitError && <p className="learning-training-error" role="alert">{submitError}</p>}
        <button type="button" className="eb-button is-primary" disabled={submitting || answeredCount < total} onClick={() => submit(data)}>
          {submitting ? "جارٍ التصحيح..." : "أرسل الإجابات"}
        </button>
      </div>
    </div>
  );
}
