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
// Same, but with NO structured cover (compact start/resume card path).
const preStartAssignmentNoCover = { ...preStartAssignment, exam: { ...preStartAssignment.exam, coverPage: { enabled: false } } };

// A prior completed attempt (result screen) with another attempt still available (maxAttempts 2).
const priorResult = { attemptNumber: 1, submittedAt: "2026-01-01T09:00:00.000Z", score: 80, totalMarks: 100, percentage: 80, manualReviewMarks: 0, finalized: true, timedOut: false };
const completedState = { ...preStartState, attemptsUsed: 1, allowedAttempts: 2, canStartAttempt: true, activeAttempt: null, latestResult: priorResult, attempts: [priorResult] };
// An expired active attempt (server-confirmed) — recovery must finalize this, not restart.
const expiredActiveState = { ...startedState, attemptExpired: true, canWrite: false, canStartAttempt: false, serverNow: "2026-01-01T11:05:00.000Z", effectiveAttemptEndsAt: END };
const timedOutResult = { attemptNumber: 1, submittedAt: "2026-01-01T11:05:00.000Z", score: 0, totalMarks: 100, percentage: 0, manualReviewMarks: 0, finalized: true, timedOut: true };
const finalizedState = { ...startedState, activeAttempt: null, attemptExpired: false, canWrite: false, canStartAttempt: false, latestResult: timedOutResult, attempts: [timedOutResult] };
// A fresh SECOND attempt window (12:00 -> 13:00).
const startedState2 = { ...startedState, activeAttempt: { attemptNumber: 2, startedAt: "2026-01-01T12:00:00.000Z", endsAt: "2026-01-01T13:00:00.000Z" }, effectiveAttemptEndsAt: "2026-01-01T13:00:00.000Z", serverNow: "2026-01-01T12:00:00.000Z", attemptsUsed: 1, allowedAttempts: 2 };

const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);

let startCalls = 0, examCalls = 0, finalizeCalls = 0, subGetCalls = 0, onLogout: ReturnType<typeof vi.fn>;
let examHandler: (n: number) => Promise<Response>, startHandler: (n: number) => Promise<Response>, finalizeHandler: (n: number) => Promise<Response>, subGetHandler: (n: number) => Promise<Response>;
function installFetch() {
  startCalls = 0; examCalls = 0; finalizeCalls = 0; subGetCalls = 0;
  (globalThis as { fetch?: unknown }).fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init && init.method) || "GET";
    if (url.includes("/api/student-submission/")) {
      if (method === "GET") { subGetCalls++; return subGetHandler(subGetCalls); }
      const b = init && init.body ? JSON.parse(String(init.body)) : {};
      if (b.action === "startAttempt") { startCalls++; return startHandler(startCalls); }
      if (b.action === "finalizeTimedOutAttempt") { finalizeCalls++; return finalizeHandler(finalizeCalls); }
      return json(200, { ok: true, state: startedState });
    }
    if (url.includes("/api/student-assignment/")) { examCalls++; return examHandler(examCalls); }
    return json(404, { ok: false, error: "not found" });
  }) as unknown as typeof fetch;
}
function mount(assignment: unknown = preStartAssignment) {
  onLogout = vi.fn();
  return render(<StudentExamPage token="t" assignment={assignment as never} studentName="أحمد" className="الحادي عشر" onBack={() => {}} onLogout={onLogout as unknown as () => void} />);
}

beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  installFetch();
  subGetHandler = () => json(200, { ok: true, state: preStartState });
  startHandler = () => json(200, { ok: true, state: startedState });
  finalizeHandler = () => json(200, { ok: true, result: timedOutResult, state: finalizedState });
  examHandler = () => json(200, { ok: true, assignment: { ...preStartAssignment, requiresStart: false, exam: fullExam } });
});
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

