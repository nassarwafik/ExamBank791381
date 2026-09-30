import type { StudentRendererProps } from "../registryTypes";

// Phase 16A — Matrix student response (lazy): a real table (column headers, row headers) with ONE radio group per row; the
// response is { kind: "fields", values: { rowId: columnId } }. Keyboard operable (native radios), names carry row + column.
type Cfg = { rows?: { id: string; label: string }[]; columns?: { id: string; label: string }[] };
export default function MatrixResponse({ q, id, answer, onAnswer, disabled, labelPrefix }: StudentRendererProps) {
  const cfg = ((q as { matrix?: Cfg }).matrix || {}) as Cfg;
  const rows = Array.isArray(cfg.rows) ? cfg.rows : [], columns = Array.isArray(cfg.columns) ? cfg.columns : [];
  const values = answer?.kind === "fields" ? answer.values : {};
  const pick = (rid: string, cid: string) => onAnswer({ kind: "fields", values: { ...(answer?.kind === "fields" ? answer.values : {}), [rid]: cid } });
  return <div className="iex-table-wrap"><table className="iex-matrix"><thead><tr><th scope="col">{" "}</th>{columns.map(c => <th key={c.id} scope="col">{c.label}</th>)}</tr></thead>
    <tbody>{rows.map(r => <tr key={r.id}><th scope="row">{r.label}</th>{columns.map(c => <td key={c.id} className="iex-matrix-cell"><input type="radio" name={id + "-" + r.id} aria-label={labelPrefix + " — " + r.label + " — " + c.label} checked={values[r.id] === c.id} onChange={() => pick(r.id, c.id)} disabled={disabled} /></td>)}</tr>)}</tbody></table></div>;
}
