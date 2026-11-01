import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { IconKey, IconLock, IconUser, IconWarning, IconCopy, IconCheck } from "../icons";
import { ownerApi, groupSecret, type TotpEnrolment, type OwnerProfile } from "./ownerApi";
import OwnerQr from "./OwnerQr";
import RecoveryCodes from "./RecoveryCodes";

/**
 * Tadris+ P1-A2 — the one-time creation of the first platform owner (P1-A /api/owner-bootstrap, owner decision D3).
 *   1. the bootstrap token (printed on the owner's own computer), username, display name, password (+ confirmation)
 *   2. enrol the authenticator app: scan the QR or type the key, then enter the 6-digit code
 *   3. the 10 recovery codes, shown once; continuing requires confirming they were saved
 * The browser checks only what helps typing (length, confirmation); the server enforces every rule.
 */
const MIN_PASSWORD = 14;

type Step = { kind: "details" } | { kind: "enrol"; totp: TotpEnrolment; token: string } | { kind: "codes"; owner: OwnerProfile; codes: string[] };

export default function OwnerSetup({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>({ kind: "details" });
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step.kind]);

  return (
    <section className="auth-card eb-owner-card" aria-labelledby="eb-owner-setup-title">
      <p className="eb-owner-steps" aria-label="مراحل التأسيس">
        <span aria-current={step.kind === "details" ? "step" : undefined}>١. البيانات</span>
        <span aria-current={step.kind === "enrol" ? "step" : undefined}>٢. تطبيق المصادقة</span>
        <span aria-current={step.kind === "codes" ? "step" : undefined}>٣. رموز الاسترداد</span>
      </p>
      <h1 id="eb-owner-setup-title" className="auth-welcome" tabIndex={-1} ref={heading}>
        {step.kind === "details" ? "تأسيس حساب مالك المنصة" : step.kind === "enrol" ? "ربط تطبيق المصادقة" : "احفظ رموز الاسترداد"}
      </h1>
      {step.kind === "details" && <DetailsStep onNext={(totp, token) => setStep({ kind: "enrol", totp, token })} />}
      {step.kind === "enrol" && <EnrolStep totp={step.totp} token={step.token} onRestart={() => setStep({ kind: "details" })} onDone={(owner, codes) => setStep({ kind: "codes", owner, codes })} />}
      {step.kind === "codes" && <CodesStep owner={step.owner} codes={step.codes} onDone={onDone} />}
    </section>
  );
}

function ErrorLine({ id, message }: { id: string; message: string }) {
  if (!message) return null;
  return <div id={id} className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{message}</div>;
}

function DetailsStep({ onNext }: { onNext: (totp: TotpEnrolment, token: string) => void }) {
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!token.trim() || !username.trim() || !displayName.trim() || !password) { setError("أكمل جميع الحقول."); return; }
    if ([...password].length < MIN_PASSWORD) { setError(`كلمة المرور قصيرة: ${MIN_PASSWORD} حرفًا على الأقل.`); return; }
    if (password !== confirm) { setError("تأكيد كلمة المرور لا يطابقها."); return; }
    setBusy(true);
    setError("");
    const r = await ownerApi.bootstrapBegin({ token: token.trim(), username: username.trim(), displayName: displayName.trim(), password });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setPassword("");
    setConfirm("");
    onNext(r.data.totp, token.trim());
  }

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <p className="auth-sub">هذه الخطوة تتم مرة واحدة فقط. رمز التأسيس هو الرمز الذي طبعه السكربت على جهازك.</p>
      <label className="auth-field">
        <span>رمز التأسيس</span>
        <div className="auth-input"><IconKey size={18} />
          <input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" spellCheck={false} dir="ltr" aria-describedby={error ? "eb-owner-setup-error" : undefined} />
        </div>
      </label>
      <label className="auth-field">
        <span>اسم المستخدم</span>
        <div className="auth-input"><IconUser size={18} />
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" spellCheck={false} dir="ltr" placeholder="tadris.owner" />
        </div>
        <small className="eb-owner-hint">أحرف إنجليزية صغيرة وأرقام و . _ - (3 أحرف على الأقل)، وليس أرقامًا فقط.</small>
      </label>
      <label className="auth-field">
        <span>اسم العرض</span>
        <div className="auth-input"><IconUser size={18} />
          <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} autoComplete="name" maxLength={60} />
        </div>
      </label>
      <label className="auth-field">
        <span>كلمة المرور</span>
        <div className="auth-input"><IconLock size={18} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
        </div>
        <small className="eb-owner-hint">{MIN_PASSWORD} حرفًا على الأقل. عبارة طويلة يسهل تذكّرها أفضل من كلمة معقدة قصيرة.</small>
      </label>
      <label className="auth-field">
        <span>تأكيد كلمة المرور</span>
        <div className="auth-input"><IconLock size={18} />
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
        </div>
      </label>
      <ErrorLine id="eb-owner-setup-error" message={error} />
      <button type="submit" className="auth-submit" disabled={busy}>{busy ? "جارٍ التحقق…" : "متابعة"}</button>
    </form>
  );
}

