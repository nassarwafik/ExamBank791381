import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconMore } from "../icons";

/**
 * ActionMenu — a labelled disclosure ("⋯") holding ordinary buttons / checkboxes. Deliberately NOT an
 * ARIA menu widget (no full menu keyboard model is implemented): it is a popover of normal controls.
 * Contract: labelled trigger with aria-expanded/controls · Escape closes · outside click closes ·
 * focus returns to the trigger · the panel is portalled with fixed positioning, so it never clips
 * inside an overflow container (tables, panes) and flips upward near the viewport bottom.
 * Activating a control inside runs the control's OWN handler first (bubble phase, same React dispatch), then
 * closes the menu and puts focus back on the trigger, so a dialog opened from the menu captures the trigger
 * as its opener and returns focus to it on close.
 *
 * Final-acceptance fix (PR #100): the close used to run from `onClickCapture`. In a real browser React flushes a
 * discrete-event state update in a microtask right after its ROOT capture listener returns — before the
 * native event reaches the item and bubbles back — so the portal unmounted mid-dispatch and the item's
 * onClick never ran (menu opened, every action was dead). happy-dom dispatches synchronously and could not
 * show it. Closing in the bubble phase keeps the item mounted until its handler has executed.
 *
 * Final-acceptance fix (global first click): the opening sequence used to be
 *   mount in document flow (empty style) → focus first control → measure → commit fixed coordinates.
 * The panel therefore existed for one frame at the END of the body, in normal flow, and focusing its first
 * control made the browser scroll the document to it (page jump); the scroll listener below then closed the
 * menu (second click looked inert, third click opened). The sequence is now
 *   mount ALREADY fixed + hidden + non-interactive → measure → commit final coordinates (same layout pass,
 *   before paint) → reveal → focus the first control with { preventScroll: true } → listeners armed.
 * The panel never participates in document flow, never paints unpositioned, and opening never scrolls.
 */
type Placement = { top: number; right: number; maxHeight: number };

// First frame: out of flow and invisible, at a harmless viewport corner, measurable, not interactive.
const MEASURING: CSSProperties = { position: "fixed", top: 0, right: 0, visibility: "hidden", pointerEvents: "none" };

// Focus without letting the browser scroll anything into view; older engines ignore the options object.
function focusWithoutScroll(el: HTMLElement) {
  try { el.focus({ preventScroll: true }); } catch { el.focus(); }
}

export default function ActionMenu({ label, children, icon, text, className, disabled }: { label: string; children: ReactNode; icon?: ReactNode; text?: string; className?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);   // null = measuring (hidden) frame
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const panelId = "eb-menu-" + reactId.replace(/[^a-zA-Z0-9_-]/g, "");
  const ready = open && placement !== null;

  function close(returnFocus: boolean) {
    setOpen(false);
    setPlacement(null);                                                  // the next open measures afresh: no stale coordinates
    if (returnFocus) triggerRef.current?.focus();
  }

  // Measure on the hidden, already-fixed frame and commit the final coordinates in the same layout pass
  // (a layout-effect state update re-renders synchronously before the browser paints).
  useLayoutEffect(() => {
    if (!open || placement !== null) return;
    const trigger = triggerRef.current, panel = panelRef.current;
    if (!trigger || !panel) return;
    const t = trigger.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const vw = window.innerWidth || 1024, vh = window.innerHeight || 768;
    const gap = 4;
    const below = t.bottom + gap + p.height <= vh || t.top - gap - p.height < 0;
    const top = below ? t.bottom + gap : Math.max(gap, t.top - gap - p.height);
    // Align the panel's inline-end (right edge in RTL) with the trigger, clamped inside the viewport.
    let right = Math.max(gap, vw - t.right);
    if (vw - right - p.width < gap) right = Math.max(gap, vw - p.width - gap);
    setPlacement({ top, right, maxHeight: Math.max(120, vh - gap * 2) });
  }, [open, placement]);

  // Reveal + focus: only once the positioned frame is committed, and never with a scroll.
  useLayoutEffect(() => {
    if (!ready) return;
    const first = panelRef.current?.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])");
    if (first) focusWithoutScroll(first);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const panel = panelRef.current; if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])"));
      if (!items.length) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
    }
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    }
    function onLayout() { close(false); }                                // a genuine scroll/resize AFTER opening still closes
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [ready]);

  // Bubble phase: the activated control's own onClick / onChange has already run (deeper in the same
  // dispatch) by the time this fires; then the menu closes and focus returns to the trigger. A click that
  // lands on a <label> is NOT a close: the browser follows it with the label's activation click on its
  // input, and that input click is the one that toggles the checkbox and closes the menu — closing on the
  // label click would unmount the input before its activation click, losing the toggle.
  function onPanelClick(e: React.MouseEvent) {
    const el = e.target as HTMLElement;
    if (el.closest("button, input")) close(true);
  }

  const style: CSSProperties = placement ? { position: "fixed", top: placement.top, right: placement.right, maxHeight: placement.maxHeight } : MEASURING;
  return (
    <>
      <button ref={triggerRef} type="button" className={"eb-menu-trigger" + (text ? " has-text" : "") + (className ? " " + className : "")} aria-label={label} title={label} aria-expanded={open} aria-controls={open ? panelId : undefined} disabled={disabled} onClick={() => (open ? close(true) : setOpen(true))}>
        {icon ?? <IconMore size={16} />}{text && <span>{text}</span>}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div ref={panelRef} id={panelId} className="eb-menu-panel" role="group" aria-label={label} style={style} dir="rtl" data-ready={ready ? "true" : undefined} onClick={onPanelClick}>
          {children}
        </div>,
        document.body
      )}
    </>
  );
}
