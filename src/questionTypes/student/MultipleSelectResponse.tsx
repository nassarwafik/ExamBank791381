import type { StudentRendererProps } from "../registryTypes";

// Phase 16A — Multiple Select student response (lazy): semantic checkboxes inside a fieldset named by the prompt; the
// response references option IDENTITIES ({ kind: "multiChoice", optionIds }). No answer key exists in the student payload.
const optText = (o: { text?: string; label?: string; value?: string }) => o.text || o.label || o.value || "";
export default function MultipleSelectResponse({ q, id, answer, onAnswer, disabled, textId }: StudentRendererProps) {
  const selected = answer?.kind === "multiChoice" ? answer.optionIds : [];
  const options = (q.options || []).map((o, n) => ({ ...o, id: (o as { id?: string }).id || String(n) }));
  const toggle = (oid: string) => onAnswer({ kind: "multiChoice", optionIds: selected.includes(oid) ? selected.filter(x => x !== oid) : [...selected, oid] });
  return <fieldset className="iex-options iex-multi" aria-labelledby={textId}>
    <legend className="iex-visually-hidden">اختر كل الإجابات الصحيحة</legend>
    {options.map(o => <label className={"iex-option " + (selected.includes(o.id) ? "selected" : "")} key={o.id}><input type="checkbox" name={id + "-" + o.id} checked={selected.includes(o.id)} onChange={() => toggle(o.id)} disabled={disabled} /><span className="iex-pick iex-pick-box" aria-hidden="true">{selected.includes(o.id) ? "✓" : ""}</span><b>{optText(o)}</b></label>)}
  </fieldset>;
}
