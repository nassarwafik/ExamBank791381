import { useId, type RefObject } from "react";
import { IconCheck, IconChevronBack, IconWarning } from "../../icons";
import type { Answer } from "../../StudentQuestionCard";
import { type NormalizedSection, calculateSectionProgress } from "../../examStructure";
import { type QuestionPage, countAnsweredPages } from "./questionPager";
import { unavailablePages } from "./renderFailures";
import QuestionNavigatorList from "./QuestionNavigatorList";

/**
 * ExamReviewScreen (UX-7b-2) — the LOCAL review state entered from the final question's "مراجعة الإجابات".
 * It is not a submission and performs no request: it summarises answered / unanswered counts, lists the same
 * firstN shortfalls the submit confirmation reports (shared calculateSectionProgress — no second rule), shows
 * every question with its status through the shared QuestionNavigatorList (jump back to any question), and
 * offers the final "تسليم الامتحان" — which calls the page's EXISTING submit() so the existing ConfirmDialog,
 * offline guard, pre-submit save, save queue, attempt identity and 409 reconciliation stay the only gate.
 * Phase 21E.3 (assessment integrity): a question whose renderer could not recover and that has no answer is counted apart
 * («تعذّر عرضه», never among «غير مُجاب») with a note that it will not be treated as a wrong answer.
 */
export default function ExamReviewScreen({ title, pages, answers, sections, headingRef, onJump, onBackToAnswering, onSubmit, submitBusy, submitDisabled, unavailable }: {
  title: string;
  pages: QuestionPage[];
  answers: Record<string, Answer>;
  sections: NormalizedSection[];
  headingRef: RefObject<HTMLHeadingElement | null>;
  onJump: (index: number) => void;
  onBackToAnswering: () => void;
  onSubmit: () => void;
  submitBusy: boolean;
  submitDisabled: boolean;
  unavailable?: ReadonlySet<string>;
}) {
  const reactId = useId();
  const prefix = "iex-review-" + reactId.replace(/[^a-zA-Z0-9_-]/g, "");
  const total = pages.length;
  const answeredCount = countAnsweredPages(pages, answers);
  const unavailableCount = unavailable ? unavailablePages(pages, answers, unavailable).length : 0;
  const unanswered = total - answeredCount - unavailableCount;
  const shortfalls = sections
    .filter(s => s.gradingPolicy === "firstNAnswered" && s.requiredAnswers != null)
    .map(s => ({ s, p: calculateSectionProgress(s, answers) }))
    .filter(x => x.p.required != null && x.p.answered < x.p.required);
  return (
    <section className="iex-review" aria-labelledby={prefix + "-h"}>
      <h2 id={prefix + "-h"} className="iex-review-title" tabIndex={-1} ref={headingRef}>مراجعة الإجابات</h2>
      <p className="iex-review-exam">{title}</p>
      <dl className="iex-review-stats">
        <div><dt>الأسئلة</dt><dd>{total}</dd></div>
        <div><dt>مُجاب</dt><dd>{answeredCount}</dd></div>
        <div className={unanswered > 0 ? "is-warn" : ""}><dt>غير مُجاب</dt><dd>{unanswered}</dd></div>
        {unavailableCount > 0 && <div className="is-warn is-unavailable" data-testid="review-unavailable-count"><dt>تعذّر عرضه</dt><dd>{unavailableCount}</dd></div>}
      </dl>
      {unanswered > 0 && <p className="iex-review-note" role="note"><IconWarning size={14} aria-hidden="true" />توجد {unanswered} أسئلة بلا إجابة. يمكنك الانتقال إلى أي سؤال من القائمة أدناه.</p>}
      {unavailableCount > 0 && <p className="iex-review-note is-unavailable" role="note" data-testid="review-unavailable-note"><IconWarning size={14} aria-hidden="true" />{unavailableCount === 1 ? "تعذّر عرض سؤال واحد" : "تعذّر عرض " + unavailableCount + " أسئلة"} بسبب مشكلة تقنية في التحميل ولم تُجب عنه{unavailableCount === 1 ? "" : "ا"}. لن يُحتسب ذلك كإجابة خاطئة: سيُحال إلى المعلم للمراجعة قبل اعتماد العلامة. يمكنك الانتقال إليه من القائمة ومحاولة التحميل مجددًا.</p>}
      {shortfalls.length > 0 && (
        <ul className="iex-review-shortfalls">
          {shortfalls.map(x => <li key={x.s.id}><IconWarning size={14} aria-hidden="true" />أجبت عن {x.p.answered} من {x.p.required} بنود مطلوبة{x.s.title ? " في «" + x.s.title + "»" : ""}.</li>)}
        </ul>
      )}
      <QuestionNavigatorList pages={pages} answers={answers} currentIndex={null} onJump={onJump} idPrefix={prefix} unavailable={unavailable} />
      <div className="iex-review-actions">
        <button type="button" className="eb-button is-quiet iex-review-back" onClick={onBackToAnswering}><IconChevronBack size={16} className="eb-flip-rtl" aria-hidden="true" />العودة للحل</button>
        <button type="button" className="eb-button primary iex-submit" onClick={onSubmit} disabled={submitDisabled}>{submitBusy ? "جارٍ التصحيح..." : <><IconCheck size={16} aria-hidden="true" />تسليم الامتحان</>}</button>
      </div>
    </section>
  );
}
