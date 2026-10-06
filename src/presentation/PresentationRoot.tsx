import { useContext, useMemo, type CSSProperties, type ReactNode } from "react";
import { StructuredSectionQuestion, type SectionHandlers } from "../StructuredExamSection";
import { calculateSectionProgress, sectionQuestionId, selectGradedUnits, type NormalizedSection } from "../examStructure";
import type { Answer, Question } from "../StudentQuestionCard";
import { sectionRuleLine } from "../student/exam/sectionRule";
import { ExamPresentationContext } from "./presentationContext";
import { presentationCssVars, presentationRootAttributes, resolvePresentation, resolveSectionPresentation, type ResolvedPresentation } from "./presentationModel";
import { ResolvedPresentationContext, makePresentationRuntime, sectionMarksLabel, sectionShellOf } from "./presentationRuntime";
import SectionShellHeader from "./SectionShellHeader";
import "./presentation.css";

// Phase 20D.1 — the scoped presentation root shared by the student exam page and the teacher preview. It resolves the exam's stored
// presentation (a malformed value → the safe default preset, flagged data-xp-fallback) and renders ONE element carrying code-owned
// data-xp-* attributes and ONLY the --xp-* custom properties (values from validated colours / code-owned tables). Every presentation
// selector lives under .exam-presentation, so nothing outside it changes. Lifecycle chrome (top bar, timer, save status, navigation,
// submit) is rendered by the page as before; JSON cannot hide or restyle it beyond these variables.
let defaultResolved: ResolvedPresentation | null = null;
const safeDefault = () => (defaultResolved ??= resolvePresentation({ schemaVersion: 1, preset: "default" }) as ResolvedPresentation);

type RootProps = { presentation: unknown; as?: "main" | "div"; className?: string; children?: ReactNode };
export default function PresentationRoot({ presentation, as = "div", className, children }: RootProps) {
  const resolved = useMemo(() => resolvePresentation(presentation) ?? safeDefault(), [presentation]);
  const scope = useMemo(() => ({ exam: resolved, section: resolved }), [resolved]);
  const runtime = useMemo(() => makePresentationRuntime(resolved), [resolved]);
  const Tag = as;
  return (
    <ResolvedPresentationContext.Provider value={scope}>
      <ExamPresentationContext.Provider value={runtime}>
        <Tag className={(className ? className + " " : "") + "exam-presentation"} dir={resolved.direction} {...presentationRootAttributes(resolved)} style={presentationCssVars(resolved) as CSSProperties}>{children}</Tag>
      </ExamPresentationContext.Provider>
    </ResolvedPresentationContext.Provider>
  );
}

/** Re-provides the presentation for ONE section (its validated override applied; a malformed override is ignored). No DOM of its own;
 *  outside a PresentationRoot it renders its children unchanged (the legacy path never sees a provider). */
export function SectionPresentationScope({ section, children }: { section: unknown; children?: ReactNode }) {
  const outer = useContext(ResolvedPresentationContext);
  const raw = section && typeof section === "object" ? (section as { presentation?: unknown }).presentation : undefined;
  const scope = useMemo(() => (outer ? { exam: outer.exam, section: resolveSectionPresentation(outer.exam, raw) } : null), [outer, raw]);
  const runtime = useMemo(() => (scope ? makePresentationRuntime(scope.section) : null), [scope]);
  if (!scope) return <>{children}</>;
  return <ResolvedPresentationContext.Provider value={scope}><ExamPresentationContext.Provider value={runtime}>{children}</ExamPresentationContext.Provider></ResolvedPresentationContext.Provider>;
}

type SectionProps = SectionHandlers & { section: NormalizedSection; raw: unknown; sectionNumber: number; startIndex: number; answers: Record<string, Answer>; disabled?: boolean };
/** The long-form section of a PRESENTED exam (teacher preview): the shared section shell, the live rule / progress line, then each question
 *  through the same StructuredSectionQuestion the paged student runtime uses, inside the section's presentation scope. */
export function PresentationExamSection({ section, raw, sectionNumber, startIndex, answers, disabled, onChoice, onSeq, onTable, onText, onField, onPart, onAnswer }: SectionProps) {
  const { countedKeys } = selectGradedUnits(section, answers);
  const progress = calculateSectionProgress(section, answers);
  const rule = sectionRuleLine(section);
  const rendered = new Set<string>();
  return (
    <section className="iex-section xp-section">
      <SectionShellHeader section={sectionShellOf(section, raw)} index={sectionNumber - 1} marksLabel={sectionMarksLabel(section)} />
      <div className="iex-section-meta">
        {rule && <span className="iex-section-rule">{rule}</span>}
        <span className="iex-section-progress">
          {progress.required != null
            ? <><strong>أجبت عن {progress.answered} من {progress.required} المطلوبة</strong>{progress.excess > 0 && <em className="iex-section-excess">أجبت عن {progress.answered} — سيُصحَّح أول {progress.required} فقط</em>}</>
            : <strong>أجبت عن {progress.answered} من {progress.total}</strong>}
        </span>
      </div>
      <SectionPresentationScope section={raw}>
        <div className="iex-flow">{section.questions.map((q: Question, i) => {
          const id = sectionQuestionId(section, q, i);
          let showStimulus = false;
          if (q.groupId && !rendered.has(q.groupId)) { rendered.add(q.groupId); showStimulus = true; }
          return <div key={id}><StructuredSectionQuestion section={section} q={q} questionIndex={i} globalIndex={startIndex + i} answers={answers} countedKeys={countedKeys} showStimulus={showStimulus} disabled={disabled} onChoice={onChoice} onSeq={onSeq} onTable={onTable} onText={onText} onField={onField} onPart={onPart} onAnswer={onAnswer} /></div>;
        })}</div>
      </SectionPresentationScope>
    </section>
  );
}
