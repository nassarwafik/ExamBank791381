// @vitest-environment happy-dom
// Tadris+ P6-F — «امتحانات المعلمين» in the Owner Console's «بنك الامتحانات», against a mocked API (test data only):
//   the pending count on the button; the sent exams with their teacher and state; a review that previews the exam as a student sees it,
//   publishes it (retried unchanged after the second-factor check) and then chooses its audience — or declines it with a reason (required);
//   an updated version says what it replaces, and a replacement that did not finish offers «إكمال الاستبدال»; «من امتحاناتي» lists the
//   owner's own workspace (or says how to link it) and takes one for review; the table marks the versions.
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

const SUB = (id: string, over: Record<string, unknown> = {}) => ({ submissionId: id, teacherId: SARA, teacherName: "سارة", title: "امتحان سارة", questionCount: 5, totalMarks: 100, status: "pending", submittedAt: "2026-11-13T09:00:00.000Z", sentBy: "teacher", governed: false, ...over });
const EXAM = { examId: "EXAM-1", title: "امتحان سارة", sections: [{ id: "core", title: "القسم", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "multipleChoice", text: "ما الشبكة؟", marks: 5, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 1 } }] }] };
const DETAIL = (over: Record<string, unknown> = {}) => ({ ok: true, submission: SUB("sub_00000000000000000001"), exam: EXAM, replaces: null, finalization: { canFinalize: true }, blockers: [], ...over });
const PUBLISHED = { libraryItemId: "IMP-001", title: "امتحان الشبكات", category: "final", questionCount: 5, totalMarks: 100, audience: "selected", teachers: [], decided: false, imported: true };

async function openTeachersExams() {
  await openSection();
  fireEvent.click(await screen.findByRole("button", { name: /امتحانات المعلمين/ }));
  return screen.findByRole("region", { name: "امتحانات المعلمين للبنك" }, { timeout: 8000 });   // a lazy chunk
}
async function review(panel: HTMLElement, title = "امتحان سارة") {
  const row = (await within(panel).findByText(title)).closest("li") as HTMLElement;
  fireEvent.click(within(row).getByRole("button", { name: "مراجعة" }));
  return screen.findByRole("region", { name: "مراجعة «" + title + "»" });
}

