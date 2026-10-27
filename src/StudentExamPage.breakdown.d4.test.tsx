// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import StudentExamPage from "./StudentExamPage";

// D4 (item 7) — the result card shows the per-question breakdown the server sends inside a released result: collapsed, grouped by
// section, the mark or «قيد التصحيح» / «غير محتسب», and the teacher's comment. Nothing is shown when the result is withheld.

const result = (over: Record<string, unknown> = {}) => ({
  attemptNumber: 1, submittedAt: "2026-10-01T10:00:00.000Z", score: 5, totalMarks: 9, percentage: 55.6, manualReviewMarks: 2, finalized: false,
  gradingStatus: "pendingReview", teacherFeedback: "", resultsVisible: true,
  questionBreakdown: {
    sections: [{ id: "s1", title: "القسم الأول", capped: false }, { id: "s2", title: "القسم الثاني", capped: true }],
    questions: [
      { number: 1, sectionId: "s1", status: "full", maxMarks: 3, score: 3 },
      { number: 2, sectionId: "s1", status: "partial", maxMarks: 2, score: 1, comment: "راجع الخطوة الثانية" },
      { number: 3, sectionId: "s2", status: "pending", maxMarks: 2 },
      { number: 4, sectionId: "s2", status: "notCounted", maxMarks: 2, score: 0 }
    ]
  },
  ...over
});
const state = (latestResult: unknown) => ({
  attemptsUsed: 1, allowedAttempts: 1, canAttempt: false, dueClosed: false, availability: "open", openAt: "", effectiveDueAt: "", durationMinutes: 0, timed: false,
  attemptModelVersion: 0, requiresStart: false, serverNow: "2026-10-02T10:00:00.000Z", activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false,
  canStartAttempt: false, canWrite: false, draftAnswers: {}, draftSavedAt: "", latestResult, attempts: [latestResult]
});
const assignment = { assignmentId: "asg1", title: "واجب", instructions: "", openAt: "", dueAt: "", effectiveDueAt: "", maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 4, totalMarks: 9, exam: { title: "امتحان", metadata: {}, questions: [] } };
function mount(latestResult: unknown) {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  (globalThis as { fetch?: unknown }).fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, state: state(latestResult) }) } as Response));
  return render(<StudentExamPage token="t" assignment={assignment as never} studentName="أحمد" className="ص" onBack={() => {}} onLogout={() => {}} />);
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("D4 — per-question breakdown on the result card", () => {
  it("collapsed by default, grouped by section, marks / pending / not counted, and the teacher's comment", async () => {
    const r = mount(result());
    const details = await r.findByTestId("result-breakdown");
    expect(details.hasAttribute("open")).toBe(false);
    expect(details.querySelector("summary")!.textContent).toBe("تفصيل العلامات حسب السؤال · ملاحظة واحدة من المعلم");
    fireEvent.click(details.querySelector("summary")!);
    expect([...details.querySelectorAll("h3")].map(h => h.textContent)).toEqual(["القسم الأول", "القسم الثاني — تُحتسب فيه أفضل الإجابات حتى حدّ القسم"]);
    const rows = [...details.querySelectorAll("li")].map(li => [li.getAttribute("data-status"), li.querySelector(".iex-breakdown-mark")!.textContent, li.querySelector(".iex-breakdown-status")!.textContent]);
    expect(rows).toEqual([["full", "3 / 3", "علامة كاملة"], ["partial", "1 / 2", "علامة جزئية"], ["pending", "— / 2", "قيد التصحيح"], ["notCounted", "—", "غير محتسب"]]);
    expect(details.querySelector(".iex-breakdown-comment")!.textContent).toBe("ملاحظة المعلم: راجع الخطوة الثانية");
  });
  it("a withheld (not yet released) result shows no breakdown even if one were present", async () => {
    const r = mount(result({ resultsVisible: false, resultsVisibility: "manual" }));
    await r.findByTestId("result-headline");
    expect(r.queryByTestId("result-breakdown")).toBeNull();
  });
  it("a result without a breakdown (older server, coding grading open) keeps the card as before", async () => {
    const r = mount(result({ questionBreakdown: undefined }));
    await r.findByTestId("result-headline");
    expect(r.queryByTestId("result-breakdown")).toBeNull();
  });
});
