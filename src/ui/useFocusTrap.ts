import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => !el.hasAttribute("aria-hidden"));
}

// While `active`: moves focus into the container, keeps Tab / Shift+Tab inside it, calls onEscape on Escape, and
// restores focus to the previously focused element when deactivated. Used by the shell navigation drawer.
export default function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, onEscape?: () => void) {
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = focusables(root)[0];
    if (first) first.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onEscape?.(); return; }
      if (event.key !== "Tab" || !root) return;
      const items = focusables(root);
      if (!items.length) { event.preventDefault(); return; }
      const firstItem = items[0], lastItem = items[items.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === firstItem || !root.contains(current))) { event.preventDefault(); lastItem.focus(); }
      else if (!event.shiftKey && (current === lastItem || !root.contains(current))) { event.preventDefault(); firstItem.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [ref, active, onEscape]);
}
