// @vitest-environment happy-dom
//
// Phase 21G.7 — through the REAL AssignmentsPanel: «تذكير من لم يسلّم» and «تذكير المحددين» (confirmed, the server decides who),
// and the gradebook as Excel (.xlsx download) and as a print report (PDF) — both from the same rows as the CSV.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AssignmentsPanel from "./AssignmentsPanel";

const printed: unknown[] = [];
vi.mock("./reports/printReport", () => ({ printReport: (r: unknown) => { printed.push(r); return true; } }));

const D = 24 * 3600 * 1000, at = (o: number) => new Date(Date.now() + o).toISOString();
const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", active: true, status: "active" }];
let ITEM: Record<string, unknown>;
const row = (id: string, name: string, done: boolean) => ({ studentId: id, studentName: name, studentCode: "12345" + id, attemptsUsed: done ? 1 : 0, allowedAttempts: 1, dueAtOverride: null, attempts: [], attemptStatus: done ? "submitted" : "notStarted", gradingStatus: done ? "final" : "notSubmitted", latestResult: done ? { attemptNumber: 1, score: 8, totalMarks: 10, percentage: 80, submittedAt: at(-3600e3), finalized: true, manualReviewMarks: 0 } : null });
const STUDENTS = [row("s1", "سارة", true), row("s2", "باسل", false), row("s3", "تالا", false)];
let calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, headers: new Headers(), json: async () => body } as unknown as Response);
function routed(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input), method = (init?.method || "GET").toUpperCase(), body = init?.body ? JSON.parse(String(init.body)) : {};
  calls.push({ url, method, body });
  if (url === "/api/assignment-progress") return json({ ok: true, progress: [] });
  if (url.startsWith("/api/assignments") && method === "GET") return json({ ok: true, assignments: [ITEM] });
  if (url.startsWith("/api/saved-exams")) return json({ ok: true, exams: [] });
  if (url === "/api/assignment-results" && body.action === "remindStudents") return json({ ok: true, reminded: body.studentIds ? 1 : 2, alreadyToday: 0, notNeeded: 1, failed: 0 });
  if (url.startsWith("/api/assignment-results")) return json({ ok: true, stats: { students: 3, submitted: 1, pendingReview: 0, finalized: 1, notSubmitted: 2, active: 0, average: 80, highest: 80, lowest: 80 }, students: STUDENTS });
  return json({ ok: true });
}
let blobs: Blob[] = [], downloads: string[] = [];
beforeEach(() => {
  calls = []; blobs = []; downloads = []; printed.length = 0;
  ITEM = { classId: "c1", className: "الحادي عشر", questionCount: 5, totalMarks: 10, maxAttempts: 1, durationMinutes: 0, assignmentId: "a1", title: "واجب الكسور", instructions: "", status: "published", openAt: at(-D), dueAt: at(3 * D) };
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  globalThis.fetch = vi.fn(routed) as unknown as typeof fetch;
  URL.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return "blob:x"; }) as never;
  URL.revokeObjectURL = vi.fn() as never;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openPage() {
  render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />);
  await screen.findByText("واجب الكسور");
  fireEvent.click(within(document.querySelector(".eb-assign-rows") as HTMLElement).getByRole("button", { name: "فتح" }));
  const page = await screen.findByRole("region", { name: "واجب الكسور" });
  await within(page).findByText("سارة");
  return page;
}
const confirmEl = () => waitFor(() => { const el = document.querySelector('.eb-confirm[role="dialog"]') as HTMLElement | null; if (!el) throw new Error("no confirm yet"); return el; });
const reminds = () => calls.filter(c => c.body.action === "remindStudents").map(c => c.body);

describe("21G.7 reminders and exports", () => {
  it("«تذكير من لم يسلّم» asks first, then reminds the whole class (the server decides who) and reports the counts", async () => {
    const page = await openPage();
    fireEvent.click(within(page).getByRole("button", { name: "تذكير من لم يسلّم" }));
    const dlg = await confirmEl();
    expect(dlg.textContent).toContain("كل من لم يسلّم بعد");
    fireEvent.click(within(dlg).getByRole("button", { name: "إرسال التذكير" }));
    await waitFor(() => expect(reminds()).toEqual([{ action: "remindStudents", assignmentId: "a1" }]));
    expect(await screen.findByText("✓ أُرسل التذكير إلى طالبان. طالب واحد لا يحتاج تذكيرًا (سلّم أو أُغلق عليه الواجب).")).toBeTruthy();
  });

  it("«تذكير المحددين» sends the ticked students only; a draft offers no reminder", async () => {
    const page = await openPage();
    fireEvent.click(within(page).getByRole("checkbox", { name: "تحديد تالا" }));
    fireEvent.click(within(within(page).getByRole("group", { name: "إجراءات الطلاب المحددين" })).getByRole("button", { name: "تذكير المحددين" }));
    fireEvent.click(within(await confirmEl()).getByRole("button", { name: "إرسال التذكير" }));
    await waitFor(() => expect(reminds()).toEqual([{ action: "remindStudents", assignmentId: "a1", studentIds: ["s3"] }]));
    cleanup();
    ITEM = { ...ITEM, status: "draft" };
    const draft = await openPage();
    expect(within(draft).queryByRole("button", { name: "تذكير من لم يسلّم" })).toBeNull();
  });

  it("exports the gradebook as an .xlsx workbook and as a print report of the same rows", async () => {
    const page = await openPage();
    fireEvent.change(within(page).getByLabelText("بحث بالاسم أو الكود"), { target: { value: "سارة" } });   // a search narrows the screen…
    fireEvent.click(within(page).getByRole("button", { name: "تصدير سجل العلامات (Excel)" }));
    expect(downloads).toEqual(["TadrisPlus-سجل-العلامات-واجب-الكسور.xlsx"]);
    expect(blobs[0].type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const bytes = new Uint8Array(await blobs[0].arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);          // a zip
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('rightToLeft="1"');
    for (const name of ["سارة", "باسل", "تالا"]) expect(text).toContain(">" + name + "<");          // …never the export: every student
    fireEvent.click(within(page).getByRole("button", { name: "طباعة سجل العلامات (PDF)" }));
    expect(printed).toHaveLength(1);
    expect(printed[0]).toMatchObject({ title: "سجل العلامات — واجب الكسور", rows: [["باسل", "•••••45s2", "لم يسلّم", "لم يبدأ", 0, 1, "", "", "", ""], ["تالا", "•••••45s3", "لم يسلّم", "لم يبدأ", 0, 1, "", "", "", ""], expect.arrayContaining(["سارة", "نهائي", 8, 10, 80])] });
  });
});
