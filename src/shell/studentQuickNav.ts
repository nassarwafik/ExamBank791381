// Phase 12C — the student quick navigation's destinations and its scroll helper (kept apart from the component so the
// component module exports only the component). No data, no router: ids of EXISTING portal section headings only.
import { IconAssignments, IconBook, IconDashboard, IconProjects, IconReports } from "../icons";

export type StudentQuickNavKey = "today" | "learning" | "tasks" | "progress" | "projects";
export type StudentQuickNavDestination = { key: StudentQuickNavKey; label: string; ariaLabel: string; target: string; Icon: typeof IconBook };

/** The five destinations, in the bar's (RTL reading) order. `target` is the id of the section's existing <h2>. */
export const STUDENT_QUICK_NAV: readonly StudentQuickNavDestination[] = [
  { key: "today", label: "اليوم", ariaLabel: "انتقل إلى اليوم", target: "eb-sp-today-title", Icon: IconDashboard },
  { key: "learning", label: "المواد", ariaLabel: "انتقل إلى موادي التعليمية", target: "eb-sp-learning-title", Icon: IconBook },
  { key: "tasks", label: "الواجبات", ariaLabel: "انتقل إلى المهام والواجبات", target: "eb-sp-tasks-title", Icon: IconAssignments },
  { key: "progress", label: "التقدم", ariaLabel: "انتقل إلى تقدّمي وقوتي", target: "eb-sp-progress-title", Icon: IconReports },
  { key: "projects", label: "المشاريع", ariaLabel: "انتقل إلى مشاريعي", target: "eb-sp-projects-title", Icon: IconProjects },
];

/**
 * Bring a portal section into view and move focus to its heading (so a screen reader / keyboard user lands where the
 * eye does). Smooth only when motion is allowed. The heading becomes programmatically focusable (tabindex=-1: never a
 * Tab stop) and is focused WITHOUT a second, instant scroll. Returns false when the section is not on the page.
 */
export function scrollToStudentSection(id: string, reducedMotion: boolean): boolean {
  const el = typeof document === "undefined" ? null : document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView?.({ block: "start", behavior: reducedMotion ? "auto" : "smooth" });
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus?.({ preventScroll: true });
  return true;
}
