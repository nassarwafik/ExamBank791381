import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import useFocusTrap from "./useFocusTrap";

/**
 * Full-screen view of one region of a page, the way the learning Reader's «وضع العرض» works: the region itself becomes an
 * app-level overlay (the caller styles it `position: fixed; inset: 0` while `active`), so it works everywhere; native
 * browser fullscreen is requested BEST-EFFORT on entry and released on exit, never required — a refusal (unsupported,
 * iframe policy) leaves the overlay exactly as usable.
 *
 * While active: the page behind does not scroll, Tab stays inside the region, Escape leaves, and when the browser leaves
 * its own fullscreen (its Escape / UI) the overlay closes too, so one gesture never leaves a half state.
 */
export function useFullscreenOverlay(ref: RefObject<HTMLElement | null>): { active: boolean; toggle: () => void; exit: () => void } {
  const [active, setActive] = useState(false);
  const nativeRef = useRef(false);        // true while THIS overlay owns a native fullscreen session

  const enter = useCallback(() => {
    setActive(true);
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) return;                                   // someone else's session: leave it alone
    const el = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> | void };
    if (typeof el.requestFullscreen !== "function") return;
    try {
      const p = el.requestFullscreen();
      if (p && typeof (p as Promise<void>).then === "function") (p as Promise<void>).then(() => { nativeRef.current = true; }, () => { nativeRef.current = false; });
    } catch { nativeRef.current = false; }
  }, []);
  const exit = useCallback(() => {
    setActive(false);
    if (typeof document === "undefined" || !nativeRef.current) return;
    nativeRef.current = false;
    const doc = document as Document & { exitFullscreen?: () => Promise<void> | void };
    if (document.fullscreenElement && typeof doc.exitFullscreen === "function") {
      try { const p = doc.exitFullscreen(); if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => {}); } catch { /* best effort */ }
    }
  }, []);
  const toggle = useCallback(() => { if (active) exit(); else enter(); }, [active, enter, exit]);

  useEffect(() => {
    if (!active) return;
    const onChange = () => { if (!document.fullscreenElement && nativeRef.current) { nativeRef.current = false; setActive(false); } };
    document.addEventListener("fullscreenchange", onChange);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("fullscreenchange", onChange); document.body.style.overflow = prev; };
  }, [active]);
  // Leaving the page while full screen (the view unmounts) releases a native session this overlay owns.
  useEffect(() => () => {
    if (!nativeRef.current || typeof document === "undefined") return;
    nativeRef.current = false;
    const doc = document as Document & { exitFullscreen?: () => Promise<void> | void };
    if (document.fullscreenElement && typeof doc.exitFullscreen === "function") { try { const p = doc.exitFullscreen(); if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => {}); } catch { /* best effort */ } }
  }, []);
  // A dialog opened from inside the region owns Escape while it is open.
  const onEscape = useCallback(() => {
    if ([...document.querySelectorAll('[aria-modal="true"]')].some(el => el !== ref.current)) return;
    exit();
  }, [ref, exit]);
  useFocusTrap(ref, active, onEscape, { restoreFocus: false });

  return { active, toggle, exit };
}
