import { useCallback, useRef, type TouchEvent } from "react";

// Phase L.1 — page turning by a horizontal swipe on touch screens. RTL book direction: the next page lies to the LEFT
// (the same direction as the ArrowLeft key), so a finger moving to the RIGHT brings it in. A swipe never starts on
// something that owns its own touch gestures: a form control, a link or button, an interactive activity, or any element
// that scrolls horizontally (a wide table, a code block) between the touch point and the reading surface.

const MIN_DISTANCE = 64;            // px of horizontal travel
const MAX_DURATION = 700;           // ms — a slow drag is reading / selecting, not a page turn
const DOMINANCE = 2;                // the horizontal travel must be at least twice the vertical one
const OWN_GESTURES = 'input, textarea, select, button, summary, a[href], label, [contenteditable="true"], [role="slider"], [role="dialog"], [class*="learning-activity"], [class*="learning-cli"], [data-reader-noswipe]';

/** True when a touch on `target` must NOT turn the page (exported for tests). */
export function swipeBlocked(target: EventTarget | null, root: HTMLElement | null): boolean {
  if (!(target instanceof Element) || !root) return true;
  const owner = target.closest(OWN_GESTURES);
  if (owner && root.contains(owner)) return true;                 // never an ancestor of the surface (presentation is a dialog)
  for (let el: Element | null = target; el && el !== root; el = el.parentElement) {
    if (!(el instanceof HTMLElement)) continue;
    const overflowX = getComputedStyle(el).overflowX;
    if ((overflowX === "auto" || overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1) return true;
  }
  return false;
}

/** Touch handlers for the reading surface. `onNext` / `onPrevious` run at most once per gesture. */
export function useReaderSwipe(root: { current: HTMLElement | null }, onNext: () => void, onPrevious: () => void) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    start.current = e.touches.length === 1 && touch && !swipeBlocked(e.target, root.current) ? { x: touch.clientX, y: touch.clientY, t: Date.now() } : null;
  }, [root]);
  const onTouchEnd = useCallback((e: TouchEvent) => {
    const from = start.current;
    start.current = null;
    const touch = e.changedTouches[0];
    if (!from || !touch) return;
    const dx = touch.clientX - from.x, dy = touch.clientY - from.y;
    if (Date.now() - from.t > MAX_DURATION || Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < DOMINANCE * Math.abs(dy)) return;
    if (dx > 0) onNext(); else onPrevious();
  }, [onNext, onPrevious]);
  const onTouchCancel = useCallback(() => { start.current = null; }, []);
  return { onTouchStart, onTouchEnd, onTouchCancel };
}
