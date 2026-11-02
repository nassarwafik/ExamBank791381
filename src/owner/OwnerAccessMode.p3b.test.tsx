// @vitest-environment happy-dom
// Tadris+ P3-B — «وضع الصلاحيات» in the Owner Console against a mocked API (test data only): the mode is shown in words; observe
// can be switched on and off (step-up when asked); readiness names the teachers left without access and lists what observe
// recorded, with the capability labels; enforcement is never offered here.
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

const CAPS = [{ id: "examBuilder.ai.use", module: "examBuilder", moduleLabel: "منشئ الامتحانات", label: "التأليف بالذكاء الاصطناعي", ownerOnly: false }];
const teacher = (over = {}) => ({ accountId: "t_000000000000000a", username: "t.a", displayName: "سارة", status: "active", access: { revisionId: "ar_x", preset: { id: "learning-only", version: 1 } }, defaultAccess: null, wouldDeny: [], ...over });

describe("P3-B owner — access mode and readiness", () => {
  it("legacy → switch observe on (with step-up) → the mode text changes; enforcement is never offered", async () => {
    let stepped = false;
    routes["GET /api/owner-access"] = () => ({ status: 200, body: { ok: true, mode: "legacy", presets: [], capabilities: CAPS } });
    routes["GET /api/owner-access/readiness"] = () => ({ status: 200, body: { ok: true, mode: "legacy", ready: true, teachers: [teacher()] } });
    routes["POST /api/owner-access/mode"] = c => stepped ? { status: 200, body: { ok: true, mode: (c.body as { mode: string }).mode } } : { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "رمز" } };
    routes["POST /api/owner-session/step-up"] = () => { stepped = true; return { status: 200, body: { ok: true } }; };
    render(<OwnerAccessMode token="owner-tok" onSignedOut={vi.fn()} />);
    expect(await screen.findByText(/عادي: الصلاحيات لا تُراقَب/)).toBeTruthy();
    expect(screen.getByText("كل معلم نشط له حزمة صلاحيات.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /تطبيق/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "تشغيل المراقبة" }));
    fireEvent.change(await screen.findByLabelText(/هذا الإجراء حساس/), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "تأكيد" }));
    expect(await screen.findByText(/مراقبة: يُسجَّل ما كان سيُمنع/)).toBeTruthy();
    expect(calls.filter(c => c.url === "/api/owner-access/mode").map(c => c.body)).toEqual([{ mode: "observe" }, { mode: "observe" }]);
    expect(screen.getByRole("button", { name: "إيقاف المراقبة" })).toBeTruthy();
  });

  it("readiness names teachers without access and lists what observe recorded, with labels", async () => {
    routes["GET /api/owner-access"] = () => ({ status: 200, body: { ok: true, mode: "observe", presets: [], capabilities: CAPS } });
    routes["GET /api/owner-access/readiness"] = () => ({ status: 200, body: { ok: true, mode: "observe", ready: false, teachers: [
      teacher({ accountId: "t_00000000000000ff", displayName: "عمر", access: null, defaultAccess: "none" }),
      teacher({ wouldDeny: [{ capability: "examBuilder.ai.use", count: 3, lastAt: "2026-11-02T06:00:00Z" }] }),
      teacher({ accountId: "t_legacy", displayName: "وفيق", access: null, defaultAccess: "legacy-full" })
    ] } });
    render(<OwnerAccessMode token="owner-tok" onSignedOut={vi.fn()} />);
    const region = await screen.findByRole("region", { name: "جاهزية التطبيق" });
    expect(region.textContent).toContain("بلا حزمة صلاحيات");
    expect(region.textContent).toContain("عمر");
    expect(region.textContent).not.toContain("وفيق");
    const list = within(region).getByRole("list", { name: "ما كان سيُمنع" });
    expect(list.textContent).toContain("سارة");
    expect(list.textContent).toContain("منشئ الامتحانات — التأليف بالذكاء الاصطناعي");
    expect(list.textContent).toContain("3 مرة");
  });

  it("the access API unavailable → a quiet note, never an alert; a 401 signs the owner out", async () => {
    render(<OwnerAccessMode token="owner-tok" onSignedOut={vi.fn()} />);
    expect(await screen.findByText(/تعذر تحميل وضع الصلاحيات/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    cleanup();
    routes["GET /api/owner-access"] = () => ({ status: 401, body: { ok: false } });
    routes["GET /api/owner-access/readiness"] = () => ({ status: 401, body: { ok: false } });
    const out = vi.fn();
    render(<OwnerAccessMode token="owner-tok" onSignedOut={out} />);
    await vi.waitFor(() => expect(out).toHaveBeenCalled());
  });
});
