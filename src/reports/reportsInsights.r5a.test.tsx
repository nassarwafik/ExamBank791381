// @vitest-environment happy-dom
//
// Phase R-5a — the Reports Center charts and the hub overview, through the REAL ReportsCenter → ReportViews / ReportsOverview tree
// with a routed fetch mock (the chart library is replaced by a canvas that exposes the series it was given). Pinned:
//   - class report: the trend, the submission states, each student's standing and the state bars draw the API's own figures;
//   - student report: a result awaiting the teacher or not handed in is a GAP on the chart and its state in words in the table —
//     never a 0; the gap to the class average exists only where both sides have a number;
//   - an API that sends no `insights` (older deployment) or withholds the academic part → the figures alone, no chart, no crash;
//   - the hub overview: ONE request, kept while a report is open, refreshed on demand, a class opens its class report, nothing
//     shown when the academic part is withheld, its own retry on failure (the report cards stay usable);
//   - motion: charts animate by default and are drawn at once under reduced motion.
// TEST data only.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";

type ChartProps = { data: { labels: string[]; datasets: { label: string; data: (number | null)[] }[] }; options?: { animation?: unknown } };
const chart = (kind: string) => (p: ChartProps) => (
  <canvas data-chart={kind} data-labels={JSON.stringify(p.data.labels)} data-series={JSON.stringify(p.data.datasets.map(d => ({ label: d.label, data: d.data })))}
    data-animation={p.options?.animation === false ? "false" : typeof p.options?.animation === "object" ? "animated" : "default"} />
);
vi.mock("react-chartjs-2", () => ({ Bar: chart("bar"), Line: chart("line"), Doughnut: chart("doughnut") }));

import ReportsCenter from "./ReportsCenter";
import { LRM } from "./insights";

// A signed difference carries a LEFT-TO-RIGHT MARK so its sign stays in front of the number in Arabic text; it draws nothing.
const plain = (text: string | null | undefined) => (text || "").split(LRM).join("");

const TRACKS = [{ trackId: "book", title: "الكتاب", icon: "" }, { trackId: "packetTracer", title: "Packet Tracer", icon: "" }];
const FILTERS = { ok: true, schoolYears: ["2025-2026"], classes: [{ classId: "c1", name: "الحادي عشر", schoolYear: "2025-2026", status: "active", programCodes: ["794589"] }, { classId: "c2", name: "العاشر", schoolYear: "2025-2026", status: "active", programCodes: [] }], projects: [{ projectCode: "794589", title: "مشروع 794589" }], available: { academic: true, projects: true } };
const STUDENTS = { ok: true, students: [{ studentId: "s1", displayName: "زيد صالح" }] };
const CLASS_INSIGHTS = {
  assessments: [
    { assignmentId: "a1", title: "اختبار الكسور", date: "2026-02-05", students: 3, submitted: 3, missing: 0, pendingReview: 1, submissionRate: 100, average: 72 },
    { assignmentId: "a2", title: "واجب الجبر", date: "2026-03-05", students: 3, submitted: 1, missing: 2, pendingReview: 0, submissionRate: 33, average: 61 },
    { assignmentId: "a3", title: "مشروع قصير", date: "2026-03-20", students: 3, submitted: 1, missing: 2, pendingReview: 1, submissionRate: 33, average: null }
  ],
  students: [
    { studentId: "s1", displayName: "زيد صالح", average: 55, graded: 2, pending: 0, missing: 1 },
    { studentId: "s2", displayName: "خالد عمر", average: 88, graded: 1, pending: 1, missing: 1 },
    { studentId: "s3", displayName: "سعد", average: null, graded: 0, pending: 1, missing: 2 }
  ],
  submission: { graded: 3, pending: 2, missing: 4 }
};
const CLASS_REPORT = { ok: true, type: "class", class: { classId: "c1", name: "الحادي عشر", schoolYear: "2025-2026", status: "active", studentCount: 3 }, kpis: { assignments: 3, averageScore: 66, submissionRate: 56, pendingReview: 2 }, insights: CLASS_INSIGHTS,
  projects: [{ projectCode: "794589", title: "مشروع 794589", tracks: TRACKS, avgOverall: 55, trackAverages: { book: 70, packetTracer: 40 }, completedCount: 1, notStartedCount: 1, studentCount: 3 }], withheld: [] };
