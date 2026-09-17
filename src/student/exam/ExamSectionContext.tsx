import type { Answer } from "../../StudentQuestionCard";
import { type NormalizedSection, calculateSectionProgress } from "../../examStructure";
import { sectionRuleLine } from "./sectionRule";

/**
 * ExamSectionContext (UX-7b-2) — the compact section header shown above the CURRENT question of a structured
 * exam (title, position, grading rule, live section progress and — prominently on the section's first question —
 * its instructions). Presentation only: it reuses the long-form section's rule text and the shared
 * calculateSectionProgress, and never renders the section's questions.
 */
export default function ExamSectionContext({ section, sectionNumber, positionInSection, sectionSize, firstInSection, answers }: { section: NormalizedSection; sectionNumber: number; positionInSection: number; sectionSize: number; firstInSection: boolean; answers: Record<string, Answer> }) {
  const progress = calculateSectionProgress(section, answers);
  const rule = sectionRuleLine(section);
  return (
    <div className={"iex-section-context" + (firstInSection ? " is-first" : "")}>
      <div className="iex-section-context-row">
        <span className="iex-section-eyebrow">القسم {sectionNumber} · السؤال {positionInSection + 1} / {sectionSize}</span>
        {section.maxMarks != null && <span className="iex-section-mark">العلامة: {section.maxMarks}</span>}
      </div>
      <p className="iex-section-context-title">{section.title || "القسم " + sectionNumber}</p>
      {section.instructions && <p className="iex-section-instructions">{section.instructions}</p>}
      <div className="iex-section-meta">
        {rule && <span className="iex-section-rule">{rule}</span>}
        <span className="iex-section-progress">
          {progress.required != null
            ? <><strong>أجبت عن {progress.answered} من {progress.required} المطلوبة</strong>{progress.excess > 0 && <em className="iex-section-excess">أجبت عن {progress.answered} — سيُصحَّح أول {progress.required} فقط</em>}</>
            : <strong>أجبت عن {progress.answered} من {progress.total}</strong>}
        </span>
      </div>
    </div>
  );
}
