// @vitest-environment happy-dom
// Tadris+ P10-K — a RESERVED capability (no route enforces it yet) is not a choice in the Owner Console (closes O11; design
// docs/enterprise-reserved-capabilities-p10k.md, owner decision §19.48). Its box is disabled and follows the preset, a «محجوزة» badge
// and its reason describe it, it is not counted in what the teacher will be able to do, and a save never carries a new reserved
// grant or deny — except the deny a dependency forces. PRESENTATION: the server refuses such a save anyway
// (api/tests/reserved-capabilities-p10k.test.js). Fail-first: on the baseline the box was an ordinary, enabled checkbox. TEST data.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import OwnerApp from "./OwnerApp";
import { OWNER_TOKEN_KEY, type AccessCapability } from "./ownerApi";
import { ownerTeacherHash } from "./ownerRoute";
import { settleReserved } from "./teacherShared";
import { openAccessSections } from "./accessEditor.testkit";   // UX-O2 — the editor's sections are folded at first

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => { status: number; body: unknown }> = {};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const SARA = "t_00112233445566aa";
const R1 = "ar_000000001_00112233445566aa";
const VIEW = { ok: true, owner: { accountId: "own_0123456789abcdef", username: "tadris.owner", displayName: "مالك المنصة" }, session: { expiresAt: "2026-11-01T12:00:00.000Z", stepUpValidUntil: null }, recoveryCodesRemaining: 10 };
const cap = (id: string, label: string, extra: Partial<AccessCapability> = {}): AccessCapability => ({ id, module: id.split(".")[0], moduleLabel: { reports: "التقارير", examBuilder: "منشئ الامتحانات", examLibrary: "مكتبة الامتحانات" }[id.split(".")[0]] || id, label, ownerOnly: false, requires: [], reserved: false, reservedNote: "", ...extra });
const CAPS: AccessCapability[] = [
  cap("reports.widget.view", "لوحات التقارير"),
  cap("reports.export.use", "تصدير التقارير", { reserved: true, reservedNote: "التصدير يُبنى في المتصفح من تقرير يراه المعلم أصلًا." }),
  cap("reports.ai.use", "التقارير بالذكاء الاصطناعي"),
  cap("examBuilder.exam.create", "إنشاء امتحان"),
  cap("examLibrary.item.copy", "نسخ عنصر إلى امتحاناته", { requires: ["examBuilder.exam.create"], reserved: true, reservedNote: "النسخة تُفتح في المنشئ." })
];
const FULL = ["reports.widget.view", "reports.export.use", "reports.ai.use", "examBuilder.exam.create", "examLibrary.item.copy"];
const PRESETS = [{ id: "full-teaching", version: 2, label: "تدريس كامل", description: "كل أدوات التدريس.", capabilities: FULL, current: true }];
const teacher = { accountId: SARA, username: "t.sara", displayName: "سارة", fullName: "", email: "", phone: "", subjects: [], notes: "", organizationId: "default", status: "active", hasPassword: true, invitation: null, createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-02T10:00:00.000Z", lastLoginAt: "", origin: "console", access: { revisionId: R1, preset: { id: "full-teaching", version: 2 }, grants: 0, denies: 0 }, suspendedAt: "", suspendedReason: "" };
const HISTORY = { ok: true, accountId: SARA, currentRevisionId: R1, truncated: false, limit: 50, entries: [{ revisionId: R1, parentRevisionId: null, preset: { id: "full-teaching", version: 2 }, grants: [], denies: [], reason: "", createdAt: "2026-10-01T10:00:00.000Z", createdBy: "owner:own_0123456789abcdef", valid: true, capabilities: FULL }] };
const EFFECTIVE = { ok: true, accountId: SARA, accountStatus: "active", mode: "enforce", enforced: true, access: { status: "ok", source: "revision", revisionId: R1, preset: { id: "full-teaching", version: 2 }, capabilities: FULL } };

beforeEach(() => {
  calls = [];
  routes = {
    "GET /api/owner-session": () => ({ status: 200, body: VIEW }),
    "GET /api/owner-teachers": () => ({ status: 200, body: { ok: true, teachers: [teacher] } }),
    "GET /api/owner-access": () => ({ status: 200, body: { ok: true, mode: "enforce", presets: PRESETS, capabilities: CAPS } }),
    ["GET /api/owner-access/history?accountId=" + SARA]: () => ({ status: 200, body: HISTORY }),
    ["GET /api/owner-access/effective?accountId=" + SARA]: () => ({ status: 200, body: EFFECTIVE }),
    "POST /api/owner-access/assign": () => ({ status: 200, body: { ok: true, accountId: SARA, access: { revisionId: "ar_000000002_00112233445566bb", preset: { id: "full-teaching", version: 2 }, grants: 0, denies: 1 }, capabilities: [] } })
  };
  sessionStorage.clear();
  sessionStorage.setItem(OWNER_TOKEN_KEY, "owner-tok");
  window.location.hash = ownerTeacherHash(SARA);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const c: Call = { url, method: String(init.method || "GET"), body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    const h = routes[c.method + " " + url];
    return h ? json(h(c).status, h(c).body) : json(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const openAccess = async () => { render(<OwnerApp />); await screen.findByRole("heading", { name: "سارة" }); fireEvent.click(screen.getByRole("tab", { name: "الصلاحيات" })); openAccessSections(); };
const box = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;
const posted = () => calls.filter(c => c.method === "POST" && c.url === "/api/owner-access/assign");

describe("P10-K the console: a reserved capability is not a choice (O11)", () => {
  it("fail-first: «تصدير التقارير» is a disabled box, described by a «محجوزة» badge and its reason (baseline: an ordinary checkbox)", async () => {
    await openAccess();
    const exportBox = box("تصدير التقارير");
    expect(exportBox.disabled).toBe(true);
    expect(exportBox.checked).toBe(true);                                         // it follows the preset
    const described = document.getElementById(String(exportBox.getAttribute("aria-describedby")));
    expect(described && described.textContent).toMatch(/محجوزة.*لا تُطبَّق بعد.*التصدير يُبنى في المتصفح/);
    expect(box("التقارير بالذكاء الاصطناعي").disabled).toBe(false);              // every other capability is a choice as before
  });

  it("fail-first: a reserved capability is not counted in what the teacher will be able to do (baseline: «التقارير: 3 من 3»)", async () => {
    await openAccess();
    const items = within(screen.getByRole("region", { name: "ما سيتمكن منه المعلم" })).getAllByRole("listitem").map(li => li.textContent);
    expect(items).toContain("التقارير: 2 من 2");
    expect(items).toContain("منشئ الامتحانات: 1 من 1");
    expect(items.some(t => /مكتبة الامتحانات/.test(String(t)))).toBe(false);   // only a reserved capability there
  });

  it("a save of another change carries no reserved entry; a deny FORCED by a dependency is carried", async () => {
    await openAccess();
    fireEvent.click(box("التقارير بالذكاء الاصطناعي"));
    fireEvent.click(screen.getByRole("button", { name: "حفظ الصلاحيات" }));
    await screen.findByText("حُفظت الصلاحيات (نسخة جديدة في السجل).");
    expect(posted()[0].body).toMatchObject({ grants: [], denies: ["reports.ai.use"] });
    cleanup(); calls = [];
    await openAccess();
    fireEvent.click(box("إنشاء امتحان"));                                         // off → what needs it goes off too
    expect(box("نسخ عنصر إلى امتحاناته").checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "حفظ الصلاحيات" }));
    await screen.findByText("حُفظت الصلاحيات (نسخة جديدة في السجل).");
    expect(posted()[0].body).toMatchObject({ grants: [], denies: ["examBuilder.exam.create", "examLibrary.item.copy"] });
  });
});

describe("P10-K settleReserved: a set taken from another teacher never carries a reserved choice", () => {
  it("a reserved capability follows the preset, and is off only where a dependency forces it", () => {
    const fromOther = new Set(["reports.widget.view", "examBuilder.exam.create"]);           // the other teacher had both reserved ones off
    expect([...settleReserved(fromOther, FULL, CAPS)].sort()).toEqual(["examBuilder.exam.create", "examLibrary.item.copy", "reports.export.use", "reports.widget.view"]);
    const noCreate = new Set(["reports.widget.view", "reports.export.use", "examLibrary.item.copy"]);
    expect([...settleReserved(noCreate, FULL, CAPS)].sort()).toEqual(["reports.export.use", "reports.widget.view"]);
    expect([...settleReserved(new Set(["reports.export.use", "reports.ai.use"]), ["reports.ai.use"], CAPS)]).toEqual(["reports.ai.use"]);
  });
});
