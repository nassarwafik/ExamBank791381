// Phase 21E.3 — the running exam's ONE polite announcer, kept outside React (announcing never re-renders the page).
//
// The live region stays mounted and empty in React; each message REPLACES its child node, so assistive technology announces it
// even when the same words come twice.
//  - Review fix 1: nothing is written into a region that has only just been inserted (ANNOUNCER_SETTLE_MS), and a message is
//    cleared again after ANNOUNCEMENT_CLEAR_MS (no stale text in browse mode).
//  - Review fix 2: messages are queued. Each one stays at least ANNOUNCEMENT_GAP_MS before the next replaces it, so two messages
//    of the same moment (a timer threshold and a recovery card) are both written. onDelivered runs when a message is written;
//    a message still queued when the region goes away is dropped with onDropped instead (a timer notice is then said later).
import { ANNOUNCER_SETTLE_MS, ANNOUNCEMENT_CLEAR_MS, ANNOUNCEMENT_GAP_MS } from "./examAnnouncements";

export type AnnouncerClock = { now: () => number; setTimeout: (run: () => void, ms: number) => unknown };
export type ExamAnnouncer = {
  /** The live region's ref callback: the element, or null when it leaves the page. */
  attach: (el: HTMLElement | null) => void;
  /** Queues a message; false when there is no region (nothing queued, nothing recorded). */
  announce: (text: string, onDelivered?: () => void, onDropped?: () => void) => boolean;
};
type Message = { text: string; onDelivered?: () => void; onDropped?: () => void };

const browserClock: AnnouncerClock = { now: () => performance.now(), setTimeout: (run, ms) => window.setTimeout(run, ms) };

export function createExamAnnouncer(clock: AnnouncerClock = browserClock): ExamAnnouncer {
  let node: HTMLElement | null = null, readyAt = 0, last = -Infinity, waiting = false, queue: Message[] = [];
  const pump = () => {
    waiting = false;
    if (!node || !queue.length) return;
    const t = clock.now(), wait = Math.max(readyAt - t, last + ANNOUNCEMENT_GAP_MS - t);
    if (wait > 0) { waiting = true; clock.setTimeout(pump, wait); return; }
    const next = queue.shift() as Message, el = node, span = document.createElement("span");
    span.textContent = next.text;
    el.replaceChildren(span);
    last = t;
    next.onDelivered?.();
    clock.setTimeout(() => { if (el.firstChild === span) el.replaceChildren(); }, ANNOUNCEMENT_CLEAR_MS);
    if (queue.length) { waiting = true; clock.setTimeout(pump, ANNOUNCEMENT_GAP_MS); }
  };
  return {
    attach(el) {
      node = el;
      readyAt = el ? clock.now() + ANNOUNCER_SETTLE_MS : 0;
      if (!el) { const dropped = queue; queue = []; dropped.forEach(m => m.onDropped?.()); }
    },
    announce(text, onDelivered, onDropped) {
      if (!node) return false;
      queue.push({ text, onDelivered, onDropped });
      if (!waiting) pump();
      return true;
    },
  };
}
