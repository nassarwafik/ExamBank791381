import { describe, it, expect } from "vitest";
import { studentOutcome, average, gradeDistribution, assignmentStats, studentAcademicAverage, csvCell, toCsv } from "./aggregate.js";

const sub = (attempts) => ({ attempts });

describe("studentOutcome distinguishes missing from a real zero", () => {
  it("no submission => missing", () => {
    expect(studentOutcome(null).state).toBe("missing");
    expect(studentOutcome(sub([])).state).toBe("missing");
  });
  it("submitted score 0 => submitted, not missing", () => {
    const o = studentOutcome(sub([{ score: 0, percentage: 0 }]));
    expect(o.state).toBe("submitted");
    expect(o.percentage).toBe(0);
  });
  it("uses the latest attempt", () => {
    const o = studentOutcome(sub([{ percentage: 40 }, { percentage: 90 }]));
    expect(o.percentage).toBe(90);
    expect(o.attempts).toBe(2);
  });
});

describe("assignmentStats keeps missing and zero separate", () => {
  it("counts missing, zeros, submission rate, avg attempts", () => {
    const entries = [
      { studentId: "a", submission: sub([{ score: 8, percentage: 80 }]) },
      { studentId: "b", submission: sub([{ score: 0, percentage: 0 }, { score: 0, percentage: 0 }]) },
      { studentId: "c", submission: null }
    ];
    const st = assignmentStats(entries);
    expect(st.students).toBe(3);
    expect(st.submitted).toBe(2);
    expect(st.missing).toBe(1);
    expect(st.zeroScores).toBe(1);
    expect(st.submissionRate).toBe(67);
    expect(st.avgAttempts).toBe(1); // (1+2+0)/3 = 1
    expect(st.average).toBe(40);
  });
});

describe("studentAcademicAverage", () => {
  it("pools submitted percentages across assignments", () => {
    const r = studentAcademicAverage([sub([{ percentage: 100 }]), null, sub([{ percentage: 50 }])]);
    expect(r.average).toBe(75);
    expect(r.submittedCount).toBe(2);
  });
});

describe("average + gradeDistribution", () => {
  it("average is null for empty", () => { expect(average([])).toBe(null); });
  it("buckets", () => { expect(gradeDistribution([49, 50, 75, 100])).toMatchObject({ "0-49": 1, "50-59": 1, "70-79": 1, "90-100": 1 }); });
});

describe("CSV injection protection", () => {
  it("prefixes formula-triggering cells with a quote", () => {
    expect(csvCell("=SUM(A1:A2)")).toBe("\"'=SUM(A1:A2)\"");
    expect(csvCell("+1")).toBe("\"'+1\"");
    expect(csvCell("-1")).toBe("\"'-1\"");
    expect(csvCell("@x")).toBe("\"'@x\"");
  });
  it("escapes quotes and leaves safe text alone", () => {
    expect(csvCell('اسم "الطالب"')).toBe('"اسم ""الطالب"""');
    expect(csvCell("محمد")).toBe('"محمد"');
  });
  it("toCsv joins rows with CRLF", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe('"a","b"\r\n"c","d"');
  });
});
