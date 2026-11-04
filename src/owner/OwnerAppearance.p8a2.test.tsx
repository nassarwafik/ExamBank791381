// @vitest-environment happy-dom
// Tadris+ P8-A2 — «خيارات المظهر» on the teacher's access page, against a mocked API (test data only): per part every value (nothing
// sent) or only the checked ones (sent as `appearance`), the part's default always included and never uncheckable; the choice starts
// from the current revision and is sent back unchanged when only a capability changes; copying a teacher copies it.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import OwnerApp from "./OwnerApp";
import { OWNER_TOKEN_KEY } from "./ownerApi";
import { ownerTeacherHash } from "./ownerRoute";

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => { status: number; body: unknown }> = {};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const VIEW = { ok: true, owner: { accountId: "own_0123456789abcdef", username: "tadris.owner", displayName: "مالك" }, session: { expiresAt: "", stepUpValidUntil: null }, recoveryCodesRemaining: 10 };
const SARA = "t_00112233445566aa", OMAR = "t_00112233445566bb";
const R1 = "ar_000000001_00112233445566aa";
const CAPS = [
  { id: "classes.class.view", module: "classes", moduleLabel: "الصفوف", label: "رؤية صفوفه", ownerOnly: false, requires: [] },
  { id: "assignments.assignment.view", module: "assignments", moduleLabel: "الواجبات", label: "رؤية الواجبات", ownerOnly: false, requires: [] }
];
const PRESETS = [{ id: "learning-only", version: 1, label: "التعلّم فقط", description: "x", capabilities: ["classes.class.view"] }];
const PARTS = [
  { part: "theme", values: ["light", "dark"], fallback: "light", capability: "appearance.theme.choose" },
  { part: "palette", values: ["default", "ocean", "forest", "sand"], fallback: "default", capability: "appearance.palette.choose" }
];
const T = (id: string, name: string) => ({ accountId: id, username: "t." + id.slice(-2), displayName: name, fullName: "", email: "", phone: "", subjects: [], notes: "", organizationId: "default", status: "active", hasPassword: true, invitation: null, createdAt: "", updatedAt: "", lastLoginAt: "", origin: "console", access: { revisionId: R1, preset: { id: "learning-only", version: 1 }, grants: 0, denies: 0 } });
const head = (appearance: Record<string, string[]> | null) => ({ revisionId: R1, parentRevisionId: null, preset: { id: "learning-only", version: 1 }, grants: [], denies: [], courses: null, widgets: null, games: null, appearance, reason: "", createdAt: "2026-11-01T10:00:00Z", createdBy: "owner:x", valid: true, capabilities: ["classes.class.view"] });

