// @vitest-environment happy-dom
// Phase 21E.3 review fix 3 — boundary regression tests for the read-only review of 75eaba2 (recovery reviewer). A file of its own:
// the press tracker is module state, and RF3-U13 needs it fresh (a press that starts before any retry).
//   RF3-U13 a press that started BEFORE the first retry (held on the retry button, then Enter) is waited for, and no reveal
//           follows a retry during which a pointer was down                                                   [RR3-3]  fail-first
//   RF3-U14 a native drag (dragstart, then the pointer is cancelled) holds the swap until the drop                [RR3-1]  fail-first
//   RF3-U15 a drag whose drop / dragend the page never saw ends at the next pointer move with no button down        [RR3-1]
//   RF3-U16 a question change while the swap waited for a release: nothing of the old retry reaches the new card    [RR3-4 X3]
//   RF3-U17 after a finger lifts, the swap waits a moment so the tap's click lands on the layout it was aimed at   [RR3-4 X4]
//   RF3-U18 the window losing focus ends a press (its release is never delivered)                                [RR3-4 X7]
//   RF3-U19 a page-level card: a keyboard retry reveals the heading (X2); a press after the swap delays the heading until the
//           release and cancels the reveal (X1)                                                                 [RR3-4]
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { Suspense, useRef, type ComponentType, type ReactElement } from "react";
import QuestionErrorBoundary from "./QuestionErrorBoundary";
import { QuestionRecoveryContext } from "./questionRecovery";
import { recoverableLazy } from "../../recoverableLazy";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const origin = window.location.origin;
const chunkError = (name: string) => new TypeError("Failed to fetch dynamically imported module: " + origin + "/assets/" + name + "-abcd1234.js");
const sleep = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const slowPart = (name: string, ms: number, content: () => ReactElement) => {
  let calls = 0;
  return recoverableLazy<object>(name, () => (++calls === 1 ? Promise.reject(chunkError(name)) : new Promise(r => setTimeout(() => r({ default: content }), ms))) as Promise<{ default: ComponentType<object> }>);
};
const farAbove = () => { HTMLElement.prototype.getBoundingClientRect = () => ({ top: -900, bottom: -880, left: 0, right: 100, width: 100, height: 20, x: 0, y: -900, toJSON() {} }) as DOMRect; };
const originalRect = HTMLElement.prototype.getBoundingClientRect, originalInto = HTMLElement.prototype.scrollIntoView;
afterEach(() => { HTMLElement.prototype.getBoundingClientRect = originalRect; HTMLElement.prototype.scrollIntoView = originalInto; });

describe("RF3-U13 — a press that started before the first retry", () => {
  it("held on «إعادة المحاولة», then Enter: the card stays until the release, and nothing is revealed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const into = vi.fn(); HTMLElement.prototype.scrollIntoView = into; farAbove();
    const Part = slowPart("UnitHeldBeforeRetry", 40, () => <p>البند المستعاد</p>);
    render(<QuestionErrorBoundary variant="part" resetKey="hb"><Suspense fallback={<i>…</i>}><Part /></Suspense></QuestionErrorBoundary>);
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" });
    retry.focus();
    fireEvent.pointerDown(retry); fireEvent.mouseDown(retry);                      // the mouse is held on the button…
    fireEvent.click(retry);                                                         // …while Enter activates it (detail 0)
    await sleep(250);
    expect(screen.getByTestId("question-recovery")).toBeTruthy();                   // the defect: replaced under the held button
    fireEvent.pointerUp(retry); fireEvent.mouseUp(retry);
    expect(await screen.findByText("البند المستعاد")).toBeTruthy();
    await sleep(50);
    expect(into).not.toHaveBeenCalled();                                            // a pointer was down during the retry: no reveal
  });
});

describe("RF3-U14/U15 — a native drag is a press", () => {
  it("dragstart, then the pointer is cancelled (Chromium): the card stays until the drop", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Part = slowPart("UnitDragHeld", 40, () => <p>بند بعد السحب</p>);
    render(<div><QuestionErrorBoundary variant="part" resetKey="dh"><Suspense fallback={<i>…</i>}><Part /></Suspense></QuestionErrorBoundary><span data-testid="chip" draggable>Router</span><div data-testid="zone">المنطقة 3</div></div>);
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" });
    retry.focus(); fireEvent.click(retry);
    const chip = screen.getByTestId("chip"), zone = screen.getByTestId("zone");
    fireEvent.pointerDown(chip); fireEvent.mouseDown(chip); fireEvent.dragStart(chip); fireEvent.pointerCancel(chip);
    await sleep(250);
    expect(screen.getByTestId("question-recovery")).toBeTruthy();                   // the defect: the zones moved under the drag
    fireEvent.drop(zone); fireEvent.dragEnd(chip);
    expect(await screen.findByText("بند بعد السحب")).toBeTruthy();
  });
  it("a drop the page never saw: the next pointer move with no button down ends the drag", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Part = slowPart("UnitDragLost", 40, () => <p>بند بعد سحب ضائع</p>);
    render(<div><QuestionErrorBoundary variant="part" resetKey="dl"><Suspense fallback={<i>…</i>}><Part /></Suspense></QuestionErrorBoundary><span data-testid="chip2" draggable>Switch</span></div>);
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" });
    retry.focus(); fireEvent.click(retry);
    const chip = screen.getByTestId("chip2");
    fireEvent.pointerDown(chip); fireEvent.dragStart(chip); fireEvent.pointerCancel(chip);
    await sleep(250);
    expect(screen.getByTestId("question-recovery")).toBeTruthy();
    fireEvent.pointerMove(document.body, { buttons: 0 });
    expect(await screen.findByText("بند بعد سحب ضائع")).toBeTruthy();
  });
});

