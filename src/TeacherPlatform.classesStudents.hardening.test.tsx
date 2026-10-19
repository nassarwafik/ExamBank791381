// @vitest-environment happy-dom
//
// Classes & Students hardening — drives the REAL TeacherPlatform with a routed fetch mock. Every "defect" case below was
// reproduced against the baseline before the fix (see the PR); the remaining cases pin the new teacher-facing contract
// (class edit, credential hand-outs, provisional marks, the never-logged filter, dismissible notices).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import TeacherPlatform from "./TeacherPlatform";

type Student = { userId: string; code: string; identityNumber: string; firstName: string; familyName: string; displayName: string; classId: string; active: boolean; archived: boolean; createdAt: string; updatedAt: string; lastLoginAt: string; submittedAssignmentsCount: number; likesCount: number };
const baseClasses = () => [
  { classId: "c1", name: "الحادي عشر 3", grade: "11", schoolYear: "2026-2027", programCodes: [] as string[], active: true, status: "active", studentCount: 3, createdAt: "2026-01-03" },
  { classId: "c2", name: "الثاني عشر 8", grade: "١٢", schoolYear: "2026-2027", programCodes: [] as string[], active: true, status: "active", studentCount: 1, createdAt: "2026-01-02" }
];
let CLASSES = baseClasses();
const stu = (userId: string, firstName: string, familyName: string, identity: string, classId: string, over: Partial<Student> = {}): Student => ({
  userId, code: identity, identityNumber: identity, firstName, familyName, displayName: firstName + " " + familyName, classId,
  active: true, archived: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", lastLoginAt: "2026-02-01T00:00:00.000Z", submittedAssignmentsCount: 0, likesCount: 0, ...over
});
const S1 = stu("s1", "علي", "حسن", "111111111", "c1");
const S2 = stu("s2", "بسمة", "أحمد", "222222222", "c1", { lastLoginAt: "" });
const S3 = stu("s3", "فاطمة", "زيد", "333333333", "c1");
const T1 = stu("t1", "نور", "كريم", "444444444", "c2");
const ROSTERS: Record<string, Student[]> = { c1: [S1, S2, S3], c2: [T1] };
const profileOf = (s: Student, classId = "c1") => ({
  ok: true, profile: {
    student: s, classroom: { classId, name: "صف", grade: "11", schoolYear: "2026-2027" },
    stats: { assigned: 1, completed: 1, pending: 0, average: 60, lastLoginAt: "" },
    assignments: [{ assignmentId: "a1", title: "اختبار الكسور", status: "published", dueAt: "", totalMarks: 20, attemptsUsed: 1, latestScore: 12, latestPercentage: 60, submittedAt: "2026-02-20T00:00:00.000Z", gradingStatus: "pendingReview", finalized: false }],
    submittedAssignmentsCount: 1,
    submittedAssignments: [{ assignmentId: "a1", title: "اختبار الكسور", submittedAt: "2026-02-20T00:00:00.000Z", latestAttemptNumber: 1, attemptsUsed: 1, allowedAttempts: 1, score: 12, totalMarks: 20, percentage: 60, gradingStatus: "pendingReview", finalized: false, isCurrentClassAssignment: true, dueAt: "", dueAtOverride: null, effectiveDueAt: "" }]
  }
});

