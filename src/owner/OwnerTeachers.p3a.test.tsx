// @vitest-environment happy-dom
// Tadris+ P3-A — «الصلاحيات» per teacher in the Owner Console against a mocked API (test data only): the assigned preset or the
// account's default is shown; «تغيير الصلاحيات» picks a preset and saves it with the revision the screen was opened on; a
// STEP_UP_REQUIRED answer asks for the code and retries; a conflict is shown as worded.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import OwnerTeachers from "./OwnerTeachers";
import type { ManagedTeacher, AccessPreset } from "./ownerApi";

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => { status: number; body: unknown }> = {};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

beforeEach(() => {
  calls = []; routes = {};
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

const T = (over: Partial<ManagedTeacher> = {}): ManagedTeacher => ({
  accountId: "t_00112233445566aa", username: "t.sara", displayName: "سارة", fullName: "", email: "", phone: "", subjects: [], notes: "", organizationId: "default",
  status: "active", hasPassword: true, invitation: null, createdAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-01T10:00:00Z", lastLoginAt: "", origin: "console", access: null, ...over
});
const PRESETS: AccessPreset[] = [
  { id: "legacy-full", version: 1, label: "الوصول الحالي", description: "كل ما يستطيعه المعلم اليوم.", capabilities: [] },
  { id: "full-teaching", version: 1, label: "تدريس كامل", description: "كل أدوات التدريس.", capabilities: [] },
  { id: "learning-only", version: 1, label: "التعلّم فقط", description: "المقررات فقط.", capabilities: [] }
];
const show = () => render(<OwnerTeachers token="owner-tok" onSignedOut={vi.fn()} />);

describe("P3-A owner — teacher capabilities", () => {
  it("shows the assigned preset, or the default (none for a console account, today's for the imported workspace)", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [
      T(), T({ accountId: "t_legacy", username: "w.nassar", displayName: "وفيق", origin: "shared-password-workspace" }),
      T({ accountId: "t_00112233445566bb", username: "t.omar", displayName: "عمر", access: { revisionId: "ar_000000001_0011223344556677", preset: { id: "learning-only", version: 1 }, grants: 1, denies: 0 } })
    ] } });
    routes["GET /api/owner-access"] = () => ({ status: 200, body: { ok: true, mode: "legacy", presets: PRESETS } });
    show();
    const items = within(await screen.findByRole("list", { name: "المعلمون" })).getAllByRole("listitem");
    const text = (name: string) => items.find(i => i.textContent!.includes(name))!.textContent!;
    expect(await screen.findAllByRole("button", { name: "تغيير الصلاحيات" })).toHaveLength(3);
    expect(text("سارة")).toContain("الصلاحيات: لم تُحدَّد بعد");
    expect(text("وفيق")).toContain("الصلاحيات: الوصول الحالي (افتراضي)");
    expect(text("عمر")).toContain("الصلاحيات: التعلّم فقط (مع تعديلات)");
  });

  it("change → pick a preset → saved with the base revision; the list shows the new preset; nothing is enforced yet (said)", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [T()] } });
    routes["GET /api/owner-access"] = () => ({ status: 200, body: { ok: true, mode: "legacy", presets: PRESETS } });
    routes["POST /api/owner-access/assign"] = () => ({ status: 200, body: { ok: true, accountId: "t_00112233445566aa", access: { revisionId: "ar_000000002_0011223344556677", preset: { id: "full-teaching", version: 1 }, grants: 0, denies: 0 }, capabilities: [] } });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "تغيير الصلاحيات" }));
    const group = screen.getByRole("group", { name: "صلاحيات سارة" });
    expect(group.textContent).toContain("لن يتغير شيء الآن");
    const save = within(group).getByRole("button", { name: "حفظ الصلاحيات" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(within(group).getByRole("radio", { name: /تدريس كامل/ }));
    fireEvent.click(save);
    expect(await screen.findByText("تدريس كامل")).toBeTruthy();
    expect(calls.find(c => c.url === "/api/owner-access/assign")!.body).toEqual({ accountId: "t_00112233445566aa", presetId: "full-teaching", presetVersion: 1, baseRevisionId: null });
    expect(screen.queryByRole("group", { name: "صلاحيات سارة" })).toBeNull();
  });

  it("STEP_UP_REQUIRED asks for the code and retries; a conflict is shown as worded", async () => {
    let stepped = false;
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [T()] } });
    routes["GET /api/owner-access"] = () => ({ status: 200, body: { ok: true, mode: "legacy", presets: PRESETS } });
    routes["POST /api/owner-access/assign"] = () => stepped
      ? { status: 409, body: { ok: false, code: "ACCESS_CONFLICT", error: "تغيّرت صلاحيات هذا المعلم منذ فتحت الصفحة. حدّث الصفحة وأعد المحاولة." } }
      : { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "هذا الإجراء يتطلب إدخال رمز التحقق مرة أخرى." } };
    routes["POST /api/owner-session/step-up"] = () => { stepped = true; return { status: 200, body: { ok: true } }; };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "تغيير الصلاحيات" }));
    fireEvent.click(screen.getByRole("radio", { name: /التعلّم فقط/ }));
    fireEvent.click(screen.getByRole("button", { name: "حفظ الصلاحيات" }));
    fireEvent.change(await screen.findByLabelText(/هذا الإجراء حساس/), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "تأكيد" }));
    expect((await screen.findByRole("alert")).textContent).toContain("تغيّرت صلاحيات هذا المعلم");
    expect(calls.filter(c => c.url === "/api/owner-access/assign")).toHaveLength(2);
  });

  it("without the presets (the access API unavailable) the change button is not offered", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [T()] } });
    show();
    await screen.findByRole("list", { name: "المعلمون" });
    expect(screen.queryByRole("button", { name: "تغيير الصلاحيات" })).toBeNull();
  });
});

