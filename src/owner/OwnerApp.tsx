import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import "./owner.css";
import { BRAND_NAME } from "../brand";
import BrandMark from "../ui/BrandMark";
import ThemeSwitch from "../ui/ThemeSwitch";
import { DARK_MODE_RELEASED } from "../ui/themePreference";
import { IconKey, IconLock, IconLogout, IconUser, IconWarning, IconRefresh } from "../icons";
import { ownerApi, readOwnerToken, writeOwnerToken, clearOwnerToken, type BootstrapState, type OwnerSessionView } from "./ownerApi";
import { ownerViewFromHash, OWNER_HOME_HASH, OWNER_SETUP_HASH } from "./ownerRoute";
import OwnerSetup from "./OwnerSetup";
import RecoveryCodes from "./RecoveryCodes";

/**
 * Tadris+ P1-A2 — the platform owner's area (lazy chunk, `#/owner`). Owner decisions D3–D5.
 *   - Sign-in: username + password + the authenticator code (or a recovery code) → a 2-hour owner session.
 *   - Setup (`#/owner/setup`): offered only while the server says the one-time bootstrap is open.
 *   - Home: who is signed in, session expiry, recovery codes left, sign out, end every session, new recovery codes.
 *     The Owner Console (teacher management …) arrives in P4; this page is its entry point.
 * The browser never decides access: every view comes from the server's answer, and a 401 always returns to sign-in.
 */
type Boot = { kind: "loading" } | { kind: "error"; message: string } | { kind: "signed-out"; bootstrap: BootstrapState } | { kind: "signed-in"; token: string; view: OwnerSessionView };

/** The server decides what this page shows: a stored token is re-validated; 401 drops it; any other failure is an error. */
async function resolveBoot(): Promise<Boot> {
  const token = readOwnerToken();
  if (token) {
    const s = await ownerApi.session(token);
    if (s.ok) return { kind: "signed-in", token, view: s.data };
    if (s.status === 401) clearOwnerToken();
    else return { kind: "error", message: s.error };
  }
  const b = await ownerApi.bootstrapState();
  if (!b.ok) return { kind: "error", message: b.error };
  return { kind: "signed-out", bootstrap: b.data.state };
}