describe("P6-F the exams teachers send", () => {
  beforeEach(() => {
    routes["GET /api/owner-library/submissions"] = () => ({ status: 200, body: { ok: true, pending: 1, submissions: [SUB("sub_00000000000000000001"), SUB("sub_00000000000000000002", { title: "امتحان قديم مرفوض", status: "declined", reason: "ناقص" })] } });
    routes["GET /api/owner-library/submission?id=sub_00000000000000000001"] = () => ({ status: 200, body: DETAIL() });
  });

  it("the button shows how many wait; the list names the teacher and the state", async () => {
    await openSection();
    expect((await screen.findByRole("button", { name: /امتحانات المعلمين/ })).textContent).toContain("1");
    fireEvent.click(screen.getByRole("button", { name: /امتحانات المعلمين/ }));
    const panel = await screen.findByRole("region", { name: "امتحانات المعلمين للبنك" }, { timeout: 8000 });
    const pendingRow = (await within(panel).findByText("امتحان سارة")).closest("li") as HTMLElement;
    expect(pendingRow.textContent).toContain("سارة");
    expect(pendingRow.textContent).toContain("قيد المراجعة");
    const declined = within(panel).getByText("امتحان قديم مرفوض").closest("li") as HTMLElement;
    expect(declined.textContent).toContain("السبب: ناقص");
    expect(within(declined).queryByRole("button", { name: "مراجعة" })).toBeNull();
  });

  it("review → preview as a student sees it → publish (retried after the second-factor check) → choose who sees it", async () => {
    let n = 0;
    routes["POST /api/owner-library/publish-submission"] = () => (++n === 1 ? { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "تحقق" } } : { status: 200, body: { ok: true, item: PUBLISHED, submissionId: "sub_00000000000000000001" } });
    routes["POST /api/owner-session/step-up"] = () => ({ status: 200, body: VIEW });
    routes["POST /api/owner-library/set-audience"] = c => ({ status: 200, body: { ok: true, item: { libraryItemId: "IMP-001", audience: c.body?.audience, teachers: c.body?.teachers, decided: true } } });
    const panel = await openTeachersExams();
    const r = await review(panel);
    expect(within(r).getByText("✓ الامتحان جاهز للنشر.")).toBeTruthy();
    fireEvent.click(within(r).getByRole("button", { name: "معاينة الامتحان" }));
    expect(await screen.findByText("ما الشبكة؟", {}, { timeout: 8000 })).toBeTruthy();       // the student view (lazy)
    const form = within(r).getByRole("form", { name: "نشر الامتحان المرسل" });
    expect((within(form).getByLabelText("عنوان الامتحان في البنك") as HTMLInputElement).value).toBe("امتحان سارة");
    fireEvent.change(within(form).getByLabelText("عنوان الامتحان في البنك"), { target: { value: "امتحان الشبكات" } });
    fireEvent.change(within(form).getByLabelText("التصنيف"), { target: { value: "final" } });
    fireEvent.click(within(form).getByRole("button", { name: "نشر في البنك" }));
    const stepUp = await screen.findByRole("form", { name: "التحقق بخطوتين" });
    fireEvent.change(within(stepUp).getByRole("textbox"), { target: { value: "123456" } });
    fireEvent.click(within(stepUp).getByRole("button", { name: "تأكيد" }));
    const audience = await screen.findByRole("form", { name: "جمهور امتحان الشبكات" });
    const sent = posted("/api/owner-library/publish-submission");
    expect(sent).toHaveLength(2);
    expect(sent[1].body).toEqual(sent[0].body);
    expect(sent[0].body).toEqual({ submissionId: "sub_00000000000000000001", title: "امتحان الشبكات", category: "final", activityType: "exam", description: "" });
    fireEvent.click(within(audience).getByRole("checkbox", { name: /عمر/ }));
    fireEvent.click(within(audience).getByRole("button", { name: "حفظ التغييرات" }));
    await screen.findByText("نُشر «امتحان الشبكات» (IMP-001) وحُفظ جمهوره.");
    expect(posted("/api/owner-library/set-audience")[0].body).toEqual({ itemId: "IMP-001", audience: "selected", teachers: [OMAR] });
  });

  it("decline needs a reason; it is sent to the teacher", async () => {
    routes["POST /api/owner-library/decline-submission"] = c => ({ status: 200, body: { ok: true, submission: SUB(String(c.body?.submissionId), { status: "declined", reason: c.body?.reason }) } });
    const panel = await openTeachersExams();
    const r = await review(panel);
    const form = within(r).getByRole("form", { name: "رفض الامتحان المرسل" });
    expect((within(form).getByRole("button", { name: "رفض" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText("سبب الرفض (يصل إلى المعلم)"), { target: { value: "أضف أسئلة على الوحدة 3" } });
    fireEvent.click(within(form).getByRole("button", { name: "رفض" }));
    await screen.findByText("رُفض «امتحان سارة»، ووصل السبب إلى المعلم.");
    expect(posted("/api/owner-library/decline-submission")[0].body).toEqual({ submissionId: "sub_00000000000000000001", reason: "أضف أسئلة على الوحدة 3" });
  });

  it("an exam that is not ready cannot be published here: its reasons are listed, only declining is offered", async () => {
    routes["GET /api/owner-library/submission?id=sub_00000000000000000001"] = () => ({ status: 200, body: DETAIL({ finalization: { canFinalize: false }, blockers: ["سؤال بلا مفتاح إجابة"] }) });
    const panel = await openTeachersExams();
    const r = await review(panel);
    expect(within(r).getByRole("alert").textContent).toContain("سؤال بلا مفتاح إجابة");
    expect(within(r).queryByRole("form", { name: "نشر الامتحان المرسل" })).toBeNull();
    expect(within(r).getByRole("form", { name: "رفض الامتحان المرسل" })).toBeTruthy();
  });

  it("an updated version says what it replaces; a replacement that did not finish offers «إكمال الاستبدال»", async () => {
    routes["GET /api/owner-library/submission?id=sub_00000000000000000001"] = () => ({ status: 200, body: DETAIL({ replaces: { libraryItemId: "IMP-001", title: "امتحان سارة القديم" } }) });
    routes["POST /api/owner-library/publish-submission"] = () => ({ status: 200, body: { ok: true, item: { ...PUBLISHED, libraryItemId: "IMP-002", replaces: "IMP-001" }, submissionId: "sub_00000000000000000001", replaces: "IMP-001", replacementPending: true } });
    routes["POST /api/owner-library/complete-replacement"] = () => ({ status: 200, body: { ok: true, libraryItemId: "IMP-002", replaces: "IMP-001" } });
    const panel = await openTeachersExams();
    const r = await review(panel);
    expect(within(r).getByRole("note").textContent).toContain("نسخة محدَّثة من «امتحان سارة القديم» (IMP-001)");
    const form = within(r).getByRole("form", { name: "نشر الامتحان المرسل" });
    fireEvent.change(within(form).getByLabelText("التصنيف"), { target: { value: "final" } });
    fireEvent.click(within(form).getByRole("button", { name: "نشر النسخة المحدَّثة" }));
    const warn = await screen.findByText(/لكن نقل الجمهور من IMP-001 لم يكتمل/);
    fireEvent.click(within(warn.closest("[role=alert]") as HTMLElement).getByRole("button", { name: "إكمال الاستبدال" }));
    await screen.findByText(/وحلّ محل النسخة السابقة\./);
    expect(posted("/api/owner-library/complete-replacement")[0].body).toEqual({ libraryItemId: "IMP-002" });
  });
});

describe("P6-F «من امتحاناتي» — the owner's own workspace", () => {
  beforeEach(() => { routes["GET /api/owner-library/submissions"] = () => ({ status: 200, body: { ok: true, pending: 0, submissions: [] } }); });

  it("not linked: says how to link it", async () => {
    routes["GET /api/owner-library/own-exams"] = () => ({ status: 200, body: { ok: true, linked: false, exams: [] } });
    const panel = await openTeachersExams();
    fireEvent.click(within(panel).getByRole("button", { name: "من امتحاناتي" }));
    expect(await within(panel).findByText(/لم تربط حسابك بمساحة معلم بعد/)).toBeTruthy();
  });
  it("linked: its saved exams; «مراجعة ونشر» takes one and opens its review", async () => {
    routes["GET /api/owner-library/own-exams"] = () => ({ status: 200, body: { ok: true, linked: true, exams: [{ blobName: "exams/own-1.json", title: "امتحاني", savedAt: "2026-11-13T08:00:00.000Z", questionCount: 5 }] } });
    routes["POST /api/owner-library/take-own"] = () => ({ status: 200, body: { ok: true, submission: SUB("sub_00000000000000000009", { title: "امتحاني", sentBy: "owner" }) } });
    routes["GET /api/owner-library/submission?id=sub_00000000000000000009"] = () => ({ status: 200, body: DETAIL({ submission: SUB("sub_00000000000000000009", { title: "امتحاني", sentBy: "owner" }) }) });
    const panel = await openTeachersExams();
    fireEvent.click(within(panel).getByRole("button", { name: "من امتحاناتي" }));
    const row = (await within(panel).findByText("امتحاني")).closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "مراجعة ونشر" }));
    expect(await screen.findByRole("region", { name: "مراجعة «امتحاني»" })).toBeTruthy();
    expect(posted("/api/owner-library/take-own")[0].body).toEqual({ blobName: "exams/own-1.json" });
  });
});

