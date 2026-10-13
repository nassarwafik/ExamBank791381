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
 *
 * 21E.2 review K1:
 *   A-F1  focus lands inside the panel whatever global transitions exist (settleVisibility below).
 *   A-F2  a panel taller than the room on its side opens on the roomier side, capped to that side's room, and scrolls inside;
 *         its own scroll never closes it (only a page / ancestor scroll or a resize does).
 *   C-F6  inside an aria-modal surface (the builder overlay) the panel is portalled into that surface, not <body>
 *         (portalHost below), so assistive technology that hides everything outside an aria-modal dialog still sees it.
 */
type Placement = { top: number; right: number; maxHeight: number };

const MIN_PANEL = 120;   // px: below this a panel is barely usable, so it may overlap its trigger rather than shrink further

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// First frame: out of flow and invisible, at a harmless viewport corner, measurable, not interactive.
const MEASURING: CSSProperties = { position: "fixed", top: 0, right: 0, visibility: "hidden", pointerEvents: "none" };

// Focus without letting the browser scroll anything into view; older engines ignore the options object.
function focusWithoutScroll(el: HTMLElement) {
  try { el.focus({ preventScroll: true }); } catch { el.focus(); }
}

// A-F1 — the reveal (measuring frame `visibility:hidden` → revealed) also changes every control's INHERITED visibility, and a
// global `button { transition: .18s ease }` (App.css: transition-property all) turns that change into a transition. At its
// first instant the value is still `hidden`, so a focus() issued in the same task is silently ignored: focus stayed on the
// trigger and Tab walked past the open menu. Finish exactly those visibility transitions before focusing (every other
// transition keeps its course). getAnimations flushes the pending style change, so the transitions exist when it returns.
function settleVisibility(panel: HTMLElement) {
  if (typeof panel.getAnimations !== "function") return;
  for (const animation of panel.getAnimations({ subtree: true })) {
    if ((animation as Animation & { transitionProperty?: string }).transitionProperty !== "visibility") continue;
    try { animation.finish(); } catch { /* an animation that cannot finish keeps its course; the frame retry covers it */ }
  }
}

// C-F6 — where the panel is portalled. Inside an aria-modal surface it must stay in that surface's subtree (WebKit / VoiceOver
// may hide everything outside an aria-modal dialog); elsewhere it is <body>, as before. The panel is position:fixed in viewport
// coordinates, so a host whose own box (or an ancestor's) would become the containing block of fixed descendants keeps <body>.
function rebasesFixed(el: HTMLElement): boolean {
  const cs = getComputedStyle(el) as CSSStyleDeclaration & Record<string, string | undefined>;
  const set = (v: string | undefined) => !!v && v !== "none" && v !== "normal" && v !== "auto";
  return set(cs.transform) || set(cs.translate) || set(cs.rotate) || set(cs.scale) || set(cs.perspective) || set(cs.filter) || set(cs.backdropFilter)
    || /paint|layout|strict|content/.test(cs.contain || "") || /transform|translate|rotate|scale|perspective|filter/.test(cs.willChange || "")
    || (!!cs.containerType && cs.containerType !== "normal") || (!!cs.contentVisibility && cs.contentVisibility !== "visible");
}
function portalHost(trigger: HTMLElement | null): HTMLElement {
  const modal = trigger?.closest<HTMLElement>('[aria-modal="true"]');
  if (!modal) return document.body;
  for (let el: HTMLElement | null = modal; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    if (rebasesFixed(el)) return document.body;
  }
  return modal;
}

