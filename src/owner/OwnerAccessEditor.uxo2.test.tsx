// @vitest-environment happy-dom
// UX-O2 — the owner's access editor in sections with a sticky save bar (design docs/enterprise-ux-owner-console-o2.md §2.1), against a
// mocked API (TEST data only). PRESENTATION ONLY: these tests pin the new presentation (pins, not fail-first: a new feature) and that
// folding a section never changes what «حفظ الصلاحيات» sends. The fixture is the one of OwnerTeacherDetails.p4b1.test.tsx.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import OwnerApp from "./OwnerApp";
import { OWNER_TOKEN_KEY } from "./ownerApi";
import { ownerTeacherHash } from "./ownerRoute";

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

const posted = () => calls.filter(c => c.method === "POST" && c.url === "/api/owner-access/assign");
async function openAccess() {
  render(<OwnerApp />);
  await screen.findByRole("heading", { name: "سارة" });
  fireEvent.click(screen.getByRole("tab", { name: "الصلاحيات" }));
}
const section = (name: string) => screen.getByRole("button", { name, expanded: undefined });
const expanded = (name: string) => section(name).getAttribute("aria-expanded");
const kpi = (label: string) => {
  const strip = document.querySelector('dl[aria-label="ملخص الصلاحيات"]') as HTMLElement;
  const cell = [...strip.querySelectorAll(".eb-kpi")].find(c => c.querySelector("dt")?.textContent === label) as HTMLElement;
  return cell.querySelector(".eb-kpi-value")?.textContent || "";
};
const bar = () => screen.getByRole("region", { name: "حفظ الصلاحيات" });
const saveButton = () => within(bar()).getByRole("button", { name: "حفظ الصلاحيات" }) as HTMLButtonElement;
const box = (name: string) => screen.getByLabelText(name) as HTMLInputElement;   // found folded or not (a folded section stays mounted)

