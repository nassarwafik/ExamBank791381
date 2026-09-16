// @vitest-environment happy-dom
//
// UX-6b — Reports Center. Drives the REAL ReportsCenter → ReportViews tree with a routed fetch mock and pins:
// the hub (no hero, aria-pressed categories, grouped cards, opener → workspace heading focus, back → card focus),
// the filter architecture (only the relevant controls, labelled, canonical programCodes class filtering, period
// + custom range), the request model (hub = filters only, one report GET per resolved filter change, classStudents
// only for reports that consume it, ProjectReport never fetches analytics separately, zero requests for category /
// chart-table / CSV / print), stale-response protection with delayed responses, every report type's rendering
// (latest-submitted-result wording, missing vs zero, exact distribution labels, semantic matrix, ChartCard
// equivalents, reduced motion, Western digits) and source guards (no tablist, no control emoji, no POST).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";

vi.mock("react-chartjs-2", () => ({
  Bar: (p: { options?: { animation?: boolean } }) => <canvas data-chart="bar" data-animation={String(p.options?.animation ?? "default")} />,
  Line: (p: { options?: { animation?: boolean } }) => <canvas data-chart="line" data-animation={String(p.options?.animation ?? "default")} />,
  Doughnut: (p: { options?: { animation?: boolean } }) => <canvas data-chart="doughnut" data-animation={String(p.options?.animation ?? "default")} />
}));

import ReportsCenter from "./ReportsCenter";

