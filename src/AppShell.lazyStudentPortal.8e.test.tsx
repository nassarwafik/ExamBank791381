// @vitest-environment happy-dom
//
// Phase 8E-5 — StudentPortal is a LAZY chunk behind a local Suspense boundary that is reached ONLY after the session is
// AUTHORITATIVELY validated as a student. These tests drive the REAL App with the StudentPortal module gated behind a
// deferred mock factory that records WHEN the module is evaluated: the fresh login page, a stored session still under
// validation (stale stored "student" role included), and every teacher path are proven never to load it; the student
// transition is observed in its suspended frame (local fallback only, no teacher shell, no login form) and released.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent, within, act } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import { useEffect } from "react";
import App from "./App";

const gate = vi.hoisted(() => {
  const g = { evaluated: false, seen: [] as Record<string, unknown>[], mounts: 0, release: () => {}, open: Promise.resolve() };
  g.open = new Promise<void>(r => { g.release = r; });
  return g;
});
vi.mock("./StudentPortal", async () => {
  gate.evaluated = true;                                                         // the chunk is being fetched/evaluated
  await gate.open;                                                               // …and "arrives" only when a test releases it
  const Stub = (props: Record<string, unknown>) => {
    gate.seen.push(props);
    useEffect(() => { gate.mounts += 1; }, []);
    return <main className="student-portal" data-testid="portal-stub">مرحبًا {String(props.displayName)}</main>;
  };
  return { default: Stub };
});

const DASHBOARD_OK = {
  student: { userId: "stu-1", code: "S-1", displayName: "أحمد محمد", classId: "c1", shareAchievements: true },
  classroom: { classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026" },
  assignments: [], stats: { assigned: 0, completed: 0, average: null }
};
const PROJECTS = [{ projectCode: "899373", title: "مشروع 899373", tracks: [{ trackId: "book", title: "الكتاب", icon: "📘" }] }];
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
let calls: string[] = [];
type Session = () => Promise<Response>;
function installFetch(role: "student" | "teacher", session?: Session) {
  calls = [];
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input); calls.push(url);
    if (url.includes("/api/platform-session")) return session ? session() : res(200, { ok: true, role, displayName: role === "teacher" ? "المعلم" : "أحمد محمد" });
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
// Requests only StudentPortal (or its children) perform — App.tsx itself never calls them.
const studentRequests = () => calls.filter(u => /\/api\/(student-dashboard|achievement-feed|student-project-tracker|student-messages|student-notifications)/.test(u));
function seedSession(role: "student" | "teacher", token = role + "-token", displayName = "STORED-NAME") {
  sessionStorage.setItem("examBankBuilderToken", token);
  sessionStorage.setItem("examBankSessionRole", role);
  sessionStorage.setItem("examBankSessionDisplayName", displayName);
}
async function login(code: string) {
  fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, { target: { value: code } });
  fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "pw" } });
  fireEvent.submit(document.querySelector("form.auth-form") as HTMLFormElement);
}
const sidebar = () => screen.getByRole("complementary", { name: "التنقل الرئيسي" });
const teacherShell = () => screen.queryByRole("complementary", { name: "التنقل الرئيسي" });
const nav = (label: string) => within(sidebar()).getByRole("button", { name: label });
const h1 = () => screen.getByRole("heading", { level: 1 }).textContent;
const FALLBACK = "جارٍ تحميل بوابة الطالب...";
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 20)); });
const SRC = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

