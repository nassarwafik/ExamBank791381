import { lazy, memo, Suspense, useState, type ReactNode } from "react";
import type { BuilderQuestion, BuilderQuestionType, BuilderSection } from "../examTypes";
import type { StructuredIssue } from "../examQuality";
import type { BuilderActions } from "../builder/builderActions";
import { GRADING_POLICY_LABELS } from "../examTypes";
import { newQuestion, sectionMaxMarks } from "../examBuilderState";
import { addScenario, createQuestionInScenario, scenarioOf } from "../scenarioBuilderOps";
import InlineIssues from "../builder/InlineIssues";
import { domIdPart } from "../builder/issueIndex";
import { IconPlus, IconSettings, IconLayers } from "../icons";
import StudioQuestionCard from "./StudioQuestionCard";
const QuestionTypePalette = lazy(() => import("../questionTypes/QuestionTypePalette"));
const ScenarioBlockEditor = lazy(() => import("../scenario/ScenarioBlockEditor"));

// Phase 21F.3 / 21F.4 — the Studio canvas: the exam as a sheet. Each section is a card (number, counts, grading rule, title,
// instructions; «إعدادات القسم» opens its settings in the inspector), followed by its scenarios (the existing scenario editor) and
// its questions as Studio cards — collapsed to the student view except the ONE active card. Adding a question opens the existing
// type palette and makes the new question the active one.

type Props = {
  sections: readonly BuilderSection[];
  scope: string;
  actions: BuilderActions;
  activeId: string | null;
  selectedIds: ReadonlySet<string>;
  flashId: string;
  disabled: boolean;
  issuesOfSection: ReadonlyMap<string, readonly StructuredIssue[]>;
  questionIssuesOfSection: ReadonlyMap<string, ReadonlyMap<string, readonly StructuredIssue[]>>;
  revealedQuestions: ReadonlyMap<string, number>;
  onActivate: (questionId: string) => void;
  onDeactivate: () => void;
  onOpenSection: (sectionId: string) => void;
  onOpenMedia: () => void;
  onAddSection: () => void;
  /** Banners and the bulk-selection bar, shown above the sheet. */
  header?: ReactNode;
  /** Phase 21F.5 — the insert bar between two cards (absent: no insert bars). */
  renderInsert?: (sectionId: string, position: number) => ReactNode;
};

const qCount = (n: number) => (n === 1 ? "سؤال واحد" : n === 2 ? "سؤالان" : n >= 3 && n <= 10 ? n + " أسئلة" : n + " سؤالًا");
const mCount = (n: number) => (n === 1 ? "علامة واحدة" : n === 2 ? "علامتان" : n >= 3 && n <= 10 ? n + " علامات" : n + " علامة");

export default memo(StudioCanvas);

function StudioCanvas(props: Props) {
  const { sections, scope, actions, disabled, onActivate, onAddSection, header, renderInsert } = props;
  // The type palette, opened for one section (and, from a scenario, for that scenario: the new question joins it).
  const [palette, setPalette] = useState<{ sectionId: string; scenarioId: string | null } | null>(null);
  const addPicked = (q: BuilderQuestion) => {
    const target = palette;
    setPalette(null);
    if (!target) return;
    const section = sections.find(s => s.id === target.sectionId);
    if (!section) return;
    if (target.scenarioId) { const next = createQuestionInScenario(section, target.scenarioId, q); actions.patchSection(scope, section.id, { scenarios: next.scenarios, questions: next.questions }); }
    else actions.addQuestion(scope, section.id, q);
    onActivate(q.examQuestionId);
  };
  return (
    <main className="st-canvas" aria-label="محتوى الامتحان" data-studio-scroller>
      <div className="st-sheet">
        {header}
        {sections.map((section, si) => (
          <StudioSection key={section.id} {...props} section={section} index={si} onAddQuestion={() => setPalette({ sectionId: section.id, scenarioId: null })}
            onAddToScenario={scenarioId => setPalette({ sectionId: section.id, scenarioId })} renderInsert={renderInsert} />
        ))}
        <button type="button" className="st-add-zone" onClick={onAddSection} disabled={disabled}><IconPlus size={15} aria-hidden="true" />إضافة قسم</button>
      </div>
      {palette && (
        <Suspense fallback={null}>
          <QuestionTypePalette open onClose={() => setPalette(null)} onPick={key => addPicked(newQuestion(key as BuilderQuestionType))} onPickNode={q => addPicked(q)} />
        </Suspense>
      )}
    </main>
  );
}

