// Tadris+ P8-B1 — the capability each assignment action needs: the server's own route map (api/src/lib/access/route-capabilities.js,
// manage-assignments.js). PRESENTATION ONLY: the UI stops offering what the server would refuse; the server still decides.
export const ASSIGNMENT_ACTION_CAPS = { schedule: "assignments.schedule.set", details: "assignments.content.edit", purge: "assignments.assignment.create" } as const;
/** Creating an assignment: from one's own exams, or a ready one from the library (either opens the composer). */
export const ASSIGNMENT_CREATE_CAPS = ["assignments.assignment.create", "assignments.ready.assign"];
