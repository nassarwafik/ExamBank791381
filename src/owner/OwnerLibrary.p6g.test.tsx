// @vitest-environment happy-dom
// Tadris+ P6-G — the owner's review of a sent exam, against a mocked API (test data only): whether the teacher agreed to the platform's
//   use of it (one sent without the agreement can only be declined); «نسخ إلى مساحتي للتعديل» → the copy in the owner's teacher workspace,
//   opened through a one-time workspace link, refreshed, previewed, and published («نسختي المعدّلة», or «كما أرسله المعلم»); an edited copy
//   that is not ready cannot be published; the owner's copy in «من امتحاناتي» opens its submission's review; the list says «بتعديلاتك».
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
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
const COPY_EXAM = { ...EXAM, examId: "EXAM-lib-1", status: "draft", sections: [{ ...EXAM.sections[0], questions: [{ ...EXAM.sections[0].questions[0], text: "ما الشبكة؟ (بعد تعديل المالك)" }] }] };
const COPY = (over: Record<string, unknown> = {}) => ({ blobName: "exams/EXAM-lib-00000000000000000001.json", linked: true, exists: true, title: "امتحان سارة", savedAt: "2026-11-13T11:00:00.000Z", exam: COPY_EXAM, finalization: { canFinalize: true }, blockers: [], ...over });
const AGREED = { consented: true, consentVersion: "library-use-v1", consentedAt: "2026-11-13T09:00:00.000Z" };
const ID = "sub_00000000000000000001";
const detailRoute = (body: () => unknown) => { routes["GET /api/owner-library/submission?id=" + ID] = () => ({ status: 200, body: body() }); };
const PUBLISH_OK = () => ({ status: 200, body: { ok: true, item: PUBLISHED, submissionId: ID } });

describe("P6-G the teacher's agreement in the review", () => {
  beforeEach(() => {
    routes["GET /api/owner-library/submissions"] = () => ({ status: 200, body: { ok: true, pending: 1, submissions: [SUB(ID, AGREED)] } });
  });

  it("an agreed exam says so, with the text the teacher agreed to", async () => {
    detailRoute(() => DETAIL({ submission: SUB(ID, AGREED), consentText: "أُقرّ بأن هذا الامتحان من إعدادي (نص اختباري)." }));
    const r = await review(await openTeachersExams());
    const agreed = within(r).getByText("✓ أقرّ المعلم بحقوق الاستخدام في 2026-11-13").closest("details") as HTMLElement;
    expect(agreed.textContent).toContain("أُقرّ بأن هذا الامتحان من إعدادي (نص اختباري).");
    expect(within(r).getByRole("form", { name: "نشر الامتحان المرسل" })).toBeTruthy();
  });

  it("one sent without the agreement: it says why, offers neither publishing nor a copy — only declining", async () => {
    routes["GET /api/owner-library/submissions"] = () => ({ status: 200, body: { ok: true, pending: 1, submissions: [SUB(ID, { consented: false })] } });
    detailRoute(() => DETAIL({ submission: SUB(ID, { consented: false }) }));
    const r = await review(await openTeachersExams());
    expect(within(r).getByRole("alert").textContent).toContain("دون إقرار المعلم بحقوق الاستخدام");
    expect(within(r).queryByRole("form", { name: "نشر الامتحان المرسل" })).toBeNull();
    expect(within(r).queryByRole("button", { name: "نسخ إلى مساحتي للتعديل" })).toBeNull();
    expect(within(r).getByRole("form", { name: "رفض الامتحان المرسل" })).toBeTruthy();
  });
});

