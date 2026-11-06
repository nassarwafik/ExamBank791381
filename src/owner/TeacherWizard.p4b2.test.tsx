// @vitest-environment happy-dom
// Tadris+ P4-B2 — «إضافة معلم» as a wizard, and «copy from a teacher», against a mocked API (test data only):
//   four steps marked by the stepper (the current one aria-current="step"); going back keeps what was typed; the access step
//   offers a preset OR the CURRENT access of an existing teacher (read through the server's re-validated history); a teacher
//   that cannot be copied is refused before anything is sent; the review shows everything; the copy is sent as preset + grants /
//   denies + a note. On a teacher's page, «ابدأ من صلاحيات معلم آخر» loads another teacher's access into the editor — saved only
//   with «حفظ الصلاحيات».
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { findTeachersTable } from "./teacherTable.testkit";   // UX-O1: the teachers list is a table
import OwnerTeachers from "./OwnerTeachers";
import OwnerApp from "./OwnerApp";
import { OWNER_TOKEN_KEY, type ManagedTeacher } from "./ownerApi";
import { ownerTeacherHash } from "./ownerRoute";
import { openAccessSections } from "./accessEditor.testkit";   // UX-O2 — the editor's sections are folded at first

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => { status: number; body: unknown }> = {};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const SARA = "t_00112233445566aa";
const OMAR = "t_00112233445566bb";
const HUDA = "t_00112233445566cc";
const R_OMAR = "ar_000000001_00112233445566bb";
const R_SARA = "ar_000000002_00112233445566aa";
const CAPS = [
  { id: "classes.class.view", module: "classes", moduleLabel: "الصفوف", label: "رؤية صفوفه", ownerOnly: false, requires: [] },
  { id: "messages.inbox.read", module: "messages", moduleLabel: "الرسائل", label: "قراءة الرسائل", ownerOnly: false, requires: [] },
  { id: "learning.course.view", module: "learning", moduleLabel: "التعلّم", label: "رؤية المقررات", ownerOnly: false, requires: [] }
];
const PRESETS = [
  { id: "legacy-full", version: 1, label: "الوصول الحالي", description: "كل ما يستطيعه المعلم اليوم.", capabilities: ["classes.class.view", "messages.inbox.read", "learning.course.view"] },
  { id: "full-teaching", version: 1, label: "تدريس كامل", description: "كل أدوات التدريس.", capabilities: ["classes.class.view", "messages.inbox.read", "learning.course.view"] },
  { id: "learning-only", version: 1, label: "التعلّم فقط", description: "المقررات فقط.", capabilities: ["classes.class.view", "learning.course.view"] }
];
const T = (over: Partial<ManagedTeacher> = {}): ManagedTeacher => ({
  accountId: SARA, username: "t.sara", displayName: "سارة", fullName: "", email: "", phone: "", subjects: [], notes: "", organizationId: "default",
  status: "active", hasPassword: true, invitation: null, createdAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-01T10:00:00Z", lastLoginAt: "", origin: "console", access: null, ...over
});
const OMAR_T = T({ accountId: OMAR, username: "t.omar", displayName: "عمر", access: { revisionId: R_OMAR, preset: { id: "learning-only", version: 1 }, grants: 1, denies: 0 } });
const HUDA_T = T({ accountId: HUDA, username: "t.huda", displayName: "هدى", access: { revisionId: "ar_000000003_00112233445566cc", preset: { id: "learning-only", version: 1 }, grants: 0, denies: 0 } });
const OMAR_HEAD = { revisionId: R_OMAR, parentRevisionId: null, preset: { id: "learning-only", version: 1 }, grants: ["messages.inbox.read"], denies: [], reason: "", createdAt: "2026-10-01T10:00:00Z", createdBy: "owner:x", valid: true, capabilities: ["classes.class.view", "learning.course.view", "messages.inbox.read"] };
const LINK = { invitationPath: "#/invite/" + "A".repeat(43), purpose: "invite", expiresAt: "2026-11-04T10:00:00Z" };
const NEXT = () => fireEvent.click(screen.getByRole("button", { name: "التالي" }));

