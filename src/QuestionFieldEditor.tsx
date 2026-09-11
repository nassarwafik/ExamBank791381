
import type { QuestionBody, BuilderField, BuilderQuestionType, BuilderPartType } from "./examTypes";
import { newField, moveInArray, syncSequenceAnswer } from "./examBuilderState";

// Editor for the field-based types:
//  - multiTrueFalse: rows of (statement + صحيح/غير صحيح correct answer).
//  - fillBlank / wordBank / ordering: a shared word bank + one labelled blank per field, each with its
//    correct value. The canonical answer ({ mode:"exactSequence", values }) is re-derived from the
//    fields' order on every change via syncSequenceAnswer so the saved object is always gradeable.

type Props = { node: QuestionBody; type: BuilderQuestionType | BuilderPartType; onChange: (patch: Partial<QuestionBody>) => void; disabled?: boolean };

export default function QuestionFieldEditor({ node, type, onChange, disabled }: Props) {
  const fields = node.fields || [];
  const setFields = (next: BuilderField[], syncSeq = false) => onChange(syncSeq ? { fields: next, answer: syncSequenceAnswer(next) } : { fields: next });
  const patchField = (id: string, patch: Partial<BuilderField>, syncSeq = false) => setFields(fields.map(f => (f.id === id ? { ...f, ...patch } : f)), syncSeq);
  const removeField = (id: string, syncSeq = false) => setFields(fields.filter(f => f.id !== id), syncSeq);
  const move = (id: string, delta: number, syncSeq = false) => { const i = fields.findIndex(f => f.id === id); if (i >= 0) setFields(moveInArray(fields, i, delta), syncSeq); };

  if (type === "multiTrueFalse") {
    return (
      <div className="sb-fields">
        {fields.map((f, i) => (
          <div className="sb-field-row" key={f.id}>
            <span className="sb-field-index">{i + 1}</span>
            <input className="sb-input" value={f.statement || ""} placeholder="نص العبارة" onChange={e => patchField(f.id, { statement: e.target.value })} disabled={disabled} />
            <select className="sb-input sb-input-sm" value={f.correct === true ? "true" : f.correct === false ? "false" : ""} onChange={e => patchField(f.id, { correct: e.target.value === "" ? undefined : e.target.value === "true" })} disabled={disabled}>
              <option value="">— الإجابة —</option>
              <option value="true">صحيح</option>
              <option value="false">غير صحيح</option>
            </select>
            <button type="button" className="sb-icon-btn" title="أعلى" onClick={() => move(f.id, -1)} disabled={disabled}>↑</button>
            <button type="button" className="sb-icon-btn" title="أسفل" onClick={() => move(f.id, 1)} disabled={disabled}>↓</button>
            <button type="button" className="sb-icon-btn sb-danger" title="حذف" onClick={() => removeField(f.id)} disabled={disabled}>×</button>
          </div>
        ))}
        <button type="button" className="sb-mini-btn" onClick={() => setFields([...fields, newField({ statement: "", kind: "boolean", correct: true })])} disabled={disabled}>+ إضافة بند</button>
      </div>
    );
  }

  // fillBlank / wordBank / ordering — shared word bank + labelled blanks with a correct value each.
  const wordBank = node.wordBank || [];
  const isOrdering = type === "ordering";
  return (
    <div className="sb-fields">
      <label className="sb-field-label">{isOrdering ? "العناصر (بالترتيب أو غير مرتّبة)" : "مخزن الكلمات (خيارات القوائم)"}</label>
      <input
        className="sb-input"
        value={wordBank.join(" | ")}
        placeholder="اكتب الكلمات مفصولة بـ |"
        onChange={e => onChange({ wordBank: e.target.value.split("|").map(s => s.trim()).filter(Boolean) })}
        disabled={disabled}
      />
      <div className="sb-fields-list">
        {fields.map((f, i) => (
          <div className="sb-field-row" key={f.id}>
            <span className="sb-field-index">{i + 1}</span>
            <input className="sb-input sb-input-sm" value={f.label || ""} placeholder={"اسم الفراغ " + (i + 1)} onChange={e => patchField(f.id, { label: e.target.value })} disabled={disabled} />
            {wordBank.length ? (
              <select className="sb-input sb-input-sm" value={String(f.correct ?? "")} onChange={e => patchField(f.id, { correct: e.target.value }, true)} disabled={disabled}>
                <option value="">— الإجابة الصحيحة —</option>
                {wordBank.map((w, k) => <option key={k} value={w}>{w}</option>)}
              </select>
            ) : (
              <input className="sb-input sb-input-sm" value={String(f.correct ?? "")} placeholder="الإجابة الصحيحة" onChange={e => patchField(f.id, { correct: e.target.value }, true)} disabled={disabled} />
            )}
            <button type="button" className="sb-icon-btn" title="أعلى" onClick={() => move(f.id, -1, true)} disabled={disabled}>↑</button>
            <button type="button" className="sb-icon-btn" title="أسفل" onClick={() => move(f.id, 1, true)} disabled={disabled}>↓</button>
            <button type="button" className="sb-icon-btn sb-danger" title="حذف" onClick={() => removeField(f.id, true)} disabled={disabled}>×</button>
          </div>
        ))}
      </div>
      <button type="button" className="sb-mini-btn" onClick={() => setFields([...fields, newField({ label: "", kind: "select" })], true)} disabled={disabled}>+ إضافة فراغ</button>
    </div>
  );
}
