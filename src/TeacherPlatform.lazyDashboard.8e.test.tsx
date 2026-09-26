// @vitest-environment happy-dom
//
// Phase 8E-2 — the Teacher Dashboard is a LAZY chunk behind a local Suspense boundary inside TeacherPlatform (it was the
// only initial-graph consumer of Chart.js). These tests pin the boundary's contract with the REAL modules:
//   • the default workspace still reaches the Dashboard once the module resolves, with the same API behavior
//     (one analytics read + one achievement-feed read per mount — exactly as before the split);
//   • the fallback is a local status line inside the workspace wrapper, never a blank page;
//   • switching away and back renders the Dashboard again (module cache; no second chunk fetch is the browser's job);
//   • source guards: lazyWithRetry (one-shot stale-chunk recovery) is used, never bare React.lazy, and the static
//     import is gone. The production bundle itself is guarded by scripts/check-bundle-budget.mjs.
import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import TeacherPlatform from "./TeacherPlatform";

const PROJECTS = [{ projectCode: "899373", title: "مشروع الكتاب" }];
type Call = { url: string; method: string };
let calls: Call[] = [];
const json = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data } as Response);
const analyticsReads = () => calls.filter(c => c.method === "GET" && c.url.includes("/api/teacher-analytics") && !c.url.includes("teacher-analytics-ai")).length;
const feedReads = () => calls.filter(c => c.method === "GET" && c.url.includes("/api/teacher-achievement-feed")).length;

beforeEach(() => {
  calls = [];
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    calls.push({ url, method });
    if (url.includes("/api/teacher-analytics")) return json({ ok: false, error: "خادم التحليلات غير متاح للاختبار" }, 500);
    if (url.includes("/api/teacher-achievement-feed")) return json({ ok: true, posts: [] });
    if (url.includes("/api/classrooms")) return json({ ok: true, classes: [] });
    return json({ ok: true, projects: PROJECTS, students: [], assignments: [], exams: [] });
  }) as unknown as typeof fetch;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const mount = (tab: "dashboard" | "students") => <TeacherPlatform token="t" projects={PROJECTS} currentExam={null} workspaceTab={tab} />;
const dashboardSurface = () => document.querySelector(".analytics-loading, .analytics-dashboard, .platform-error");

describe("8E-2 — the lazy Dashboard boundary inside TeacherPlatform", () => {
  it("first render shows ONLY the local status fallback inside the workspace wrapper; the Dashboard then loads with one analytics read + one feed read", async () => {
    render(mount("dashboard"));
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("جارٍ تحميل لوحة المتابعة...");
    expect(status.closest(".teacher-platform-inner")).toBeTruthy();                                  // inside the workspace, not a page-level blank
    expect(analyticsReads()).toBe(0);                                                                // nothing fetched before the module resolves
    // The real Dashboard module resolves → its own surface (here the server-error alert) replaces the fallback.
    await waitFor(() => expect(dashboardSurface()).toBeTruthy());
    expect((await screen.findByRole("alert")).textContent).toContain("خادم التحليلات غير متاح للاختبار");
    expect(screen.queryByText("جارٍ تحميل لوحة المتابعة...")).toBeNull();
    await waitFor(() => expect(analyticsReads()).toBe(1));                                          // same request contract as the static version
    await waitFor(() => expect(feedReads()).toBe(1));
  });

  it("switching to another tab and back renders the Dashboard again; each mount performs exactly one analytics read (as before the split)", async () => {
    const view = render(mount("dashboard"));
    await screen.findByRole("alert");
    await waitFor(() => expect(analyticsReads()).toBe(1));
    view.rerender(mount("students"));
    await screen.findByRole("heading", { level: 2, name: "الصفوف" });
    expect(dashboardSurface()).toBeNull();
    expect(analyticsReads()).toBe(1);                                                                // leaving fetches nothing
    view.rerender(mount("dashboard"));
    await screen.findByRole("alert");                                                                // the module is cached: content is back
    await waitFor(() => expect(analyticsReads()).toBe(2));                                          // one read per Dashboard mount — unchanged behavior
    expect(feedReads()).toBe(2);
  });
});

describe("8E-2 — source guards", () => {
  const source = readFileSync(path.join(process.cwd(), "src", "TeacherPlatform.tsx"), "utf8");
  it("TeacherPlatform imports the Dashboard lazily through lazyWithRetry (deployment recovery), never statically and never with bare lazy", () => {
    expect(source).not.toMatch(/import\s+TeacherDashboard\s+from\s+["']\.\/TeacherDashboard["']/);
    expect(source).toMatch(/lazy\(lazyWithRetry\(\(\)\s*=>\s*import\(["']\.\/TeacherDashboard["']\),\s*["']teacher-dashboard["']\)\)/);
    expect(source).not.toMatch(/lazy\(\(\)\s*=>\s*import\(["']\.\/TeacherDashboard["']\)\)/);
    expect(source).toMatch(/import\s*\{lazyWithRetry\}\s*from\s*["']\.\/lazyWithRetry["']/);
  });
  it("the Suspense boundary wraps only the Dashboard body with a role=status fallback", () => {
    expect(source).toMatch(/<Suspense fallback=\{<p className="eb-muted" role="status">جارٍ تحميل لوحة المتابعة\.\.\.<\/p>\}><TeacherDashboard token=\{token\}\/><\/Suspense>/);
    expect((source.match(/<Suspense/g) || []).length).toBe(1);
  });
});
