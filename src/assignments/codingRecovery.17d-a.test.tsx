// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import AssignmentsPanel from "../AssignmentsPanel";
import { bulkRetryNotice, codingStatusBadge } from "./codingRecovery";

// Phase 17D-A — teacher-facing coding grading operations in the gradebook:
//   • a server-derived aggregate status per row: «تصحيح برمجي جارٍ» / «التصحيح البرمجي يحتاج إعادة محاولة» — never a raw
//     technical code as the label;
//   • ONE bulk action «إعادة محاولة التصحيح البرمجي» (confirmation first) → POST /api/coding/bulk-retry { assignmentId } →
//     a summary notice «تمت جدولة إعادة المحاولة لـ N أسئلة برمجية.» and an authoritative reload of the gradebook.
// Fail-first on e9a3ddb: codingRecovery.ts, the badges and the bulk action do not exist.
const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", active: true }];
const ASSIGNMENT = { assignmentId: "a1", classId: "c1", className: "الحادي عشر", title: "واجب برمجة", instructions: "x", status: "published", openAt: "", dueAt: "2026-01-01T13:00:00.000Z", questionCount: 1, totalMarks: 10, maxAttempts: 1, durationMinutes: 0, attemptPolicy: "continuous" };
const attempt = (codingGrading?: Record<string, number>) => ({ attemptNumber: 1, score: 0, totalMarks: 10, percentage: 0, submittedAt: "2026-01-01T10:20:00.000Z", finalized: false, manualReviewMarks: 10, gradingStatus: "pendingReview", endReason: "submitted", ...(codingGrading ? { codingGrading } : {}) });
const row = (studentId: string, studentName: string, codingGrading?: Record<string, number>) => ({ studentId, studentName, studentCode: studentId.toUpperCase(), attemptsUsed: 1, allowedAttempts: 1, dueAtOverride: null, attemptStatus: "submitted", gradingStatus: "pendingReview", activeAttempt: null, timed: false, attempts: [attempt(codingGrading)], latestResult: { ...attempt(codingGrading), teacherFeedback: "" } });
const RUNNING = row("s1", "طالب جارٍ", { pending: 1, retryable: 0, stale: 0 });
const NEEDS = row("s2", "طالب متعثر", { pending: 0, retryable: 1, stale: 0 });
const STALE = row("s3", "طالب منتظر", { pending: 0, retryable: 0, stale: 1 });
const PLAIN = row("s4", "طالب عادي");

const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, headers: new Headers(), json: async () => body } as Response);
let posts: Array<{ url: string; body: Record<string, unknown> }>, getCount: number, summary: Record<string, number> | undefined, assignment: Record<string, unknown>, bulkReply: () => Promise<Response>;
beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  posts = []; getCount = 0; summary = { pending: 1, retryable: 1, stale: 1 }; assignment = ASSIGNMENT;
  bulkReply = () => json({ ok: true, scheduled: 8, dispatched: 6, retryable: 2, hasMore: false });
  (globalThis as { fetch?: unknown }).fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init && init.method) || "GET";
    if (url.includes("/api/assignments") && method !== "POST") return json({ ok: true, assignments: [assignment] });
    if (url.includes("/api/saved-exams")) return json({ ok: true, exams: [] });
    if (url.includes("/api/assignment-results") && method !== "POST") { getCount++; return json({ ok: true, assignment: { assignmentId: "a1", title: "واجب برمجة", dueAt: ASSIGNMENT.dueAt, durationMinutes: 0, maxAttempts: 1, totalMarks: 10 }, stats: { students: 4, submitted: 4, pendingReview: 4, average: 0, highest: 0, lowest: 0 }, students: [RUNNING, NEEDS, STALE, PLAIN], ...(summary ? { codingSummary: summary } : {}) }); }
    if (url.includes("/api/coding/bulk-retry")) { posts.push({ url, body: JSON.parse(String(init!.body)) }); return bulkReply(); }
    return json({ ok: true });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openGradebook() {
  const r = render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />);
  if (assignment.status === "archived") fireEvent.click(await r.findByRole("button", { name: /المؤرشفة/ }));
  fireEvent.click(await r.findByRole("button", { name: "فتح" }));
  await r.findByText("طالب جارٍ");
  return r;
}
const rowOf = (r: ReturnType<typeof render>, name: string) => r.getByText(name).closest("tr") as HTMLElement;
const BULK = "إعادة محاولة التصحيح البرمجي";
const confirmEl = () => waitFor(() => { const el = document.querySelector('.eb-confirm[role="dialog"]') as HTMLElement | null; if (!el) throw new Error("no confirm yet"); return el; });

