// @vitest-environment happy-dom
// Tadris+ P8-B1a — a tool the teacher's access refuses is not offered INSIDE a page they can open (blueprint §9.1: «لا يرى المعلم
// أدوات لا يملك صلاحيتها»). PRESENTATION ONLY: every one of these actions is still refused by the server (P3-B) — the route map
// route-capabilities.js names the capability each button below waits for. With no access information (an older API) or while the
// owner does not enforce, every tool is offered exactly as before (the other suites, which render without the provider, pin that).
// The first two blocks are FAIL-FIRST proofs (run against the baseline e919763b with only this file and the inert context module
// added): the «learning + ready assignments» teacher was shown «تعذر تحميل الامتحانات المحفوظة» on every visit to the assignments
// page (the page read /api/saved-exams, which needs the builder), its composer opened on «امتحاناتي» (which needs
// assignments.assignment.create) and the Reports Center offered report cards the server refuses. TEST data only.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("react-chartjs-2", () => ({ Bar: () => <canvas />, Line: () => <canvas />, Doughnut: () => <canvas /> }));

import { TeacherAccessContext, canUse } from "./teacherAccessContext";
import AssignmentsPanel from "../AssignmentsPanel";
import ReportsCenter from "../reports/ReportsCenter";
import RosterPane, { type RosterPaneProps } from "../students/RosterPane";
import ClassesPane, { type ClassesPaneProps } from "../students/ClassesPane";
import BulkActionBar from "../students/BulkActionBar";
import TeacherTodayHub, { type TeacherToday } from "../teacher/TeacherTodayHub";
import type { Classroom } from "../students/types";

const enforced = (capabilities: string[]) => ({ status: "ok" as const, enforced: true, capabilities });
const withAccess = (capabilities: string[] | null, ui: ReactNode) => <TeacherAccessContext.Provider value={capabilities ? enforced(capabilities) : null}>{ui}</TeacherAccessContext.Provider>;
const BASE = ["classes.class.view", "students.student.view", "learning.course.view", "reports.widget.view"];
// The «التعلّم + الواجبات الجاهزة» preset's assignment part (api/src/lib/access/presets.js).
const READY = [...BASE, "examLibrary.item.view", "examLibrary.item.preview", "examBank.collection.view", "assignments.assignment.view", "assignments.ready.assign", "assignments.schedule.set", "assignments.grading.grade", "assignments.results.release"];
const FULL_ASSIGN = [...READY, "assignments.assignment.create", "assignments.content.edit", "examBuilder.exam.edit"];

