// @vitest-environment happy-dom
// UX-O1 — «نظرة عامة» and the teachers table of the Owner Console (design docs/enterprise-ux-owner-console-o1.md), against a mocked
// API (test data only). Presentation only: every number and every «يحتاج انتباهك» line comes from answers the console already reads;
// a source that cannot be read shows «—» and never breaks the page; the teachers table searches and filters the loaded list in the
// browser (no new request); the add buttons of the overview open the same wizard on «المعلمون».
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import OwnerApp from "./OwnerApp";
import OwnerTeachers from "./OwnerTeachers";
import { OWNER_TOKEN_KEY, type ManagedTeacher, type ReadinessTeacher } from "./ownerApi";
import { attentionItems, overviewNumbers, type OverviewSources } from "./ownerOverview";
import { findTeachersTable, teacherGroups } from "./teacherTable.testkit";

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => { status: number; body: unknown }> = {};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const VIEW = { ok: true, owner: { accountId: "own_0123456789abcdef", username: "tadris.owner", displayName: "مالك المنصة" }, session: { expiresAt: "2026-11-01T12:00:00.000Z", stepUpValidUntil: null }, recoveryCodesRemaining: 10 };
const SCHOOL = "sch_0011223344556677";

const T = (over: Partial<ManagedTeacher> = {}): ManagedTeacher => ({
  accountId: "t_00112233445566aa", username: "t.salma", displayName: "سلمى", fullName: "", email: "salma@school.test", phone: "", subjects: [], notes: "", organizationId: "default",
  status: "active", hasPassword: true, invitation: null, createdAt: "", updatedAt: "", lastLoginAt: "", origin: "console", trial: null, schoolId: SCHOOL,
  access: { revisionId: "ar_000000001_0011223344556677", preset: { id: "full-teaching", version: 2 }, grants: 0, denies: 0 }, suspendedAt: "", suspendedReason: "", ...over
} as ManagedTeacher);
const TEACHERS: ManagedTeacher[] = [
  T(),
  T({ accountId: "t_00112233445566bb", username: "t.omar", displayName: "عمر", email: "omar@school.test" }),
  T({ accountId: "t_00112233445566cc", username: "t.rami", displayName: "رامي", status: "invited", hasPassword: false, invitation: { purpose: "invite", expiresAt: "2030-01-01T00:00:00Z" }, trial: { days: 7, endsAt: "2030-01-01T00:00:00Z", ended: false, endingSoon: true } }),
  T({ accountId: "t_00112233445566dd", username: "t.lina", displayName: "لينا", status: "invited", hasPassword: false, schoolId: null }),
  T({ accountId: "t_00112233445566ee", username: "t.huda", displayName: "هدى", status: "suspended" })
];
const R = (t: ManagedTeacher, access = true): ReadinessTeacher => ({ accountId: t.accountId, username: t.username, displayName: t.displayName, status: t.status, access: access ? { revisionId: "ar_x", preset: { id: "full-teaching", version: 2 } } : null, defaultAccess: "none", wouldDeny: [] });

