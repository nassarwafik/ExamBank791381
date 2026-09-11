
import type { BuilderQuestion, BuilderPart, BuilderPartType } from "./examTypes";
import { QUESTION_TYPE_LABELS } from "./examTypes";
import { addPart, deletePart, duplicatePart, movePart, newPart, changePartType, partMarksInfo, ordinalLabel } from "./examBuilderState";
import QuestionBodyEditor from "./QuestionBodyEditor";

// Editor for a compound question's independent parts. Each part chooses its own type and gets the same
// body editors a standalone question uses. Part marks are optional: when every part has marks the total
// is compared against the question's marks (mismatch warned, never silently changed); when marks are
// blank the engine splits equally, shown here as "توزيع تلقائي".

const PART_TYPES: BuilderPartType[] = ["multipleChoice", "trueFalse", "multiTrueFalse", "shortAnswer", "fillBlank", "wordBank", "matching", "ordering", "tableFill", "cliFill"];

type Props = { question: BuilderQuestion; onChange: (patch: Partial<BuilderQuestion>) => void; disabled?: boolean };

export default function CompoundQuestionEditor({ question, onChange, disabled }: Props) {
  const parts = question.parts || [];
  const setParts = (next: BuilderPart[]) => onChange({ parts: next });
  const patchPart = (id: string, patch: Partial<BuilderPart>) => setParts(parts.map(p => (p.id === id ? { ...p, ...patch } : p)));
  const info = partMarksInfo(question);

  return (
    <div className="sb-compound-editor">
      <div className="sb-row-between">
        <strong>البنود ({parts.length})</strong>
        <span className={"sb-marks-summary " + (info.mismatch ? "sb-warn-text" : "")}>
          {info.mode === "auto" ? "توزيع تلقائي للعلامات" : "مجموع علامات البنود: " + info.total + " / " + info.questionMarks}
        </span>
      </div>

      {parts.map((p, i) => (
        <div className="sb-part" key={p.id}>
          <div className="sb-part-head">
            <b className="sb-part-badge">{p.label?.trim() ? p.label : ordinalLabel(i)}</b>
            <select className="sb-input sb-input-sm" value={p.type} onChange={e => patchPart(p.id, changePartType(p, e.target.value as BuilderPartType))} disabled={disabled}>
              {PART_TYPES.map(t => <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>)}
            </select>
            <input className="sb-input sb-input-sm" value={p.label ?? ""} placeholder="التسمية (أ، ب...)" onChange={e => patchPart(p.id, { label: e.target.value })} disabled={disabled} />
            <input className="sb-input sb-input-xs" type="number" step="0.25" value={p.marks ?? ""} placeholder="علامة" onChange={e => patchPart(p.id, { marks: e.target.value === "" ? undefined : Number(e.target.value) })} disabled={disabled} />
            <span className="sb-spacer" />
            <button type="button" className="sb-icon-btn" title="أعلى" onClick={() => setParts(movePart(parts, p.id, -1))} disabled={disabled}>↑</button>
            <button type="button" className="sb-icon-btn" title="أسفل" onClick={() => setParts(movePart(parts, p.id, 1))} disabled={disabled}>↓</button>
            <button type="button" className="sb-icon-btn" title="تكرار" onClick={() => setParts(duplicatePart(parts, p.id))} disabled={disabled}>⧉</button>
            <button type="button" className="sb-icon-btn sb-danger" title="حذف" onClick={() => setParts(deletePart(parts, p.id))} disabled={disabled}>×</button>
          </div>
          <textarea className="sb-input sb-textarea sb-part-text" value={p.text ?? ""} placeholder="نص البند" onChange={e => patchPart(p.id, { text: e.target.value })} disabled={disabled} />
          <QuestionBodyEditor node={p} type={p.type} onChange={patch => patchPart(p.id, patch)} disabled={disabled} />
        </div>
      ))}

      <button type="button" className="sb-add-btn" onClick={() => setParts(addPart(parts, newPart("multipleChoice", { marks: undefined })))} disabled={disabled}>+ إضافة بند</button>
    </div>
  );
}
