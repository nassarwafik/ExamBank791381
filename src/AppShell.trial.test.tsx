// @vitest-environment happy-dom
// Trial accounts — App-level: the trial end the server sends with the sign-in answer and with the boot probe (/api/platform-session)
// reaches the teacher shell (test data only): the end date, a warning in the last days, nothing for a permanent account.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent, configure } from "@testing-library/react";
configure({ asyncUtilTimeout: 5000 });
import App from "./App";

const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);

function installFetch(loginTrial: unknown, probeTrial?: unknown) {
  const calls: string[] = [];
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input); calls.push(url);
    if (url.includes("/api/platform-login")) return res(200, { ok: true, role: "teacher", token: "teacher-token", displayName: "المعلم", access: { status: "ok", enforced: false, capabilities: [] }, trial: loginTrial });
    if (url.includes("/api/platform-session")) return res(200, { ok: true, role: "teacher", displayName: "المعلم", access: { status: "ok", enforced: false, capabilities: [] }, trial: probeTrial });
    if (url.includes("/api/project-tracker")) {
      if (url.includes("resource=projects-summary")) return res(200, { ok: true, totalReadyForReview: 0, byProject: {} });
      if (url.includes("resource=projects")) return res(200, { ok: true, projects: [] });
      return res(200, { ok: true });
    }
    if (url.includes("/api/classrooms")) return res(200, { ok: true, classes: [] });
    if (url.includes("/api/students")) return res(200, { ok: true, students: [] });
    if (url.includes("/api/assignments")) return res(200, { ok: true, assignments: [] });
    if (url.includes("/api/saved-exams")) return res(200, { ok: true, exams: [] });
    if (url.includes("/api/teacher-analytics")) return res(500, { ok: false, error: "x" });
    return res(200, { ok: true });
  }) as unknown as typeof fetch;
  return calls;
}
async function login() {
  fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, { target: { value: "t.sara" } });
  fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "pw" } });
  fireEvent.submit(document.querySelector("form.auth-form") as HTMLFormElement);
  await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy());
}
const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

beforeEach(() => { try { sessionStorage.clear(); } catch { /* ignore */ } window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => true })) as unknown as typeof window.matchMedia; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("trial accounts — App", () => {
  it("the sign-in answer's trial shows the end date in the teacher shell", async () => {
    installFetch({ endsAt: inDays(10), endingSoon: false });
    render(<App />); await login();
    await waitFor(() => expect(document.querySelector(".eb-trial-notice")?.textContent).toContain("حسابك تجريبي حتى"));
  });
  it("in the last days the sign-in answer's trial is a warning", async () => {
    installFetch({ endsAt: inDays(2), endingSoon: true });
    render(<App />); await login();
    await waitFor(() => expect(document.querySelector(".eb-trial-notice.is-warning")?.textContent).toContain("تنبيه: تنتهي تجربتك"));
  });
  it("a permanent teacher (trial null) sees no trial notice", async () => {
    installFetch(null);
    render(<App />); await login();
    expect(document.querySelector(".eb-trial-notice")).toBeNull();
  });
  it("a reload: the boot probe's trial shows the notice", async () => {
    sessionStorage.setItem("examBankBuilderToken", "teacher-token");
    sessionStorage.setItem("examBankSessionRole", "teacher");
    installFetch(null, { endsAt: inDays(1), endingSoon: true });
    render(<App />);
    await waitFor(() => expect(document.querySelector(".eb-trial-notice.is-warning")).toBeTruthy());
    expect(screen.getAllByRole("alert").some(a => a.textContent?.includes("تنتهي تجربتك خلال يوم واحد"))).toBe(true);
  });
});
