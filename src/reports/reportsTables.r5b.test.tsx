// @vitest-environment happy-dom
//
// Phase R-5b — the interactive tables of the Reports Center, through the REAL ReportsCenter → ReportViews tree with a routed
// fetch mock. Pinned:
//   - a header that sorts is a button inside its <th>, `aria-sort` says the order, and its text is still the label alone;
//   - sorting never treats «بانتظار التصحيح» / «لم يسلّم» / «—» as a number: those rows stay last in both directions;
//   - the class report's students table and summary tiles, the student report's assessments table (state in words);
//   - the assessments report: highest / median / lowest columns when the API sends them (the earlier columns when it does not),
//     the matrix sorts by an assessment and finds a student;
//   - sorting and searching cost no request.
// TEST data only.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("react-chartjs-2", () => ({ Bar: () => <canvas />, Line: () => <canvas />, Doughnut: () => <canvas /> }));
import ReportsCenter from "./ReportsCenter";
import { LRM } from "./insights";

const plain = (t: string | null | undefined) => (t || "").split(LRM).join("");
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
const firstColumn = (table: HTMLElement) => within(table).getAllByRole("rowheader").map(h => h.textContent);
const header = (table: HTMLElement, name: string) => within(table).getByRole("columnheader", { name });
const sortBy = (table: HTMLElement, name: string) => fireEvent.click(within(header(table, name)).getByRole("button"));

describe("R-5b class report — students table and summary", () => {
  it("summary tiles name the highest and the lowest average; the student with no final result is neither", async () => {
    await open("تقرير الصف"); pick("الصف", "c1");
    const title = await screen.findByRole("heading", { level: 3, name: "طلاب الصف" });
    const section = title.closest(".eb-report-insights") as HTMLElement;
    const tiles = Array.from(section.querySelectorAll(".eb-stat-card")).map(c => [c.querySelector(".eb-stat-label")!.textContent, c.querySelector(".eb-stat-value")!.textContent, c.querySelector(".eb-stat-hint")?.textContent]);
    expect(tiles).toEqual([["أعلى متوسط", "88%", "أحمد عمر"], ["الوسيط", "55%", "من 3 بنتيجة مصحَّحة"], ["أدنى متوسط", "0%", "خالد"], ["الانحراف المعياري", "36.3", "تباعد متوسطات الطلاب (نقاط مئوية)"]]);
  });
  it("sorts by the average: highest first, then lowest first — «—» stays last both times; a third click restores the order", async () => {
    await open("تقرير الصف"); pick("الصف", "c1");
    await screen.findByRole("heading", { level: 3, name: "طلاب الصف" });
    const table = tableByCaption("طلاب الصف");
    expect(firstColumn(table)).toEqual(["زيد صالح", "أحمد عمر", "سعد", "خالد"]);
    expect(within(table).getAllByRole("columnheader").map(h => h.textContent)).toEqual(["الطالب", "المتوسط", "مصحَّح", "بانتظار التصحيح", "لم يسلّم"]);   // the label alone
    expect(header(table, "المتوسط").getAttribute("aria-sort")).toBe("none");
    const n = calls.length;
    sortBy(table, "المتوسط");
    expect(header(table, "المتوسط").getAttribute("aria-sort")).toBe("descending");
    expect(firstColumn(table)).toEqual(["أحمد عمر", "زيد صالح", "خالد", "سعد"]);
    sortBy(table, "المتوسط");
    expect(header(table, "المتوسط").getAttribute("aria-sort")).toBe("ascending");
    expect(firstColumn(table)).toEqual(["خالد", "زيد صالح", "أحمد عمر", "سعد"]);        // the real 0 leads; «no result» is not below it
    sortBy(table, "المتوسط");
    expect(header(table, "المتوسط").getAttribute("aria-sort")).toBe("none");
    expect(firstColumn(table)).toEqual(["زيد صالح", "أحمد عمر", "سعد", "خالد"]);
    sortBy(table, "الطالب");
    expect(header(table, "الطالب").getAttribute("aria-sort")).toBe("ascending");
    expect(firstColumn(table)).toEqual(["أحمد عمر", "خالد", "زيد صالح", "سعد"]);
    expect(header(table, "المتوسط").getAttribute("aria-sort")).toBe("none");               // one sorted column at a time
    expect(calls.length).toBe(n);                                                           // sorting costs no request
  });
  it("finds a student whatever the hamza, with a live count; no match says so; the search costs no request", async () => {
    await open("تقرير الصف"); pick("الصف", "c1");
    await screen.findByRole("heading", { level: 3, name: "طلاب الصف" });
    const table = tableByCaption("طلاب الصف");
    const box = (table.closest(".eb-report-table-block") as HTMLElement).querySelector("input[type='search']") as HTMLInputElement;
    expect(screen.getByLabelText("بحث عن طالب")).toBe(box);
    const n = calls.length;
    fireEvent.change(box, { target: { value: "احمد" } });
    expect(firstColumn(table)).toEqual(["أحمد عمر"]);
    expect(within(table.closest(".eb-report-table-block") as HTMLElement).getByRole("status").textContent).toBe("1 من 4");
    fireEvent.change(box, { target: { value: "لا أحد" } });
    expect(within(table).queryAllByRole("rowheader")).toHaveLength(0);
    expect(table.textContent).toContain("لا نتائج مطابقة للبحث.");
    fireEvent.change(box, { target: { value: "" } });
    expect(firstColumn(table)).toHaveLength(4);
    expect(calls.length).toBe(n);
  });
  it("an API without `summary`: no tiles, the table still there", async () => {
    override = type => (type === "class" ? json({ ...CLASS_REPORT, insights: { ...CLASS_REPORT.insights, summary: undefined } }) : undefined);
    await open("تقرير الصف"); pick("الصف", "c1");
    await screen.findByRole("heading", { level: 3, name: "طلاب الصف" });
    expect(screen.queryByText("أعلى متوسط")).toBeNull();
    expect(firstColumn(tableByCaption("طلاب الصف"))).toHaveLength(4);
  });
});

