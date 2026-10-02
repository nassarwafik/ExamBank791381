import { useEffect, useRef, useState } from "react";
import { CODING_POLL_WINDOW_MS, codingPollDelayMs } from "./codingGradingStatus";

// Phase 17E-C — the REFRESH MECHANISM of the result screen while official coding grading is open. Ownership:
//   API response = authority · this hook = when to re-read · StudentExamPage = how to adopt + present.
// One polling chain per (enabled, key) — the key is the completed attempt's identity (attemptNumber + submittedAt), so a
// different attempt starts a fresh chain and an old one is torn down. Never overlapping (the next read is scheduled only after the
// previous one settled), backing off (3 → 5 → 10 s), paused while the tab is hidden, restarted on return / reconnect, aborted on
// unmount or when disabled, and bounded by a foreground window (5 min) after which the page says "come back later" — the
// window ending is NOT a grading timeout. `refresh` reads only; its outcome "failed" means the REFRESH failed (network / server),
// never that grading failed. No browser timer is ever a source of grading state.
export type PollOutcome = "ok" | "failed" | "skipped";
export type CodingGradingPoll = { windowEnded: boolean; refreshFailed: boolean };

const isHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

export function useCodingGradingPoll(enabled: boolean, key: string, refresh: (signal: AbortSignal) => Promise<PollOutcome>): CodingGradingPoll {
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  // Flags are tagged with the chain's key, so a new attempt / a re-enabled chain never shows a previous chain's flags (and the
  // effect never has to reset state synchronously).
  const [flags, setFlags] = useState({ key: "", windowEnded: false, refreshFailed: false });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false, timer: ReturnType<typeof setTimeout> | null = null, ctrl: AbortController | null = null, windowStart = Date.now(), failed = false;
    const publish = (windowEnded: boolean) => setFlags({ key, windowEnded, refreshFailed: failed });
    const schedule = () => {
      if (cancelled || timer || ctrl || isHidden()) return;
      const elapsed = Date.now() - windowStart;
      if (elapsed >= CODING_POLL_WINDOW_MS) { publish(true); return; }
      timer = setTimeout(() => { timer = null; void tick(); }, codingPollDelayMs(elapsed));
    };
    const tick = async () => {
      if (cancelled || ctrl || isHidden()) return;
      const mine = new AbortController();
      ctrl = mine;
      let outcome: PollOutcome;
      try { outcome = await refreshRef.current(mine.signal); } catch { outcome = "failed"; }
      if (ctrl === mine) ctrl = null;
      if (cancelled) return;
      if (outcome !== "skipped" && failed !== (outcome === "failed")) { failed = outcome === "failed"; publish(false); }
      schedule();
    };
    const restart = () => {                                   // back on the page / back online: a new foreground window
      if (cancelled || isHidden()) return;
      if (Date.now() - windowStart >= CODING_POLL_WINDOW_MS) publish(false);
      windowStart = Date.now();
      schedule();
    };
    const onVisibility = () => {
      if (isHidden()) { if (timer) { clearTimeout(timer); timer = null; } return; }
      restart();                                              // the page's own visibility resync refreshes immediately
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", restart);
    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      ctrl?.abort(); ctrl = null;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", restart);
    };
  }, [enabled, key]);
  const mine = enabled && flags.key === key;
  return { windowEnded: mine && flags.windowEnded, refreshFailed: mine && flags.refreshFailed };
}
