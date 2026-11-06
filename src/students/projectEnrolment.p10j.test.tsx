// @vitest-environment happy-dom
// Tadris+ P10-J — the «المشاريع» group of a class's actions menu follows the PROJECTS capability (projects.tracker.manage), the same
// one the server now asks for setPrograms (design docs/enterprise-project-enrolment-p10j.md, owner decision §19.47; closes O10).
// PRESENTATION ONLY: the server refuses the request whatever the menu shows (api/tests/project-enrolment-p10j.test.js). Fail-first:
// on the baseline the group followed learning.course.assign, so a «التعلّم فقط» teacher saw it and a projects-only teacher did not.
// TEST data only.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { TeacherAccessContext } from "../shell/teacherAccessContext";
import ClassesPane, { type ClassesPaneProps } from "./ClassesPane";
import type { Classroom } from "./types";

const withAccess = (capabilities: string[] | null, ui: ReactNode) => <TeacherAccessContext.Provider value={capabilities ? { status: "ok" as const, enforced: true, capabilities } : null}>{ui}</TeacherAccessContext.Provider>;
const BASE = ["classes.class.view", "students.student.view", "learning.course.view"];
const cls: Classroom = { classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026", active: true, status: "active", studentCount: 1, createdAt: "2026-01-01" } as Classroom;
const props = (): ClassesPaneProps => ({ classes: [cls], view: "active", onViewChange: vi.fn(), activeCount: 1, archivedCount: 0, selectedClassId: "c1", onSelect: vi.fn(), projects: [{ projectCode: "899373", title: "مشروع تجريبي" }] as ClassesPaneProps["projects"], projectTitle: c => c, isGraduationEligible: () => true, onToggleProject: vi.fn(), onToggleArchive: vi.fn(), onGraduate: vi.fn(), onCreate: vi.fn(), onRefresh: vi.fn(), onEdit: vi.fn(), loading: false, busy: false, fmtDate: v => v });

/** Opens the class's actions menu and says whether its «المشاريع» group is offered. */
function projectsOffered(capabilities: string[] | null): boolean {
  render(withAccess(capabilities, <ClassesPane {...props()} />));
  fireEvent.click(screen.getByRole("button", { name: /^إجراءات الصف/ }));
  const offered = screen.queryByRole("group", { name: "المشاريع" }) !== null;
  cleanup();
  return offered;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("P10-J the class menu offers project enrolment by the projects capability (O10)", () => {
  it("fail-first: a «التعلّم فقط» teacher (course assignment, no projects) is not offered «المشاريع» (baseline: offered)", () => {
    expect(projectsOffered([...BASE, "learning.course.assign"])).toBe(false);
  });
  it("fail-first: a teacher with projects but without course assignment is offered «المشاريع» (baseline: not offered)", () => {
    expect(projectsOffered([...BASE, "projects.tracker.view", "projects.tracker.manage"])).toBe(true);
  });
  it("with both, and with no access information (an older API, or the owner does not enforce), it is offered as before", () => {
    expect(projectsOffered([...BASE, "learning.course.assign", "projects.tracker.manage"])).toBe(true);
    expect(projectsOffered(null)).toBe(true);
  });
});
