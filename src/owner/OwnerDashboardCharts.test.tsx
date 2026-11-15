// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import type { OwnerTeacherDashboard as Dashboard } from "./ownerApi";

// Owner teacher dashboard — phase 3: every chart draws EXACTLY the series of its accessible table (the shared teacher-dashboard
// models), the student detail swaps in that student's series, and the class chart's picker chooses a class.
type Call = { type: string; data: { labels: string[]; datasets: { data: number[] }[] } };
const charts = vi.hoisted(() => ({ calls: [] as { type: string; data: { labels: string[]; datasets: { data: number[] }[] } }[] }));
vi.mock("react-chartjs-2", () => {
  const make = (type: string) => (props: { data: Call["data"] }) => { charts.calls.push({ type, data: props.data }); return <div data-testid={"chart-" + type} />; };
  return { Line: make("line"), Bar: make("bar"), Doughnut: make("doughnut") };
});
const { DashboardCharts } = await import("./OwnerDashboardCharts");

beforeEach(() => { charts.calls = []; });
afterEach(cleanup);

const base = (over: Partial<Dashboard> = {}): Dashboard => ({
  ok: true, generatedAt: "", teacher: { accountId: "t_00112233445566aa", username: "t.sara", displayName: "سارة", status: "active" }, scope: { classId: "", className: "", from: "", to: "" },
  classes: [{ classId: "c1", name: "العاشر", grade: "10", schoolYear: "", active: true, studentCount: 20 }, { classId: "c2", name: "الحادي عشر", grade: "11", schoolYear: "", active: true, studentCount: 18 }],
  kpis: { activeClasses: 2, activeStudents: 38, publishedAssignments: 3, submissions: 90, expectedSubmissions: 100, missingSubmissions: 10, pendingReview: 4, lateSubmissions: 2, completionRate: 90, average: 75, highest: 100, lowest: 30, performanceChange: 3, followUpStudents: 2, neverLogged: 1 },
  submissionStatus: { submitted: 90, missing: 10, pendingReview: 4, late: 2 },
  gradeDistribution: [{ label: "0–59", count: 5 }, { label: "60–79", count: 12 }, { label: "80–100", count: 21 }],
  assignmentTrend: [
    { assignmentId: "a1", classId: "c1", className: "العاشر", title: "واجب 1", dueAt: "", date: "", students: 20, submitted: 18, missing: 2, pendingReview: 0, completionRate: 90, average: 70, highest: 95, lowest: 40 },
    { assignmentId: "a2", classId: "c1", className: "العاشر", title: "واجب 2", dueAt: "", date: "", students: 20, submitted: 20, missing: 0, pendingReview: 1, completionRate: 100, average: null, highest: null, lowest: null },
    { assignmentId: "a3", classId: "c2", className: "الحادي عشر", title: "واجب 3", dueAt: "", date: "", students: 18, submitted: 16, missing: 2, pendingReview: 0, completionRate: 88.9, average: 82.5, highest: 100, lowest: 50 }
  ],
  classComparison: [
    { classId: "c1", name: "العاشر", grade: "10", students: 20, assignments: 2, expected: 40, submitted: 38, missing: 2, pendingReview: 1, completionRate: 95, average: 70 },
    { classId: "c2", name: "الحادي عشر", grade: "11", students: 18, assignments: 1, expected: 18, submitted: 16, missing: 2, pendingReview: 0, completionRate: 88.9, average: 82.5 }
  ],
  topicAnalytics: [{ topic: "الحلقات", average: 55, gradedQuestions: 40 }, { topic: "المصفوفات", average: 85, gradedQuestions: 30 }],
  followUp: [], topImprovers: [], insights: [], students: [], studentDetail: null, ...over
});
const series = (type: string, n = 0) => charts.calls.filter(c => c.type === type)[n];

