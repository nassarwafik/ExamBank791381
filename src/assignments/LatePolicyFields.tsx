// D5 (item 10) — the teacher's late-submission choice: off (the default), or a late window after the due date with a fixed deduction.
// One controlled fieldset, used by the assignment composer and by the assignment page's settings editor.
import { useId } from "react";
import { DEFAULT_LATE_POLICY, LATE_DEDUCTION_CHOICES, LATE_WINDOW_CHOICES, deductionLabel, lateWindowLabel, type LatePolicy } from "./latePolicy";

export default function LatePolicyFields({ value, onChange, disabled, hint }: { value: LatePolicy | null; onChange: (v: LatePolicy | null) => void; disabled?: boolean; hint?: string }) {
  const id = useId(), on = !!value, p = value || DEFAULT_LATE_POLICY;
  return (
    <fieldset className="eb-policy-group eb-late-policy" data-testid="late-policy-fields">
      <legend className="eb-subheading">التسليم المتأخر</legend>
      <p className="eb-policy-hint" id={id + "-hint"}>{hint || "اسمح للطالب بالتسليم بعد الموعد لمدة محددة، مع خصم نسبة ثابتة من علامة المحاولة المتأخرة."}</p>
      <label className="eb-check-inline">
        <input type="checkbox" checked={on} disabled={disabled} aria-describedby={id + "-hint"} onChange={e => onChange(e.target.checked ? { ...p } : null)} />
        <span>قبول التسليم المتأخر</span>
      </label>
      {on && (
        <div className="eb-form-grid eb-form-grid-2">
          <label>المدة المسموحة بعد الموعد
            <select value={p.windowHours} disabled={disabled} onChange={e => onChange({ ...p, windowHours: Number(e.target.value) })}>
              {!LATE_WINDOW_CHOICES.some(c => c.hours === p.windowHours) && <option value={p.windowHours}>{lateWindowLabel(p.windowHours)}</option>}
              {LATE_WINDOW_CHOICES.map(c => <option key={c.hours} value={c.hours}>{c.label}</option>)}
            </select>
          </label>
          <label>نسبة الخصم
            <select value={p.deductionPercent} disabled={disabled} onChange={e => onChange({ ...p, deductionPercent: Number(e.target.value) })}>
              {!LATE_DEDUCTION_CHOICES.includes(p.deductionPercent) && <option value={p.deductionPercent}>{p.deductionPercent}٪</option>}
              {LATE_DEDUCTION_CHOICES.map(d => <option key={d} value={d}>{d === 0 ? "بدون خصم" : d + "٪"}</option>)}
            </select>
          </label>
        </div>
      )}
      {on && <p className="eb-muted" role="status">تُقبل المحاولات حتى {lateWindowLabel(p.windowHours)} بعد موعد كل طالب، {deductionLabel(p.deductionPercent)}.</p>}
    </fieldset>
  );
}
