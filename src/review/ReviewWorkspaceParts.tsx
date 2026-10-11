import { useId } from "react";
import { type ReviewCounts, type ReviewFilter, type ReviewQuestionInfo, type ReviewState, MODE_LABEL, REVIEW_FILTERS, STATE_ICON, STATE_LABEL, correctOptionIndex } from "./reviewQuestionState";

// UX-003 — presentational parts of the teacher grading workspace (AssignmentReview owns every piece of state and every API call;
// nothing here reads a key, computes a grade or talks to the server). Every status is text + icon, never colour alone.

export function ReviewStatusBadge({ info, compact }: { info: ReviewQuestionInfo; compact?: boolean }) {
  const label = STATE_LABEL[info.state] + (info.draft ? " (غير محفوظ)" : "");
  return (
    <>
      <span className={"rv-status is-" + info.state + (info.draft ? " is-draft" : "")} data-state={info.state} data-testid="rv-status">
        <span className="rv-status-icon" aria-hidden="true">{STATE_ICON[info.state]}</span>
        <span className="rv-status-text">{compact ? STATE_LABEL[info.state] : label}</span>
      </span>
      {/* RF1 — the review MODE (who decided the mark, saved or not) is a separate chip so «آلي» and «يدوي» are never confused */}
      <span className={"rv-mode is-" + info.mode} data-mode={info.mode} data-testid="rv-mode">{MODE_LABEL[info.mode]}</span>
    </>
  );
}

export function ReviewFilterBar({ filter, counts, onChange }: { filter: ReviewFilter; counts: ReviewCounts; onChange: (f: ReviewFilter) => void }) {
  return (
    <div className="rv-filters" role="group" aria-label="تصفية الأسئلة">
      {REVIEW_FILTERS.map(f => (
        <button key={f.id} type="button" className={"rv-filter" + (f.id === "pending" ? " is-pending" : "") + (filter === f.id ? " is-active" : "")} aria-pressed={filter === f.id} onClick={() => onChange(f.id)} data-filter={f.id}>
          {f.id === "pending" && <span aria-hidden="true">⏳ </span>}{f.label} <span className="rv-filter-count" dir="ltr">({counts[f.id]})</span>
        </button>
      ))}
    </div>
  );
}

export type NavigatorItem = { questionId: string; questionNumber: number; info: ReviewQuestionInfo; visible: boolean };

export function ReviewNavigator({ items, currentId, onJump, counts }: { items: NavigatorItem[]; currentId: string | null; onJump: (questionId: string) => void; counts: ReviewCounts }) {
  const headingId = "rv-nav-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <nav className="rv-nav" aria-labelledby={headingId} data-testid="rv-nav">
      <h3 id={headingId} className="rv-nav-title">مستكشف الأسئلة</h3>
      <p className="rv-nav-summary">بانتظار التصحيح اليدوي: <strong dir="ltr">{counts.pending}</strong> · تم تصحيحه يدويًا: <strong dir="ltr">{counts.manual}</strong> · مُصحَّح آليًا: <strong dir="ltr">{counts.auto}</strong> · غير محفوظ: <strong dir="ltr">{counts.draft}</strong> · المجموع: <strong dir="ltr">{counts.all}</strong></p>
      <ol className="rv-nav-grid">
        {items.map(it => (
          <li key={it.questionId}>
            <button type="button" className={"rv-nav-btn is-" + it.info.state + (it.questionId === currentId ? " is-current" : "") + (it.visible ? "" : " is-filtered")}
              aria-current={it.questionId === currentId ? "true" : undefined}
              aria-label={"السؤال " + it.questionNumber + " — " + STATE_LABEL[it.info.state] + (it.info.mode === "manual" ? " — " + MODE_LABEL.manual : it.info.draft ? " (غير محفوظ)" : "") + (it.visible ? "" : " — خارج التصفية الحالية")}
              title={STATE_LABEL[it.info.state]} onClick={() => onJump(it.questionId)}>
              <span className="rv-nav-num" dir="ltr">{it.questionNumber}</span>
              <span className="rv-nav-icon" aria-hidden="true">{STATE_ICON[it.info.state]}</span>
            </button>
          </li>
        ))}
      </ol>
      <ul className="rv-legend" aria-label="دلالة الرموز">
        {(["pending", "correct", "incorrect", "partial", "unanswered"] as ReviewState[]).map(s => <li key={s} className={"is-" + s}><span aria-hidden="true">{STATE_ICON[s]}</span> {STATE_LABEL[s]}</li>)}
        <li className="rv-legend-modes">الوضع: {MODE_LABEL.auto} · {MODE_LABEL.manual} · {MODE_LABEL.draft}</li>
      </ul>
    </nav>
  );
}

type Opt = { text?: string; label?: string; value?: string };
const optText = (o: Opt, i: number) => String(o?.text ?? o?.label ?? o?.value ?? "").trim() || "الخيار " + (i + 1);
const TRUE_FALSE: Opt[] = [{ text: "صحيح" }, { text: "غير صحيح" }];

/** Exam-style rendering of a legacy multiple-choice / true-false answer: every option as the student saw it, the student's pick and the
 *  correct option marked in text + icon. Falls back to null for every other shape (the caller keeps its existing rendering). */
export function ChoiceAnswerExamView({ type, options, studentAnswer, expectedAnswer }: { type: string; options: Opt[]; studentAnswer: unknown; expectedAnswer: unknown }) {
  const t = type.toLowerCase();
  if (t !== "multiplechoice" && t !== "truefalse") return null;
  const opts = options && options.length ? options : t === "truefalse" ? TRUE_FALSE : [];
  if (!opts.length) return null;
  const picked = studentAnswer && typeof studentAnswer === "object" && (studentAnswer as { kind?: string }).kind === "choice" ? Number((studentAnswer as { index?: unknown }).index) : null;
  const correct = correctOptionIndex(expectedAnswer, t);
  return (
    <ol className="rv-choices" data-testid="rv-choices">
      {opts.map((o, i) => {
        const isPick = picked === i, isKey = correct === i;
        const cls = "rv-choice" + (isPick ? " is-picked" : "") + (isKey ? " is-key" : "") + (isPick && correct !== null ? (isKey ? " is-right" : " is-wrong") : "");
        return (
          <li key={i} className={cls}>
            <span className="rv-choice-letter" dir="ltr" aria-hidden="true">{i + 1}</span>
            <span className="rv-choice-text">{optText(o, i)}</span>
            {isPick && <span className="rv-choice-tag is-pick">{correct === null ? "اختيار الطالب" : isKey ? "✓ اختيار الطالب — صحيح" : "✗ اختيار الطالب — خطأ"}</span>}
            {isKey && !isPick && <span className="rv-choice-tag is-key">✓ الإجابة الصحيحة</span>}
          </li>
        );
      })}
      {picked === null && <li className="rv-choice is-none"><span className="rv-choice-text">لم يختر الطالب أي خيار.</span></li>}
    </ol>
  );
}
