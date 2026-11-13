// @vitest-environment happy-dom
// Tadris+ P6-F — «إرسال إلى بنك المنصة» in the teacher's saved exams, against a mocked API (test data only):
//   a structured exam can be sent (after a confirmation), a legacy one cannot; the row says where it stands — «قيد مراجعة المالك» (with
//   «سحب الإرسال»), «نُشر في بنك المنصة» (and «إرسال نسخة محدَّثة»), «رُفض» with the owner's reason; the server's refusal is shown as is;
//   a teacher without an account (the read is refused) is offered nothing; the states are read once, when the saved exams open.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ExamBankPage from "./ExamBankPage";

const EXAMS = [
  { blobName: "exams/s1.json", examId: "s1", title: "امتحان منظّم", savedAt: "2026-11-12T09:00:00.000Z", questionCount: 5, totalMarks: 100, kind: "structured" },
  { blobName: "exams/l1.json", examId: "l1", title: "امتحان قديم", savedAt: "2026-11-11T09:00:00.000Z", questionCount: 3, totalMarks: 30, kind: "legacy" },
  { blobName: "exams/s2.json", examId: "s2", title: "امتحان منشور", savedAt: "2026-11-10T09:00:00.000Z", questionCount: 4, totalMarks: 40, kind: "structured" },
  { blobName: "exams/s3.json", examId: "s3", title: "امتحان مرفوض", savedAt: "2026-11-09T09:00:00.000Z", questionCount: 4, totalMarks: 40, kind: "structured" }
];
// P6-G — the agreement to the platform's use of the exam comes with the read; sending needs its box ticked
const CONSENT = { version: "library-use-v1", text: "أُقرّ بأن هذا الامتحان من إعدادي (نص اختباري)." };
const sub = (id: string, blob: string, status: string, over: Record<string, unknown> = {}) => ({ submissionId: id, savedExamBlob: blob, title: "x", questionCount: 4, status, submittedAt: "2026-11-12T10:00:00.000Z", ...over });
type Call = { url: string; method: string; body: Record<string, unknown> };
let calls: Call[] = [];
let subs: unknown[] = [];
let subsStatus = 200;
let submitReply: { status: number; body: unknown } = { status: 200, body: {} };
const json = (data: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => data } as Response);

beforeEach(() => {
  calls = []; subsStatus = 200;
  subs = [sub("sub_00000000000000000002", "exams/s2.json", "published"), sub("sub_00000000000000000003", "exams/s3.json", "declined", { reason: "أضف أسئلة على الوحدة 3" })];
  submitReply = { status: 200, body: { ok: true, submission: sub("sub_00000000000000000001", "exams/s1.json", "pending") } };
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, method, body });
    if (url === "/api/bank-questions") return json({ ok: true, questions: [] });
    if (url === "/api/saved-exams") return json({ ok: true, exams: EXAMS });
    if (url === "/api/library-submissions" && method === "GET") return subsStatus === 200 ? json({ ok: true, submissions: subs, consent: CONSENT }) : json({ ok: false, code: "ACCOUNT_REQUIRED", error: "الإرسال إلى بنك المنصة متاح لحسابات المعلمين فقط." }, subsStatus);
    if (url === "/api/library-submissions" && body.action === "submit") return json(submitReply.body, submitReply.status);
    if (url === "/api/library-submissions" && body.action === "withdraw") return json({ ok: true, submission: sub(String(body.submissionId), "exams/s1.json", "withdrawn") });
    return json({ ok: true });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openSaved() {
  render(<ExamBankPage token="t" onOpenBuilder={vi.fn()} onOpenImport={vi.fn()} onOpenSavedExam={vi.fn()} onCopyLibraryExamToBuilder={vi.fn()} />);
  await screen.findByText("عدد الأسئلة");
  fireEvent.click(within(screen.getByRole("group", { name: "أقسام بنك الامتحانات" })).getByRole("button", { name: "الامتحانات المحفوظة" }));
  await screen.findByText("امتحان منظّم");
}
const rowOf = (title: string) => screen.getByText(title).closest("li") as HTMLElement;
const confirmEl = () => waitFor(() => { const el = document.querySelector('.eb-confirm[role="dialog"]') as HTMLElement | null; if (!el) throw new Error("no confirm"); return el; });
const posted = () => calls.filter(c => c.method === "POST" && c.url === "/api/library-submissions").map(c => c.body);

