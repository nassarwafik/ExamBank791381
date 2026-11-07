import { useEffect, useRef, useState } from "react";
import { IconWarning } from "../icons";
import { deviceLabel, devicesApi, viaLabel, type LinkedDevices as Devices } from "./qrApi";

/**
 * Tadris+ QR-3 — «الأجهزة المرتبطة» (design docs/enterprise-qr-login-qr3.md): every device signed in to THIS teacher / student
 * account, newest first — what it is (fixed words), how it signed in, since when — with «إنهاء» for each other device. The server
 * lists and ends only the caller's own sessions; this list decides nothing. Ending this very device is the ordinary sign-out, so
 * it is marked «هذا الجهاز» and has no button here. A student session from before QR-3 is not recorded: said once, plainly.
 */
type State = { kind: "loading" } | { kind: "ready"; data: Devices } | { kind: "failed"; message: string };

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ar", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
};

export default function LinkedDevices({ token, onSignedOut }: { token: string; onSignedOut: () => void }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const [nonce, setNonce] = useState(0);
  const signedOut = useRef(onSignedOut);
  useEffect(() => { signedOut.current = onSignedOut; }, [onSignedOut]);

  useEffect(() => {
    let live = true;
    void devicesApi.list(token).then(r => {
      if (!live) return;
      if (r.ok) setState({ kind: "ready", data: r.data });
      else if (r.status === 401) signedOut.current();
      else setState({ kind: "failed", message: r.error });
    });
    return () => { live = false; };
  }, [token, nonce]);

  async function end(id: string, label: string) {
    setBusy(id);
    setNotice("");
    const r = await devicesApi.end(token, id);
    setBusy("");
    if (r.ok || r.status === 404) { setNotice("انتهت جلسة " + label + "."); setNonce(n => n + 1); return; }
    if (r.status === 401) { signedOut.current(); return; }
    setNotice(r.error);
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
          {notice && <p className="auth-sub" role="status">{notice}</p>}
        </>
      )}
    </section>
  );
}
