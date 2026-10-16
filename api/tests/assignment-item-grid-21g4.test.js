import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/assignment-item-analysis.js";
import { questionAutoGradingPending } from "../src/lib/coding/official-grading.js";
import { downloadJsonOrNull, listJson } from "../src/lib/platform-storage.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 21G.4 — the item analysis also returns the per-student grid (latest attempt, one cell per question) for the teacher's
// «علامات الطلاب لكل سؤال» table. Grading safety: a question still waiting for the teacher (manual review / technical hold) or for
// automatic coding execution is "pending" and carries NO score — the provisional mark never leaves as if it were a grade.

const CP = "platform/classes/", UP = "platform/users/", AP = "platform/assignments/", SP = "platform/submissions/";
const T0 = "2026-03-01T10:00:00.000Z";
const deps = ctx => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), getContainer: () => ctx.container, downloadJsonOrNull, listJson });
const student = (userId, displayName) => ({ userId, role: "student", active: true, archived: false, classId: "c1", displayName, code: "C-" + userId });
const g = (questionId, score, extra = {}) => ({ questionId, score, maxMarks: 5, correct: score >= 5, manualReview: false, ...extra });
const attempt = (n, grades, extra = {}) => ({ attemptNumber: n, submittedAt: T0, score: 0, totalMarks: 15, percentage: 0, manualReviewMarks: 0, finalized: true, questionGrades: grades, ...extra });
const openCoding = { codingGrading: { targets: { q3: { state: "pending", revision: 1 } } } };

function seed() {
  return createMemoryContainer({
    [CP + "c1.json"]: { classId: "c1", name: "صف أ", active: true, status: "active", studentIds: ["s1", "s2", "s3", "s4"] },
    [UP + "s1.json"]: student("s1", "سارة"),
    [UP + "s2.json"]: student("s2", "أحمد"),
    [UP + "s3.json"]: student("s3", "باسل"),
    [UP + "s4.json"]: student("s4", "دانة"),
    [AP + "a1.json"]: { assignmentId: "a1", classId: "c1", status: "published", title: "واجب", dueAt: T0, createdAt: T0, totalMarks: 15, examSnapshot: { questions: [{ id: "q1", text: "س1", marks: 5 }, { id: "q2", text: "س2", marks: 5 }, { id: "q3", text: "س3", marks: 5, presentationType: "coding" }] } },
    // s1: an older attempt, then the latest — only the latest is in the grid
    [SP + "a1/s1.json"]: { assignmentId: "a1", studentId: "s1", classId: "c1", attempts: [attempt(1, [g("q1", 0), g("q2", 0), g("q3", 0)]), attempt(2, [g("q1", 5), g("q2", 2.5), g("q3", 4, { reviewed: true })])] },
    // s2: q2 waits for manual review (a provisional 0 stored), q3's coding execution is still open (a provisional 0), q1 has no grade
    [SP + "a1/s2.json"]: { assignmentId: "a1", studentId: "s2", classId: "c1", attempts: [attempt(1, [g("q2", 0, { manualReview: true }), g("q3", 0)], { ...openCoding, finalized: false, manualReviewMarks: 5 })] },
    // s3: never submitted (no row); s4: no submission document at all
    [SP + "a1/s3.json"]: { assignmentId: "a1", studentId: "s3", classId: "c1", attempts: [] }
  });
}
const get = c => handler({ method: "GET", url: "https://x/api/assignment-item-analysis?assignmentId=a1" }, deps(c));

describe("21G.4 the per-student grid of the item analysis", () => {
  it("one row per student with a submitted attempt (the latest), one cell per question in question order", async () => {
    const r = await get(seed());
    expect(r.status).toBe(200);
    const byId = Object.fromEntries(r.jsonBody.students.map(s => [s.studentId, s]));
    expect(Object.keys(byId).sort()).toEqual(["s1", "s2"]);
    expect(byId.s1).toEqual({ studentId: "s1", studentName: "سارة", studentCode: "C-s1", attemptNumber: 2, cells: [{ state: "graded", score: 5 }, { state: "graded", score: 2.5 }, { state: "graded", score: 4 }] });
    expect(r.jsonBody.questions.map(q => q.maxMarks)).toEqual([5, 5, 5]);
  });

  it("a question waiting for the teacher or for coding execution is pending with NO score; a missing grade is none", async () => {
    const r = await get(seed());
    const s2 = r.jsonBody.students.find(s => s.studentId === "s2");
    expect(s2.cells).toEqual([{ state: "none" }, { state: "pending" }, { state: "pending" }]);
    for (const cell of s2.cells) expect(cell).not.toHaveProperty("score");
  });

  it("questionAutoGradingPending is per question: an open target of a composite part counts for its question; a complete or teacher-scored one does not", () => {
    const sep = "::part::";
    const base = { codingGrading: { targets: { ["q7" + sep + "p1"]: { state: "processing", revision: 1 }, q8: { state: "complete", revision: 1 }, q9: { state: "pending", revision: 1 } } }, manualOverrides: { q9: { score: 3 } } };
    expect(questionAutoGradingPending(base, "q7")).toBe(true);
    expect(questionAutoGradingPending(base, "q8")).toBe(false);
    expect(questionAutoGradingPending(base, "q9")).toBe(false);
    expect(questionAutoGradingPending({}, "q7")).toBe(false);
  });
});
