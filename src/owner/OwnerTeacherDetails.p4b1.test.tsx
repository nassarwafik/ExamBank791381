// @vitest-environment happy-dom
// Tadris+ P4-B1 — one teacher's page in the Owner Console, against a mocked API (test data only):
//   its own address (#/owner/teachers/<id>; only a valid id; setup / access take none) · four tabs · individual capabilities with
//   their dependencies kept consistent · the difference from what the server gives the teacher NOW · saved against the revision the
//   page was opened on · history with restore (a confirmation showing the difference) · suspension with a reason · step-up retry.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { findTeachersTable, teacherAction } from "./teacherTable.testkit";   // UX-O1: the teachers list is a table
import OwnerApp from "./OwnerApp";
import { OWNER_TOKEN_KEY } from "./ownerApi";
import { isOwnerLocation, ownerViewFromHash, ownerTeacherFromHash, ownerTeacherHash } from "./ownerRoute";
import { withCapability, withoutCapability, grantsAndDenies } from "./teacherShared";
import { openAccessSections } from "./accessEditor.testkit";   // UX-O2 — the editor's sections are folded at first

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => { status: number; body: unknown }> = {};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const SARA = "t_00112233445566aa";
const R1 = "ar_000000001_00112233445566aa";
const R2 = "ar_000000002_00112233445566bb";
const VIEW = { ok: true, owner: { accountId: "own_0123456789abcdef", username: "tadris.owner", displayName: "مالك المنصة" }, session: { expiresAt: "2026-11-01T12:00:00.000Z", stepUpValidUntil: null }, recoveryCodesRemaining: 10 };
const CAPS = [
  { id: "classes.class.view", module: "classes", moduleLabel: "الصفوف", label: "رؤية صفوفه", ownerOnly: false, requires: [] },
  { id: "messages.inbox.read", module: "messages", moduleLabel: "الرسائل", label: "قراءة الرسائل", ownerOnly: false, requires: [] },
  { id: "messages.inbox.send", module: "messages", moduleLabel: "الرسائل", label: "إرسال الرسائل", ownerOnly: false, requires: ["messages.inbox.read"] },
  { id: "learning.course.view", module: "learning", moduleLabel: "التعلّم", label: "رؤية المقررات", ownerOnly: false, requires: ["classes.class.view"] },
  { id: "platform.operations.run", module: "platform", moduleLabel: "المنصة", label: "تشغيل المنصة", ownerOnly: true, requires: [] }
];
const PRESETS = [
  { id: "full-teaching", version: 1, label: "تدريس كامل", description: "كل أدوات التدريس.", capabilities: ["classes.class.view", "messages.inbox.read", "messages.inbox.send", "learning.course.view"] },
  { id: "learning-only", version: 1, label: "التعلّم فقط", description: "المقررات فقط.", capabilities: ["classes.class.view", "learning.course.view"] }
];
const teacher = (over: Record<string, unknown> = {}) => ({
  accountId: SARA, username: "t.sara", displayName: "سارة", fullName: "سارة أحمد", email: "", phone: "", subjects: ["شبكات"], notes: "", organizationId: "default",
  status: "active", hasPassword: true, invitation: null, createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-02T10:00:00.000Z", lastLoginAt: "", origin: "console",
  access: { revisionId: R2, preset: { id: "learning-only", version: 1 }, grants: 0, denies: 0 }, suspendedAt: "", suspendedReason: "", ...over
});
const entry = (revisionId: string, presetId: string, caps: string[], over: Record<string, unknown> = {}) => ({
  revisionId, parentRevisionId: null, preset: { id: presetId, version: 1 }, grants: [], denies: [], reason: "", createdAt: "2026-10-0" + (revisionId === R1 ? "1" : "2") + "T10:00:00.000Z", createdBy: "owner:own_0123456789abcdef", valid: true, capabilities: caps, ...over
});
const HISTORY = { ok: true, accountId: SARA, currentRevisionId: R2, truncated: false, limit: 50, entries: [entry(R2, "learning-only", ["classes.class.view", "learning.course.view"], { parentRevisionId: R1 }), entry(R1, "full-teaching", PRESETS[0].capabilities, { reason: "البداية" })] };
const EFFECTIVE = { ok: true, accountId: SARA, accountStatus: "active", mode: "enforce", enforced: true, access: { status: "ok", source: "revision", revisionId: R2, preset: { id: "learning-only", version: 1 }, capabilities: ["classes.class.view", "learning.course.view"] } };

