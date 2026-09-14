// @vitest-environment happy-dom
//
// Roadmap #8 §13/§14 — frontend startup session validation. A stored session is validated against the
// authoritative /api/platform-session BEFORE an authenticated app is rendered; sessionStorage stays the
// token store (never localStorage); a definitive-invalid session is cleared; role isolation is preserved.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent } from "@testing-library/react";
import App from "./App";

const DASHBOARD_OK = {
  student: { userId: "stu-1", code: "S-1", displayName: "أحمد محمد", classId: "c1", shareAchievements: true },
  classroom: { classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026" },
  assignments: [],
  stats: { assigned: 0, completed: 0, average: null }
};
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
type Call = { url: string; headers: Headers };

function seedSession(role: "student" | "teacher", token = role + "-token", displayName = "STORED-NAME") {
  sessionStorage.setItem("examBankBuilderToken", token);
  sessionStorage.setItem("examBankSessionRole", role);
  sessionStorage.setItem("examBankSessionDisplayName", displayName);
}

function installFetch(handlers: { session: () => Promise<Response>; projectTracker?: number }) {
  const calls: Call[] = [];
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init?.headers || {}) });
    if (url.includes("/api/platform-session")) return handlers.session();
    if (url.includes("/api/student-dashboard")) return res(200, DASHBOARD_OK);
    if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
    if (url.includes("/api/student-project-tracker")) return res(200, { ok: true, enrolled: false });
    if (url.includes("/api/project-tracker")) return res(handlers.projectTracker ?? 200, { ok: true, projects: [], totalReadyForReview: 0, byProject: {} });
    return res(200, { ok: true });
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return calls;
}

beforeEach(() => { try { sessionStorage.clear(); localStorage.clear(); } catch { /* ignore */ } });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("R8 App — startup session validation", () => {
  it("AH: a stored valid STUDENT session is validated then the portal renders", async () => {
    seedSession("student");
    installFetch({ session: () => res(200, { ok: true, role: "student", displayName: "أحمد محمد", expiresAt: "2026-01-01T00:00:00.000Z" }) });
    render(<App />);
    expect(await screen.findByText(/مرحبًا أحمد محمد/)).toBeTruthy();
    expect(document.querySelector("form.auth-form")).toBeNull();
  });

  it("AI: a stored valid TEACHER session is validated then the teacher app renders", async () => {
    seedSession("teacher");
    installFetch({ session: () => res(200, { ok: true, role: "teacher", displayName: "المعلم", expiresAt: "2026-01-01T00:00:00.000Z" }), projectTracker: 200 });
    render(<App />);
    // A teacher-only sidebar control appears (logout button) and the login form is gone.
    await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy());
    expect(document.querySelector("form.auth-form")).toBeNull();
  });

  it("AJ: a stale/invalid stored session (platform-session 401) is cleared → login form", async () => {
    seedSession("student", "stale-token");
    installFetch({ session: () => res(401, { ok: false, error: "Unauthorized" }) });
    render(<App />);
    await waitFor(() => expect(document.querySelector("form.auth-form")).toBeTruthy());
    expect(screen.queryByText(/مرحبًا/)).toBeNull();
    expect(sessionStorage.getItem("examBankBuilderToken")).toBeNull();
    expect(sessionStorage.getItem("examBankSessionRole")).toBeNull();
  });

  it("AK: the display name is refreshed from the SERVER, not stale sessionStorage", async () => {
    seedSession("student", "student-token", "STALE-STORED-NAME");
    installFetch({ session: () => res(200, { ok: true, role: "student", displayName: "أحمد محمد", expiresAt: "" }) });
    render(<App />);
    expect(await screen.findByText(/مرحبًا أحمد محمد/)).toBeTruthy();
    expect(screen.queryByText(/STALE-STORED-NAME/)).toBeNull();
  });

  it("AL/AM: the token stays in sessionStorage and is never copied to localStorage", async () => {
    seedSession("student");
    installFetch({ session: () => res(200, { ok: true, role: "student", displayName: "أحمد محمد" }) });
    render(<App />);
    await screen.findByText(/مرحبًا أحمد محمد/);
    expect(sessionStorage.getItem("examBankBuilderToken")).toBe("student-token");
    expect(localStorage.getItem("examBankBuilderToken")).toBeNull();
    expect(localStorage.getItem("examBankSessionRole")).toBeNull();
  });

  it("AN: a validated STUDENT session never calls the teacher-only /api/project-tracker (role isolation)", async () => {
    seedSession("student");
    const calls = installFetch({ session: () => res(200, { ok: true, role: "student", displayName: "أحمد محمد" }) });
    render(<App />);
    await screen.findByText(/مرحبًا أحمد محمد/);
    expect(calls.filter(c => c.url.includes("/api/project-tracker"))).toHaveLength(0);
    // and the session probe used the student header, never a builder header
    const probe = calls.find(c => c.url.includes("/api/platform-session"));
    expect(probe?.headers.get("x-student-token")).toBe("student-token");
    expect(probe?.headers.get("x-builder-token")).toBeNull();
  });

  it("AO: logout clears all session metadata", async () => {
    seedSession("teacher");
    installFetch({ session: () => res(200, { ok: true, role: "teacher", displayName: "المعلم" }), projectTracker: 200 });
    render(<App />);
    const logout = await waitFor(() => { const el = document.querySelector(".app-sidebar-logout") as HTMLElement | null; if (!el) throw new Error("no logout"); return el; });
    fireEvent.click(logout);
    await waitFor(() => expect(document.querySelector("form.auth-form")).toBeTruthy());
    expect(sessionStorage.getItem("examBankBuilderToken")).toBeNull();
    expect(sessionStorage.getItem("examBankSessionRole")).toBeNull();
    expect(sessionStorage.getItem("examBankSessionDisplayName")).toBeNull();
  });

  it("a network error during validation keeps the session (not proven invalid)", async () => {
    seedSession("student");
    installFetch({ session: () => Promise.reject(new Error("network")) });
    render(<App />);
    // portal still renders from the retained session (dashboard fetch succeeds)
    expect(await screen.findByText(/مرحبًا أحمد محمد/)).toBeTruthy();
    expect(sessionStorage.getItem("examBankBuilderToken")).toBe("student-token");
  });
});
