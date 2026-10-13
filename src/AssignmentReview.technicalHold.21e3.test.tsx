// @vitest-environment happy-dom
// Phase 21E.3 — assessment integrity in the teacher review: a question the student's device could not display is shown with its
// reason and a resolution path (a teacher mark here, or a retry from the results page); a reported-but-answered question is
// explained as graded normally; nothing new appears for an ordinary attempt. Fail-first on 593fd47 (the projection did not exist).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import AssignmentReview from "./AssignmentReview";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const attempt = (over: Record<string, unknown>) => ({ attemptNumber: 1, submittedAt: "2026-10-13T10:00:00.000Z", score: 4, totalMarks: 6, percentage: 66.7, manualReviewMarks: 2, finalized: false, gradingStatus: "pendingReview", startedAt: "", endedAt: "", endReason: "submitted", teacherFeedback: "", ...over });
const q = (id: string, n: number, over: Record<string, unknown>) => ({ questionId: id, questionNumber: n, text: "س" + n, marks: 2, type: "multipleChoice", options: [{ text: "أ" }, { text: "ب" }], studentAnswer: null, expectedAnswer: { correctOptionIndex: 0 }, autoGrade: { questionId: id, score: 0, maxMarks: 2, countedMaxMarks: 2, correct: false, manualReview: false }, manualScore: null, teacherComment: "", ...over });
const body = (att: Record<string, unknown>, questions: unknown[]) => ({ ok: true, assignment: { assignmentId: "a1", title: "واجب", totalMarks: 6 }, student: { studentId: "s1", studentName: "أحمد", studentCode: "S1" }, attempt: att, attempts: [att], questions });

function mount(get: () => unknown) {
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init && init.method) || "GET";
    if (url.includes("/api/assignment-review") && method === "GET") return Promise.resolve({ status: 200, ok: true, json: async () => get() } as Response);
    return Promise.resolve({ status: 404, ok: false, json: async () => ({ ok: false }) } as Response);
  }) as unknown as typeof fetch;
  return render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
}

describe("technical hold in the teacher review", () => {
  it("a held question shows the reason and what to do; the summary counts it; the attempt is pending", async () => {
    mount(() => body(attempt({ technicalHolds: 1 }), [
      q("q1", 1, { studentAnswer: { kind: "choice", index: 0 }, autoGrade: { questionId: "q1", score: 2, maxMarks: 2, countedMaxMarks: 2, correct: true, manualReview: false } }),
      q("q2", 2, { autoGrade: { questionId: "q2", score: 0, maxMarks: 2, countedMaxMarks: 2, correct: false, manualReview: true, technicalFailure: { code: "chunk-load", reason: "renderFailure" } }, renderFailure: { code: "chunk-load", held: true, reportedAt: "2026-10-13T10:00:00.000Z" } }),
      q("q3", 3, {})
    ]));
    const note = await screen.findByTestId("rv-technical-failure");
    expect(note.className).toContain("is-held");
    expect(note.textContent).toContain("تعذّر عرض هذا السؤال على جهاز الطالب");
    expect(note.textContent).toContain("تعذّر تحميل جزء من التطبيق");
    expect(note.textContent).toContain("لم تُحتسب العلامة صفرًا تلقائيًا");
    expect(note.textContent).toContain("محاولة إضافية");
    expect(screen.getByTestId("rv-count-technical").textContent).toBe("1");
    expect(screen.getByText(/يحتاج مراجعة/)).toBeTruthy();
    const article = note.closest("article")!;
    expect(article.textContent).toContain("يحتاج تصحيحًا يدويًا");
    expect(article.querySelector("input[type=number]")).toBeTruthy();         // the resolution path: a teacher mark
    expect(screen.getAllByTestId("rv-technical-failure")).toHaveLength(1);    // q1 / q3 carry nothing
  });

  it("a reported but answered question is explained as graded normally (not held); a resolved hold says the teacher decided", async () => {
    mount(() => body(attempt({ manualReviewMarks: 0, finalized: true, gradingStatus: "final" }), [
      q("q1", 1, { studentAnswer: { kind: "choice", index: 1 }, renderFailure: { code: "runtime", held: false, reportedAt: "" } }),
      q("q2", 2, { manualScore: 2, autoGrade: { questionId: "q2", score: 2, maxMarks: 2, countedMaxMarks: 2, correct: false, manualReview: false, manualScore: 2, technicalFailure: { code: "chunk-load" } }, renderFailure: { code: "chunk-load", held: true, reportedAt: "" } })
    ]));
    const notes = await screen.findAllByTestId("rv-technical-failure");
    expect(notes).toHaveLength(2);
    expect(notes[0].textContent).toContain("حدث خطأ أثناء عرض السؤال");
    expect(notes[0].textContent).toContain("صُحِّحت كالمعتاد");
    expect(notes[0].className).not.toContain("is-held");
    expect(notes[1].textContent).toContain("قرّرت علامة المعلم");
    expect(screen.queryByTestId("rv-count-technical")).toBeNull();
  });

  it("an ordinary attempt shows nothing new", async () => {
    mount(() => body(attempt({ manualReviewMarks: 0, finalized: true, gradingStatus: "final" }), [q("q1", 1, {})]));
    await screen.findByText("س1");
    expect(screen.queryByTestId("rv-technical-failure")).toBeNull();
    expect(screen.queryByTestId("rv-count-technical")).toBeNull();
  });
});
