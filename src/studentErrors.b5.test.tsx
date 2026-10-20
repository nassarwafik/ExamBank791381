// @vitest-environment happy-dom
//
// Batch 5 (F2/F3) — what a student reads when a request fails, through the REAL StudentExamPage / StudentPortal:
//   • a dropped connection is never "Failed to fetch" / "Load failed", a gateway HTML page never "Unexpected token '<'";
//   • a 401 whose body is not JSON still logs the student out (the status decides before the body is read);
//   • after the time is up, a finalize that keeps failing while online is NOT re-sent every second (2s, 4s, 8s … backoff).
// The texts are written out (this file must not import the module it proves, so it also runs on the baseline).
// Fail-first: run against 56ce0972.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, waitFor, act } from "@testing-library/react";
import StudentExamPage from "./StudentExamPage";
import StudentPortal from "./StudentPortal";

const NETWORK_ERROR_TEXT = "تعذر الاتصال بالخادم. تحقق من الاتصال وأعد المحاولة.";
const SERVER_UNAVAILABLE_TEXT = "الخادم غير متاح حاليًا. أعد المحاولة بعد قليل.";
const START = "2026-01-01T10:00:00.000Z";
const base = {
  attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, dueClosed: false, availability: "open", openAt: "", effectiveDueAt: "",
  durationMinutes: 0, timed: false, attemptModelVersion: 2, requiresStart: false, serverNow: "2026-01-01T10:30:00.000Z",
  activeAttempt: { attemptNumber: 1, startedAt: START, endsAt: "", status: "started" }, effectiveAttemptEndsAt: "", attemptExpired: false,
  canStartAttempt: false, canWrite: true, draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: []
};
const timedExpired = { ...base, durationMinutes: 60, timed: true, activeAttempt: { attemptNumber: 1, startedAt: START, endsAt: "2026-01-01T10:05:00.000Z" },
  effectiveAttemptEndsAt: "2026-01-01T10:05:00.000Z", attemptExpired: true, canWrite: false };
const exam = { title: "امتحان", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "سؤال", marks: 10 }] }] };
const assignment = { assignmentId: "asg1", title: "واجب", instructions: "ت", openAt: "", dueAt: "", effectiveDueAt: "", maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 1, totalMarks: 10, exam };
const ok = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
const html = (status: number) => Promise.resolve({ ok: status < 400, status, json: async () => { throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"); } } as unknown as Response);
const dropped = () => Promise.reject(new TypeError("Failed to fetch"));
let subGet: () => Promise<Response>, finalize: () => Promise<Response>, finalizeCalls = 0;
function installFetch() {
  finalizeCalls = 0;
  globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
    if (url.includes("/api/student-assignment/")) return ok({ ok: true, assignment: { ...assignment, exam } });
    if (url.includes("/api/student-submission/")) {
      const b = init?.body ? JSON.parse(String(init.body)) : {};
      if (b.action === "finalizeTimedOutAttempt") { finalizeCalls++; return finalize(); }
      if (!init?.method || init.method === "GET") return subGet();
      return ok({ ok: true, state: base });
    }
    return ok({ ok: false, error: "nf" }, 404);
  }) as unknown as typeof fetch;
}
const mountExam = () => { const onLogout = vi.fn(); render(<StudentExamPage token="t" assignment={assignment as never} studentName="أ" className="ص" onBack={() => {}} onLogout={onLogout} />); return onLogout; };

beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  subGet = () => ok({ ok: true, state: base });
  finalize = () => ok({ ok: false, error: "خطأ" }, 500);
  installFetch();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("F2 — the exam page never shows browser or parser text", () => {
  it("a dropped connection on load shows the Arabic connection message, never «Failed to fetch»", async () => {
    subGet = dropped;
    mountExam();
    await waitFor(() => expect(document.body.textContent).toContain(NETWORK_ERROR_TEXT));
    expect(document.body.textContent).not.toMatch(/Failed to fetch|Load failed/);
  });

  it("a gateway HTML page (502) shows the Arabic server message, never «Unexpected token»", async () => {
    subGet = () => html(502);
    mountExam();
    await waitFor(() => expect(document.body.textContent).toContain(SERVER_UNAVAILABLE_TEXT));
    expect(document.body.textContent).not.toMatch(/Unexpected token|not valid JSON/);
  });

  it("a 401 whose body is not JSON still logs the student out", async () => {
    subGet = () => html(401);
    const onLogout = mountExam();
    await waitFor(() => expect(onLogout).toHaveBeenCalled());
  });
});

describe("F2 — the student portal", () => {
  const mountPortal = () => { const onLogout = vi.fn(); render(<StudentPortal token="st" displayName="أ" onLogout={onLogout} />); return onLogout; };
  it("a dropped connection on the dashboard shows the Arabic connection message", async () => {
    globalThis.fetch = vi.fn(() => dropped()) as unknown as typeof fetch;
    mountPortal();
    await waitFor(() => expect(document.body.textContent).toContain(NETWORK_ERROR_TEXT));
    expect(document.body.textContent).not.toMatch(/Failed to fetch/);
  });
  it("a dashboard 401 whose body is not JSON logs the student out", async () => {
    globalThis.fetch = vi.fn(() => html(401)) as unknown as typeof fetch;
    const onLogout = mountPortal();
    await waitFor(() => expect(onLogout).toHaveBeenCalled());
  });
});

describe("F3 — a failing timeout finalize is not re-sent every second", () => {
  it("over ~4.5s of server errors (online) the finalize is sent at most twice (backoff), not ~5 times", async () => {
    subGet = () => ok({ ok: true, state: timedExpired });
    mountExam();
    await waitFor(() => expect(finalizeCalls).toBeGreaterThanOrEqual(1));
    await act(async () => { await new Promise(r => setTimeout(r, 4500)); });
    expect(finalizeCalls).toBeLessThanOrEqual(2);
  }, 15000);

  it("when the connection comes back, the finalize is retried at once (the backoff is reset)", async () => {
    subGet = () => ok({ ok: true, state: timedExpired });
    mountExam();
    await waitFor(() => expect(finalizeCalls).toBe(1));                        // failed → backing off for 2s
    await act(async () => {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: false }); window.dispatchEvent(new Event("offline"));
      Object.defineProperty(navigator, "onLine", { configurable: true, value: true }); window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(finalizeCalls).toBe(2), { timeout: 1200 });     // well before the 2s backoff would allow
  }, 15000);
});
