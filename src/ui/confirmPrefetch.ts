// Phase 21E.1 slice 2 — warm the shared confirmation chunk while the teacher is idle, so the FIRST confirmation opens at once (an
// independent review measured ~356 ms with nothing shown on a throttled 3G profile) and a deploy can no longer turn that first click
// into the one-shot chunk reload. Deliberately a PLAIN import(): never lazyWithRetry, so a failed prefetch never reloads the page
// by itself; its rejection is swallowed. Same module URL as the lazy component in ./useDeferredConfirm, so the browser's module map
// serves it. Note: browsers may keep a FAILED module fetch in that map for the page's lifetime (as for any failed dynamic import);
// the first real use then takes the existing one-shot recovery (lazyWithRetry), exactly what a failed first-use fetch did before
// this slice — still one fetch attempt, only made at idle right after sign-in instead of on the first click. Skipped offline.
// A separate module so ./useDeferredConfirm keeps exporting only its hook.

let confirmDialogPrefetch: "idle" | "loading" | "done" = "idle";
const readyListeners = new Set<() => void>();
/** `load` is the import boundary (tests count / fail it there); production always uses the default plain import. */
export function prefetchConfirmDialog(load: () => Promise<unknown> = () => import("./ConfirmDialog")): void {
  if (confirmDialogPrefetch !== "idle") return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;     // offline: leave it to the real first use
  confirmDialogPrefetch = "loading";
  load().then(() => { confirmDialogPrefetch = "done"; readyListeners.forEach(l => l()); }, () => { confirmDialogPrefetch = "idle"; });
}
/** True once the chunk is in the module map. ./useDeferredConfirm then mounts its (closed) lazy dialog ahead of the first use, so
 *  the first confirmation opens in the same frame — a lazy component first rendered on demand would still suspend once and React
 *  would hold the reveal for its fallback throttle (~300 ms, measured in Chromium) even with the module already loaded. */
export const isConfirmDialogReady = () => confirmDialogPrefetch === "done";
export function subscribeConfirmDialogReady(listener: () => void): () => void {
  readyListeners.add(listener);
  return () => { readyListeners.delete(listener); };
}

/** Runs `task` when the browser is idle (requestIdleCallback, else a short timer); returns the cancel function. */
export function whenIdle(task: () => void, timeoutMs = 2000): () => void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (typeof w.requestIdleCallback === "function" && typeof w.cancelIdleCallback === "function") {
    const id = w.requestIdleCallback(() => task(), { timeout: timeoutMs });       // never hand the IdleDeadline to the task
    return () => w.cancelIdleCallback?.(id);
  }
  const t = window.setTimeout(() => task(), Math.min(timeoutMs, 1200));
  return () => window.clearTimeout(t);
}
