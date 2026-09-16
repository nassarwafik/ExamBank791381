// @vitest-environment happy-dom
//
// UX-3 — "يحتاج إلى انتباهك" (Needs Attention). Exactly four locked categories, each fed only by fields the
// payload already carries: pending review (kpis.pendingReview + assignmentTrend[].pendingReview>0), urgent
// students (followUp severity === "high"), missing submissions (kpis.missingSubmissions + assignmentTrend[]
// .missing>0) and never logged in (kpis.neverLogged + followUp[] without lastLoginAt). No "low" tier is invented
// (the backend followUp list only ever contains high + medium), no medium card, no performance-decline card.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent, within } from "@testing-library/react";

vi.mock("react-chartjs-2", () => ({ Line: () => <div />, Doughnut: () => <div />, Bar: () => <div /> }));
import TeacherDashboard from "./TeacherDashboard";

const student = (userId: string, displayName: string, severity: "high" | "medium", lastLoginAt: string, extra: Record<string, unknown> = {}) => ({
  userId, displayName, identityNumber: "1000" + userId, classId: "c1", className: "الحادي عشر", average: severity === "high" ? 44 : 58, assigned: 5, completed: 3, missing: severity === "high" ? 3 : 1,
  completionRate: 60, trendDelta: 0, trend: "stable", lastLoginAt, severity, reasons: ["سبب"], ...extra
});
const assignment = (id: string, title: string, pendingReview: number, missing: number) => ({
  assignmentId: id, classId: "c1", className: "الحادي عشر", title, dueAt: "", date: "", students: 20, submitted: 20 - missing, missing, pendingReview, completionRate: 80, average: 70, highest: 90, lowest: 50
});
function base() {
  return {
    ok: true, generatedAt: "2026-09-10T08:30:00.000Z", scope: { classId: "", className: "كل الصفوف", from: "", to: "" },
    classes: [{ classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026", active: true, studentCount: 20 }],
    kpis: { activeClasses: 1, activeStudents: 20, publishedAssignments: 3, submissions: 50, expectedSubmissions: 60, missingSubmissions: 0, pendingReview: 0, lateSubmissions: 0, completionRate: 83, average: 70, highest: 90, lowest: 50, performanceChange: -12, followUpStudents: 0, neverLogged: 0 },
    submissionStatus: { submitted: 50, missing: 0, pendingReview: 0, late: 0 }, gradeDistribution: [], assignmentTrend: [] as ReturnType<typeof assignment>[], classComparison: [], topicAnalytics: [],
    followUp: [] as ReturnType<typeof student>[], topImprovers: [], insights: [], students: [], studentDetail: null
  };
}
function attentionFixture() {
  const f = base();
  f.kpis = { ...f.kpis, pendingReview: 3, missingSubmissions: 4, neverLogged: 2, followUpStudents: 4 };
  f.assignmentTrend = [assignment("a1", "اختبار الكسور", 2, 1), assignment("a2", "واجب الجبر", 1, 3), assignment("a3", "مراجعة", 0, 0)];
  f.followUp = [
    student("u1", "سارة خالد", "high", "2026-09-01T00:00:00.000Z"),
    student("u2", "عمر سعيد", "medium", ""),
    student("u3", "نور علي", "high", ""),
    student("u4", "يزن محمد", "medium", "2026-09-02T00:00:00.000Z")
  ];
  return f;
}
type Call = { url: string; init?: RequestInit };
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: true, json: async () => body } as Response);
function installFetch(payload: () => unknown) {
  const calls: Call[] = [];
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.startsWith("/api/teacher-analytics")) return res(200, payload());
    if (url.startsWith("/api/teacher-achievement-feed")) return res(200, { ok: true, posts: [] });
    if (url.startsWith("/api/assignment-results")) return res(200, { ok: true, assignment: { assignmentId: "a1", title: "x", maxAttempts: 1, totalMarks: 10 }, stats: { students: 0, submitted: 0, pendingReview: 0, average: null, highest: null, lowest: null }, students: [] });
    if (url.startsWith("/api/students")) return res(200, { ok: true, profile: { student: { userId: "u", displayName: "x", identityNumber: "", firstName: "", familyName: "", classId: "c1", active: true, archived: false, createdAt: "", lastLoginAt: "" }, classroom: null, stats: { assigned: 0, completed: 0, pending: 0, average: null, lastLoginAt: "" }, assignments: [] } });
    return res(200, { ok: true });
  }) as unknown as typeof fetch;
  return calls;
}
async function mount(payload: () => unknown) {
  const calls = installFetch(payload);
  render(<TeacherDashboard token="t" />);
  const section = (await screen.findByRole("heading", { level: 2, name: "يحتاج إلى انتباهك" })).closest("section") as HTMLElement;
  return { calls, section };
}
const card = (section: HTMLElement, name: string) => within(section).getByRole("heading", { level: 3, name: new RegExp("^" + name) }).closest("article") as HTMLElement;
const count = (el: HTMLElement) => el.querySelector(".eb-attention-count")?.textContent;
const items = (el: HTMLElement) => Array.from(el.querySelectorAll(".eb-attention-item-label")).map(x => x.textContent);

