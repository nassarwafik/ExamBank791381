import type { Answer } from "../../StudentQuestionCard";
import { calculateSectionProgress } from "../../examStructure";
import { type QuestionPage, PAGE_STATUS_LABELS, groupPagesBySection, pageStatus } from "./questionPager";

/**
 * QuestionNavigatorList (UX-7b-2) — the ONE question list shared by the navigator dialog and the review
 * screen (same pages, same state, same jump action). Every button says its state in text (الحالي / مُجاب /
 * غير مُجاب), never by colour alone; "answered" is the existing answered() predicate applied to the LOCAL
 * answers map, so an answered-but-not-yet-saved question is still مُجاب here while SaveStatus reports
 * persistence separately. Structured exams are grouped by section with the shared calculateSectionProgress
 * (required / answered / extra) — no second firstN rule.
 */
export default function QuestionNavigatorList({ pages, answers, currentIndex, onJump, idPrefix }: { pages: QuestionPage[]; answers: Record<string, Answer>; currentIndex: number | null; onJump: (index: number) => void; idPrefix: string }) {
  const groups = groupPagesBySection(pages);
  return (
    <div className="iex-nav-list">
      {groups.map(group => {
        const section = group.section;
        const headingId = idPrefix + "-g" + group.sectionIndex;
        const progress = section ? calculateSectionProgress(section, answers) : null;
        return (
          <div className={"iex-nav-group" + (section ? "" : " is-flat")} key={headingId} role="group" aria-labelledby={section ? headingId : undefined}>
            {section && (
              <div className="iex-nav-group-head">
                <h3 id={headingId} className="iex-nav-group-title">القسم {group.sectionIndex + 1}{section.title ? " — " + section.title : ""}</h3>
                {progress && (
                  <p className="iex-nav-group-progress">
                    {progress.required != null
                      ? <>المطلوب {progress.required} · مُجاب {progress.answered}{progress.excess > 0 ? " · إضافي " + progress.excess : ""}</>
                      : <>مُجاب {progress.answered} / {progress.total}</>}
                  </p>
                )}
              </div>
            )}
            <div className="iex-nav-grid">
              {group.pages.map(page => {
                const status = pageStatus(page, answers, currentIndex);
                const number = page.question.displayNumber ?? page.index + 1;
                return (
                  <button
                    type="button"
                    key={page.id}
                    className={"iex-nav-q is-" + status}
                    aria-current={status === "current" ? "step" : undefined}
                    aria-label={"السؤال " + number + " — " + PAGE_STATUS_LABELS[status]}
                    onClick={() => onJump(page.index)}
                  >
                    <span className="iex-nav-q-num" aria-hidden="true">{number}</span>
                    <span className="iex-nav-q-state" aria-hidden="true">{PAGE_STATUS_LABELS[status]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
