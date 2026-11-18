import { useId, useState } from "react";
import type { BitwiseCalculatorToolV1 } from "./studentToolsSpec";
import { bitwise, BITWISE_OPS, BITWISE_LABEL, type BitwiseOp, type OperandBase, type BitwiseResult } from "./bitwise";

// Phase T6 — the student bitwise calculator on the teacher's word width.
const BASE_LABEL: Record<OperandBase, string> = { 2: "ثنائي", 10: "عشري", 16: "ست عشري" };

export default function BitwiseTool({ config }: { config: BitwiseCalculatorToolV1 }) {
  const id = useId();
  const [base, setBase] = useState<OperandBase>(2);
  const [op, setOp] = useState<BitwiseOp>("AND");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [res, setRes] = useState<BitwiseResult | null>(null);
  const shift = op === "SHL" || op === "SHR";
  const run = () => setRes(bitwise(op, a, b, base, config.width));
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); run(); } };
  return (
    <div data-testid="tool-bitwiseCalculator">
      <p className="stt-meta"><span>طول الكلمة: {config.width} بت</span></p>
      <div className="stt-row">
        <label className="stt-label" htmlFor={id + "-base"}>المدخلات</label>
        <select id={id + "-base"} className="stt-input stt-select" value={base} onChange={e => { setBase(Number(e.target.value) as OperandBase); setRes(null); }}>
          {([2, 10, 16] as OperandBase[]).map(x => <option key={x} value={x}>{BASE_LABEL[x]}</option>)}
        </select>
        <label className="stt-label" htmlFor={id + "-op"}>العملية</label>
        <select id={id + "-op"} className="stt-input stt-select" value={op} onChange={e => { setOp(e.target.value as BitwiseOp); setRes(null); }}>
          {BITWISE_OPS.map(x => <option key={x} value={x}>{BITWISE_LABEL[x]}</option>)}
        </select>
      </div>
      <label className="stt-label" htmlFor={id + "-a"}>A</label>
      <input id={id + "-a"} className="stt-input" dir="ltr" autoComplete="off" spellCheck={false} maxLength={40} value={a} onChange={e => setA(e.target.value)} onKeyDown={enter} />
      {op !== "NOT" && <>
        <label className="stt-label" htmlFor={id + "-b"}>{shift ? "مقدار الإزاحة (بالعشري)" : "B"}</label>
        <input id={id + "-b"} className="stt-input" dir="ltr" autoComplete="off" spellCheck={false} maxLength={40} value={b} onChange={e => setB(e.target.value)} onKeyDown={enter} />
      </>}
      <div className="stt-row stt-plot-actions"><button type="button" className="stt-btn is-primary" onClick={run}>احسب</button></div>
      {res && !res.ok && <p className="stt-error" role="alert">{res.message}</p>}
      {res && res.ok && (
        <div className="stt-table-wrap" aria-live="polite" data-testid="bitwise-result">
          <table className="stt-table" dir="ltr">
            <thead><tr><th scope="col"></th><th scope="col">Bin</th><th scope="col">Dec</th><th scope="col">Hex</th></tr></thead>
            <tbody>
              <tr><th scope="row">A</th><td>{res.a.bin}</td><td>{res.a.dec}</td><td>{res.a.hex}</td></tr>
              {res.b && !shift && <tr><th scope="row">B</th><td>{res.b.bin}</td><td>{res.b.dec}</td><td>{res.b.hex}</td></tr>}
              <tr><th scope="row">{op === "NOT" ? "NOT A" : shift ? "A " + (op === "SHL" ? "<<" : ">>") + " " + b.trim() : "A " + op + " B"}</th><td><strong>{res.result.bin}</strong></td><td><strong>{res.result.dec}</strong></td><td><strong>{res.result.hex}</strong></td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