const TRACKS = [{ trackId: "book", title: "الكتاب", icon: "📘" }, { trackId: "packetTracer", title: "Packet Tracer", icon: "🖧" }];
const FILTERS = {
  ok: true, schoolYears: ["2025-2026", "2024-2025"],
  classes: [
    { classId: "c1", name: "الحادي عشر", schoolYear: "2025-2026", status: "active", programCodes: ["794589"] },
    { classId: "c2", name: "العاشر", schoolYear: "2025-2026", status: "active", programCodes: [] },                 // programCodes:[] is canonical "no project" even if a legacy scalar lingered
    { classId: "c3", name: "دفعة 2024", schoolYear: "2024-2025", status: "archived", programCodes: ["794589", "899373"] }
  ],
  projects: [{ projectCode: "794589", title: "مشروع 794589" }, { projectCode: "899373", title: "مشروع 899373" }]
};
const STUDENTS = { ok: true, students: [{ studentId: "s1", displayName: "زيد صالح" }, { studentId: "s2", displayName: "خالد عمر" }] };
const CLASS_REPORT = (name = "الحادي عشر") => ({ ok: true, type: "class", class: { classId: "c1", name, schoolYear: "2025-2026", status: "active", studentCount: 24 }, kpis: { assignments: 3, averageScore: 71.3, submissionRate: 83 }, projects: [{ projectCode: "794589", title: "مشروع 794589", tracks: TRACKS, avgOverall: 55, trackAverages: { book: 70, packetTracer: 40 }, completedCount: 2 }] });
const STUDENT_REPORT = { ok: true, type: "student", student: { studentId: "s1", displayName: "زيد صالح", classId: "c1", className: "الحادي عشر", schoolYear: "2025-2026" }, academic: { average: 64.5, submittedCount: 2, assessmentCount: 3, submissionRate: 67 }, projects: [{ projectCode: "794589", title: "مشروع 794589", tracks: TRACKS, summary: { overallProgress: 45, trackProgress: { book: 60, packetTracer: 30 }, counts: { not_started: 4, in_progress: 2, ready_for_review: 1, approved: 3 }, complete: false }, nextStages: { book: { stageId: "B02", title: "طبقات OSI" }, packetTracer: null }, balance: { leadingTrackTitle: "الكتاب", laggingTrackTitle: "Packet Tracer", diff: 30 }, lastActivity: "2026-03-01T10:00:00.000Z" }] };
const ASSIGN_REPORT = {
  ok: true, type: "assignments", class: { classId: "c1", name: "الحادي عشر" },
  students: [{ studentId: "s1", displayName: "زيد صالح" }, { studentId: "s2", displayName: "خالد عمر" }, { studentId: "s3", displayName: "سعد" }],
  overall: { assessmentCount: 2, participants: 4, average: 52.5, submissionRate: 67, distribution: { "0-49": 2, "50-59": 0, "60-69": 0, "70-79": 1, "80-89": 0, "90-100": 1 } },
  perAssignment: [{ assignmentId: "a1", title: "اختبار الكسور", students: 3, submitted: 3, missing: 0, zeroScores: 1, submissionRate: 100, average: 60, avgAttempts: 1.3 }, { assignmentId: "a2", title: "واجب الجبر", students: 3, submitted: 1, missing: 2, zeroScores: 0, submissionRate: 33, average: 30, avgAttempts: 0.3 }],
  matrix: [
    { assignmentId: "a1", title: "اختبار الكسور", cells: [{ studentId: "s1", state: "submitted", percentage: 90 }, { studentId: "s2", state: "submitted", percentage: 0 }, { studentId: "s3", state: "submitted", percentage: 90 }] },
    { assignmentId: "a2", title: "واجب الجبر", cells: [{ studentId: "s1", state: "submitted", percentage: 30 }, { studentId: "s2", state: "missing", percentage: null }, { studentId: "s3", state: "missing", percentage: null }] }
  ]
};
const ANALYTICS = {
  perStudent: [{ studentId: "s1", name: "زيد صالح", trackProgress: { book: 60, packetTracer: 30 }, overall: 45 }],
  stageCompletion: [{ stageId: "B01", title: "مقدمة", track: "book", groupId: "g1", approvedPct: 50 }],
  buckets: { "0-25": 0, "26-50": 1, "51-75": 0, "76-99": 0, "100": 0 },
  weeklyTrend: [{ weekStart: "2026-02-22", avgOverall: 40 }],
  heatmap: { students: [{ studentId: "s1", name: "زيد صالح" }], stages: [{ stageId: "B01", title: "مقدمة", track: "book", groupId: "g1" }], statuses: [{ B01: "ready_for_review" }] }
};
const PROJECT_REPORT = { ok: true, type: "project", projectCode: "794589", tracks: TRACKS, class: { classId: "c1", name: "الحادي عشر" }, summary: { avgOverall: 55, trackAverages: { book: 70, packetTracer: 40 }, completedCount: 2, studentsReadyForReview: 3, staleCount: 1, studentCount: 24 }, analytics: ANALYTICS };
const TRACK_REPORT = (track = "book") => ({ ok: true, type: "track", projectCode: "794589", tracks: TRACKS, track, groups: [{ groupId: "g1", title: "الوحدة الأولى" }], class: { name: "الحادي عشر" }, rows: [{ stageId: track === "book" ? "B01" : "P01", title: "مقدمة", groupId: "g1", approved: 10, ready_for_review: 2, in_progress: 5, not_started: 7, approvedPct: 42 }] });
const READY_REPORT = { ok: true, type: "ready", projectCode: "794589", tracks: TRACKS, class: { name: "الحادي عشر", status: "active" }, students: [{ studentId: "s1", displayName: "زيد صالح", stages: [{ stageId: "B01", title: "مقدمة", track: "book" }] }], totalReady: 1 };
const DELAYED_REPORT = { ok: true, type: "delayed", projectCode: "794589", tracks: TRACKS, lateThreshold: 40, class: { name: "الحادي عشر" }, students: [{ studentId: "s3", displayName: "سعد", overall: 12, trackProgress: { book: 20, packetTracer: 4 }, updatedAt: "2026-02-01T10:00:00.000Z", complete: false, reasons: ["بلا تحديث 7+ أيام", "تقدّم أقل من 40%"] }] };
const TIMELINE_REPORT = { ok: true, type: "timeline", projectCode: "794589", tracks: TRACKS, class: { name: "الحادي عشر" }, scope: "class", trend: [{ weekStart: "2026-02-22", avgOverall: 40 }, { weekStart: "2026-03-01", avgOverall: 72 }] };

type Call = { method: string; url: string };
let calls: Call[] = [];
let pending: { url: string; resolve: () => void }[] = [];
let delayFor: ((url: string) => boolean) | null = null;
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body } as Response);

function respond(url: string): Response {
  const u = new URL(url, "http://x");
  const type = u.searchParams.get("type");
  const classId = u.searchParams.get("classId");
  if (type === "filters") return json(FILTERS);
  if (type === "classStudents") return json(STUDENTS);
  if (type === "class") return json(CLASS_REPORT(classId === "c2" ? "العاشر" : "الحادي عشر"));
  if (type === "student") return json(STUDENT_REPORT);
  if (type === "assignments") return json(ASSIGN_REPORT);
  if (type === "project") return json(PROJECT_REPORT);
  if (type === "track") return json(TRACK_REPORT(u.searchParams.get("track") || "book"));
  if (type === "ready") return json(READY_REPORT);
  if (type === "delayed") return json(DELAYED_REPORT);
  if (type === "timeline") return json(TIMELINE_REPORT);
  return json({ ok: false, error: "نوع تقرير غير معروف." }, 400);
}
function route(url: string, init?: RequestInit): Promise<Response> {
  calls.push({ method: init?.method || "GET", url });
  if (delayFor && delayFor(url)) return new Promise(resolve => { pending.push({ url, resolve: () => resolve(respond(url)) }); });
  return Promise.resolve(respond(url));
}

