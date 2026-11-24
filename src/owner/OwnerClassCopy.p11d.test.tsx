// @vitest-environment happy-dom
// Tadris+ P11-D — «نسخ الطلاب إلى معلم آخر» on a class of the teacher's page, against a mocked API (test data only): the current
// teacher is not offered; choosing a teacher and one of their classes shows the SERVER preview (nothing written); the copy is sent by
// class ids only and retried unchanged after the second-factor check; «صف جديد» creates the class first, once, then copies into it.
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
const OMAR_CLASS = { ...CLASS, classId: "cB", name: "برمجة 11", studentCount: 5 };
const PREVIEW = { fromClassId: "cA", fromClassName: "الحادي عشر أ", from: SARA, classId: "cB", className: "برمجة 11", to: OMAR, total: 4, toAdd: 2, already: 1, archived: 1, atLimit: 0 };
const COPIED = { ok: true, enrolled: 2, already: 1, archived: 1, failed: 0, students: [], errors: [] };

beforeEach(() => {
  calls = [];
  routes = {
    "GET /api/owner-session": () => ({ status: 200, body: VIEW }),
    "GET /api/owner-teachers": () => ({ status: 200, body: { ok: true, teachers: [teacher(SARA, "سارة", "t.sara"), teacher(OMAR, "عمر", "t.omar")] } }),
    "GET /api/owner-access": () => ({ status: 200, body: { ok: true, mode: "enforce", presets: [], capabilities: [] } }),
    ["GET /api/owner-access/history?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, currentRevisionId: null, truncated: false, limit: 50, entries: [] } }),
    ["GET /api/owner-access/effective?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, accountStatus: "active", mode: "enforce", enforced: true, access: { status: "ok", source: "revision", revisionId: null, preset: null, capabilities: [] } } }),
    ["GET /api/owner-classes?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, classes: [CLASS] } }),
    ["GET /api/owner-classes?accountId=" + OMAR]: () => ({ status: 200, body: { ok: true, accountId: OMAR, classes: [OMAR_CLASS, { ...OMAR_CLASS, classId: "cOld", name: "قديم", status: "archived" }] } }),
    "GET /api/owner-classes/copy-students-preview?fromClassId=cA&classId=cB": () => ({ status: 200, body: { ok: true, preview: PREVIEW } }),
    "GET /api/owner-classes/copy-students-preview?fromClassId=cA": () => ({ status: 200, body: { ok: true, preview: { ...PREVIEW, classId: "", className: "", to: "", toAdd: 3, already: 0 } } })
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

async function openCopy() {
  render(<OwnerApp />);
  await screen.findByRole("heading", { name: "سارة" });
  fireEvent.click(screen.getByRole("tab", { name: "الصفوف" }));
  const item = await screen.findByRole("listitem", { name: "الحادي عشر أ" });
  fireEvent.click(within(item).getByRole("button", { name: "نسخ الطلاب إلى معلم آخر" }));
  const group = screen.getByRole("group", { name: "نسخ طلاب الحادي عشر أ" });
  const teacherSelect = within(group).getByLabelText("المعلم الآخر") as HTMLSelectElement;
  await within(group).findByRole("option", { name: "عمر (t.omar)" });
  return { group, teacherSelect };
}
async function chooseOmar(group: HTMLElement, teacherSelect: HTMLSelectElement) {
  fireEvent.change(teacherSelect, { target: { value: OMAR } });
  await within(group).findByRole("option", { name: "برمجة 11 · 5 طالبًا" });
  return within(group).getByLabelText("الصف عند عمر") as HTMLSelectElement;
}

describe("P11-D «نسخ الطلاب إلى معلم آخر»", () => {
  it("the current teacher is not offered; only the other teacher's ACTIVE classes and a new class; the preview says who joins; nothing is sent before the confirmation", async () => {
    const { group, teacherSelect } = await openCopy();
    expect([...teacherSelect.options].map(o => o.value)).toEqual(["", OMAR]);
    const classSelect = await chooseOmar(group, teacherSelect);
    expect([...classSelect.options].map(o => o.textContent)).toEqual(["اختر صفًا…", "برمجة 11 · 5 طالبًا", "صف جديد باسم «الحادي عشر أ»"]);
    fireEvent.change(classSelect, { target: { value: "cB" } });
    const what = await within(group).findByRole("region", { name: "ما سيُنسخ" });
    expect(what.textContent).toContain("2 طالبًا بحساباتهم نفسها");
    expect(what.textContent).toContain("1 طالبًا في الصف مسبقًا: لا تغيير");
    expect(what.textContent).toContain("1 طالبًا مؤرشفًا: لا يُنسخ");
    expect(calls.filter(c => c.method === "POST")).toHaveLength(0);
  });
  it("the copy is sent by class ids only, and retried unchanged after the second-factor check", async () => {
    let n = 0;
    routes["POST /api/owner-classes/copy-students"] = () => (++n === 1 ? { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "تحقق" } } : { status: 200, body: COPIED });
    routes["POST /api/owner-session/step-up"] = () => ({ status: 200, body: VIEW });
    const { group, teacherSelect } = await openCopy();
    fireEvent.change(await chooseOmar(group, teacherSelect), { target: { value: "cB" } });
    await within(group).findByRole("region", { name: "ما سيُنسخ" });
    fireEvent.click(within(group).getByRole("button", { name: "تأكيد: نسخ 2 طالبًا" }));
    const stepUp = await screen.findByRole("form", { name: "التحقق بخطوتين" });
    fireEvent.change(within(stepUp).getByRole("textbox"), { target: { value: "123456" } });
    fireEvent.click(within(stepUp).getByRole("button", { name: "تأكيد" }));
    await screen.findByText(/نُسخ 2 طالبًا من «الحادي عشر أ» إلى «برمجة 11» عند عمر، و1 كانوا فيه مسبقًا/);
    const sent = posted("/api/owner-classes/copy-students");
    expect(sent).toHaveLength(2);
    expect(sent[0].body).toEqual({ fromClassId: "cA", classId: "cB" });
    expect(sent[1].body).toEqual(sent[0].body);
    expect(posted("/api/owner-classes/create")).toHaveLength(0);
  });
  it("«صف جديد»: the class is created for the other teacher with this class's labels, then the students are copied into it; a failed copy is retried without a second class", async () => {
    let n = 0;
    routes["POST /api/owner-classes/create"] = () => ({ status: 201, body: { ok: true, classroom: { ...CLASS, classId: "cNew", studentCount: 0 } } });
    routes["POST /api/owner-classes/copy-students"] = () => (++n === 1 ? { status: 503, body: { ok: false, code: "UNAVAILABLE", error: "تعذر الآن." } } : { status: 200, body: { ...COPIED, enrolled: 3, already: 0 } });
    const { group, teacherSelect } = await openCopy();
    fireEvent.change(await chooseOmar(group, teacherSelect), { target: { value: "__new__" } });
    const what = await within(group).findByRole("region", { name: "ما سيُنسخ" });
    expect(what.textContent).toContain("سيُنشأ عند عمر صف جديد «الحادي عشر أ» (الصف 11 · 2026-2027)");
    fireEvent.click(within(group).getByRole("button", { name: "تأكيد: نسخ 3 طالبًا" }));
    await screen.findByText("تعذر الآن.");
    fireEvent.click(within(group).getByRole("button", { name: "تأكيد: نسخ 3 طالبًا" }));
    await screen.findByText(/نُسخ 3 طالبًا من «الحادي عشر أ» إلى «الحادي عشر أ» عند عمر\./);
    const created = posted("/api/owner-classes/create");
    expect(created).toHaveLength(1);
    expect(created[0].body).toMatchObject({ accountId: OMAR, name: "الحادي عشر أ", grade: "11", schoolYear: "2026-2027" });
    expect(posted("/api/owner-classes/copy-students").map(c => c.body)).toEqual([{ fromClassId: "cA", classId: "cNew" }, { fromClassId: "cA", classId: "cNew" }]);
  });
});