beforeEach(() => {
  calls = [];
  routes = {
    "GET /api/owner-session": () => ({ status: 200, body: VIEW }),
    "GET /api/owner-teachers": () => ({ status: 200, body: { ok: true, teachers: [teacher()] } }),
    "GET /api/owner-access": () => ({ status: 200, body: { ok: true, mode: "enforce", presets: PRESETS, capabilities: CAPS } }),
    ["GET /api/owner-access/history?accountId=" + SARA]: () => ({ status: 200, body: HISTORY }),
    ["GET /api/owner-access/effective?accountId=" + SARA]: () => ({ status: 200, body: EFFECTIVE })
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

const openPage = async () => { render(<OwnerApp />); return screen.findByRole("heading", { name: "سارة" }); };
const tab = (name: string) => { fireEvent.click(screen.getByRole("tab", { name })); if (name === "الصلاحيات") openAccessSections(); };
const box = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;
const posted = (path: string) => calls.filter(c => c.method === "POST" && c.url === path);

describe("P4-B1 the teacher's address", () => {
  it("#/owner/teachers/<valid id> (or t_legacy) is the teacher's page; nothing else takes an id", () => {
    for (const id of [SARA, "t_legacy"]) {
      const h = ownerTeacherHash(id);
      expect([isOwnerLocation(h), ownerViewFromHash(h), ownerTeacherFromHash(h)]).toEqual([true, "teachers", id]);
    }
    expect(ownerTeacherFromHash("#/owner/teachers")).toBeNull();
    for (const h of ["#/owner/setup/" + SARA, "#/owner/access/" + SARA, "#/owner/teachers/t_XYZ", "#/owner/teachers/" + SARA + "/x", "#/owner/teachers/t_0011"]) {
      expect(isOwnerLocation(h)).toBe(false);
    }
  });

  it("«صفحة المعلم» in the list opens it at its address; a reload opens it; «كل المعلمين» returns to the list", async () => {
    window.location.hash = "#/owner/teachers";
    render(<OwnerApp />);
    await findTeachersTable();
    teacherAction("سارة", "صفحة المعلم");   // UX-O1: «صفحة المعلم» is in the teacher's «⋯» menu
    expect(await screen.findByRole("heading", { name: "سارة" })).toBeTruthy();
    expect(window.location.hash).toBe(ownerTeacherHash(SARA));
    expect(screen.getAllByRole("tab").map(t => t.textContent)).toEqual(["البيانات", "الصفوف", "الامتحانات", "الصلاحيات", "السجل", "الأمان"]);   // Tadris+ P5-B2 added «الصفوف», P6-D «الامتحانات»
    fireEvent.click(screen.getByRole("button", { name: "→ كل المعلمين" }));
    expect(await screen.findByRole("heading", { name: "المعلمون" })).toBeTruthy();
    expect(window.location.hash).toBe("#/owner/teachers");
  });

  it("an unknown teacher: «غير موجود», with a way back", async () => {
    window.location.hash = ownerTeacherHash("t_99887766554433aa");
    render(<OwnerApp />);
    expect((await screen.findByRole("alert")).textContent).toContain("حساب المعلم غير موجود");
    expect(screen.getByRole("button", { name: "→ كل المعلمين" })).toBeTruthy();
  });
});

describe("P4-B1 «البيانات»", () => {
  it("edits the details (the username stays fixed)", async () => {
    routes["POST /api/owner-teachers/update"] = c => ({ status: 200, body: { ok: true, teacher: teacher({ displayName: String(c.body?.displayName), updatedAt: "2026-10-03T10:00:00.000Z" }) } });
    await openPage();
    expect((screen.getByLabelText("اسم المستخدم (لا يتغير)") as HTMLInputElement).readOnly).toBe(true);
    fireEvent.change(screen.getByLabelText("اسم العرض"), { target: { value: "سارة م." } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ البيانات" }));
    await screen.findByText("حُفظت بيانات المعلم.");
    expect(posted("/api/owner-teachers/update")[0].body).toEqual({ accountId: SARA, displayName: "سارة م.", fullName: "سارة أحمد", email: "", phone: "", subjects: ["شبكات"], notes: "" });
    expect(screen.getByRole("heading", { name: "سارة م." })).toBeTruthy();
  });
});

describe("P4-B1 «الصلاحيات»", () => {
  it("starts from the current revision; owner-only capabilities are never offered; dependencies stay consistent", async () => {
    await openPage();
    tab("الصلاحيات");
    expect((screen.getByRole("radio", { name: /التعلّم فقط/ }) as HTMLInputElement).checked).toBe(true);
    expect(box("رؤية المقررات").checked).toBe(true);
    expect(box("إرسال الرسائل").checked).toBe(false);
    expect(screen.queryByRole("checkbox", { name: "تشغيل المنصة" })).toBeNull();
    expect((screen.getByRole("button", { name: "حفظ الصلاحيات" }) as HTMLButtonElement).disabled).toBe(true);   // nothing changed
    fireEvent.click(box("إرسال الرسائل"));                                   // on → also what it needs
    expect([box("إرسال الرسائل").checked, box("قراءة الرسائل").checked]).toEqual([true, true]);
    fireEvent.click(box("رؤية صفوفه"));                                      // off → also what needs it
    expect([box("رؤية صفوفه").checked, box("رؤية المقررات").checked]).toEqual([false, false]);
  });

  it("shows the difference from what the teacher has NOW and what they will be able to do; saves grants / denies against the open revision", async () => {
    routes["POST /api/owner-access/assign"] = () => ({ status: 200, body: { ok: true, accountId: SARA, access: { revisionId: "ar_000000003_00112233445566cc", preset: { id: "learning-only", version: 1 }, grants: 1, denies: 0 }, capabilities: [] } });
    await openPage();
    tab("الصلاحيات");
    fireEvent.click(box("قراءة الرسائل"));
    const diff = screen.getByRole("region", { name: "تغيّر صلاحيات سارة" });
    const gained = within(diff).getByRole("list", { name: "سيكسبها المعلم" });
    expect(gained.textContent).toContain("الرسائل — قراءة الرسائل");
    expect(gained.textContent).not.toContain("رؤية المقررات");                // already held now → not listed
    expect(within(screen.getByRole("region", { name: "ما سيتمكن منه المعلم" })).getAllByRole("listitem").map(li => li.textContent)).toEqual(["الصفوف: 1 من 1", "الرسائل: 1 من 2", "التعلّم: 1 من 1"]);
    expect(screen.getByText(/التطبيق مفعّل: يسري التغيير من الطلب التالي/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("سبب التغيير (اختياري، يظهر في السجل)"), { target: { value: "يحتاج الرسائل" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ الصلاحيات" }));
    await screen.findByText("حُفظت الصلاحيات (نسخة جديدة في السجل).");
    expect(posted("/api/owner-access/assign")[0].body).toEqual({ accountId: SARA, presetId: "learning-only", presetVersion: 1, grants: ["messages.inbox.read"], denies: [], reason: "يحتاج الرسائل", baseRevisionId: R2 });
  });

  it("a different preset resets the checkboxes; removing one of its capabilities is a deny", async () => {
    routes["POST /api/owner-access/assign"] = () => ({ status: 200, body: { ok: true, accountId: SARA, access: { revisionId: R2, preset: { id: "full-teaching", version: 1 }, grants: 0, denies: 1 }, capabilities: [] } });
    await openPage();
    tab("الصلاحيات");
    fireEvent.click(screen.getByRole("radio", { name: /تدريس كامل/ }));
    expect(box("إرسال الرسائل").checked).toBe(true);
    fireEvent.click(box("إرسال الرسائل"));
    fireEvent.click(screen.getByRole("button", { name: "حفظ الصلاحيات" }));
    await waitFor(() => expect(posted("/api/owner-access/assign")).toHaveLength(1));
    expect(posted("/api/owner-access/assign")[0].body).toMatchObject({ presetId: "full-teaching", grants: [], denies: ["messages.inbox.send"] });
  });

  it("a change asks for the second-factor code when needed, then retries the same change", async () => {
    let n = 0;
    routes["POST /api/owner-access/assign"] = () => (++n === 1
      ? { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "تحقق" } }
      : { status: 200, body: { ok: true, accountId: SARA, access: { revisionId: R2, preset: { id: "learning-only", version: 1 }, grants: 1, denies: 0 }, capabilities: [] } });
    routes["POST /api/owner-session/step-up"] = () => ({ status: 200, body: VIEW });
    await openPage();
    tab("الصلاحيات");
    fireEvent.click(box("قراءة الرسائل"));
    fireEvent.click(screen.getByRole("button", { name: "حفظ الصلاحيات" }));
    const form = await screen.findByRole("form", { name: "التحقق بخطوتين" });
    fireEvent.change(within(form).getByRole("textbox"), { target: { value: "123456" } });
    fireEvent.click(within(form).getByRole("button", { name: "تأكيد" }));
    await screen.findByText("حُفظت الصلاحيات (نسخة جديدة في السجل).");
    expect(posted("/api/owner-session/step-up")[0].body).toEqual({ code: "123456" });
    expect(posted("/api/owner-access/assign")).toHaveLength(2);
    expect(posted("/api/owner-access/assign")[1].body).toEqual(posted("/api/owner-access/assign")[0].body);
  });

  it("a stale page (409) shows the server's message and reloads", async () => {
    routes["POST /api/owner-access/assign"] = () => ({ status: 409, body: { ok: false, code: "ACCESS_CONFLICT", error: "تغيّرت صلاحيات هذا المعلم منذ فتحت الصفحة." } });
    await openPage();
    tab("الصلاحيات");
    fireEvent.click(box("قراءة الرسائل"));
    const before = calls.filter(c => c.url.startsWith("/api/owner-access/history")).length;
    fireEvent.click(screen.getByRole("button", { name: "حفظ الصلاحيات" }));
    await waitFor(() => expect(calls.filter(c => c.url.startsWith("/api/owner-access/history")).length).toBe(before + 1));
    expect((await screen.findByRole("alert")).textContent).toContain("تغيّرت صلاحيات هذا المعلم");
  });

  it("a current revision the server cannot trust is called out", async () => {
    routes["GET /api/owner-access/history?accountId=" + SARA] = () => ({ status: 200, body: { ...HISTORY, entries: [{ ...HISTORY.entries[0], valid: false, code: "REVISION_INVALID", preset: null, capabilities: [] }] } });
    await openPage();
    tab("الصلاحيات");
    expect(screen.getByRole("alert").textContent).toContain("نسخة الصلاحيات الحالية غير صالحة");
    expect(screen.getByText("اختر حزمة أساسية أولًا.")).toBeTruthy();
  });
});

describe("P4-B1 «السجل»", () => {
  it("the revisions, the current one marked; «استعادة» confirms with the difference, then restores against the open revision", async () => {
    routes["POST /api/owner-access/rollback"] = () => ({ status: 200, body: { ok: true, accountId: SARA, restoredFrom: R1, access: { revisionId: "ar_000000003_00112233445566cc", preset: { id: "full-teaching", version: 1 }, grants: 0, denies: 0 }, capabilities: [] } });
    await openPage();
    tab("السجل");
    const table = screen.getByRole("table", { name: "سجل نسخ الصلاحيات (الأحدث أولًا)" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("الحالية");
    expect(rows[1].textContent).toContain("البداية");
    expect(within(rows[0]).queryByRole("button")).toBeNull();
    fireEvent.click(within(rows[1]).getByRole("button", { name: /^استعادة نسخة/ }));
    const confirm = screen.getByRole("group", { name: "تأكيد الاستعادة" });
    const gained = within(confirm).getByRole("list", { name: "سيكسبها المعلم" });
    expect(gained.textContent).toContain("الرسائل — إرسال الرسائل");
    expect(gained.textContent).not.toContain("رؤية المقررات");
    expect(posted("/api/owner-access/rollback")).toHaveLength(0);
    fireEvent.click(within(confirm).getByRole("button", { name: "تأكيد الاستعادة" }));
    await screen.findByText("استُعيدت النسخة (نسخة جديدة في السجل).");
    expect(posted("/api/owner-access/rollback")[0].body).toEqual({ accountId: SARA, revisionId: R1, baseRevisionId: R2, reason: "" });
  });
});

describe("P4-B1 «الأمان»", () => {
  it("suspend asks for confirmation with an optional reason (the owner's own record) and sends it", async () => {
    routes["POST /api/owner-teachers/suspend"] = c => ({ status: 200, body: { ok: true, teacher: teacher({ status: "suspended", suspendedAt: "2026-10-04T10:00:00.000Z", suspendedReason: String(c.body?.reason || "") }) } });
    await openPage();
    tab("الأمان");
    fireEvent.click(screen.getByRole("button", { name: "إيقاف الحساب" }));
    const confirm = screen.getByRole("group", { name: "تأكيد إيقاف الحساب" });
    fireEvent.change(within(confirm).getByLabelText(/سبب الإيقاف/), { target: { value: "إجازة طويلة" } });
    fireEvent.click(within(confirm).getByRole("button", { name: "تأكيد: إيقاف الحساب" }));
    await screen.findByText("تم: إيقاف الحساب.");
    expect(posted("/api/owner-teachers/suspend")[0].body).toEqual({ accountId: SARA, reason: "إجازة طويلة" });
  });

  it("a suspended teacher shows when and why, and only «إعادة التفعيل»", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [teacher({ status: "suspended", suspendedAt: "2026-10-04T10:00:00.000Z", suspendedReason: "إجازة طويلة" })] } });
    await openPage();
    tab("الأمان");
    expect(screen.getByText("إجازة طويلة")).toBeTruthy();
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getAllByRole("button").map(b => b.textContent)).toEqual(["إعادة التفعيل"]);
  });
});

describe("P4-B1 capability editing rules", () => {
  it("on adds what it needs (transitively); off removes what needs it (transitively); grants / denies against the preset", () => {
    const caps = [
      { id: "a", module: "m", moduleLabel: "M", label: "A", ownerOnly: false, requires: [] },
      { id: "b", module: "m", moduleLabel: "M", label: "B", ownerOnly: false, requires: ["a"] },
      { id: "c", module: "m", moduleLabel: "M", label: "C", ownerOnly: false, requires: ["b"] }
    ];
    expect([...withCapability(new Set(), "c", caps)].sort()).toEqual(["a", "b", "c"]);
    expect([...withoutCapability(new Set(["a", "b", "c", "x"]), "a", caps)]).toEqual(["x"]);
    expect([...withoutCapability(new Set(["a", "b", "c"]), "c", caps)].sort()).toEqual(["a", "b"]);
    expect(grantsAndDenies(["a", "b"], new Set(["b", "z", "y"]))).toEqual({ grants: ["y", "z"], denies: ["a"] });
  });
});
