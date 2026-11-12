// @vitest-environment happy-dom
//
// Phase R-5d — easier filters in the Reports Center, through the REAL ReportsCenter with a routed fetch mock. Pinned:
//   - the last year / class / period are remembered on this device and are the starting point of the next visit; a student and
//     hand-typed dates are never written; a remembered class the options no longer offer is dropped BEFORE any request;
//   - a teacher with exactly one class does not have to pick it; with several classes nothing is picked for them;
//   - the active filters are named in words (only those the open report uses) and «إعادة تعيين» clears them and the memory;
//   - an empty report says what it will show; an assessment row opens that exact assignment through the shell's drill;
//   - the loading line keeps its status text and gains decorative placeholders.
// TEST data only.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("react-chartjs-2", () => ({ Bar: () => <canvas />, Line: () => <canvas />, Doughnut: () => <canvas /> }));
import ReportsCenter from "./ReportsCenter";
import { REMEMBER_KEY } from "./filterMemory";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const KEY = "examBankViewPref:" + REMEMBER_KEY;
const CLASSES = [
  { classId: "c1", name: "الحادي عشر", schoolYear: "2025-2026", status: "active", programCodes: ["794589"] },
  { classId: "c2", name: "العاشر", schoolYear: "2025-2026", status: "active", programCodes: [] }
];
const filtersBody = (classes = CLASSES) => ({ ok: true, schoolYears: ["2025-2026", "2024-2025"], classes, projects: [{ projectCode: "794589", title: "مشروع 794589" }], available: { academic: true, projects: true } });
const CLASS_REPORT = (name: string) => ({ ok: true, type: "class", class: { classId: "c1", name, schoolYear: "2025-2026", status: "active", studentCount: 3 }, kpis: { assignments: 1, averageScore: 70, submissionRate: 80, pendingReview: 0 }, projects: [], withheld: [] });
const STUDENT_REPORT = { ok: true, type: "student", student: { studentId: "s1", displayName: "زيد صالح", classId: "c1", className: "الحادي عشر", schoolYear: "2025-2026" }, academic: { average: 60, submittedCount: 1, assessmentCount: 1, submissionRate: 100 }, projects: [], withheld: [] };
const ASSIGN_REPORT = { ok: true, type: "assignments", class: { classId: "c1", name: "الحادي عشر" }, students: [{ studentId: "s1", displayName: "زيد صالح" }],
  overall: { assessmentCount: 2, participants: 2, pendingReview: 1, average: 60, submissionRate: 50, distribution: { "0-49": 0, "50-59": 0, "60-69": 1, "70-79": 0, "80-89": 0, "90-100": 0 } },
  perAssignment: [
    { assignmentId: "a1", title: "اختبار الكسور", students: 4, submitted: 3, missing: 1, pendingReview: 2, zeroScores: 0, submissionRate: 75, average: 60, avgAttempts: 1 },
    { assignmentId: "a2", title: "واجب الجبر", students: 4, submitted: 4, missing: 0, pendingReview: 0, zeroScores: 0, submissionRate: 100, average: 80, avgAttempts: 1 }
  ], matrix: [] };

