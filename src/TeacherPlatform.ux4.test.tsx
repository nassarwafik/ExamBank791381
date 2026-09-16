// @vitest-environment happy-dom
//
// UX-4 — Classes & Students workspace. Drives the REAL TeacherPlatform with a routed fetch mock and pins:
// request-body parity for EVERY class / student / assignment-history mutation, the confirm gating (cancel → no
// request), pending-confirm safety on class change, roster search / filter / sort (aria-sort) / selection /
// bulk bar, the unified Student Dialog with its two entry points (one profile GET each), one active overlay,
// empty states, CSV parity and accessibility source guards.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import TeacherPlatform from "./TeacherPlatform";
import { parseBulkStudents } from "./bulkStudentsParse";

type Student = { userId: string; code: string; identityNumber: string; firstName: string; familyName: string; displayName: string; classId: string; active: boolean; archived: boolean; createdAt: string; updatedAt: string; lastLoginAt: string; submittedAssignmentsCount: number; likesCount: number };
const CLASSES = [
  { classId: "c1", name: "الحادي عشر 3", grade: "11", schoolYear: "2026-2027", programCodes: [] as string[], active: true, status: "active", studentCount: 3, createdAt: "2026-01-03" },
  { classId: "c2", name: "الثاني عشر 8", grade: "12", schoolYear: "2026-2027", programCodes: ["899373"], active: true, status: "active", studentCount: 1, createdAt: "2026-01-02" },
  { classId: "c3", name: "دفعة 2025", grade: "12", schoolYear: "2025-2026", active: false, status: "archived", archiveReason: "graduated", archivedAt: "2026-06-30T00:00:00.000Z", graduationYear: "2025", studentCount: 20, createdAt: "2025-01-01" }
];
const PROJECTS = [{ projectCode: "899373", title: "مشروع الكتاب" }];
const stu = (userId: string, firstName: string, familyName: string, identity: string, classId: string, over: Partial<Student> = {}): Student => ({
  userId, code: identity, identityNumber: identity, firstName, familyName, displayName: firstName + " " + familyName, classId,
  active: true, archived: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0, ...over
});
const S1 = stu("s1", "علي", "حسن", "111111111", "c1", { submittedAssignmentsCount: 2, likesCount: 3, lastLoginAt: "2026-02-01T00:00:00.000Z" });
const S2 = stu("s2", "بسمة", "أحمد", "222222222", "c1", { active: false });
const S3 = stu("s3", "خالد", "زيد", "333333333", "c1", { active: false, archived: true });
const T1 = stu("t1", "نور", "كريم", "444444444", "c2");
const ROSTERS: Record<string, Student[]> = { c1: [S1, S2, S3], c2: [T1], c3: [] };
const PROFILE = {
  ok: true, profile: {
    student: S1, classroom: { classId: "c1", name: "الحادي عشر 3", grade: "11", schoolYear: "2026-2027" },
    stats: { assigned: 4, completed: 2, pending: 2, average: 78, lastLoginAt: "2026-02-01T00:00:00.000Z" },
    assignments: [{ assignmentId: "a1", title: "اختبار الكسور", status: "published", dueAt: "2026-03-01T10:00:00.000Z", totalMarks: 20, attemptsUsed: 1, latestScore: 18, latestPercentage: 90, submittedAt: "2026-02-20T00:00:00.000Z", gradingStatus: "final", finalized: true }],
    submittedAssignmentsCount: 2,
    submittedAssignments: [
      { assignmentId: "a1", title: "اختبار الكسور", submittedAt: "2026-02-20T00:00:00.000Z", latestAttemptNumber: 1, attemptsUsed: 1, allowedAttempts: 1, score: 18, totalMarks: 20, percentage: 90, gradingStatus: "final", finalized: true, isCurrentClassAssignment: true, dueAt: "2026-03-01T10:00:00.000Z", dueAtOverride: null, effectiveDueAt: "2026-03-01T10:00:00.000Z" },
      { assignmentId: "a2", title: "واجب الجبر", submittedAt: "2026-02-22T00:00:00.000Z", latestAttemptNumber: 2, attemptsUsed: 2, allowedAttempts: 2, score: 10, totalMarks: 20, percentage: 50, gradingStatus: "final", finalized: true, isCurrentClassAssignment: true, dueAt: "2026-03-05T10:00:00.000Z", dueAtOverride: "2026-03-09T10:00:00.000Z", effectiveDueAt: "2026-03-09T10:00:00.000Z" }
    ]
  }
};
const PREVIEW = { ok: true, valid: 1, duplicates: 0, invalid: 1, preview: [
  { index: 0, firstName: "ريم", familyName: "صالح", identityNumber: "555555555", status: "valid", error: "" },
  { index: 1, firstName: "", familyName: "خ", identityNumber: "12", status: "invalid", error: "بيانات ناقصة" }
] };

