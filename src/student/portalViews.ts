// UX-S2 (approved design docs/enterprise-ux-student-s2.md) — the student portal's five views and their links. Pure functions only
// (no React, no storage): the portal owns the state; a view's link is `#/s/<view>`. The prefix keeps the student's links apart from
// the other surfaces' hashes (#/owner, #/invite/…, #/handoff/…), so main.tsx never reloads for them.
import { IconAssignments, IconBook, IconDashboard, IconProjects, IconReports } from "../icons";

export type StudentView = "today" | "learning" | "tasks" | "progress" | "projects";
export type StudentViewDef = { key: StudentView; label: string; ariaLabel: string; heading: string; Icon: typeof IconBook };

/** The five views in reading order. `heading` is the id of the heading that receives focus when the student opens the view. */
export const STUDENT_VIEWS: readonly StudentViewDef[] = [
  { key: "today", label: "اليوم", ariaLabel: "انتقل إلى اليوم", heading: "eb-sp-welcome", Icon: IconDashboard },
  { key: "learning", label: "المواد", ariaLabel: "انتقل إلى موادي التعليمية", heading: "eb-sp-learning-title", Icon: IconBook },
  { key: "tasks", label: "الواجبات", ariaLabel: "انتقل إلى المهام والواجبات", heading: "eb-sp-tasks-title", Icon: IconAssignments },
  { key: "progress", label: "التقدم", ariaLabel: "انتقل إلى تقدّمي وقوتي", heading: "eb-sp-progress-title", Icon: IconReports },
  { key: "projects", label: "المشاريع", ariaLabel: "انتقل إلى مشاريعي", heading: "eb-sp-projects-title", Icon: IconProjects }
];

const PREFIX = "#/s/";
const KEYS = new Set<string>(STUDENT_VIEWS.map(v => v.key));

/** The link of a view. */
export const viewHash = (view: StudentView): string => PREFIX + view;

/** Whether a hash is a student-view link at all (any other hash belongs to someone else and is left alone). */
export const isStudentViewHash = (hash: string): boolean => String(hash || "").startsWith(PREFIX);

/**
 * The view a hash opens. No link, an unknown view, or «المشاريع» when the student has no project → «اليوم» (never an empty page).
 * `hasProjects` is the project panel's own answer (its read decides; the portal never guesses).
 */
export function viewFromHash(hash: string, hasProjects: boolean): StudentView {
  if (!isStudentViewHash(hash)) return "today";
  const key = String(hash).slice(PREFIX.length).split(/[/?#]/)[0];
  if (!KEYS.has(key)) return "today";
  if (key === "projects" && !hasProjects) return "today";
  return key as StudentView;
}

/** The heading id that receives focus for a view. */
export const viewHeading = (view: StudentView): string => (STUDENT_VIEWS.find(v => v.key === view) || STUDENT_VIEWS[0]).heading;
