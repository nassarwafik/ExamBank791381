import { useId } from "react";
import type { BuilderOption } from "../../examTypes";
import { genId } from "../../examBuilderState";
import { MULTIPLE_SELECT_SCORING, MULTIPLE_SELECT_SCORING_LABELS, type MultipleSelectScoring } from "../../questionTypeScoring";
import type { AuthoringEditorProps } from "../registryTypes";

// Phase 16A — Multiple Select authoring (lazy). Options carry STABLE ids; the answer key references ids, so moving or
// deleting an option can never corrupt it. Emits canonical patches only (options / answer) — the host owns everything else.
const optText = (o: BuilderOption) => o.text ?? o.label ?? o.value ?? "";
type Key = { correctOptionIds: string[]; scoring: MultipleSelectScoring };
const keyOf = (answer: unknown): Key => { const a = (answer && typeof answer === "object" ? answer : {}) as Partial<Key>; return { correctOptionIds: Array.isArray(a.correctOptionIds) ? a.correctOptionIds.filter((x): x is string => typeof x === "string") : [], scoring: (MULTIPLE_SELECT_SCORING as readonly string[]).includes(a.scoring as string) ? (a.scoring as MultipleSelectScoring) : "allOrNothing" }; };

export default function MultipleSelectEditor({ node, onChange, disabled }: AuthoringEditorProps) {
  const uid = useId();
  const options = (node.options || []).map(o => (o.id ? o : { ...o, id: genId("opt") }));
  const key = keyOf(node.answer);
  const setOptions = (next: BuilderOption[], correct = key.correctOptionIds) => onChange({ options: next, answer: { correctOptionIds: correct.filter(id => next.some(o => o.id === id)), scoring: key.scoring } });
  const toggle = (id: string) => onChange({ options, answer: { correctOptionIds: key.correctOptionIds.includes(id) ? key.correctOptionIds.filter(x => x !== id) : [...key.correctOptionIds, id], scoring: key.scoring } });
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= options.length) return; const next = options.slice(); [next[i], next[j]] = [next[j], next[i]]; setOptions(next); };
  return (
    <div className="sb-options qt-editor" data-testid="qt-editor-multipleSelect">
      <p className="sb-hint">حدّد كل الإجابات الصحيحة (واحدة على الأقل). الترتيب لا يؤثر في مفتاح الإجابة.</p>
      {options.map((o, i) => (
        <div className="sb-option-row" key={o.id}>
          <label className="sb-radio"><input type="checkbox" checked={key.correctOptionIds.includes(o.id!)} onChange={() => toggle(o.id!)} disabled={disabled} aria-label="الصحيح" /> الصحيح</label>
          <input className="sb-input" value={optText(o)} placeholder={"الخيار " + (i + 1)} onChange={e => setOptions(options.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))} disabled={disabled} />
          <button type="button" className="sb-icon-btn" title="أعلى" aria-label="أعلى" onClick={() => move(i, -1)} disabled={disabled || i === 0}>↑</button>
          <button type="button" className="sb-icon-btn" title="أسفل" aria-label="أسفل" onClick={() => move(i, 1)} disabled={disabled || i === options.length - 1}>↓</button>
          {options.length > 2 && <button type="button" className="sb-icon-btn sb-danger" title="حذف" aria-label="حذف" onClick={() => setOptions(options.filter((_, k) => k !== i))} disabled={disabled}>×</button>}
        </div>
      ))}
      {!key.correctOptionIds.length && <p className="sb-hint sb-warn-text">حدّد إجابة صحيحة واحدة على الأقل.</p>}
      <div className="sb-row-between">
        <button type="button" className="sb-mini-btn" onClick={() => setOptions([...options, { id: genId("opt"), text: "" }])} disabled={disabled}>+ إضافة خيار</button>
        <label className="sb-inline" htmlFor={uid + "-scoring"}><span>طريقة التصحيح</span>
          <select id={uid + "-scoring"} className="sb-input sb-input-sm" aria-label="طريقة التصحيح" value={key.scoring} onChange={e => onChange({ options, answer: { correctOptionIds: key.correctOptionIds, scoring: e.target.value as MultipleSelectScoring } })} disabled={disabled}>
            {MULTIPLE_SELECT_SCORING.map(m => <option key={m} value={m}>{MULTIPLE_SELECT_SCORING_LABELS[m]}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}
