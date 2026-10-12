// @vitest-environment happy-dom
// PR #300 self-review (NOT an independent approval) — adversarial tests for the shared Toast (src/ui/Toast.tsx):
// rapid show / replace / dismiss, timers after unmount, pause / resume arithmetic with hover and focus overlapping,
// Escape outside the card, the live region for the same message twice, actionDisabled mid-countdown, dismissToast during
// the announcement delay, and re-entrant showToast from an onDismiss callback.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect } from "react";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";
import { useToast, type ToastDismissReason, type ToastOptions } from "./Toast";

type Entry = { tag: string; reason: ToastDismissReason; hadFocus: boolean };
let log: Entry[] = [];
let api: ReturnType<typeof useToast> | null = null;
function Host({ disabled = false, duration = 8000 }: { disabled?: boolean; duration?: number }) {
  const t = useToast({ defaultDurationMs: duration, actionDisabled: disabled });
  useEffect(() => { api = t; });
  return <div><button type="button">خارج</button>{t.toastRegion}</div>;
}
const opts = (tag: string, o: Partial<ToastOptions> = {}): ToastOptions => ({ message: "رسالة " + tag, onDismiss: (reason, hadFocus) => { log.push({ tag, reason, hadFocus }); }, ...o });
const show = (tag: string, o: Partial<ToastOptions> = {}) => { let id = 0; act(() => { id = api!.showToast(opts(tag, o)); }); return id; };
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const card = () => screen.queryByRole("group", { name: "إشعار" });
const cards = () => document.querySelectorAll(".eb-toast");
const live = () => screen.getByRole("status");
const action = { label: "تراجع", accessibleLabel: "تراجع عن حذف السؤال", onAction: () => {} };

