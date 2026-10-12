// @vitest-environment happy-dom
// Phase 21E.1 (slice 2) — warming the shared confirmation chunk: `whenIdle` schedules on requestIdleCallback (else a short timer),
// never hands the IdleDeadline to the task, and can be cancelled; `prefetchConfirmDialog` loads at most once, never while offline,
// may try again after a failed load, announces readiness, and is a PLAIN import (never the chunk-reload recovery). Loads are
// counted at the import boundary (the `load` argument), and every test gets a fresh module (no state shared between tests).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

type Mod = typeof import("./confirmPrefetch");
let m: Mod;
const setOnline = (v: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => v });
beforeEach(async () => { vi.resetModules(); m = await import("./confirmPrefetch"); setOnline(true); });
afterEach(() => { Reflect.deleteProperty(window, "requestIdleCallback"); Reflect.deleteProperty(window, "cancelIdleCallback"); vi.useRealTimers(); setOnline(true); });

describe("21E.1 slice 2 — whenIdle", () => {
  it("uses requestIdleCallback with a timeout, calls the task WITHOUT the IdleDeadline, and the returned function cancels it", () => {
    let scheduled: ((deadline: unknown) => void) | null = null;
    const ric = vi.fn((cb: (deadline: unknown) => void) => { scheduled = cb; return 42; }), cic = vi.fn();
    Object.assign(window, { requestIdleCallback: ric, cancelIdleCallback: cic });
    const task = vi.fn();
    const cancel = m.whenIdle(task, 1500);
    expect(ric).toHaveBeenCalledWith(expect.any(Function), { timeout: 1500 });
    scheduled!({ didTimeout: false, timeRemaining: () => 10 });
    expect(task).toHaveBeenCalledTimes(1);
    expect(task.mock.calls[0]).toEqual([]);
    cancel();
    expect(cic).toHaveBeenCalledWith(42);
  });
  it("falls back to a short timer (≤ 1200 ms) that the returned function cancels", () => {
    vi.useFakeTimers();
    const task = vi.fn();
    m.whenIdle(task, 5000);
    vi.advanceTimersByTime(1199);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledTimes(1);
    const other = vi.fn();
    m.whenIdle(other)();
    vi.advanceTimersByTime(5000);
    expect(other).not.toHaveBeenCalled();
  });
});

describe("21E.1 slice 2 — prefetchConfirmDialog", () => {
  it("never loads while offline", () => {
    setOnline(false);
    const load = vi.fn(() => Promise.resolve());
    m.prefetchConfirmDialog(load);
    m.prefetchConfirmDialog(load);
    expect(load).not.toHaveBeenCalled();
    expect(m.isConfirmDialogReady()).toBe(false);
  });
  it("loads exactly once however often it is asked, then reports ready and notifies subscribers once", async () => {
    const load = vi.fn(() => Promise.resolve());
    const listener = vi.fn();
    m.subscribeConfirmDialogReady(listener);
    m.prefetchConfirmDialog(load);
    m.prefetchConfirmDialog(load);                                                // while loading
    await Promise.resolve(); await Promise.resolve();
    expect(m.isConfirmDialogReady()).toBe(true);
    m.prefetchConfirmDialog(load);                                                // when done
    expect(load).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("a failed load is silent, leaves it not ready, and a later call may try again; an unsubscribed listener hears nothing", async () => {
    const listener = vi.fn();
    m.subscribeConfirmDialogReady(listener)();                                    // unsubscribed at once
    const fail = vi.fn(() => Promise.reject(new TypeError("Failed to fetch dynamically imported module")));
    m.prefetchConfirmDialog(fail);
    await Promise.resolve(); await Promise.resolve();
    expect(m.isConfirmDialogReady()).toBe(false);
    const ok = vi.fn(() => Promise.resolve());
    m.prefetchConfirmDialog(ok);
    await Promise.resolve(); await Promise.resolve();
    expect(fail).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(m.isConfirmDialogReady()).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });
  it("the default loader is a PLAIN import of the same module as the lazy dialog (never lazyWithRetry: a failed prefetch can never reload the page)", () => {
    const prefetch = readFileSync(path.join(process.cwd(), "src", "ui", "confirmPrefetch.ts"), "utf8").replace(/\/\/[^\n]*/g, "");
    expect(prefetch).toMatch(/load: \(\) => Promise<unknown> = \(\) => import\("\.\/ConfirmDialog"\)/);
    expect(prefetch).not.toMatch(/lazyWithRetry|lazy\(/);
    const deferred = readFileSync(path.join(process.cwd(), "src", "ui", "useDeferredConfirm.tsx"), "utf8");
    expect(deferred).toMatch(/lazy\(lazyWithRetry\(\(\) => import\("\.\/ConfirmDialog"\), "shared-confirm-dialog"\)\)/);
  });
});
