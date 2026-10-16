// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("react-chartjs-2", () => ({ Line: () => <div />, Doughnut: () => <div />, Bar: () => <div /> }));
import TeacherPlatform from "./TeacherPlatform";

// Phase 21H.2 (D3) — ONE scope for the dashboard page: the live hub sits under the page's scope bar, follows its class filter
// (the server narrows with ?classId=), and the page's single «تحديث» re-reads both; the hub shows no second refresh button.
// A hub answer for an earlier class never appears under a newer one.
const CLASSES = [{ classId: "cA", name: "صف ألف", grade: "10", schoolYear: "2026", active: true, studentCount: 2 }, { classId: "cB", name: "صف باء", grade: "11", schoolYear: "2026", active: true, studentCount: 1 }];
const kpis = { activeClasses: 2, activeStudents: 3, publishedAssignments: 2, submissions: 2, expectedSubmissions: 2, missingSubmissions: 0, pendingReview: 0, lateSubmissions: 0, completionRate: 100, average: 50, highest: 50, lowest: 50, performanceChange: 0, followUpStudents: 0, neverLogged: 0 };
const analytics = (classId: string) => ({ ok: true, generatedAt: "2026-10-16T22:00:00.000Z", classes: CLASSES, scope: { mode: classId ? "class" : "global", classId, className: classId ? "صف ألف" : "كل الصفوف", studentId: "", studentName: "", from: "", to: "" }, kpis, assignmentTrend: [], followUp: [], topImprovers: [], insights: [], gradeDistribution: [], submissionStatus: { submitted: 0, missing: 0, pendingReview: 0, late: 0 }, classComparison: [], topicAnalytics: [], students: [], studentDetail: null });
const today = (title: string) => ({ ok: true, generatedAt: "2026-10-16T22:00:00.000Z", scope: { activeClasses: 1, students: 2, publishedAssignments: 1 }, attention: { activeAttempts: { count: 0, items: [] }, notStarted: { count: 1, assignments: 1, items: [{ assignmentId: "a", title, className: "x", dueAt: "", notStarted: 1, expected: 2 }] }, pendingReview: { count: 0, assignments: 0, items: [] }, unreadMessages: { total: 0, capped: false } }, recent: [], partial: [] });
const json = (d: unknown) => ({ ok: true, status: 200, json: async () => d } as Response);
let todayUrls: string[] = [], analyticsUrls: string[] = [], holdB: ((r: Response) => void) | null = null;
beforeEach(() => {
  todayUrls = []; analyticsUrls = []; holdB = null;
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/teacher-today")) {
      todayUrls.push(url);
      if (url.endsWith("classId=cB")) return new Promise<Response>(res => { holdB = res; });
      return json(today(url.includes("classId=cA") ? "واجب صف ألف" : "واجب كل الصفوف"));
    }
    if (url.startsWith("/api/teacher-analytics")) { analyticsUrls.push(url); return json(analytics(new URLSearchParams(url.split("?")[1] || "").get("classId") || "")); }
    if (url.includes("/api/teacher-achievement-feed")) return json({ ok: true, posts: [] });
    return json({ ok: true, classes: [], projects: [], students: [], assignments: [], exams: [] });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const hub = () => screen.getByRole("region", { name: "ما الذي يحتاج انتباهي الآن؟" });
const mount = async () => {
  render(<TeacherPlatform token="t" projects={[]} currentExam={null} workspaceTab="dashboard" onNavigate={vi.fn()} />);
  await screen.findByText("واجب كل الصفوف");
  await screen.findByRole("combobox", { name: /الصف/ });
};

describe("21H.2 dashboard — one scope, one refresh", () => {
  it("the hub sits under the page's scope bar and has no refresh of its own", async () => {
    await mount();
    const bar = screen.getByRole("region", { name: "أدوات لوحة المتابعة" });
    expect(bar.compareDocumentPosition(hub()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(hub()).queryByRole("button", { name: /تحديث/ })).toBeNull();
    expect(within(hub()).getByText(/مباشر الآن · يتحدّث تلقائيًا كل دقيقة/)).toBeTruthy();
    expect(todayUrls).toEqual(["/api/teacher-today"]);
  });

  it("the class filter narrows the hub too; the page's «تحديث» re-reads both", async () => {
    await mount();
    fireEvent.change(screen.getByRole("combobox", { name: /الصف/ }), { target: { value: "cA" } });
    await within(hub()).findByText("واجب صف ألف");
    expect(within(hub()).queryByText("واجب كل الصفوف")).toBeNull();
    expect(todayUrls).toEqual(["/api/teacher-today", "/api/teacher-today?classId=cA"]);
    const before = analyticsUrls.length;
    fireEvent.click(within(screen.getByRole("region", { name: "أدوات لوحة المتابعة" })).getByRole("button", { name: /تحديث/ }));
    await waitFor(() => expect(todayUrls.length).toBe(3));
    expect(todayUrls[2]).toBe("/api/teacher-today?classId=cA");
    expect(analyticsUrls.length).toBe(before + 1);
  });

  it("while another class loads, the previous class's figures are not shown; a late answer for an old class never lands", async () => {
    await mount();
    fireEvent.change(screen.getByRole("combobox", { name: /الصف/ }), { target: { value: "cB" } });
    await waitFor(() => expect(holdB).not.toBeNull());
    expect(within(hub()).queryByText("واجب كل الصفوف")).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: /الصف/ }), { target: { value: "cA" } });
    await within(hub()).findByText("واجب صف ألف");
    holdB!(json(today("واجب صف باء المتأخر")));
    await new Promise(r => setTimeout(r, 20));
    expect(within(hub()).queryByText("واجب صف باء المتأخر")).toBeNull();
    expect(within(hub()).getByText("واجب صف ألف")).toBeTruthy();
  });
});
