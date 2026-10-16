import { memo, useCallback, useContext, useMemo } from "react";
import type { BuilderQuestion } from "../examTypes";
import type { StructuredIssue } from "../examQuality";
import type { BuilderActions } from "../builder/builderActions";
import QuestionComposer from "../QuestionComposer";
import Field from "../ui/Field";
import InlineIssues from "../builder/InlineIssues";
import { FieldRevealContext } from "../ui/fieldContext";
import { headerFieldIssues, HEADER_FIELD_CODES } from "../teacher/questionFieldIssues";
import { domIdPart, questionLabelOf } from "../builder/issueIndex";
import { questionTypeDefinition, questionTypeLabel } from "../questionTypeCatalog";
import { IconEye, IconCopy, IconTrash, IconArrowUp, IconArrowDown, IconChevronUp, IconImage, IconWarning } from "../icons";
import QuestionSummary from "./QuestionSummary";
import StudioTypeIcon from "./StudioTypeIcon";

// Phase 21F.4 — a question in the Studio canvas. COLLAPSED (the default): the question as the student reads it, with the key, its
// type, marks, classification and issue state — one click (or Enter) opens it. ACTIVE (one card at a time): the shared
// QuestionComposer (type, prompt and the type's own editor, unchanged) with the card bar (marks, preview, move, duplicate, delete);
// the rest of the question's settings live in the inspector. Memoized: with the builder's stable actions a card re-renders only
// when its own data changes. The DOM contract the builder's focus / issue logic reads is kept: the registered node is the card
// (#sb-q-<id>, data-question-id, tabIndex -1), its named issue list is a direct child, and the Field frames are inside it.

type Props = {
  question: BuilderQuestion;
  index: number;
  total: number;
  sectionId: string;
  scope: string;
  actions: BuilderActions;
  active: boolean;
  selected: boolean;
  flash: boolean;
  disabled: boolean;
  issues?: readonly StructuredIssue[];
  revealIssues?: number;
  scenarioLabel?: string;
  onActivate: (questionId: string) => void;
  onDeactivate: () => void;
  onOpenMedia: () => void;
};

const marksText = (n: number) => (n === 1 ? "علامة واحدة" : n === 2 ? "علامتان" : Number.isFinite(n) ? n + (n >= 3 && n <= 10 && Number.isInteger(n) ? " علامات" : " علامة") : "—");

export default memo(StudioQuestionCard);

