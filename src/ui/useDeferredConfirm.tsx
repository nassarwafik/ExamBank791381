import { lazy, Suspense, useSyncExternalStore } from "react";
import { lazyWithRetry } from "../lazyWithRetry";
import { useConfirmState } from "./useConfirmState";
import { isConfirmDialogReady, subscribeConfirmDialogReady } from "./confirmPrefetch";

// Phase 21E.1 — the same awaited confirmation as useConfirm() (identical contract and return shape) for STARTUP modules:
// the dialog layer (ConfirmDialog → Dialog → focus trap) is fetched on the first confirm instead of shipping in the initial
// bundle (scripts/check-bundle-budget.mjs refuses the dialog layer in the initial graph). Until the chunk arrives nothing is
// rendered and the caller simply keeps awaiting; afterwards the dialog stays mounted like the eager one. lazyWithRetry keeps the
// one-shot stale-chunk deployment recovery (inventoried in src/deploymentRecovery.inventory.11d.test.ts).
const LazyConfirmDialog = lazy(lazyWithRetry(() => import("./ConfirmDialog"), "shared-confirm-dialog"));

export function useDeferredConfirm() {
  const { pending, used, settle, confirm, cancelPending } = useConfirmState();
  // 21E.1 slice 2 — once ./confirmPrefetch has the chunk, mount the dialog CLOSED (it renders nothing) so the first confirm does not
  // suspend; before that (or without a prefetch) it mounts on first use exactly as in slice 1.
  const prefetched = useSyncExternalStore(subscribeConfirmDialogReady, isConfirmDialogReady, () => false);
  const confirmDialog = used || prefetched
    ? <Suspense fallback={null}><LazyConfirmDialog open={pending !== null} options={pending ?? { message: "" }} onResolve={settle} /></Suspense>
    : null;
  return { confirm, cancelPending, confirmDialog, confirmPending: pending !== null };
}