function api(over: Record<string, (c: Call) => { status: number; body: unknown }> = {}) {
  routes = {
    "GET /api/owner-bootstrap": () => ({ status: 200, body: { ok: true, state: "completed" } }),
    "GET /api/owner-session": () => ({ status: 200, body: VIEW }),
    "GET /api/owner-teachers": () => ({ status: 200, body: { ok: true, teachers: TEACHERS } }),
    "GET /api/owner-schools": () => ({ status: 200, body: { ok: true, schools: [{ schoolId: SCHOOL, name: "مدرسة الأمل", logo: null, teachers: 4 }] } }),
    "GET /api/owner-access": () => ({ status: 200, body: { ok: true, mode: "observe", presets: [], capabilities: [] } }),
    "GET /api/owner-access/readiness": () => ({ status: 200, body: { ok: true, mode: "observe", ready: true, teachers: TEACHERS.map(t => R(t)) } }),
    "GET /api/owner-legacy-classes": () => ({ status: 200, body: { ok: true, visibilityToday: "shared", classes: [] } }),
    ...over
  };
}
beforeEach(() => {
  calls = [];
  api();
  sessionStorage.clear();
  sessionStorage.setItem(OWNER_TOKEN_KEY, "owner-tok");
  window.location.hash = "#/owner";
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

const kpi = (label: string) => {
  const strip = screen.getByLabelText("أرقام المنصة");
  const term = within(strip).getByText(label);
  return term.parentElement!.querySelector(".eb-kpi-value")!.textContent;
};
const attention = () => screen.queryByRole("list", { name: "يحتاج انتباهك" });

describe("UX-O1 the overview numbers and «يحتاج انتباهك» (pure)", () => {
  const S = (over: Partial<OverviewSources> = {}): OverviewSources => ({ teachers: TEACHERS, schools: [{ schoolId: SCHOOL, name: "مدرسة", logo: null, teachers: 4 }], mode: "observe", readiness: { ready: true, teachers: TEACHERS.map(t => R(t)) }, legacyClasses: [], ...over });

  it("counts from the loaded teachers: active, waiting, suspended, trials ending soon, schools and teachers without one", () => {
    expect(overviewNumbers(S())).toMatchObject({ total: 5, active: 2, invited: 2, suspended: 1, trialsEndingSoon: 1, trialsEnded: 0, schools: 1, withoutSchool: 1, mode: "observe", ready: true });
  });

  it("a source that could not be read is null — never zero", () => {
    expect(overviewNumbers(S({ teachers: null, schools: null, mode: null, readiness: null }))).toMatchObject({ total: null, active: null, schools: null, mode: null, ready: null });
    expect(attentionItems(S({ teachers: null, schools: null, readiness: null, legacyClasses: null, mode: null }))).toEqual([]);
  });

  it("only what applies, in order: ended / ending trials, invitations, teachers without a package, without a school, legacy classes, «can enforce»", () => {
    expect(attentionItems(S()).map(i => i.id)).toEqual(["trials-soon", "invited", "no-school", "can-enforce"]);
    const more = S({
      teachers: [...TEACHERS, T({ accountId: "t_00112233445566ff", username: "t.x", displayName: "سامي", trial: { days: 7, endsAt: "2020-01-01T00:00:00Z", ended: true } })],
      readiness: { ready: false, teachers: [R(TEACHERS[0]), R(TEACHERS[1], false)] },
      legacyClasses: [{ classId: "c1", decision: null }, { classId: "c2", decision: { migrationId: "m", decision: "keep", toAccountId: "", at: "", by: "" } }] as unknown as OverviewSources["legacyClasses"]
    });
    expect(attentionItems(more).map(i => i.id)).toEqual(["trials-ended", "trials-soon", "invited", "unassigned", "no-school", "legacy"]);
    expect(attentionItems(more).find(i => i.id === "unassigned")!.detail).toContain("عمر");
    expect(attentionItems(more).find(i => i.id === "legacy")!.title).toBe("صف قديم بلا مالك");
  });

  it("a suspended teacher is not «without a package» (the readiness rule of «الصلاحيات»), nor «without a school»", () => {
    const s = S({ readiness: { ready: true, teachers: [R(TEACHERS[4], false)] }, teachers: [TEACHERS[4]] });
    expect(attentionItems({ ...s, teachers: [{ ...TEACHERS[4], schoolId: null }] }).map(i => i.id)).toEqual(["can-enforce"]);
  });
});

describe("UX-O1 «نظرة عامة»", () => {
  it("shows the numbers and the lines that apply; each line takes the owner to its section", async () => {
    render(<OwnerApp />);
    expect(await screen.findByRole("heading", { name: /أهلًا/ })).toBeTruthy();
    await waitFor(() => expect(attention()).not.toBeNull());
    expect(kpi("معلمون نشطون")).toBe("2");
    expect(kpi("بانتظار كلمة المرور")).toBe("2");
    expect(kpi("موقوفون")).toBe("1");
    expect(kpi("تجارب تنتهي قريبًا")).toBe("1");
    expect(kpi("المدارس")).toBe("1");
    expect(kpi("وضع الصلاحيات")).toBe("مراقبة");
    const lines = within(attention()!).getAllByRole("listitem").map(li => li.querySelector("strong")!.textContent);
    expect(lines).toEqual(["حساب تجريبي ينتهي خلال أسبوع", "دعوتان لم تُقبلا بعد", "معلم بلا مدرسة", "الصلاحيات في وضع المراقبة"]);
    fireEvent.click(within(attention()!).getByRole("button", { name: "ربط بمدرسة" }));
    expect(window.location.hash).toBe("#/owner/schools");
    // the requests are reads only: nothing is written by opening the overview
    expect(calls.filter(c => c.method !== "GET")).toEqual([]);
  });

  it("the old «مكتبة الواجبات الجاهزة تُضاف هنا في مرحلة قادمة» line is gone; the account controls are all still there", async () => {
    render(<OwnerApp />);
    await screen.findByRole("heading", { name: /أهلًا/ });
    expect(screen.queryByText(/مكتبة الواجبات الجاهزة تُضاف هنا/)).toBeNull();
    for (const name of [/تسجيل الخروج/, "توليد رموز استرداد جديدة", /إنهاء كل الجلسات/]) expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "حسابك وأمانه" })).toBeTruthy();
  });

  it("nothing to do → «لا شيء يحتاج انتباهك الآن»", async () => {
    const all = TEACHERS.slice(0, 2);
    api({
      "GET /api/owner-teachers": () => ({ status: 200, body: { ok: true, teachers: all } }),
      "GET /api/owner-access": () => ({ status: 200, body: { ok: true, mode: "enforce", presets: [], capabilities: [] } }),
      "GET /api/owner-access/readiness": () => ({ status: 200, body: { ok: true, mode: "enforce", ready: true, teachers: all.map(t => R(t)) } })
    });
    render(<OwnerApp />);
    expect(await screen.findByText("لا شيء يحتاج انتباهك الآن")).toBeTruthy();
    expect(attention()).toBeNull();
  });

  it("a source that fails shows «—» and «تعذّر التحميل»; the rest of the page stays", async () => {
    api({ "GET /api/owner-schools": () => ({ status: 503, body: { ok: false, code: "UNAVAILABLE", error: "x" } }) });
    render(<OwnerApp />);
    await waitFor(() => expect(attention()).not.toBeNull());
    expect(kpi("المدارس")).toBe("—");
    expect(within(screen.getByLabelText("أرقام المنصة")).getByText("تعذّر التحميل")).toBeTruthy();
    expect(kpi("معلمون نشطون")).toBe("2");
  });

  it("«إضافة معلم» on the overview opens the add-teacher wizard of «المعلمون»; «معلم تجريبي» opens it as a trial", async () => {
    render(<OwnerApp />);
    await screen.findByRole("heading", { name: /أهلًا/ });
    fireEvent.click(screen.getByRole("button", { name: /^إضافة معلم$/ }));
    expect(window.location.hash).toBe("#/owner/teachers");
    expect(await screen.findByRole("list", { name: "خطوات إضافة معلم" })).toBeTruthy();
  });

  it("a 401 from any source signs the owner out", async () => {
    api({ "GET /api/owner-legacy-classes": () => ({ status: 401, body: { ok: false, code: "OWNER_SESSION_REVOKED", error: "x" } }) });
    render(<OwnerApp />);
    expect(await screen.findByRole("heading", { name: "دخول مالك المنصة" })).toBeTruthy();
  });
});

