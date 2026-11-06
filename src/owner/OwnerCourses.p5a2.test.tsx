// @vitest-environment happy-dom
// Tadris+ P5-A2 — the course screens against a mocked API (test data only):
//   «المقررات» (#/owner/courses): every course with its status; archiving asks first, publishing does not; step-up retried;
//   the teacher's page: «المقررات المخوَّلة» — every published course (nothing sent) or only the checked ones (sent as `courses`);
//   the choice starts from the current revision; copying a teacher copies their courses; without the catalog nothing is offered;
//   the teacher's library shows only the courses the server says this teacher may use (a failure → the list as before).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { findTeachersTable } from "./teacherTable.testkit";   // UX-O1: the teachers list is a table
import OwnerApp from "./OwnerApp";
import LearningMaterialsPage from "../learning/LearningMaterialsPage";
import { OWNER_TOKEN_KEY } from "./ownerApi";
import { ownerTeacherHash } from "./ownerRoute";

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => { status: number; body: unknown }> = {};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const VIEW = { ok: true, owner: { accountId: "own_0123456789abcdef", username: "tadris.owner", displayName: "مالك" }, session: { expiresAt: "", stepUpValidUntil: null }, recoveryCodesRemaining: 10 };
const SARA = "t_00112233445566aa", OMAR = "t_00112233445566bb";
const R1 = "ar_000000001_00112233445566aa";
const CATALOG = [
  { courseId: "791381", title: "شبكات الاتصال", subject: "أنظمة محوسبة", modules: 28, status: "published", updatedAt: "", updatedBy: "" },
  { courseId: "791381s", title: "أوراق تلخيص شبكات الاتصال", subject: "أنظمة محوسبة", modules: 37, status: "archived", updatedAt: "2026-11-03T08:00:00Z", updatedBy: "owner:x" }
];
const CAPS = [{ id: "classes.class.view", module: "classes", moduleLabel: "الصفوف", label: "رؤية صفوفه", ownerOnly: false, requires: [] }];
const PRESETS = [{ id: "learning-only", version: 1, label: "التعلّم فقط", description: "x", capabilities: ["classes.class.view"] }];
const T = (id: string, name: string, over: Record<string, unknown> = {}) => ({ accountId: id, username: "t." + id.slice(-2), displayName: name, fullName: "", email: "", phone: "", subjects: [], notes: "", organizationId: "default", status: "active", hasPassword: true, invitation: null, createdAt: "", updatedAt: "", lastLoginAt: "", origin: "console", access: { revisionId: R1, preset: { id: "learning-only", version: 1 }, grants: 0, denies: 0 }, ...over });
const head = (courses: string[] | null) => ({ revisionId: R1, parentRevisionId: null, preset: { id: "learning-only", version: 1 }, grants: [], denies: [], courses, reason: "", createdAt: "2026-11-01T10:00:00Z", createdBy: "owner:x", valid: true, capabilities: ["classes.class.view"] });