describe("P6-F the table marks the versions", () => {
  it("«من معلم», «نسخة سابقة ← …», «نسخة محدَّثة من …»; «إكمال الاستبدال» only while the old one is not marked replaced", async () => {
    items.push({ ...exam("IMP-001", "النسخة الأولى", "final", { audience: "selected", teachers: [], decided: true }), imported: true, fromTeacher: true } as ReturnType<typeof exam>);
    items.push({ ...exam("IMP-002", "النسخة الثانية", "final", { audience: "selected", teachers: [], decided: false }), imported: true, fromTeacher: true, replaces: "IMP-001" } as ReturnType<typeof exam>);
    routes["GET /api/owner-library/submissions"] = () => ({ status: 200, body: { ok: true, pending: 0, submissions: [] } });
    const list = await openSection();
    const second = within(list).getByRole("rowgroup", { name: "النسخة الثانية" });
    expect(second.textContent).toContain("من معلم");
    expect(second.textContent).toContain("نسخة محدَّثة من IMP-001");
    expect(within(second).getByRole("button", { name: "إكمال الاستبدال" })).toBeTruthy();
    cleanup();
    items[items.length - 2] = { ...items[items.length - 2], replacedBy: "IMP-002" } as ReturnType<typeof exam>;
    const again = await openSection();
    expect(within(again).getByRole("rowgroup", { name: "النسخة الأولى" }).textContent).toContain("نسخة سابقة ← IMP-002");
    expect(within(within(again).getByRole("rowgroup", { name: "النسخة الثانية" })).queryByRole("button", { name: "إكمال الاستبدال" })).toBeNull();
  });
});
