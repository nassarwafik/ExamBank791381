
import type { QuestionBody, BuilderField } from "./examTypes";
import { addTableColumn, addTableRow, deleteTableColumn, deleteTableRow, toggleTableCell, tableFieldAt } from "./examBuilderState";

// Visual table editor. The teacher edits column headers and static cell text, and clicks a cell to
// make it answerable. An answerable cell exposes its kind (text / select / boolean), correct answer,
// and — for a select — its dropdown options. This is the editor counterpart to the student QuestionField
// tableFill renderer; both address cells explicitly by (row, column), never by column position.

type Props = { question: QuestionBody; onChange: (patch: Partial<QuestionBody>) => void; disabled?: boolean };

export default function TableFillEditor({ question, onChange, disabled }: Props) {
  const headers = question.tableHeaders || [];
  const rows = question.tableRows || [];
  const cols = headers.length;

  const setHeader = (c: number, value: string) => onChange({ tableHeaders: headers.map((h, i) => (i === c ? value : h)) });
  const setCellText = (r: number, c: number, value: string) => onChange({ tableRows: rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row)) });
  const patchField = (fieldId: string, patch: Partial<BuilderField>) => onChange({ fields: (question.fields || []).map(f => (f.id === fieldId ? { ...f, ...patch } : f)) });

  return (
    <div className="sb-tablefill">
      <div className="sb-tablefill-scroll">
        <table className="sb-grid">
          <thead>
            <tr>
              {headers.map((h, c) => (
                <th key={c}>
                  <input className="sb-input sb-input-sm" value={h} placeholder={"العمود " + (c + 1)} onChange={e => setHeader(c, e.target.value)} disabled={disabled} />
                  {cols > 1 && <button type="button" className="sb-icon-btn sb-danger" title="حذف العمود" onClick={() => onChange(deleteTableColumn(question, c))} disabled={disabled}>×</button>}
                </th>
              ))}
              <th className="sb-grid-actions"><button type="button" className="sb-mini-btn" onClick={() => onChange(addTableColumn(question))} disabled={disabled}>+ عمود</button></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {Array.from({ length: cols }, (_, c) => {
                  const field = tableFieldAt(question, r, c);
                  return (
                    <td key={c} className={field ? "sb-cell-answer" : ""}>
                      {field ? (
                        <div className="sb-cell-editor">
                          <div className="sb-cell-row">
                            <select className="sb-input sb-input-sm" value={field.kind || "text"} onChange={e => patchField(field.id, { kind: e.target.value as BuilderField["kind"] })} disabled={disabled}>
                              <option value="text">نص</option>
                              <option value="select">قائمة</option>
                              <option value="boolean">صح/خطأ</option>
                            </select>
                            <button type="button" className="sb-icon-btn" title="إلغاء كخلية جواب" onClick={() => onChange(toggleTableCell(question, r, c))} disabled={disabled}>↩</button>
                          </div>
                          {field.kind === "boolean" ? (
                            <select className="sb-input sb-input-sm" value={String(field.correct === true ? "true" : field.correct === false ? "false" : "")} onChange={e => patchField(field.id, { correct: e.target.value === "" ? undefined : e.target.value === "true" })} disabled={disabled}>
                              <option value="">— الإجابة —</option>
                              <option value="true">صحيح</option>
                              <option value="false">غير صحيح</option>
                            </select>
                          ) : (
                            <input className="sb-input sb-input-sm" value={String(field.correct ?? "")} placeholder="الإجابة الصحيحة" onChange={e => patchField(field.id, { correct: e.target.value })} disabled={disabled} />
                          )}
                          {field.kind === "select" && (
                            <input className="sb-input sb-input-sm" value={(field.options || []).map(o => o.text || o.value || o.label || "").join(" | ")} placeholder="الخيارات مفصولة بـ |" onChange={e => patchField(field.id, { options: e.target.value.split("|").map(s => ({ text: s.trim() })).filter(o => o.text) })} disabled={disabled} />
                          )}
                        </div>
                      ) : (
                        <div className="sb-cell-static">
                          <input className="sb-input sb-input-sm" value={row[c] ?? ""} placeholder="نص ثابت" onChange={e => setCellText(r, c, e.target.value)} disabled={disabled} />
                          <button type="button" className="sb-mini-btn" title="اجعلها خلية جواب" onClick={() => onChange(toggleTableCell(question, r, c))} disabled={disabled}>✎ جواب</button>
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="sb-grid-actions">{rows.length > 1 && <button type="button" className="sb-icon-btn sb-danger" title="حذف الصف" onClick={() => onChange(deleteTableRow(question, r))} disabled={disabled}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="sb-mini-btn" onClick={() => onChange(addTableRow(question))} disabled={disabled}>+ إضافة صف</button>
    </div>
  );
}
