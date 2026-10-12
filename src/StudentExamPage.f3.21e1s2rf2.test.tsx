// @vitest-environment happy-dom
// PR #300 self-review (NOT an independent approval) — adversarial tests for audit F3 (Review Fix 1): the student exam details
// panel opens by default when the assignment carries non-whitespace instructions, and starts collapsed otherwise.
// Setup copied from src/StudentExamPage.ux7b1.test.tsx (mock fetch for /api/student-submission/, legacy untimed assignment).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import StudentExamPage from "./StudentExamPage";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
const Q1 = { examQuestionId: "q1", presentationType: "multipleChoice", text: "ما هي عاصمة فلسطين؟", marks: 2, options: [{ text: "القدس" }, { text: "رام الله" }] };
const Q2 = { examQuestionId: "q2", presentationType: "open", text: "اشرح مفهوم الشبكة المحلية.", marks: 3 };
const flatExam = { title: "امتحان", metadata: {}, presentationTheme: "default", questions: [Q1, Q2] };
const INSTR = "أجب عن كل الأسئلة بعناية.";
const legacyAssignment = { assignmentId: "asg1", title: "واجب الشبكات", instructions: INSTR, openAt: "", dueAt: "2026-05-01T10:30:00.000Z", effectiveDueAt: "", maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 2, totalMarks: 12, exam: flatExam };
const legacyState = { attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, canWrite: true, dueClosed: false, availability: "open", draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: [], timed: false, attemptModelVersion: 0, requiresStart: false, serverNow: "2026-03-01T10:00:00.000Z", activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: false, durationMinutes: 0 };
const submittedResult = { attemptNumber: 1, submittedAt: "2026-03-01T10:05:00.000Z", score: 10, totalMarks: 12, percentage: 83.3, manualReviewMarks: 0, finalized: true, gradingStatus: "final", teacherFeedback: "" };

