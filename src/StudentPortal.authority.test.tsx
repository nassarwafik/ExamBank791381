// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import StudentPortal from "./StudentPortal";

// Grading-authority consistency pass — StudentPortal must be FAIL-SAFE: grading status is only taken from the
// server field or resolved from an actual result object's manualReviewMarks/finalized (the shared resolver).
// A score alone must NEVER be treated as "final".
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const asg = (id: string, over: Record<string, unknown>) => ({
  assignmentId: id, title: id, instructions: "تعليمات", openAt: "", dueAt: "", effectiveDueAt: "",
  questionCount: 1, totalMarks: 100, durationMinutes: 0, availability: "open", attemptsUsed: 1, allowedAttempts: 3,
  canAttempt: true, attemptStatus: "submitted", hasActiveAttempt: false, latestScore: null, latestPercentage: null,
  latestResult: null, createdAt: "", ...over
});
function mount(dashboard: Record<string, unknown>) {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/student-dashboard")) return res(200, dashboard);
    return res(200, { ok: true, posts: [], enrolled: false });
  }) as unknown as typeof fetch;
  return render(<StudentPortal token="t" displayName="أحمد" onLogout={vi.fn()} />);
}
const student = { userId: "u1", code: "C1", displayName: "أحمد", classId: "c1", shareAchievements: true };
const classroom = { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026" };

describe("StudentPortal grading authority — never infer final from a score", () => {
  it("A: an old payload with only latestScore/latestPercentage (no grading metadata) is NOT labeled final", async () => {
    mount({ student, classroom, assignments: [asg("A1", { latestScore: 62, latestPercentage: 62 })], stats: { assigned: 1, completed: 1, average: 62 } });
    // UX-7a: an available assignment is also offered in the primary section — scope to the assignments list.
    const card = within(await screen.findByRole("region", { name: /المهام والواجبات/ })).getByText("A1").closest(".student-assignment-card") as HTMLElement;
    // A numeric score must not make the card "final".
    expect(within(card).queryByText(/العلامة النهائية/)).toBeNull();
    expect(within(card).queryByText(/علامة مؤقتة/)).toBeNull();          // no fabricated grade at all
    // Fail-safe: falls through to lifecycle+availability (available), never the completed presentation.
    expect(within(card).queryByText("مكتمل")).toBeNull();
    expect(within(card).getByRole("button").textContent).toContain("ابدأ الحل");
  });

  it("B: a legacy pending result (finalized false, no gradingStatus) is provisional, never final", async () => {
    const legacyPending = { attemptNumber: 1, score: 62, totalMarks: 100, percentage: 62, submittedAt: "2026-03-01T10:00:00.000Z", manualReviewMarks: 18, finalized: false, teacherFeedback: "" };
    mount({ student, classroom, assignments: [asg("A1", { latestScore: 62, latestPercentage: 62, latestResult: legacyPending })], stats: { assigned: 1, completed: 1, average: 62 } });
    const card = (await screen.findByText("A1")).closest(".student-assignment-card") as HTMLElement;
    expect(within(card).getByText(/علامة مؤقتة/)).toBeTruthy();
    expect(within(card).getByText(/بانتظار مراجعة 18 علامة/)).toBeTruthy();
    expect(within(card).queryByText(/العلامة النهائية/)).toBeNull();
  });

  it("legacy final (finalized ABSENT, manualReviewMarks 0, no gradingStatus) resolves final", async () => {
    const legacyFinal = { attemptNumber: 1, score: 90, totalMarks: 100, percentage: 90, submittedAt: "2026-03-01T10:00:00.000Z", manualReviewMarks: 0, teacherFeedback: "" };
    mount({ student, classroom, assignments: [asg("A1", { latestScore: 90, latestPercentage: 90, latestResult: legacyFinal })], stats: { assigned: 1, completed: 1, average: 90 } });
    const card = (await screen.findByText("A1", { selector: ".eb-sp-task-title" })).closest(".student-assignment-card") as HTMLElement;   // 9A: the hub hero may show the title too
    expect(within(card).getByText(/العلامة النهائية/)).toBeTruthy();
    expect(within(card).queryByText(/علامة مؤقتة/)).toBeNull();
  });
});
