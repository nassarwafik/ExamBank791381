import { IconDownload } from "../icons";
import { useInstallEntry } from "./useInstallEntry";
import "./pwa.css";

// Phase 10C — the PERMANENT install access point in the student top bar: a small «تثبيت التطبيق» entry that exists
// whenever the app is not installed, independent of the dashboard card and of its 7-day dismissal. Nothing opens by
// itself: a click either opens the browser's native prompt (when captured) or a small dialog with the guidance
// (iPhone/iPad steps, or the browser-menu path). Installed / standalone → the entry is not rendered at all. No
// notification permission is involved. UX-S1 — the behaviour lives in `useInstallEntry` (also used by the phone «المزيد» menu).

export default function InstallAppEntry({ win = window }: { win?: Window }) {
  const entry = useInstallEntry(win);
  if (!entry.visible) return null;
  return (
    <>
      <button type="button" className="student-topbar-link eb-student-install-entry" disabled={entry.busy} onClick={entry.start}>
        <IconDownload size={16} />تثبيت التطبيق
      </button>
      {entry.dialog}
    </>
  );
}
