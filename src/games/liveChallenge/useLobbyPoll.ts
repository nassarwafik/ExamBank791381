import { useEffect, useRef } from "react";

/**
 * Near-real-time lobby polling for Phase 4A (short-polling HTTP — no WebSocket/SignalR/Web PubSub; the session model
 * is transport-agnostic so a later phase can swap the transport without touching it). While `active`, it calls `fn`
 * every `intervalMs` (and once immediately), and:
 *   • never overlaps requests (a tick is skipped while one is in flight),
 *   • never updates after unmount or after `active`/deps change — `fn(isCurrent)` receives an `isCurrent()` guard and
 *     must drop its result when it returns false (this also prevents a slow, stale response from overwriting a newer
 *     state),
 *   • stops cleanly on unmount, on `active` going false (leaving the lobby / session closed), and never causes a
 *     full-page reload or navigation.
 * `fn` is held in a ref so its identity changing never restarts the interval; only `active`/`intervalMs` do.
 */
export function useLobbyPoll(active: boolean, intervalMs: number, fn: (isCurrent: () => boolean) => Promise<void>) {
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });   // keep the latest callback without restarting the interval
  useEffect(() => {
    if (!active) return;
    let cancelled = false;                     // per-effect flag: cleanup flips it so in-flight results are dropped
    const isCurrent = () => !cancelled;
    let inFlight = false;
    const tick = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try { await fnRef.current(isCurrent); } catch { /* a failed poll never throws to the UI; the next tick retries */ }
      finally { inFlight = false; }
    };
    void tick();
    const timer = setInterval(tick, intervalMs);
    return () => { cancelled = true; clearInterval(timer); };
  }, [active, intervalMs]);
}
