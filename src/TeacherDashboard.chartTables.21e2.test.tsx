// @vitest-environment happy-dom
//
// Phase 21E.2 (H) — every teacher-dashboard chart is a shared ChartCard: a named figure (the SAME text summary as before) plus
// a disclosure revealing a real data table (caption, column headers with scope="col", row headers with scope="row") whose
// values are exactly the series handed to Chart.js. Empty states stay plain text (never role="img"), and the class picker
// stays operable outside the figure. Fixture shapes are copied from TeacherDashboard.test.tsx (same payload contract).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent, within } from "@testing-library/react";

type ChartCall = { type: string; data: { labels: unknown[]; datasets: Array<Record<string, unknown>> }; options: Record<string, unknown> };
const charts = vi.hoisted(() => ({ calls: [] as ChartCall[] }));
vi.mock("react-chartjs-2", () => {
  const make = (type: string) => (props: { data: ChartCall["data"]; options: ChartCall["options"] }) => {
    charts.calls.push({ type, data: props.data, options: props.options });
    return <div data-testid={"chart-" + type} />;
  };
  return { Line: make("line"), Doughnut: make("doughnut"), Bar: make("bar") };
});

import TeacherDashboard from "./TeacherDashboard";


const GENERATED_AT = "2026-09-10T08:30:00.000Z";
const trendItem = (n: number, extra: Partial<Record<string, unknown>> = {}) => ({
  assignmentId: "a" + n, classId: "c1", className: "الحادي عشر", title: "واجب " + n, dueAt: "2026-09-0" + n + "T10:00:00.000Z", date: "2026-09-0" + n,
  students: 20, submitted: 15 + n, missing: 5 - n, pendingReview: n, completionRate: 70 + n, average: 60 + n * 5, highest: 95, lowest: 40, ...extra
});
function analyticsFixture() {
  return {
    ok: true, generatedAt: GENERATED_AT,
    scope: { classId: "", className: "كل الصفوف", from: "", to: "" },
    classes: [
      { classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026", active: true, studentCount: 20 },
      { classId: "c2", name: "العاشر", grade: "10", schoolYear: "2026", active: true, studentCount: 18 },
      { classId: "c9", name: "مؤرشف", grade: "9", schoolYear: "2025", active: false, studentCount: 0 }
    ],
    kpis: { activeClasses: 2, activeStudents: 38, publishedAssignments: 7, submissions: 51, expectedSubmissions: 60, missingSubmissions: 9, pendingReview: 4, lateSubmissions: 3, completionRate: 85, average: 72.4, highest: 98, lowest: 31, performanceChange: -6.5, followUpStudents: 5, neverLogged: 2 },
    submissionStatus: { submitted: 51, missing: 9, pendingReview: 4, late: 3 },
    gradeDistribution: [{ label: "90-100", count: 6 }, { label: "80-89", count: 10 }, { label: "أقل من 50", count: 3 }],
    assignmentTrend: [trendItem(1), trendItem(2), trendItem(3, { average: null })],
    classComparison: [
      { classId: "c1", name: "الحادي عشر", grade: "11", students: 20, assignments: 4, expected: 40, submitted: 33, missing: 7, pendingReview: 2, completionRate: 82.5, average: 74.2 },
      { classId: "c2", name: "العاشر", grade: "10", students: 18, assignments: 3, expected: 20, submitted: 18, missing: 2, pendingReview: 2, completionRate: 90, average: null }
    ],
    topicAnalytics: Array.from({ length: 12 }, (_, i) => ({ topic: "موضوع " + (i + 1), average: i === 0 ? 45 : i === 1 ? 85 : 70, gradedQuestions: 10 + i })),
    followUp: [
      { userId: "u1", displayName: "سارة خالد", identityNumber: "123456789", classId: "c1", className: "الحادي عشر", average: 42, assigned: 5, completed: 2, missing: 3, completionRate: 40, trendDelta: -16, trend: "declining", lastLoginAt: "2026-09-01T00:00:00.000Z", severity: "high", reasons: ["المعدل منخفض", "تسليمات ناقصة"] },
      { userId: "u2", displayName: "عمر سعيد", identityNumber: "987654321", classId: "c1", className: "الحادي عشر", average: 58, assigned: 5, completed: 3, missing: 2, completionRate: 60, trendDelta: 0, trend: "stable", lastLoginAt: "", severity: "medium", reasons: ["لم يسجل الدخول"] }
    ],
    topImprovers: [{ userId: "u3", displayName: "ليان أحمد", identityNumber: "555", classId: "c2", className: "العاشر", average: 80, assigned: 4, completed: 4, missing: 0, completionRate: 100, trendDelta: 12, trend: "improving", lastLoginAt: "2026-09-02T00:00:00.000Z", severity: "low", reasons: [] }],
    insights: [{ tone: "warning", title: "انتباه", text: "تراجع الأداء" }, { tone: "success", title: "جيد", text: "نسبة تسليم مرتفعة" }, { tone: "info", title: "معلومة", text: "نص" }],
    students: [{ userId: "u1", displayName: "سارة خالد" }, { userId: "u2", displayName: "عمر سعيد" }],
    studentDetail: null as null | Record<string, unknown>
  };
}
const RESULTS = { ok: true, assignment: { assignmentId: "a1", title: "واجب 1", maxAttempts: 2, totalMarks: 20 }, stats: { students: 20, submitted: 16, pendingReview: 1, average: 65, highest: 95, lowest: 40 },
  students: [{ studentId: "st1", studentName: "سارة خالد", studentCode: "S1", attemptsUsed: 1, allowedAttempts: 2, attempts: [{ attemptNumber: 1, score: 13, totalMarks: 20, percentage: 65, submittedAt: "2026-09-01T00:00:00.000Z", gradingStatus: "final", finalized: true }], latestResult: { attemptNumber: 1, score: 13, totalMarks: 20, percentage: 65, submittedAt: "2026-09-01T00:00:00.000Z", gradingStatus: "final", finalized: true } }] };
const PROFILE = { ok: true, profile: { student: { userId: "u1", displayName: "سارة خالد", identityNumber: "123456789", firstName: "سارة", familyName: "خالد", classId: "c1", active: true, archived: false, createdAt: "", lastLoginAt: "" }, classroom: { classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026" }, stats: { assigned: 5, completed: 2, pending: 3, average: 42, lastLoginAt: "" }, assignments: [{ assignmentId: "a1", title: "واجب 1", status: "published", dueAt: "", totalMarks: 20, attemptsUsed: 1, latestScore: 13, latestPercentage: 65, submittedAt: "", gradingStatus: "final", finalized: true }] } };
const REVIEW = { ok: true, assignment: { assignmentId: "a1", title: "واجب 1", totalMarks: 20 }, student: { studentId: "st1", studentName: "سارة خالد", studentCode: "S1" }, attempt: { attemptNumber: 1, submittedAt: "", score: 13, totalMarks: 20, percentage: 65, manualReviewMarks: 0, gradingStatus: "final", finalized: true, teacherFeedback: "أحسنت" }, attempts: [{ attemptNumber: 1, submittedAt: "", score: 13, totalMarks: 20, percentage: 65, manualReviewMarks: 0, gradingStatus: "final", finalized: true }], questions: [{ questionId: "q1", questionNumber: 1, text: "سؤال", marks: 5, type: "mcq", autoGrade: { score: 5, maxMarks: 5, correct: true, manualReview: false }, manualScore: null, teacherComment: "" }] };

type Call = { url: string; init?: RequestInit };
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
function installFetch(overrides: { analytics?: () => unknown; analyticsStatus?: number; feed?: unknown; feedGet?: (url: string) => Promise<Response> } = {}) {
  const calls: Call[] = [];
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.startsWith("/api/teacher-analytics-ai")) return res(200, { ok: true, advice: "سطر أول\nسطر ثانٍ" });
    if (url.startsWith("/api/teacher-analytics")) return res(overrides.analyticsStatus ?? 200, overrides.analyticsStatus ? { ok: false, error: "فشل التحميل" } : (overrides.analytics ?? analyticsFixture)());
    if (url.startsWith("/api/teacher-achievement-feed")) {
      if (init?.method === "POST") { const body = JSON.parse(String(init.body)); return res(200, body.action === "react" ? { ok: true, teacherReaction: body.reaction } : { ok: true, teacherNote: body.note }); }
      if (overrides.feedGet) return overrides.feedGet(url);
      return res(200, overrides.feed ?? { ok: true, posts: [] });
    }
    if (url.startsWith("/api/assignment-results")) { const id = new URL("http://x" + url).searchParams.get("assignmentId") || "a1"; return res(200, { ...RESULTS, assignment: { ...RESULTS.assignment, assignmentId: id, title: "واجب " + id.slice(1) } }); }
    if (url.startsWith("/api/students")) return res(200, PROFILE);
    if (url.startsWith("/api/assignment-review")) return res(200, REVIEW);
    return res(404, { ok: false, error: "unexpected " + url });
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return calls;
}
async function mount(overrides?: Parameters<typeof installFetch>[0]) {
  const calls = installFetch(overrides);
  charts.calls.length = 0;
  render(<TeacherDashboard token="tkn-1" />);
  await screen.findByRole("heading", { level: 2, name: "يحتاج إلى انتباهك" });
  return calls;
}
const heading2 = (name: string | RegExp) => screen.getByRole("heading", { level: 2, name });
const lastChart = (type: string) => { const list = charts.calls.filter(c => c.type === type); return list[list.length - 1]; };
function stubMatchMedia(reduced: boolean) {
  window.matchMedia = ((q: string) => ({ matches: reduced && q.includes("prefers-reduced-motion"), media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => true })) as unknown as typeof window.matchMedia;
}


beforeEach(() => { stubMatchMedia(false); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const card = (title: string) => {
  const h = screen.getByRole("heading", { level: 3, name: title });
  const section = h.closest("section");
  if (!section) throw new Error("no ChartCard section for " + title);
  return section as HTMLElement;
};
function openTable(section: HTMLElement) {
  const toggle = within(section).getByRole("button", { name: "عرض البيانات كجدول" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  const table = within(section).getByRole("table");
  expect(toggle.getAttribute("aria-controls")).toBe(table.parentElement?.id);
  return table;
}
const rowsOf = (table: HTMLElement) => Array.from(table.querySelectorAll("tbody tr")).map(tr => Array.from(tr.children).map(c => (c.textContent || "").trim()));
const headersOf = (table: HTMLElement) => Array.from(table.querySelectorAll("thead th")).map(th => { expect(th.getAttribute("scope")).toBe("col"); return th.textContent; });

describe("21E.2 H — dashboard charts carry an accessible data table", () => {
  it("each of the five charts is a labelled region whose figure keeps its summary and whose table is collapsed by default", async () => {
    await mount();
    for (const title of ["تطور متوسط الأداء", "حالة التسليم", "توزيع العلامات", "مقارنة الصفوف", "الأداء حسب الموضوع"]) {
      const section = card(title);
      expect(section.getAttribute("aria-labelledby")).toBe(within(section).getByRole("heading", { level: 3 }).id);
      expect(within(section).getAllByRole("img")).toHaveLength(1);                       // one figure, no nested role="img"
      const tableWrap = section.querySelector(".eb-chart-card-table") as HTMLElement;
      expect(tableWrap.hidden).toBe(true);
    }
  });

  it("the trend table lists exactly the plotted points (nulls dropped), in order, with the chart's values", async () => {
    await mount();
    const table = openTable(card("تطور متوسط الأداء"));
    expect(headersOf(table)).toEqual(["الواجب", "الصف", "متوسط العلامات"]);
    expect(rowsOf(table)).toEqual([["واجب 1", "الحادي عشر", "65%"], ["واجب 2", "الحادي عشر", "70%"]]);
    expect(lastChart("line").data.labels).toEqual(["واجب 1", "واجب 2"]);
    expect(table.querySelector("caption")?.textContent).toBe("تطور متوسط الأداء");
    for (const tr of Array.from(table.querySelectorAll("tbody tr"))) expect(tr.firstElementChild?.getAttribute("scope")).toBe("row");
  });

  it("submission, distribution, class and topic tables mirror the payload (topics capped at the ten plotted)", async () => {
    await mount();
    expect(rowsOf(openTable(card("حالة التسليم")))).toEqual([["تم التسليم", "51"], ["لم يُسلّم", "9"], ["تحتاج مراجعة", "4"], ["نسبة التسليم", "85%"]]);
    expect(rowsOf(openTable(card("توزيع العلامات")))).toEqual([["90-100", "6"], ["80-89", "10"], ["أقل من 50", "3"]]);
    expect(rowsOf(openTable(card("مقارنة الصفوف")))).toEqual([["الحادي عشر", "74.2%", "20", "82.5%"], ["العاشر", "—", "18", "90%"]]);
    const topics = rowsOf(openTable(card("الأداء حسب الموضوع")));
    expect(topics).toHaveLength(10);
    expect(topics[0]).toEqual(["موضوع 1", "45%", "10"]);
    expect(topics.map(r => r[0])).toEqual((lastChart("bar") as { data: { labels: unknown[] } }).data.labels);
  });

  it("the class picker stays operable OUTSIDE the figure and still selects the class", async () => {
    const calls = await mount();
    const section = card("مقارنة الصفوف");
    const picker = within(section).getByRole("list", { name: "اختيار صف لعرض تفاصيله" });
    expect(picker.closest("[role='img']")).toBeNull();
    const before = calls.length;
    fireEvent.click(within(picker).getByRole("button", { name: /العاشر/ }));
    await waitFor(() => expect(calls.slice(before).some(c => c.url.startsWith("/api/teacher-analytics") && c.url.includes("classId=c2"))).toBe(true));
  });

  it("empty series show the plain empty message, no figure and no table toggle", async () => {
    await mount({ analytics: () => ({ ...analyticsFixture(), assignmentTrend: [trendItem(1)], gradeDistribution: [], topicAnalytics: [], classComparison: [] }) });
    for (const [title, text] of [["تطور متوسط الأداء", "تظهر حركة الأداء بعد توفر نتيجتين على الأقل."], ["توزيع العلامات", "لا توجد علامات بعد."], ["الأداء حسب الموضوع", "ستظهر تحليلات الموضوعات بعد وجود إجابات مصححة."], ["مقارنة الصفوف", "لا توجد بيانات صفوف بعد."]]) {
      const section = card(title);
      expect(within(section).getByText(text)).toBeTruthy();
      expect(within(section).queryByRole("img")).toBeNull();
      expect(within(section).queryByRole("button", { name: "عرض البيانات كجدول" })).toBeNull();
    }
  });
});

describe("21E.2 G — assignment-results CSV from the dashboard drill", () => {
  it("downloads the drill's results through the shared encoder, without feedback or identity numbers", async () => {
    await mount();
    const aTable = heading2("متابعة الواجبات").closest("section")?.querySelector("table") as HTMLElement;
    fireEvent.click(within(aTable).getByRole("button", { name: "واجب 1" }));
    const panel = await screen.findByRole("complementary", { name: "واجب 1" });
    let blob: Blob | undefined; let name = "";
    URL.createObjectURL = vi.fn((b: Blob) => { blob = b; return "blob:r"; }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { name = this.download; });
    fireEvent.click(within(panel).getByRole("button", { name: "تصدير نتائج الواجب (CSV)" }));
    expect(name).toBe("TadrisPlus-نتائج-الواجب-واجب-1.csv");
    const bytes = new Uint8Array(await (blob as Blob).arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const lines = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes).slice(1).split("\r\n");
    expect(lines[0]).toBe('"الواجب","واجب 1"');
    expect(lines[2]).toBe('"الطالب","كود الطالب","الحالة","المحاولات المستخدمة","المحاولات المسموحة","رقم آخر محاولة","آخر علامة","العلامة الكاملة","النسبة المئوية","تاريخ التسليم"');
    expect(lines[3].split(",").slice(0, 9)).toEqual(['"سارة خالد"', '"S1"', '"نهائي"', '"1"', '"2"', '"1"', '"13"', '"20"', '"65"']);
    expect(lines).toHaveLength(4);
    expect(lines.join("\n")).not.toContain("123456789");
  });
});
