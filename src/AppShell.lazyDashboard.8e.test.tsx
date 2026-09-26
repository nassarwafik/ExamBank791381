// @vitest-environment happy-dom
//
// Phase 8E-2 — while the lazy Dashboard chunk is still loading, the TEACHER SHELL stays mounted: sidebar, title and
// logout are on screen and only the Dashboard body shows its local status fallback. The Dashboard module is gated
// behind a deferred mock factory so the suspended frame is observed deterministically, then released.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import App from "./App";

let release: () => void = () => {};
const gate = new Promise<void>(r => { release = r; });
vi.mock("./TeacherDashboard", async () => {
  await gate;                                                                    // the chunk "arrives" only when the test releases it
  return { default: () => <section className="analytics-dashboard" data-testid="dashboard-stub">لوحة المتابعة جاهزة</section> };
});

const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
beforeEach(() => {
  try { sessionStorage.clear(); } catch { /* ignore */ }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/platform-login")) return res(200, { ok: true, role: "teacher", token: "teacher-token", displayName: "المعلم" });
    if (url.includes("/api/project-tracker")) return res(200, { ok: true, projects: [], totalReadyForReview: 0, byProject: {} });
    return res(200, { ok: true, classes: [], students: [], assignments: [], exams: [], totalUnread: 0, capped: false });
  }) as unknown as typeof fetch;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("8E-2 — the teacher shell stays mounted while the Dashboard chunk is suspended", () => {
  it("sidebar, title and logout are present together with the local Dashboard fallback; releasing the chunk swaps only the body", async () => {
    render(<App />);
    fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, { target: { value: "T" } });
    fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "pw" } });
    fireEvent.submit(document.querySelector("form.auth-form") as HTMLFormElement);
    // Teacher login lands on the builder (unchanged); navigate to the Dashboard through the shell sidebar.
    await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy());
    const sidebar = screen.getByRole("complementary", { name: "التنقل الرئيسي" });
    fireEvent.click(within(sidebar).getByRole("button", { name: /^لوحة المتابعة/ }));
    // Suspended frame: the shell is fully mounted, the Dashboard body is only its status line.
    // Phase 8E-4: TeacherPlatform itself is a lazy chunk now, so the FIRST status line is the platform's; wait for the
    // Dashboard's own fallback (rendered by the real TeacherPlatform once its chunk resolves).
    const status = await screen.findByText("جارٍ تحميل لوحة المتابعة...");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.closest(".teacher-platform-inner")).toBeTruthy();
    expect(within(sidebar).getByRole("button", { name: /^لوحة المتابعة/ })).toBeTruthy();
    expect(document.querySelector(".app-sidebar-logout")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("لوحة المتابعة");
    expect(screen.queryByTestId("dashboard-stub")).toBeNull();
    expect(document.querySelector("form.auth-form")).toBeNull();                                 // never bounced back to the login screen
    // The chunk arrives → only the body changes; the same shell nodes are still there.
    await act(async () => { release(); });
    await waitFor(() => expect(screen.getByTestId("dashboard-stub")).toBeTruthy());
    expect(screen.queryByText("جارٍ تحميل لوحة المتابعة...")).toBeNull();
    expect(screen.getByRole("complementary", { name: "التنقل الرئيسي" })).toBe(sidebar);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("لوحة المتابعة");
  });
});
