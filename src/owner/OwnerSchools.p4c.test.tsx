// @vitest-environment happy-dom
// Tadris+ P4-C — «المدارس» in the Owner Console against a mocked API (test data only): its own address; create; the preview
// shows exactly the badge teachers and students see (logo read with the owner's header); a logo file is checked before it is
// sent (type and size — the server checks the real bytes again); removing a logo asks first; each teacher's school is saved on
// change; a change asks for the second-factor code when needed and retries.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import OwnerApp from "./OwnerApp";
import { OWNER_TOKEN_KEY } from "./ownerApi";
import { isOwnerLocation, ownerViewFromHash, ownerSectionHash } from "./ownerRoute";

type Call = { url: string; method: string; body: Record<string, unknown> | undefined; headers: Record<string, string> };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => { status: number; body: unknown }> = {};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob(["x"]) }) as unknown as Response;
const VIEW = { ok: true, owner: { accountId: "own_0123456789abcdef", username: "tadris.owner", displayName: "مالك المنصة" }, session: { expiresAt: "2026-11-01T12:00:00.000Z", stepUpValidUntil: null }, recoveryCodesRemaining: 10 };
const NOUR = { schoolId: "sch_00112233445566aa", name: "مدرسة النور", logo: { version: 2, updatedAt: "2026-11-02T10:00:00Z" }, teachers: 1 };
const AMAL = { schoolId: "sch_00112233445566bb", name: "مدرسة الأمل", logo: null, teachers: 0 };
const T = (id: string, name: string, schoolId: string | null) => ({ accountId: id, username: "t." + id.slice(-2), displayName: name, fullName: "", email: "", phone: "", subjects: [], notes: "", organizationId: "default", status: "active", hasPassword: true, invitation: null, createdAt: "", updatedAt: "", lastLoginAt: "", origin: "console", access: null, schoolId });

