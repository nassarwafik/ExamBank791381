// @vitest-environment happy-dom
// Tadris+ P5-B2 — owner decision D18 (revised): the «الصفوف» tab of a teacher's page in the Owner Console, against a mocked API
// (test data only): the teacher's classes (active, then archived); create a class for the teacher (one request key per submission,
// retried unchanged after the second-factor check); edit labels; archive / graduate after a confirmation; restore; a refusal
// (PENDING_GRADING) is shown and nothing is assumed.
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
const VIEW = { ok: true, owner: { accountId: "own_0123456789abcdef", username: "tadris.owner", displayName: "مالك المنصة" }, session: { expiresAt: "2026-11-03T12:00:00.000Z", stepUpValidUntil: null }, recoveryCodesRemaining: 10 };
const teacher = { accountId: SARA, username: "t.sara", displayName: "سارة", fullName: "سارة أحمد", email: "", phone: "", subjects: [], notes: "", organizationId: "default", status: "active", hasPassword: true, invitation: null, createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-02T10:00:00.000Z", lastLoginAt: "", origin: "console", access: { revisionId: "", preset: { id: "full-teaching", version: 1 }, grants: 0, denies: 0 }, suspendedAt: "", suspendedReason: "" };
const cls = (classId: string, name: string, over: Record<string, unknown> = {}) => ({ classId, name, grade: "11", schoolYear: "2026-2027", status: "active", studentCount: 0, programCodes: [], createdAt: "2026-11-01T10:00:00.000Z", archivedAt: "", ...over });
let classes: ReturnType<typeof cls>[] = [];

beforeEach(() => {
  calls = [];
  classes = [cls("c1", "الحادي عشر أ", { studentCount: 24 }), cls("c0", "العاشر ب", { status: "archived", archivedAt: "2026-06-30T10:00:00.000Z" })];
  routes = {
    "GET /api/owner-session": () => ({ status: 200, body: VIEW }),
    "GET /api/owner-teachers": () => ({ status: 200, body: { ok: true, teachers: [teacher] } }),
    "GET /api/owner-access": () => ({ status: 200, body: { ok: true, mode: "enforce", presets: [], capabilities: [] } }),
    ["GET /api/owner-access/history?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, currentRevisionId: null, truncated: false, limit: 50, entries: [] } }),
    ["GET /api/owner-access/effective?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, accountStatus: "active", mode: "enforce", enforced: true, access: { status: "ok", source: "revision", revisionId: null, preset: { id: "full-teaching", version: 1 }, capabilities: [] } } }),
    ["GET /api/owner-classes?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, classes } })
  };
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

const posted = (path: string) => calls.filter(c => c.method === "POST" && c.url === path);
async function openClassesTab() {
  render(<OwnerApp />);
  await screen.findByRole("heading", { name: "سارة" });
  fireEvent.click(screen.getByRole("tab", { name: "الصفوف" }));
  return screen.findByRole("list", { name: "الصفوف النشطة" });
}

describe("P5-B2 the teacher's classes tab", () => {
  it("lists the teacher's active classes, then the archived ones", async () => {
    const active = await openClassesTab();
    expect(within(active).getByRole("listitem", { name: "الحادي عشر أ" }).textContent).toContain("24 طلاب");
    const archived = screen.getByRole("list", { name: "الصفوف المؤرشفة" });
    expect(within(archived).getByRole("button", { name: "استعادة" })).toBeTruthy();
  });

  it("creates a class for the teacher; after the second-factor check the SAME request (same key) is retried", async () => {
    let n = 0;
    routes["POST /api/owner-classes/create"] = c => (++n === 1
      ? { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "تحقق" } }
      : (classes = [...classes, cls("c9", String(c.body?.name))], { status: 201, body: { ok: true, classroom: cls("c9", String(c.body?.name)) } }));
    routes["POST /api/owner-session/step-up"] = () => ({ status: 200, body: VIEW });
    await openClassesTab();
    fireEvent.click(screen.getByRole("button", { name: "إنشاء صف" }));
    const form = screen.getByRole("form", { name: "إنشاء صف" });
    fireEvent.click(within(form).getByRole("button", { name: "إنشاء الصف" }));
    expect(within(form).getByRole("alert").textContent).toContain("أدخل اسم الصف");
    expect(posted("/api/owner-classes/create")).toHaveLength(0);
    fireEvent.change(within(form).getByLabelText("اسم الصف"), { target: { value: "الحادي عشر ج" } });
    fireEvent.change(within(form).getByLabelText("الصف الدراسي"), { target: { value: "11" } });
    fireEvent.change(within(form).getByLabelText("السنة الدراسية"), { target: { value: "2026-2027" } });
    fireEvent.click(within(form).getByRole("button", { name: "إنشاء الصف" }));
    const stepUp = await screen.findByRole("form", { name: "التحقق بخطوتين" });
    fireEvent.change(within(stepUp).getByRole("textbox"), { target: { value: "123456" } });
    fireEvent.click(within(stepUp).getByRole("button", { name: "تأكيد" }));
    await screen.findByText("أُنشئ الصف الحادي عشر ج.");
    const sent = posted("/api/owner-classes/create");
    expect(sent).toHaveLength(2);
    expect(sent[0].body).toMatchObject({ accountId: SARA, name: "الحادي عشر ج", grade: "11", schoolYear: "2026-2027" });
    expect(String(sent[0].body?.requestKey)).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/);
    expect(sent[1].body).toEqual(sent[0].body);
    expect(await screen.findByRole("listitem", { name: "الحادي عشر ج" })).toBeTruthy();
  });

  it("edits a class's labels", async () => {
    routes["POST /api/owner-classes/update"] = () => ({ status: 200, body: { ok: true, classId: "c1", changed: true } });
    const active = await openClassesTab();
    fireEvent.click(within(within(active).getByRole("listitem", { name: "الحادي عشر أ" })).getByRole("button", { name: "تعديل" }));
    const form = screen.getByRole("form", { name: "تعديل الحادي عشر أ" });
    fireEvent.change(within(form).getByLabelText("اسم الصف"), { target: { value: "الحادي عشر د" } });
    fireEvent.click(within(form).getByRole("button", { name: "حفظ" }));
    await screen.findByText("حُفظت بيانات الصف.");
    expect(posted("/api/owner-classes/update")[0].body).toEqual({ classId: "c1", name: "الحادي عشر د", grade: "11", schoolYear: "2026-2027" });
  });

  it("archive needs a confirmation; a PENDING_GRADING refusal is shown and the class stays listed as active", async () => {
    routes["POST /api/owner-classes/archive"] = () => ({ status: 409, body: { ok: false, code: "PENDING_GRADING", pendingCount: 2, error: "لا يمكن أرشفة الصف الآن: لدى طالبين أعمال بانتظار التصحيح." } });
    const active = await openClassesTab();
    const item = within(active).getByRole("listitem", { name: "الحادي عشر أ" });
    fireEvent.click(within(item).getByRole("button", { name: "أرشفة" }));
    expect(posted("/api/owner-classes/archive")).toHaveLength(0);
    fireEvent.click(within(item).getByRole("button", { name: "تأكيد: أرشفة الصف" }));
    expect((await screen.findByRole("alert")).textContent).toContain("لا يمكن أرشفة الصف الآن");
    expect(posted("/api/owner-classes/archive")[0].body).toEqual({ classId: "c1" });
    expect(within(screen.getByRole("list", { name: "الصفوف النشطة" })).getByRole("listitem", { name: "الحادي عشر أ" })).toBeTruthy();
  });

  it("graduates a class after a confirmation, and restores an archived one", async () => {
    routes["POST /api/owner-classes/graduate"] = () => ({ status: 200, body: { ok: true, status: "archived" } });
    routes["POST /api/owner-classes/unarchive"] = () => ({ status: 200, body: { ok: true, status: "active" } });
    const active = await openClassesTab();
    const item = within(active).getByRole("listitem", { name: "الحادي عشر أ" });
    fireEvent.click(within(item).getByRole("button", { name: "تخريج" }));
    fireEvent.click(within(item).getByRole("button", { name: "تأكيد: تخريج الصف" }));
    await screen.findByText("تخرّج الصف وأُرشف.");
    fireEvent.click(within(screen.getByRole("list", { name: "الصفوف المؤرشفة" })).getByRole("button", { name: "استعادة" }));
    await screen.findByText("استُعيد الصف.");
    expect(posted("/api/owner-classes/graduate")[0].body).toEqual({ classId: "c1" });
    expect(posted("/api/owner-classes/unarchive")[0].body).toEqual({ classId: "c0" });
  });
});
