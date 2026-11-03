// @vitest-environment happy-dom
// Tadris+ P5-B3b — «الطلاب» on a class of the teacher's page, against a mocked API (test data only): the roster, and «نقل إلى معلم
// آخر» for one student: the current teacher is not offered, the new teacher's ACTIVE classes only, the preview explains what moves,
// pending work blocks the confirmation, and the confirmation is retried unchanged after the second-factor check.
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
const S = "11111111-1111-1111-1111-111111111111";
const VIEW = { ok: true, owner: { accountId: "own_0123456789abcdef", username: "tadris.owner", displayName: "مالك المنصة" }, session: { expiresAt: "2026-11-03T12:00:00.000Z", stepUpValidUntil: null }, recoveryCodesRemaining: 10 };
const teacher = (accountId: string, displayName: string, username: string) => ({ accountId, username, displayName, fullName: "", email: "", phone: "", subjects: [], notes: "", organizationId: "default", status: "active", hasPassword: true, invitation: null, createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-02T10:00:00.000Z", lastLoginAt: "", origin: "console", access: null, suspendedAt: "", suspendedReason: "" });
const cls = (classId: string, name: string, status = "active") => ({ classId, name, grade: "11", schoolYear: "2026-2027", status, studentCount: 1, programCodes: [], createdAt: "2026-11-01T10:00:00.000Z", archivedAt: "" });
const PREVIEW = (pending = 0) => ({ userId: S, displayName: "ليان سعيد", archived: false, fromClassId: "cA", fromClassName: "صف سارة", from: SARA, toClassId: "cB", toClassName: "صف عمر", to: OMAR, pendingGrading: pending });

beforeEach(() => {
  calls = [];
  routes = {
    "GET /api/owner-session": () => ({ status: 200, body: VIEW }),
    "GET /api/owner-teachers": () => ({ status: 200, body: { ok: true, teachers: [teacher(SARA, "سارة", "t.sara"), teacher(OMAR, "عمر", "t.omar")] } }),
    "GET /api/owner-access": () => ({ status: 200, body: { ok: true, mode: "enforce", presets: [], capabilities: [] } }),
    ["GET /api/owner-access/history?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, currentRevisionId: null, truncated: false, limit: 50, entries: [] } }),
    ["GET /api/owner-access/effective?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, accountStatus: "active", mode: "enforce", enforced: true, access: { status: "ok", source: "revision", revisionId: null, preset: null, capabilities: [] } } }),
    ["GET /api/owner-classes?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, classes: [cls("cA", "صف سارة")] } }),
    ["GET /api/owner-classes?accountId=" + OMAR]: () => ({ status: 200, body: { ok: true, accountId: OMAR, classes: [cls("cB", "صف عمر"), cls("cOld", "صف قديم", "archived")] } }),
    "GET /api/owner-classes/students?classId=cA": () => ({ status: 200, body: { ok: true, classId: "cA", students: [{ userId: S, displayName: "ليان سعيد", identityNumber: "300000001", active: true, archived: false }] } }),
    ["GET /api/owner-classes/student-transfer-preview?userId=" + S + "&toClassId=cB"]: () => ({ status: 200, body: { ok: true, preview: PREVIEW() } })
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

async function openStudentMove() {
  render(<OwnerApp />);
  await screen.findByRole("heading", { name: "سارة" });
  fireEvent.click(screen.getByRole("tab", { name: "الصفوف" }));
  const item = await screen.findByRole("listitem", { name: "صف سارة" });
  fireEvent.click(within(item).getByRole("button", { name: "الطلاب" }));
  const row = await screen.findByRole("listitem", { name: "ليان سعيد" });
  fireEvent.click(within(row).getByRole("button", { name: "نقل إلى معلم آخر" }));
  const group = screen.getByRole("group", { name: "نقل ليان سعيد" });
  await within(group).findByRole("option", { name: "عمر (t.omar)" });
  return group;
}
async function chooseOmarClass(group: HTMLElement) {
  const teacherSelect = within(group).getByLabelText("المعلم الجديد") as HTMLSelectElement;
  expect([...teacherSelect.options].map(o => o.value)).toEqual(["", OMAR]);
  fireEvent.change(teacherSelect, { target: { value: OMAR } });
  const classSelect = (await within(group).findByLabelText("صف المعلم الجديد")) as HTMLSelectElement;
  expect([...classSelect.options].map(o => o.value)).toEqual(["", "cB"]);
  fireEvent.change(classSelect, { target: { value: "cB" } });
  return within(group).findByRole("region", { name: "ما سيحدث" });
}

describe("P5-B3b moving one student", () => {
  it("roster → the new teacher's active classes → the preview explains it; confirmed and retried unchanged after step-up", async () => {
    let n = 0;
    routes["POST /api/owner-classes/student-transfer"] = () => (++n === 1 ? { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "تحقق" } } : { status: 200, body: { ok: true, ledger: { transferId: "tr-1", complete: true } } });
    routes["POST /api/owner-session/step-up"] = () => ({ status: 200, body: VIEW });
    const group = await openStudentMove();
    const what = await chooseOmarClass(group);
    expect(what.textContent).toContain("من «صف سارة» إلى «صف عمر»");
    expect(what.textContent).toContain("ولا يرى علامات صفه القديم ولا المحادثات قبل النقل");
    expect(what.textContent).toContain("مُعلَّمة «منقول»");
    fireEvent.click(within(group).getByRole("button", { name: "تأكيد: نقل الطالب" }));
    const stepUp = await screen.findByRole("form", { name: "التحقق بخطوتين" });
    fireEvent.change(within(stepUp).getByRole("textbox"), { target: { value: "123456" } });
    fireEvent.click(within(stepUp).getByRole("button", { name: "تأكيد" }));
    await screen.findByText("نُقل الطالب ليان سعيد إلى عمر.");
    const sent = posted("/api/owner-classes/student-transfer");
    expect(sent).toHaveLength(2);
    expect(sent[0].body).toEqual({ userId: S, fromClassId: "cA", toClassId: "cB", reason: "" });
    expect(sent[1].body).toEqual(sent[0].body);
  });
  it("work awaiting the current teacher blocks the confirmation", async () => {
    routes["GET /api/owner-classes/student-transfer-preview?userId=" + S + "&toClassId=cB"] = () => ({ status: 200, body: { ok: true, preview: PREVIEW(2) } });
    const group = await openStudentMove();
    await chooseOmarClass(group);
    expect(within(group).getByRole("alert").textContent).toContain("لدى الطالب 2 عمل بانتظار التصحيح");
    expect((within(group).getByRole("button", { name: "تأكيد: نقل الطالب" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
