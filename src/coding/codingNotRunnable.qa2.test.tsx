// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import CodingAutoGradeBlock from "./CodingAutoGradeBlock";
import { normalizeEvidence, NOT_RUNNABLE_LABEL, NO_ANSWER_LABEL } from "./codingTeacherEvidence";

// QA2-3 — a program over the question's size limit is kept for the teacher and never run: the server reports the coding target as
// "not-runnable" (the question is held for review). The teacher sees why, never «لم يرسل الطالب كودًا».

afterEach(() => cleanup());
const evidence = (outcome: string) => ({
  contract: 1, status: "complete", automaticStatus: "complete", revision: 1, resultRevision: 1, resultCurrent: true, language: null,
  scoringPolicy: "proportional", comparator: "exact", testCount: 3, maxMarks: 10, automaticScore: 0, passedCount: 0, passedWeight: 0, totalWeight: 3,
  outcome, completedAt: "2026-10-25T10:00:00.000Z", override: { active: false, score: null }, effectiveScore: null, recovery: { state: "none" },
  technicalCode: null, incomplete: false, cases: [], reviewRequired: false
});
const mount = (e: unknown) => render(<CodingAutoGradeBlock evidence={e} questionNumber={1} studentName="أحمد" attemptNumber={1} onAction={async () => ({ ok: true }) as never} onRefresh={() => {}} confirm={async () => true} />);

describe("QA2-3 teacher evidence — a program the question could not run", () => {
  it("the evidence keeps the not-runnable outcome", () => {
    expect(normalizeEvidence(evidence("not-runnable"))?.outcome).toBe("not-runnable");
  });
  it("the block says the code was too large and is waiting for the teacher (not «no answer»)", () => {
    mount(evidence("not-runnable"));
    expect(screen.getByTestId("ev-not-runnable").textContent).toBe(NOT_RUNNABLE_LABEL);
    expect(screen.queryByText(NO_ANSWER_LABEL)).toBeNull();
  });
  it("unchanged: a missing answer still reads «no answer»", () => {
    mount(evidence("no-answer"));
    expect(screen.getByText(NO_ANSWER_LABEL)).toBeTruthy();
    expect(screen.queryByTestId("ev-not-runnable")).toBeNull();
  });
});