function EnrolStep({ totp, token, onDone, onRestart }: { totp: TotpEnrolment; token: string; onDone: (owner: OwnerProfile, codes: string[]) => void; onRestart: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const digits = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(digits)) { setError("أدخل الرمز المكوّن من 6 أرقام كما يظهر في التطبيق."); return; }
    setBusy(true);
    setError("");
    const r = await ownerApi.bootstrapConfirm({ token, code: digits });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      if (r.code === "BOOTSTRAP_NOT_STARTED") setExpired(true);
      return;
    }
    onDone(r.data.owner, r.data.recoveryCodes);
  }

  async function copySecret() {
    try { await navigator.clipboard.writeText(totp.secret); setCopied(true); } catch { setCopied(false); }
  }

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <p className="auth-sub">امسح الرمز بتطبيق مصادقة على هاتفك (مثل Google Authenticator أو Microsoft Authenticator)، ثم أدخل الرمز المكوّن من 6 أرقام.</p>
      <OwnerQr value={totp.uri} label="رمز QR لربط تطبيق المصادقة بحساب مالك المنصة" />
      <div className="eb-owner-secret">
        <span>أو أدخل المفتاح يدويًا في التطبيق:</span>
        <code dir="ltr">{groupSecret(totp.secret)}</code>
        <div className="eb-owner-actions">
          <button type="button" className="eb-owner-secondary" onClick={copySecret}>
            {copied ? <IconCheck size={16} aria-hidden="true" /> : <IconCopy size={16} aria-hidden="true" />}
            {copied ? "تم نسخ المفتاح" : "نسخ المفتاح"}
          </button>
          <a className="eb-owner-secondary" href={totp.uri}>فتح في تطبيق المصادقة</a>
        </div>
      </div>
      <label className="auth-field">
        <span>رمز التحقق</span>
        <div className="auth-input"><IconKey size={18} />
          <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7} value={code} onChange={e => setCode(e.target.value)} dir="ltr" aria-describedby={error ? "eb-owner-enrol-error" : undefined} />
        </div>
      </label>
      <ErrorLine id="eb-owner-enrol-error" message={error} />
      {expired
        ? <button type="button" className="auth-submit" onClick={onRestart}>البدء من جديد</button>
        : <button type="submit" className="auth-submit" disabled={busy}>{busy ? "جارٍ الإنشاء…" : "إنشاء حساب المالك"}</button>}
    </form>
  );
}

function CodesStep({ owner, codes, onDone }: { owner: OwnerProfile; codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="auth-form">
      <p className="auth-sub">تم إنشاء حساب <bdi>{owner.displayName}</bdi>. إذا فقدت هاتفك تدخل بأحد هذه الرموز بدل رمز التطبيق. كل رمز يُستخدم مرة واحدة، <strong>ولن تُعرض مرة أخرى</strong>.</p>
      <RecoveryCodes codes={codes} ownerLabel={owner.username} />
      <label className="eb-owner-check">
        <input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />
        <span>حفظت الرموز في مكان آمن خارج هذا الجهاز.</span>
      </label>
      <p className="eb-owner-hint">بعد الانتهاء احذف من إعدادات Azure: <code dir="ltr">OWNER_BOOTSTRAP_TOKEN_SHA256</code> و <code dir="ltr">OWNER_BOOTSTRAP_EXPIRES_AT</code>.</p>
      <button type="button" className="auth-submit" disabled={!saved} onClick={onDone}>متابعة إلى تسجيل الدخول</button>
    </div>
  );
}
