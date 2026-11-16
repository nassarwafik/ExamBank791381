// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
// the canvases are not drawn in tests (no canvas here); OwnerDashboardCharts.test.tsx checks what each chart receives
vi.mock("react-chartjs-2", () => ({ Line: () => <div />, Bar: () => <div />, Doughnut: () => <div /> }));
import OwnerTeacherDashboard from "./OwnerTeacherDashboard";
import { rangeFrom, pct } from "./ownerDashboardFormat";
import { isOwnerLocation, ownerViewFromHash, ownerTeacherFromHash, ownerDashboardFromHash, ownerTeacherDashboardHash } from "./ownerRoute";

// Owner teacher dashboard — phase 2: the full-screen page, its filters, its figures and its states, against a mocked API.
const SARA = "t_00112233445566aa";
const NOW = Date.parse("2026-11-15T12:00:00.000Z");
const answer = (over: Record<string, unknown> = {}) => ({
  ok: true, generatedAt: "2026-11-15T12:00:00.000Z",
  teacher: { accountId: SARA, username: "t.sara", displayName: "سارة", status: "active" },
  scope: { mode: "global", classId: "", className: "كل الصفوف", from: "", to: "" },
  classes: [{ classId: "c1", name: "العاشر أ", grade: "10", schoolYear: "2026", active: true, studentCount: 24 }, { classId: "c2", name: "الحادي عشر", grade: "11", schoolYear: "2026", active: false, studentCount: 18 }],
  kpis: { activeClasses: 1, activeStudents: 42, publishedAssignments: 7, submissions: 250, expectedSubmissions: 294, missingSubmissions: 44, pendingReview: 3, lateSubmissions: 5, completionRate: 85.03, average: 78.46, highest: 100, lowest: 22, performanceChange: -4.2, followUpStudents: 6, neverLogged: 2 },
  submissionStatus: { submitted: 250, missing: 44, pendingReview: 3, late: 5 }, gradeDistribution: [], assignmentTrend: [], classComparison: [], topicAnalytics: [],
  followUp: [], topImprovers: [], insights: [{ tone: "warning", title: "انخفاض في الأداء", text: "تراجع المعدل 4.2%." }], students: [], studentDetail: null, ...over
});

