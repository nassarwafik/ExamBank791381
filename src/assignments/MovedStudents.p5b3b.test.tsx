// @vitest-environment happy-dom
// Tadris+ P5-B3b — the gradebook's «طلاب منقولون» archive (test data only): read-only rows with the result and the move date;
// nothing rendered when nobody was moved.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import MovedStudents from "./MovedStudents";

afterEach(cleanup);
const fmt = (iso: string) => iso.slice(0, 10);
const attempt = { attemptNumber: 1, score: 8, totalMarks: 10, percentage: 80, submittedAt: "2026-10-02T00:00:00.000Z", finalized: true, manualReviewMarks: 0 };

describe("P5-B3b moved students under the gradebook", () => {
  it("lists each moved student as «منقول» with the result and the date — and offers no action", () => {
    render(<MovedStudents fmt={fmt} rows={[{ studentId: "s1", studentName: "ليان سعيد", studentCode: "1", movedOut: true, movedAt: "2026-11-02T08:00:00.000Z", gradingStatus: "final", latestResult: attempt, attemptsUsed: 1 }]} />);
    const section = screen.getByRole("region", { name: /طلاب منقولون إلى معلم آخر/ });
    expect(section.textContent).toContain("ليان سعيد");
    expect(section.textContent).toContain("منقول");
    expect(section.textContent).toContain("8/10 (80%)");
    expect(section.textContent).toContain("نُقل في 2026-11-02");
    expect(within(section).queryAllByRole("button")).toEqual([]);
  });
  it("renders nothing when no student was moved", () => {
    const { container } = render(<MovedStudents fmt={fmt} rows={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