const STUDENT_REPORT = { ok: true, type: "student", student: { studentId: "s1", displayName: "زيد صالح", classId: "c1", className: "الحادي عشر", schoolYear: "2025-2026" }, academic: { average: 60, submittedCount: 3, assessmentCount: 4, submissionRate: 75, pendingCount: 1 },
  insights: { assessments: [
    { assignmentId: "a1", title: "اختبار الكسور", date: "2026-02-05", state: "submitted", percentage: 80, attempts: 1, classAverage: 72 },
    { assignmentId: "a2", title: "واجب الجبر", date: "2026-03-05", state: "pending", percentage: null, attempts: 2, classAverage: 61 },
    { assignmentId: "a3", title: "مشروع قصير", date: "2026-03-20", state: "missing", percentage: null, attempts: 0, classAverage: null },
    { assignmentId: "a4", title: "اختبار نهائي", date: "2026-04-02", state: "submitted", percentage: 40, attempts: 1, classAverage: 65 }
  ], submission: { graded: 2, pending: 1, missing: 1 } },
  projects: [{ projectCode: "794589", title: "مشروع 794589", tracks: TRACKS, summary: { overallProgress: 45, trackProgress: { book: 60, packetTracer: 30 }, counts: { not_started: 4, in_progress: 2, ready_for_review: 1, approved: 3 }, complete: false }, nextStages: {}, balance: null, lastActivity: "" }], withheld: [] };
const OVERVIEW = { ok: true, type: "overview", overview: {
  classes: [
    { classId: "c1", name: "الحادي عشر", schoolYear: "2025-2026", studentCount: 3, assessments: 3, average: 66, submissionRate: 56, pendingReview: 2, graded: 3, pending: 2, missing: 4 },
    { classId: "c2", name: "العاشر", schoolYear: "2025-2026", studentCount: 20, assessments: 0, average: null, submissionRate: 0, pendingReview: 0, graded: 0, pending: 0, missing: 0 }
  ],
  totals: { classes: 2, students: 23, assessments: 3, average: 66, submissionRate: 56, pendingReview: 2 },
  trend: [{ month: "2026-02", assessments: 1, average: 72, submissionRate: 100 }, { month: "2026-03", assessments: 2, average: 61, submissionRate: 33 }]
}, withheld: [] };
const TIMELINE = { ok: true, type: "timeline", projectCode: "794589", tracks: TRACKS, class: { name: "الحادي عشر" }, scope: "class", trend: [{ weekStart: "2026-02-22", avgOverall: 40 }, { weekStart: "2026-03-01", avgOverall: 72 }, { weekStart: "2026-03-08", avgOverall: 65 }] };

