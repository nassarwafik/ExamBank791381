// @vitest-environment happy-dom
//
// Phase R-5c — «طلاب يحتاجون متابعة» in the class report and «يحتاج انتباهك» on the hub, through the REAL ReportsCenter with a
// routed fetch mock. Pinned:
//   - the class report shows exactly the students the SERVER listed, each reason in words with its own number, the criteria in
//     one sentence; nobody is called failing; a reason code the client does not know is left out (a student left with no known
//     reason is not shown); no list without the academic part or on an older API;
//   - a row opens that student's report with the class still chosen (one request, for that student);
//   - the hub's attention items open the class report / the assessments report for that class; none when nothing needs attention.
// TEST data only.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("react-chartjs-2", () => ({ Bar: () => <canvas />, Line: () => <canvas />, Doughnut: () => <canvas /> }));
import ReportsCenter from "./ReportsCenter";

const FILTERS = { ok: true, schoolYears: ["2025-2026"], classes: [{ classId: "c1", name: "الحادي عشر", schoolYear: "2025-2026", status: "active", programCodes: [] }, { classId: "c2", name: "العاشر", schoolYear: "2025-2026", status: "active", programCodes: [] }], projects: [], available: { academic: true, projects: false } };
const STANDINGS = [
  { studentId: "s1", displayName: "زيد صالح", average: 90, graded: 3, pending: 0, missing: 0 },
  { studentId: "s2", displayName: "بلال عمر", average: 50, graded: 3, pending: 0, missing: 0 },
  { studentId: "s3", displayName: "جمال", average: 80, graded: 1, pending: 0, missing: 2 },
  { studentId: "s4", displayName: "دانا", average: null, graded: 0, pending: 3, missing: 0 }
];
const FOLLOW_UP = { criteria: { missingAtLeast: 2, belowClassBy: 15 }, classAverage: 72.5, students: [
  { studentId: "s3", displayName: "جمال", average: 80, missing: 2, pending: 0, reasons: [{ code: "missing", count: 2 }, { code: "project", projectCode: "794589", title: "مشروع 794589", reasons: ["لم يبدأ بعد"] }] },
  { studentId: "s2", displayName: "بلال عمر", average: 50, missing: 0, pending: 0, reasons: [{ code: "belowClass", gap: 22.5 }] }
] };
const OMIT = Symbol("no followUp field");
const classReport = (followUp: unknown = FOLLOW_UP) => ({ ok: true, type: "class", class: { classId: "c1", name: "الحادي عشر", schoolYear: "2025-2026", status: "active", studentCount: 4 }, kpis: { assignments: 3, averageScore: 72.5, submissionRate: 75, pendingReview: 3 }, projects: [], withheld: [],
  insights: { assessments: [{ assignmentId: "a1", title: "اختبار", date: "2026-02-05", students: 4, submitted: 3, missing: 1, pendingReview: 1, submissionRate: 75, average: 72.5 }], students: STANDINGS, submission: { graded: 7, pending: 3, missing: 2 }, ...(followUp === OMIT ? {} : { followUp }) } });
const STUDENT_REPORT = { ok: true, type: "student", student: { studentId: "s2", displayName: "بلال عمر", classId: "c1", className: "الحادي عشر", schoolYear: "2025-2026" }, academic: { average: 50, submittedCount: 3, assessmentCount: 3, submissionRate: 100 }, projects: [], withheld: [] };
const ASSIGN_REPORT = { ok: true, type: "assignments", class: { classId: "c2", name: "العاشر" }, students: [], overall: { assessmentCount: 0, participants: 0, average: null, submissionRate: 0, distribution: {} }, perAssignment: [], matrix: [] };
const overview = (rows: { classId: string; name: string; needsFollowUp?: number; pendingReview: number }[]) => ({ ok: true, type: "overview", overview: {
  classes: rows.map(r => ({ schoolYear: "2025-2026", studentCount: 4, assessments: 3, average: 70, submissionRate: 80, graded: 9, pending: r.pendingReview, missing: 3, ...r })),
  totals: { classes: rows.length, students: 8, assessments: 6, average: 70, submissionRate: 80, pendingReview: rows.reduce((n, r) => n + r.pendingReview, 0) }, trend: [],
  followUp: { criteria: { missingAtLeast: 2, belowClassBy: 15 }, total: rows.reduce((n, r) => n + (r.needsFollowUp || 0), 0) } } });

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
    return Promise.resolve(json(type === "filters" ? FILTERS : type === "overview" ? { ok: true, type, overview: null } : type === "classStudents" ? { ok: true, students: STANDINGS.map(s => ({ studentId: s.studentId, displayName: s.displayName })) }
      : type === "class" ? classReport() : type === "student" ? STUDENT_REPORT : type === "assignments" ? ASSIGN_REPORT : { ok: false }));
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const gets = (type: string) => calls.filter(c => new URL(c, "http://x").searchParams.get("type") === type);
const openClass = async () => { render(<ReportsCenter token="t" />); fireEvent.click(await screen.findByRole("button", { name: "فتح التقرير تقرير الصف" })); await screen.findByRole("heading", { level: 2, name: "تقرير الصف" }); fireEvent.change(within(screen.getByRole("region", { name: "مرشحات التقرير" })).getByLabelText("الصف"), { target: { value: "c1" } }); };
const section = async () => (await screen.findByRole("region", { name: /^طلاب يحتاجون متابعة \d+$/ })) as HTMLElement;
const tableRows = (sec: HTMLElement) => within(within(sec).getByRole("table")).getAllByRole("row").slice(1).map(r => Array.from(r.children).map(c => c.textContent));

