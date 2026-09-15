// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent } from "@testing-library/react";
import AssignmentReview from "./AssignmentReview";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const A = (n: number, over: Record<string, unknown>) => ({ attemptNumber: n, submittedAt: "2026-03-01T10:00:00.000Z", score: 72, totalMarks: 100, percentage: 72, manualReviewMarks: 0, finalized: true, gradingStatus: "final", startedAt: "", endedAt: "", endReason: "submitted", timedOut: false, ...over });
const getBody = (attempt: Record<string, unknown>, attempts: Record<string, unknown>[]) => ({ ok: true, assignment: { assignmentId: "a1", title: "واجب", totalMarks: 100 }, student: { studentId: "s1", studentName: "أ", studentCode: "S1" }, attempt: { ...attempt, teacherFeedback: "" }, attempts, questions: [] });

function mount(handlers: { get: () => unknown; save?: () => unknown }, onSaved = vi.fn()) {
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init && init.method) || "GET";
    if (url.includes("/api/assignment-review") && method === "GET") return Promise.resolve({ status: 200, ok: true, json: async () => handlers.get() } as Response);
    if (url.includes("/api/assignment-review")) return Promise.resolve({ status: 200, ok: true, json: async () => (handlers.save ? handlers.save() : { ok: true, result: { gradingStatus: "final", finalized: true, score: 90, totalMarks: 100, percentage: 90, manualReviewMarks: 0 } }) } as Response);
    return Promise.resolve({ status: 404, ok: false, json: async () => ({ ok: false }) } as Response);
  }) as unknown as typeof fetch;
  return { r: render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={onSaved} />), onSaved };
}

describe("R14 AssignmentReview grading status", () => {
  it("AN: a pending attempt shows يحتاج مراجعة", async () => {
    mount({ get: () => getBody(A(1, { manualReviewMarks: 18, finalized: false, gradingStatus: "pendingReview" }), [A(1, { manualReviewMarks: 18, finalized: false, gradingStatus: "pendingReview" })]) });
    expect(await screen.findByText(/يحتاج مراجعة/)).toBeTruthy();
    expect(screen.getByText(/متبقٍ للمراجعة/)).toBeTruthy();
  });
  it("AO: a final attempt shows نهائي", async () => {
    mount({ get: () => getBody(A(1, {}), [A(1, {})]) });
    await waitFor(() => expect(screen.getAllByText(/نهائي/).length).toBeGreaterThan(0));
  });
  it("AP: attempt tabs show each attempt's grading state", async () => {
    mount({ get: () => getBody(A(2, { manualReviewMarks: 0, finalized: true, gradingStatus: "final" }), [A(1, { manualReviewMarks: 5, finalized: false, gradingStatus: "pendingReview" }), A(2, { gradingStatus: "final" })]) });
    // tab 1 pending → "مراجعة", tab 2 final → "نهائي"
    expect(await screen.findByText(/محاولة 1 .* مراجعة/)).toBeTruthy();
    expect(screen.getByText(/محاولة 2 .* نهائي/)).toBeTruthy();
  });
  it("AQ: after saveReview finalizes, the UI reloads final and onSaved is called", async () => {
    let getCall = 0;
    const { onSaved } = mount({
      get: () => { getCall++; return getCall === 1 ? getBody(A(1, { manualReviewMarks: 10, finalized: false, gradingStatus: "pendingReview" }), [A(1, { manualReviewMarks: 10, finalized: false, gradingStatus: "pendingReview" })]) : getBody(A(1, { manualReviewMarks: 0, finalized: true, gradingStatus: "final" }), [A(1, {})]); },
      save: () => ({ ok: true, result: { gradingStatus: "final", finalized: true, score: 100, totalMarks: 100, percentage: 100, manualReviewMarks: 0 } })
    });
    expect(await screen.findByText(/يحتاج مراجعة/)).toBeTruthy();
    fireEvent.click(screen.getByText(/حفظ واعتماد التصحيح/));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/تم اعتماد العلامة النهائية/)).toBeTruthy()); // notice from final save
  });
});
