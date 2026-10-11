// @vitest-environment happy-dom
// Phase 21E.1 (slice 2) — warming the shared confirmation chunk: `whenIdle` schedules on requestIdleCallback (else a short timer) and
// can be cancelled; `prefetchConfirmDialog` is a plain import (never the chunk-reload recovery), skipped while offline.
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const loads = vi.hoisted(() => ({ n: 0 }));
vi.mock("./ConfirmDialog", () => { loads.n++; return { default: () => null, ConfirmDialog: () => null }; });

import { prefetchConfirmDialog, whenIdle } from "./confirmPrefetch";

type IdleWindow = Window & { requestIdleCallback?: unknown; cancelIdleCallback?: unknown };
const setOnline = (v: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => v });
afterEach(() => { Reflect.deleteProperty(window, "requestIdleCallback"); Reflect.deleteProperty(window, "cancelIdleCallback"); vi.useRealTimers(); setOnline(true); });

describe("21E.1 slice 2 — whenIdle", () => {
  it("uses requestIdleCallback with a timeout, and the returned function cancels it", () => {
    const ric = vi.fn(() => 42), cic = vi.fn();
    Object.assign(window as IdleWindow, { requestIdleCallback: ric, cancelIdleCallback: cic });
    const task = vi.fn();
    const cancel = whenIdle(task, 1500);
    expect(ric).toHaveBeenCalledWith(task, { timeout: 1500 });
    cancel();
    expect(cic).toHaveBeenCalledWith(42);
  });
  it("falls back to a short timer (≤ 1200 ms) that the returned function cancels", () => {
    vi.useFakeTimers();
    const task = vi.fn();
    whenIdle(task, 5000);
    vi.advanceTimersByTime(1199);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledTimes(1);
    const other = vi.fn();
    whenIdle(other)();
    vi.advanceTimersByTime(5000);
    expect(other).not.toHaveBeenCalled();
  });
});

describe("21E.1 slice 2 — prefetchConfirmDialog", () => {
  it("does nothing while offline, then loads the confirmation module once when online", async () => {
    setOnline(false);
    prefetchConfirmDialog();
    await new Promise(r => setTimeout(r, 0));
    expect(loads.n).toBe(0);
    setOnline(true);
    prefetchConfirmDialog();
    await vi.waitFor(() => expect(loads.n).toBe(1));
    prefetchConfirmDialog();
    await new Promise(r => setTimeout(r, 0));
    expect(loads.n).toBe(1);
  });
  it("is a PLAIN import of the same module as the lazy dialog (never lazyWithRetry: a failed prefetch can never reload the page)", () => {
    const prefetch = readFileSync(path.join(process.cwd(), "src", "ui", "confirmPrefetch.ts"), "utf8").replace(/\/\/[^\n]*/g, "");
    expect(prefetch).toMatch(/import\("\.\/ConfirmDialog"\)\.then\(/);
    expect(prefetch).not.toMatch(/lazyWithRetry|lazy\(/);
    const deferred = readFileSync(path.join(process.cwd(), "src", "ui", "useDeferredConfirm.tsx"), "utf8");
    expect(deferred).toMatch(/lazy\(lazyWithRetry\(\(\) => import\("\.\/ConfirmDialog"\), "shared-confirm-dialog"\)\)/);
  });
});