describe("EDGE 1 — start OK, body fetch fails, timer expires before retry => auto-finalize", () => {
  it("retry after expiry finalizes via server state (no reveal, no restart, exactly one finalize)", async () => {
    examHandler = () => json(500, { ok: false, error: "تعذر تحميل الأسئلة." });
    startHandler = n => (n === 1 ? json(200, { ok: true, state: startedState }) : json(409, { ok: false, error: "انتهى وقت المحاولة." }));
    // GET student-submission: mount => pre-start; after the 409 recovery => server-confirmed expired active attempt.
    subGetHandler = n => (n === 1 ? json(200, { ok: true, state: preStartState }) : json(200, { ok: true, state: expiredActiveState }));
    const r = mount();
    fireEvent.click(await r.findByText("ابدأ الامتحان"));
    await waitFor(() => expect(examCalls).toBe(1)); // first body fetch failed; gate remains
    expect(r.container.querySelector(".iex-cover")).toBeTruthy();

    // Retry after expiry: startAttempt 409 -> confirm via server state -> finalize the expired attempt.
    fireEvent.click(await r.findByText("ابدأ الامتحان"));
    await waitFor(() => expect(finalizeCalls).toBe(1));
    const h = await r.findByText(/تم تسليم المحاولة/);
    expect(h.textContent).toContain("انتهى الوقت"); // result.timedOut === true
    expect(r.container.textContent).not.toContain("سؤال الاختبار السري"); // never revealed
    expect(startCalls).toBe(2);      // idempotent re-start attempt; no third
    expect(finalizeCalls).toBe(1);   // finalized exactly once
  });

  it("a non-expired 409 (e.g. attempts exhausted / not expired) does NOT finalize", async () => {
    examHandler = () => json(200, { ok: true, assignment: { ...preStartAssignment, requiresStart: false, exam: fullExam } });
    startHandler = () => json(409, { ok: false, error: "لا توجد محاولة إضافية متاحة." });
    subGetHandler = () => json(200, { ok: true, state: preStartState }); // no active attempt => not expired
    const r = mount();
    fireEvent.click(await r.findByText("ابدأ الامتحان"));
    await waitFor(() => expect(startCalls).toBe(1));
    await waitFor(() => expect(r.container.querySelector(".iex-error")?.textContent || "").toContain("لا توجد محاولة"));
    expect(finalizeCalls).toBe(0);   // did NOT blindly finalize a 409
    expect(r.container.querySelector(".iex-cover")).toBeTruthy();
  });
});

describe("EDGE 2 — next-attempt start preserves the previous result on failure", () => {
  it("failed next-attempt start keeps the previous result visible with an error, reveals nothing", async () => {
    subGetHandler = () => json(200, { ok: true, state: completedState });
    startHandler = () => json(409, { ok: false, error: "انتهى موعد التسليم." });
    const r = mount();
    await r.findByText(/تم تسليم المحاولة/);           // result screen (attempt 1)
    expect(r.container.textContent).toContain("80");   // previous score visible
    fireEvent.click(await r.findByText(/بدء محاولة جديدة/));
    await waitFor(() => expect(startCalls).toBe(1));
    await waitFor(() => expect(r.container.querySelector(".iex-error")?.textContent || "").toContain("انتهى موعد التسليم."));
    expect(r.container.querySelector(".iex-result-card")).toBeTruthy(); // result preserved
    expect(r.container.textContent).toContain("80");
    expect(r.container.textContent).not.toContain("سؤال الاختبار السري");
    expect(examCalls).toBe(0);
  });

  it("successful next-attempt start clears the previous result and reveals the new attempt + timer", async () => {
    subGetHandler = () => json(200, { ok: true, state: completedState });
    startHandler = () => json(200, { ok: true, state: startedState2 });
    examHandler = () => json(200, { ok: true, assignment: { ...preStartAssignment, requiresStart: false, exam: fullExam } });
    const r = mount();
    await r.findByText(/تم تسليم المحاولة/);
    fireEvent.click(await r.findByText(/بدء محاولة جديدة/));
    await r.findByText("سؤال الاختبار السري");         // new attempt's questions revealed
    expect(r.container.querySelector(".iex-result-card")).toBeNull(); // previous result cleared
    expect(r.container.querySelector(".iex-countdown")).toBeTruthy(); // new active timer shown
  });
});

