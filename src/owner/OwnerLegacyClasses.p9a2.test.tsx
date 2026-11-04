// @vitest-environment happy-dom
// Tadris+ P9-A2 — «البيانات القديمة» in the Owner Console (#/owner/legacy) over the P9-A1 server, against a mocked API (test data
// only): the classes without an owner and who sees them today; a decision is a PREVIEW first (nothing changes; the exact changes and
// who loses / gains the class are shown), then a written reason and «تنفيذ القرار» with the preview's digest and ONE request key
// (retried unchanged after the second-factor check, and reused by «إكمال التنفيذ» after a half-done run); a stale preview is dropped
// (preview again); the decisions list with «تراجع» (a reason; the server's refusal is shown). A feature (no fail-first).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import OwnerApp from "./OwnerApp";
import { OWNER_TOKEN_KEY } from "./ownerApi";
import { ownerSectionHash, ownerViewFromHash, isOwnerLocation } from "./ownerRoute";

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => { status: number; body: unknown }> = {};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const OMAR = "t_00112233445566bb", SUSP = "t_00112233445566cc";
const VIEW = { ok: true, owner: { accountId: "own_0123456789abcdef", username: "tadris.owner", displayName: "مالك المنصة" }, session: { expiresAt: "2026-11-03T12:00:00.000Z", stepUpValidUntil: null }, recoveryCodesRemaining: 10 };
const teacher = (accountId: string, displayName: string, username: string, status = "active") => ({ accountId, username, displayName, fullName: displayName, email: "", phone: "", subjects: [], notes: "", organizationId: "default", status, hasPassword: true, invitation: null, createdAt: "", updatedAt: "", lastLoginAt: "", origin: "console", access: null, suspendedAt: "", suspendedReason: "" });
const CLASS = { classId: "old", name: "العاشر القديم", grade: "10", schoolYear: "2024-2025", status: "active", students: { total: 4, archived: 1, withOwner: 1 }, assignments: { total: 1, byStatus: { published: 1 } }, decision: null };
const PLAN = {
  classId: "old", className: "العاشر القديم", status: "active", decision: "assign", to: OMAR,
  changes: [{ path: "platform/classes/old.json", type: "class", field: "ownerId", before: null, after: OMAR }, { path: "platform/users/s1.json", type: "student", userId: "s1", field: "ownerId", before: null, after: OMAR }, { path: "platform/users/s2.json", type: "student", userId: "s2", field: "ownerId", before: null, after: OMAR, archived: true }, { path: "platform/users/s3.json", type: "student", userId: "s3", field: "ownerId", before: null, after: OMAR }],
  untouched: [{ userId: "s4", ownerId: "t_00112233445566aa", reason: "owned" }], students: { total: 4, changed: 3, untouched: 1 }, pendingGrading: 0,
  visibility: { before: { kind: "shared" }, after: { kind: "teacher", accountId: OMAR }, studentServicesFollow: OMAR }, digest: "d".repeat(64)
};
const LEDGER = (over: Record<string, unknown> = {}) => ({ migrationId: "mig-" + "a".repeat(24), classId: "old", className: "العاشر القديم", decision: "assign", to: OMAR, reason: "إسناد موثّق", by: "owner:x", at: "2026-11-04T10:00:00.000Z", status: "applied", changes: PLAN.changes.map(c => ({ ...c, outcome: "changed" })), untouched: [], ...over });
let ledgers: ReturnType<typeof LEDGER>[] = [];

