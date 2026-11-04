// Tadris+ P3-C — the teacher UI shaped by the server-resolved capabilities (blueprint §9.1). PRESENTATION ONLY: every route is
// enforced on the server (P3-B); this only stops showing a teacher tools that would refuse them.
//
//   no access information yet, or the server does not limit this session (`enforced: false`: every mode before enforcement, and
//   every identity that predates the Owner Console)  →  everything is shown, exactly as today;
//   enforced                                          →  a destination is shown only when the teacher holds one of its capabilities;
//   the access could not be resolved («unavailable») →  nothing is offered (fail closed) and the teacher can retry.
import type { TeacherNavId } from "./teacherNav";

/** Tadris+ P7-B2 — `games`: the games open to this teacher (the server's answer; absent on an older API → every game). */
export type TeacherAccessView = { status: "ok" | "unavailable"; enforced: boolean; capabilities: string[]; games?: string[] };

const GOV_ANY = ["examGovernance.exam.author", "examGovernance.exam.review", "examGovernance.exam.approve", "examGovernance.exam.publish"];

/** Each destination and the capabilities that open it (any one of them) — the same names the server's routes ask for. */
export const NAV_CAPABILITIES: Record<TeacherNavId, string[]> = {
  dashboard: ["classes.class.view"],
  learning: ["learning.course.view"],
  students: ["students.student.view"],
  assignments: ["assignments.assignment.view"],
  messages: ["messages.inbox.read"],
  projects: ["projects.tracker.view"],
  reports: ["reports.widget.view"],
  games: ["games.catalog.view", "games.session.run", "games.challenge.create"],
  bank: ["examBank.collection.view"],
  builder: ["examBuilder.exam.edit", "examBuilder.exam.create"],
  import: ["examBank.import.use"],
  reviews: GOV_ANY,
  audit: ["audit.self.view"]
};

/** The session probe's `access` field → the view the UI uses (null when absent: an older API, or not a teacher). */
export function parseTeacherAccess(value: unknown): TeacherAccessView | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { status?: unknown; enforced?: unknown; capabilities?: unknown; games?: unknown };
  if (v.status === "unavailable") return { status: "unavailable", enforced: true, capabilities: [] };
  if (v.status !== "ok") return null;
  const capabilities = Array.isArray(v.capabilities) ? v.capabilities.filter((c): c is string => typeof c === "string") : [];
  const games = Array.isArray(v.games) ? v.games.filter((g): g is string => typeof g === "string") : undefined;
  return { status: "ok", enforced: v.enforced === true, capabilities, ...(games ? { games } : {}) };
}

/** Whether the UI offers this destination. */
export function navAllowed(id: TeacherNavId, access: TeacherAccessView | null | undefined): boolean {
  if (!access) return true;
  if (access.status === "unavailable") return false;
  if (!access.enforced) return true;
  return NAV_CAPABILITIES[id].some(c => access.capabilities.includes(c));
}

/** The first destination the teacher may open, in the order given (or null). */
export function firstAllowed(order: TeacherNavId[], access: TeacherAccessView | null | undefined): TeacherNavId | null {
  return order.find(id => navAllowed(id, access)) || null;
}
