// @vitest-environment happy-dom
// Phase S.3 — credentials and dangerous actions in «الصفوف والطلاب», through the REAL TeacherPlatform with a routed fetch:
//   - generated / reset passwords are MASKED until the teacher asks (copy, download and print keep the real value);
//   - an open credential batch never downloaded or printed makes leaving the page ask first (beforeunload) and is reported
//     to App (onCredentialsPendingChange), which asks before a navigation that unmounts the workspace;
//   - a bulk delete unlocks only once the number of students is TYPED (its message is unchanged);
//   - an import keeps ONE retry key per previewed file: a failed attempt can be retried with the same key, a new file gets a
//     new key, and a recovered row is announced.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor, act } from "@testing-library/react";
import TeacherPlatform from "../TeacherPlatform";
import { ConfirmDialog, type ConfirmOptions } from "../ui/ConfirmDialog";

type Student = { userId: string; code: string; identityNumber: string; firstName: string; familyName: string; displayName: string; classId: string; active: boolean; archived: boolean; createdAt: string; updatedAt: string; lastLoginAt: string; submittedAssignmentsCount: number; likesCount: number };
const CLASSES = [
  { classId: "c1", name: "الحادي عشر 3", grade: "11", schoolYear: "2026-2027", active: true, status: "active", studentCount: 2, createdAt: "2026-01-02" },
  { classId: "c2", name: "العاشر 1", grade: "10", schoolYear: "2026-2027", active: true, status: "active", studentCount: 0, createdAt: "2026-01-01" }
];
const stu = (userId: string, firstName: string, familyName: string, identity: string): Student => ({
  userId, code: identity, identityNumber: identity, firstName, familyName, displayName: firstName + " " + familyName, classId: "c1",
  active: true, archived: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0
});
const ROSTERS: Record<string, Student[]> = { c1: [stu("s1", "علي", "حسن", "111111111"), stu("s2", "بسمة", "أحمد", "222222222")], c2: [] };
const PREVIEW = { ok: true, valid: 1, duplicates: 0, invalid: 0, preview: [{ index: 0, firstName: "ريم", familyName: "صالح", identityNumber: "555555555", status: "valid", error: "" }] };
const BATCH = { ok: true, imported: 1, failed: 0, credentials: [{ userId: "u5", firstName: "ريم", familyName: "صالح", identityNumber: "555555555", code: "555555555", password: "Pw-batch-5" }], errors: [], rosterSynced: true };

type Body = Record<string, unknown>;
let posts: Body[] = [];
let importReply: (body: Body, attempt: number) => Promise<Response>;
let importAttempts = 0;
const json = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data } as Response);
async function routedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input); const method = (init?.method || "GET").toUpperCase();
  const body: Body = init?.body ? JSON.parse(String(init.body)) : {};
  if (method === "POST") posts.push(body);
  if (url.includes("/api/project-tracker")) return json({ ok: true, projects: [] });
  if (url.includes("/api/classrooms")) return json({ ok: true, classes: CLASSES });
  if (url.includes("/api/students?profileUserId=")) return json({ ok: true, profile: { student: ROSTERS.c1[0], classroom: { classId: "c1", name: "الحادي عشر 3" }, stats: { assigned: 0, completed: 0, pending: 0, average: null, lastLoginAt: "" }, assignments: [], submittedAssignmentsCount: 0, submittedAssignments: [] } });
  if (url.includes("/api/students") && method === "GET") return json({ ok: true, students: ROSTERS[new URL(url, "http://x").searchParams.get("classId") || ""] || [] });
  if (body.action === "create") return json({ ok: true, student: stu("s9", "ريم", "صالح", "555555555"), temporaryPassword: "Pw-new-1", rosterSynced: true });
  if (body.action === "resetPassword") return json({ ok: true, temporaryPassword: "Reset-Pw-9" });
  if (body.action === "previewImport") return json(PREVIEW);
  if (body.action === "bulkImport") return importReply(body, ++importAttempts);
  if (body.action === "bulkAction") return json({ ok: true, processed: (body.userIds as string[]).length, failed: 0, credentials: [], errors: [], rosterSynced: true });
  return json({ ok: true });
}
let clipboard: string[] = [];
let pending: boolean[] = [];
beforeEach(() => {
  posts = []; clipboard = []; pending = []; importAttempts = 0;
  importReply = async () => json(BATCH);
  globalThis.fetch = vi.fn(routedFetch) as unknown as typeof fetch;
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t: string) => { clipboard.push(t); } } });
  URL.createObjectURL = vi.fn(() => "blob:x") as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function mount() {
  render(<TeacherPlatform token="t" currentExam={null} workspaceTab="students" onCredentialsPendingChange={p => pending.push(p)} />);
  await screen.findByText("علي");
}
async function confirmEl() { return waitFor(() => { const el = document.querySelector('.eb-confirm[role="dialog"]') as HTMLElement | null; if (!el) throw new Error("no confirm"); return el; }); }
async function confirmYes() { fireEvent.click((await confirmEl()).querySelector(".eb-dialog-foot .is-primary, .eb-dialog-foot .is-danger") as HTMLElement); }
async function importOnce(name = "r.json") {
  fireEvent.click(screen.getByRole("button", { name: "استيراد" }));
  const d = await screen.findByRole("dialog", { name: "استيراد طلاب من ملف" });
  fireEvent.change(d.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File([JSON.stringify([{ firstName: "ريم", familyName: "صالح", identityNumber: "555555555" }])], name, { type: "application/json" })] } });
  await within(d).findByText("جاهز للاستيراد");
  return d;
}
const importButton = (d: HTMLElement) => within(d).getByRole("button", { name: /استيراد الطلاب الصالحين/ });
const batchRegion = () => screen.queryByRole("region", { name: "بيانات الدخول الجديدة" });
const beforeUnloadPrevented = () => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };

