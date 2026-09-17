import { IconChevronBack } from "../../icons";

/**
 * ExamBottomNavigation (UX-7b-2) — the sticky Previous / Next bar of the paged exam. Presentation only: it
 * receives the current position and three callbacks. "التالي" is NAVIGATION only and never submits; on the
 * final question it becomes "مراجعة الإجابات", which opens the local review screen (still no request — the
 * final submit lives on the review screen, never next to Previous/Next).
 */
export default function ExamBottomNavigation({ index, total, onPrevious, onNext, onReview }: { index: number; total: number; onPrevious: () => void; onNext: () => void; onReview: () => void }) {
  const last = total > 0 && index >= total - 1;
  return (
    <nav className="iex-bottom-nav" aria-label="التنقل بين الأسئلة">
      <button type="button" className="eb-button iex-nav-prev" onClick={onPrevious} disabled={index <= 0}>
        <IconChevronBack size={16} className="eb-flip-rtl" aria-hidden="true" />السابق
      </button>
      <span className="iex-bottom-nav-pos" aria-hidden="true">{total > 0 ? index + 1 : 0} / {total}</span>
      {last
        ? <button type="button" className="eb-button is-primary iex-nav-review" onClick={onReview}>مراجعة الإجابات<IconChevronBack size={16} aria-hidden="true" /></button>
        : <button type="button" className="eb-button is-primary iex-nav-next" onClick={onNext} disabled={total === 0}>التالي<IconChevronBack size={16} aria-hidden="true" /></button>}
    </nav>
  );
}
