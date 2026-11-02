// @vitest-environment happy-dom
// Trial teacher accounts — one teacher's page in the Owner Console (#/owner/teachers/<id>), against a mocked API (test data
// only): the header shows the trial badge; «الأمان» shows the account kind and the trial controls; extending sends extend-trial;
// a permanent account shows «دائم» and no trial controls.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import OwnerApp from "./OwnerApp";
import { OWNER_TOKEN_KEY } from "./ownerApi";
import { ownerTeacherHash } from "./ownerRoute";

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => { status: number; body: unknown }> = {};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const SARA = "t_00112233445566aa";
const VIEW = { ok: true, owner: { accountId: "own_0123456789abcdef", username: "tadris.owner", displayName: "مالك المنصة" }, session: { expiresAt: "2026-11-01T12:00:00.000Z", stepUpValidUntil: null }, recoveryCodesRemaining: 10 };
const teacher = (over: Record<string, unknown> = {}) => ({
  accountId: SARA, username: "t.sara", displayName: "سارة", fullName: "", email: "", phone: "", subjects: [], notes: "", organizationId: "default",
  status: "active", hasPassword: true, invitation: null, createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-02T10:00:00.000Z", lastLoginAt: "", origin: "console",
  access: null, suspendedAt: "", suspendedReason: "", trial: null, ...over
});
const HISTORY = { ok: true, accountId: SARA, currentRevisionId: null, truncated: false, limit: 50, entries: [] };
const EFFECTIVE = { ok: true, accountId: SARA, accountStatus: "active", mode: "legacy", enforced: false, access: { status: "ok", source: "none", revisionId: null, preset: null, capabilities: [] } };

function serve(t: ReturnType<typeof teacher>) {
  routes = {
    "GET /api/owner-session": () => ({ status: 200, body: VIEW }),
    "GET /api/owner-teachers": () => ({ status: 200, body: { ok: true, teachers: [t] } }),
    "GET /api/owner-access": () => ({ status: 200, body: { ok: true, mode: "legacy", presets: [], capabilities: [] } }),
    ["GET /api/owner-access/history?accountId=" + SARA]: () => ({ status: 200, body: HISTORY }),
    ["GET /api/owner-access/effective?accountId=" + SARA]: () => ({ status: 200, body: EFFECTIVE })
  };
}

beforeEach(() => {
  calls = [];
  sessionStorage.clear();
  sessionStorage.setItem(OWNER_TOKEN_KEY, "owner-tok");
  window.location.hash = ownerTeacherHash(SARA);
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

const openSecurity = async () => {
  render(<OwnerApp />);
  await screen.findByRole("heading", { name: "سارة" });
  fireEvent.click(screen.getByRole("tab", { name: "الأمان" }));
  return screen.getByRole("tabpanel");
};

describe("trial teacher accounts — the teacher's page", () => {
  it("a trial account: header badge, «نوع الحساب: تجريبي», and «تمديد التجربة» sends extend-trial", async () => {
    serve(teacher({ trial: { days: 14, endsAt: "2026-11-15T10:00:00.000Z", ended: false } }));
    routes["POST /api/owner-teachers/extend-trial"] = () => ({ status: 200, body: { ok: true, teacher: teacher({ trial: { days: 44, endsAt: "2026-12-15T10:00:00.000Z", ended: false } }) } });
    const panel = await openSecurity();
    expect(screen.getByText(/^تجريبي حتى/)).toBeTruthy();
    expect(within(panel).getByText("تجريبي")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "تمديد التجربة" }));
    fireEvent.change(within(panel).getByLabelText("مدة التمديد"), { target: { value: "30" } });
    fireEvent.click(within(panel).getByRole("button", { name: "تأكيد التمديد" }));
    expect(await screen.findByText("مُدّدت الفترة التجريبية.")).toBeTruthy();
    expect(calls.find(c => c.url === "/api/owner-teachers/extend-trial")!.body).toEqual({ accountId: SARA, days: 30 });
  });

  it("a permanent account: «نوع الحساب: دائم» and no trial controls", async () => {
    serve(teacher());
    const panel = await openSecurity();
    expect(within(panel).getByText("دائم")).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "تمديد التجربة" })).toBeNull();
  });
});
