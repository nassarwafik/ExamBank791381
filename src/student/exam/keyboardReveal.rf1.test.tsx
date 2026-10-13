// @vitest-environment happy-dom
// Phase 21E.3 review fix 1 — the keyboard-only reveal (new module student/exam/keyboardReveal.ts): geometry and intent rules. The page-level
// fail-first cases are in src/StudentExamPage.rf1.test.tsx (RF1-P1/P2); the real mouse / touch proof is the Chromium harness (POINTER=1).
import { describe, it, expect, vi } from "vitest";
import { revealDelta, installKeyboardReveal } from "./keyboardReveal";

describe("keyboardReveal", () => {
  it("revealDelta: the smallest scroll clear of both bars; a tall element shows its start; a visible one does not move", () => {
    expect(revealDelta(772, 912, 64, 818)).toBe(912 - 810);
    expect(revealDelta(40, 100, 64, 818)).toBe(40 - 72);
    expect(revealDelta(300, 440, 64, 818)).toBe(0);
    expect(revealDelta(100, 1000, 64, 818)).toBe(100 - 72);
  });
  it("reveals only keyboard-caused focus; pointer focus, a held pointer and a stale key press never scroll", async () => {
    const scrollBy = vi.fn();
    const win = { performance, innerHeight: 900, scrollBy, requestAnimationFrame: (f: FrameRequestCallback) => setTimeout(() => f(0), 0) as unknown as number, cancelAnimationFrame: (h: number) => clearTimeout(h), addEventListener() {}, removeEventListener() {} } as unknown as Window;
    document.body.innerHTML = '<header class="iex-topbar"></header><div class="iex-page"><textarea></textarea></div><nav class="iex-bottom-nav"></nav>';
    const ta = document.querySelector("textarea") as HTMLTextAreaElement;
    ta.getBoundingClientRect = () => ({ top: 772, bottom: 912 }) as DOMRect;
    (document.querySelector(".iex-topbar") as HTMLElement).getBoundingClientRect = () => ({ top: 0, bottom: 64 }) as DOMRect;
    (document.querySelector(".iex-bottom-nav") as HTMLElement).getBoundingClientRect = () => ({ top: 818, bottom: 900 }) as DOMRect;
    const off = installKeyboardReveal({ doc: document, win, within: ".iex-page", topBar: ".iex-topbar", bottomBar: ".iex-bottom-nav", reducedMotion: () => true });
    const tick = () => new Promise(r => setTimeout(r, 5));
    document.dispatchEvent(new Event("pointerdown")); ta.focus(); await tick(); document.dispatchEvent(new Event("pointerup")); ta.blur();
    expect(scrollBy).not.toHaveBeenCalled();                                         // pointer focus
    document.dispatchEvent(new Event("pointerdown")); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" })); ta.focus(); await tick(); document.dispatchEvent(new Event("pointerup")); ta.blur();
    expect(scrollBy).not.toHaveBeenCalled();                                         // a pointer is down
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); ta.focus(); await tick(); ta.blur();
    expect(scrollBy).not.toHaveBeenCalled();                                         // not a navigation key (programmatic focus)
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" })); ta.focus(); await tick();
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenCalledWith({ top: 102, left: 0, behavior: "auto" });
    ta.blur(); ta.focus(); await tick();
    expect(scrollBy).toHaveBeenCalledTimes(1);                                       // one key press, one reveal
    off();
  });
  // Each guard must hold on its own (the focus-time check and the frame-time re-check are independent layers).
  const fresh = () => {
    const scrollBy = vi.fn(), clock = { t: 0 };
    const win = { performance: { now: () => clock.t }, innerHeight: 900, scrollBy, requestAnimationFrame: (f: FrameRequestCallback) => setTimeout(() => f(0), 0) as unknown as number, cancelAnimationFrame: (h: number) => clearTimeout(h), addEventListener() {}, removeEventListener() {} } as unknown as Window;
    document.body.innerHTML = '<header class="iex-topbar"></header><div class="iex-page"><textarea></textarea></div><nav class="iex-bottom-nav"></nav>';
    const ta = document.querySelector("textarea") as HTMLTextAreaElement;
    ta.getBoundingClientRect = () => ({ top: 772, bottom: 912 }) as DOMRect;
    (document.querySelector(".iex-topbar") as HTMLElement).getBoundingClientRect = () => ({ top: 0, bottom: 64 }) as DOMRect;
    (document.querySelector(".iex-bottom-nav") as HTMLElement).getBoundingClientRect = () => ({ top: 818, bottom: 900 }) as DOMRect;
    const off = installKeyboardReveal({ doc: document, win, within: ".iex-page", topBar: ".iex-topbar", bottomBar: ".iex-bottom-nav", reducedMotion: () => true });
    return { ta, scrollBy, clock, off, tick: () => new Promise(r => setTimeout(r, 5)) };
  };
  const tab = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
  it("focus-time guard: a programmatic focus with no key at all, or after a stale key press, never scrolls", async () => {
    const a = fresh();
    a.ta.focus(); await a.tick();
    expect(a.scrollBy).not.toHaveBeenCalled();                                       // no key, no pointer (programmatic)
    a.ta.blur(); a.clock.t = 100; tab(); a.clock.t = 1200; a.ta.focus(); await a.tick();
    expect(a.scrollBy).not.toHaveBeenCalled();                                       // the key press is older than KEY_INTENT_MS
    a.ta.blur(); a.clock.t = 1300; tab(); a.clock.t = 1310; a.ta.focus(); await a.tick();
    expect(a.scrollBy).toHaveBeenCalledTimes(1);                                     // control: a fresh Tab is revealed
    a.off();
  });
  it("focus-time guard: focus that happens while a pointer is down never scrolls, even if the pointer is released before the frame", async () => {
    const a = fresh();
    a.clock.t = 10; document.dispatchEvent(new Event("pointerdown"));
    a.clock.t = 20; tab(); a.ta.focus();
    a.clock.t = 30; document.dispatchEvent(new Event("pointerup"));                  // released before the reveal frame
    await a.tick();
    expect(a.scrollBy).not.toHaveBeenCalled();
    a.off();
  });
  it("frame-time re-check: an element that lost focus before the frame is not revealed", async () => {
    const a = fresh();
    a.clock.t = 10; tab(); a.ta.focus(); a.ta.blur();
    await a.tick();
    expect(a.scrollBy).not.toHaveBeenCalled();
    a.off();
  });
});
