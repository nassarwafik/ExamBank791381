// @vitest-environment happy-dom
// Tadris+ P6-G — the agreement to the platform's use of an exam the teacher sends, against a mocked API (test data only): the text
//   comes from the server and is shown in the confirmation; «إرسال» stays disabled until «قرأت الإقرار وأوافق عليه» is ticked; the
//   version agreed to is sent; a confirmation never reuses an earlier tick; without the agreement's text nothing can be sent; an exam the
//   owner published with edits says «نُشر في بنك المنصة بتعديلات من المالك».
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ExamBankPage from "./ExamBankPage";


const EXAMS = [
  { blobName: "exams/s1.json", examId: "s1", title: "امتحان منظّم", savedAt: "2026-11-12T09:00:00.000Z", questionCount: 5, totalMarks: 100, kind: "structured" },
  { blobName: "exams/s2.json", examId: "s2", title: "امتحان عدّله المالك", savedAt: "2026-11-10T09:00:00.000Z", questionCount: 4, totalMarks: 40, kind: "structured" }
];
const CONSENT = { version: "library-use-v1", text: "أُقرّ بأن هذا الامتحان من إعدادي (نص اختباري)." };
const sub = (id: string, blob: string, status: string, over: Record<string, unknown> = {}) => ({ submissionId: id, savedExamBlob: blob, title: "x", questionCount: 4, status, submittedAt: "2026-11-12T10:00:00.000Z", ...over });
type Call = { url: string; method: string; body: Record<string, unknown> };
let calls: Call[] = [];
let consent: unknown = CONSENT;
const json = (data: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => data } as Response);

beforeEach(() => {
  calls = []; consent = CONSENT;
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, method, body });
    if (url === "/api/bank-questions") return json({ ok: true, questions: [] });
    if (url === "/api/saved-exams") return json({ ok: true, exams: EXAMS });
    if (url === "/api/library-submissions" && method === "GET") return json({ ok: true, submissions: [sub("sub_00000000000000000002", "exams/s2.json", "published", { published: true, editedByOwner: true })], ...(consent ? { consent } : {}) });
    if (url === "/api/library-submissions" && body.action === "submit") return json({ ok: true, submission: sub("sub_00000000000000000001", "exams/s1.json", "pending") });
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
const startSending = async () => {
  await waitFor(() => within(rowOf("امتحان منظّم")).getByRole("button", { name: "إرسال إلى بنك المنصة" }));
  fireEvent.click(within(rowOf("امتحان منظّم")).getByRole("button", { name: "إرسال إلى بنك المنصة" }));
  return confirmEl();
};

describe("P6-G the agreement before «إرسال إلى بنك المنصة»", () => {
  it("the server's text is shown; «إرسال» is disabled until the box is ticked; the agreed version is sent", async () => {
    await openSaved();
    const dialog = await startSending();
    expect(dialog.textContent).toContain("إقرار حقوق الاستخدام:");
    expect(dialog.textContent).toContain(CONSENT.text);
    const go = within(dialog).getByRole("button", { name: "إرسال" }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.click(go);
    expect(posted()).toEqual([]);
    const box = within(dialog).getByRole("checkbox", { name: "قرأت الإقرار وأوافق عليه" }) as HTMLInputElement;
    fireEvent.click(box);
    expect(go.disabled).toBe(false);
    fireEvent.click(box);                                   // unticked again
    expect(go.disabled).toBe(true);
    fireEvent.click(box);
    fireEvent.click(go);
    await screen.findByText("✓ أُرسل «امتحان منظّم» إلى مالك المنصة للمراجعة.");
    expect(posted()).toEqual([{ action: "submit", blobName: "exams/s1.json", consentVersion: "library-use-v1" }]);
  });

  it("a new confirmation starts unticked (an earlier tick is never reused); cancelling sends nothing", async () => {
    await openSaved();
    let dialog = await startSending();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "قرأت الإقرار وأوافق عليه" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(document.querySelector('.eb-confirm[role="dialog"]')).toBeNull());
    dialog = await startSending();
    expect((within(dialog).getByRole("checkbox", { name: "قرأت الإقرار وأوافق عليه" }) as HTMLInputElement).checked).toBe(false);
    expect((within(dialog).getByRole("button", { name: "إرسال" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء" }));
    expect(posted()).toEqual([]);
  });

  it("without the agreement's text from the server nothing can be sent", async () => {
    consent = null;
    await openSaved();
    await waitFor(() => expect(calls.filter(c => c.url === "/api/library-submissions").length).toBe(1));
    expect(within(rowOf("امتحان منظّم")).queryByRole("button", { name: /إرسال/ })).toBeNull();
  });

  it("an exam the owner published with edits says so", async () => {
    await openSaved();
    expect(await within(rowOf("امتحان عدّله المالك")).findByText("نُشر في بنك المنصة بتعديلات من المالك")).toBeTruthy();
  });
});
