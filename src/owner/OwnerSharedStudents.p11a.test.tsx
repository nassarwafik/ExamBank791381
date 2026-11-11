// @vitest-environment happy-dom
// Tadris+ P11-A — «الطالب يستطيع ان يتعلم عند اكثر من معلم», the owner's side, against a mocked API (test data only, synthetic 9-digit
// identities): a student whose identity number already has an account with another teacher is offered — by the SERVER preview — to
// join this class too with the same account (no password is created); a single add that hits a taken identity shows the same offer;
// the class roster marks a shared student and lets the owner remove that student from this class only.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import OwnerClassStudents from "./OwnerClassStudents";
import OwnerClassRoster from "./OwnerClassRoster";
import type { ApiResult } from "./ownerApi";

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => { status: number; body: unknown }> = {};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const S1 = "11111111-1111-1111-1111-111111111111", S2 = "22222222-2222-2222-2222-222222222222";
const send = async <T,>(call: () => Promise<ApiResult<T>>, onOk: (data: T) => void) => { const r = await call(); if (r.ok) onOk(r.data); };
const existingOf = (userId: string, displayName: string) => ({ userId, displayName, classId: "cA", className: "الثاني عشر 2", active: true, archived: false });
const PREVIEW = (c: Call) => {
  const rows = ((c.body ?? {}).students as Array<Record<string, string>>) || [];
  const known: Record<string, ReturnType<typeof existingOf>> = { "300000001": existingOf(S1, "ليان سعيد"), "300000002": existingOf(S2, "آدم ناصر") };
  const preview = rows.map((r, i) => known[r.identityNumber]
    ? { ...r, index: i, status: "existing", error: "", message: "له حساب مسبقًا.", existingStudent: known[r.identityNumber] }
    : { ...r, index: i, status: "valid", error: "", existingStudent: null });
  return { status: 200, body: { ok: true, preview, valid: preview.filter(x => x.status === "valid").length, existing: preview.filter(x => x.status === "existing").length, duplicates: 0, invalid: 0 } };
};

