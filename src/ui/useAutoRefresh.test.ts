// @vitest-environment happy-dom
// Phase 1 auto-refresh hook: interval + focus + visibility triggers around a caller-owned `refetch`, with
// single-flight, hidden-tab pausing, no stacked timers, and full cleanup. Fake timers throughout; no brittle
// wall-clock assertions — every wait is an explicit advance or microtask flush.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutoRefresh } from "./useAutoRefresh";

beforeEach(() => { vi.useFakeTimers(); setVisibility("visible"); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); setVisibility("visible"); });

// happy-dom exposes document.visibilityState as a getter; redefine it so the hook's visibility gate can be driven.
function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}
// Flush the microtask chain inside run() (Promise.resolve().then(refetch).finally(...)).
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("useAutoRefresh", () => {
  it("1: fires refetch every 15s while visible", async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useAutoRefresh(refetch, { intervalMs: 15000 }));
    expect(refetch).not.toHaveBeenCalled();                 // no immediate call on mount
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(refetch).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it("2: window focus triggers an immediate refetch", async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useAutoRefresh(refetch, { intervalMs: 15000 }));
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await flush();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("3: visibilitychange → visible triggers an immediate refetch", async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    setVisibility("hidden");
    renderHook(() => useAutoRefresh(refetch, { intervalMs: 15000 }));
    setVisibility("visible");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await flush();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("4: a hidden document does not keep polling", async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useAutoRefresh(refetch, { intervalMs: 15000 }));
    // go hidden → the interval is torn down
    setVisibility("hidden");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(refetch).not.toHaveBeenCalled();
    // a focus while hidden must also not fetch
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await flush();
    expect(refetch).not.toHaveBeenCalled();
  });

  it("5: overlapping triggers are skipped while a refetch is in flight (single-flight)", async () => {
    let resolveIt: () => void = () => {};
    const refetch = vi.fn(() => new Promise<void>(r => { resolveIt = r; }));
    renderHook(() => useAutoRefresh(refetch, { intervalMs: 15000 }));
    await act(async () => { window.dispatchEvent(new Event("focus")); });   // starts request #1 (never resolves yet)
    await flush();
    await act(async () => { window.dispatchEvent(new Event("focus")); });   // skipped — one in flight
    await flush();
    expect(refetch).toHaveBeenCalledTimes(1);
    await act(async () => { resolveIt(); await Promise.resolve(); });        // request #1 settles → lock released
    await act(async () => { window.dispatchEvent(new Event("focus")); });   // now allowed again
    await flush();
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it("6: a rejected refetch releases the in-flight lock (never permanently locked)", async () => {
    const refetch = vi.fn().mockRejectedValue(new Error("boom"));
    renderHook(() => useAutoRefresh(refetch, { intervalMs: 15000 }));
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await flush();
    expect(refetch).toHaveBeenCalledTimes(1);
    await act(async () => { window.dispatchEvent(new Event("focus")); });   // lock was released by the rejection
    await flush();
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it("7: re-render (new refetch identity) does not stack duplicate intervals", async () => {
    const a = vi.fn().mockResolvedValue(undefined);
    const b = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ fn }) => useAutoRefresh(fn, { intervalMs: 15000 }), { initialProps: { fn: a } });
    rerender({ fn: b });                                     // same enabled/intervalMs → effect must NOT re-arm
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(a).not.toHaveBeenCalled();                        // latest closure is used
    expect(b).toHaveBeenCalledTimes(1);                      // exactly one interval, one call per tick (not stacked)
  });

  it("8: unmount clears the interval and removes listeners", async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useAutoRefresh(refetch, { intervalMs: 15000 }));
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(refetch).not.toHaveBeenCalled();
  });

  it("disabled → never fires", async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useAutoRefresh(refetch, { intervalMs: 15000, enabled: false }));
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    window.dispatchEvent(new Event("focus"));
    await flush();
    expect(refetch).not.toHaveBeenCalled();
  });
});
