// @vitest-environment happy-dom
//
// UX-2 — App-level integration of the new shell: routing, login/session and logout are UNCHANGED, every sidebar
// destination still renders its surface, the project breadcrumb returns to the hub, the student session never
// sees the teacher shell or teacher endpoints, and the shell adds NO API requests.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent, within } from "@testing-library/react";
import App from "./App";

const DASHBOARD_OK = {
  student: { userId: "stu-1", code: "S-1", displayName: "أحمد محمد", classId: "c1", shareAchievements: true },
  classroom: { classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026" },
  assignments: [], stats: { assigned: 0, completed: 0, average: null }
};
const PROJECTS = [{ projectCode: "899373", title: "مشروع 899373", tracks: [{ trackId: "book", title: "الكتاب", icon: "📘" }] }];
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);

function installFetch(role: "student" | "teacher") {
  const calls: string[] = [];
  const fn = vi.fn((input: RequestInfo | URL) => {
    const url = String(input); calls.push(url);
    if (url.includes("/api/platform-login")) return res(200, { ok: true, role, token: role + "-token", displayName: role === "teacher" ? "المعلم" : "أحمد محمد" });
    if (url.includes("/api/student-dashboard")) return res(200, DASHBOARD_OK);
    if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
    if (url.includes("/api/student-project-tracker")) return res(200, { ok: true, enrolled: false });
    if (url.includes("/api/project-tracker")) {
      if (url.includes("resource=projects-summary")) return res(200, { ok: true, totalReadyForReview: 2, byProject: { "899373": 2 } });
      if (url.includes("resource=projects")) return res(200, { ok: true, projects: PROJECTS });
      if (url.includes("resource=classes")) return res(200, { ok: true, projectCode: "899373", title: "مشروع 899373", tracks: PROJECTS[0].tracks, classes: [] });
      return res(200, { ok: true });
    }
    if (url.includes("/api/classrooms")) return res(200, { ok: true, classes: [] });
    if (url.includes("/api/students")) return res(200, { ok: true, students: [] });
    if (url.includes("/api/assignments")) return res(200, { ok: true, assignments: [] });
    if (url.includes("/api/saved-exams")) return res(200, { ok: true, exams: [] });
    if (url.includes("/api/audit-history")) return res(200, { ok: true, events: [], count: 0, limit: 50, hardMax: 100 });
    if (url.includes("/api/reports")) return res(200, { ok: true, schoolYears: [], classes: [], projects: PROJECTS });
    if (url.includes("/api/teacher-achievement-feed")) return res(200, { ok: true, posts: [] });
    if (url.includes("/api/teacher-analytics")) return res(500, { ok: false, error: "x" });
    return res(200, { ok: true });
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return calls;
}
async function login() {
  fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, { target: { value: "T" } });
  fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "pw" } });
  fireEvent.submit(document.querySelector("form.auth-form") as HTMLFormElement);
}
const sidebar = () => screen.getByRole("complementary", { name: "التنقل الرئيسي" });
// exact match, except the projects item whose accessible name also carries the badge text
const nav = (label: string) => within(sidebar()).getByRole("button", { name: label === "المشاريع" ? /^المشاريع/ : label });
const h1 = () => screen.getByRole("heading", { level: 1 }).textContent;
const pathOf = (u: string) => u.replace(/^https?:\/\/[^/]+/, "");

