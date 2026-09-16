// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import AssignmentsPanel from "./AssignmentsPanel";

// Roadmap #13 — teacher gradebook search/filter/sort + grading badges/buttons over the loaded results.
const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", active: true }];
const lr = (over: Record<string, unknown>) => ({ attemptNumber: 1, score: 62, totalMarks: 100, percentage: 62, submittedAt: "2026-03-01T10:00:00.000Z", finalized: false, manualReviewMarks: 18, gradingStatus: "pendingReview", teacherFeedback: "", ...over });
const finalLR = lr({ score: 90, percentage: 90, finalized: true, manualReviewMarks: 0, gradingStatus: "final" });
const PEND = { studentId: "s1", studentName: "زيد", studentCode: "P1", attemptsUsed: 1, allowedAttempts: 3, dueAtOverride: null, attemptStatus: "submitted", gradingStatus: "pendingReview", activeAttempt: null, attempts: [lr({})], latestResult: lr({}) };
const FIN = { studentId: "s2", studentName: "خالد", studentCode: "F1", attemptsUsed: 1, allowedAttempts: 3, dueAtOverride: null, attemptStatus: "submitted", gradingStatus: "final", activeAttempt: null, attempts: [finalLR], latestResult: finalLR };
const NOSUB = { studentId: "s3", studentName: "سعد", studentCode: "N1", attemptsUsed: 0, allowedAttempts: 3, dueAtOverride: null, attemptStatus: "notStarted", gradingStatus: "notSubmitted", activeAttempt: null, attempts: [], latestResult: null };
const ACT = { studentId: "s4", studentName: "عمر", studentCode: "A1", attemptsUsed: 1, allowedAttempts: 3, dueAtOverride: null, attemptStatus: "started", gradingStatus: "final", activeAttempt: { attemptNumber: 2, startedAt: "2026-03-01T10:00:00.000Z", endsAt: "", status: "started" }, attempts: [finalLR], latestResult: finalLR };
const STATS = { students: 4, submitted: 3, pendingReview: 1, finalized: 2, notSubmitted: 1, active: 1, average: 72, highest: 90, lowest: 62 };
const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);

function installFetch(status = "published") {
  const ASSIGNMENT = { assignmentId: "a1", classId: "c1", className: "الحادي عشر", title: "واجب", instructions: "x", status, openAt: "", dueAt: "", questionCount: 1, totalMarks: 100, maxAttempts: 3, durationMinutes: 0, archivedAt: status === "archived" ? "2026-01-01T00:00:00.000Z" : undefined };
  (globalThis as { fetch?: unknown }).fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init && init.method) || "GET";
    if (url.includes("/api/assignments") && method !== "POST") return json({ ok: true, assignments: [ASSIGNMENT] });
    if (url.includes("/api/saved-exams")) return json({ ok: true, exams: [] });
    if (url.includes("/api/assignment-results") && method !== "POST") return json({ ok: true, assignment: { assignmentId: "a1", title: "واجب", dueAt: "", durationMinutes: 0, maxAttempts: 3, totalMarks: 100 }, stats: STATS, students: [PEND, FIN, NOSUB, ACT] });
    return json({ ok: true });
  }) as unknown as typeof fetch;
}
beforeEach(() => { (window as unknown as { scrollTo: () => void }).scrollTo = () => {}; installFetch(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openGradebook(archived = false) {
  const r = render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />);
  if (archived) fireEvent.click(await r.findByText(/المؤرشفة/));
  fireEvent.click(await r.findByRole("button", { name: "فتح" }));
  await r.findByText("زيد");
  return r;
}
const rowOf = (r: ReturnType<typeof render>, name: string) => r.getByText(name).closest("tr") as HTMLElement;
const names = (r: ReturnType<typeof render>) => ["زيد", "خالد", "سعد", "عمر"].filter(n => r.queryByText(n));

describe("R13 gradebook search / filter / sort / badges", () => {
  it("AD: search by name", async () => { const r = await openGradebook(); fireEvent.change(r.getByPlaceholderText("بحث بالاسم أو الكود"), { target: { value: "خالد" } }); expect(names(r)).toEqual(["خالد"]); });
  it("AE: search by code", async () => { const r = await openGradebook(); fireEvent.change(r.getByPlaceholderText("بحث بالاسم أو الكود"), { target: { value: "N1" } }); expect(names(r)).toEqual(["سعد"]); });
  it("AF: pending filter", async () => { const r = await openGradebook(); fireEvent.click(r.getByText("بانتظار التصحيح", { selector: ".gradebook-chip" })); expect(names(r)).toEqual(["زيد"]); });
  it("AG: final filter", async () => { const r = await openGradebook(); fireEvent.click(r.getByText("نهائي", { selector: ".gradebook-chip" })); expect(names(r).sort()).toEqual(["خالد", "عمر"].sort()); });
  it("AH: not-submitted filter", async () => { const r = await openGradebook(); fireEvent.click(r.getByText("لم يسلّم", { selector: ".gradebook-chip" })); expect(names(r)).toEqual(["سعد"]); });
  it("AI: active filter", async () => { const r = await openGradebook(); fireEvent.click(r.getByText("قيد المحاولة", { selector: ".gradebook-chip" })); expect(names(r)).toEqual(["عمر"]); });
  it("AJ: pending review button is 'تصحيح الآن'", async () => { const r = await openGradebook(); expect(within(rowOf(r, "زيد")).getByText(/تصحيح الآن/)).toBeTruthy(); });
  it("AK: final result button is 'عرض التصحيح'", async () => { const r = await openGradebook(); expect(within(rowOf(r, "خالد")).getByText("عرض التصحيح")).toBeTruthy(); });
  it("AL: lifecycle badge and grading badge coexist on a row", async () => { const r = await openGradebook(); const row = rowOf(r, "زيد"); expect(row.querySelector(".lifecycle-badge")).toBeTruthy(); expect(row.querySelector(".review-state.pending")).toBeTruthy(); });
});

describe("R13 gradebook archived", () => {
  beforeEach(() => installFetch("archived"));
  it("AM: archived results readable; grading badge shown; lifecycle-mutation controls hidden", async () => {
    const r = await openGradebook(true);
    const row = rowOf(r, "خالد");
    expect(within(row).getByText("عرض التصحيح")).toBeTruthy();                   // review still available
    expect(row.querySelector(".review-state.final")).toBeTruthy();
    expect(within(row).queryByText(/منح محاولة إضافية/)).toBeNull();             // B2B mutation controls hidden
    expect(within(row).queryByText(/إعادة فتح للطالب/)).toBeNull();
  });
});
