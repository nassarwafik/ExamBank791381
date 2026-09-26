// Phase 9A — Today Hub: the student's ONE recommended continuation («أكمل من حيث توقفت»), chosen by a small PURE,
// deterministic rule set over the canonical data the portal already holds (the dashboard payload, the released
// materials, the per-student Reader marker). No AI, no scoring, no new store: every candidate is a fact of the
// server's own eligibility fields (dashboardState / canAttempt / availability / hasActiveAttempt), so nothing here
// re-derives a business rule — it only ORDERS what the server already declared possible.
//
// Priority (lower wins; ties → earliest deadline, then the server's own order):
//   1 activeAttempt  — a live/resumable attempt (started / draft / paused). ALWAYS wins.
//   2 assignment     — an attemptable assignment (server canAttempt, open) whose deadline is within DUE_SOON_MS,
//                       including a remaining attempt after a final result («محاولة جديدة»).
//   3 reader         — the Reader continuation: this device's saved page for this student and the server's most
//                       recent study activity are BOTH validated against the released materials first; when both are
//                       valid the one with the NEWER timestamp wins (readerPosition.at vs studyLastActivity.completedAt;
//                       an unparseable timestamp loses to a parseable one; neither parseable → the server's, the
//                       cross-device authority). A stale device page never hides a newer study activity, and an
//                       unreleased device page never defeats a valid server continuation.
//   4 project        — a class project with progress strictly between 0 and 100.
//   5 study          — the next thing to start: an attemptable assignment without a near deadline, else the first
//                       released course («ابدأ القراءة»).
//   null             — nothing to continue (the hub shows its empty state).
// Never offered: completed items without a remaining attempt, awaiting-review items, scheduled/closed assignments
// (a teacher extension reopens them server-side → they come back as `available`), exhausted attempts
// (`canAttempt === false`), and any course/module the class no longer has.
import type { StudentLearningCourse } from "../StudentLearningMaterials";
import { isResumable, stateOf } from "../portalPresentation";
import type { ProjectStrength, Summary } from "../types";

export type TodayCandidateType = "activeAttempt" | "assignment" | "reader" | "project" | "study";
export const TODAY_PRIORITY: Record<TodayCandidateType, number> = { activeAttempt: 1, assignment: 2, reader: 3, project: 4, study: 5 };
/** «قريبًا»: a deadline within the next 48 hours makes an attemptable assignment beat a Reader continuation. */
export const DUE_SOON_MS = 48 * 60 * 60 * 1000;

/** This device's last Reader page for ONE student (see readerPosition.ts) — never another student's. */
export type ReaderPosition = { courseId: string; pageId: string; at: string };
/** The server's most recent study completion (dashboard.study.lastActivity). */
export type StudyLastActivity = { courseId: string; moduleId: string; pageId: string; completedAt: string };

export type TodayContinue = {
  type: TodayCandidateType;
  priority: number;
  /** What is continued (assignment / module / course / project title). */
  title: string;
  /** The single CTA text. */
  label: string;
  /** One short line under the title (deadline, page, progress). */
  reason: string;
  dueAt?: string;
  assignmentId?: string;
  courseId?: string;
  moduleId?: string;
  pageId?: string;
  projectCode?: string;
};

export type TodayInput = {
  assignments: Summary[];
  /** Date.now() at decision time (injected for determinism). */
  now: number;
  readerPosition: ReaderPosition | null;
  studyLastActivity: StudyLastActivity | null;
  /** Released materials (null = not loaded yet → no Reader candidate is claimed until they are known). */
  courses: StudentLearningCourse[] | null;
  projects: ProjectStrength[];
};

const dueOf = (item: Summary): string => item.effectiveDueAt || item.dueAt || "";
const dueMs = (item: Summary): number => { const t = Date.parse(dueOf(item)); return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER; };
const isTimed = (item: Summary): boolean => Number(item.durationMinutes || 0) > 0;

/** An assignment the server says the student may attempt NOW: open, attempts remaining, no live attempt. */
export function isAttemptable(item: Summary): boolean {
  if (isResumable(item)) return false;
  if (item.availability !== "open" || !item.canAttempt) return false;
  const st = stateOf(item);
  // `available` = never/not-yet submitted; `completed` + canAttempt = a remaining attempt after a final result.
  // Awaiting review, scheduled and closed are never attemptable here (the server's canAttempt may still be true
  // for a pending result, but the card offers the provisional result, not a new attempt — same rule as the task list).
  return st === "available" || st === "completed";
}
export const isDueSoon = (item: Summary, now: number): boolean => { const t = dueMs(item); return t !== Number.MAX_SAFE_INTEGER && t >= now && t - now <= DUE_SOON_MS; };

/** The module of a Reader page id (`<courseId>-<mNN>-…` → `<courseId>-<mNN>`), or "" when it does not match. */
export function moduleOfPage(course: StudentLearningCourse, pageId: string): string {
  const hit = course.modules.find(m => pageId === m.moduleId || pageId.startsWith(m.moduleId + "-"));
  return hit ? hit.moduleId : "";
}

function pickAssignment(items: Summary[], pred: (i: Summary) => boolean): Summary | null {
  let best: Summary | null = null;
  for (const item of items) if (pred(item) && (!best || dueMs(item) < dueMs(best))) best = item;   // earliest deadline, then server order
  return best;
}

