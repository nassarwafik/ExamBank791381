import { IconDownload } from "../icons";
import { useDeferredInstallEntry } from "./useDeferredInstallEntry";
import "./install-entry.css";

// PWA-INSTALL-ALL — «تثبيت التطبيق» on a sign-in page (teacher / student, and owner), under «الدخول بالباركود»: every account type
// finds an install control before signing in. The app suppresses the browser's own install banner on every page (installPrompt.ts,
// Phase 6A), and until now only the student portal offered a button. Not installed → shown; installed / standalone → nothing.
// Nothing opens by itself, nothing is sent, and it is never part of the sign-in form.

export default function InstallSignInEntry({ win = window }: { win?: Window }) {
  const entry = useDeferredInstallEntry(win);
  if (!entry.visible) return null;
  return (
    <>
      <button type="button" className="eb-install-signin" disabled={entry.busy} onClick={entry.start}>
        <IconDownload size={16} />تثبيت التطبيق
      </button>
      {entry.dialog}
    </>
  );
}
