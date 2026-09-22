import { useEffect, useRef } from "react";

/**
 * Background auto-refresh for a screen's existing fetch function — no new data-fetching architecture, just a timer
 * plus focus/visibility triggers around a `refetch` the caller already owns (e.g. StudentPortal's `load()`).
 *
 * Behaviour:
 *  - Polls `refetch` every `intervalMs` while ENABLED and the document is VISIBLE. The interval is fully torn down
 *    while the tab is hidden (it never ticks in the background) and rebuilt — with one immediate `refetch` — the
 *    moment the document returns to `visible`.
 *  - Also calls `refetch` immediately on `window` focus and whenever `document.visibilityState` becomes `visible`.
 *  - SINGLE-FLIGHT: a trigger (timer / focus / visibility) is skipped while a previous `refetch` is still in flight,
 *    so auto-refreshes never overlap. The in-flight lock is released in `finally` (a rejected `refetch` never locks
 *    the mechanism) and swallowed here — error handling belongs to `refetch` itself.
 *  - Cleans up the interval and both listeners on unmount, and never stacks duplicate timers: the effect is keyed
 *    only on `enabled`/`intervalMs`, and the latest `refetch` closure is read through a ref, so an identity change
 *    of `refetch` on every render never re-arms the timer.
 *
 * The caller decides WHEN to enable (e.g. only on the main view, not inside a sub-view/modal) and makes its own
 * `refetch` a SILENT refresh (no blocking spinner, preserve existing data on failure) — this hook is transport-only.
 */
export function useAutoRefresh(
  refetch: () => void | Promise<unknown>,
  { intervalMs, enabled = true }: { intervalMs: number; enabled?: boolean },
): void {
  // Always call the latest closure without re-arming the timer effect when `refetch`'s identity changes.
  const refetchRef = useRef(refetch);
  useEffect(() => { refetchRef.current = refetch; }, [refetch]);
  // Single-flight guard shared across timer/focus/visibility triggers and across effect re-arms.
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const run = () => {
      if (cancelled || inFlightRef.current) return;                 // single-flight: skip overlapping triggers
      if (document.visibilityState !== "visible") return;           // never fetch while hidden
      inFlightRef.current = true;
      Promise.resolve()
        .then(() => refetchRef.current())
        .catch(() => { /* refetch owns its errors; never lock the mechanism on a rejection */ })
        .finally(() => { inFlightRef.current = false; });
    };

    const startInterval = () => { if (intervalId === undefined) intervalId = setInterval(run, intervalMs); };
    const stopInterval = () => { if (intervalId !== undefined) { clearInterval(intervalId); intervalId = undefined; } };

    const onFocus = () => run();
    const onVisibility = () => {
      if (document.visibilityState === "visible") { run(); startInterval(); }   // catch up + resume polling
      else stopInterval();                                                      // hidden → stop polling entirely
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    if (document.visibilityState === "visible") startInterval();                // only poll if currently visible

    return () => {
      cancelled = true;
      stopInterval();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs]);
}
