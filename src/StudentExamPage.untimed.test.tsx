// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor, screen } from "@testing-library/react";
import StudentExamPage from "./StudentExamPage";

// B2A integration tests for the UNTIMED attemptModelVersion>=2 start lifecycle, driving the REAL
// component with a mocked fetch. They prove: opening shows the start gate (no question body), Start calls
// the server startAttempt then reveals questions with NO countdown, and multi-tab / stale-write 409
// reconcile against authoritative server state (not Arabic message text).

const ASSIGNMENT_ID = "asg1";
const START = "2026-01-01T10:00:00.000Z";
const SERVER_NOW = "2026-01-01T10:30:00.000Z";

// Untimed v2 pre-start: requiresStart, no active attempt, no deadline, can start.
const preStartStateU = {
  attemptsUsed: 0, allowedAttempts: 1, canAttempt: false, dueClosed: false, availability: "open", openAt: "", effectiveDueAt: "",
  durationMinutes: 0, timed: false, attemptModelVersion: 2, requiresStart: true, attemptStatus: "notStarted",
  serverNow: SERVER_NOW, activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false,
  canStartAttempt: true, canWrite: false, draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: []
};
// After startAttempt: active attempt, endsAt "", writable, no countdown.
const startedStateU = {
  ...preStartStateU, activeAttempt: { attemptNumber: 1, startedAt: START, endsAt: "", status: "started", lastSavedAt: "" },
  canStartAttempt: false, canWrite: true, attemptStatus: "started"
};
const resultU = { attemptNumber: 1, submittedAt: "2026-01-01T10:20:00.000Z", score: 80, totalMarks: 100, percentage: 80, manualReviewMarks: 0, finalized: true, timedOut: false, endReason: "submitted", startedAt: START, endedAt: "2026-01-01T10:20:00.000Z" };
// After submit / another tab submitted: no active attempt, latest result present.
const submittedStateU = { ...preStartStateU, attemptsUsed: 1, canStartAttempt: false, canWrite: false, activeAttempt: null, latestResult: resultU, attempts: [resultU], attemptStatus: "submitted" };

// Safe PRE-START assignment payload (untimed v2): cover present, NO question body.
const preStartAssignmentU = {
  assignmentId: ASSIGNMENT_ID, title: "واجب غير مؤقت", instructions: "تعليمات", openAt: "", dueAt: "", effectiveDueAt: "",
  maxAttempts: 1, durationMinutes: 0, requiresStart: true, timed: false,
  marksDistribution: { rows: [{ title: "القسم الأول", marks: 100 }], total: 100 },
  exam: { title: "واجب غير مؤقت", metadata: {}, presentationTheme: "classic", coverPage: { enabled: true, activityType: "exam", showMarksDistribution: true } }
};
const preStartAssignmentUNoCover = { ...preStartAssignmentU, exam: { ...preStartAssignmentU.exam, coverPage: { enabled: false } } };
const fullExam = { title: "واجب غير مؤقت", metadata: {}, presentationTheme: "classic", coverPage: { enabled: true, activityType: "exam" },
  sections: [{ id: "s1", title: "القسم الأول", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "سؤال الاختبار السري", marks: 100 }] }] };
// Full-body assignment (mid-attempt refresh path — Portal passes the full exam when active).
const fullAssignmentU = { ...preStartAssignmentU, requiresStart: false, exam: fullExam };

const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);

let startCalls = 0, examCalls = 0, finalizeCalls = 0, subGetCalls = 0, submitCalls = 0, saveCalls = 0, onLogout: ReturnType<typeof vi.fn>;
let examHandler: (n: number) => Promise<Response>, startHandler: (n: number) => Promise<Response>, subGetHandler: (n: number) => Promise<Response>, submitHandler: (n: number) => Promise<Response>, saveHandler: (n: number) => Promise<Response>;
function installFetch() {
  startCalls = 0; examCalls = 0; finalizeCalls = 0; subGetCalls = 0; submitCalls = 0; saveCalls = 0;
  (globalThis as { fetch?: unknown }).fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init && init.method) || "GET";
    if (url.includes("/api/student-submission/")) {
      if (method === "GET") { subGetCalls++; return subGetHandler(subGetCalls); }
      const b = init && init.body ? JSON.parse(String(init.body)) : {};
      if (b.action === "startAttempt") { startCalls++; return startHandler(startCalls); }
      if (b.action === "finalizeTimedOutAttempt") { finalizeCalls++; return json(200, { ok: true }); }
      if (b.action === "submit") { submitCalls++; return submitHandler(submitCalls); }
      if (b.action === "saveDraft") { saveCalls++; return saveHandler(saveCalls); }
      return json(200, { ok: true, state: startedStateU });
    }
    if (url.includes("/api/student-assignment/")) { examCalls++; return examHandler(examCalls); }
    return json(404, { ok: false, error: "not found" });
  }) as unknown as typeof fetch;
}
function mount(assignment: unknown = preStartAssignmentU) {
  onLogout = vi.fn();
  return render(<StudentExamPage token="t" assignment={assignment as never} studentName="أحمد" className="الحادي عشر" onBack={() => {}} onLogout={onLogout as unknown as () => void} />);
}

beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  (window as unknown as { confirm: () => boolean }).confirm = () => true;
  installFetch();
  subGetHandler = () => json(200, { ok: true, state: preStartStateU });
  startHandler = () => json(200, { ok: true, state: startedStateU });
  submitHandler = () => json(200, { ok: true, result: resultU, state: submittedStateU });
  saveHandler = () => json(200, { ok: true, savedAt: "2026-01-01T10:05:00.000Z", serverNow: "2026-01-01T10:05:00.000Z", effectiveAttemptEndsAt: "" });
  examHandler = () => json(200, { ok: true, assignment: { ...preStartAssignmentU, requiresStart: false, exam: fullExam } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// UX-7b-2: the final submit lives on the review screen (last question → "مراجعة الإجابات" → "تسليم الامتحان"); the shared ConfirmDialog stays the gate.
async function pressSubmit() { fireEvent.click(await screen.findByRole("button", { name: "مراجعة الإجابات" })); fireEvent.click(await screen.findByRole("button", { name: "تسليم الامتحان" })); }
describe("B2A untimed v2 — start gate with a cover", () => {
  it("shows the cover pre-start with NO question body and NO countdown; Start calls startAttempt then reveals questions", async () => {
    const r = mount();
    const startBtn = await r.findByText("ابدأ الامتحان");        // structured cover, not the compact card
    expect(r.container.querySelector(".iex-cover")).toBeTruthy();
    expect(r.container.querySelector(".iex-start-card")).toBeNull();
    expect(r.container.textContent).not.toContain("سؤال الاختبار السري"); // question hidden pre-start
    expect(r.container.querySelector(".iex-countdown")).toBeNull();       // untimed => never a countdown
    fireEvent.click(startBtn);
    await waitFor(() => expect(startCalls).toBe(1));
    await r.findByText("سؤال الاختبار السري");                   // questions revealed after start
    expect(r.container.querySelector(".iex-countdown")).toBeNull();       // still no countdown
    expect(examCalls).toBe(1);
  });
});

describe("B2A untimed v2 — compact start card (no cover)", () => {
  it("shows 'بدء المحاولة', no duration line, no countdown; Start reveals questions", async () => {
    examHandler = () => json(200, { ok: true, assignment: { ...preStartAssignmentUNoCover, requiresStart: false, exam: fullExam } });
    const r = mount(preStartAssignmentUNoCover);
    const startBtn = await r.findByText("بدء المحاولة");
    expect(r.container.querySelector(".iex-start-card")).toBeTruthy();
    expect(r.container.textContent).not.toContain("مدة المحاولة"); // untimed hides the duration meta
    expect(r.container.textContent).not.toContain("سؤال الاختبار السري");
    fireEvent.click(startBtn);
    await waitFor(() => expect(startCalls).toBe(1));
    await r.findByText("سؤال الاختبار السري");
    expect(r.container.querySelector(".iex-countdown")).toBeNull();
  });
});

describe("B2A untimed v2 — write lifecycle", () => {
  it("submit from a live attempt shows the result (no timed-out note)", async () => {
    subGetHandler = () => json(200, { ok: true, state: startedStateU });
    const r = mount(fullAssignmentU);
    await r.findByText("سؤال الاختبار السري");                   // active attempt => exam shown
    expect(r.container.querySelector(".iex-countdown")).toBeNull();
    await pressSubmit();
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الآن" }));                 // UX-7b-1: shared ConfirmDialog replaces window.confirm
    const h = await r.findByText(/تم تسليم المحاولة/);
    expect(h.textContent).not.toContain("انتهى الوقت");          // not a timeout
    expect(r.container.textContent).toContain("80");
    expect(submitCalls).toBe(1);
  });

  it("opening (GET) never starts an attempt: pre-start state keeps the gate, no startAttempt fired", async () => {
    const r = mount();
    await r.findByText("ابدأ الامتحان");
    await waitFor(() => expect(subGetCalls).toBe(1));
    expect(startCalls).toBe(0);                                  // opening != starting
  });
});

describe("B2A untimed v2 — multi-tab reconciliation (#16 / #17)", () => {
  function fireVisible() {
    try { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); } catch { /* already visible */ }
    document.dispatchEvent(new Event("visibilitychange"));
  }

  it("resync after another tab submitted (activeAttempt null + new result) stops the writable UI and shows the result", async () => {
    subGetHandler = n => (n === 1 ? json(200, { ok: true, state: startedStateU }) : json(200, { ok: true, state: submittedStateU }));
    const r = mount(fullAssignmentU);
    await r.findByText("سؤال الاختبار السري");                   // live attempt
    fireVisible();
    await waitFor(() => expect(subGetCalls).toBeGreaterThanOrEqual(2));
    await r.findByText(/تم تسليم المحاولة/);                     // now the authoritative result
    expect(r.container.querySelector(".iex-result-card")).toBeTruthy();
    expect(r.container.textContent).toContain("80");
    expect(r.container.textContent).not.toContain("سؤال الاختبار السري"); // writable UI cleared
  });

  it("stale autosave/submit 409 after another tab finalized => reconcile via server state, show result, no error", async () => {
    subGetHandler = n => (n === 1 ? json(200, { ok: true, state: startedStateU }) : json(200, { ok: true, state: submittedStateU }));
    submitHandler = () => json(409, { ok: false, error: "لا توجد محاولة إضافية متاحة." }); // stale — another tab won
    const r = mount(fullAssignmentU);
    await r.findByText("سؤال الاختبار السري");
    await pressSubmit();
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الآن" }));                 // UX-7b-1: shared ConfirmDialog replaces window.confirm
    await waitFor(() => expect(submitCalls).toBe(1));
    await r.findByText(/تم تسليم المحاولة/);                     // reconciled to the server result
    expect(r.container.querySelector(".iex-error")).toBeNull(); // no raw error surfaced
    expect(finalizeCalls).toBe(0);                              // untimed => never a timeout finalize
  });
});