describe("RF3-U16 — a question change while the swap waited for a release", () => {
  it("nothing of the old retry reaches the new question's card", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Part = slowPart("UnitChangedMidWait", 40, () => <p>البند القديم</p>);
    const Boom = () => { throw new Error("x"); };
    const ui = render(<div><QuestionErrorBoundary variant="part" resetKey="q1"><Suspense fallback={<i>…</i>}><Part /></Suspense></QuestionErrorBoundary><p data-testid="text">نص</p></div>);
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" });
    retry.focus(); fireEvent.click(retry);
    const text = screen.getByTestId("text");
    fireEvent.pointerDown(text);
    await sleep(250);                                                               // loaded; waiting for the release
    ui.rerender(<div><QuestionErrorBoundary variant="part" resetKey="q2"><Boom /></QuestionErrorBoundary><p data-testid="text">نص</p></div>);
    await screen.findByTestId("question-recovery");
    fireEvent.pointerUp(text);
    await sleep(150);
    const card = screen.getByTestId("question-recovery");
    expect(card.textContent).not.toContain("ما زال التحميل متعذّرًا");             // the new question was never retried
    expect(screen.queryByText("البند القديم")).toBeNull();
  });
});

describe("RF3-U17/U18 — the end of a press", () => {
  it("a finger lifts: the swap waits a moment, so the tap's click still lands on the card's layout", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Part = slowPart("UnitTapSettle", 40, () => <p>بند بعد اللمس</p>);
    render(<div><QuestionErrorBoundary variant="part" resetKey="ts"><Suspense fallback={<i>…</i>}><Part /></Suspense></QuestionErrorBoundary><p data-testid="t">نص</p></div>);
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" });
    retry.focus(); fireEvent.click(retry);
    const t = screen.getByTestId("t");
    fireEvent.touchStart(t, { touches: [{ clientX: 5, clientY: 5 }] });
    await sleep(250);
    fireEvent.touchEnd(t, { touches: [] });
    await sleep(10);                                                                // the tap's click follows the touchend
    expect(screen.getByTestId("question-recovery")).toBeTruthy();
    expect(await screen.findByText("بند بعد اللمس")).toBeTruthy();
  });
  it("the window loses focus during a press: the press is over", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Part = slowPart("UnitWindowBlur", 40, () => <p>بند بعد مغادرة النافذة</p>);
    render(<div><QuestionErrorBoundary variant="part" resetKey="wb"><Suspense fallback={<i>…</i>}><Part /></Suspense></QuestionErrorBoundary><p data-testid="w">نص</p></div>);
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" });
    retry.focus(); fireEvent.click(retry);
    fireEvent.pointerDown(screen.getByTestId("w"));
    await sleep(250);
    expect(screen.getByTestId("question-recovery")).toBeTruthy();
    act(() => { window.dispatchEvent(new Event("blur")); });
    expect(await screen.findByText("بند بعد مغادرة النافذة", undefined, { timeout: 2000 })).toBeTruthy();
  });
});

describe("RF3-U19 — a page-level card: the heading and the keyboard-only reveal", () => {
  function setup(name: string) {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => { frames.push(f); return frames.length; });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const flush = () => act(() => { const now = frames.splice(0); for (const f of now) f(0); });
    const reveal = vi.fn();
    const Surface = slowPart(name, 30, () => <p>سطح الصفحة</p>);
    function Page() {
      const heading = useRef<HTMLHeadingElement | null>(null);
      return (
        <QuestionRecoveryContext.Provider value={{ scope: "exam", reloadAllowed: false, strict: false, reveal, focusAnchor: () => { const h = heading.current; if (!h) return false; h.focus({ preventScroll: true }); return true; } }}>
          <QuestionErrorBoundary variant="page" resetKey="pg"><h2 tabIndex={-1} ref={heading}>السؤال 2 من 3</h2><Suspense fallback={null}><Surface /></Suspense></QuestionErrorBoundary>
          <p data-testid="elsewhere">نص</p>
        </QuestionRecoveryContext.Provider>
      );
    }
    render(<Page />);
    return { reveal, flush };
  }
  it("a keyboard retry during which nothing moved: the heading is focused and revealed once (X2)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { reveal, flush } = setup("UnitPageKeyboard");
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" });
    retry.focus(); fireEvent.click(retry);
    await screen.findByText("سطح الصفحة", undefined, { timeout: 2000 });
    flush();
    expect(document.activeElement?.textContent).toBe("السؤال 2 من 3");
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(reveal.mock.calls[0][0]).toBe(document.activeElement);
  });
  it("a press after the swap: the heading waits for the release, and nothing is revealed (X1)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { reveal, flush } = setup("UnitPagePressAfter");
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" });
    retry.focus(); fireEvent.click(retry);
    await screen.findByText("سطح الصفحة", undefined, { timeout: 2000 });
    const elsewhere = screen.getByTestId("elsewhere");
    fireEvent.pointerDown(elsewhere);
    flush();
    expect(document.activeElement?.textContent).not.toBe("السؤال 2 من 3");           // never while the pointer is down
    fireEvent.pointerUp(elsewhere);
    flush();
    expect(document.activeElement?.textContent).toBe("السؤال 2 من 3");
    expect(reveal).not.toHaveBeenCalled();                                           // the press after the retry cancels the reveal
  });
});
