// @vitest-environment happy-dom
// Tadris+ P6-D — each teacher's own exam bank in the Owner Console, against a mocked API (test data only):
//   «بنك الامتحانات» (#/owner/exams): every exam with its audience; search and category filter; one exam → everyone or a chosen
//   group of teachers (retried unchanged after the second-factor check);
//   the teacher page's «الامتحانات»: an exam «لكل المعلمين» is ticked and locked; ticking / unticking sends only what changed.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
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
    "GET /api/owner-access": () => ({ status: 200, body: { ok: true, mode: "enforce", presets: [], capabilities: [] } }),
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

async function openSection() {
  window.location.hash = ownerSectionHash("exams");
  render(<OwnerApp />);
  return screen.findByRole("list", { name: "امتحانات المكتبة" });
}

describe("P6-D «بنك الامتحانات»", () => {
  it("lists every exam with its audience; search and category narrow the list", async () => {
    const list = await openSection();
    expect(within(within(list).getByRole("listitem", { name: "نموذج A — 2025" })).getByText("لكل المعلمين")).toBeTruthy();
    expect(within(within(list).getByRole("listitem", { name: "أنظمة العد" })).getByText("معلم واحد")).toBeTruthy();
    expect(within(within(list).getByRole("listitem", { name: "عناوين IP" })).getByText("لا يراه أي معلم")).toBeTruthy();
    expect(within(within(list).getByRole("listitem", { name: "امتحان جديد" })).getByText("لم يُحدَّد بعد — لا يراه أحد")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("بحث"), { target: { value: "t0" } });
    expect(within(list).getAllByRole("listitem").map(li => li.getAttribute("aria-label"))).toEqual(["أنظمة العد", "عناوين IP"]);
    fireEvent.change(screen.getByLabelText("التصنيف"), { target: { value: "infra" } });
    expect(within(list).getAllByRole("listitem").map(li => li.getAttribute("aria-label"))).toEqual(["عناوين IP"]);
  });

  it("one exam for a chosen group of teachers; after the second-factor check the SAME request is retried", async () => {
    let n = 0;
    routes["POST /api/owner-library/set-audience"] = c => (++n === 1 ? { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "تحقق" } } : { status: 200, body: { ok: true, item: { libraryItemId: "T07", audience: "selected", teachers: c.body?.teachers, decided: true } } });
    routes["POST /api/owner-session/step-up"] = () => ({ status: 200, body: VIEW });
    const list = await openSection();
    fireEvent.click(within(within(list).getByRole("listitem", { name: "عناوين IP" })).getByRole("button", { name: "تحديد الجمهور" }));
    const form = screen.getByRole("form", { name: "جمهور عناوين IP" });
    fireEvent.click(within(form).getByRole("checkbox", { name: /عمر/ }));
    fireEvent.click(within(form).getByRole("checkbox", { name: /سارة/ }));
    fireEvent.click(within(form).getByRole("button", { name: "حفظ التغييرات" }));
    const stepUp = await screen.findByRole("form", { name: "التحقق بخطوتين" });
    fireEvent.change(within(stepUp).getByRole("textbox"), { target: { value: "123456" } });
    fireEvent.click(within(stepUp).getByRole("button", { name: "تأكيد" }));
    await screen.findByText("حُفظ جمهور «عناوين IP».");
    const sent = posted("/api/owner-library/set-audience");
    expect(sent).toHaveLength(2);
    expect(sent[0].body).toEqual({ itemId: "T07", audience: "selected", teachers: [SARA, OMAR].sort() });
    expect(sent[1].body).toEqual(sent[0].body);
  });

  it("one exam for every teacher", async () => {
    routes["POST /api/owner-library/set-audience"] = () => ({ status: 200, body: { ok: true, item: { libraryItemId: "T05", audience: "all", teachers: [], decided: true } } });
    const list = await openSection();
    fireEvent.click(within(within(list).getByRole("listitem", { name: "أنظمة العد" })).getByRole("button", { name: "تحديد الجمهور" }));
    const form = screen.getByRole("form", { name: "جمهور أنظمة العد" });
    fireEvent.click(within(form).getByRole("radio", { name: /لكل المعلمين/ }));
    fireEvent.click(within(form).getByRole("button", { name: "حفظ التغييرات" }));
    await screen.findByText("حُفظ جمهور «أنظمة العد».");
    expect(posted("/api/owner-library/set-audience")[0].body).toEqual({ itemId: "T05", audience: "all", teachers: [] });
  });
});

describe("P6-D the teacher page's «الامتحانات»", () => {
  async function openTab() {
    window.location.hash = ownerTeacherHash(SARA);
    render(<OwnerApp />);
    await screen.findByRole("heading", { name: "سارة" });
    fireEvent.click(screen.getByRole("tab", { name: "الامتحانات" }));
    return screen.findByRole("group", { name: "امتحانات المكتبة" });
  }
  it("an exam for all teachers is ticked and locked; the bank count follows the ticks; nothing to save until something changes", async () => {
    const group = await openTab();
    const forAll = within(group).getByRole("checkbox", { name: /نموذج A — 2025/ }) as HTMLInputElement;
    expect([forAll.checked, forAll.disabled]).toEqual([true, true]);
    expect((within(group).getByRole("checkbox", { name: /أنظمة العد/ }) as HTMLInputElement).checked).toBe(true);
    expect((within(group).getByRole("checkbox", { name: /عناوين IP/ }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText("في بنك المعلم: 2 من 4 امتحانًا")).toBeTruthy();
    expect((screen.getByRole("button", { name: "حفظ التغييرات" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("adding and removing exams sends only what changed", async () => {
    routes["POST /api/owner-library/set-teacher"] = c => ({ status: 200, body: { ok: true, accountId: SARA, added: c.body?.include, removed: c.body?.exclude } });
    const group = await openTab();
    // adding while an exam she already has (T05) stays ticked: only the two new ones are sent
    fireEvent.click(within(group).getByRole("checkbox", { name: /عناوين IP/ }));
    fireEvent.click(within(group).getByRole("checkbox", { name: /امتحان جديد/ }));
    expect(screen.getByText("تغييرات غير محفوظة: +2 / −0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "حفظ التغييرات" }));
    await screen.findByText("حُفظ بنك المعلم: أُضيف 2، وأُزيل 0.");
    expect(posted("/api/owner-library/set-teacher")[0].body).toEqual({ accountId: SARA, include: ["T07", "T31"], exclude: [] });
    // then removing one: only the removal is sent
    const again = await screen.findByRole("group", { name: "امتحانات المكتبة" });
    fireEvent.click(within(again).getByRole("checkbox", { name: /أنظمة العد/ }));
    fireEvent.click(screen.getByRole("button", { name: "حفظ التغييرات" }));
    await screen.findByText("حُفظ بنك المعلم: أُضيف 0، وأُزيل 1.");
    expect(posted("/api/owner-library/set-teacher")[1].body).toEqual({ accountId: SARA, include: [], exclude: ["T05"] });
  });
});
