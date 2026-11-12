// @vitest-environment happy-dom
// Tadris+ P6-E — «استيراد امتحان» in the Owner Console's «بنك الامتحانات», against a mocked API (test data only). No editor:
//   اختيار ملف JSON → فحص الأخطاء → الإصلاح الآمن → الفحص النهائي → النشر → تحديد الجمهور;
//   an exam with a remaining blocker cannot be published (nothing is sent); publishing sends the prepared exam once (retried
//   unchanged after the second-factor check); the new exam's audience is chosen in the last step with the same editor as the table.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import TEMPLATE from "../../public/templates/structured-exam-template.json";
import OwnerApp from "./OwnerApp";
import { OWNER_TOKEN_KEY } from "./ownerApi";
import { ownerSectionHash } from "./ownerRoute";

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
  return screen.findByRole("table", { name: "امتحانات المكتبة" });   // UX-O3 — a table: one row group per exam, named after it
}

const IMPORTED = { libraryItemId: "IMP-001", title: "امتحان الشبكات المستورد", category: "final", questionCount: 5, totalMarks: 100, audience: "selected", teachers: [], decided: false, imported: true, activityType: "training" };
const fileOf = (value: unknown, name = "exam.json") => new File([typeof value === "string" ? value : JSON.stringify(value)], name, { type: "application/json" });
const template = (change: (e: Record<string, any>) => void = () => {}) => { const e = JSON.parse(JSON.stringify(TEMPLATE)); change(e); return e; };

async function openImport() {
  await openSection();
  fireEvent.click(screen.getByRole("button", { name: "استيراد امتحان" }));
  return screen.findByRole("region", { name: "استيراد امتحان إلى البنك" }, { timeout: 8000 });   // the import is a lazy chunk
}
async function choose(panel: HTMLElement, file: File) {
  fireEvent.change(within(panel).getByLabelText("ملف الامتحان"), { target: { files: [file] } });
}

describe("P6-E «استيراد امتحان» — no editor: check, publish, choose who sees it", () => {
  it("a ready JSON exam goes through every stage, is published once, and its audience is chosen in the last step", async () => {
    let n = 0;
    routes["POST /api/owner-library/import"] = () => (++n === 1 ? { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "تحقق" } } : { status: 200, body: { ok: true, item: IMPORTED } });
    routes["POST /api/owner-session/step-up"] = () => ({ status: 200, body: VIEW });
    routes["POST /api/owner-library/set-audience"] = c => ({ status: 200, body: { ok: true, item: { libraryItemId: "IMP-001", audience: c.body?.audience, teachers: c.body?.teachers, decided: true } } });
    const panel = await openImport();
    await choose(panel, fileOf(template(e => { e.title = "امتحان الشبكات المستورد"; e.coverPage = { activityType: "training" }; })));
    expect(await within(panel).findByText("خطأ يمنع النشر", { exact: false })).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "الإصلاح الآمن التلقائي" }));
    fireEvent.click(within(panel).getByRole("button", { name: "المتابعة إلى الفحص النهائي" }));
    expect(within(panel).getByText("✓ الامتحان جاهز للنشر.")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "المتابعة إلى النشر" }));
    const form = within(panel).getByRole("form", { name: "نشر الامتحان في البنك" });
    expect((within(form).getByLabelText("عنوان الامتحان في البنك") as HTMLInputElement).value).toBe("امتحان الشبكات المستورد");
    expect((within(form).getByRole("radio", { name: "تدريب" }) as HTMLInputElement).checked).toBe(true);
    expect((within(form).getByRole("button", { name: "نشر في البنك" }) as HTMLButtonElement).disabled).toBe(true);   // no category yet
    fireEvent.change(within(form).getByLabelText("التصنيف"), { target: { value: "final" } });
    fireEvent.click(within(form).getByRole("button", { name: "نشر في البنك" }));
    const stepUp = await screen.findByRole("form", { name: "التحقق بخطوتين" });
    fireEvent.change(within(stepUp).getByRole("textbox"), { target: { value: "123456" } });
    fireEvent.click(within(stepUp).getByRole("button", { name: "تأكيد" }));
    const audience = await within(panel).findByRole("form", { name: "جمهور امتحان الشبكات المستورد" });
    const sent = posted("/api/owner-library/import");
    expect(sent).toHaveLength(2);
    expect(sent[1].body).toEqual(sent[0].body);
    expect(sent[0].body).toMatchObject({ title: "امتحان الشبكات المستورد", category: "final", activityType: "training", description: "", sourceFileName: "exam.json" });
    expect((sent[0].body as { exam: { sections: unknown[] } }).exam.sections).toHaveLength(2);
    fireEvent.click(within(audience).getByRole("checkbox", { name: /سارة/ }));
    fireEvent.click(within(audience).getByRole("button", { name: "حفظ التغييرات" }));
    await screen.findByText("نُشر «امتحان الشبكات المستورد» وحُفظ جمهوره.");
    expect(posted("/api/owner-library/set-audience")[0].body).toEqual({ itemId: "IMP-001", audience: "selected", teachers: [SARA] });
    expect(screen.queryByRole("region", { name: "استيراد امتحان إلى البنك" })).toBeNull();
  });

  it("an exam with a remaining blocker (a missing answer key) cannot be published: the blockers are listed, nothing is sent", async () => {
    const panel = await openImport();
    await choose(panel, fileOf(template(e => { delete e.sections[0].questions[0].answer; })));
    expect(await within(panel).findByText("مفتاح إجابة ناقص: 1")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "الإصلاح الآمن التلقائي" }));
    fireEvent.click(within(panel).getByRole("button", { name: "المتابعة إلى الفحص النهائي" }));
    expect(within(panel).getByRole("alert").textContent).toContain("لا يمكن نشر الامتحان");
    expect(within(panel).queryByRole("button", { name: "المتابعة إلى النشر" })).toBeNull();
    expect(within(panel).getByRole("button", { name: "ملف آخر" })).toBeTruthy();
    expect(calls.filter(c => c.method === "POST")).toEqual([]);
  });

  it("only a readable JSON structured exam opens; the file is never sent while it is checked", async () => {
    const panel = await openImport();
    await choose(panel, fileOf("<html></html>", "exam.html"));
    expect(await within(panel).findByText("اختر ملف JSON (امتحان منظّم).")).toBeTruthy();
    await choose(panel, fileOf("{ not json", "broken.json"));
    expect(await within(panel).findByRole("alert")).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "الإصلاح الآمن التلقائي" })).toBeNull();
    expect(calls.filter(c => c.method === "POST")).toEqual([]);
  });

  it("an imported exam's row is marked «مستورد»; cancelling the import closes it", async () => {
    items.push({ ...exam("IMP-001", "امتحان الشبكات المستورد", "final", { audience: "selected", teachers: [], decided: false }), imported: true, activityType: "training" } as ReturnType<typeof exam>);
    const list = await openSection();
    expect(within(within(list).getByRole("rowgroup", { name: "امتحان الشبكات المستورد" })).getByText("مستورد · تدريب")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "استيراد امتحان" }));
    const panel = await screen.findByRole("region", { name: "استيراد امتحان إلى البنك" });
    fireEvent.click(within(panel).getByRole("button", { name: "إلغاء" }));
    expect(screen.queryByRole("region", { name: "استيراد امتحان إلى البنك" })).toBeNull();
  });
});