beforeEach(() => {
  calls = [];
  routes = {
    "GET /api/owner-teachers": () => ({ status: 200, body: { ok: true, teachers: [OMAR_T, HUDA_T, T({ accountId: "t_00112233445566dd", username: "t.new", displayName: "جديد" })] } }),
    "GET /api/owner-access": () => ({ status: 200, body: { ok: true, mode: "observe", presets: PRESETS, capabilities: CAPS } }),
    ["GET /api/owner-access/history?accountId=" + OMAR]: () => ({ status: 200, body: { ok: true, accountId: OMAR, currentRevisionId: R_OMAR, entries: [OMAR_HEAD], truncated: false, limit: 50 } }),
    ["GET /api/owner-access/history?accountId=" + HUDA]: () => ({ status: 200, body: { ok: true, accountId: HUDA, currentRevisionId: HUDA_T.access!.revisionId, entries: [{ ...OMAR_HEAD, revisionId: HUDA_T.access!.revisionId, valid: false, code: "PRESET_UNKNOWN", preset: null, capabilities: [] }], truncated: false, limit: 50 } }),
    "POST /api/owner-teachers/create": () => ({ status: 201, body: { ok: true, teacher: T({ status: "invited", hasPassword: false }), invitation: LINK } })
  };
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

async function openWizard(onOpen?: (id: string) => void) {
  render(<OwnerTeachers token="owner-tok" onSignedOut={vi.fn()} onOpen={onOpen} />);
  await findTeachersTable();
  await waitFor(() => expect(calls.some(c => c.url === "/api/owner-access")).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: /إضافة معلم/ }));
}
const fillIdentity = () => {
  fireEvent.change(screen.getByLabelText(/^اسم المستخدم/), { target: { value: "t.sara" } });
  fireEvent.change(screen.getByLabelText("اسم العرض"), { target: { value: "سارة" } });
};
const currentStep = () => screen.getByRole("list", { name: "خطوات إضافة معلم" }).querySelector("[aria-current='step']")?.textContent;
const posted = (path: string) => calls.filter(c => c.method === "POST" && c.url === path);

