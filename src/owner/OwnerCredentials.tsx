import { useState } from "react";
import type { FormEvent } from "react";
import { IconKey, IconLock, IconWarning } from "../icons";
import { ownerApi, groupSecret, type TotpEnrolment, type CredentialChange } from "./ownerApi";
import StepUpPrompt from "./StepUpPrompt";
import OwnerQr from "./OwnerQr";
import RecoveryCodes from "./RecoveryCodes";

/**
 * Tadris+ P10-C — «أمان الحساب»: the owner changes the password and moves the authenticator to a new phone (closes security
 * review O9; design docs/enterprise-owner-credentials-p10c.md). The server decides everything — the current password, the
 * fresh second-factor check (STEP_UP_REQUIRED → StepUpPrompt, then the same request again), the policy, the attempt limit.
 * After a change the server ends every other owner session and answers this device's new token, which `onToken` stores; when
 * it could not open one (signInAgain) the owner signs in again with the new credentials.
 */
type Mode = null | "password" | "totp";
type Retry = (() => Promise<void>) | null;

export default function OwnerCredentials({ token, username, onToken, onSignedOut }: { token: string; username: string; onToken: (token: string) => void | Promise<void>; onSignedOut: () => void }) {
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [retry, setRetry] = useState<Retry>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [enrolment, setEnrolment] = useState<TotpEnrolment | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);

  function open(m: Mode) { setMode(m); setError(""); setDone(""); setRetry(null); setCurrent(""); setNext(""); setRepeat(""); setEnrolment(null); setCode(""); setCodes(null); }

  /** A server answer → the UI: 401 signs out, STEP_UP_REQUIRED asks for the code and keeps `again` for after it. */
  function failed(r: { status: number; code: string; error: string }, again: () => Promise<void>) {
    if (r.status === 401 && r.code !== "CURRENT_PASSWORD_INVALID" && r.code !== "TOTP_INVALID") { onSignedOut(); return; }
    if (r.code === "STEP_UP_REQUIRED") { setRetry(() => again); return; }
    setError(r.error);
  }

  async function applied(data: CredentialChange, message: string) {
    if (data.signInAgain || !data.token) { onSignedOut(); return; }
    await onToken(data.token);
    setDone(message);
  }

  async function changePassword() {
    setBusy(true); setError("");
    const r = await ownerApi.changePassword(token, { currentPassword: current, newPassword: next });
    setBusy(false);
    if (!r.ok) { failed(r, changePassword); return; }
    setRetry(null); setCurrent(""); setNext(""); setRepeat(""); setMode(null);
    await applied(r.data, "تم تغيير كلمة المرور. انتهت جلسات المالك على الأجهزة الأخرى.");
  }

  async function beginTotp() {
    setBusy(true); setError("");
    const r = await ownerApi.beginTotpReenrol(token, { currentPassword: current });
    setBusy(false);
    if (!r.ok) { failed(r, beginTotp); return; }
    setRetry(null); setCurrent("");
    setEnrolment(r.data.totp);
  }

  async function confirmTotp() {
    setBusy(true); setError("");
    const r = await ownerApi.confirmTotpReenrol(token, { code: code.replace(/\s/g, "") });
    setBusy(false);
    setCode("");
    if (!r.ok) {
      if (r.code === "TOTP_REENROL_NOT_STARTED") { setEnrolment(null); }
      failed(r, confirmTotp); return;
    }
    setRetry(null); setEnrolment(null);
    if (r.data.signInAgain || !r.data.token) { onSignedOut(); return; }
    setCodes(r.data.recoveryCodes);
    await applied(r.data, "تم ربط التطبيق الجديد. التطبيق القديم ورموز الاسترداد القديمة لم تعد صالحة، وانتهت جلسات المالك على الأجهزة الأخرى.");
  }

  function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!current || !next) { setError("كلمة المرور الحالية والجديدة مطلوبتان."); return; }
    if (next !== repeat) { setError("تأكيد كلمة المرور الجديدة لا يطابقها."); return; }
    void changePassword();
  }
  function submitBegin(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!current) { setError("كلمة المرور الحالية مطلوبة."); return; }
    void beginTotp();
  }
  function submitConfirm(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code.replace(/\s/g, ""))) { setError("أدخل الرمز المكوّن من 6 أرقام من التطبيق الجديد."); return; }
    void confirmTotp();
  }

  return (
    <div className="eb-owner-credentials">
      <div className="eb-owner-actions">
        <button type="button" className="eb-owner-secondary" onClick={() => open("password")} disabled={busy} aria-expanded={mode === "password"}>تغيير كلمة المرور</button>
        <button type="button" className="eb-owner-secondary" onClick={() => open("totp")} disabled={busy} aria-expanded={mode === "totp"}>تبديل تطبيق المصادقة</button>
      </div>

      {done && <p className="eb-owner-success" role="status">{done}</p>}
      {codes && (
        <div className="eb-owner-notice">
          <p>رموز الاسترداد الجديدة (القديمة لم تعد صالحة). احفظها الآن — لن تُعرض مرة أخرى:</p>
          <RecoveryCodes codes={codes} ownerLabel={username} />
        </div>
      )}

      {mode === "password" && (
        <form className="auth-form" onSubmit={submitPassword} noValidate aria-label="تغيير كلمة المرور">
          <label className="auth-field"><span>كلمة المرور الحالية</span>
            <div className="auth-input"><IconLock size={18} /><input type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" /></div>
          </label>
          <label className="auth-field"><span>كلمة المرور الجديدة (14 حرفًا على الأقل)</span>
            <div className="auth-input"><IconLock size={18} /><input type="password" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" /></div>
          </label>
          <label className="auth-field"><span>تأكيد كلمة المرور الجديدة</span>
            <div className="auth-input"><IconLock size={18} /><input type="password" value={repeat} onChange={e => setRepeat(e.target.value)} autoComplete="new-password" /></div>
          </label>
          <p className="eb-owner-hint">احفظ كلمة المرور الجديدة في مكان آمن: لا توجد استعادة لها بالبريد. بعد الحفظ تنتهي جلسات المالك على الأجهزة الأخرى.</p>
          <div className="eb-owner-actions">
            <button type="submit" className="auth-submit" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ كلمة المرور"}</button>
            <button type="button" className="eb-owner-secondary" onClick={() => open(null)}>إلغاء</button>
          </div>
        </form>
      )}

      {mode === "totp" && !enrolment && (
        <form className="auth-form" onSubmit={submitBegin} noValidate aria-label="تبديل تطبيق المصادقة">
          <p className="eb-owner-hint">ستربط تطبيق مصادقة على هاتف جديد. التطبيق الحالي يبقى صالحًا حتى تُدخل رمزًا صحيحًا من الجديد.</p>
          <label className="auth-field"><span>كلمة المرور الحالية</span>
            <div className="auth-input"><IconLock size={18} /><input type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" /></div>
          </label>
          <div className="eb-owner-actions">
            <button type="submit" className="auth-submit" disabled={busy}>{busy ? "جارٍ التحضير…" : "متابعة"}</button>
            <button type="button" className="eb-owner-secondary" onClick={() => open(null)}>إلغاء</button>
          </div>
        </form>
      )}

      {mode === "totp" && enrolment && (
        <form className="auth-form" onSubmit={submitConfirm} noValidate aria-label="تأكيد التطبيق الجديد">
          <p className="eb-owner-hint">امسح الرمز بتطبيق المصادقة على الهاتف الجديد، أو أدخل المفتاح يدويًا، ثم أدخل الرمز الذي يظهر فيه (خلال 15 دقيقة).</p>
          <OwnerQr value={enrolment.uri} label="رمز QR لربط تطبيق المصادقة الجديد بحساب مالك المنصة" />
          <div className="eb-owner-secret"><span>المفتاح اليدوي:</span><code dir="ltr">{groupSecret(enrolment.secret)}</code></div>
          <label className="auth-field"><span>الرمز من التطبيق الجديد</span>
            <div className="auth-input"><IconKey size={18} /><input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7} value={code} onChange={e => setCode(e.target.value)} dir="ltr" /></div>
          </label>
          <div className="eb-owner-actions">
            <button type="submit" className="auth-submit" disabled={busy}>{busy ? "جارٍ التأكيد…" : "تأكيد التطبيق الجديد"}</button>
            <button type="button" className="eb-owner-secondary" onClick={() => open(null)}>إلغاء</button>
          </div>
        </form>
      )}

      {retry && <StepUpPrompt token={token} onConfirmed={async () => { const again = retry; setRetry(null); await again(); }} onCancel={() => setRetry(null)} onSignedOut={onSignedOut} />}
      {error && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</div>}
    </div>
  );
}
