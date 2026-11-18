import { useId, useState } from "react";
import type { AsciiTableToolV1 } from "./studentToolsSpec";
import { asciiRows, asciiLookup, type AsciiRow } from "./asciiTable";

// Phase T6 — the student ASCII table: a lookup field (a character, a code in decimal / hex / binary, or a control name) and the
// teacher's range of the table (printable 32–126, or the full 0–127).

function Rows({ rows, caption }: { rows: readonly AsciiRow[]; caption: string }) {
  return (
    <div className="stt-table-wrap">
      <table className="stt-table" dir="ltr">
        <caption dir="rtl">{caption}</caption>
        <thead><tr><th scope="col">Char</th><th scope="col">Dec</th><th scope="col">Hex</th><th scope="col">Oct</th><th scope="col">Bin</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.code}><th scope="row">{r.printable ? (r.code === 32 ? "SP" : r.char) : r.name}</th><td>{r.dec}</td><td>{r.hex}</td><td>{r.oct}</td><td>{r.bin}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export default function AsciiTableTool({ config }: { config: AsciiTableToolV1 }) {
  const id = useId();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<readonly AsciiRow[] | null>(null);
  const [error, setError] = useState("");
  const look = () => { const r = asciiLookup(q, config.range); if (r.ok) { setFound(r.rows); setError(""); } else { setFound(null); setError(r.message); } };
  return (
    <div data-testid="tool-asciiTable">
      <label className="stt-label" htmlFor={id + "-q"}>ابحث بحرف أو برمز (مثل A أو 65 أو 0x41 أو LF)</label>
      <div className="stt-row">
        <input id={id + "-q"} className="stt-input" dir="ltr" autoComplete="off" spellCheck={false} maxLength={64} value={q}
          onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); look(); } }} />
        <button type="button" className="stt-btn is-primary" onClick={look}>ابحث</button>
      </div>
      {error && <p className="stt-error" role="alert">{error}</p>}
      {found && <div aria-live="polite" data-testid="ascii-found"><Rows rows={found} caption="النتيجة" /></div>}
      <details className="stt-history">
        <summary>{config.range === "full" ? "الجدول كاملًا (0–127)" : "الرموز المطبوعة (32–126)"}</summary>
        <Rows rows={asciiRows(config.range)} caption="جدول ASCII" />
      </details>
    </div>
  );
}
