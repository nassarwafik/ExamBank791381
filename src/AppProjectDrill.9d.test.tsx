// @vitest-environment happy-dom
//
// Phase 9D — App navigation for the Today Hub's «تقييم المشاريع» rows, on the REAL App (login → dashboard → hub row).
// A row drills into the exact project + class + student (the tracker reads that project's classes, then the exact
// `student`); ordinary Projects navigation clears the target (opening the same project by hand never re-opens the
// student); two students of the same project are two distinct drill requests; the same row again is never a no-op.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act, configure } from "@testing-library/react";
configure({ asyncUtilTimeout: 5000 });
import App from "./App";

const TRACKS = [{ trackId: "book", title: "الكتاب", icon: "📘" }];
const PROJECTS = [{ projectCode: "899373", title: "مشروع 899373", tracks: TRACKS }, { projectCode: "883589", title: "مشروع 883589", tracks: TRACKS }];
const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2025-2026", status: "active", studentCount: 2 }, { classId: "c2", name: "الثاني عشر", grade: "12", schoolYear: "2025-2026", status: "active", studentCount: 1 }];
const STAGES = [{ stageId: "B01", track: "book", groupId: "g1", title: "مقدمة", order: 1, weight: 1, required: true, active: true }];
const GROUPS = [{ groupId: "g1", track: "book", title: "الوحدة الأولى", order: 1 }];
const NAMES: Record<string, string> = { s1: "زيد صالح", s2: "خالد عمر", s3: "نور علي" };
const card = (id: string) => ({ studentId: id, displayName: NAMES[id], code: "P" + id, overallProgress: 20, trackProgress: { book: 20 }, counts: { not_started: 1, in_progress: 0, ready_for_review: 0, approved: 0 }, readyForReviewCount: 0, complete: false, updatedAt: "2026-03-01T10:00:00.000Z", stale: false });
const detail = (code: string, sid: string) => ({ ok: true, readOnly: false, projectCode: code, student: { studentId: sid, displayName: NAMES[sid], code: "P" + sid }, tracks: TRACKS, summary: card(sid), stages: STAGES, groups: GROUPS, trackWeights: { book: 1 }, config: { staleDays: 7, lateThreshold: 40, balanceWarningThreshold: 30 }, progress: {}, history: [], nextStages: { book: STAGES[0] }, balance: null });
const row = (studentId: string, classId: string, projectCode: string, projectTitle: string, graded: number, total: number) => ({ studentId, displayName: NAMES[studentId], classId, className: "صف", projectCode, projectTitle, gradedStages: graded, totalStages: total, ungradedStages: total - graded, evaluationProgress: Math.round((graded / total) * 100) });
const TODAY = {
  ok: true, generatedAt: "2026-03-10T10:00:00.000Z", scope: { activeClasses: 2, students: 3, publishedAssignments: 0 },
  attention: { activeAttempts: { count: 0, items: [] }, notStarted: { count: 0, assignments: 0, items: [] }, pendingReview: { count: 0, assignments: 0, items: [] }, unreadMessages: { total: 0, capped: false } },
  recent: [], partial: [],
  projectEvaluation: { studentsWithUngradedStages: 3, totalUngradedStages: 3, projects: [], attentionTotal: 3, capped: false,
    attention: [row("s1", "c1", "899373", "مشروع 899373", 0, 1), row("s2", "c1", "899373", "مشروع 899373", 0, 1), row("s3", "c2", "883589", "مشروع 883589", 0, 1)] }
};
const GENERIC = { ok: true, classes: [], students: [], assignments: [], exams: [], posts: [], events: [], items: [], materials: [], courses: [], modules: [], challenges: [], sessions: [], projects: PROJECTS, schoolYears: [], years: [], totalUnread: 0, capped: false, byStudent: {} };