describe("P3-B2 owner — a new teacher with a preset", () => {
  it("the add form offers the teaching presets (optional outside enforcement) and sends the choice", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [] } });
    routes["GET /api/owner-access"] = () => ({ status: 200, body: { ok: true, mode: "observe", presets: PRESETS } });
    routes["POST /api/owner-teachers/create"] = () => ({ status: 201, body: { ok: true, teacher: T({ status: "invited", hasPassword: false }), invitation: { invitationPath: "#/invite/" + "A".repeat(43), purpose: "invite", expiresAt: "2026-11-04T10:00:00Z" } } });
    show();
    await screen.findByText(/لا يوجد معلمون/);
    fireEvent.click(screen.getByRole("button", { name: /إضافة معلم/ }));
    const select = await screen.findByLabelText("حزمة الصلاحيات (اختياري)") as HTMLSelectElement;
    expect([...select.options].map(o => o.textContent)).toEqual(["لاحقًا (بلا صلاحيات حتى تختار)", "تدريس كامل", "التعلّم فقط"]);
    fireEvent.change(screen.getByLabelText(/^اسم المستخدم/), { target: { value: "t.sara" } });
    fireEvent.change(screen.getByLabelText("اسم العرض"), { target: { value: "سارة" } });
    fireEvent.change(select, { target: { value: "learning-only@1" } });
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب وإصدار رابط الدعوة" }));
    await screen.findByRole("region", { name: "رابط الدعوة" });
    expect(calls.find(c => c.url === "/api/owner-teachers/create")!.body).toMatchObject({ username: "t.sara", presetId: "learning-only", presetVersion: 1 });
  });
  it("while enforcing the preset is required before anything is sent", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [] } });
    routes["GET /api/owner-access"] = () => ({ status: 200, body: { ok: true, mode: "enforce", presets: PRESETS } });
    show();
    await screen.findByText(/لا يوجد معلمون/);
    fireEvent.click(screen.getByRole("button", { name: /إضافة معلم/ }));
    await screen.findByLabelText("حزمة الصلاحيات");
    fireEvent.change(screen.getByLabelText(/^اسم المستخدم/), { target: { value: "t.sara" } });
    fireEvent.change(screen.getByLabelText("اسم العرض"), { target: { value: "سارة" } });
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب وإصدار رابط الدعوة" }));
    expect((await screen.findByRole("alert")).textContent).toContain("اختر حزمة صلاحيات");
    expect(calls.some(c => c.url === "/api/owner-teachers/create")).toBe(false);
  });
});
