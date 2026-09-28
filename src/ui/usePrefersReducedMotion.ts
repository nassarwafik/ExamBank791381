import { useSyncExternalStore } from "react";
import { effectiveMotionOverride, subscribeMotionOverride } from "./motionPreference";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const unsubscribeOverride = subscribeMotionOverride(onChange);
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return unsubscribeOverride;
  const mql = window.matchMedia(QUERY);
  if (!mql || typeof mql.addEventListener !== "function") return unsubscribeOverride;
  mql.addEventListener("change", onChange);
  return () => { mql.removeEventListener("change", onChange); unsubscribeOverride(); };
}

function osPrefersReduced(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  const mql = window.matchMedia(QUERY);
  return !!(mql && mql.matches);
}

function snapshot(): boolean {
  // Phase 12A — an explicit device-level choice (see motionPreference.ts) wins over the OS hint in EITHER direction;
  // without one the OS hint decides exactly as before.
  const override = effectiveMotionOverride();
  if (override === "on") return false;
  if (override === "off") return true;
  return osPrefersReduced();
}

/** True when motion should be reduced: the viewer's explicit choice if any, otherwise the OS hint. Safe in environments
 *  without matchMedia (false). */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