beforeEach(() => {
  try { sessionStorage.clear(); localStorage.clear(); } catch { /* ignore */ }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("A. source contract — App.tsx", () => {
  const src = SRC("src/App.tsx");
  it("A1 no static StudentPortal import; lazyWithRetry with the key \"student-portal\"; never bare lazy", () => {
    expect(src).not.toMatch(/import\s+StudentPortal\s+from\s+["']\.\/StudentPortal["']/);
    expect(src).toMatch(/const StudentPortal = lazy\(lazyWithRetry\(\(\)\s*=>\s*import\(["']\.\/StudentPortal["']\),\s*["']student-portal["']\)\);/);
    expect(src).not.toMatch(/lazy\(\(\)\s*=>\s*import\(["']\.\/StudentPortal["']\)\)/);
    expect(src).toMatch(/import \{ lazyWithRetry \} from ["']\.\/lazyWithRetry["']/);
  });
  it("A2 ONE local Suspense boundary with the role=status fallback wraps only the student body, AFTER the session-validation gate and before the teacher shell", () => {
    const fallback = '<Suspense fallback={<p className="eb-muted" role="status" dir="rtl">' + FALLBACK + "</p>}>";
    const boundary = src.indexOf(fallback);
    expect(boundary).toBeGreaterThan(0);
    expect((src.match(new RegExp(FALLBACK, "g")) || []).length).toBe(1);
    expect(src.slice(boundary, boundary + 600)).toMatch(/<\/p>\}>\s*<StudentPortal\s+token=\{token\}\s+displayName=\{\s*sessionDisplayName\s*\}\s+onLogout=\{\s*handleLogout\s*\}\s*\/>\s*<\/Suspense>/);
    const validationGate = src.indexOf("if (!sessionValidated) {"), studentBranch = src.indexOf('sessionRole ===\n    "student"'), shell = src.indexOf("<TeacherAppShell");
    expect(validationGate).toBeGreaterThan(0); expect(studentBranch).toBeGreaterThan(validationGate);
    expect(boundary).toBeGreaterThan(studentBranch); expect(boundary).toBeLessThan(shell);
    expect(src.slice(validationGate, boundary)).not.toMatch(/<StudentPortal/);                          // nothing renders the portal before the branch
    expect(src.slice(0, validationGate)).not.toMatch(/import\(["']\.\/StudentPortal["']\)[^\n]*\(\)/);   // no eager preload call anywhere above
  });
});

describe("B/C/D. StudentPortal is NOT loaded before an AUTHORITATIVE student session", () => {
  it("B fresh unauthenticated boot: the login form renders, the module is never evaluated, no student-only request fires", async () => {
    installFetch("student");
    render(<App />);
    expect(document.querySelector("form.auth-form")).toBeTruthy();
    await settle();
    expect(gate.evaluated).toBe(false); expect(studentRequests()).toEqual([]); expect(teacherShell()).toBeNull();
  });
  it("C1 (critical) stored token + stored role \"student\" with /api/platform-session PENDING: the module must not evaluate and no student request fires; the server then says TEACHER → teacher UI, portal still never evaluated", async () => {
    let resolveSession: (r: Response) => void = () => {};
    const pending = new Promise<Response>(r => { resolveSession = r; });
    seedSession("student", "some-token", "STALE");
    installFetch("teacher", () => pending);
    render(<App />);
    await waitFor(() => expect(document.querySelector(".auth-sub")?.textContent).toMatch(/جارٍ التحقق/));   // the boot/retry surface, not a portal
    await settle();
    expect(gate.evaluated).toBe(false); expect(studentRequests()).toEqual([]);
    expect(screen.queryByText(FALLBACK)).toBeNull(); expect(screen.queryByTestId("portal-stub")).toBeNull();
    expect(calls.filter(u => u.includes("/api/platform-session"))).toHaveLength(1);
    resolveSession(await res(200, { ok: true, role: "teacher", displayName: "المعلم" }));
    await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy());
    await settle();
    expect(gate.evaluated).toBe(false); expect(studentRequests()).toEqual([]);
    expect(sessionStorage.getItem("examBankSessionRole")).toBe("teacher");                                   // the server's role won
  });
  it("C2 stored role \"student\" but the server answers 401: the session is cleared → login form; the module never evaluated", async () => {
    seedSession("student", "stale-token");
    installFetch("student", () => res(401, { ok: false, error: "Unauthorized" }));
    render(<App />);
    await waitFor(() => expect(document.querySelector("form.auth-form")).toBeTruthy());
    await settle();
    expect(gate.evaluated).toBe(false); expect(studentRequests()).toEqual([]); expect(sessionStorage.getItem("examBankBuilderToken")).toBeNull();
  });
  it("D teacher login: the shell renders, teacher views work, the module is never evaluated, no student request fires", async () => {
    installFetch("teacher");
    render(<App />); await login("T");
    await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy());
    expect(h1()).toBe("باني الامتحان");
    fireEvent.click(nav("التقارير"));
    expect(h1()).toBe("التقارير"); expect(await screen.findByRole("group", { name: "تصنيف التقارير" })).toBeTruthy();
    fireEvent.click(nav("باني الامتحان"));
    expect(h1()).toBe("باني الامتحان"); expect(document.querySelector(".builder-content")).toBeTruthy();
    await settle();
    expect(gate.evaluated).toBe(false); expect(studentRequests()).toEqual([]);
    expect(screen.queryByText(FALLBACK)).toBeNull(); expect(screen.queryByTestId("portal-stub")).toBeNull();
  });
});

// C3 is the ONLY test that observes the cold, suspended transition (it releases the shared gate itself); E/F and G release the
// gate up front, so every test in this block passes on its own and in any order.
describe("E/F/G. the student transition — C3: cold fallback then the portal; E/F: unchanged props; G: re-entry", () => {
  it("C3 (inverse) stored role \"teacher\" but the server authoritatively answers STUDENT: nothing loads while pending; the portal loads only after that response", async () => {
    let resolveSession: (r: Response) => void = () => {};
    const pending = new Promise<Response>(r => { resolveSession = r; });
    seedSession("teacher", "student-token", "STALE");
    installFetch("student", () => pending);
    render(<App />);
    await waitFor(() => expect(document.querySelector(".auth-sub")?.textContent).toMatch(/جارٍ التحقق/));
    await settle();
    expect(gate.evaluated).toBe(false); expect(teacherShell()).toBeNull(); expect(calls.some(u => u.includes("/api/project-tracker"))).toBe(false);
    resolveSession(await res(200, { ok: true, role: "student", displayName: "أحمد محمد" }));
    const status = await screen.findByRole("status");
    expect(status.textContent).toBe(FALLBACK);
    expect(gate.evaluated).toBe(true);                                                                       // the import started only after the authoritative response
    expect(teacherShell()).toBeNull(); expect(document.querySelector("form.auth-form")).toBeNull();
    expect(calls.some(u => u.includes("/api/project-tracker"))).toBe(false);                                 // never a wrong-role teacher request
    await act(async () => { gate.release(); });
    expect(await screen.findByTestId("portal-stub")).toBeTruthy();
    expect(screen.queryByText(FALLBACK)).toBeNull();
    expect(gate.seen.at(-1)!.displayName).toBe("أحمد محمد");                                                  // the SERVER's name, never the stale stored one
  });
  it("E/F fresh student login: the portal renders after the authoritative login response with exactly {token, displayName, onLogout}; no teacher shell, no login form (the cold Suspense transition itself is C3's proof)", async () => {
    // Independent of test order: this test releases the module gate itself (resolving an already-resolved promise is a
    // no-op), so it proves the props/contract of a student session, not the cold fallback.
    gate.release();
    installFetch("student");
    render(<App />); await login("S-1");
    expect(await screen.findByTestId("portal-stub")).toBeTruthy();
    expect(teacherShell()).toBeNull(); expect(document.querySelector("form.auth-form")).toBeNull();
    expect(calls.some(u => u.includes("/api/project-tracker"))).toBe(false);
    const props = gate.seen.at(-1)!;
    expect(props.token).toBe("student-token"); expect(props.displayName).toBe("أحمد محمد"); expect(typeof props.onLogout).toBe("function");
    expect(Object.keys(props).sort()).toEqual(["displayName", "onLogout", "token"]);
  });
  it("G re-entry: logout from the portal → login form (module stays cached) → student login again re-mounts ONE portal, no duplicate login/session request, no teacher shell", async () => {
    gate.release();                                                                                          // order-independent (see E/F)
    const mountsBefore = gate.mounts;                                                                        // cumulative across the file → relative counts
    installFetch("student");
    render(<App />); await login("S-1");
    await screen.findByTestId("portal-stub");
    await waitFor(() => expect(gate.mounts).toBe(mountsBefore + 1));                                        // the mount effect has flushed (not a race with the DOM query)
    await act(async () => { (gate.seen.at(-1)!.onLogout as () => void)(); });
    await waitFor(() => expect(document.querySelector("form.auth-form")).toBeTruthy());
    expect(screen.queryByTestId("portal-stub")).toBeNull(); expect(sessionStorage.getItem("examBankBuilderToken")).toBeNull();
    await login("S-1");
    await screen.findByTestId("portal-stub");
    await waitFor(() => expect(gate.mounts).toBe(mountsBefore + 2));                                        // exactly one portal mount per session entry
    expect(document.querySelectorAll('[data-testid="portal-stub"]')).toHaveLength(1);
    expect(calls.filter(u => u.includes("/api/platform-login"))).toHaveLength(2);                            // one login request per entry
    expect(calls.filter(u => u.includes("/api/platform-session"))).toHaveLength(0);                          // a fresh login never re-probes
    expect(teacherShell()).toBeNull(); expect(screen.queryByText(FALLBACK)).toBeNull();
  });
});

describe("H. prior Phase 8E guards stay intact", () => {
  it("H1 TeacherPlatform (App.tsx) and TeacherDashboard (TeacherPlatform.tsx) are still lazy through lazyWithRetry behind their local boundaries", () => {
    const app = SRC("src/App.tsx"), platform = SRC("src/TeacherPlatform.tsx");
    expect(app).toMatch(/const TeacherPlatform = lazy\(lazyWithRetry\(\(\)\s*=>\s*import\(["']\.\/TeacherPlatform["']\),\s*["']teacher-platform["']\)\);/);
    expect(app).toMatch(/<Suspense fallback=\{<p className="eb-muted" role="status">جارٍ تحميل منصة المعلم\.\.\.<\/p>\}>/);
    expect(platform).toMatch(/lazy\(lazyWithRetry\(\(\)\s*=>\s*import\(["']\.\/TeacherDashboard["']\),\s*["']teacher-dashboard["']\)\)/);
    expect(platform).toMatch(/<Suspense fallback=\{<p className="eb-muted" role="status">جارٍ تحميل لوحة المتابعة\.\.\.<\/p>\}><TeacherDashboard token=\{token\}\/><\/Suspense>/);
  });
  it("H2 the permanent bundle guard keeps the Chart.js / Dashboard / Platform checks, adds the StudentPortal chunk + payload checks, and its budget is no looser than 125 KB", () => {
    const guard = SRC("scripts/check-bundle-budget.mjs");
    expect(guard).toMatch(/CHART_SIGNATURES = \["radialLinear", "doughnut", "getDatasetMeta", "skipNull"\]/);
    expect(guard).toMatch(/DASHBOARD_SIGNATURES = \["analytics-chart-canvas", "analytics-insight"\]/);
    expect(guard).toMatch(/PLATFORM_SIGNATURES = \["eb-students-workspace", "eb-students-layout", "جارٍ تحميل لوحة المتابعة"\]/);
    expect(guard).toMatch(/PORTAL_SIGNATURES = \["eb-sp-tasks", "eb-sp-notice", "student-assignment-list", "تصفية المهام"\]/);
    for (const stem of ["TeacherDashboard", "TeacherPlatform", "StudentPortal"]) expect(guard).toContain("/^" + stem + "-[^.]+\\.js$/");
    expect(guard).toMatch(/platform\.length >= 2/); expect(guard).toMatch(/portal\.length >= 2/); expect(guard).toMatch(/chart\.length >= 3/);
    const budget = Number((guard.match(/INITIAL_JS_GZIP_BUDGET_KB = (\d+)/) || [])[1]);
    expect(budget).toBeLessThanOrEqual(125); expect(budget).toBeGreaterThanOrEqual(112);
    expect(SRC("package.json")).toMatch(/"build": "tsc -b && vite build && npm run check:bundle"/);
  });
});
