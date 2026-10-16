// Phase 21G.3 — the assignment page model: the score distribution counts FINAL results only (a pending review is provisional and
// is counted apart), and every student is in exactly one status part.
import { describe, it, expect } from "vitest";
import { scoreDistribution, statusBreakdown, studentsCount, PAGE_TABS } from "./assignmentPage";
import type { StudentResult } from "./types";

const latest = (percentage: number, extra: Record<string, unknown> = {}) => ({ attemptNumber: 1, score: 0, totalMarks: 10, percentage, submittedAt: "2026-10-01T00:00:00Z", finalized: true, manualReviewMarks: 0, ...extra });
const s = (id: string, over: Partial<StudentResult> = {}): StudentResult => ({ studentId: id, studentName: id, studentCode: id, attemptsUsed: 0, allowedAttempts: 1, dueAtOverride: null, ...over } as StudentResult);
const live = { activeAttempt: { attemptNumber: 1, startedAt: "x", endsAt: "y" } };

describe("score distribution", () => {
  it("bands final results at their edges and keeps pending reviews out", () => {
    const rows = [
      s("a", { latestResult: latest(49.9) } as Partial<StudentResult>), s("b", { latestResult: latest(50) } as Partial<StudentResult>),
      s("c", { latestResult: latest(64) } as Partial<StudentResult>), s("d", { latestResult: latest(65) } as Partial<StudentResult>),
      s("e", { latestResult: latest(89.5) } as Partial<StudentResult>), s("f", { latestResult: latest(90) } as Partial<StudentResult>),
      s("g", { latestResult: latest(100) } as Partial<StudentResult>), s("h", { latestResult: latest(120) } as Partial<StudentResult>),
      s("p", { latestResult: latest(95, { finalized: false, manualReviewMarks: 2 }) } as Partial<StudentResult>),
      s("n"), s("l", live as Partial<StudentResult>)
    ];
    const d = scoreDistribution(rows);
    expect(d.bands.map(b => [b.label, b.count])).toEqual([["أقل من 50%", 1], ["50–64%", 2], ["65–79%", 1], ["80–89%", 1], ["90–100%", 3]]);
    expect(d.graded).toBe(8);
    expect(d.pendingReview).toBe(1);
    expect(d.largest).toBe(3);
  });
  it("uses the server's grading status when present", () => {
    const d = scoreDistribution([s("a", { gradingStatus: "pendingReview", latestResult: latest(80) } as Partial<StudentResult>), s("b", { gradingStatus: "final", latestResult: latest(80, { finalized: false, manualReviewMarks: 1 }) } as Partial<StudentResult>)]);
    expect([d.graded, d.pendingReview, d.bands[3].count]).toEqual([1, 1, 1]);
  });
  it("is empty without results", () => {
    expect(scoreDistribution([])).toMatchObject({ graded: 0, pendingReview: 0, largest: 0 });
  });
});

describe("status breakdown", () => {
  it("puts every student in exactly one part", () => {
    const rows = [s("f", { latestResult: latest(70) } as Partial<StudentResult>), s("f2", { latestResult: latest(70), ...live } as Partial<StudentResult>),
      s("p", { latestResult: latest(40, { finalized: false, manualReviewMarks: 2 }) } as Partial<StudentResult>), s("a", live as Partial<StudentResult>), s("n")];
    const parts = statusBreakdown(rows);
    expect(parts.map(p => [p.key, p.count])).toEqual([["final", 2], ["pendingReview", 1], ["active", 1], ["notSubmitted", 1]]);
    expect(parts.reduce((n, p) => n + p.count, 0)).toBe(rows.length);
  });
});

describe("labels", () => {
  it("counts students in Arabic and names the three sections", () => {
    expect([0, 1, 2, 3, 10, 11].map(studentsCount)).toEqual(["لا أحد", "طالب واحد", "طالبان", "3 طلاب", "10 طلاب", "11 طالبًا"]);
    expect(PAGE_TABS.map(t => t.label)).toEqual(["الطلاب", "نظرة عامة", "تحليل الأسئلة"]);
  });
});
