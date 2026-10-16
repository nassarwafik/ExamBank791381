// Phase 21G.5 — moving between students in the review (pure). The order is the gradebook's as the teacher sees it (their search,
// filter and sort), restricted to students with a submitted attempt; «التالي بانتظار التصحيح» is the next student after the current
// one (wrapping round) whose latest result waits for review, through the shared grading resolver — never the current student.
import type { GradingStatus } from "../gradingStatus";
import type { StudentResult } from "./types";

export type ReviewTarget = { studentId: string; attemptNumber: number };
export type ReviewNav = { position: number; total: number; prev: ReviewTarget | null; next: ReviewTarget | null; nextPending: ReviewTarget | null };

const target = (s: StudentResult): ReviewTarget => ({ studentId: s.studentId, attemptNumber: s.latestResult!.attemptNumber });

export function reviewNav(rows: readonly StudentResult[], currentStudentId: string, gradingOf: (s: StudentResult) => GradingStatus): ReviewNav | null {
  const list = rows.filter(s => s.latestResult);
  const i = list.findIndex(s => s.studentId === currentStudentId);
  if (i < 0) return null;
  let nextPending: ReviewTarget | null = null;
  for (let k = 1; k < list.length; k++) {
    const s = list[(i + k) % list.length];
    if (gradingOf(s) === "pendingReview") { nextPending = target(s); break; }
  }
  return { position: i + 1, total: list.length, prev: i > 0 ? target(list[i - 1]) : null, next: i < list.length - 1 ? target(list[i + 1]) : null, nextPending };
}
