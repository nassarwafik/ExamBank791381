// Phase R-5a — the pure shaping behind the Reports Center charts (insights.ts). The grading-safety rule is the point of most of
// these: only a FINAL result is a number; awaiting the teacher, not handed in, or a state this client does not know stay null.
import { describe, it, expect } from "vitest";
import {
  finiteOrNull, gradedValue, stateText, latestChange, signed, rankStandings, gapToClass, aboveClassCount, weeklyDeltas, rowSplit,
  projectStudentSplit, shortLabel, monthLabel, LRM, type StudentAssessmentPoint, type StudentStanding
} from "./insights";

const point = (state: string, percentage: number | null, classAverage: number | null = null): StudentAssessmentPoint => ({ assignmentId: "a", title: "ت", state, percentage, attempts: 1, classAverage });

describe("R-5a insights — a number only for a final result", () => {
  it("gradedValue: submitted → its percentage (a real 0 stays 0); pending / missing / unknown → null even when a number rides along", () => {
    expect(gradedValue(point("submitted", 72))).toBe(72);
    expect(gradedValue(point("submitted", 0))).toBe(0);
    expect(gradedValue(point("pending", 0))).toBeNull();          // the provisional 0 of a result awaiting the teacher
    expect(gradedValue(point("missing", 0))).toBeNull();
    expect(gradedValue(point("held-by-something-new", 55))).toBeNull();
    expect(gradedValue(point("submitted", null))).toBeNull();
    expect(gradedValue(point("submitted", Number.NaN))).toBeNull();
  });
  it("stateText: the result, «بانتظار التصحيح» or «لم يسلّم» — an unknown state reads as awaiting, never as a number", () => {
    expect([stateText(point("submitted", 71.6)), stateText(point("submitted", 0)), stateText(point("pending", 0)), stateText(point("missing", null)), stateText(point("???", 90))])
      .toEqual(["72%", "0%", "بانتظار التصحيح", "لم يسلّم", "بانتظار التصحيح"]);
  });
  it("finiteOrNull refuses everything that is not a finite number", () => {
    expect([finiteOrNull(3), finiteOrNull(0), finiteOrNull(null), finiteOrNull(undefined), finiteOrNull("7"), finiteOrNull(Infinity)]).toEqual([3, 0, null, null, null, null]);
  });
  it("gapToClass: only where BOTH the student's final result and the class average exist", () => {
    const pts = [point("submitted", 80, 70), point("submitted", 40, 55.5), point("pending", 0, 60), point("missing", null, 60), point("submitted", 90, null)];
    expect(gapToClass(pts)).toEqual([10, -15.5, null, null, null]);
    expect(aboveClassCount(pts)).toEqual({ above: 1, of: 2 });
    expect(aboveClassCount([point("submitted", 60, 60)])).toEqual({ above: 1, of: 1 });      // at the average counts as "at or above"
  });
});

describe("R-5a insights — change and ranking", () => {
  it("latestChange: the last two KNOWN values (gaps skipped); null with fewer than two", () => {
    expect(latestChange([50, null, 62, null])).toEqual({ last: 62, previous: 50, delta: 12 });
    expect(latestChange([70, 61.5])).toEqual({ last: 61.5, previous: 70, delta: -8.5 });
    expect(latestChange([null, 80])).toBeNull();
    expect(latestChange([])).toBeNull();
  });
  it("signed: +, − and 0 in Western digits, the sign kept in front of the number inside Arabic text", () => {
    expect([signed(12), signed(-4.26), signed(0)]).toEqual([LRM + "+12", LRM + "-4.3", "0"]);       // the mark keeps the sign in front of the number in RTL text
  });
  it("rankStandings: highest average first; students with no final result keep their order at the end (never ranked as 0)", () => {
    const st = (id: string, average: number | null): StudentStanding => ({ studentId: id, displayName: id, average, graded: 0, pending: 0, missing: 0 });
    const input = [st("a", 40), st("none1", null), st("b", 90), st("zero", 0), st("none2", null)];
    expect(rankStandings(input).map(s => s.studentId)).toEqual(["b", "a", "zero", "none1", "none2"]);
    expect(input.map(s => s.studentId)).toEqual(["a", "none1", "b", "zero", "none2"]);        // the input is not reordered
  });
  it("weeklyDeltas: one change per week after the first", () => {
    expect(weeklyDeltas([{ weekStart: "w1", avgOverall: 40 }, { weekStart: "w2", avgOverall: 72 }, { weekStart: "w3", avgOverall: 65.5 }])).toEqual([{ weekStart: "w2", delta: 32 }, { weekStart: "w3", delta: -6.5 }]);
    expect(weeklyDeltas([{ weekStart: "w1", avgOverall: 40 }])).toEqual([]);
  });
});

describe("R-5a insights — splits and labels", () => {
  it("rowSplit: graded = handed in − awaiting the teacher, never negative; an older row without the pending count", () => {
    expect(rowSplit({ submitted: 5, missing: 1, pendingReview: 2 })).toEqual({ graded: 3, pending: 2, missing: 1 });
    expect(rowSplit({ submitted: 3, missing: 0 })).toEqual({ graded: 3, pending: 0, missing: 0 });
    expect(rowSplit({ submitted: 1, missing: 0, pendingReview: 4 })).toEqual({ graded: 0, pending: 4, missing: 0 });
  });
  it("projectStudentSplit: in progress is what completed and not-started leave; no population → no bar (nothing guessed)", () => {
    expect(projectStudentSplit({ studentCount: 24, completedCount: 2, notStartedCount: 5 })).toEqual({ completed: 2, inProgress: 17, notStarted: 5 });
    expect(projectStudentSplit({ studentCount: 3, completedCount: 3 })).toEqual({ completed: 3, inProgress: 0, notStarted: 0 });
    expect(projectStudentSplit({ completedCount: 2 })).toBeNull();
    expect(projectStudentSplit({ studentCount: 0, completedCount: 0 })).toBeNull();
  });
  it("shortLabel keeps short text and cuts long text with an ellipsis; monthLabel names the month with Western digits", () => {
    expect(shortLabel("واجب")).toBe("واجب");
    expect(shortLabel("اختبار الوحدة الأولى في الشبكات", 12)).toBe("اختبار الوح…");
    expect([monthLabel("2026-03"), monthLabel("2026-12"), monthLabel("2026-13"), monthLabel("soon")]).toEqual(["مارس 2026", "ديسمبر 2026", "2026-13", "soon"]);
  });
});