describe("U1–U2 — pure helpers", () => {
  it("U1 codingStatusBadge: retry wins over running; nothing open → null; never a raw technical code", () => {
    expect(codingStatusBadge({ pending: 1, retryable: 0, stale: 0 })).toEqual({ tone: "info", label: "تصحيح برمجي جارٍ" });
    expect(codingStatusBadge({ pending: 1, retryable: 1, stale: 0 })).toEqual({ tone: "warn", label: "التصحيح البرمجي يحتاج إعادة محاولة" });
    expect(codingStatusBadge({ pending: 0, retryable: 0, stale: 2 })).toEqual({ tone: "warn", label: "التصحيح البرمجي يحتاج إعادة محاولة" });
    expect(codingStatusBadge({ pending: 0, retryable: 0, stale: 0 })).toBeNull();
    expect(codingStatusBadge(undefined)).toBeNull();
  });
  it("U2 bulkRetryNotice: the scheduled count, nothing to do, and the hasMore continuation", () => {
    expect(bulkRetryNotice({ scheduled: 8, hasMore: false })).toBe("تمت جدولة إعادة المحاولة لـ 8 أسئلة برمجية.");
    expect(bulkRetryNotice({ scheduled: 0, hasMore: false })).toBe("لا توجد أسئلة برمجية تحتاج إلى إعادة المحاولة الآن.");
    expect(bulkRetryNotice({ scheduled: 12, hasMore: true })).toBe("تمت جدولة إعادة المحاولة لـ 12 أسئلة برمجية. ما زالت هناك أسئلة أخرى؛ أعد تنفيذ الإجراء لمتابعتها.");
  });
});

describe("U3–U6 — gradebook badges and the bulk action", () => {
  it("U3 rows show the aggregate status badge; a row without open coding grading shows none; no technical codes", async () => {
    const r = await openGradebook();
    expect(within(rowOf(r, "طالب جارٍ")).getByText("تصحيح برمجي جارٍ")).toBeTruthy();
    expect(within(rowOf(r, "طالب متعثر")).getByText("التصحيح البرمجي يحتاج إعادة محاولة")).toBeTruthy();
    expect(within(rowOf(r, "طالب منتظر")).getByText("التصحيح البرمجي يحتاج إعادة محاولة")).toBeTruthy();
    expect(within(rowOf(r, "طالب عادي")).queryByText(/التصحيح البرمجي|تصحيح برمجي/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/EXECUTION_|RUNNER_|retryable|stale/);
  });

  it("U4 the bulk action asks for confirmation, posts ONLY { assignmentId }, shows the summary and reloads the gradebook", async () => {
    const r = await openGradebook();
    const before = getCount;
    fireEvent.click(r.getByRole("button", { name: BULK }));
    const d = await confirmEl();
    expect(d.textContent).toContain("لن تتغير الإجابات أو المراجعات اليدوية");
    fireEvent.click(within(d).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(document.querySelector('.eb-confirm[role="dialog"]')).toBeNull());
    expect(posts).toHaveLength(0);
    fireEvent.click(r.getByRole("button", { name: BULK }));
    fireEvent.click(within(await confirmEl()).getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toContain("/api/coding/bulk-retry");
    expect(posts[0].body).toEqual({ assignmentId: "a1" });
    await r.findByText("تمت جدولة إعادة المحاولة لـ 8 أسئلة برمجية.");
    await waitFor(() => expect(getCount).toBeGreaterThan(before));
  });

  it("U5 hidden when nothing needs a retry (only running) or the assignment is archived", async () => {
    summary = { pending: 2, retryable: 0, stale: 0 };
    const r = await openGradebook();
    expect(r.queryByRole("button", { name: BULK })).toBeNull();
    cleanup();
    summary = { pending: 0, retryable: 3, stale: 0 }; assignment = { ...ASSIGNMENT, status: "archived" };
    const r2 = await openGradebook();
    expect(r2.queryByRole("button", { name: BULK })).toBeNull();
  });

  it("U6 a failed bulk request shows the server error and changes nothing locally", async () => {
    bulkReply = () => json({ ok: false, code: "INTERNAL" }, 500);
    const r = await openGradebook();
    fireEvent.click(r.getByRole("button", { name: BULK }));
    fireEvent.click(within(await confirmEl()).getByRole("button", { name: "إعادة المحاولة" }));
    await r.findByText("تعذر جدولة إعادة محاولة التصحيح البرمجي.");
    expect(within(rowOf(r, "طالب متعثر")).getByText("التصحيح البرمجي يحتاج إعادة محاولة")).toBeTruthy();
  });
});
