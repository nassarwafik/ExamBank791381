
import { useContext, useMemo, useState } from "react";
import Field from "./ui/Field";
import { headerFieldIssues, HEADER_FIELD_CODES } from "./teacher/questionFieldIssues";
import type { BuilderQuestion, BuilderImageAsset } from "./examTypes";
import QuestionComposer from "./QuestionComposer";
import QuestionMediaEditor from "./QuestionMediaEditor";
import type { AiImageRequestQuestion } from "./questionMedia";
import type { AssessmentBlueprintV1 } from "./assessmentTypes";
import QuestionClassificationEditor from "./QuestionClassificationEditor";
import ActivityDescriptorEditor from "./ActivityDescriptorEditor";
import { effectiveQuestionTypeVersion, questionTypeDefinition } from "./questionTypeCatalog";
import CodeStimulusEditor from "./CodeStimulusEditor";
import { GRADING_MODE_LABELS } from "./questionTypeAliases";
import type { StructuredIssue } from "./examQuality";
import InlineIssues from "./builder/InlineIssues";
import { domIdPart, questionLabelOf } from "./builder/issueIndex";
import { FieldRevealContext } from "./ui/fieldContext";

// Exam-specific chrome around a question: collapse, the displayed-number badge, and the row actions (preview, move,
// duplicate, delete), plus the exam-only metadata (display number, marks, shared stimulus/group, move-to-section).
// The actual question CONTENT — type selector, prompt, and type-specific / compound body — is delegated to the shared
// QuestionComposer, so the Live Challenge composer can reuse the same content editors without inheriting this
// exam-only chrome. This component adds no second body-selection logic of its own.

type Props = {
  question: BuilderQuestion;
  index: number;
  total: number;
  sectionOptions: { id: string; title: string }[];
  currentSectionId: string;
  groupOptions: { id: string; label: string }[];
  // Phase 19G — the title of the scenario this question is linked to (membership is read from the section, never stored on the question).
  scenarioLabel?: string;
  onChange: (patch: Partial<BuilderQuestion>) => void;
  onDelete: () => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onMoveToSection: (toSectionId: string) => void;
  onPreview: () => void;
  // Phase 5B — authenticated AI image callback (App.tsx). Optional so existing renders/tests without media
  // still work; when absent the media editor simply does not offer AI generation.
  requestQuestionImage?: (q: AiImageRequestQuestion) => Promise<BuilderImageAsset>;
  // Phase 5B — pending media operation on THIS question (see QuestionMediaEditor.onBusyChange).
  onMediaBusyChange?: (busy: boolean) => void;
  // True while THIS question has a pending media operation (builder authority, survives collapse/remount).
  mediaPending?: boolean;
  disabled?: boolean;
  // Phase 13B — selection is UI state owned by the builder (never exam data). The card only shows and toggles it.
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Stable DOM anchor for the navigator (by examQuestionId, never display number). */
  registerNode?: (el: HTMLDivElement | null) => void;
  /** Brief non-disruptive highlight after navigating here. */
  flash?: boolean;
  // Phase 13C-A — the exam's blueprint (vocabulary for the optional classification controls).
  blueprint?: AssessmentBlueprintV1;
  /** Phase 21E.2 (D) — this question's canonical issues as the builder indexed them (shown in the card; never re-validated here). */
  issues?: readonly StructuredIssue[];
  /** Phase 21E.2 (D) — set once the teacher opened this question from the builder's issue summary: its fields show their errors
   *  at once (FieldRevealContext). A NEW value (a later summary click) also opens a collapsed card. UI state only, never exam data. */
  revealIssues?: number;
};

