import { useState, type ReactNode } from "react";
import DeferredInstallGuidanceDialog from "./DeferredInstallGuidanceDialog";
import { useInstallEntryState } from "./useInstallEntryState";

// PWA-INSTALL-ALL — «تثبيت التطبيق» for the surfaces that load at startup (the sign-in pages, the teacher shell) and for the owner's
// account menu. Same rules as the student bar's entry (`useInstallEntryState`); the guidance dialog — and with it the shared dialog
// layer, which no startup chunk may carry — is a lazy chunk, fetched on the first open only (DeferredInstallGuidanceDialog).
// A native browser prompt that is accepted never loads it.

export function useDeferredInstallEntry(win: Window = window): { visible: boolean; busy: boolean; start: () => void; dialog: ReactNode } {
  const { visible, busy, start, open, close, guidance } = useInstallEntryState(win);
  const [opened, setOpened] = useState(false);
  if (open && !opened) setOpened(true);                                        // stays mounted once loaded, so closing returns focus
  const dialog = visible && opened ? <DeferredInstallGuidanceDialog open={open} ios={guidance.kind === "ios"} win={win} onClose={close} /> : null;
  return { visible, busy, start, dialog };
}
