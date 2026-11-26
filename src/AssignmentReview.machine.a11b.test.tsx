// @vitest-environment happy-dom
// AUTO-A11b — the teacher's review screen passes a machineDesign@1 question's STORED verdict (autoGrade.machineFeedback) to the lazy
// MachineDesignReview: the teacher sees the machines and the word it did not halt on — the reason the answer awaits a mark.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import AssignmentReview from "./AssignmentReview";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const tm = (from: string, read: string, write: string, move: string, to: string) => ({ from, read, write, move, to });
const REF = { states: ["q0", "q1"], start: "q0", accept: ["q1"], transitions: [tm("q0", "a", "a", "S", "q1")] };
const LOOPS = { states: ["q0", "q1"], start: "q0", accept: ["q1"], transitions: [tm("q0", "a", "a", "S", "q1"), tm("q0", "b", "b", "S", "q0")] };
const attempt = { attemptNumber: 1, submittedAt: "2026-11-26T10:00:00.000Z", score: 0, totalMarks: 5, percentage: 0, manualReviewMarks: 5, finalized: false, gradingStatus: "pendingReview", startedAt: "", endedAt: "", endReason: "submitted", timedOut: false };
const body = {
  ok: true, assignment: { assignmentId: "a1", title: "واجب", totalMarks: 5 }, student: { studentId: "s1", studentName: "أ", studentCode: "S1" },
  attempt: { ...attempt, teacherFeedback: "" }, attempts: [attempt],
  questions: [{
    questionId: "t1", questionNumber: 1, sectionId: "s1", text: "صمّم آلة تورنغ تقبل الكلمات التي تبدأ بـ a.", marks: 5, type: "machineDesign",
    machineDesign: { v: 1, machine: "TM", alphabet: ["a", "b"], maxStates: 6, leftEnd: true },
    studentAnswer: { kind: "machineDesign", machine: LOOPS }, expectedAnswer: { reference: REF },
    autoGrade: { score: 0, maxMarks: 5, countedMaxMarks: 5, correct: false, manualReview: true, machineFeedback: { nohalt: { word: "b" } } },
  }],
};

describe("A11b — the review screen shows a machine question's stored verdict", () => {
  it("the lazy machine review gets the stored feedback: the word the student's Turing machine did not halt on", async () => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => Promise.resolve(String(input).includes("/api/assignment-review")
      ? ({ status: 200, ok: true, json: async () => body } as Response)
      : ({ status: 404, ok: false, json: async () => ({ ok: false }) } as Response))) as unknown as typeof fetch;
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    const verdict = await screen.findByTestId("machine-review-verdict", {}, { timeout: 5000 });
    expect(verdict.textContent).toMatch(/لم تتوقف على الكلمة b .* ضع العلامة بنفسك/);
    expect(screen.getByTestId("machine-review-student")).toBeTruthy();
    expect(screen.getByTestId("machine-review-reference")).toBeTruthy();
  });
});