type Call = { url: string; method: string; body: Record<string, unknown> };
let calls: Call[] = [];
function json(data: unknown, status = 200) { return { ok: status < 400, status, json: async () => data } as Response; }
async function routedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input); const method = (init?.method || "GET").toUpperCase();
  let body: Record<string, unknown> = {}; if (init?.body) { try { body = JSON.parse(String(init.body)); } catch { /* ignore */ } }
  calls.push({ url, method, body });
  const action = String(body.action || "");
  if (url.includes("/api/project-tracker")) return json({ ok: true, projects: PROJECTS });
  if (url.includes("/api/classrooms") && method === "GET") return json({ ok: true, classes: CLASSES });
  if (url.includes("/api/classrooms")) return json(action === "create" ? { ok: true, classroom: { classId: "c9", name: body.name, grade: body.grade, schoolYear: body.schoolYear, active: true, status: "active", studentCount: 0, createdAt: "" } } : { ok: true });
  if (url.includes("/api/students?profileUserId=")) return json(PROFILE);
  if (url.includes("/api/students") && method === "GET") { const classId = new URL(url, "http://x").searchParams.get("classId") || ""; return json({ ok: true, students: ROSTERS[classId] || [] }); }
  if (url.includes("/api/students")) {
    if (action === "create") return json({ ok: true, student: stu("s9", String(body.firstName), String(body.familyName), String(body.identityNumber), "c1"), temporaryPassword: "Pw-new-1", rosterSynced: true });
    if (action === "update") return json({ ok: true, student: { ...S1, firstName: String(body.firstName), familyName: String(body.familyName), identityNumber: String(body.identityNumber), classId: String(body.classId) }, passwordChanged: false, rosterSynced: true });
    if (action === "toggleActive") return json({ ok: true, active: false });
    if (action === "archive") return json({ ok: true, archived: true, rosterSynced: true });
    if (action === "unarchive") return json({ ok: true, archived: false, active: true, rosterSynced: true });
    if (action === "delete") return json({ ok: true, deleted: true, rosterSynced: true });
    if (action === "resetPassword") return json({ ok: true, temporaryPassword: "Reset-Pw-9" });
    if (action === "previewImport") return json(PREVIEW);
    if (action === "bulkImport") return json({ ok: true, imported: 1, failed: 0, credentials: [{ userId: "u5", firstName: "ريم", familyName: "صالح", identityNumber: "555555555", code: "555555555", password: "Pw-batch-5" }], errors: [], rosterSynced: true });
    if (action === "bulkAction") return json({ ok: true, processed: 1, failed: 0, credentials: [], errors: [], rosterSynced: true });
  }
  if (url.includes("/api/assignment-results")) return json(action === "allowRetry" ? { ok: true, allowedAttempts: 3 } : { ok: true, dueAtOverride: body.dueAtOverride ?? null });
  return json({ ok: true });
}
beforeEach(() => { calls = []; globalThis.fetch = vi.fn(routedFetch) as unknown as typeof fetch; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function mount() {
  render(<TeacherPlatform token="t" currentExam={null} workspaceTab="students" />);
  await screen.findByText("علي");
  calls = [];
}
const posts = (path: string) => calls.filter(c => c.method === "POST" && c.url.includes(path)).map(c => c.body);
const rowOf = (firstName: string) => screen.getByText(firstName).closest("tr") as HTMLElement;
async function openRowMenu(firstName: string) { fireEvent.click(within(rowOf(firstName)).getByRole("button", { name: /^إجراءات / })); return await screen.findByRole("group", { name: /^إجراءات / }); }
async function rowAction(firstName: string, label: string) { fireEvent.click(within(await openRowMenu(firstName)).getByRole("button", { name: label })); }
const classList = () => document.querySelector(".class-list") as HTMLElement;
const classRow = (name: string) => within(classList()).getByText(name).closest(".class-row") as HTMLElement;
const selectClass = (name: string) => fireEvent.click(within(classList()).getByText(name));
async function classMenu(name: string) { fireEvent.click(within(classRow(name)).getByRole("button", { name: "إجراءات الصف " + name })); return await screen.findByRole("group", { name: "إجراءات الصف " + name }); }
async function confirmDialog(answer: "confirm" | "cancel" = "confirm") {
  const d = await waitFor(() => { const el = document.querySelector('.eb-confirm[role="dialog"]') as HTMLElement | null; if (!el) throw new Error("no confirm dialog yet"); return el; });
  fireEvent.click(answer === "confirm" ? (d.querySelector(".eb-dialog-foot .is-primary, .eb-dialog-foot .is-danger") as HTMLElement) : within(d).getByRole("button", { name: "إلغاء" }));
}
const confirmEl = () => waitFor(() => { const el = document.querySelector('.eb-confirm[role="dialog"]') as HTMLElement | null; if (!el) throw new Error("no confirm dialog yet"); return el; });
const roster = () => screen.getByRole("heading", { level: 2, name: "الحادي عشر 3" }).closest("section") as HTMLElement;
const rowNames = () => Array.from(roster().querySelectorAll("tbody tr td:nth-child(2) strong")).map(x => x.textContent);
const th = (label: string) => screen.getByRole("button", { name: new RegExp("^" + label) }).closest("th") as HTMLElement;

describe("UX-4 request parity — classrooms", () => {
  it("create class (dialog) → POST /api/classrooms {action:create,name,grade,schoolYear}", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "إنشاء صف" }));
    const d = await screen.findByRole("dialog", { name: "إنشاء صف جديد" });
    fireEvent.change(within(d).getByLabelText("اسم الصف"), { target: { value: "العاشر 1" } });
    fireEvent.change(within(d).getByLabelText("المرحلة / الصف"), { target: { value: "العاشر" } });
    fireEvent.change(within(d).getByLabelText("السنة الدراسية"), { target: { value: "2026-2027" } });
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء الصف" }));
    await screen.findByText("✓ تم إنشاء الصف.");
    expect(posts("/api/classrooms")).toEqual([{ action: "create", name: "العاشر 1", grade: "العاشر", schoolYear: "2026-2027" }]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("project toggle → confirm → setPrograms {classId, programCodes} (add keeps the others; remove drops only that code); cancel → no request", async () => {
    await mount();
    let menu = await classMenu("الحادي عشر 3");
    fireEvent.click(within(menu).getByLabelText("مشروع الكتاب"));
    await confirmDialog("cancel");
    expect(posts("/api/classrooms")).toEqual([]);
    menu = await classMenu("الحادي عشر 3");
    fireEvent.click(within(menu).getByLabelText("مشروع الكتاب"));
    expect((await confirmEl()).textContent).toContain('إضافة مشروع الكتاب للصف "الحادي عشر 3"؟');
    await confirmDialog();
    await waitFor(() => expect(posts("/api/classrooms")).toEqual([{ action: "setPrograms", classId: "c1", programCodes: ["899373"] }]));
    calls = [];
    menu = await classMenu("الثاني عشر 8");
    expect((within(menu).getByLabelText("مشروع الكتاب") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(menu).getByLabelText("مشروع الكتاب"));
    expect((await confirmEl()).textContent).toContain("سيتم إخفاء مشروع الكتاب عن هذا الصف.");
    await confirmDialog();
    await waitFor(() => expect(posts("/api/classrooms")).toEqual([{ action: "setPrograms", classId: "c2", programCodes: [] }]));
  });
  it("archive / unarchive / graduateAndArchive keep their messages and bodies; graduation is offered only for grade-12 active classes", async () => {
    await mount();
    let menu = await classMenu("الحادي عشر 3");
    expect(within(menu).queryByRole("button", { name: "تخريج وأرشفة الصف" })).toBeNull();
    fireEvent.click(within(menu).getByRole("button", { name: "أرشفة الصف" }));
    expect((await confirmEl()).textContent).toContain("أرشفة الصف الحادي عشر 3؟");
    await confirmDialog();
    await screen.findByText("✓ تم أرشفة الصف.");
    menu = await classMenu("الثاني عشر 8");
    fireEvent.click(within(menu).getByRole("button", { name: "تخريج وأرشفة الصف" }));
    expect((await confirmEl()).textContent).toContain("سيتم نقل الصف إلى الأرشيف مع الاحتفاظ بجميع الطلاب والواجبات والنتائج.");
    await confirmDialog();
    await screen.findByText("✓ تم تخريج وأرشفة الصف.");
    fireEvent.click(screen.getByRole("button", { name: /الأرشيف/ }));
    menu = await classMenu("دفعة 2025");
    expect(within(menu).queryByLabelText("مشروع الكتاب")).toBeNull();                  // no project toggles on archived classes
    fireEvent.click(within(menu).getByRole("button", { name: "تفعيل" }));
    expect((await confirmEl()).textContent).toContain("إعادة تفعيل الصف دفعة 2025؟");
    await confirmDialog();
    await screen.findByText("✓ تم تفعيل الصف.");
    expect(posts("/api/classrooms")).toEqual([{ action: "archive", classId: "c1" }, { action: "graduateAndArchive", classId: "c2" }, { action: "unarchive", classId: "c3" }]);
  });
});

describe("UX-4 request parity — students", () => {
  it("create (dialog) → {action:create,classId,firstName,familyName,identityNumber,password}; credential box shown, dialog closed", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "إضافة طالب" }));
    const d = await screen.findByRole("dialog", { name: "إضافة طالب" });
    const submit = within(d).getByRole("button", { name: "إنشاء حساب طالب" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(within(d).getByLabelText("الاسم"), { target: { value: "ريم" } });
    fireEvent.change(within(d).getByLabelText("اسم العائلة"), { target: { value: "صالح" } });
    fireEvent.change(within(d).getByLabelText("رقم الهوية"), { target: { value: "55555555x5" } });   // non-digits stripped, 9 max
    expect((within(d).getByLabelText("رقم الهوية") as HTMLInputElement).value).toBe("555555555");
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await screen.findByText("✓ تم إنشاء حساب الطالب. سيستخدم رقم الهوية لتسجيل الدخول.");
    expect(posts("/api/students")).toEqual([{ action: "create", classId: "c1", firstName: "ريم", familyName: "صالح", identityNumber: "555555555", password: "" }]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Pw-new-1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "إخفاء" }));
    expect(screen.queryByText("Pw-new-1")).toBeNull();
  });
  it("update (edit dialog incl. class move) → {action:update,userId,firstName,familyName,identityNumber,classId,password}", async () => {
    await mount();
    await rowAction("علي", "تعديل");
    const d = await screen.findByRole("dialog", { name: "تعديل تفاصيل الطالب" });
    expect(Array.from((within(d).getByLabelText("الصف") as HTMLSelectElement).options).map(o => o.value)).toEqual(["c1", "c2"]); // archived class never a target
    fireEvent.change(within(d).getByLabelText("اسم العائلة"), { target: { value: "حسين" } });
    fireEvent.change(within(d).getByLabelText("الصف"), { target: { value: "c2" } });
    fireEvent.click(within(d).getByRole("button", { name: "حفظ التعديلات" }));
    await screen.findByText("✓ تم تعديل الطالب ونقله إلى الصف المختار.");
    expect(posts("/api/students")).toEqual([{ action: "update", userId: "s1", firstName: "علي", familyName: "حسين", identityNumber: "111111111", classId: "c2", password: "" }]);
  });
  it("toggleActive / archive / unarchive / delete → exact bodies; cancel on delete sends nothing", async () => {
    await mount();
    await rowAction("علي", "تعطيل الحساب");
    await screen.findByText("✓ تم تعطيل حساب الطالب.");
    await rowAction("بسمة", "أرشفة"); await confirmDialog();
    await screen.findByText("✓ تمت أرشفة الطالب مع الاحتفاظ ببياناته.");
    await rowAction("خالد", "استعادة"); await confirmDialog();
    await screen.findByText("✓ تمت استعادة الطالب.");
    await rowAction("علي", "حذف نهائي");
    const d = await confirmEl();
    expect(within(d).getByText(/حذف نهائي/, { selector: "p" }).textContent?.startsWith("⚠️ حذف نهائي\n\nالطالب: علي حسن")).toBe(true);
    expect(d.textContent).toContain("الطالب: علي حسن");
    expect(d.textContent).toContain("استخدم الأرشفة بدل الحذف إذا أردت الاحتفاظ بالحساب.");
    await confirmDialog("cancel");
    expect(posts("/api/students").filter(b => b.action === "delete")).toEqual([]);
    await rowAction("علي", "حذف نهائي"); await confirmDialog();
    await screen.findByText("✓ تم حذف الطالب نهائيًا.");
    expect(posts("/api/students")).toEqual([{ action: "toggleActive", userId: "s1" }, { action: "archive", userId: "s2" }, { action: "unarchive", userId: "s3" }, { action: "delete", userId: "s1" }]);
  });
  it("REGRESSION nested confirm: StudentDialog → كلمة مرور جديدة → ConfirmDialog: only the confirm is exposed; cancel → no request, focus back on the trigger, StudentDialog active again; confirm → exact resetPassword request", async () => {
    await mount();
    const opener = within(rowOf("علي")).getByRole("button", { name: "التفاصيل" }); opener.focus();
    fireEvent.click(opener);
    const d = await screen.findByRole("dialog", { name: "علي حسن" });
    const trigger = within(d).getByRole("button", { name: "كلمة مرور جديدة" }); trigger.focus();
    fireEvent.click(trigger);
    const c = await confirmEl();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);                // both mounted …
    expect(screen.getAllByRole("dialog")).toHaveLength(1);                                // … one exposed
    expect(screen.getByRole("dialog").className).toContain("eb-confirm");
    expect(d.getAttribute("aria-hidden")).toBe("true"); expect(d.hasAttribute("inert")).toBe(true);
    expect(c.contains(document.activeElement)).toBe(true);
    fireEvent.click(within(c).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1));
    expect(posts("/api/students")).toEqual([]);
    expect(document.activeElement).toBe(trigger);                                          // focus returned INSIDE the student dialog
    expect(screen.getByRole("dialog", { name: "علي حسن" })).toBe(d);                       // exposed again
    expect(d.getAttribute("aria-hidden")).toBeNull(); expect(d.hasAttribute("inert")).toBe(false);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });                                        // Escape now targets the student dialog
    await waitFor(() => expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0));
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("");
    // confirm path: the exact existing request
    fireEvent.click(opener);
    const d2 = await screen.findByRole("dialog", { name: "علي حسن" });
    fireEvent.click(within(d2).getByRole("button", { name: "كلمة مرور جديدة" }));
    await confirmDialog();
    await within(d2).findByText("Reset-Pw-9");
    expect(posts("/api/students")).toEqual([{ action: "resetPassword", userId: "s1" }]);
    expect(within(d2).getByRole("status").textContent).toContain("Reset-Pw-9");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
  it("import (dialog): file → previewImport {classId, students} → import → bulkImport {classId, students(valid only)} → credential batch", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "استيراد" }));
    const d = await screen.findByRole("dialog", { name: "استيراد طلاب من ملف" });
    const raw = JSON.stringify([{ firstName: "ريم", familyName: "صالح", identityNumber: "555555555" }, { firstName: "", familyName: "خ", identityNumber: "12" }]);
    const file = new File([raw], "r.json", { type: "application/json" });
    fireEvent.change(d.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    await within(d).findByText("1 صالح · 0 مكرر · 1 غير صالح");
    const preview = d.querySelector("table") as HTMLElement;
    expect(within(preview).getByText("صالح", { selector: ".eb-badge" })).toBeTruthy(); expect(within(preview).getByText("غير صالح", { selector: ".eb-badge" })).toBeTruthy();
    fireEvent.click(within(d).getByRole("button", { name: /استيراد الطلاب الصالحين/ }));
    await screen.findByText("Pw-batch-5");
    const bodies = posts("/api/students");
    expect(bodies[0]).toEqual({ action: "previewImport", classId: "c1", students: parseBulkStudents(raw, "r.json").students }); // the SAME local normalisation as before
    expect(bodies[1]).toEqual({ action: "bulkImport", classId: "c1", students: [{ firstName: "ريم", familyName: "صالح", identityNumber: "555555555" }] });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "إغلاق" }));                       // discard batch → confirm
    await confirmDialog();
    await waitFor(() => expect(screen.queryByText("Pw-batch-5")).toBeNull());
  });
  it("bulkAction: every operation posts {action:bulkAction,operation,userIds,targetClassId}; move needs a target", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("تحديد علي حسن"));
    fireEvent.click(screen.getByLabelText("تحديد بسمة أحمد"));
    const bar = await screen.findByRole("region", { name: "إجراءات جماعية" });
    expect(bar.textContent).toContain("2 طالب محدد");
    expect((within(bar).getByRole("button", { name: "نقل" }) as HTMLButtonElement).disabled).toBe(true);
    const run = async (label: string, confirmNeeded: boolean) => {
      fireEvent.click(within(screen.getByRole("region", { name: "إجراءات جماعية" })).getByRole("button", { name: label }));
      if (confirmNeeded) await confirmDialog();
      await screen.findByText(/نُفذت العملية على 1 طالب/);
      fireEvent.click(screen.getByLabelText("تحديد علي حسن")); fireEvent.click(screen.getByLabelText("تحديد بسمة أحمد"));
      await screen.findByRole("region", { name: "إجراءات جماعية" });
    };
    await run("تفعيل", false); await run("تعطيل", false); await run("أرشفة", true); await run("استعادة", true); await run("كلمات مرور جديدة", true);
    fireEvent.change(within(screen.getByRole("region", { name: "إجراءات جماعية" })).getByLabelText("النقل إلى"), { target: { value: "c2" } });
    await run("نقل", true);
    fireEvent.click(within(screen.getByRole("region", { name: "إجراءات جماعية" })).getByRole("button", { name: "حذف نهائي" }));
    expect((await confirmEl()).className).toContain("tone-danger");
    expect((await confirmEl()).textContent).toContain("⚠️ حذف نهائي لـ 2 طالب؟");
    await confirmDialog();
    await screen.findByText(/نُفذت العملية على 1 طالب/);
    const ops = posts("/api/students").filter(b => b.action === "bulkAction");
    expect(ops.map(b => b.operation)).toEqual(["activate", "deactivate", "archive", "unarchive", "resetpasswords", "move", "delete"]);
    for (const b of ops) { expect(b.userIds).toEqual(["s1", "s2"]); expect(b.targetClassId).toBe(b.operation === "move" || ops.indexOf(b) > 5 ? "c2" : ""); }
    expect(ops[5]).toEqual({ action: "bulkAction", operation: "move", userIds: ["s1", "s2"], targetClassId: "c2" });
  });
});

