// @vitest-environment happy-dom
//
// Reports R-6 — the period and the dates follow the PUBLICATION (docs/enterprise-reports-period-basis-r6.md), through the REAL
// ReportsCenter → ReportViews tree with a routed fetch mock. Pinned:
//   - the period select keeps its name «الفترة الزمنية» and is described by the basis («حسب تاريخ نشر التقييم، والمجدول من موعد فتحه»);
//   - the date column is «تاريخ النشر»;
//   - the fallback note appears only when the API says some assessments were published before R-6 (dated by their creation),
//     with the count in words; none on an older API (no `periodBasis`) or with no fallback.
// TEST data only.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";

vi.mock("react-chartjs-2", () => ({ Bar: () => <canvas />, Line: () => <canvas />, Doughnut: () => <canvas /> }));
import ReportsCenter from "./ReportsCenter";

const FILTERS = { ok: true, schoolYears: ["2025-2026"], classes: [{ classId: "c1", name: "الحادي عشر", schoolYear: "2025-2026", status: "active", programCodes: [] }], projects: [], available: { academic: true, projects: false } };
const STUDENTS = { ok: true, students: [{ studentId: "s1", displayName: "زيد صالح" }] };
const STANDINGS = [
  { studentId: "s1", displayName: "زيد صالح", average: 55, graded: 2, pending: 0, missing: 1 },
  { studentId: "s2", displayName: "أحمد عمر", average: 88, graded: 1, pending: 1, missing: 1 },
  { studentId: "s3", displayName: "سعد", average: null, graded: 0, pending: 1, missing: 2 },
  { studentId: "s4", displayName: "خالد", average: 0, graded: 1, pending: 0, missing: 2 }
];
const CLASS_REPORT = { ok: true, type: "class", class: { classId: "c1", name: "الحادي عشر", schoolYear: "2025-2026", status: "active", studentCount: 4 }, kpis: { assignments: 3, averageScore: 47.7, submissionRate: 50, pendingReview: 2 }, projects: [], withheld: [],
  insights: { assessments: [{ assignmentId: "a1", title: "اختبار الكسور", date: "2026-02-05", students: 4, submitted: 3, missing: 1, pendingReview: 1, submissionRate: 75, average: 72, highest: 88, lowest: 55, median: 72 }],
    students: STANDINGS, submission: { graded: 4, pending: 2, missing: 6 },
    summary: { highest: { studentId: "s2", displayName: "أحمد عمر", average: 88 }, lowest: { studentId: "s4", displayName: "خالد", average: 0 }, median: 55, stdDev: 36.3, withAverage: 3 } } };
const STUDENT_REPORT = { ok: true, type: "student", student: { studentId: "s1", displayName: "زيد صالح", classId: "c1", className: "الحادي عشر", schoolYear: "2025-2026" }, academic: { average: 60, submittedCount: 3, assessmentCount: 4, submissionRate: 75, pendingCount: 1 }, projects: [], withheld: [],
  insights: { assessments: [
    { assignmentId: "a1", title: "اختبار الكسور", date: "2026-02-05", state: "submitted", percentage: 80, attempts: 1, classAverage: 72 },
    { assignmentId: "a2", title: "واجب الجبر", date: "2026-03-05", state: "pending", percentage: null, attempts: 2, classAverage: 61 },
    { assignmentId: "a3", title: "مشروع قصير", date: "2026-03-20", state: "missing", percentage: null, attempts: 0, classAverage: null },
    { assignmentId: "a4", title: "اختبار نهائي", date: "2026-04-02", state: "submitted", percentage: 40, attempts: 1, classAverage: 65 }
  ], submission: { graded: 2, pending: 1, missing: 1 } } };
const PER = [
  { assignmentId: "a1", title: "اختبار الكسور", date: "2026-02-05", students: 4, submitted: 4, missing: 0, pendingReview: 1, zeroScores: 1, submissionRate: 100, average: 60, avgAttempts: 1.3, highest: 90, lowest: 0, median: 90 },
  { assignmentId: "a2", title: "واجب الجبر", date: "2026-03-05", students: 4, submitted: 1, missing: 3, pendingReview: 0, zeroScores: 0, submissionRate: 25, average: 30, avgAttempts: 1, highest: 30, lowest: 30, median: 30 },
  { assignmentId: "a3", title: "مشروع قصير", date: "2026-03-20", students: 4, submitted: 1, missing: 3, pendingReview: 1, zeroScores: 0, submissionRate: 25, average: null, avgAttempts: 1, highest: null, lowest: null, median: null }
];
const ASSIGN_REPORT = { ok: true, type: "assignments", class: { classId: "c1", name: "الحادي عشر" },
  students: [{ studentId: "s1", displayName: "زيد صالح" }, { studentId: "s2", displayName: "أحمد عمر" }, { studentId: "s3", displayName: "سعد" }, { studentId: "s4", displayName: "خالد" }],
  overall: { assessmentCount: 3, participants: 6, pendingReview: 2, average: 52.5, submissionRate: 50, distribution: { "0-49": 2, "50-59": 0, "60-69": 0, "70-79": 0, "80-89": 0, "90-100": 2 } },
  perAssignment: PER,
  matrix: [
    { assignmentId: "a1", title: "اختبار الكسور", cells: [{ studentId: "s1", state: "submitted", percentage: 90, zero: false }, { studentId: "s2", state: "pending", percentage: 95 }, { studentId: "s3", state: "submitted", percentage: 0, zero: true }, { studentId: "s4", state: "submitted", percentage: 91, zero: false }] },
    { assignmentId: "a2", title: "واجب الجبر", cells: [{ studentId: "s1", state: "submitted", percentage: 30, zero: false }, { studentId: "s2", state: "missing", percentage: null }, { studentId: "s3", state: "missing", percentage: null }, { studentId: "s4", state: "missing", percentage: null }] }
  ] };