function installOwner(appearance: Record<string, string[]> | null = null, withCatalog = true) {
  routes = {
    "GET /api/owner-session": () => ({ status: 200, body: VIEW }),
    "GET /api/owner-teachers": () => ({ status: 200, body: { ok: true, teachers: [T(SARA, "سارة"), T(OMAR, "عمر")] } }),
    "GET /api/owner-access": () => ({ status: 200, body: { ok: true, mode: "enforce", presets: PRESETS, capabilities: CAPS, ...(withCatalog ? { appearance: PARTS } : {}) } }),
    ["GET /api/owner-access/history?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, currentRevisionId: R1, entries: [head(appearance)], truncated: false, limit: 50 } }),
    ["GET /api/owner-access/history?accountId=" + OMAR]: () => ({ status: 200, body: { ok: true, accountId: OMAR, currentRevisionId: R1, entries: [head({ palette: ["default", "sand"] })], truncated: false, limit: 50 } }),
    ["GET /api/owner-access/effective?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, accountStatus: "active", mode: "enforce", enforced: true, access: { status: "ok", source: "revision", revisionId: R1, preset: { id: "learning-only", version: 1 }, capabilities: ["classes.class.view"], courses: null, widgets: null, games: null, appearance } } }),
    "POST /api/owner-access/assign": () => ({ status: 200, body: { ok: true, accountId: SARA, access: { revisionId: "ar_000000002_00112233445566aa", preset: { id: "learning-only", version: 1 }, grants: 0, denies: 0 }, capabilities: [] } })
  };
}
beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const c: Call = { url, method: String(init.method || "GET"), body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    const h = routes[c.method + " " + url];
    if (!h) return json(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
    const r = h(c);
    return json(r.status, r.body);
  }));
  sessionStorage.clear();
  sessionStorage.setItem(OWNER_TOKEN_KEY, "owner-tok");
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const posted = () => calls.filter(c => c.method === "POST" && c.url === "/api/owner-access/assign");
const open = async () => { window.location.hash = ownerTeacherHash(SARA); render(<OwnerApp />); await screen.findByRole("heading", { name: "سارة" }); fireEvent.click(screen.getByRole("tab", { name: "الصلاحيات" })); };
const radio = (name: RegExp) => screen.getByRole("radio", { name }) as HTMLInputElement;
const box = (name: RegExp) => screen.getByRole("checkbox", { name }) as HTMLInputElement;
const save = () => fireEvent.click(screen.getByRole("button", { name: "حفظ الصلاحيات" }));

const group = (name: string) => within(screen.getByRole("group", { name }));
describe("P8-A2 «خيارات المظهر»", () => {
  it("every value: nothing sent; restricting a part sends exactly its checked values, its default always among them", async () => {
    installOwner(null);
    await open();
    expect((group("لوحة الألوان").getByRole("radio", { name: /كل خيارات لوحة الألوان/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(group("لوحة الألوان").getByRole("radio", { name: /خيارات محددة من لوحة الألوان/ }));
    const def = group("لوحة الألوان").getByRole("checkbox", { name: /الافتراضية/ }) as HTMLInputElement;
    expect([def.checked, def.disabled]).toEqual([true, true]);
    fireEvent.click(group("لوحة الألوان").getByRole("checkbox", { name: "محيط" }));
    save();
    await waitFor(() => expect(posted()).toHaveLength(1));
    expect(posted()[0].body).toMatchObject({ appearance: { palette: ["default", "ocean"] } });
    expect((posted()[0].body!.appearance as Record<string, unknown>).theme).toBeUndefined();
  });

  it("starts from the current revision; unchanged → nothing to save; a capability change sends it back; «كل الخيارات» omits it", async () => {
    installOwner({ palette: ["default", "sand"] });
    await open();
    expect((group("لوحة الألوان").getByRole("checkbox", { name: "رمل" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("button", { name: "حفظ الصلاحيات" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(box(/رؤية الواجبات/));
    save();
    await waitFor(() => expect(posted()).toHaveLength(1));
    expect(posted()[0].body).toMatchObject({ appearance: { palette: ["default", "sand"] } });
    fireEvent.click(group("لوحة الألوان").getByRole("radio", { name: /كل خيارات لوحة الألوان/ }));
    save();
    await waitFor(() => expect(posted()).toHaveLength(2));
    expect("appearance" in posted()[1].body!).toBe(false);
  });

  it("copying another teacher copies their restriction; without the catalog nothing is offered and the current one is kept", async () => {
    installOwner(null);
    await open();
    fireEvent.change(screen.getByLabelText("ابدأ من صلاحيات معلم آخر"), { target: { value: OMAR } });
    await screen.findByText(/حُمّلت صلاحيات عمر/);
    expect((group("لوحة الألوان").getByRole("checkbox", { name: "رمل" }) as HTMLInputElement).checked).toBe(true);
    cleanup();
    installOwner({ palette: ["default", "sand"] }, false);
    await open();
    expect(screen.queryByRole("group", { name: "لوحة الألوان" })).toBeNull();
    fireEvent.click(box(/رؤية الواجبات/));
    save();
    await waitFor(() => expect(posted()).toHaveLength(1));
    expect(posted()[0].body).toMatchObject({ appearance: { palette: ["default", "sand"] } });
  });
});