beforeEach(() => { log = []; api = null; vi.useFakeTimers({ shouldAdvanceTime: false }); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("self-review — Toast: rapid show / replace / dismiss", () => {
  it("three toasts in ONE batch: only the last is shown; the first two are reported «replaced» exactly once, in order", () => {
    render(<Host />);
    act(() => { api!.showToast(opts("A")); api!.showToast(opts("B")); api!.showToast(opts("C")); });
    expect(cards()).toHaveLength(1);
    expect(card()!.textContent).toContain("رسالة C");
    expect(log).toEqual([{ tag: "A", reason: "replaced", hadFocus: false }, { tag: "B", reason: "replaced", hadFocus: false }]);
    act(() => { api!.dismissToast(); });
    act(() => { api!.dismissToast(); });                                        // a second dismiss is a no-op
    expect(card()).toBeNull();
    expect(log.map(e => e.tag + ":" + e.reason)).toEqual(["A:replaced", "B:replaced", "C:programmatic"]);
  });

  it("a short toast replaced by a long one: the short one's timer can never close the long one", () => {
    render(<Host />);
    show("A", { durationMs: 1000 });
    advance(500);
    show("B", { durationMs: 5000 });
    advance(600);                                                              // A's original deadline has passed
    expect(card()!.textContent).toContain("رسالة B");
    advance(4300);                                                             // 4900 ms into B
    expect(card()).not.toBeNull();
    advance(150);
    expect(card()).toBeNull();
    expect(log.map(e => e.tag + ":" + e.reason)).toEqual(["A:replaced", "B:timeout"]);
  });

  it("show → dismiss → show in quick succession: each onDismiss fires once; no timer survives", () => {
    render(<Host duration={2000} />);
    for (let i = 0; i < 5; i++) { show("T" + i); advance(10); act(() => { api!.dismissToast(); }); }
    show("last");
    advance(1990);
    expect(card()!.textContent).toContain("رسالة last");
    advance(20);
    expect(card()).toBeNull();
    expect(log.map(e => e.tag + ":" + e.reason)).toEqual(["T0:programmatic", "T1:programmatic", "T2:programmatic", "T3:programmatic", "T4:programmatic", "last:timeout"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("dismissToast(id) with the id of a toast that already left is ignored (it never closes the newer toast)", () => {
    render(<Host />);
    const a = show("A");
    act(() => { api!.dismissToast(a); });
    const b = show("B");
    expect(b).not.toBe(a);
    act(() => { api!.dismissToast(a); });
    expect(card()!.textContent).toContain("رسالة B");
  });

  it("re-entrancy: a toast shown from inside the replaced toast's onDismiss is not silently dropped (its onDismiss still fires once)", () => {
    render(<Host />);
    act(() => {
      api!.showToast(opts("A", { onDismiss: (reason, hadFocus) => { log.push({ tag: "A", reason, hadFocus }); api!.showToast(opts("fromA")); } }));
    });
    act(() => { api!.showToast(opts("C")); });
    act(() => { api!.dismissToast(); });
    // Every toast that was ever current must report how it left — exactly once.
    const tags = log.map(e => e.tag);
    expect(tags.filter(t => t === "fromA")).toHaveLength(1);
    expect(tags.filter(t => t === "C")).toHaveLength(1);
  });
});

describe("self-review — Toast: timers and unmount", () => {
  it("unmounting with a toast and a pending announcement leaves no timer, no onDismiss call and no console error", () => {
    const err = vi.spyOn(console, "error");
    const { unmount } = render(<Host duration={3000} />);
    show("A", { action });
    advance(20);                                                               // inside the announcement delay
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    advance(20000);
    expect(log).toEqual([]);
    expect(err).not.toHaveBeenCalled();
  });

  it("dismissToast during the announcement delay: the gone toast is NEVER announced afterwards", () => {
    render(<Host />);
    show("A");
    advance(30);
    expect(live().textContent).toBe("");
    act(() => { api!.dismissToast(); });
    advance(500);
    expect(live().textContent).toBe("");
    expect(log.map(e => e.reason)).toEqual(["programmatic"]);
  });

  it("a replacement during the announcement delay: only the newer text is ever announced", () => {
    render(<Host />);
    const seen: string[] = [];
    const sample = () => seen.push(live().textContent || "");
    show("A");
    for (let t = 0; t < 3; t++) { advance(10); sample(); }                    // 30 ms into A's 60 ms delay
    show("B");
    sample();
    for (let t = 0; t < 10; t++) { advance(10); sample(); }
    expect(live().textContent).toBe("رسالة B");
    expect(seen.join("|")).not.toContain("رسالة A");
  });

  it("the SAME message twice in a row is announced twice (the region empties, then receives the text again)", () => {
    render(<Host />);
    show("A", { message: "تم حذف السؤال 2." });
    advance(80);
    expect(live().textContent).toBe("تم حذف السؤال 2.");
    const before = live().firstChild;
    show("B", { message: "تم حذف السؤال 2." });
    expect(live().textContent).toBe("");                                       // emptied with the replacement …
    advance(30);
    expect(live().textContent).toBe("");
    advance(50);
    expect(live().textContent).toBe("تم حذف السؤال 2.");                       // … and the same text inserted again (a new text node)
    expect(live().firstChild).not.toBe(before);
  });

  it("the live region is emptied when the toast leaves (a stale message is never re-read)", () => {
    render(<Host duration={1000} />);
    show("A");
    advance(80);
    expect(live().textContent).toBe("رسالة A");
    advance(1000);
    expect(card()).toBeNull();
    expect(live().textContent).toBe("");
  });
});

describe("self-review — Toast: pause / resume arithmetic", () => {
  it("hover and focus overlapping: paused from the first until the LAST of them ends; then exactly the remaining time runs", () => {
    render(<Host duration={5000} />);
    show("A", { action });
    const c = card()!;
    const btn = screen.getByRole("button", { name: "تراجع عن حذف السؤال" });
    advance(1000);
    act(() => { fireEvent.mouseEnter(c); });                                   // 4000 ms left
    advance(1000);
    act(() => { btn.focus(); });
    advance(1000);
    act(() => { fireEvent.mouseLeave(c); });                                   // focus still inside → still paused
    advance(10000);
    expect(card()).not.toBeNull();
    act(() => { screen.getByRole("button", { name: "خارج" }).focus(); });       // focus leaves → resume with 4000 ms
    advance(3990);
    expect(card()).not.toBeNull();
    advance(20);
    expect(card()).toBeNull();
    expect(log).toEqual([{ tag: "A", reason: "timeout", hadFocus: false }]);
  });

  it("focus moving INSIDE the card (action → close) keeps it paused", () => {
    render(<Host duration={2000} />);
    show("A", { action });
    act(() => { screen.getByRole("button", { name: "تراجع عن حذف السؤال" }).focus(); });
    advance(500);
    act(() => { screen.getByRole("button", { name: "إغلاق الإشعار" }).focus(); });
    advance(10000);
    expect(card()).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "إغلاق الإشعار" }));
  });

  it("many short pause / resume cycles do not drift: the total visible running time equals the duration", () => {
    render(<Host duration={3000} />);
    show("A");
    const c = card()!;
    for (let i = 0; i < 10; i++) { advance(100); act(() => { fireEvent.mouseEnter(c); }); advance(700); act(() => { fireEvent.mouseLeave(c); }); }
    // 10 × 100 ms ran → 2000 ms left
    advance(1990);
    expect(card()).not.toBeNull();
    advance(20);
    expect(card()).toBeNull();
  });

  it("a hover that started on the previous toast does not pause the replacement (pause is per toast)", () => {
    render(<Host duration={1000} />);
    show("A");
    act(() => { fireEvent.mouseEnter(card()!); });
    show("B");
    advance(1010);
    expect(card()).toBeNull();
    expect(log.map(e => e.tag + ":" + e.reason)).toEqual(["A:replaced", "B:timeout"]);
  });
});

describe("self-review — Toast: Escape and actionDisabled", () => {
  it("Escape while focus is OUTSIDE the card never closes it; Escape inside closes it", () => {
    render(<Host />);
    show("A", { action });
    const outside = screen.getByRole("button", { name: "خارج" });
    act(() => { outside.focus(); fireEvent.keyDown(outside, { key: "Escape" }); });
    act(() => { fireEvent.keyDown(document.body, { key: "Escape" }); });
    act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
    expect(card()).not.toBeNull();
    const btn = screen.getByRole("button", { name: "تراجع عن حذف السؤال" });
    act(() => { btn.focus(); fireEvent.keyDown(btn, { key: "Escape" }); });
    expect(card()).toBeNull();
    expect(log).toEqual([{ tag: "A", reason: "escape", hadFocus: true }]);
  });

  it("Escape inside the card does not reach a document-level Escape handler (no second surface closes with it)", () => {
    const docEscape = vi.fn();
    document.addEventListener("keydown", e => { if (e.key === "Escape") docEscape(); });
    render(<Host />);
    show("A", { action });
    const btn = screen.getByRole("button", { name: "تراجع عن حذف السؤال" });
    act(() => { btn.focus(); fireEvent.keyDown(btn, { key: "Escape" }); });
    expect(card()).toBeNull();
    expect(docEscape).not.toHaveBeenCalled();
  });

  it("actionDisabled toggled mid-countdown: the countdown neither restarts nor resets; clicks while disabled do nothing", () => {
    const onAction = vi.fn();
    const { rerender } = render(<Host duration={4000} />);
    show("A", { action: { ...action, onAction } });
    advance(1000);
    rerender(<Host duration={4000} disabled />);
    const btn = screen.getByRole("button", { name: "تراجع عن حذف السؤال" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    act(() => { fireEvent.click(btn); });
    advance(1000);
    rerender(<Host duration={4000} />);
    expect(btn.disabled).toBe(false);
    advance(1000);
    rerender(<Host duration={4000} disabled />);
    rerender(<Host duration={4000} />);
    advance(990);                                                              // 3990 ms in total
    expect(card()).not.toBeNull();
    advance(20);
    expect(card()).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
    expect(log).toEqual([{ tag: "A", reason: "timeout", hadFocus: false }]);
  });

  it("a double click on the action runs it ONCE and reports «action» once", () => {
    const onAction = vi.fn();
    render(<Host />);
    show("A", { action: { ...action, onAction } });
    const btn = screen.getByRole("button", { name: "تراجع عن حذف السؤال" });
    act(() => { fireEvent.click(btn); fireEvent.click(btn); });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(log).toEqual([{ tag: "A", reason: "action", hadFocus: false }]);
  });

  it("onDismiss(«action») is reported BEFORE onAction runs, and the card is gone when onAction runs", () => {
    const order: string[] = [];
    render(<Host />);
    act(() => { api!.showToast({ message: "m", action: { ...action, onAction: () => order.push("action:" + String(api!.activeToastId)) }, onDismiss: r => order.push("dismiss:" + r) }); });
    act(() => { fireEvent.click(screen.getByRole("button", { name: "تراجع عن حذف السؤال" })); });
    expect(order[0]).toBe("dismiss:action");
    expect(order[1]).toMatch(/^action:/);
    expect(card()).toBeNull();
  });
});
