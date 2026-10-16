// @vitest-environment happy-dom
//
// Phase 21G.5 (D2) — the results release on the client: the teacher's words for where results stand, the ONE student resolver
// (scoreWithheld) treating an unreleased result as withheld with the right reason, and the task card never showing a mark or a
// zero for it (the server sends none).
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { resultsReleaseState, resultsReleaseLabel, normalizeResultsRelease } from "./resultsRelease";
import { scoreWithheld, withheldScoreLabel, resultsNotReleased, resultsNotReleasedLabel } from "../codingGradingStatus";
import StudentAssignmentCard from "../student/StudentAssignmentCard";

afterEach(cleanup);
const NOW = Date.parse("2026-10-16T12:00:00Z"), fmt = (v: string) => "«" + v + "»";

describe("the teacher's view of the release", () => {
  it("labels the mode and says where the results stand now", () => {
    expect(["immediate", "afterDue", "manual", undefined, "x"].map(resultsReleaseLabel)).toEqual(["فور التصحيح", "بعد الموعد النهائي", "يدويًا", "فور التصحيح", "فور التصحيح"]);
    expect(normalizeResultsRelease(undefined)).toBe("immediate");
    expect(resultsReleaseState({ dueAt: "" }, NOW, fmt)).toEqual({ visible: true, text: "تظهر للطلاب فور التصحيح" });
    expect(resultsReleaseState({ dueAt: "2026-10-17T00:00:00Z", resultsRelease: "afterDue" }, NOW, fmt)).toEqual({ visible: false, text: "مخفية حتى الموعد النهائي: «2026-10-17T00:00:00Z»" });
    expect(resultsReleaseState({ dueAt: "2026-10-16T00:00:00Z", resultsRelease: "afterDue" }, NOW, fmt).visible).toBe(true);
    expect(resultsReleaseState({ dueAt: "", resultsRelease: "manual" }, NOW, fmt)).toEqual({ visible: false, text: "مخفية عن الطلاب حتى تنشرها" });
    expect(resultsReleaseState({ dueAt: "", resultsRelease: "manual", resultsReleasedAt: "t" }, NOW, fmt)).toEqual({ visible: true, text: "منشورة للطلاب منذ «t»" });
  });
});

describe("the student's view of an unreleased result", () => {
  it("the ONE resolver withholds it and says when it will show", () => {
    expect(resultsNotReleased({ resultsVisible: false })).toBe(true);
    expect(resultsNotReleased({ resultsVisible: true })).toBe(false);
    expect(resultsNotReleased({})).toBe(false);
    expect(scoreWithheld({ resultsVisible: false })).toBe(true);
    expect(withheldScoreLabel({ resultsVisible: false, resultsVisibility: "manual" })).toBe("تظهر النتيجة عندما ينشرها المعلم");
    expect(resultsNotReleasedLabel({ resultsVisibility: "afterDue" })).toBe("تظهر النتيجة بعد الموعد النهائي");
    expect(resultsNotReleasedLabel({ resultsVisibility: "afterDue", resultsVisibleAt: "2026-10-20T10:00:00Z" })).toMatch(/^تظهر النتيجة بعد الموعد النهائي \(.+\)$/);
  });
  it("the task card shows the reason, a dash, no percentage, no feedback — never a zero", () => {
    const item = { assignmentId: "a1", title: "واجب", instructions: "", openAt: "", dueAt: "2026-10-20T10:00:00Z", questionCount: 5, totalMarks: 20, attemptsUsed: 1, allowedAttempts: 1, availability: "closed", dashboardState: "completed", gradingStatus: "final", latestScore: null, latestPercentage: null,
      latestResult: { attemptNumber: 1, totalMarks: 20, submittedAt: "2026-10-15T10:00:00Z", gradingStatus: "final", resultsVisible: false, resultsVisibility: "manual" } };
    render(<StudentAssignmentCard item={item as never} busy={false} onOpen={() => {}} />);
    const line = document.querySelector(".eb-sp-task-result") as HTMLElement;
    expect(line.textContent).toContain("—");
    expect(line.textContent).not.toMatch(/\b0\b|%|undefined|NaN/);
    expect(screen.getByTestId("card-not-released").textContent).toBe("تظهر النتيجة عندما ينشرها المعلم");
    expect(document.querySelector(".eb-sp-task-feedback")).toBeNull();
  });
});