describe("R-5b student report — assessments table", () => {
  const openStudent = async () => { await open("تقرير الطالب"); pick("الصف", "c1"); await screen.findByRole("option", { name: "زيد صالح" }); pick("الطالب", "s1"); await screen.findByRole("heading", { level: 3, name: "تقييمات الطالب" }); return tableByCaption("تقييمات الطالب"); };
  const body = (table: HTMLElement) => within(table).getAllByRole("row").slice(1).map(r => Array.from(r.children).map(c => plain(c.textContent)));
  it("one row per assessment: the state in words, a number only for a final result, the gap only where both sides exist", async () => {
    const table = await openStudent();
    expect(body(table)).toEqual([
      ["اختبار الكسور", "2026-02-05", "مصحَّح", "80%", "72%", "+8", "1"],
      ["واجب الجبر", "2026-03-05", "بانتظار التصحيح", "—", "61%", "—", "2"],
      ["مشروع قصير", "2026-03-20", "لم يسلّم", "—", "—", "—", "0"],
      ["اختبار نهائي", "2026-04-02", "مصحَّح", "40%", "65%", "-25", "1"]
    ]);
  });
  it("sorting by the result keeps «بانتظار التصحيح» and «لم يسلّم» last in both directions", async () => {
    const table = await openStudent();
    sortBy(table, "النتيجة");
    expect(firstColumn(table)).toEqual(["اختبار الكسور", "اختبار نهائي", "واجب الجبر", "مشروع قصير"]);
    sortBy(table, "النتيجة");
    expect(firstColumn(table)).toEqual(["اختبار نهائي", "اختبار الكسور", "واجب الجبر", "مشروع قصير"]);
    sortBy(table, "الحالة");                                                             // text-like column: graded, awaiting, not handed in
    expect(header(table, "الحالة").getAttribute("aria-sort")).toBe("ascending");
    expect(firstColumn(table)).toEqual(["اختبار الكسور", "اختبار نهائي", "واجب الجبر", "مشروع قصير"]);
  });
  it("a state this client does not know, with a number beside it, shows «بانتظار التصحيح» and «—» (fail closed)", async () => {
    override = type => (type === "student" ? json({ ...STUDENT_REPORT, insights: { assessments: [{ assignmentId: "a1", title: "اختبار", date: "", state: "held-new", percentage: 0, attempts: 1, classAverage: 50 }], submission: { graded: 0, pending: 1, missing: 0 } } }) : undefined);
    const table = await openStudent();
    expect(body(table)).toEqual([["اختبار", "—", "بانتظار التصحيح", "—", "50%", "—", "1"]]);
  });
});