export default function ActionMenu({ label, children, icon, text, className, disabled }: { label: string; children: ReactNode; icon?: ReactNode; text?: string; className?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);   // null = measuring (hidden) frame
  const [host, setHost] = useState<HTMLElement | null>(null);           // C-F6: resolved when the menu opens
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
    // A-F2 — below when the panel fits there, else above when it fits there, else on the side with more room. A panel that
    // fits its side keeps the viewport cap (it is shorter than its room anyway); one that does not is capped to the room of
    // the side it opens on and scrolls inside (overflow:auto), so no item is ever off-screen (640 × 450 = 200 % zoom).
    const roomBelow = vh - t.bottom - gap * 2, roomAbove = t.top - gap * 2;
    const below = p.height <= roomBelow || (p.height > roomAbove && roomBelow >= roomAbove);
    const room = below ? roomBelow : roomAbove;
    const cap = Math.max(MIN_PANEL, vh - gap * 2);
    const maxHeight = p.height <= room ? cap : Math.max(Math.min(MIN_PANEL, cap), room);
    const height = Math.min(p.height, maxHeight);
    const top = below ? Math.max(gap, Math.min(t.bottom + gap, vh - gap - height)) : Math.max(gap, t.top - gap - height);
    // Align the panel's inline-end (right edge in RTL) with the trigger, clamped inside the viewport.
    let right = Math.max(gap, vw - t.right);
    if (vw - right - p.width < gap) right = Math.max(gap, vw - p.width - gap);
    setPlacement({ top, right, maxHeight });
  }, [open, placement]);

  // Reveal + focus: only once the positioned frame is committed, and never with a scroll.
  useLayoutEffect(() => {
    if (!ready) return;
    const first = panelRef.current?.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])");
    const panel = panelRef.current;
    if (!first || !panel) return;
    settleVisibility(panel);                                             // A-F1: never focus a control that is still hidden
    focusWithoutScroll(first);
    if (document.activeElement === first || typeof requestAnimationFrame !== "function") return;
    // An engine without getAnimations: one retry a frame later (the transition is past its first instant), and only while
    // focus has not been moved anywhere else in the meantime.
    const retry = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (first.isConnected && (active === triggerRef.current || active === document.body || active === null)) focusWithoutScroll(first);
    });
    return () => cancelAnimationFrame(retry);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); return; }
      // 21E.2 — Tab leaves the menu as if the panel sat right after its trigger: the panel is portalled to the end of <body> (or
      // of its aria-modal surface), so the browser's own Tab order would leave the page / surface from its last item, menu open.
      // Tab → the control after the trigger (wrapping inside a modal scope); Shift+Tab → the trigger. The menu closes either way.
      if (e.key === "Tab") {
        const panel = panelRef.current, trigger = triggerRef.current;
        if (!panel || !trigger || !panel.contains(document.activeElement)) return;
        e.preventDefault(); e.stopPropagation();
        const modal = trigger.closest<HTMLElement>('[aria-modal="true"]');
        const order = Array.from((modal || document.body).querySelectorAll<HTMLElement>(TABBABLE)).filter(el => !panel.contains(el) && !el.closest("[hidden], [inert], [aria-hidden='true']"));
        const at = order.indexOf(trigger);
        const next = e.shiftKey ? trigger : order[at + 1] || (modal ? order[0] : trigger);
        close(false);
        focusWithoutScroll(next || trigger);
        return;
      }
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
    // A genuine scroll/resize AFTER opening still closes. The panel's OWN scroll (it scrolls inside when capped, and keyboard
    // focus brings an item into view) is not a layout change: it never closes the menu (A-F2).
    // RF4 (A-14 / B-05) — keyboard focus on an item goes back to the trigger, as for Escape, without a scroll (the page has just
    // moved): the item leaves the page with the panel, and focus fell to <body> (outside an aria-modal surface). Focus already
    // elsewhere stays there.
    function onLayout(e: Event) {
      if (e.type === "scroll" && e.target instanceof Node && panelRef.current?.contains(e.target)) return;
      const hadFocus = !!panelRef.current?.contains(document.activeElement);
      close(false);
      if (hadFocus && triggerRef.current) focusWithoutScroll(triggerRef.current);
    }
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
      <button ref={triggerRef} type="button" className={"eb-menu-trigger" + (text ? " has-text" : "") + (className ? " " + className : "")} aria-label={label} title={label} aria-expanded={open} aria-controls={open ? panelId : undefined} disabled={disabled} onClick={() => { if (open) { close(true); return; } setHost(portalHost(triggerRef.current)); setOpen(true); }}>
        {icon ?? <IconMore size={16} />}{text && <span>{text}</span>}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div ref={panelRef} id={panelId} className="eb-menu-panel" role="group" aria-label={label} style={style} dir="rtl" data-ready={ready ? "true" : undefined} onClick={onPanelClick}>
          {children}
        </div>,
        host ?? document.body
      )}
    </>
  );
}