describe("the charts of «لوحة البيانات»", () => {
  it("five charts, each drawing exactly the series its table lists", () => {
    render(<DashboardCharts data={base()} onPickClass={() => {}} />);
    for (const title of ["تطور متوسط الأداء", "حالة التسليم", "توزيع العلامات", "مقارنة الصفوف", "الأداء حسب الموضوع"]) expect(screen.getByRole("heading", { level: 2, name: title })).toBeTruthy();
    const trend = series("line");
    expect(trend.data.labels).toEqual(["واجب 1", "واجب 3"]);                          // an assignment without an average is not plotted
    expect(trend.data.datasets[0].data).toEqual([70, 82.5]);
    expect(series("doughnut").data.datasets[0].data).toEqual([90, 10]);
    const bars = charts.calls.filter(c => c.type === "bar");
    // the grade bands are drawn inside a left-to-right isolate so «60–79» keeps its order on the right-to-left canvas
    expect(bars.map(b => b.data.labels)).toEqual([["0–59", "60–79", "80–100"].map(l => "\u2066" + l + "\u2069"), ["العاشر", "الحادي عشر"], ["الحلقات", "المصفوفات"]]);
    expect(bars.map(b => b.data.datasets[0].data)).toEqual([[5, 12, 21], [70, 82.5], [55, 85]]);
    // each figure has a text summary as its accessible name (the canvas itself is hidden)
    expect(screen.getAllByRole("img").map(f => f.getAttribute("aria-label") || "").every(t => t.length > 10)).toBe(true);
  });
  it("the class picker chooses a class; with one class (or inside a class) there is no comparison chart", () => {
    const onPick = vi.fn();
    render(<DashboardCharts data={base()} onPickClass={onPick} />);
    fireEvent.click(within(screen.getByRole("list", { name: "اختيار صف" })).getByRole("button", { name: /الحادي عشر/ }));
    expect(onPick).toHaveBeenCalledWith("c2");
    cleanup();
    render(<DashboardCharts data={base({ classComparison: base().classComparison.slice(0, 1) })} />);
    expect(screen.queryByRole("heading", { name: "مقارنة الصفوف" })).toBeNull();
  });
  it("a student's detail swaps in the student's own marks and topics", () => {
    render(<DashboardCharts data={base({ studentDetail: {
      userId: "s1", displayName: "ليان", classId: "c1", className: "العاشر", average: 64, assigned: 3, completed: 2, missing: 1, completionRate: 66.7, trendDelta: -8, trend: "declining", lastLoginAt: "", reasons: [],
      scoreTrend: [{ assignmentId: "a1", title: "واجب 1", date: "", percentage: 72 }, { assignmentId: "a3", title: "واجب 3", date: "", percentage: 56 }],
      topicAnalytics: [{ topic: "الحلقات", average: 40, gradedQuestions: 4 }]
    } })} />);
    expect(screen.getByRole("heading", { level: 2, name: "حركة علامات الطالب" })).toBeTruthy();
    expect(series("line").data.datasets[0].data).toEqual([72, 56]);
    expect(screen.queryByRole("heading", { name: "مقارنة الصفوف" })).toBeNull();
    const topics = charts.calls.filter(c => c.type === "bar").pop()!;
    expect([topics.data.labels, topics.data.datasets[0].data]).toEqual([["الحلقات"], [40]]);
  });
  it("nothing to chart → a plain message, never an empty figure", () => {
    render(<DashboardCharts data={base({ assignmentTrend: [], gradeDistribution: [{ label: "0–59", count: 0 }], topicAnalytics: [], submissionStatus: { submitted: 0, missing: 0, pendingReview: 0, late: 0 } })} />);
    for (const text of ["يظهر تطور الأداء بعد نتيجتين على الأقل.", "لا توجد تسليمات متوقعة بعد.", "لا توجد علامات بعد.", "تظهر المواضيع بعد وجود إجابات مصححة."]) expect(screen.getByText(text)).toBeTruthy();
    expect(charts.calls.filter(c => c.type !== "bar" || c.data.labels.includes("العاشر"))).toHaveLength(1);   // only the class comparison draws
  });
});