function StudioSection({ section, index, scope, actions, activeId, selectedIds, flashId, disabled, issuesOfSection, questionIssuesOfSection, revealedQuestions, onActivate, onDeactivate, onOpenSection, onOpenMedia, onAddQuestion, onAddToScenario, renderInsert }: Props & { section: BuilderSection; index: number; onAddQuestion: () => void; onAddToScenario: (scenarioId: string) => void }) {
  const scenarios = Array.isArray(section.scenarios) ? section.scenarios : [];
  const sectionIssues = issuesOfSection.get(section.id);
  const qIssues = questionIssuesOfSection.get(section.id);
  const applySection = (next: BuilderSection) => { if (next !== section) actions.patchSection(scope, section.id, { scenarios: next.scenarios, questions: next.questions }); };
  return (
    <>
      <section className="st-section-card" data-section-id={section.id} tabIndex={-1} aria-label={"القسم " + (index + 1) + ": " + (section.title || "قسم بلا عنوان")}>
        <div className="st-section-row">
          <span className="st-section-eyebrow">القسم {index + 1}</span>
          <span className="st-section-meta">{qCount(section.questions.length)} · {mCount(sectionMaxMarks(section))} · {GRADING_POLICY_LABELS[section.gradingPolicy] ?? ""}</span>
          <span className="st-grow" />
          <button type="button" className="st-btn is-ghost is-small" onClick={() => onOpenSection(section.id)} aria-label={"إعدادات القسم " + (index + 1)}><IconSettings size={15} aria-hidden="true" />إعدادات القسم</button>
        </div>
        {sectionIssues && <InlineIssues id={"sb-issues-s-" + domIdPart(section.id)} issues={sectionIssues} label={"مشكلات القسم " + (index + 1)} />}
        <h3>{section.title || "قسم بلا عنوان"}</h3>
        {section.instructions?.trim() && <p className="st-instr">{section.instructions}</p>}
      </section>
      {scenarios.length > 0 && (
        <Suspense fallback={<p className="st-summary-note" role="status">جارٍ تحميل محرر السيناريو…</p>}>
          <ol className="sb-scenarios st-scenarios" aria-label={"سيناريوهات القسم " + (index + 1)}>
            {scenarios.map((sc, i) => <ScenarioBlockEditor key={sc.id} section={section} scenario={sc} index={i} total={scenarios.length} disabled={disabled} onSection={applySection} onCreateQuestion={() => onAddToScenario(sc.id)} />)}
          </ol>
        </Suspense>
      )}
      {renderInsert?.(section.id, 0)}
      {section.questions.map((q, i) => {
        const sc = scenarioOf(section, q.examQuestionId);
        return (
          <div key={q.examQuestionId} className="st-card-slot">
            <StudioQuestionCard question={q} index={i} total={section.questions.length} sectionId={section.id} scope={scope} actions={actions}
              active={activeId === q.examQuestionId} selected={selectedIds.has(q.examQuestionId)} flash={flashId === q.examQuestionId} disabled={disabled}
              issues={qIssues?.get(q.examQuestionId)} revealIssues={revealedQuestions.get(q.examQuestionId)} scenarioLabel={sc ? (sc.title?.trim() || "سيناريو") : undefined}
              onActivate={onActivate} onDeactivate={onDeactivate} onOpenMedia={onOpenMedia} />
            {renderInsert?.(section.id, i + 1)}
          </div>
        );
      })}
      <div className="st-section-end">
        <button type="button" className="st-add-zone" onClick={onAddQuestion} disabled={disabled} aria-haspopup="dialog" data-add-question data-add-question-section={section.id}><IconPlus size={15} aria-hidden="true" />إضافة سؤال إلى القسم {index + 1}</button>
        <button type="button" className="st-add-zone" onClick={() => applySection(addScenario(section))} disabled={disabled}><IconLayers size={15} aria-hidden="true" />إضافة سيناريو</button>
      </div>
    </>
  );
}