beforeEach(() => { try { sessionStorage.clear(); } catch { /* ignore */ } window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => true })) as unknown as typeof window.matchMedia; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("UX-2 App + TeacherAppShell integration", () => {
  it("teacher login lands in the shell on the builder (unchanged initial view) with the existing login form intact", async () => {
    installFetch("teacher");
    render(<App />);
    expect(document.querySelector("form.auth-form")).toBeTruthy();
    await login();
    await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy());
    expect(h1()).toBe("باني الامتحان");
    expect(document.querySelector(".builder-content")).toBeTruthy();
    expect(nav("باني الامتحان").getAttribute("aria-current")).toBe("page");
  });
  it("every sidebar destination renders its surface and updates the title (teacherView / workspaceTab authority unchanged)", async () => {
    installFetch("teacher");
    render(<App />); await login();
    await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy());
    fireEvent.click(nav("الصفوف والطلاب"));
    expect(h1()).toBe("الصفوف والطلاب"); expect(await screen.findByRole("heading", { level: 2, name: "الصفوف" })).toBeTruthy();
    fireEvent.click(nav("الواجبات"));
    expect(h1()).toBe("الواجبات"); expect(await screen.findByText("الواجبات والاختبارات المرسلة")).toBeTruthy();
    fireEvent.click(nav("سجل النشاط"));
    expect(h1()).toBe("سجل النشاط"); expect(await screen.findByRole("heading", { level: 2, name: "سجل النشاط" })).toBeTruthy();
    fireEvent.click(nav("لوحة المتابعة"));
    expect(h1()).toBe("لوحة المتابعة"); expect(document.querySelector(".analytics-loading, .analytics-dashboard, .platform-error")).toBeTruthy();
    fireEvent.click(nav("التقارير"));
    expect(h1()).toBe("التقارير"); expect(await screen.findByText(/مركز التقارير/)).toBeTruthy();
    fireEvent.click(nav("استيراد من ملف"));
    expect(h1()).toBe("استيراد من ملف"); expect(await screen.findByText("استيراد أسئلة من ملف")).toBeTruthy();
    fireEvent.click(nav("باني الامتحان"));
    expect(h1()).toBe("باني الامتحان"); expect(document.querySelector(".builder-content")).toBeTruthy();
    // no teacher bottom bar and no emoji in the shell navigation
    expect(document.querySelector(".app-sidebar-nav")).toBeNull();
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(sidebar().textContent || "")).toBe(false);
  });
  it("ProjectHub → open project → title/breadcrumb reflect it → breadcrumb returns to the hub; the ready badge uses the existing request", async () => {
    installFetch("teacher");
    render(<App />); await login();
    await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy());
    await waitFor(() => expect(nav("المشاريع").textContent).toMatch(/2/));           // projectReady.total from projects-summary
    fireEvent.click(nav("المشاريع"));
    expect(h1()).toBe("المشاريع");
    fireEvent.click(await screen.findByRole("button", { name: "فتح المشروع" }));
    await waitFor(() => expect(h1()).toBe("مشروع 899373"));
    expect(await screen.findByText(/Project 899373/)).toBeTruthy();                      // ProjectTracker rendered
    const crumbs = screen.getByRole("navigation", { name: "مسار الصفحة" });
    expect(crumbs.textContent).toContain("المشاريع");
    fireEvent.click(within(crumbs).getByRole("button", { name: "المشاريع" }));
    await waitFor(() => expect(h1()).toBe("المشاريع"));
    expect(await screen.findByRole("button", { name: "فتح المشروع" })).toBeTruthy();  // hub again
  });
  it("logout still works through .app-sidebar-logout and returns to the login form", async () => {
    installFetch("teacher");
    render(<App />); await login();
    const logout = await waitFor(() => { const el = document.querySelector(".app-sidebar-logout") as HTMLElement | null; if (!el) throw new Error("no logout"); return el; });
    fireEvent.click(logout);
    await waitFor(() => expect(document.querySelector("form.auth-form")).toBeTruthy());
    expect(sessionStorage.getItem("examBankBuilderToken")).toBeNull();
  });
  it("the shell adds no API requests: a teacher boot still calls exactly platform-login, projects and projects-summary", async () => {
    const calls = installFetch("teacher");
    render(<App />); await login();
    await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy());
    await waitFor(() => expect(calls.some(u => u.includes("resource=projects-summary"))).toBe(true));
    const set = new Set(calls.map(pathOf));
    expect(set).toEqual(new Set(["/api/platform-login", "/api/project-tracker?resource=projects", "/api/project-tracker?resource=projects-summary"]));
  });
  it("student login renders the StudentShell-wrapped portal (welcome text unchanged), never the teacher shell, never teacher requests", async () => {
    const calls = installFetch("student");
    render(<App />); await login();
    expect(await screen.findByText(/مرحبًا أحمد محمد/)).toBeTruthy();
    expect(document.querySelector("main.student-portal header.student-topbar")).toBeTruthy();
    expect(screen.getByLabelText("الطالب الحالي").textContent).toContain("الحادي عشر");
    expect(screen.queryByRole("complementary", { name: "التنقل الرئيسي" })).toBeNull();
    expect(calls.some(u => u.includes("/api/project-tracker"))).toBe(false);
    // content order of the portal is untouched: welcome card precedes the assignments panel
    const html = document.body.innerHTML;
    expect(html.indexOf("student-welcome-card")).toBeLessThan(html.indexOf("student-assignment-list"));
  });
});