let stateBody: unknown = legacyState;
function installFetch() {
  globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init && init.method) || "GET";
    const body = init && init.body ? JSON.parse(String(init.body)) : null;
    if (url.includes("/api/student-submission/")) {
      if (method === "GET") return json(200, { ok: true, state: stateBody });
      if (body.action === "saveDraft") return json(200, { ok: true, savedAt: "2026-03-01T10:01:02.000Z" });
      return json(200, { ok: true, state: stateBody });
    }
    return json(404, { ok: false, error: "not found" });
  }) as unknown as typeof fetch;
}
function stubMatchMedia(matches: boolean) {
  window.matchMedia = ((q: string) => ({ matches, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}
beforeEach(() => {
  (window as unknown as { scrollTo: (o: unknown) => void }).scrollTo = () => {};
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  stubMatchMedia(false);
  stateBody = legacyState;
  installFetch();
});
const page = (assignment: unknown) => <StudentExamPage token="t" assignment={assignment as never} studentName="أحمد" className="الحادي عشر" onBack={vi.fn()} onLogout={vi.fn()} />;
const toggle = () => screen.getByRole("button", { name: /تفاصيل الامتحان والتعليمات/ });
const panel = () => document.getElementById(toggle().getAttribute("aria-controls") || "") as HTMLElement;
const isOpen = () => toggle().getAttribute("aria-expanded") === "true" && !panel().hidden;
const isClosed = () => toggle().getAttribute("aria-expanded") === "false" && panel().hidden;

describe("self-review — F3: the details panel's default", () => {
  it("instructions present at first render → open; the instructions are inside the visible panel", async () => {
    render(page(legacyAssignment));
    await screen.findByText("ما هي عاصمة فلسطين؟");
    expect(isOpen()).toBe(true);
    expect(panel().querySelector(".iex-details-instructions")?.textContent).toBe(INSTR);
  });

  it("empty and whitespace-only instructions (spaces, newlines, tabs, NBSP) → collapsed", async () => {
    for (const instructions of ["", "   ", "\n\t \n", "  "]) {
      const r = render(page({ ...legacyAssignment, instructions }));
      await screen.findByText("ما هي عاصمة فلسطين؟");
      expect({ instructions, closed: isClosed() }).toEqual({ instructions, closed: true });
      r.unmount();
    }
  });

  it("instructions of non-string types: null / undefined / 0 → collapsed and no crash", async () => {
    for (const instructions of [null, undefined, 0]) {
      const r = render(page({ ...legacyAssignment, instructions }));
      await screen.findByText("ما هي عاصمة فلسطين؟");
      expect({ instructions, closed: isClosed() }).toEqual({ instructions, closed: true });
      r.unmount();
    }
  });

  // Not tested here: an OBJECT `instructions` value. It makes the page fail to render, but on main b8a65f1 as well (the long-standing
  // `{assignment.instructions&&<p>{assignment.instructions}</p>}` renders the object as a React child), so it is not caused by F3;
  // the API sends the stored string (api/src/functions/student-assignment.js).

  it("general instructions + assignment instructions → open, both visible; general only → open; neither → collapsed", async () => {
    const withGeneral = (instructions: string) => ({ ...legacyAssignment, instructions, exam: { ...flatExam, metadata: { generalInstructions: "تعليمات عامة للامتحان." } } });
    let r = render(page(withGeneral(INSTR)));
    await screen.findByText("ما هي عاصمة فلسطين؟");
    expect(isOpen()).toBe(true);
    expect(panel().textContent).toContain(INSTR);
    expect(panel().textContent).toContain("تعليمات عامة للامتحان.");
    r.unmount();
    r = render(page(withGeneral("  ")));
    await screen.findByText("ما هي عاصمة فلسطين؟");
    expect(isOpen()).toBe(true);
    r.unmount();
    render(page({ ...legacyAssignment, instructions: "", exam: { ...flatExam, metadata: { generalInstructions: "   " } } }));
    await screen.findByText("ما هي عاصمة فلسطين؟");
    expect(isClosed()).toBe(true);
  });

  it("the student's choice wins: after closing the open panel, re-renders (a new assignment object, answering) never reopen it", async () => {
    const r = render(page(legacyAssignment));
    await screen.findByText("ما هي عاصمة فلسطين؟");
    expect(isOpen()).toBe(true);
    fireEvent.click(toggle());
    expect(isClosed()).toBe(true);
    r.rerender(page({ ...legacyAssignment, instructions: INSTR + " " }));
    fireEvent.click(screen.getByLabelText("القدس"));
    expect(isClosed()).toBe(true);
  });

  it("OBSERVED (initial-only default): instructions that arrive after first render on a new assignment object do not open the panel; the text is still inside it", async () => {
    const r = render(page({ ...legacyAssignment, instructions: "" }));
    await screen.findByText("ما هي عاصمة فلسطين؟");
    expect(isClosed()).toBe(true);
    r.rerender(page({ ...legacyAssignment, instructions: INSTR }));
    expect(isClosed()).toBe(true);                                         // default applies at mount only (useState initial value)
    expect(panel().querySelector(".iex-details-instructions")?.textContent).toBe(INSTR);
  });

  it("retake: the result screen → «بدء محاولة جديدة» → the next attempt opens the details panel by default again", async () => {
    stateBody = { ...legacyState, attemptsUsed: 1, allowedAttempts: 2, canAttempt: true, latestResult: submittedResult, attempts: [submittedResult] };
    render(page({ ...legacyAssignment, maxAttempts: 2 }));
    fireEvent.click(await screen.findByText(/بدء محاولة جديدة/));
    await screen.findByText("ما هي عاصمة فلسطين؟");
    expect(isOpen()).toBe(true);
    expect(toggle().closest(".iex-wrap")!.textContent).toContain("المحاولة 2 / 2");
  });

  it("retake with whitespace-only instructions starts collapsed", async () => {
    stateBody = { ...legacyState, attemptsUsed: 1, allowedAttempts: 2, canAttempt: true, latestResult: submittedResult, attempts: [submittedResult] };
    render(page({ ...legacyAssignment, maxAttempts: 2, instructions: " \n " }));
    fireEvent.click(await screen.findByText(/بدء محاولة جديدة/));
    await screen.findByText("ما هي عاصمة فلسطين؟");
    expect(isClosed()).toBe(true);
  });
});
