// @vitest-environment happy-dom
// Tadris+ P7-A1 — the dashboard's analysis sections follow the server's `widgets`: a teacher without assignments (learning-only)
// sees the class / student figures, the follow-up and the insights — never an assignment card, chart, table or the AI analysis.
// An older payload without `widgets` shows every section, exactly as before. TEST data only.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";

vi.mock("react-chartjs-2", () => ({ Line: () => <div />, Doughnut: () => <div />, Bar: () => <div /> }));
import TeacherDashboard from "./TeacherDashboard";

function payload(widgets?: string[]) {
  return {
    ok: true, generatedAt: "2026-09-10T08:30:00.000Z", scope: { classId: "", className: "كل الصفوف", from: "", to: "" },
    classes: [{ classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026", active: true, studentCount: 20 }],
    kpis: { activeClasses: 1, activeStudents: 20, publishedAssignments: 0, submissions: 0, expectedSubmissions: 0, missingSubmissions: 0, pendingReview: 0, lateSubmissions: 0, completionRate: 0, average: null, highest: null, lowest: null, performanceChange: 0, followUpStudents: 0, neverLogged: 2 },
    submissionStatus: { submitted: 0, missing: 0, pendingReview: 0, late: 0 }, gradeDistribution: [], assignmentTrend: [], classComparison: [], topicAnalytics: [],
    followUp: [], topImprovers: [], insights: [{ tone: "warning", title: "طلاب لم يدخلوا بعد", text: "2 طالبًا فعّالًا لم يسجلوا الدخول إلى المنصة بعد." }], students: [], studentDetail: null,
    ...(widgets ? { widgets } : {})
  };
}
const res = (body: unknown) => Promise.resolve({ status: 200, ok: true, json: async () => body } as Response);
function install(body: unknown) {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/teacher-analytics")) return res(body);
    if (url.startsWith("/api/teacher-achievement-feed")) return res({ ok: true, posts: [] });
    return res({ ok: true });
  }) as unknown as typeof fetch;
}
const h2 = () => screen.queryAllByRole("heading", { level: 2 }).map(h => h.textContent || "");
const labels = () => Array.from(document.querySelectorAll(".eb-stat-grid")).map(g => g.textContent || "").join("|");

beforeEach(() => { window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => true })) as unknown as typeof window.matchMedia; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("P7-A1 dashboard — only the served analytics widgets", () => {
  it("learning-only: students / follow-up / insights; no marks, submissions, charts, assignment table or AI analysis", async () => {
    install(payload(["students.followUp", "insights"]));
    render(<TeacherDashboard token="t" />);
    await screen.findByRole("heading", { level: 2, name: "مؤشرات ذكية للمعلم" });
    expect(h2().join("|")).toMatch(/طلاب يحتاجون متابعة/);
    expect(h2()).not.toContain("الاتجاهات والتحليلات");
    expect(h2()).not.toContain("متابعة الواجبات");
    expect(h2().join("|")).not.toMatch(/تحليل البيانات/);
    expect(labels()).toMatch(/الطلاب الفعّالون/);
    expect(labels()).not.toMatch(/متوسط العلامات|نسبة التسليم|بانتظار التصحيح|واجبات منشورة|اتجاه الأداء/);
    expect(screen.queryByRole("heading", { level: 3, name: /^تسليمات ناقصة/ })).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: /^لم يسجّلوا الدخول/ })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 3, name: "أفضل تحسن" })).toBeNull();
  });

  it("an older payload without `widgets`: every section, as before", async () => {
    install(payload());
    render(<TeacherDashboard token="t" />);
    await screen.findByRole("heading", { level: 2, name: "الاتجاهات والتحليلات" });
    expect(h2()).toContain("متابعة الواجبات");
    expect(h2().join("|")).toMatch(/تحليل البيانات/);
    expect(labels()).toMatch(/متوسط العلامات/);
  });
});
