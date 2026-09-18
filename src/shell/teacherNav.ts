// UX-2 — PRESENTATION metadata for the teacher shell, derived from the EXISTING navigation state in App.tsx
// (teacherView / workspaceTab / projectCode / projectList). This module never owns state: it maps the current
// values to the active destination, the page title and the breadcrumb, and names the destinations the shell can
// ask App to navigate to (App maps each id back onto its existing setters).

export type TeacherView = "builder" | "platform" | "import" | "project" | "reports" | "bank" | "learning";
export type WorkspaceTab = "dashboard" | "students" | "assignments" | "audit";
export type TeacherNavId = "dashboard" | "learning" | "students" | "assignments" | "projects" | "reports" | "bank" | "builder" | "import" | "audit";

export interface TeacherNavState {
  teacherView: TeacherView;
  workspaceTab: WorkspaceTab;
  projectCode: string;
  projectList: { projectCode: string; title: string }[];
}

export const NAV_LABELS: Record<TeacherNavId, string> = {
  dashboard: "لوحة المتابعة",
  learning: "المواد التعليمية",
  students: "الصفوف والطلاب",
  assignments: "الواجبات",
  projects: "المشاريع",
  reports: "التقارير",
  bank: "بنك الامتحانات",
  builder: "باني الامتحان",
  import: "استيراد من ملف",
  audit: "سجل النشاط"
};
export const EXAM_BANK_GROUP_LABEL = "بنك الامتحانات";

/** Primary destinations in sidebar order; the Exam Bank group is a real destination (UX-6c) whose children are builder + import; audit is footer/secondary. */
export const PRIMARY_NAV: TeacherNavId[] = ["dashboard", "learning", "students", "assignments", "projects", "reports"];
export const EXAM_BANK_HEAD: TeacherNavId = "bank";
export const EXAM_BANK_NAV: TeacherNavId[] = ["builder", "import"];
export const FOOTER_NAV: TeacherNavId[] = ["audit"];

export function activeNavId(state: TeacherNavState): TeacherNavId {
  switch (state.teacherView) {
    case "platform": return state.workspaceTab;
    case "learning": return "learning";
    case "project": return "projects";
    case "reports": return "reports";
    case "import": return "import";
    case "bank": return "bank";
    default: return "builder";
  }
}

export function projectTitle(state: TeacherNavState): string {
  const found = state.projectList.find(p => p.projectCode === state.projectCode);
  return found ? found.title : "مشروع " + state.projectCode;
}

export type CrumbModel = { label: string; navId?: TeacherNavId };

/** Breadcrumb model: ancestors carry the destination id they lead to; the last crumb is the current page. */
export function breadcrumbFor(state: TeacherNavState): CrumbModel[] {
  const active = activeNavId(state);
  if (active === "projects") {
    return state.projectCode
      ? [{ label: NAV_LABELS.projects, navId: "projects" }, { label: projectTitle(state) }]
      : [{ label: NAV_LABELS.projects }];
  }
  // UX-6c — the Exam Bank crumb leads to the management page; the page itself is a single crumb.
  if (active === "builder" || active === "import") return [{ label: EXAM_BANK_GROUP_LABEL, navId: "bank" }, { label: NAV_LABELS[active] }];
  return [{ label: NAV_LABELS[active] }];
}

export function pageTitleFor(state: TeacherNavState): string {
  const crumbs = breadcrumbFor(state);
  return crumbs[crumbs.length - 1].label;
}
