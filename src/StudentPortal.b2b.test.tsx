// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import StudentPortal from "./StudentPortal";

// B2B #24 — the assignment card must offer "متابعة المحاولة" whenever the server reports a live active
// attempt, even if canAttempt is false because maxAttempts was reduced after the attempt started.

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);

function dashboardWith(assignment: Record<string, unknown>) {
  return {
    student: { userId: "u1", code: "C-1", displayName: "أحمد", classId: "c1", shareAchievements: true },
    classroom: { classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026" },
    assignments: [assignment],
    stats: { assigned: 1, completed: 0, average: null }
  };
}
function mount(assignment: Record<string, unknown>) {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/student-dashboard")) return res(200, dashboardWith(assignment));
    return res(200, { ok: true, posts: [], enrolled: false });
  }) as unknown as typeof fetch;
  return render(<StudentPortal token="t" displayName="أحمد" onLogout={vi.fn()} />);
}
const baseAssignment = { assignmentId: "a1", title: "واجب مؤقت", instructions: "x", openAt: "", dueAt: "", questionCount: 1, totalMarks: 10, availability: "open", attemptsUsed: 1, allowedAttempts: 1, canAttempt: false, latestScore: null, latestPercentage: null, createdAt: "" };

describe("StudentPortal — resume label for a live active attempt (B2B #24)", () => {
  it("hasActiveAttempt + canAttempt false (maxAttempts reduced) => 'متابعة المحاولة'", async () => {
    mount({ ...baseAssignment, attemptStatus: "started", hasActiveAttempt: true });
    expect(await screen.findByText("متابعة المحاولة")).toBeTruthy();
  });
  it("attemptStatus 'draft' also resumes, regardless of canAttempt", async () => {
    mount({ ...baseAssignment, attemptStatus: "draft", hasActiveAttempt: true });
    expect(await screen.findByText("متابعة المحاولة")).toBeTruthy();
  });
  it("a closed assignment with a live active attempt is still resumable (button enabled)", async () => {
    mount({ ...baseAssignment, availability: "closed", attemptStatus: "started", hasActiveAttempt: true });
    const btn = await screen.findByText("متابعة المحاولة") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
  it("no active attempt (submitted, canAttempt) keeps the normal wording, not the resume label", async () => {
    mount({ ...baseAssignment, attemptStatus: "submitted", hasActiveAttempt: false, canAttempt: true, allowedAttempts: 2, dashboardState: "completed", gradingStatus: "final", latestScore: 8, latestPercentage: 80, latestResult: { attemptNumber: 1, score: 8, totalMarks: 10, percentage: 80, submittedAt: "2026-03-01T10:00:00.000Z", manualReviewMarks: 0, finalized: true, gradingStatus: "final", teacherFeedback: "" } });
    expect(await screen.findByText("النتيجة / محاولة جديدة")).toBeTruthy();
    expect(screen.queryByText("متابعة المحاولة")).toBeNull();
  });
});
