/**
 * Phase 21E.3 review fix 3 — whether a pointer or a finger is down anywhere in the document, and a bounded wait for its release.
 *
 * A recovery card that loads its part while the student is pressing something else (an option, a hotspot point, a drag) must not
 * change the layout or move focus before that press ends: the content would move under the finger or the pointer between press
 * and release, and a different option or point would be recorded (the input reviewer measured both on touch and mouse). The card
 * therefore waits for the release, and a press outside the card since «إعادة المحاولة» means the student moved on.
 *
 * Listeners are installed once, when a recovery card first appears (no side effect at import); they are passive and
 * capture-phase. A native drag (a label chip dragged onto a zone) is a press too: Chromium cancels the pointer at `dragstart` and
 * sends no release until the drop (recovery reviewer RR3-1). A release whose target was removed is not seen by the document; a
 * pointer that later moves with no button down, or a finger lifted elsewhere, ends that stale press.
 */
let installed = false, pointer = false, touch = false, drag = false;
let lastDown: { t: number; target: EventTarget | null } = { t: -1, target: null };
let guardUntil = -1, swallowing = false;
const waiters = new Set<() => void>();
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Starts tracking presses (idempotent; nothing outside a browser). */
export function trackPointer(): void {
  if (installed || typeof document === "undefined" || typeof window === "undefined") return;
  installed = true;
  const opts = { capture: true, passive: true } as const;
  const changed = () => { for (const w of [...waiters]) w(); };
  const down = (e: Event) => { lastDown = { t: now(), target: e.target }; };
  for (const t of ["pointerdown", "mousedown"]) document.addEventListener(t, e => { pointer = true; down(e); }, opts);
  document.addEventListener("touchstart", e => { touch = true; down(e); }, opts);
  for (const t of ["pointerup", "pointercancel", "mouseup"]) document.addEventListener(t, e => {
    pointer = false;
    if (t === "pointerup" && (e as PointerEvent).pointerType === "touch") touch = false;      // a finger lifted (its touchend may be lost)
    changed();
  }, opts);
  // A touch scroll cancels the pointer but the finger is still on the screen: only the last touchend releases it.
  for (const t of ["touchend", "touchcancel"]) document.addEventListener(t, e => { if (!(e as TouchEvent).touches?.length) touch = false; changed(); }, opts);
  document.addEventListener("dragstart", () => { drag = true; }, opts);
  for (const t of ["drop", "dragend"]) document.addEventListener(t, () => { drag = false; changed(); }, opts);
  document.addEventListener("pointermove", e => { if ((e as PointerEvent).buttons === 0 && (pointer || drag)) { pointer = false; drag = false; changed(); } }, opts);
  window.addEventListener("blur", () => { pointer = false; touch = false; drag = false; changed(); });
  // `guardPresses`: registered after the tracking above, so the press is still tracked; stopped before the page sees it.
  const stop = (e: Event) => { e.preventDefault(); e.stopPropagation(); }, guard = { capture: true } as const;
  document.addEventListener("pointerdown", e => { swallowing = now() < guardUntil; if (swallowing) stop(e); }, guard);
  for (const t of ["mousedown", "pointerup", "mouseup"]) document.addEventListener(t, e => { if (swallowing) stop(e); }, guard);
  document.addEventListener("dragstart", e => { if (swallowing) { stop(e); drag = false; } }, guard);   // a cancelled drag never starts
  document.addEventListener("click", e => { if (swallowing && (e as MouseEvent).detail !== 0) { swallowing = false; stop(e); } }, guard);
}

/** The layout just changed in view: a part recovered in place, or the page was brought to the focused line (input reviewer
 *  RR3-IN-4). For `ms`, a press that STARTS was aimed at the old layout — no one sees a change and re-aims that fast — so it
 *  does nothing: its pointerdown, pointerup, click and drag never reach the page. A lost press, never a different answer. A
 *  keyboard activation (click `detail` 0) is never stopped, and a press that started earlier was already waited for. */
export function guardPresses(ms: number): void {
  trackPointer();
  guardUntil = Math.max(guardUntil, now() + ms);
}

export const pointerIsDown = (): boolean => pointer || touch || drag;

/** The last press (time from performance.now(), target), or t = -1. */
export const lastPointerDown = (): { t: number; target: EventTarget | null } => lastDown;

/** Resolves once no pointer or finger is down and the release has had `settleMs` to finish (its click / activation runs on the
 *  layout it was pressed on). Never waits longer than `capMs` in total: a safety net for a release the page never saw (any later
 *  press and release also ends the wait). It is long because a real press can be long — a drag in the physics lab or around a 3D
 *  model — and the layout must not change under it. */
export async function pointerReleased(capMs = 60_000, settleMs = 60): Promise<void> {
  const end = now() + capMs;
  for (;;) {
    if (!pointerIsDown()) {
      await new Promise(r => setTimeout(r, settleMs));
      if (!pointerIsDown()) return;
    }
    const left = end - now();
    if (left <= 0) return;
    await new Promise<void>(resolve => {
      const t = setTimeout(done, left);
      function done() { clearTimeout(t); waiters.delete(done); resolve(); }
      waiters.add(done);
    });
  }
}
