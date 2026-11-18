import { useId, useState } from "react";
import type { BaseConverterToolV1, NumberBase } from "./studentToolsSpec";
import { parseInBase, formatInBase, groupDigits, conversionSteps, BASE_LABEL, type ConversionSteps } from "./baseConverter";

// Phase T3 — the student number-base converter panel. All arithmetic is baseConverter.ts (exact BigInt). Bases are the teacher's;
// the step-by-step working appears only when the teacher allowed it.

const Ltr = ({ children }: { children: string }) => <bdi dir="ltr" className="stt-ltr">{children}</bdi>;
const sub = (base: number) => String(base).split("").map(d => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]).join("");

function Steps({ steps, from, to }: { steps: ConversionSteps; from: NumberBase; to: NumberBase }) {
  switch (steps.kind) {
    case "same": return null;
    case "toDecimal":
      return (
        <div className="stt-steps" data-testid="base-steps">
          <p className="stt-hint">نضرب كل رقم في أساس النظام مرفوعًا لقوة منزلته ثم نجمع:</p>
          <p className="stt-steps-line" dir="ltr">{steps.terms.map(t => t.digit + "×" + t.base + "^" + t.power).join(" + ")}</p>
          <p className="stt-steps-line" dir="ltr">= {steps.terms.map(t => t.value).join(" + ")} = {steps.total}{sub(10)}</p>
        </div>
      );
    case "fromDecimal":
      return (
        <div className="stt-steps" data-testid="base-steps">
          <p className="stt-hint">نقسم على {to} مرة بعد مرة ونكتب البواقي من الأسفل إلى الأعلى:</p>
          <div className="stt-table-wrap">
            <table className="stt-table">
              <thead><tr><th scope="col">العدد</th><th scope="col">÷ {to}</th><th scope="col">الباقي</th></tr></thead>
              <tbody>{steps.divisions.map((d, i) => <tr key={i}><td dir="ltr">{d.dividend}</td><td dir="ltr">{d.quotient}</td><td dir="ltr">{d.remainder}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="stt-steps-line">الناتج: <Ltr>{steps.result + sub(to)}</Ltr></p>
        </div>
      );
    case "grouping":
      return (
        <div className="stt-steps" data-testid="base-steps">
          <p className="stt-hint">{from === 2 ? "نقسم البتات من اليمين إلى مجموعات من " + steps.bitsPerDigit + " ونحوّل كل مجموعة إلى رقم:" : "نكتب كل رقم بـ " + steps.bitsPerDigit + " بتات:"}</p>
          <p className="stt-steps-line" dir="ltr">{steps.groups.map(g => g.from + "→" + g.to).join("   ")}</p>
          <p className="stt-steps-line">الناتج: <Ltr>{steps.result + sub(to)}</Ltr></p>
        </div>
      );
    case "viaDecimal":
      return (
        <>
          <Steps steps={steps.toDecimal} from={from} to={10} />
          <Steps steps={steps.fromDecimal} from={10} to={to} />
        </>
      );
  }
}

export default function BaseConverterTool({ config }: { config: BaseConverterToolV1 }) {
  const id = useId();
  const bases = config.bases;
  const [from, setFrom] = useState<NumberBase>(bases.includes(10) ? 10 : bases[0]);
  const [text, setText] = useState("");
  const [value, setValue] = useState<bigint | null>(null);
  const [error, setError] = useState("");
  const [stepsTo, setStepsTo] = useState<NumberBase | null>(null);

  const convert = () => {
    const r = parseInBase(text, from);
    if (!r.ok) { setValue(null); setError(r.message); return; }
    setError(""); setValue(r.value);
    setStepsTo(prev => (prev !== null && prev !== from ? prev : bases.find(b => b !== from) ?? null));
  };

  return (
    <div className="stt-base" data-testid="tool-baseConverter">
      <label className="stt-label" htmlFor={id + "-from"}>من النظام</label>
      <select id={id + "-from"} className="stt-input stt-select" value={from} onChange={e => { setFrom(Number(e.target.value) as NumberBase); setValue(null); setError(""); }}>
        {bases.map(b => <option key={b} value={b}>{BASE_LABEL[b]} ({b})</option>)}
      </select>
      <label className="stt-label" htmlFor={id + "-num"}>العدد</label>
      <div className="stt-row">
        <input id={id + "-num"} className="stt-input" dir="ltr" autoComplete="off" spellCheck={false} maxLength={100}
          value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); convert(); } }}
          placeholder={from === 2 ? "1011" : from === 16 ? "2F" : from === 8 ? "17" : "45"} />
        <button type="button" className="stt-btn is-primary" onClick={convert}>حوّل</button>
      </div>
      {error && <p className="stt-error" role="alert">{error}</p>}
      {value !== null && (
        <div aria-live="polite" data-testid="base-result">
          <dl className="stt-dl">
            {bases.filter(b => b !== from).map(b => (
              <div key={b}><dt>{BASE_LABEL[b]} ({b})</dt><dd><Ltr>{groupDigits(formatInBase(value, b), b)}</Ltr></dd></div>
            ))}
          </dl>
          {config.showSteps && stepsTo !== null && (
            <fieldset className="stt-fieldset">
              <legend>خطوات التحويل</legend>
              <div className="stt-radios" role="radiogroup" aria-label="التحويل إلى">
                {bases.filter(b => b !== from).map(b => (
                  <label key={b} className="stt-radio"><input type="radio" name={id + "-steps"} checked={stepsTo === b} onChange={() => setStepsTo(b)} />إلى {BASE_LABEL[b]}</label>
                ))}
              </div>
              <Steps steps={conversionSteps(value, from, stepsTo)} from={from} to={stepsTo} />
            </fieldset>
          )}
        </div>
      )}
    </div>
  );
}