let calls: string[] = [];
// phase 4 — the progress section asks separately (view=progress); its requests are kept apart from the figures' requests
let progressCalls: string[] = [];
const PROGRESS = {
  ok: true, teacher: { accountId: "t_00112233445566aa", username: "t.sara", displayName: "سارة", status: "active" },
  learning: [{ classId: "c1", className: "العاشر أ", courseId: "791381", courseTitle: "أسس علم الحاسوب", students: 24, totalPages: 300, averageRead: 37, startedStudents: 18, completedStudents: 2, modules: [] }],
  projects: [{ classId: "c1", className: "العاشر أ", projectCode: "899373", title: "مشروع الشبكات", studentCount: 24, avgOverall: 81, completedCount: 5, studentsReadyForReview: 3, totalReadyStages: 4, staleCount: 1 }]
};
let respondProgress: () => { status: number; body: unknown } = () => ({ status: 200, body: PROGRESS });
let respond: (url: string) => { status: number; body: unknown } = () => ({ status: 200, body: answer() });
beforeEach(() => {
  calls = [];
  progressCalls = [];
  respond = () => ({ status: 200, body: answer() });
  respondProgress = () => ({ status: 200, body: PROGRESS });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    expect((init.headers as Record<string, string>)["x-owner-token"]).toBe("owner-tok");
    if (url.includes("view=progress")) { progressCalls.push(url); const p = respondProgress(); return { ok: p.status < 300, status: p.status, json: async () => p.body } as unknown as Response; }
    calls.push(url);
    const r = respond(url);
    return { ok: r.status < 300, status: r.status, json: async () => r.body } as unknown as Response;
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const mount = () => {
  const onBack = vi.fn(), onSignedOut = vi.fn();
  render(<OwnerTeacherDashboard token="owner-tok" accountId={SARA} onBack={onBack} onSignedOut={onSignedOut} now={() => NOW} />);
  return { onBack, onSignedOut };
};
const query = (url: string) => Object.fromEntries(new URL(url, "https://x").searchParams);

describe("the address of «لوحة البيانات»", () => {
  it("#/owner/teachers/<id>/dashboard opens that teacher's dashboard; nothing else does", () => {
    const h = ownerTeacherDashboardHash(SARA);
    expect(h).toBe("#/owner/teachers/" + SARA + "/dashboard");
    expect([isOwnerLocation(h), ownerViewFromHash(h), ownerTeacherFromHash(h), ownerDashboardFromHash(h)]).toEqual([true, "teachers", SARA, true]);
    expect(ownerDashboardFromHash("#/owner/teachers/" + SARA)).toBe(false);
    expect(ownerDashboardFromHash("#/owner/teachers/t_legacy/dashboard")).toBe(true);
    for (const bad of ["#/owner/teachers/dashboard", "#/owner/access/dashboard", "#/owner/teachers/" + SARA + "/dashboard/x", "#/owner/teachers/t_XYZ/dashboard"]) {
      expect([bad, isOwnerLocation(bad) && ownerDashboardFromHash(bad)]).toEqual([bad, false]);
    }
  });
});

describe("the full-screen page", () => {
  it("shows the teacher, the headline figures, the insights and the classes", async () => {
    mount();
    expect(await screen.findByRole("heading", { level: 1, name: "لوحة البيانات: سارة" })).toBeTruthy();
    expect(query(calls[0])).toEqual({ accountId: SARA });
    const kpis = screen.getByLabelText("المؤشرات الرئيسية");
    for (const [label, value] of [["الطلاب", "42"], ["نسبة التسليم", "85%"], ["المعدل العام", "78.5%"], ["بانتظار التصحيح", "3"], ["يحتاجون متابعة", "6"], ["لم يدخلوا أبدًا", "2"]]) {
      expect(within(kpis).getByText(label).parentElement!.textContent).toContain(value);
    }
    expect(within(kpis).getByText("↓ 4.2%")).toBeTruthy();
    expect(screen.getByText("انخفاض في الأداء")).toBeTruthy();
    expect(screen.getByRole("rowheader", { name: /العاشر أ/ })).toBeTruthy();
    expect(screen.getByText("t.sara")).toBeTruthy();
  });
  it("the class and the period filters ask the server again; a class row opens that class", async () => {
    mount();
    await screen.findByText("انخفاض في الأداء");
    fireEvent.change(screen.getByRole("combobox", { name: "الصف" }), { target: { value: "c1" } });
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(query(calls[1])).toEqual({ accountId: SARA, classId: "c1" });
    fireEvent.click(screen.getByRole("button", { name: "آخر 30 يومًا" }));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(query(calls[2])).toEqual({ accountId: SARA, classId: "c1", from: rangeFrom("30", NOW) });
    fireEvent.click(await screen.findByRole("button", { name: "عرض الحادي عشر" }));
    await waitFor(() => expect(calls).toHaveLength(4));
    expect(query(calls[3]).classId).toBe("c2");
  });
  it("a refusal shows the server's message and «إعادة المحاولة» asks again; no figure is shown", async () => {
    respond = () => ({ status: 503, body: { ok: false, code: "OWNER_DASHBOARD_UNAVAILABLE", error: "تعذر تحميل لوحة بيانات المعلم حاليًا. حاول مرة أخرى." } });
    mount();
    expect((await screen.findByRole("alert")).textContent).toContain("تعذر تحميل لوحة بيانات المعلم");
    expect(screen.queryByLabelText("المؤشرات الرئيسية")).toBeNull();
    respond = () => ({ status: 200, body: answer() });
    fireEvent.click(screen.getByRole("button", { name: /إعادة المحاولة/ }));
    expect(await screen.findByLabelText("المؤشرات الرئيسية")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("a 401 signs the owner out", async () => {
    respond = () => ({ status: 401, body: { ok: false, code: "OWNER_SESSION_REQUIRED", error: "x" } });
    const { onSignedOut } = mount();
    await waitFor(() => expect(onSignedOut).toHaveBeenCalled());
  });
  it("a teacher without classes gets a clear empty state", async () => {
    respond = () => ({ status: 200, body: answer({ classes: [] }) });
    mount();
    expect(await screen.findByText(/لا توجد صفوف لهذا المعلم بعد/)).toBeTruthy();
  });
  it("«→ المعلمون» and Escape go back", async () => {
    const { onBack } = mount();
    await screen.findByText("انخفاض في الأداء");
    fireEvent.click(screen.getByRole("button", { name: "→ المعلمون" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onBack).toHaveBeenCalledTimes(2);
  });
  it("a follow-up name opens that student's detail (within their class); «→ العودة إلى الصف» leaves it", async () => {
    const lina = { userId: "s1", displayName: "ليان", identityNumber: "", classId: "c1", className: "العاشر أ", average: 48, assigned: 7, completed: 4, missing: 3, completionRate: 57.1, trendDelta: -9, trend: "declining", lastLoginAt: "", severity: "high", reasons: ["معدل منخفض", "3 واجبات غير مسلّمة"] };
    respond = url => {
      const q = query(url);
      if (q.studentId === "s1") return { status: 200, body: answer({ scope: { mode: "student", classId: "c1", className: "العاشر أ", studentId: "s1", studentName: "ليان", from: "", to: "" }, followUp: [], studentDetail: { ...lina, scoreTrend: [], topicAnalytics: [] } }) };
      return { status: 200, body: answer({ followUp: [lina] }) };
    };
    mount();
    expect(await screen.findByRole("heading", { level: 2, name: /طلاب يحتاجون متابعة/ })).toBeTruthy();
    expect(screen.getByText(/معدل منخفض، 3 واجبات غير مسلّمة/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "تفاصيل ليان" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(query(calls[1])).toEqual({ accountId: SARA, classId: "c1", studentId: "s1" });
    expect(await screen.findByRole("heading", { level: 2, name: "الطالب: ليان" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "→ العودة إلى الصف" }));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(query(calls[2])).toEqual({ accountId: SARA, classId: "c1" });
  });
  it("«طباعة» prints the page", async () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /طباعة/ }));
    expect(print).toHaveBeenCalled();
  });
  it("phase 4: the progress in the learning materials and the projects, per class, follows the class filter", async () => {
    mount();
    const section = await screen.findByRole("region", { name: "التقدّم في المواد والمشاريع" });
    await within(section).findByText("37%");
    expect(query(progressCalls[0])).toEqual({ accountId: SARA, view: "progress" });
    const learning = within(section).getByRole("table", { name: "قراءة المواد التعليمية لكل صف" });
    expect(within(learning).getByRole("rowheader").textContent).toContain("أسس علم الحاسوب");
    expect(within(learning).getByText("18 من 24")).toBeTruthy();
    const projects = within(section).getByRole("table", { name: "التقدّم في المشاريع لكل صف" });
    expect(within(projects).getByText("81%")).toBeTruthy();
    expect(within(projects).getByText("5 من 24")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "الصف" }), { target: { value: "c1" } });
    await waitFor(() => expect(progressCalls).toHaveLength(2));
    expect(query(progressCalls[1])).toEqual({ accountId: SARA, view: "progress", classId: "c1" });
  });
  it("phase 4: a progress refusal stays inside its section (the figures above still show) and can be retried", async () => {
    respondProgress = () => ({ status: 503, body: { ok: false, code: "OWNER_DASHBOARD_UNAVAILABLE", error: "تعذر التحميل الآن." } });
    mount();
    const heading = await screen.findByRole("heading", { name: "التقدّم في المواد والمشاريع" });
    const section = heading.closest("section") as HTMLElement;
    expect((await within(section).findByRole("alert")).textContent).toContain("تعذر التحميل الآن.");
    expect(screen.getByLabelText("المؤشرات الرئيسية")).toBeTruthy();
    respondProgress = () => ({ status: 200, body: PROGRESS });
    fireEvent.click(within(section).getByRole("button", { name: "إعادة المحاولة" }));
    expect(await within(section).findByText("37%")).toBeTruthy();
  });
  it("formats the figures", () => {
    expect([pct(null), pct(85.03), pct(78.46), pct(100)]).toEqual(["—", "85%", "78.5%", "100%"]);
    expect(rangeFrom("all", NOW)).toBe("");
    expect(rangeFrom("90", NOW)).toBe(new Date(NOW - 90 * 86400e3).toISOString());
  });
});
