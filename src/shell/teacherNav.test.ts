import { describe, it, expect } from "vitest";
import { activeNavId, breadcrumbFor, pageTitleFor, NAV_LABELS, PRIMARY_NAV, EXAM_BANK_HEAD, EXAM_BANK_NAV, FOOTER_NAV, type TeacherNavState } from "./teacherNav";

// UX-2 — presentation mapping derived from the EXISTING App.tsx state (teacherView / workspaceTab / projectCode).
const base = (over: Partial<TeacherNavState>): TeacherNavState => ({ teacherView: "builder", workspaceTab: "dashboard", projectCode: "", projectList: [{ projectCode: "899373", title: "مشروع 899373" }], ...over });

describe("UX-2 teacherNav mapping", () => {
  const cases: Array<[Partial<TeacherNavState>, string, string, string[]]> = [
    [{ teacherView: "platform", workspaceTab: "dashboard" }, "dashboard", "لوحة المتابعة", ["لوحة المتابعة"]],
    [{ teacherView: "platform", workspaceTab: "students" }, "students", "الصفوف والطلاب", ["الصفوف والطلاب"]],
    [{ teacherView: "platform", workspaceTab: "assignments" }, "assignments", "الواجبات", ["الواجبات"]],
    [{ teacherView: "platform", workspaceTab: "audit" }, "audit", "سجل النشاط", ["سجل النشاط"]],
    [{ teacherView: "reports" }, "reports", "التقارير", ["التقارير"]],
    [{ teacherView: "project", projectCode: "" }, "projects", "المشاريع", ["المشاريع"]],
    [{ teacherView: "project", projectCode: "899373" }, "projects", "مشروع 899373", ["المشاريع", "مشروع 899373"]],
    [{ teacherView: "project", projectCode: "777777" }, "projects", "مشروع 777777", ["المشاريع", "مشروع 777777"]],
    [{ teacherView: "builder" }, "builder", "باني الامتحان", ["بنك الامتحانات", "باني الامتحان"]],
    [{ teacherView: "import" }, "import", "استيراد من ملف", ["بنك الامتحانات", "استيراد من ملف"]]
  ];
  for (const [state, id, title, crumbs] of cases) {
    it(JSON.stringify(state) + " → " + id, () => {
      const s = base(state);
      expect(activeNavId(s)).toBe(id);
      expect(pageTitleFor(s)).toBe(title);
      expect(breadcrumbFor(s).map(c => c.label)).toEqual(crumbs);
    });
  }
  it("an open project's ancestor crumb leads back to the projects hub; the builder/import ancestor leads to the Exam Bank page (UX-6c); the current crumb has no destination", () => {
    const crumbs = breadcrumbFor(base({ teacherView: "project", projectCode: "899373" }));
    expect(crumbs[0].navId).toBe("projects");
    expect(crumbs[1].navId).toBeUndefined();
    expect(breadcrumbFor(base({ teacherView: "builder" }))[0].navId).toBe("bank");
    expect(breadcrumbFor(base({ teacherView: "builder" }))[1].navId).toBeUndefined();
    expect(breadcrumbFor(base({ teacherView: "bank" }))).toEqual([{ label: "بنك الامتحانات" }]);
    expect(activeNavId(base({ teacherView: "bank" }))).toBe("bank");
    expect(pageTitleFor(base({ teacherView: "bank" }))).toBe("بنك الامتحانات");
  });
  it("every destination has a label and appears exactly once across the sidebar groups", () => {
    const all = [...PRIMARY_NAV, EXAM_BANK_HEAD, ...EXAM_BANK_NAV, ...FOOTER_NAV];
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(Object.keys(NAV_LABELS).sort());
    expect(FOOTER_NAV).toEqual(["audit"]);
    expect(EXAM_BANK_HEAD).toBe("bank");                                       // UX-6c — the group head is itself a destination
    expect(EXAM_BANK_NAV).toEqual(["builder", "import"]);
  });
});