describe("S.3 — passwords are masked until the teacher asks", () => {
  it("a created student's password: masked, «إظهار كلمة المرور» toggles it (aria-pressed), copy uses the real value", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "إضافة طالب" }));
    const d = await screen.findByRole("dialog");
    fireEvent.change(within(d).getByLabelText("الاسم"), { target: { value: "ريم" } });
    fireEvent.change(within(d).getByLabelText("اسم العائلة"), { target: { value: "صالح" } });
    fireEvent.change(within(d).getByLabelText("رقم الهوية"), { target: { value: "555555555" } });
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء حساب طالب" }));
    const box = await screen.findByRole("region", { name: "بيانات دخول جديدة" });
    expect(within(box).queryByText("Pw-new-1")).toBeNull();
    expect(box.textContent).toContain("••••••••");
    const toggle = within(box).getByRole("button", { name: "إظهار كلمة المرور" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(within(box).getByRole("button", { name: "نسخ بيانات الدخول" }));
    await waitFor(() => expect(clipboard[0]).toContain("كلمة المرور: Pw-new-1"));
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(within(box).getByText("Pw-new-1")).toBeTruthy();
    fireEvent.click(toggle);
    expect(within(box).queryByText("Pw-new-1")).toBeNull();
  });
  it("a batch: masked, shown on request, masked again after another class was selected and this one reselected", async () => {
    await mount();
    fireEvent.click(importButton(await importOnce()));
    const batch = await waitFor(() => { const r = batchRegion(); if (!r) throw new Error("no batch"); return r; });
    expect(within(batch).queryByText("Pw-batch-5")).toBeNull();
    fireEvent.click(within(batch).getByRole("button", { name: "نسخ" }));
    await waitFor(() => expect(clipboard[0]).toContain("Pw-batch-5"));
    fireEvent.click(within(batch).getByRole("button", { name: "إظهار كلمات المرور" }));
    expect(within(batch).getByText("Pw-batch-5")).toBeTruthy();
    fireEvent.click(screen.getByText("العاشر 1"));
    await waitFor(() => expect(batchRegion()).toBeNull());
    fireEvent.click(screen.getByText("الحادي عشر 3"));
    const again = await waitFor(() => { const r = batchRegion(); if (!r) throw new Error("no batch"); return r; });
    expect(within(again).queryByText("Pw-batch-5")).toBeNull();
    expect(within(again).getByRole("button", { name: "إظهار كلمات المرور" }).getAttribute("aria-pressed")).toBe("false");
  });
  it("a reset password in the student dialog: masked until asked; copy uses the real value", async () => {
    await mount();
    fireEvent.click(within(screen.getByText("علي").closest("tr") as HTMLElement).getByRole("button", { name: "التفاصيل" }));
    const d = await screen.findByRole("dialog", { name: "علي حسن" });
    fireEvent.click(within(d).getByRole("button", { name: "كلمة مرور جديدة" }));
    await confirmYes();
    const status = await within(d).findByRole("status");
    await waitFor(() => expect(status.textContent).toContain("••••••••"));
    expect(status.textContent).not.toContain("Reset-Pw-9");
    fireEvent.click(within(status).getByRole("button", { name: "نسخ" }));
    await waitFor(() => expect(clipboard).toEqual(["Reset-Pw-9"]));
    fireEvent.click(within(status).getByRole("button", { name: "إظهار كلمة المرور" }));
    expect(status.textContent).toContain("Reset-Pw-9");
  });
});

