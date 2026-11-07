import { useEffect, useRef, useState } from "react";
import "./qr.css";
import QrCodeSvg from "./QrCodeSvg";
import { qrApi, type QrStart } from "./qrApi";
import { qrAddress, type QrNamespace } from "./qrRoute";

/**
 * Tadris+ QR-2 — the NEW device's side (design docs/enterprise-qr-login-qr1.md): a QR code the signed-in phone scans, the number the
 * phone must pick, and a poll until the phone approves. The panel never decides anything: the server answers pending, a session
 * (once), or why not. On a session it hands { role, token, displayName } to `onSignedIn`, which stores it exactly as the matching
 * sign-in does. While the page is hidden it neither polls nor renews; an expired code renews itself a few times, then waits for
 * «عرض رمز جديد» (so a forgotten tab does not keep creating codes).
 */
export type QrSignedIn = { role: "teacher" | "student" | "owner"; token: string; displayName: string };
type View =
  | { kind: "loading" }
  | { kind: "showing"; start: QrStart; address: string; expiresAtMs: number }
  | { kind: "expired" }
  | { kind: "denied" }
  | { kind: "failed"; message: string }
  | { kind: "done" };

const AUTO_RENEWALS = 4;
const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";

export default function QrSignInPanel({ ns, onSignedIn, onClose }: { ns: QrNamespace; onSignedIn: (s: QrSignedIn) => void; onClose: () => void }) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [generation, setGeneration] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const renewals = useRef(0);
  const signedIn = useRef(onSignedIn);
  useEffect(() => { signedIn.current = onSignedIn; }, [onSignedIn]);

  // 1. a new pairing for each generation
  useEffect(() => {
    let live = true;
    setView({ kind: "loading" });
    void qrApi.start(ns).then(r => {
      if (!live) return;
      if (!r.ok) { setView({ kind: "failed", message: r.error }); return; }
      const expiresAtMs = Date.parse(r.data.expiresAt);
      setView({ kind: "showing", start: r.data, address: qrAddress(r.data.qrPath), expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : Date.now() + r.data.expiresInSeconds * 1000 });
    });
    return () => { live = false; };
  }, [ns, generation]);

  const renew = (auto: boolean) => {
    if (auto && renewals.current >= AUTO_RENEWALS) { setView({ kind: "expired" }); return; }
    renewals.current = auto ? renewals.current + 1 : 0;
    setGeneration(g => g + 1);
  };

  // 2. while shown: poll, count down, renew on expiry (never while the page is hidden)
  const showing = view.kind === "showing" ? view : null;
  useEffect(() => {
    if (!showing) return;
    let live = true, timer: ReturnType<typeof setTimeout> | undefined;
    const interval = Math.max(1000, showing.start.pollIntervalMs || 2000);
    const tick = async () => {
      if (!live) return;
      setNow(Date.now());
      if (!visible()) { timer = setTimeout(tick, interval); return; }
      if (Date.now() >= showing.expiresAtMs) { renew(true); return; }
      const r = await qrApi.poll(ns, showing.start.pairingToken, showing.start.pollSecret);
      if (!live) return;
      if (r.ok && r.data.status === "signed-in") {
        setView({ kind: "done" });
        signedIn.current({ role: r.data.role, token: r.data.token, displayName: r.data.displayName });
        return;
      }
      if (!r.ok) {
        if (r.code === "QR_DENIED") { setView({ kind: "denied" }); return; }
        if (r.code === "QR_EXPIRED" || r.code === "QR_USED" || r.code === "QR_INVALID") { renew(true); return; }
        if (r.status !== 0 && r.status < 500) { setView({ kind: "failed", message: r.error }); return; }
        // a network error or a 5xx is transient: keep polling until the code expires
      }
      timer = setTimeout(tick, interval);
    };
    timer = setTimeout(tick, interval);
    return () => { live = false; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showing, ns]);

  const secondsLeft = showing ? Math.max(0, Math.ceil((showing.expiresAtMs - now) / 1000)) : 0;
  const where = ns === "owner"
    ? "افتح لوحة المالك على هاتفك وأنت مسجّل الدخول، ثم قائمة حسابك ← «ربط جهاز آخر بالباركود»."
    : "افتح تدريس+ على هاتفك وأنت مسجّل الدخول، ثم «ربط جهاز آخر بالباركود» (المعلم: من صورته أعلى الصفحة · الطالب: من «المزيد» أعلى الصفحة).";

  return (
    <section className="eb-qr-panel" aria-labelledby="eb-qr-panel-title">
      <h2 id="eb-qr-panel-title" className="eb-qr-title">الدخول بالباركود</h2>
      {view.kind === "loading" && <p className="auth-sub" role="status">جارٍ تجهيز الرمز…</p>}
      {showing && (
        <>
          <ol className="eb-qr-steps">
            <li>{where}</li>
            <li>وجّه كاميرا الهاتف إلى هذا الرمز.</li>
            <li>اختر على الهاتف الرقم الظاهر هنا.</li>
          </ol>
          <div className="eb-qr-frame"><QrCodeSvg text={showing.address} label="رمز الدخول بالباركود" /></div>
          <p className="eb-qr-match">الرقم: <bdi className="eb-qr-match-code" dir="ltr">{showing.start.matchCode}</bdi></p>
          <p className="eb-qr-hint" role="status" aria-live="polite">بانتظار الموافقة من الهاتف… يتجدد الرمز بعد <bdi>{secondsLeft}</bdi> ثانية.</p>
        </>
      )}
      {view.kind === "expired" && <p className="auth-sub" role="status">انتهت صلاحية الرمز.</p>}
      {view.kind === "denied" && <p className="auth-error" role="alert">رُفض طلب الدخول من الهاتف.</p>}
      {view.kind === "failed" && <p className="auth-error" role="alert">{view.message}</p>}
      {view.kind === "done" && <p className="auth-sub" role="status">تمت الموافقة. جارٍ الدخول…</p>}
      <div className="eb-qr-actions">
        {(view.kind === "expired" || view.kind === "denied" || view.kind === "failed") && <button type="button" className="auth-submit" onClick={() => renew(false)}>عرض رمز جديد</button>}
        {view.kind !== "done" && <button type="button" className="eb-qr-link" onClick={onClose}>الدخول بكلمة المرور</button>}
      </div>
    </section>
  );
}