const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, headers: new Headers(), json: async () => body } as Response);
let calls: { url: string; method: string }[] = [];
let assignment: Record<string, unknown>;
const ASSIGNMENT = { assignmentId: "a1", classId: "c1", className: "الحادي عشر", title: "واجب الكسور", instructions: "x", status: "published", openAt: "", dueAt: "2030-01-01T13:00:00.000Z", questionCount: 1, totalMarks: 10, maxAttempts: 1, durationMinutes: 0, attemptPolicy: "continuous" };
const DONE = { studentId: "s2", studentName: "طالب مسلّم", studentCode: "S2", attemptsUsed: 1, allowedAttempts: 1, dueAtOverride: null, attemptStatus: "submitted", timed: false, activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: false, canWrite: false, attempts: [{ attemptNumber: 1, score: 8, totalMarks: 10, percentage: 80, submittedAt: "2026-01-01T10:20:00.000Z", finalized: true, manualReviewMarks: 0, endReason: "submitted" }], latestResult: { attemptNumber: 1, score: 8, totalMarks: 10, percentage: 80, submittedAt: "2026-01-01T10:20:00.000Z", finalized: true, manualReviewMarks: 0, teacherFeedback: "", endReason: "submitted" } };
const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", active: true, status: "active" }];
const DENIED = { ok: false, code: "CAPABILITY_DENIED", error: "لا تملك صلاحية تنفيذ هذا الإجراء." };
function installAssignmentsFetch(savedExamsAllowed: boolean) {
  calls = [];
  (globalThis as { fetch?: unknown }).fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init && init.method) || "GET";
    calls.push({ url, method });
    if (url.startsWith("/api/saved-exams")) return savedExamsAllowed ? json({ ok: true, exams: [] }) : json(DENIED, 403);
    if (url.startsWith("/api/exam-library")) return json({ ok: true, catalog: [] });
    if (url.startsWith("/api/assignment-progress")) return json({ ok: true, progress: [] });
    if (url.startsWith("/api/assignment-results") && method !== "POST") return json({ ok: true, assignment: { ...assignment }, stats: { students: 1, submitted: 1, pendingReview: 0, average: 80, highest: 80, lowest: 80 }, students: [DONE] });
    if (url.startsWith("/api/assignments")) return json({ ok: true, assignments: [assignment] });
    return json({ ok: true });
  }) as unknown as typeof fetch;
}
beforeEach(() => { (window as unknown as { scrollTo: () => void }).scrollTo = () => {}; assignment = ASSIGNMENT; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const settle = () => waitFor(() => expect(calls.some(c => c.url.startsWith("/api/assignment-progress"))).toBe(true));
const mountAssignments = async (capabilities: string[] | null, savedExamsAllowed = true) => {
  installAssignmentsFetch(savedExamsAllowed);
  const r = render(withAccess(capabilities, <AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />));
  await r.findByText("واجب الكسور"); await settle();
  return r;
};
const rowMenu = (r: ReturnType<typeof render>) => within(r.getByText("واجب الكسور").closest("li") as HTMLElement).queryByRole("button", { name: /^إجراءات الواجب/ });

describe("P8-B1a fail-first — the «ready assignments» teacher's assignments page", () => {
  it("the saved-exams list (a builder read) is not requested, so no error is shown on arrival", async () => {
    const r = await mountAssignments(READY, false);
    await new Promise(res => setTimeout(res, 20));
    expect(calls.filter(c => c.url.startsWith("/api/saved-exams"))).toEqual([]);
    expect(r.queryByText(/لا تملك صلاحية|تعذر تحميل الامتحانات المحفوظة/)).toBeNull();
  });
  it("the composer offers the library only, and opens on it", async () => {
    const r = await mountAssignments(READY, false);
    fireEvent.click(r.getByRole("button", { name: /إنشاء واجب/ }));
    const source = await r.findByRole("group", { name: "مصدر محتوى الواجب" });
    expect(within(source).queryByRole("button", { name: "امتحاناتي" })).toBeNull();
    await waitFor(() => expect(within(source).getByRole("button", { name: "مكتبة 791381" }).getAttribute("aria-pressed")).toBe("true"));
    await waitFor(() => expect(calls.some(c => c.url === "/api/exam-library")).toBe(true));
  });
});

describe("P8-B1a fail-first — the Reports Center offers only the reports the server opens", () => {
  const FILTERS = { ok: true, schoolYears: ["2025-2026"], classes: [{ classId: "c1", name: "الحادي عشر", schoolYear: "2025-2026", status: "active", programCodes: [] }], projects: [] };
  const mountReports = (available?: { academic: boolean; projects: boolean }) => {
    (globalThis as { fetch?: unknown }).fetch = vi.fn(() => json({ ...FILTERS, ...(available ? { available } : {}) })) as unknown as typeof fetch;
    return render(<ReportsCenter token="t" />);
  };
  const cardTitles = () => [...document.querySelectorAll(".eb-report-card-title")].map(e => e.textContent);
  it("learning-only (no academic, no projects): the class and student summaries only; no empty category", async () => {
    const r = mountReports({ academic: false, projects: false });
    await waitFor(() => expect(cardTitles()).toEqual(["تقرير الصف", "تقرير الطالب"]));
    expect([...within(r.getByRole("group", { name: "تصنيف التقارير" })).getAllByRole("button")].map(b => b.textContent)).toEqual(["الكل", "الطلاب"]);
  });
  it("academic without projects: the assessments report stays, the project reports go", async () => {
    mountReports({ academic: true, projects: false });
    await waitFor(() => expect(cardTitles()).toEqual(["تقرير الصف", "تقرير الطالب", "التقييمات والواجبات"]));
  });
  it("an older API (no `available`): every report, as before", async () => {
    mountReports();
    await waitFor(() => expect(cardTitles().length).toBe(8));
  });
});

describe("P8-B1a — canUse (the rule every page shares)", () => {
  it("no access information or not enforced → allowed; unavailable → refused; a list → any one of them", () => {
    expect(canUse(null, "x")).toBe(true);
    expect(canUse({ status: "ok", enforced: false, capabilities: [] }, "x")).toBe(true);
    expect(canUse({ status: "unavailable", enforced: true, capabilities: [] }, "x")).toBe(false);
    expect(canUse({ status: "unavailable", enforced: false, capabilities: ["x"] }, "x")).toBe(false);
    expect(canUse(enforced(["b"]), "a")).toBe(false);
    expect(canUse(enforced(["b"]), ["a", "b"])).toBe(true);
    expect(canUse(enforced(["a"]), [])).toBe(false);
  });
});

describe("P8-B1a — the assignments page shows only the actions the teacher's access allows", () => {
  it("full assignment access: «امتحاناتي» is the default source and the saved exams are read (unchanged)", async () => {
    const r = await mountAssignments(FULL_ASSIGN);
    expect(calls.some(c => c.url.startsWith("/api/saved-exams"))).toBe(true);
    fireEvent.click(r.getByRole("button", { name: /إنشاء واجب/ }));
    const source = await r.findByRole("group", { name: "مصدر محتوى الواجب" });
    expect(within(source).getByRole("button", { name: "امتحاناتي" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(source).getByRole("button", { name: "مكتبة 791381" })).toBeTruthy();
  });
  it("own exams but no builder: «امتحاناتي» stays (the open exam), the saved list is not read", async () => {
    const r = await mountAssignments(FULL_ASSIGN.filter(c => c !== "examBuilder.exam.edit"), false);
    expect(calls.filter(c => c.url.startsWith("/api/saved-exams"))).toEqual([]);
    fireEvent.click(r.getByRole("button", { name: /إنشاء واجب/ }));
    expect(within(await r.findByRole("group", { name: "مصدر محتوى الواجب" })).getByRole("button", { name: "امتحاناتي" })).toBeTruthy();
  });
  it("view only (no create, no ready assign, no schedule): no «إنشاء واجب», no action menu", async () => {
    const r = await mountAssignments([...BASE, "assignments.assignment.view"], false);
    expect(r.queryByRole("button", { name: /إنشاء واجب/ })).toBeNull();
    expect(rowMenu(r)).toBeNull();
  });
  it("schedule without content edit: the menu keeps publishing / timing / archive, not «تعديل العنوان والتعليمات»", async () => {
    const r = await mountAssignments(READY, false);
    fireEvent.click(rowMenu(r)!);
    const menu = await r.findByRole("group", { name: /^إجراءات الواجب/ });
    const labels = within(menu).getAllByRole("button").map(b => b.textContent);
    expect(labels).toEqual(["إيقاف النشر", "تعديل عدد المحاولات", "تعديل الوقت والموعد", "أرشفة"]);
  });
  it("content edit without schedule: the menu holds only «تعديل العنوان والتعليمات»", async () => {
    const r = await mountAssignments([...BASE, "assignments.assignment.view", "assignments.content.edit"], false);
    fireEvent.click(rowMenu(r)!);
    const menu = await r.findByRole("group", { name: /^إجراءات الواجب/ });
    expect(within(menu).getAllByRole("button").map(b => b.textContent)).toEqual(["تعديل العنوان والتعليمات"]);
  });
  it("an archived assignment: restore needs schedule, «حذف نهائي» needs create", async () => {
    assignment = { ...ASSIGNMENT, status: "archived" };
    // archived rows live behind the «المؤرشفة» switch
    const archivedMenu = async (caps: string[]) => {
      installAssignmentsFetch(false);
      const r = render(withAccess(caps, <AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />));
      await settle();
      fireEvent.click(await r.findByRole("button", { name: /^المؤرشفة/ }));
      await r.findByText("واجب الكسور");
      const m = within(r.getByText("واجب الكسور").closest("li") as HTMLElement).queryByRole("button", { name: /^إجراءات الواجب/ });
      if (!m) { cleanup(); return null; }
      fireEvent.click(m);
      const labels = within(await r.findByRole("group", { name: /^إجراءات الواجب/ })).getAllByRole("button").map(b => b.textContent);
      cleanup();
      return labels;
    };
    expect(await archivedMenu(READY)).toEqual(["استعادة"]);
    expect(await archivedMenu(FULL_ASSIGN)).toEqual(["استعادة", "حذف نهائي"]);
    expect(await archivedMenu([...BASE, "assignments.assignment.view", "assignments.content.edit"])).toBeNull();
  });
  it("the gradebook without schedule / grading: no student actions, no selection, no marking button; the overview offers no setting", async () => {
    const r = await mountAssignments([...BASE, "assignments.assignment.view"], false);
    fireEvent.click(r.getByRole("button", { name: "فتح" }));
    const row = (await r.findByText("طالب مسلّم")).closest("tr") as HTMLElement;
    expect(within(row).queryByRole("button", { name: /^إجراءات / })).toBeNull();
    expect(within(row).queryByRole("checkbox")).toBeNull();
    expect(within(row).queryByRole("button", { name: /عرض التصحيح|تصحيح الآن/ })).toBeNull();
    expect(r.queryByRole("button", { name: /^إجراءات الواجب/ })).toBeNull();
  });
  it("the overview: each setting follows its capability (schedule → timing / attempts / late policy; content edit → details; release → results)", async () => {
    const overviewButtons = async (caps: string[]) => {
      const r = await mountAssignments(caps, false);
      fireEvent.click(r.getByRole("button", { name: "فتح" }));
      await r.findByText("طالب مسلّم");
      fireEvent.click(r.getByRole("button", { name: "نظرة عامة" }));
      await r.findByText("التعليمات");
      const settings = document.querySelector(".eb-assign-settings-actions");
      const out = { settings: settings ? [...settings.querySelectorAll("button")].map(b => b.textContent) : [], release: !!r.queryByLabelText("متى يرى الطلاب نتائجهم") };
      cleanup();
      return out;
    };
    expect(await overviewButtons([...BASE, "assignments.assignment.view"])).toEqual({ settings: [], release: false });
    expect(await overviewButtons([...BASE, "assignments.assignment.view", "assignments.content.edit"])).toEqual({ settings: ["تعديل العنوان والتعليمات"], release: false });
    expect(await overviewButtons(READY)).toEqual({ settings: ["تعديل الوقت والموعد", "تعديل عدد المحاولات"], release: true });
  });
  it("the gradebook with schedule and grading: the student menu, the selection and the marking button are there", async () => {
    const r = await mountAssignments(READY, false);
    fireEvent.click(r.getByRole("button", { name: "فتح" }));
    const row = (await r.findByText("طالب مسلّم")).closest("tr") as HTMLElement;
    expect(within(row).getByRole("button", { name: /^إجراءات / })).toBeTruthy();
    expect(within(row).getByRole("checkbox")).toBeTruthy();
    expect(within(row).getByRole("button", { name: "عرض التصحيح" })).toBeTruthy();
  });
});

describe("P8-B1a — the students and classes page", () => {
  const cls = (classId: string, name: string): Classroom => ({ classId, name, grade: "11", schoolYear: "2026", active: true, status: "active", studentCount: 1, createdAt: "2026-01-01" } as Classroom);
  const student = { userId: "u1", code: "S1", identityNumber: "123456789", firstName: "ليان", familyName: "خالد", displayName: "ليان خالد", classId: "c1", active: true, archived: false, createdAt: "", updatedAt: "", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0 };
  const noop = () => {};
  const rosterProps = (students = [student]) => ({
    classroom: cls("c1", "الحادي عشر"), classActive: true, students, visibleStudents: students, stats: { total: students.length, active: students.length, disabled: 0, archived: 0, neverLogged: students.length },
    loading: false, busy: false, searchText: "", onSearch: noop, statusFilter: "all", onStatusFilter: noop, sortKey: "firstName", sortAsc: true, onSort: noop,
    selectedIds: [], onToggleSelected: noop, onToggleSelectVisible: noop, onClearSelection: noop, onAddStudent: noop, onImport: noop, onRefresh: noop, onExportCsv: noop,
    onOpenProfile: noop, onOpenHistory: noop, onEdit: noop, onCopyIdentity: noop, onToggleActive: noop, onArchive: noop, onDelete: noop,
    bulk: { targetClasses: [], targetClassId: "", onTargetChange: noop, onAction: noop }, credentialBox: null, onCopyCredentialBox: noop, onHideCredentialBox: noop,
    credentialBatch: null, onToggleBatch: noop, onDownloadBatch: noop, onDiscardBatch: noop, onCopyCredential: noop, bulkErrors: [],
    statusLabel: () => "فعّال", fmtDate: (v: string) => v, splitName: () => ({ firstName: "", familyName: "" }),
  } as unknown as RosterPaneProps);
  const studentMenu = () => { fireEvent.click(screen.getByRole("button", { name: /^إجراءات ليان/ })); return within(screen.getByRole("group", { name: /^إجراءات ليان/ })).getAllByRole("button").map(b => b.textContent); };
  it("view only: no «إضافة طالب» / «استيراد»; the student menu keeps the read-only items", () => {
    render(withAccess(BASE, <RosterPane {...rosterProps()} />));
    expect(screen.queryByRole("button", { name: "إضافة طالب" })).toBeNull();
    expect(screen.queryByRole("button", { name: "استيراد" })).toBeNull();
    const items = studentMenu();
    for (const gone of ["تعديل", "تعطيل الحساب", "أرشفة", "حذف نهائي"]) expect(items, gone).not.toContain(gone);
    expect(items.length).toBeGreaterThan(0);
  });
  it("each tool follows its own capability", () => {
    render(withAccess([...BASE, "students.student.create", "students.student.archive"], <RosterPane {...rosterProps()} />));
    expect(screen.getByRole("button", { name: "إضافة طالب" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "استيراد" })).toBeNull();
    const items = studentMenu();
    expect(items).toContain("أرشفة");
    expect(items).not.toContain("حذف نهائي");
    expect(items).not.toContain("تعديل");
  });
  it("no access information: every tool, as before", () => {
    render(withAccess(null, <RosterPane {...rosterProps()} />));
    for (const name of ["إضافة طالب", "استيراد"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(studentMenu()).toEqual(expect.arrayContaining(["تعديل", "تعطيل الحساب", "أرشفة", "حذف نهائي"]));
  });
  it("an empty class: the empty state offers adding only with students.student.create", () => {
    render(withAccess(BASE, <RosterPane {...rosterProps([])} />));
    expect(screen.queryByRole("button", { name: /إضافة|استيراد/ })).toBeNull();
  });
  it("the bulk bar: only the groups the access allows", () => {
    const bar = (caps: string[]) => { render(withAccess(caps, <BulkActionBar count={2} busy={false} targetClasses={[cls("c2", "العاشر")]} targetClassId="" onTargetChange={noop} onAction={noop} onClear={noop} />)); const g = [...document.querySelectorAll(".eb-bulk-group")].map(e => e.getAttribute("aria-label")); cleanup(); return g; };
    const all = bar(["students.student.edit", "students.student.archive", "students.student.restore", "students.student.move", "students.credential.reset", "students.student.delete"]);
    expect(all.length).toBeGreaterThan(1);
    expect(bar(["students.student.move"])).toEqual([all.find(l => /نقل/.test(String(l)))]);
    expect(bar([])).toEqual([]);
  });
  const paneProps = (extra: Partial<ClassesPaneProps> = {}): ClassesPaneProps => ({ classes: [cls("c1", "الحادي عشر")], view: "active", onViewChange: vi.fn(), activeCount: 1, archivedCount: 0, selectedClassId: "c1", onSelect: vi.fn(), projects: [], projectTitle: c => c, isGraduationEligible: () => true, onToggleProject: vi.fn(), onToggleArchive: vi.fn(), onGraduate: vi.fn(), onCreate: vi.fn(), onRefresh: vi.fn(), onEdit: vi.fn(), loading: false, busy: false, fmtDate: v => v, ...extra });
  it("the classes: «إنشاء صف» needs classes.class.create; editing / graduating / archiving need classes.class.manage", () => {
    render(withAccess(BASE, <ClassesPane {...paneProps()} />));
    expect(screen.queryByRole("button", { name: "إنشاء صف" })).toBeNull();
    const classMenu = () => { const b = screen.queryByRole("button", { name: /^إجراءات الصف/ }); if (!b) return []; fireEvent.click(b); return within(screen.getByRole("group", { name: /^إجراءات الصف/ })).queryAllByRole("button").map(x => x.textContent); };
    expect(classMenu().join("|")).not.toMatch(/تعديل بيانات الصف|تخريج وأرشفة|أرشفة الصف/);
    cleanup();
    render(withAccess([...BASE, "classes.class.create", "classes.class.manage"], <ClassesPane {...paneProps()} />));
    expect(screen.getByRole("button", { name: "إنشاء صف" })).toBeTruthy();
    expect(classMenu().join("|")).toMatch(/أرشفة الصف/);
    cleanup();
    render(withAccess(BASE, <ClassesPane {...paneProps({ classes: [], activeCount: 0 })} />));
    expect(screen.queryByRole("button", { name: "إنشاء صف" })).toBeNull();
  });
});

describe("P8-B1a — «تذكير» on the Today page needs assignments.schedule.set", () => {
  const NOW = "2026-10-16T22:00:00.000Z", inH = (h: number) => new Date(Date.parse(NOW) + h * 3600e3).toISOString();
  const ns = (i: number) => ({ assignmentId: "N" + i, title: "واجب " + i, className: "العاشر", dueAt: "", notStarted: 2, expected: 5 });
  const SUMMARY: TeacherToday = {
    generatedAt: NOW, scope: { activeClasses: 1, students: 5, publishedAssignments: 4 },
    attention: {
      activeAttempts: { count: 0, items: [] },
      notStarted: { count: 10, assignments: 5, items: [ns(1), ns(2), ns(3), ns(4), ns(5)] },
      pendingReview: { count: 0, assignments: 0, items: [] },
      unreadMessages: { total: 0, capped: false },
      dueSoon: { count: 1, items: [{ assignmentId: "D1", title: "واجب الكسور", className: "العاشر", dueAt: inH(5), notSubmitted: 3, expected: 5 }] },
      resultsUnreleased: { count: 1, items: [{ assignmentId: "R1", title: "اختبار الوحدة", className: "العاشر", submitted: 4, dueAt: inH(-24) }] },
      openingSoon: { count: 1, items: [{ assignmentId: "O1", title: "واجب الغد", className: "العاشر", openAt: inH(3), expected: 5 }] }
    },
    recent: [], partial: []
  };
  const mountToday = async (caps: string[] | null) => {
    (globalThis as { fetch?: unknown }).fetch = vi.fn(async () => json({ ok: true, ...SUMMARY })) as unknown as typeof fetch;
    render(withAccess(caps, <TeacherTodayHub token="t" onOpenAssignmentTarget={vi.fn()} onNavigate={vi.fn()} />));
    await screen.findByRole("heading", { level: 3, name: /يُغلق خلال 48 ساعة/ });
  };
  it("without it: no «تذكير»; with it: offered", async () => {
    await mountToday([...BASE, "assignments.assignment.view"]);
    expect(screen.queryByRole("button", { name: /^تذكير من لم يسلّم/ })).toBeNull();
    cleanup();
    await mountToday([...BASE, "assignments.assignment.view", "assignments.schedule.set"]);
    expect(screen.getAllByRole("button", { name: /^تذكير من لم يسلّم/ }).length).toBeGreaterThan(0);
  });
});
