// @vitest-environment happy-dom
//
// Batch 5 (F1) — through the REAL App: a teacher page outside TeacherPlatform (the exam bank) receives a 401 because the
// session expired. Before, the teacher stayed in the app and read the server's English "Unauthorized"; now the teacher is
// signed out (back to the sign-in form) and no English text is shown.
// Fail-first: run against 56ce0972 (the bank's own request helper shows j.error and never signs out).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor, within, screen, act } from "@testing-library/react";

const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const SLOW = { timeout: 8000 };
let bankStatus = 401;
function installFetch() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/platform-login")) return res(200, { ok: true, role: "teacher", token: "teacher-token", displayName: "المعلم" });
    if (url.includes("/api/bank-questions")) return bankStatus === 401 ? res(401, { error: "Unauthorized" }) : res(200, { ok: true, questions: [] });
    return res(200, { ok: true, classes: [], students: [], assignments: [], projects: [], items: [], posts: [], exams: [], questions: [], totalUnread: 0, capped: false, byProject: {}, totalReadyForReview: 0 });
  }) as unknown as typeof fetch;
}
async function login() {
  fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, { target: { value: "T" } });
  fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "pw" } });
  fireEvent.submit(document.querySelector("form.auth-form") as HTMLFormElement);
  await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy(), SLOW);
}
const openBank = () => act(async () => { fireEvent.click(within(screen.getByRole("complementary", { name: "التنقل الرئيسي" })).getByRole("button", { name: /^بنك الامتحانات/ })); });

beforeEach(() => {
  try { sessionStorage.clear(); localStorage.clear(); } catch { /* ignore */ }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  installFetch();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); bankStatus = 401; });

describe("F1 — an expired teacher session on a page outside TeacherPlatform", () => {
  it("a 401 on the exam bank signs the teacher out (back to the sign-in form) and never shows «Unauthorized»", async () => {
    vi.resetModules();
    const { default: App } = await import("./App");
    render(<App />);
    await login();
    await openBank();
    await waitFor(() => expect(document.querySelector("form.auth-form")).toBeTruthy(), SLOW);
    expect(document.querySelector(".app-sidebar-logout")).toBeNull();
    expect(document.body.textContent).not.toContain("Unauthorized");
  });

  it("the bank still loads normally when the session is valid (pin)", async () => {
    bankStatus = 200;
    vi.resetModules();
    const { default: App } = await import("./App");
    render(<App />);
    await login();
    await openBank();
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(document.querySelector(".app-sidebar-logout")).toBeTruthy();
  });
});
