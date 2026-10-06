import { useEffect, useState } from "react";

// Phase 20E — prefers-reduced-motion as a live value (read once synchronously so the first render never autoplays, then kept in sync).
const QUERY = "(prefers-reduced-motion: reduce)";
export function prefersReducedMotionNow(): boolean {
  try { return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches; } catch { return false; }
}
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotionNow);
  useEffect(() => {
    let mq: MediaQueryList | undefined;
    try { mq = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : undefined; } catch { mq = undefined; }
    if (!mq || typeof mq.addEventListener !== "function") return;
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq?.removeEventListener("change", on);
  }, []);
  return reduced;
}