describe("S.3 — leaving with a batch that was never saved", () => {
  it("no batch: leaving the page is never held back", async () => {
    await mount();
    expect(beforeUnloadPrevented()).toBe(false);
  });
  for (const [label, saveName] of [["CSV", "تنزيل CSV"], ["JSON", "تنزيل JSON"], ["print", "طباعة بطاقات الدخول"]] as const) {
    it(`an unsaved batch holds leaving (beforeunload + App report) until «${saveName}» took a copy`, async () => {
      const printed = vi.fn();
      // printHtmlDocument prints a hidden iframe; happy-dom's frame window has no print(), so the frame's window is a stand-in.
      if (label === "print") vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockReturnValue({ focus() {}, print: printed, addEventListener() {} } as unknown as Window);
      await mount();
      fireEvent.click(importButton(await importOnce()));
      const batch = await waitFor(() => { const r = batchRegion(); if (!r) throw new Error("no batch"); return r; });
      expect(batch.textContent).toContain("لم تُحفظ بعد");
      await waitFor(() => expect(pending.at(-1)).toBe(true));
      expect(beforeUnloadPrevented()).toBe(true);
      fireEvent.click(within(batch).getByRole("button", { name: saveName }));
      await waitFor(() => expect(pending.at(-1)).toBe(false));
      expect(beforeUnloadPrevented()).toBe(false);
      expect(batchRegion()?.textContent).toContain("✓ حُفظت نسخة منها");
      if (label === "print") await waitFor(() => expect(printed).toHaveBeenCalledTimes(1));
    });
  }
  it("closing the batch (confirmed) releases the hold; a class switch keeps it (the batch is only hidden)", async () => {
    await mount();
    fireEvent.click(importButton(await importOnce()));
    await waitFor(() => expect(pending.at(-1)).toBe(true));
    fireEvent.click(screen.getByText("العاشر 1"));
    await waitFor(() => expect(batchRegion()).toBeNull());
    expect(pending.at(-1)).toBe(true);
    expect(beforeUnloadPrevented()).toBe(true);
    fireEvent.click(screen.getByText("الحادي عشر 3"));
    fireEvent.click(within(await waitFor(() => { const r = batchRegion(); if (!r) throw new Error("no batch"); return r; })).getByRole("button", { name: "إغلاق" }));
    await confirmYes();
    await waitFor(() => expect(pending.at(-1)).toBe(false));
    expect(beforeUnloadPrevented()).toBe(false);
  });
});

