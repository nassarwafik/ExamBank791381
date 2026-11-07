import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import "../ui/kit.css";
import "../owner/owner.css";
import "./qr.css";
import { BRAND_NAME } from "../brand";
import BrandMark from "../ui/BrandMark";
import { IconWarning, IconCheck } from "../icons";
import { approverToken, deviceLabel, qrApi, type QrInspect } from "./qrApi";
import { OWNER_QR_SCAN_HASH, QR_SCAN_HASH, parseScannedQr, qrRouteFromHash, type QrNamespace } from "./qrRoute";
import { cameraAvailable, decodeQr, decodeQrFile } from "./qrScanner";

/**
 * Tadris+ QR-2 — the SIGNED-IN device's page (design docs/enterprise-qr-login-qr1.md): scan the QR a new device shows, see what is
 * asking, pick the number shown beside the QR, approve or refuse. The session used is this tab's own (sessionStorage), sent only to
 * its namespace's routes; the server binds the approval to that session's identity and decides everything else.
 *   - only a QR that is an address of THIS site is accepted (parseScannedQr); another site's QR is refused before any request;
 *   - a QR of the other namespace (owner ↔ teacher / student) is refused with the way to the right scanner;
 *   - the camera runs only while scanning and is stopped on every exit; a photo is the fallback;
 *   - the owner approves only after a recent step-up (the authenticator code, asked here when the server requires it).
 */
type View =
  | { kind: "no-session" }
  | { kind: "scan"; note?: string }
  | { kind: "checking"; token: string }
  | { kind: "confirm"; token: string; info: QrInspect }
  | { kind: "step-up"; token: string; info: QrInspect; picked: number; error?: string }
  | { kind: "working"; token: string; info: QrInspect }
  | { kind: "approved" }
  | { kind: "closed"; message: string; tone: "error" | "info" };

const WRONG_NS: Record<QrNamespace, string> = {
  platform: "هذا رمز دخول مالك المنصة. افتح لوحة المالك على هاتفك وامسحه من قائمة حسابك.",
  owner: "هذا رمز دخول معلم أو طالب. امسحه من تدريس+ وأنت مسجّل الدخول بذلك الحساب."
};

