// @vitest-environment happy-dom
// Tadris+ P2-A2b — «المعلمون» in the Owner Console against a mocked P2-A2a API (test data only):
//   list → create (validation, the one-time invitation link + QR + copy) → per-teacher actions with an inline confirmation for the
//   disruptive ones → STEP_UP_REQUIRED asks for the code and retries → a 401 signs the owner out. The owner token travels only in
//   x-owner-token.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import OwnerTeachers from "./OwnerTeachers";
import { invitationUrl, type ManagedTeacher } from "./ownerApi";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => { status: number; body: unknown }> = {};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

beforeEach(() => {
  calls = []; routes = {};
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const c: Call = { url, method: String(init.method || "GET"), headers: (init.headers || {}) as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined };
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
  status: "active", hasPassword: true, invitation: null, createdAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-01T10:00:00Z", lastLoginAt: "", ...over
});
const LINK = { invitationPath: "#/invite/" + "A".repeat(43), purpose: "invite" as const, expiresAt: "2026-11-04T10:00:00Z" };
const show = (onSignedOut = vi.fn()) => ({ onSignedOut, ...render(<OwnerTeachers token="owner-tok" onSignedOut={onSignedOut} />) });

describe("P2-A2b owner — teachers", () => {
  it("lists the managed teachers with their state; the owner token travels only in x-owner-token", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [T(), T({ accountId: "t_00112233445566bb", username: "t.omar", displayName: "عمر", status: "invited", hasPassword: false, invitation: { purpose: "invite", expiresAt: LINK.expiresAt } })] } });
    show();
    const list = await screen.findByRole("list", { name: "المعلمون" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("نشط")).toBeTruthy();
    expect(within(items[1]).getByText("بانتظار كلمة المرور")).toBeTruthy();
    expect(within(items[1]).getByRole("button", { name: "رابط دعوة جديد" })).toBeTruthy();
    expect(calls[0].headers["x-owner-token"]).toBe("owner-tok");
    expect(Object.keys(calls[0].headers).map(k => k.toLowerCase())).not.toContain("authorization");
  });

  it("an empty list explains the next step", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [] } });
    show();
    expect(await screen.findByText(/لا يوجد معلمون مُدارون بعد/)).toBeTruthy();
  });

  it("create: required fields checked locally; the server's answer shows the one-time link with copy and QR", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [] } });
    routes["POST /api/owner-teachers/create"] = () => ({ status: 201, body: { ok: true, teacher: T({ status: "invited", hasPassword: false }), invitation: LINK } });
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    show();
    await screen.findByText(/لا يوجد معلمون/);
    fireEvent.click(screen.getByRole("button", { name: /إضافة معلم/ }));
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب وإصدار رابط الدعوة" }));
    expect((await screen.findByRole("alert")).textContent).toContain("مطلوبان");
    expect(calls.some(c => c.url === "/api/owner-teachers/create")).toBe(false);
    fireEvent.change(screen.getByLabelText(/^اسم المستخدم/), { target: { value: " t.sara " } });
    fireEvent.change(screen.getByLabelText("اسم العرض"), { target: { value: "سارة" } });
    fireEvent.change(screen.getByLabelText(/المواد/), { target: { value: "شبكات، برمجة" } });
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب وإصدار رابط الدعوة" }));
    const panel = await screen.findByRole("region", { name: "رابط الدعوة" });
    const create = calls.find(c => c.url === "/api/owner-teachers/create")!;
    expect(create.body).toMatchObject({ username: "t.sara", displayName: "سارة", subjects: ["شبكات", "برمجة"] });
    const url = invitationUrl(LINK.invitationPath);
    expect(within(panel).getByText(url)).toBeTruthy();
    expect(within(panel).getByRole("img", { name: /رمز QR/ })).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "نسخ الرابط" }));
    await within(panel).findByRole("button", { name: "تم نسخ الرابط" });
    expect(writeText).toHaveBeenCalledWith(url);
    expect(within(await screen.findByRole("list", { name: "المعلمون" })).getAllByRole("listitem")).toHaveLength(1);
  });

  it("suspend asks for an inline confirmation, then acts; the list shows the new state", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [T()] } });
    routes["POST /api/owner-teachers/suspend"] = c => ({ status: 200, body: { ok: true, teacher: T({ status: "suspended" }), echo: c.body } });
    show();
    await screen.findByRole("list", { name: "المعلمون" });
    fireEvent.click(screen.getByRole("button", { name: "إيقاف الحساب" }));
    expect(calls.some(c => c.url === "/api/owner-teachers/suspend")).toBe(false);
    const confirm = screen.getByRole("group", { name: "تأكيد إيقاف الحساب" });
    expect(confirm.textContent).toContain("سيفقد المعلم الوصول من طلبه التالي");
    fireEvent.click(within(confirm).getByRole("button", { name: "تأكيد: إيقاف الحساب" }));
    expect(await screen.findByText("موقوف")).toBeTruthy();
    expect(calls.find(c => c.url === "/api/owner-teachers/suspend")!.body).toEqual({ accountId: "t_00112233445566aa" });
    expect(screen.getByRole("button", { name: "إعادة التفعيل" })).toBeTruthy();
  });

  it("reset shows the reset link once", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [T()] } });
    routes["POST /api/owner-teachers/reset"] = () => ({ status: 200, body: { ok: true, teacher: T({ hasPassword: false, invitation: { purpose: "reset", expiresAt: LINK.expiresAt } }), invitation: { ...LINK, purpose: "reset" } } });
    show();
    await screen.findByRole("list", { name: "المعلمون" });
    fireEvent.click(screen.getByRole("button", { name: "إعادة تعيين كلمة المرور" }));
    fireEvent.click(screen.getByRole("button", { name: "تأكيد: إعادة تعيين كلمة المرور" }));
    expect(await screen.findByRole("region", { name: "رابط إعادة تعيين كلمة المرور" })).toBeTruthy();
  });

  it("STEP_UP_REQUIRED asks for the code, a wrong code is refused, the right one retries the same change", async () => {
    let stepped = false;
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [T({ status: "invited", hasPassword: false })] } });
    routes["POST /api/owner-teachers/reinvite"] = () => stepped ? { status: 200, body: { ok: true, teacher: T({ status: "invited", hasPassword: false }), invitation: LINK } } : { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "هذا الإجراء يتطلب إدخال رمز التحقق مرة أخرى." } };
    routes["POST /api/owner-session/step-up"] = c => { stepped = (c.body as { code: string }).code === "654321"; return stepped ? { status: 200, body: { ok: true } } : { status: 401, body: { ok: false, code: "TOTP_INVALID", error: "رمز التحقق غير صحيح." } }; };
    const { onSignedOut } = show();
    await screen.findByRole("list", { name: "المعلمون" });
    fireEvent.click(screen.getByRole("button", { name: "رابط دعوة جديد" }));
    const prompt = await screen.findByLabelText(/هذا الإجراء حساس/);
    fireEvent.change(prompt, { target: { value: "111111" } });
    fireEvent.click(screen.getByRole("button", { name: "تأكيد" }));
    expect((await screen.findByRole("alert")).textContent).toContain("رمز التحقق غير صحيح");
    expect(onSignedOut).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/هذا الإجراء حساس/), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "تأكيد" }));
    expect(await screen.findByRole("region", { name: "رابط الدعوة" })).toBeTruthy();
    expect(calls.filter(c => c.url === "/api/owner-teachers/reinvite")).toHaveLength(2);
  });

  it("a server refusal is shown as worded (e.g. a taken username); a 401 signs the owner out", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [] } });
    routes["POST /api/owner-teachers/create"] = () => ({ status: 409, body: { ok: false, code: "USERNAME_TAKEN", error: "اسم المستخدم مستخدم. اختر اسمًا آخر." } });
    const { onSignedOut } = show();
    await screen.findByText(/لا يوجد معلمون/);
    fireEvent.click(screen.getByRole("button", { name: /إضافة معلم/ }));
    fireEvent.change(screen.getByLabelText(/^اسم المستخدم/), { target: { value: "t.sara" } });
    fireEvent.change(screen.getByLabelText("اسم العرض"), { target: { value: "سارة" } });
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب وإصدار رابط الدعوة" }));
    expect((await screen.findByRole("alert")).textContent).toContain("اسم المستخدم مستخدم");
    routes["POST /api/owner-teachers/create"] = () => ({ status: 401, body: { ok: false, code: "OWNER_SESSION_REVOKED", error: "انتهت الجلسة." } });
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب وإصدار رابط الدعوة" }));
    await vi.waitFor(() => expect(onSignedOut).toHaveBeenCalled());
  });
});