beforeEach(() => {
  calls = [];
  routes = {
    "GET /api/owner-session": () => ({ status: 200, body: VIEW }),
    "GET /api/owner-schools": () => ({ status: 200, body: { ok: true, schools: [AMAL, NOUR] } }),
    "GET /api/owner-teachers": () => ({ status: 200, body: { ok: true, teachers: [T("t_00112233445566aa", "سارة", NOUR.schoolId), T("t_00112233445566bb", "عمر", null)] } }),
    ["GET /api/owner-schools/logo?schoolId=" + NOUR.schoolId + "&v=2"]: () => ({ status: 200, body: {} })
  };
  sessionStorage.clear();
  sessionStorage.setItem(OWNER_TOKEN_KEY, "owner-tok");
  window.location.hash = "#/owner/schools";
  URL.createObjectURL = vi.fn(() => "blob:nour") as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const c: Call = { url, method: String(init.method || "GET"), body: init.body ? JSON.parse(String(init.body)) : undefined, headers: (init.headers || {}) as Record<string, string> };
    calls.push(c);
    const h = routes[c.method + " " + url];
    if (!h) return json(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
    const r = h(c);
    return json(r.status, r.body);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const open = async () => { render(<OwnerApp />); return screen.findByRole("list", { name: "المدارس" }); };
const posted = (path: string) => calls.filter(c => c.method === "POST" && c.url === path);
const card = (name: string) => within(screen.getByRole("list", { name: "المدارس" })).getByRole("listitem", { name });
function chooseFile(input: HTMLElement, file: File) {
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

describe("P4-C «المدارس»", () => {
  it("its own address (nothing after it); the menu marks it", async () => {
    expect([isOwnerLocation("#/owner/schools"), ownerViewFromHash("#/owner/schools"), ownerSectionHash("schools")]).toEqual([true, "schools", "#/owner/schools"]);
    for (const h of ["#/owner/schools/sch_00112233445566aa", "#/owner/schoolsx"]) expect(isOwnerLocation(h)).toBe(false);
    await open();
    expect(within(screen.getByRole("navigation", { name: "أقسام لوحة المالك" })).getByRole("button", { name: "المدارس" }).getAttribute("aria-current")).toBe("page");
  });

  it("each school shows the exact badge teachers and students see; the logo is read with the owner's header", async () => {
    await open();
    const preview = within(card("مدرسة النور")).getByRole("region", { name: "معاينة شعار مدرسة النور" });
    await waitFor(() => expect(within(preview).getByRole("group", { name: "المدرسة: مدرسة النور" }).querySelector("img")?.getAttribute("src")).toBe("blob:nour"));
    const logo = calls.find(c => c.url.startsWith("/api/owner-schools/logo"))!;
    expect(logo.headers).toEqual({ "x-owner-token": "owner-tok" });
    expect(within(card("مدرسة الأمل")).getByText("لا يوجد شعار بعد.")).toBeTruthy();
    expect(calls.filter(c => c.url.startsWith("/api/owner-schools/logo"))).toHaveLength(1);       // no request for a school without one
  });

  it("create: the name is required, then sent", async () => {
    routes["POST /api/owner-schools/create"] = () => ({ status: 201, body: { ok: true, school: { ...AMAL, schoolId: "sch_00112233445566cc", name: "مدرسة جديدة" } } });
    await open();
    fireEvent.click(screen.getByRole("button", { name: /إضافة مدرسة/ }));
    fireEvent.click(screen.getByRole("button", { name: "إنشاء المدرسة" }));
    expect(screen.getByRole("alert").textContent).toContain("اكتب اسم المدرسة");
    fireEvent.change(screen.getByLabelText("اسم المدرسة"), { target: { value: " مدرسة جديدة " } });
    fireEvent.click(screen.getByRole("button", { name: "إنشاء المدرسة" }));
    await screen.findByText("أُنشئت المدرسة.");
    expect(posted("/api/owner-schools/create")[0].body).toEqual({ name: "مدرسة جديدة" });
  });

  it("a logo file is checked before it is sent (type, size); a valid one is sent as a data URL", async () => {
    routes["POST /api/owner-schools/logo"] = () => ({ status: 200, body: { ok: true, school: { ...AMAL, logo: { version: 1, updatedAt: "" } } } });
    await open();
    const input = within(card("مدرسة الأمل")).getByLabelText("رفع شعار مدرسة الأمل");
    chooseFile(input, new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }));
    expect(screen.getByRole("alert").textContent).toContain("نوع الملف غير مدعوم");
    chooseFile(input, new File([new Uint8Array(3 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }));
    expect(screen.getByRole("alert").textContent).toContain("3 ميغابايت");
    expect(posted("/api/owner-schools/logo")).toHaveLength(0);
    chooseFile(input, new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "logo.png", { type: "image/png" }));
    await screen.findByText("حُفظ الشعار.");
    const body = posted("/api/owner-schools/logo")[0].body!;
    expect(body.schoolId).toBe(AMAL.schoolId);
    expect(String(body.dataUrl)).toMatch(/^data:image\/png;base64,/);
  });

  it("removing a logo asks first", async () => {
    routes["POST /api/owner-schools/remove-logo"] = () => ({ status: 200, body: { ok: true, school: { ...NOUR, logo: null } } });
    await open();
    fireEvent.click(within(card("مدرسة النور")).getByRole("button", { name: "إزالة الشعار" }));
    expect(posted("/api/owner-schools/remove-logo")).toHaveLength(0);
    fireEvent.click(within(card("مدرسة النور")).getByRole("button", { name: "تأكيد: إزالة الشعار" }));
    await screen.findByText("أُزيل الشعار.");
    expect(posted("/api/owner-schools/remove-logo")[0].body).toEqual({ schoolId: NOUR.schoolId });
  });

  it("each teacher's school is saved on change (and «بلا مدرسة» unlinks); a step-up is asked for and the same change retried", async () => {
    let n = 0;
    routes["POST /api/owner-schools/link"] = c => (++n === 1 ? { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "تحقق" } } : { status: 200, body: { ok: true, accountId: c.body?.accountId, schoolId: c.body?.schoolId } });
    routes["POST /api/owner-session/step-up"] = () => ({ status: 200, body: VIEW });
    await open();
    const omar = screen.getByLabelText("مدرسة عمر") as HTMLSelectElement;
    expect([...omar.options].map(o => o.textContent)).toEqual(["بلا مدرسة", "مدرسة الأمل", "مدرسة النور"]);
    expect((screen.getByLabelText("مدرسة سارة") as HTMLSelectElement).value).toBe(NOUR.schoolId);
    fireEvent.change(omar, { target: { value: AMAL.schoolId } });
    const form = await screen.findByRole("form", { name: "التحقق بخطوتين" });
    fireEvent.change(within(form).getByRole("textbox"), { target: { value: "123456" } });
    fireEvent.click(within(form).getByRole("button", { name: "تأكيد" }));
    await screen.findByText("حُفظت مدرسة عمر.");
    expect(posted("/api/owner-schools/link").map(c => c.body)).toEqual([{ accountId: "t_00112233445566bb", schoolId: AMAL.schoolId }, { accountId: "t_00112233445566bb", schoolId: AMAL.schoolId }]);
    fireEvent.change(screen.getByLabelText("مدرسة سارة"), { target: { value: "" } });
    await waitFor(() => expect(posted("/api/owner-schools/link")).toHaveLength(3));
    expect(posted("/api/owner-schools/link")[2].body).toEqual({ accountId: "t_00112233445566aa", schoolId: null });
  });
});
