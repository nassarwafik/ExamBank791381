// @vitest-environment happy-dom
// Phase 21E.3 review fix 3 — boundary regression tests for the final review of 593fd47 (recovery reviewer):
//   RF3-U1  a SUCCESSFUL retry while the student moved elsewhere: no landing line, focus stays where the student put it   [RR2-5 M3]
//   RF3-U2  a page-level card: the same, the heading is never focused                                                    [RR2-5 M5]
//   RF3-U3  once focus leaves the landing line it is hidden from assistive technology (it sat inside the stem that names
//           the answer controls) and keeps its place; while focused it is read                                [RR2-4]  fail-first
//   RF3-U4  outside the exam (no provider) a recovery never scrolls either, even far from the viewport          [RR2-3]  fail-first
//   RF3-U5  a recovered part renders in ONE commit: no empty fallback first (a two-step height change defeats scroll anchoring
//           and moved the options under a still pointer in Chromium)                                    [RR2-3 follow-up]  fail-first
//   RF3-U6  a recovery that completes while the student presses elsewhere (mouse) waits for the release before the layout
//           changes, and does not take focus (the press moved the student on)                                [input F-1, F-2]  fail-first
//   RF3-U7  the same for a finger (a touch scroll cancels the pointer; only the last touchend releases it)   [input F-1, F-2]  fail-first
//   RF3-U8  a visually hidden landing line shows its keyboard focus on the recovered part that follows it      [input F-3]
//   RF3-U9  a long press (a 45 s drag) is still waited for: the safety cap is not a press length         [input F-1 follow-up]
//   RF3-U10 a POINTER retry never reveals, even far from the viewport                                         [review fix 3]
//   RF3-U11 a keyboard retry with a press meanwhile (even on the card) never reveals                         [review fix 3]
//   RF3-U12 a keyboard retry during which nothing moved reveals the line far from the viewport (no provider)  [review fix 3]
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { Suspense, useRef, type ComponentType, type ReactElement } from "react";
import QuestionErrorBoundary from "./QuestionErrorBoundary";
import { QuestionRecoveryContext } from "./questionRecovery";
import { recoverableLazy } from "../../recoverableLazy";
import { trackPointer, pointerReleased } from "./pointerHold";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const origin = window.location.origin;
const chunkError = (name: string) => new TypeError("Failed to fetch dynamically imported module: " + origin + "/assets/" + name + "-abcd1234.js");
const sleep = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
/** A loader whose first load fails and whose retry succeeds after `ms`. */
const slowPart = (name: string, ms: number, content: () => ReactElement) => {
  let calls = 0;
  return recoverableLazy<object>(name, () => (++calls === 1 ? Promise.reject(chunkError(name)) : new Promise(r => setTimeout(() => r({ default: content }), ms))) as Promise<{ default: ComponentType<object> }>);
};

describe("RF3-U1 — a successful retry never takes focus the student moved", () => {
  it("the student moves to another field while the retry loads: no line, focus and keystrokes stay there", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Part = slowPart("UnitMovedOk", 150, () => <label>البند 2 <input aria-label="إجابة البند 2" /></label>);
    render(<div><QuestionErrorBoundary variant="part" resetKey="m1"><Suspense fallback={<i>…</i>}><Part /></Suspense></QuestionErrorBoundary><input aria-label="البند الآخر" /></div>);
    await screen.findByTestId("question-recovery");
    const retry = screen.getByRole("button", { name: "إعادة المحاولة" });
    retry.focus(); fireEvent.click(retry);
    const other = screen.getByRole("textbox", { name: "البند الآخر" }) as HTMLInputElement;
    other.focus();
    fireEvent.change(other, { target: { value: "إجابة" } });
    await screen.findByRole("textbox", { name: "إجابة البند 2" }, { timeout: 2000 });
    await sleep(50);
    expect(screen.queryByTestId("recovery-landed")).toBeNull();
    expect(document.activeElement).toBe(other);
    expect(other.value).toBe("إجابة");
  });
});

