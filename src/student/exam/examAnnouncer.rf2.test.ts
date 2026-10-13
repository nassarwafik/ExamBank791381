// @vitest-environment happy-dom
// Phase 21E.3 review fix 2 — the exam announcer (re-review RR-3, GOV-4): a message is never replaced in the moment it was written
// (two messages of the same moment are both written, each held ANNOUNCEMENT_GAP_MS), onDelivered runs only for a message actually
// written, and a message still queued when the region leaves the page is dropped with onDropped (never "delivered" unheard).
import { describe, it, expect, vi } from "vitest";
import { createExamAnnouncer } from "./examAnnouncer";
import { ANNOUNCER_SETTLE_MS, ANNOUNCEMENT_CLEAR_MS, ANNOUNCEMENT_GAP_MS } from "./examAnnouncements";

function fakeClock() {
  let t = 0; const timers: { at: number; run: () => void }[] = [];
  return {
    now: () => t,
    setTimeout: (run: () => void, ms: number) => { timers.push({ at: t + ms, run }); return timers.length; },
    advance(ms: number) {
      const end = t + ms;
      for (;;) { timers.sort((a, b) => a.at - b.at); const next = timers[0]; if (!next || next.at > end) break; timers.shift(); t = next.at; next.run(); }
      t = end;
    },
  };
}
const setup = () => {
  const clock = fakeClock(), a = createExamAnnouncer(clock), el = document.createElement("p"), writes: [number, string][] = [];
  new MutationObserver(() => { if (el.textContent) writes.push([clock.now(), el.textContent]); }).observe(el, { childList: true, subtree: true });
  return { clock, a, el, writes };
};
const flush = () => new Promise(r => setTimeout(r, 0));

describe("RF2 — exam announcer: settle, gap, clear, drop", () => {
  it("the gap is at least a second", () => { expect(ANNOUNCEMENT_GAP_MS).toBeGreaterThanOrEqual(1000); });
  it("two messages of the same moment are both written, the second only after the gap; each onDelivered runs at its own write", async () => {
    const { clock, a, el, writes } = setup();
    a.attach(el);
    const first = vi.fn(), second = vi.fn();
    expect(a.announce("الوقت", first)).toBe(true);
    expect(a.announce("البطاقة", second)).toBe(true);
    clock.advance(ANNOUNCER_SETTLE_MS - 1); await flush();
    expect(el.textContent).toBe("");                                                 // the region has not settled yet
    clock.advance(1); await flush();
    expect(el.textContent).toBe("الوقت"); expect(first).toHaveBeenCalledTimes(1); expect(second).not.toHaveBeenCalled();
    clock.advance(ANNOUNCEMENT_GAP_MS - 1); await flush();
    expect(el.textContent).toBe("الوقت"); expect(second).not.toHaveBeenCalled();     // still held: never replaced in the same moment
    clock.advance(1); await flush();
    expect(el.textContent).toBe("البطاقة"); expect(second).toHaveBeenCalledTimes(1);
    expect(writes.map(w => w[1])).toEqual(["الوقت", "البطاقة"]);
    expect(writes[1][0] - writes[0][0]).toBeGreaterThanOrEqual(ANNOUNCEMENT_GAP_MS);
  });
  it("a message is cleared after ANNOUNCEMENT_CLEAR_MS; a later message is not cleared by an earlier timer", async () => {
    const { clock, a, el } = setup();
    a.attach(el); clock.advance(ANNOUNCER_SETTLE_MS);
    a.announce("أول"); await flush();
    expect(el.textContent).toBe("أول");
    clock.advance(ANNOUNCEMENT_CLEAR_MS); await flush();
    expect(el.textContent).toBe("");
    a.announce("ثانٍ"); clock.advance(ANNOUNCEMENT_GAP_MS); await flush();
    expect(el.textContent).toBe("ثانٍ");
  });
  it("leaving the page drops what is still queued: onDropped, never onDelivered; announcing without a region queues nothing", async () => {
    const { clock, a, el } = setup();
    a.attach(el);
    const delivered = vi.fn(), dropped = vi.fn();
    a.announce("الوقت", delivered, dropped);
    a.attach(null);                                                                 // the questions screen closed before the region settled
    clock.advance(ANNOUNCER_SETTLE_MS + ANNOUNCEMENT_GAP_MS); await flush();
    expect(delivered).not.toHaveBeenCalled(); expect(dropped).toHaveBeenCalledTimes(1);
    expect(el.textContent).toBe("");
    expect(a.announce("لا شيء", delivered)).toBe(false);
    const el2 = document.createElement("p");
    a.attach(el2); a.announce("من جديد", delivered); clock.advance(ANNOUNCER_SETTLE_MS); await flush();
    expect(el2.textContent).toBe("من جديد"); expect(delivered).toHaveBeenCalledTimes(1);
  });
});
