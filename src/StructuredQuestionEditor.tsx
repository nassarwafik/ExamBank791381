
import { useState } from "react";
import type { BuilderQuestion, BuilderImageAsset } from "./examTypes";
import QuestionComposer from "./QuestionComposer";
import QuestionMediaEditor from "./QuestionMediaEditor";
import type { AiImageRequestQuestion } from "./questionMedia";

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
  onChange: (patch: Partial<BuilderQuestion>) => void;
  onDelete: () => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onMoveToSection: (toSectionId: string) => void;
  onPreview: () => void;
  // Phase 5B — authenticated AI image callback (App.tsx). Optional so existing renders/tests without media
  // still work; when absent the media editor simply does not offer AI generation.
  requestQuestionImage?: (q: AiImageRequestQuestion) => Promise<BuilderImageAsset>;
  disabled?: boolean;
};

export default function StructuredQuestionEditor(props: Props) {
  const { question: q, index, total, sectionOptions, currentSectionId, groupOptions, onChange, onDelete, onMove, onDuplicate, onMoveToSection, onPreview, requestQuestionImage, disabled } = props;
  const [open, setOpen] = useState(true);

  return (
    <div className="sb-question">
      <div className="sb-q-head">
        <button type="button" className="sb-collapse" onClick={() => setOpen(o => !o)} title={open ? "طيّ" : "فتح"}>{open ? "▾" : "▸"}</button>
        <span className="sb-q-badge">{q.displayNumber?.trim() ? q.displayNumber : index + 1}</span>
        <span className="sb-spacer" />
        <button type="button" className="sb-icon-btn" title="معاينة الطالب" onClick={onPreview} disabled={disabled}>👁</button>
        <button type="button" className="sb-icon-btn" title="أعلى" onClick={() => onMove(-1)} disabled={disabled || index === 0}>↑</button>
        <button type="button" className="sb-icon-btn" title="أسفل" onClick={() => onMove(1)} disabled={disabled || index === total - 1}>↓</button>
        <button type="button" className="sb-icon-btn" title="تكرار" onClick={onDuplicate} disabled={disabled}>⧉</button>
        <button type="button" className="sb-icon-btn sb-danger" title="حذف" onClick={onDelete} disabled={disabled}>×</button>
      </div>

      {open && (
        <div className="sb-q-body">
          <div className="sb-q-meta">
            <label className="sb-inline"><span>الرقم الظاهر</span><input className="sb-input sb-input-xs" value={q.displayNumber ?? ""} placeholder={String(index + 1)} onChange={e => onChange({ displayNumber: e.target.value })} disabled={disabled} /></label>
            <label className="sb-inline"><span>العلامة</span><input className="sb-input sb-input-xs" type="number" step="0.25" value={q.marks ?? ""} onChange={e => onChange({ marks: Number(e.target.value) })} disabled={disabled} /></label>
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
                <select className="sb-input sb-input-sm" value={currentSectionId} onChange={e => onMoveToSection(e.target.value)} disabled={disabled}>
                  {sectionOptions.map(s => <option key={s.id} value={s.id}>{s.title || "قسم"}</option>)}
                </select>
              </label>
            )}
          </div>

          <QuestionComposer question={q} onChange={onChange} disabled={disabled} />
          <QuestionMediaEditor question={q} onChange={onChange} disabled={disabled} requestQuestionImage={requestQuestionImage} />
        </div>
      )}
    </div>
  );
}