describe("UX-O2 the access editor — summary, sections, save bar", () => {
  it("the summary reads the draft: preset, enabled «N من M» (owner-only never counted), the difference from the preset, when it applies", async () => {
    await openAccess();
    expect(kpi("الحزمة")).toBe("التعلّم فقط");
    expect(kpi("صلاحيات مفعّلة")).toBe("2");
    expect(screen.getByText("من 4")).toBeTruthy();
    expect(kpi("مقارنة بالحزمة")).toBe("0 مضافة · 0 محجوبة");
    expect(kpi("يسري")).toBe("من الطلب التالي");
    fireEvent.click(box("قراءة الرسائل"));
    expect(kpi("صلاحيات مفعّلة")).toBe("3");
    expect(kpi("مقارنة بالحزمة")).toBe("1 مضافة · 0 محجوبة");
  });

  it("only «الحزمة الأساسية» is open at first; a folded section is out of the accessibility tree but keeps its draft", async () => {
    await openAccess();
    expect(expanded("الحزمة الأساسية")).toBe("true");
    for (const s of ["الصلاحيات التفصيلية", "مراجعة التغيير"]) expect(expanded(s)).toBe("false");
    expect(screen.queryByRole("checkbox", { name: "قراءة الرسائل" })).toBeNull();
    fireEvent.click(section("الصلاحيات التفصيلية"));
    expect(expanded("الصلاحيات التفصيلية")).toBe("true");
    fireEvent.click(screen.getByRole("checkbox", { name: "قراءة الرسائل" }));
    fireEvent.click(section("الصلاحيات التفصيلية"));
    expect(screen.queryByRole("checkbox", { name: "قراءة الرسائل" })).toBeNull();
    fireEvent.click(section("الصلاحيات التفصيلية"));
    expect((screen.getByRole("checkbox", { name: "قراءة الرسائل" }) as HTMLInputElement).checked).toBe(true);
    expect(section("الصلاحيات التفصيلية").getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(section("الصلاحيات التفصيلية").getAttribute("aria-describedby")!)!.textContent).toContain("معدّل");
  });

  it("«المعدّلة فقط» shows only the modules whose boxes differ from what the page opened on", async () => {
    await openAccess();
    fireEvent.click(section("الصلاحيات التفصيلية"));
    fireEvent.click(screen.getByRole("checkbox", { name: "قراءة الرسائل" }));
    fireEvent.click(screen.getByRole("button", { name: /^المعدّلة فقط/ }));
    expect(screen.getAllByRole("group").filter(g => g.tagName === "FIELDSET" && g.classList.contains("eb-owner-cap-group")).map(g => g.querySelector("legend")!.textContent!.split(" ")[0])).toEqual(["الرسائل"]);
    fireEvent.click(screen.getByRole("button", { name: "كل الأقسام" }));
    expect(screen.getAllByRole("group").filter(g => g.classList.contains("eb-owner-cap-group"))).toHaveLength(3);
  });

  it("the save bar: nothing to save at first; a change says so and counts it, opens «مراجعة التغيير»; «تراجع» restores it and sends nothing", async () => {
    await openAccess();
    expect(bar().textContent).toContain("لا تغييرات غير محفوظة");
    expect(saveButton().disabled).toBe(true);
    expect(within(bar()).queryByRole("button", { name: "تراجع عن التغييرات" })).toBeNull();
    fireEvent.click(box("قراءة الرسائل"));
    expect(bar().textContent).toContain("تغييرات غير محفوظة · سيكسب 1 وسيفقد 0");
    expect(saveButton().disabled).toBe(false);
    expect(expanded("مراجعة التغيير")).toBe("true");
    fireEvent.click(within(bar()).getByRole("button", { name: "تراجع عن التغييرات" }));
    expect(bar().textContent).toContain("لا تغييرات غير محفوظة");
    expect(box("قراءة الرسائل").checked).toBe(false);
    expect(kpi("صلاحيات مفعّلة")).toBe("2");
    expect(posted()).toHaveLength(0);
  });

  it("«تراجع عن التغييرات» restores every section, the preset too, not only the boxes", async () => {
    await openAccess();
    fireEvent.click(screen.getByRole("radio", { name: /تدريس كامل/ }));
    expect(kpi("الحزمة")).toBe("تدريس كامل");
    fireEvent.click(within(bar()).getByRole("button", { name: "تراجع عن التغييرات" }));
    expect(kpi("الحزمة")).toBe("التعلّم فقط");
    expect((screen.getByRole("radio", { name: /التعلّم فقط/ }) as HTMLInputElement).checked).toBe(true);
    expect(saveButton().disabled).toBe(true);
  });

  it("parity: with every section folded, a preset change sends exactly the same request as before UX-O2", async () => {
    routes["POST /api/owner-access/assign"] = () => ({ status: 200, body: { ok: true } });
    await openAccess();
    fireEvent.click(screen.getByRole("radio", { name: /تدريس كامل/ }));
    fireEvent.click(section("مراجعة التغيير"));   // fold the one that opened by itself
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("سبب التغيير (اختياري، يظهر في السجل)"), { target: { value: "كل الأدوات" } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(posted()).toHaveLength(1));
    expect(posted()[0].body).toEqual({ accountId: SARA, presetId: "full-teaching", presetVersion: 1, grants: [], denies: [], reason: "كل الأدوات", baseRevisionId: R2 });
  });

  it("parity: a box changed and then folded away is still sent (grants), exactly as before UX-O2", async () => {
    routes["POST /api/owner-access/assign"] = () => ({ status: 200, body: { ok: true } });
    await openAccess();
    fireEvent.click(section("الصلاحيات التفصيلية"));
    fireEvent.click(screen.getByRole("checkbox", { name: "قراءة الرسائل" }));
    fireEvent.click(section("الصلاحيات التفصيلية"));
    fireEvent.click(section("مراجعة التغيير"));
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    fireEvent.click(saveButton());
    await waitFor(() => expect(posted()).toHaveLength(1));
    expect(posted()[0].body).toEqual({ accountId: SARA, presetId: "learning-only", presetVersion: 1, grants: ["messages.inbox.read"], denies: [], reason: "", baseRevisionId: R2 });
  });

  it("leaving the tab or the page with unsaved changes asks first; «البقاء» keeps the draft, «تجاهل التغييرات» leaves", async () => {
    await openAccess();
    fireEvent.click(box("قراءة الرسائل"));
    fireEvent.click(screen.getByRole("tab", { name: "السجل" }));
    const ask = screen.getByRole("group", { name: "تغييرات غير محفوظة" });
    expect(screen.getByRole("tab", { name: "الصلاحيات" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(within(ask).getByRole("button", { name: "البقاء" }));
    expect(screen.queryByRole("group", { name: "تغييرات غير محفوظة" })).toBeNull();
    expect(box("قراءة الرسائل").checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "→ كل المعلمين" }));
    expect(screen.getByRole("group", { name: "تغييرات غير محفوظة" })).toBeTruthy();
    expect(window.location.hash).toBe(ownerTeacherHash(SARA));
    fireEvent.click(screen.getByRole("tab", { name: "السجل" }));
    fireEvent.click(within(screen.getByRole("group", { name: "تغييرات غير محفوظة" })).getByRole("button", { name: "تجاهل التغييرات" }));
    expect(screen.getByRole("tab", { name: "السجل" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "الصلاحيات" }));
    expect(box("قراءة الرسائل").checked).toBe(false);   // discarded: the editor opens on the saved revision again
    fireEvent.click(screen.getByRole("tab", { name: "السجل" }));   // nothing unsaved: no question
    expect(screen.queryByRole("group", { name: "تغييرات غير محفوظة" })).toBeNull();
    expect(screen.getByRole("tab", { name: "السجل" }).getAttribute("aria-selected")).toBe("true");
  });

  it("an untrusted current revision keeps «الحزمة الأساسية» open (it cannot be folded) with the alert above it", async () => {
    routes["GET /api/owner-access/history?accountId=" + SARA] = () => ({ status: 200, body: { ...HISTORY, entries: HISTORY.entries.map(e => (e.revisionId === R2 ? { ...e, valid: false } : e)) } });
    await openAccess();
    expect(screen.getByRole("alert").textContent).toContain("نسخة الصلاحيات الحالية غير صالحة");
    expect(expanded("الحزمة الأساسية")).toBe("true");
    fireEvent.click(section("الحزمة الأساسية"));
    expect(expanded("الحزمة الأساسية")).toBe("true");
    expect(screen.getByText("اختر حزمة أساسية أولًا.")).toBeTruthy();
  });
});
