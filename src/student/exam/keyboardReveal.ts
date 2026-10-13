/**
 * Phase 21E.3 RF1 — keyboard-only focus reveal for the running exam (S-8 / WCAG 2.4.11).
 *
 * A control reached with the KEYBOARD (Tab, Shift+Tab, arrow / Home / End / Page keys) that lands partly under the sticky top bar
 * or the bottom navigation is scrolled clear of both bars. Nothing else ever scrolls:
 *  - focus that comes from a mouse press or a touch (pointerdown / mousedown / touchstart before the focus) never scrolls. A
 *    scroll between press and release would move the content under a stationary pointer: a hotspot point or a 3D part would be
 *    recorded where the student did NOT press, a button or a chart bar would lose its click, a textarea press would turn into a
 *    selection. So the rule is absolute: no reveal while any pointer is down, and no reveal for pointer-caused focus;
 *  - programmatic focus (a heading after navigation, a recovered question) is not keyboard navigation and is positioned by
 *    its own caller;
 *  - one key press reveals at most one focus change, measured one frame later (after the browser's own focus scrolling), and
 *    only if that element still has focus and no pointer went down meanwhile.
 * The scroll is the smallest one that clears both bars (an element taller than the space between them is aligned to the top).
 * Review fix 2: the scroll is always instant (a smooth scroll kept moving the page under a press that followed a Tab within
 * ~100 ms), and nothing is revealed inside a fixed-position layer (a full-screen editor covers the bars; scrolling the page
 * beneath it cannot reveal anything).
 */
export const NAV_KEYS: ReadonlySet<string> = new Set(["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"]);
/** A key press older than this no longer explains a focus change. */
export const KEY_INTENT_MS = 1000;
/** Clearance kept between a revealed control and either bar (CSS px). */
export const REVEAL_GAP = 8;

/** The vertical scroll (CSS px, positive = down) that brings [top, bottom] between `topLimit` and `bottomLimit` with `gap`. */
export function revealDelta(top: number, bottom: number, topLimit: number, bottomLimit: number, gap = REVEAL_GAP): number {
  const lo = topLimit + gap, hi = bottomLimit - gap;
  if (bottom - top >= hi - lo) return top - lo;                              // taller than the space: show its start
  if (top < lo) return top - lo;
  if (bottom > hi) return bottom - hi;
  return 0;
}

export type KeyboardRevealOptions = {
  doc: Document;
  win: Window;
  /** Only focus inside an element matching this selector is revealed. */
  within: string;
  topBar: string;
  bottomBar: string;
};

/** Installs the listeners; returns the cleanup. */
export function installKeyboardReveal(o: KeyboardRevealOptions): () => void {
  const now = () => (o.win.performance ? o.win.performance.now() : Date.now());
  let keyAt = -1, pointerAt = -1, pointerDown = false, frame = 0;
  const onKey = (e: KeyboardEvent) => { if (NAV_KEYS.has(e.key)) keyAt = now(); };
  const onPointerDown = () => { pointerAt = now(); pointerDown = true; cancel(); };
  const onPointerUp = () => { pointerDown = false; };
  const cancel = () => { if (frame) { o.win.cancelAnimationFrame(frame); frame = 0; } };
  const onFocusIn = (e: FocusEvent) => {
    const target = e.target as HTMLElement | null;
    const el = target && typeof target.closest === "function" && typeof target.getBoundingClientRect === "function" ? target : null;
    const t = now(), intent = keyAt;
    keyAt = -1;                                                         // one key press explains at most one focus change
    if (!el || pointerDown || intent < 0 || intent <= pointerAt || t - intent > KEY_INTENT_MS) return;
    const host = el.closest(o.within);
    if (!host) return;
    for (let n: Element | null = el; n && n !== host; n = n.parentElement) if (o.win.getComputedStyle?.(n).position === "fixed") return;
    cancel();
    frame = o.win.requestAnimationFrame(() => {
      frame = 0;
      if (pointerDown || pointerAt > intent || o.doc.activeElement !== el) return;
      const r = el.getBoundingClientRect();
      const bar = o.doc.querySelector(o.topBar)?.getBoundingClientRect();
      const nav = o.doc.querySelector(o.bottomBar)?.getBoundingClientRect();
      const d = revealDelta(r.top, r.bottom, bar ? Math.max(0, bar.bottom) : 0, nav ? Math.min(o.win.innerHeight, nav.top) : o.win.innerHeight);
      if (Math.abs(d) >= 1) o.win.scrollBy({ top: d, left: 0, behavior: "auto" });
    });
  };
  const opts = { capture: true } as const;
  // pointerdown covers mouse, pen and touch; mousedown / touchstart are kept for engines or tests without pointer events.
  const DOWN = ["pointerdown", "mousedown", "touchstart"] as const, UP = ["pointerup", "pointercancel", "mouseup", "touchend", "touchcancel", "dragend"] as const;
  o.doc.addEventListener("keydown", onKey, opts);
  for (const t of DOWN) o.doc.addEventListener(t, onPointerDown, opts);
  for (const t of UP) o.doc.addEventListener(t, onPointerUp, opts);
  o.win.addEventListener("blur", onPointerUp);
  o.doc.addEventListener("focusin", onFocusIn);
  return () => {
    cancel();
    o.doc.removeEventListener("keydown", onKey, opts);
    for (const t of DOWN) o.doc.removeEventListener(t, onPointerDown, opts);
    for (const t of UP) o.doc.removeEventListener(t, onPointerUp, opts);
    o.win.removeEventListener("blur", onPointerUp);
    o.doc.removeEventListener("focusin", onFocusIn);
  };
}
