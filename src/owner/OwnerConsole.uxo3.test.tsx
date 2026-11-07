// @vitest-environment happy-dom
// UX-O3 — the owner console's exam bank table, header account menu and teacher-page breadcrumb (design
// docs/enterprise-ux-owner-console-o3.md), against a mocked API (TEST data only). PRESENTATION ONLY: pins of the new layout (not
// fail-first: a new feature), and that the audience request and the sign-out request are the same as before. The fixture is the one
// of OwnerLibrary.p6d.test.tsx.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import OwnerApp from "./OwnerApp";
import { OWNER_TOKEN_KEY } from "./ownerApi";
import { ownerTeacherHash, ownerSectionHash } from "./ownerRoute";

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => { status: number; body: unknown }> = {};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const SARA = "t_00112233445566aa", OMAR = "t_00112233445566bb";
const VIEW = { ok: true, owner: { accountId: "own_0123456789abcdef", username: "tadris.owner", displayName: "مالك المنصة" }, session: { expiresAt: "2026-11-03T12:00:00.000Z", stepUpValidUntil: null }, recoveryCodesRemaining: 10 };
const teacher = { accountId: SARA, username: "t.sara", displayName: "سارة", fullName: "سارة أحمد", email: "", phone: "", subjects: [], notes: "", organizationId: "default", status: "active", hasPassword: true, invitation: null, createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-02T10:00:00.000Z", lastLoginAt: "", origin: "console", access: { revisionId: "", preset: { id: "full-teaching", version: 1 }, grants: 0, denies: 0 }, suspendedAt: "", suspendedReason: "" };
const exam = (id: string, title: string, category: string, over: Record<string, unknown> = {}) => ({ libraryItemId: id, title, category, questionCount: 10, totalMarks: 100, audience: "all", teachers: [], decided: true, ...over });
const TEACHERS = [{ accountId: SARA, displayName: "سارة", username: "t.sara", status: "active" }, { accountId: OMAR, displayName: "عمر", username: "t.omar", status: "active" }];
let items: ReturnType<typeof exam>[] = [];
const PRESETS = [{ id: "full-teaching", version: 1, label: "تدريس كامل", description: "كل الأدوات.", capabilities: [] }, { id: "learning-only", version: 1, label: "التعلّم فقط", description: "المقررات.", capabilities: [] }];

beforeEach(() => {
  calls = [];
  items = [
    exam("F01", "نموذج A — 2025", "final"),
    exam("T05", "أنظمة العد", "foundation", { audience: "selected", teachers: [SARA] }),
    exam("T07", "عناوين IP", "infra", { audience: "selected", teachers: [] }),
    exam("T31", "امتحان جديد", "advanced", { audience: "selected", teachers: [], decided: false })
  ];
  routes = {
    "GET /api/owner-session": () => ({ status: 200, body: VIEW }),
    "GET /api/owner-teachers": () => ({ status: 200, body: { ok: true, teachers: [teacher] } }),
    "GET /api/owner-access": () => ({ status: 200, body: { ok: true, mode: "enforce", presets: PRESETS, capabilities: [] } }),
    "GET /api/owner-bootstrap": () => ({ status: 200, body: { ok: true, state: "completed" } }),
    ["GET /api/owner-access/history?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, currentRevisionId: null, truncated: false, limit: 50, entries: [] } }),
    ["GET /api/owner-access/effective?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, accountStatus: "active", mode: "enforce", enforced: true, access: { status: "ok", source: "revision", revisionId: null, preset: { id: "full-teaching", version: 1 }, capabilities: [] } } }),
    ["GET /api/owner-classes?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, classes: [] } }),
    "GET /api/owner-library": () => ({ status: 200, body: { ok: true, items, teachers: TEACHERS } })
  };
  sessionStorage.clear();
  sessionStorage.setItem(OWNER_TOKEN_KEY, "owner-tok");
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
const shownExams = () => within(screen.getByRole("table", { name: "امتحانات المكتبة" })).getAllByRole("rowgroup").map(g => g.getAttribute("aria-label")).filter(Boolean);
const chip = (label: RegExp) => within(screen.getByRole("group", { name: "تصفية حسب من يراه" })).getByRole("button", { name: label });
async function openExams() {
  window.location.hash = ownerSectionHash("exams");
  render(<OwnerApp />);
  return screen.findByRole("table", { name: "امتحانات المكتبة" });
}

describe("UX-O3 «بنك الامتحانات» as a table", () => {
  it("columns, one row group per exam, and the audience badge in its own column", async () => {
    const table = await openExams();
    expect(within(table).getAllByRole("columnheader").map(h => h.textContent)).toEqual(["الامتحان", "التصنيف", "الأسئلة", "من يراه", "الإجراءات"]);
    expect(shownExams()).toEqual(["نموذج A — 2025", "أنظمة العد", "عناوين IP", "امتحان جديد"]);
    const row = within(table).getByRole("rowgroup", { name: "امتحان جديد" });
    expect(row.textContent).toContain("T31");
    expect(row.textContent).toContain("لم يُحدَّد بعد — لا يراه أحد");
  });

  it("the «من يراه» chips count and filter by the audienceText rule, together with search and category; «مسح التصفية» resets all", async () => {
    await openExams();
    expect(chip(/^الكل/).textContent).toBe("الكل4");
    expect(chip(/^لكل المعلمين/).textContent).toBe("لكل المعلمين1");
    expect(chip(/^معلمون محددون/).textContent).toBe("معلمون محددون2");   // one teacher, and decided with nobody
    expect(chip(/^لم يُحدَّد/).textContent).toBe("لم يُحدَّد1");
    fireEvent.click(chip(/^لم يُحدَّد/));
    expect(chip(/^لم يُحدَّد/).getAttribute("aria-pressed")).toBe("true");
    expect(shownExams()).toEqual(["امتحان جديد"]);
    fireEvent.click(chip(/^معلمون محددون/));
    expect(shownExams()).toEqual(["أنظمة العد", "عناوين IP"]);
    fireEvent.change(screen.getByLabelText("التصنيف"), { target: { value: "infra" } });
    expect(shownExams()).toEqual(["عناوين IP"]);
    expect(chip(/^الكل/).textContent).toBe("الكل1");   // the counts follow search and category
    fireEvent.change(screen.getByLabelText("بحث"), { target: { value: "لا شيء" } });
    expect(shownExams()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "مسح التصفية" }));
    expect(shownExams()).toHaveLength(4);
    expect(chip(/^الكل/).getAttribute("aria-pressed")).toBe("true");
  });

  it("«تحديد الجمهور» opens the editor in a full-width row under its exam and sends the same request as before", async () => {
    routes["POST /api/owner-library/set-audience"] = () => ({ status: 200, body: { ok: true, item: { libraryItemId: "T31", audience: "all", teachers: [], decided: true } } });
    const table = await openExams();
    const group = within(table).getByRole("rowgroup", { name: "امتحان جديد" });
    const open = within(group).getByRole("button", { name: "تحديد الجمهور" });
    expect(open.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(open);
    expect(open.getAttribute("aria-expanded")).toBe("true");
    const form = within(group).getByRole("form", { name: "جمهور امتحان جديد" });
    expect(form.closest("td")!.getAttribute("colspan")).toBe("5");
    fireEvent.click(within(form).getByRole("radio", { name: /لكل المعلمين/ }));
    fireEvent.click(within(form).getByRole("button", { name: "حفظ التغييرات" }));
    await screen.findByText("حُفظ جمهور «امتحان جديد».");
    expect(posted("/api/owner-library/set-audience").map(c => c.body)).toEqual([{ itemId: "T31", audience: "all", teachers: [] }]);
  });
});

describe("UX-O3 the header account menu", () => {
  it("shows who is signed in, until when; «حسابك وأمانه» opens «نظرة عامة»", async () => {
    await openExams();
    fireEvent.click(screen.getByRole("button", { name: "حساب مالك المنصة" }));
    const menu = screen.getByRole("group", { name: "حساب مالك المنصة" });
    expect(menu.textContent).toContain("tadris.owner");
    expect(menu.textContent).toContain("الجلسة حتى");
    // Tadris+ QR-2 — «ربط جهاز آخر بالباركود» opens the owner's QR scanner (#/owner-qr-scan); «تسجيل الخروج» stays last.
    expect(within(menu).getAllByRole("button").map(b => b.textContent)).toEqual(["حسابك وأمانه", "ربط جهاز آخر بالباركود", "تسجيل الخروج"]);
    fireEvent.click(within(menu).getByRole("button", { name: "حسابك وأمانه" }));
    expect(await screen.findByRole("heading", { name: "أهلًا، مالك المنصة" })).toBeTruthy();
    expect(window.location.hash).toBe(ownerSectionHash("home"));
  });
  it("«ربط جهاز آخر بالباركود» opens the owner's QR scanner (Tadris+ QR-2)", async () => {
    await openExams();
    fireEvent.click(screen.getByRole("button", { name: "حساب مالك المنصة" }));
    fireEvent.click(within(screen.getByRole("group", { name: "حساب مالك المنصة" })).getByRole("button", { name: "ربط جهاز آخر بالباركود" }));
    expect(window.location.hash).toBe("#/owner-qr-scan");
  });

  it("«تسجيل الخروج» sends the same request as the button on «نظرة عامة», once, and returns to the sign-in page", async () => {
    routes["POST /api/owner-session/logout"] = () => ({ status: 200, body: { ok: true } });
    await openExams();
    fireEvent.click(screen.getByRole("button", { name: "حساب مالك المنصة" }));
    fireEvent.click(within(screen.getByRole("group", { name: "حساب مالك المنصة" })).getByRole("button", { name: "تسجيل الخروج" }));
    expect(await screen.findByRole("heading", { name: "دخول مالك المنصة" })).toBeTruthy();
    expect(posted("/api/owner-session/logout")).toHaveLength(1);
    expect(calls.find(c => c.url === "/api/owner-session/logout")!.body).toEqual({});
    expect(sessionStorage.getItem(OWNER_TOKEN_KEY)).toBeNull();
    expect(screen.queryByRole("button", { name: /^حساب / })).toBeNull();   // not on the sign-in page
  });
});

describe("UX-O3 the teacher page's breadcrumb", () => {
  it("«المعلمون ‹ الاسم», the last one current; «المعلمون» goes back to the list", async () => {
    window.location.hash = ownerTeacherHash(SARA);
    render(<OwnerApp />);
    await screen.findByRole("heading", { name: "سارة" });
    const trail = screen.getByRole("navigation", { name: "مسار الصفحة" });
    expect(within(trail).getAllByRole("listitem").map(li => li.textContent)).toEqual(["المعلمون", "سارة"]);
    expect(within(trail).getByText("سارة").getAttribute("aria-current")).toBe("page");
    fireEvent.click(within(trail).getByRole("button", { name: "المعلمون" }));
    await waitFor(() => expect(window.location.hash).toBe(ownerSectionHash("teachers")));
  });

  it("with unsaved access changes, «المعلمون» asks first (the UX-O2 question), like «→ كل المعلمين»", async () => {
    window.location.hash = ownerTeacherHash(SARA);
    render(<OwnerApp />);
    await screen.findByRole("heading", { name: "سارة" });
    fireEvent.click(screen.getByRole("tab", { name: "الصلاحيات" }));
    fireEvent.click(screen.getByRole("radio", { name: /التعلّم فقط/ }));
    fireEvent.click(within(screen.getByRole("navigation", { name: "مسار الصفحة" })).getByRole("button", { name: "المعلمون" }));
    expect(screen.getByRole("group", { name: "تغييرات غير محفوظة" })).toBeTruthy();
    expect(window.location.hash).toBe(ownerTeacherHash(SARA));
  });
});

describe("UX-O3 selects and form buttons (owner.css)", () => {
  it("are scoped to the owner page, coloured from tokens only, and leave the sign-in pages' full-width button alone", () => {
    const css = readFileSync(join(__dirname, "owner.css"), "utf8");
    const block = css.slice(css.indexOf("── UX-O3 ("));
    expect(block.length).toBeGreaterThan(500);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(block).toMatch(/\.eb-owner-page select \{[^}]*appearance: none/);
    expect(block).toMatch(/\.eb-owner-console \.auth-submit \{ width: auto;/);
    expect(block).not.toMatch(/(^|\n)\s*select\s*\{|(^|\n)\.auth-submit\s*\{/);   // never unscoped
  });
});
