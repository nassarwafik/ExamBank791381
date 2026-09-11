
import { useState } from "react";
import type { BuilderQuestion, BuilderQuestionType } from "./examTypes";
import { QUESTION_TYPE_LABELS } from "./examTypes";
import { changeQuestionType } from "./examBuilderState";
import QuestionBodyEditor from "./QuestionBodyEditor";
import CompoundQuestionEditor from "./CompoundQuestionEditor";

const QUESTION_TYPES: BuilderQuestionType[] = ["multipleChoice", "trueFalse", "multiTrueFalse", "shortAnswer", "fillBlank", "wordBank", "matching", "ordering", "tableFill", "cliFill", "compound"];

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
  disabled?: boolean;
};

export default function StructuredQuestionEditor(props: Props) {
  const { question: q, index, total, sectionOptions, currentSectionId, groupOptions, onChange, onDelete, onMove, onDuplicate, onMoveToSection, onPreview, disabled } = props;
  const [open, setOpen] = useState(true);

  return (
    <div className="sb-question">
      <div className="sb-q-head">
        <button type="button" className="sb-collapse" onClick={() => setOpen(o => !o)} title={open ? "طيّ" : "فتح"}>{open ? "▾" : "▸"}</button>
        <span className="sb-q-badge">{q.displayNumber?.trim() ? q.displayNumber : index + 1}</span>
        <select className="sb-input sb-input-sm" value={q.presentationType} onChange={e => onChange(changeQuestionType(q, e.target.value as BuilderQuestionType))} disabled={disabled}>
          {QUESTION_TYPES.map(t => <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>)}
        </select>
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

          <textarea className="sb-input sb-textarea" value={q.text ?? ""} placeholder={q.presentationType === "compound" ? "نص السؤال المركّب (اختياري)" : "نص السؤال"} onChange={e => onChange({ text: e.target.value })} disabled={disabled} />

          {q.presentationType === "compound"
            ? <CompoundQuestionEditor question={q} onChange={onChange} disabled={disabled} />
            : <QuestionBodyEditor node={q} type={q.presentationType} onChange={onChange} disabled={disabled} />}
        </div>
      )}
    </div>
  );
}
