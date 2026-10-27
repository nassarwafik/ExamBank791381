// Split out of examBuilderState so the save history (examHistory, part of the app shell) does not pull the builder's conversion /
// preset helpers into the initial bundle.
import type { StructuredExam } from "./examTypes";

/** Reconcile the latest exam with a save that just resolved. `snapshot` is the exam object the save was
 *  built from, `saved` the persisted payload.
 *  - Unchanged since the snapshot → adopt the saved payload (what is shown IS what was persisted).
 *  - Changed meanwhile → the newer content was NOT persisted, so it must never be labelled as saved: keep the
 *    newer content (no rollback) but do NOT stamp the save's updatedAt, and never mark it final (status is
 *    "draft" — not yet persisted as final). Only createdAt, a creation fact, is adopted if missing. The builder
 *    blocks saving while media is pending, so this branch is defense in depth.
 *  - A cleared exam is not recreated and a different exam is never touched. */
export function reconcileSavedStructuredExam(prev: StructuredExam | null, snapshot: StructuredExam, saved: StructuredExam): StructuredExam | null {
  if (!prev) return prev;
  if (prev === snapshot) return saved;
  if (prev.examId !== saved.examId) return prev;
  return { ...prev, status: "draft", createdAt: prev.createdAt || saved.createdAt };
}
