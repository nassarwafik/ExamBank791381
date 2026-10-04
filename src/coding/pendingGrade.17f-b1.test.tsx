// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, act } from "@testing-library/react";
import StudentExamPage from "../StudentExamPage";
import StudentAssignmentCard from "../student/StudentAssignmentCard";

// Phase 17F-B1 — TECHNICAL GRADING DELAY ≠ ACADEMIC ZERO.
// Live A2 evidence: a student submitted while the Runner was stopped; the result was correctly "temporary / under review", yet
// the big headline still read "0 / 30" and "0%". The headline must be NEUTRAL ("— / 30" + "بانتظار التصحيح الآلي") while the
// SERVER says official coding grading is still open (autoGradingStatus queued | processing | retrying | delayed, or the legacy
// autoGradingPending boolean) — and a REAL zero must still display when grading is complete, when the teacher overrode the
// mark, or when no coding target was ever open. Never derived from the score itself.
// Fail-first on eb61b5d3: the headline always renders result.score / result.totalMarks and result.percentage%.

const EXAM = { title: "امتحان", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "ق", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "سؤال", marks: 30 }] }] };
const ASSIGNMENT = { assignmentId: "a1", title: "واجب", instructions: "ت", openAt: "", dueAt: "", effectiveDueAt: "", maxAttempts: 2, durationMinutes: 0, requiresStart: true, timed: false, questionCount: 1, totalMarks: 30, exam: EXAM };
const BASE = { attemptsUsed: 1, allowedAttempts: 2, canAttempt: true, dueClosed: false, availability: "open", durationMinutes: 0, timed: false, attemptModelVersion: 3, attemptPolicy: "continuous", requiresStart: true, serverNow: "2026-10-03T12:00:00.000Z", activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: true, canWrite: false, draftAnswers: {}, draftSavedAt: "" };
type R = Record<string, unknown>;
/** The exact A2 shape: the only question is a hidden-test coding question, its target is open → score 0 / 30, 0 %, provisional. */
const result = (over: R = {}): R => ({ attemptNumber: 1, submittedAt: "2026-10-03T10:00:00.000Z", score: 0, totalMarks: 30, percentage: 0, manualReviewMarks: 30, finalized: false, gradingStatus: "pendingReview", teacherFeedback: "", timedOut: false, endReason: "submitted", ...over });
const open = (status: string, over: R = {}) => result({ autoGradingStatus: status, autoGradingPending: true, ...over });
const complete = (over: R = {}) => result({ autoGradingStatus: "complete", gradingStatus: "final", finalized: true, manualReviewMarks: 0, ...over });
const stateWith = (latest: R | null, over: R = {}): R => ({ ...BASE, latestResult: latest, attempts: latest ? [latest] : [], ...over });

type Call = { url: string; method: string };
function makeServer(initial: R) {
  const server = { state: initial, calls: [] as Call[] };
  const json = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, headers: { get: () => null }, json: async () => body }) as unknown as Response;
  globalThis.fetch = vi.fn((url: string, init: RequestInit = {}) => {
    const method = (init.method || "GET").toUpperCase();
    server.calls.push({ url: String(url), method });
    if (String(url).startsWith("/api/student-assignment/")) return Promise.resolve(json(200, { ok: true, assignment: { exam: EXAM, requiresStart: false } }));
    return Promise.resolve(json(200, { ok: true, state: JSON.parse(JSON.stringify(server.state)) }));
  }) as unknown as typeof fetch;
  return server;
}
const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const settle = async () => { for (let i = 0; i < 6; i++) await flush(0); };
const mount = async () => { render(<StudentExamPage token="t" assignment={ASSIGNMENT as never} studentName="أ" className="ص" onBack={() => {}} onLogout={() => {}} />); await settle(); };
const headline = () => document.querySelector(".iex-score") as HTMLElement | null;
const card = () => document.querySelector(".iex-result-card") as HTMLElement | null;
/** The visible big number, whitespace-normalised; the percentage / pending label is the <strong> right after it. */
const headlineText = () => (headline()?.textContent ?? "").replace(/\s+/g, " ").trim();
const percentText = () => (headline()?.nextElementSibling?.textContent ?? "").replace(/\s+/g, " ").trim();
const NEUTRAL = /^—\s*\/\s*30$/;
const PENDING_LABEL = /بانتظار التصحيح الآلي/;

beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] }); vi.spyOn(console, "error").mockImplementation(() => {}); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

const expectNeutral = () => {
  const h = headline();
  expect(h, "the headline element exists").not.toBeNull();
  expect(headlineText()).toMatch(NEUTRAL);                                   // "— / 30", never "0 / 30"
  expect(percentText()).not.toMatch(/%/);                                    // never "0%"
  expect(percentText()).toMatch(PENDING_LABEL);
  expect(h!.getAttribute("data-pending")).toBe("true");
};
const expectScore = (score: number, percent: number) => {
  expect(headlineText()).toBe(score + " / 30");
  expect(percentText()).toBe(percent + "%");
  expect(headline()!.getAttribute("data-pending")).not.toBe("true");
};

describe("17F-B1 UX1–UX4 — an OPEN official coding grading state never shows an academic zero", () => {
  it("UX1 retrying (the live A2 outage shape): no 0 / 30, no 0 %, neutral dash + pending label", async () => {
    makeServer(stateWith(open("retrying")));
    await mount();
    expect(screen.getByTestId("coding-grading-status").getAttribute("data-status")).toBe("retrying");
    expectNeutral();
    expect(card()!.textContent!).toMatch(/علامة مؤقتة/);                      // mark finality is still the canonical, separate dimension
    expect(card()!.textContent!).not.toMatch(/0 \/ 30|0%/);
  });
  it("UX2 queued → neutral pending headline", async () => { makeServer(stateWith(open("queued"))); await mount(); expectNeutral(); });
  it("UX3 processing → neutral pending headline", async () => { makeServer(stateWith(open("processing"))); await mount(); expectNeutral(); });
  it("UX4 delayed (automatic recovery exhausted, still under review) → neutral pending headline, never a zero", async () => { makeServer(stateWith(open("delayed"))); await mount(); expectNeutral(); });
  it("UX1b–UX4b each open status is withheld ON ITS OWN (no legacy boolean): the resolver does not depend on autoGradingPending", async () => {
    for (const status of ["queued", "processing", "retrying", "delayed"]) {
      makeServer(stateWith(result({ autoGradingStatus: status })));
      await mount();
      expect(screen.getByTestId("coding-grading-status").getAttribute("data-status"), status).toBe(status);
      expectNeutral();
      cleanup();
    }
  });
  it("UX-legacy an older server payload with only autoGradingPending=true is still an open state → neutral", async () => {
    makeServer(stateWith(result({ autoGradingPending: true })));
    await mount();
    expectNeutral();
  });
});

describe("17F-B1 UX5–UX7 — a REAL zero (or any authoritative score) still displays", () => {
  it("UX5 official grading complete with an authoritative 0 → 0 / 30 and 0 % are displayed (never hidden)", async () => {
    makeServer(stateWith(complete({ score: 0, percentage: 0 })));
    await mount();
    expectScore(0, 0);
    expect(card()!.textContent!).not.toMatch(PENDING_LABEL);
  });
  it("UX6 official grading complete with a positive score → the actual score", async () => {
    makeServer(stateWith(complete({ score: 24, percentage: 80 })));
    await mount();
    expectScore(24, 80);
  });
  it("UX7 a teacher override of 0 on the coding question: the server omits any open status (17E-D F3) → the real 0 stays", async () => {
    // the server projection of an overridden target carries NO autoGradingStatus / autoGradingPending (api/src/lib/coding/official-grading.js
    // studentCodingGradingStatus + autoGradingPending skip overridden targets); the UI must trust that and show the mark
    makeServer(stateWith(result({ score: 0, percentage: 0, manualReviewMarks: 0, finalized: true, gradingStatus: "final" })));
    await mount();
    expectScore(0, 0);
    expect(card()!.textContent!).not.toMatch(PENDING_LABEL);
  });
  it("UX5b neutrality is NEVER derived from the score: a complete non-coding result of 0 shows 0", async () => {
    makeServer(stateWith(result({ score: 0, percentage: 0, manualReviewMarks: 0, finalized: true, gradingStatus: "final" })));
    await mount();
    expectScore(0, 0);
    expect(screen.queryByTestId("coding-grading-status")).toBeNull();
  });
});