type Call = { method: string; url: string };
let calls: Call[] = [];
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
function installFetch() {
  calls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).replace(/^https?:\/\/[^/]+/, ""), method = init?.method || "GET";
    calls.push({ method, url });
    if (url.includes("/api/platform-login")) return res(200, { ok: true, role: "teacher", token: "teacher-token", displayName: "المعلم" });
    if (url.includes("/api/teacher-today")) return res(200, TODAY);
    if (url.includes("/api/project-tracker")) {
      const u = new URL(url, "http://x"), resource = u.searchParams.get("resource"), code = u.searchParams.get("projectCode") || "";
      if (resource === "projects-summary") return res(200, { ok: true, totalReadyForReview: 0, byProject: {} });
      if (resource === "projects") return res(200, { ok: true, projects: PROJECTS });
      if (resource === "classes") return res(200, { ok: true, projectCode: code, title: "مشروع " + code, tracks: TRACKS, classes: CLASSES });
      if (resource === "summary") return res(200, { ok: true, summary: { studentCount: 2, avgOverall: 20, trackAverages: { book: 20 }, completedCount: 0, studentsReadyForReview: 0, totalReadyStages: 0, staleCount: 0, trackWeights: { book: 1 }, staleDays: 7 } });
      if (resource === "students") return res(200, { ok: true, students: u.searchParams.get("classId") === "c2" ? [card("s3")] : [card("s1"), card("s2")], tracks: TRACKS, config: { lateThreshold: 40 } });
      if (resource === "student") return res(200, detail(code, String(u.searchParams.get("studentId"))));
      return res(200, { ok: true });
    }
    if (url.includes("/api/teacher-analytics")) return res(500, { ok: false, error: "x" });
    return res(200, GENERIC);
  }) as unknown as typeof fetch;
}
const studentReads = () => calls.filter(c => c.method === "GET" && c.url.includes("resource=student&")).map(c => { const u = new URL(c.url, "http://x"); return [u.searchParams.get("projectCode"), u.searchParams.get("classId"), u.searchParams.get("studentId")]; });
const classReads = () => calls.filter(c => c.method === "GET" && c.url.includes("resource=classes")).map(c => new URL(c.url, "http://x").searchParams.get("projectCode"));
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 120)); });
const sidebar = () => screen.getByRole("complementary", { name: "التنقل الرئيسي" });
const navButton = (label: string) => within(sidebar()).getByRole("button", { name: new RegExp("^" + label) });
async function login() {
  fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, { target: { value: "T" } });
  fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "pw" } });
  fireEvent.submit(document.querySelector("form.auth-form") as HTMLFormElement);
  await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy());
  await settle();
  fireEvent.click(navButton("لوحة المتابعة")); await settle();                          // the teacher lands on the builder; the hub lives on the dashboard
}
const evalCard = async () => within(await screen.findByRole("article", { name: /تقييم المشاريع/ }));
async function drill(name: string) {
  fireEvent.click((await evalCard()).getByRole("button", { name: new RegExp("لتقييم " + name) }));
  return await screen.findByRole("heading", { level: 2, name: "ملف المشروع: " + name });
}

beforeEach(() => {
  try { sessionStorage.clear(); } catch { /* ignore */ }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  installFetch();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("9D App — drill navigation from the Today Hub", () => {
  it("B1 a row opens the exact project (classes read for it), selects the exact class, opens the exact student — the project view with the tracker, no hub", async () => {
    render(<App />); await login();
    const heading = await drill("نور علي");
    expect(classReads()).toEqual(["883589"]);
    expect(studentReads()).toEqual([["883589", "c2", "s3"]]);
    expect((within(screen.getByRole("region", { name: "مساحة عمل المشروع" })).getByRole("combobox") as HTMLSelectElement).value).toBe("c2");
    expect(screen.queryByRole("button", { name: "فتح المشروع" })).toBeNull();          // not the hub
    expect(heading.closest(".eb-student-profile")!.contains(document.activeElement)).toBe(true);     // 9E: focus lands inside the profile (heading, or the first ungraded stage's input when the detail carries `evaluation`)
  });
  it("B2 ordinary Projects navigation clears the target: hub → open the same project by hand → dashboard view, no student read", async () => {
    render(<App />); await login();
    await drill("زيد صالح");
    expect(studentReads()).toEqual([["899373", "c1", "s1"]]);
    fireEvent.click(navButton("المشاريع"));                                               // normal navigation → hub, target cleared
    const open = await screen.findAllByRole("button", { name: "فتح المشروع" });
    fireEvent.click(open[0]);                                                              // goToProjects("899373") by hand
    await screen.findByRole("heading", { level: 2, name: "لوحة المشروع" });
    await settle();
    expect(screen.queryByRole("heading", { level: 2, name: /ملف المشروع/ })).toBeNull();
    expect(studentReads()).toEqual([["899373", "c1", "s1"]]);                               // no second student read
    expect(classReads()).toEqual(["899373", "899373"]);
  });
  it("B3 two students of the SAME project are two distinct drill requests (dashboard → A, dashboard → B), each opening its own profile", async () => {
    render(<App />); await login();
    await drill("زيد صالح");
    fireEvent.click(navButton("لوحة المتابعة")); await settle();
    await drill("خالد عمر");
    expect(studentReads()).toEqual([["899373", "c1", "s1"], ["899373", "c1", "s2"]]);
  });
  it("B4 the SAME row again is never a no-op: after going back to the dashboard the second click re-opens the same student", async () => {
    render(<App />); await login();
    await drill("خالد عمر");
    fireEvent.click(navButton("لوحة المتابعة")); await settle();
    await drill("خالد عمر");
    expect(studentReads()).toEqual([["899373", "c1", "s2"], ["899373", "c1", "s2"]]);
  });
});