describe("RF3-U2 — a page-level card never takes focus the student moved", () => {
  it("the heading is not focused when the student moved to another control while the page loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Surface = slowPart("UnitMovedPage", 150, () => <p>سطح الصفحة</p>);
    const anchor = vi.fn();
    function Page() {
      const heading = useRef<HTMLHeadingElement | null>(null);
      return (
        <QuestionRecoveryContext.Provider value={{ scope: "exam", reloadAllowed: false, strict: false, focusAnchor: () => { anchor(); const h = heading.current; if (!h) return false; h.focus({ preventScroll: true }); return true; } }}>
          <QuestionErrorBoundary variant="page" resetKey="pg"><h2 tabIndex={-1} ref={heading}>السؤال 2 من 3</h2><Suspense fallback={null}><Surface /></Suspense></QuestionErrorBoundary>
          <button type="button">التالي</button>
        </QuestionRecoveryContext.Provider>
      );
    }
    render(<Page />);
    await screen.findByTestId("question-recovery");
    const retry = screen.getByRole("button", { name: "إعادة المحاولة" });
    retry.focus(); fireEvent.click(retry);
    const next = screen.getByRole("button", { name: "التالي" });
    next.focus();
    await screen.findByText("سطح الصفحة", undefined, { timeout: 2000 });
    await sleep(100);
    expect(anchor).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(next);
  });
});

describe("RF3-U3 — the landing line leaves the accessible name once focus left it", () => {
  it("inside a stem that names the radio group: read while focused, hidden (in place) after Tab moves on", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Formula = slowPart("UnitStemFormula", 0, () => <span>x²</span>);
    render(
      <div>
        <p id="stem">احسب <QuestionErrorBoundary variant="inline" fallback={<span>x^2</span>}><Suspense fallback={<span>x^2</span>}><Formula /></Suspense></QuestionErrorBoundary> عندما x = 3</p>
        <div role="radiogroup" aria-labelledby="stem"><label><input type="radio" name="g" /> 9</label><label><input type="radio" name="g" /> 6</label></div>
      </div>,
    );
    const retry = await screen.findByRole("button", { name: "إعادة تحميل الصيغة" });
    retry.focus(); fireEvent.click(retry);
    const line = await screen.findByTestId("recovery-landed");
    await waitFor(() => expect(document.activeElement).toBe(line));
    expect(line.getAttribute("aria-hidden")).toBeNull();                            // focused: it is what the student hears
    act(() => { (screen.getAllByRole("radio")[0] as HTMLInputElement).focus(); });
    expect(line.isConnected).toBe(true);                                            // kept in place: nothing moves
    expect(line.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("radiogroup").textContent).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "احسب x² عندما x = 3" })).toBeTruthy();   // the defect: «…تم تحميل هذا الجزء.…»
  });
});

describe("RF3-U4 — outside the exam a recovery never scrolls", () => {
  const original = { rect: HTMLElement.prototype.getBoundingClientRect, into: HTMLElement.prototype.scrollIntoView };
  afterEach(() => { HTMLElement.prototype.getBoundingClientRect = original.rect; HTMLElement.prototype.scrollIntoView = original.into; });
  it("the recovered part is far above the viewport (the student scrolled down meanwhile): focus moves, nothing scrolls", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const into = vi.fn();
    HTMLElement.prototype.scrollIntoView = into;
    HTMLElement.prototype.getBoundingClientRect = () => ({ top: -900, bottom: -880, left: 0, right: 100, width: 100, height: 20, x: 0, y: -900, toJSON() {} }) as DOMRect;
    const Part = slowPart("UnitFarAbove", 0, () => <p>الجزء</p>);
    render(<QuestionErrorBoundary variant="part" resetKey="fa"><Suspense fallback={<i>…</i>}><Part /></Suspense></QuestionErrorBoundary>);
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" });
    retry.focus();
    const sy = Object.getOwnPropertyDescriptor(window, "scrollY");
    try {
      act(() => { fireEvent.click(retry); Object.defineProperty(window, "scrollY", { configurable: true, get: () => 900 }); });   // scrolled down meanwhile
      const line = await screen.findByTestId("recovery-landed");
      await waitFor(() => expect(document.activeElement).toBe(line));
      expect(into).not.toHaveBeenCalled();                                          // the defect: scrollIntoView to the line
    } finally { if (sy) Object.defineProperty(window, "scrollY", sy); else delete (window as unknown as { scrollY?: number }).scrollY; }
  });
});

