// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import AssignmentsPanel from "./AssignmentsPanel";

// B2B #19–23/#34 — the gradebook exposes lifecycle info and the three individual teacher controls
// (grant extra attempt with confirmation, reopen, extend an active timed attempt with a due-clip warning).

const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", active: true }];
const ASSIGNMENT = { assignmentId: "a1", classId: "c1", className: "الحادي عشر", title: "واجب مؤقت", instructions: "x", status: "published", openAt: "", dueAt: "2026-01-01T11:10:00.000Z", questionCount: 1, totalMarks: 10, maxAttempts: 1, durationMinutes: 90 };

// One student mid timed attempt (extend applies), one who already submitted (no extend button).
const ACTIVE_STUDENT = { studentId: "s1", studentName: "طالب نشط", studentCode: "S1", attemptsUsed: 0, allowedAttempts: 1, dueAtOverride: null, attemptStatus: "started", timed: true, activeAttempt: { attemptNumber: 1, startedAt: "2026-01-01T10:00:00.000Z", endsAt: "2026-01-01T11:00:00.000Z", extendedEndsAt: "" }, effectiveAttemptEndsAt: "2026-01-01T11:00:00.000Z", attemptDurationEndsAt: "2026-01-01T11:00:00.000Z", attemptExpired: false, canStartAttempt: false, canWrite: true, attempts: [], latestResult: null };
const DONE_STUDENT = { studentId: "s2", studentName: "طالب مسلّم", studentCode: "S2", attemptsUsed: 1, allowedAttempts: 1, dueAtOverride: null, attemptStatus: "submitted", timed: true, activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: false, canWrite: false, attempts: [{ attemptNumber: 1, score: 8, totalMarks: 10, percentage: 80, submittedAt: "2026-01-01T10:20:00.000Z", finalized: true, manualReviewMarks: 0 }], latestResult: { attemptNumber: 1, score: 8, totalMarks: 10, percentage: 80, submittedAt: "2026-01-01T10:20:00.000Z", finalized: true, manualReviewMarks: 0, teacherFeedback: "" } };

const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
let lastPost: { url: string; body: Record<string, unknown> } | null;
function installFetch() {
  lastPost = null;
  (globalThis as { fetch?: unknown }).fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); const method = (init && init.method) || "GET";
    if (url.includes("/api/assignments") && method !== "POST") return json({ ok: true, assignments: [ASSIGNMENT] });
    if (url.includes("/api/saved-exams") && method !== "POST") return json({ ok: true, exams: [] });
    if (url.includes("/api/saved-exams")) return json({ ok: true, exam: null });
    if (url.includes("/api/assignment-results") && method !== "POST") return json({ ok: true, assignment: { assignmentId: "a1", title: "واجب مؤقت", dueAt: ASSIGNMENT.dueAt, durationMinutes: 90, maxAttempts: 1, totalMarks: 10 }, stats: { students: 2, submitted: 1, pendingReview: 0, average: 80, highest: 80, lowest: 80 }, students: [ACTIVE_STUDENT, DONE_STUDENT] });
    if (url.includes("/api/assignment-results")) { lastPost = { url, body: JSON.parse(String(init!.body)) }; return json({ ok: true, allowedAttempts: 2, attemptsUsed: 0, attemptStatus: "started", activeAttempt: ACTIVE_STUDENT.activeAttempt, effectiveAttemptEndsAt: "2026-01-01T11:30:00.000Z", dueAtOverride: null }); }
    return json({ ok: true });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  (window as unknown as { confirm: (m?: string) => boolean }).confirm = () => true;
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  installFetch();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openGradebook() {
  const r = render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />);
  fireEvent.click(await r.findByText("📊 سجل العلامات"));
  await r.findByText("طالب نشط");
  return r;
}
const rowOf = (r: ReturnType<typeof render>, name: string) => (r.getByText(name).closest("tr") as HTMLElement);

describe("AssignmentsPanel — B2B gradebook lifecycle controls", () => {
  it("shows lifecycle info + the three controls for an active timed student", async () => {
    const r = await openGradebook();
    const row = rowOf(r, "طالب نشط");
    expect(within(row).getByText("قيد المحاولة")).toBeTruthy();      // lifecycle badge
    expect(within(row).getByText(/ينتهي فعليًا:/)).toBeTruthy();     // effective end shown
    expect(within(row).getByText("+ منح محاولة إضافية")).toBeTruthy();
    expect(within(row).getByText("إعادة فتح للطالب")).toBeTruthy();
    expect(within(row).getByText("⏱ تمديد وقت المحاولة")).toBeTruthy();
  });

  it("no extend button for a student without an active attempt", async () => {
    const r = await openGradebook();
    const row = rowOf(r, "طالب مسلّم");
    expect(within(row).queryByText("⏱ تمديد وقت المحاولة")).toBeNull();
  });

  it("grant extra attempt requires confirmation and posts allowRetry", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const r = await openGradebook();
    fireEvent.click(within(rowOf(r, "طالب نشط")).getByText("+ منح محاولة إضافية"));
    await waitFor(() => expect(lastPost?.body.action).toBe("allowRetry"));
    expect(confirmSpy).toHaveBeenCalled();
  });

  it("extend shows the timer fields, a due-clip warning for a late time, and posts extendActiveAttempt", async () => {
    const r = await openGradebook();
    fireEvent.click(within(rowOf(r, "طالب نشط")).getByText("⏱ تمديد وقت المحاولة"));
    expect(await r.findByText(/النهاية الأصلية:/)).toBeTruthy();
    // a new end far past the student's effective due date must surface the clip warning (#23)
    const input = r.container.querySelector(".extend-inline input[type=datetime-local]") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-01-02T05:00" } });
    expect(await r.findByText(/موعد تسليم الطالب الحالي سيوقف المحاولة قبل هذا الوقت/)).toBeTruthy();
    fireEvent.click(r.getByText("حفظ التمديد"));
    await waitFor(() => expect(lastPost?.body.action).toBe("extendActiveAttempt"));
    expect(String(lastPost?.body.newEndsAt || "")).not.toBe("");
  });

  it("reopen opens an inline control and posts reopenStudent", async () => {
    const r = await openGradebook();
    fireEvent.click(within(rowOf(r, "طالب مسلّم")).getByText("إعادة فتح للطالب"));
    const input = r.container.querySelector(".reopen-edit-row input[type=datetime-local]") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-01-03T09:00" } });
    fireEvent.click(r.getByText("حفظ إعادة الفتح"));
    await waitFor(() => expect(lastPost?.body.action).toBe("reopenStudent"));
    expect(String(lastPost?.body.reopenUntil || "")).not.toBe("");
  });
});
