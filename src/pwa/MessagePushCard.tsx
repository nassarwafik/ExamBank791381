import { useEffect, useMemo, useState } from "react";
import {
  createPushClient, enableMessagePush, isPushSupported, notificationPermission, syncExistingPush,
  type ExistingPushState, type PushClient, type PushConfig
} from "./pushNotifications";
import { isAppleMobile, isStandalone, isTouchFirst } from "./installPrompt";
import "./pwa.css";

// Phase 6B — opt-in «إشعارات الرسائل» card (student portal). It NEVER asks for permission by itself: the browser prompt
// opens only from the student's click on «تفعيل الإشعارات». On mount it only reads the current state (feature
// detection, the server's VAPID availability, the existing permission/subscription). Hidden when the server has no
// push configuration; messaging works exactly the same with or without notifications. Support is decided by feature
// detection only. A browser without Web Push shows a short (dismissible) «not supported» note on phones/tablets — where
// students expect notifications and can act on it (iPhone/iPad: the home-screen app, iOS 16.4+; Android in-app
// browsers: open in the browser) — and after a click that finds no support; a desktop page stays unchanged otherwise.

// "enabled" = permission granted AND this browser's subscription was made with the server's CURRENT VAPID key AND it is
// registered with the server. "repair" = permission granted but the subscription belongs to an old/other key (the server
// key was rotated): it can never receive a push, so the card offers «إعادة تفعيل الإشعارات» instead of claiming success.
type View = "checking" | "hidden" | "unsupported" | "default" | "enabled" | "repair" | "denied";

// Per-device convenience memory: only «the student hid the "not supported" note» (never credentials or personal data).
const UNSUPPORTED_HIDDEN_KEY = "examBankPushUnsupportedHidden";
function unsupportedHidden(): boolean {
  try { return localStorage.getItem(UNSUPPORTED_HIDDEN_KEY) === "1"; } catch { return false; }
}
function hideUnsupported() {
  try { localStorage.setItem(UNSUPPORTED_HIDDEN_KEY, "1"); } catch { /* storage unavailable → shown again next time */ }
}

function showUnsupportedNote(win: Window): boolean {
  return (isAppleMobile(win) || isTouchFirst(win)) && !unsupportedHidden();
}

function unsupportedText(win: Window): string {
  if (!isAppleMobile(win)) return "هذا المتصفح لا يدعم إشعارات الرسائل. افتح ExamBank في المتصفح (مثل Chrome) أو من أيقونته على الشاشة الرئيسية.";
  return isStandalone(win)
    ? "إشعارات الرسائل غير مدعومة على هذا الجهاز. حدّث iOS إلى الإصدار 16.4 أو أحدث."
    : "إشعارات الرسائل غير مدعومة في المتصفح. على iPhone وiPad: ثبّت التطبيق على الشاشة الرئيسية أولًا، ثم افتحه من أيقونته وفعّل الإشعارات.";
}

export default function MessagePushCard({ token, win = window, client }: { token: string; win?: Window; client?: PushClient }) {
  const api = useMemo(() => client || createPushClient(token), [client, token]);
  const supported = isPushSupported(win);
  const [view, setView] = useState<View>(() => (supported ? "checking" : showUnsupportedNote(win) ? "unsupported" : "hidden"));
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!supported) return;
    let alive = true;
    void (async () => {
      let cfg: PushConfig;
      try { cfg = await api.getConfig(); } catch { if (alive) setView("hidden"); return; }   // auxiliary: never an error banner
      if (!alive) return;
      if (!cfg.available) { setView("hidden"); return; }
      setConfig(cfg);
      const permission = notificationPermission(win);
      if (permission === "denied") { setView("denied"); return; }
      let state: ExistingPushState = "none";
      if (permission === "granted") { try { state = await syncExistingPush(api, cfg, win); } catch { state = "none"; } }
      if (alive) setView(state === "enabled" ? "enabled" : state === "repair" ? "repair" : "default");
    })();
    return () => { alive = false; };
  }, [api, supported, win]);

  if (view === "checking" || view === "hidden") return null;

  const onEnable = async () => {
    if (!config || busy) return;
    const repairing = view === "repair";
    setBusy(true);
    setNotice("");
    const result = await enableMessagePush(api, config, win);
    setBusy(false);
    if (result === "enabled") { setView("enabled"); setNotice(repairing ? "تمت إعادة تفعيل الإشعارات على هذا الجهاز." : "تم تفعيل الإشعارات على هذا الجهاز."); }
    else if (result === "denied") setView("denied");
    else if (result === "unsupported") setView("unsupported");                       // the student asked → always answer
    else if (result === "unavailable") setView("hidden");
    else if (result === "default") { setView("default"); setNotice("لم يتم التفعيل. يمكنك المحاولة لاحقًا."); }
    else setNotice(repairing ? "تعذرت إعادة تفعيل الإشعارات حاليًا. حاول مرة أخرى." : "تعذر تفعيل الإشعارات حاليًا. حاول مرة أخرى.");
  };

  return (
    <section className="eb-sp-panel eb-install-card eb-push-card" aria-labelledby="eb-push-title" data-state={view}>
      <div className="eb-install-head">
        <span className="eb-install-mark" aria-hidden="true">🔔</span>
        <div>
          <h2 id="eb-push-title" className="eb-install-title">إشعارات الرسائل</h2>
          <p className="eb-install-desc">
            {view === "enabled" && "الإشعارات مفعلة"}
            {view === "repair" && "تحتاج الإشعارات على هذا الجهاز إلى إعادة تفعيل حتى تصلك تنبيهات الرسائل الجديدة."}
            {view === "default" && "استقبل تنبيهًا على هذا الجهاز عندما يرسل لك المعلم رسالة جديدة، حتى لو كان التطبيق مغلقًا."}
            {view === "denied" && "الإشعارات مرفوضة من المتصفح. لتفعيلها، اسمح بالإشعارات لهذا الموقع من إعدادات المتصفح ثم أعد فتح الصفحة."}
            {view === "unsupported" && unsupportedText(win)}
          </p>
        </div>
      </div>

      {view === "default" && (
        <div className="eb-install-actions">
          <button type="button" className="eb-button is-primary eb-install-button" disabled={busy} onClick={() => void onEnable()}>
            {busy ? "جارٍ التفعيل..." : "تفعيل الإشعارات"}
          </button>
        </div>
      )}

      {view === "repair" && (
        <div className="eb-install-actions">
          <button type="button" className="eb-button is-primary eb-install-button" disabled={busy} onClick={() => void onEnable()}>
            {busy ? "جارٍ إعادة التفعيل..." : "إعادة تفعيل الإشعارات"}
          </button>
        </div>
      )}

      {view === "unsupported" && (
        <div className="eb-install-actions">
          <button type="button" className="eb-button is-quiet" onClick={() => { hideUnsupported(); setView("hidden"); }}>إخفاء</button>
        </div>
      )}

      {/* Always present while the card is shown, so the outcome is announced when it changes. */}
      <p className="eb-install-notice" role="status">{notice}</p>
    </section>
  );
}