describe("UX-4 request parity — assignment history (inside the Student Dialog)", () => {
  it("allowRetry, setDueAtOverride (extend) and clear → exact bodies against /api/assignment-results", async () => {
    await mount();
    fireEvent.click(within(rowOf("علي")).getByRole("button", { name: "الوظائف (2)" }));
    const d = await screen.findByRole("dialog", { name: "علي حسن" });
    const history = d.querySelectorAll("table")[1] as HTMLElement;
    const rowA1 = within(history).getByText("اختبار الكسور").closest("tr") as HTMLElement;
    fireEvent.click(within(rowA1).getByRole("button", { name: "محاولة إضافية" }));
    await screen.findByText("✓ تم السماح بمحاولة إضافية.");
    fireEvent.click(within(rowA1).getByRole("button", { name: "تمديد الموعد" }));
    fireEvent.change(within(d).getByLabelText("الموعد الجديد"), { target: { value: "2026-03-20T09:30" } });
    fireEvent.click(within(d).getByRole("button", { name: "حفظ التمديد" }));
    await screen.findByText("✓ تم تمديد الموعد.");
    const rowA2 = within(history).getByText("واجب الجبر").closest("tr") as HTMLElement;
    fireEvent.click(within(rowA2).getByRole("button", { name: "تمديد الموعد" }));
    fireEvent.click(within(d).getByRole("button", { name: "إلغاء التمديد" }));
    await screen.findByText("✓ تم إلغاء التمديد.");
    expect(posts("/api/assignment-results")).toEqual([
      { action: "allowRetry", assignmentId: "a1", studentId: "s1" },
      { action: "setDueAtOverride", assignmentId: "a1", studentId: "s1", dueAtOverride: new Date("2026-03-20T09:30").toISOString() },
      { action: "setDueAtOverride", assignmentId: "a2", studentId: "s1", dueAtOverride: null }
    ]);
  });
});