beforeEach(() => {
  calls = []; ledgers = [];
  routes = {
    "GET /api/owner-session": () => ({ status: 200, body: VIEW }),
    "GET /api/owner-teachers": () => ({ status: 200, body: { ok: true, teachers: [teacher(OMAR, "عمر", "t.omar"), teacher(SUSP, "موقوف", "t.susp", "suspended")] } }),
    "GET /api/owner-legacy-classes": () => ({ status: 200, body: { ok: true, visibilityToday: { kind: "shared" }, classes: [CLASS] } }),
    "GET /api/owner-legacy-classes/ledger": () => ({ status: 200, body: { ok: true, ledgers } }),
    "POST /api/owner-legacy-classes/preview": () => ({ status: 200, body: { ok: true, plan: PLAN } }),
    "POST /api/owner-legacy-classes/apply": () => ({ status: 200, body: { ok: true, ledger: LEDGER() } }),
    "POST /api/owner-session/step-up": () => ({ status: 200, body: VIEW })
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
  window.location.hash = ownerSectionHash("legacy");
  render(<OwnerApp />);
  return screen.findByRole("list", { name: "صفوف بلا مالك" });
}
async function previewAssign() {
  const list = await openSection();
  fireEvent.click(within(within(list).getByRole("listitem", { name: "العاشر القديم" })).getByRole("button", { name: "اتخاذ قرار" }));
  const panel = screen.getByRole("group", { name: "قرار العاشر القديم" });
  fireEvent.change(within(panel).getByRole("combobox"), { target: { value: OMAR } });
  fireEvent.click(within(panel).getByRole("button", { name: "معاينة" }));
  await screen.findByRole("region", { name: "المعاينة" });
  return panel;
}

describe("P9-A2 — the route and the section", () => {
  it("#/owner/legacy is the owner's; the menu offers «البيانات القديمة»", async () => {
    expect([isOwnerLocation("#/owner/legacy"), ownerViewFromHash("#/owner/legacy"), isOwnerLocation("#/owner/legacy/x")]).toEqual([true, "legacy", false]);
    const list = await openSection();
    expect(screen.getByRole("heading", { level: 2, name: "البيانات القديمة" })).toBeTruthy();
    expect(within(list).getByRole("listitem", { name: "العاشر القديم" }).textContent).toMatch(/4 طالبًا \(منهم 1 مؤرشف\) · 1 لهم معلم آخر · 1 واجبًا/);
    expect(screen.getByText(/اليوم: مشتركة/)).toBeTruthy();
    expect(posted("/api/owner-legacy-classes/preview")).toEqual([]);   // opening the section writes / previews nothing
  });
  it("no class without an owner, no decision: said plainly", async () => {
    routes["GET /api/owner-legacy-classes"] = () => ({ status: 200, body: { ok: true, visibilityToday: { kind: "legacy-owner", accountId: OMAR }, classes: [] } });
    window.location.hash = ownerSectionHash("legacy");
    render(<OwnerApp />);
    expect(await screen.findByText("لا توجد صفوف بلا مالك.")).toBeTruthy();
    expect(screen.getByText("لم تُتخذ أي قرارات بعد.")).toBeTruthy();
    expect(screen.getByText(/كلها عند المعلم عمر \(t\.omar\)/)).toBeTruthy();
  });
});

describe("P9-A2 — a decision: preview first, then a reason and the apply", () => {
  it("the preview shows what would change and who loses / gains the class; a suspended teacher is not offered", async () => {
    const list = await openSection();
    fireEvent.click(within(within(list).getByRole("listitem", { name: "العاشر القديم" })).getByRole("button", { name: "اتخاذ قرار" }));
    const panel = screen.getByRole("group", { name: "قرار العاشر القديم" });
    expect(within(panel).getAllByRole("option").map(o => o.textContent)).toEqual(["اختر معلمًا…", "عمر (t.omar)"]);
    expect(within(panel).getByRole("button", { name: "معاينة" })).toHaveProperty("disabled", true);
    fireEvent.change(within(panel).getByRole("combobox"), { target: { value: OMAR } });
    fireEvent.click(within(panel).getByRole("button", { name: "معاينة" }));
    const region = await screen.findByRole("region", { name: "المعاينة" });
    expect(region.textContent).toMatch(/يُسند الصف و3 طالبًا \(منهم 1 مؤرشف\) إلى عمر \(t\.omar\)/);
    expect(region.textContent).toMatch(/1 طالبًا لهم معلم آخر: لن يُمسّوا/);
    expect(region.textContent).toMatch(/من كان يراه مشتركًا لن يراه/);
    expect(posted("/api/owner-legacy-classes/preview").map(c => c.body)).toEqual([{ classId: "old", decision: "assign", toAccountId: OMAR }]);
    expect(posted("/api/owner-legacy-classes/apply")).toEqual([]);
  });
  it("«تنفيذ القرار» needs a reason; it sends the preview's digest and one request key — retried UNCHANGED after the step-up", async () => {
    let n = 0;
    routes["POST /api/owner-legacy-classes/apply"] = () => (++n === 1 ? { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "تحقق" } } : { status: 200, body: { ok: true, ledger: LEDGER() } });
    const panel = await previewAssign();
    const go = within(panel).getByRole("button", { name: "تنفيذ القرار" });
    expect(go).toHaveProperty("disabled", true);
    fireEvent.change(within(panel).getByRole("textbox"), { target: { value: "إسناد موثّق" } });
    fireEvent.click(go);
    const stepUp = await screen.findByRole("form", { name: "التحقق بخطوتين" });
    fireEvent.change(within(stepUp).getByRole("textbox"), { target: { value: "123456" } });
    fireEvent.click(within(stepUp).getByRole("button", { name: "تأكيد" }));
    expect(await screen.findByText("أُسند الصف «العاشر القديم» إلى عمر (t.omar).")).toBeTruthy();
    const sent = posted("/api/owner-legacy-classes/apply");
    expect(sent).toHaveLength(2);
    expect(sent[0].body).toMatchObject({ classId: "old", decision: "assign", toAccountId: OMAR, reason: "إسناد موثّق", previewDigest: PLAN.digest });
    expect(String(sent[0].body?.requestKey)).toMatch(/^lg[a-f0-9]{24}$/);
    expect(sent[1].body).toEqual(sent[0].body);
  });
  it("a half-done run: «إكمال التنفيذ» resends the SAME request key", async () => {
    let n = 0;
    routes["POST /api/owner-legacy-classes/apply"] = () => ({ status: 200, body: { ok: true, ledger: LEDGER(++n === 1 ? { status: "pending" } : {}) } });
    const panel = await previewAssign();
    fireEvent.change(within(panel).getByRole("textbox"), { target: { value: "إسناد موثّق" } });
    fireEvent.click(within(panel).getByRole("button", { name: "تنفيذ القرار" }));
    fireEvent.click(await within(panel).findByRole("button", { name: "إكمال التنفيذ" }));
    await screen.findByText("أُسند الصف «العاشر القديم» إلى عمر (t.omar).");
    const sent = posted("/api/owner-legacy-classes/apply");
    expect([sent.length, sent[1].body?.requestKey]).toEqual([2, sent[0].body?.requestKey]);
  });
  it("a stale preview (PREVIEW_STALE): the server's message, the preview dropped — preview again", async () => {
    routes["POST /api/owner-legacy-classes/apply"] = () => ({ status: 409, body: { ok: false, code: "PREVIEW_STALE", error: "تغيّر الصف أو طلابه منذ المعاينة. أعد المعاينة." } });
    const panel = await previewAssign();
    fireEvent.change(within(panel).getByRole("textbox"), { target: { value: "إسناد موثّق" } });
    fireEvent.click(within(panel).getByRole("button", { name: "تنفيذ القرار" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/أعد المعاينة/);
    expect(screen.queryByRole("region", { name: "المعاينة" })).toBeNull();
    expect(within(panel).getByRole("button", { name: "معاينة" })).toBeTruthy();
  });
  it("«يبقى مشتركًا» and «أرشفة» send no teacher; «أرشفة» is not offered for an archived class", async () => {
    const list = await openSection();
    fireEvent.click(within(within(list).getByRole("listitem", { name: "العاشر القديم" })).getByRole("button", { name: "اتخاذ قرار" }));
    const panel = screen.getByRole("group", { name: "قرار العاشر القديم" });
    fireEvent.click(within(panel).getByRole("radio", { name: "يبقى مشتركًا" }));
    expect(within(panel).queryByRole("combobox")).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: "معاينة" }));
    await screen.findByRole("region", { name: "المعاينة" });
    expect(posted("/api/owner-legacy-classes/preview").map(c => c.body)).toEqual([{ classId: "old", decision: "shared" }]);
    cleanup();
    routes["GET /api/owner-legacy-classes"] = () => ({ status: 200, body: { ok: true, visibilityToday: { kind: "shared" }, classes: [{ ...CLASS, status: "archived" }] } });
    const list2 = await openSection();
    fireEvent.click(within(within(list2).getByRole("listitem", { name: "العاشر القديم" })).getByRole("button", { name: "اتخاذ قرار" }));
    expect(within(screen.getByRole("group", { name: "قرار العاشر القديم" })).getByRole("radio", { name: "أرشفة" })).toHaveProperty("disabled", true);
  });
});

