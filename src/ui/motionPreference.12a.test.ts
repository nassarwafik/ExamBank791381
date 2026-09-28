// @vitest-environment happy-dom
// Phase 12A — the device-level motion preference: the OS hint stays the default; an explicit "on" / "off" wins in
// either direction; storage failure never blocks the choice for the current page; the hook re-renders on change.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MOTION_OVERRIDE_KEY, getMotionOverride, setMotionOverride, subscribeMotionOverride, effectiveMotionOverride } from "./motionPreference";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

function setOs(reduced: boolean) {
  const listeners = new Set<() => void>();
  const mql = { matches: reduced, media: "(prefers-reduced-motion: reduce)", addEventListener: (_: string, l: () => void) => listeners.add(l), removeEventListener: (_: string, l: () => void) => listeners.delete(l) };
  (window as unknown as { matchMedia: unknown }).matchMedia = () => mql;
  return { fire: (matches: boolean) => { mql.matches = matches; listeners.forEach(l => l()); } };
}

beforeEach(() => { try { localStorage.removeItem(MOTION_OVERRIDE_KEY); } catch { /* ignore */ } setMotionOverride(null); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); setMotionOverride(null); });

describe("motionPreference store", () => {
  it("has no override by default, stores exactly the literal 'on' / 'off' under one fixed key, and clears with null", () => {
    expect(getMotionOverride()).toBeNull();
    setMotionOverride("on");
    expect(localStorage.getItem(MOTION_OVERRIDE_KEY)).toBe("on");
    expect(getMotionOverride()).toBe("on");
    setMotionOverride("off");
    expect(localStorage.getItem(MOTION_OVERRIDE_KEY)).toBe("off");
    setMotionOverride(null);
    expect(localStorage.getItem(MOTION_OVERRIDE_KEY)).toBeNull();
    expect(getMotionOverride()).toBeNull();
    expect(MOTION_OVERRIDE_KEY).toBe("examBankMotion");                      // no PII, no session data in the key
  });
  it("ignores a foreign value in storage (treated as 'no choice')", () => {
    localStorage.setItem(MOTION_OVERRIDE_KEY, "maybe");
    expect(getMotionOverride()).toBeNull();
    expect(effectiveMotionOverride()).toBeNull();
  });
  it("notifies subscribers on every change and stops after unsubscribe", () => {
    const l = vi.fn();
    const off = subscribeMotionOverride(l);
    setMotionOverride("on");
    expect(l).toHaveBeenCalledTimes(1);
    off();
    setMotionOverride("off");
    expect(l).toHaveBeenCalledTimes(1);
  });
  it("mirrors the effective choice on <html data-eb-motion> so the CSS reduced-motion safety nets can yield to an explicit ON", () => {
    expect(document.documentElement.getAttribute("data-eb-motion")).toBeNull();
    setMotionOverride("on");
    expect(document.documentElement.getAttribute("data-eb-motion")).toBe("on");
    setMotionOverride("off");
    expect(document.documentElement.getAttribute("data-eb-motion")).toBe("off");
    setMotionOverride(null);
    expect(document.documentElement.getAttribute("data-eb-motion")).toBeNull();
    // a choice already on the device is reflected as soon as something subscribes (first render of any hook consumer)
    localStorage.setItem(MOTION_OVERRIDE_KEY, "on");
    const off = subscribeMotionOverride(() => {});
    expect(document.documentElement.getAttribute("data-eb-motion")).toBe("on");
    off();
  });
  it("storage unavailable: reading yields null, choosing still applies in memory and never throws", () => {
    const real = window.localStorage;
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); }, clear: () => real.clear(), key: () => null, length: 0 });
    expect(getMotionOverride()).toBeNull();
    expect(() => setMotionOverride("on")).not.toThrow();
    expect(effectiveMotionOverride()).toBe("on");
    setMotionOverride(null);
    expect(effectiveMotionOverride()).toBeNull();
  });
});

describe("usePrefersReducedMotion — OS hint by default, explicit choice wins", () => {
  it("no choice → mirrors the OS hint (both directions) and follows a live media-query change", () => {
    const os = setOs(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
    act(() => os.fire(false));
    expect(result.current).toBe(false);
  });
  it("OS says reduce, the viewer chose 'on' → motion (false); choosing 'off' again → reduced (true); the hook re-renders on the change", () => {
    setOs(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
    act(() => setMotionOverride("on"));
    expect(result.current).toBe(false);
    act(() => setMotionOverride("off"));
    expect(result.current).toBe(true);
    act(() => setMotionOverride(null));
    expect(result.current).toBe(true);                                        // back to the OS hint
  });
  it("OS has no preference, the viewer chose 'off' → reduced (true): the choice also works against motion", () => {
    setOs(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
    act(() => setMotionOverride("off"));
    expect(result.current).toBe(true);
  });
  it("a choice already stored on the device is honoured on first render", () => {
    setOs(true);
    localStorage.setItem(MOTION_OVERRIDE_KEY, "on");
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });
});
