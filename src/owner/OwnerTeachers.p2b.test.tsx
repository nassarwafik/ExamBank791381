// @vitest-environment happy-dom
// Tadris+ P2-B — «استيراد مساحتي القديمة» in the Owner Console against a mocked API (test data only):
//   the card appears only when the server says the import is available → a short form (username + display name, the "once only"
//   warning) → step-up when asked → the one-time invitation link → the card disappears and the account carries «المساحة القديمة».
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import OwnerTeachers from "./OwnerTeachers";
import type { ManagedTeacher } from "./ownerApi";

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

const LEGACY: ManagedTeacher = {
  accountId: "t_legacy", username: "w.nassar", displayName: "الأستاذ وفيق", fullName: "", email: "", phone: "", subjects: [], notes: "", organizationId: "default",
  status: "invited", hasPassword: false, invitation: { purpose: "invite", expiresAt: "2026-11-04T10:00:00Z" }, createdAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-01T10:00:00Z", lastLoginAt: "",
  origin: "shared-password-workspace"
};
const LINK = { invitationPath: "#/invite/" + "B".repeat(43), purpose: "invite" as const, expiresAt: "2026-11-04T10:00:00Z" };
const show = () => render(<OwnerTeachers token="owner-tok" onSignedOut={vi.fn()} />);

describe("P2-B owner — import of the shared-password workspace", () => {
  it("available → card → form with the once-only warning → link; then the card is gone and the account is marked", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [], legacyImport: { available: true } } });
    routes["POST /api/owner-teachers/import-legacy"] = () => ({ status: 201, body: { ok: true, teacher: LEGACY, invitation: LINK } });
    show();
    const card = await screen.findByRole("region", { name: "مساحتك القديمة" });
    fireEvent.click(within(card).getByRole("button", { name: "استيراد مساحتي القديمة" }));
    const form = screen.getByRole("form", { name: "استيراد مساحتي القديمة" });
    expect(form.textContent).toContain("مرة واحدة فقط");
    expect(form.textContent).toContain("لا يُنقل شيء ولا يُحذف");
    fireEvent.click(within(form).getByRole("button", { name: "استيراد وإصدار رابط الدعوة" }));
    expect((await screen.findByRole("alert")).textContent).toContain("مطلوبان");
    expect(calls.some(c => c.url.endsWith("/import-legacy"))).toBe(false);
    fireEvent.change(within(form).getByLabelText(/^اسم المستخدم/), { target: { value: " w.nassar " } });
    fireEvent.change(within(form).getByLabelText("اسم العرض"), { target: { value: "الأستاذ وفيق" } });
    fireEvent.click(within(form).getByRole("button", { name: "استيراد وإصدار رابط الدعوة" }));
    expect(await screen.findByRole("region", { name: "رابط الدعوة" })).toBeTruthy();
    expect(calls.find(c => c.url === "/api/owner-teachers/import-legacy")!.body).toEqual({ username: "w.nassar", displayName: "الأستاذ وفيق" });
    expect(screen.queryByRole("region", { name: "مساحتك القديمة" })).toBeNull();
    const item = within(screen.getByRole("list", { name: "المعلمون" })).getByRole("listitem");
    expect(within(item).getByText("المساحة القديمة")).toBeTruthy();
  });

  it("not offered when the server says it does not apply or was already done", async () => {
    for (const legacyImport of [{ available: false, reason: "NOT_SHARED_PASSWORD_MODE" }, { available: false, reason: "ALREADY_IMPORTED", accountId: "t_legacy" }, undefined]) {
      routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [], legacyImport } });
      show();
      await screen.findByText(/لا يوجد معلمون/);
      expect(screen.queryByRole("button", { name: "استيراد مساحتي القديمة" })).toBeNull();
      cleanup();
    }
  });

  it("LEGACY_DATA_OWNER set → a short explanation instead of the button", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [], legacyImport: { available: false, reason: "LEGACY_DATA_OWNER_SET" } } });
    show();
    expect(await screen.findByText(/مُسندة لمعلم آخر/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "استيراد مساحتي القديمة" })).toBeNull();
  });

  it("STEP_UP_REQUIRED asks for the code and retries the same import; a refusal from the server is shown as worded", async () => {
    let stepped = false;
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [], legacyImport: { available: true } } });
    routes["POST /api/owner-teachers/import-legacy"] = () => stepped
      ? { status: 409, body: { ok: false, code: "LEGACY_IMPORT_ALREADY_IMPORTED", error: "المساحة القديمة استُوردت من قبل. لا يمكن استيرادها لحساب ثانٍ." } }
      : { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "هذا الإجراء يتطلب إدخال رمز التحقق مرة أخرى." } };
    routes["POST /api/owner-session/step-up"] = () => { stepped = true; return { status: 200, body: { ok: true } }; };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "استيراد مساحتي القديمة" }));
    const form = screen.getByRole("form", { name: "استيراد مساحتي القديمة" });
    fireEvent.change(within(form).getByLabelText(/^اسم المستخدم/), { target: { value: "w.nassar" } });
    fireEvent.change(within(form).getByLabelText("اسم العرض"), { target: { value: "وفيق" } });
    fireEvent.click(within(form).getByRole("button", { name: "استيراد وإصدار رابط الدعوة" }));
    fireEvent.change(await screen.findByLabelText(/هذا الإجراء حساس/), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "تأكيد" }));
    expect((await screen.findByRole("alert")).textContent).toContain("استُوردت من قبل");
    expect(calls.filter(c => c.url === "/api/owner-teachers/import-legacy")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "استيراد مساحتي القديمة" })).toBeNull();
  });
});