beforeEach(() => { window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => true })) as unknown as typeof window.matchMedia; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("UX-3 Needs Attention — four locked categories", () => {
  it("renders exactly four cards in the locked order with counts from kpis / followUp", async () => {
    const { section } = await mount(attentionFixture);
    const titles = within(section).getAllByRole("heading", { level: 3 }).map(h => h.firstElementChild?.textContent);
    expect(titles).toEqual(["بانتظار التصحيح", "طلاب في حالة عاجلة", "تسليمات ناقصة", "لم يسجّلوا الدخول"]);
    expect(section.querySelectorAll(".eb-attention-card")).toHaveLength(4);
    expect(count(card(section, "بانتظار التصحيح"))).toBe("3");   // kpis.pendingReview
    expect(count(card(section, "طلاب في حالة عاجلة"))).toBe("2"); // followUp.filter(severity === "high").length
    expect(count(card(section, "تسليمات ناقصة"))).toBe("4");     // kpis.missingSubmissions
    expect(count(card(section, "لم يسجّلوا الدخول"))).toBe("2");  // kpis.neverLogged
  });
  it("pending review lists assignments with pendingReview > 0 and opens the assignment drill-down", async () => {
    const { section, calls } = await mount(attentionFixture);
    const c = card(section, "بانتظار التصحيح");
    expect(items(c)).toEqual(["اختبار الكسور", "واجب الجبر"]);
    expect(c.textContent).toContain("2 بانتظار التصحيح");
    fireEvent.click(within(c).getByRole("button", { name: /واجب الجبر/ }));
    await waitFor(() => expect(calls.some(x => x.url === "/api/assignment-results?assignmentId=a2")).toBe(true));
  });
  it("urgent students = severity high only (medium is NOT urgent, no low tier exists) and opens the profile", async () => {
    const { section, calls } = await mount(attentionFixture);
    const c = card(section, "طلاب في حالة عاجلة");
    expect(items(c)).toEqual(["سارة خالد", "نور علي"]);
    expect(c.textContent).not.toContain("عمر سعيد"); expect(c.textContent).not.toContain("يزن محمد");
    expect(c.textContent).toContain("المعدل 44%");
    fireEvent.click(within(c).getByRole("button", { name: /نور علي/ }));
    await waitFor(() => expect(calls.some(x => x.url === "/api/students?profileUserId=u3")).toBe(true));
    expect(section.textContent).not.toMatch(/منخفض|low/);
  });
  it("missing submissions lists assignments with missing > 0 and opens the assignment drill-down", async () => {
    const { section, calls } = await mount(attentionFixture);
    const c = card(section, "تسليمات ناقصة");
    expect(items(c)).toEqual(["اختبار الكسور", "واجب الجبر"]);
    expect(c.textContent).toContain("3 لم يُسلّموا");
    fireEvent.click(within(c).getByRole("button", { name: /اختبار الكسور/ }));
    await waitFor(() => expect(calls.some(x => x.url === "/api/assignment-results?assignmentId=a1")).toBe(true));
  });
  it("never logged in lists followUp entries without lastLoginAt regardless of severity, and opens the profile", async () => {
    const { section, calls } = await mount(attentionFixture);
    const c = card(section, "لم يسجّلوا الدخول");
    expect(items(c)).toEqual(["عمر سعيد", "نور علي"]);
    fireEvent.click(within(c).getByRole("button", { name: /عمر سعيد/ }));
    await waitFor(() => expect(calls.some(x => x.url === "/api/students?profileUserId=u2")).toBe(true));
  });
  it("no medium card and no performance-decline card even when performanceChange is strongly negative", async () => {
    const { section } = await mount(attentionFixture);
    expect(section.textContent).not.toMatch(/تراجع الأداء|يتراجع|متابعة عادية|حالة متوسطة/);
    expect(within(section).queryByRole("heading", { level: 3, name: /متابعة/ })).toBeNull();
  });
  it("shows the four locked empty strings when there is nothing to act on", async () => {
    const { section } = await mount(base);
    expect(items(card(section, "بانتظار التصحيح"))).toEqual([]);
    expect(card(section, "بانتظار التصحيح").textContent).toContain("لا توجد تسليمات بانتظار التصحيح");
    expect(card(section, "طلاب في حالة عاجلة").textContent).toContain("لا توجد حالات عاجلة");
    expect(card(section, "تسليمات ناقصة").textContent).toContain("لا توجد تسليمات ناقصة");
    expect(card(section, "لم يسجّلوا الدخول").textContent).toContain("جميع الطلاب سجّلوا الدخول");
    for (const c of Array.from(section.querySelectorAll(".eb-attention-card"))) expect(c.querySelector(".eb-attention-count")?.textContent).toBe("0");
  });
  it("previews at most five items per card and states how many more exist", async () => {
    const { section } = await mount(() => { const f = attentionFixture(); f.assignmentTrend = Array.from({ length: 7 }, (_, i) => assignment("p" + i, "واجب " + i, 1, 0)); return f; });
    const c = card(section, "بانتظار التصحيح");
    expect(items(c)).toHaveLength(5);
    expect(c.textContent).toContain("و2 أخرى");
  });
});
