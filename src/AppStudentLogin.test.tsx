// @vitest-environment happy-dom
//
// Reproduces the exact production login-bounce: after a STUDENT logs in, the App-level teacher-only
// effects must NOT fire /api/project-tracker (a builder-auth endpoint) with the student token — doing so
// returns 401 and the generic apiRequest would call handleLogout(), erasing the valid student session.
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

// Records every fetched URL + its headers so we can assert what a session did (and did NOT) request.
function installFetch(role: "student" | "teacher", opts: { projectTracker?: number } = {}) {
  const calls: { url: string; headers: Headers }[] = [];
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init?.headers || {}) });
    if (url.includes("/api/platform-login")) return res(200, { ok: true, role, token: role + "-token", displayName: "أحمد محمد" });
    if (url.includes("/api/student-dashboard")) return res(200, DASHBOARD_OK);
    if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
    if (url.includes("/api/student-project-tracker")) return res(200, { ok: true, enrolled: false });
    if (url.includes("/api/project-tracker")) return res(opts.projectTracker ?? 200, opts.projectTracker && opts.projectTracker >= 400 ? { ok: false, error: "unauthorized" } : { ok: true, projects: [], totalReadyForReview: 0, byProject: {} });
    return res(200, { ok: true });
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return calls;
}

const projectTrackerCalls = (calls: { url: string }[]) => calls.filter(c => c.url.includes("/api/project-tracker"));

async function login() {
  const codeInput = document.querySelector('input[autocomplete="username"]') as HTMLInputElement;
  const passInput = document.querySelector('input[type="password"]') as HTMLInputElement;
  fireEvent.change(codeInput, { target: { value: "S-1" } });
  fireEvent.change(passInput, { target: { value: "pw" } });
  fireEvent.submit(document.querySelector("form.auth-form") as HTMLFormElement);
}

beforeEach(() => { try { sessionStorage.clear(); } catch { /* ignore */ } });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("App role isolation — student login must not fire teacher endpoints (production bounce)", () => {
  it("7 (CRITICAL): student login → dashboard shows, NOT bounced, and /api/project-tracker is NEVER called", async () => {
    const calls = installFetch("student");
    render(<App />);
    await login();

    // student portal is shown (dashboard rendered) …
    expect(await screen.findByText(/مرحبًا أحمد محمد/)).toBeTruthy();
    // … the login form is gone (student was NOT logged out) …
    await waitFor(() => expect(document.querySelector("form.auth-form")).toBeNull());
    // … and the teacher-only builder endpoint was never requested during the student session.
    expect(projectTrackerCalls(calls)).toHaveLength(0);
  });

  it("10: no automatic request sends the student token to a builder endpoint (x-builder-token)", async () => {
    const calls = installFetch("student");
    render(<App />);
    await login();
    await screen.findByText(/مرحبًا أحمد محمد/);
    // Nothing hit /api/project-tracker at all → certainly not with x-builder-token: <student-token>.
    const leaked = calls.filter(c => c.url.includes("/api/project-tracker") && c.headers.get("x-builder-token"));
    expect(leaked).toHaveLength(0);
  });

  it("student-dashboard 401 STILL logs the student out (primary auth preserved)", async () => {
    const calls: { url: string }[] = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input); calls.push({ url });
      if (url.includes("/api/platform-login")) return res(200, { ok: true, role: "student", token: "student-token", displayName: "أحمد" });
      if (url.includes("/api/student-dashboard")) return res(401, { ok: false, error: "انتهت الجلسة" });
      return res(200, { ok: true });
    }) as unknown as typeof fetch;
    render(<App />);
    await login();
    // primary dashboard 401 → global logout → back to the login form
    await waitFor(() => expect(document.querySelector("form.auth-form")).toBeTruthy());
    expect(screen.queryByText(/مرحبًا/)).toBeNull();
  });
});

describe("App role isolation — teacher session behavior preserved", () => {
  it("8: teacher login DOES fire the teacher project-tracker background requests", async () => {
    const calls = installFetch("teacher", { projectTracker: 200 });
    render(<App />);
    await login();
    await waitFor(() => expect(projectTrackerCalls(calls).some(c => c.url.includes("resource=projects"))).toBe(true));
  });

  it("9: teacher session — a teacher-endpoint 401 still logs the teacher out", async () => {
    installFetch("teacher", { projectTracker: 401 });
    render(<App />);
    await login();
    // project-tracker 401 for a teacher → apiRequest → handleLogout → login form returns
    await waitFor(() => expect(document.querySelector("form.auth-form")).toBeTruthy());
  });
});