beforeEach(() => {
  calls = []; pending = []; delayFor = null;
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => route(String(input), init)) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const reportGets = (type?: string) => calls.filter(c => c.method === "GET" && c.url.startsWith("/api/reports") && (!type || new URL(c.url, "http://x").searchParams.get("type") === type));
const posts = () => calls.filter(c => c.method === "POST");
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{2712}\u{2714}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
async function mount(onOpenProject?: (code: string) => void) {
  render(<ReportsCenter token="t" onOpenProject={onOpenProject} />);
  await screen.findByRole("group", { name: "تصنيف التقارير" });
  await waitFor(() => expect(reportGets("filters")).toHaveLength(1));
}
const cardButton = (title: string) => screen.getByRole("button", { name: "فتح التقرير " + title });
async function open(title: string) {
  const btn = cardButton(title); btn.focus(); fireEvent.click(btn);
  const heading = await screen.findByRole("heading", { level: 2, name: title });
  return { btn, heading, workspace: heading.closest(".eb-report-workspace") as HTMLElement };
}
const filters = () => screen.getByRole("region", { name: "مرشحات التقرير" });
const pick = (label: string, value: string) => fireEvent.change(within(filters()).getByLabelText(label), { target: { value } });
const resultText = () => (document.querySelector(".eb-report-result") as HTMLElement | null)?.textContent || "";
const labelOf = (el: Element) => Array.from((el.closest("label") as HTMLElement).childNodes).filter(n => n.nodeType === 3).map(n => n.textContent?.trim()).join("");
const comboLabels = () => within(filters()).getAllByRole("combobox").map(labelOf);
const FINAL_WORDING = /(درجة|علامة|نتيجة) نهائية|الدرجة النهائية|النتيجة النهائية/;

describe("UX-6b hub", () => {
  it("starts with content (no hero, no h1), one filters GET, aria-pressed categories that filter groups with zero requests, SVG cards with a primary open action", async () => {
    await mount();
    expect(document.querySelector(".teacher-assignment-heading")).toBeNull();
    expect(document.querySelector("h1")).toBeNull();
    expect(screen.queryByText(/مركز التقارير/)).toBeNull();
    expect(document.querySelector('[role="tablist"]')).toBeNull();
    expect(screen.getAllByRole("heading", { level: 2 }).map(h => h.textContent)).toEqual(["الطلاب والصفوف", "التقييمات والواجبات", "المشاريع"]);
    expect(screen.getAllByRole("button", { name: /^فتح التقرير / })).toHaveLength(8);
    expect(document.querySelectorAll(".eb-report-card-icon svg")).toHaveLength(8);
    const cats = screen.getByRole("group", { name: "تصنيف التقارير" });
    const n = calls.length;
    fireEvent.click(within(cats).getByRole("button", { name: "المشاريع" }));
    expect(within(cats).getByRole("button", { name: "المشاريع" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByRole("heading", { level: 2 }).map(h => h.textContent)).toEqual(["المشاريع"]);
    expect(screen.getAllByRole("button", { name: /^فتح التقرير / }).map(b => b.textContent)).toEqual(["فتح التقريرتقرير المشروع", "فتح التقريرتقرير المسار", "فتح التقريرجاهز للفحص", "فتح التقريرالمتأخرون", "فتح التقريرالتقدم الزمني"]);
    fireEvent.click(within(cats).getByRole("button", { name: "الكل" }));
    expect(calls.length).toBe(n);
    expect(reportGets()).toHaveLength(1);                                                            // hub fetches no report data
    expect(EMOJI.test(document.body.textContent || "")).toBe(false);
  });
  it("opening a card focuses the workspace heading; back restores focus to that card's button; no report GET without required filters", async () => {
    await mount();
    const { btn, heading, workspace } = await open("تقرير الصف");
    expect(document.activeElement).toBe(heading);
    expect(document.querySelector("h1")).toBeNull();
    expect(await within(workspace).findByText("اختر صفًا لعرض تقريره.")).toBeTruthy();
    expect(reportGets()).toHaveLength(1);
    fireEvent.click(within(workspace).getByRole("button", { name: "عودة إلى كل التقارير" }));
    await screen.findByRole("group", { name: "تصنيف التقارير" });
    expect(document.activeElement).toBe(cardButton("تقرير الصف"));                                  // the re-rendered card button
    expect(btn.isConnected).toBe(false);                                                           // hub re-mounted: the old node is gone
    expect(reportGets()).toHaveLength(1);
  });
});

describe("UX-6b filters — only relevant controls, canonical project/class filtering, student list, period", () => {
  it("class report: year + class + period only; project report: project + class, no period; student report adds the student control", async () => {
    await mount();
    await open("تقرير الصف");
    expect(comboLabels()).toEqual(["السنة الدراسية", "الصف", "الفترة الزمنية"]);
    fireEvent.click(screen.getByRole("button", { name: "عودة إلى كل التقارير" }));
    await open("تقرير المشروع");
    expect(comboLabels()).toEqual(["السنة الدراسية", "المشروع", "الصف"]);
    expect(within(filters()).queryByRole("group", { name: "خيارات الفترة الزمنية" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "عودة إلى كل التقارير" }));
    await open("تقرير الطالب");
    expect(comboLabels()).toEqual(["السنة الدراسية", "الصف", "الطالب", "الفترة الزمنية"]);
    fireEvent.click(screen.getByRole("button", { name: "عودة إلى كل التقارير" }));
    await open("التقدم الزمني");
    expect(comboLabels()).toEqual(["السنة الدراسية", "المشروع", "الصف", "طالب (اختياري)", "الفترة الزمنية"]);
  });
  it("project reports list only classes whose canonical programCodes include the project (programCodes:[] never matches); year narrows classes", async () => {
    await mount();
    await open("تقرير المشروع");
    const classSel = () => within(filters()).getByLabelText("الصف") as HTMLSelectElement;
    expect(Array.from(classSel().options).map(o => o.textContent)).toEqual(["اختر صفًا", "الحادي عشر — 2025-2026", "العاشر — 2025-2026", "دفعة 2024 — 2024-2025 (مؤرشف)"]);
    pick("المشروع", "794589");
    expect(Array.from(classSel().options).map(o => o.textContent)).toEqual(["اختر صفًا", "الحادي عشر — 2025-2026", "دفعة 2024 — 2024-2025 (مؤرشف)"]);
    pick("المشروع", "899373");
    expect(Array.from(classSel().options).map(o => o.textContent)).toEqual(["اختر صفًا", "دفعة 2024 — 2024-2025 (مؤرشف)"]);
    pick("السنة الدراسية", "2025-2026");
    expect(Array.from(classSel().options).map(o => o.textContent)).toEqual(["اختر صفًا"]);
    expect(reportGets("project")).toHaveLength(0);
    expect(reportGets("classStudents")).toHaveLength(0);
  });
  it("classStudents is requested only by reports that consume it (student/timeline), once per class, never for class/assignments reports, and not again when switching between two consuming reports", async () => {
    await mount();
    await open("تقرير الصف");
    pick("الصف", "c1");
    await waitFor(() => expect(reportGets("class")).toHaveLength(1));
    expect(reportGets("classStudents")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "عودة إلى كل التقارير" }));
    await open("التقييمات والواجبات");
    await waitFor(() => expect(reportGets("assignments")).toHaveLength(1));
    expect(reportGets("classStudents")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "عودة إلى كل التقارير" }));
    await open("تقرير الطالب");
    await waitFor(() => expect(reportGets("classStudents")).toHaveLength(1));
    expect(reportGets("classStudents")[0].url).toBe("/api/reports?type=classStudents&classId=c1");
    await waitFor(() => expect(within(filters()).getByLabelText("الطالب").querySelectorAll("option").length).toBe(3));
    pick("الطالب", "s1");
    await waitFor(() => expect(reportGets("student")).toHaveLength(1));
    expect(reportGets("student")[0].url).toBe("/api/reports?type=student&studentId=s1");
    fireEvent.click(screen.getByRole("button", { name: "عودة إلى كل التقارير" }));
    await open("التقدم الزمني");
    pick("المشروع", "794589");                                                                      // choosing a project resets the class (unchanged semantics)
    expect(within(filters()).getByLabelText("طالب (اختياري)").querySelectorAll("option").length).toBe(1);
    pick("الصف", "c1");
    await waitFor(() => expect(within(filters()).getByLabelText("طالب (اختياري)").querySelectorAll("option").length).toBe(3));
    expect(reportGets("classStudents")).toHaveLength(1);                                             // same class already loaded: no re-read
    pick("الصف", "c3");
    await waitFor(() => expect(reportGets("classStudents")).toHaveLength(2));
    expect(reportGets("classStudents")[1].url).toBe("/api/reports?type=classStudents&classId=c3");
  });
  it("period: all/7/30/year/custom keep the exact query semantics — one report GET per resolved change, custom keeps ISO from/to", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 2, 15, 12));
    await mount();
    await open("التقييمات والواجبات");
    pick("الصف", "c1");
    await waitFor(() => expect(reportGets("assignments")).toHaveLength(1));
    expect(reportGets("assignments")[0].url).toBe("/api/reports?type=assignments&classId=c1");
    pick("الفترة الزمنية", "7");
    await waitFor(() => expect(reportGets("assignments")).toHaveLength(2));
    expect(reportGets("assignments")[1].url).toBe("/api/reports?type=assignments&classId=c1&from=2026-03-09&to=2026-03-15");
    pick("الفترة الزمنية", "30");
    await waitFor(() => expect(reportGets("assignments")).toHaveLength(3));
    expect(reportGets("assignments")[2].url).toBe("/api/reports?type=assignments&classId=c1&from=2026-02-14&to=2026-03-15");
    pick("الفترة الزمنية", "year");
    await waitFor(() => expect(reportGets("assignments")).toHaveLength(4));
    expect(reportGets("assignments")[3].url).toBe("/api/reports?type=assignments&classId=c1");   // no invented boundaries
    pick("الفترة الزمنية", "custom");
    expect(within(filters()).getByLabelText("من")).toBeTruthy();
    expect(reportGets("assignments")).toHaveLength(4);                                               // custom alone changes nothing
    pick("من", "2026-01-01");
    await waitFor(() => expect(reportGets("assignments")).toHaveLength(5));
    pick("إلى", "2026-01-31");
    await waitFor(() => expect(reportGets("assignments")).toHaveLength(6));
    expect(reportGets("assignments")[5].url).toBe("/api/reports?type=assignments&classId=c1&from=2026-01-01&to=2026-01-31");
    vi.useRealTimers();
  });
  it("stale-response protection: a slow response for the previous class never overwrites the newer report, and old rows never show against new filters", async () => {
    delayFor = url => url.includes("type=class") && url.includes("classId=c1");
    await mount();
    await open("تقرير الصف");
    pick("الصف", "c1");
    await waitFor(() => expect(reportGets("class")).toHaveLength(1));
    expect(screen.getByRole("status").textContent).toContain("جارٍ تجهيز التقرير");
    pick("الصف", "c2");
    await waitFor(() => expect(reportGets("class")).toHaveLength(2));
    await screen.findByRole("heading", { level: 3, name: /العاشر/ });
    await act(async () => { pending.forEach(p => p.resolve()); pending = []; });
    await new Promise(r => setTimeout(r, 20));
    expect(screen.getByRole("heading", { level: 3, name: /العاشر/ })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 3, name: /الحادي عشر/ })).toBeNull();
    // switching back to c1 re-fetches (no stale cache) and shows loading, not the old c2 rows
    pick("الصف", "c1");
    expect(screen.queryByRole("heading", { level: 3, name: /العاشر/ })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("جارٍ تجهيز التقرير");
    await waitFor(() => expect(reportGets("class")).toHaveLength(3));
    await act(async () => { pending.forEach(p => p.resolve()); pending = []; });
    await screen.findByRole("heading", { level: 3, name: /الحادي عشر/ });
  });
});

