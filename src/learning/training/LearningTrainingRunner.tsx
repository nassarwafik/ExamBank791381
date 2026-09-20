import { useCallback, useEffect, useRef, useState } from "react";
import { IconChevronBack, IconCheck, IconClose } from "../../icons";
import StudentQuestionCard, { qid, answered, optionsFor, type Answer, type FieldValue, type Question } from "../../StudentQuestionCard";
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
/** The learner's OWN answer of a non-choice question (matching / table / sequence / open text) as plain text. */
const answerText = (a: Answer | undefined): string => {
  if (!a) return "";
  if (a.kind === "text") return a.value.trim();
  if (a.kind === "sequence" || a.kind === "table") return a.values.map(v => (typeof v === "boolean" ? (v ? "صحيح" : "غير صحيح") : String(v ?? ""))).filter(v => v !== "").join(" · ");
  if (a.kind === "fields") return Object.values(a.values).map(v => (Array.isArray(v) ? v.join(" ") : String(v ?? ""))).filter(v => v !== "").join(" · ");
  return "";
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
  // The other answer kinds the student exam's question primitive collects (matching / table pairs, word-bank
  // sequences, open text, generalized fields) — the final exams for training (F01–F06) mix them with MCQs. The
  // shapes are the student exam's own `Answer` union; the server grades them with the same grader.
  const setSeq = useCallback((id: string, index: number, value: string) => setAnswers(a => {
    const prev = a[id];
    const values = prev?.kind === "sequence" ? [...prev.values] : [];
    values[index] = value;
    return { ...a, [id]: { kind: "sequence", values } };
  }), []);
  const setTable = useCallback((id: string, index: number, value: string | boolean) => setAnswers(a => {
    const prev = a[id];
    const values = prev?.kind === "table" ? [...prev.values] : [];
    values[index] = value;
    return { ...a, [id]: { kind: "table", values } };
  }), []);
  const setText = useCallback((id: string, value: string) => setAnswers(a => ({ ...a, [id]: { kind: "text", value } })), []);
  const setField = useCallback((id: string, fieldId: string, value: FieldValue) => setAnswers(a => {
    const prev = a[id];
    return { ...a, [id]: { kind: "fields", values: { ...(prev?.kind === "fields" ? prev.values : {}), [fieldId]: value } } };
  }), []);

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
  // The SERVER decides whether this item feeds Unified Strength (T-series yes, F-series final exams no). The runner
  // only mirrors it: no Strength-point promise, ceiling or gain is ever shown for an item the server marks ineligible.
  const strengthEligible = data.training.strengthEligible !== false && maxPoints > 0;

  if (phase.kind === "result") {
    const { result, practice, persisted } = phase.outcome;
    const byId = new Map(result.review.map(r => [r.questionId, r]));
    const manualCount = result.review.filter(r => r.manualReview === true && r.correct !== true).length;
    return (
      <div className="learning-training" dir="rtl" ref={rootRef}>
        {backButton}
        <section className="learning-training-result" aria-labelledby="learning-training-result-title">
          <p className="learning-training-kicker">{data.training.label}</p>
          <h2 id="learning-training-result-title" className="learning-training-title" tabIndex={-1}>{data.training.title}</h2>
          <dl className="learning-training-summary">
            <div><dt>الإجابات الصحيحة</dt><dd><span dir="ltr" className="learning-training-num">{result.correctCount} / {result.questionCount}</span> إجابات صحيحة</dd></div>
            <div><dt>النسبة</dt><dd><span dir="ltr" className="learning-training-num">{result.percentage}%</span></dd></div>
            {actor === "student" && persisted && practice && strengthEligible && (
              <div><dt>نقاط التقوية</dt><dd><span dir="ltr" className="learning-training-num">{practice.earnedPoints} / {practice.maxPoints}</span> نقاط تقوية</dd></div>
            )}
          </dl>
          {manualCount > 0 && (
            <p className="learning-training-note learning-training-note-manual" role="status">
              النسبة المعروضة تلقائية: {manualCount === 1 ? "سؤال مقالي واحد" : `${manualCount} أسئلة مقالية`} لا يُصحَّح تلقائيًا، وعلاماته غير مُحتسبة في النتيجة التلقائية.
            </p>
          )}
          {actor === "student" && persisted && practice && strengthEligible && (
            <p className="learning-training-note" role="status">
              {practice.improved
                ? (practice.pointsGained > 0 ? `تحسّنت أفضل نتيجتك: +${practice.pointsGained} نقاط قوة.` : "تحسّنت أفضل نتيجتك.")
                : `أفضل نتيجتك المحفوظة ما زالت ${practice.bestPercentage}% (${practice.bestPoints} / ${practice.maxPoints} نقاط تقوية) — المحاولات لا تُنقصها أبدًا.`}
            </p>
          )}
          {actor === "student" && persisted && practice && !strengthEligible && (
            <p className="learning-training-note" role="status">
              {practice.improved ? "تحسّنت أفضل نتيجتك التلقائية." : `أفضل نتيجتك التلقائية المحفوظة ما زالت ${practice.bestPercentage}% — المحاولات لا تُنقصها أبدًا.`}
              {" "}امتحان للتدريب: لا يمنح نقاط تقوية.
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
              const id = qid(q, i);
              const row = byId.get(id);
              const right = row?.correct === true;
              const manual = row?.manualReview === true && !right;
              const own = answers[id];
              const mine = own?.kind === "choice" ? optionText(q, row?.chosenIndex ?? own.index) : answerText(own);
              const key = row?.correctOptionIndex !== null && row?.correctOptionIndex !== undefined ? optionText(q, row.correctOptionIndex) : (row?.correctText || "");
              return (
                <li key={id} className={"learning-training-review-item " + (right ? "is-right" : manual ? "is-manual" : "is-wrong")}>
                  <p className="learning-training-review-head">
                    <span className={"learning-training-mark " + (right ? "is-right" : manual ? "is-manual" : "is-wrong")}>
                      {right ? <IconCheck size={14} aria-hidden="true" /> : <IconClose size={14} aria-hidden="true" />}
                      {right ? "صحيح" : manual ? "لا يُصحَّح تلقائيًا" : "غير صحيح"}
                    </span>
                    <span className="learning-training-review-num">السؤال {row?.questionNumber ?? i + 1}</span>
                  </p>
                  <p className="learning-training-review-text">{q.text}</p>
                  <p className="learning-training-review-line"><span className="learning-training-tag">إجابتك</span>{mine || "لم تُجب"}</p>
                  {!right && key && <p className="learning-training-review-line"><span className="learning-training-tag">الإجابة الصحيحة</span>{key}</p>}
                  {manual && <p className="learning-training-review-line learning-training-review-manual">سؤال مقالي لا يُصحَّح تلقائيًا؛ علامته غير مُحتسبة في النتيجة التلقائية لهذا التدريب.</p>}
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
          {actor === "student" && strengthEligible && <span>حتى {maxPoints} نقطة تقوية</span>}
          {actor === "student" && !strengthEligible && <span>امتحان للتدريب — بلا نقاط تقوية</span>}
          {data.best && <span>أفضل نتيجة: <span dir="ltr">{data.best.bestPercentage}%</span></span>}
        </p>
        <p className="learning-training-hintline">
          {strengthEligible
            ? "تدريب حرّ: أعده كما تشاء — تُحفظ أفضل نتيجة فقط ولا تُحسب كواجب."
            : "امتحان للتدريب الحرّ: أعده كما تشاء — تُحفظ أفضل نتيجة تلقائية فقط، لا يُحسب كواجب ولا يمنح نقاط تقوية؛ الأسئلة المقالية لا تُصحَّح تلقائيًا."}
        </p>
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
              onSeq={(n, v) => setSeq(id, n, v)}
              onTable={(n, v) => setTable(id, n, v)}
              onText={v => setText(id, v)}
              onField={(f, v) => setField(id, f, v)}
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
