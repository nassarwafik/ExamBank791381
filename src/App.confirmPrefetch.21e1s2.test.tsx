// @vitest-environment happy-dom
// Phase 21E.1 (slice 2) — the real App warms the shared confirmation chunk on idle ONLY once a TEACHER session is validated by the
// server (never for a visitor on the sign-in page, never for a student), so the teacher's first confirmation opens at once without
// growing the initial bundle. Fail-first: on main b8a65f1 the App never calls prefetchConfirmDialog.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, act } from "@testing-library/react";

const spy = vi.hoisted(() => ({ prefetch: vi.fn(), idle: vi.fn() }));
vi.mock("./ui/confirmPrefetch", async importOriginal => {
  const actual = await importOriginal<typeof import("./ui/confirmPrefetch")>();
  return { ...actual, prefetchConfirmDialog: spy.prefetch, whenIdle: (task: () => void) => { spy.idle(); task(); return () => {}; } };
});
import App from "./App";

const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
function installFetch(role: "teacher" | "student") {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/platform-session")) return res(200, { ok: true, role, displayName: "مستخدم" });
    if (url.includes("/api/teacher-profile")) return res(200, { ok: true, profile: { teacherId: "t1", displayName: "أ. أحمد", hasCustomName: false, avatarId: "", profilePhoto: null, updatedAt: "" } });
    if (url.includes("/api/project-tracker")) return res(200, { ok: true, projects: [], totalReadyForReview: 0, byProject: {} });
    if (url.includes("/api/messages")) return res(200, { ok: true, totalUnread: 0, capped: false });
    return res(200, { ok: true });
  }) as unknown as typeof fetch;
}
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 300)); });
const signIn = (role: "teacher" | "student") => {
  sessionStorage.setItem("examBankBuilderToken", role + "-token");
  sessionStorage.setItem("examBankSessionRole", role);
  sessionStorage.setItem("examBankSessionDisplayName", "مستخدم");
};
beforeEach(() => {
  spy.prefetch.mockReset(); spy.idle.mockReset();
  try { sessionStorage.clear(); } catch { /* ignore */ }
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("21E.1 slice 2 — App warms the confirmation dialog for a validated teacher only", () => {
  it("validated teacher session → scheduled on idle and prefetched once", async () => {
    installFetch("teacher"); signIn("teacher");
    render(<App />);
    await screen.findByRole("button", { name: /الامتحانات المحفوظة/ }, { timeout: 5000 });
    await settle();
    expect(spy.idle).toHaveBeenCalledTimes(1);
    expect(spy.prefetch).toHaveBeenCalledTimes(1);
  });
  it("no session (the sign-in page) → never prefetched", async () => {
    installFetch("teacher");
    render(<App />);
    await settle();
    expect(spy.prefetch).not.toHaveBeenCalled();
  });
  it("a student session → never prefetched", async () => {
    installFetch("student"); signIn("student");
    render(<App />);
    await settle();
    expect(spy.prefetch).not.toHaveBeenCalled();
  });
});
