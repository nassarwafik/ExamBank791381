// @vitest-environment happy-dom
// Tadris+ P5-B3a — «نقل إلى معلم آخر» on a class of the teacher's page, against a mocked API (test data only): the current teacher is
// not offered; choosing a teacher shows what moves (preview, nothing written); the confirmation is retried unchanged after the
// second-factor check; an incomplete transfer is completed by the same request.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import OwnerApp from "./OwnerApp";
import { OWNER_TOKEN_KEY } from "./ownerApi";
import { ownerTeacherHash } from "./ownerRoute";

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => { status: number; body: unknown }> = {};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const SARA = "t_00112233445566aa", OMAR = "t_00112233445566bb";
const VIEW = { ok: true, owner: { accountId: "own_0123456789abcdef", username: "tadris.owner", displayName: "مالك المنصة" }, session: { expiresAt: "2026-11-03T12:00:00.000Z", stepUpValidUntil: null }, recoveryCodesRemaining: 10 };
const teacher = (accountId: string, displayName: string, username: string) => ({ accountId, username, displayName, fullName: "", email: "", phone: "", subjects: [], notes: "", organizationId: "default", status: "active", hasPassword: true, invitation: null, createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-02T10:00:00.000Z", lastLoginAt: "", origin: "console", access: null, suspendedAt: "", suspendedReason: "" });
const CLASS = { classId: "cA", name: "الحادي عشر أ", grade: "11", schoolYear: "2026-2027", status: "active", studentCount: 3, programCodes: [], createdAt: "2026-11-01T10:00:00.000Z", archivedAt: "" };
const PREVIEW = { classId: "cA", className: "الحادي عشر أ", status: "active", from: SARA, to: OMAR, students: { total: 3, archived: 1, foreign: 0 }, assignments: { total: 2, byStatus: { published: 1, draft: 1 } }, pendingGrading: 1 };

beforeEach(() => {
  calls = [];
  routes = {
    "GET /api/owner-session": () => ({ status: 200, body: VIEW }),
    "GET /api/owner-teachers": () => ({ status: 200, body: { ok: true, teachers: [teacher(SARA, "سارة", "t.sara"), teacher(OMAR, "عمر", "t.omar")] } }),
    "GET /api/owner-access": () => ({ status: 200, body: { ok: true, mode: "enforce", presets: [], capabilities: [] } }),
    ["GET /api/owner-access/history?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, currentRevisionId: null, truncated: false, limit: 50, entries: [] } }),
    ["GET /api/owner-access/effective?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, accountStatus: "active", mode: "enforce", enforced: true, access: { status: "ok", source: "revision", revisionId: null, preset: null, capabilities: [] } } }),
    ["GET /api/owner-classes?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, classes: [CLASS] } }),
    ["GET /api/owner-classes/transfer-preview?classId=cA&toAccountId=" + OMAR]: () => ({ status: 200, body: { ok: true, preview: PREVIEW } })
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

async function openTransfer() {
  render(<OwnerApp />);
  await screen.findByRole("heading", { name: "سارة" });
  fireEvent.click(screen.getByRole("tab", { name: "الصفوف" }));
  const item = await screen.findByRole("listitem", { name: "الحادي عشر أ" });
  fireEvent.click(within(item).getByRole("button", { name: "نقل إلى معلم آخر" }));
  const group = screen.getByRole("group", { name: "نقل الحادي عشر أ" });
  const select = within(group).getByLabelText("المعلم الجديد") as HTMLSelectElement;
  await within(group).findByRole("option", { name: "عمر (t.omar)" });
  return { group, select };
}

describe("P5-B3a «نقل إلى معلم آخر»", () => {
  it("the current teacher is not offered; choosing one shows what moves; nothing is sent before the confirmation", async () => {
    const { group, select } = await openTransfer();
    expect([...select.options].map(o => o.value)).toEqual(["", OMAR]);
    fireEvent.change(select, { target: { value: OMAR } });
    const what = await within(group).findByRole("region", { name: "ما سينتقل" });
    expect(what.textContent).toContain("3 طالبًا (منهم 1 مؤرشف)");
    expect(what.textContent).toContain("2 واجبًا: 1 منشور، 1 مسودة");
    expect(what.textContent).toContain("1 عملًا ينتظر التصحيح: يصححه المعلم الجديد");
    expect(posted("/api/owner-classes/transfer")).toHaveLength(0);
  });
  it("the confirmation is retried unchanged after the second-factor check", async () => {
    let n = 0;
    routes["POST /api/owner-classes/transfer"] = () => (++n === 1 ? { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "تحقق" } } : { status: 200, body: { ok: true, ledger: { transferId: "tr-1", complete: true, resumed: false, students: { moved: 3, skipped: 0, failed: 0 } } } });
    routes["POST /api/owner-session/step-up"] = () => ({ status: 200, body: VIEW });
    const { group, select } = await openTransfer();
    fireEvent.change(select, { target: { value: OMAR } });
    await within(group).findByRole("region", { name: "ما سينتقل" });
    fireEvent.change(within(group).getByLabelText(/سبب النقل/), { target: { value: "معلم بديل" } });
    fireEvent.click(within(group).getByRole("button", { name: "تأكيد: نقل الصف" }));
    const stepUp = await screen.findByRole("form", { name: "التحقق بخطوتين" });
    fireEvent.change(within(stepUp).getByRole("textbox"), { target: { value: "123456" } });
    fireEvent.click(within(stepUp).getByRole("button", { name: "تأكيد" }));
    await screen.findByText("نُقل الصف «الحادي عشر أ» إلى عمر مع 3 طالبًا وكل تاريخه.");
    const sent = posted("/api/owner-classes/transfer");
    expect(sent).toHaveLength(2);
    expect(sent[0].body).toEqual({ classId: "cA", toAccountId: OMAR, expectedFromAccountId: SARA, reason: "معلم بديل" });
    expect(sent[1].body).toEqual(sent[0].body);
  });
  it("an incomplete transfer is completed by the same request («إكمال النقل»)", async () => {
    let n = 0;
    routes["POST /api/owner-classes/transfer"] = () => ({ status: 200, body: { ok: true, ledger: ++n === 1 ? { transferId: "tr-1", complete: false, resumed: false, students: { moved: 2, skipped: 0, failed: 1 } } : { transferId: "tr-2", complete: true, resumed: true, students: { moved: 1, skipped: 0, failed: 0 } } } });
    const { group, select } = await openTransfer();
    fireEvent.change(select, { target: { value: OMAR } });
    await within(group).findByRole("region", { name: "ما سينتقل" });
    fireEvent.click(within(group).getByRole("button", { name: "تأكيد: نقل الصف" }));
    expect((await within(group).findByRole("alert")).textContent).toContain("لم يكتمل نقل 1 طالبًا");
    fireEvent.click(within(group).getByRole("button", { name: "إكمال النقل" }));
    await screen.findByText(/نُقل الصف «الحادي عشر أ» إلى عمر/);
    const sent = posted("/api/owner-classes/transfer");
    expect(sent).toHaveLength(2);
    expect(sent[1].body).toEqual(sent[0].body);
  });
});
