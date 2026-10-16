import type { BuilderQuestion, BuilderSection } from "../examTypes";
import type { AssessmentBlueprintV1 } from "../assessmentTypes";
import type { AiImageRequestQuestion } from "../questionMedia";
import type { BuilderImageAsset } from "../examTypes";
import type { BuilderActions } from "../builder/builderActions";
import Field from "../ui/Field";
import { useConfirm } from "../ui/useConfirm";
import QuestionMediaEditor from "../QuestionMediaEditor";
import QuestionClassificationEditor from "../QuestionClassificationEditor";
import ActivityDescriptorEditor from "../ActivityDescriptorEditor";
import CodeStimulusEditor from "../CodeStimulusEditor";
import SectionSettingsFields from "../SectionSettingsFields";
import { SECTION_PRESETS } from "../examBuilderState";
import { effectiveQuestionTypeVersion, questionTypeDefinition } from "../questionTypeCatalog";
import { GRADING_MODE_LABELS } from "../questionTypeAliases";
import { questionLabelOf } from "../builder/issueIndex";
import { IconArrowUp, IconArrowDown, IconTrash } from "../icons";
import { StudioTabs } from "./StudioPrimitives";
import { INSPECTOR_TABS, type InspectorTab } from "./studioSteps";
import StudioTypeIcon from "./StudioTypeIcon";

// Phase 21F.4 — the Studio inspector («لوحة الخصائص»): the settings of the ACTIVE question that are not its content — display number,
// section, shared material and type facts («السؤال»), pedagogical classification («التصنيف»), image and attached code («الوسائط»),
// interactive activity («متقدم») — or, opened from a section card, that section's settings. Every control is the existing editor,
// unchanged; edits go through the builder's stable actions (one history step each, scoped to the exam).


type QuestionTarget = { kind: "question"; section: BuilderSection; sectionIndex: number; question: BuilderQuestion; index: number };
type SectionTarget = { kind: "section"; section: BuilderSection; sectionIndex: number };
export type InspectorTarget = QuestionTarget | SectionTarget | null;

type Props = {
  target: InspectorTarget;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  scope: string;
  actions: BuilderActions;
  sections: { id: string; title: string }[];
  sectionCount: number;
  blueprint?: AssessmentBlueprintV1;
  disabled: boolean;
  mediaPending: boolean;
  requestQuestionImage?: (q: AiImageRequestQuestion) => Promise<BuilderImageAsset>;
  onOpenQuestionSettings: () => void;
};

export default function StudioInspector(props: Props) {
  const { target } = props;
  return (
    <aside className="st-inspector" aria-label="لوحة الخصائص">
      {target === null && <EmptyInspector />}
      {target?.kind === "question" && <QuestionInspector {...props} target={target} />}
      {target?.kind === "section" && <SectionInspector {...props} target={target} />}
    </aside>
  );
}

function EmptyInspector() {
  return (
    <div className="st-insp-empty">
      <h2>لوحة الخصائص</h2>
      <p>اختر سؤالًا من المخطط أو من الورقة لتعديل رقمه الظاهر وتصنيفه ووسائطه، أو افتح «إعدادات القسم» من بطاقة القسم.</p>
    </div>
  );
}

