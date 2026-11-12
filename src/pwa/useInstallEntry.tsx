import type { ReactNode } from "react";
import InstallGuidanceDialog from "./InstallGuidanceDialog";
import { useInstallEntryState } from "./useInstallEntryState";

/**
 * Phase 10C behaviour of the permanent «تثبيت التطبيق» entry, as a hook (UX-S1, docs/enterprise-ux-student-s1.md §2.2): the
 * state and the guidance dialog live with the CALLER, so the same action can be offered from a menu that closes (and unmounts its
 * items) on click — the dialog it opens stays. Unchanged rules: installed / standalone → not visible; a captured browser prompt
 * is used first; declined / consumed → the manual guidance dialog (iPhone/iPad steps or the browser-menu path).
 * PWA-INSTALL-ALL — the rules live in `useInstallEntryState` and the dialog in `InstallGuidanceDialog`, shared with
 * `useDeferredInstallEntry` (the same entry for startup modules, which must not carry the dialog layer).
 */
export function useInstallEntry(win: Window = window): { visible: boolean; busy: boolean; start: () => void; dialog: ReactNode } {
  const { visible, busy, start, open, close, guidance } = useInstallEntryState(win);
  const dialog = visible ? <InstallGuidanceDialog open={open} ios={guidance.kind === "ios"} win={win} onClose={close} /> : null;
  return { visible, busy, start, dialog };
}