describe("UX-4 Student Dialog — two entry points, one payload", () => {
  it("التفاصيل opens on the summary; الوظائف opens the SAME dialog on the history section; one profile GET each; no duplicate", async () => {
    await mount();
    const trigger = within(rowOf("علي")).getByRole("button", { name: "التفاصيل" }); trigger.focus();
    fireEvent.click(trigger);
    const d = await screen.findByRole("dialog", { name: "علي حسن" });
    expect(calls.filter(c => c.url.includes("profileUserId=s1"))).toHaveLength(1);
    expect(document.activeElement).toBe(within(d).getByRole("heading", { level: 3, name: "ملخص" }));
    expect(within(d).getByRole("heading", { level: 3, name: "الواجبات وسجل الوظائف" })).toBeTruthy();
    expect(within(d).getByText("ميدالية ذهبية")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    calls = [];
    fireEvent.click(within(rowOf("علي")).getByRole("button", { name: "الوظائف (2)" }));
    const d2 = await screen.findByRole("dialog", { name: "علي حسن" });
    expect(calls.filter(c => c.url.includes("profileUserId=s1"))).toHaveLength(1);
    expect(document.activeElement).toBe(within(d2).getByRole("heading", { level: 3, name: "الواجبات وسجل الوظائف" }));
    expect(within(d2).getByText("واجب الجبر")).toBeTruthy();
  });
  it("only one TeacherPlatform overlay is active at a time (edit replaces profile; class change clears everything incl. a pending confirm)", async () => {
    await mount();
    fireEvent.click(within(rowOf("علي")).getByRole("button", { name: "التفاصيل" }));
    await screen.findByRole("dialog", { name: "علي حسن" });
    fireEvent.keyDown(document, { key: "Escape" });
    await rowAction("علي", "تعديل");
    await screen.findByRole("dialog", { name: "تعديل تفاصيل الطالب" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    selectClass("الثاني عشر 8");
    await screen.findByText("نور");
    expect(screen.queryByRole("dialog")).toBeNull();
    await rowAction("نور", "حذف نهائي");
    await screen.findByRole("dialog");
    selectClass("الحادي عشر 3");
    await screen.findByText("علي");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(posts("/api/students")).toEqual([]);                                             // the pending confirm settled false: no request
  });
});

describe("UX-4 roster — search / filter / sort / selection / states", () => {
  it("default order familyName asc; header buttons sort with aria-sort; toggling flips direction; other keys work", async () => {
    await mount();
    expect(rowNames()).toEqual(["بسمة", "علي", "خالد"]);
    expect(th("اسم العائلة").getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(within(th("اسم العائلة")).getByRole("button"));
    expect(th("اسم العائلة").getAttribute("aria-sort")).toBe("descending");
    expect(rowNames()).toEqual(["خالد", "علي", "بسمة"]);
    fireEvent.click(within(th("الاسم")).getByRole("button"));
    expect(th("الاسم").getAttribute("aria-sort")).toBe("ascending"); expect(th("اسم العائلة").getAttribute("aria-sort")).toBeNull();
    expect(rowNames()).toEqual(["بسمة", "خالد", "علي"]);
    fireEvent.click(within(th("الحالة")).getByRole("button"));
    expect(rowNames()).toEqual(["علي", "خالد", "بسمة"]);                                    // فعّال < مؤرشف < معطّل under localeCompare("ar")
  });
  it("search narrows by name/family/identity; status filter has a real label; no-match empty state", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("ابحث بالاسم، العائلة أو رقم الهوية"), { target: { value: "2222" } });
    expect(rowNames()).toEqual(["بسمة"]);
    fireEvent.change(screen.getByLabelText("ابحث بالاسم، العائلة أو رقم الهوية"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("الحالة"), { target: { value: "archived" } });
    expect(rowNames()).toEqual(["خالد"]);
    fireEvent.change(screen.getByLabelText("ابحث بالاسم، العائلة أو رقم الهوية"), { target: { value: "غير موجود" } });
    expect(screen.getByText("لا توجد نتائج مطابقة.")).toBeTruthy();
  });
  it("select visible / row selection drive the bulk bar; a class change clears the selection; stats come from the roster", async () => {
    await mount();
    expect(Array.from(document.querySelectorAll(".student-admin-stats strong")).map(x => x.textContent)).toEqual(["3", "1", "1", "1", "1"]); // [total, active, disabled, archived, neverLogged (non-archived only)]
    fireEvent.click(screen.getByLabelText("تحديد الكل"));
    expect((await screen.findByRole("region", { name: "إجراءات جماعية" })).textContent).toContain("3 طالب محدد");
    fireEvent.click(screen.getByLabelText("تحديد خالد زيد"));
    expect(screen.getByRole("region", { name: "إجراءات جماعية" }).textContent).toContain("2 طالب محدد");
    fireEvent.click(screen.getByRole("button", { name: "إلغاء التحديد" }));
    expect(screen.queryByRole("region", { name: "إجراءات جماعية" })).toBeNull();
    fireEvent.click(screen.getByLabelText("تحديد علي حسن"));
    await screen.findByRole("region", { name: "إجراءات جماعية" });
    selectClass("الثاني عشر 8");
    await screen.findByText("نور");
    expect(screen.queryByRole("region", { name: "إجراءات جماعية" })).toBeNull();
    selectClass("الحادي عشر 3");
    await screen.findByText("علي");
    expect(within(rowOf("علي")).getByTitle("3 ردّ فعل على إنجازاته").textContent).toContain("3");   // likes value preserved
  });
  it("empty states: no classes, no archived classes, empty roster; notices are live regions; no duplicate hero", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/classrooms") && (init?.method || "GET") === "GET") return json({ ok: true, classes: [] });
      return routedFetch(input, init);
    }) as unknown as typeof fetch;
    render(<TeacherPlatform token="t" currentExam={null} workspaceTab="students" />);
    expect(await screen.findByText("لا توجد صفوف نشطة بعد.")).toBeTruthy();
    expect(screen.getByText("اختر صفًا لإدارة طلابه")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /الأرشيف/ }));
    expect(screen.getByText("لا توجد صفوف مؤرشفة.")).toBeTruthy();
    expect(screen.queryByText("إدارة الطلاب المتقدمة")).toBeNull();
    expect(screen.queryByText("ExamBank 2.0I")).toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    cleanup(); calls = []; globalThis.fetch = vi.fn(routedFetch) as unknown as typeof fetch;
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /الأرشيف/ }));
    selectClass("دفعة 2025");
    expect(await screen.findByText("لا يوجد طلاب في هذا الصف بعد.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("الصف مؤرشف");
  });
});

