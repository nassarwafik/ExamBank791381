import { useCallback, useEffect, useState } from "react";
import StudentQuestionCard, { qid, answered, type Answer, type FieldValue, type Question } from "../../StudentQuestionCard";
import { IconCheck, IconClose } from "../../icons";
import type { ExamItemCheckResponse, ExamItemHost, ExamItemLoadResponse, ExamItemQuestionResult } from "../training/types";
import "./examItem.css";

// 791381s Phase 8C-2 (docs/enterprise-791381s-enrichment-plan.md §11.4) — the LAZY view of an advanced exam item inside the Reader.
// It loads the SANITIZED exam from the host (the platform's student projection — no key), renders every question through the
// student exam's own question card (registered types answer through `onAnswer`, legacy kinds through their own handlers), and
// sends ONLY the answers to «تحقّق». The official grader's verdict comes back per question: ✓ / ✕ / «يُصحَّح يدويًا» (with words,
// never colour only), the score line and — for an answered question — the item's explanation. Any edit clears the verdict;
// «أعد المحاولة» empties the answers. Practice only: nothing is persisted, and nothing is scored in the browser.

type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: ExamItemLoadResponse };
type Check = { kind: "idle" } | { kind: "pending" } | { kind: "error"; message: string } | { kind: "done"; outcome: ExamItemCheckResponse };

const questionsOf = (data: ExamItemLoadResponse): Question[] => (data.exam.sections ? data.exam.sections.flatMap(s => s.questions || []) : data.exam.questions || []);

export default function ExamItemView({ itemId, host }: { itemId: string; host: ExamItemHost }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [check, setCheck] = useState<Check>({ kind: "idle" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    host.load(itemId)
      .then(data => { if (alive) setPhase({ kind: "ready", data }); })
      .catch(e => { if (alive) setPhase({ kind: "error", message: e instanceof Error ? e.message : "تعذّر فتح السؤال." }); });
    return () => { alive = false; };
  }, [host, itemId, nonce]);

  // Every answer change clears a verdict on screen (it belonged to the answers that were checked).
  const edit = useCallback((id: string, next: (prev: Answer | undefined) => Answer) => {
    setAnswers(a => ({ ...a, [id]: next(a[id]) }));
    setCheck(c => (c.kind === "done" || c.kind === "error" ? { kind: "idle" } : c));
  }, []);
  const onChoice = (id: string, index: number) => edit(id, () => ({ kind: "choice", index }));
  const onSeq = (id: string, n: number, v: string) => edit(id, prev => { const values = prev?.kind === "sequence" ? [...prev.values] : []; values[n] = v; return { kind: "sequence", values }; });
  const onTable = (id: string, n: number, v: string | boolean) => edit(id, prev => { const values = prev?.kind === "table" ? [...prev.values] : []; values[n] = v; return { kind: "table", values }; });
  const onText = (id: string, v: string) => edit(id, () => ({ kind: "text", value: v }));
  const onField = (id: string, f: string, v: FieldValue) => edit(id, prev => ({ kind: "fields", values: { ...(prev?.kind === "fields" ? prev.values : {}), [f]: v } }));
  const onAnswer = (id: string, next: Answer) => edit(id, () => next);

  if (phase.kind === "loading") return <p className="learning-examitem-status" role="status">جارٍ تحميل السؤال…</p>;
  if (phase.kind === "error") {
    return (
      <div className="learning-examitem-status" role="alert">
        <p>{phase.message}</p>
        <button type="button" className="eb-button is-small" onClick={() => { setPhase({ kind: "loading" }); setNonce(n => n + 1); }}>إعادة المحاولة</button>
      </div>
    );
  }

  const questions = questionsOf(phase.data);
  const answeredCount = questions.filter((q, i) => answered(answers[qid(q, i)])).length;
  const outcome = check.kind === "done" ? check.outcome : null;
  const byId = new Map<string, ExamItemQuestionResult>((outcome?.result.questions ?? []).map(r => [r.questionId, r]));
  const runCheck = () => {
    if (check.kind === "pending" || answeredCount === 0) return;
    const sent = { ...answers };
    setCheck({ kind: "pending" });
    host.check(itemId, sent)
      .then(o => setCheck({ kind: "done", outcome: o }))
      .catch(e => setCheck({ kind: "error", message: e instanceof Error ? e.message : "تعذّر التحقق الآن. حاول مرة أخرى." }));
  };
  const restart = () => { setAnswers({}); setCheck({ kind: "idle" }); };

  return (
    <div className="learning-examitem" data-testid="exam-item-view">
      <div className="learning-examitem-questions iex-list">
        {questions.map((q, i) => {
          const id = qid(q, i);
          const row = byId.get(id);
          return (
            <div key={id} className={"learning-examitem-q" + (row ? (row.manualReview ? " is-manual" : row.correct ? " is-right" : " is-wrong") : "")}>
              <StudentQuestionCard
                q={q} index={i} id={"examitem-" + itemId + "-" + id} answer={answers[id]}
                onChoice={n => onChoice(id, n)} onSeq={(n, v) => onSeq(id, n, v)} onTable={(n, v) => onTable(id, n, v)}
                onText={v => onText(id, v)} onField={(f, v) => onField(id, f, v)} onAnswer={next => onAnswer(id, next)}
                disabled={check.kind === "pending"}
              />
              {row && (
                <div className="learning-examitem-verdict" role="note">
                  {row.manualReview
                    ? <p className="learning-examitem-mark">يحتاج هذا السؤال إلى تصحيح المعلّم.</p>
                    : !row.answered
                      ? <p className="learning-examitem-mark">لم تُجب عن هذا السؤال.</p>
                      : row.correct
                        ? <p className="learning-examitem-mark is-right"><IconCheck size={15} aria-hidden="true" />صحيح — <span dir="ltr">{row.score} / {row.maxMarks}</span></p>
                        : <p className="learning-examitem-mark is-wrong"><IconClose size={15} aria-hidden="true" />غير صحيح — <span dir="ltr">{row.score} / {row.maxMarks}</span>{row.parts ? <> · الأجزاء الصحيحة: <span dir="ltr">{row.parts.correct} / {row.parts.total}</span></> : null}</p>}
                  {row.explanation && <p className="learning-examitem-explanation">{row.explanation}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="learning-examitem-bar" role="status" aria-live="polite">
        {outcome
          ? <p className="learning-examitem-score">نتيجتك: <span dir="ltr">{outcome.result.score} / {outcome.result.totalMarks}</span> — للتدريب فقط، لا تُسجَّل علامة.</p>
          : <p className="learning-examitem-count">أجبت عن <span dir="ltr">{answeredCount}</span> من <span dir="ltr">{questions.length}</span></p>}
        {check.kind === "error" && <p className="learning-examitem-error">{check.message}</p>}
        <span className="learning-examitem-actions">
          {!outcome && (
            <button type="button" className="eb-button is-primary is-small" disabled={answeredCount === 0 || check.kind === "pending"} onClick={runCheck}>
              {check.kind === "pending" ? "جارٍ التحقق…" : "تحقّق"}
            </button>
          )}
          {(outcome || answeredCount > 0) && <button type="button" className="eb-button is-small" onClick={restart}>أعد المحاولة</button>}
        </span>
      </div>
    </div>
  );
}
