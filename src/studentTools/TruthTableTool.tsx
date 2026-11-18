import { useId, useState } from "react";
import type { TruthTableToolV1 } from "./studentToolsSpec";
import { truthTable, type TruthTableResult } from "./truthTable";

// Phase T6 — the student truth-table tool, up to the teacher's number of variables.
export default function TruthTableTool({ config }: { config: TruthTableToolV1 }) {
  const id = useId();
  const [expr, setExpr] = useState("");
  const [res, setRes] = useState<TruthTableResult | null>(null);
  const run = () => setRes(truthTable(expr, config.maxVariables));
  return (
    <div data-testid="tool-truthTable">
      <label className="stt-label" htmlFor={id + "-e"}>العبارة المنطقية (حتى {config.maxVariables} متغيرات)</label>
      <div className="stt-row">
        <input id={id + "-e"} className="stt-input" dir="ltr" autoComplete="off" spellCheck={false} maxLength={200} value={expr} placeholder="A AND (B OR NOT C)"
          onChange={e => setExpr(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); run(); } }} />
        <button type="button" className="stt-btn is-primary" onClick={run}>أنشئ الجدول</button>
      </div>
      <p className="stt-hint">المتغيرات حروف كبيرة (A، B، …). العمليات: <bdi dir="ltr">NOT ¬ ! ' · AND ∧ & · OR ∨ + · XOR ⊕ ^ · NAND · NOR</bdi>، و<bdi dir="ltr">AB</bdi> تعني <bdi dir="ltr">A AND B</bdi>.</p>
      {res && !res.ok && <p className="stt-error" role="alert">{res.message}</p>}
      {res && res.ok && (
        <div aria-live="polite" data-testid="truth-result">
          <p className="stt-hint">العبارة كما فُهمت: <bdi dir="ltr" className="stt-ltr">{res.normalized}</bdi></p>
          <div className="stt-table-wrap">
            <table className="stt-table" dir="ltr">
              <thead><tr>{res.variables.map(v => <th key={v} scope="col">{v}</th>)}<th scope="col">Q</th></tr></thead>
              <tbody>{res.rows.map((r, i) => <tr key={i}>{r.inputs.map((x, j) => <td key={j}>{x ? 1 : 0}</td>)}<td><strong>{r.output ? 1 : 0}</strong></td></tr>)}</tbody>
            </table>
          </div>
          {res.variables.length > 0 && <p className="stt-hint">الحدود الصغرى: <bdi dir="ltr" className="stt-ltr">{res.minterms.length ? "Σm(" + res.minterms.join(", ") + ")" : "لا يوجد (العبارة خاطئة دائمًا)"}</bdi></p>}
        </div>
      )}
    </div>
  );
}
