import { useEffect, useRef, useState, type FormEvent } from "react";
import { IconWarning } from "../icons";
import { deviceLabel, devicesApi, ownerDevicesApi, qrApi, viaLabel, type LinkedDevices as Devices } from "./qrApi";
import type { QrNamespace } from "./qrRoute";

/**
 * Tadris+ QR-3 — «الأجهزة المرتبطة» (design docs/enterprise-qr-login-qr3.md): every device signed in to THIS teacher / student
 * account, newest first — what it is (fixed words), how it signed in, since when — with «إنهاء» for each other device. The server
 * lists and ends only the caller's own sessions; this list decides nothing. Ending this very device is the ordinary sign-out, so
 * it is marked «هذا الجهاز» and has no button here. A student session from before QR-3 is not recorded: said once, plainly.
 * Tadris+ QR-4 — the owner's devices too (`ns="owner"`, design docs/enterprise-qr-login-qr4.md): ending one needs a recent step-up,
 * so when the server asks for it the authenticator code is asked here, then the same device is ended.
 */
type State = { kind: "loading" } | { kind: "ready"; data: Devices } | { kind: "failed"; message: string };

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ar", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
};

export default function LinkedDevices({ token, onSignedOut, ns = "platform" }: { token: string; onSignedOut: () => void; ns?: QrNamespace }) {
  const api = ns === "owner" ? ownerDevicesApi : devicesApi;
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [stepUp, setStepUp] = useState<{ id: string; label: string; error?: string } | null>(null);
  const [code, setCode] = useState("");

  const [nonce, setNonce] = useState(0);
  const signedOut = useRef(onSignedOut);
  useEffect(() => { signedOut.current = onSignedOut; }, [onSignedOut]);

  useEffect(() => {
    let live = true;
    void api.list(token).then(r => {
      if (!live) return;
      if (r.ok) setState({ kind: "ready", data: r.data });
      else if (r.status === 401) signedOut.current();
      else setState({ kind: "failed", message: r.error });
    });
    return () => { live = false; };
  }, [api, token, nonce]);

  async function end(id: string, label: string) {
    setBusy(id);
    setNotice("");
    const r = await api.end(token, id);
    setBusy("");
    if (r.ok || r.status === 404) { setStepUp(null); setNotice("انتهت جلسة " + label + "."); setNonce(n => n + 1); return; }
    if (r.status === 401) { signedOut.current(); return; }
    if (ns === "owner" && !r.ok && r.code === "STEP_UP_REQUIRED") { setStepUp({ id, label }); return; }
    setNotice(r.error);
  }

  // QR-4 — the owner's recent step-up (the authenticator code), then the same device is ended.
  async function confirmStepUp(e: FormEvent) {
    e.preventDefault();
    const c = code.replace(/\s/g, "");
    if (!stepUp || !c || busy) return;
    setBusy(stepUp.id);
    const s = await qrApi.ownerStepUp(token, c);
    setBusy("");
    setCode("");
    if (!s.ok) { if (s.status === 401) { signedOut.current(); return; } setStepUp({ ...stepUp, error: s.error }); return; }
    await end(stepUp.id, stepUp.label);
  }

  return (
    <section className="eb-qr-devices" aria-labelledby="eb-qr-devices-title">
      <h2 id="eb-qr-devices-title" className="eb-qr-title">الأجهزة المرتبطة</h2>
      {state.kind === "loading" && <p className="auth-sub" role="status">جارٍ التحميل…</p>}
      {state.kind === "failed" && <p className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{state.message}</p>}
      {state.kind === "ready" && (
        <>
          {state.data.untracked && <p className="auth-sub">جلستك على هذا الجهاز بدأت قبل تحديث الأجهزة المرتبطة، فلا تظهر هنا. تظهر بعد تسجيل الدخول من جديد.</p>}
          {state.data.devices.length === 0
            ? !state.data.untracked && <p className="auth-sub">لا توجد أجهزة أخرى مرتبطة بحسابك.</p>
            : (
              <ul className="eb-qr-device-list">
                {state.data.devices.map(d => {
                  const label = deviceLabel(d.device);
                  return (
                    <li key={d.id} className="eb-qr-device">
                      <div className="eb-qr-device-text">
                        <strong><bdi dir="ltr">{label}</bdi></strong>{d.current && <span className="eb-qr-device-here">هذا الجهاز</span>}
                        <span className="eb-qr-device-meta">دخل {viaLabel(d.via)} · <bdi>{when(d.createdAt)}</bdi></span>
                      </div>
                      {!d.current && <button type="button" className="eb-qr-link is-danger" disabled={busy === d.id} onClick={() => void end(d.id, label)}>إنهاء</button>}
                    </li>
                  );
                })}
              </ul>
            )}
          {stepUp && (
            <form className="auth-form" onSubmit={confirmStepUp} noValidate>
              <label className="auth-field">
                <span>لإنهاء جلسة <bdi dir="ltr">{stepUp.label}</bdi> أدخل رمز التحقق من تطبيق المصادقة</span>
                <div className="auth-input"><input type="text" value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7} dir="ltr" /></div>
              </label>
              {stepUp.error && <p className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{stepUp.error}</p>}
              <button type="submit" className="auth-submit" disabled={Boolean(busy)}>تأكيد وإنهاء الجلسة</button>
              <button type="button" className="eb-qr-link" onClick={() => { setStepUp(null); setCode(""); }}>إلغاء</button>
            </form>
          )}
          {notice && <p className="auth-sub" role="status">{notice}</p>}
        </>
      )}
    </section>
  );
}
