// @vitest-environment happy-dom
// Tadris+ P10-C — «أمان الحساب» on the owner's home page against a mocked API (test data only): the password change and the
// authenticator move. Pins: the forms send exactly the fields the server checks; STEP_UP_REQUIRED asks for the code and the
// SAME request is sent again; the new token the server answers replaces the stored one and is the one used afterwards;
// signInAgain returns to sign-in; the new recovery codes are shown once; a wrong current password keeps the owner signed in;
// a mismatched confirmation sends nothing (presentation only — the server owns the policy).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import OwnerApp from "./OwnerApp";
import { OWNER_TOKEN_KEY } from "./ownerApi";

type Call = { url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> | undefined };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => { status: number; body: unknown }> = {};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const VIEW = { ok: true, owner: { accountId: "own_0123456789abcdef", username: "tadris.owner", displayName: "مالك المنصة" }, session: { expiresAt: "2026-11-05T12:00:00.000Z", stepUpValidUntil: null }, recoveryCodesRemaining: 4 };
const CODES = ["AAAA-BBBB-CCCC", "DDDD-EEEE-FFFF", "GGGG-HHHH-JJJJ", "KKKK-MMMM-NNNN", "PPPP-QQQQ-RRRR", "SSSS-TTTT-VVVV", "WWWW-XXXX-YYYY", "ZZZZ-0000-1111", "2222-3333-4444", "5555-6666-7777"];
const TOTP = { issuer: "Tadris+", account: "tadris.owner", secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", uri: "otpauth://totp/Tadris%2B:tadris.owner?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Tadris%2B" };

beforeEach(() => {
  calls = [];
  routes = {
    "GET /api/owner-session": () => ({ status: 200, body: VIEW }),
    "GET /api/owner-teachers": () => ({ status: 200, body: { ok: true, teachers: [] } })
  };
  sessionStorage.clear();
  sessionStorage.setItem(OWNER_TOKEN_KEY, "owner-token-1");
  window.location.hash = "#/owner";
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const call: Call = { url, method: String(init.method || "GET"), headers: (init.headers || {}) as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const h = routes[call.method + " " + url];
    if (!h) return json(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
    const r = h(call);
    return json(r.status, r.body);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const posts = (path: string) => calls.filter(c => c.method === "POST" && c.url === path);
const type = (form: HTMLElement, label: RegExp, value: string) => fireEvent.change(within(form).getByLabelText(label), { target: { value } });

async function home() {
  render(<OwnerApp />);
  await screen.findByRole("heading", { name: /أهلًا/ });
}

describe("P10-C owner password change", () => {
  it("step-up first, then the SAME request again; the new token replaces the stored one and is used from then on", async () => {
    let asked = 0;
    routes["POST /api/owner-session/password"] = () => (++asked === 1
      ? { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "هذا الإجراء يتطلب إدخال رمز التحقق مرة أخرى." } }
      : { status: 200, body: { ok: true, token: "owner-token-2", expiresInSeconds: 7200 } });
    routes["POST /api/owner-session/step-up"] = () => ({ status: 200, body: VIEW });
    await home();
    fireEvent.click(screen.getByRole("button", { name: "تغيير كلمة المرور" }));
    const form = screen.getByRole("form", { name: "تغيير كلمة المرور" });
    type(form, /كلمة المرور الحالية/, "correct horse battery staple");
    type(form, /كلمة المرور الجديدة \(/, "a brand new owner passphrase");
    type(form, /تأكيد كلمة المرور الجديدة/, "a brand new owner passphrase");
    fireEvent.click(within(form).getByRole("button", { name: "حفظ كلمة المرور" }));
    const prompt = await screen.findByRole("form", { name: "التحقق بخطوتين" });
    fireEvent.change(within(prompt).getByRole("textbox"), { target: { value: "123456" } });
    fireEvent.click(within(prompt).getByRole("button", { name: "تأكيد" }));
    expect(await screen.findByText("تم تغيير كلمة المرور. انتهت جلسات المالك على الأجهزة الأخرى.")).toBeTruthy();
    const sent = posts("/api/owner-session/password");
    expect(sent).toHaveLength(2);
    for (const c of sent) expect(c.body).toEqual({ currentPassword: "correct horse battery staple", newPassword: "a brand new owner passphrase" });
    expect(sent[0].headers["x-owner-token"]).toBe("owner-token-1");
    expect(sessionStorage.getItem(OWNER_TOKEN_KEY)).toBe("owner-token-2");
    await waitFor(() => expect(calls.filter(c => c.url === "/api/owner-session" && c.headers["x-owner-token"] === "owner-token-2")).toHaveLength(1));
    expect(screen.queryByRole("form", { name: "تغيير كلمة المرور" })).toBeNull();
    // the next owner action carries the new token
    routes["POST /api/owner-session/recovery-codes"] = () => ({ status: 200, body: { ok: true, recoveryCodes: CODES } });
    fireEvent.click(screen.getByRole("button", { name: "توليد رموز استرداد جديدة" }));
    await waitFor(() => expect(posts("/api/owner-session/recovery-codes")[0]?.headers["x-owner-token"]).toBe("owner-token-2"));
  });

  it("a mismatched confirmation sends nothing; a wrong current password shows the server's message and keeps the owner in", async () => {
    routes["POST /api/owner-session/password"] = () => ({ status: 401, body: { ok: false, code: "CURRENT_PASSWORD_INVALID", error: "كلمة المرور الحالية غير صحيحة." } });
    await home();
    fireEvent.click(screen.getByRole("button", { name: "تغيير كلمة المرور" }));
    const form = screen.getByRole("form", { name: "تغيير كلمة المرور" });
    type(form, /كلمة المرور الحالية/, "x");
    type(form, /كلمة المرور الجديدة \(/, "a brand new owner passphrase");
    type(form, /تأكيد كلمة المرور الجديدة/, "a different passphrase!!");
    fireEvent.click(within(form).getByRole("button", { name: "حفظ كلمة المرور" }));
    expect((await screen.findByRole("alert")).textContent).toContain("تأكيد كلمة المرور الجديدة لا يطابقها.");
    expect(posts("/api/owner-session/password")).toHaveLength(0);
    type(form, /تأكيد كلمة المرور الجديدة/, "a brand new owner passphrase");
    fireEvent.click(within(form).getByRole("button", { name: "حفظ كلمة المرور" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("كلمة المرور الحالية غير صحيحة."));
    expect(screen.getByRole("heading", { name: /أهلًا/ })).toBeTruthy();
    expect(sessionStorage.getItem(OWNER_TOKEN_KEY)).toBe("owner-token-1");
  });

  it("signInAgain (the change stands, no new session) → back to the sign-in page", async () => {
    routes["POST /api/owner-session/password"] = () => ({ status: 200, body: { ok: true, signInAgain: true } });
    routes["GET /api/owner-bootstrap"] = () => ({ status: 200, body: { ok: true, state: "completed" } });
    await home();
    fireEvent.click(screen.getByRole("button", { name: "تغيير كلمة المرور" }));
    const form = screen.getByRole("form", { name: "تغيير كلمة المرور" });
    type(form, /كلمة المرور الحالية/, "correct horse battery staple");
    type(form, /كلمة المرور الجديدة \(/, "a brand new owner passphrase");
    type(form, /تأكيد كلمة المرور الجديدة/, "a brand new owner passphrase");
    routes["GET /api/owner-session"] = () => ({ status: 401, body: { ok: false, code: "OWNER_SESSION_REVOKED", error: "انتهت الجلسة." } });
    fireEvent.click(within(form).getByRole("button", { name: "حفظ كلمة المرور" }));
    expect(await screen.findByRole("heading", { name: "دخول مالك المنصة" })).toBeTruthy();
    expect(sessionStorage.getItem(OWNER_TOKEN_KEY)).toBeNull();
  });
});

describe("P10-C owner authenticator move", () => {
  it("password → QR + manual key → the new app's code → 10 new recovery codes shown once, the new token stored", async () => {
    routes["POST /api/owner-session/totp-begin"] = () => ({ status: 200, body: { ok: true, totp: TOTP, expiresInSeconds: 900 } });
    routes["POST /api/owner-session/totp-confirm"] = () => ({ status: 200, body: { ok: true, token: "owner-token-3", expiresInSeconds: 7200, recoveryCodes: CODES } });
    await home();
    fireEvent.click(screen.getByRole("button", { name: "تبديل تطبيق المصادقة" }));
    const first = screen.getByRole("form", { name: "تبديل تطبيق المصادقة" });
    type(first, /كلمة المرور الحالية/, "correct horse battery staple");
    fireEvent.click(within(first).getByRole("button", { name: "متابعة" }));
    const second = await screen.findByRole("form", { name: "تأكيد التطبيق الجديد" });
    expect(posts("/api/owner-session/totp-begin")[0].body).toEqual({ currentPassword: "correct horse battery staple" });
    expect(within(second).getByRole("img", { name: /رمز QR لربط تطبيق المصادقة الجديد/ })).toBeTruthy();
    expect(second.textContent).toContain("JBSW Y3DP");
    type(second, /الرمز من التطبيق الجديد/, "654 321");
    fireEvent.click(within(second).getByRole("button", { name: "تأكيد التطبيق الجديد" }));
    expect(await screen.findByText(/تم ربط التطبيق الجديد/)).toBeTruthy();
    expect(posts("/api/owner-session/totp-confirm")[0].body).toEqual({ code: "654321" });
    for (const c of CODES) expect(screen.getAllByText(c).length).toBeGreaterThan(0);
    expect(sessionStorage.getItem(OWNER_TOKEN_KEY)).toBe("owner-token-3");
    expect(screen.queryByRole("form", { name: "تأكيد التطبيق الجديد" })).toBeNull();
  });

  it("a wrong code from the new app keeps the QR step open; an expired window goes back to the password step", async () => {
    routes["POST /api/owner-session/totp-begin"] = () => ({ status: 200, body: { ok: true, totp: TOTP, expiresInSeconds: 900 } });
    let n = 0;
    routes["POST /api/owner-session/totp-confirm"] = () => (++n === 1
      ? { status: 401, body: { ok: false, code: "TOTP_INVALID", error: "رمز التحقق غير صحيح. أدخل الرمز الذي يظهر في التطبيق الجديد." } }
      : { status: 409, body: { ok: false, code: "TOTP_REENROL_NOT_STARTED", error: "انتهت مهلة ربط التطبيق الجديد. ابدأ من جديد." } });
    await home();
    fireEvent.click(screen.getByRole("button", { name: "تبديل تطبيق المصادقة" }));
    const first = screen.getByRole("form", { name: "تبديل تطبيق المصادقة" });
    type(first, /كلمة المرور الحالية/, "correct horse battery staple");
    fireEvent.click(within(first).getByRole("button", { name: "متابعة" }));
    const second = await screen.findByRole("form", { name: "تأكيد التطبيق الجديد" });
    type(second, /الرمز من التطبيق الجديد/, "111111");
    fireEvent.click(within(second).getByRole("button", { name: "تأكيد التطبيق الجديد" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("رمز التحقق غير صحيح"));
    expect(screen.getByRole("form", { name: "تأكيد التطبيق الجديد" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /أهلًا/ })).toBeTruthy();
    type(screen.getByRole("form", { name: "تأكيد التطبيق الجديد" }), /الرمز من التطبيق الجديد/, "222222");
    fireEvent.click(within(screen.getByRole("form", { name: "تأكيد التطبيق الجديد" })).getByRole("button", { name: "تأكيد التطبيق الجديد" }));
    expect(await screen.findByRole("form", { name: "تبديل تطبيق المصادقة" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("انتهت مهلة ربط التطبيق الجديد");
    expect(sessionStorage.getItem(OWNER_TOKEN_KEY)).toBe("owner-token-1");
  });
});