describe("P9-A2 — the decisions and «تراجع»", () => {
  it("an applied decision offers «تراجع» with a reason; the undo is sent for that ledger", async () => {
    ledgers = [LEDGER()];
    routes["POST /api/owner-legacy-classes/undo"] = () => ({ status: 200, body: { ok: true, ledger: LEDGER({ status: "undone" }) } });
    await openSection();
    const row = screen.getByRole("listitem", { name: "قرار العاشر القديم" });
    expect(row.textContent).toMatch(/إسناد إلى معلم → عمر \(t\.omar\)/);
    fireEvent.click(within(row).getByRole("button", { name: "تراجع" }));
    const undo = screen.getByRole("group", { name: "تراجع عن قرار العاشر القديم" });
    expect(within(undo).getByRole("button", { name: "تأكيد التراجع" })).toHaveProperty("disabled", true);
    fireEvent.change(within(undo).getByRole("textbox"), { target: { value: "أُسند خطأً" } });
    fireEvent.click(within(undo).getByRole("button", { name: "تأكيد التراجع" }));
    expect(await screen.findByText(/تُرُوجع عن القرار على الصف «العاشر القديم»/)).toBeTruthy();
    expect(posted("/api/owner-legacy-classes/undo").map(c => c.body)).toEqual([{ migrationId: LEDGER().migrationId, reason: "أُسند خطأً" }]);
  });
  it("the server refuses the undo (the class changed since): its message is shown", async () => {
    ledgers = [LEDGER()];
    routes["POST /api/owner-legacy-classes/undo"] = () => ({ status: 409, body: { ok: false, code: "UNDO_CONFLICT", error: "تغيّر الصف أو بعض طلابه منذ القرار، فلا يمكن التراجع عنه تلقائيًا.", conflicts: [{ type: "student", userId: "s3" }] } });
    await openSection();
    const row = screen.getByRole("listitem", { name: "قرار العاشر القديم" });
    fireEvent.click(within(row).getByRole("button", { name: "تراجع" }));
    const undo = screen.getByRole("group", { name: "تراجع عن قرار العاشر القديم" });
    fireEvent.change(within(undo).getByRole("textbox"), { target: { value: "أُسند خطأً" } });
    fireEvent.click(within(undo).getByRole("button", { name: "تأكيد التراجع" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/فلا يمكن التراجع عنه تلقائيًا/);
  });
  it("an undone or a pending decision offers no «تراجع»", async () => {
    ledgers = [LEDGER({ status: "undone", undoReason: "خطأ", undoneAt: "2026-11-04T11:00:00.000Z", migrationId: "mig-" + "b".repeat(24) }), LEDGER({ status: "pending", migrationId: "mig-" + "c".repeat(24), className: "صف آخر" })];
    await openSection();
    for (const name of ["قرار العاشر القديم", "قرار صف آخر"]) expect(within(screen.getByRole("listitem", { name })).queryByRole("button", { name: "تراجع" })).toBeNull();
    expect(screen.getByRole("listitem", { name: "قرار العاشر القديم" }).textContent).toMatch(/سبب التراجع: خطأ/);
  });
});