describe("RF3-U5 — a recovered part renders in one commit", () => {
  it("after a successful retry the part's Suspense fallback is never shown again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fallback = vi.fn();
    const Fallback = () => { fallback(); return <i>…</i>; };
    const Part = slowPart("UnitOneCommit", 30, () => <p>البند المستعاد</p>);
    render(<QuestionErrorBoundary variant="part" resetKey="oc"><Suspense fallback={<Fallback />}><Part /></Suspense></QuestionErrorBoundary>);
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" });
    const before = fallback.mock.calls.length;                                        // the first (failed) load showed it
    retry.focus(); fireEvent.click(retry);
    await screen.findByText("البند المستعاد");
    expect(fallback.mock.calls.length).toBe(before);                                // the defect: one more empty commit
  });
});

describe("RF3-U6 — a recovery never changes the layout or takes focus during a press elsewhere", () => {
  it("mouse: the student presses an option of another part while the retry completes; the swap waits for the release", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Part = slowPart("UnitMidPress", 60, () => <p>البند المستعاد</p>);
    render(<div><QuestionErrorBoundary variant="part" resetKey="mp"><Suspense fallback={<i>…</i>}><Part /></Suspense></QuestionErrorBoundary><label data-testid="option"><input type="radio" name="o" /> الخيار 2</label></div>);
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" });
    retry.focus(); fireEvent.click(retry);
    const option = screen.getByTestId("option");
    fireEvent.pointerDown(option); fireEvent.mouseDown(option);
    (document.activeElement as HTMLElement).blur();                                // a press on a <label> leaves focus on <body>
    await sleep(250);                                                               // the part loaded meanwhile
    expect(screen.getByTestId("question-recovery")).toBeTruthy();                   // the defect: the layout changed mid-press
    expect(screen.queryByText("البند المستعاد")).toBeNull();
    fireEvent.pointerUp(option); fireEvent.mouseUp(option);
    expect(await screen.findByText("البند المستعاد")).toBeTruthy();
    await sleep(50);
    expect(screen.queryByTestId("recovery-landed")).toBeNull();                     // the press moved the student on: no landing
    expect(document.activeElement).toBe(document.body);
  });
});

describe("RF3-U7 — the same for a finger", () => {
  it("touch: a scroll gesture cancels the pointer, but the finger is still down until touchend", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Part = slowPart("UnitMidTouch", 60, () => <p>الجزء المستعاد</p>);
    render(<div><QuestionErrorBoundary variant="part" resetKey="mt"><Suspense fallback={<i>…</i>}><Part /></Suspense></QuestionErrorBoundary><p data-testid="elsewhere">نص آخر</p></div>);
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" });
    retry.focus(); fireEvent.click(retry);
    const elsewhere = screen.getByTestId("elsewhere");
    fireEvent.pointerDown(elsewhere); fireEvent.touchStart(elsewhere, { touches: [{ clientX: 10, clientY: 10 }] });
    fireEvent.pointerCancel(elsewhere);                                             // the finger started scrolling
    (document.activeElement as HTMLElement).blur();
    await sleep(250);
    expect(screen.getByTestId("question-recovery")).toBeTruthy();
    fireEvent.touchEnd(elsewhere, { touches: [] });
    expect(await screen.findByText("الجزء المستعاد")).toBeTruthy();
    await sleep(50);
    expect(screen.queryByTestId("recovery-landed")).toBeNull();
  });
});

