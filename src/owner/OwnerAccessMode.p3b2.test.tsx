// @vitest-environment happy-dom
// Tadris+ P3-B2 — «تفعيل التطبيق» in the Owner Console against a mocked API (test data only): disabled while a teacher has no
// access; an inline confirmation before anything is sent; the server's readiness refusal is shown as worded; once enforcing,
// «إيقاف التطبيق» returns to observe.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import OwnerAccessMode from "./OwnerAccessMode";

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

const T = (over = {}) => ({ accountId: "t_000000000000000a", username: "t.a", displayName: "سارة", status: "active", access: { revisionId: "ar_x", preset: { id: "learning-only", version: 1 } }, defaultAccess: null, wouldDeny: [], ...over });
const serve = (mode: string, ready: boolean, teachers = [T()]) => {
  routes["GET /api/owner-access"] = () => ({ status: 200, body: { ok: true, mode, presets: [], capabilities: [] } });
  routes["GET /api/owner-access/readiness"] = () => ({ status: 200, body: { ok: true, mode, ready, teachers } });
};

describe("P3-B2 owner — turning enforcement on and off", () => {
  it("disabled while a teacher has no access, with the reason", async () => {
    serve("observe", false, [T({ access: null, defaultAccess: "none", displayName: "عمر" })]);
    render(<OwnerAccessMode token="t" onSignedOut={vi.fn()} />);
    const btn = await screen.findByRole("button", { name: "تفعيل التطبيق" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/متاح حين يكون لكل معلم نشط حزمة صلاحيات/)).toBeTruthy();
  });

  it("ready → inline confirmation (nothing sent before it) → enforce; then «إيقاف التطبيق» returns to observe", async () => {
    serve("observe", true);
    routes["POST /api/owner-access/mode"] = c => ({ status: 200, body: { ok: true, mode: (c.body as { mode: string }).mode } });
    render(<OwnerAccessMode token="t" onSignedOut={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "تفعيل التطبيق" }));
    expect(calls.some(c => c.url === "/api/owner-access/mode")).toBe(false);
    const confirm = screen.getByRole("group", { name: "تأكيد تفعيل التطبيق" });
    expect(confirm.textContent).toContain("من الطلب التالي يُمنع كل معلم");
    fireEvent.click(within(confirm).getByRole("button", { name: "تأكيد: تفعيل التطبيق" }));
    expect(await screen.findByText(/تطبيق: تُمنع الأداة غير المفعّلة/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "إيقاف التطبيق (العودة إلى المراقبة)" }));
    expect(await screen.findByText(/مراقبة: يُسجَّل ما كان سيُمنع/)).toBeTruthy();
    expect(calls.filter(c => c.url === "/api/owner-access/mode").map(c => c.body)).toEqual([{ mode: "enforce" }, { mode: "observe" }]);
  });

  it("the server's readiness refusal (a teacher appeared meanwhile) is shown as worded", async () => {
    serve("observe", true);
    routes["POST /api/owner-access/mode"] = () => ({ status: 409, body: { ok: false, code: "ACCESS_NOT_READY", error: "لا يمكن تفعيل التطبيق: معلمون بلا حزمة صلاحيات سيُمنعون من كل شيء. اختر لهم حزمة أولًا.", missing: [{ accountId: "t_1", displayName: "عمر" }] } });
    render(<OwnerAccessMode token="t" onSignedOut={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "تفعيل التطبيق" }));
    fireEvent.click(screen.getByRole("button", { name: "تأكيد: تفعيل التطبيق" }));
    expect((await screen.findByRole("alert")).textContent).toContain("لا يمكن تفعيل التطبيق");
  });
});
