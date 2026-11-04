// @vitest-environment happy-dom
// Tadris+ P8-B1a — App-level: the shell hands the sign-in access to the pages (TeacherAccessContext), so a «learning + ready
// assignments» teacher opening «الواجبات» is not sent to the builder's saved-exams read (which the server refuses: before P8-B1a
// the page showed that refusal on every visit) and is not offered «امتحاناتي». (Not enforced → unchanged: AppShell.p3c and every suite without the provider.) TEST data only.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent, within, configure } from "@testing-library/react";
configure({ asyncUtilTimeout: 5000 });
import App from "./App";

const READY = ["classes.class.view", "students.student.view", "learning.course.view", "reports.widget.view", "audit.self.view", "examLibrary.item.view", "examLibrary.item.preview", "examBank.collection.view", "assignments.assignment.view", "assignments.ready.assign", "assignments.schedule.set", "assignments.grading.grade", "assignments.results.release"];
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
    if (url.includes("/api/saved-exams")) return res(403, { ok: false, code: "CAPABILITY_DENIED", error: "لا تملك صلاحية تنفيذ هذا الإجراء." });
    if (url.includes("/api/exam-library")) return res(200, { ok: true, catalog: [] });
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

describe("P8-B1a App — the pages follow the sign-in access", () => {
  it("enforced «ready assignments»: «الواجبات» makes no saved-exams read and shows no refusal; «إنشاء واجب» offers the library only", async () => {
    const calls = installFetch({ status: "ok", enforced: true, capabilities: READY, source: "revision", preset: { id: "learning-ready-assignments", version: 1 } });
    render(<App />); await login();
    fireEvent.click(within(sidebar()).getByRole("button", { name: "الواجبات" }));
    await waitFor(() => expect(h1()).toBe("الواجبات"));
    await waitFor(() => expect(calls.some(u => u.includes("/api/assignments"))).toBe(true));
    await new Promise(r => setTimeout(r, 30));
    expect(calls.filter(u => u.includes("/api/saved-exams"))).toEqual([]);
    expect(screen.queryByText(/لا تملك صلاحية تنفيذ هذا الإجراء/)).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /إنشاء واجب/ })[0]);
    const source = await screen.findByRole("group", { name: "مصدر محتوى الواجب" });
    expect(within(source).queryByRole("button", { name: "امتحاناتي" })).toBeNull();
  });
});
