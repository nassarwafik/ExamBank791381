// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent, within } from "@testing-library/react";
import StudentPortal from "./StudentPortal";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);

const asg = (id: string, over: Record<string, unknown>) => ({
  assignmentId: id, title: id, instructions: "تعليمات", openAt: "", dueAt: "", effectiveDueAt: "",
  questionCount: 1, totalMarks: 100, durationMinutes: 0, availability: "open", attemptsUsed: 1, allowedAttempts: 3,
  canAttempt: true, attemptStatus: "submitted", hasActiveAttempt: false, latestScore: null, latestPercentage: null,
  latestResult: null, createdAt: "", ...over
});
const pendingLR = { attemptNumber: 1, score: 62, totalMarks: 100, percentage: 62, submittedAt: "2026-03-01T10:00:00.000Z", manualReviewMarks: 18, finalized: false, gradingStatus: "pendingReview", teacherFeedback: "" };
const finalLR = { attemptNumber: 1, score: 84, totalMarks: 100, percentage: 84, submittedAt: "2026-03-01T10:00:00.000Z", manualReviewMarks: 0, finalized: true, gradingStatus: "final", teacherFeedback: "راجع الوحدة 3" };

function mount(dashboard: Record<string, unknown>) {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/student-dashboard")) return res(200, dashboard);
    if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
    if (url.includes("/api/student-project-tracker")) return res(200, { ok: true, enrolled: false });
    return res(404, { ok: false });
  }) as unknown as typeof fetch;
  return render(<StudentPortal token="t" displayName="أحمد" onLogout={vi.fn()} />);
}
const student = { userId: "u1", code: "C1", displayName: "أحمد", classId: "c1", shareAchievements: true };
const classroom = { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026" };

describe("R12 StudentPortal grading display", () => {
  it("W: a pending result card shows علامة مؤقتة + بانتظار المعلم, NOT العلامة النهائية", async () => {
    mount({ student, classroom, assignments: [asg("A1", { dashboardState: "awaitingReview", gradingStatus: "pendingReview", latestResult: pendingLR })], stats: { assigned: 1, completed: 1, average: 62, pendingReview: 1, finalized: 0, inProgress: 0, averageFinalized: null } });
    const card = (await screen.findByText("A1")).closest(".student-assignment-card") as HTMLElement;
    expect(within(card).getByText(/علامة مؤقتة/)).toBeTruthy();
    expect(within(card).getByText(/بانتظار مراجعة 18 علامة/)).toBeTruthy();
    expect(within(card).queryByText(/العلامة النهائية/)).toBeNull();
  });

  it("X: a final result card shows العلامة النهائية", async () => {
    mount({ student, classroom, assignments: [asg("A1", { dashboardState: "completed", gradingStatus: "final", latestResult: finalLR })], stats: { assigned: 1, completed: 1, average: 84, pendingReview: 0, finalized: 1, inProgress: 0, averageFinalized: 84 } });
    const card = (await screen.findByText("A1")).closest(".student-assignment-card") as HTMLElement;
    expect(within(card).getByText(/العلامة النهائية/)).toBeTruthy();
  });

  it("Y: stat cards use averageFinalized (excludes the provisional grade)", async () => {
    mount({ student, classroom, assignments: [asg("A1", { dashboardState: "completed", gradingStatus: "final", latestResult: finalLR }), asg("A2", { dashboardState: "awaitingReview", gradingStatus: "pendingReview", latestResult: pendingLR })], stats: { assigned: 2, completed: 2, average: 73, pendingReview: 1, finalized: 1, inProgress: 0, averageFinalized: 84 } });
    const finalStat = (await screen.findByText("المعدل النهائي")).closest("article") as HTMLElement;
    expect(within(finalStat).getByText("84%")).toBeTruthy();            // only the final result, not the 73 legacy average
  });

  it("Z: an active new attempt over a prior final result shows قيد الحل", async () => {
    mount({ student, classroom, assignments: [asg("A1", { dashboardState: "inProgress", gradingStatus: "final", hasActiveAttempt: true, attemptStatus: "started", latestResult: finalLR })], stats: { assigned: 1, completed: 1, average: 84, pendingReview: 0, finalized: 0, inProgress: 1, averageFinalized: 84 } });
    const card = (await screen.findByText("A1")).closest(".student-assignment-card") as HTMLElement;
    expect(within(card).getByText(/قيد الحل/)).toBeTruthy();
    expect(within(card).getByRole("button").textContent).toContain("متابعة المحاولة");
  });

  it("AA: filters تحتاج إجراء / قيد الحل / بانتظار التصحيح / مكتملة show the right assignments (UX-7: aria-pressed chips in one labelled group)", async () => {
    mount({ student, classroom, assignments: [
      asg("AV", { dashboardState: "available", gradingStatus: "notSubmitted", attemptStatus: "notStarted", latestResult: null }),
      asg("IP", { dashboardState: "inProgress", gradingStatus: "notSubmitted", hasActiveAttempt: true, attemptStatus: "started", latestResult: null }),
      asg("AR", { dashboardState: "awaitingReview", gradingStatus: "pendingReview", latestResult: pendingLR }),
      asg("CO", { dashboardState: "completed", gradingStatus: "final", latestResult: finalLR })
    ], stats: { assigned: 4, completed: 2, average: 73, pendingReview: 1, finalized: 1, inProgress: 1, averageFinalized: 84 } });
    await screen.findByText("AV");
    fireEvent.click(screen.getByRole("button", { name: "تحتاج إجراء" }));
    expect(screen.queryByText("AV")).toBeTruthy(); expect(screen.queryByText("IP")).toBeTruthy();
    expect(screen.queryByText("AR")).toBeNull(); expect(screen.queryByText("CO")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "قيد الحل" }));
    expect(screen.queryByText("IP")).toBeTruthy(); expect(screen.queryByText("AV")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "بانتظار التصحيح" }));
    expect(screen.queryByText("AR")).toBeTruthy(); expect(screen.queryByText("CO")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "مكتملة" }));
    expect(screen.queryByText("CO")).toBeTruthy(); expect(screen.queryByText("AR")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "الكل" }));
    expect(screen.queryByText("AV")).toBeTruthy(); expect(screen.queryByText("CO")).toBeTruthy();
  });

  it("AB: teacherFeedback shows only when present", async () => {
    mount({ student, classroom, assignments: [asg("WithFb", { dashboardState: "completed", gradingStatus: "final", latestResult: finalLR }), asg("NoFb", { dashboardState: "completed", gradingStatus: "final", latestResult: { ...finalLR, teacherFeedback: "" } })], stats: { assigned: 2, completed: 2, average: 84, pendingReview: 0, finalized: 2, inProgress: 0, averageFinalized: 84 } });
    const withFb = (await screen.findByText("WithFb")).closest(".student-assignment-card") as HTMLElement;
    const noFb = (await screen.findByText("NoFb")).closest(".student-assignment-card") as HTMLElement;
    expect(within(withFb).getByText(/ملاحظة المعلم: راجع الوحدة 3/)).toBeTruthy();
    expect(within(noFb).queryByText(/ملاحظة المعلم/)).toBeNull();
  });

  it("AC: medals + achievement feed + project panel still render", async () => {
    mount({ student, classroom, assignments: [asg("A1", { dashboardState: "completed", gradingStatus: "final", latestResult: finalLR, latestPercentage: 84 })], stats: { assigned: 1, completed: 1, average: 84, pendingReview: 0, finalized: 1, inProgress: 0, averageFinalized: 84 } });
    expect(await screen.findByText(/إنجازات الصف/)).toBeTruthy();       // achievement feed panel
    await waitFor(() => expect(screen.getByText(/مرحبًا أحمد/)).toBeTruthy());
  });
});
