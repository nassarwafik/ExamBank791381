import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * useModalSurface — Phase 21E.2: turns a full-screen workspace (the structured exam builder overlay) into a modal dialog
 * surface WITHOUT moving it into the Dialog primitive (it is a page-sized editor, not a card):
 *   · on activation focus moves to the surface itself (it carries role="dialog" + its accessible name), unless focus is
 *     already inside; the opener is remembered and focused again when the surface closes (if it is still in the page);
 *   · Tab / Shift+Tab wrap inside the surface;
 *   · Escape calls `onEscape` — the caller's EXISTING exit path, so the unsaved-changes guard still decides.
 * The surface yields to anything layered above it: while another aria-modal dialog is open (a ConfirmDialog, a lazy
 * panel, the preview, a media dialog), or a menu / popover has already taken the key, this hook does nothing, so Escape
 * closes only the top layer and Tab stays in that layer's own trap. It never discards work by itself.
 */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function visible(el: HTMLElement): boolean {
  return el.isConnected && !el.closest("[aria-hidden='true'], [inert], [hidden]");
}
/** Another modal layer (outside this surface's own element) is open above it. */
export function hasModalAbove(surface: HTMLElement): boolean {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]'))) {
    if (el === surface || !visible(el)) continue;
    if (el.contains(surface)) continue;                           // an ancestor is not "above"
    return true;
  }
  return false;
}

export default function useModalSurface(ref: RefObject<HTMLElement | null>, active: boolean, onEscape: () => void) {
  const escapeRef = useRef(onEscape);
  useLayoutEffect(() => { escapeRef.current = onEscape; });

  // Focus in on activation; focus back to the opener on deactivation / unmount.
  useLayoutEffect(() => {
    if (!active) return;
    const surface = ref.current;
    if (!surface) return;
    const opener = document.activeElement instanceof HTMLElement && !surface.contains(document.activeElement) ? document.activeElement : null;
    if (!surface.contains(document.activeElement)) { try { surface.focus({ preventScroll: true }); } catch { surface.focus(); } }
    return () => { if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus(); };
  }, [ref, active]);

  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      const surface = ref.current;
      if (!surface || event.defaultPrevented || hasModalAbove(surface)) return;
      if (event.key === "Escape") {
        if (event.isComposing) return;                                // an IME composition owns Escape
        event.preventDefault();
        escapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      // A popover opened from the surface (ActionMenu, portalled to <body>) belongs to it: its own keyboard model applies.
      if (document.activeElement instanceof HTMLElement && document.activeElement.closest(".eb-menu-panel")) return;
      const items = Array.from(surface.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible);
      if (!items.length) { event.preventDefault(); surface.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      const current = document.activeElement;
      const inside = !!current && surface.contains(current);
      if (event.shiftKey && (!inside || current === first || current === surface)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (!inside || current === last)) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [ref, active]);
}
