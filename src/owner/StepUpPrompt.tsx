import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { IconKey, IconWarning } from "../icons";
import { ownerApi } from "./ownerApi";

/**
 * Tadris+ P4-B1 — the inline second-factor check every owner change may ask for (STEP_UP_REQUIRED): the authenticator code →
 * /api/owner-session/step-up → `onConfirmed` retries the change. A 401 (other than a wrong code) signs the owner out.
 */
export default function StepUpPrompt({ token, onConfirmed, onCancel, onSignedOut }: { token: string; onConfirmed: () => void | Promise<void>; onCancel: () => void; onSignedOut: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const digits = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(digits)) { setError("أدخل الرمز المكوّن من 6 أرقام."); return; }
    setBusy(true);
    setError("");
    const r = await ownerApi.stepUp(token, { code: digits });
    setCode("");
    if (!r.ok) { setBusy(false); if (r.status === 401 && r.code !== "TOTP_INVALID") { onSignedOut(); return; } setError(r.error); return; }
    await onConfirmed();
    setBusy(false);
  }

  return (
    <form className="eb-owner-stepup" onSubmit={submit} noValidate aria-label="التحقق بخطوتين">
      <label className="auth-field">
        <span>هذا الإجراء حساس. أدخل رمز التحقق من التطبيق للمتابعة:</span>
        <div className="auth-input"><IconKey size={18} />
          <input ref={input} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7} value={code} onChange={e => setCode(e.target.value)} dir="ltr" />
        </div>
      </label>
      {error && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</div>}
      <div className="eb-owner-actions">
        <button type="submit" className="auth-submit" disabled={busy}>تأكيد</button>
        <button type="button" className="eb-owner-secondary" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}
