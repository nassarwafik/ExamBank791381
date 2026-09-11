
import type { QuestionBody, BuilderField } from "./examTypes";
import { cliPlaceholders, newField } from "./examBuilderState";

// CLI-fill editor: a monospace template textarea where blanks are written as [[fieldId]], plus a list
// of the fields those placeholders reference (each with its correct answer). Live validation shows the
// teacher any placeholder without a field and any field not used in the template — the exact checks the
// student engine and grader rely on. The fixed CLI text is never editable by the student; only the
// blanks are answer controls.

type Props = { question: QuestionBody; onChange: (patch: Partial<QuestionBody>) => void; disabled?: boolean };

export default function CliFillEditor({ question, onChange, disabled }: Props) {
  const cli = question.cli || "";
  const fields = question.fields || [];
  const placeholders = cliPlaceholders(cli);
  const fieldIds = new Set(fields.map(f => f.id));
  const missingFields = placeholders.filter(ph => !fieldIds.has(ph));
  const unusedFields = fields.filter(f => !placeholders.includes(f.id));

  const patchField = (id: string, patch: Partial<BuilderField>) => onChange({ fields: fields.map(f => (f.id === id ? { ...f, ...patch } : f)) });
  const removeField = (id: string) => onChange({ fields: fields.filter(f => f.id !== id) });
  // Adds a field whose id is a clean slug the teacher can drop into the template as [[slug]].
  const addFieldForPlaceholder = (id: string) => onChange({ fields: [...fields, newField({ id, label: id, correct: "" })] });
  const addField = () => {
    let i = fields.length + 1;
    let id = "f" + i;
    while (fieldIds.has(id)) { i += 1; id = "f" + i; }
    onChange({ fields: [...fields, newField({ id, label: id, correct: "" })] });
  };

  return (
    <div className="sb-clifill">
      <label className="sb-field-label">قالب الأوامر (اكتب الفراغ هكذا: <code>[[معرّف]]</code>)</label>
      <textarea className="sb-cli-textarea" dir="ltr" spellCheck={false} value={cli} placeholder={"R1(config)# encapsulation dot1Q [[vlan]]\nR1(config-subif)# ip address [[ip]] 255.255.255.0"} onChange={e => onChange({ cli: e.target.value })} disabled={disabled} />

      <div className="sb-cli-fields">
        <div className="sb-row-between"><strong>حقول الفراغات</strong><button type="button" className="sb-mini-btn" onClick={addField} disabled={disabled}>+ حقل</button></div>
        {fields.length === 0 && <p className="sb-hint">لا توجد حقول بعد. أضِف حقلًا واكتب معرّفه بين <code>[[ ]]</code> داخل القالب.</p>}
        {fields.map(f => (
          <div className="sb-cli-field-row" key={f.id}>
            <code className="sb-code-chip">[[{f.id}]]</code>
            <input className="sb-input sb-input-sm" value={f.correct === undefined ? "" : String(f.correct)} placeholder="الإجابة الصحيحة" onChange={e => patchField(f.id, { correct: e.target.value })} disabled={disabled} />
            <button type="button" className="sb-icon-btn sb-danger" title="حذف الحقل" onClick={() => removeField(f.id)} disabled={disabled}>×</button>
          </div>
        ))}
      </div>

      {missingFields.length > 0 && (
        <div className="sb-warn sb-warn-error">
          فراغات بلا حقول: {missingFields.map(ph => (<button key={ph} type="button" className="sb-mini-btn" onClick={() => addFieldForPlaceholder(ph)} disabled={disabled}>+ إضافة حقل «{ph}»</button>))}
        </div>
      )}
      {unusedFields.length > 0 && (
        <div className="sb-warn">حقول غير مستخدمة في القالب: {unusedFields.map(f => f.id).join("، ")}</div>
      )}
    </div>
  );
}
