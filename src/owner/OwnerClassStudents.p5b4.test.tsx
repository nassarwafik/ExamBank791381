// @vitest-environment happy-dom
// Tadris+ P5-B4 — against a mocked API (test data only, synthetic 9-digit identities):
//   the owner adds students to a teacher's class from «الصفوف»: one student (the temporary password shown once, with CSV / print), or a
//   list — the file is parsed locally, previewed BY THE SERVER, and only «استيراد» creates the valid rows (one retry key, kept on the
//   second-factor retry);
//   full-teaching v2: the new-teacher wizard offers current preset versions only; the access editor shows a superseded version only
//   for the teacher already on it, labelled «(نسخة سابقة)».
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import OwnerApp from "./OwnerApp";
import OwnerTeachers from "./OwnerTeachers";
import { OWNER_TOKEN_KEY } from "./ownerApi";
import { ownerTeacherHash } from "./ownerRoute";

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => { status: number; body: unknown }> = {};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const SARA = "t_00112233445566aa";
const R1 = "ar_000000001_00112233445566aa";
const VIEW = { ok: true, owner: { accountId: "own_0123456789abcdef", username: "tadris.owner", displayName: "مالك المنصة" }, session: { expiresAt: "2026-11-03T12:00:00.000Z", stepUpValidUntil: null }, recoveryCodesRemaining: 10 };
const PRESETS = [
  { id: "legacy-full", version: 1, label: "الوصول الحالي", description: "كل شيء.", capabilities: ["classes.class.view"], current: true },
  { id: "full-teaching", version: 1, label: "تدريس كامل", description: "الصفوف للمالك.", capabilities: ["classes.class.view"], current: false },
  { id: "full-teaching", version: 2, label: "تدريس كامل مع إدارة الصفوف", description: "والمعلم ينشئ صفوفه.", capabilities: ["classes.class.view", "classes.class.create"], current: true },
  { id: "learning-only", version: 1, label: "التعلّم فقط", description: "المقررات.", capabilities: ["classes.class.view"], current: true }
];
const CAPS = [{ id: "classes.class.view", module: "classes", moduleLabel: "الصفوف", label: "رؤية صفوفه", ownerOnly: false, requires: [] }, { id: "classes.class.create", module: "classes", moduleLabel: "الصفوف", label: "إنشاء صف بنفسه", ownerOnly: false, requires: [] }];
const teacher = (preset: { id: string; version: number }) => ({ accountId: SARA, username: "t.sara", displayName: "سارة", fullName: "", email: "", phone: "", subjects: [], notes: "", organizationId: "default", status: "active", hasPassword: true, invitation: null, createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-02T10:00:00.000Z", lastLoginAt: "", origin: "console", access: { revisionId: R1, preset, grants: 0, denies: 0 }, suspendedAt: "", suspendedReason: "" });
const head = (preset: { id: string; version: number }) => ({ revisionId: R1, parentRevisionId: null, preset, grants: [], denies: [], reason: "", createdAt: "2026-10-01T10:00:00Z", createdBy: "owner:x", valid: true, capabilities: ["classes.class.view"] });
const CLASS = { classId: "c1", name: "الحادي عشر أ", grade: "11", schoolYear: "2026-2027", status: "active", studentCount: 0, programCodes: [], createdAt: "2026-11-01T10:00:00.000Z", archivedAt: "" };

function mount(preset = { id: "full-teaching", version: 1 }) {
  routes = {
    "GET /api/owner-session": () => ({ status: 200, body: VIEW }),
    "GET /api/owner-teachers": () => ({ status: 200, body: { ok: true, teachers: [teacher(preset)] } }),
    "GET /api/owner-access": () => ({ status: 200, body: { ok: true, mode: "enforce", presets: PRESETS, capabilities: CAPS } }),
    ["GET /api/owner-access/history?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, currentRevisionId: R1, truncated: false, limit: 50, entries: [head(preset)] } }),
    ["GET /api/owner-access/effective?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, accountStatus: "active", mode: "enforce", enforced: true, access: { status: "ok", source: "revision", revisionId: R1, preset, capabilities: ["classes.class.view"] } } }),
    ["GET /api/owner-classes?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, classes: [CLASS] } })
  };
}
beforeEach(() => {
  calls = [];
  mount();
  sessionStorage.clear();
  sessionStorage.setItem(OWNER_TOKEN_KEY, "owner-tok");
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const c: Call = { url, method: String(init.method || "GET"), body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    const h = routes[c.method + " " + url];
    if (!h) return json(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
    const r = h(c);
    return json(r.status, r.body);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const posted = (path: string) => calls.filter(c => c.method === "POST" && c.url === path);

async function openStudents() {
  window.location.hash = ownerTeacherHash(SARA);
  render(<OwnerApp />);
  await screen.findByRole("heading", { name: "سارة" });
  fireEvent.click(screen.getByRole("tab", { name: "الصفوف" }));
  const item = await screen.findByRole("listitem", { name: "الحادي عشر أ" });
  fireEvent.click(within(item).getByRole("button", { name: "إضافة طلاب" }));
  return screen.getByRole("region", { name: "طلاب الحادي عشر أ" });
}

describe("P5-B4 the owner adds students to a teacher's class", () => {
  it("one student: required fields checked locally; the temporary password is shown once, with CSV and printable cards", async () => {
    routes["POST /api/owner-classes/add-student"] = () => ({ status: 201, body: { ok: true, student: { userId: "u1", firstName: "ليان", familyName: "سعيد", displayName: "ليان سعيد", identityNumber: "300000001", code: "300000001" }, temporaryPassword: "Tmp-4821" } });
    const panel = await openStudents();
    const form = within(panel).getByRole("form", { name: "إضافة طالب إلى الحادي عشر أ" });
    fireEvent.click(within(form).getByRole("button", { name: "إضافة الطالب" }));
    expect(within(form).getByRole("alert").textContent).toContain("أدخل الاسم الشخصي");
    expect(posted("/api/owner-classes/add-student")).toHaveLength(0);
    fireEvent.change(within(form).getByLabelText("الاسم الشخصي"), { target: { value: "ليان" } });
    fireEvent.change(within(form).getByLabelText("اسم العائلة"), { target: { value: "سعيد" } });
    fireEvent.change(within(form).getByLabelText("رقم الهوية"), { target: { value: "300000001" } });
    fireEvent.click(within(form).getByRole("button", { name: "إضافة الطالب" }));
    const creds = await within(panel).findByRole("group", { name: "كلمات المرور المؤقتة" });
    expect(creds.textContent).toContain("Tmp-4821");
    expect(within(creds).getByRole("button", { name: "تنزيل CSV" })).toBeTruthy();
    expect(within(creds).getByRole("button", { name: "طباعة بطاقات الدخول" })).toBeTruthy();
    expect(posted("/api/owner-classes/add-student")[0].body).toEqual({ classId: "c1", firstName: "ليان", familyName: "سعيد", identityNumber: "300000001" });
  });

  it("a list: parsed locally, previewed by the server; only the valid rows are imported, with ONE retry key kept on the step-up retry", async () => {
    routes["POST /api/owner-classes/preview-import"] = c => ({ status: 200, body: { ok: true, preview: (c.body?.students as Array<Record<string, string>>).map((r, i) => ({ ...r, index: i, status: i === 2 ? "duplicate" : "valid", ...(i === 2 ? { error: "رقم الهوية موجود مسبقًا." } : {}) })), valid: 2, duplicates: 1, invalid: 0 } });
    let n = 0;
    routes["POST /api/owner-classes/import-students"] = c => (++n === 1 ? { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "تحقق" } } : { status: 200, body: { ok: true, imported: 2, failed: 0, duplicates: 0, recovered: 0, errors: [], credentials: (c.body?.students as Array<Record<string, string>>).map((r, i) => ({ ...r, code: r.identityNumber, password: "P-" + i })) } });
    routes["POST /api/owner-session/step-up"] = () => ({ status: 200, body: VIEW });
    const panel = await openStudents();
    const csv = "﻿الاسم,اسم العائلة,رقم الهوية\r\nليان,سعيد,300000001\r\nآدم,ناصر,300000002\r\nسما,حداد,300000003\r\n";
    const file = new File([csv], "students.csv", { type: "text/csv" });
    fireEvent.change(within(panel).getByLabelText("ملف الطلاب"), { target: { files: [file] } });
    expect(await within(panel).findByText(/المعاينة: 2 صالح، 1 مكرر، 0 غير صالح \(من 3\)/)).toBeTruthy();
    expect(posted("/api/owner-classes/import-students")).toHaveLength(0);
    expect((posted("/api/owner-classes/preview-import")[0].body?.students as unknown[]).length).toBe(3);
    fireEvent.click(within(panel).getByRole("button", { name: "استيراد 2 طالبًا" }));
    const stepUp = await screen.findByRole("form", { name: "التحقق بخطوتين" });
    fireEvent.change(within(stepUp).getByRole("textbox"), { target: { value: "123456" } });
    fireEvent.click(within(stepUp).getByRole("button", { name: "تأكيد" }));
    const creds = await within(panel).findByRole("group", { name: "كلمات المرور المؤقتة" });
    expect(creds.textContent).toContain("P-0");
    const sent = posted("/api/owner-classes/import-students");
    expect(sent).toHaveLength(2);
    expect((sent[0].body?.students as Array<{ identityNumber: string }>).map(s => s.identityNumber)).toEqual(["300000001", "300000002"]);
    expect(String(sent[0].body?.importId)).toMatch(/^[A-Za-z0-9-]{16,64}$/);
    expect(sent[1].body).toEqual(sent[0].body);
  });
});

describe("P5-B4 preset versions in the console", () => {
  it("the new-teacher wizard offers current versions only", async () => {
    render(<OwnerTeachers token="owner-tok" onSignedOut={vi.fn()} />);
    await screen.findByRole("list", { name: "المعلمون" });
    await waitFor(() => expect(calls.some(c => c.url === "/api/owner-access")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: /إضافة معلم/ }));
    fireEvent.change(screen.getByLabelText(/^اسم المستخدم/), { target: { value: "t.new" } });
    fireEvent.change(screen.getByLabelText("اسم العرض"), { target: { value: "جديد" } });
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    const select = screen.getByLabelText(/^حزمة الصلاحيات/) as HTMLSelectElement;   // «(اختياري)» only outside enforcement
    const values = [...select.options].map(o => o.value);
    expect(values).toContain("full-teaching@2");
    expect(values).not.toContain("full-teaching@1");
  });
  it("the access editor shows a superseded version only for the teacher already on it, labelled", async () => {
    for (const [preset, shown] of [[{ id: "full-teaching", version: 1 }, true], [{ id: "learning-only", version: 1 }, false]] as const) {
      mount(preset);
      window.location.hash = ownerTeacherHash(SARA);
      const { unmount } = render(<OwnerApp />);
      await screen.findByRole("heading", { name: "سارة" });
      fireEvent.click(screen.getByRole("tab", { name: "الصلاحيات" }));
      const options = within(await screen.findByRole("group", { name: "الحزمة الأساسية" })).getAllByRole("radio").map(r => r.closest("label")?.textContent || "");
      expect(options.some(t => t.includes("تدريس كامل (نسخة سابقة)"))).toBe(shown);
      expect(options.some(t => t.includes("تدريس كامل مع إدارة الصفوف"))).toBe(true);
      unmount();
    }
  });
});
