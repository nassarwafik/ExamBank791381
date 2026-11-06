// @vitest-environment happy-dom
// Trial teacher accounts — «معلم تجريبي جديد» in the Owner Console against a mocked /api/owner-teachers (test data only):
//   the add-teacher wizard (P4-B2) as a trial sends trialDays → the list shows the trial badge and its end → «تمديد التجربة» sends extend-trial with the
//   chosen days → «تحويل إلى حساب دائم» asks first, then sends end-trial → an ended trial says so → a permanent account shows no
//   trial controls → STEP_UP_REQUIRED asks for the code and retries the same trial change.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import OwnerTeachers from "./OwnerTeachers";
import { findTeachersTable, teacherGroups, teacherAction, teacherActionLabels } from "./teacherTable.testkit";
import type { ManagedTeacher } from "./ownerApi";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => { status: number; body: unknown }> = {};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

beforeEach(() => {
  calls = []; routes = {};
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const c: Call = { url, method: String(init.method || "GET"), headers: (init.headers || {}) as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    const h = routes[c.method + " " + url];
    if (!h) return json(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
    const r = h(c);
    return json(r.status, r.body);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const T = (over: Partial<ManagedTeacher> = {}): ManagedTeacher => ({
  accountId: "t_00112233445566aa", username: "t.trial", displayName: "سارة", fullName: "", email: "", phone: "", subjects: [], notes: "", organizationId: "default",
  status: "active", hasPassword: true, invitation: null, createdAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-01T10:00:00Z", lastLoginAt: "", trial: null, ...over
});
const LINK = { invitationPath: "#/invite/" + "A".repeat(43), purpose: "invite" as const, expiresAt: "2026-11-04T10:00:00Z" };
const RUNNING = { days: 14, endsAt: "2026-11-15T10:00:00Z", ended: false };
const show = () => render(<OwnerTeachers token="owner-tok" onSignedOut={vi.fn()} />);
const listItem = async () => teacherGroups(await findTeachersTable())[0];   // UX-O1: a teacher is a row group of the table
const openTrial = (name = "سارة") => teacherAction(name, "التجربة: تمديد أو تحويل");   // UX-O1: the trial controls open from the «⋯» menu

describe("trial teacher accounts — owner console", () => {
  it("«معلم تجريبي جديد» opens the add-teacher wizard as a trial with a duration; the review says so; the request carries trialDays", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [] } });
    routes["POST /api/owner-teachers/create"] = () => ({ status: 201, body: { ok: true, teacher: T({ status: "invited", hasPassword: false, trial: { days: 30, endsAt: "2026-12-01T10:00:00Z", ended: false } }), invitation: LINK } });
    show();
    await screen.findByText(/لا يوجد معلمون/);
    fireEvent.click(screen.getByRole("button", { name: "معلم تجريبي جديد" }));
    const form = screen.getByRole("form", { name: "معلم تجريبي جديد" });
    expect((within(form).getByRole("radio", { name: /^تجريبي/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.change(within(form).getByLabelText(/^اسم المستخدم/), { target: { value: "t.trial" } });
    fireEvent.change(within(form).getByLabelText("اسم العرض"), { target: { value: "معلم تجريبي" } });
    fireEvent.change(within(form).getByLabelText(/^مدة التجربة/), { target: { value: "30" } });
    for (let i = 0; i < 3; i++) fireEvent.click(within(form).getByRole("button", { name: "التالي" }));   // details → access → review
    expect(within(form).getByText("تجريبي — 30 يومًا")).toBeTruthy();
    fireEvent.click(within(form).getByRole("button", { name: "إنشاء الحساب التجريبي وإصدار رابط الدعوة" }));
    await screen.findByRole("region", { name: "رابط الدعوة" });
    const create = calls.find(c => c.url === "/api/owner-teachers/create")!;
    expect(create.body).toMatchObject({ username: "t.trial", displayName: "معلم تجريبي", trialDays: 30 });
    expect(within(await listItem()).getByText(/^تجريبي حتى/)).toBeTruthy();
  });

  it("«إضافة معلم» stays a permanent account (review: «دائم»), and switching the wizard to permanent sends no trialDays", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [] } });
    routes["POST /api/owner-teachers/create"] = () => ({ status: 201, body: { ok: true, teacher: T({ status: "invited", hasPassword: false }), invitation: LINK } });
    show();
    await screen.findByText(/لا يوجد معلمون/);
    fireEvent.click(screen.getByRole("button", { name: "إضافة معلم" }));
    expect((screen.getByRole("radio", { name: /^دائم/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByLabelText(/^مدة التجربة/)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /^تجريبي/ }));
    expect(screen.getByLabelText(/^مدة التجربة/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /^دائم/ }));
    expect(screen.queryByLabelText(/^مدة التجربة/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/^اسم المستخدم/), { target: { value: "t.perm" } });
    fireEvent.change(screen.getByLabelText("اسم العرض"), { target: { value: "دائم" } });
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    const review = screen.getByRole("region", { name: "مراجعة بيانات المعلم الجديد" });
    expect(within(review).getByText("نوع الحساب").nextElementSibling?.textContent).toBe("دائم");
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب وإصدار رابط الدعوة" }));
    await screen.findByRole("region", { name: "رابط الدعوة" });
    expect(calls.find(c => c.url === "/api/owner-teachers/create")!.body).not.toHaveProperty("trialDays");
  });

  it("a permanent teacher shows no trial badge and no trial controls", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [T()] } });
    show();
    const item = await listItem();
    expect(teacherActionLabels("سارة")).not.toContain("التجربة: تمديد أو تحويل");
    expect(within(item).queryByRole("button", { name: "تمديد التجربة" })).toBeNull();
    expect(within(item).queryByText(/تجريبي/)).toBeNull();
  });

  it("«تمديد التجربة» sends extend-trial with the chosen days and shows the new end", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [T({ trial: RUNNING })] } });
    routes["POST /api/owner-teachers/extend-trial"] = () => ({ status: 200, body: { ok: true, teacher: T({ trial: { days: 21, endsAt: "2026-11-22T10:00:00Z", ended: false } }) } });
    show();
    const item = await listItem();
    openTrial();
    fireEvent.click(within(item).getByRole("button", { name: "تمديد التجربة" }));
    fireEvent.change(within(item).getByLabelText("مدة التمديد"), { target: { value: "7" } });
    fireEvent.click(within(item).getByRole("button", { name: "تأكيد التمديد" }));
    await screen.findByText(/2026|٢٠٢٦/, { selector: "bdi" });
    const ext = calls.find(c => c.url === "/api/owner-teachers/extend-trial")!;
    expect(ext.body).toEqual({ accountId: "t_00112233445566aa", days: 7 });
    expect(ext.headers["x-owner-token"]).toBe("owner-tok");
  });

  it("«تحويل إلى حساب دائم» asks first, then sends end-trial; the trial controls disappear", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [T({ trial: RUNNING })] } });
    routes["POST /api/owner-teachers/end-trial"] = () => ({ status: 200, body: { ok: true, teacher: T({ trial: null }) } });
    show();
    const item = await listItem();
    openTrial();
    fireEvent.click(within(item).getByRole("button", { name: "تحويل إلى حساب دائم" }));
    expect(calls.some(c => c.url === "/api/owner-teachers/end-trial")).toBe(false);
    fireEvent.click(within(item).getByRole("button", { name: "تأكيد: تحويل إلى حساب دائم" }));
    const after = await findTeachersTable();
    await vi.waitFor(() => expect(within(after).queryByRole("button", { name: "تمديد التجربة" })).toBeNull());
    expect(calls.find(c => c.url === "/api/owner-teachers/end-trial")!.body).toEqual({ accountId: "t_00112233445566aa" });
  });

  it("an ended trial says so in the badge and in the explanation", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [T({ trial: { days: 7, endsAt: "2026-10-20T10:00:00Z", ended: true } })] } });
    show();
    const item = await listItem();
    expect(within(item).getByText("انتهت التجربة")).toBeTruthy();
    openTrial();
    expect(within(item).getByText(/لا يستطيع المعلم الدخول حتى تمدّدها/)).toBeTruthy();
  });

  it("STEP_UP_REQUIRED on a trial change asks for the code, then retries the same change", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [T({ trial: RUNNING })] } });
    let attempts = 0;
    routes["POST /api/owner-teachers/end-trial"] = () => (++attempts === 1
      ? { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "مطلوب تحقق." } }
      : { status: 200, body: { ok: true, teacher: T({ trial: null }) } });
    routes["POST /api/owner-session/step-up"] = () => ({ status: 200, body: { ok: true } });
    show();
    const item = await listItem();
    openTrial();
    fireEvent.click(within(item).getByRole("button", { name: "تحويل إلى حساب دائم" }));
    fireEvent.click(within(item).getByRole("button", { name: "تأكيد: تحويل إلى حساب دائم" }));
    const code = await screen.findByLabelText(/أدخل رمز التحقق/);
    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "تأكيد" }));
    await vi.waitFor(() => expect(attempts).toBe(2));
    expect(calls.filter(c => c.url === "/api/owner-teachers/end-trial").map(c => c.body)).toEqual([{ accountId: "t_00112233445566aa" }, { accountId: "t_00112233445566aa" }]);
  });

  it("a trial ending soon: a «ينتهي خلال …» badge and the alert at the top of the list names it", async () => {
    const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 - 60_000).toISOString();
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [
      T({ trial: { days: 7, endsAt: soon, ended: false, endingSoon: true } }),
      T({ accountId: "t_00112233445566bb", username: "t.omar", displayName: "عمر", trial: { days: 30, endsAt: "2027-01-01T10:00:00Z", ended: false, endingSoon: false } })
    ] } });
    show();
    const alert = await screen.findByRole("alert", { name: "تنبيه الحسابات التجريبية" });
    expect(alert.textContent).toContain("حساب تجريبي ينتهي خلال أسبوع");
    expect(alert.textContent).toContain("سارة");
    expect(alert.textContent).not.toContain("عمر");
    const items = teacherGroups();
    const sara = items.find(i => i.textContent?.includes("سارة"))!;
    expect(within(sara).getByText("ينتهي خلال يومين").className).toContain("eb-owner-status--trial-soon");
    openTrial();
    expect(within(sara).getByText(/ينتهي قريبًا/)).toBeTruthy();
  });

  it("ended trials are named in the alert; no trial ending or ended → no alert", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [T({ trial: { days: 7, endsAt: "2026-10-20T10:00:00Z", ended: true, endingSoon: false } })] } });
    show();
    expect((await screen.findByRole("alert", { name: "تنبيه الحسابات التجريبية" })).textContent).toContain("حساب تجريبي انتهى");
    cleanup();
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [T({ trial: RUNNING }), T({ accountId: "t_00112233445566bb", username: "t.omar", displayName: "عمر" })] } });
    show();
    await listItem();
    expect(screen.queryByRole("alert", { name: "تنبيه الحسابات التجريبية" })).toBeNull();
  });
});