function assignmentCandidate(item: Summary, type: "assignment" | "study"): TodayContinue {
  const again = stateOf(item) === "completed";
  return {
    type, priority: TODAY_PRIORITY[type], title: item.title, assignmentId: item.assignmentId, dueAt: dueOf(item),
    label: again ? "ابدأ محاولة جديدة" : isTimed(item) ? "ابدأ الامتحان" : "ابدأ الحل",
    reason: again ? "لديك محاولة متبقية" + (dueOf(item) ? " · التسليم " + when(dueOf(item)) : "") : dueOf(item) ? "التسليم " + when(dueOf(item)) : "متاح الآن"
  };
}

function readerCandidate(courses: StudentLearningCourse[], courseId: string, pageId: string, moduleHint: string, source: "device" | "server"): TodayContinue | null {
  const course = courses.find(c => c.courseId === courseId);
  if (!course) return null;
  const moduleId = moduleHint && course.modules.some(m => m.moduleId === moduleHint) ? moduleHint : moduleOfPage(course, pageId);
  if (!moduleId) return null;                                                   // the page's module is no longer released
  const module = course.modules.find(m => m.moduleId === moduleId);
  return {
    type: "reader", priority: TODAY_PRIORITY.reader, title: module ? module.title : course.title, label: "تابع القراءة",
    reason: source === "device" ? "آخر صفحة وصلت إليها في " + course.title : "آخر نشاط دراسي لك في " + course.title,
    courseId, moduleId, pageId
  };
}

/** A parseable timestamp in ms, or null (missing / malformed). */
const stampOf = (value: string): number | null => { const t = Date.parse(String(value || "")); return Number.isFinite(t) ? t : null; };

/**
 * Which valid Reader candidate to continue from. Only one valid → that one. Both valid → the newer timestamp wins;
 * a candidate whose timestamp cannot be parsed loses to one whose can; when NEITHER timestamp can establish recency
 * the SERVER candidate wins (deterministic fallback: the server's study document is the cross-device authority,
 * the device marker is only a convenience). Exported for the unit tests.
 */
export function newestReader(device: TodayContinue | null, deviceAt: string, server: TodayContinue | null, serverAt: string): TodayContinue | null {
  if (!device) return server;
  if (!server) return device;
  const d = stampOf(deviceAt), s = stampOf(serverAt);
  if (d !== null && s !== null) return d > s ? device : server;      // equal → server (the authority)
  if (d !== null) return device;
  if (s !== null) return server;
  return server;
}

/** Deterministic: same input → same output. Exported constants document the exact rules (see the header). */
export function selectTodayContinue(input: TodayInput): TodayContinue | null {
  const { assignments, now, readerPosition, studyLastActivity, courses, projects } = input;
  // 1 — a live attempt always wins (even when canAttempt is already false: the attempt is the student's to finish).
  const live = pickAssignment(assignments, isResumable);
  if (live) {
    const paused = live.attemptStatus === "paused";
    return { type: "activeAttempt", priority: 1, title: live.title, assignmentId: live.assignmentId, dueAt: dueOf(live),
      label: paused ? "استأنف الامتحان" : isTimed(live) ? "تابع الامتحان" : "تابع المحاولة",
      reason: paused ? "محاولتك متوقفة مؤقتًا" : isTimed(live) ? "محاولتك الموقوتة ما زالت جارية" : "لديك محاولة لم تُسلَّم بعد" };
  }
  // 2 — an attemptable assignment due within 48h.
  const soon = pickAssignment(assignments, item => isAttemptable(item) && isDueSoon(item, now));
  if (soon) return assignmentCandidate(soon, "assignment");
  // 3 — the Reader continuation: validate BOTH candidates against the released content, then take the newer one.
  if (courses && courses.length) {
    const fromDevice = readerPosition ? readerCandidate(courses, readerPosition.courseId, readerPosition.pageId, "", "device") : null;
    const fromServer = studyLastActivity ? readerCandidate(courses, studyLastActivity.courseId, studyLastActivity.pageId, studyLastActivity.moduleId, "server") : null;
    const reader = newestReader(fromDevice, readerPosition ? readerPosition.at : "", fromServer, studyLastActivity ? studyLastActivity.completedAt : "");
    if (reader) return reader;
  }
  // 4 — a project in progress.
  const project = projects.find(p => Number(p.overallProgress) > 0 && Number(p.overallProgress) < 100);
  if (project) return { type: "project", priority: 4, title: "مشروع صفك", label: "تابع المشروع", reason: "تقدمك " + Math.round(Number(project.overallProgress)) + "% · الخطوة التالية في «مشاريعي»", projectCode: project.projectCode };
  // 5 — something to start.
  const open = pickAssignment(assignments, isAttemptable);
  if (open) return assignmentCandidate(open, "study");
  const first = courses && courses.length ? courses[0] : null;
  if (first && first.modules.length) {
    const module = first.modules.slice().sort((a, b) => a.order - b.order)[0];
    return { type: "study", priority: 5, title: module.title, label: "ابدأ القراءة", reason: "أول وحدة متاحة في " + first.title, courseId: first.courseId, moduleId: module.moduleId };
  }
  return null;
}

// ISO-style local date/time (the portal's own format — see portalPresentation.formatWhen).
const two = (n: number) => String(n).padStart(2, "0");
function when(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) + " " + two(d.getHours()) + ":" + two(d.getMinutes());
}
