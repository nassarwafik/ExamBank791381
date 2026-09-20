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
    // §5/§6 — the boot probe carries the Bearer token ONLY (role recovery), never a role-specific header.
    const probe = calls.find(c => c.url.includes("/api/platform-session"));
    expect(probe?.headers.get("authorization")).toBe("Bearer student-token");
    expect(probe?.headers.get("x-builder-token")).toBeNull();
    expect(probe?.headers.get("x-student-token")).toBeNull();
  });

  it("§6: a valid STUDENT token with a STALE stored role 'teacher' is recovered to student — no teacher request fires", async () => {
    // Stored role wrongly says teacher, but platform-session authoritatively returns student.
    seedSession("teacher", "student-token", "STALE");
    const calls = installFetch({ session: () => res(200, { ok: true, role: "student", displayName: "أحمد محمد" }) });
    render(<App />);
    expect(await screen.findByText(/مرحبًا أحمد محمد/)).toBeTruthy();   // rendered as STUDENT
    expect(calls.filter(c => c.url.includes("/api/project-tracker"))).toHaveLength(0); // never a wrong-role teacher call
  });

  it("§6: no teacher-only request fires before session validation completes", async () => {
    // Hold platform-session open; assert project-tracker is NOT called during the pending window.
    let resolveSession: (r: Response) => void = () => {};
    const gate = new Promise<Response>(r => { resolveSession = r; });
    seedSession("teacher");
    const calls = installFetch({ session: () => gate, projectTracker: 200 });
    render(<App />);
    // While validation is pending, the teacher-only effect must be gated off.
    await waitFor(() => expect(document.querySelector(".auth-sub")?.textContent).toMatch(/جارٍ التحقق/));
    expect(calls.filter(c => c.url.includes("/api/project-tracker"))).toHaveLength(0);
    resolveSession(await res(200, { ok: true, role: "teacher", displayName: "المعلم" }));
    // After validation completes, the teacher effect is now allowed to run.
    await waitFor(() => expect(calls.some(c => c.url.includes("/api/project-tracker"))).toBe(true));
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

  it("a network error during validation keeps the session (not proven invalid) but holds the retry state — no app on a stale role", async () => {
    seedSession("student");
    const calls = installFetch({ session: () => Promise.reject(new Error("network")) });
    render(<App />);
    // §2 — the token is NOT cleared, but we do NOT enter the app on the stale role: a calm retry state is shown.
    await waitFor(() => expect(screen.getByText(/تعذّر التحقق من الجلسة/)).toBeTruthy());
    expect(screen.queryByText(/مرحبًا أحمد محمد/)).toBeNull();          // never the portal on an unverified role
    expect(sessionStorage.getItem("examBankBuilderToken")).toBe("student-token"); // session preserved
    expect(calls.filter(c => c.url.includes("/api/student-dashboard"))).toHaveLength(0); // no role-specific request
  });

  // PROD HOTFIX §2 — a TRANSIENT server/hosting failure during boot validation (deployment cold-start, gateway blip)
  // must NEVER be treated as an invalid session (contract: only 401 revokes) AND must never launch the app from the
  // unverified stored role. The session is preserved and a controlled retry state is held.
  for (const status of [500, 502, 503, 429]) {
    it(`a transient platform-session ${status} preserves the session but holds the retry state (no app on a stale role)`, async () => {
      seedSession("student");
      const calls = installFetch({ session: () => res(status, { error: "temporarily unavailable" }) });
      render(<App />);
      await waitFor(() => expect(screen.getByText(/تعذّر التحقق من الجلسة/)).toBeTruthy());
      expect(screen.queryByText(/مرحبًا أحمد محمد/)).toBeNull();
      expect(document.querySelector("form.auth-form")).toBeNull();     // not logged out either
      expect(sessionStorage.getItem("examBankBuilderToken")).toBe("student-token");
      expect(sessionStorage.getItem("examBankSessionRole")).toBe("student");
      expect(calls.filter(c => c.url.includes("/api/student-dashboard"))).toHaveLength(0);
    });
  }

  it("a malformed 200 (no ok/role) is treated as transient, NOT as revocation — session kept, retry state held", async () => {
    seedSession("student");
    installFetch({ session: () => res(200, { unexpected: true }) });
    render(<App />);
    await waitFor(() => expect(screen.getByText(/تعذّر التحقق من الجلسة/)).toBeTruthy());
    expect(screen.queryByText(/مرحبًا أحمد محمد/)).toBeNull();
    expect(sessionStorage.getItem("examBankBuilderToken")).toBe("student-token");
  });

  it("§2 (1): stored TEACHER role + a valid STUDENT token + 503 → token preserved, NO teacher request, NO wrong-role portal; retry recovers to student", async () => {
    // The stored role wrongly says teacher; the token is really a student's. A transient 503 must NOT launch a
    // teacher-only request with the student token (which would 401 → logout and destroy the valid student session).
    seedSession("teacher", "student-token", "STALE");
    let n = 0;
    const calls = installFetch({ session: () => { n += 1; return n === 1 ? res(503, { error: "x" }) : res(200, { ok: true, role: "student", displayName: "أحمد محمد" }); } });
    render(<App />);
    await waitFor(() => expect(screen.getByText(/تعذّر التحقق من الجلسة/)).toBeTruthy());
    expect(sessionStorage.getItem("examBankBuilderToken")).toBe("student-token");     // token preserved
    expect(calls.filter(c => c.url.includes("/api/project-tracker"))).toHaveLength(0); // NO teacher-only request
    expect(screen.queryByText(/مرحبًا/)).toBeNull();                                   // NO wrong-role portal
    fireEvent.click(screen.getByRole("button"));                                       // retry
    expect(await screen.findByText(/مرحبًا أحمد محمد/)).toBeTruthy();                  // recovers to STUDENT
    expect(calls.filter(c => c.url.includes("/api/project-tracker"))).toHaveLength(0); // still never a teacher call
  });

  it("§2 (2): stored STUDENT role + a valid TEACHER token + 503 → token preserved, NO wrong-role student request; retry recovers to teacher", async () => {
    seedSession("student", "teacher-token", "STALE");
    let n = 0;
    const calls = installFetch({ session: () => { n += 1; return n === 1 ? res(503, { error: "x" }) : res(200, { ok: true, role: "teacher", displayName: "المعلم" }); }, projectTracker: 200 });
    render(<App />);
    await waitFor(() => expect(screen.getByText(/تعذّر التحقق من الجلسة/)).toBeTruthy());
    expect(sessionStorage.getItem("examBankBuilderToken")).toBe("teacher-token");        // token preserved
    expect(calls.filter(c => c.url.includes("/api/student-dashboard"))).toHaveLength(0);  // NO wrong-role student request
    fireEvent.click(screen.getByRole("button"));                                          // retry
    await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy()); // recovers to TEACHER
    expect(calls.filter(c => c.url.includes("/api/student-dashboard"))).toHaveLength(0);  // never a student call
  });

  it("ONLY an authoritative 401 clears the session (contract revocation)", async () => {
    seedSession("student", "revoked-token");
    installFetch({ session: () => res(401, { ok: false, error: "Unauthorized" }) });
    render(<App />);
    await waitFor(() => expect(document.querySelector("form.auth-form")).toBeTruthy());
    expect(sessionStorage.getItem("examBankBuilderToken")).toBeNull();
  });
});