export default function StructuredQuestionEditor(props: Props) {
  const { question: q, index, total, sectionOptions, currentSectionId, groupOptions, scenarioLabel, onChange, onDelete, onMove, onDuplicate, onMoveToSection, onPreview, requestQuestionImage, onMediaBusyChange, mediaPending, disabled, selected, onToggleSelect, registerNode, flash, blueprint, issues, revealIssues } = props;
  const [open, setOpen] = useState(true);
  // A summary click on a collapsed card opens it during the same render (no extra commit), so the builder can focus the field.
  const [openedFor, setOpenedFor] = useState(revealIssues);
  if (revealIssues !== openedFor) { setOpenedFor(revealIssues); if (revealIssues) setOpen(true); }
  // 21E.2 — the field-level view of the canonical header rules (EMPTY_TEXT / MARKS_PROBLEM) and the question's display label,
  // used to give the reorder buttons a name that says WHICH question moves.
  const fieldIssues = useMemo(() => headerFieldIssues(q), [q]);
  const questionLabel = questionLabelOf(q.displayNumber, index);
  const revealed = useContext(FieldRevealContext) || !!revealIssues;

  return (
    <div className={"sb-question" + (selected ? " is-selected" : "") + (flash ? " sb-q-flash" : "")} id={"sb-q-" + q.examQuestionId} data-question-id={q.examQuestionId} data-selected={selected ? "true" : undefined} tabIndex={-1} ref={registerNode}>
      <div className="sb-q-head">
        {onToggleSelect && <input type="checkbox" className="sb-q-select" checked={!!selected} onChange={onToggleSelect} aria-label="تحديد السؤال" />}
        <button type="button" className="sb-collapse" onClick={() => setOpen(o => !o)} title={open ? "طيّ" : "فتح"} aria-label={open ? "طيّ" : "فتح"} aria-expanded={open}>{open ? "▾" : "▸"}</button>
        <span className="sb-q-badge">{q.displayNumber?.trim() ? q.displayNumber : index + 1}</span>
        {selected && <span className="sb-q-selected-tag">محدد</span>}
        {scenarioLabel && <span className="sb-chip sb-scenario-chip" data-testid="scenario-chip">ضمن سيناريو: {scenarioLabel}</span>}
        <span className="sb-spacer" />
        <button type="button" className="sb-icon-btn" title="معاينة الطالب" aria-label="معاينة الطالب" onClick={onPreview} disabled={disabled}>👁</button>
        <button type="button" className="sb-icon-btn" title={"نقل السؤال " + questionLabel + " للأعلى"} aria-label={"نقل السؤال " + questionLabel + " للأعلى"} onClick={() => onMove(-1)} disabled={disabled || index === 0}>↑</button>
        <button type="button" className="sb-icon-btn" title={"نقل السؤال " + questionLabel + " للأسفل"} aria-label={"نقل السؤال " + questionLabel + " للأسفل"} onClick={() => onMove(1)} disabled={disabled || index === total - 1}>↓</button>
        <button type="button" className="sb-icon-btn" title="تكرار" aria-label="تكرار" onClick={onDuplicate} disabled={disabled}>⧉</button>
        <button type="button" className="sb-icon-btn sb-danger" title="حذف" aria-label="حذف" onClick={onDelete} disabled={disabled}>×</button>
      </div>

      {/* Phase 21E.2 (D) — the question's canonical issues, between its head and its body: visible while the card is collapsed. */}
      {issues && <InlineIssues id={"sb-issues-q-" + domIdPart(q.examQuestionId)} issues={issues} label={"مشكلات السؤال " + questionLabel} />}

      {/* The provider is always rendered (a stable tree: revealing never remounts the editors below); it only adds the reveal. */}
      <FieldRevealContext.Provider value={revealed}>
      {open && (
        <div className="sb-q-body">
          <div className="sb-q-meta">
            <Field label="الرقم الظاهر" layout="inline">{a11y => <input {...a11y} className="sb-input sb-input-xs" value={q.displayNumber ?? ""} placeholder={String(index + 1)} onChange={e => onChange({ displayNumber: e.target.value })} disabled={disabled} />}</Field>
            <Field label="العلامة" layout="inline" error={fieldIssues.marks} issueCode={HEADER_FIELD_CODES.marks}>{a11y => <input {...a11y} className="sb-input sb-input-xs" type="number" step="0.25" value={q.marks ?? ""} onChange={e => onChange({ marks: Number(e.target.value) })} disabled={disabled} />}</Field>
            {groupOptions.length > 0 && (
              <label className="sb-inline"><span>المادة المشتركة</span>
                <select className="sb-input sb-input-sm" value={q.groupId ?? ""} onChange={e => onChange({ groupId: e.target.value || undefined })} disabled={disabled}>
                  <option value="">لا يوجد</option>
                  {groupOptions.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
              </label>
            )}
            {sectionOptions.length > 1 && (
              <label className="sb-inline"><span>نقل إلى قسم</span>
                <select className="sb-input sb-input-sm" value={currentSectionId} onChange={e => { if (!mediaPending) onMoveToSection(e.target.value); }} disabled={disabled || mediaPending} title={mediaPending ? "انتظر انتهاء معالجة صورة هذا السؤال قبل نقله" : undefined}>
                  {sectionOptions.map(s => <option key={s.id} value={s.id}>{s.title || "قسم"}</option>)}
                </select>
              </label>
            )}
          </div>

          <QuestionTypeMeta type={q.presentationType} version={q.questionTypeVersion} />
          <QuestionComposer question={q} onChange={onChange} disabled={disabled} framed />
          <CodeStimulusEditor question={q} onChange={onChange} disabled={disabled} />
          {q.assetRequest && (
            // Phase 20F — an AI image request is a teacher TODO that blocks finalization: attach the image above/below, then resolve it here.
            <div className="sb-warn sb-asset-request" role="note" data-testid="ai-asset-request">
              <strong>صورة مطلوبة (اقتراح المؤلف الذكي):</strong> {q.assetRequest.description}
              <button type="button" className="sb-btn sb-btn-sm" onClick={() => onChange({ assetRequest: undefined })} disabled={disabled}>تم إرفاق الصورة — إزالة الطلب</button>
            </div>
          )}
          <QuestionMediaEditor question={q} onChange={onChange} disabled={disabled} requestQuestionImage={requestQuestionImage} onBusyChange={onMediaBusyChange} mediaPending={mediaPending} />
          <QuestionClassificationEditor question={q} blueprint={blueprint} onChange={onChange} disabled={disabled} />
          <ActivityDescriptorEditor value={q.activity} onChange={activity => onChange({ activity })} disabled={disabled} />
        </div>
      )}
      </FieldRevealContext.Provider>
    </div>
  );
}

// Phase 16A §25 — restrained, factual registry metadata for the selected question (no new inspector panel).
function QuestionTypeMeta({ type, version }: { type: string; version?: number }) {
  const d = questionTypeDefinition(type);
  if (!d) return <dl className="qt-meta" data-testid="qt-meta"><dt>نوع السؤال</dt><dd>غير مدعوم: {String(type)}</dd></dl>;
  return (
    <dl className="qt-meta" data-testid="qt-meta">
      <dt>نوع السؤال</dt><dd>{d.label}</dd>
      <dd className="qt-chip">الإصدار {effectiveQuestionTypeVersion(type, version) ?? version ?? d.version}</dd>
      <dd className="qt-chip">{GRADING_MODE_LABELS[d.gradingMode]}</dd>
      {d.capabilities.partialCredit && <dd className="qt-chip">يدعم علامة جزئية</dd>}
      {d.capabilities.compoundPart && <dd className="qt-chip">يدعم البنود المركبة</dd>}
      {d.capabilities.interactive && <dd className="qt-chip">تفاعلي</dd>}
    </dl>
  );
}