function StudioQuestionCard(props: Props) {
  const { question: q, index, total, sectionId, scope, actions, active, selected, flash, disabled, issues, revealIssues, scenarioLabel, onActivate, onDeactivate, onOpenMedia } = props;
  const id = q.examQuestionId;
  const label = questionLabelOf(q.displayNumber, index);
  const prompt = (q.text || "").trim();
  const errors = (issues || []).filter(i => i.severity === "error").length;
  const warnings = (issues || []).length - errors;
  const register = useCallback((el: HTMLElement | null) => actions.registerNode(id, el as HTMLDivElement | null), [actions, id]);
  const onChange = useCallback((p: Partial<BuilderQuestion>) => actions.changeQuestion(scope, sectionId, id, p), [actions, scope, sectionId, id]);
  const fieldIssues = useMemo(() => headerFieldIssues(q), [q]);
  const revealed = useContext(FieldRevealContext) || !!revealIssues;
  const typeName = questionTypeLabel(q.presentationType) ?? String(q.presentationType);
  const def = questionTypeDefinition(q.presentationType);
  const needsImage = !!def?.capabilities.requiresImage && !(q.image?.assets || []).some(a => a?.dataUrl || a?.blobName);
  const className = "st-card" + (active ? " is-active" : "") + (selected ? " is-selected" : "") + (flash ? " is-flash" : "") + (errors ? " is-error" : "");

  if (!active) {
    return (
      <article className={className} id={"sb-q-" + id} data-question-id={id} data-selected={selected ? "true" : undefined} tabIndex={-1} ref={register}>
        <button type="button" className="st-card-cover" onClick={() => onActivate(id)} disabled={disabled}
          aria-label={"تحرير السؤال " + label + ": " + (prompt || "سؤال بلا نص")} />
        <input type="checkbox" className="st-select-box" checked={selected} onChange={() => actions.toggleSelect(scope, id)} aria-label={"تحديد السؤال " + label} />
        <div className="st-card-content">
          <div className="st-card-top">
            <span className="st-num">{label}</span>
            <span className={"st-prompt" + (prompt ? "" : " is-empty")}>{prompt || "سؤال بلا نص — اضغط لكتابته"}</span>
            <span className="st-marks">{marksText(q.marks)}</span>
          </div>
          <QuestionSummary question={q} />
          <div className="st-chips">
            <span className="st-chip"><StudioTypeIcon type={q.presentationType} size={13} />{typeName}</span>
            {scenarioLabel && <span className="st-chip is-teal">ضمن سيناريو: {scenarioLabel}</span>}
            {q.assessmentMeta?.cognitiveLevel && <span className="st-chip is-teal">{q.assessmentMeta.cognitiveLevel}</span>}
            {errors > 0 && <span className="st-chip is-error"><IconWarning size={13} aria-hidden="true" />{errors === 1 ? "خطأ يمنع الاعتماد" : errors + " أخطاء تمنع الاعتماد"}</span>}
            {warnings > 0 && <span className="st-chip is-warn">{warnings === 1 ? "تنبيه" : warnings + " تنبيهات"}</span>}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={className} id={"sb-q-" + id} data-question-id={id} data-active="true" tabIndex={-1} ref={register} aria-label={"تحرير السؤال " + label}>
      <div className="st-card-bar">
        <span className="st-num">{label}</span>
        <span className="st-card-type"><StudioTypeIcon type={q.presentationType} />{typeName}</span>
        {scenarioLabel && <span className="st-chip is-teal">ضمن سيناريو: {scenarioLabel}</span>}
        <span className="st-grow" />
        <span className="st-marks-field">
          <Field label="العلامة" layout="inline" error={fieldIssues.marks} issueCode={HEADER_FIELD_CODES.marks}>{a11y => <input {...a11y} type="number" step="0.25" value={q.marks ?? ""} onChange={e => onChange({ marks: Number(e.target.value) })} disabled={disabled} />}</Field>
        </span>
        <button type="button" className="st-icon-btn" aria-label="معاينة الطالب" title="معاينة الطالب" onClick={() => actions.previewQuestion(scope, sectionId, id)} disabled={disabled}><IconEye size={16} /></button>
        <button type="button" className="st-icon-btn" aria-label={"نقل السؤال " + label + " للأعلى"} title={"نقل السؤال " + label + " للأعلى"} onClick={() => actions.moveQuestion(scope, sectionId, id, -1)} disabled={disabled || index === 0}><IconArrowUp size={16} /></button>
        <button type="button" className="st-icon-btn" aria-label={"نقل السؤال " + label + " للأسفل"} title={"نقل السؤال " + label + " للأسفل"} onClick={() => actions.moveQuestion(scope, sectionId, id, 1)} disabled={disabled || index === total - 1}><IconArrowDown size={16} /></button>
        <button type="button" className="st-icon-btn" aria-label="تكرار السؤال" title="تكرار السؤال" onClick={() => actions.duplicateQuestion(scope, sectionId, id)} disabled={disabled}><IconCopy size={16} /></button>
        <button type="button" className="st-icon-btn is-danger" aria-label="حذف السؤال" title="حذف السؤال" onClick={() => actions.deleteQuestion(scope, sectionId, id)} disabled={disabled}><IconTrash size={16} /></button>
        <button type="button" className="st-icon-btn" aria-label="إنهاء تحرير السؤال" title="إنهاء التحرير" onClick={onDeactivate}><IconChevronUp size={16} /></button>
      </div>
      {issues && <InlineIssues id={"sb-issues-q-" + domIdPart(id)} issues={issues} label={"مشكلات السؤال " + label} />}
      <FieldRevealContext.Provider value={revealed}>
        <div className="st-card-body sb-q-body">
          {needsImage && (
            <div className="st-hint-row" role="note">
              <IconImage size={16} aria-hidden="true" />
              <span>هذا النوع يحتاج صورة.</span>
              <button type="button" className="st-btn is-ghost is-small" onClick={onOpenMedia}>إضافة صورة</button>
            </div>
          )}
          <QuestionComposer question={q} onChange={onChange} disabled={disabled} framed />
          {q.assetRequest && (
            <div className="sb-warn sb-asset-request" role="note" data-testid="ai-asset-request">
              <strong>صورة مطلوبة (اقتراح المؤلف الذكي):</strong> {q.assetRequest.description}
              <button type="button" className="st-btn is-small" onClick={() => onChange({ assetRequest: undefined })} disabled={disabled}>تم إرفاق الصورة — إزالة الطلب</button>
            </div>
          )}
          <p className="st-card-foot">
            <span>الرقم الظاهر، التصنيف، الوسائط والكود المرفق في لوحة الخصائص.</span>
          </p>
        </div>
      </FieldRevealContext.Provider>
    </article>
  );
}
