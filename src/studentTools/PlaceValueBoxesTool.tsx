import { useRef, useState } from "react";
import type { PlaceValueBoxesToolV1 } from "./studentToolsSpec";
import { boxDigit, boxRows, placeValues } from "./placeValueBoxes";

// Phase T13 — «صناديق التحويل» (the owner's document): the place values 128 … 1 above empty boxes. The student writes 0 or 1 in each
// box and works the value out alone: nothing is added, converted or checked, and no total is shown. Typing a digit moves to the
// next box; Backspace on an empty box moves back. What the student typed stays while the tool is closed (the dock keeps it mounted)
// and is discarded with the page: nothing is stored or sent.

export default function PlaceValueBoxesTool({ config }: { config: PlaceValueBoxesToolV1 }) {
  const values = placeValues(config.width);
  const rows = boxRows(config.width);
  const [digits, setDigits] = useState<string[]>(() => values.map(() => ""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focusBox = (i: number) => refs.current[i]?.focus();
  const set = (i: number, d: string) => setDigits(prev => prev.map((v, k) => (k === i ? d : v)));
  let index = 0;
  return (
    <div data-testid="tool-placeValueBoxes">
      <p className="stt-hint">اكتب 0 أو 1 في كل صندوق تحت قيمة منزلته، ثم احسب بنفسك. الأداة لا تحسب شيئًا.</p>
      {rows.map((row, r) => (
        <div className="stt-table-wrap" key={r}>
          <table className="stt-table stt-pv-table" dir="ltr" aria-label={rows.length > 1 ? "صناديق التحويل، البايت " + (r + 1) : "صناديق التحويل"}>
            <thead><tr>{row.map(v => <th scope="col" key={v}>{v}</th>)}</tr></thead>
            <tbody><tr>{row.map(v => {
              const i = index++;
              return (
                <td key={v}>
                  <input ref={el => { refs.current[i] = el; }} className="stt-input stt-pv-box" inputMode="numeric" autoComplete="off" maxLength={2}
                    aria-label={"صندوق المنزلة " + v} value={digits[i]}
                    onChange={e => { const d = boxDigit(e.target.value); set(i, d); if (d && i + 1 < values.length) focusBox(i + 1); }}
                    onKeyDown={e => { if (e.key === "Backspace" && !digits[i] && i > 0) { e.preventDefault(); set(i - 1, ""); focusBox(i - 1); } }} />
                </td>
              );
            })}</tr></tbody>
          </table>
        </div>
      ))}
      <div className="stt-row">
        <button type="button" className="stt-btn" onClick={() => { setDigits(values.map(() => "")); focusBox(0); }}>مسح الصناديق</button>
      </div>
    </div>
  );
}