function QuestionInspector({ target, tab, onTab, scope, actions, sections, blueprint, disabled, mediaPending, requestQuestionImage }: Props & { target: QuestionTarget }) {
  const { question: q, section, index } = target;
  const id = q.examQuestionId;
  const onChange = (p: Partial<BuilderQuestion>) => actions.changeQuestion(scope, section.id, id, p);
  const label = questionLabelOf(q.displayNumber, index);
  const d = questionTypeDefinition(q.presentationType);
  const groupOptions = Object.entries(section.stimuli || {}).map(([gid, s]) => ({ id: gid, label: s.title ? s.title + " (" + gid + ")" : gid }));
  return (
    <>
      <div className="st-insp-head"><small>خصائص السؤال {label} · القسم {target.sectionIndex + 1}</small><h2>{section.title || "قسم بلا عنوان"}</h2></div>
      <StudioTabs label="خصائص السؤال" tabs={INSPECTOR_TABS} value={tab} onChange={k => onTab(k as InspectorTab)}>
        {tab === "question" && (
          <>
            <div className="st-type-card">
              <span className="st-type-ic"><StudioTypeIcon type={q.presentationType} size={20} /></span>
              <div>
                <b>{d?.label ?? "نوع غير مدعوم: " + String(q.presentationType)}</b>
                {d && <div className="st-type-chips">
                  <span className="st-chip">الإصدار {effectiveQuestionTypeVersion(q.presentationType, q.questionTypeVersion) ?? q.questionTypeVersion ?? d.version}</span>
                  <span className="st-chip">{GRADING_MODE_LABELS[d.gradingMode]}</span>
                  {d.capabilities.partialCredit && <span className="st-chip">يدعم علامة جزئية</span>}
                </div>}
              </div>
            </div>
            <div className="st-fields">
              <Field label="الرقم الظاهر">{a11y => <input {...a11y} className="sb-input" value={q.displayNumber ?? ""} placeholder={String(index + 1)} onChange={e => onChange({ displayNumber: e.target.value })} disabled={disabled} />}</Field>
              {sections.length > 1 && (
                <Field label="القسم">{a11y => (
                  <select {...a11y} className="sb-input" value={section.id} onChange={e => { if (!mediaPending) actions.moveQuestionToSection(scope, section.id, id, e.target.value); }} disabled={disabled || mediaPending} title={mediaPending ? "انتظر انتهاء معالجة الصورة قبل النقل" : undefined}>
                    {sections.map(s => <option key={s.id} value={s.id}>{s.title || "قسم"}</option>)}
                  </select>
                )}</Field>
              )}
              {groupOptions.length > 0 && (
                <Field label="المادة المشتركة">{a11y => (
                  <select {...a11y} className="sb-input" value={q.groupId ?? ""} onChange={e => onChange({ groupId: e.target.value || undefined })} disabled={disabled}>
                    <option value="">لا يوجد</option>
                    {groupOptions.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                  </select>
                )}</Field>
              )}
            </div>
          </>
        )}
        {tab === "classify" && <QuestionClassificationEditor question={q} blueprint={blueprint} onChange={onChange} disabled={disabled} />}
        {tab === "media" && (
          <>
            <QuestionMediaEditor question={q} onChange={onChange} disabled={disabled} requestQuestionImage={requestQuestionImage} onBusyChange={busy => actions.mediaBusy(id, busy)} mediaPending={mediaPending} />
            <CodeStimulusEditor question={q} onChange={onChange} disabled={disabled} />
          </>
        )}
        {tab === "advanced" && <ActivityDescriptorEditor value={q.activity} onChange={activity => onChange({ activity })} disabled={disabled} />}
      </StudioTabs>
    </>
  );
}

function SectionInspector({ target, scope, actions, disabled, sectionCount, onOpenQuestionSettings }: Props & { target: SectionTarget }) {
  const { confirm, confirmDialog } = useConfirm();
  const { section, sectionIndex } = target;
  const patch = (p: Partial<BuilderSection>) => actions.patchSection(scope, section.id, p);
  return (
    <>
      {confirmDialog}
      <div className="st-insp-head"><small>إعدادات القسم {sectionIndex + 1}</small><h2>{section.title || "قسم بلا عنوان"}</h2></div>
      <div className="st-insp-body st-section-settings">
        <div className="st-fields">
          <Field label="تطبيق نموذج جاهز">{a11y => (
            <select {...a11y} className="sb-input" value="" onChange={e => { const preset = SECTION_PRESETS.find(p => p.id === e.target.value); if (preset) patch(preset.apply()); }} disabled={disabled}>
              <option value="">اختر نموذجًا…</option>
              {SECTION_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          )}</Field>
        </div>
        <SectionSettingsFields section={section} patch={patch} disabled={disabled} confirm={confirm} />
        <div className="st-section-end">
          <button type="button" className="st-btn is-small" onClick={() => actions.moveSection(scope, section.id, -1)} disabled={disabled || sectionIndex === 0} aria-label={"نقل القسم " + (sectionIndex + 1) + " للأعلى"}><IconArrowUp size={15} />للأعلى</button>
          <button type="button" className="st-btn is-small" onClick={() => actions.moveSection(scope, section.id, 1)} disabled={disabled || sectionIndex === sectionCount - 1} aria-label={"نقل القسم " + (sectionIndex + 1) + " للأسفل"}><IconArrowDown size={15} />للأسفل</button>
          <button type="button" className="st-btn is-small is-danger" onClick={() => actions.deleteSection(scope, section.id)} disabled={disabled}><IconTrash size={15} />حذف القسم</button>
        </div>
        <button type="button" className="st-btn is-ghost is-small" onClick={onOpenQuestionSettings}>العودة إلى خصائص السؤال</button>
      </div>
    </>
  );
}
