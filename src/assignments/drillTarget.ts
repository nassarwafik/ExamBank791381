// Phase 12B — Assignment drill-in: the transient navigation target a Today Hub row hands to App when the teacher clicks
// it. Same discipline as the project drill (src/projects/drillTarget.ts): App stays the ONE navigation authority
// (teacherView / workspaceTab), the mounted AssignmentsPanel applies the target once against its OWN authoritative data
// (the assignment list + the assignment's results), and nothing is persisted. The target carries identifiers + intent
// only — never a title, a name, a class, a grade or a date: everything shown is read from the destination.
import type { GradebookFilter } from "./types";

/** What the teacher wants to see in the exact assignment's gradebook. */
export type AssignmentDrillMode =
  | "assignment"      // just open the assignment (no filter forced)
  | "active"          // students currently in an attempt
  | "notSubmitted"    // students without a completed attempt
  | "pendingReview"   // submissions waiting for manual grading
  | "student";        // one student's row, whatever its current state

export type AssignmentDrillTarget =
  | { assignmentId: string; mode: "assignment" | "notSubmitted" | "pendingReview" }
  | { assignmentId: string; mode: "active"; studentId?: string }
  | { assignmentId: string; mode: "student"; studentId: string };

/** App's copy: the target + a sequence, so the same row twice (or a newer row) is always observable and a consumed
 *  target is never re-applied. */
export type AssignmentDrill = AssignmentDrillTarget & { seq: number };

/** The EXISTING gradebook filter a mode maps onto (no new grading semantics: these are Gradebook's own filters). */
export function gradebookFilterFor(mode: AssignmentDrillMode): GradebookFilter {
  switch (mode) {
    case "active": return "active";
    case "notSubmitted": return "notSubmitted";
    case "pendingReview": return "pendingReview";
    case "assignment":
    case "student": return "all";
  }
}

/** The student a target focuses, if any. */
export const drillStudentId = (t: AssignmentDrillTarget): string | undefined => ("studentId" in t ? t.studentId : undefined);

/**
 * A Today Hub «آخر نشاط» event → a SAFE target. Only what the event name proves is used: a start opens the student's
 * current attempt state (the destination decides whether it is still running), a finished attempt opens that student's
 * row; an unknown kind or an event without a student opens the assignment itself, no filter forced. Never infers
 * grading state from the event name.
 */
export function recentActivityTarget(e: { kind: string; assignmentId: string; studentId?: string }): AssignmentDrillTarget | null {
  if (!e.assignmentId) return null;
  if (!e.studentId) return { assignmentId: e.assignmentId, mode: "assignment" };
  if (e.kind === "started") return { assignmentId: e.assignmentId, mode: "active", studentId: e.studentId };
  if (e.kind === "submitted" || e.kind === "timedOut" || e.kind === "integrityExit" || e.kind === "teacherEnded") return { assignmentId: e.assignmentId, mode: "student", studentId: e.studentId };
  return { assignmentId: e.assignmentId, mode: "assignment" };
}
