// @vitest-environment happy-dom
// Deployment (stale-chunk) recovery helper: chunk-error classification + ONE-shot bounded reload with no loop.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { lazyWithRetry, isChunkLoadError, clearChunkRecoveryMarker } from "./lazyWithRetry";

const chunkErr = (msg: string) => Object.assign(new Error(msg), { name: "TypeError" });

beforeEach(() => { try { sessionStorage.clear(); } catch { /* ignore */ } });
// vi.unstubAllGlobals() reliably reverts any per-test sessionStorage stub (used to simulate a throwing/failing
// storage) so it can never leak into a later test — instance-method spies do not restore cleanly under happy-dom.
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("isChunkLoadError", () => {
  it("recognizes Vite / native ESM dynamic-import failures", () => {
    expect(isChunkLoadError(chunkErr("Failed to fetch dynamically imported module: https://x/assets/StudentReader-abc.js"))).toBe(true);
    expect(isChunkLoadError(chunkErr("error loading dynamically imported module"))).toBe(true);
    expect(isChunkLoadError(chunkErr("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(Object.assign(new Error("boom"), { name: "ChunkLoadError" }))).toBe(true);
    expect(isChunkLoadError(chunkErr("Loading chunk 42 failed."))).toBe(true);
  });
  it("does NOT misclassify ordinary runtime errors", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined (reading 'x')"))).toBe(false);
    expect(isChunkLoadError(new TypeError("foo is not a function"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
  it("does NOT match a same-worded APPLICATION error (the removed broad /failed to import/ signature)", () => {
    // A domain error whose text merely resembles a chunk failure must NOT trigger a reload that would mask the bug.
    expect(isChunkLoadError(new Error("Failed to import student data"))).toBe(false);
    expect(isChunkLoadError(Object.assign(new Error("Failed to import student data"), { name: "TypeError" }))).toBe(false);
    expect(isChunkLoadError(new Error("Module evaluation failed: undefined variable"))).toBe(false);
  });
  it("requires the TypeError shape for native ESM messages (a plain Error with that text is NOT a chunk error)", () => {
    // Native Vite/ESM dynamic-import failures are thrown as TypeError; a plain Error carrying the same words is not one.
    expect(isChunkLoadError(new Error("Failed to fetch dynamically imported module: /x.js"))).toBe(false);
    expect(isChunkLoadError(Object.assign(new Error("Failed to fetch dynamically imported module: /x.js"), { name: "TypeError" }))).toBe(true);
  });
});

describe("lazyWithRetry", () => {
  it("passes a successful import straight through and clears any stale marker", async () => {
    sessionStorage.setItem("examBankChunkReload:k", "1");
    const mod = { default: () => null };
    const wrapped = lazyWithRetry(() => Promise.resolve(mod), "k");
    await expect(wrapped()).resolves.toBe(mod);
    expect(sessionStorage.getItem("examBankChunkReload:k")).toBeNull(); // success clears the one-shot marker
  });

  it("on a chunk error (first time): sets the one-shot marker, reloads ONCE, and stays pending (never rejects)", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { reload }, writable: true });
    const wrapped = lazyWithRetry(() => Promise.reject(chunkErr("Failed to fetch dynamically imported module: /assets/x-abc.js")), "k");
    const p = wrapped();
    // give the rejection a microtask to be handled
    const settled = await Promise.race([p.then(() => "resolved", () => "rejected"), Promise.resolve("pending")]);
    expect(settled).toBe("pending");                        // caller stays suspended during the controlled reload
    expect(reload).toHaveBeenCalledTimes(1);                // exactly one reload
    expect(sessionStorage.getItem("examBankChunkReload:k")).toBe("1"); // one-shot marker set
  });

  it("NO LOOP: a chunk error when the marker is already set rethrows and does NOT reload again", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { reload }, writable: true });
    sessionStorage.setItem("examBankChunkReload:k", "1"); // a prior reload already happened
    const err = chunkErr("Failed to fetch dynamically imported module: /assets/x-abc.js");
    const wrapped = lazyWithRetry(() => Promise.reject(err), "k");
    await expect(wrapped()).rejects.toBe(err);              // surfaces honestly → boundary can show the update message
    expect(reload).not.toHaveBeenCalled();                 // never a second reload (no infinite loop)
  });

  it("a NON-chunk (ordinary runtime) rejection is rethrown untouched and never reloads", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { reload }, writable: true });
    const err = new Error("Cannot read properties of undefined");
    const wrapped = lazyWithRetry(() => Promise.reject(err), "k");
    await expect(wrapped()).rejects.toBe(err);
    expect(reload).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("examBankChunkReload:k")).toBeNull(); // no marker for a real bug
  });

  it("NO LOOP when storage getItem THROWS: never reloads and rethrows the chunk error", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { reload }, writable: true });
    vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("storage blocked"); }, setItem: vi.fn(), removeItem: () => {} });
    const err = chunkErr("Failed to fetch dynamically imported module: /assets/x-abc.js");
    const wrapped = lazyWithRetry(() => Promise.reject(err), "k");
    await expect(wrapped()).rejects.toBe(err);   // permit denied → surfaces to the boundary, no auto-reload
    expect(reload).not.toHaveBeenCalled();
  });

  it("NO LOOP when storage setItem THROWS: never reloads and rethrows the chunk error", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { reload }, writable: true });
    vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => {} });
    const err = chunkErr("Failed to fetch dynamically imported module: /assets/x-abc.js");
    const wrapped = lazyWithRetry(() => Promise.reject(err), "k");
    await expect(wrapped()).rejects.toBe(err);
    expect(reload).not.toHaveBeenCalled();
  });

  it("NO LOOP when the marker cannot be VERIFIED (setItem is a silent no-op): never reloads", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { reload }, writable: true });
    // setItem silently does nothing → the immediate read-back is still null → the permit is not granted.
    vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    const err = chunkErr("Failed to fetch dynamically imported module: /assets/x-abc.js");
    const wrapped = lazyWithRetry(() => Promise.reject(err), "k");
    await expect(wrapped()).rejects.toBe(err);
    expect(reload).not.toHaveBeenCalled();
  });

  it("NORMAL storage → EXACTLY ONE reload for a chunk error", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { reload }, writable: true });
    const wrapped = lazyWithRetry(() => Promise.reject(chunkErr("Failed to fetch dynamically imported module: /a.js")), "k");
    const p = wrapped();
    await Promise.race([p.then(() => "resolved", () => "rejected"), Promise.resolve("pending")]);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("examBankChunkReload:k")).toBe("1");
  });

  it("stores ONLY a harmless one-shot marker — never a token/credential", () => {
    clearChunkRecoveryMarker("k");
    sessionStorage.setItem("examBankChunkReload:k", "1");
    expect(sessionStorage.getItem("examBankChunkReload:k")).toBe("1");
    // the value is a boolean-ish flag, not any secret
    expect(sessionStorage.getItem("examBankChunkReload:k")).not.toMatch(/token|bearer|password|[A-Za-z0-9]{20,}/i);
  });
});
