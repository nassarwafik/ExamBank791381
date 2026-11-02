import "./console.css";

/**
 * Tadris+ P4-A — Switch: an on / off control (role="switch", aria-checked). The visible state word («مفعّل» / «متوقف») is part
 * of the name, so the state never depends on colour alone. Presentation only: the caller owns the value and any confirmation.
 */
export default function Switch({ label, checked, onChange, disabled = false, onText = "مفعّل", offText = "متوقف" }: { label: string; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; onText?: string; offText?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} className="eb-switch" onClick={() => onChange(!checked)}>
      <span className="eb-switch-track" aria-hidden="true"><span className="eb-switch-thumb" /></span>
      <span className="eb-switch-label">{label}</span>
      <span className="eb-switch-state">{checked ? onText : offText}</span>
    </button>
  );
}
