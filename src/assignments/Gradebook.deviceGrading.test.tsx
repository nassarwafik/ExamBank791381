// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import Gradebook from "./Gradebook";
import type { Item, StudentResult, CodingGradingStatus, CodingEvidenceTotals } from "./types";
import { assignmentCodingOpen, attemptCodingOpen } from "./codingRecovery";

// Teacher-device grading — the gradebook's two buttons: «صحّح جميع الطلاب على جهازي» while the assignment has open coding grading, and
// «صحّح على جهازي» on a student whose latest attempt has open coding grading. Presentation only: the server decides which answers are C#.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const desktop = (matches: boolean) => vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches, media: q, addEventListener() {}, removeEventListener() {} })));
beforeEach(() => desktop(true));
const item = { assignmentId: "a1", title: "واجب", status: "published", maxAttempts: 1, questionCount: 1, totalMarks: 10 } as unknown as Item;
const row = (id: string, name: string, codingGrading?: CodingGradingStatus): StudentResult => ({ studentId: id, studentName: name, studentCode: id, attemptsUsed: 1, allowedAttempts: 1, dueAtOverride: null, attempts: [],
  latestResult: { attemptNumber: 1, score: 0, totalMarks: 10, percentage: 0, submittedAt: "", finalized: false, manualReviewMarks: 10, ...(codingGrading ? { codingGrading } : {}) } } as unknown as StudentResult);
function mount(rows: StudentResult[], summary: CodingGradingStatus | null, extra: { archived?: boolean; busy?: boolean } = {}) {
  const onAll = vi.fn(), onOne = vi.fn();
  render(<Gradebook assignment={{ ...item, ...(extra.archived ? { status: "archived" } : {}) } as Item} rows={rows} totalRows={rows.length} gradingOf={() => "pendingReview"} busy={!!extra.busy} search="" onSearch={() => {}} filter="all" onFilter={() => {}} sort="name" onSort={() => {}}
    onReview={() => {}} onGrant={() => {}} onReopen={() => {}} onExtend={() => {}} onDeadline={() => {}} onEndAttempt={() => {}} fmt={v => v}
    codingSummary={summary} onDeviceGradeAll={onAll} onDeviceGradeStudent={onOne} />);
  return { onAll, onOne };
}

describe("Gradebook — teacher-device grading", () => {
  it("open coding grading → the «all students» button and the row button of the student who has it; clicks call back", () => {
    const { onAll, onOne } = mount([row("s1", "أحمد", { pending: 0, retryable: 1, stale: 0 }), row("s2", "سارة")], { pending: 0, retryable: 1, stale: 0 });
    fireEvent.click(screen.getByRole("button", { name: "صحّح جميع الطلاب على جهازي" }));
    expect(onAll).toHaveBeenCalledTimes(1);
    const rowButtons = screen.getAllByRole("button", { name: /على جهازي$/ }).filter(b => b.classList.contains("coding-device-grade"));
    expect(rowButtons).toHaveLength(1);
    expect(rowButtons[0].getAttribute("aria-label")).toBe("صحّح إجابات C# لـ أحمد على جهازي");
    fireEvent.click(rowButtons[0]);
    expect(onOne).toHaveBeenCalledWith(expect.objectContaining({ studentId: "s1" }));
  });
  it("nothing open → no buttons; busy → disabled; archived → none", () => {
    mount([row("s1", "أحمد")], { pending: 0, retryable: 0, stale: 0 });
    expect(screen.queryByText("صحّح جميع الطلاب على جهازي")).toBeNull();
    expect(screen.queryByText("صحّح على جهازي")).toBeNull();
    cleanup();
    mount([row("s1", "أحمد", { pending: 1, retryable: 0, stale: 0 })], { pending: 1, retryable: 0, stale: 0 }, { busy: true });
    expect((screen.getByText("صحّح جميع الطلاب على جهازي") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText("صحّح على جهازي") as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    mount([row("s1", "أحمد", { pending: 1, retryable: 0, stale: 0 })], { pending: 1, retryable: 0, stale: 0 }, { archived: true });
    expect(screen.queryByText("صحّح جميع الطلاب على جهازي")).toBeNull();
  });
  it("a phone or tablet: no device-grading buttons (the lab is desktop only)", () => {
    desktop(false);
    mount([row("s1", "أحمد", { pending: 1, retryable: 0, stale: 0 })], { pending: 1, retryable: 0, stale: 0 });
    expect(screen.queryByText("صحّح جميع الطلاب على جهازي")).toBeNull();
    expect(screen.queryByText("صحّح على جهازي")).toBeNull();
  });
  it("open = pending, retryable or stale (aggregate) or open targets in the evidence summary", () => {
    expect(assignmentCodingOpen(null, null)).toBe(false);
    expect(assignmentCodingOpen({ pending: 0, retryable: 0, stale: 1 }, null)).toBe(true);
    expect(assignmentCodingOpen(null, { open: 2, delayed: 0, superseded: 0 } as CodingEvidenceTotals)).toBe(true);
    expect(attemptCodingOpen({ codingEvidenceSummary: { status: "complete", openTargets: 0, delayedTargets: 0, supersededTargets: 0 }, codingGrading: { pending: 1, retryable: 0, stale: 0 } } as never)).toBe(false);
    expect(attemptCodingOpen({ codingEvidenceSummary: { status: "retrying", openTargets: 1, delayedTargets: 0, supersededTargets: 0 } } as never)).toBe(true);
    expect(attemptCodingOpen(null)).toBe(false);
  });
});
