import { useId } from "react";
import Dialog from "../../ui/Dialog";
import type { Answer } from "../../StudentQuestionCard";
import type { QuestionPage } from "./questionPager";
import QuestionNavigatorList from "./QuestionNavigatorList";

/**
 * QuestionNavigatorDialog (UX-7b-2) — the shared Dialog (focus trap, Escape, body scroll lock, focus return)
 * around the shared QuestionNavigatorList. Opening it costs zero requests and never touches answers or the
 * save queue. Selecting a question calls onJump(index): the page closes the dialog, sets the index and focuses
 * the new question heading itself (see StudentExamPage) — the dialog's own opener focus-return is overridden by
 * that intentional jump focus, so focus never lands back on the "قائمة الأسئلة" trigger after a jump.
 */
export default function QuestionNavigatorDialog({ open, onClose, pages, answers, currentIndex, onJump, answeredCount }: { open: boolean; onClose: () => void; pages: QuestionPage[]; answers: Record<string, Answer>; currentIndex: number; onJump: (index: number) => void; answeredCount: number }) {
  const reactId = useId();
  const prefix = "iex-navd-" + reactId.replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <Dialog open={open} onClose={onClose} title="قائمة الأسئلة" size="md" className="iex-navigator">
      <p className="iex-navigator-summary">{answeredCount} / {pages.length} مجاب · اختر سؤالًا للانتقال إليه</p>
      <QuestionNavigatorList pages={pages} answers={answers} currentIndex={currentIndex} onJump={onJump} idPrefix={prefix} />
    </Dialog>
  );
}