describe("UX-O1 the teachers table: search and status filters on the loaded list", () => {
  const show = () => render(<OwnerTeachers token="owner-tok" onSignedOut={vi.fn()} />);
  const names = () => teacherGroups().map(g => g.getAttribute("aria-label"));

  it("every teacher is a row with status, package, school and last sign-in; the counts are on the filters", async () => {
    show();
    await findTeachersTable();
    expect(names()).toEqual(["سلمى", "عمر", "رامي", "لينا", "هدى"]);
    await waitFor(() => expect(within(screen.getByRole("rowgroup", { name: "سلمى" })).getByText("مدرسة الأمل")).toBeTruthy());
    expect(within(screen.getByRole("rowgroup", { name: "لينا" })).getByText("بلا مدرسة")).toBeTruthy();
    const filters = screen.getByRole("group", { name: "تصفية حسب الحالة" });
    expect(within(filters).getAllByRole("button").map(b => b.textContent)).toEqual(["الكل 5", "نشط 2", "بانتظار كلمة المرور 2", "موقوف 1", "تجريبي 1"]);
  });

  it("a status filter narrows the table and is marked pressed; search narrows by name, username or e-mail; «مسح التصفية» restores", async () => {
    show();
    await findTeachersTable();
    const filters = screen.getByRole("group", { name: "تصفية حسب الحالة" });
    fireEvent.click(within(filters).getByRole("button", { name: /بانتظار كلمة المرور/ }));
    expect(names()).toEqual(["رامي", "لينا"]);
    expect(within(filters).getByRole("button", { name: /بانتظار كلمة المرور/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(filters).getByRole("button", { name: /الكل/ }));
    fireEvent.change(screen.getByLabelText("بحث في المعلمين"), { target: { value: "omar@" } });
    expect(names()).toEqual(["عمر"]);
    fireEvent.change(screen.getByLabelText("بحث في المعلمين"), { target: { value: "T.HUDA" } });
    expect(names()).toEqual(["هدى"]);
    fireEvent.change(screen.getByLabelText("بحث في المعلمين"), { target: { value: "لا أحد" } });
    expect(names()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "مسح التصفية" }));
    expect(names()).toHaveLength(5);
    expect(calls.filter(c => c.url.startsWith("/api/owner-teachers")).length).toBe(1);   // filtering never asks the server again
  });
});
