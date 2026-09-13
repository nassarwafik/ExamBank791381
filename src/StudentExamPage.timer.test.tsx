// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import StudentExamPage from "./StudentExamPage";

// Integration tests for the two B1 cover/start-fetch integration defects, driving the REAL component
// with a mocked fetch. They use the true safe pre-start shape (coverPage present, NO questions/sections).

const ASSIGNMENT_ID = "asg1";
const START = "2026-01-01T10:00:00.000Z";
const END = "2026-01-01T11:00:00.000Z";
const SERVER_NOW = "2026-01-01T10:30:00.000Z"; // 30 min into a 60 min window

// Pre-start submission state: timed, no active attempt, can start.
const preStartState = {
  attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, dueClosed: false, availability: "open", openAt: "", effectiveDueAt: "",
  durationMinutes: 90, timed: true, serverNow: SERVER_NOW, activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false,
  canStartAttempt: true, canWrite: false, draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: []
};
// State returned by startAttempt — SAME timestamps every time (server is idempotent).
const startedState = {
  ...preStartState, activeAttempt: { attemptNumber: 1, startedAt: START, endsAt: END }, effectiveAttemptEndsAt: END,
  serverNow: SERVER_NOW, canStartAttempt: false, canWrite: true
};
// The safe PRE-START assignment payload: coverPage present, but NO question body.
const preStartAssignment = {
  assignmentId: ASSIGNMENT_ID, title: "امتحان مؤقت", instructions: "تعليمات", openAt: "", dueAt: END, effectiveDueAt: "",
  maxAttempts: 1, durationMinutes: 90, requiresStart: true, timed: true,
  marksDistribution: { rows: [{ title: "القسم الأول", marks: 100 }], total: 100 },
  exam: { title: "امتحان مؤقت", metadata: {}, presentationTheme: "classic", coverPage: { enabled: true, showDuration: true, showMarksDistribution: true } }
};
// The FULL exam returned by student-assignment AFTER a successful start.
const fullExam = { title: "امتحان مؤقت", metadata: {}, presentationTheme: "classic", coverPage: { enabled: true, showDuration: true },
  sections: [{ id: "s1", title: "القسم الأول", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "سؤال الاختبار السري", marks: 100 }] }] };

const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);

let startCalls = 0, examCalls = 0, onLogout: ReturnType<typeof vi.fn>, examHandler: () => Promise<Response>;
function installFetch() {
  startCalls = 0; examCalls = 0;
  (globalThis as { fetch?: unknown }).fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init && init.method) || "GET";
    if (url.includes("/api/student-submission/")) {
      if (method === "GET") return json(200, { ok: true, state: preStartState });
      const b = init && init.body ? JSON.parse(String(init.body)) : {};
      if (b.action === "startAttempt") { startCalls++; return json(200, { ok: true, state: startedState }); }
      return json(200, { ok: true, state: startedState });
    }
    if (url.includes("/api/student-assignment/")) { examCalls++; return examHandler(); }
    return json(404, { ok: false, error: "not found" });
  }) as unknown as typeof fetch;
}
function mount() {
  onLogout = vi.fn();
  return render(<StudentExamPage token="t" assignment={preStartAssignment as never} studentName="أحمد" className="الحادي عشر" onBack={() => {}} onLogout={onLogout as unknown as () => void} />);
}

beforeEach(() => { (window as unknown as { scrollTo: () => void }).scrollTo = () => {}; installFetch(); examHandler = () => json(200, { ok: true, assignment: { ...preStartAssignment, requiresStart: false, exam: fullExam } }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("BLOCKER 1 — structured cover renders pre-start even though questions are hidden", () => {
  it("renders StructuredExamCover (not the compact card), shows 90 دقيقة, hides questions, Start calls startAttempt", async () => {
    const r = mount();
    // The real cover appears (cover uses the safe coverPage; it does NOT need sections to exist).
    const startBtn = await r.findByText("ابدأ الامتحان");
    expect(r.container.querySelector(".iex-cover")).toBeTruthy();
    expect(r.container.querySelector(".iex-start-card")).toBeNull(); // NOT the compact fallback card
    expect(r.container.textContent).toContain("المدة");
    expect(r.container.textContent).toContain("90 دقيقة");
    // Question security: no question text is present before start.
    expect(r.container.textContent).not.toContain("سؤال الاختبار السري");
    fireEvent.click(startBtn);
    await waitFor(() => expect(startCalls).toBe(1));
  });
});

describe("BLOCKER 2 — reveal only after the exam body loads; retry reuses the same timer", () => {
  it("start OK + exam fetch 500 => gate stays, error shown, no questions, no countdown; retry reveals questions with the original window", async () => {
    examHandler = () => json(500, { ok: false, error: "تعذر تحميل الأسئلة." });
    const r = mount();
    const startBtn = await r.findByText("ابدأ الامتحان");
    fireEvent.click(startBtn);
    // After the failed exam fetch: gate remains, error visible, NO questions, NO countdown.
    await waitFor(() => expect(examCalls).toBe(1));
    await waitFor(() => expect(r.container.querySelector(".iex-error")?.textContent || "").toContain("تعذر تحميل الأسئلة."));
    expect(r.container.querySelector(".iex-cover")).toBeTruthy();     // gate still shown
    expect(r.container.textContent).not.toContain("سؤال الاختبار السري");
    expect(r.container.querySelector(".iex-countdown")).toBeNull();   // timer not locally revealed
    expect(startCalls).toBe(1);

    // Retry: startAttempt returns the SAME timer, exam now loads => questions revealed.
    examHandler = () => json(200, { ok: true, assignment: { ...preStartAssignment, requiresStart: false, exam: fullExam } });
    fireEvent.click(await r.findByText("ابدأ الامتحان"));
    await r.findByText("سؤال الاختبار السري"); // questions now render
    // Countdown reflects the ORIGINAL 10:00 → 11:00 window (serverNow 10:30 => ~30:00 remaining), NOT a
    // reset to the 90-minute duration (which would read "1:30:00"). Allow a sub-second tick of slack.
    const clock = r.container.querySelector(".iex-countdown-clock");
    expect(clock?.textContent || "").toMatch(/^(30:00|29:5\d|29:4\d)$/);
    expect(clock?.textContent || "").not.toMatch(/\d+:\d\d:\d\d/); // no H:MM:SS => never a 90-minute reset
    expect(startCalls).toBe(2); // idempotent re-start; no third/extra attempt
  });

  it("401 during the exam-body fetch triggers the normal logout", async () => {
    examHandler = () => json(401, { ok: false, error: "انتهت الجلسة." });
    const r = mount();
    fireEvent.click(await r.findByText("ابدأ الامتحان"));
    await waitFor(() => expect(onLogout).toHaveBeenCalled());
    expect(r.container.textContent).not.toContain("سؤال الاختبار السري");
  });
});
