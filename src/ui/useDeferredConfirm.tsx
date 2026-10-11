import { lazy, Suspense } from "react";
import { lazyWithRetry } from "../lazyWithRetry";
import { useConfirmState } from "./useConfirmState";

// Phase 21E.1 — the same awaited confirmation as useConfirm() (identical contract and return shape) for STARTUP modules:
// the dialog layer (ConfirmDialog → Dialog → focus trap) is fetched on the first confirm instead of shipping in the initial
// bundle (scripts/check-bundle-budget.mjs refuses the dialog layer in the initial graph). Until the chunk arrives nothing is
// rendered and the caller simply keeps awaiting; afterwards the dialog stays mounted like the eager one. lazyWithRetry keeps the
// one-shot stale-chunk deployment recovery (inventoried in src/deploymentRecovery.inventory.11d.test.ts).
const LazyConfirmDialog = lazy(lazyWithRetry(() => import("./ConfirmDialog"), "shared-confirm-dialog"));

export function useDeferredConfirm() {
  const { pending, used, settle, confirm, cancelPending } = useConfirmState();
  const confirmDialog = used
    ? <Suspense fallback={null}><LazyConfirmDialog open={pending !== null} options={pending ?? { message: "" }} onResolve={settle} /></Suspense>
    : null;
  return { confirm, cancelPending, confirmDialog, confirmPending: pending !== null };
}