let calls: string[] = [];
let classes = CLASSES;
let hold: ((type: string | null) => boolean) | null = null;
let released: (() => void)[] = [];
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body } as Response);
beforeEach(() => {
  calls = []; classes = CLASSES; hold = null; released = [];
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input); calls.push(url);
    const u = new URL(url, "http://x"), type = u.searchParams.get("type");
    const body = type === "filters" ? filtersBody(classes) : type === "overview" ? { ok: true, type, overview: null } : type === "classStudents" ? { ok: true, students: [{ studentId: "s1", displayName: "زيد صالح" }] }
      : type === "class" ? CLASS_REPORT(u.searchParams.get("classId") === "c2" ? "العاشر" : "الحادي عشر") : type === "student" ? STUDENT_REPORT : type === "assignments" ? ASSIGN_REPORT : { ok: false };
    if (hold && hold(type)) return new Promise<Response>(resolve => { released.push(() => resolve(json(body))); });
    return Promise.resolve(json(body));
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const gets = (type: string) => calls.filter(c => new URL(c, "http://x").searchParams.get("type") === type);
const mount = (props: Partial<Parameters<typeof ReportsCenter>[0]> = {}) => render(<ReportsCenter token="t" {...props} />);
const open = async (title: string) => { fireEvent.click(await screen.findByRole("button", { name: "فتح التقرير " + title })); await screen.findByRole("heading", { level: 2, name: title }); };
const bar = () => screen.getByRole("region", { name: "مرشحات التقرير" });
const pick = (label: string, value: string) => fireEvent.change(within(bar()).getByLabelText(label), { target: { value } });
const valueOf = (label: string) => (within(bar()).getByLabelText(label) as HTMLSelectElement).value;
const chips = () => within(bar()).queryByRole("list", { name: "المرشحات النشطة" }) ? within(within(bar()).getByRole("list", { name: "المرشحات النشطة" })).getAllByRole("listitem").map(li => li.textContent) : [];
const stored = () => { const raw = localStorage.getItem(KEY); return raw === null ? null : JSON.parse(raw); };

describe("R-5d remembered filters", () => {
  it("the class, year and period chosen in one visit are the starting point of the next — and the report opens on them", async () => {
    const first = mount();
    await open("تقرير الصف");
    pick("السنة الدراسية", "2025-2026"); pick("الصف", "c2"); pick("الفترة الزمنية", "30");
    await screen.findByRole("heading", { level: 3, name: /العاشر/ });
    expect(stored()).toEqual({ schoolYear: "2025-2026", classId: "c2", projectCode: "", period: "30" });
    first.unmount(); calls = [];
    mount();
    await open("تقرير الصف");
    await screen.findByRole("heading", { level: 3, name: /العاشر/ });
    expect([valueOf("السنة الدراسية"), valueOf("الصف"), valueOf("الفترة الزمنية")]).toEqual(["2025-2026", "c2", "30"]);
    const url = new URL(gets("class")[0], "http://x");
    expect([url.searchParams.get("classId"), !!url.searchParams.get("from"), !!url.searchParams.get("to")]).toEqual(["c2", true, true]);   // the period's own dates, computed today
    expect(gets("class")).toHaveLength(1);
  });
  it("a student and hand-typed dates are never written to the device", async () => {
    mount();
    await open("تقرير الطالب");
    pick("الصف", "c1");
    await screen.findByRole("option", { name: "زيد صالح" });
    pick("الطالب", "s1");
    await screen.findByRole("heading", { level: 3, name: "زيد صالح" });
    pick("الفترة الزمنية", "custom");
    fireEvent.change(within(bar()).getByLabelText("من"), { target: { value: "2026-01-01" } });
    await waitFor(() => expect(gets("student").some(c => c.includes("from=2026-01-01"))).toBe(true), { timeout: 2000 });
    expect(stored()).toEqual({ schoolYear: "", classId: "c1", projectCode: "", period: "all" });
    expect(localStorage.getItem(KEY)).not.toMatch(/s1|زيد|2026-01-01|custom/);
  });
  it("a remembered class the options no longer offer is dropped before any request (a stale or foreign id never asks for a report)", async () => {
    localStorage.setItem(KEY, JSON.stringify({ schoolYear: "1999-2000", classId: "someone-elses-class", projectCode: "000000", period: "7" }));
    hold = type => type === "filters";                              // the options arrive late: nothing may be requested before them
    mount();
    await screen.findByRole("group", { name: "تصنيف التقارير" });
    fireEvent.click(screen.getByRole("button", { name: "فتح التقرير تقرير الصف" }));
    await screen.findByRole("heading", { level: 2, name: "تقرير الصف" });
    expect(await screen.findByText("اختر صفًا لعرض تقريره.")).toBeTruthy();
    await new Promise(r => setTimeout(r, 30));
    expect(gets("class")).toHaveLength(0);                           // not on trust, while the options are still loading
    expect(localStorage.getItem(KEY)).toContain("someone-elses-class");   // …and nothing was overwritten before they arrived
    released.forEach(r => r());
    await waitFor(() => expect(within(bar()).getAllByRole("option").length).toBeGreaterThan(3));
    await waitFor(() => expect(stored()).toEqual({ schoolYear: "", classId: "", projectCode: "", period: "7" }));
    expect([valueOf("السنة الدراسية"), valueOf("الصف"), valueOf("الفترة الزمنية")]).toEqual(["", "", "7"]);
    await new Promise(r => setTimeout(r, 30));
    expect(calls.filter(c => c.includes("someone-elses-class") || c.includes("000000") || c.includes("1999-2000"))).toEqual([]);
    expect(gets("class")).toHaveLength(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("a remembered class that IS still offered is restored only when the options arrive — one request, for it", async () => {
    localStorage.setItem(KEY, JSON.stringify({ schoolYear: "", classId: "c2", projectCode: "", period: "all" }));
    hold = type => type === "filters";
    mount();
    await screen.findByRole("group", { name: "تصنيف التقارير" });
    fireEvent.click(screen.getByRole("button", { name: "فتح التقرير تقرير الصف" }));
    await screen.findByRole("heading", { level: 2, name: "تقرير الصف" });
    await new Promise(r => setTimeout(r, 30));
    expect(gets("class")).toHaveLength(0);
    released.forEach(r => r());
    await screen.findByRole("heading", { level: 3, name: /العاشر/ });
    expect(gets("class")).toEqual(["/api/reports?type=class&classId=c2"]);
  });
  it("an options reply without its lists (a partial or older reply) offers nothing: no crash, the remembered ids are dropped", async () => {
    localStorage.setItem(KEY, JSON.stringify({ schoolYear: "2025-2026", classId: "c1", projectCode: "794589", period: "all" }));
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => { calls.push(String(input)); return Promise.resolve(json(String(input).includes("type=filters") ? { ok: true, classes: [] } : { ok: true, type: "overview", overview: null })); }) as unknown as typeof fetch;
    mount();
    await screen.findByRole("group", { name: "تصنيف التقارير" });
    await waitFor(() => expect(stored()).toBeNull());                // nothing valid left to remember
    expect(screen.getAllByRole("button", { name: /^فتح التقرير / }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(calls.filter(c => c.includes("classId="))).toEqual([]);
  });
  it("the options fail to load: what was remembered is kept for the next visit", async () => {
    localStorage.setItem(KEY, JSON.stringify({ schoolYear: "", classId: "c2", projectCode: "", period: "30" }));
    globalThis.fetch = vi.fn(() => Promise.resolve(json({ ok: false, error: "تعذر تحميل بيانات التقارير." }, 500))) as unknown as typeof fetch;
    mount();
    await screen.findByRole("alert");
    await new Promise(r => setTimeout(r, 30));
    expect(stored()).toEqual({ schoolYear: "", classId: "c2", projectCode: "", period: "30" });
  });
});

describe("R-5d the only class is chosen for the teacher", () => {
  it("exactly one class: opening a class report shows it at once (no pick)", async () => {
    classes = [CLASSES[0]];
    mount();
    await open("تقرير الصف");
    await screen.findByRole("heading", { level: 3, name: /الحادي عشر/ });
    expect(valueOf("الصف")).toBe("c1");
    expect(gets("class").map(c => c.replace(/&?(from|to)=[^&]*/g, ""))).toEqual(["/api/reports?type=class&classId=c1"]);
  });
  it("clearing it by hand is respected (it is not chosen again behind the teacher's back)", async () => {
    classes = [CLASSES[0]];
    mount();
    await open("تقرير الصف");
    await screen.findByRole("heading", { level: 3, name: /الحادي عشر/ });
    pick("الصف", "");
    expect(await screen.findByText("اختر صفًا لعرض تقريره.")).toBeTruthy();
    await new Promise(r => setTimeout(r, 20));
    expect(valueOf("الصف")).toBe("");
  });
  it("several classes: nothing is chosen, nothing is requested", async () => {
    mount();
    await open("تقرير الصف");
    expect(await screen.findByText("اختر صفًا لعرض تقريره.")).toBeTruthy();
    expect(valueOf("الصف")).toBe("");
    expect(gets("class")).toHaveLength(0);
  });
});

describe("R-5d active filters, reset, guidance", () => {
  it("names the filters in force — only those this report uses — and «إعادة تعيين» clears them and the memory", async () => {
    mount();
    await open("تقرير الصف");
    expect(chips()).toEqual([]);
    expect(within(bar()).queryByRole("button", { name: "إعادة تعيين" })).toBeNull();
    pick("السنة الدراسية", "2025-2026"); pick("الصف", "c1"); pick("الفترة الزمنية", "30");
    await screen.findByRole("heading", { level: 3, name: /الحادي عشر/ });
    expect(chips()).toEqual(["السنة الدراسية: 2025-2026", "الصف: الحادي عشر", "الفترة: آخر 30 يومًا"]);
    fireEvent.click(within(bar()).getByRole("button", { name: "إعادة تعيين" }));
    expect(await screen.findByText("اختر صفًا لعرض تقريره.")).toBeTruthy();
    expect([valueOf("السنة الدراسية"), valueOf("الصف"), valueOf("الفترة الزمنية")]).toEqual(["", "", "all"]);
    expect(chips()).toEqual([]);
    await waitFor(() => expect(stored()).toBeNull());
  });
  it("a project chosen earlier is not named on a report that does not use it; the student is named on the student report", async () => {
    mount();
    await open("تقرير المشروع");
    pick("المشروع", "794589"); pick("الصف", "c1");
    expect(chips()).toEqual(["المشروع: مشروع 794589", "الصف: الحادي عشر"]);
    fireEvent.click(screen.getByRole("button", { name: "عودة إلى كل التقارير" }));
    await open("تقرير الطالب");
    await screen.findByRole("option", { name: "زيد صالح" });
    pick("الطالب", "s1");
    await screen.findByRole("heading", { level: 3, name: "زيد صالح" });
    expect(chips()).toEqual(["الصف: الحادي عشر", "الطالب: زيد صالح"]);
  });
  it("an empty report says what it will show", async () => {
    mount();
    await open("تقرير الصف");
    expect((await screen.findByText("اختر صفًا لعرض تقريره.")).closest(".eb-empty")!.textContent).toContain("سيعرض التقرير أرقام الصف");
    fireEvent.click(screen.getByRole("button", { name: "عودة إلى كل التقارير" }));
    await open("تقرير المشروع");
    expect((await screen.findByText("اختر مشروعًا وصفًا.")).closest(".eb-empty")!.textContent).toContain("اختر المشروع أولًا لتظهر صفوفه");
  });
  it("the loading line keeps its status text and gains decorative placeholders (hidden from assistive technology)", async () => {
    hold = type => type === "class";
    mount();
    await open("تقرير الصف");
    pick("الصف", "c1");
    const status = await screen.findByText("جارٍ تجهيز التقرير...");
    expect(status.getAttribute("role")).toBe("status");
    const skeleton = status.nextElementSibling as HTMLElement;
    expect([skeleton.className, skeleton.getAttribute("aria-hidden"), skeleton.children.length]).toEqual(["eb-report-skeleton", "true", 3]);
    released.forEach(r => r());
    await screen.findByRole("heading", { level: 3, name: /الحادي عشر/ });
    expect(document.querySelector(".eb-report-skeleton")).toBeNull();
  });
});

describe("R-5d from an assessment row to its gradebook", () => {
  const openAssessments = async (onOpenAssignment?: (t: unknown) => void) => { mount(onOpenAssignment ? { onOpenAssignment: onOpenAssignment as never } : {}); await open("التقييمات والواجبات"); pick("الصف", "c1"); await screen.findByRole("heading", { level: 3, name: "ملخص كل تقييم" }); return screen.getAllByRole("table").find(t => t.querySelector("caption")?.textContent?.startsWith("ملخص كل تقييم")) as HTMLElement; };
  it("each row opens that exact assignment; «بانتظار التصحيح» and «لم يسلّم» only where there are any — identifiers and intent only", async () => {
    const onOpen = vi.fn();
    const per = await openAssessments(onOpen);
    expect(within(per).getAllByRole("columnheader").map(h => h.textContent).at(-1)).toBe("فتح");
    const row = (title: string) => within(per).getByRole("rowheader", { name: title }).closest("tr") as HTMLElement;
    expect(within(row("اختبار الكسور")).getAllByRole("button").map(b => b.textContent)).toEqual(["دفتر الدرجات — اختبار الكسور", "بانتظار التصحيح (2) — اختبار الكسور", "لم يسلّم (1) — اختبار الكسور"]);
    expect(within(row("واجب الجبر")).getAllByRole("button").map(b => b.textContent)).toEqual(["دفتر الدرجات — واجب الجبر"]);
    const n = calls.length;
    fireEvent.click(within(row("اختبار الكسور")).getByRole("button", { name: /^دفتر الدرجات/ }));
    fireEvent.click(within(row("اختبار الكسور")).getByRole("button", { name: /^بانتظار التصحيح/ }));
    fireEvent.click(within(row("اختبار الكسور")).getByRole("button", { name: /^لم يسلّم/ }));
    expect(onOpen.mock.calls.map(c => c[0])).toEqual([{ assignmentId: "a1", mode: "assignment" }, { assignmentId: "a1", mode: "pendingReview" }, { assignmentId: "a1", mode: "notSubmitted" }]);
    expect(calls.length).toBe(n);                                    // the Reports Center itself requests nothing
  });
  it("the shell hands the Reports Center its ONE assignment drill (pin: App stays the navigation authority)", () => {
    const app = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf8");
    expect(app).toContain("<ReportsCenter token={token} onOpenProject={goToProjects} onOpenAssignment={openAssignmentTarget} onSessionExpired={handleLogout} />");
  });
  it("without the shell's drill the table has no «فتح» column and no row button", async () => {
    const per = await openAssessments();
    expect(within(per).getAllByRole("columnheader").map(h => h.textContent)).not.toContain("فتح");
    expect(within(per).queryByRole("button", { name: /دفتر الدرجات/ })).toBeNull();
  });
});
