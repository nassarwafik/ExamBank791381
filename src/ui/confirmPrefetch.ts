// Phase 21E.1 slice 2 — warm the shared confirmation chunk while the teacher is idle, so the FIRST confirmation opens at once (an
// independent review measured ~356 ms with nothing shown on a throttled 3G profile) and a deploy can no longer turn that first click
// into the one-shot chunk reload. Deliberately a PLAIN import(): never lazyWithRetry — a failed prefetch only rejects its own promise
// and is swallowed (the real load in ./useDeferredConfirm keeps its recovery). Same module URL as that lazy component, so the
// browser's module map serves it. A separate module so ./useDeferredConfirm keeps exporting only its hook.

let confirmDialogPrefetch: "idle" | "loading" | "done" = "idle";
export function prefetchConfirmDialog(): void {
  if (confirmDialogPrefetch !== "idle") return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;     // offline: leave it to the real first use
  confirmDialogPrefetch = "loading";
  import("./ConfirmDialog").then(() => { confirmDialogPrefetch = "done"; }, () => { confirmDialogPrefetch = "idle"; });
}

/** Runs `task` when the browser is idle (requestIdleCallback, else a short timer); returns the cancel function. */
export function whenIdle(task: () => void, timeoutMs = 2000): () => void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (typeof w.requestIdleCallback === "function" && typeof w.cancelIdleCallback === "function") {
    const id = w.requestIdleCallback(task, { timeout: timeoutMs });
    return () => w.cancelIdleCallback?.(id);
  }
  const t = window.setTimeout(task, Math.min(timeoutMs, 1200));
  return () => window.clearTimeout(t);
}