type Call = { url: string; method: string; body: Record<string, unknown> };
let calls: Call[] = [];
type Override = (url: string, method: string, body: Record<string, unknown>) => Promise<Response> | Response | undefined;
let override: Override | null = null;
function json(data: unknown, status = 200) { return { ok: status < 400, status, json: async () => data } as Response; }
async function routedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input); const method = (init?.method || "GET").toUpperCase();
  let body: Record<string, unknown> = {}; if (init?.body) { try { body = JSON.parse(String(init.body)); } catch { /* ignore */ } }
  calls.push({ url, method, body });
  if (override) { const r = override(url, method, body); if (r) return r; }
  const action = String(body.action || "");
  if (url.includes("/api/project-tracker")) return json({ ok: true, projects: [] });
  if (url.includes("/api/learning-materials-catalog")) return json({ ok: true, courses: [] });
  if (url.includes("/api/classrooms") && method === "GET") return json({ ok: true, classes: CLASSES });
  if (url.includes("/api/classrooms")) return json(action === "update" ? { ok: true, classId: body.classId, changed: true } : { ok: true });
  if (url.includes("/api/students?profileUserId=")) { const id = new URL(url, "http://x").searchParams.get("profileUserId"); const s = [...ROSTERS.c1, ...ROSTERS.c2].find(x => x.userId === id) || S1; return json(profileOf(s)); }
  if (url.includes("/api/students") && method === "GET") { const classId = new URL(url, "http://x").searchParams.get("classId") || ""; return json({ ok: true, students: ROSTERS[classId] || [] }); }
  if (url.includes("/api/students")) {
    if (action === "bulkAction") return json({ ok: true, processed: (body.userIds as string[]).length, failed: 0, credentials: [], errors: [], rosterSynced: true });
    if (action === "bulkImport") return json({ ok: true, imported: 1, failed: 0, credentials: [{ userId: "u5", firstName: "ريم", familyName: "صالح", identityNumber: "555555555", code: "555555555", password: "Pw5batch" }], errors: [], rosterSynced: true });
    if (action === "previewImport") return json({ ok: true, valid: 1, duplicates: 0, invalid: 0, preview: [{ index: 0, firstName: "ريم", familyName: "صالح", identityNumber: "555555555", status: "valid", error: "" }] });
  }
  return json({ ok: true });
}
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => { calls = []; override = null; CLASSES = baseClasses(); globalThis.fetch = vi.fn(routedFetch) as unknown as typeof fetch; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

async function mount(extra: Record<string, unknown> = {}) {
  render(<TeacherPlatform token="t" currentExam={null} workspaceTab="students" {...extra} />);
  await screen.findByText("علي");
  calls = [];
}
const posts = (path: string) => calls.filter(c => c.method === "POST" && c.url.includes(path)).map(c => c.body);
const rowOf = (firstName: string) => screen.getByText(firstName).closest("tr") as HTMLElement;
const classList = () => document.querySelector(".class-list") as HTMLElement;
const selectClass = (name: string) => fireEvent.click(within(classList()).getByText(name));
const bulkBar = () => screen.getByRole("region", { name: "إجراءات جماعية" });
async function confirmDialog() {
  const d = await waitFor(() => { const el = document.querySelector('.eb-confirm[role="dialog"]') as HTMLElement | null; if (!el) throw new Error("no confirm"); return el; });
  fireEvent.click(d.querySelector(".eb-dialog-foot .is-primary, .eb-dialog-foot .is-danger") as HTMLElement);
}
async function openRowMenu(firstName: string) { fireEvent.click(within(rowOf(firstName)).getByRole("button", { name: /^إجراءات / })); return await screen.findByRole("group", { name: /^إجراءات / }); }

describe("defect: stale profile responses", () => {
  it("a slow profile for student A never replaces the profile of student B opened after it", async () => {
    await mount();
    const slow = deferred<Response>();
    override = (url) => url.includes("profileUserId=s1") ? slow.promise : undefined;
    fireEvent.click(within(rowOf("علي")).getByRole("button", { name: "التفاصيل" }));
    fireEvent.click(within(rowOf("بسمة")).getByRole("button", { name: "التفاصيل" }));
    expect(await screen.findByRole("dialog", { name: "بسمة أحمد" })).toBeTruthy();
    await act(async () => { slow.resolve(json(profileOf(S1))); await slow.promise; });
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByRole("dialog", { name: "علي حسن" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "بسمة أحمد" })).toBeTruthy();
  });
  it("a profile response arriving after a class switch never opens over the new class", async () => {
    await mount();
    const slow = deferred<Response>();
    override = (url) => url.includes("profileUserId=s1") ? slow.promise : undefined;
    fireEvent.click(within(rowOf("علي")).getByRole("button", { name: "التفاصيل" }));
    selectClass("الثاني عشر 8");
    await screen.findByText("نور");
    await act(async () => { slow.resolve(json(profileOf(S1))); await slow.promise; });
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByRole("dialog", { name: "علي حسن" })).toBeNull();
  });
});

