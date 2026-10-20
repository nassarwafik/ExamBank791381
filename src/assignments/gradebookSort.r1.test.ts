// Phase R-1 (owner decision D-1) — the gradebook's «الأعلى/الأدنى» sort ranks FINAL results only. A result still awaiting the
// teacher has no academic mark yet, so its provisional percentage (often 0, sometimes not) never decides its place: such rows follow
// the final results (by name), and rows with no result stay last (by name).
import { describe, it, expect } from "vitest";
import { gradebookRows } from "./assignmentsView";
import type { StudentResult } from "./types";

const latest = (percentage: number, extra: Record<string, unknown> = {}) => ({ attemptNumber: 1, score: percentage / 10, totalMarks: 10, percentage, submittedAt: "2026-10-01T00:00:00Z", finalized: true, manualReviewMarks: 0, ...extra });
const student = (id: string, name: string, over: Partial<StudentResult> = {}): StudentResult => ({ studentId: id, studentName: name, studentCode: "P-" + id, attemptsUsed: 0, allowedAttempts: 1, dueAtOverride: null, ...over } as StudentResult);
const rows = [
  student("1", "سارة", { latestResult: latest(70) } as Partial<StudentResult>),
  student("2", "أحمد", { latestResult: latest(0, { finalized: false, manualReviewMarks: 10 }) } as Partial<StudentResult>),                 // pending, provisional 0
  student("3", "باسل", { gradingStatus: "pendingReview", latestResult: latest(95) } as Partial<StudentResult>),                              // pending per the server, provisional 95
  student("4", "تالا"),                                                                                                                         // no result
  student("5", "دانة", { latestResult: latest(50) } as Partial<StudentResult>)
];
const names = (r: StudentResult[]) => r.map(s => s.studentName);

describe("R-1 — gradebook highest / lowest sort", () => {
  it("highest: final results by score, then pending by name, then no result", () => {
    expect(names(gradebookRows(rows, "", "all", "highest"))).toEqual(["سارة", "دانة", "أحمد", "باسل", "تالا"]);
  });
  it("lowest: a pending provisional 0 is never ranked as the lowest mark", () => {
    expect(names(gradebookRows(rows, "", "all", "lowest"))).toEqual(["دانة", "سارة", "أحمد", "باسل", "تالا"]);
  });
});
