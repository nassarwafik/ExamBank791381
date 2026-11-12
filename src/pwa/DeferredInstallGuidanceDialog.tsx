import { lazy, Suspense } from "react";
import { lazyWithRetry } from "../lazyWithRetry";

// PWA-INSTALL-ALL — the guidance dialog as its own lazy chunk (fetched when this is first rendered), for surfaces that load at
// startup: no startup chunk may carry the shared dialog layer (scripts/check-bundle-budget.mjs, 21E.1).
const InstallGuidanceDialog = lazy(lazyWithRetry(() => import("./InstallGuidanceDialog"), "install-guidance-dialog"));

export default function DeferredInstallGuidanceDialog(props: { open: boolean; ios: boolean; win: Window; onClose: () => void }) {
  return <Suspense fallback={null}><InstallGuidanceDialog {...props} /></Suspense>;
}
