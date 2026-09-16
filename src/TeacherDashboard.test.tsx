// @vitest-environment happy-dom
//
// UX-3 — Teacher Dashboard Command Centre. The render layer was rebuilt; every number, request, CSV row and
// chart series must still come from the /api/teacher-analytics payload exactly as before. These tests pin
// the KPI mapping (13 rendered fields), the request contract (URL + headers + query), CSV/print/AI parity,
// achievement feed calls, the drill-down requests + focus contract, chart dataset parity (react-chartjs-2 is
// mocked so the arrays handed to Chart.js are asserted directly) and the loading/error states.
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

const SRC = import.meta.glob("./TeacherDashboard.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const dashboardSource = () => SRC["./TeacherDashboard.tsx"];

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
function installFetch(overrides: { analytics?: () => unknown; analyticsStatus?: number; feed?: unknown } = {}) {
  const calls: Call[] = [];
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.startsWith("/api/teacher-analytics-ai")) return res(200, { ok: true, advice: "سطر أول\nسطر ثانٍ" });
    if (url.startsWith("/api/teacher-analytics")) return res(overrides.analyticsStatus ?? 200, overrides.analyticsStatus ? { ok: false, error: "فشل التحميل" } : (overrides.analytics ?? analyticsFixture)());
    if (url.startsWith("/api/teacher-achievement-feed")) {
      if (init?.method === "POST") { const body = JSON.parse(String(init.body)); return res(200, body.action === "react" ? { ok: true, teacherReaction: body.reaction } : { ok: true, teacherNote: body.note }); }
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
const analyticsCalls = (calls: Call[]) => calls.filter(c => c.url.startsWith("/api/teacher-analytics?") || c.url === "/api/teacher-analytics");
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

describe("UX-3 dashboard — request contract", () => {
  it("boots with exactly the analytics + achievement-feed GETs, both carrying x-builder-token and the Bearer header", async () => {
    const calls = await mount();
    expect(calls.map(c => c.url)).toEqual(["/api/teacher-analytics", "/api/teacher-achievement-feed"]);
    for (const c of calls) {
      const h = c.init?.headers as Record<string, string>;
      expect(h["x-builder-token"]).toBe("tkn-1"); expect(h.Authorization).toBe("Bearer tkn-1"); expect(c.init?.method).toBeUndefined();
    }
  });
  it("class → student → period filters build the same query string (classId, studentId, from/to) and the refresh button repeats it", async () => {
    const calls = await mount();
    fireEvent.change(screen.getByLabelText("الصف"), { target: { value: "c1" } });
    await waitFor(() => expect(analyticsCalls(calls).at(-1)?.url).toBe("/api/teacher-analytics?classId=c1"));
    fireEvent.change(await screen.findByLabelText("الطالب"), { target: { value: "u1" } });
    await waitFor(() => expect(analyticsCalls(calls).at(-1)?.url).toBe("/api/teacher-analytics?classId=c1&studentId=u1"));
    const before = Date.now();
    fireEvent.click(within(screen.getByRole("group", { name: "الفترة" })).getByRole("button", { name: "30 يومًا" }));
    await waitFor(() => expect(analyticsCalls(calls).at(-1)?.url).toMatch(/^\/api\/teacher-analytics\?classId=c1&studentId=u1&from=.+&to=.+$/));
    const params = new URL("http://x" + analyticsCalls(calls).at(-1)!.url).searchParams;
    const from = Date.parse(params.get("from")!), to = Date.parse(params.get("to")!);
    const DAY = 24 * 60 * 60 * 1000; // `from` and `to` come from two separate Date reads, so allow sub-second drift
    expect(to - from).toBeGreaterThanOrEqual(30 * DAY); expect(to - from).toBeLessThan(30 * DAY + 5000); expect(to).toBeGreaterThanOrEqual(before);
    expect(screen.getByRole("button", { name: "30 يومًا" }).getAttribute("aria-pressed")).toBe("true");
    const n = analyticsCalls(calls).length;
    fireEvent.click(screen.getByRole("button", { name: "تحديث" }));
    await waitFor(() => expect(analyticsCalls(calls).length).toBe(n + 1));
    const strip = (u: string) => u.replace(/from=[^&]+&to=[^&]+/, "from=…&to=…");
    expect(strip(analyticsCalls(calls).at(-1)!.url)).toBe(strip(analyticsCalls(calls).at(-2)!.url)); // refresh re-issues the same query (timestamps re-evaluated)
  });
  it("the class filter lists only active classes (payload `active` semantics untouched)", async () => {
    await mount();
    const options = Array.from((screen.getByLabelText("الصف") as HTMLSelectElement).options).map(o => o.value);
    expect(options).toEqual(["", "c1", "c2"]);
  });
  it("the accessible class picker under the comparison chart selects the class exactly like the canvas click did", async () => {
    const calls = await mount();
    const picker = screen.getByRole("list", { name: "اختيار صف لعرض تفاصيله" });
    const btn = within(picker).getByRole("button", { name: /العاشر/ });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(btn);
    await waitFor(() => expect(analyticsCalls(calls).at(-1)?.url).toBe("/api/teacher-analytics?classId=c2"));
    expect((screen.getByLabelText("الصف") as HTMLSelectElement).value).toBe("c2");
    expect(within(screen.getByRole("list", { name: "اختيار صف لعرض تفاصيله" })).getByRole("button", { name: /العاشر/ }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("UX-3 dashboard — KPI mapping and structure", () => {
  it("renders the 13 KPI fields that were displayed before UX-3, unchanged in value", async () => {
    await mount();
    const kpis = screen.getByRole("region", { name: "المؤشرات الرئيسية" });
    const card = (label: string) => within(kpis).getByText(label).closest(".eb-stat-card") as HTMLElement;
    const primary = kpis.querySelectorAll(".eb-stat-grid.is-primary .eb-stat-card");
    expect(Array.from(primary).map(el => el.querySelector(".eb-stat-label")?.textContent)).toEqual(["متوسط العلامات", "نسبة التسليم", "يحتاجون متابعة", "بانتظار التصحيح"]);
    expect(card("متوسط العلامات").querySelector(".eb-stat-value")?.textContent).toBe("72.4%");            // average
    expect(card("متوسط العلامات").querySelector(".eb-stat-hint")?.textContent).toBe("أعلى 98% · أدنى 31%"); // highest, lowest
    expect(card("نسبة التسليم").querySelector(".eb-stat-value")?.textContent).toBe("85%");                // completionRate
    expect(card("نسبة التسليم").querySelector(".eb-stat-hint")?.textContent).toBe("51 من 60 حالة متوقعة"); // submissions, expectedSubmissions
    expect(card("يحتاجون متابعة").querySelector(".eb-stat-value")?.textContent).toBe("5");               // followUpStudents
    expect(card("يحتاجون متابعة").querySelector(".eb-stat-hint")?.textContent).toBe("2 لم يسجلوا الدخول"); // neverLogged
    expect(card("بانتظار التصحيح").querySelector(".eb-stat-value")?.textContent).toBe("4");              // pendingReview (promoted)
    expect(card("الطلاب الفعّالون").querySelector(".eb-stat-value")?.textContent).toBe("38");            // activeStudents
    expect(card("الطلاب الفعّالون").querySelector(".eb-stat-hint")?.textContent).toBe("2 صفوف فعّالة");   // activeClasses
    expect(card("واجبات منشورة").querySelector(".eb-stat-value")?.textContent).toBe("7");                // publishedAssignments
    expect(card("اتجاه الأداء").querySelector(".eb-stat-value")?.textContent).toBe("↓ 6.5%");           // performanceChange
    expect(card("اتجاه الأداء").querySelector(".eb-stat-hint")?.textContent).toBe("يتراجع مقارنة بالواجبات السابقة");
    expect(card("اتجاه الأداء").className).toContain("tone-danger");
    // no count-up animation: the value is final on first paint (no intermediate "0")
    expect(kpis.textContent).not.toMatch(/(^|\D)0%/);
  });
  it("is a single page: no tabs, no hero, shell owns the h1, one h2 per section in the locked order", async () => {
    await mount();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(document.querySelector(".analytics-view-tabs, .analytics-view-tab, .analytics-hero, .platform-eyebrow")).toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    const h2s = screen.getAllByRole("heading", { level: 2 }).map(h => h.textContent?.replace(/\d+$/, "").trim());
    expect(h2s).toEqual(["المؤشرات الرئيسية", "يحتاج إلى انتباهك", "الاتجاهات والتحليلات", "طلاب يحتاجون متابعة", "متابعة الواجبات", "مؤشرات ذكية للمعلم", "إنجازات الطلاب الأخيرة", "تحليل البيانات العامة واستخلاص العبر"]);
    expect(document.body.textContent).not.toMatch(/Performance Trend|Submission Status|Smart Insights|Follow-up Center|Drill Down|AI Insights|Notifications/);
    expect(screen.getByRole("region", { name: "أدوات لوحة المتابعة" }).textContent).toContain("آخر تحديث");
  });
  it("toolbar actions are SVG + text buttons (no emoji) and print calls window.print", async () => {
    await mount();
    const print = vi.fn(); (window as unknown as { print: () => void }).print = print;
    for (const name of ["تحديث", "تصدير CSV", "طباعة"]) expect(screen.getByRole("button", { name }).querySelector("svg")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "طباعة" }));
    expect(print).toHaveBeenCalledTimes(1);
  });
  it("follow-up table: high → عاجل, medium → متابعة, names are buttons that open the profile; assignments rows use a real button (no <tr onClick>)", async () => {
    const calls = await mount();
    const table = heading2(/^طلاب يحتاجون متابعة/).closest("section")!.querySelector("table")!;
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map(r => r.lastElementChild?.textContent)).toEqual(["عاجل", "متابعة"]);
    expect(table.textContent).toContain("•••••6789");
    fireEvent.click(within(rows[0]).getByRole("button", { name: "سارة خالد" }));
    await waitFor(() => expect(calls.some(c => c.url === "/api/students?profileUserId=u1")).toBe(true));
    const aTable = heading2("متابعة الواجبات").closest("section")!.querySelector("table")!;
    expect(aTable.querySelector("tr[class*=click], tr[onclick]")).toBeNull();
    const first = within(aTable).getAllByRole("row")[1];
    expect(within(first).getByRole("button", { name: "واجب 3" })).toBeTruthy(); // reversed order preserved
    fireEvent.click(within(first).getByRole("button", { name: "واجب 3" }));
    await waitFor(() => expect(calls.some(c => c.url === "/api/assignment-results?assignmentId=a3")).toBe(true));
  });
});

describe("UX-3 dashboard — charts (react-chartjs-2 mocked)", () => {
  it("hands Chart.js the same series as before: trend (nulls dropped), donut, distribution, class comparison, topics (10, threshold colours)", async () => {
    await mount();
    const line = lastChart("line");
    expect(line.data.labels).toEqual(["واجب 1", "واجب 2"]);
    expect(line.data.datasets[0].data).toEqual([65, 70]);
    const donut = lastChart("doughnut");
    expect(donut.data.labels).toEqual(["تم التسليم", "لم يُسلّم"]); expect(donut.data.datasets[0].data).toEqual([51, 9]);
    const bars = charts.calls.filter(c => c.type === "bar");
    const dist = bars.find(c => c.data.datasets[0].label === "عدد الطلاب")!;
    expect(dist.data.labels).toEqual(["90-100", "80-89", "أقل من 50"]); expect(dist.data.datasets[0].data).toEqual([6, 10, 3]);
    const cls = bars.find(c => c.data.datasets[0].label === "متوسط الصف")!;
    expect(cls.data.labels).toEqual(["الحادي عشر", "العاشر"]); expect(cls.data.datasets[0].data).toEqual([74.2, 0]); expect(cls.options.indexAxis).toBe("y");
    const topic = bars.find(c => c.data.datasets[0].label === "متوسط الموضوع")!;
    expect(topic.data.labels).toHaveLength(10);
    expect((topic.data.datasets[0].backgroundColor as string[]).slice(0, 3)).toEqual(["rgba(239,68,68,.76)", "rgba(22,163,74,.76)", "rgba(245,158,11,.76)"]);
    for (const c of charts.calls) expect((c.options.plugins as { tooltip: { rtl: boolean } }).tooltip.rtl).toBe(true);
    expect(line.options.animation).toEqual({ duration: 1050, easing: "easeOutQuart" });
  });
  it("every chart exposes a text summary (role=img + aria-label) and honours prefers-reduced-motion", async () => {
    stubMatchMedia(true);
    await mount();
    const imgs = screen.getAllByRole("img").map(el => el.getAttribute("aria-label") || "");
    expect(imgs.some(t => t.startsWith("تطور متوسط الأداء عبر 2 واجبات"))).toBe(true);
    expect(imgs.some(t => t.startsWith("حالة التسليم: 85% نسبة التسليم، 51 تم التسليم، 9 لم يُسلّم، 4 تحتاج مراجعة"))).toBe(true);
    expect(imgs.some(t => t.startsWith("توزيع العلامات: 90-100: 6"))).toBe(true);
    expect(imgs.some(t => t.startsWith("مقارنة الصفوف: الحادي عشر: 74.2%، العاشر: —"))).toBe(true);
    expect(imgs.some(t => t.startsWith("الأداء حسب الموضوع: موضوع 1: 45%"))).toBe(true);
    for (const c of charts.calls) expect(c.options.animation).toBe(false);
  });
  it("shows the empty-chart messages instead of canvases when series are too short", async () => {
    await mount({ analytics: () => ({ ...analyticsFixture(), assignmentTrend: [trendItem(1)], gradeDistribution: [], classComparison: [], topicAnalytics: [] }) });
    expect(screen.getByText("تظهر حركة الأداء بعد توفر نتيجتين على الأقل.")).toBeTruthy();
    expect(screen.getByText("لا توجد علامات بعد.")).toBeTruthy();
    expect(screen.getByText("لا توجد بيانات صفوف بعد.")).toBeTruthy();
    expect(screen.getByText("ستظهر تحليلات الموضوعات بعد وجود إجابات مصححة.")).toBeTruthy();
    expect(screen.queryByTestId("chart-line")).toBeNull();
  });
});

describe("UX-3 dashboard — CSV, AI, achievements (payload parity)", () => {
  it("CSV export writes byte-identical content to the pre-UX-3 format", async () => {
    await mount();
    let captured: Blob | null = null;
    URL.createObjectURL = vi.fn((b: Blob) => { captured = b; return "blob:x"; }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "تصدير CSV" }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(captured).toBeTruthy();
    const text = await (captured as unknown as Blob).text();
    const f = analyticsFixture();
    const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const pct = (v: number | null) => v === null ? "—" : v.toFixed(1).replace(/\.0$/, "") + "%";
    const trendText = (d: number) => d >= 5 ? "يتحسن" : d <= -5 ? "يتراجع" : "مستقر";
    const rows: string[][] = [
      ["ExamBank - Teacher Analytics"], ["النطاق", f.scope.className], ["تاريخ التقرير", new Date(GENERATED_AT).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" })], [],
      ["المؤشر", "القيمة"], ["الطلاب", "38"], ["متوسط العلامات", "72.4%"], ["نسبة التسليم", "85%"], ["يحتاجون متابعة", "5"], ["واجبات منشورة", "7"], ["تسليمات ناقصة", "9"], [],
      ["الواجب", "الصف", "المتوسط", "التسليم", "لم يسلم", "مراجعة"],
      ...f.assignmentTrend.map(i => [i.title, i.className, pct(i.average as number | null), pct(i.completionRate), String(i.missing), String(i.pendingReview)]), [],
      ["طلاب يحتاجون متابعة", "الصف", "المعدل", "ناقص", "الاتجاه", "السبب"],
      ...f.followUp.map(i => [i.displayName, i.className, pct(i.average), String(i.missing), trendText(i.trendDelta), i.reasons.join("، ")]), [],
      ["الموضوع", "المتوسط", "إجابات مصححة"], ...f.topicAnalytics.map(i => [i.topic, pct(i.average), String(i.gradedQuestions)])
    ];
    expect(text).toBe("\ufeff" + rows.map(r => r.map(q).join(",")).join("\r\n"));
    expect((captured as unknown as Blob).type).toBe("text/csv;charset=utf-8");
  });
  it("AI analysis posts {classId} for the class scope and {classId, studentId} for the student scope, rendering the advice lines", async () => {
    const calls = await mount();
    fireEvent.click(screen.getByRole("button", { name: /تحليل البيانات العامة واستخلاص العبر/ }));
    await screen.findByText("سطر ثانٍ");
    let ai = calls.filter(c => c.url === "/api/teacher-analytics-ai");
    expect(ai).toHaveLength(1); expect(ai[0].init?.method).toBe("POST"); expect(JSON.parse(String(ai[0].init?.body))).toEqual({ classId: "" });
    expect((ai[0].init!.headers as Record<string, string>)["x-builder-token"]).toBe("tkn-1");
    // student scope: needs a class + student + studentDetail in the payload
    cleanup();
    const detail = { userId: "u1", displayName: "سارة خالد", classId: "c1", className: "الحادي عشر", average: 42, assigned: 5, completed: 2, missing: 3, completionRate: 40, trendDelta: -16, trend: "declining", lastLoginAt: "", scoreTrend: [{ assignmentId: "a1", title: "واجب 1", date: "", percentage: 50 }, { assignmentId: "a2", title: "واجب 2", date: "", percentage: 34 }], topicAnalytics: [{ topic: "كسور", average: 40, gradedQuestions: 3 }] };
    const calls2 = await mount({ analytics: () => ({ ...analyticsFixture(), studentDetail: detail }) });
    fireEvent.change(screen.getByLabelText("الصف"), { target: { value: "c1" } });
    fireEvent.change(await screen.findByLabelText("الطالب"), { target: { value: "u1" } });
    await waitFor(() => expect(analyticsCalls(calls2).at(-1)?.url).toBe("/api/teacher-analytics?classId=c1&studentId=u1"));
    const focus = await screen.findByRole("region", { name: "سارة خالد" });
    expect(focus.textContent).toContain("تركيز على طالب واحد");
    expect(within(focus).getByRole("heading", { level: 3, name: "حركة علامات الطالب" })).toBeTruthy();
    fireEvent.click(within(focus).getByRole("button", { name: /تحليل بيانات هذا الطالب/ }));
    await within(focus).findByText("سطر ثانٍ");
    ai = calls2.filter(c => c.url === "/api/teacher-analytics-ai");
    expect(JSON.parse(String(ai[0].init?.body))).toEqual({ classId: "c1", studentId: "u1" });
  });
  it("achievement feed: reactions and notes POST the same {action, classId, postId, …} bodies", async () => {
    const post = { postId: "p1", classId: "c1", className: "الحادي عشر", studentDisplayName: "ليان أحمد", assignmentTitle: "واجب 2", tier: "gold", createdAt: "", reactionCounts: { heart: 1, clap: 0, cheer: 0, fire: 0 }, teacherReaction: null, teacherNote: "" };
    const calls = await mount({ feed: { ok: true, posts: [post] } });
    const section = heading2(/^إنجازات الطلاب الأخيرة/).closest("section")!;
    expect(section.textContent).toContain("ليان أحمد");
    fireEvent.click(within(section).getByRole("button", { name: "أحسنت" }));
    await waitFor(() => expect(calls.filter(c => c.url === "/api/teacher-achievement-feed" && c.init?.method === "POST")).toHaveLength(1));
    expect(JSON.parse(String(calls.at(-1)!.init?.body))).toEqual({ action: "react", classId: "c1", postId: "p1", reaction: "clap" });
    fireEvent.change(within(section).getByLabelText("كلمة تشجيع"), { target: { value: "ممتاز" } });
    fireEvent.click(within(section).getByRole("button", { name: "إرسال" }));
    await waitFor(() => expect(calls.filter(c => c.url === "/api/teacher-achievement-feed" && c.init?.method === "POST")).toHaveLength(2));
    expect(JSON.parse(String(calls.at(-1)!.init?.body))).toEqual({ action: "setNote", classId: "c1", postId: "p1", note: "ممتاز" });
  });
});

describe("UX-3 dashboard — drill-down panel", () => {
  it("assignment → student → attempt chain keeps the three requests, focuses the panel heading on open and returns focus on close", async () => {
    const calls = await mount();
    const aTable = heading2("متابعة الواجبات").closest("section")!.querySelector("table")!;
    const trigger = within(aTable).getByRole("button", { name: "واجب 1" });
    trigger.focus();
    fireEvent.click(trigger);
    const panel = await screen.findByRole("complementary", { name: "واجب 1" });
    expect(calls.some(c => c.url === "/api/assignment-results?assignmentId=a1")).toBe(true);
    expect(document.activeElement).toBe(within(panel).getByRole("heading", { level: 2, name: "واجب 1" }));
    expect(panel.textContent).toContain("مصحح");
    fireEvent.click(within(panel).getByRole("button", { name: "#1 · 65%" }));
    const review = await screen.findByRole("complementary", { name: /المحاولة #1/ });
    expect(calls.some(c => c.url === "/api/assignment-review?assignmentId=a1&studentId=st1&attemptNumber=1")).toBe(true);
    expect(review.textContent).toContain("أحسنت"); expect(review.textContent).toContain("مصححة بالكامل");
    fireEvent.click(within(panel).getByRole("button", { name: "سارة خالد" }));
    const profile = await screen.findByRole("complementary", { name: "سارة خالد" });
    expect(calls.some(c => c.url === "/api/students?profileUserId=st1")).toBe(true);
    expect(profile.textContent).toContain("لم يدخل");
    fireEvent.click(within(profile).getByRole("button", { name: "إغلاق" }));
    expect(screen.queryByRole("complementary", { name: "سارة خالد" })).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: "إغلاق" }));
    expect(screen.queryByRole("complementary")).toBeNull(); // closing the assignment panel also closes the attempt review
    expect(document.activeElement).toBe(trigger);
  });
  it("a filter change clears open panels without throwing, and the dock is absent when nothing is open", async () => {
    const calls = await mount();
    expect(document.querySelector(".eb-drill-dock")).toBeNull();
    fireEvent.click(within(heading2("متابعة الواجبات").closest("section")!).getByRole("button", { name: "واجب 2" }));
    await screen.findByRole("complementary", { name: "واجب 2" });
    expect(document.querySelector(".eb-dash-layout.has-drill")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("الصف"), { target: { value: "c2" } });
    await waitFor(() => expect(analyticsCalls(calls).at(-1)?.url).toBe("/api/teacher-analytics?classId=c2"));
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
    expect(document.querySelector(".eb-dash-layout.has-drill")).toBeNull();
  });
});

describe("UX-3 dashboard — states and source guards", () => {
  it("shows the loading marker first and the error state when the analytics request fails", async () => {
    installFetch({ analyticsStatus: 500 });
    render(<TeacherDashboard token="t" />);
    expect(document.querySelector(".analytics-loading")).toBeTruthy();
    await waitFor(() => expect(document.querySelector(".platform-error")?.textContent).toBe("فشل التحميل"));
    expect(screen.getByRole("alert")).toBeTruthy();
  });
  it("TeacherDashboard.tsx: no tabs/view state, no row-level click handlers, no count-up animation, no emoji, resolver still shared", () => {
    const src = dashboardSource();
    expect(src).not.toMatch(/role="tablist"|analytics-view-tab|useState<"overview"/);
    expect(src).not.toMatch(/<tr[^>]*onClick/);
    expect(src).not.toMatch(/AnimatedNumber|requestAnimationFrame/);
    expect(src).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{231A}-\u{23FF}]/u);
    expect(src).not.toMatch(/platform-eyebrow|analytics-hero|analytics-click-row|analytics-drill-card/);
    expect(src).toMatch(/resolveGradingStatus\(/);
    expect(src).toMatch(/function DashboardDrillPanel/);
    expect(src).not.toMatch(/from "\.\/ui\/Modal"/);
    // the four locked empty strings
    for (const s of ["لا توجد تسليمات بانتظار التصحيح", "لا توجد حالات عاجلة", "لا توجد تسليمات ناقصة", "جميع الطلاب سجّلوا الدخول"]) expect(src).toContain(s);
  });
});
