// @vitest-environment happy-dom
// Phase 21E.3 review fix 3 — boundary regression tests for the final review of 593fd47 (recovery reviewer):
//   RF3-U1  a SUCCESSFUL retry while the student moved elsewhere: no landing line, focus stays where the student put it   [RR2-5 M3]
//   RF3-U2  a page-level card: the same, the heading is never focused                                                    [RR2-5 M5]
//   RF3-U3  once focus leaves the landing line it is hidden from assistive technology (it sat inside the stem that names
//           the answer controls) and keeps its place; while focused it is read                                [RR2-4]  fail-first
//   RF3-U4  outside the exam (no provider) a recovery never scrolls either, even far from the viewport          [RR2-3]  fail-first
//   RF3-U5  a recovered part renders in ONE commit: no empty fallback first (a two-step height change defeats scroll anchoring
//           and moved the options under a still pointer in Chromium)                                    [RR2-3 follow-up]  fail-first
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react";
import { Suspense, useRef, type ComponentType, type ReactElement } from "react";
import QuestionErrorBoundary from "./QuestionErrorBoundary";
import { QuestionRecoveryContext } from "./questionRecovery";
import { recoverableLazy } from "../../recoverableLazy";

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
    retry.focus(); fireEvent.click(retry);
    const line = await screen.findByTestId("recovery-landed");
    await waitFor(() => expect(document.activeElement).toBe(line));
    expect(into).not.toHaveBeenCalled();                                            // the defect: scrollIntoView to the line
  });
});

describe("RF3-U5 — a recovered part renders in one commit", () => {
  it("after a successful retry the part's Suspense fallback is never shown again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let fallbacks = 0;
    const Fallback = () => { fallbacks += 1; return <i>…</i>; };
    const Part = slowPart("UnitOneCommit", 30, () => <p>البند المستعاد</p>);
    render(<QuestionErrorBoundary variant="part" resetKey="oc"><Suspense fallback={<Fallback />}><Part /></Suspense></QuestionErrorBoundary>);
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" });
    const before = fallbacks;                                                         // the first (failed) load showed it
    retry.focus(); fireEvent.click(retry);
    await screen.findByText("البند المستعاد");
    expect(fallbacks).toBe(before);                                                 // the defect: one more empty commit
  });
});