describe("RF3-U8 — a visually hidden landing line shows focus on the recovered part", () => {
  it("ui.css outlines the element after a focused hidden recovery line (keyboard focus only)", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "..", "ui", "ui.css"), "utf8");
    const rule = /\.eb-visually-hidden\[data-recovery-line\]:focus-visible \+ \* \{([^}]*)\}/.exec(css);
    expect(rule?.[1]).toMatch(/outline: var\(--eb-focus-ring\)/);
  });
});

describe("RF3-U9 — a long press is still waited for", () => {
  it("a press held 45 s keeps the wait open; the release ends it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    try {
      trackPointer();
      fireEvent.pointerDown(document.body);
      let done = false;
      void pointerReleased().then(() => { done = true; });
      await vi.advanceTimersByTimeAsync(45_000);
      expect(done).toBe(false);                                                     // a drag in the physics lab / around a 3D model
      fireEvent.pointerUp(document.body);
      await vi.advanceTimersByTimeAsync(100);
      expect(done).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});

describe("RF3-U10..U12 — the keyboard-only reveal after a recovery", () => {
  const original = { rect: HTMLElement.prototype.getBoundingClientRect, into: HTMLElement.prototype.scrollIntoView };
  afterEach(() => { HTMLElement.prototype.getBoundingClientRect = original.rect; HTMLElement.prototype.scrollIntoView = original.into; });
  const farAbove = () => { HTMLElement.prototype.getBoundingClientRect = () => ({ top: -900, bottom: -880, left: 0, right: 100, width: 100, height: 20, x: 0, y: -900, toJSON() {} }) as DOMRect; };
  it("RF3-U10 a pointer retry (click detail 1) never reveals", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const into = vi.fn(); HTMLElement.prototype.scrollIntoView = into; farAbove();
    const Part = slowPart("UnitPointerRetry", 0, () => <p>الجزء</p>);
    render(<QuestionErrorBoundary variant="part" resetKey="pr"><Suspense fallback={<i>…</i>}><Part /></Suspense></QuestionErrorBoundary>);
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" });
    retry.focus(); fireEvent.click(retry, { detail: 1 });
    const line = await screen.findByTestId("recovery-landed");
    await waitFor(() => expect(document.activeElement).toBe(line));
    await sleep(50);
    expect(into).not.toHaveBeenCalled();
  });
  it("RF3-U11 a keyboard retry with a press on the card meanwhile never reveals", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const into = vi.fn(); HTMLElement.prototype.scrollIntoView = into;
    const Part = slowPart("UnitPressOnCard", 120, () => <p>الجزء</p>);
    render(<QuestionErrorBoundary variant="part" resetKey="pc"><Suspense fallback={<i>…</i>}><Part /></Suspense></QuestionErrorBoundary>);
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" });
    retry.focus(); fireEvent.click(retry);
    const text = screen.getByTestId("question-recovery").querySelector(".iex-q-recovery-title") as HTMLElement;
    fireEvent.pointerDown(text); fireEvent.pointerUp(text);                         // a press inside the card: focus may follow, no reveal
    farAbove();
    const line = await screen.findByTestId("recovery-landed");
    await waitFor(() => expect(document.activeElement).toBe(line));
    await sleep(50);
    expect(into).not.toHaveBeenCalled();
  });
  it("RF3-U12 a keyboard retry during which nothing moved reveals the line (no provider: nearest scroll)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const into = vi.fn(); HTMLElement.prototype.scrollIntoView = into; farAbove();
    const Part = slowPart("UnitKeyboardReveal", 0, () => <p>الجزء</p>);
    render(<QuestionErrorBoundary variant="part" resetKey="kr"><Suspense fallback={<i>…</i>}><Part /></Suspense></QuestionErrorBoundary>);
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" });
    retry.focus(); fireEvent.click(retry);
    const line = await screen.findByTestId("recovery-landed");
    await waitFor(() => expect(document.activeElement).toBe(line));
    await waitFor(() => expect(into).toHaveBeenCalledTimes(1));
    expect(into).toHaveBeenCalledWith({ block: "nearest" });
  });
});