describe("R-5c class report — «طلاب يحتاجون متابعة»", () => {
  it("shows exactly the students the server listed, in its order, each reason in words with its number, and the criteria sentence", async () => {
    await openClass();
    const sec = await section();
    expect(within(sec).getByRole("heading", { level: 3 }).textContent).toBe("طلاب يحتاجون متابعة 2");
    expect(tableRows(sec)).toEqual([
      ["جمال", "لم يسلّم تقييمينمشروع 794589: لم يبدأ بعد", "80%", "2", "تقرير الطالب — جمال"],
      ["بلال عمر", "أقل من متوسط الصف بـ 22.5 نقطة", "50%", "0", "تقرير الطالب — بلال عمر"]
    ]);
    expect(sec.textContent).toContain("لم يسلّم تقييمين أو أكثر من تقييمات الفترة");
    expect(sec.textContent).toContain("أقل من متوسط الصف (73%) بـ 15 نقطة أو أكثر");
    expect(sec.textContent).toContain("ليست هذه علامة نجاح أو رسوب");
    // the student whose three results await the teacher is not here, and nobody is called failing
    expect(sec.textContent).not.toContain("دانا");
    expect(sec.textContent).not.toMatch(/راسب|ضعيف|فاشل/);
    expect(/[٠-٩]/.test(sec.textContent || "")).toBe(false);
  });
  it("a row opens that student's report with the class still chosen — one request, for that student", async () => {
    await openClass();
    const sec = await section();
    fireEvent.click(within(sec).getByRole("button", { name: "تقرير الطالب — بلال عمر" }));
    await screen.findByRole("heading", { level: 2, name: "تقرير الطالب" });
    await screen.findByRole("heading", { level: 3, name: "بلال عمر" });
    expect(gets("student")).toEqual(["/api/reports?type=student&studentId=s2"]);
    const f = screen.getByRole("region", { name: "مرشحات التقرير" });
    await waitFor(() => expect((within(f).getByLabelText("الطالب") as HTMLSelectElement).value).toBe("s2"));
    expect((within(f).getByLabelText("الصف") as HTMLSelectElement).value).toBe("c1");
  });
  it("nobody listed: a calm line, the criteria still stated, no table", async () => {
    override = type => (type === "class" ? json(classReport({ ...FOLLOW_UP, students: [] })) : undefined);
    await openClass();
    const sec = await section();
    expect(within(sec).getByRole("heading", { level: 3 }).textContent).toBe("طلاب يحتاجون متابعة 0");
    expect(sec.textContent).toContain("لا يوجد طالب تنطبق عليه معايير المتابعة في هذه الفترة.");
    expect(within(sec).queryByRole("table")).toBeNull();
    expect(sec.textContent).toContain("15 نقطة أو أكثر");
  });
  it("a reason code this client does not know is left out; a student left with no known reason is not shown (never guessed)", async () => {
    override = type => (type === "class" ? json(classReport({ ...FOLLOW_UP, students: [
      { studentId: "s2", displayName: "بلال عمر", average: 50, missing: 0, pending: 0, reasons: [{ code: "belowClass", gap: 22.5 }, { code: "something-new", weight: 9 }] },
      { studentId: "s1", displayName: "زيد صالح", average: 90, missing: 0, pending: 0, reasons: [{ code: "something-new" }] }
    ] })) : undefined);
    await openClass();
    const sec = await section();
    expect(tableRows(sec).map(r => r.slice(0, 2))).toEqual([["بلال عمر", "أقل من متوسط الصف بـ 22.5 نقطة"]]);
    expect(within(sec).getByRole("heading", { level: 3 }).textContent).toBe("طلاب يحتاجون متابعة 1");
  });
  it("an API that sends no `followUp` (older deployment), or the academic part withheld: no section", async () => {
    override = type => (type === "class" ? json(classReport(OMIT)) : undefined);
    await openClass();
    await screen.findByRole("heading", { level: 3, name: "طلاب الصف" });
    expect(screen.queryByRole("region", { name: /^طلاب يحتاجون متابعة \d+$/ })).toBeNull();
    cleanup();
    override = type => (type === "class" ? json({ ...classReport(), kpis: null, withheld: ["academic"] }) : undefined);
    await openClass();
    await screen.findByText("الطلاب");
    expect(screen.queryByRole("region", { name: /^طلاب يحتاجون متابعة \d+$/ })).toBeNull();
  });
  it("the list sorts and searches like the other tables (costing no request)", async () => {
    await openClass();
    const sec = await section();
    const n = calls.length;
    fireEvent.click(within(within(sec).getByRole("columnheader", { name: "المتوسط" })).getByRole("button"));
    expect(tableRows(sec).map(r => r[0])).toEqual(["جمال", "بلال عمر"]);
    fireEvent.click(within(within(sec).getByRole("columnheader", { name: "المتوسط" })).getByRole("button"));
    expect(tableRows(sec).map(r => r[0])).toEqual(["بلال عمر", "جمال"]);
    fireEvent.change(within(sec).getByLabelText("بحث عن طالب"), { target: { value: "بلال" } });
    expect(tableRows(sec).map(r => r[0])).toEqual(["بلال عمر"]);
    expect(calls.length).toBe(n);
  });
});