describe("UX-6b report types", () => {
  it("class report: StatCards from the payload, latest-submitted wording, independent project summaries with progress bars, CSV export and print without requests", async () => {
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    let captured: Blob | null = null;
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = (b: Blob) => { captured = b; return "blob:x"; };
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};
    window.print = vi.fn();
    await mount();
    await open("تقرير الصف");
    pick("الصف", "c1");
    await screen.findByRole("heading", { level: 3, name: /الحادي عشر/ });
    const cards = Array.from(document.querySelectorAll(".eb-stat-grid .eb-stat-card")).map(c => (c.querySelector(".eb-stat-label")?.textContent || "") + "=" + (c.querySelector(".eb-stat-value")?.textContent || ""));
    expect(cards).toEqual(["الطلاب=24", "التقييمات=3", "متوسط النتائج=71%", "نسبة التسليم=83%"]);
    expect(resultText()).toContain("نتيجة آخر محاولة مسلّمة");
    expect(resultText()).not.toMatch(FINAL_WORDING);
    const project = screen.getByRole("region", { name: "مشروع 794589" });
    expect(within(project).getAllByRole("progressbar").map(b => b.getAttribute("aria-valuenow"))).toEqual(["55", "70", "40"]);
    expect(within(project).getByText("مكتملون 2")).toBeTruthy();
    const n = calls.length;
    fireEvent.click(screen.getByRole("button", { name: "تصدير CSV" }));
    expect(anchorClick).toHaveBeenCalledTimes(1);
    const bytes = new Uint8Array(await new Response(captured as unknown as Blob).arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect(text).toBe("﻿" + ['"القسم","المؤشر","القيمة"', '"أكاديمي","الحالة","نشط"', '"أكاديمي","عدد الطلاب","24"', '"أكاديمي","عدد الواجبات","3"', '"أكاديمي","متوسط العلامات","71%"', '"أكاديمي","نسبة التسليم","83%"', '"مشروع 794589","التقدم العام","55"', '"مشروع 794589","الكتاب","70"', '"مشروع 794589","Packet Tracer","40"', '"مشروع 794589","مكتملون","2"'].join("\r\n"));
    fireEvent.click(screen.getByRole("button", { name: "طباعة" }));
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(calls.length).toBe(n);
    expect(document.querySelector(".eb-report-filters")?.classList.contains("eb-report-noprint")).toBe(true);
    expect(document.querySelector(".eb-report-ws-head")?.classList.contains("eb-report-noprint")).toBe(true);
    expect(document.querySelector(".eb-report-print-title")?.textContent).toBe("تقرير الصف");
    expect(EMOJI.test(document.body.textContent || "")).toBe(false);
  });
  it("student report: identity, latest-submitted academic average (never 'final'), submitted/assessment counts, per-project bars, next stage, balance, last activity in Western ISO digits", async () => {
    await mount();
    await open("تقرير الطالب");
    pick("الصف", "c1");
    await waitFor(() => expect(reportGets("classStudents")).toHaveLength(1));
    pick("الطالب", "s1");
    await screen.findByRole("heading", { level: 3, name: /زيد صالح/ });
    const cards = Array.from(document.querySelectorAll(".eb-stat-grid .eb-stat-card")).map(c => (c.querySelector(".eb-stat-label")?.textContent || "") + "=" + (c.querySelector(".eb-stat-value")?.textContent || ""));
    expect(cards).toEqual(["متوسط التقييمات=65%", "المسلَّمة=2 / 3", "نسبة التسليم=67%", "مشاريع الصف=1"]);
    expect(resultText()).toContain("نتيجة آخر محاولة مسلّمة");
    expect(resultText()).not.toMatch(FINAL_WORDING);
    const project = screen.getByRole("region", { name: "مشروع 794589" });
    expect(within(project).getByText("معتمدة 3")).toBeTruthy();
    expect(within(project).getByText("جاهزة للفحص 1")).toBeTruthy();
    expect(project.textContent).toContain("التالي في الكتاب: B02 — طبقات OSI");
    expect(project.textContent).toContain("الكتاب متقدّم على Packet Tracer بـ 30%");
    expect(project.textContent).toContain("آخر نشاط 2026-03-01");
    expect(/[٠-٩]/.test(resultText())).toBe(false);
  });
  it("assignments report: latest-submitted wording, exact distribution buckets, per-assessment table, semantic matrix with 'لم يسلّم' vs 0 vs value (never colour-only), ChartCard table = canvas data", async () => {
    await mount();
    await open("التقييمات والواجبات");
    pick("الصف", "c1");
    await screen.findByRole("heading", { level: 3, name: /الحادي عشر/ });
    expect(resultText()).toContain("نتيجة آخر محاولة مسلّمة");
    expect(resultText()).toContain("ليست درجات نهائية معتمدة");
    expect(resultText()).not.toMatch(FINAL_WORDING);
    expect(resultText()).not.toMatch(/نجاح|رسوب/);
    const dist = screen.getByRole("region", { name: "توزيع النتائج" });
    fireEvent.click(within(dist).getByRole("button", { name: "عرض البيانات كجدول" }));
    expect(within(within(dist).getByRole("table")).getAllByRole("rowheader").map(h => h.textContent)).toEqual(["0-49", "50-59", "60-69", "70-79", "80-89", "90-100"]);
    expect(within(within(dist).getByRole("table")).getAllByRole("cell").map(c => c.textContent)).toEqual(["2", "0", "0", "1", "0", "1"]);
    const tables = screen.getAllByRole("table");
    const per = tables.find(t => t.querySelector("caption")?.textContent?.startsWith("ملخص كل تقييم")) as HTMLElement;
    expect(within(per).getAllByRole("columnheader").map(h => h.textContent)).toEqual(["التقييم", "نسبة التسليم", "مُسلَّم", "لم يسلّم", "سلّم بعلامة صفر", "المتوسط (نتيجة آخر محاولة مسلّمة)", "متوسط المحاولات"]);
    expect(within(per).getAllByRole("rowheader").map(h => h.textContent)).toEqual(["اختبار الكسور", "واجب الجبر"]);
    const matrix = document.querySelector(".eb-report-matrix") as HTMLElement;
    expect(matrix.querySelector("caption")?.textContent).toContain("نتيجة آخر محاولة مسلّمة");
    expect(within(matrix).getAllByRole("columnheader").map(h => h.textContent)).toEqual(["الطالب", "اختبار الكسور", "واجب الجبر"]);
    const rowOf = (name: string) => within(matrix).getByRole("row", { name: new RegExp(name) });
    expect(within(rowOf("زيد صالح")).getAllByRole("cell").map(c => c.textContent)).toEqual(["90% نتيجة آخر محاولة مسلّمة", "30% نتيجة آخر محاولة مسلّمة"]);
    expect(within(rowOf("خالد عمر")).getAllByRole("cell").map(c => c.textContent)).toEqual(["0 سلّم بعلامة صفر", "لم يسلّم"]);
    expect(within(rowOf("سعد")).getAllByRole("cell").map(c => c.textContent)).toEqual(["90% نتيجة آخر محاولة مسلّمة", "لم يسلّم"]);
    expect(matrix.closest(".eb-report-table-scroll")).toBeTruthy();                                   // contained scroll, never the page
    expect(EMOJI.test(document.body.textContent || "")).toBe(false);
  });
  it("project report: one type=project GET, analytics rendered from that payload (zero /api/project-tracker requests), StatCards, bars, ChartCards, drill to the Projects workspace", async () => {
    const onOpenProject = vi.fn();
    await mount(onOpenProject);
    await open("تقرير المشروع");
    pick("المشروع", "794589"); pick("الصف", "c1");
    await screen.findByRole("heading", { level: 3, name: /الحادي عشر/ });
    expect(reportGets("project")).toHaveLength(1);
    expect(reportGets("project")[0].url).toBe("/api/reports?type=project&projectCode=794589&classId=c1");
    expect(calls.filter(c => c.url.includes("/api/project-tracker"))).toHaveLength(0);
    expect(calls.filter(c => c.url.includes("resource=analytics"))).toHaveLength(0);
    const cards = Array.from(document.querySelectorAll(".eb-stat-grid .eb-stat-card")).map(c => (c.querySelector(".eb-stat-label")?.textContent || "") + "=" + (c.querySelector(".eb-stat-value")?.textContent || ""));
    expect(cards).toEqual(["الطلاب=24", "مكتملون=2", "ينتظرون الفحص=3", "بلا تحديث=1"]);
    for (const t of ["تقدّم كل طالب", "مقارنة المسارات", "نسبة إنجاز كل مرحلة", "توزيع الطلاب حسب التقدم", "تطوّر متوسط تقدّم الصف", "توزيع حالات المراحل في الصف"]) expect(screen.getByRole("region", { name: t })).toBeTruthy();
    const n = calls.length;
    const stages = screen.getByRole("region", { name: "نسبة إنجاز كل مرحلة" });
    fireEvent.click(within(within(stages).getByRole("group", { name: "مسار المراحل" })).getByRole("button", { name: "Packet Tracer" }));
    fireEvent.click(within(stages).getByRole("button", { name: "عرض البيانات كجدول" }));
    expect(calls.length).toBe(n);
    fireEvent.click(screen.getByRole("button", { name: "فتح في مساحة المشاريع" }));
    expect(onOpenProject).toHaveBeenCalledWith("794589");
    expect(posts()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /اعتماد/ })).toBeNull();
  });
  it("track report: aria-pressed track buttons + labelled group select drive server params; counts and approved % as progress bars", async () => {
    await mount();
    await open("تقرير المسار");
    pick("المشروع", "794589"); pick("الصف", "c1");
    await screen.findByRole("heading", { level: 3, name: /الحادي عشر/ });
    expect(reportGets("track")[0].url).toBe("/api/reports?type=track&projectCode=794589&classId=c1");
    const sub = screen.getByRole("region", { name: "خيارات تقرير المسار" });
    expect(document.querySelector('[role="tablist"]')).toBeNull();
    fireEvent.click(within(within(sub).getByRole("group", { name: "المسار" })).getByRole("button", { name: "Packet Tracer" }));
    await waitFor(() => expect(reportGets("track")).toHaveLength(2));
    expect(reportGets("track")[1].url).toBe("/api/reports?type=track&projectCode=794589&classId=c1&track=packetTracer");
    await screen.findByText("P01");
    fireEvent.change(within(screen.getByRole("region", { name: "خيارات تقرير المسار" })).getByLabelText("المجموعة"), { target: { value: "g1" } });   // re-query: the result re-mounted after the track fetch
    await waitFor(() => expect(reportGets("track")).toHaveLength(3));
    expect(reportGets("track")[2].url).toBe("/api/reports?type=track&projectCode=794589&classId=c1&track=packetTracer&groupId=g1");
    expect(screen.getByRole("progressbar", { name: "نسبة اعتماد P01" }).getAttribute("aria-valuenow")).toBe("42");
    expect(posts()).toHaveLength(0);
  });
  it("ready report is analysis only: grouped stages per student, total badge, drill link, no approve action and no POST", async () => {
    const onOpenProject = vi.fn();
    await mount(onOpenProject);
    await open("جاهز للفحص");
    pick("المشروع", "794589"); pick("الصف", "c1");
    await screen.findByRole("heading", { level: 3, name: /الحادي عشر/ });
    expect(screen.getByText("1 مرحلة بانتظار الفحص")).toBeTruthy();
    const block = screen.getByRole("region", { name: "زيد صالح" });
    expect(within(block).getAllByRole("cell").map(c => c.textContent)).toEqual(["مقدمة", "الكتاب"]);
    expect(screen.queryByRole("button", { name: /اعتماد/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "فتح في مساحة المشاريع" }));
    expect(onOpenProject).toHaveBeenCalledWith("794589");
    expect(posts()).toHaveLength(0);
  });
  it("delayed report: threshold from the API, reasons as badges, ISO Western-digit dates; timeline: ChartCard + table with the same points", async () => {
    await mount();
    await open("المتأخرون");
    pick("المشروع", "794589"); pick("الصف", "c1");
    await screen.findByRole("heading", { level: 3, name: /الحادي عشر/ });
    expect(resultText()).toContain("عتبة التأخّر حسب إعداد الصف: 40%");
    const row = screen.getByRole("row", { name: /سعد/ });
    expect(within(row).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("12");
    expect(row.textContent).toContain("2026-02-01");
    expect(row.textContent).toContain("بلا تحديث 7+ أيام"); expect(row.textContent).toContain("تقدّم أقل من 40%");
    expect(/[٠-٩]/.test(resultText())).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "عودة إلى كل التقارير" }));
    await open("التقدم الزمني");                                                                    // project + class persist across reports
    await screen.findByRole("region", { name: "متوسط التقدّم الأسبوعي" });
    expect(reportGets("timeline")).toHaveLength(1);
    expect(reportGets("timeline")[0].url).toBe("/api/reports?type=timeline&projectCode=794589&classId=c1");
    const card = screen.getByRole("region", { name: "متوسط التقدّم الأسبوعي" });
    expect(within(card).getByRole("img", { name: "متوسط التقدّم الأسبوعي" }).querySelector("canvas")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "عرض البيانات كجدول" }));
    expect(within(within(card).getByRole("table")).getAllByRole("row").map(r => r.textContent)).toEqual(["الأسبوعمتوسط التقدّم %", "2026-02-2240", "2026-03-0172"]);
    pick("طالب (اختياري)", "s1");
    await waitFor(() => expect(reportGets("timeline")).toHaveLength(2));
    expect(reportGets("timeline")[1].url).toBe("/api/reports?type=timeline&projectCode=794589&classId=c1&studentId=s1");
  });
  it("reduced motion → report charts render with animation:false", async () => {
    window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    await mount();
    await open("التقييمات والواجبات");
    pick("الصف", "c1");
    await screen.findByRole("region", { name: "توزيع النتائج" });
    expect(document.querySelectorAll("canvas[data-animation='false']").length).toBe(1);
    expect(document.querySelector(".eb-chart-card")?.getAttribute("data-reduced-motion")).toBe("true");
  });
  it("error and empty states: report failure → alert with retry (one more GET); empty timeline → EmptyState", async () => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); calls.push({ method: init?.method || "GET", url });
      if (url.includes("type=class&")) return Promise.resolve(json({ ok: false, error: "تعذر تجهيز التقرير حاليًا." }, 500));
      if (url.includes("type=timeline")) return Promise.resolve(json({ ...TIMELINE_REPORT, trend: [] }));
      return Promise.resolve(respond(url));
    }) as unknown as typeof fetch;
    await mount();
    await open("تقرير الصف");
    pick("الصف", "c1");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("تعذر تجهيز التقرير حاليًا.");
    fireEvent.click(within(alert).getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(reportGets("class")).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: "عودة إلى كل التقارير" }));
    await open("التقدم الزمني");
    pick("المشروع", "794589"); pick("الصف", "c1");
    expect(await screen.findByText("لا توجد بيانات زمنية كافية بعد.")).toBeTruthy();
  });
});

describe("UX-6b source guards", () => {
  const RAW = import.meta.glob("./{ReportsCenter,ReportViews,ui,catalog}.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const CSS = import.meta.glob("../reports-pro.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  it("no tablist, no window.confirm, no POST / trackerPost, no p794 classes, no legacy stylesheet; only the frozen CSV labels may carry legacy glyphs", () => {
    for (const [f, src] of Object.entries(RAW)) {
      expect(src, f).not.toMatch(/role="tablist"|window\.confirm|trackerPost|method:\s*"POST"|"p794-|reports\.css|teacher-assignment-heading|platform-eyebrow/);
      const withoutCsvLabels = src.replace(/"(✅ مكتملون|🔵 ينتظرون الفحص|⚠ متأخرون)"/g, '""');
      expect(EMOJI.test(withoutCsvLabels), f + " contains a control/label emoji").toBe(false);
    }
    expect(CSS["../reports-pro.css"]).not.toMatch(/outline\s*:\s*(none|0)/);
  });
});
