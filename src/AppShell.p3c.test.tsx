// @vitest-environment happy-dom
// Tadris+ P3-C — App-level: the sign-in answer's `access` shapes the teacher shell with NO extra request (test data only).
//   enforced learning-only → lands on its first enabled destination (not the builder), the builder is not offered;
//   not enforced → the builder landing and every destination, exactly as before;
//   unavailable → nothing offered; «إعادة المحاولة» re-reads /api/platform-session and recovers.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent, within, configure } from "@testing-library/react";
configure({ asyncUtilTimeout: 5000 });
import App from "./App";

const LEARNING_ONLY = ["classes.class.view", "students.student.view", "students.student.create", "students.student.edit", "students.student.archive", "students.student.restore", "learning.course.view", "learning.course.assign", "learning.module.release", "learning.progress.view", "reports.widget.view", "audit.self.view"];
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);

function installFetch(loginAccess: unknown, probeAccess?: unknown) {
  const calls: string[] = [];
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input); calls.push(url);
    if (url.includes("/api/platform-login")) return res(200, { ok: true, role: "teacher", token: "teacher-token", displayName: "المعلم", access: loginAccess });
    if (url.includes("/api/platform-session")) return res(200, { ok: true, role: "teacher", displayName: "المعلم", access: probeAccess });
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
const sidebar = () => screen.getByRole("complementary", { name: "التنقل الرئيسي" });
const h1 = () => screen.getByRole("heading", { level: 1 }).textContent;

beforeEach(() => { try { sessionStorage.clear(); } catch { /* ignore */ } window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => true })) as unknown as typeof window.matchMedia; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("P3-C App — the teacher shell follows the sign-in access", () => {
  it("enforced learning-only: lands on its dashboard, the builder is not offered, and no extra request is made", async () => {
    const calls = installFetch({ status: "ok", enforced: true, capabilities: LEARNING_ONLY, source: "revision", preset: { id: "learning-only", version: 1 } });
    render(<App />); await login();
    await waitFor(() => expect(h1()).toBe("لوحة المتابعة"));
    expect(within(sidebar()).queryByRole("button", { name: "باني الامتحان" })).toBeNull();
    expect(within(sidebar()).getByRole("button", { name: "المواد التعليمية" })).toBeTruthy();
    expect(calls.some(u => u.includes("/api/platform-session"))).toBe(false);
  });
  it("not enforced: the builder landing and every destination, as before", async () => {
    installFetch({ status: "ok", enforced: false, capabilities: [], source: "unassigned", preset: null });
    render(<App />); await login();
    expect(h1()).toBe("باني الامتحان");
    expect(within(sidebar()).getByRole("button", { name: "باني الامتحان" })).toBeTruthy();
  });
  it("unavailable: nothing is offered; «إعادة المحاولة» re-reads the session and recovers", async () => {
    const calls = installFetch({ status: "unavailable", capabilities: [] }, { status: "ok", enforced: false, capabilities: [] });
    render(<App />); await login();
    expect(screen.getByRole("alert").textContent).toContain("تعذر تحميل صلاحياتك");
    expect(within(sidebar()).queryByRole("button", { name: "باني الامتحان" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(within(sidebar()).getByRole("button", { name: "باني الامتحان" })).toBeTruthy());
    expect(calls.filter(u => u.includes("/api/platform-session"))).toHaveLength(1);
  });
});

// Tadris+ P9-B1 — blueprint acceptance test #13 at the App level. The app has no URL routes (the destination is state), so a
// «reload» is the app starting again from the session kept in this tab: the authoritative /api/platform-session probe — not the
// stale stored metadata — decides what is offered, before any teacher page is shown.
describe("P9-B1 acceptance test #13 — a reload re-applies the restrictions from the server", () => {
  const restore = () => { sessionStorage.setItem("examBankBuilderToken", "teacher-token"); sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "المعلم"); };
  it("enforced learning-only after a reload: the probe's access applies — the builder is «غير مفعّلة», not offered, its data never requested", async () => {
    restore();
    const calls = installFetch(undefined, { status: "ok", enforced: true, capabilities: LEARNING_ONLY, source: "revision", preset: { id: "learning-only", version: 1 } });
    render(<App />);
    await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy());
    // the tab kept the builder as its place: it is answered «غير مفعّلة», never the builder page
    await waitFor(() => expect(screen.getByText("هذه الأداة غير مفعّلة لحسابك")).toBeTruthy());
    expect(document.querySelector(".exam-builder, [data-builder-root]")).toBeNull();
    expect(within(sidebar()).queryByRole("button", { name: "باني الامتحان" })).toBeNull();
    expect(within(sidebar()).getByRole("button", { name: "المواد التعليمية" })).toBeTruthy();
    expect(calls.filter(u => u.includes("/api/platform-session"))).toHaveLength(1);
    expect(calls.some(u => u.includes("/api/platform-login"))).toBe(false);                        // no new sign-in: the kept session
    expect(calls.some(u => /\/api\/(saved-exams|templates|assessment-presets|exam-question-availability|bank-summary)/.test(u))).toBe(false);   // no builder data
    fireEvent.click(screen.getByRole("button", { name: "الذهاب إلى «لوحة المتابعة»" }));
    await waitFor(() => expect(h1()).toBe("لوحة المتابعة"));
  });
  it("the same reload when the access cannot be read: nothing is offered (fail closed), never the stored «teacher» everything", async () => {
    restore();
    installFetch(undefined, { status: "unavailable", capabilities: [] });
    render(<App />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("تعذر تحميل صلاحياتك"));
    expect(within(sidebar()).queryByRole("button", { name: "باني الامتحان" })).toBeNull();
  });
});
