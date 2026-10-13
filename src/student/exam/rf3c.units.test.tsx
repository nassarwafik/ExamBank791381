// @vitest-environment happy-dom
// Phase 21E.3 review fix 3 — the press guard after a layout change in view (read-only review of 75eaba2, input reviewer
// RR3-IN-4). A file of its own: the guard is module state of `pointerHold`.
//   RF3-U20 a card in view is replaced: a pointer press that starts within the guard window does nothing (its pointerdown, click
//           and drag never reach the page); a keyboard activation does; a press after the window does          fail-first
//   RF3-U21 a card far above the viewport (scroll anchoring keeps the content still): a press right after the swap works
//   RF3-U22 a keyboard-only reveal that scrolled the page guards the presses that start just after it                fail-first
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup, createEvent } from "@testing-library/react";
import { Suspense, type ComponentType, type ReactElement } from "react";
import QuestionErrorBoundary from "./QuestionErrorBoundary";
import { recoverableLazy } from "../../recoverableLazy";
import { pointerIsDown } from "./pointerHold";

const originalRect = HTMLElement.prototype.getBoundingClientRect, originalInto = HTMLElement.prototype.scrollIntoView;
afterEach(() => { cleanup(); vi.restoreAllMocks(); HTMLElement.prototype.getBoundingClientRect = originalRect; HTMLElement.prototype.scrollIntoView = originalInto; window.scrollTo(0, 0); });
const origin = window.location.origin;
const chunkError = (name: string) => new TypeError("Failed to fetch dynamically imported module: " + origin + "/assets/" + name + "-abcd1234.js");
const sleep = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const slowPart = (name: string, ms: number, content: () => ReactElement) => {
  let calls = 0;
  return recoverableLazy<object>(name, () => (++calls === 1 ? Promise.reject(chunkError(name)) : new Promise(r => setTimeout(() => r({ default: content }), ms))) as Promise<{ default: ComponentType<object> }>);
};
const rectAt = (top: number, height: number) => { HTMLElement.prototype.getBoundingClientRect = () => ({ top, bottom: top + height, left: 0, right: 100, width: 100, height, x: 0, y: top, toJSON() {} }) as DOMRect; };
const press = (el: HTMLElement) => { fireEvent.pointerDown(el); fireEvent.mouseDown(el); fireEvent.pointerUp(el); fireEvent.mouseUp(el); fireEvent.click(el, { detail: 1 }); };
function setup(name: string, text: string) {
  const onDown = vi.fn(), onClick = vi.fn();
  const Part = slowPart(name, 40, () => <p>{text}</p>);
  render(<div><QuestionErrorBoundary variant="part" resetKey={name}><Suspense fallback={<i>…</i>}><Part /></Suspense></QuestionErrorBoundary>
    <label data-testid="opt" onPointerDown={onDown} onClick={onClick}>الخيار ٢</label><span data-testid="chip" draggable>Router</span></div>);
  return { onDown, onClick };
}

describe("RF3-U20/U21 — a press that starts just after an in-view swap", () => {
  it("a card in view: a press within the window does nothing; a keyboard activation and a later press do", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rectAt(120, 80);                                                                 // the card is in the viewport
    const { onDown, onClick } = setup("UnitGuardInView", "الصيغة المستعادة");
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" });
    retry.focus(); fireEvent.click(retry);
    expect(await screen.findByText("الصيغة المستعادة")).toBeTruthy();
    const opt = screen.getByTestId("opt");
    press(opt);                                                                      // aimed at the old layout
    expect(onDown).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    const drag = createEvent.dragStart(screen.getByTestId("chip"));
    fireEvent.pointerDown(screen.getByTestId("chip")); fireEvent(screen.getByTestId("chip"), drag); fireEvent.pointerUp(screen.getByTestId("chip"));
    expect(drag.defaultPrevented).toBe(true);                                        // a drag of a chip that moved never starts
    expect(pointerIsDown()).toBe(false);                                             // …so no drag is left "in progress"
    fireEvent.click(opt);                                                            // a keyboard activation (detail 0) is never stopped
    expect(onClick).toHaveBeenCalledTimes(1);
    await sleep(450);
    press(opt);
    expect(onDown).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(2);
  });
  it("a card far above the viewport: a press right after the swap works", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rectAt(-900, 80);
    HTMLElement.prototype.scrollIntoView = vi.fn();
    const { onDown, onClick } = setup("UnitGuardAbove", "صيغة فوق الصفحة");
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" });
    fireEvent.click(retry, { detail: 1 });                                           // a pointer retry: no reveal either
    expect(await screen.findByText("صيغة فوق الصفحة")).toBeTruthy();
    press(screen.getByTestId("opt"));
    expect(onDown).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("RF3-U22 — the keyboard-only reveal moved the page", () => {
  it("a press that starts just after the reveal does nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rectAt(-900, 80);                                                                // out of view: the swap alone guards nothing
    HTMLElement.prototype.scrollIntoView = vi.fn(() => { window.scrollTo(0, 400); });
    const { onDown, onClick } = setup("UnitGuardReveal", "صيغة بعد الإظهار");
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" });
    retry.focus(); fireEvent.click(retry);                                           // keyboard retry, nothing moved meanwhile
    expect(await screen.findByText("صيغة بعد الإظهار")).toBeTruthy();
    await sleep(20);
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(window.scrollY).toBe(400);
    press(screen.getByTestId("opt"));
    expect(onDown).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });
});
