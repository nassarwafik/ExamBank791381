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
// An active timed student who ALREADY has a dueAtOverride (effective end clipped to 11:10) — for the clear-override test.
const OVERRIDE_STUDENT = { studentId: "s3", studentName: "طالب ممدد", studentCode: "S3", attemptsUsed: 0, allowedAttempts: 1, dueAtOverride: "2026-01-01T11:15:00.000Z", attemptStatus: "started", timed: true, activeAttempt: { attemptNumber: 1, startedAt: "2026-01-01T10:00:00.000Z", endsAt: "2026-01-01T11:00:00.000Z", extendedEndsAt: "2026-01-01T11:30:00.000Z" }, effectiveAttemptEndsAt: "2026-01-01T11:15:00.000Z", attemptDurationEndsAt: "2026-01-01T11:30:00.000Z", attemptExpired: false, canStartAttempt: false, canWrite: true, attempts: [], latestResult: null };

const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
let lastPost: { url: string; body: Record<string, unknown> } | null;
function installFetch() {
  lastPost = null;
  (globalThis as { fetch?: unknown }).fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); const method = (init && init.method) || "GET";
    if (url.includes("/api/assignments") && method !== "POST") return json({ ok: true, assignments: [ASSIGNMENT] });
    if (url.includes("/api/saved-exams") && method !== "POST") return json({ ok: true, exams: [] });
    if (url.includes("/api/saved-exams")) return json({ ok: true, exam: null });
    if (url.includes("/api/assignment-results") && method !== "POST") return json({ ok: true, assignment: { assignmentId: "a1", title: "واجب مؤقت", dueAt: ASSIGNMENT.dueAt, durationMinutes: 90, maxAttempts: 1, totalMarks: 10 }, stats: { students: 3, submitted: 1, pendingReview: 0, average: 80, highest: 80, lowest: 80 }, students: [ACTIVE_STUDENT, DONE_STUDENT, OVERRIDE_STUDENT] });
    if (url.includes("/api/assignment-results")) {
      const body = JSON.parse(String(init!.body)); lastPost = { url, body };
      if (body.action === "setDueAtOverride") {
        const cleared = body.dueAtOverride === null || body.dueAtOverride === undefined || body.dueAtOverride === "";
        // Authoritative snapshot the teacher UI must apply verbatim (B2B blocker-3): the effective end
        // reflects the new due (extended => 11:30 shows through) or reverts (cleared => clipped to 11:00).
        return json({ ok: true, dueAtOverride: cleared ? null : body.dueAtOverride, attemptStatus: "started", activeAttempt: ACTIVE_STUDENT.activeAttempt, effectiveAttemptEndsAt: cleared ? "2026-01-01T11:00:00.000Z" : "2026-01-01T11:30:00.000Z", attemptDurationEndsAt: "2026-01-01T11:30:00.000Z", attemptExpired: false, canStartAttempt: false, canWrite: true, timed: true, attemptsUsed: 0, allowedAttempts: 1 });
      }
      return json({ ok: true, allowedAttempts: 2, attemptsUsed: 0, attemptStatus: "started", activeAttempt: ACTIVE_STUDENT.activeAttempt, effectiveAttemptEndsAt: "2026-01-01T11:30:00.000Z", dueAtOverride: null });
    }
    return json({ ok: true });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  installFetch();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openGradebook() {
  const r = render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />);
  fireEvent.click(await r.findByRole("button", { name: "فتح" }));
  await r.findByText("طالب نشط");
  return r;
}
const rowOf = (r: ReturnType<typeof render>, name: string) => (r.getByText(name).closest("tr") as HTMLElement);
// UX-5: lifecycle actions live in the row's labelled disclosure; editors are small Dialogs; confirms are the shared ConfirmDialog.
async function openRowMenu(r: ReturnType<typeof render>, name: string) { fireEvent.click(within(rowOf(r, name)).getByRole("button", { name: /^إجراءات / })); return await r.findByRole("group", { name: /^إجراءات / }); }
async function rowAction(r: ReturnType<typeof render>, name: string, label: string) { fireEvent.click(within(await openRowMenu(r, name)).getByRole("button", { name: label })); }
const confirmEl = () => waitFor(() => { const el = document.querySelector('.eb-confirm[role="dialog"]') as HTMLElement | null; if (!el) throw new Error("no confirm yet"); return el; });
async function confirmDialog() { const d = await confirmEl(); fireEvent.click(d.querySelector(".eb-dialog-foot .is-primary, .eb-dialog-foot .is-danger") as HTMLElement); }
const dialogByName = (r: ReturnType<typeof render>, name: string) => r.findByRole("dialog", { name });