describe("P6-G the owner edits before publishing", () => {
  beforeEach(() => {
    routes["GET /api/owner-library/submissions"] = () => ({ status: 200, body: { ok: true, pending: 1, submissions: [SUB(ID, AGREED)] } });
  });

  it("copy → open my workspace (one-time link) → refresh → preview my copy → publish my edited copy", async () => {
    let copied = false;
    detailRoute(() => DETAIL({ submission: SUB(ID, { ...AGREED, ...(copied ? { ownerCopy: { blobName: COPY().blobName, copiedAt: "2026-11-13T10:00:00.000Z" } } : {}) }), ...(copied ? { ownerCopy: COPY() } : {}) }));
    routes["POST /api/owner-library/copy-submission"] = () => { copied = true; return { status: 200, body: { ok: true, created: true, ownerCopy: { blobName: COPY().blobName, title: "امتحان سارة" }, submission: SUB(ID, AGREED) } }; };
    routes["POST /api/owner-handoff/issue"] = () => ({ status: 200, body: { ok: true, handoffPath: "#/handoff/tok-1", expiresAt: "2026-11-13T12:01:00.000Z" } });
    routes["POST /api/owner-library/publish-submission"] = PUBLISH_OK;
    const r = await review(await openTeachersExams());
    const edit = within(r).getByRole("region", { name: "تعديل قبل النشر" });
    fireEvent.click(within(edit).getByRole("button", { name: "نسخ إلى مساحتي للتعديل" }));
    expect(await within(r).findByText("✓ نسختك المعدّلة جاهزة للنشر.")).toBeTruthy();
    expect(posted("/api/owner-library/copy-submission").map(c => c.body)).toEqual([{ submissionId: ID }]);
    expect(within(r).getByRole("region", { name: "تعديل قبل النشر" }).textContent).toContain("«امتحاناتي»");
    fireEvent.click(within(r).getByRole("button", { name: "فتح مساحتي كمعلم" }));
    const link = await within(r).findByRole("link", { name: "فتح مساحة المعلم في تبويب جديد" });
    expect(link.getAttribute("href")).toContain("#/handoff/tok-1");
    expect([link.getAttribute("target"), link.getAttribute("rel")]).toEqual(["_blank", "noopener noreferrer"]);
    const reads = calls.filter(c => c.url === "/api/owner-library/submission?id=" + ID).length;
    fireEvent.click(within(r).getByRole("button", { name: "تحديث النسخة" }));
    await vi.waitFor(() => expect(calls.filter(c => c.url === "/api/owner-library/submission?id=" + ID).length).toBe(reads + 1));
    fireEvent.click(within(r).getByRole("button", { name: /معاينة نسختي/ }));
    expect(await screen.findByText("ما الشبكة؟ (بعد تعديل المالك)", {}, { timeout: 8000 })).toBeTruthy();
    const form = within(r).getByRole("form", { name: "نشر الامتحان المرسل" });
    expect((within(form).getByRole("radio", { name: "نسختي المعدّلة" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.change(within(form).getByLabelText("التصنيف"), { target: { value: "final" } });
    fireEvent.click(within(form).getByRole("button", { name: "نشر في البنك (بتعديلاتي)" }));
    await screen.findByRole("form", { name: "جمهور امتحان الشبكات" });
    expect(posted("/api/owner-library/publish-submission")[0].body).toEqual({ submissionId: ID, title: "امتحان سارة", category: "final", activityType: "exam", description: "", fromOwnerCopy: true });
  });

  it("the owner may still publish what the teacher sent; an edited copy that is not ready lists why and cannot be published", async () => {
    detailRoute(() => DETAIL({ submission: SUB(ID, AGREED), ownerCopy: COPY({ finalization: { canFinalize: false }, blockers: ["سؤال بلا مفتاح إجابة"] }) }));
    routes["POST /api/owner-library/publish-submission"] = PUBLISH_OK;
    const r = await review(await openTeachersExams());
    expect(within(within(within(r).getByRole("region", { name: "تعديل قبل النشر" })).getByRole("alert")).getByText("سؤال بلا مفتاح إجابة")).toBeTruthy();
    const form = within(r).getByRole("form", { name: "نشر الامتحان المرسل" });
    fireEvent.change(within(form).getByLabelText("التصنيف"), { target: { value: "final" } });
    expect((within(form).getByRole("button", { name: "نشر في البنك (بتعديلاتي)" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(form).getByRole("radio", { name: "كما أرسله المعلم" }));
    fireEvent.click(within(form).getByRole("button", { name: "نشر في البنك" }));
    await screen.findByRole("form", { name: "جمهور امتحان الشبكات" });
    expect(posted("/api/owner-library/publish-submission")[0].body).toEqual({ submissionId: ID, title: "امتحان سارة", category: "final", activityType: "exam", description: "" });
  });

  it("an exam sent not ready, fixed in the owner's copy: only the copy can be published", async () => {
    detailRoute(() => DETAIL({ submission: SUB(ID, AGREED), finalization: { canFinalize: false }, blockers: ["سؤال بلا مفتاح إجابة"], ownerCopy: COPY() }));
    const r = await review(await openTeachersExams());
    const form = within(r).getByRole("form", { name: "نشر الامتحان المرسل" });
    fireEvent.change(within(form).getByLabelText("التصنيف"), { target: { value: "final" } });
    expect((within(form).getByRole("button", { name: "نشر في البنك (بتعديلاتي)" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(within(form).getByRole("radio", { name: "كما أرسله المعلم" }));
    expect((within(form).getByRole("button", { name: "نشر في البنك" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a copy no longer in the workspace can be copied again; without a linked workspace the review says how to link one", async () => {
    detailRoute(() => DETAIL({ submission: SUB(ID, AGREED), ownerCopy: { blobName: COPY().blobName, linked: true, exists: false } }));
    let r = await review(await openTeachersExams());
    expect(within(r).getByText("لم تعد نسختك موجودة في مساحتك. يمكنك نسخ الامتحان من جديد.")).toBeTruthy();
    expect(within(r).getByRole("button", { name: "نسخ إلى مساحتي للتعديل" })).toBeTruthy();
    cleanup();
    detailRoute(() => DETAIL({ submission: SUB(ID, AGREED), ownerCopy: { blobName: COPY().blobName, linked: false, exists: false } }));
    r = await review(await openTeachersExams());
    expect(within(r).getByRole("note").textContent).toContain("مساحة المعلم الخاصة بك");
  });

  it("the owner's copy in «من امتحاناتي» opens its submission's review (it is never taken as a new exam); the list says «بتعديلاتك»", async () => {
    routes["GET /api/owner-library/submissions"] = () => ({ status: 200, body: { ok: true, pending: 1, submissions: [SUB(ID, AGREED), SUB("sub_00000000000000000009", { ...AGREED, title: "امتحان منشور", status: "published", editedByOwner: true, libraryItemId: "IMP-004" })] } });
    routes["GET /api/owner-library/own-exams"] = () => ({ status: 200, body: { ok: true, linked: true, exams: [{ blobName: COPY().blobName, title: "امتحان سارة", savedAt: "2026-11-13T11:00:00.000Z", questionCount: 5, ownerCopyOf: ID }] } });
    detailRoute(() => DETAIL({ submission: SUB(ID, AGREED), ownerCopy: COPY() }));
    const panel = await openTeachersExams();
    expect((within(panel).getByText("امتحان منشور").closest("li") as HTMLElement).textContent).toContain("نُشر بتعديلاتك · IMP-004");
    fireEvent.click(within(panel).getByRole("button", { name: "من امتحاناتي" }));
    const row = (await within(panel).findByText(/نسختك المعدّلة من امتحان أرسله معلم/)).closest("li") as HTMLElement;
    expect(within(row).queryByRole("button", { name: "مراجعة ونشر" })).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "فتح المراجعة" }));
    expect(await screen.findByRole("region", { name: "مراجعة «امتحان سارة»" })).toBeTruthy();
    expect(posted("/api/owner-library/take-own")).toEqual([]);
  });
});
