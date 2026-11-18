import { useId, useRef, useState } from "react";
import type { CalculatorToolV1 } from "./studentToolsSpec";
import { evaluateCalculator } from "./calculatorEngine";

// Phase T2 — the student calculator panel. All arithmetic is done by calculatorEngine (no eval). The expression field is LTR inside the
// RTL exam; keypad buttons insert at the caret. State (expression, last answer, history) lives here and survives closing the panel,
// because the tool dock keeps an opened tool mounted for the whole attempt.

type HistoryEntry = { expression: string; display: string };
const MAX_HISTORY = 20;

type Key = { label: string; insert?: string; action?: "clear" | "back" | "equals"; aria?: string; wide?: boolean };

const BASIC_KEYS: Key[] = [
  { label: "AC", action: "clear", aria: "مسح الكل" }, { label: "⌫", action: "back", aria: "حذف آخر رمز" }, { label: "(", insert: "(" }, { label: ")", insert: ")" },
  { label: "7", insert: "7" }, { label: "8", insert: "8" }, { label: "9", insert: "9" }, { label: "÷", insert: "÷", aria: "قسمة" },
  { label: "4", insert: "4" }, { label: "5", insert: "5" }, { label: "6", insert: "6" }, { label: "×", insert: "×", aria: "ضرب" },
  { label: "1", insert: "1" }, { label: "2", insert: "2" }, { label: "3", insert: "3" }, { label: "−", insert: "−", aria: "طرح" },
  { label: "0", insert: "0" }, { label: ".", insert: ".", aria: "فاصلة عشرية" }, { label: "Ans", insert: "Ans", aria: "الناتج السابق" }, { label: "+", insert: "+", aria: "جمع" },
  { label: "=", action: "equals", aria: "احسب", wide: true }
];
const SCIENTIFIC_KEYS: Key[] = [
  { label: "sin", insert: "sin(" }, { label: "cos", insert: "cos(" }, { label: "tan", insert: "tan(" }, { label: "√", insert: "√", aria: "جذر تربيعي" },
  { label: "sin⁻¹", insert: "asin(", aria: "معكوس الجيب" }, { label: "cos⁻¹", insert: "acos(", aria: "معكوس جيب التمام" }, { label: "tan⁻¹", insert: "atan(", aria: "معكوس الظل" }, { label: "∛", insert: "cbrt(", aria: "جذر تكعيبي" },
  { label: "xʸ", insert: "^", aria: "قوة" }, { label: "x²", insert: "^2", aria: "تربيع" }, { label: "n!", insert: "!", aria: "مضروب" }, { label: "|x|", insert: "abs(", aria: "القيمة المطلقة" },
  { label: "ln", insert: "ln(", aria: "اللوغاريتم الطبيعي" }, { label: "log", insert: "log(", aria: "اللوغاريتم العشري" }, { label: "π", insert: "π", aria: "باي" }, { label: "e", insert: "e", aria: "العدد e" }
];

export default function CalculatorTool({ config }: { config: CalculatorToolV1 }) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState<{ kind: "value" | "error"; text: string } | null>(null);
  const [ans, setAns] = useState<number | undefined>(undefined);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const insert = (text: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? expression.length, end = el?.selectionEnd ?? expression.length;
    const next = expression.slice(0, start) + text + expression.slice(end);
    setExpression(next);
    const caret = start + text.length;
    requestAnimationFrame(() => { const i = inputRef.current; if (i) { i.focus(); i.setSelectionRange(caret, caret); } });
  };
  const back = () => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? expression.length, end = el?.selectionEnd ?? expression.length;
    if (start !== end) { setExpression(expression.slice(0, start) + expression.slice(end)); return; }
    if (start === 0) return;
    setExpression(expression.slice(0, start - 1) + expression.slice(start));
    requestAnimationFrame(() => { const i = inputRef.current; if (i) { i.focus(); i.setSelectionRange(start - 1, start - 1); } });
  };
  const equals = () => {
    const r = evaluateCalculator(expression, { variant: config.variant, angleUnit: config.angleUnit, ans });
    if (!r.ok) { setResult({ kind: "error", text: r.message }); return; }
    setResult({ kind: "value", text: r.display });
    setAns(r.value);
    setHistory(h => [{ expression: expression.trim(), display: r.display }, ...h].slice(0, MAX_HISTORY));
  };
  const press = (k: Key) => {
    if (k.action === "clear") { setExpression(""); setResult(null); inputRef.current?.focus(); return; }
    if (k.action === "back") { back(); return; }
    if (k.action === "equals") { equals(); return; }
    if (k.insert) insert(k.insert);
  };

  const scientific = config.variant === "scientific";
  return (
    <div className="stt-calc" data-testid="tool-calculator">
      <p className="stt-meta">
        <span>{scientific ? "علمية" : "بسيطة"}</span>
        {scientific && <span>الزوايا: {config.angleUnit === "deg" ? "درجات" : "راديان"}</span>}
      </p>
      <label className="stt-label" htmlFor={id + "-expr"}>العملية</label>
      <input
        id={id + "-expr"} ref={inputRef} className="stt-input" dir="ltr" autoComplete="off" spellCheck={false} maxLength={200}
        value={expression} onChange={e => setExpression(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); equals(); } }}
        placeholder={scientific ? "مثال: 2^3 + sin(30)" : "مثال: (12 + 3) × 2"}
      />
      <output className={"stt-result" + (result?.kind === "error" ? " is-error" : "")} aria-live="polite" htmlFor={id + "-expr"} dir={result?.kind === "error" ? "rtl" : "ltr"} data-testid="calc-result">
        {result ? (result.kind === "value" ? "= " + result.text : result.text) : " "}
      </output>
      {scientific && (
        <div className="stt-keys stt-keys-sci" role="group" aria-label="الدوال العلمية">
          {SCIENTIFIC_KEYS.map(k => <button key={k.label} type="button" className="stt-key is-fn" aria-label={k.aria} onClick={() => press(k)}>{k.label}</button>)}
        </div>
      )}
      <div className="stt-keys" role="group" aria-label="لوحة الأرقام">
        {BASIC_KEYS.map(k => (
          <button key={k.label} type="button" aria-label={k.aria}
            className={"stt-key" + (k.action === "equals" ? " is-equals" : k.action ? " is-action" : k.insert && /[÷×−+]/.test(k.insert) ? " is-op" : "") + (k.wide ? " is-wide" : "")}
            onClick={() => press(k)}>{k.label}</button>
        ))}
      </div>
      {history.length > 0 && (
        <details className="stt-history">
          <summary>السجل ({history.length})</summary>
          <ol>
            {history.map((h, i) => (
              <li key={i}>
                <button type="button" className="stt-history-item" dir="ltr" onClick={() => { setExpression(h.expression); inputRef.current?.focus(); }}
                  aria-label={"استخدام العملية " + h.expression}>
                  <span>{h.expression}</span><strong>= {h.display}</strong>
                </button>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