describe("UX-4 CSV parity", () => {
  it("exports the visible roster with the pre-UX-4 header, order and cell format", async () => {
    await mount();
    let captured: Blob | null = null;
    URL.createObjectURL = vi.fn((b: Blob) => { captured = b; return "blob:x"; }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "المزيد من إجراءات الصف" }));
    fireEvent.click(within(await screen.findByRole("group", { name: "المزيد من إجراءات الصف" })).getByRole("button", { name: "تصدير CSV" }));
    const text = await (captured as unknown as Blob).text();
    const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const fmt = (v: string) => new Date(v).toLocaleString("ar");
    const rows = [
      ["الاسم", "اسم العائلة", "رقم الهوية", "الصف", "الحالة", "آخر دخول"],
      ["بسمة", "أحمد", "222222222", "الحادي عشر 3", "معطّل", "لم يسجل الدخول"],
      ["علي", "حسن", "111111111", "الحادي عشر 3", "فعّال", fmt("2026-02-01T00:00:00.000Z")],
      ["خالد", "زيد", "333333333", "الحادي عشر 3", "مؤرشف", "لم يسجل الدخول"]
    ];
    expect(text).toBe("﻿" + rows.map(r => r.map(q).join(",")).join("\r\n"));
    expect((captured as unknown as Blob).type).toBe("text/csv;charset=utf-8");
  });
});

