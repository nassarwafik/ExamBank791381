import { useState, useSyncExternalStore } from "react";
import { getInstallState, installGuidance, promptInstall, subscribeInstallState, type InstallGuidance } from "./installPrompt";

/**
 * The behaviour of every «تثبيت التطبيق» entry (Phase 10C, UX-S1), without the guidance dialog's markup — so a startup module can
 * offer the entry and load the dialog only when it opens (PWA-INSTALL-ALL: `useDeferredInstallEntry`). Rules, unchanged: installed /
 * standalone → not visible; a captured browser prompt is used first, only on the click; accepted → the entry disappears; declined /
 * consumed / no prompt → the guidance dialog (iPhone / iPad steps or the browser-menu path).
 */
export function useInstallEntryState(win: Window = window): { visible: boolean; busy: boolean; start: () => void; open: boolean; close: () => void; guidance: InstallGuidance } {
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
  return { visible, busy, start, open, close: () => setOpen(false), guidance };
}
