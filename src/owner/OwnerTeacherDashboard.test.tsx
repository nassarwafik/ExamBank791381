// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
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
let respond: (url: string) => { status: number; body: unknown } = () => ({ status: 200, body: answer() });
beforeEach(() => {
  calls = [];
  respond = () => ({ status: 200, body: answer() });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push(url);
    expect((init.headers as Record<string, string>)["x-owner-token"]).toBe("owner-tok");
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
  it("formats the figures", () => {
    expect([pct(null), pct(85.03), pct(78.46), pct(100)]).toEqual(["—", "85%", "78.5%", "100%"]);
    expect(rangeFrom("all", NOW)).toBe("");
    expect(rangeFrom("90", NOW)).toBe(new Date(NOW - 90 * 86400e3).toISOString());
  });
});
