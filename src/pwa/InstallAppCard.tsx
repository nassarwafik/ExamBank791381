import { useState, useSyncExternalStore } from "react";
import {
  getInstallState, installGuidance, isTouchFirst, promptInstall, rememberCardDismissed, subscribeInstallState, wasCardDismissed
} from "./installPrompt";
import { IosInstallSteps, ManualInstallGuidance } from "./InstallGuidanceViews";
import BrandMark from "../ui/BrandMark";
import "./pwa.css";

// Phase 6A — a small, optional «install the app» card for the student portal. It never opens anything by itself:
// Android/Chromium → a button that opens the browser's own install prompt on click; iPhone/iPad → three short
// Add-to-Home-Screen steps (iOS has no install API). Already installed → nothing is rendered. No notification
// permission is involved.
// Phase 10C — (1) «ليس الآن» hides the card for 7 days on this device, never for good; (2) a browser that has not
// fired `beforeinstallprompt` gets a quiet «تثبيت ExamBank» card with the browser-menu path instead of nothing;
// (3) the mark is the official app icon (BrandMark), the same file as the installed icon; (4) installed / standalone
// — including the moment a native install is ACCEPTED — renders nothing at all; a declined or consumed native prompt
// falls back to the manual guidance (never hidden behind a notice).

export default function InstallAppCard({ win = window }: { win?: Window }) {
  const install = useSyncExternalStore(subscribeInstallState, getInstallState, getInstallState);
  const [dismissed, setDismissed] = useState(() => wasCardDismissed());
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const guidance = installGuidance(win, install);

  if (dismissed) return null;
  if (guidance.kind === "installed") return null;                              // no install UI once installed — ever

  const close = () => { rememberCardDismissed(); setDismissed(true); };
  const onInstall = async () => {
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);
    // accepted → `installedNow` re-renders this card as null; anything else → the manual guidance takes over below.
    if (outcome !== "accepted") setNotice("لم يتم التثبيت.");
  };
  const manual = guidance.kind === "manual";

  return (
    <section className={"eb-sp-panel eb-install-card" + (manual ? " is-manual" : "")} aria-labelledby="eb-install-title">
      <div className="eb-install-head">
        <span className="eb-install-mark" aria-hidden="true"><BrandMark size={40} /></span>
        <div>
          <h2 id="eb-install-title" className="eb-install-title">{manual ? "تثبيت ExamBank" : "تثبيت التطبيق"}</h2>
          {!manual && <p className="eb-install-desc">افتح ExamBank من أيقونة على الشاشة الرئيسية مثل أي تطبيق. التثبيت اختياري.</p>}
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
          <IosInstallSteps />
          <div className="eb-install-actions">
            <button type="button" className="eb-button is-quiet" onClick={close}>إخفاء</button>
          </div>
        </>
      )}

      {manual && (
        <>
          <ManualInstallGuidance win={win} />
          <div className="eb-install-actions">
            <button type="button" className="eb-button is-quiet is-small" onClick={close}>ليس الآن</button>
          </div>
        </>
      )}

      {/* Always present while the card is shown, so a declined prompt is announced when it happens. */}
      <p className="eb-install-notice" role="status">{notice}</p>
    </section>
  );
}
