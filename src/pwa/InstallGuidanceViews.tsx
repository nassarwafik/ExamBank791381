import { MANUAL_INSTALL_MESSAGE, manualInstallHint } from "./installPrompt";

// Phase 10C — the two guidance blocks shared by the install card (student dashboard) and the permanent install entry
// (student top bar dialog), so the wording is written once. Presentational only; no state, no side effects.

export function ShareIcon() {
  return (
    <svg className="eb-install-share" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M12 3v11M8 7l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** iPhone / iPad: the three Add-to-Home-Screen steps (iOS has no install API). */
export function IosInstallSteps() {
  return (
    <ol className="eb-install-steps" aria-label="خطوات الإضافة إلى الشاشة الرئيسية">
      <li>افتح قائمة المشاركة <ShareIcon /> <span className="eb-install-hint">(زر المشاركة في شريط المتصفح)</span></li>
      <li>اختر «إضافة إلى الشاشة الرئيسية»</li>
      <li>اضغط «إضافة»</li>
    </ol>
  );
}

/** Not installed and no native prompt right now: the browser-menu path, worded for the device. */
export function ManualInstallGuidance({ win }: { win: Window }) {
  return (
    <div className="eb-install-manual">
      <p className="eb-install-manual-text">{MANUAL_INSTALL_MESSAGE}</p>
      <p className="eb-install-manual-hint">{manualInstallHint(win)}</p>
    </div>
  );
}