describe("defect: bulk actions on rows the teacher cannot see", () => {
  it("a search drops hidden rows from the selection; the bulk request carries only visible students", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("تحديد علي حسن"));
    fireEvent.click(screen.getByLabelText("تحديد بسمة أحمد"));
    expect(bulkBar().textContent).toContain("طالبان محددان");
    fireEvent.change(screen.getByLabelText("ابحث بالاسم، العائلة أو رقم الهوية"), { target: { value: "علي" } });
    await waitFor(() => expect(bulkBar().textContent).toContain("طالب واحد محدد"));
    fireEvent.click(within(bulkBar()).getByRole("button", { name: "تعطيل" }));
    await screen.findByText(/نُفذت العملية على طالب واحد/);
    expect(posts("/api/students").find(b => b.action === "bulkAction")?.userIds).toEqual(["s1"]);
  });
  it("the move target chosen in class A is cleared when the teacher switches to that class", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("تحديد علي حسن"));
    fireEvent.change(within(bulkBar()).getByLabelText("النقل إلى"), { target: { value: "c2" } });
    expect((within(bulkBar()).getByRole("button", { name: "نقل" }) as HTMLButtonElement).disabled).toBe(false);
    selectClass("الثاني عشر 8");
    await screen.findByText("نور");
    fireEvent.click(screen.getByLabelText("تحديد نور كريم"));
    expect((within(bulkBar()).getByRole("button", { name: "نقل" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("defect: authoritative reload ordering after bulk actions", () => {
  it("the classes read waits for the roster read (it repairs the count index first); a move also re-reads the target class", async () => {
    await mount();
    const roster = deferred<Response>();
    let held = false;
    override = (url, method) => {
      if (!held && method === "GET" && url.includes("/api/students?classId=c1")) { held = true; return roster.promise; }
      return undefined;
    };
    fireEvent.click(screen.getByLabelText("تحديد علي حسن"));
    fireEvent.change(within(bulkBar()).getByLabelText("النقل إلى"), { target: { value: "c2" } });
    fireEvent.click(within(bulkBar()).getByRole("button", { name: "نقل" }));
    await confirmDialog();
    await waitFor(() => expect(held).toBe(true));
    await new Promise(r => setTimeout(r, 0));
    expect(calls.some(c => c.method === "GET" && c.url.includes("/api/classrooms"))).toBe(false);
    await act(async () => { roster.resolve(json({ ok: true, students: ROSTERS.c1 })); await roster.promise; });
    await screen.findByText(/نُفذت العملية على طالب واحد/);
    const gets = calls.filter(c => c.method === "GET").map(c => c.url.replace(/^.*\/api\//, ""));
    const i1 = gets.findIndex(u => u.startsWith("students?classId=c1")), i2 = gets.findIndex(u => u.startsWith("students?classId=c2")), i3 = gets.findIndex(u => u.startsWith("classrooms"));
    expect(i1).toBeGreaterThanOrEqual(0); expect(i2).toBeGreaterThan(i1); expect(i3).toBeGreaterThan(i2);
  });
});

describe("defect: Arabic search folding", () => {
  it("«احمد» finds «أحمد», «فاطمه» finds «فاطمة», Arabic-Indic digits find the identity", async () => {
    await mount();
    const search = screen.getByLabelText("ابحث بالاسم، العائلة أو رقم الهوية");
    fireEvent.change(search, { target: { value: "احمد" } });
    await waitFor(() => expect(screen.queryByText("علي")).toBeNull());
    expect(screen.getByText("بسمة")).toBeTruthy();
    fireEvent.change(search, { target: { value: "فاطمه" } });
    expect(await screen.findByText("فاطمة")).toBeTruthy();
    fireEvent.change(search, { target: { value: "٣٣٣" } });
    expect(await screen.findByText("فاطمة")).toBeTruthy();
    expect(screen.queryByText("بسمة")).toBeNull();
  });
});

describe("defect: server rejections are shown INSIDE the open dialog", () => {
  it("a 409 on create student is an alert inside the Add Student dialog (not under the backdrop)", async () => {
    await mount();
    override = (url, method, body) => url.includes("/api/students") && method === "POST" && body.action === "create" ? json({ ok: false, error: "رقم الهوية مستخدم مسبقًا للطالب علي حسن" }, 409) : undefined;
    fireEvent.click(screen.getByRole("button", { name: "إضافة طالب" }));
    const d = await screen.findByRole("dialog", { name: "إضافة طالب" });
    fireEvent.change(within(d).getByLabelText("الاسم"), { target: { value: "س" } });
    fireEvent.change(within(d).getByLabelText("اسم العائلة"), { target: { value: "ص" } });
    fireEvent.change(within(d).getByLabelText("رقم الهوية"), { target: { value: "111111111" } });
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء حساب طالب" }));
    const alert = await within(d).findByRole("alert");
    expect(alert.textContent).toContain("رقم الهوية مستخدم مسبقًا");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    fireEvent.click(within(d).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "إضافة طالب" })).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("defect: transport failures", () => {
  it("an authoritative 401 calls the shell logout", async () => {
    const onSessionExpired = vi.fn();
    await mount({ onSessionExpired });
    override = () => json({ ok: false, error: "Unauthorized" }, 401);
    fireEvent.click(within(rowOf("علي")).getByRole("button", { name: "التفاصيل" }));
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
  });
  it("a non-JSON 502 page becomes an Arabic message, never a parser error", async () => {
    await mount();
    override = () => ({ ok: false, status: 502, json: async () => { throw new SyntaxError("Unexpected token '<'"); } } as unknown as Response);
    fireEvent.click(within(rowOf("علي")).getByRole("button", { name: "التفاصيل" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("الخادم غير متاح حاليًا. أعد المحاولة بعد قليل.");
  });
});

describe("defect: graduation and school-year defaults", () => {
  it("a class whose grade is «١٢» offers «تخريج وأرشفة الصف»", async () => {
    await mount();
    const row = within(classList()).getByText("الثاني عشر 8").closest(".class-row") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "إجراءات الصف الثاني عشر 8" }));
    const menu = await screen.findByRole("group", { name: "إجراءات الصف الثاني عشر 8" });
    expect(within(menu).getByRole("button", { name: "تخريج وأرشفة الصف" })).toBeTruthy();
  });
  it("in February the new-class school year defaults to the year that started last autumn", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-02-10T09:00:00.000Z"));
    await mount();
    fireEvent.click(screen.getAllByRole("button", { name: "إنشاء صف" })[0]);
    const d = await screen.findByRole("dialog", { name: "إنشاء صف جديد" });
    expect((within(d).getByLabelText("السنة الدراسية") as HTMLInputElement).value).toBe("2026-2027");
  });
});

describe("defect: provisional marks in the student history", () => {
  it("a mark that is not final is labelled provisional and the status never says «مصحح نهائيًا»", async () => {
    await mount();
    fireEvent.click(within(rowOf("علي")).getByRole("button", { name: "التفاصيل" }));
    const d = await screen.findByRole("dialog", { name: "علي حسن" });
    const history = d.querySelectorAll("table")[1] as HTMLElement;
    const row = within(history).getByText("اختبار الكسور").closest("tr") as HTMLElement;
    expect(row.textContent).toContain("(مبدئية)");
    expect(row.textContent).toContain("بانتظار المراجعة");
    expect(row.textContent).not.toContain("مصحح نهائيًا");
  });
});

describe("new: class details edit", () => {
  it("⋯ → تعديل بيانات الصف → POST {action:update,classId,name,grade,schoolYear}; unchanged values cannot be saved", async () => {
    await mount();
    const row = within(classList()).getByText("الحادي عشر 3").closest(".class-row") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "إجراءات الصف الحادي عشر 3" }));
    const menu = await screen.findByRole("group", { name: "إجراءات الصف الحادي عشر 3" });
    fireEvent.click(within(menu).getByRole("button", { name: "تعديل بيانات الصف" }));
    const d = await screen.findByRole("dialog", { name: "تعديل بيانات الصف" });
    const save = within(d).getByRole("button", { name: "حفظ التغييرات" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(d).getByLabelText("اسم الصف"), { target: { value: "الحادي عشر أ" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await screen.findByText("✓ تم حفظ بيانات الصف.");
    expect(posts("/api/classrooms")).toEqual([{ action: "update", classId: "c1", name: "الحادي عشر أ", grade: "11", schoolYear: "2026-2027" }]);
  });
});

describe("new: credential hand-outs, filters and notices", () => {
  it("after an import the batch offers printable cards and a CSV with the generated passwords", async () => {
    await mount();
    let captured: Blob | null = null;
    URL.createObjectURL = vi.fn((b: Blob) => { captured = b; return "blob:x"; }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "استيراد" }));
    const d = await screen.findByRole("dialog", { name: "استيراد طلاب من ملف" });
    const file = new File([JSON.stringify([{ firstName: "ريم", familyName: "صالح", identityNumber: "555555555" }])], "r.json", { type: "application/json" });
    fireEvent.change(d.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    await within(d).findByText("جاهز للاستيراد");
    fireEvent.click(within(d).getByRole("button", { name: /استيراد الطلاب الصالحين/ }));
    fireEvent.click(await screen.findByRole("button", { name: "إظهار كلمات المرور" }));   // S.3 — masked until asked
    await screen.findByText("Pw5batch");
    expect(screen.getByRole("button", { name: "طباعة بطاقات الدخول" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "تنزيل CSV" }));
    const text = await (captured as unknown as Blob).text();
    expect(text.startsWith("﻿" + '"الاسم","اسم العائلة","الصف","رقم الهوية / الدخول","كلمة المرور"')).toBe(true);
    expect(text).toContain('"ريم","صالح","الحادي عشر 3","555555555","Pw5batch"');
  });
  it("the import dialog offers a CSV template with the recognized Arabic headers", async () => {
    await mount();
    let captured: Blob | null = null;
    URL.createObjectURL = vi.fn((b: Blob) => { captured = b; return "blob:x"; }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "استيراد" }));
    const d = await screen.findByRole("dialog", { name: "استيراد طلاب من ملف" });
    fireEvent.click(within(d).getByRole("button", { name: "تنزيل قالب CSV" }));
    expect(await (captured as unknown as Blob).text()).toBe("﻿الاسم,اسم العائلة,رقم الهوية\r\n");
  });
  it("«لم يدخلوا بعد» filters the roster to students who never logged in", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("الحالة"), { target: { value: "neverLogged" } });
    await waitFor(() => expect(screen.queryByText("علي")).toBeNull());
    expect(screen.getByText("بسمة")).toBeTruthy();
  });
  it("a success notice can be dismissed", async () => {
    await mount();
    await openRowMenu("علي").then(menu => fireEvent.click(within(menu).getByRole("button", { name: "تعطيل الحساب" })));
    await screen.findByText("✓ تم تعطيل حساب الطالب.");
    fireEvent.click(screen.getByRole("button", { name: "إخفاء الرسالة" }));
    expect(screen.queryByText("✓ تم تعطيل حساب الطالب.")).toBeNull();
  });
  it("a long class list gets an Arabic-aware filter", async () => {
    CLASSES = Array.from({ length: 7 }, (_, i) => ({ ...baseClasses()[0], classId: "k" + i, name: i === 3 ? "إعدادي أ" : "صف " + i, createdAt: "2026-01-0" + (i + 1) }));
    render(<TeacherPlatform token="t" currentExam={null} workspaceTab="students" />);
    const filter = await screen.findByLabelText("تصفية الصفوف");
    fireEvent.change(filter, { target: { value: "اعدادي" } });
    await waitFor(() => expect(within(classList()).queryByText("صف 1")).toBeNull());
    expect(within(classList()).getByText("إعدادي أ")).toBeTruthy();
  });
});

describe("visual pass: roster presentation", () => {
  it("the summary strip filters the roster: «لم يدخلوا بعد» shows only those students and is pressed; pressing it again shows all", async () => {
    await mount();
    const strip = screen.getByRole("group", { name: /ملخص الصف/ });
    const never = within(strip).getByRole("button", { name: /لم يدخلوا بعد/ });
    fireEvent.click(never);
    await waitFor(() => expect(screen.queryByText("علي")).toBeNull());
    expect(screen.getByText("بسمة")).toBeTruthy();
    expect(never.getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("الحالة") as HTMLSelectElement).value).toBe("neverLogged");
    fireEvent.click(never);
    expect(await screen.findByText("علي")).toBeTruthy();
    expect(within(strip).getByRole("button", { name: /إجمالي/ }).getAttribute("aria-pressed")).toBe("true");
  });
  it("last login is a relative label with the exact time as its tooltip; a never-logged student says so", async () => {
    await mount();
    const time = rowOf("علي").querySelector("time") as HTMLTimeElement;
    expect(time.getAttribute("dateTime")).toBe("2026-02-01T00:00:00.000Z");
    expect(time.getAttribute("title")).toMatch(/2026/);
    expect(time.textContent).not.toMatch(/:\d\d:\d\d/);
    expect(rowOf("بسمة").textContent).toContain("لم يدخل بعد");
  });
  it("row avatars: a photo is requested once (with its version) only for students who have one; the figure is decorative", async () => {
    const saved = ROSTERS.c1;
    ROSTERS.c1 = [{ ...S1, profilePhoto: { version: 3, updatedAt: "" } } as Student, S2];
    try {
      render(<TeacherPlatform token="t" currentExam={null} workspaceTab="students" />);
      await screen.findByText("علي");
      const photoCalls = () => calls.filter(c => c.url.includes("/api/student-profile-photo"));
      await waitFor(() => expect(photoCalls().length).toBe(1));
      expect(photoCalls()[0].url).toContain("studentId=s1");
      expect(photoCalls()[0].url).toContain("v=3");
      expect(rowOf("علي").querySelector(".eb-row-avatar")?.getAttribute("aria-hidden")).toBe("true");
      expect(rowOf("بسمة").querySelector(".eb-row-avatar")).toBeTruthy();
    } finally { ROSTERS.c1 = saved; }
  });
  it("selected rows are marked; the details action keeps its accessible name; each cell carries its phone label", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("تحديد علي حسن"));
    expect(rowOf("علي").className).toContain("is-selected");
    expect(rowOf("بسمة").className).not.toContain("is-selected");
    expect(within(rowOf("علي")).getByRole("button", { name: "التفاصيل" })).toBeTruthy();
    expect(Array.from(rowOf("علي").querySelectorAll("td[data-label]")).map(td => td.getAttribute("data-label"))).toEqual(["الاسم", "اسم العائلة", "رقم الهوية", "الحالة", "آخر دخول", "الوظائف"]);
  });
  it("while the roster loads, a skeleton with one status line is shown", async () => {
    const roster = deferred<Response>();
    override = (url, method) => method === "GET" && url.includes("/api/students?classId=c1") ? roster.promise : undefined;
    render(<TeacherPlatform token="t" currentExam={null} workspaceTab="students" />);
    const status = await screen.findByText("جارٍ تحميل الطلاب...");
    expect(status.closest(".eb-roster-skeleton")?.getAttribute("role")).toBe("status");
    await act(async () => { roster.resolve(json({ ok: true, students: ROSTERS.c1 })); await roster.promise; });
    expect(await screen.findByText("علي")).toBeTruthy();
    expect(document.querySelector(".eb-roster-skeleton")).toBeNull();
  });
});

describe("visual pass: style contract (page-parts.css)", () => {
  const css = readFileSync(path.join(process.cwd(), "src", "page-parts.css"), "utf8");
  it("the row actions column is pinned, the header is sticky, and phone rows become cards without the legacy 620px minimum", () => {
    expect(css).toMatch(/\.eb-roster-table \.eb-col-actions\{ position:sticky; inset-inline-end:0;/);
    expect(css).toMatch(/\.eb-roster-table thead th\{ position:sticky; top:0;/);
    const phone = css.slice(css.indexOf("@media (max-width:767px)"));
    expect(phone).toContain(".eb-roster-table,.eb-roster-table tbody{ display:block; inline-size:100%; min-inline-size:0; }");
    expect(phone).toContain("td[data-label]::before{ content:attr(data-label);");
    expect(phone).toContain(".eb-bulk-bar.student-bulk-bar{ position:static; }");
  });
  it("class cards are rows again and archived cards keep full opacity", () => {
    expect(css).toContain(".class-row.eb-class-row{ flex-direction:row; }");
    expect(css).toContain(".class-row.eb-class-row.archived{ opacity:1; }");
  });
});
