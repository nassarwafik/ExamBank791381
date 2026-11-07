import { useState, useSyncExternalStore, type ReactNode } from "react";
import Dialog from "../ui/Dialog";
import { getInstallState, installGuidance, promptInstall, subscribeInstallState } from "./installPrompt";
import { IosInstallSteps, ManualInstallGuidance } from "./InstallGuidanceViews";

/**
 * Phase 10C behaviour of the permanent «تثبيت التطبيق» entry, as a hook (UX-S1, docs/enterprise-ux-student-s1.md §2.2): the
 * state and the guidance dialog live with the CALLER, so the same action can be offered from a menu that closes (and unmounts its
 * items) on click — the dialog it opens stays. Unchanged rules: installed / standalone → not visible; a captured browser prompt
 * is used first; declined / consumed → the manual guidance dialog (iPhone/iPad steps or the browser-menu path).
 */
export function useInstallEntry(win: Window = window): { visible: boolean; busy: boolean; start: () => void; dialog: ReactNode } {
  const install = useSyncExternalStore(subscribeInstallState, getInstallState, getInstallState);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const guidance = installGuidance(win, install);
  const visible = guidance.kind !== "installed";

  const start = () => {
    void (async () => {
      if (guidance.kind === "prompt") {
        setBusy(true);
        const outcome = await promptInstall();
        setBusy(false);
        if (outcome === "accepted") return;                                     // installedNow → the entry disappears
        setOpen(true);                                                          // declined / prompt consumed → the manual path
        return;
      }
      setOpen(true);
    })();
  };
  const dialog = visible ? (
    <Dialog open={open} title={<>تثبيت <bdi dir="ltr">Tadris+</bdi></>} onClose={() => setOpen(false)} size="sm" className="eb-install-dialog">
      <p className="eb-install-desc">افتح <bdi dir="ltr">Tadris+</bdi> من أيقونة على الشاشة الرئيسية مثل أي تطبيق. التثبيت اختياري.</p>
      {guidance.kind === "ios" ? <IosInstallSteps /> : <ManualInstallGuidance win={win} />}
    </Dialog>
  ) : null;
  return { visible, busy, start, dialog };
}
