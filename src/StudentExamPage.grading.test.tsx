// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import StudentExamPage from "./StudentExamPage";

// Roadmap #14 — the student result screen labels the grade provisional vs final from the server
// gradingStatus, and timedOut stays independent of grading status.
const fullExam = { title: "امتحان", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "ق", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "سؤال", marks: 100 }] }] };
const assignment = { assignmentId: "a1", title: "واجب", instructions: "ت", openAt: "", dueAt: "", effectiveDueAt: "", maxAttempts: 2, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 1, totalMarks: 100, exam: fullExam };
const base = { attemptsUsed: 1, allowedAttempts: 2, canAttempt: true, dueClosed: false, availability: "open", durationMinutes: 0, timed: false, attemptModelVersion: 2, requiresStart: false, serverNow: "2026-03-01T12:00:00.000Z", activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: true, canWrite: false, draftAnswers: {}, draftSavedAt: "" };
const result = (over: Record<string, unknown>) => ({ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 62, totalMarks: 100, percentage: 62, manualReviewMarks: 0, finalized: true, timedOut: false, gradingStatus: "final", ...over });
function mountState(latestResult: Record<string, unknown>) {
  const state = { ...base, latestResult, attempts: [latestResult] };
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/student-submission/")) return Promise.resolve({ status: 200, ok: true, headers: { get: () => null }, json: async () => ({ ok: true, state }) } as unknown as Response);
    return Promise.resolve({ status: 200, ok: true, headers: { get: () => null }, json: async () => ({ ok: true }) } as unknown as Response);
  }) as unknown as typeof fetch;
  return render(<StudentExamPage token="t" assignment={assignment as never} studentName="أ" className="ص" onBack={() => {}} onLogout={() => {}} />);
}
beforeEach(() => { (window as unknown as { scrollTo: () => void }).scrollTo = () => {}; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("R14 StudentExamPage result grading status", () => {
  it("AR: a pending result is explicitly provisional (not final)", async () => {
    mountState(result({ manualReviewMarks: 18, finalized: false, gradingStatus: "pendingReview" }));
    await screen.findByText(/بانتظار مراجعة المعلم/);
    expect(screen.getAllByText(/علامة مؤقتة/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/العلامة النهائية معتمدة/)).toBeNull();
  });
  it("AS: a final result is explicitly final", async () => {
    mountState(result({ manualReviewMarks: 0, finalized: true, gradingStatus: "final" }));
    expect(await screen.findByText(/العلامة النهائية معتمدة/)).toBeTruthy();
    expect(screen.queryByText(/بانتظار مراجعة المعلم/)).toBeNull();
  });
  it("AT: timedOut + pending stays pending (not falsely final), and still shows the timeout note", async () => {
    mountState(result({ manualReviewMarks: 6, finalized: false, gradingStatus: "pendingReview", timedOut: true }));
    expect(await screen.findByText(/انتهى الوقت/)).toBeTruthy();          // timeout end-reason note
    expect(screen.getAllByText(/علامة مؤقتة/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/العلامة النهائية معتمدة/)).toBeNull();
  });
});
