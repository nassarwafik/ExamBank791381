// @vitest-environment happy-dom
// Tadris+ P1-A2 — the platform owner's screens against a mocked P1-A API (test data only):
//   • routing: #/owner and #/owner/setup only; the setup screen is offered only while the server says the bootstrap is open;
//   • setup: details → QR + manual key → 6-digit code → recovery codes shown once; continuing requires «حفظت الرموز»;
//   • sign-in: username + password + TOTP (or a recovery code); the token goes to its OWN sessionStorage key and travels only in
//     x-owner-token; a teacher token in storage is never sent; a server error is shown as the server worded it;
//   • home: a stored token is re-validated on load (401 → back to sign-in, token removed); sign-out calls the server;
//     a sensitive action answered STEP_UP_REQUIRED asks for a code, then retries.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import OwnerApp from "./OwnerApp";
import { OWNER_TOKEN_KEY, groupSecret } from "./ownerApi";
import { isOwnerLocation, ownerViewFromHash } from "./ownerRoute";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => { status: number; body: unknown }> = {};

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  calls = [];
  routes = {};
  sessionStorage.clear();
  window.location.hash = "#/owner";
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const call: Call = { url, method: String(init.method || "GET"), headers: (init.headers || {}) as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const handler = routes[call.method + " " + url];
    if (!handler) return json(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
    const r = handler(call);
    return json(r.status, r.body);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const VIEW = { ok: true, owner: { accountId: "own_0123456789abcdef", username: "tadris.owner", displayName: "مالك المنصة" }, session: { expiresAt: "2026-11-01T12:00:00.000Z", stepUpValidUntil: null }, recoveryCodesRemaining: 10 };
const CODES = ["AAAA-BBBB-CCCC", "DDDD-EEEE-FFFF", "GGGG-HHHH-JJJJ", "KKKK-MMMM-NNNN", "PPPP-QQQQ-RRRR", "SSSS-TTTT-VVVV", "WWWW-XXXX-YYYY", "ZZZZ-0000-1111", "2222-3333-4444", "5555-6666-7777"];
const field = (name: RegExp) => screen.getByLabelText(name) as HTMLInputElement;
const type = (name: RegExp, value: string) => fireEvent.change(field(name), { target: { value } });

describe("P1-A2 owner route", () => {
  it("only #/owner and #/owner/setup are the owner surface", () => {
    for (const h of ["#/owner", "#/owner/", "#/owner/setup"]) expect(isOwnerLocation(h)).toBe(true);
    for (const h of ["", "#/learning", "#/ownerx", "#/owner/setup/x", "#owner", "#/owner/other"]) expect(isOwnerLocation(h)).toBe(false);
    expect(ownerViewFromHash("#/owner/setup")).toBe("setup");
    expect(ownerViewFromHash("#/owner")).toBe("home");
  });
  it("main.tsx mounts the owner entry INSTEAD of the teacher / student app; the owner app itself is only imported lazily", () => {
    const main = readFileSync(path.join(import.meta.dirname, "..", "main.tsx"), "utf8");
    const entry = readFileSync(path.join(import.meta.dirname, "OwnerEntry.tsx"), "utf8");
    expect(main).toMatch(/ownerSurface \? <OwnerEntry \/> : <App \/>/);
    expect(main).not.toMatch(/OwnerApp/);
    expect(entry).toMatch(/lazy\(lazyWithRetry\(\(\) => import\("\.\/OwnerApp"\)/);
    expect(entry).not.toMatch(/^import .*OwnerApp/m);
  });
});

describe("P1-A2 sign-in", () => {
  it("without a stored token: the sign-in form; no setup link unless the bootstrap is open", async () => {
    routes["GET /api/owner-bootstrap"] = () => ({ status: 200, body: { ok: true, state: "unavailable" } });
    render(<OwnerApp />);
    expect(await screen.findByRole("heading", { name: "دخول مالك المنصة" })).toBeTruthy();
    expect(screen.queryByText("تأسيس حساب المالك لأول مرة")).toBeNull();
    expect(calls.map(c => c.url)).toEqual(["/api/owner-bootstrap"]);
  });

  it("signs in with username + password + TOTP; the token goes to its own key and only in x-owner-token", async () => {
    sessionStorage.setItem("examBankBuilderToken", "teacher-token-must-never-be-sent");
    routes["GET /api/owner-bootstrap"] = () => ({ status: 200, body: { ok: true, state: "completed" } });
    routes["POST /api/owner-login"] = () => ({ status: 200, body: { ok: true, token: "owner-token-1", expiresInSeconds: 7200, owner: VIEW.owner, recoveryCodesRemaining: 10 } });
    routes["GET /api/owner-session"] = () => ({ status: 200, body: VIEW });
    render(<OwnerApp />);
    await screen.findByRole("heading", { name: "دخول مالك المنصة" });
    type(/اسم المستخدم/, " tadris.owner ");
    type(/كلمة المرور/, "correct horse battery staple");
    type(/رمز التحقق من التطبيق/, "123 456");
    fireEvent.click(screen.getByRole("button", { name: "دخول" }));
    expect(await screen.findByRole("heading", { name: /أهلًا/ })).toBeTruthy();
    const login = calls.find(c => c.url === "/api/owner-login")!;
    expect(login.body).toEqual({ username: "tadris.owner", password: "correct horse battery staple", code: "123456" });
    expect(sessionStorage.getItem(OWNER_TOKEN_KEY)).toBe("owner-token-1");
    const session = calls.find(c => c.url === "/api/owner-session")!;
    expect(session.headers["x-owner-token"]).toBe("owner-token-1");
    for (const c of calls) expect(JSON.stringify(c)).not.toContain("teacher-token-must-never-be-sent");
    for (const c of calls) expect(Object.keys(c.headers).map(k => k.toLowerCase())).not.toContain("authorization");
  });

  it("a recovery code can replace the TOTP code", async () => {
    routes["GET /api/owner-bootstrap"] = () => ({ status: 200, body: { ok: true, state: "completed" } });
    routes["POST /api/owner-login"] = () => ({ status: 200, body: { ok: true, token: "t", expiresInSeconds: 7200, owner: VIEW.owner, recoveryCodesRemaining: 9 } });
    routes["GET /api/owner-session"] = () => ({ status: 200, body: { ...VIEW, recoveryCodesRemaining: 9 } });
    render(<OwnerApp />);
    await screen.findByRole("heading", { name: "دخول مالك المنصة" });
    fireEvent.click(screen.getByRole("button", { name: /استخدم رمز استرداد/ }));
    type(/اسم المستخدم/, "tadris.owner");
    type(/كلمة المرور/, "correct horse battery staple");
    type(/رمز الاسترداد/, "AAAA-BBBB-CCCC");
    fireEvent.click(screen.getByRole("button", { name: "دخول" }));
    await screen.findByRole("heading", { name: /أهلًا/ });
    expect(calls.find(c => c.url === "/api/owner-login")!.body).toEqual({ username: "tadris.owner", password: "correct horse battery staple", recoveryCode: "AAAA-BBBB-CCCC" });
  });

  it("a refused sign-in shows the server's message, clears the code and stores nothing", async () => {
    routes["GET /api/owner-bootstrap"] = () => ({ status: 200, body: { ok: true, state: "completed" } });
    routes["POST /api/owner-login"] = () => ({ status: 401, body: { ok: false, code: "OWNER_LOGIN_DENIED", error: "بيانات الدخول غير صحيحة." } });
    render(<OwnerApp />);
    await screen.findByRole("heading", { name: "دخول مالك المنصة" });
    type(/اسم المستخدم/, "tadris.owner");
    type(/كلمة المرور/, "wrong password!!!");
    type(/رمز التحقق من التطبيق/, "000000");
    fireEvent.click(screen.getByRole("button", { name: "دخول" }));
    expect((await screen.findByRole("alert")).textContent).toContain("بيانات الدخول غير صحيحة.");
    expect(field(/رمز التحقق من التطبيق/).value).toBe("");
    expect(sessionStorage.getItem(OWNER_TOKEN_KEY)).toBeNull();
  });

  it("missing fields are flagged without calling the server", async () => {
    routes["GET /api/owner-bootstrap"] = () => ({ status: 200, body: { ok: true, state: "completed" } });
    render(<OwnerApp />);
    await screen.findByRole("heading", { name: "دخول مالك المنصة" });
    fireEvent.click(screen.getByRole("button", { name: "دخول" }));
    expect((await screen.findByRole("alert")).textContent).toContain("مطلوبة");
    expect(calls.some(c => c.url === "/api/owner-login")).toBe(false);
  });
});

describe("P1-A2 stored session", () => {
  it("a stored token is re-validated; 401 removes it and shows sign-in", async () => {
    sessionStorage.setItem(OWNER_TOKEN_KEY, "stale");
    routes["GET /api/owner-session"] = () => ({ status: 401, body: { ok: false, code: "OWNER_SESSION_REVOKED", error: "انتهت الجلسة." } });
    routes["GET /api/owner-bootstrap"] = () => ({ status: 200, body: { ok: true, state: "completed" } });
    render(<OwnerApp />);
    expect(await screen.findByRole("heading", { name: "دخول مالك المنصة" })).toBeTruthy();
    expect(sessionStorage.getItem(OWNER_TOKEN_KEY)).toBeNull();
  });

  it("a server outage is an error with a retry — never the home page", async () => {
    sessionStorage.setItem(OWNER_TOKEN_KEY, "t");
    routes["GET /api/owner-session"] = () => ({ status: 503, body: { ok: false, code: "OWNER_SESSION_UNAVAILABLE", error: "تعذر التحقق من الجلسة حاليًا." } });
    render(<OwnerApp />);
    expect((await screen.findByRole("alert")).textContent).toContain("تعذر التحقق من الجلسة حاليًا.");
    expect(screen.queryByRole("heading", { name: /أهلًا/ })).toBeNull();
    expect(sessionStorage.getItem(OWNER_TOKEN_KEY)).toBe("t");
    routes["GET /api/owner-session"] = () => ({ status: 200, body: VIEW });
    fireEvent.click(screen.getByRole("button", { name: /إعادة المحاولة/ }));
    expect(await screen.findByRole("heading", { name: /أهلًا/ })).toBeTruthy();
  });

  it("sign-out ends the server session and returns to sign-in", async () => {
    sessionStorage.setItem(OWNER_TOKEN_KEY, "t");
    routes["GET /api/owner-session"] = () => ({ status: 200, body: VIEW });
    routes["POST /api/owner-session/logout"] = () => ({ status: 200, body: { ok: true } });
    routes["GET /api/owner-bootstrap"] = () => ({ status: 200, body: { ok: true, state: "completed" } });
    render(<OwnerApp />);
    await screen.findByRole("heading", { name: /أهلًا/ });
    fireEvent.click(screen.getByRole("button", { name: /تسجيل الخروج/ }));
    expect(await screen.findByRole("heading", { name: "دخول مالك المنصة" })).toBeTruthy();
    expect(calls.find(c => c.url === "/api/owner-session/logout")!.headers["x-owner-token"]).toBe("t");
    expect(sessionStorage.getItem(OWNER_TOKEN_KEY)).toBeNull();
  });

  it("a sensitive action answered STEP_UP_REQUIRED asks for a code, confirms it, then retries and shows the new codes once", async () => {
    sessionStorage.setItem(OWNER_TOKEN_KEY, "t");
    let stepped = false;
    routes["GET /api/owner-session"] = () => ({ status: 200, body: VIEW });
    routes["POST /api/owner-session/recovery-codes"] = () => stepped
      ? { status: 200, body: { ok: true, recoveryCodes: CODES } }
      : { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "هذا الإجراء يتطلب إدخال رمز التحقق مرة أخرى." } };
    routes["POST /api/owner-session/step-up"] = c => { stepped = (c.body as { code: string }).code === "654321"; return stepped ? { status: 200, body: VIEW } : { status: 401, body: { ok: false, code: "TOTP_INVALID", error: "رمز التحقق غير صحيح." } }; };
    render(<OwnerApp />);
    await screen.findByRole("heading", { name: /أهلًا/ });
    fireEvent.click(screen.getByRole("button", { name: "توليد رموز استرداد جديدة" }));
    const prompt = await screen.findByLabelText(/هذا الإجراء حساس/);
    fireEvent.change(prompt, { target: { value: "111111" } });
    fireEvent.click(screen.getByRole("button", { name: "تأكيد" }));
    expect((await screen.findByRole("alert")).textContent).toContain("رمز التحقق غير صحيح.");
    fireEvent.change(screen.getByLabelText(/هذا الإجراء حساس/), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "تأكيد" }));
    const list = await screen.findByRole("list", { name: "رموز الاسترداد" });
    expect(within(list).getAllByRole("listitem").map(li => li.textContent)).toEqual(CODES);
    expect(screen.queryByLabelText(/هذا الإجراء حساس/)).toBeNull();
  });

  it("revoke-all signs this browser out too", async () => {
    sessionStorage.setItem(OWNER_TOKEN_KEY, "t");
    routes["GET /api/owner-session"] = () => ({ status: 200, body: VIEW });
    routes["POST /api/owner-session/revoke-all"] = () => ({ status: 200, body: { ok: true } });
    routes["GET /api/owner-bootstrap"] = () => ({ status: 200, body: { ok: true, state: "completed" } });
    render(<OwnerApp />);
    await screen.findByRole("heading", { name: /أهلًا/ });
    fireEvent.click(screen.getByRole("button", { name: /إنهاء كل الجلسات/ }));
    expect(await screen.findByRole("heading", { name: "دخول مالك المنصة" })).toBeTruthy();
    expect(sessionStorage.getItem(OWNER_TOKEN_KEY)).toBeNull();
  });
});

describe("P1-A2 one-time setup", () => {
  const TOTP = { issuer: "Tadris+", account: "tadris.owner", secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", uri: "otpauth://totp/Tadris%2B:tadris.owner?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Tadris%2B&algorithm=SHA1&digits=6&period=30" };

  it("#/owner/setup while the bootstrap is closed shows sign-in, not the setup", async () => {
    window.location.hash = "#/owner/setup";
    routes["GET /api/owner-bootstrap"] = () => ({ status: 200, body: { ok: true, state: "completed" } });
    render(<OwnerApp />);
    expect(await screen.findByRole("heading", { name: "دخول مالك المنصة" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "تأسيس حساب مالك المنصة" })).toBeNull();
  });

  it("details → QR + key → code → recovery codes once → sign-in", async () => {
    window.location.hash = "#/owner/setup";
    routes["GET /api/owner-bootstrap"] = () => ({ status: 200, body: { ok: true, state: "open" } });
    routes["POST /api/owner-bootstrap/begin"] = () => ({ status: 200, body: { ok: true, totp: TOTP, expiresInSeconds: 900 } });
    routes["POST /api/owner-bootstrap/confirm"] = () => ({ status: 201, body: { ok: true, owner: VIEW.owner, recoveryCodes: CODES } });
    render(<OwnerApp />);
    await screen.findByRole("heading", { name: "تأسيس حساب مالك المنصة" });

    type(/رمز التأسيس/, " TOKEN_abcdefghijklmnopqrstuvwxyz0123456789ab ");
    type(/^اسم المستخدم/, "tadris.owner");
    type(/اسم العرض/, "مالك المنصة");
    type(/^كلمة المرور/, "short");
    type(/تأكيد كلمة المرور/, "short");
    fireEvent.click(screen.getByRole("button", { name: "متابعة" }));
    expect((await screen.findByRole("alert")).textContent).toContain("14");
    expect(calls.some(c => c.url === "/api/owner-bootstrap/begin")).toBe(false);

    type(/^كلمة المرور/, "correct horse battery staple");
    type(/تأكيد كلمة المرور/, "correct horse battery stapl");
    fireEvent.click(screen.getByRole("button", { name: "متابعة" }));
    expect((await screen.findByRole("alert")).textContent).toContain("لا يطابقها");

    type(/تأكيد كلمة المرور/, "correct horse battery staple");
    fireEvent.click(screen.getByRole("button", { name: "متابعة" }));
    await screen.findByRole("heading", { name: "ربط تطبيق المصادقة" });
    expect(calls.find(c => c.url === "/api/owner-bootstrap/begin")!.body).toEqual({ token: "TOKEN_abcdefghijklmnopqrstuvwxyz0123456789ab", username: "tadris.owner", displayName: "مالك المنصة", password: "correct horse battery staple" });
    const qr = screen.getByRole("img", { name: /رمز QR/ });
    expect(qr.querySelector("path")?.getAttribute("d")?.length).toBeGreaterThan(100);
    expect(screen.getByText(groupSecret(TOTP.secret))).toBeTruthy();
    expect(screen.getByRole("link", { name: "فتح في تطبيق المصادقة" }).getAttribute("href")).toBe(TOTP.uri);

    type(/رمز التحقق/, "12345");
    fireEvent.click(screen.getByRole("button", { name: "إنشاء حساب المالك" }));
    expect((await screen.findByRole("alert")).textContent).toContain("6 أرقام");
    type(/رمز التحقق/, "123456");
    fireEvent.click(screen.getByRole("button", { name: "إنشاء حساب المالك" }));
    await screen.findByRole("heading", { name: "احفظ رموز الاسترداد" });
    expect(calls.find(c => c.url === "/api/owner-bootstrap/confirm")!.body).toEqual({ token: "TOKEN_abcdefghijklmnopqrstuvwxyz0123456789ab", code: "123456" });
    const list = screen.getByRole("list", { name: "رموز الاسترداد" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(10);

    const go = screen.getByRole("button", { name: "متابعة إلى تسجيل الدخول" }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(go.disabled).toBe(false);
    routes["GET /api/owner-bootstrap"] = () => ({ status: 200, body: { ok: true, state: "completed", removeBootstrapSettings: true } });
    fireEvent.click(go);
    expect(await screen.findByRole("heading", { name: "دخول مالك المنصة" })).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toBe("#/owner"));
    expect(sessionStorage.getItem(OWNER_TOKEN_KEY)).toBeNull();
  });

  it("an expired setup offers «البدء من جديد»", async () => {
    window.location.hash = "#/owner/setup";
    routes["GET /api/owner-bootstrap"] = () => ({ status: 200, body: { ok: true, state: "open" } });
    routes["POST /api/owner-bootstrap/begin"] = () => ({ status: 200, body: { ok: true, totp: TOTP, expiresInSeconds: 900 } });
    routes["POST /api/owner-bootstrap/confirm"] = () => ({ status: 409, body: { ok: false, code: "BOOTSTRAP_NOT_STARTED", error: "انتهت مهلة الإعداد. ابدأ من جديد." } });
    render(<OwnerApp />);
    await screen.findByRole("heading", { name: "تأسيس حساب مالك المنصة" });
    type(/رمز التأسيس/, "TOKEN_abcdefghijklmnopqrstuvwxyz0123456789ab");
    type(/^اسم المستخدم/, "tadris.owner");
    type(/اسم العرض/, "مالك");
    type(/^كلمة المرور/, "correct horse battery staple");
    type(/تأكيد كلمة المرور/, "correct horse battery staple");
    fireEvent.click(screen.getByRole("button", { name: "متابعة" }));
    await screen.findByRole("heading", { name: "ربط تطبيق المصادقة" });
    type(/رمز التحقق/, "123456");
    fireEvent.click(screen.getByRole("button", { name: "إنشاء حساب المالك" }));
    fireEvent.click(await screen.findByRole("button", { name: "البدء من جديد" }));
    expect(await screen.findByRole("heading", { name: "تأسيس حساب مالك المنصة" })).toBeTruthy();
  });
});
