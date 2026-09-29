import { useSyncExternalStore } from "react";

/** True when the media query matches. Safe where matchMedia is missing (false) — same conventions as usePrefersReducedMotion. */
export function useMediaQuery(query: string): boolean {
  const subscribe = (onChange: () => void) => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
    const mql = window.matchMedia(query);
    if (!mql || typeof mql.addEventListener !== "function") return () => {};
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  };
  const snapshot = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? !!window.matchMedia(query)?.matches : false);
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
