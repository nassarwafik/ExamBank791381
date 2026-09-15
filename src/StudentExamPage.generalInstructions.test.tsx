// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import StudentExamPage from "./StudentExamPage";
import ExamPreview from "./ExamPreview";

// Roadmap #17/#15 — the real student runtime now renders exam.metadata.generalInstructions through the SAME
// shared ExamGeneralInstructions component the teacher preview uses, so preview and student match. This is
// presentation-only: no save/start/timer/attempt behavior changes.
const GENERAL = "تعليمات عامة موحّدة\nالسطر الثاني";
const bodyState = {
  attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, dueClosed: false, availability: "open", openAt: "", effectiveDueAt: "",
  durationMinutes: 0, timed: false, attemptModelVersion: 2, requiresStart: false, serverNow: "2026-01-01T10:30:00.000Z",
  activeAttempt: { attemptNumber: 1, startedAt: "2026-01-01T10:00:00.000Z", endsAt: "", status: "started" },
  effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: false, canWrite: true, draftAnswers: {}, draftSavedAt: "",
  latestResult: null, attempts: []
};
const exam = { title: "امتحان", metadata: { generalInstructions: GENERAL }, presentationTheme: "classic",
  sections: [{ id: "s1", title: "القسم الأول", instructions: "تعليمات القسم", gradingPolicy: "all",
    questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "نص السؤال", marks: 100 }] }] };
const assignment = { assignmentId: "asg1", title: "واجب", instructions: "تعليمات الواجب", openAt: "", dueAt: "", effectiveDueAt: "",
  maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 1, totalMarks: 100, exam };

function mountStudent() {
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init && init.method) || "GET";
    if (url.includes("/api/student-submission/") && method === "GET")
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, state: bodyState }) } as Response);
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, state: bodyState }) } as Response);
  }) as unknown as typeof fetch;
  return render(<StudentExamPage token="t" assignment={assignment as never} studentName="أ" className="ص" onBack={() => {}} onLogout={() => {}} />);
}
beforeEach(() => { (window as unknown as { scrollTo: () => void }).scrollTo = () => {}; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("R17 general instructions — faithful in the student runtime", () => {
  it("A/B/F: StudentExamPage shows the general instructions in the body, keeps section + question + submit", async () => {
    mountStudent();
    await screen.findByText("نص السؤال");                       // body rendered (not start gate / result)
    expect(screen.getByText("التعليمات العامة")).toBeTruthy();
    expect(screen.getByText("تعليمات عامة موحّدة")).toBeTruthy();
    expect(screen.getByText("تعليمات القسم")).toBeTruthy();      // section instruction still separate
    // Lifecycle intact (F): the submit footer still renders.
    await waitFor(() => expect(screen.getByText(/تسليم وتصحيح/)).toBeTruthy());
  });

  it("A(parity): the teacher preview renders the SAME general-instruction content from the same field", () => {
    const { container } = render(<ExamPreview exam={exam} onClose={() => {}} />);
    expect(container.textContent).toContain("التعليمات العامة");
    expect(container.textContent).toContain("تعليمات عامة موحّدة");
  });
});
