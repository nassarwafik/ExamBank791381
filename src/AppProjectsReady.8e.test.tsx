// @vitest-environment happy-dom
//
// Phase 8E-1 — WHEN the App-owned ready-for-review summary (`/api/project-tracker?resource=projects-summary`) is read.
// The summary is expensive on the server (it scans every active class of every project) and its result is a badge, so
// it is read on exactly three triggers: the teacher session becoming ready, a ready-changing project mutation
// (refreshProjectReady) and ENTERING the Projects destination (the pre-existing "re-check on return" contract that keeps
// the badge fresh for changes made elsewhere). Unrelated navigation, moving inside Projects, leaving Projects, note-only
// or score-only writes and student sessions never read it, and a stale response can never repopulate the badge after
// a logout. The full App is rendered against a mocked fetch (the same harness as AppProjectsReady.ux6.test.tsx).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import App from "./App";

const TRACKS = [{ trackId: "book", title: "الكتاب", icon: "📘" }];
const PROJECTS = [{ projectCode: "794589", title: "مشروع 794589", tracks: TRACKS }];
const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2025-2026", status: "active", studentCount: 1 }];
const STAGES = [{ stageId: "B01", track: "book", groupId: "g1", title: "مقدمة الشبكات", order: 1, weight: 1, required: true, active: true }];
const GROUPS = [{ groupId: "g1", track: "book", title: "الوحدة الأولى", order: 1 }];
const CARD = { studentId: "s1", displayName: "زيد صالح", code: "P1", overallProgress: 20, trackProgress: { book: 20 }, counts: { not_started: 0, in_progress: 0, ready_for_review: 1, approved: 0 }, readyForReviewCount: 1, lastUpdatedAt: "2026-03-01T10:00:00.000Z", stale: false, late: false };
const DETAIL = { ok: true, readOnly: false, projectCode: "794589", student: { studentId: "s1", displayName: "زيد صالح", code: "P1" }, tracks: TRACKS, summary: CARD, stages: STAGES, groups: GROUPS, trackWeights: { book: 1 }, progress: { B01: { status: "ready_for_review", updatedAt: "2026-03-01T10:00:00.000Z" } }, history: [], nextStages: { book: null }, performance: null, balance: null };
const TEMPLATE = { stages: STAGES, groups: GROUPS, trackWeights: { book: 1 }, config: { staleDays: 7, lateThreshold: 40 } };
const GENERIC = { ok: true, classes: [], students: [], assignments: [], exams: [], posts: [], events: [], items: [], materials: [], courses: [], modules: [], challenges: [], sessions: [], projects: PROJECTS, schoolYears: [], years: [], totalUnread: 0, capped: false, byStudent: {} };

type Call = { method: string; url: string; body?: Record<string, unknown> };
let calls: Call[] = [];
let ready = 2;
let role: "teacher" | "student" = "teacher";
let holdSummary = false;                      // hold the NEXT summary response until releaseSummary()
let releaseSummary: () => void = () => {};
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);

function installFetch() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).replace(/^https?:\/\/[^/]+/, "");
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    if (url.includes("/api/platform-login")) return res(200, { ok: true, role, token: role + "-token", displayName: role === "teacher" ? "المعلم" : "أحمد" });
    if (url.includes("/api/student-dashboard")) return res(200, { student: { userId: "u1", code: "C-1", displayName: "أحمد", classId: "c1", shareAchievements: true }, classroom: { classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026" }, assignments: [], stats: { assigned: 0, completed: 0, average: null } });
    if (url.includes("/api/student-")) return res(200, { ok: true, enrolled: false, materials: [], items: [], messages: { totalUnread: 0, totalCapped: false, directUnread: { unread: 0, capped: false }, announcementUnread: { unread: 0, capped: false } }, events: { unread: 0, capped: false }, bell: { unread: 0, capped: false } });
    if (url.includes("/api/project-tracker")) {
      if (method === "POST") {
        if (body?.action === "progress.update") {
          if (body.status !== undefined) ready -= 1;                                           // server-side truth after the approval
          return res(200, { ok: true, summary: { ...CARD, readyForReviewCount: 0 }, stage: { stageId: "B01", status: body.status ?? "ready_for_review", score: body.score !== undefined ? Number(body.score) : undefined, note: body.note ?? "", updatedAt: "2026-03-05T10:00:00.000Z" }, nextStages: { book: null }, performance: null, balance: null, history: [] });
        }
        return res(400, { ok: false, error: "x" });
      }
      const resource = new URL(url, "http://x").searchParams.get("resource");
      if (resource === "projects-summary") {
        if (holdSummary) { holdSummary = false; await new Promise<void>(r => { releaseSummary = r; }); }
        return res(200, { ok: true, totalReadyForReview: ready, byProject: { "794589": ready } });
      }
      if (resource === "projects") return res(200, { ok: true, projects: PROJECTS });
      if (resource === "classes") return res(200, { ok: true, projectCode: "794589", title: "مشروع 794589", tracks: TRACKS, classes: CLASSES });
      if (resource === "summary") return res(200, { ok: true, summary: { studentCount: 1, avgOverall: 20, trackAverages: { book: 20 }, completedCount: 0, studentsReadyForReview: 1, totalReadyStages: 1, staleCount: 0, trackCompletion: { book: 0 } } });
      if (resource === "students") return res(200, { ok: true, students: [CARD], tracks: TRACKS, config: { lateThreshold: 40 } });
      if (resource === "student") return res(200, DETAIL);
      if (resource === "template") return res(200, { ok: true, template: TEMPLATE, tracks: TRACKS, readOnly: false });
      return res(400, { ok: false });
    }
    if (url.includes("/api/teacher-analytics")) return res(500, { ok: false, error: "x" });
    return res(200, GENERIC);
  }) as unknown as typeof fetch;
}