describe("P6-F «إرسال إلى بنك المنصة»", () => {
  it("each row says where its exam stands; a legacy exam offers nothing", async () => {
    await openSaved();
    await waitFor(() => expect(within(rowOf("امتحان منشور")).getByText("نُشر في بنك المنصة")).toBeTruthy());
    expect(within(rowOf("امتحان منشور")).getByRole("button", { name: "إرسال نسخة محدَّثة" })).toBeTruthy();
    expect(within(rowOf("امتحان مرفوض")).getByText("رُفض")).toBeTruthy();
    expect(within(rowOf("امتحان مرفوض")).getByText("السبب: أضف أسئلة على الوحدة 3")).toBeTruthy();
    expect(within(rowOf("امتحان مرفوض")).getByRole("button", { name: "إرسال إلى بنك المنصة" })).toBeTruthy();
    expect(within(rowOf("امتحان قديم")).queryByRole("button", { name: /إرسال/ })).toBeNull();
    expect(calls.filter(c => c.url === "/api/library-submissions").length).toBe(1);   // read once
  });

  it("sends after a confirmation; then «قيد مراجعة المالك» and «سحب الإرسال», which withdraws it", async () => {
    await openSaved();
    await waitFor(() => within(rowOf("امتحان منظّم")).getByRole("button", { name: "إرسال إلى بنك المنصة" }));
    fireEvent.click(within(rowOf("امتحان منظّم")).getByRole("button", { name: "إرسال إلى بنك المنصة" }));
    fireEvent.click(within(await confirmEl()).getByRole("checkbox", { name: "قرأت الإقرار وأوافق عليه" }));
    fireEvent.click(within(await confirmEl()).getByRole("button", { name: "إرسال" }));
    await screen.findByText("✓ أُرسل «امتحان منظّم» إلى مالك المنصة للمراجعة.");
    expect(posted()).toEqual([{ action: "submit", blobName: "exams/s1.json", consentVersion: "library-use-v1" }]);
    expect(within(rowOf("امتحان منظّم")).getByText("قيد مراجعة المالك")).toBeTruthy();
    fireEvent.click(within(rowOf("امتحان منظّم")).getByRole("button", { name: "سحب الإرسال" }));
    await screen.findByText("✓ سُحب الإرسال.");
    expect(posted()[1]).toEqual({ action: "withdraw", submissionId: "sub_00000000000000000001" });
    expect(within(rowOf("امتحان منظّم")).getByRole("button", { name: "إرسال إلى بنك المنصة" })).toBeTruthy();
  });

  it("the server's refusal (an exam that is not ready) is shown as is; nothing else changes", async () => {
    submitReply = { status: 422, body: { ok: false, code: "EXAM_NOT_READY", error: "الامتحان غير جاهز للإرسال: افتحه في الباني وأصلح ما يمنع «اعتماد نهائي»، ثم احفظه وأرسله من جديد." } };
    await openSaved();
    await waitFor(() => within(rowOf("امتحان منظّم")).getByRole("button", { name: "إرسال إلى بنك المنصة" }));
    fireEvent.click(within(rowOf("امتحان منظّم")).getByRole("button", { name: "إرسال إلى بنك المنصة" }));
    fireEvent.click(within(await confirmEl()).getByRole("checkbox", { name: "قرأت الإقرار وأوافق عليه" }));
    fireEvent.click(within(await confirmEl()).getByRole("button", { name: "إرسال" }));
    expect((await screen.findByRole("alert")).textContent).toContain("الامتحان غير جاهز للإرسال");
    expect(within(rowOf("امتحان منظّم")).queryByText("قيد مراجعة المالك")).toBeNull();
  });

  it("cancelling the confirmation sends nothing", async () => {
    await openSaved();
    await waitFor(() => within(rowOf("امتحان منظّم")).getByRole("button", { name: "إرسال إلى بنك المنصة" }));
    fireEvent.click(within(rowOf("امتحان منظّم")).getByRole("button", { name: "إرسال إلى بنك المنصة" }));
    fireEvent.click(within(await confirmEl()).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(document.querySelector('.eb-confirm[role="dialog"]')).toBeNull());
    expect(posted()).toEqual([]);
  });

  it("a teacher without an account (the read is refused) is offered nothing", async () => {
    subsStatus = 403;
    await openSaved();
    await waitFor(() => expect(calls.some(c => c.url === "/api/library-submissions")).toBe(true));
    expect(screen.queryByRole("button", { name: /إرسال/ })).toBeNull();
  });
});