describe("17F-B1 UX8–UX9 — mixed exams and the pending → complete transition", () => {
  it("UX8 coding pending + another question already graded: the partial total is NOT presented as the result", async () => {
    makeServer(stateWith(open("processing", { score: 10, percentage: 33, manualReviewMarks: 20 })));
    await mount();
    expectNeutral();
    expect(headlineText()).not.toMatch(/10/);
    expect(percentText()).not.toMatch(/33/);
  });
  it("UX9 refresh: pending → complete updates the headline to the authoritative final score (30 / 30, 100 %)", async () => {
    const s = makeServer(stateWith(open("processing")));
    await mount();
    expectNeutral();
    s.state = stateWith(complete({ score: 30, percentage: 100 }));
    await flush(3000);
    await settle();
    expect(screen.getByTestId("coding-grading-status").getAttribute("data-status")).toBe("complete");
    expectScore(30, 100);
    expect(card()!.textContent!).not.toMatch(PENDING_LABEL);
    expect(card()!.textContent!).toMatch(/العلامة النهائية/);
  });
  it("UX9b refresh: pending → complete with a REAL zero shows 0 / 30 (the dash was never a hidden zero)", async () => {
    const s = makeServer(stateWith(open("retrying")));
    await mount();
    expectNeutral();
    s.state = stateWith(complete({ score: 0, percentage: 0 }));
    await flush(3000);
    await settle();
    expectScore(0, 0);
  });
});

describe("17F-B1 UX-card — the portal card uses the same resolver", () => {
  const lr = (over: R = {}) => ({ attemptNumber: 1, score: 0, totalMarks: 30, percentage: 0, submittedAt: "2026-10-03T10:00:00.000Z", manualReviewMarks: 30, gradingStatus: "pendingReview", teacherFeedback: "", ...over });
  const assignment = (latestResult: R) => ({ assignmentId: "a1", title: "واجب", instructions: "", openAt: "", dueAt: "", effectiveDueAt: "", sourceExamTitle: "", questionCount: 1, totalMarks: 30, durationMinutes: 0, attemptModelVersion: 3, attemptStatus: "submitted", hasActiveAttempt: false, availability: "open", dashboardState: "awaitingReview", gradingStatus: "pendingReview", attemptsUsed: 1, allowedAttempts: 1, canAttempt: false, latestScore: 0, latestPercentage: 0, latestResult, createdAt: "" });
  it("open coding grading → — / 30 on the card; complete 0 → 0/30", () => {
    const { container, unmount } = render(<StudentAssignmentCard item={assignment(lr({ autoGradingStatus: "retrying", autoGradingPending: true })) as never} busy={false} onOpen={() => {}} />);
    expect(container.textContent).toMatch(/—\s*\/\s*30/);
    expect(container.textContent).not.toMatch(/(^|[^0-9.])0\s*\/\s*30/);
    unmount();
    const { container: c2 } = render(<StudentAssignmentCard item={assignment(lr({ autoGradingStatus: "complete", gradingStatus: "final", manualReviewMarks: 0, finalized: true })) as never} busy={false} onOpen={() => {}} />);
    expect(c2.textContent).toMatch(/(^|[^0-9.])0\s*\/\s*30/);
    expect(c2.textContent).not.toMatch(/—/);
  });
});
