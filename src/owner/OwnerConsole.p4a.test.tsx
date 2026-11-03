// @vitest-environment happy-dom
// Tadris+ P4-A — the Owner Console shell against a mocked API (test data only): sections at their own addresses
// (#/owner, #/owner/teachers, #/owner/access); a named side menu marks the current one; a reload or a shared link opens the
// same section; the overview keeps the account security; «تغيير الصلاحيات» shows what a change adds and removes before saving.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import OwnerApp from "./OwnerApp";
import OwnerTeachers from "./OwnerTeachers";
import { OWNER_TOKEN_KEY } from "./ownerApi";
import { isOwnerLocation, ownerViewFromHash, ownerSectionHash } from "./ownerRoute";

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => { status: number; body: unknown }> = {};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const VIEW = { ok: true, owner: { accountId: "own_0123456789abcdef", username: "tadris.owner", displayName: "مالك المنصة" }, session: { expiresAt: "2026-11-01T12:00:00.000Z", stepUpValidUntil: null }, recoveryCodesRemaining: 10 };
const PRESETS = [
  { id: "full-teaching", version: 1, label: "تدريس كامل", description: "كل أدوات التدريس.", capabilities: ["classes.class.view", "examBuilder.exam.create", "messages.inbox.read"] },
  { id: "learning-only", version: 1, label: "التعلّم فقط", description: "المقررات فقط.", capabilities: ["classes.class.view", "learning.course.view"] }
];
const CAPS = [
  { id: "classes.class.view", module: "classes", moduleLabel: "الصفوف", label: "رؤية صفوفه", ownerOnly: false },
  { id: "examBuilder.exam.create", module: "examBuilder", moduleLabel: "منشئ الامتحانات", label: "إنشاء امتحان", ownerOnly: false },
  { id: "messages.inbox.read", module: "messages", moduleLabel: "الرسائل", label: "قراءة الرسائل", ownerOnly: false },
  { id: "learning.course.view", module: "learning", moduleLabel: "التعلّم", label: "رؤية المقررات", ownerOnly: false }
];

beforeEach(() => {
  calls = [];
  routes = {
    "GET /api/owner-session": () => ({ status: 200, body: VIEW }),
    "GET /api/owner-teachers": () => ({ status: 200, body: { ok: true, teachers: [] } }),
    "GET /api/owner-access": () => ({ status: 200, body: { ok: true, mode: "legacy", presets: PRESETS, capabilities: CAPS } }),
    "GET /api/owner-access/readiness": () => ({ status: 200, body: { ok: true, mode: "legacy", ready: true, teachers: [] } })
  };
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

const menu = () => screen.getByRole("navigation", { name: "أقسام لوحة المالك" });

describe("P4-A owner routes", () => {
  it("#/owner, #/owner/teachers and #/owner/access are console sections; nothing else is", () => {
    for (const [h, v] of [["#/owner", "home"], ["#/owner/teachers", "teachers"], ["#/owner/access", "access"], ["#/owner/setup", "setup"]] as const) {
      expect(isOwnerLocation(h)).toBe(true);
      expect(ownerViewFromHash(h)).toBe(v);
    }
    for (const h of ["#/owner/other", "#/owner/teachers/x", "#/ownerteachers"]) expect(isOwnerLocation(h)).toBe(false);
    expect(ownerSectionHash("home")).toBe("#/owner");
    expect(ownerSectionHash("access")).toBe("#/owner/access");
  });
});

describe("P4-A the console", () => {
  it("overview first: the account security; the menu names the sections and marks the current one", async () => {
    render(<OwnerApp />);
    expect(await screen.findByRole("heading", { name: /أهلًا/ })).toBeTruthy();
    // P4-C added «المدارس», P5-A2 «المقررات» (intentional): the menu names them after the existing sections, in order.
    expect(within(menu()).getAllByRole("button").map(b => b.textContent)).toEqual(["نظرة عامة", "المعلمون", "الصلاحيات", "المدارس", "المقررات", "بنك الامتحانات"]);   // Tadris+ P6-D added «بنك الامتحانات»
    expect(within(menu()).getByRole("button", { name: "نظرة عامة" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText(/رموز الاسترداد المتبقية/)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "المعلمون" })).toBeNull();     // one section at a time
  });
  it("a menu click opens the section at its own address", async () => {
    render(<OwnerApp />);
    await screen.findByRole("heading", { name: /أهلًا/ });
    fireEvent.click(within(menu()).getByRole("button", { name: "المعلمون" }));
    expect(await screen.findByRole("heading", { name: "المعلمون" })).toBeTruthy();
    expect(window.location.hash).toBe("#/owner/teachers");
    expect(within(menu()).getByRole("button", { name: "المعلمون" }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(within(menu()).getByRole("button", { name: "الصلاحيات" }));
    expect(await screen.findByRole("heading", { name: "وضع الصلاحيات" })).toBeTruthy();
    expect(window.location.hash).toBe("#/owner/access");
  });
  it("a reload (or a shared link) on a section opens that section", async () => {
    window.location.hash = "#/owner/access";
    render(<OwnerApp />);
    expect(await screen.findByRole("heading", { name: "وضع الصلاحيات" })).toBeTruthy();
    expect(within(menu()).getByRole("button", { name: "الصلاحيات" }).getAttribute("aria-current")).toBe("page");
  });
  it("signed out, a section address still shows the sign-in (never the console)", async () => {
    sessionStorage.clear();
    routes["GET /api/owner-bootstrap"] = () => ({ status: 200, body: { ok: true, state: "completed" } });
    window.location.hash = "#/owner/teachers";
    render(<OwnerApp />);
    expect(await screen.findByRole("heading", { name: "دخول مالك المنصة" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "أقسام لوحة المالك" })).toBeNull();
  });
});

describe("P4-A «تغيير الصلاحيات» shows the change before it is saved", () => {
  it("added and removed capabilities, by name; nothing is sent until «حفظ»", async () => {
    routes["GET /api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [{
      accountId: "t_00112233445566aa", username: "t.sara", displayName: "سارة", fullName: "", email: "", phone: "", subjects: [], notes: "", organizationId: "default",
      status: "active", hasPassword: true, invitation: null, createdAt: "", updatedAt: "", lastLoginAt: "", origin: "console",
      access: { revisionId: "ar_000000001_0011223344556677", preset: { id: "full-teaching", version: 1 }, grants: 0, denies: 0 }
    }] } });
    render(<OwnerTeachers token="owner-tok" onSignedOut={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "تغيير الصلاحيات" }));
    fireEvent.click(screen.getByRole("radio", { name: /التعلّم فقط/ }));
    const diff = await screen.findByRole("region", { name: "تغيّر صلاحيات سارة" });
    expect(within(diff).getByRole("list", { name: "صلاحيات ستُضاف" }).textContent).toContain("التعلّم — رؤية المقررات");
    const removed = within(diff).getByRole("list", { name: "صلاحيات ستُزال" });
    expect(removed.textContent).toContain("منشئ الامتحانات — إنشاء امتحان");
    expect(removed.textContent).toContain("الرسائل — قراءة الرسائل");
    expect(removed.textContent).not.toContain("رؤية صفوفه");                   // kept → not listed
    expect(calls.some(c => c.url === "/api/owner-access/assign")).toBe(false);
    await waitFor(() => expect(screen.getByText(/لن يتغير شيء الآن عند المعلم/)).toBeTruthy());
  });
});
