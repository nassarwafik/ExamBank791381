// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, waitFor, fireEvent } from "@testing-library/react";
import StudentExamPage from "./StudentExamPage";

// B2B #25 — a StudentExamPage resync (visibilitychange/online) must pick up a teacher timer extension
// (activeAttempt.extendedEndsAt / a later effectiveAttemptEndsAt) and re-anchor the live countdown, and a
// revived (attemptExpired=false, canWrite=true) attempt must keep the answers/submit enabled.

const ASSIGNMENT_ID = "asg1";
const START = "2026-01-01T10:00:00.000Z";
const END = "2026-01-01T11:00:00.000Z";
const EXT_END = "2026-01-01T11:30:00.000Z";

const startedState = {
  attemptsUsed: 0, allowedAttempts: 1, canAttempt: false, dueClosed: false, availability: "open", openAt: "", effectiveDueAt: "",
  durationMinutes: 90, timed: true, attemptModelVersion: 2, requiresStart: true, attemptStatus: "started",
  serverNow: "2026-01-01T10:30:00.000Z", activeAttempt: { attemptNumber: 1, startedAt: START, endsAt: END, extendedEndsAt: "", status: "started", lastSavedAt: "" },
  effectiveAttemptEndsAt: END, attemptDurationEndsAt: END, attemptExpired: false, canStartAttempt: false, canWrite: true,
  draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: []
};
// After a teacher extension: same attempt, later duration end (11:30), later serverNow (10:31).
const extendedState = { ...startedState, activeAttempt: { ...startedState.activeAttempt, extendedEndsAt: EXT_END }, effectiveAttemptEndsAt: EXT_END, attemptDurationEndsAt: EXT_END, serverNow: "2026-01-01T10:31:00.000Z" };

const fullExam = { title: "امتحان مؤقت", metadata: {}, presentationTheme: "classic", coverPage: { enabled: false },
  sections: [{ id: "s1", title: "القسم الأول", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "سؤال الاختبار السري", marks: 100 }] }] };
const fullAssignment = { assignmentId: ASSIGNMENT_ID, title: "امتحان مؤقت", instructions: "x", openAt: "", dueAt: END, effectiveDueAt: "", maxAttempts: 1, questionCount: 1, totalMarks: 100, durationMinutes: 90, requiresStart: false, timed: true, exam: fullExam };

const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
let subGetCalls = 0, subGetHandler: (n: number) => Promise<Response>;
function installFetch() {
  subGetCalls = 0;
  (globalThis as { fetch?: unknown }).fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init && init.method) || "GET";
    if (url.includes("/api/student-submission/")) {
      if (method === "GET") { subGetCalls++; return subGetHandler(subGetCalls); }
      return json(200, { ok: true, state: startedState });
    }
    if (url.includes("/api/student-assignment/")) return json(200, { ok: true, assignment: { ...fullAssignment, requiresStart: false } });
    return json(404, { ok: false, error: "not found" });
  }) as unknown as typeof fetch;
}
function mount() { return render(<StudentExamPage token="t" assignment={fullAssignment as never} studentName="أحمد" className="ح" onBack={() => {}} onLogout={vi.fn() as unknown as () => void} />); }
function fireVisible() {
  try { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); } catch { /* already visible */ }
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  (window as unknown as { confirm: () => boolean }).confirm = () => true;
  installFetch();
  subGetHandler = () => json(200, { ok: true, state: startedState });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("StudentExamPage — resync picks up a teacher timer extension (B2B #25)", () => {
  it("re-anchors the countdown to the extended deadline and keeps submit enabled", async () => {
    subGetHandler = n => (n === 1 ? json(200, { ok: true, state: startedState }) : json(200, { ok: true, state: extendedState }));
    const r = mount();
    await r.findByText("سؤال الاختبار السري");
    // initial window 10:00 -> 11:00 with serverNow 10:30 => ~30:00
    await waitFor(() => { const c = r.container.querySelector(".iex-countdown-clock"); expect(c?.textContent || "").toMatch(/^(30:00|29:5\d)$/); });

    // teacher extended to 11:30; a resync (visibilitychange) must pick it up.
    fireVisible();
    await waitFor(() => expect(subGetCalls).toBeGreaterThanOrEqual(2));
    // new window 10:31 -> 11:30 => ~59:00 (definitely NOT the old ~30:00)
    await waitFor(() => { const c = r.container.querySelector(".iex-countdown-clock"); expect(c?.textContent || "").toMatch(/^(59:00|58:5\d)$/); });
    // controls remain live (writable) after the extension
    fireEvent.click(await r.findByRole("button", { name: "مراجعة الإجابات" }));                 // UX-7b-2: submit lives on the review screen
    const submitBtn = await r.findByRole("button", { name: "تسليم الامتحان" }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);
    expect(r.container.querySelector(".iex-result-card")).toBeNull();
  });
});