describe("P4-B2 the add-teacher wizard", () => {
  it("four steps, the current one marked; the heading takes the focus; going back keeps what was typed", async () => {
    await openWizard();
    const steps = within(screen.getByRole("list", { name: "خطوات إضافة معلم" })).getAllByRole("listitem").map(li => li.textContent);
    expect(steps).toEqual(["الهوية", "بيانات إضافية", "الصلاحيات", "المراجعة"]);
    expect(currentStep()).toBe("الهوية");
    fillIdentity();
    NEXT();
    expect(currentStep()).toBe("بيانات إضافية");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: /^بيانات إضافية/ }));
    fireEvent.change(screen.getByLabelText(/البريد الإلكتروني/), { target: { value: "sara@school.test" } });
    fireEvent.click(screen.getByRole("button", { name: "السابق" }));
    expect((screen.getByLabelText("اسم العرض") as HTMLInputElement).value).toBe("سارة");
    NEXT();
    expect((screen.getByLabelText(/البريد الإلكتروني/) as HTMLInputElement).value).toBe("sara@school.test");
    expect(posted("/api/owner-teachers/create")).toHaveLength(0);
  });

  it("the review shows everything; a preset choice is sent as before", async () => {
    await openWizard();
    fillIdentity(); NEXT(); NEXT();
    fireEvent.change(screen.getByLabelText("حزمة الصلاحيات (اختياري)"), { target: { value: "learning-only@1" } });
    expect(within(screen.getByRole("region", { name: "ما سيتمكن منه المعلم الجديد" })).getAllByRole("listitem").map(li => li.textContent)).toEqual(["الصفوف: 1 من 1", "التعلّم: 1 من 1"]);
    NEXT();
    const review = screen.getByRole("region", { name: "مراجعة بيانات المعلم الجديد" });
    expect(review.textContent).toContain("t.sara");
    expect(review.textContent).toContain("التعلّم فقط");
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب وإصدار رابط الدعوة" }));
    await screen.findByRole("region", { name: "رابط الدعوة" });
    const body = posted("/api/owner-teachers/create")[0].body!;
    expect(body).toMatchObject({ username: "t.sara", displayName: "سارة", presetId: "learning-only", presetVersion: 1 });
    expect(body.grants).toBeUndefined();
  });

  it("copy from a teacher: only teachers with access are offered; their CURRENT access is read, previewed, and sent with a note", async () => {
    await openWizard();
    fillIdentity(); NEXT(); NEXT();
    const source = screen.getByLabelText("أو انسخ صلاحيات معلم موجود") as HTMLSelectElement;
    expect([...source.options].map(o => o.textContent)).toEqual(["لا أريد النسخ", "عمر (t.omar)", "هدى (t.huda)"]);
    fireEvent.change(source, { target: { value: OMAR } });
    const preview = await screen.findByRole("region", { name: "ما سيتمكن منه المعلم الجديد" });
    expect(preview.textContent).toContain("3 صلاحية");
    expect((screen.getByLabelText("حزمة الصلاحيات (اختياري)") as HTMLSelectElement).value).toBe("");     // one or the other
    NEXT();
    expect(screen.getByRole("region", { name: "مراجعة بيانات المعلم الجديد" }).textContent).toContain("نسخة من صلاحيات عمر: التعلّم فقط (+1 / −0)");
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب وإصدار رابط الدعوة" }));
    await screen.findByRole("region", { name: "رابط الدعوة" });
    expect(posted("/api/owner-teachers/create")[0].body).toMatchObject({ presetId: "learning-only", presetVersion: 1, grants: ["messages.inbox.read"], denies: [], accessReason: "نسخ من t.omar" });
  });

  it("a teacher whose access cannot be trusted cannot be copied: said, and the wizard does not go on", async () => {
    await openWizard();
    fillIdentity(); NEXT(); NEXT();
    fireEvent.change(screen.getByLabelText("أو انسخ صلاحيات معلم موجود"), { target: { value: HUDA } });
    expect((await screen.findByRole("alert")).textContent).toContain("غير صالحة، فلا يمكن نسخها");
    NEXT();
    expect(currentStep()).toBe("الصلاحيات");
    expect(screen.getByRole("alert").textContent).toContain("تعذر نسخ صلاحيات المعلم المختار");
    expect(posted("/api/owner-teachers/create")).toHaveLength(0);
  });

  it("choosing a preset after a copy drops the copy", async () => {
    await openWizard();
    fillIdentity(); NEXT(); NEXT();
    fireEvent.change(screen.getByLabelText("أو انسخ صلاحيات معلم موجود"), { target: { value: OMAR } });
    await screen.findByRole("region", { name: "ما سيتمكن منه المعلم الجديد" });
    fireEvent.change(screen.getByLabelText("حزمة الصلاحيات (اختياري)"), { target: { value: "full-teaching@1" } });
    expect((screen.getByLabelText("أو انسخ صلاحيات معلم موجود") as HTMLSelectElement).value).toBe("");
    NEXT();
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب وإصدار رابط الدعوة" }));
    await screen.findByRole("region", { name: "رابط الدعوة" });
    const body = posted("/api/owner-teachers/create")[0].body!;
    expect(body).toMatchObject({ presetId: "full-teaching" });
    expect([body.grants, body.accessReason]).toEqual([undefined, undefined]);
  });

  it("while enforcing, a copy satisfies the required access", async () => {
    routes["GET /api/owner-access"] = () => ({ status: 200, body: { ok: true, mode: "enforce", presets: PRESETS, capabilities: CAPS } });
    await openWizard();
    fillIdentity(); NEXT(); NEXT();
    await screen.findByLabelText("حزمة الصلاحيات");
    NEXT();
    expect(screen.getByRole("alert").textContent).toContain("اختر حزمة صلاحيات");
    fireEvent.change(screen.getByLabelText("أو انسخ صلاحيات معلم موجود"), { target: { value: OMAR } });
    await screen.findByRole("region", { name: "ما سيتمكن منه المعلم الجديد" });
    NEXT();
    expect(currentStep()).toBe("المراجعة");
  });

  it("after creating, the new teacher's page is one click away", async () => {
    const onOpen = vi.fn();
    await openWizard(onOpen);
    fillIdentity(); NEXT(); NEXT(); NEXT();
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب وإصدار رابط الدعوة" }));
    fireEvent.click(await screen.findByRole("button", { name: "فتح صفحة سارة" }));
    expect(onOpen).toHaveBeenCalledWith(SARA);
  });
});

