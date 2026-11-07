import { lazy, Suspense, useState } from "react";
import { lazyWithRetry } from "../lazyWithRetry";
import "./qr-entry.css";
import type { QrNamespace } from "./qrRoute";
import type { QrSignedIn } from "./QrSignInPanel";

// Tadris+ QR-2 — «الدخول بالباركود» on a sign-in page. Only this button ships with the page: the panel and the QR encoder load on
// the first click (their own lazy chunk), so a password sign-in downloads nothing more. While the panel is open the password form
// stays above it, and «الدخول بكلمة المرور» closes the panel again.
const QrSignInPanel = lazy(lazyWithRetry(() => import("./QrSignInPanel"), "qr-sign-in-panel"));

export default function QrSignInEntry({ ns, onSignedIn }: { ns: QrNamespace; onSignedIn: (s: QrSignedIn) => void }) {
  const [open, setOpen] = useState(false);
  const toggle = (next: boolean) => setOpen(next);
  if (!open) {
    return (
      <button type="button" className="eb-qr-entry" onClick={() => toggle(true)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false">
          <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" />
        </svg>
        الدخول بالباركود
      </button>
    );
  }
  return (
    <Suspense fallback={<p className="auth-sub" role="status">جارٍ تجهيز الرمز…</p>}>
      <QrSignInPanel ns={ns} onSignedIn={onSignedIn} onClose={() => toggle(false)} />
    </Suspense>
  );
}
