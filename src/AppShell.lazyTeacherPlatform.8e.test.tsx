// @vitest-environment happy-dom
//
// Phase 8E-4 — TeacherPlatform (classes / students / assignments / audit / dashboard workspace) is a LAZY chunk behind a
// local Suspense boundary inside TeacherAppShell. These tests drive the REAL App with the TeacherPlatform module gated
// behind a deferred mock factory: the factory records WHEN the module is evaluated, so the fresh login page, the student
// path and the non-platform teacher destinations are proven never to load it, and the platform transition is observed in
// its suspended frame (shell mounted, local status fallback only) before the module is released.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent, within, act } from "@testing-library/react";
import { configure } from "@testing-library/react";
// Phase 8E-5 — StudentPortal is a lazy chunk: the FIRST student render in a test file also performs its dynamic import,
// and vitest transforms the whole portal module tree at that moment (regularly > 1 s in a cold worker), while production
// shows the local status fallback. Give the async queries the headroom that first import needs.
configure({ asyncUtilTimeout: 5000 });
import { readFileSync } from "fs";
import path from "path";
import App from "./App";

const gate = vi.hoisted(() => {
  const g = { evaluated: false, seen: [] as Record<string, unknown>[], release: () => {}, open: Promise.resolve() };
  g.open = new Promise<void>(r => { g.release = r; });
  return g;
});
vi.mock("./TeacherPlatform", async () => {
  gate.evaluated = true;                                                         // the chunk is being fetched/evaluated
  await gate.open;                                                               // …and "arrives" only when a test releases it
  return { default: (props: Record<string, unknown>) => { gate.seen.push(props); return <section className="teacher-platform" data-testid="platform-stub">منصة المعلم جاهزة · {String(props.workspaceTab)}</section>; } };
});

const DASHBOARD_OK = {
  student: { userId: "stu-1", code: "S-1", displayName: "أحمد محمد", classId: "c1", shareAchievements: true },
  classroom: { classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026" },
  assignments: [], stats: { assigned: 0, completed: 0, average: null }
};
const PROJECTS = [{ projectCode: "899373", title: "مشروع 899373", tracks: [{ trackId: "book", title: "الكتاب", icon: "📘" }] }];
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
let calls: string[] = [];
function installFetch(role: "student" | "teacher") {
  calls = [];
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input); calls.push(url);
    if (url.includes("/api/platform-login")) return res(200, { ok: true, role, token: role + "-token", displayName: role === "teacher" ? "المعلم" : "أحمد محمد" });
    if (url.includes("/api/student-dashboard")) return res(200, DASHBOARD_OK);
    if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
    if (url.includes("/api/student-project-tracker")) return res(200, { ok: true, enrolled: false });
    if (url.includes("/api/project-tracker")) {
      if (url.includes("resource=projects-summary")) return res(200, { ok: true, totalReadyForReview: 0, byProject: {} });
      if (url.includes("resource=projects")) return res(200, { ok: true, projects: PROJECTS });
      return res(200, { ok: true });
    }
    if (url.includes("/api/reports")) return res(200, { ok: true, schoolYears: [], classes: [], projects: PROJECTS });
    return res(200, { ok: true });
  }) as unknown as typeof fetch;
}
// Requests only TeacherPlatform (or its children) perform — App.tsx itself never calls them.
const platformRequests = () => calls.filter(u => /\/api\/(classrooms|students|assignment-results|learning-materials-catalog)/.test(u));
async function login(code: string) {
  fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, { target: { value: code } });
  fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "pw" } });
  fireEvent.submit(document.querySelector("form.auth-form") as HTMLFormElement);
}
const sidebar = () => screen.getByRole("complementary", { name: "التنقل الرئيسي" });
const nav = (label: string) => within(sidebar()).getByRole("button", { name: label === "المشاريع" ? /^المشاريع/ : label });
const h1 = () => screen.getByRole("heading", { level: 1 }).textContent;
const FALLBACK = "جارٍ تحميل منصة المعلم...";
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 20)); });

