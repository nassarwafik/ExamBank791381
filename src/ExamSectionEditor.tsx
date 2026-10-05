
import type { BuilderSection, GradingPolicy, AnswerUnit } from "./examTypes";
import { GRADING_POLICY_LABELS } from "./examTypes";
import { SECTION_PRESETS, gradingRuleExplanation, newQuestion, changeSectionPolicy } from "./examBuilderState";
import { lazy, Suspense, useState } from "react";
import type { BuilderQuestionType } from "./examTypes";
// Phase 16A — the Question Type Palette is lazy (its own chunk); it hands back a KEY and the canonical factory creates the question.
const QuestionTypePalette = lazy(() => import("./questionTypes/QuestionTypePalette"));
// Phase 19G — the Scenario card (shared sources + linked questions) is lazy too: its own chunk, loaded only for a section that has one.
const ScenarioBlockEditor = lazy(() => import("./scenario/ScenarioBlockEditor"));
import { addScenario, createQuestionInScenario, scenarioOf } from "./scenarioBuilderOps";
import { SECTION_INSTRUCTION_TEMPLATES, findSectionInstructionTemplate } from "./instructionTemplates";
import StructuredQuestionEditor from "./StructuredQuestionEditor";
import StimulusEditor from "./StimulusEditor";
import type { BuilderQuestion, BuilderImageAsset } from "./examTypes";
import type { AiImageRequestQuestion } from "./questionMedia";
import type { AssessmentBlueprintV1 } from "./assessmentTypes";

// One section: its settings (title / instructions / grading policy + policy-specific inputs / preset),
// its shared stimuli, and its questions. Question-level mutations are delegated up via `mutateQuestions`
// (the parent applies the pure examBuilderState helpers) so this component stays presentational.

type Props = {
  section: BuilderSection;
  index: number;
  total: number;
  sectionOptions: { id: string; title: string }[];
  patch: (p: Partial<BuilderSection>) => void;
  onDelete: () => void;
  onMove: (delta: number) => void;
  onAddQuestion: (q: BuilderQuestion) => void;
  onQuestionChange: (questionId: string, p: Partial<BuilderQuestion>) => void;
  onQuestionDelete: (questionId: string) => void;
  onQuestionMove: (questionId: string, delta: number) => void;
  onQuestionDuplicate: (questionId: string) => void;
  onQuestionMoveToSection: (questionId: string, toSectionId: string) => void;
  onPreviewQuestion: (question: BuilderQuestion) => void;
  requestQuestionImage?: (q: AiImageRequestQuestion) => Promise<BuilderImageAsset>;
  onMediaBusyChange?: (questionId: string, busy: boolean) => void;
  // Question ids with a pending media operation (builder authority).
  pendingMediaIds?: ReadonlySet<string>;
  disabled?: boolean;
  // Phase 13B — selection / navigation plumbing (builder-owned UI state).
  selectedIds?: ReadonlySet<string>;
  onToggleSelect?: (questionId: string) => void;
  registerQuestionNode?: (questionId: string, el: HTMLDivElement | null) => void;
  flashQuestionId?: string;
  // Phase 13C-A — the exam's blueprint (passed to each question's classification controls).
  blueprint?: AssessmentBlueprintV1;
};