describe("R-5c hub — «يحتاج انتباهك»", () => {
  const hub = async () => { render(<ReportsCenter token="t" />); const region = await screen.findByRole("region", { name: "نظرة عامة" }); await within(region).findByRole("list", { name: "فتح تقرير صف" }); return region; };
  it("an item per class that needs it: follow-up opens the class report, awaiting correction opens the assessments report — for THAT class", async () => {
    override = type => (type === "overview" ? json(overview([{ classId: "c1", name: "الحادي عشر", needsFollowUp: 2, pendingReview: 3 }, { classId: "c2", name: "العاشر", needsFollowUp: 0, pendingReview: 1 }])) : undefined);
    const region = await hub();
    const attention = within(region).getByRole("region", { name: "يحتاج انتباهك" });
    expect(within(attention).getAllByRole("button").map(b => b.textContent)).toEqual(["الحادي عشرطالبان يحتاجان متابعة في التقييمات", "الحادي عشر3 بانتظار التصحيح", "العاشر1 بانتظار التصحيح"]);
    fireEvent.click(within(attention).getByRole("button", { name: /العاشر.*بانتظار التصحيح/ }));
    await screen.findByRole("heading", { level: 2, name: "التقييمات والواجبات" });
    await waitFor(() => expect(gets("assignments")).toEqual(["/api/reports?type=assignments&classId=c2"]));
    fireEvent.click(screen.getByRole("button", { name: "عودة إلى كل التقارير" }));
    const again = within(await screen.findByRole("region", { name: "نظرة عامة" })).getByRole("region", { name: "يحتاج انتباهك" });
    fireEvent.click(within(again).getByRole("button", { name: /الحادي عشر.*يحتاجان متابعة/ }));
    await screen.findByRole("heading", { level: 2, name: "تقرير الصف" });
    await waitFor(() => expect(gets("class")).toEqual(["/api/reports?type=class&classId=c1"]));
  });
  it("nothing needs attention, or an older API without the count: no section", async () => {
    override = type => (type === "overview" ? json(overview([{ classId: "c1", name: "الحادي عشر", needsFollowUp: 0, pendingReview: 0 }, { classId: "c2", name: "العاشر", pendingReview: 0 }])) : undefined);
    const region = await hub();
    expect(within(region).queryByRole("region", { name: "يحتاج انتباهك" })).toBeNull();
  });
});
