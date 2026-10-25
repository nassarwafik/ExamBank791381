// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import StudentExamPage from "./StudentExamPage";

// QA2-2 — the due date closes an UNTIMED attempt (the server now reports it expired, its end = the due date). A student who opens
// the exam after the due date gets the same timeout finalization as a timed or paused attempt: the server grades the draft saved
// before the due date. Before this, the page only finalized timed / paused attempts, and the server refused untimed ones.
// Real StudentExamPage with a mocked fetch (same harness as StudentExamPage.untimed.test.tsx).

const START = "2026-01-01T10:00:00.000Z", DUE = "2026-01-01T11:00:00.000Z", SERVER_NOW = "2026-01-01T11:30:00.000Z";
const active = { attemptNumber: 1, startedAt: START, endsAt: "", status: "draft", lastSavedAt: "2026-01-01T10:50:00.000Z" };
const base = {
  attemptsUsed: 0, allowedAttempts: 1, canAttempt: false, dueClosed: true, availability: "closed", openAt: "", effectiveDueAt: DUE,
  durationMinutes: 0, timed: false, attemptModelVersion: 2, requiresStart: true, attemptStatus: "draft", serverNow: SERVER_NOW,
  activeAttempt: active, canStartAttempt: false, canWrite: false, draftAnswers: { q1: { kind: "text", value: "إجابتي" } }, draftSavedAt: "2026-01-01T10:50:00.000Z",
  latestResult: null, attempts: []
};
const expiredState = { ...base, attemptExpired: true, effectiveAttemptEndsAt: DUE };
const result = { attemptNumber: 1, submittedAt: SERVER_NOW, score: 100, totalMarks: 100, percentage: 100, manualReviewMarks: 0, finalized: true, timedOut: true, endReason: "timedOut", startedAt: START, endedAt: DUE };
const exam = { title: "واجب", metadata: {}, presentationTheme: "classic",
  sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "السؤال", marks: 100 }] }] };
const assignment = { assignmentId: "asg1", title: "واجب", instructions: "", openAt: "", dueAt: DUE, effectiveDueAt: DUE, maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 1, totalMarks: 100, exam };

const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
let finalizeCalls = 0, getState: unknown = expiredState;
beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  finalizeCalls = 0; getState = expiredState;
  (globalThis as { fetch?: unknown }).fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init && init.method) || "GET";
    if (!url.includes("/api/student-submission/")) return json(404, { ok: false, error: "not found" });
    if (method === "GET") return json(200, { ok: true, state: getState });
    const b = init && init.body ? JSON.parse(String(init.body)) : {};
    if (b.action === "finalizeTimedOutAttempt") { finalizeCalls++; return json(200, { ok: true, result, state: { ...base, activeAttempt: null, attemptExpired: false, effectiveAttemptEndsAt: "", latestResult: result, attempts: [result], attemptsUsed: 1 } }); }
    return json(409, { ok: false, error: "x" });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const mount = () => render(<StudentExamPage token="t" assignment={assignment as never} studentName="أحمد" className="ص" onBack={() => {}} onLogout={() => {}} />);

describe("QA2-2 StudentExamPage — an untimed attempt past its due date is finalized, its saved answers graded", () => {
  it("opening the page after the due date finalizes the attempt once and shows the result", async () => {
    const r = mount();
    await waitFor(() => expect(finalizeCalls).toBe(1), { timeout: 4000 });
    await waitFor(() => expect(r.container.textContent).toContain("100"), { timeout: 4000 });
    expect(finalizeCalls).toBe(1);
  });
  it("unchanged: an untimed attempt that is not expired is never finalized by the page", async () => {
    getState = { ...base, dueClosed: false, availability: "open", canWrite: true, attemptExpired: false, effectiveAttemptEndsAt: "" };
    const r = mount();
    await waitFor(() => expect(r.container.querySelector("textarea")).toBeTruthy(), { timeout: 4000 });
    await new Promise(res => setTimeout(res, 300));
    expect(finalizeCalls).toBe(0);
  });
});
