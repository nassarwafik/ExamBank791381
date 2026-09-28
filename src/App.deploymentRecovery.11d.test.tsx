// @vitest-environment happy-dom
//
// Phase 11D — deployment recovery on a REAL App-level teacher destination (Reports), through the exact production
// machinery: App.tsx's own `lazy(lazyWithRetry(() => import("./reports/ReportsCenter"), "teacher-reports"))` →
// React.lazy → the App's Suspense → the global ErrorBoundary that wraps <App/> in main.tsx.
//
// The only seam is the NETWORK fetch of the chunk: `lazyWithRetry` itself is the real implementation, but for the key
// "teacher-reports" its factory can be replaced by a rejecting one (a stale-deployment TypeError, or an ordinary Error).
// Each test imports a FRESH App module (vi.resetModules) because React.lazy caches a resolved/rejected module for the
// lifetime of the lazy component.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";

const seam = vi.hoisted(() => ({ fail: null as null | (() => Promise<never>), calls: 0 }));
vi.mock("./lazyWithRetry", async importOriginal => {
  const actual = await importOriginal<typeof import("./lazyWithRetry")>();
  return {
    ...actual,
    lazyWithRetry: <T,>(factory: () => Promise<T>, key: string) =>
      actual.lazyWithRetry(() => { if (key === "teacher-reports") { seam.calls++; if (seam.fail) return seam.fail() as Promise<T>; } return factory(); }, key),
  };
});

const KEY = "examBankChunkReload:teacher-reports";
const staleChunk = () => Promise.reject(Object.assign(new Error("Failed to fetch dynamically imported module: https://app.example/assets/ReportsCenter-OLDHASH.js"), { name: "TypeError" }));
const runtimeError = () => Promise.reject(new Error("ReportsCenter crashed while evaluating"));
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);

function installFetch() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/platform-login")) return res(200, { ok: true, role: "teacher", token: "teacher-token", displayName: "المعلم" });
    if (url.includes("/api/teacher-analytics")) return res(500, { ok: false, error: "x" });
    return res(200, { ok: true, classes: [], students: [], assignments: [], projects: [], items: [], posts: [], totalUnread: 0, capped: false, byProject: {}, totalReadyForReview: 0 });
  }) as unknown as typeof fetch;
}
let reload: ReturnType<typeof vi.fn>;
async function mountApp() {
  vi.resetModules();
  const { default: App } = await import("./App");
  const { default: ErrorBoundary } = await import("./ErrorBoundary");
  render(<ErrorBoundary><App /></ErrorBoundary>);                                 // the main.tsx composition
  fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, { target: { value: "T" } });
  fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "pw" } });
  fireEvent.submit(document.querySelector("form.auth-form") as HTMLFormElement);
  await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy());
}
const openReports = async () => {
  const nav = within(screen.getByRole("complementary", { name: "التنقل الرئيسي" }));
  await act(async () => { fireEvent.click(nav.getByRole("button", { name: /^التقارير/ })); });
};
const session = () => ({ token: sessionStorage.getItem("examBankBuilderToken"), role: sessionStorage.getItem("examBankSessionRole") });

beforeEach(() => {
  seam.fail = null; seam.calls = 0;
  try { sessionStorage.clear(); } catch { /* ignore */ }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  installFetch();
  reload = vi.fn();
  vi.spyOn(window.location, "reload").mockImplementation(reload as unknown as () => void);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("11D — App-level teacher destination (Reports) deployment recovery", () => {
  it("1+6: a normal load opens the real Reports view; a successful import clears a leftover recovery marker; no reload", async () => {
    sessionStorage.setItem(KEY, "1");                                          // left over from an earlier recovered deploy
    await mountApp();
    await openReports();
    expect(await screen.findByRole("region", { name: "مركز التقارير" })).toBeTruthy();
    expect(seam.calls).toBe(1);
    expect(sessionStorage.getItem(KEY)).toBeNull();                             // success → future deploys can recover again
    expect(reload).not.toHaveBeenCalled();
  });

  it("2+3+5: a stale old chunk triggers exactly ONE controlled reload, the loading state stays, the teacher session is untouched", async () => {
    await mountApp();
    const before = session();
    expect(before.token).toBe("teacher-token");
    const snapshot = () => Object.fromEntries(Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i)!).map(k => [k, sessionStorage.getItem(k)]));
    const storeBefore = snapshot();
    seam.fail = staleChunk;
    await openReports();
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(screen.getAllByRole("status").some(s => s.textContent === "جارٍ التحميل...")).toBe(true);   // Suspense fallback remains
    expect(screen.queryByText("تم تحديث الموقع")).toBeNull();                                          // not the fatal boundary
    expect(screen.queryByText("حدث خطأ غير متوقع")).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBe("1");                                                     // the only thing written
    expect(session()).toEqual(before);                                                                 // token + role untouched
    expect(snapshot()).toEqual({ ...storeBefore, [KEY]: "1" });                                       // exactly one key added: the "1" marker, nothing removed/overwritten
    await act(async () => { await new Promise(r => setTimeout(r, 30)); });
    expect(reload).toHaveBeenCalledTimes(1);                                                           // still exactly once
  });

  it("4+5: with the recovery marker already set, another stale-chunk failure does NOT reload again and reaches the ErrorBoundary's calm «site updated» screen; session kept", async () => {
    await mountApp();
    const before = session();
    sessionStorage.setItem(KEY, "1");                                            // the one reload already happened
    seam.fail = staleChunk;
    await openReports();
    expect(await screen.findByText("تم تحديث الموقع")).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
    expect(session()).toEqual(before);
    expect(sessionStorage.getItem(KEY)).toBe("1");
  });

  it("7: an ordinary runtime Error while loading the view is NOT a deploy mismatch: no reload, no marker, the honest runtime boundary", async () => {
    await mountApp();
    seam.fail = runtimeError;
    await openReports();
    expect(await screen.findByText("حدث خطأ غير متوقع")).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("8: when sessionStorage throws, a stale chunk can NOT loop: no automatic reload, the error surfaces to the boundary", async () => {
    await mountApp();
    seam.fail = staleChunk;
    // the recovery marker's storage is unavailable (quota / privacy mode); the App's own session keys keep working
    const real = window.sessionStorage;
    const blocked = (k: string) => k.startsWith("examBankChunkReload:");
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => { if (blocked(k)) throw new Error("storage disabled"); return real.getItem(k); },
      setItem: (k: string, v: string) => { if (blocked(k)) throw new Error("storage disabled"); real.setItem(k, v); },
      removeItem: (k: string) => { if (blocked(k)) throw new Error("storage disabled"); real.removeItem(k); },
      clear: () => real.clear(), key: (i: number) => real.key(i), get length() { return real.length; },
    });
    await openReports();
    expect(await screen.findByText("تم تحديث الموقع")).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
  });
});