describe("UX-4 accessibility source guards", () => {
  const RAW = import.meta.glob("./{TeacherPlatform,students/ClassesPane,students/RosterPane,students/StudentDialog,students/BulkActionBar,students/StudentForms,students/ActionMenu}.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  it("no window.confirm, no role=tablist / role=menu, no control emoji, no studentIds reads; meaningful medal/likes semantics kept", () => {
    expect(Object.keys(RAW)).toHaveLength(7);
    for (const [file, src] of Object.entries(RAW)) {
      expect(src, file).not.toMatch(/window\.confirm/);
      expect(src, file).not.toMatch(/role="(tablist|tab|menu|menuitem)"/);
      expect(src, file).not.toMatch(/studentIds/);
      // control emoji that used to label actions: 📡 🎓 📋 💾 📚 📦 👁 🔄 ⏰ ⏳ ↻ (code-point escapes keep the class unambiguous).
      // The ⚠️ prefix of the two locked delete confirmation MESSAGES is content, not a control, and is asserted below.
      expect(src, file).not.toMatch(/[\u{1F4E1}\u{1F393}\u{1F4CB}\u{1F4BE}\u{1F4DA}\u{1F4E6}\u{1F441}\u{1F504}\u{23F0}\u{23F3}\u{21BB}]/u);
      expect(src, file).not.toMatch(/<details|<summary/);
    }
    expect(RAW["./students/RosterPane.tsx"]).toMatch(/IconHeart/);
    expect(RAW["./students/StudentDialog.tsx"]).toMatch(/IconMedal/);
    expect(RAW["./TeacherPlatform.tsx"]).toMatch(/useConfirm\(\)/);
    expect(RAW["./TeacherPlatform.tsx"]).toContain('"⚠️ حذف نهائي\\n\\n"+');                              // single delete: exact original prefix
    expect(RAW["./TeacherPlatform.tsx"]).toContain('question="⚠️ حذف نهائي لـ "+count+" طالب؟');            // bulk delete: exact original prefix
    expect(RAW["./TeacherPlatform.tsx"]).toMatch(/await loadStudents\(classId\);\n  await loadClasses\(\);/);            // sequential single-row fallback
    expect(RAW["./TeacherPlatform.tsx"]).toMatch(/await loadStudents\(sourceClassId\);\n  if\(targetClassId!==sourceClassId\)await loadStudents\(targetClassId\);\n  await loadClasses\(\);/);
  });
});
