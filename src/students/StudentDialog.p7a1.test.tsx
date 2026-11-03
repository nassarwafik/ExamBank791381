// @vitest-environment happy-dom
// Tadris+ P7-A1 — a profile whose assignment part the teacher's access does not include (`withheld: ["assignments"]`; the server did
// not compute it) shows the student's data, not a fake «0 واجبات» nor empty assignment tables. Without `withheld`: as before. TEST data.
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import StudentDialog from "./StudentDialog";
import type { StudentProfile } from "./types";

const profile = (withheld?: string[]): StudentProfile => ({
  student: { userId: "s01", code: "1001", identityNumber: "1001", firstName: "ط", familyName: "س", displayName: "طالب س", classId: "c1", active: true, archived: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0 },
  classroom: { classId: "c1", name: "صف 1", grade: "7", schoolYear: "2025-2026" },
  stats: { assigned: 0, completed: 0, pending: 0, average: null, lastLoginAt: "" },
  assignments: [], submittedAssignmentsCount: 0, submittedAssignments: [],
  ...(withheld ? { withheld } : {})
});
const noop = () => {};
const mount = (p: StudentProfile) => render(<StudentDialog profile={p} section="summary" onClose={noop} busy={false} suspended={false} passwordReveal={null} onResetPassword={noop} onCopyPassword={noop}
  onReview={noop} onAllowRetry={noop} deadlineFor={null} deadlineValue="" onDeadlineValue={noop} onOpenDeadline={noop} onCloseDeadline={noop} onSaveDeadline={noop} onClearDeadline={noop} fmtDate={v => v} />);

beforeEach(() => { window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia; });
afterEach(cleanup);

describe("P7-A1 student dialog — a withheld assignment part", () => {
  it("withheld: the student's data, no assignment figures, tables or section link", () => {
    mount(profile(["assignments"]));
    expect(screen.getByRole("heading", { name: "بيانات الطالب" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "الواجبات وسجل التسليم" })).toBeNull();
    expect(screen.queryByRole("button", { name: "الواجبات وسجل التسليم" })).toBeNull();
    expect(document.querySelector(".eb-profile-stats")).toBeNull();
  });
  it("not withheld: as before", () => {
    mount(profile());
    expect(screen.getByRole("heading", { name: "الواجبات وسجل التسليم" })).toBeTruthy();
    expect(document.querySelector(".eb-profile-stats")?.textContent).toContain("واجبات");
  });
});