beforeEach(() => {
  try { sessionStorage.clear(); } catch { /* ignore */ }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const SRC = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("A. source contract — App.tsx", () => {
  const src = SRC("src/App.tsx");
  it("A1 no static TeacherPlatform import; lazyWithRetry with the key \"teacher-platform\"; never bare lazy", () => {
    expect(src).not.toMatch(/import\s+TeacherPlatform\s+from\s+["']\.\/TeacherPlatform["']/);
    expect(src).toMatch(/const TeacherPlatform = lazy\(lazyWithRetry\(\(\)\s*=>\s*import\(["']\.\/TeacherPlatform["']\),\s*["']teacher-platform["']\)\);/);
    expect(src).not.toMatch(/lazy\(\(\)\s*=>\s*import\(["']\.\/TeacherPlatform["']\)\)/);
    expect(src).toMatch(/import \{ lazyWithRetry \} from ["']\.\/lazyWithRetry["']/);
  });
  it("A2 a LOCAL Suspense boundary with the role=status fallback wraps only the platform body, INSIDE TeacherAppShell", () => {
    const boundary = src.indexOf('<Suspense fallback={<p className="eb-muted" role="status">' + FALLBACK + "</p>}>");
    expect(boundary).toBeGreaterThan(0);
    expect(src.slice(boundary, boundary + 500)).toMatch(/<\/p>\}>\s*<TeacherPlatform\s+token=\{token\}\s+projects=\{projectList\}\s+currentExam=\{structuredExam \?\? exam\}\s+workspaceTab=\{workspaceTab\}\s+onCopyLibraryExamToBuilder=\{handleCopyLibraryExamToBuilder\}\s+onNavigate=\{navigateTeacher\}\s*\/>\s*<\/Suspense>/);   // 9A: + the shell navigation for the Today Hub
    const shellOpen = src.indexOf("<TeacherAppShell"), shellClose = src.indexOf("</TeacherAppShell>");
    expect(shellOpen).toBeGreaterThan(0); expect(boundary).toBeGreaterThan(shellOpen); expect(boundary).toBeLessThan(shellClose);
    expect(src.slice(shellOpen, boundary)).toMatch(/\{teacherView ===\s*"platform" && \(/);            // gated by the same teacherView authority as before
    expect((src.match(new RegExp(FALLBACK, "g")) || []).length).toBe(1);
  });
});

describe("B/C/D. TeacherPlatform is NOT loaded before the platform view", () => {
  it("B fresh unauthenticated boot: the login page renders, the TeacherPlatform module is never evaluated, no platform request fires", async () => {
    installFetch("teacher");
    render(<App />);
    expect(document.querySelector("form.auth-form")).toBeTruthy();
    await settle();
    expect(gate.evaluated).toBe(false); expect(platformRequests()).toEqual([]);
    expect(screen.queryByRole("complementary", { name: "التنقل الرئيسي" })).toBeNull();
  });
  it("C student login: the portal renders normally, TeacherPlatform stays unloaded, no teacher-platform request or effect runs", async () => {
    installFetch("student");
    render(<App />); await login("S-1");
    expect(await screen.findByText(/مرحبًا أحمد محمد/)).toBeTruthy();
    await waitFor(() => expect(document.querySelector("form.auth-form")).toBeNull());
    await settle();
    expect(gate.evaluated).toBe(false); expect(platformRequests()).toEqual([]);
    expect(calls.some(u => u.includes("/api/project-tracker"))).toBe(false);                            // teacher-only effects stay off (unchanged)
    expect(screen.queryByRole("complementary", { name: "التنقل الرئيسي" })).toBeNull();
  });
  it("D teacher on non-platform destinations (builder → reports → builder): the shell works, TeacherPlatform is never required", async () => {
    installFetch("teacher");
    render(<App />); await login("T");
    await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy());
    expect(h1()).toBe("باني الامتحان"); expect(document.querySelector(".builder-content")).toBeTruthy();
    fireEvent.click(nav("التقارير"));
    expect(h1()).toBe("التقارير"); expect(await screen.findByRole("group", { name: "تصنيف التقارير" })).toBeTruthy();
    fireEvent.click(nav("باني الامتحان"));
    expect(h1()).toBe("باني الامتحان");
    await settle();
    expect(gate.evaluated).toBe(false); expect(platformRequests()).toEqual([]);
    expect(screen.queryByText(FALLBACK)).toBeNull(); expect(screen.queryByTestId("platform-stub")).toBeNull();
  });
});

describe("E/F. the platform transition — shell stays mounted, only the body suspends; leaving and returning", () => {
  it("E opening the platform shows ONLY the local status fallback in the body while sidebar / identity / header / logout stay; resolving swaps the body with the same props", async () => {
    installFetch("teacher");
    render(<App />); await login("T");
    await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy());
    const side = sidebar();
    const identityBefore = (document.querySelector(".eb-teacher-identity-name") as HTMLElement).textContent;
    expect(identityBefore).toBeTruthy();
    expect(gate.evaluated).toBe(false);
    fireEvent.click(nav("لوحة المتابعة"));
    // Suspended frame.
    const status = await screen.findByRole("status");
    expect(status.textContent).toBe(FALLBACK);
    expect(gate.evaluated).toBe(true);                                                                 // the import started only now
    expect(status.closest(".eb-shell-main, .app-shell-main")).toBeTruthy();                             // inside the shell's content area
    expect(screen.getByRole("complementary", { name: "التنقل الرئيسي" })).toBe(side);                 // the SAME shell node
    expect(within(side).getByRole("button", { name: /^لوحة المتابعة/ }).getAttribute("aria-current")).toBe("page");
    expect(document.querySelector(".app-sidebar-logout")).toBeTruthy();
    expect((document.querySelector(".eb-teacher-identity-name") as HTMLElement).textContent).toBe(identityBefore);
    expect(h1()).toBe("لوحة المتابعة");
    expect(screen.queryByTestId("platform-stub")).toBeNull();
    expect(document.querySelector("form.auth-form")).toBeNull();
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);                              // no second / page-level loader
    // The chunk arrives → only the body changes.
    await act(async () => { gate.release(); });
    await waitFor(() => expect(screen.getByTestId("platform-stub")).toBeTruthy());
    expect(screen.queryByText(FALLBACK)).toBeNull();
    expect(screen.getByRole("complementary", { name: "التنقل الرئيسي" })).toBe(side);
    expect(h1()).toBe("لوحة المتابعة");
    const props = gate.seen.at(-1)!;
    expect(props.token).toBe("teacher-token");
    expect(props.projects).toEqual(expect.arrayContaining([expect.objectContaining({ projectCode: "899373" })]));
    expect(props.currentExam).toBeNull();
    expect(props.workspaceTab).toBe("dashboard");
    expect(typeof props.onCopyLibraryExamToBuilder).toBe("function");
    expect(Object.keys(props).sort()).toEqual(["currentExam", "onCopyLibraryExamToBuilder", "onNavigate", "projects", "token", "workspaceTab"]);   // 9A: onNavigate
  });
  it("F leaving unmounts the platform (as before); returning re-mounts it from the module cache with no fallback and the new workspaceTab", async () => {
    installFetch("teacher");
    render(<App />); await login("T");
    await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy());
    const side = sidebar(); const mountsBefore = gate.seen.length;
    fireEvent.click(nav("الصفوف والطلاب"));
    expect(await screen.findByTestId("platform-stub")).toBeTruthy();                                  // module already resolved: no suspension
    expect(screen.queryByText(FALLBACK)).toBeNull(); expect(gate.seen.at(-1)!.workspaceTab).toBe("students"); expect(h1()).toBe("الصفوف والطلاب");
    fireEvent.click(nav("باني الامتحان"));
    expect(screen.queryByTestId("platform-stub")).toBeNull(); expect(document.querySelector(".builder-content")).toBeTruthy();
    fireEvent.click(nav("الواجبات"));
    expect(await screen.findByTestId("platform-stub")).toBeTruthy(); expect(gate.seen.at(-1)!.workspaceTab).toBe("assignments");
    fireEvent.click(nav("لوحة المتابعة"));
    expect(screen.getByTestId("platform-stub").textContent).toContain("dashboard"); expect(gate.seen.at(-1)!.workspaceTab).toBe("dashboard");
    expect(gate.seen.length).toBeGreaterThan(mountsBefore);
    expect(screen.getByRole("complementary", { name: "التنقل الرئيسي" })).toBe(side);                 // one shell throughout
    expect(document.querySelectorAll(".app-sidebar-logout")).toHaveLength(1);
    expect(screen.queryByText(FALLBACK)).toBeNull();
  });
});

describe("G. Phase 8E-2 protection stays intact", () => {
  it("G1 TeacherDashboard is still lazy inside TeacherPlatform through lazyWithRetry, behind its own local boundary", () => {
    const src = SRC("src/TeacherPlatform.tsx");
    expect(src).not.toMatch(/import\s+TeacherDashboard\s+from\s+["']\.\/TeacherDashboard["']/);
    expect(src).toMatch(/lazy\(lazyWithRetry\(\(\)\s*=>\s*import\(["']\.\/TeacherDashboard["']\),\s*["']teacher-dashboard["']\)\)/);
    expect(src).toMatch(/<Suspense fallback=\{<p className="eb-muted" role="status">جارٍ تحميل لوحة المتابعة\.\.\.<\/p>\}><TeacherDashboard token=\{token\}\/><\/Suspense>/);
  });
  it("G2 the permanent bundle guard keeps the Dashboard + Chart.js checks and adds the TeacherPlatform chunk + payload checks with a budget no looser than 175 KB", () => {
    const guard = SRC("scripts/check-bundle-budget.mjs");
    expect(guard).toMatch(/CHART_SIGNATURES = \["radialLinear", "doughnut", "getDatasetMeta", "skipNull"\]/);
    expect(guard).toMatch(/DASHBOARD_SIGNATURES = \["analytics-chart-canvas", "analytics-insight"\]/);
    expect(guard).toMatch(/PLATFORM_SIGNATURES = \["eb-students-workspace", "eb-students-layout", "جارٍ تحميل لوحة المتابعة"\]/);
    expect(guard).toMatch(/\/\^TeacherDashboard-\[\^\.\]\+\\\.js\$\//); expect(guard).toMatch(/\/\^TeacherPlatform-\[\^\.\]\+\\\.js\$\//);
    expect(guard).toMatch(/platform\.length >= 2/);
    const budget = Number((guard.match(/INITIAL_JS_GZIP_BUDGET_KB = (\d+)/) || [])[1]);
    // Phase 8E-5 tightened the budget again (125 KB after lazy StudentPortal): never looser than 175, never absurdly low.
    expect(budget).toBeLessThanOrEqual(175); expect(budget).toBeGreaterThanOrEqual(100);
    expect(SRC("package.json")).toMatch(/"build": "tsc -b && vite build && npm run check:bundle"/);
  });
});