export default function OwnerApp() {
  const [boot, setBoot] = useState<Boot>({ kind: "loading" });
  const [route, setRoute] = useState(() => ownerViewFromHash());

  useEffect(() => {
    const onHash = () => setRoute(ownerViewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const load = useCallback(() => {
    setBoot({ kind: "loading" });
    void resolveBoot().then(setBoot);
  }, []);

  useEffect(() => {
    let live = true;
    void resolveBoot().then(next => { if (live) setBoot(next); });
    return () => { live = false; };
  }, []);

  const goHome = () => { if (window.location.hash !== OWNER_HOME_HASH) window.location.hash = OWNER_HOME_HASH; setRoute("home"); };

  let body;
  if (boot.kind === "loading") body = <section className="auth-card eb-owner-card"><p className="auth-sub" role="status">جارٍ التحميل…</p></section>;
  else if (boot.kind === "error") body = (
    <section className="auth-card eb-owner-card">
      <h1 className="auth-welcome">تعذر الوصول إلى الخادم</h1>
      <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{boot.message}</div>
      <button type="button" className="auth-submit" onClick={load}><IconRefresh size={16} aria-hidden="true" /> إعادة المحاولة</button>
    </section>
  );
  else if (boot.kind === "signed-in") body = <OwnerHome token={boot.token} view={boot.view} onSignedOut={() => { clearOwnerToken(); load(); }} onView={view => setBoot({ kind: "signed-in", token: boot.token, view })} />;
  else if (route === "setup" && boot.bootstrap === "open") body = <OwnerSetup onDone={() => { goHome(); load(); }} />;
  else body = <OwnerLogin bootstrap={boot.bootstrap} onSignedIn={(token) => { writeOwnerToken(token); goHome(); load(); }} />;

  return (
    <main className="eb-owner-page" dir="rtl">
      <header className="eb-owner-top">
        <span className="eb-owner-brand"><BrandMark size={32} /><bdi dir="ltr">{BRAND_NAME}</bdi><span className="eb-owner-tag">مالك المنصة</span></span>
        {DARK_MODE_RELEASED && <ThemeSwitch />}
      </header>
      <div className="eb-owner-body">{body}</div>
    </main>
  );
}

function OwnerLogin({ bootstrap, onSignedIn }: { bootstrap: BootstrapState; onSignedIn: (token: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const second = code.trim();
    if (!username.trim() || !password || !second) { setError("اسم المستخدم وكلمة المرور ورمز التحقق مطلوبة."); return; }
    setBusy(true);
    setError("");
    const r = await ownerApi.login(useRecovery ? { username: username.trim(), password, recoveryCode: second } : { username: username.trim(), password, code: second.replace(/\s/g, "") });
    setBusy(false);
    if (!r.ok) { setError(r.error); setCode(""); return; }
    setPassword("");
    onSignedIn(r.data.token);
  }

  return (
    <section className="auth-card eb-owner-card" aria-labelledby="eb-owner-login-title">
      <h1 id="eb-owner-login-title" className="auth-welcome">دخول مالك المنصة</h1>
      <p className="auth-sub">هذه الصفحة لمالك المنصة فقط. المعلمون والطلاب يدخلون من الصفحة الرئيسية.</p>
      <form className="auth-form" onSubmit={submit} noValidate>
        <label className="auth-field">
          <span>اسم المستخدم</span>
          <div className="auth-input"><IconUser size={18} />
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" spellCheck={false} dir="ltr" aria-describedby={error ? "eb-owner-login-error" : undefined} />
          </div>
        </label>
        <label className="auth-field">
          <span>كلمة المرور</span>
          <div className="auth-input"><IconLock size={18} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
        </label>
        <label className="auth-field">
          <span>{useRecovery ? "رمز الاسترداد" : "رمز التحقق من التطبيق"}</span>
          <div className="auth-input"><IconKey size={18} />
            {useRecovery
              ? <input type="text" value={code} onChange={e => setCode(e.target.value)} autoComplete="off" spellCheck={false} dir="ltr" placeholder="XXXX-XXXX-XXXX" />
              : <input type="text" value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7} dir="ltr" />}
          </div>
        </label>
        <button type="button" className="eb-owner-link" onClick={() => { setUseRecovery(v => !v); setCode(""); }}>
          {useRecovery ? "استخدم رمز تطبيق المصادقة" : "فقدت الهاتف؟ استخدم رمز استرداد"}
        </button>
        {error && <div id="eb-owner-login-error" className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</div>}
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? "جارٍ الدخول…" : "دخول"}</button>
      </form>
      {bootstrap === "open" && <p className="auth-note"><a className="eb-owner-link" href={OWNER_SETUP_HASH}>تأسيس حساب المالك لأول مرة</a></p>}
    </section>
  );
}

type Pending = "revoke-all" | "recovery-codes" | null;

function OwnerHome({ token, view, onSignedOut, onView }: { token: string; view: OwnerSessionView; onSignedOut: () => void; onView: (v: OwnerSessionView) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stepUpFor, setStepUpFor] = useState<Pending>(null);
  const [stepCode, setStepCode] = useState("");
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const stepInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (stepUpFor) stepInput.current?.focus(); }, [stepUpFor]);

  const expires = new Date(view.session.expiresAt);
  const expiresText = Number.isNaN(expires.getTime()) ? "" : expires.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });

  async function signOut() {
    setBusy(true);
    await ownerApi.logout(token);          // the session ends on the server; locally it ends either way
    setBusy(false);
    onSignedOut();
  }

  async function run(action: Exclude<Pending, null>) {
    setBusy(true);
    setError("");
    const r = action === "revoke-all" ? await ownerApi.revokeAll(token) : await ownerApi.regenerateRecoveryCodes(token);
    setBusy(false);
    if (r.ok) {
      setStepUpFor(null);
      if (action === "revoke-all") { onSignedOut(); return; }
      const codes = (r.data as { recoveryCodes?: string[] }).recoveryCodes || [];
      setNewCodes(codes);
      const s = await ownerApi.session(token);
      if (s.ok) onView(s.data);
      return;
    }
    if (r.status === 401) { onSignedOut(); return; }
    if (r.code === "STEP_UP_REQUIRED") { setStepUpFor(action); return; }
    setError(r.error);
  }

  async function confirmStepUp(event: FormEvent) {
    event.preventDefault();
    if (!stepUpFor || busy) return;
    const digits = stepCode.replace(/\s/g, "");
    if (!/^\d{6}$/.test(digits)) { setError("أدخل الرمز المكوّن من 6 أرقام."); return; }
    setBusy(true);
    setError("");
    const r = await ownerApi.stepUp(token, { code: digits });
    setBusy(false);
    setStepCode("");
    if (!r.ok) { if (r.status === 401 && r.code !== "TOTP_INVALID") { onSignedOut(); return; } setError(r.error); return; }
    onView(r.data);
    await run(stepUpFor);
  }

  return (
    <section className="eb-owner-home" aria-labelledby="eb-owner-home-title">
      <div className="eb-owner-panel">
        <h1 id="eb-owner-home-title" className="auth-welcome">أهلًا، <bdi>{view.owner.displayName}</bdi></h1>
        <p className="auth-sub">أنت داخل بحساب مالك المنصة (<bdi dir="ltr">{view.owner.username}</bdi>).{expiresText && <> تنتهي الجلسة عند الساعة <bdi>{expiresText}</bdi>.</>}</p>
        <button type="button" className="eb-owner-secondary" onClick={signOut} disabled={busy}><IconLogout size={16} aria-hidden="true" /> تسجيل الخروج</button>
      </div>

      <div className="eb-owner-panel">
        <h2 className="eb-owner-h2">أمان الحساب</h2>
        <p className="eb-owner-hint">رموز الاسترداد المتبقية: <strong>{view.recoveryCodesRemaining}</strong> من 10.</p>
        {newCodes && (
          <div className="eb-owner-notice">
            <p>رموز الاسترداد الجديدة (القديمة لم تعد صالحة). احفظها الآن — لن تُعرض مرة أخرى:</p>
            <RecoveryCodes codes={newCodes} ownerLabel={view.owner.username} />
          </div>
        )}
        <div className="eb-owner-actions">
          <button type="button" className="eb-owner-secondary" onClick={() => run("recovery-codes")} disabled={busy}>توليد رموز استرداد جديدة</button>
          <button type="button" className="eb-owner-secondary eb-owner-danger" onClick={() => run("revoke-all")} disabled={busy}>إنهاء كل الجلسات على كل الأجهزة</button>
        </div>
        {stepUpFor && (
          <form className="eb-owner-stepup" onSubmit={confirmStepUp} noValidate>
            <label className="auth-field">
              <span>هذا الإجراء حساس. أدخل رمز التحقق من التطبيق للمتابعة:</span>
              <div className="auth-input"><IconKey size={18} />
                <input ref={stepInput} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7} value={stepCode} onChange={e => setStepCode(e.target.value)} dir="ltr" />
              </div>
            </label>
            <div className="eb-owner-actions">
              <button type="submit" className="auth-submit" disabled={busy}>تأكيد</button>
              <button type="button" className="eb-owner-secondary" onClick={() => { setStepUpFor(null); setStepCode(""); setError(""); }}>إلغاء</button>
            </div>
          </form>
        )}
        {error && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</div>}
      </div>

      <div className="eb-owner-panel">
        <h2 className="eb-owner-h2">لوحة المالك</h2>
        <p className="eb-owner-hint">إدارة المعلمين والصلاحيات والمواد تُضاف هنا في المراحل القادمة (P2–P4).</p>
      </div>
    </section>
  );
}
