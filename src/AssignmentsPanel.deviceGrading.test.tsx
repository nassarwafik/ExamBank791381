// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

// Teacher-device grading — the gradebook flow: confirm → grade on this device (lib mocked: the lab cannot run in a unit test) →
// the gradebook reloads from the server → the counts notice. Cancelling the confirmation does nothing.
const grading = vi.hoisted(() => ({ all: vi.fn(), one: vi.fn() }));
vi.mock("./coding/deviceGrading", async importOriginal => {
  const real = await importOriginal<typeof import("./coding/deviceGrading")>();
  return { ...real, gradeAllOnDevice: grading.all, gradeStudentOnDevice: grading.one };
});
import AssignmentsPanel from "./AssignmentsPanel";

const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", active: true }];
const ASSIGNMENT = { assignmentId: "a1", classId: "c1", className: "الحادي عشر", title: "واجب برمجة", instructions: "x", status: "published", openAt: "", dueAt: "2026-01-01T13:00:00.000Z", questionCount: 1, totalMarks: 10, maxAttempts: 1 };
const OPEN = { pending: 0, retryable: 1, stale: 0 };
const STUDENT = { studentId: "s1", studentName: "طالب برمجة", studentCode: "S1", attemptsUsed: 1, allowedAttempts: 1, dueAtOverride: null, attemptStatus: "submitted", activeAttempt: null, attempts: [],
  latestResult: { attemptNumber: 1, score: 0, totalMarks: 10, percentage: 0, submittedAt: "2026-01-01T12:00:00.000Z", finalized: false, manualReviewMarks: 10, codingGrading: OPEN } };
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, headers: new Headers(), json: async () => body } as Response);
let resultsGets = 0;
beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })));
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  resultsGets = 0;
  grading.all.mockReset(); grading.one.mockReset();
  (globalThis as { fetch?: unknown }).fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init && init.method) || "GET";
    if (url.includes("/api/assignments") && method !== "POST") return json({ ok: true, assignments: [ASSIGNMENT] });
    if (url.includes("/api/saved-exams")) return json({ ok: true, exams: [] });
    if (url.includes("/api/assignment-results") && method !== "POST") { resultsGets++; return json({ ok: true, assignment: ASSIGNMENT, stats: { students: 1, submitted: 1, pendingReview: 1, average: 0, highest: 0, lowest: 0 }, students: [STUDENT], codingSummary: OPEN }); }
    return json({ ok: true });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function openGradebook() {
  const r = render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />);
  fireEvent.click(await r.findByRole("button", { name: "فتح" }));
  await r.findByText("طالب برمجة");
  return r;
}
const confirmEl = () => waitFor(() => { const el = document.querySelector('.eb-confirm[role="dialog"]') as HTMLElement | null; if (!el) throw new Error("no confirm yet"); return el; });

describe("AssignmentsPanel — «التصحيح على جهازي»", () => {
  it("all students: confirm → graded on this device → the gradebook reloads → the counts notice", async () => {
    grading.all.mockImplementation(async (_api: unknown, assignmentId: string, opts: { onProgress?: (p: unknown) => void }) => {
      expect(assignmentId).toBe("a1");
      opts.onProgress?.({ student: 1, students: 1, answer: 1, answers: 1 });
      return { students: 1, graded: 1, review: 0, held: 1, failed: 0, skipped: 0 };
    });
    const r = await openGradebook();
    const before = resultsGets;
    fireEvent.click(r.getByRole("button", { name: "صحّح جميع الطلاب على جهازي" }));
    const dlg = await confirmEl();
    expect(dlg.textContent).toContain("قيد المراجعة");
    fireEvent.click(within(dlg).getByRole("button", { name: "ابدأ التصحيح" }));
    await waitFor(() => expect(r.getByText(/صُحّح على جهازك: إجابة واحدة\./)).toBeTruthy());
    expect(r.getByText(/بقيت «قيد المراجعة»/)).toBeTruthy();
    expect(grading.all).toHaveBeenCalledTimes(1);
    expect(grading.one).not.toHaveBeenCalled();
    expect(resultsGets).toBe(before + 1);                                          // authoritative reload
  });
  it("one student: the row button grades that student only", async () => {
    grading.one.mockResolvedValue({ students: 1, graded: 1, review: 0, held: 0, failed: 0, skipped: 0 });
    const r = await openGradebook();
    fireEvent.click(r.getByRole("button", { name: "صحّح إجابات البرمجة لـ طالب برمجة على جهازي" }));
    fireEvent.click(within(await confirmEl()).getByRole("button", { name: "ابدأ التصحيح" }));
    await waitFor(() => expect(grading.one).toHaveBeenCalledTimes(1));
    expect(grading.one.mock.calls[0].slice(1, 3)).toEqual(["a1", "s1"]);
  });
  it("cancelled confirmation → nothing runs; a lab failure shows its message", async () => {
    const r = await openGradebook();
    fireEvent.click(r.getByRole("button", { name: "صحّح جميع الطلاب على جهازي" }));
    fireEvent.click(within(await confirmEl()).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(document.querySelector('.eb-confirm[role="dialog"]')).toBeNull());
    expect(grading.all).not.toHaveBeenCalled();
    grading.all.mockRejectedValue(new Error("تعذّر تحميل المترجم على هذا الجهاز."));
    fireEvent.click(r.getByRole("button", { name: "صحّح جميع الطلاب على جهازي" }));
    fireEvent.click(within(await confirmEl()).getByRole("button", { name: "ابدأ التصحيح" }));
    await waitFor(() => expect(r.getByText("تعذّر تحميل المترجم على هذا الجهاز.")).toBeTruthy());
  });
});
