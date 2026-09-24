import { useState, useSyncExternalStore } from "react";
import {
  getInstallState, installGuidance, isTouchFirst, promptInstall, rememberCardDismissed, subscribeInstallState, wasCardDismissed
} from "./installPrompt";
import "./pwa.css";

// Phase 6A — a small, optional «install the app» card for the student portal. It never opens anything by itself:
// Android/Chromium → a button that opens the browser's own install prompt on click; iPhone/iPad → three short
// Add-to-Home-Screen steps (iOS has no install API). Already installed, desktop without a prompt, or closed by the
// student («ليس الآن», remembered on this device) → nothing is rendered. No notification permission is involved.

function ShareIcon() {
  return (
    <svg className="eb-install-share" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M12 3v11M8 7l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function InstallAppCard({ win = window }: { win?: Window }) {
  const install = useSyncExternalStore(subscribeInstallState, getInstallState, getInstallState);
  const [dismissed, setDismissed] = useState(wasCardDismissed);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const guidance = installGuidance(win, install);

  if (dismissed) return null;
  if ((guidance.kind === "none" || guidance.kind === "installed") && !notice) return null;

  const close = () => { rememberCardDismissed(); setDismissed(true); };
  const onInstall = async () => {
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);
    if (outcome === "accepted") setNotice("تم تثبيت التطبيق. افتحه من أيقونة ExamBank على الشاشة الرئيسية.");
    else setNotice("لم يتم التثبيت. يمكنك تثبيت التطبيق لاحقًا من قائمة المتصفح.");
  };

  return (
    <section className="eb-sp-panel eb-install-card" aria-labelledby="eb-install-title">
      <div className="eb-install-head">
        <span className="eb-install-mark" aria-hidden="true">EB</span>
        <div>
          <h2 id="eb-install-title" className="eb-install-title">تثبيت التطبيق</h2>
          <p className="eb-install-desc">افتح ExamBank من أيقونة على الشاشة الرئيسية مثل أي تطبيق. التثبيت اختياري.</p>
        </div>
      </div>

      {guidance.kind === "prompt" && (
        <div className="eb-install-actions">
          <button type="button" className="eb-button is-primary eb-install-button" disabled={busy} onClick={() => void onInstall()}>
            {isTouchFirst(win) ? "تثبيت التطبيق على الهاتف" : "تثبيت التطبيق على هذا الجهاز"}
          </button>
          <button type="button" className="eb-button is-quiet" onClick={close}>ليس الآن</button>
        </div>
      )}

      {guidance.kind === "ios" && (
        <>
          <ol className="eb-install-steps" aria-label="خطوات الإضافة إلى الشاشة الرئيسية">
            <li>افتح قائمة المشاركة <ShareIcon /> <span className="eb-install-hint">(زر المشاركة في شريط المتصفح)</span></li>
            <li>اختر «إضافة إلى الشاشة الرئيسية»</li>
            <li>اضغط «إضافة»</li>
          </ol>
          <div className="eb-install-actions">
            <button type="button" className="eb-button is-quiet" onClick={close}>إخفاء</button>
          </div>
        </>
      )}

      {/* Always present while the card is shown, so the outcome is announced when it changes. */}
      <p className="eb-install-notice" role="status">{notice}</p>
      {notice && guidance.kind !== "prompt" && guidance.kind !== "ios" && (
        <div className="eb-install-actions">
          <button type="button" className="eb-button is-quiet" onClick={close}>إخفاء</button>
        </div>
      )}
    </section>
  );
}