describe("R-5b assessments report — statistics columns and the matrix", () => {
  const openAssessments = async () => { await open("التقييمات والواجبات"); pick("الصف", "c1"); await screen.findByRole("heading", { level: 3, name: "ملخص كل تقييم" }); };
  it("date and highest / median / lowest columns when the API sends them; an assessment with no final result shows «—», never 0%", async () => {
    await openAssessments();
    const per = tableByCaption("ملخص كل تقييم");
    expect(within(per).getAllByRole("columnheader").map(h => h.textContent)).toEqual(["التقييم", "التاريخ", "نسبة التسليم", "مُسلَّم", "لم يسلّم", "بانتظار التصحيح", "سلّم بعلامة صفر", "المتوسط (نتيجة آخر محاولة مسلّمة)", "الأعلى", "الوسيط", "الأدنى", "متوسط المحاولات"]);
    const row = (title: string) => Array.from((within(per).getByRole("rowheader", { name: title }).closest("tr") as HTMLElement).children).map(c => c.textContent);
    expect(row("اختبار الكسور").slice(7, 11)).toEqual(["60%", "90%", "90%", "0%"]);          // a REAL zero is the lowest
    expect(row("مشروع قصير").slice(7, 11)).toEqual(["—", "—", "—", "—"]);
    sortBy(per, "المتوسط (نتيجة آخر محاولة مسلّمة)");
    expect(firstColumn(per)).toEqual(["اختبار الكسور", "واجب الجبر", "مشروع قصير"]);
    sortBy(per, "المتوسط (نتيجة آخر محاولة مسلّمة)");
    expect(firstColumn(per)).toEqual(["واجب الجبر", "اختبار الكسور", "مشروع قصير"]);        // the assessment with no average stays last
  });
  it("an API without those fields shows exactly the earlier columns", async () => {
    override = type => (type === "assignments" ? json({ ...ASSIGN_REPORT, perAssignment: PER.map(({ date: _d, highest: _h, lowest: _l, median: _m, ...r }) => r) }) : undefined);
    await openAssessments();
    expect(within(tableByCaption("ملخص كل تقييم")).getAllByRole("columnheader").map(h => h.textContent)).toEqual(["التقييم", "نسبة التسليم", "مُسلَّم", "لم يسلّم", "بانتظار التصحيح", "سلّم بعلامة صفر", "المتوسط (نتيجة آخر محاولة مسلّمة)", "متوسط المحاولات"]);
  });
  it("the matrix sorts by an assessment (final results only; pending / missing last both ways) and finds a student", async () => {
    await openAssessments();
    const matrix = document.querySelector(".eb-report-matrix") as HTMLElement;
    expect(firstColumn(matrix)).toEqual(["زيد صالح", "أحمد عمر", "سعد", "خالد"]);
    expect(within(matrix).getAllByRole("columnheader").map(h => h.textContent)).toEqual(["الطالب", "اختبار الكسور", "واجب الجبر"]);
    const n = calls.length;
    sortBy(matrix, "اختبار الكسور");
    expect(header(matrix, "اختبار الكسور").getAttribute("aria-sort")).toBe("descending");
    expect(firstColumn(matrix)).toEqual(["خالد", "زيد صالح", "سعد", "أحمد عمر"]);            // 91, 90, the real 0, then the pending cell (the 95 riding along it never orders it)
    sortBy(matrix, "اختبار الكسور");
    expect(firstColumn(matrix)).toEqual(["سعد", "زيد صالح", "خالد", "أحمد عمر"]);            // 0, 90, 91 — pending still last
    sortBy(matrix, "واجب الجبر");
    expect(firstColumn(matrix)).toEqual(["زيد صالح", "أحمد عمر", "سعد", "خالد"]);            // one result; the three «لم يسلّم» keep their order
    const section = matrix.closest(".eb-report-matrix-section") as HTMLElement;
    fireEvent.change(within(section).getByLabelText("بحث عن طالب"), { target: { value: "خالد" } });
    expect(firstColumn(matrix)).toEqual(["خالد"]);
    expect(within(section).getByRole("status").textContent).toBe("1 من 4");
    fireEvent.change(within(section).getByLabelText("بحث عن طالب"), { target: { value: "zzz" } });
    expect(matrix.textContent).toContain("لا نتائج مطابقة للبحث.");
    expect(calls.length).toBe(n);
    // the cells themselves are as before: a pending cell is words, never a number
    fireEvent.change(within(section).getByLabelText("بحث عن طالب"), { target: { value: "احمد" } });
    await waitFor(() => expect(firstColumn(matrix)).toEqual(["أحمد عمر"]));
    expect((within(matrix).getByRole("rowheader", { name: "أحمد عمر" }).closest("tr") as HTMLElement).querySelector("td")!.textContent).toBe("بانتظار التصحيح");
  });
});
