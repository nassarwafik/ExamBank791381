// @vitest-environment happy-dom
//
// Phase 21E.2 part 2 — Review Fix 4, audit A-14 / B-05 (the shared ActionMenu: the builder toolbar's «إضافة أسئلة» / «المزيد», and
// every other ActionMenu). A page or ancestor scroll, or a window resize, closes an open menu (A-F2). It used to close it with
// close(false): with keyboard focus on an item, that item left the page with the panel and focus fell to <body> — outside the
// builder's aria-modal surface, so the next Tab restarted at «رجوع». Now focus returns to the trigger, as it does for Escape, and
// without a scroll (the page has just moved). Focus the teacher had already moved elsewhere is never taken.
// Fail-first on the Review Fix 3 head 1fa3d21: «expected <body> to be <button aria-label="المزيد">» for the scroll / resize cases.
// Real-browser evidence: scripts/capture-visual-gate-21e2-builder.mjs check «RF4 A-14 / B-05».
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";
import ActionMenu from "./ActionMenu";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const panel = () => document.querySelector<HTMLElement>(".eb-menu-panel");
function Page() {
  return (
    <div data-testid="scroller">
      <button type="button">قبل</button>
      <ActionMenu label="المزيد">{[1, 2, 3].map(i => <button key={i} type="button" className="eb-menu-item">بند {i}</button>)}</ActionMenu>
      <input aria-label="حقل آخر" />
    </div>
  );
}
const openByKeyboard = () => {
  const trigger = screen.getByRole("button", { name: "المزيد" });
  trigger.focus();
  fireEvent.click(trigger);                                              // Enter / Space activate a button as a click
  expect(panel()).not.toBeNull();
  expect(panel()!.contains(document.activeElement)).toBe(true);          // focus is on the first item, inside the panel
  return trigger;
};

describe("RF4 A-14 / B-05 — a menu closed by a scroll or a resize gives keyboard focus back to its trigger", () => {
  it("a page scroll (window, capture phase): the panel closes and focus is on the trigger, never <body>", () => {
    render(<Page />);
    const trigger = openByKeyboard();
    act(() => { window.dispatchEvent(new Event("scroll")); });
    expect(panel()).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("an ancestor scroller's scroll and a window resize do the same", () => {
    render(<Page />);
    let trigger = openByKeyboard();
    act(() => { screen.getByTestId("scroller").dispatchEvent(new Event("scroll")); });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger);
    trigger = openByKeyboard();
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });   // focus on «بند 2»
    act(() => { window.dispatchEvent(new Event("resize")); });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("the trigger is focused WITHOUT a scroll (the page has just moved; it must not jump back)", () => {
    render(<Page />);
    const trigger = openByKeyboard();
    const focus = vi.spyOn(trigger, "focus");
    act(() => { window.dispatchEvent(new Event("scroll")); });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus.mock.calls[0][0]).toEqual({ preventScroll: true });
  });

  it("focus the teacher already moved out of the panel stays where it is (the scroll only closes the menu)", () => {
    render(<Page />);
    openByKeyboard();
    const field = screen.getByRole("textbox", { name: "حقل آخر" });
    field.focus();                                                       // e.g. a click into a field (no mousedown in happy-dom)
    expect(panel()).not.toBeNull();
    act(() => { window.dispatchEvent(new Event("scroll")); });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(field);
  });

  it("the panel's own scroll still never closes it (A-F2 unchanged)", () => {
    render(<Page />);
    openByKeyboard();
    const item = document.activeElement as HTMLElement;
    act(() => { panel()!.dispatchEvent(new Event("scroll")); });
    expect(panel()).not.toBeNull();
    expect(document.activeElement).toBe(item);
  });
});