describe("AssignmentsPanel — B2B gradebook lifecycle controls", () => {
  it("shows lifecycle info + the three controls for an active timed student", async () => {
    const r = await openGradebook();
    const row = rowOf(r, "طالب نشط");
    expect(within(row).getByText("قيد المحاولة")).toBeTruthy();      // lifecycle badge
    expect(within(row).getByText(/ينتهي فعليًا:/)).toBeTruthy();     // effective end shown
    const menu = await openRowMenu(r, "طالب نشط");
    expect(within(menu).getByText("منح محاولة إضافية")).toBeTruthy();
    expect(within(menu).getByText("إعادة فتح للطالب")).toBeTruthy();
    expect(within(menu).getByText("تمديد وقت المحاولة")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
  });

  it("no extend button for a student without an active attempt", async () => {
    const r = await openGradebook();
    const menu = await openRowMenu(r, "طالب مسلّم");
    expect(within(menu).queryByText("تمديد وقت المحاولة")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
  });

  it("grant extra attempt requires confirmation and posts allowRetry", async () => {
    const r = await openGradebook();
    await rowAction(r, "طالب نشط", "منح محاولة إضافية");
    expect((await confirmEl()).textContent).toContain("سيتم السماح للطالب بمحاولة إضافية دون حذف المحاولات السابقة.");
    expect(lastPost).toBeNull();                                          // nothing sent before the confirmation
    await confirmDialog();
    await waitFor(() => expect(lastPost?.body.action).toBe("allowRetry"));
  });

  it("extend dialog shows the timer fields, a due-clip warning for a late time, and posts extendActiveAttempt after confirmation", async () => {
    const r = await openGradebook();
    await rowAction(r, "طالب نشط", "تمديد وقت المحاولة");
    const dialog = await dialogByName(r, "تمديد وقت المحاولة");
    expect(within(dialog).getByText(/النهاية الأصلية/)).toBeTruthy();
    // a new end far past the student's effective due date must surface the clip warning (#23)
    fireEvent.change(within(dialog).getByLabelText("النهاية الجديدة"), { target: { value: "2026-01-02T05:00" } });
    expect(await r.findByText(/موعد تسليم الطالب الحالي سيوقف المحاولة قبل هذا الوقت/)).toBeTruthy();
    fireEvent.click(within(dialog).getByText("حفظ التمديد"));
    await confirmDialog();
    await waitFor(() => expect(lastPost?.body.action).toBe("extendActiveAttempt"));
    expect(String(lastPost?.body.newEndsAt || "")).not.toBe("");
  });

  it("3A: setting a dueAtOverride applies the authoritative snapshot to the row without a reload (B2B blocker-3)", async () => {
    const r = await openGradebook();
    const row = rowOf(r, "طالب نشط");
    const before = within(row).getByText(/ينتهي فعليًا:/).textContent || "";
    await rowAction(r, "طالب نشط", "تمديد الموعد");
    const dialog = await dialogByName(r, "تمديد الموعد");
    fireEvent.change(within(dialog).getByLabelText("الموعد الجديد"), { target: { value: "2026-01-01T11:45" } });
    fireEvent.click(within(dialog).getByText("حفظ التمديد"));
    await waitFor(() => expect(lastPost?.body.action).toBe("setDueAtOverride"));
    // the row now reflects the server snapshot: a "تمديد حتى" badge appears AND the effective end changed
    const after = rowOf(r, "طالب نشط");
    await waitFor(() => expect(within(after).queryByText(/تمديد حتى:/)).toBeTruthy());
    expect(within(after).getByText(/ينتهي فعليًا:/).textContent).not.toBe(before); // 11:00 -> 11:30
  });

  it("3B: clearing a dueAtOverride applies the returned (reverted) snapshot to the row without a reload", async () => {
    const r = await openGradebook();
    const row = rowOf(r, "طالب ممدد");
    expect(within(row).queryByText(/تمديد حتى:/)).toBeTruthy();       // starts extended
    await rowAction(r, "طالب ممدد", "تمديد الموعد");
    fireEvent.click(within(await dialogByName(r, "تمديد الموعد")).getByText("إلغاء التمديد"));
    await waitFor(() => expect(lastPost?.body.action).toBe("setDueAtOverride"));
    expect(lastPost?.body.dueAtOverride).toBeNull();
    const after = rowOf(r, "طالب ممدد");
    await waitFor(() => expect(within(after).queryByText(/تمديد حتى:/)).toBeNull()); // badge gone (snapshot merged)
  });

  it("openReopen defaults to a BLANK input when the student has no existing override (not the original due)", async () => {
    const r = await openGradebook();
    await rowAction(r, "طالب مسلّم", "إعادة فتح للطالب");
    const input = within(await dialogByName(r, "إعادة فتح للطالب")).getByLabelText(/إعادة الفتح حتى/) as HTMLInputElement;
    expect(input.value).toBe(""); // NOT prefilled to the assignment's original dueAt (would fail > dueAt)
  });

  it("reopen opens its dialog, requires confirmation and posts reopenStudent", async () => {
    const r = await openGradebook();
    await rowAction(r, "طالب مسلّم", "إعادة فتح للطالب");
    const dialog = await dialogByName(r, "إعادة فتح للطالب");
    fireEvent.change(within(dialog).getByLabelText(/إعادة الفتح حتى/), { target: { value: "2026-01-03T09:00" } });
    fireEvent.click(within(dialog).getByText("حفظ إعادة الفتح"));
    await confirmDialog();
    await waitFor(() => expect(lastPost?.body.action).toBe("reopenStudent"));
    expect(String(lastPost?.body.reopenUntil || "")).not.toBe("");
  });
});
