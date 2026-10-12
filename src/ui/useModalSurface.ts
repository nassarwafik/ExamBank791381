import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { isTextEditingTarget } from "../examHistoryShortcuts";

/**
 * useModalSurface — Phase 21E.2: turns a full-screen workspace (the structured exam builder overlay) into a modal dialog
 * surface WITHOUT moving it into the Dialog primitive (it is a page-sized editor, not a card):
 *   · on activation focus moves to the surface itself (it carries role="dialog" + its accessible name), unless focus is
 *     already inside; the opener is remembered and focused again when the surface closes (if it is still in the page);
 *   · a layer that closes in the update that opens the surface (the import wizard) may hand focus back to ITS opener from a
 *     passive effect, after the surface took focus: once those effects ran, focus that sits outside is pulled back in (K2 A-F3);
 *   · when the opener is gone (it left the page in the update that opened the surface) or was <body>, focus goes to the caller's
 *     `returnFocus` target once the closing update has rendered it — never to <body> (K2 A-F3);
 *   · Tab / Shift+Tab wrap inside the surface;
 *   · Escape calls `onEscape` — the caller's EXISTING exit path, so the unsaved-changes guard still decides. Escape typed in a
 *     text-editing control (a search box, a text field, a select, a contenteditable) is that control's own: no exit and no
 *     preventDefault, so a search box still clears itself (K2 C-F1).
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

/** Surfaces whose hook is active now (StrictMode re-activates the same element right after a simulated cleanup). */
const ACTIVE = new WeakSet<HTMLElement>();
/** Focus is nowhere useful: on <body>, on nothing, or on a node that has left the page. */
function focusLost(): boolean {
  const a = document.activeElement;
  return !a || a === document.body || !a.isConnected;
}
function focusSurface(surface: HTMLElement) {
  try { surface.focus({ preventScroll: true }); } catch { surface.focus(); }
}

export default function useModalSurface(ref: RefObject<HTMLElement | null>, active: boolean, onEscape: () => void, returnFocus?: () => HTMLElement | null | undefined) {
  const escapeRef = useRef(onEscape);
  const returnRef = useRef(returnFocus);
  useLayoutEffect(() => { escapeRef.current = onEscape; returnRef.current = returnFocus; });

  // Focus in on activation; focus back to the opener on deactivation / unmount. <body> is not an opener.
  useLayoutEffect(() => {
    if (!active) return;
    const surface = ref.current;
    if (!surface) return;
    ACTIVE.add(surface);
    const current = document.activeElement;
    const opener = current instanceof HTMLElement && current !== document.body && !surface.contains(current) ? current : null;
    if (!surface.contains(document.activeElement)) focusSurface(surface);
    return () => {
      ACTIVE.delete(surface);
      if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus();
      if (opener && opener.isConnected && document.activeElement === opener) return;
      // No opener to go back to: the caller's stable control (often the one that reopens the surface, rendered by the very update
      // that closes it — hence after this commit), unless something else took focus meanwhile or the surface is active again
      // (StrictMode's simulated unmount / remount).
      const fallback = returnRef.current;
      if (!fallback) return;
      void Promise.resolve().then(() => {
        if (ACTIVE.has(surface)) return;
        const a = document.activeElement;
        if (!focusLost() && !(a && surface.contains(a))) return;
        const target = fallback();
        if (target && target.isConnected) target.focus();
      });
    };
  }, [ref, active]);

  // Settle (A-F3): passive effects run after the layout effect above, and every passive cleanup of the same commit runs before
  // this one — so a closing layer's focus trap has already "restored" focus to its own opener behind this aria-modal surface by
  // now. Pull it back in, unless a modal layer above it (a Dialog, a ConfirmDialog) holds it.
  useEffect(() => {
    if (!active) return;
    const surface = ref.current;
    const a = document.activeElement;
    if (!surface || (a && surface.contains(a)) || hasModalAbove(surface)) return;
    focusSurface(surface);
  }, [ref, active]);

  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      const surface = ref.current;
      if (!surface || event.defaultPrevented || hasModalAbove(surface)) return;
      if (event.key === "Escape") {
        if (event.isComposing) return;                                // an IME composition owns Escape
        if (isTextEditingTarget(event.target)) return;                // C-F1: the field's own Escape (a search box clears itself)
        event.preventDefault();
        escapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      // A popover opened from the surface (ActionMenu: portalled into the surface, or to <body> when the surface re-bases fixed
      // positioning) belongs to it: its own keyboard model applies.
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
