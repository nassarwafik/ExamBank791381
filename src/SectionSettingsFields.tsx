import { lazy, Suspense, useState } from "react";
import type { BuilderSection, GradingPolicy, AnswerUnit } from "./examTypes";
import { GRADING_POLICY_LABELS } from "./examTypes";
import { gradingRuleExplanation, changeSectionPolicy } from "./examBuilderState";
import { SECTION_INSTRUCTION_TEMPLATES, findSectionInstructionTemplate } from "./instructionTemplates";
import StimulusEditor from "./StimulusEditor";
import type { RichContentV1 } from "./richContent/richContentModel";
import type { ConfirmOptions } from "./ui/ConfirmDialog";
// Phase 20D.1 — optional RICH section instructions: the block editor and the Markdown conversion are lazy (builder-only chunks).
const RichContentEditor = lazy(() => import("./richContent/RichContentEditor"));
const MarkdownConvertDialog = lazy(() => import("./richContent/MarkdownConvertDialog"));

// Phase 21F.4 — a section's settings fields (title, instruction templates, plain + rich instructions, grading rule, shared stimuli),
// extracted VERBATIM from ExamSectionEditor's header so the classic section header and the Studio's section inspector render the
// same controls with the same rules. A fragment: the classic header's DOM is unchanged.
type Props = {
  section: BuilderSection;
  patch: (p: Partial<BuilderSection>) => void;
  disabled?: boolean;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

export default function SectionSettingsFields({ section, patch, disabled, confirm }: Props) {
  // Phase 20D.1 — section.instructionsRichContent (presentation only); the plain `instructions` stay the fallback and are never rewritten.
  const richInstructions = (section as BuilderSection & { instructionsRichContent?: RichContentV1 }).instructionsRichContent;
  const [richOpen, setRichOpen] = useState(() => richInstructions !== undefined);
  const [converting, setConverting] = useState(false);
  const setRichInstructions = (next: RichContentV1 | undefined) => patch({ instructionsRichContent: next });
  return (
    <>
    <input className="sb-input sb-title-input" value={section.title} placeholder="عنوان القسم" onChange={e => patch({ title: e.target.value })} disabled={disabled} />
    <div className="sb-template-controls">
      <select className="sb-input sb-input-sm" value="" aria-label="قوالب تعليمات القسم" disabled={disabled} onChange={async e => {
        // Roadmap #17 — section instruction template = plain TEXT only. It sets section.instructions and
        // NEVER touches gradingPolicy / requiredAnswers / maxMarks / answerUnit (grading stays structured).
        const t = findSectionInstructionTemplate(e.target.value);
        e.target.value = "";
        if (!t) return;
        if ((section.instructions ?? "").trim() && !(await confirm({ title: "استبدال تعليمات القسم", message: "سيستبدل هذا القالب تعليمات القسم الحالية. هل تريد المتابعة؟", confirmLabel: "استبدال التعليمات", cancelLabel: "إبقاء التعليمات", initialFocus: "cancel" }))) return;
        patch({ instructions: t.text });
      }}>
        <option value="">قوالب تعليمات القسم…</option>
        {SECTION_INSTRUCTION_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
    </div>
    <textarea className="sb-input sb-textarea" value={section.instructions ?? ""} placeholder="تعليمات القسم" onChange={e => patch({ instructions: e.target.value })} disabled={disabled} />
    <div className="rc-host">
      <div className="rc-host-actions">
        <button type="button" className="sb-mini-btn" aria-expanded={richOpen} onClick={() => setRichOpen(o => !o)}>تعليمات منسقة للقسم</button>
        <button type="button" className="sb-mini-btn" onClick={() => setConverting(true)} disabled={disabled || !(section.instructions ?? "").trim()}>تحويل التعليمات إلى محتوى منسق</button>
      </div>
      {richInstructions !== undefined && !richOpen && <p className="sb-hint rc-host-note">للقسم تعليمات منسقة تُعرض للطالب بدل التعليمات العادية (تبقى العادية احتياطيًا).</p>}
      {richOpen && (
        <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل محرر المحتوى المنسق…</p>}>
          <RichContentEditor value={richInstructions} onChange={setRichInstructions} disabled={disabled} plainText={section.instructions} label="تعليمات القسم المنسقة" />
        </Suspense>
      )}
      {converting && (
        <Suspense fallback={null}>
          <MarkdownConvertDialog source={section.instructions ?? ""} replacing={richInstructions !== undefined} title="تحويل تعليمات القسم إلى محتوى منسق" onCancel={() => setConverting(false)} onConfirm={value => { setRichInstructions(value); setRichOpen(true); setConverting(false); }} />
        </Suspense>
      )}
    </div>

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
    </>
  );
}
