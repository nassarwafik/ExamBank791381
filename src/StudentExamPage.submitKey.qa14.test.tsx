// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor, screen } from "@testing-library/react";
import StudentExamPage from "./StudentExamPage";

// QA-14 — the page sends one submit key per submit of one draft and RE-SENDS it when the student retries the same submit after a
// lost response, so the server answers with that submit's result instead of recording a second attempt (legacy untimed). A new
// draft revision is a new submit with a new key. Real StudentExamPage with a mocked fetch.

const SERVER_NOW = "2026-01-01T10:30:00.000Z";
const state = {
  attemptsUsed: 0, allowedAttempts: 3, canAttempt: true, dueClosed: false, availability: "open", openAt: "", effectiveDueAt: "",
  durationMinutes: 0, timed: false, attemptModelVersion: 0, requiresStart: false, serverNow: SERVER_NOW,
  activeAttempt: { attemptNumber: 1, startedAt: "2026-01-01T10:00:00.000Z", endsAt: "", status: "started" }, effectiveAttemptEndsAt: "", attemptExpired: false,
  canStartAttempt: false, canWrite: true, draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: []
};
const exam = { title: "امتحان", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "سؤال", marks: 100 }] }] };
const assignment = { assignmentId: "asg1", title: "واجب", instructions: "", openAt: "", dueAt: "", effectiveDueAt: "", maxAttempts: 3, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 1, totalMarks: 100, exam };
const result = { attemptNumber: 1, submittedAt: SERVER_NOW, score: 1, totalMarks: 100, percentage: 1, manualReviewMarks: 0, finalized: true };
const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
let submits: Array<Record<string, unknown>> = [], failNextSubmit = false;

beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  submits = []; failNextSubmit = false;
  (globalThis as { fetch?: unknown }).fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init && init.method) || "GET";
    if (!url.includes("/api/student-submission/")) return json(404, { ok: false });
    if (method === "GET") return json(200, { ok: true, state });
    const b = init && init.body ? JSON.parse(String(init.body)) : {};
    if (b.action === "saveDraft") return json(200, { ok: true, savedAt: SERVER_NOW, serverNow: SERVER_NOW });
    if (b.action === "submit") { submits.push(b); if (failNextSubmit) { failNextSubmit = false; return Promise.reject(new TypeError("Failed to fetch")); } return json(200, { ok: true, result, state: { ...state, attemptsUsed: 1, activeAttempt: null, latestResult: result, attempts: [result] } }); }
    return json(200, { ok: true, state });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function pressSubmit() {
  fireEvent.click(await screen.findByRole("button", { name: "مراجعة الإجابات" }));
  fireEvent.click(await screen.findByRole("button", { name: "تسليم الامتحان" }));
  fireEvent.click(await screen.findByRole("button", { name: "تسليم الآن" }));
}

describe("QA-14 StudentExamPage submit key", () => {
  it("a retry of the same submit after a lost response re-sends the SAME key", async () => {
    const r = render(<StudentExamPage token="t" assignment={assignment as never} studentName="أحمد" className="ص" onBack={() => {}} onLogout={() => {}} />);
    fireEvent.change(await r.findByPlaceholderText("اكتب إجابتك هنا..."), { target: { value: "إجابة" } });
    failNextSubmit = true;
    await pressSubmit();
    await waitFor(() => expect(submits.length).toBe(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // the failed submit leaves the student on the review screen: submit again from there
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الامتحان" }));
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الآن" }));
    await waitFor(() => expect(submits.length).toBe(2));
    expect(submits[0].submitKey).toMatch(/^[0-9a-f]{32}$/);
    expect(submits[1].submitKey).toBe(submits[0].submitKey);
  });

  it("an edit between the two submits is a new submit: a new key", async () => {
    const r = render(<StudentExamPage token="t" assignment={assignment as never} studentName="أحمد" className="ص" onBack={() => {}} onLogout={() => {}} />);
    const ta = await r.findByPlaceholderText("اكتب إجابتك هنا...");
    fireEvent.change(ta, { target: { value: "أولى" } });
    failNextSubmit = true;
    await pressSubmit();
    await waitFor(() => expect(submits.length).toBe(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(await screen.findByRole("button", { name: "العودة للحل" }).catch(() => screen.findByText("العودة للحل")));
    fireEvent.change(await r.findByPlaceholderText("اكتب إجابتك هنا..."), { target: { value: "ثانية" } });
    await pressSubmit();
    await waitFor(() => expect(submits.length).toBe(2));
    expect(submits[1].submitKey).not.toBe(submits[0].submitKey);
  });
});
