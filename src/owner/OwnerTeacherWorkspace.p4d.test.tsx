// @vitest-environment happy-dom
// Tadris+ P4-D — «مساحة المعلم الخاصة بك» on the console overview, against a mocked API (test data only): link one teacher
// account (second-factor check asked inline and the same change retried); the button asks the server for a one-time link and
// offers it as a NEW-tab link with noopener (the new tab never shares this tab's storage); a linked account that cannot be used
// says why and offers nothing; unlinking asks first.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import OwnerTeacherWorkspace from "./OwnerTeacherWorkspace";

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => { status: number; body: unknown }> = {};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const MINE = { accountId: "t_00112233445566aa", username: "w.nassar", displayName: "وفيق", status: "active", usable: true, reason: null };
const TEACHERS = [{ accountId: MINE.accountId, username: "w.nassar", displayName: "وفيق" }, { accountId: "t_00112233445566bb", username: "t.other", displayName: "آخر" }];
const VIEW = { ok: true, owner: { accountId: "own_0123456789abcdef", username: "tadris.owner", displayName: "مالك" }, session: { expiresAt: "", stepUpValidUntil: null }, recoveryCodesRemaining: 10 };
const TICKET = "#/handoff/" + "T".repeat(43);

beforeEach(() => {
  calls = [];
  routes = { "GET /api/owner-handoff": () => ({ status: 200, body: { ok: true, linked: null } }), "GET /api/owner-teachers": () => ({ status: 200, body: { ok: true, teachers: TEACHERS } }) };
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

const show = () => { const onSignedOut = vi.fn(); render(<OwnerTeacherWorkspace token="owner-tok" onSignedOut={onSignedOut} />); return { onSignedOut }; };
const panel = () => screen.getByRole("region", { name: "مساحة المعلم الخاصة بك" });
const posted = (path: string) => calls.filter(c => c.method === "POST" && c.url === path);

describe("P4-D «مساحة المعلم الخاصة بك»", () => {
  it("not linked: links one teacher account after the second-factor check (the same change retried)", async () => {
    let n = 0;
    routes["POST /api/owner-handoff/link"] = c => (++n === 1 ? { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "تحقق" } } : { status: 200, body: { ok: true, linked: { ...MINE, accountId: String(c.body?.accountId) } } });
    routes["POST /api/owner-session/step-up"] = () => ({ status: 200, body: VIEW });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "ربط حساب معلم" }));
    const select = await within(panel()).findByLabelText("حساب المعلم الخاص بك") as HTMLSelectElement;
    await waitFor(() => expect(select.options).toHaveLength(3));
    fireEvent.change(select, { target: { value: MINE.accountId } });
    fireEvent.click(screen.getByRole("button", { name: "ربط" }));
    const form = await screen.findByRole("form", { name: "التحقق بخطوتين" });
    fireEvent.change(within(form).getByRole("textbox"), { target: { value: "123456" } });
    fireEvent.click(within(form).getByRole("button", { name: "تأكيد" }));
    await screen.findByText(/مرتبط بحساب المعلم/);
    expect(posted("/api/owner-handoff/link").map(c => c.body)).toEqual([{ accountId: MINE.accountId }, { accountId: MINE.accountId }]);
  });

  it("linked: the button gets a one-time link and offers it as a NEW tab with noopener / noreferrer", async () => {
    routes["GET /api/owner-handoff"] = () => ({ status: 200, body: { ok: true, linked: MINE } });
    routes["POST /api/owner-handoff/issue"] = () => ({ status: 200, body: { ok: true, handoffPath: TICKET, expiresAt: "2026-11-03T10:01:00Z" } });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "الانتقال إلى مساحة المعلم الخاصة بي" }));
    const link = await screen.findByRole("link", { name: "فتح مساحة المعلم في تبويب جديد" });
    expect(link.getAttribute("href")).toBe(window.location.pathname + TICKET);
    expect(link.getAttribute("target")).toBe("_blank");
    expect((link.getAttribute("rel") || "").split(" ").sort()).toEqual(["noopener", "noreferrer"]);
    fireEvent.click(link);
    expect(screen.queryByRole("link", { name: "فتح مساحة المعلم في تبويب جديد" })).toBeNull();     // one use: the link is gone
    expect(posted("/api/owner-handoff/issue")).toHaveLength(1);
  });

  it("a linked account that cannot be used says why, and nothing can be opened", async () => {
    routes["GET /api/owner-handoff"] = () => ({ status: 200, body: { ok: true, linked: { ...MINE, status: "suspended", usable: false, reason: "TEACHER_SUSPENDED" } } });
    show();
    expect((await screen.findByRole("alert")).textContent).toContain("حساب المعلم المرتبط موقوف");
    expect((screen.getByRole("button", { name: "الانتقال إلى مساحة المعلم الخاصة بي" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("unlinking asks first, then sends null", async () => {
    routes["GET /api/owner-handoff"] = () => ({ status: 200, body: { ok: true, linked: MINE } });
    routes["POST /api/owner-handoff/link"] = () => ({ status: 200, body: { ok: true, linked: null } });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "فك الربط" }));
    expect(posted("/api/owner-handoff/link")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "تأكيد: فك الربط" }));
    await screen.findByText("لم تربط حسابك بحساب معلم بعد.");
    expect(posted("/api/owner-handoff/link")[0].body).toEqual({ accountId: null });
  });

  it("a 401 signs the owner out", async () => {
    routes["GET /api/owner-handoff"] = () => ({ status: 401, body: { ok: false, code: "OWNER_SESSION_REVOKED", error: "x" } });
    const { onSignedOut } = show();
    await waitFor(() => expect(onSignedOut).toHaveBeenCalled());
  });
});