export default function QrApp() {
  const [route] = useState(() => qrRouteFromHash() || { ns: "platform" as QrNamespace, token: "" });
  const ns = route.ns;
  const [session, setSession] = useState(() => approverToken(ns));
  const [view, setView] = useState<View>(() => (!session ? { kind: "no-session" } : route.token ? { kind: "checking", token: route.token } : { kind: "scan" }));
  const back = ns === "owner" ? window.location.pathname + "#/owner" : window.location.pathname;

  // A token that arrived in the address is removed from it (and from history) at once.
  useEffect(() => {
    if (route.token) { try { window.history.replaceState(null, "", window.location.pathname + window.location.search + (ns === "owner" ? OWNER_QR_SCAN_HASH : QR_SCAN_HASH)); } catch { /* best effort */ } }
  }, [route.token, ns]);

  const gone = useCallback((status: number, code: string, error: string) => {
    if (status === 401) { setSession(""); setView({ kind: "no-session" }); return; }
    setView({ kind: "closed", message: error, tone: code === "QR_DENIED" ? "info" : "error" });
  }, []);

  // checking → inspect (read-only on the server)
  const checkingToken = view.kind === "checking" ? view.token : "";
  useEffect(() => {
    if (!checkingToken) return;
    let live = true;
    void qrApi.inspect(ns, session, checkingToken).then(r => {
      if (!live) return;
      if (r.ok) setView({ kind: "confirm", token: checkingToken, info: r.data });
      else gone(r.status, r.code, r.error);
    });
    return () => { live = false; };
  }, [checkingToken, ns, session, gone]);

  const onScanned = useCallback((text: string) => {
    const found = parseScannedQr(text);
    if (!found) { setView({ kind: "scan", note: "هذا ليس رمز دخول إلى تدريس+ على هذا الموقع." }); return; }
    if (found.ns !== ns) { setView({ kind: "scan", note: WRONG_NS[ns] }); return; }
    setView({ kind: "checking", token: found.token });
  }, [ns]);

  async function approve(token: string, info: QrInspect, picked: number) {
    setView({ kind: "working", token, info });
    const r = await qrApi.approve(ns, session, token, picked);
    if (r.ok) { setView({ kind: "approved" }); return; }
    if (ns === "owner" && r.code === "STEP_UP_REQUIRED") { setView({ kind: "step-up", token, info, picked }); return; }
    gone(r.status, r.code, r.error);
  }

  async function deny(token: string) {
    const r = await qrApi.deny(ns, session, token);
    if (r.ok) setView({ kind: "closed", message: "رُفض طلب الدخول، ولن يُفتح حسابك على ذلك الجهاز.", tone: "info" });
    else gone(r.status, r.code, r.error);
  }

  return (
    <main className="eb-owner-page eb-qr-page" dir="rtl">
      <header className="eb-owner-top">
        <span className="eb-owner-brand"><BrandMark size={32} /><bdi dir="ltr">{BRAND_NAME}</bdi></span>
      </header>
      <div className="eb-owner-body">
        <section className="auth-card eb-owner-card" aria-labelledby="eb-qr-title">
          <h1 id="eb-qr-title" className="auth-welcome">{ns === "owner" ? "ربط جهاز آخر بحساب المالك" : "ربط جهاز آخر بالباركود"}</h1>

          {view.kind === "no-session" && (
            <p className="auth-sub" role="alert">{ns === "owner" ? "سجّل الدخول إلى لوحة المالك على هذا الجهاز أولًا، ثم افتح «ربط جهاز آخر بالباركود» من قائمة حسابك." : "سجّل الدخول إلى تدريس+ على هذا الجهاز أولًا، ثم افتح «ربط جهاز آخر بالباركود»."}</p>
          )}

          {view.kind === "scan" && <Scanner note={view.note} onScanned={onScanned} />}

          {(view.kind === "checking" || view.kind === "working") && <p className="auth-sub" role="status">لحظة…</p>}

          {(view.kind === "confirm" || view.kind === "step-up") && (
            <div className="eb-qr-confirm">
              <p className="eb-qr-ask">جهاز يطلب الدخول إلى حسابك: <strong><bdi dir="ltr">{deviceLabel(view.info.device)}</bdi></strong></p>
              {!view.info.sameNetwork && <p className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />هذا الجهاز ليس على شبكتك. إن لم تكن أمامه الآن فاضغط «لست أنا».</p>}
              {view.kind === "confirm" && (
                <>
                  <p className="auth-sub">اختر الرقم الظاهر بجانب الرمز على الجهاز الآخر:</p>
                  <div className="eb-qr-numbers" role="group" aria-label="الأرقام">
                    {view.info.matchOptions.map(n => (
                      <button key={n} type="button" className="eb-qr-number" onClick={() => void approve(view.token, view.info, n)}><bdi dir="ltr">{n}</bdi></button>
                    ))}
                  </div>
                  <button type="button" className="eb-qr-link is-danger" onClick={() => void deny(view.token)}>لست أنا — ارفض الطلب</button>
                </>
              )}
              {view.kind === "step-up" && (
                <StepUp error={view.error} onCancel={() => void deny(view.token)} onCode={async code => {
                  const s = await qrApi.ownerStepUp(session, code);
                  if (!s.ok) { if (s.status === 401) { gone(401, s.code, s.error); return; } setView({ ...view, error: s.error }); return; }
                  await approve(view.token, view.info, view.picked);
                }} />
              )}
            </div>
          )}

          {view.kind === "approved" && (
            <p className="eb-qr-done" role="status"><IconCheck size={18} aria-hidden="true" />تمت الموافقة. سيُفتح حسابك على الجهاز الآخر خلال ثوانٍ.</p>
          )}

          {view.kind === "closed" && (
            <div className={view.tone === "error" ? "auth-error" : "auth-sub"} role="alert">{view.tone === "error" && <IconWarning size={16} aria-hidden="true" />}{view.message}</div>
          )}

          <div className="eb-qr-actions">
            {(view.kind === "approved" || view.kind === "closed") && session && <button type="button" className="auth-submit" onClick={() => setView({ kind: "scan" })}>مسح رمز آخر</button>}
            <a className="eb-qr-link" href={back}>{ns === "owner" ? "العودة إلى لوحة المالك" : "العودة إلى تدريس+"}</a>
          </div>
        </section>
      </div>
    </main>
  );
}

