/**
 * Phase 21E.3 review fix 3 — whether a pointer or a finger is down anywhere in the document, and a bounded wait for its release.
 *
 * A recovery card that loads its part while the student is pressing something else (an option, a hotspot point, a drag) must not
 * change the layout or move focus before that press ends: the content would move under the finger or the pointer between press
 * and release, and a different option or point would be recorded (the input reviewer measured both on touch and mouse). The card
 * therefore waits for the release, and a press outside the card since «إعادة المحاولة» means the student moved on.
 *
 * Listeners are installed once, on the first retry (no side effect at import); they are passive and capture-phase.
 */
let installed = false, pointer = false, touch = false;
let lastDown: { t: number; target: EventTarget | null } = { t: -1, target: null };
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
  for (const t of ["pointerup", "pointercancel", "mouseup", "dragend"]) document.addEventListener(t, () => { pointer = false; changed(); }, opts);
  // A touch scroll cancels the pointer but the finger is still on the screen: only the last touchend releases it.
  for (const t of ["touchend", "touchcancel"]) document.addEventListener(t, e => { if (!(e as TouchEvent).touches?.length) touch = false; changed(); }, opts);
  window.addEventListener("blur", () => { pointer = false; touch = false; changed(); });
}

export const pointerIsDown = (): boolean => pointer || touch;

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
