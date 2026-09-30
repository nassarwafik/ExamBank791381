import type { StudentRendererProps } from "../registryTypes";

// Phase 16A — Numeric Response student input (lazy): a labelled text input with inputmode="decimal" (Arabic / English
// separators accepted by the grader) and, when the question requires it, a unit field. Emits { kind: "numeric", value, unit }.
export default function NumericResponseInput({ q, answer, onAnswer, disabled, labelPrefix }: StudentRendererProps) {
  const value = answer?.kind === "numeric" ? answer.value : "", unit = answer?.kind === "numeric" ? answer.unit ?? "" : "";
  const unitRequired = !!(q as { numeric?: { unitRequired?: boolean } }).numeric?.unitRequired;
  const emit = (v: string, u: string) => onAnswer(unitRequired ? { kind: "numeric", value: v, unit: u } : { kind: "numeric", value: v });
  return <div className="iex-numeric">
    <label className="iex-numeric-field"><span>القيمة</span><input className="iex-cell iex-numeric-input" inputMode="decimal" autoComplete="off" aria-label={labelPrefix + " — القيمة"} value={value} onChange={e => emit(e.target.value, unit)} placeholder="اكتب القيمة العددية" disabled={disabled} dir="ltr" /></label>
    {unitRequired && <label className="iex-numeric-field"><span>الوحدة</span><input className="iex-cell iex-numeric-unit" autoComplete="off" aria-label={labelPrefix + " — الوحدة"} value={unit} onChange={e => emit(value, e.target.value)} placeholder="الوحدة" disabled={disabled} dir="ltr" /></label>}
  </div>;
}
