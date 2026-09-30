import type { AuthoringEditorProps } from "../registryTypes";

// Phase 16A — Numeric Response authoring (lazy): exact / tolerance or inclusive range, optional required unit. Every secret
// (expected, tolerance, min, max, the correct unit) lives under `answer`; `numeric.unitRequired` is the only student-visible
// configuration. Finite numbers only; nothing here evaluates expressions.
type Key = { mode: "tolerance" | "range"; expected?: number; tolerance?: number; min?: number; max?: number; unit?: string };
const keyOf = (answer: unknown): Key => { const a = (answer && typeof answer === "object" ? answer : {}) as Partial<Key>; return { mode: a.mode === "range" ? "range" : "tolerance", expected: a.expected, tolerance: a.tolerance, min: a.min, max: a.max, unit: a.unit }; };
const num = (raw: string): number | undefined => { if (raw.trim() === "") return undefined; const n = Number(raw); return Number.isFinite(n) ? n : undefined; };
const show = (v: number | undefined) => (v === undefined ? "" : String(v));

export default function NumericResponseEditor({ node, onChange, disabled }: AuthoringEditorProps) {
  const key = keyOf(node.answer);
  const unitRequired = node.numeric?.unitRequired === true;
  const set = (patch: Partial<Key>) => {
    const next: Key = { ...key, ...patch };
    const answer: Record<string, unknown> = { mode: next.mode };
    if (next.mode === "tolerance") { answer.expected = next.expected ?? 0; answer.tolerance = next.tolerance ?? 0; } else { answer.min = next.min ?? 0; answer.max = next.max ?? 0; }
    if (next.unit && next.unit.trim()) answer.unit = next.unit;
    onChange({ answer, numeric: { unitRequired } });
  };
  return (
    <div className="qt-editor qt-numeric" data-testid="qt-editor-numericResponse">
      <label className="sb-inline"><span>نمط الإجابة الرقمية</span>
        <select className="sb-input sb-input-sm" aria-label="نمط الإجابة الرقمية" value={key.mode} onChange={e => set({ mode: e.target.value === "range" ? "range" : "tolerance" })} disabled={disabled}>
          <option value="tolerance">قيمة متوقعة ± تسامح</option>
          <option value="range">مدى (من … إلى)</option>
        </select>
      </label>
      {key.mode === "tolerance" ? (
        <div className="sb-field-row">
          <label className="sb-inline"><span>القيمة المتوقعة</span><input className="sb-input sb-input-sm" type="number" step="any" aria-label="القيمة المتوقعة" value={show(key.expected)} onChange={e => set({ expected: num(e.target.value) })} disabled={disabled} /></label>
          <label className="sb-inline"><span>التسامح (±)</span><input className="sb-input sb-input-sm" type="number" step="any" min="0" aria-label="التسامح" value={show(key.tolerance)} onChange={e => set({ tolerance: num(e.target.value) })} disabled={disabled} /></label>
        </div>
      ) : (
        <div className="sb-field-row">
          <label className="sb-inline"><span>الحد الأدنى</span><input className="sb-input sb-input-sm" type="number" step="any" aria-label="الحد الأدنى" value={show(key.min)} onChange={e => set({ min: num(e.target.value) })} disabled={disabled} /></label>
          <label className="sb-inline"><span>الحد الأعلى</span><input className="sb-input sb-input-sm" type="number" step="any" aria-label="الحد الأعلى" value={show(key.max)} onChange={e => set({ max: num(e.target.value) })} disabled={disabled} /></label>
        </div>
      )}
      <div className="sb-field-row">
        <label className="sb-inline"><input type="checkbox" checked={unitRequired} aria-label="الوحدة مطلوبة" onChange={e => onChange({ numeric: { unitRequired: e.target.checked }, answer: { ...(node.answer || { mode: "tolerance", expected: 0, tolerance: 0 }) } })} disabled={disabled} /> <span>الوحدة مطلوبة</span></label>
        <label className="sb-inline"><span>الوحدة</span><input className="sb-input sb-input-sm" aria-label="الوحدة" value={key.unit ?? ""} placeholder="مثال: m/s²" onChange={e => set({ unit: e.target.value })} disabled={disabled} /></label>
      </div>
      <p className="sb-hint">تُقبل الأرقام العشرية بالفواصل العربية والإنجليزية والترميز العلمي؛ الحدود شاملة. لا تُقيَّم أي تعابير حسابية.</p>
    </div>
  );
}