beforeEach(() => {
  calls = [];
  routes = { "POST /api/owner-classes/preview-import": PREVIEW };
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
const mountStudents = (onChanged = vi.fn()) => { render(<OwnerClassStudents token="owner-tok" classId="cB" className="علوم الحاسوب" busy={false} send={send} onChanged={onChanged} />); return { panel: screen.getByRole("region", { name: "طلاب علوم الحاسوب" }), onChanged }; };

describe("P11-A the owner's import: students who already have an account", () => {
  it("existing students are named with their current class and join this class too — the same accounts, no passwords; the new row is still imported", async () => {
    routes["POST /api/owner-classes/enroll-students"] = () => ({ status: 200, body: { ok: true, enrolled: 2, already: 0, failed: 0, students: [], errors: [] } });
    routes["POST /api/owner-classes/import-students"] = () => ({ status: 200, body: { ok: true, imported: 1, failed: 0, duplicates: 0, recovered: 0, errors: [], credentials: [{ userId: "n1", displayName: "سما حداد", identityNumber: "300000003", code: "300000003", password: "P-1" }] } });
    const { panel, onChanged } = mountStudents();
    const rows = [{ firstName: "ليان", familyName: "سعيد", identityNumber: "300000001" }, { firstName: "آدم", familyName: "ناصر", identityNumber: "300000002" }, { firstName: "سما", familyName: "حداد", identityNumber: "300000003" }];
    fireEvent.change(within(panel).getByLabelText("ملف الطلاب"), { target: { files: [new File([JSON.stringify(rows)], "students.json", { type: "application/json" })] } });
    expect(await within(panel).findByText(/المعاينة: 1 صالح، 0 مكرر، 0 غير صالح \(من 3\)\. 2 لهم حساب مسبقًا عند معلم آخر\./)).toBeTruthy();
    const offer = within(panel).getByRole("group", { name: "طلاب لهم حساب مسبقًا" });
    const listed = within(offer).getByRole("list", { name: "الطلاب الموجودون" }).textContent || "";
    expect(listed).toContain("ليان سعيد");
    expect(listed).toContain("الصف الحالي: الثاني عشر 2");
    expect(offer.textContent).toContain("لا يُنشأ حساب جديد ولا كلمة مرور");
    expect(posted("/api/owner-classes/enroll-students")).toHaveLength(0);                       // nothing before the owner asks
    fireEvent.click(within(offer).getByRole("button", { name: "إضافة 2 طالبًا إلى هذا الصف أيضًا" }));
    await waitFor(() => expect(within(panel).queryByRole("group", { name: "طلاب لهم حساب مسبقًا" })).toBeNull());
    expect(posted("/api/owner-classes/enroll-students")[0].body).toEqual({ classId: "cB", userIds: [S1, S2] });   // by account, never by identity number
    expect(panel.querySelector(".eb-owner-done")?.textContent).toContain("أُضيف 2 طالبًا إلى هذا الصف بحساباتهم نفسها");
    expect(within(panel).queryByRole("group", { name: "كلمات المرور المؤقتة" })).toBeNull();
    expect(onChanged).toHaveBeenCalled();
    fireEvent.click(within(panel).getByRole("button", { name: "استيراد 1 طالبًا" }));
    await within(panel).findByRole("group", { name: "كلمات المرور المؤقتة" });
    expect(((posted("/api/owner-classes/import-students")[0].body ?? {}).students as Array<{ identityNumber: string }>).map(s => s.identityNumber)).toEqual(["300000003"]);
  });

  it("a student the server could not add is reported by name; the others are added", async () => {
    routes["POST /api/owner-classes/enroll-students"] = () => ({ status: 200, body: { ok: true, enrolled: 1, already: 0, failed: 1, students: [], errors: [{ userId: S2, code: "STUDENT_ARCHIVED", error: "الطالب مؤرشف عند معلمه." }] } });
    const { panel } = mountStudents();
    const rows = [{ firstName: "ليان", familyName: "سعيد", identityNumber: "300000001" }, { firstName: "آدم", familyName: "ناصر", identityNumber: "300000002" }];
    fireEvent.change(within(panel).getByLabelText("ملف الطلاب"), { target: { files: [new File([JSON.stringify(rows)], "students.json", { type: "application/json" })] } });
    fireEvent.click(await within(panel).findByRole("button", { name: "إضافة 2 طالبًا إلى هذا الصف أيضًا" }));
    const alert = await within(panel).findByRole("alert");
    expect(alert.textContent).toContain("آدم ناصر: الطالب مؤرشف عند معلمه.");
    expect(panel.querySelector(".eb-owner-done")?.textContent).toContain("أُضيف 1 طالبًا");
  });

  it("a single add that hits a taken identity number shows the same offer instead of a dead end", async () => {
    routes["POST /api/owner-classes/add-student"] = () => ({ status: 409, body: { ok: false, error: "رقم الهوية مستخدم مسبقًا للطالب ليان سعيد في الصف الثاني عشر 2" } });
    routes["POST /api/owner-classes/enroll-students"] = () => ({ status: 200, body: { ok: true, enrolled: 1, already: 0, failed: 0, students: [], errors: [] } });
    const { panel } = mountStudents();
    const form = within(panel).getByRole("form", { name: "إضافة طالب إلى علوم الحاسوب" });
    fireEvent.change(within(form).getByLabelText("الاسم الشخصي"), { target: { value: "ليان" } });
    fireEvent.change(within(form).getByLabelText("اسم العائلة"), { target: { value: "سعيد" } });
    fireEvent.change(within(form).getByLabelText("رقم الهوية"), { target: { value: "300000001" } });
    fireEvent.click(within(form).getByRole("button", { name: "إضافة الطالب" }));
    fireEvent.click(await within(panel).findByRole("button", { name: "إضافة 1 طالبًا إلى هذا الصف أيضًا" }));
    await waitFor(() => expect(posted("/api/owner-classes/enroll-students")).toHaveLength(1));
    expect(posted("/api/owner-classes/enroll-students")[0].body).toEqual({ classId: "cB", userIds: [S1] });
  });

  it("a taken identity that cannot join (already in this class) stays a plain refusal: no offer", async () => {
    routes["POST /api/owner-classes/add-student"] = () => ({ status: 409, body: { ok: false, error: "رقم الهوية مستخدم مسبقًا" } });
    routes["POST /api/owner-classes/preview-import"] = c => ({ status: 200, body: { ok: true, preview: [{ ...((c.body ?? {}).students as Array<Record<string, string>>)[0], index: 0, status: "duplicate", error: "الطالب موجود في هذا الصف مسبقًا.", existingStudent: existingOf(S1, "ليان سعيد") }], valid: 0, existing: 0, duplicates: 1, invalid: 0 } });
    const { panel } = mountStudents();
    const form = within(panel).getByRole("form", { name: "إضافة طالب إلى علوم الحاسوب" });
    fireEvent.change(within(form).getByLabelText("الاسم الشخصي"), { target: { value: "ليان" } });
    fireEvent.change(within(form).getByLabelText("اسم العائلة"), { target: { value: "سعيد" } });
    fireEvent.change(within(form).getByLabelText("رقم الهوية"), { target: { value: "300000001" } });
    fireEvent.click(within(form).getByRole("button", { name: "إضافة الطالب" }));
    await waitFor(() => expect(posted("/api/owner-classes/preview-import")).toHaveLength(1));
    expect(within(panel).queryByRole("group", { name: "طلاب لهم حساب مسبقًا" })).toBeNull();
  });
});

describe("P11-A the owner's class roster: a shared student", () => {
  it("is marked, is not moved or read from here, and is removed from THIS class after a confirmation", async () => {
    routes["GET /api/owner-classes/students?classId=cB"] = () => ({ status: 200, body: { ok: true, classId: "cB", students: [
      { userId: S1, displayName: "ليان سعيد", identityNumber: "300000001", active: true, archived: false, shared: true },
      { userId: S2, displayName: "كريم ناصر", identityNumber: "300000002", active: true, archived: false }
    ] } });
    routes["POST /api/owner-classes/unenroll-student"] = () => ({ status: 200, body: { ok: true, removed: true } });
    const onChanged = vi.fn();
    render(<OwnerClassRoster token="owner-tok" classId="cB" className="علوم الحاسوب" ownerAccountId="t_00112233445566bb" busy={false} send={send} onChanged={onChanged} />);
    const shared = await screen.findByRole("listitem", { name: "ليان سعيد" });
    expect(shared.textContent).toContain("مشترك");
    expect(within(shared).queryByRole("button", { name: "نقل إلى معلم آخر" })).toBeNull();
    expect(within(shared).queryByRole("button", { name: "الاطلاع على المحادثة" })).toBeNull();
    const own = screen.getByRole("listitem", { name: "كريم ناصر" });
    expect(within(own).getByRole("button", { name: "نقل إلى معلم آخر" })).toBeTruthy();
    expect(within(own).queryByRole("button", { name: "إزالة من هذا الصف" })).toBeNull();
    fireEvent.click(within(shared).getByRole("button", { name: "إزالة من هذا الصف" }));
    expect(posted("/api/owner-classes/unenroll-student")).toHaveLength(0);                      // a confirmation first
    fireEvent.click(within(screen.getByRole("group", { name: "إزالة ليان سعيد" })).getByRole("button", { name: "تأكيد الإزالة" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(posted("/api/owner-classes/unenroll-student")[0].body).toEqual({ classId: "cB", userId: S1 });
    expect(String(onChanged.mock.calls[0][0])).toContain("حسابه وصفه الأول كما هما");
  });
});