describe("EDGE 3 — visibility resync must never reveal a body-less timed exam", () => {
  function fireVisible() {
    try { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); } catch { /* default is already visible */ }
    document.dispatchEvent(new Event("visibilitychange"));
  }

  it("cover path: resync flips activeAttempt true but body isn't loaded => gate stays, no questions; resume reveals on the ORIGINAL timer", async () => {
    examHandler = n => (n === 1 ? json(500, { ok: false, error: "تعذر تحميل الأسئلة." }) : json(200, { ok: true, assignment: { ...preStartAssignment, requiresStart: false, exam: fullExam } }));
    startHandler = () => json(200, { ok: true, state: startedState }); // idempotent 10:00 -> 11:00
    subGetHandler = n => (n === 1 ? json(200, { ok: true, state: preStartState }) : json(200, { ok: true, state: startedState }));
    const r = mount();
    fireEvent.click(await r.findByText("ابدأ الامتحان"));
    await waitFor(() => expect(examCalls).toBe(1)); // body fetch failed; gate remains
    expect(r.container.querySelector(".iex-cover")).toBeTruthy();

    // Tab hidden -> visible: resync returns a LIVE activeAttempt, but the body still isn't loaded.
    fireVisible();
    await waitFor(() => expect(subGetCalls).toBeGreaterThanOrEqual(2));
    // INVARIANT: gate still shown, no exam UI, no secret question text, no blank exam.
    expect(r.container.querySelector(".iex-cover")).toBeTruthy();
    expect(r.container.querySelector(".iex-countdown")).toBeNull();
    expect(r.container.textContent).not.toContain("سؤال الاختبار السري");

    // Resume via the cover button: idempotent start + successful body fetch => questions on original window.
    fireEvent.click(await r.findByText("ابدأ الامتحان"));
    await r.findByText("سؤال الاختبار السري");
    const clock = r.container.querySelector(".iex-countdown-clock");
    expect(clock?.textContent || "").toMatch(/^(30:00|29:5\d|29:4\d)$/);       // original 10:00->11:00 window
    expect(clock?.textContent || "").not.toMatch(/\d+:\d\d:\d\d/);             // never a 90-min reset
    expect(startCalls).toBe(2); // idempotent; no extra attempt
  });

  it("no-cover path: after resync the compact button becomes an ENABLED resume (not disabled by canStartAttempt=false)", async () => {
    examHandler = n => (n === 1 ? json(500, { ok: false, error: "تعذر تحميل الأسئلة." }) : json(200, { ok: true, assignment: { ...preStartAssignmentNoCover, requiresStart: false, exam: fullExam } }));
    startHandler = () => json(200, { ok: true, state: startedState });
    subGetHandler = n => (n === 1 ? json(200, { ok: true, state: preStartState }) : json(200, { ok: true, state: startedState }));
    const r = mount(preStartAssignmentNoCover);
    fireEvent.click(await r.findByText("بدء المحاولة")); // compact card
    await waitFor(() => expect(examCalls).toBe(1));
    expect(r.container.querySelector(".iex-start-card")).toBeTruthy();

    fireVisible();
    await waitFor(() => expect(subGetCalls).toBeGreaterThanOrEqual(2));
    // canStartAttempt is now false (attempt exists) but the button must stay usable as "متابعة المحاولة".
    const resumeBtn = await r.findByText("متابعة المحاولة") as HTMLButtonElement;
    expect(resumeBtn.disabled).toBe(false);
    expect(r.container.textContent).not.toContain("سؤال الاختبار السري"); // still no body

    fireEvent.click(resumeBtn);
    await r.findByText("سؤال الاختبار السري"); // body loads on the original attempt
    expect(startCalls).toBe(2);
  });
});