const summaryReads = () => calls.filter(c => c.method === "GET" && c.url === "/api/project-tracker?resource=projects-summary").length;
const posts = () => calls.filter(c => c.method === "POST" && c.url.includes("/api/project-tracker")).map(c => c.body);
const sidebar = () => screen.getByRole("complementary", { name: "التنقل الرئيسي" });
const navButton = (label: string) => within(sidebar()).getByRole("button", { name: new RegExp("^" + label) });
const projectsNav = () => navButton("المشاريع");
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 120)); });

/** Logs in; a TEACHER session reads the summary exactly once more than before (also on a re-login after a logout). */
async function login() {
  const before = summaryReads();
  fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, { target: { value: "T" } });
  fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "pw" } });
  fireEvent.submit(document.querySelector("form.auth-form") as HTMLFormElement);
  if (role === "teacher") { await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy()); await waitFor(() => expect(summaryReads()).toBe(before + 1)); }
  else await screen.findByText(/مرحبًا أحمد/);
  await settle();
}
async function go(label: string) { fireEvent.click(navButton(label)); await settle(); }
async function openHub() { fireEvent.click(projectsNav()); return await screen.findByRole("button", { name: "فتح المشروع" }); }
async function openProjectStudents() {
  fireEvent.click(await openHub());
  await screen.findByRole("region", { name: "مساحة عمل المشروع" });
  fireEvent.click(await screen.findByRole("button", { name: "تقدّم الطلاب" }));
  await screen.findByText("زيد صالح");
  fireEvent.click(screen.getByRole("button", { name: "فتح ملف الطالب" }));
  await screen.findByRole("heading", { level: 2, name: "ملف المشروع: زيد صالح" });
  await settle();
  return document.querySelector('[data-stage-id="B01"]') as HTMLElement;
}