describe("S.3 — a bulk delete is typed", () => {
  async function openBulkDelete() {
    await mount();
    fireEvent.click(screen.getByLabelText("تحديد علي حسن"));
    fireEvent.click(screen.getByLabelText("تحديد بسمة أحمد"));
    fireEvent.click(within(await screen.findByRole("region", { name: "إجراءات جماعية" })).getByRole("button", { name: "حذف نهائي" }));
    const c = await confirmEl();
    return { c, lock: c.querySelector(".eb-dialog-foot .is-danger") as HTMLButtonElement, field: within(c).getByLabelText(/اكتب عدد الطلاب/) as HTMLInputElement };
  }
  it("«حذف نهائي» stays locked until the exact count is typed (Arabic-Indic digits count); the message is unchanged", async () => {
    const { c, lock, field } = await openBulkDelete();
    expect(c.textContent).toContain("⚠️ حذف نهائي لـ 2 طالب؟");
    expect(lock.disabled).toBe(true);
    fireEvent.click(lock);
    for (const wrong of ["", "3", "22", "حذف"]) { fireEvent.change(field, { target: { value: wrong } }); expect(lock.disabled).toBe(true); }
    expect(posts.filter(b => b.action === "bulkAction")).toEqual([]);
    fireEvent.change(field, { target: { value: " ٢ " } });
    expect(lock.disabled).toBe(false);
    fireEvent.click(lock);
    await waitFor(() => expect(posts.filter(b => b.action === "bulkAction")).toEqual([{ action: "bulkAction", operation: "delete", userIds: ["s1", "s2"], targetClassId: "" }]));
  });
  it("cancel sends nothing; the next (non-delete) confirmation has no typed field", async () => {
    const { c } = await openBulkDelete();
    fireEvent.click(within(c).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(document.querySelector(".eb-confirm")).toBeNull());
    fireEvent.click(within(screen.getByRole("region", { name: "إجراءات جماعية" })).getByRole("button", { name: "أرشفة" }));
    const next = await confirmEl();
    expect(next.querySelector(".eb-confirm-type")).toBeNull();
    expect((next.querySelector(".eb-dialog-foot .is-primary") as HTMLButtonElement).disabled).toBe(false);
    expect(posts.filter(b => b.action === "bulkAction")).toEqual([]);
  });
  it("ConfirmDialog: a NEW confirmation never inherits the previous one's typed text", () => {
    const a: ConfirmOptions = { message: "a", tone: "danger", typeToConfirm: { label: "اكتب 2", expected: "2" } };
    const b: ConfirmOptions = { ...a, message: "b" };
    const view = render(<ConfirmDialog open options={a} onResolve={() => {}} />);
    fireEvent.change(screen.getByLabelText("اكتب 2"), { target: { value: "2" } });
    expect((document.querySelector(".eb-dialog-foot .is-danger") as HTMLButtonElement).disabled).toBe(false);
    view.rerender(<ConfirmDialog open options={b} onResolve={() => {}} />);
    expect((screen.getByLabelText("اكتب 2") as HTMLInputElement).value).toBe("");
    expect((document.querySelector(".eb-dialog-foot .is-danger") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("S.3 — an import that can be retried safely", () => {
  it("a lost response keeps the preview; the retry sends the SAME key; a recovered row is announced", async () => {
    importReply = async (_b, attempt) => { if (attempt === 1) throw new TypeError("Failed to fetch"); return json({ ...BATCH, recovered: 1, credentials: [{ ...BATCH.credentials[0], recovered: true }] }); };
    await mount();
    const d = await importOnce();
    fireEvent.click(importButton(d));
    await within(d).findByText(/يمكنك إعادة المحاولة بأمان/);
    expect(screen.getByRole("dialog", { name: "استيراد طلاب من ملف" })).toBe(d);                  // preview kept
    expect(within(d).getByText("جاهز للاستيراد")).toBeTruthy();
    fireEvent.click(importButton(d));
    await screen.findByText(/أُنشئت في محاولة سابقة لم يصل ردها، وأُعطيت كلمات مرور جديدة/);
    const sent = posts.filter(b => b.action === "bulkImport");
    expect(sent).toHaveLength(2);
    expect(sent[0].importId).toMatch(/^[A-Za-z0-9-]{16,64}$/);
    expect(sent[1].importId).toBe(sent[0].importId);
  });
  it("after a failed attempt, another file picked in the SAME dialog gets a new key (a key belongs to one preview)", async () => {
    importReply = async (_b, attempt) => { if (attempt === 1) throw new TypeError("Failed to fetch"); return json(BATCH); };
    await mount();
    const d = await importOnce("a.json");
    fireEvent.click(importButton(d));
    await within(d).findByText(/يمكنك إعادة المحاولة بأمان/);
    fireEvent.change(d.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File([JSON.stringify([{ firstName: "ريم", familyName: "صالح", identityNumber: "555555555" }])], "b.json", { type: "application/json" })] } });
    await waitFor(() => expect(posts.filter(b => b.action === "previewImport")).toHaveLength(2));
    await within(d).findByText("جاهز للاستيراد");
    fireEvent.click(importButton(d));
    await waitFor(() => expect(posts.filter(b => b.action === "bulkImport")).toHaveLength(2));
    const [k1, k2] = posts.filter(b => b.action === "bulkImport").map(b => b.importId);
    expect(k1).toMatch(/^[A-Za-z0-9-]{16,64}$/);
    expect(k2).toMatch(/^[A-Za-z0-9-]{16,64}$/);
    expect(k2).not.toBe(k1);
  });
  it("a new preview (another file, or the dialog opened again) gets a new key", async () => {
    await mount();
    fireEvent.click(importButton(await importOnce("a.json")));
    await waitFor(() => expect(batchRegion()).not.toBeNull());
    fireEvent.click(within(batchRegion() as HTMLElement).getByRole("button", { name: "تنزيل CSV" }));
    fireEvent.click(importButton(await importOnce("b.json")));
    await act(async () => { await Promise.resolve(); });
    await confirmYes();                                                                             // replaces the previous batch
    await waitFor(() => expect(posts.filter(b => b.action === "bulkImport")).toHaveLength(2));
    const [k1, k2] = posts.filter(b => b.action === "bulkImport").map(b => b.importId);
    expect(k1).toMatch(/^[A-Za-z0-9-]{16,64}$/); expect(k2).toMatch(/^[A-Za-z0-9-]{16,64}$/);
    expect(k2).not.toBe(k1);
  });
});