function StepUp({ error, onCode, onCancel }: { error?: string; onCode: (code: string) => Promise<void>; onCancel: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const c = code.replace(/\s/g, "");
    if (!c || busy) return;
    setBusy(true);
    await onCode(c);
    setBusy(false);
    setCode("");
  }
  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <label className="auth-field">
        <span>للموافقة على دخول المالك أدخل رمز التحقق من تطبيق المصادقة</span>
        <div className="auth-input"><input type="text" value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7} dir="ltr" /></div>
      </label>
      {error && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</div>}
      <button type="submit" className="auth-submit" disabled={busy}>تأكيد والموافقة</button>
      <button type="button" className="eb-qr-link is-danger" onClick={onCancel}>لست أنا — ارفض الطلب</button>
    </form>
  );
}

/** The live camera (started by the user's tap, stopped on every exit) and the photo fallback. */
function Scanner({ note, onScanned }: { note?: string; onScanned: (text: string) => void }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [live, setLive] = useState(false);
  const [problem, setProblem] = useState("");
  const done = useRef(onScanned);
  useEffect(() => { done.current = onScanned; }, [onScanned]);

  useEffect(() => {
    if (!live) return;
    let stream: MediaStream | null = null, stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => { stopped = true; if (timer) clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); };
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch {
        if (!stopped) { setProblem("لم يُسمح باستخدام الكاميرا. اسمح بها من إعدادات المتصفح، أو التقط صورة للرمز."); setLive(false); }
        return;
      }
      if (stopped || !video.current) { stop(); return; }
      video.current.srcObject = stream;
      try { await video.current.play(); } catch { /* autoplay with a user gesture normally succeeds */ }
      const scan = async () => {
        if (stopped || !video.current) return;
        const text = video.current.readyState >= 2 ? await decodeQr(video.current).catch(() => null) : null;
        if (stopped) return;
        if (text) { stop(); setLive(false); done.current(text); return; }
        timer = setTimeout(() => void scan(), 250);
      };
      void scan();
    })();
    return stop;
  }, [live]);

  async function fromPhoto(file: File | undefined) {
    if (!file) return;
    setProblem("");
    const text = await decodeQrFile(file);
    if (text) onScanned(text); else setProblem("لم أجد رمزًا في الصورة. قرّب الهاتف من الرمز وأعد المحاولة.");
  }

  return (
    <div className="eb-qr-scanner">
      {note && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{note}</div>}
      {live
        ? <video ref={video} className="eb-qr-video" muted playsInline aria-label="معاينة الكاميرا" />
        : <p className="auth-sub">وجّه الكاميرا إلى الرمز الظاهر على الجهاز الذي تريد الدخول منه.</p>}
      {problem && <p className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{problem}</p>}
      <div className="eb-qr-actions">
        {live
          ? <button type="button" className="eb-qr-link" onClick={() => setLive(false)}>إيقاف الكاميرا</button>
          : cameraAvailable() && <button type="button" className="auth-submit" onClick={() => { setProblem(""); setLive(true); }}>تشغيل الكاميرا</button>}
        <label className="eb-qr-link eb-qr-photo">
          التقط صورة للرمز
          <input type="file" accept="image/*" capture="environment" onChange={e => { void fromPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>
    </div>
  );
}