beforeEach(() => {
  calls = []; ready = 2; role = "teacher"; holdSummary = false;
  try { sessionStorage.clear(); } catch { /* ignore */ }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  installFetch();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("8E-1 A/B — a validated teacher reads the summary once; unrelated navigation never re-reads it", () => {
  it("login → exactly one read; Dashboard → Messages → Games → Reports → Learning → Students → Assignments → Audit → Dashboard add none", async () => {
    render(<App />); await login();
    expect(summaryReads()).toBe(1);
    for (const label of ["لوحة المتابعة", "الرسائل", "الألعاب التعليمية", "التقارير", "المواد التعليمية", "الصفوف والطلاب", "الواجبات", "سجل النشاط", "لوحة المتابعة"]) {
      await go(label);
      expect(summaryReads(), "after " + label).toBe(1);
    }
    expect(projectsNav().textContent).toMatch(/2/);                                                  // the badge is still the session's authoritative value
  });
});

describe("8E-1 C — entering Projects is the one navigation that re-reads (the freshness-on-return contract)", () => {
  it("enter → one fresh read; hub ↔ project, tabs and a student profile add none; leaving adds none; re-entering adds one", async () => {
    render(<App />); await login();
    ready = 5;                                                                                       // changed elsewhere (another teacher / device)
    await openHub();
    await waitFor(() => expect(summaryReads()).toBe(2));                                             // entry re-check
    await waitFor(() => expect(projectsNav().textContent).toMatch(/5/));                             // …and the badge shows the fresh value
    fireEvent.click(screen.getByRole("button", { name: "فتح المشروع" }));
    await screen.findByRole("region", { name: "مساحة عمل المشروع" });
    fireEvent.click(await screen.findByRole("button", { name: "تقدّم الطلاب" }));
    await screen.findByText("زيد صالح");
    fireEvent.click(screen.getByRole("button", { name: "فتح ملف الطالب" }));
    await screen.findByRole("heading", { level: 2, name: "ملف المشروع: زيد صالح" });
    await settle();
    expect(summaryReads()).toBe(2);                                                                  // moving inside Projects: nothing
    const crumbs = screen.getByRole("navigation", { name: "مسار الصفحة" });
    fireEvent.click(within(crumbs).getByRole("button", { name: "المشاريع" }));
    await screen.findByRole("button", { name: "فتح المشروع" });
    await settle();
    expect(summaryReads()).toBe(2);                                                                  // back to the hub: nothing
    await go("لوحة المتابعة");
    expect(summaryReads()).toBe(2);                                                                  // leaving: nothing
    await go("الرسائل");
    expect(summaryReads()).toBe(2);
    await openHub();
    await waitFor(() => expect(summaryReads()).toBe(3));                                             // re-entering: exactly one
    await settle();
    expect(summaryReads()).toBe(3);
  });
});

describe("8E-1 D/E — mutations: a status change refreshes once, a score-only save never does", () => {
  it("approve → exactly one refresh (badge follows the server); save score only → none", async () => {
    render(<App />); await login();
    const row = await openProjectStudents();
    const base = summaryReads();
    expect(base).toBe(2);                                                                            // login + entering Projects
    fireEvent.change(within(row).getByRole("spinbutton"), { target: { value: "88" } });
    fireEvent.click(within(row).getByRole("button", { name: "حفظ علامة المرحلة B01" }));
    await screen.findByText("تم حفظ العلامة.");
    expect(posts()).toEqual([{ projectCode: "794589", action: "progress.update", classId: "c1", studentId: "s1", stageId: "B01", score: "88" }]);
    await settle();
    expect(summaryReads()).toBe(base);                                                               // score-only: no refresh
    fireEvent.click(within(row).getByRole("button", { name: "اعتماد المرحلة B01" }));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[1]).toEqual({ projectCode: "794589", action: "progress.update", classId: "c1", studentId: "s1", stageId: "B01", status: "approved" });
    await waitFor(() => expect(summaryReads()).toBe(base + 1));                                      // exactly one refresh
    await waitFor(() => expect(projectsNav().textContent).toMatch(/1\s*مراحل بانتظار الفحص/));
    await settle();
    expect(summaryReads()).toBe(base + 1);
  });
});

describe("8E-1 F — session isolation", () => {
  it("a student session never reads the teacher-only summary", async () => {
    role = "student";
    render(<App />); await login();
    await settle();
    expect(summaryReads()).toBe(0);
    expect(calls.some(c => c.url.includes("/api/project-tracker"))).toBe(false);
  });
  it("logout clears the badge; a summary that resolves AFTER logout never repopulates it; the next login reads fresh", async () => {
    render(<App />); await login();
    expect(projectsNav().textContent).toMatch(/2/);
    ready = 7;
    holdSummary = true;                                                                              // the entry read will hang…
    fireEvent.click(projectsNav());
    await waitFor(() => expect(summaryReads()).toBe(2));
    fireEvent.click(document.querySelector(".app-sidebar-logout") as HTMLElement);                  // …and the teacher logs out meanwhile
    await waitFor(() => expect(document.querySelector("form.auth-form")).toBeTruthy());
    ready = 0;                                                                                       // the server's truth for the next session
    await act(async () => { releaseSummary(); });                                                    // the stale 7 lands after logout
    await settle();
    expect(screen.queryByRole("complementary", { name: "التنقل الرئيسي" })).toBeNull();             // nothing to repopulate
    await login();                                                                                   // a new session reads fresh, exactly once
    expect(summaryReads()).toBe(3);
    expect(projectsNav().textContent).not.toMatch(/7/);
    expect(projectsNav().textContent).not.toMatch(/بانتظار الفحص/);                                  // 0 → no badge
  });
});
