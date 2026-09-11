
import type { BuilderSection, GradingPolicy, AnswerUnit } from "./examTypes";
import { GRADING_POLICY_LABELS } from "./examTypes";
import { SECTION_PRESETS, gradingRuleExplanation, newQuestion } from "./examBuilderState";
import StructuredQuestionEditor from "./StructuredQuestionEditor";
import StimulusEditor from "./StimulusEditor";
import type { BuilderQuestion } from "./examTypes";

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
  disabled?: boolean;
};

export default function ExamSectionEditor(props: Props) {
  const { section, index, total, sectionOptions, patch, onDelete, onMove, onAddQuestion, onQuestionChange, onQuestionDelete, onQuestionMove, onQuestionDuplicate, onQuestionMoveToSection, onPreviewQuestion, disabled } = props;
  const groupOptions = Object.entries(section.stimuli || {}).map(([id, s]) => ({ id, label: s.title ? s.title + " (" + id + ")" : id }));

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
            <button type="button" className="sb-icon-btn" title="أعلى" onClick={() => onMove(-1)} disabled={disabled || index === 0}>↑</button>
            <button type="button" className="sb-icon-btn" title="أسفل" onClick={() => onMove(1)} disabled={disabled || index === total - 1}>↓</button>
            <button type="button" className="sb-icon-btn sb-danger" title="حذف القسم" onClick={onDelete} disabled={disabled}>حذف القسم</button>
          </div>
        </div>

        <input className="sb-input sb-title-input" value={section.title} placeholder="عنوان القسم" onChange={e => patch({ title: e.target.value })} disabled={disabled} />
        <textarea className="sb-input sb-textarea" value={section.instructions ?? ""} placeholder="تعليمات القسم" onChange={e => patch({ instructions: e.target.value })} disabled={disabled} />

        <div className="sb-policy">
          <label className="sb-field-label">قاعدة التصحيح</label>
          <div className="sb-policy-choices">
            {(Object.keys(GRADING_POLICY_LABELS) as GradingPolicy[]).map(p => (
              <label key={p} className={"sb-chip " + (section.gradingPolicy === p ? "sb-chip-active" : "")}>
                <input type="radio" name={"policy-" + section.id} checked={section.gradingPolicy === p} onChange={() => patch({ gradingPolicy: p })} disabled={disabled} />
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
            onChange={p => onQuestionChange(q.examQuestionId, p)}
            onDelete={() => onQuestionDelete(q.examQuestionId)}
            onMove={d => onQuestionMove(q.examQuestionId, d)}
            onDuplicate={() => onQuestionDuplicate(q.examQuestionId)}
            onMoveToSection={to => onQuestionMoveToSection(q.examQuestionId, to)}
            onPreview={() => onPreviewQuestion(q)}
            disabled={disabled}
          />
        ))}
      </div>

      <button type="button" className="sb-add-btn" onClick={() => onAddQuestion(newQuestion("multipleChoice"))} disabled={disabled}>+ إضافة سؤال</button>
    </section>
  );
}
