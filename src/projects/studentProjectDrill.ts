// Phase 12D — Student project drill-in: the one-shot navigation intent the Today Hub's «تابع المشروع» hands to the
// project panel. Same discipline as the teacher drills (src/projects/drillTarget.ts, src/assignments/drillTarget.ts):
// StudentPortal owns the INTENT (newest wins, consumed once, never persisted), StudentProjectPanel stays the ONE owner
// of the project DATA (its single /api/student-project-tracker read) and validates the code against it. The intent
// carries identifiers only — never a title, a score, a stage, a grade, a progress value or any server payload.

/** «Open this exact project». `seq` makes every request observable (the same project twice) and never re-applied. */
export type StudentProjectDrill = { seq: number; projectCode: string };

/** How the panel resolved a drill against its own authoritative response. */
export type StudentProjectDrillOutcome =
  | "opened"        // the project exists in the panel's list and its detail is shown
  | "unavailable"   // not in the list (stale Today data, no longer enrolled, no projects): nothing else is opened
  | "failed";       // the panel's own read failed: the optional panel stays hidden, the session is untouched
