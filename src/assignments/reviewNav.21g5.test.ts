// Phase 21G.5 — moving between students in the review: the gradebook's order, only students with a submitted attempt, and
// «التالي بانتظار التصحيح» = the next pending student after the current one, wrapping round, never the current student.
import { describe, it, expect } from "vitest";
import { reviewNav } from "./reviewNav";
import { rowGrading } from "./assignmentsView";
import type { StudentResult } from "./types";

const lr = (n: number, pending = false) => ({ attemptNumber: n, score: 1, totalMarks: 2, percentage: 50, submittedAt: "x", finalized: !pending, manualReviewMarks: pending ? 1 : 0 });
const s = (id: string, latest: unknown) => ({ studentId: id, studentName: id, studentCode: id, attemptsUsed: 1, allowedAttempts: 1, dueAtOverride: null, latestResult: latest } as unknown as StudentResult);
const ROWS = [s("a", lr(1, true)), s("b", null), s("c", lr(2)), s("d", lr(1, true)), s("e", lr(3))];

describe("review navigation", () => {
  it("steps through students with a submitted attempt, in the given order, to their latest attempt", () => {
    expect(reviewNav(ROWS, "c", rowGrading)).toEqual({ position: 2, total: 4, prev: { studentId: "a", attemptNumber: 1 }, next: { studentId: "d", attemptNumber: 1 }, nextPending: { studentId: "d", attemptNumber: 1 } });
    expect(reviewNav(ROWS, "a", rowGrading)).toMatchObject({ position: 1, prev: null, next: { studentId: "c" } });
    expect(reviewNav(ROWS, "e", rowGrading)).toMatchObject({ position: 4, next: null });
  });
  it("«التالي بانتظار التصحيح» wraps round and never names the current student", () => {
    expect(reviewNav(ROWS, "e", rowGrading)?.nextPending).toEqual({ studentId: "a", attemptNumber: 1 });
    expect(reviewNav(ROWS, "d", rowGrading)?.nextPending).toEqual({ studentId: "a", attemptNumber: 1 });
    expect(reviewNav([s("a", lr(1, true)), s("c", lr(1))], "a", rowGrading)?.nextPending).toBeNull();
  });
  it("is absent for a student outside the list (no attempt)", () => {
    expect(reviewNav(ROWS, "b", rowGrading)).toBeNull();
    expect(reviewNav(ROWS, "zz", rowGrading)).toBeNull();
  });
});
