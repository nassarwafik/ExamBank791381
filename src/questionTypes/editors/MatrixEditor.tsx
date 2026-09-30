import { useId } from "react";
import type { LabeledIdentity } from "../../examTypes";
import { genId } from "../../examBuilderState";
import type { AuthoringEditorProps } from "../registryTypes";

// Phase 16A — Matrix / grid authoring (lazy). Rows and columns carry STABLE ids; the key maps rowId → columnId so reordering
// or deleting never corrupts correctness. One radio group per row marks the correct column.
type Key = Record<string, string>;
const keyOf = (answer: unknown): Key => { const a = (answer && typeof answer === "object" ? (answer as { correctColumnByRow?: unknown }).correctColumnByRow : undefined); const out: Key = {}; if (a && typeof a === "object") for (const [k, v] of Object.entries(a as Record<string, unknown>)) if (typeof v === "string") out[k] = v; return out; };
const move = <T,>(list: T[], i: number, d: number) => { const j = i + d; if (j < 0 || j >= list.length) return list; const next = list.slice(); [next[i], next[j]] = [next[j], next[i]]; return next; };

export default function MatrixEditor({ node, onChange, disabled }: AuthoringEditorProps) {
  const uid = useId();
  const rows: LabeledIdentity[] = node.matrix?.rows ?? [], columns: LabeledIdentity[] = node.matrix?.columns ?? [];
  const key = keyOf(node.answer);
  const commit = (r: LabeledIdentity[], c: LabeledIdentity[], k: Key) => {
    const colIds = new Set(c.map(x => x.id)), rowIds = new Set(r.map(x => x.id));
    const clean: Key = {}; for (const [rid, cid] of Object.entries(k)) if (rowIds.has(rid) && colIds.has(cid)) clean[rid] = cid;
    onChange({ matrix: { rows: r, columns: c }, answer: { correctColumnByRow: clean } });
  };
  return (
    <div className="qt-editor qt-matrix" data-testid="qt-editor-matrix">
      <p className="sb-hint">لكل صف إجابة صحيحة واحدة: اختر العمود الصحيح بالزر الدائري. الترتيب لا يؤثر في مفتاح الإجابة.</p>
      <div className="iex-table-wrap"><table className="qt-matrix-table">
        <thead><tr><th scope="col">الصف</th>{columns.map((c, ci) => <th scope="col" key={c.id}><div className="qt-col-head"><input className="sb-input sb-input-sm" aria-label={"العمود " + (ci + 1)} value={c.label} placeholder={"العمود " + (ci + 1)} onChange={e => commit(rows, columns.map((x, k) => (k === ci ? { ...x, label: e.target.value } : x)), key)} disabled={disabled} />
          <span className="qt-mini-actions"><button type="button" className="sb-icon-btn" aria-label="عمود لليمين" title="عمود لليمين" onClick={() => commit(rows, move(columns, ci, -1), key)} disabled={disabled || ci === 0}>→</button><button type="button" className="sb-icon-btn" aria-label="عمود لليسار" title="عمود لليسار" onClick={() => commit(rows, move(columns, ci, 1), key)} disabled={disabled || ci === columns.length - 1}>←</button>{columns.length > 2 && <button type="button" className="sb-icon-btn sb-danger" aria-label="حذف العمود" title="حذف العمود" onClick={() => commit(rows, columns.filter((_, k) => k !== ci), key)} disabled={disabled}>×</button>}</span></div></th>)}<th scope="col" aria-label="إجراءات"></th></tr></thead>
        <tbody>{rows.map((r, ri) => <tr key={r.id}>
          <th scope="row"><input className="sb-input sb-input-sm" aria-label={"الصف " + (ri + 1)} value={r.label} placeholder={"الصف " + (ri + 1)} onChange={e => commit(rows.map((x, k) => (k === ri ? { ...x, label: e.target.value } : x)), columns, key)} disabled={disabled} /></th>
          {columns.map(c => <td key={c.id} className="qt-cell"><input type="radio" name={uid + "-" + r.id} aria-label={"الإجابة الصحيحة للصف " + (r.label || ri + 1) + " — " + (c.label || "عمود")} checked={key[r.id] === c.id} onChange={() => commit(rows, columns, { ...key, [r.id]: c.id })} disabled={disabled} /></td>)}
          <td><span className="qt-mini-actions"><button type="button" className="sb-icon-btn" aria-label="صف لأعلى" title="صف لأعلى" onClick={() => commit(move(rows, ri, -1), columns, key)} disabled={disabled || ri === 0}>↑</button><button type="button" className="sb-icon-btn" aria-label="صف لأسفل" title="صف لأسفل" onClick={() => commit(move(rows, ri, 1), columns, key)} disabled={disabled || ri === rows.length - 1}>↓</button>{rows.length > 1 && <button type="button" className="sb-icon-btn sb-danger" aria-label="حذف الصف" title="حذف الصف" onClick={() => commit(rows.filter((_, k) => k !== ri), columns, key)} disabled={disabled}>×</button>}</span></td>
        </tr>)}</tbody>
      </table></div>
      <div className="sb-actions">
        <button type="button" className="sb-mini-btn" onClick={() => commit([...rows, { id: genId("row"), label: "" }], columns, key)} disabled={disabled}>+ إضافة صف</button>
        <button type="button" className="sb-mini-btn" onClick={() => commit(rows, [...columns, { id: genId("col"), label: "" }], key)} disabled={disabled}>+ إضافة عمود</button>
      </div>
      {rows.some(r => !key[r.id]) && <p className="sb-hint sb-warn-text">بعض الصفوف بلا إجابة صحيحة محددة.</p>}
    </div>
  );
}