let calls: string[] = [];
let override: ((type: string | null) => unknown | undefined) | null = null;
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body } as Response);
beforeEach(() => {
  calls = []; override = null;
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input); calls.push(url);
    const type = new URL(url, "http://x").searchParams.get("type");
    const o = override?.(type);
    if (o !== undefined) return Promise.resolve(o as Response);
    return Promise.resolve(json(type === "filters" ? FILTERS : type === "overview" ? { ok: true, type, overview: null } : type === "classStudents" ? STUDENTS : type === "class" ? CLASS_REPORT : type === "student" ? STUDENT_REPORT : type === "assignments" ? ASSIGN_REPORT : { ok: false }, 200));
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const open = async (title: string) => { render(<ReportsCenter token="t" />); fireEvent.click(await screen.findByRole("button", { name: "فتح التقرير " + title })); await screen.findByRole("heading", { level: 2, name: title }); };
const pick = (label: string, value: string) => fireEvent.change(within(screen.getByRole("region", { name: "مرشحات التقرير" })).getByLabelText(label), { target: { value } });
const tableByCaption = (start: string) => screen.getAllByRole("table").find(t => t.querySelector("caption")?.textContent?.startsWith(start)) as HTMLElement;

const withBasis = (report: Record<string, unknown>, fallback: number | null) => (fallback === null ? report : { ...report, periodBasis: { basis: "published", fallback } });
const FALLBACK_ONE = "تقييم واحد نُشر قبل تسجيل تاريخ النشر، فيُؤرَّخ بتاريخ إنشائه.";
const fallbackMany = (n: number) => n + " من التقييمات نُشرت قبل تسجيل تاريخ النشر، فتُؤرَّخ بتاريخ إنشائها.";

describe("R-6 the period follows the publication", () => {
  it("the period select keeps its name and is described by the basis", async () => {
    await open("التقييمات والواجبات");
    const select = within(screen.getByRole("region", { name: "مرشحات التقرير" })).getByLabelText("الفترة الزمنية");
    const hint = document.getElementById(select.getAttribute("aria-describedby") || "");
    expect(hint?.textContent).toBe("حسب تاريخ نشر التقييم، والمجدول من موعد فتحه.");
  });
  it("assessments report: the date column is «تاريخ النشر»; the fallback note names the count", async () => {
    override = type => (type === "assignments" ? json(withBasis(ASSIGN_REPORT, 2)) : undefined);
    await open("التقييمات والواجبات"); pick("الصف", "c1");
    await screen.findByRole("heading", { level: 3, name: "ملخص كل تقييم" });
    const per = tableByCaption("ملخص كل تقييم");
    expect(within(per).getAllByRole("columnheader")[1].textContent).toBe("تاريخ النشر");
    expect(screen.getByText(fallbackMany(2))).toBeTruthy();
  });
  it("class and student reports: one assessment dated by its creation → the singular note", async () => {
    override = type => (type === "class" ? json(withBasis(CLASS_REPORT, 1)) : type === "student" ? json(withBasis(STUDENT_REPORT, 1)) : undefined);
    await open("تقرير الصف"); pick("الصف", "c1");
    await screen.findByRole("heading", { level: 3, name: "طلاب الصف" });
    expect(screen.getByText(FALLBACK_ONE)).toBeTruthy();
    cleanup();
    await open("تقرير الطالب"); pick("الصف", "c1"); await screen.findByRole("option", { name: "زيد صالح" }); pick("الطالب", "s1");
    await screen.findByRole("heading", { level: 3, name: "تقييمات الطالب" });
    expect(screen.getByText(FALLBACK_ONE)).toBeTruthy();
  });
  it("no note with no fallback, nor on an older API without `periodBasis`", async () => {
    for (const fallback of [0, null]) {
      override = type => (type === "assignments" ? json(withBasis(ASSIGN_REPORT, fallback)) : undefined);
      await open("التقييمات والواجبات"); pick("الصف", "c1");
      await screen.findByRole("heading", { level: 3, name: "ملخص كل تقييم" });
      expect(screen.queryByText(/قبل تسجيل تاريخ النشر/)).toBeNull();
      cleanup();
    }
  });
});
