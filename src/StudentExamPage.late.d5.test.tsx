// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import StudentExamPage from "./StudentExamPage";

// D5 (item 10) — the student's exam page tells them about the teacher's late policy: the late window on the start card (from the
// server state), and on a late attempt's result the lateness and the deduction (its marks only once the result is released).

const baseState = (over: Record<string, unknown> = {}) => ({
  attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, dueClosed: false, availability: "open", openAt: "", effectiveDueAt: "2026-11-01T10:00:00.000Z", durationMinutes: 0, timed: false,
  attemptModelVersion: 2, requiresStart: true, serverNow: "2026-11-01T12:00:00.000Z", activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false,
  canStartAttempt: true, canWrite: false, draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: [], ...over
});
const lateResult = (over: Record<string, unknown> = {}) => ({
  attemptNumber: 1, submittedAt: "2026-11-01T12:00:00.000Z", score: 7.2, totalMarks: 10, percentage: 72, manualReviewMarks: 0, finalized: true, gradingStatus: "final",
  teacherFeedback: "", resultsVisible: true, late: { minutesLate: 120, deductionPercent: 10, waived: false }, rawScore: 8, latePenalty: 0.8, ...over
});
const assignment = { assignmentId: "asg1", title: "واجب", instructions: "", openAt: "", dueAt: "2026-11-01T10:00:00.000Z", effectiveDueAt: "2026-11-01T10:00:00.000Z", maxAttempts: 1, durationMinutes: 0, requiresStart: true, timed: false, questionCount: 1, totalMarks: 10, exam: { title: "امتحان", metadata: {}, questions: [] } };
function mount(state: unknown) {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  (globalThis as { fetch?: unknown }).fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, state }) } as Response));
  return render(<StudentExamPage token="t" assignment={assignment as never} studentName="أحمد" className="ص" onBack={() => {}} onLogout={() => {}} />);
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("D5 — the late policy on the student's exam page", () => {
  it("inside the late window the start card says so, with the deduction", async () => {
    const r = mount(baseState({ lateWindow: { active: true, until: "2026-11-02T10:00:00.000Z", deductionPercent: 10 } }));
    const notice = await r.findByTestId("late-window");
    expect(notice.textContent).toMatch(/^انتهى الموعد الأصلي\. يُقبل التسليم المتأخر حتى .+، مع خصم 10٪ من علامة المحاولة\.$/);
  });
  it("without a policy there is no late notice", async () => {
    const r = mount(baseState());
    await r.findByRole("heading", { name: "واجب" });
    expect(r.queryByTestId("late-window")).toBeNull();
  });
  it("a late released result shows the lateness, the deduction and the mark before it", async () => {
    const res = lateResult();
    const r = mount(baseState({ attemptsUsed: 1, canAttempt: false, canStartAttempt: false, latestResult: res, attempts: [res] }));
    expect((await r.findByTestId("late-result")).textContent).toBe("سُلّمت المحاولة متأخرة 2 ساعة، فخُصم 10٪ (0.8 علامة). العلامة قبل الخصم: 8.");
  });
  it("a late result not yet released shows only the percentage — never the marks", async () => {
    const res = lateResult({ resultsVisible: false, resultsVisibility: "manual", score: undefined, percentage: undefined, rawScore: undefined, latePenalty: undefined });
    const r = mount(baseState({ attemptsUsed: 1, canAttempt: false, canStartAttempt: false, latestResult: res, attempts: [res] }));
    expect((await r.findByTestId("late-result")).textContent).toBe("سُلّمت المحاولة متأخرة 2 ساعة، ويُخصم 10٪ من علامتها.");
  });
});