function installOwner(courses: string[] | null = null) {
  routes = {
    "GET /api/owner-session": () => ({ status: 200, body: VIEW }),
    "GET /api/owner-access/catalog": () => ({ status: 200, body: { ok: true, courses: CATALOG } }),
    "GET /api/owner-teachers": () => ({ status: 200, body: { ok: true, teachers: [T(SARA, "سارة"), T(OMAR, "عمر")] } }),
    "GET /api/owner-access": () => ({ status: 200, body: { ok: true, mode: "enforce", presets: PRESETS, capabilities: CAPS } }),
    ["GET /api/owner-access/history?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, currentRevisionId: R1, entries: [head(courses)], truncated: false, limit: 50 } }),
    ["GET /api/owner-access/history?accountId=" + OMAR]: () => ({ status: 200, body: { ok: true, accountId: OMAR, currentRevisionId: R1, entries: [head(["791381s"])], truncated: false, limit: 50 } }),
    ["GET /api/owner-access/effective?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, accountStatus: "active", mode: "enforce", enforced: true, access: { status: "ok", source: "revision", revisionId: R1, preset: { id: "learning-only", version: 1 }, capabilities: ["classes.class.view"], courses } } }),
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
const posted = (path: string) => calls.filter(c => c.method === "POST" && c.url === path);
const item = (name: string) => within(screen.getByRole("list", { name: "المقررات" })).getByRole("listitem", { name });

describe("P5-A2 «المقررات»", () => {
  it("every course with its status; archiving asks first; publishing again does not; the second-factor check is retried", async () => {
    installOwner();
    let n = 0;
    routes["POST /api/owner-access/course-status"] = c => (++n === 1 ? { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "تحقق" } } : { status: 200, body: { ok: true, courseId: c.body?.courseId, status: c.body?.status } });
    routes["POST /api/owner-session/step-up"] = () => ({ status: 200, body: VIEW });
    window.location.hash = "#/owner/courses";
    render(<OwnerApp />);
    await screen.findByRole("list", { name: "المقررات" });
    expect(item("شبكات الاتصال").textContent).toContain("منشور");
    expect(item("أوراق تلخيص شبكات الاتصال").textContent).toContain("مؤرشف");
    fireEvent.click(within(item("شبكات الاتصال")).getByRole("button", { name: "أرشفة المقرر" }));
    expect(posted("/api/owner-access/course-status")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "تأكيد: أرشفة المقرر" }));
    const form = await screen.findByRole("form", { name: "التحقق بخطوتين" });
    fireEvent.change(within(form).getByRole("textbox"), { target: { value: "123456" } });
    fireEvent.click(within(form).getByRole("button", { name: "تأكيد" }));
    await screen.findByText("أُرشف «شبكات الاتصال».");
    expect(posted("/api/owner-access/course-status").map(c => c.body)).toEqual([{ courseId: "791381", status: "archived" }, { courseId: "791381", status: "archived" }]);
    fireEvent.click(within(item("أوراق تلخيص شبكات الاتصال")).getByRole("button", { name: "نشر المقرر" }));
    await waitFor(() => expect(posted("/api/owner-access/course-status")).toHaveLength(3));
    expect(posted("/api/owner-access/course-status")[2].body).toEqual({ courseId: "791381s", status: "published" });
  });
});

describe("P5-A2 the teacher's courses", () => {
  const open = async () => { window.location.hash = ownerTeacherHash(SARA); render(<OwnerApp />); await screen.findByRole("heading", { name: "سارة" }); fireEvent.click(screen.getByRole("tab", { name: "الصلاحيات" })); };
  const radio = (name: RegExp) => screen.getByRole("radio", { name }) as HTMLInputElement;
  const box = (name: RegExp) => screen.getByRole("checkbox", { name }) as HTMLInputElement;

  it("every published course: nothing sent (the server keeps «all»); choosing some sends exactly the checked ones", async () => {
    installOwner(null);
    await open();
    expect(radio(/كل المقررات المنشورة/).checked).toBe(true);
    expect(screen.queryByRole("checkbox", { name: /شبكات الاتصال/ })).toBeNull();
    fireEvent.click(radio(/مقررات محددة فقط/));
    expect(screen.getByText(/لم تختر أي مقرر/)).toBeTruthy();
    expect(box(/أوراق تلخيص/).parentElement!.textContent).toContain("مؤرشف");
    fireEvent.click(box(/^شبكات الاتصال/));
    fireEvent.click(screen.getByRole("button", { name: "حفظ الصلاحيات" }));
    await waitFor(() => expect(posted("/api/owner-access/assign")).toHaveLength(1));
    expect(posted("/api/owner-access/assign")[0].body).toMatchObject({ courses: ["791381"] });
  });

  it("starts from the current revision's courses; unchanged → nothing to save; back to «all» omits `courses`", async () => {
    installOwner(["791381"]);
    await open();
    expect(radio(/مقررات محددة فقط/).checked).toBe(true);
    expect(box(/^شبكات الاتصال/).checked).toBe(true);
    expect((screen.getByRole("button", { name: "حفظ الصلاحيات" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(radio(/كل المقررات المنشورة/));
    fireEvent.click(screen.getByRole("button", { name: "حفظ الصلاحيات" }));
    await waitFor(() => expect(posted("/api/owner-access/assign")).toHaveLength(1));
    expect("courses" in posted("/api/owner-access/assign")[0].body!).toBe(false);
  });

  it("copying another teacher copies their courses too", async () => {
    installOwner(null);
    await open();
    fireEvent.change(screen.getByLabelText("ابدأ من صلاحيات معلم آخر"), { target: { value: OMAR } });
    await screen.findByText(/حُمّلت صلاحيات عمر/);
    expect(radio(/مقررات محددة فقط/).checked).toBe(true);
    expect([box(/^شبكات الاتصال/).checked, box(/أوراق تلخيص/).checked]).toEqual([false, true]);
  });

  it("without the catalog the course choice is not offered, and the current courses are kept on save", async () => {
    installOwner(["791381"]);
    delete routes["GET /api/owner-access/catalog"];
    await open();
    expect(screen.queryByRole("radio", { name: /كل المقررات المنشورة/ })).toBeNull();
    fireEvent.click(screen.getAllByRole("checkbox")[0]);                                   // change a capability only
    fireEvent.click(screen.getByRole("button", { name: "حفظ الصلاحيات" }));
    await waitFor(() => expect(posted("/api/owner-access/assign")).toHaveLength(1));
    expect(posted("/api/owner-access/assign")[0].body).toMatchObject({ courses: ["791381"] });
  });
});

describe("P5-A2 the teacher's library", () => {
  const card = (name: string) => screen.queryByRole("article", { name });
  it("only the courses the server says this teacher may use", async () => {
    routes = { "GET /api/learning-materials-catalog": () => ({ status: 200, body: { ok: true, courses: [{ courseId: "791381", title: "شبكات الاتصال", modules: [] }] } }) };
    render(<LearningMaterialsPage token="teacher-token" />);
    expect(card("أوراق تلخيص شبكات الاتصال")).toBeTruthy();                                   // before the answer: as before
    await waitFor(() => expect(card("أوراق تلخيص شبكات الاتصال")).toBeNull());
    expect(card("شبكات الاتصال")).toBeTruthy();
  });
  it("no answer (or a failure): the list as before — the server still refuses what is not allowed", async () => {
    routes = {};
    render(<LearningMaterialsPage token="teacher-token" />);
    await waitFor(() => expect(calls.some(c => c.url === "/api/learning-materials-catalog")).toBe(true));
    expect([card("شبكات الاتصال"), card("أوراق تلخيص شبكات الاتصال")].every(Boolean)).toBe(true);
  });
  it("without a token (no teacher session) nothing is asked", () => {
    routes = {};
    render(<LearningMaterialsPage />);
    expect(calls).toEqual([]);
  });
});

describe("P5-A2 the add-teacher wizard copies the courses", () => {
  it("copying a teacher with a course list sends that list with the new account", async () => {
    installOwner(null);
    routes["POST /api/owner-teachers/create"] = () => ({ status: 201, body: { ok: true, teacher: T("t_00112233445566cc", "جديد", { status: "invited", hasPassword: false, access: null }), invitation: { invitationPath: "#/invite/" + "A".repeat(43), purpose: "invite", expiresAt: "2026-11-05T10:00:00Z" } } });
    window.location.hash = "#/owner/teachers";
    render(<OwnerApp />);
    await findTeachersTable();
    await waitFor(() => expect(calls.some(c => c.url === "/api/owner-access")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: /إضافة معلم/ }));
    fireEvent.change(screen.getByLabelText(/^اسم المستخدم/), { target: { value: "t.new" } });
    fireEvent.change(screen.getByLabelText("اسم العرض"), { target: { value: "جديد" } });
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    fireEvent.change(screen.getByLabelText("أو انسخ صلاحيات معلم موجود"), { target: { value: OMAR } });
    await screen.findByRole("region", { name: "ما سيتمكن منه المعلم الجديد" });
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(screen.getByRole("region", { name: "مراجعة بيانات المعلم الجديد" }).textContent).toContain("1 مقرر فقط");
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب وإصدار رابط الدعوة" }));
    await waitFor(() => expect(posted("/api/owner-teachers/create")).toHaveLength(1));
    expect(posted("/api/owner-teachers/create")[0].body).toMatchObject({ presetId: "learning-only", courses: ["791381s"] });
  });
});
