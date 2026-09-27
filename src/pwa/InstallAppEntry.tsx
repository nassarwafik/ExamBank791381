import { useState, useSyncExternalStore } from "react";
import Dialog from "../ui/Dialog";
import { IconDownload } from "../icons";
import { getInstallState, installGuidance, promptInstall, subscribeInstallState } from "./installPrompt";
import { IosInstallSteps, ManualInstallGuidance } from "./InstallGuidanceViews";
import "./pwa.css";

// Phase 10C — the PERMANENT install access point in the student top bar: a small «تثبيت التطبيق» entry that exists
// whenever the app is not installed, independent of the dashboard card and of its 7-day dismissal. Nothing opens by
// itself: a click either opens the browser's native prompt (when captured) or a small dialog with the guidance
// (iPhone/iPad steps, or the browser-menu path). Installed / standalone → the entry is not rendered at all. No
// notification permission is involved.

export default function InstallAppEntry({ win = window }: { win?: Window }) {
  const install = useSyncExternalStore(subscribeInstallState, getInstallState, getInstallState);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const guidance = installGuidance(win, install);

  if (guidance.kind === "installed") return null;

  const onClick = async () => {
    if (guidance.kind === "prompt") {
      setBusy(true);
      const outcome = await promptInstall();
      setBusy(false);
      if (outcome === "accepted") return;                                     // installedNow → the entry unmounts
      setOpen(true);                                                          // declined / prompt consumed → the manual path stays available
      return;
    }
    setOpen(true);
  };
  return (
    <>
      <button type="button" className="student-topbar-link eb-student-install-entry" disabled={busy} onClick={() => void onClick()}>
        <IconDownload size={16} />تثبيت التطبيق
      </button>
      <Dialog open={open} title="تثبيت ExamBank" onClose={() => setOpen(false)} size="sm" className="eb-install-dialog">
        <p className="eb-install-desc">افتح ExamBank من أيقونة على الشاشة الرئيسية مثل أي تطبيق. التثبيت اختياري.</p>
        {guidance.kind === "ios" ? <IosInstallSteps /> : <ManualInstallGuidance win={win} />}
      </Dialog>
    </>
  );
}