export default function ExamSectionEditor(props: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Phase 19G — when the palette was opened from a scenario, the picked question is created INSIDE that scenario (after its last member) and linked.
  const [paletteFor, setPaletteFor] = useState<string | null>(null);
  const { section, index, total, sectionOptions, patch, onDelete, onMove, onAddQuestion, onQuestionChange, onQuestionDelete, onQuestionMove, onQuestionDuplicate, onQuestionMoveToSection, onPreviewQuestion, requestQuestionImage, onMediaBusyChange, pendingMediaIds, disabled, selectedIds, onToggleSelect, registerQuestionNode, flashQuestionId, blueprint } = props;
  const groupOptions = Object.entries(section.stimuli || {}).map(([id, s]) => ({ id, label: s.title ? s.title + " (" + id + ")" : id }));
  const scenarios = Array.isArray(section.scenarios) ? section.scenarios : [];
  const applySection = (next: BuilderSection) => { if (next !== section) patch({ scenarios: next.scenarios, questions: next.questions }); };
  const addPicked = (q: BuilderQuestion) => { setPaletteOpen(false); if (paletteFor) { applySection(createQuestionInScenario(section, paletteFor, q)); setPaletteFor(null); } else onAddQuestion(q); };

  return (
    <section className="sb-section">
      <header className="sb-section-head">
        <div className="sb-row-between">
          <span className="sb-section-eyebrow">القسم {index + 1}</span>
          <div className="sb-section-tools">
            <select className="sb-input sb-input-sm" value="" onChange={e => { const preset = SECTION_PRESETS.find(p => p.id === e.target.value); if (preset) patch(preset.apply()); }} disabled={disabled}>
              <option value="">تطبيق نموذج جاهز…</option>
              {SECTION_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <button type="button" className="sb-icon-btn" title="أعلى" aria-label="أعلى" onClick={() => onMove(-1)} disabled={disabled || index === 0}>↑</button>
            <button type="button" className="sb-icon-btn" title="أسفل" aria-label="أسفل" onClick={() => onMove(1)} disabled={disabled || index === total - 1}>↓</button>
            <button type="button" className="sb-icon-btn sb-danger" title="حذف القسم" onClick={onDelete} disabled={disabled}>حذف القسم</button>
          </div>
        </div>

        <input className="sb-input sb-title-input" value={section.title} placeholder="عنوان القسم" onChange={e => patch({ title: e.target.value })} disabled={disabled} />
        <div className="sb-template-controls">
          <select className="sb-input sb-input-sm" value="" aria-label="قوالب تعليمات القسم" disabled={disabled} onChange={e => {
            // Roadmap #17 — section instruction template = plain TEXT only. It sets section.instructions and
            // NEVER touches gradingPolicy / requiredAnswers / maxMarks / answerUnit (grading stays structured).
            const t = findSectionInstructionTemplate(e.target.value);
            e.target.value = "";
            if (!t) return;
            if ((section.instructions ?? "").trim() && !window.confirm("سيستبدل هذا القالب تعليمات القسم الحالية. هل تريد المتابعة؟")) return;
            patch({ instructions: t.text });
          }}>
            <option value="">قوالب تعليمات القسم…</option>
            {SECTION_INSTRUCTION_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <textarea className="sb-input sb-textarea" value={section.instructions ?? ""} placeholder="تعليمات القسم" onChange={e => patch({ instructions: e.target.value })} disabled={disabled} />

        <div className="sb-policy">
          <label className="sb-field-label">قاعدة التصحيح</label>
          <div className="sb-policy-choices">
            {(Object.keys(GRADING_POLICY_LABELS) as GradingPolicy[]).map(p => (
              <label key={p} className={"sb-chip " + (section.gradingPolicy === p ? "sb-chip-active" : "")}>
                <input type="radio" name={"policy-" + section.id} checked={section.gradingPolicy === p} onChange={() => patch(changeSectionPolicy(section, p))} disabled={disabled} />
                {GRADING_POLICY_LABELS[p]}
              </label>
            ))}
          </div>

          <div className="sb-policy-inputs">
            {(section.gradingPolicy === "capScore" || section.gradingPolicy === "firstNAnswered") && (
              <label className="sb-inline"><span>العلامة القصوى للقسم</span><input className="sb-input sb-input-xs" type="number" value={section.maxMarks ?? ""} onChange={e => patch({ maxMarks: e.target.value === "" ? null : Number(e.target.value) })} disabled={disabled} /></label>
            )}
            {section.gradingPolicy === "firstNAnswered" && (
              <>
                <label className="sb-inline"><span>عدد الإجابات المطلوبة</span><input className="sb-input sb-input-xs" type="number" value={section.requiredAnswers ?? ""} onChange={e => patch({ requiredAnswers: e.target.value === "" ? null : Number(e.target.value) })} disabled={disabled} /></label>
                <label className="sb-inline"><span>وحدة العد</span>
                  <select className="sb-input sb-input-sm" value={section.answerUnit ?? "question"} onChange={e => patch({ answerUnit: e.target.value as AnswerUnit })} disabled={disabled}>
                    <option value="question">السؤال</option>
                    <option value="part">البند</option>
                  </select>
                </label>
              </>
            )}
          </div>
          <p className="sb-rule-explain">{gradingRuleExplanation(section)}</p>
        </div>

        <StimulusEditor stimuli={section.stimuli || {}} onChange={next => patch({ stimuli: next })} disabled={disabled} />
      </header>

      {scenarios.length > 0 && (
        <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل محرر السيناريو…</p>}>
          <ol className="sb-scenarios" aria-label="سيناريوهات القسم">
            {scenarios.map((sc, i) => <ScenarioBlockEditor key={sc.id} section={section} scenario={sc} index={i} total={scenarios.length} disabled={disabled} onSection={applySection} onCreateQuestion={() => { setPaletteFor(sc.id); setPaletteOpen(true); }} />)}
          </ol>
        </Suspense>
      )}

      <div className="sb-questions">
        {section.questions.map((q, i) => (
          <StructuredQuestionEditor
            key={q.examQuestionId}
            question={q}
            index={i}
            total={section.questions.length}
            sectionOptions={sectionOptions}
            currentSectionId={section.id}
            groupOptions={groupOptions}
            scenarioLabel={(() => { const sc = scenarioOf(section, q.examQuestionId); return sc ? (sc.title?.trim() || "سيناريو") : undefined; })()}
            onChange={p => onQuestionChange(q.examQuestionId, p)}
            onDelete={() => onQuestionDelete(q.examQuestionId)}
            onMove={d => onQuestionMove(q.examQuestionId, d)}
            onDuplicate={() => onQuestionDuplicate(q.examQuestionId)}
            onMoveToSection={to => onQuestionMoveToSection(q.examQuestionId, to)}
            onPreview={() => onPreviewQuestion(q)}
            requestQuestionImage={requestQuestionImage}
            onMediaBusyChange={onMediaBusyChange ? busy => onMediaBusyChange(q.examQuestionId, busy) : undefined}
            mediaPending={pendingMediaIds?.has(q.examQuestionId) ?? false}
            disabled={disabled}
            selected={selectedIds?.has(q.examQuestionId) ?? false}
            onToggleSelect={onToggleSelect ? () => onToggleSelect(q.examQuestionId) : undefined}
            registerNode={registerQuestionNode ? el => registerQuestionNode(q.examQuestionId, el) : undefined}
            flash={flashQuestionId === q.examQuestionId}
            blueprint={blueprint}
          />
        ))}
      </div>

      <div className="sb-section-add-row">
        <button type="button" className="sb-add-btn" onClick={() => { setPaletteFor(null); setPaletteOpen(true); }} disabled={disabled} aria-haspopup="dialog">+ إضافة سؤال</button>
        <button type="button" className="sb-add-btn" onClick={() => applySection(addScenario(section))} disabled={disabled}>+ إضافة سيناريو</button>
      </div>
      {paletteOpen && <Suspense fallback={null}><QuestionTypePalette open onClose={() => { setPaletteOpen(false); setPaletteFor(null); }} onPick={key => addPicked(newQuestion(key as BuilderQuestionType))} onPickNode={q => addPicked(q)} /></Suspense>}
    </section>
  );
}