type Call = { url: string };
let calls: Call[] = [];
let override: ((type: string | null) => unknown | undefined) | null = null;
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body } as Response);
function respond(url: string): Response {
  const type = new URL(url, "http://x").searchParams.get("type");
  const o = override?.(type);
  if (o !== undefined) return o as Response;
  if (type === "filters") return json(FILTERS);
  if (type === "overview") return json(OVERVIEW);
  if (type === "classStudents") return json(STUDENTS);
  if (type === "class") return json(CLASS_REPORT);
  if (type === "student") return json(STUDENT_REPORT);
  if (type === "timeline") return json(TIMELINE);
  return json({ ok: false, error: "نوع تقرير غير معروف." }, 400);
}
const setReduced = (reduced: boolean) => { window.matchMedia = ((q: string) => ({ matches: reduced && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia; };
beforeEach(() => {
  calls = []; override = null; setReduced(false);
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => { calls.push({ url: String(input) }); return Promise.resolve(respond(String(input))); }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const gets = (type: string) => calls.filter(c => new URL(c.url, "http://x").searchParams.get("type") === type);
const mount = async () => { render(<ReportsCenter token="t" />); await screen.findByRole("group", { name: "تصنيف التقارير" }); };
const overviewRegion = () => screen.findByRole("region", { name: "نظرة عامة" });
const open = async (title: string) => { fireEvent.click(screen.getByRole("button", { name: "فتح التقرير " + title })); await screen.findByRole("heading", { level: 2, name: title }); };
const pick = (label: string, value: string) => fireEvent.change(within(screen.getByRole("region", { name: "مرشحات التقرير" })).getByLabelText(label), { target: { value } });
const series = (card: HTMLElement) => JSON.parse(card.querySelector("canvas")!.getAttribute("data-series")!) as { label: string; data: (number | null)[] }[];
const tableRows = (card: HTMLElement) => { fireEvent.click(within(card).getByRole("button", { name: "عرض البيانات كجدول" })); return within(within(card).getByRole("table")).getAllByRole("row").map(r => Array.from(r.children).map(c => c.textContent)); };
const legend = (name: string) => within(screen.getByRole("list", { name })).getAllByRole("listitem").map(li => li.textContent);
const WESTERN_ONLY = (el: HTMLElement) => !/[٠-٩]/.test(el.textContent || "");

describe("R-5a class report — the API's series as charts", () => {
  it("trend, submission states, student standing and the state bars; every chart has its table", async () => {
    await mount(); await open("تقرير الصف"); pick("الصف", "c1");
    const section = await screen.findByRole("region", { name: "تطوّر الصف في التقييمات" });
    const trend = within(section).getByRole("region", { name: "تطوّر الأداء عبر التقييمات" });
    // the assessment with no final result yet has NO average point (null), not 0
    expect(series(trend)).toEqual([{ label: "متوسط النتائج", data: [72, 61, null] }, { label: "نسبة التسليم", data: [100, 33, 33] }]);
    expect(plain(trend.textContent)).toContain("آخر متوسط 61% — -11 نقطة عن الذي قبله.");
    expect(trend.textContent).toContain(LRM + "-11");
    expect(tableRows(trend)).toEqual([["التقييم", "تاريخ النشر", "متوسط النتائج %", "نسبة التسليم %"], ["اختبار الكسور", "2026-02-05", "72", "100"], ["واجب الجبر", "2026-03-05", "61", "33"], ["مشروع قصير", "2026-03-20", "—", "33"]]);
    const status = within(section).getByRole("region", { name: "حالة التسليم في كل تقييم" });
    expect(series(status)).toEqual([{ label: "مصحَّح", data: [2, 1, 0] }, { label: "بانتظار التصحيح", data: [1, 0, 1] }, { label: "لم يسلّم", data: [0, 2, 2] }]);
    const standing = within(section).getByRole("region", { name: "متوسط كل طالب" });
    // ranked, and the student with no final result is NOT a bar (he is in the table as «—»)
    expect(JSON.parse(standing.querySelector("canvas")!.getAttribute("data-labels")!)).toEqual(["خالد عمر", "زيد صالح"]);
    expect(series(standing)).toEqual([{ label: "متوسط الطالب", data: [88, 55] }]);
    expect(standing.textContent).toContain("1 بلا نتيجة مصحَّحة بعد");
    expect(tableRows(standing)).toEqual([["الطالب", "المتوسط %", "مصحَّح", "بانتظار التصحيح", "لم يسلّم"], ["خالد عمر", "88", "1", "1", "1"], ["زيد صالح", "55", "2", "0", "1"], ["سعد", "—", "0", "1", "2"]]);
    expect(legend("حالة التسليمات")).toEqual(["مصحَّح 3 (33%)", "بانتظار التصحيح 2 (22%)", "لم يسلّم 4 (44%)"]);
    expect(legend("الطلاب حسب الحالة")).toEqual(["أكملوا المشروع 1 (33%)", "قيد التنفيذ 1 (33%)", "لم يبدأوا بعد 1 (33%)"]);
    for (const c of Array.from(section.querySelectorAll(".eb-chart-card-figure"))) expect(c.getAttribute("role")).toBe("img");
    expect(WESTERN_ONLY(section)).toBe(true);
    expect(gets("class")).toHaveLength(1);                         // the charts cost no request of their own
  });
  it("an API without `insights` (older deployment): the figures alone — no chart section, no crash", async () => {
    override = type => (type === "class" ? json({ ...CLASS_REPORT, insights: undefined, projects: [{ ...CLASS_REPORT.projects[0], studentCount: undefined }] }) : undefined);
    await mount(); await open("تقرير الصف"); pick("الصف", "c1");
    await screen.findByText("متوسط النتائج");
    expect(screen.queryByRole("region", { name: "تطوّر الصف في التقييمات" })).toBeNull();
    expect(screen.queryByRole("list", { name: "الطلاب حسب الحالة" })).toBeNull();        // no population → no bar, nothing guessed
    expect(document.querySelector(".eb-report-result canvas")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("the academic part withheld (kpis: null): no chart even if a series were sent", async () => {
    override = type => (type === "class" ? json({ ...CLASS_REPORT, kpis: null, withheld: ["academic"] }) : undefined);
    await mount(); await open("تقرير الصف"); pick("الصف", "c1");
    await screen.findByText("الطلاب");
    expect(screen.queryByRole("region", { name: "تطوّر الصف في التقييمات" })).toBeNull();
  });
  it("no assessment in the period: no empty chart frames", async () => {
    override = type => (type === "class" ? json({ ...CLASS_REPORT, kpis: { assignments: 0, averageScore: null, submissionRate: 0, pendingReview: 0 }, insights: { assessments: [], students: CLASS_INSIGHTS.students.map(s => ({ ...s, average: null, graded: 0, pending: 0, missing: 0 })), submission: { graded: 0, pending: 0, missing: 0 } } }) : undefined);
    await mount(); await open("تقرير الصف"); pick("الصف", "c1");
    await screen.findByText("متوسط النتائج");
    expect(screen.queryByRole("region", { name: "تطوّر الصف في التقييمات" })).toBeNull();
  });
});

describe("R-5a student report — the student beside the class; pending and missing are never a number", () => {
  const openStudent = async () => { await mount(); await open("تقرير الطالب"); pick("الصف", "c1"); await waitFor(() => expect(gets("classStudents")).toHaveLength(1)); await screen.findByRole("option", { name: "زيد صالح" }); pick("الطالب", "s1"); return screen.findByRole("region", { name: "تطوّر الطالب في التقييمات" }); };
  it("trend: the pending and the missing assessment are gaps (null); the table says the state in words", async () => {
    const section = await openStudent();
    const trend = within(section).getByRole("region", { name: "تطوّر نتائج الطالب" });
    expect(series(trend)).toEqual([{ label: "نتيجة الطالب", data: [80, null, null, 40] }, { label: "متوسط الصف", data: [72, 61, null, 65] }]);
    expect(plain(trend.textContent)).toContain("آخر نتيجة 40% — -40 نقطة عن التي قبلها.");
    expect(trend.textContent).toContain("عند متوسط الصف أو أعلى في 1 من 2.");
    expect(tableRows(trend)).toEqual([
      ["التقييم", "تاريخ النشر", "نتيجة الطالب", "متوسط الصف", "المحاولات"],
      ["اختبار الكسور", "2026-02-05", "80%", "72%", "1"], ["واجب الجبر", "2026-03-05", "بانتظار التصحيح", "61%", "2"],
      ["مشروع قصير", "2026-03-20", "لم يسلّم", "—", "0"], ["اختبار نهائي", "2026-04-02", "40%", "65%", "1"]
    ]);
  });
  it("gap to the class: a bar only where both numbers exist, split into above / below", async () => {
    const section = await openStudent();
    const gap = within(section).getByRole("region", { name: "الفرق عن متوسط الصف" });
    expect(series(gap)).toEqual([{ label: "أعلى من متوسط الصف", data: [8, null, null, null] }, { label: "أقل من متوسط الصف", data: [null, null, null, -25] }]);
    expect(tableRows(gap).slice(1).map(r => r[3])).toEqual([LRM + "+8", "—", "—", LRM + "-25"]);
    expect(legend("حالة تقييمات الطالب")).toEqual(["مصحَّح 2 (50%)", "بانتظار التصحيح 1 (25%)", "لم يسلّم 1 (25%)"]);
    expect(legend("المراحل حسب الحالة")).toEqual(["تم الاعتماد 3 (30%)", "جاهز للفحص 1 (10%)", "قيد التنفيذ 2 (20%)", "لم يبدأ 4 (40%)"]);
  });
  it("a state this client does not know, even with a number beside it, is a gap and reads «بانتظار التصحيح» (fail closed)", async () => {
    override = type => (type === "student" ? json({ ...STUDENT_REPORT, insights: { assessments: [{ assignmentId: "a1", title: "اختبار", date: "", state: "held-new", percentage: 0, attempts: 1, classAverage: 50 }, { assignmentId: "a2", title: "واجب", date: "", state: "submitted", percentage: 70, attempts: 1, classAverage: 50 }], submission: { graded: 1, pending: 1, missing: 0 } } }) : undefined);
    const section = await openStudent();
    const trend = within(section).getByRole("region", { name: "تطوّر نتائج الطالب" });
    expect(series(trend)[0].data).toEqual([null, 70]);
    expect(tableRows(trend).slice(1).map(r => r[2])).toEqual(["بانتظار التصحيح", "70%"]);
    expect(series(within(section).getByRole("region", { name: "الفرق عن متوسط الصف" }))[0].data).toEqual([null, 20]);
  });
  it("only pending / missing results: the chart cards say so in text instead of drawing an empty or zero line", async () => {
    override = type => (type === "student" ? json({ ...STUDENT_REPORT, insights: { assessments: [{ assignmentId: "a1", title: "اختبار", date: "", state: "pending", percentage: null, attempts: 1, classAverage: 50 }], submission: { graded: 0, pending: 1, missing: 0 } } }) : undefined);
    const section = await openStudent();
    expect(section.textContent).toContain("لا توجد نتائج مصحَّحة لهذا الطالب ضمن الفترة المختارة بعد.");
    expect(section.textContent).toContain("لا توجد نتائج قابلة للمقارنة بمتوسط الصف بعد.");
    expect(section.querySelector("canvas")).toBeNull();
  });
});

describe("R-5a hub overview", () => {
  it("one request; KPIs, the classes side by side and the monthly trend; a class without assessments has no bars and no fake 0", async () => {
    await mount();
    const region = await overviewRegion();
    await within(region).findByRole("list", { name: "فتح تقرير صف" });
    expect(gets("overview").map(c => c.url)).toEqual(["/api/reports?type=overview"]);
    const cards = Array.from(region.querySelectorAll(".eb-stat-card")).map(c => c.querySelector(".eb-stat-label")!.textContent + "=" + c.querySelector(".eb-stat-value")!.textContent);
    expect(cards).toEqual(["الصفوف النشطة=2", "الطلاب=23", "التقييمات=3", "متوسط النتائج=66%", "نسبة التسليم=56%", "بانتظار التصحيح=2"]);
    const compare = within(region).getByRole("region", { name: "مقارنة الصفوف" });
    expect(series(compare)).toEqual([{ label: "متوسط النتائج", data: [66, null] }, { label: "نسبة التسليم", data: [56, null] }]);
    expect(tableRows(compare)[2]).toEqual(["العاشر", "20", "0", "—", "—", "0"]);
    const monthly = within(region).getByRole("region", { name: "التطوّر الشهري" });
    expect(JSON.parse(monthly.querySelector("canvas")!.getAttribute("data-labels")!)).toEqual(["فبراير 2026", "مارس 2026"]);
    expect(series(monthly)).toEqual([{ label: "متوسط النتائج", data: [72, 61] }, { label: "نسبة التسليم", data: [100, 33] }]);
    expect(legend("حالة التسليمات في كل الصفوف")).toEqual(["مصحَّح 3 (33%)", "بانتظار التصحيح 2 (22%)", "لم يسلّم 4 (44%)"]);
    expect(region.textContent).toContain("ليست درجات نهائية معتمدة");
    expect(WESTERN_ONLY(region)).toBe(true);
    // the report cards are all still there, below the overview
    expect(screen.getAllByRole("button", { name: /^فتح التقرير / })).toHaveLength(8);
  });
  it("a class opens its class report with that class selected; back shows the kept overview (no new request); «تحديث» asks again", async () => {
    await mount();
    const region = await overviewRegion();
    fireEvent.click(await within(region).findByRole("button", { name: /فتح تقرير الصف الحادي عشر/ }));
    await screen.findByRole("heading", { level: 2, name: "تقرير الصف" });
    await waitFor(() => expect(gets("class").map(c => c.url)).toEqual(["/api/reports?type=class&classId=c1"]));
    const f = screen.getByRole("region", { name: "مرشحات التقرير" });
    expect((within(f).getByLabelText("الصف") as HTMLSelectElement).value).toBe("c1");
    expect((within(f).getByLabelText("السنة الدراسية") as HTMLSelectElement).value).toBe("2025-2026");
    fireEvent.click(screen.getByRole("button", { name: "عودة إلى كل التقارير" }));
    const again = await overviewRegion();
    await within(again).findByRole("list", { name: "فتح تقرير صف" });
    expect(gets("overview")).toHaveLength(1);
    fireEvent.click(within(again).getByRole("button", { name: "تحديث النظرة العامة" }));
    await waitFor(() => expect(gets("overview")).toHaveLength(2));
    await within(await overviewRegion()).findByRole("list", { name: "فتح تقرير صف" });
  });
  it("the academic part is not this teacher's: the overview is not even asked for", async () => {
    override = type => (type === "filters" ? json({ ...FILTERS, available: { academic: false, projects: true } }) : undefined);
    await mount();
    await screen.findByRole("heading", { level: 2, name: "المشاريع" });
    await new Promise(r => setTimeout(r, 20));
    expect(gets("overview")).toHaveLength(0);
    expect(screen.queryByRole("region", { name: "نظرة عامة" })).toBeNull();
  });
  it("the server withholds it (overview: null): nothing is shown, no alert", async () => {
    override = type => (type === "overview" ? json({ ok: true, type: "overview", overview: null, withheld: ["academic"] }) : undefined);
    await mount();
    await waitFor(() => expect(gets("overview")).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText("جارٍ تجهيز النظرة العامة...")).toBeNull());
    expect(screen.queryByRole("region", { name: "نظرة عامة" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("a failure has its own retry and never blocks the report cards", async () => {
    let fail = true;
    override = type => (type === "overview" && fail ? json({ ok: false, error: "تعذر تجهيز التقرير حاليًا." }, 500) : undefined);
    await mount();
    const region = await overviewRegion();
    const alert = await within(region).findByRole("alert");
    expect(alert.textContent).toContain("تعذر تجهيز التقرير حاليًا.");
    expect(screen.getAllByRole("button", { name: /^فتح التقرير / })).toHaveLength(8);
    fail = false;
    fireEvent.click(within(alert).getByRole("button", { name: "إعادة المحاولة" }));
    await within(await overviewRegion()).findByRole("list", { name: "فتح تقرير صف" });
    expect(gets("overview")).toHaveLength(2);
  });
  it("no active class: a calm empty state, no chart", async () => {
    override = type => (type === "overview" ? json({ ok: true, type: "overview", overview: { classes: [], totals: { classes: 0, students: 0, assessments: 0, average: null, submissionRate: 0, pendingReview: 0 }, trend: [] } }) : undefined);
    await mount();
    const region = await overviewRegion();
    expect(await within(region).findByText("لا توجد صفوف نشطة بعد.")).toBeTruthy();
    expect(region.querySelector("canvas")).toBeNull();
  });
  it("the projects category hides the academic overview without unmounting it (no request on coming back)", async () => {
    await mount();
    await within(await overviewRegion()).findByRole("list", { name: "فتح تقرير صف" });
    const cats = screen.getByRole("group", { name: "تصنيف التقارير" });
    fireEvent.click(within(cats).getByRole("button", { name: "المشاريع" }));
    expect(screen.queryByRole("region", { name: "نظرة عامة" })).toBeNull();
    fireEvent.click(within(cats).getByRole("button", { name: "الكل" }));
    expect(screen.getByRole("region", { name: "نظرة عامة" })).toBeTruthy();
    expect(gets("overview")).toHaveLength(1);
  });
});

describe("R-5a timeline and motion", () => {
  it("timeline: start / end / net change tiles and the week-over-week change chart", async () => {
    await mount(); await open("التقدم الزمني"); pick("المشروع", "794589"); pick("الصف", "c1");
    const change = await screen.findByRole("region", { name: "التغيّر الأسبوعي" });
    expect(series(change)).toEqual([{ label: "تقدّم", data: [32, null] }, { label: "تراجع", data: [null, -7] }]);
    expect(tableRows(change)).toEqual([["الأسبوع", "التغيّر (نقطة)"], ["2026-03-01", LRM + "+32"], ["2026-03-08", LRM + "-7"]]);
    const result = document.querySelector(".eb-report-result") as HTMLElement;
    const tiles = Array.from(result.querySelectorAll(".eb-stat-card")).map(c => c.querySelector(".eb-stat-label")!.textContent + "=" + plain(c.querySelector(".eb-stat-value")!.textContent));
    expect(tiles).toEqual(["بداية الفترة=40%", "آخر أسبوع=65%", "صافي التغيّر=+25 نقطة", "عن الأسبوع السابق=-7 نقطة"]);
  });
  it("a single week: no change chart and no change tiles (nothing to compare)", async () => {
    override = type => (type === "timeline" ? json({ ...TIMELINE, trend: [TIMELINE.trend[0]] }) : undefined);
    await mount(); await open("التقدم الزمني"); pick("المشروع", "794589"); pick("الصف", "c1");
    await screen.findByRole("region", { name: "متوسط التقدّم الأسبوعي" });
    expect(screen.queryByRole("region", { name: "التغيّر الأسبوعي" })).toBeNull();
    expect(document.querySelector(".eb-report-result .eb-stat-card")).toBeNull();
  });
  it("motion on by default: the new charts animate and the entrance wrapper says so", async () => {
    await mount(); await open("تقرير الصف"); pick("الصف", "c1");
    const section = await screen.findByRole("region", { name: "تطوّر الصف في التقييمات" });
    expect(Array.from(section.querySelectorAll("canvas")).map(c => c.getAttribute("data-animation"))).toEqual(["animated", "animated", "animated"]);
    expect(document.querySelector(".eb-report-motion")?.getAttribute("data-motion")).toBe("on");
    expect(section.querySelector(".eb-seg")?.getAttribute("data-motion")).toBe("on");
  });
  it("reduced motion: every chart is drawn at once, the bars and the wrapper are still — in a report and on the hub", async () => {
    setReduced(true);
    await mount();
    const region = await overviewRegion();
    await within(region).findByRole("list", { name: "فتح تقرير صف" });
    expect(Array.from(region.querySelectorAll("canvas")).map(c => c.getAttribute("data-animation"))).toEqual(["false", "false"]);
    expect(region.querySelector(".eb-seg")?.getAttribute("data-motion")).toBe("off");
    await open("تقرير الصف"); pick("الصف", "c1");
    const section = await screen.findByRole("region", { name: "تطوّر الصف في التقييمات" });
    expect(Array.from(section.querySelectorAll("canvas")).map(c => c.getAttribute("data-animation"))).toEqual(["false", "false", "false"]);
    expect(document.querySelector(".eb-report-motion")?.getAttribute("data-motion")).toBe("off");
  });
});