describe("P4-B2 «ابدأ من صلاحيات معلم آخر» on a teacher's page", () => {
  const VIEW = { ok: true, owner: { accountId: "own_0123456789abcdef", username: "tadris.owner", displayName: "مالك المنصة" }, session: { expiresAt: "2026-11-01T12:00:00.000Z", stepUpValidUntil: null }, recoveryCodesRemaining: 10 };
  beforeEach(() => {
    // Sara starts on learning-only WITHOUT the messages; Omar holds learning-only + messages.inbox.read — the copy differs from
    // Sara's current access only in its capabilities (so a copy that loads the preset but not the capabilities is caught).
    const sara = T({ access: { revisionId: R_SARA, preset: { id: "learning-only", version: 1 }, grants: 0, denies: 0 } });
    routes["GET /api/owner-session"] = () => ({ status: 200, body: VIEW });
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [sara, OMAR_T, HUDA_T] } });
    routes["GET /api/owner-access/history?accountId=" + SARA] = () => ({ status: 200, body: { ok: true, accountId: SARA, currentRevisionId: R_SARA, truncated: false, limit: 50, entries: [{ ...OMAR_HEAD, revisionId: R_SARA, preset: { id: "learning-only", version: 1 }, grants: [], capabilities: PRESETS[2].capabilities }] } });
    routes["GET /api/owner-access/effective?accountId=" + SARA] = () => ({ status: 200, body: { ok: true, accountId: SARA, accountStatus: "active", mode: "observe", enforced: false, access: { status: "ok", source: "revision", revisionId: R_SARA, preset: { id: "learning-only", version: 1 }, capabilities: PRESETS[2].capabilities } } });
    routes["POST /api/owner-access/assign"] = () => ({ status: 200, body: { ok: true, accountId: SARA, access: { revisionId: "ar_000000009_00112233445566aa", preset: { id: "learning-only", version: 1 }, grants: 1, denies: 0 }, capabilities: [] } });
    sessionStorage.clear();
    sessionStorage.setItem(OWNER_TOKEN_KEY, "owner-tok");
    window.location.hash = ownerTeacherHash(SARA);
  });

  it("loads the other teacher's current access into the editor (never herself); nothing is saved until «حفظ الصلاحيات»", async () => {
    render(<OwnerApp />);
    await screen.findByRole("heading", { name: "سارة" });
    fireEvent.click(screen.getByRole("tab", { name: "الصلاحيات" }));
    openAccessSections();
    expect((screen.getByRole("checkbox", { name: "قراءة الرسائل" }) as HTMLInputElement).checked).toBe(false);
    const source = screen.getByLabelText("ابدأ من صلاحيات معلم آخر") as HTMLSelectElement;
    expect([...source.options].map(o => o.textContent)).toEqual(["—", "عمر (t.omar)", "هدى (t.huda)"]);
    fireEvent.change(source, { target: { value: OMAR } });
    expect((await screen.findByRole("status")).textContent).toContain("حُمّلت صلاحيات عمر");
    expect((screen.getByRole("radio", { name: /التعلّم فقط/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "قراءة الرسائل" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("سبب التغيير (اختياري، يظهر في السجل)") as HTMLInputElement).value).toBe("نسخ من t.omar");
    expect(posted("/api/owner-access/assign")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "حفظ الصلاحيات" }));
    await waitFor(() => expect(posted("/api/owner-access/assign")).toHaveLength(1));
    expect(posted("/api/owner-access/assign")[0].body).toEqual({ accountId: SARA, presetId: "learning-only", presetVersion: 1, grants: ["messages.inbox.read"], denies: [], reason: "نسخ من t.omar", baseRevisionId: R_SARA });
  });

  it("a teacher whose access cannot be trusted: said, and the editor is unchanged", async () => {
    render(<OwnerApp />);
    await screen.findByRole("heading", { name: "سارة" });
    fireEvent.click(screen.getByRole("tab", { name: "الصلاحيات" }));
    openAccessSections();
    fireEvent.change(screen.getByLabelText("ابدأ من صلاحيات معلم آخر"), { target: { value: HUDA } });
    expect((await screen.findByRole("alert")).textContent).toContain("غير صالحة، فلا يمكن نسخها");
    expect((screen.getByRole("radio", { name: /التعلّم فقط/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "قراءة الرسائل" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("button", { name: "حفظ الصلاحيات" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
